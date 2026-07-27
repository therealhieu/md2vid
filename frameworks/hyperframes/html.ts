export interface HtmlAttribute {
  name: string;
  value?: string;
}

export interface HtmlTag {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  start: number;
  end: number;
  attributes: HtmlAttribute[];
}

export interface HtmlElementRange {
  startTag: HtmlTag;
  endTag: HtmlTag;
  start: number;
  end: number;
  innerStart: number;
  innerEnd: number;
}

function tagEnd(html: string, start: number): number {
  let quote = "";
  for (let cursor = start; cursor < html.length; cursor++) {
    const character = html[cursor];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return cursor + 1;
    }
  }
  return -1;
}

function parseAttributes(raw: string): HtmlAttribute[] {
  const attributes: HtmlAttribute[] = [];
  let cursor = 0;
  while (cursor < raw.length) {
    while (/\s|\//.test(raw[cursor] ?? "")) cursor += 1;
    if (cursor >= raw.length) break;
    const nameStart = cursor;
    while (cursor < raw.length && !/[\s=/>]/.test(raw[cursor])) cursor += 1;
    const name = raw.slice(nameStart, cursor);
    if (!name) {
      cursor += 1;
      continue;
    }
    while (/\s/.test(raw[cursor] ?? "")) cursor += 1;
    if (raw[cursor] !== "=") {
      attributes.push({ name: name.toLowerCase() });
      continue;
    }
    cursor += 1;
    while (/\s/.test(raw[cursor] ?? "")) cursor += 1;
    let value = "";
    const quote = raw[cursor];
    if (quote === '"' || quote === "'") {
      cursor += 1;
      const valueStart = cursor;
      while (cursor < raw.length && raw[cursor] !== quote) cursor += 1;
      value = raw.slice(valueStart, cursor);
      if (cursor < raw.length) cursor += 1;
    } else {
      const valueStart = cursor;
      while (cursor < raw.length && !/[\s>]/.test(raw[cursor])) cursor += 1;
      value = raw.slice(valueStart, cursor);
    }
    attributes.push({ name: name.toLowerCase(), value });
  }
  return attributes;
}

function rawTextCloseStart(lowerHtml: string, tagName: string, start: number): number {
  const needle = `</${tagName}`;
  let cursor = start;
  for (;;) {
    const candidate = lowerHtml.indexOf(needle, cursor);
    if (candidate === -1) return -1;
    const boundary = lowerHtml[candidate + needle.length];
    if (boundary === undefined || /[\s>/]/.test(boundary)) return candidate;
    cursor = candidate + needle.length;
  }
}

export function scanHtmlTags(html: string): HtmlTag[] {
  const tags: HtmlTag[] = [];
  const lower = html.toLowerCase();
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start === -1) break;
    if (html.startsWith("<!--", start)) {
      const commentEnd = html.indexOf("-->", start + 4);
      cursor = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }
    if (html.startsWith("<!", start) || html.startsWith("<?", start)) {
      const end = tagEnd(html, start + 2);
      cursor = end === -1 ? html.length : end;
      continue;
    }

    let nameCursor = start + 1;
    let closing = false;
    if (html[nameCursor] === "/") {
      closing = true;
      nameCursor += 1;
    }
    while (/\s/.test(html[nameCursor] ?? "")) nameCursor += 1;
    const nameStart = nameCursor;
    while (/[A-Za-z0-9:-]/.test(html[nameCursor] ?? "")) nameCursor += 1;
    const name = html.slice(nameStart, nameCursor).toLowerCase();
    if (!name) {
      cursor = start + 1;
      continue;
    }
    const end = tagEnd(html, nameCursor);
    if (end === -1) break;
    const rawAttributes = closing ? "" : html.slice(nameCursor, end - 1);
    const selfClosing = !closing && /\/\s*$/.test(rawAttributes);
    tags.push({
      name,
      closing,
      selfClosing,
      start,
      end,
      attributes: closing ? [] : parseAttributes(rawAttributes),
    });
    cursor = end;

    if (!closing && !selfClosing && (name === "script" || name === "style")) {
      const closeStart = rawTextCloseStart(lower, name, cursor);
      if (closeStart === -1) break;
      cursor = closeStart;
    }
  }
  return tags;
}

export function htmlAttribute(tag: HtmlTag, name: string): string | undefined {
  const expected = name.toLowerCase();
  return tag.attributes.find((attribute) => attribute.name === expected)?.value;
}

const HTML_VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function elementRanges(html: string, tagName: string): { ranges: HtmlElementRange[]; unclosed: HtmlTag[] } {
  const expected = tagName.toLowerCase();
  const stack: HtmlTag[] = [];
  const ranges: HtmlElementRange[] = [];
  for (const tag of scanHtmlTags(html)) {
    if (tag.name !== expected) continue;
    if (!tag.closing && !tag.selfClosing) {
      stack.push(tag);
    } else if (tag.closing) {
      const startTag = stack.pop();
      if (!startTag) continue;
      ranges.push({
        startTag,
        endTag: tag,
        start: startTag.start,
        end: tag.end,
        innerStart: startTag.end,
        innerEnd: tag.start,
      });
    }
  }
  return { ranges, unclosed: stack };
}

export function findElementRangeByAttribute(
  html: string,
  tagName: string,
  attributeName: string,
  attributeValue: string,
): HtmlElementRange | undefined {
  return elementRanges(html, tagName).ranges
    .find((range) => htmlAttribute(range.startTag, attributeName) === attributeValue);
}

function outermostRanges(ranges: HtmlElementRange[]): HtmlElementRange[] {
  return ranges.filter((candidate) =>
    !ranges.some((parent) =>
      parent !== candidate && parent.start < candidate.start && parent.end > candidate.end
    )
  );
}

function rootCompositionId(innerHtml: string): string | undefined {
  let nestedTemplateDepth = 0;
  for (const tag of scanHtmlTags(innerHtml)) {
    if (tag.name === "template") {
      if (tag.closing) nestedTemplateDepth = Math.max(0, nestedTemplateDepth - 1);
      else if (!tag.selfClosing) nestedTemplateDepth += 1;
      continue;
    }
    if (nestedTemplateDepth > 0 || tag.closing) continue;
    const compositionId = htmlAttribute(tag, "data-composition-id");
    if (compositionId !== undefined) return compositionId;
  }
  return undefined;
}

export function extractCompositionTemplate(
  html: string,
  compositionId: string,
  documentPath: string,
): string {
  const { ranges, unclosed } = elementRanges(html, "template");
  if (unclosed.length) throw new Error(`${documentPath} contains an unclosed composition <template>`);
  if (!ranges.length) throw new Error(`${documentPath} must contain a composition <template>`);

  const topLevel = outermostRanges(ranges);
  const matching = topLevel.filter((range) =>
    rootCompositionId(html.slice(range.innerStart, range.innerEnd)) === compositionId
  );
  if (matching.length !== 1) {
    throw new Error(`${documentPath} template root composition id must be "${compositionId}"`);
  }
  const range = matching[0];
  const templateId = htmlAttribute(range.startTag, "data-composition-id");
  if (templateId !== undefined && templateId !== compositionId) {
    throw new Error(`${documentPath} template composition id must be "${compositionId}"`);
  }
  return html.slice(range.innerStart, range.innerEnd);
}

function topLevelElementRanges(html: string, tagName: string): HtmlElementRange[] {
  const expected = tagName.toLowerCase();
  const topLevelStarts = new Set<number>();
  const stack: HtmlTag[] = [];
  for (const tag of scanHtmlTags(html)) {
    if (tag.closing) {
      const matchingIndex = stack.findLastIndex((openTag) => openTag.name === tag.name);
      if (matchingIndex !== -1) stack.splice(matchingIndex);
      continue;
    }
    if (tag.name === expected && stack.length === 0) topLevelStarts.add(tag.start);
    if (!tag.selfClosing && !HTML_VOID_ELEMENTS.has(tag.name)) stack.push(tag);
  }
  return elementRanges(html, expected).ranges
    .filter((range) => topLevelStarts.has(range.start));
}

function compositionRootRange(
  html: string,
  compositionId: string,
  documentPath: string,
): HtmlElementRange {
  const matches: HtmlElementRange[] = [];
  let nestedTemplateDepth = 0;
  for (const tag of scanHtmlTags(html)) {
    if (tag.name === "template") {
      if (tag.closing) nestedTemplateDepth = Math.max(0, nestedTemplateDepth - 1);
      else if (!tag.selfClosing) nestedTemplateDepth += 1;
      continue;
    }
    if (
      nestedTemplateDepth === 0 &&
      !tag.closing &&
      !tag.selfClosing &&
      htmlAttribute(tag, "data-composition-id") === compositionId
    ) {
      const range = elementRanges(html, tag.name).ranges
        .find((candidate) => candidate.startTag.start === tag.start);
      if (range) matches.push(range);
    }
  }
  if (matches.length !== 1) {
    throw new Error(
      `${documentPath} must contain exactly one balanced composition root for "${compositionId}"; found ${matches.length}`,
    );
  }
  return matches[0];
}

export function moveTopLevelTransportElementsIntoCompositionRoot(
  html: string,
  compositionId: string,
  documentPath: string,
): string {
  const transport = [
    ...topLevelElementRanges(html, "style"),
    ...topLevelElementRanges(html, "script"),
  ].sort((left, right) => left.start - right.start);
  if (!transport.length) return html;

  const root = compositionRootRange(html, compositionId, documentPath);
  const preRoot = transport.filter((range) => range.end <= root.start);
  const postRoot = transport.filter((range) => range.start >= root.end);
  if (preRoot.length + postRoot.length !== transport.length) {
    throw new Error(`${documentPath} contains an ambiguous top-level transport element around "${compositionId}"`);
  }
  const edits = [
    ...transport.map((range) => ({ start: range.start, end: range.end, replacement: "" })),
    {
      start: root.innerStart,
      end: root.innerStart,
      replacement: preRoot.map((range) => html.slice(range.start, range.end)).join("\n"),
    },
    {
      start: root.innerEnd,
      end: root.innerEnd,
      replacement: postRoot.map((range) => html.slice(range.start, range.end)).join("\n"),
    },
  ].filter((edit) => edit.start !== edit.end || edit.replacement !== "")
    .sort((left, right) => right.start - left.start);

  let result = html;
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  }
  return result;
}

export function removeExternalScriptSource(
  html: string,
  source: string,
  documentPath: string,
): string {
  const scriptRanges = elementRanges(html, "script").ranges
    .filter((range) => htmlAttribute(range.startTag, "src") === source);
  if (scriptRanges.length > 1) {
    throw new Error(`${documentPath} may include at most one configured GSAP source ${source}; found ${scriptRanges.length}`);
  }
  let result = html;
  for (const range of [...scriptRanges].sort((left, right) => right.start - left.start)) {
    result = result.slice(0, range.start) + result.slice(range.end);
  }
  return result;
}

export function scriptSources(html: string): string[] {
  return scanHtmlTags(html)
    .filter((tag) => tag.name === "script" && !tag.closing)
    .map((tag) => htmlAttribute(tag, "src"))
    .filter((source): source is string => source !== undefined);
}

function topLevelTemplatesById(html: string, templateId: string): HtmlElementRange[] {
  return outermostRanges(elementRanges(html, "template").ranges)
    .filter((candidate) => htmlAttribute(candidate.startTag, "id") === templateId);
}

export function extractTemplateById(html: string, templateId: string): string | undefined {
  const matches = topLevelTemplatesById(html, templateId);
  if (matches.length > 1) {
    throw new Error(`multiple top-level embedded templates #${templateId}`);
  }
  const range = matches[0];
  return range ? html.slice(range.innerStart, range.innerEnd) : undefined;
}

export function replaceTemplateById(html: string, templateId: string, replacement: string): string {
  const matches = topLevelTemplatesById(html, templateId);
  if (!matches.length) throw new Error(`missing embedded template #${templateId}`);
  if (matches.length > 1) {
    throw new Error(`multiple top-level embedded templates #${templateId}`);
  }
  const range = matches[0];
  return html.slice(0, range.start) + replacement + html.slice(range.end);
}
