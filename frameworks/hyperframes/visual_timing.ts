import { extractCompositionTemplate, htmlAttribute, insertCompositionRootScripts, scanHtmlTags } from "./html.ts";
import type {
  HtmlTag,
} from "./html.ts";
import type {
  PlanFrame,
  ResolvedVisualBeat,
  VisualBinding,
  VisualSyncMode,
} from "../../engine/types.ts";

export type HyperframesEntranceToken = "fade" | "rise" | "slide-left" | "scale" | "none";

type CustomMethod = "from" | "fromTo" | "set";
type CustomDeclaration = {
  beat: string;
  target: string;
  method: CustomMethod;
  duration: number;
  coverage?: "planned";
};

type PreparedTiming = {
  html: string;
  bindings: VisualBinding[];
  authoredDuration?: number;
};

const ENTRANCES: Record<HyperframesEntranceToken, {
  revealDuration: (duration: number) => number;
  statement: (target: string, duration: number, start: number) => string;
}> = {
  fade: {
    revealDuration: (duration) => duration,
    statement: (target, duration, start) =>
      `timeline.from(${serializeScriptData(target)}, { opacity: 0, duration: ${duration}, ease: "power2.out" }, ${start});`,
  },
  rise: {
    revealDuration: (duration) => duration,
    statement: (target, duration, start) =>
      `timeline.from(${serializeScriptData(target)}, { opacity: 0, y: 28, duration: ${duration}, ease: "power3.out" }, ${start});`,
  },
  "slide-left": {
    revealDuration: (duration) => duration,
    statement: (target, duration, start) =>
      `timeline.from(${serializeScriptData(target)}, { opacity: 0, x: 28, duration: ${duration}, ease: "power3.out" }, ${start});`,
  },
  scale: {
    revealDuration: (duration) => duration,
    statement: (target, duration, start) =>
      `timeline.from(${serializeScriptData(target)}, { opacity: 0, scale: 0.96, duration: ${duration}, ease: "power2.out" }, ${start});`,
  },
  none: {
    revealDuration: () => 0,
    statement: (target, _duration, start) =>
      `timeline.set(${serializeScriptData(target)}, { autoAlpha: 0 }, 0);\n  timeline.set(${serializeScriptData(target)}, { autoAlpha: 1 }, ${start});`,
  },
};

const CUSTOM_METHODS = new Set<CustomMethod>(["from", "fromTo", "set"]);
const SAFE_ID_SELECTOR = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr",
]);

function serializeScriptData(value: unknown): string {
  const json = JSON.stringify(value) ?? "undefined";
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
}

function fail(mode: VisualSyncMode, documentPath: string, message: string): never | false {
  if (mode === "required") throw new Error(`${documentPath}: ${message}`);
  return false;
}

function hasHtmlAttribute(tag: HtmlTag, name: string): boolean {
  const expected = name.toLowerCase();
  return tag.attributes.some((attribute) => attribute.name === expected);
}

function compositionRootTag(tags: readonly HtmlTag[], compositionId: string): HtmlTag | undefined {
  const matches = tags.filter((tag) =>
    !tag.closing
    && tag.name !== "template"
    && htmlAttribute(tag, "data-composition-id") === compositionId,
  );
  if (matches.length !== 1) return undefined;
  return matches[0];
}

function elementIds(tags: readonly HtmlTag[]): Map<string, HtmlTag[]> {
  const ids = new Map<string, HtmlTag[]>();
  for (const tag of tags) {
    if (tag.closing) continue;
    const id = htmlAttribute(tag, "id");
    if (id !== undefined && id.length > 0) ids.set(id, [...(ids.get(id) ?? []), tag]);
  }
  return ids;
}

function renderedDescendantTags(tags: readonly HtmlTag[], root: HtmlTag | undefined): Set<HtmlTag> {
  const rendered = new Set<HtmlTag>();
  if (!root) return rendered;
  const stack: HtmlTag[] = [];
  let rootDepth: number | undefined;
  let nestedTemplateDepth = 0;
  for (const tag of tags) {
    if (tag.closing) {
      let start: HtmlTag | undefined;
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const candidate = stack.pop();
        if (candidate?.name === tag.name) {
          start = candidate;
          break;
        }
      }
      if (start === root) rootDepth = undefined;
      else if (rootDepth !== undefined && start?.name === "template" && nestedTemplateDepth > 0) {
        nestedTemplateDepth -= 1;
      }
      continue;
    }

    const insideRoot = rootDepth !== undefined;
    const insideNestedTemplate = nestedTemplateDepth > 0;
    if (insideRoot && !insideNestedTemplate && tag !== root && tag.name !== "template") {
      rendered.add(tag);
    }
    if (tag === root) {
      rootDepth = stack.length + 1;
    } else if (insideRoot && tag.name === "template" && !tag.selfClosing) {
      nestedTemplateDepth += 1;
    }
    if (!tag.selfClosing && !VOID_ELEMENTS.has(tag.name)) stack.push(tag);
  }
  return rendered;
}

function validateCoverageAttributes(
  tags: readonly HtmlTag[],
  beats: ReadonlyMap<string, ResolvedVisualBeat>,
  mode: VisualSyncMode,
  documentPath: string,
): boolean {
  for (const tag of tags) {
    if (tag.closing) continue;
    const coverage = htmlAttribute(tag, "data-md2vid-coverage");
    if (coverage === undefined) continue;
    if (coverage !== "planned") {
      return fail(mode, documentPath, `data-md2vid-coverage must be "planned"`);
    }
    const beatId = htmlAttribute(tag, "data-md2vid-beat");
    if (beatId === undefined) {
      return fail(mode, documentPath, `data-md2vid-coverage must be attached to a data-md2vid-beat target`);
    }
    if (!beats.has(beatId)) {
      return fail(mode, documentPath, `data-md2vid-coverage references unknown beat "${beatId}"`);
    }
  }
  return true;
}

function readDuration(
  root: HtmlTag | undefined,
  mode: VisualSyncMode,
  documentPath: string,
): number | false {
  const raw = root ? htmlAttribute(root, "data-duration") : undefined;
  const duration = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(duration) || duration < 0) {
    return fail(mode, documentPath, "composition root data-duration must be a finite non-negative number");
  }
  return duration;
}

function customScriptBody(tags: readonly HtmlTag[], html: string, index: number): string | undefined {
  const opening = tags[index];
  const closing = tags.slice(index + 1).find((tag) => tag.name === "script" && tag.closing);
  return closing ? html.slice(opening.end, closing.start) : undefined;
}

function isV2Beat(beat: ResolvedVisualBeat): beat is Extract<ResolvedVisualBeat, { version: 2 }> {
  return beat.version === 2;
}

function parseCustomDeclarations(
  tags: readonly HtmlTag[],
  html: string,
  beats: ReadonlyMap<string, ResolvedVisualBeat>,
  ids: ReadonlyMap<string, readonly HtmlTag[]>,
  renderedTags: ReadonlySet<HtmlTag>,
  frame: PlanFrame,
  mode: VisualSyncMode,
  documentPath: string,
): CustomDeclaration[] | false {
  const blocks = tags.flatMap((tag, index) =>
    tag.name === "script"
      && !tag.closing
      && hasHtmlAttribute(tag, "data-md2vid-custom-bindings")
      ? [{ tag, body: customScriptBody(tags, html, index) }]
      : [],
  );
  if (blocks.length === 0) return [];
  if (blocks.length !== 1) return fail(mode, documentPath, "exactly one data-md2vid-custom-bindings block is allowed");
  if (htmlAttribute(blocks[0].tag, "type") !== "application/json") {
    return fail(mode, documentPath, "custom binding declaration must use type=\"application/json\"");
  }
  const body = blocks[0].body;
  if (body === undefined) return fail(mode, documentPath, "custom binding declaration script is unclosed");

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (error: unknown) {
    return fail(mode, documentPath, `custom binding declaration is not valid JSON: ${(error as Error).message}`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail(mode, documentPath, "custom binding declaration must be an object");
  }
  const rawBindings = (value as Record<string, unknown>).bindings;
  if (!Array.isArray(rawBindings)) return fail(mode, documentPath, "custom binding declaration bindings must be an array");

  const declarations: CustomDeclaration[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of rawBindings.entries()) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return fail(mode, documentPath, `custom binding ${index} must be an object`);
    }
    const declaration = raw as Record<string, unknown>;
    const beatId = declaration.beat;
    const target = declaration.target;
    const method = declaration.method;
    const duration = declaration.duration;
    const coverage = declaration.coverage;
    const beat = typeof beatId === "string" ? beats.get(beatId) : undefined;
    if (typeof beatId !== "string" || !beat) {
      return fail(mode, documentPath, `custom binding references unknown beat "${String(beatId)}"`);
    }
    if (coverage !== undefined && coverage !== "planned") {
      return fail(mode, documentPath, `custom binding coverage must be "planned"`);
    }
    if (isV2Beat(beat) && coverage !== "planned") {
      return fail(mode, documentPath, `custom binding coverage must be "planned"`);
    }
    if (typeof target !== "string" || !target.startsWith("#") || !SAFE_ID_SELECTOR.test(target.slice(1))) {
      return fail(mode, documentPath, `custom binding target must be an ID selector (got ${serializeScriptData(target)})`);
    }
    const id = target.slice(1);
    const matches = ids.get(id) ?? [];
    if (matches.length !== 1) {
      return fail(mode, documentPath, `custom binding target "${target}" does not match exactly one element id`);
    }
    if (!renderedTags.has(matches[0])) {
      return fail(mode, documentPath, `custom binding target "${target}" must be a rendered descendant of composition root`);
    }
    if (typeof method !== "string" || !CUSTOM_METHODS.has(method as CustomMethod)) {
      return fail(mode, documentPath, `unsupported custom method "${String(method)}"`);
    }
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) {
      return fail(mode, documentPath, `custom binding duration must be a finite non-negative duration`);
    }
    if (method === "set" && duration !== 0) {
      return fail(mode, documentPath, "custom set duration must be exactly zero");
    }
    const key = `${beatId}:${target}:${method}`;
    if (seen.has(key)) return fail(mode, documentPath, `duplicate custom declaration "${key}"`);
    seen.add(key);
    declarations.push({
      beat: beatId,
      target,
      method: method as CustomMethod,
      duration,
      ...(coverage === undefined ? {} : { coverage }),
    });
  }
  return declarations;
}

function coverageStatements(target: string, beat: Extract<ResolvedVisualBeat, { version: 2 }>, frame: PlanFrame): string[] {
  const statements: string[] = [];
  if (beat.start > 0) {
    statements.push(`timeline.set(${serializeScriptData(target)}, { autoAlpha: 0 }, 0);`);
  }
  statements.push(`timeline.set(${serializeScriptData(target)}, { autoAlpha: 1 }, ${beat.start});`);
  if (beat.end <= frame.voiceDur) {
    statements.push(`timeline.set(${serializeScriptData(target)}, { autoAlpha: 0 }, ${beat.end});`);
  }
  return statements;
}

function bindingEvidence(
  frame: PlanFrame,
  beatId: string,
  beat: ResolvedVisualBeat,
  target: string,
  revealDuration: number,
  source: VisualBinding["source"],
): VisualBinding {
  if (isV2Beat(beat)) {
    return {
      frameSlug: frame.slug,
      beatId,
      target,
      role: beat.role,
      revealStart: beat.start,
      revealDuration,
      coverageStart: beat.start,
      coverageEnd: beat.end,
      source,
    };
  }
  return {
    frameSlug: frame.slug,
    beatId,
    target,
    revealStart: beat.start,
    revealDuration,
    source: source === "static" ? "declarative" : source,
  };
}

function readDeclarativeBindings(
  tags: readonly HtmlTag[],
  beats: ReadonlyMap<string, ResolvedVisualBeat>,
  ids: ReadonlyMap<string, readonly HtmlTag[]>,
  renderedTags: ReadonlySet<HtmlTag>,
  frame: PlanFrame,
  mode: VisualSyncMode,
  documentPath: string,
): { statements: string[]; bindings: VisualBinding[] } | false {
  const statements: string[] = [];
  const bindings: VisualBinding[] = [];
  for (const tag of tags) {
    if (tag.closing) continue;
    const beatId = htmlAttribute(tag, "data-md2vid-beat");
    if (beatId === undefined) continue;
    if (beats.size === 0) return fail(mode, documentPath, "data-md2vid-beat exists but the frame has no planned visual beats");
    const beat = beats.get(beatId);
    if (!beat) return fail(mode, documentPath, `data-md2vid-beat references unknown beat "${beatId}"`);
    const id = htmlAttribute(tag, "id");
    if (id === undefined || id.length === 0 || !SAFE_ID_SELECTOR.test(id)) {
      return fail(mode, documentPath, `declarative visual target for beat "${beatId}" requires a safe ID selector`);
    }
    const matches = ids.get(id) ?? [];
    if (matches.length !== 1) {
      return fail(mode, documentPath, `declarative visual target for beat "${beatId}" requires a unique non-empty id that matches exactly one element id`);
    }
    if (!renderedTags.has(tag)) {
      return fail(mode, documentPath, `declarative visual target for beat "${beatId}" must be a rendered descendant of composition root`);
    }
    const coverage = htmlAttribute(tag, "data-md2vid-coverage");
    if (coverage !== undefined && coverage !== "planned") {
      return fail(mode, documentPath, `data-md2vid-coverage must be "planned"`);
    }
    if (isV2Beat(beat) && coverage !== "planned") {
      return fail(mode, documentPath, `data-md2vid-coverage must be "planned" for v2 semantic targets`);
    }
    const token = (htmlAttribute(tag, "data-md2vid-enter") ?? "fade") as HyperframesEntranceToken;
    if (!Object.hasOwn(ENTRANCES, token)) {
      return fail(mode, documentPath, `unsupported entrance token "${token}"`);
    }
    const rawDuration = htmlAttribute(tag, "data-md2vid-duration");
    const duration = rawDuration === undefined ? 0.48 : Number(rawDuration);
    if (!Number.isFinite(duration) || duration < 0) {
      return fail(mode, documentPath, `visual reveal duration must be a finite non-negative duration`);
    }
    const entrance = ENTRANCES[token];
    const target = `#${id}`;
    const revealDuration = entrance.revealDuration(duration);
    const source = isV2Beat(beat) && token === "none" && revealDuration === 0 ? "static" : "declarative";
    if (isV2Beat(beat)) {
      statements.push(...coverageStatements(target, beat, frame));
      if (token !== "none") statements.push(entrance.statement(target, duration, beat.start));
    } else {
      statements.push(entrance.statement(target, duration, beat.start));
    }
    bindings.push(bindingEvidence(frame, beatId, beat, target, revealDuration, source));
  }
  return { statements, bindings };
}

function appendAuthoredDuration(bindings: VisualBinding[], authoredDuration: number): void {
  for (const binding of bindings) binding.authoredDuration = authoredDuration;
}

function validateDuplicateTargets(
  bindings: readonly VisualBinding[],
  mode: VisualSyncMode,
  documentPath: string,
): boolean {
  const seen = new Set<string>();
  for (const binding of bindings) {
    if (seen.has(binding.target)) return fail(mode, documentPath, `duplicate visual target "${binding.target}"`);
    seen.add(binding.target);
  }
  return true;
}

export function prepareFrameVisualTiming(input: {
  frame: PlanFrame;
  authoredHtml: string;
  documentPath: string;
  mode: VisualSyncMode;
}): PreparedTiming {
  const frame = input.frame;
  const initialTags = scanHtmlTags(input.authoredHtml);
  const hasTimingDeclaration = initialTags.some((tag) =>
    !tag.closing && (
      htmlAttribute(tag, "data-md2vid-beat") !== undefined
      || htmlAttribute(tag, "data-md2vid-coverage") !== undefined
      || hasHtmlAttribute(tag, "data-md2vid-custom-bindings")
    ),
  );
  const hasPlannedVisualBeats = Boolean(frame.visualBeats?.length);
  if (!hasTimingDeclaration && !hasPlannedVisualBeats) return { html: input.authoredHtml, bindings: [] };
  if (!hasPlannedVisualBeats) {
    if (input.mode === "warn") return { html: input.authoredHtml, bindings: [] };
    fail(input.mode, input.documentPath, "data-md2vid-beat exists but the frame has no planned visual beats");
  }

  let html = input.authoredHtml;
  let body = input.authoredHtml;
  const hasTemplate = initialTags.some((tag) => !tag.closing && tag.name === "template");
  if (hasTemplate) {
    body = extractCompositionTemplate(input.authoredHtml, frame.slug, input.documentPath);
  }
  const tags = scanHtmlTags(body);
  const root = compositionRootTag(tags, frame.slug);
  const authoredDuration = readDuration(root, input.mode, input.documentPath);
  if (authoredDuration === false) return { html: input.authoredHtml, bindings: [] };
  if (!hasTimingDeclaration) {
    return { html: input.authoredHtml, bindings: [], authoredDuration };
  }
  const ids = elementIds(tags);
  const renderedTags = renderedDescendantTags(tags, root);
  const beats = new Map((frame.visualBeats ?? []).map((beat) => [beat.id, beat]));
  if (!validateCoverageAttributes(tags, beats, input.mode, input.documentPath)) {
    return { html: input.authoredHtml, bindings: [] };
  }
  const declarative = readDeclarativeBindings(tags, beats, ids, renderedTags, frame, input.mode, input.documentPath);
  if (declarative === false) return { html: input.authoredHtml, bindings: [] };
  const customDeclarations = parseCustomDeclarations(
    tags,
    body,
    beats,
    ids,
    renderedTags,
    frame,
    input.mode,
    input.documentPath,
  );
  if (customDeclarations === false) return { html: input.authoredHtml, bindings: [] };
  const customBindings = customDeclarations.map((declaration) => {
    const beat = beats.get(declaration.beat)!;
    return bindingEvidence(
      frame,
      declaration.beat,
      beat,
      declaration.target,
      declaration.duration,
      "custom",
    );
  });
  const bindings = [...declarative.bindings, ...customBindings];
  if (!validateDuplicateTargets(bindings, input.mode, input.documentPath)) {
    return { html: input.authoredHtml, bindings: [] };
  }
  appendAuthoredDuration(bindings, authoredDuration);

  const prefix = wrapGeneratedScript(
    "visual-timing",
    buildHyperframesTimingRuntime(frame, bindings, customDeclarations),
  );
  const suffix = wrapGeneratedScript(
    "visual-timing-finalizer",
    buildTimelineFinalizer(frame.slug, declarative.statements, customDeclarations.length > 0),
  );
  const timedBody = insertCompositionRootScripts(body, frame.slug, prefix, suffix);
  if (hasTemplate) {
    const template = initialTags.find((tag) => !tag.closing && tag.name === "template");
    const templateId = template ? htmlAttribute(template, "id") : undefined;
    html = `<template${templateId ? ` id="${templateId}"` : ""}>\n${timedBody.trim()}\n</template>`;
  } else {
    html = timedBody;
  }
  return { html, bindings, authoredDuration };
}

function wrapGeneratedScript(name: string, source: string): string {
  return source ? `<script data-md2vid-generated="${name}">\n${source}\n</script>` : "";
}

export function buildHyperframesTimingRuntime(
  frame: PlanFrame,
  bindings: readonly VisualBinding[],
  customDeclarations: readonly CustomDeclaration[] = [],
): string {
  const beats = Object.fromEntries((frame.visualBeats ?? []).map((beat) => [beat.id, beat.version === 2
    ? {
        version: 2,
        start: beat.start,
        end: beat.end,
        role: beat.role,
      }
    : { version: 1, start: beat.start }]));
  const declarations = bindings
    .filter((binding) => binding.source === "custom")
    .map((binding) => {
      const declaration = customDeclarations.find((candidate) =>
        candidate.beat === binding.beatId
        && candidate.target === binding.target
        && candidate.duration === binding.revealDuration
      );
      return {
        beat: binding.beatId,
        target: binding.target,
        method: declaration?.method ?? "from",
        duration: binding.revealDuration,
        ...(declaration?.coverage === undefined ? {} : { coverage: declaration.coverage }),
      };
    });
  return `(function () {
  var FRAME_BEATS = ${serializeScriptData({ [frame.slug]: beats })};
  var FRAME_BINDINGS = ${serializeScriptData({ [frame.slug]: declarations })};
  window.__md2vidTiming = window.__md2vidTiming || {};
  function requireBeat(slug, beatId) {
    var frameBeats = FRAME_BEATS[slug];
    var beat = frameBeats && frameBeats[beatId];
    if (!beat) throw new Error("unknown visual beat " + beatId + " for frame " + slug);
    return beat;
  }
  function requireBinding(slug, beatId, target, method) {
    var frameBindings = FRAME_BINDINGS[slug] || [];
    var declaration = frameBindings.find(function (candidate) {
      return candidate.beat === beatId && candidate.target === target && candidate.method === method;
    });
    if (!declaration) {
      throw new Error("custom binding has no matching declaration for " + beatId + " / " + target + " / " + method);
    }
    return declaration;
  }
  function requireDeclaredBinding(slug, beatId, target) {
    var frameBindings = FRAME_BINDINGS[slug] || [];
    var declaration = frameBindings.find(function (candidate) {
      return candidate.beat === beatId && candidate.target === target && candidate.coverage === "planned";
    });
    if (!declaration) {
      throw new Error("custom binding has no matching declaration for " + beatId + " / " + target + " / coverage-end");
    }
    return declaration;
  }
  function requireV2Beat(slug, beatId) {
    var beat = requireBeat(slug, beatId);
    if (beat.version !== 2 || typeof beat.end !== "number") {
      throw new Error("md2vid exit requires a v2 visual beat");
    }
    return beat;
  }
  function scheduleCoverage(timeline, target, beat) {
    if (beat.version !== 2) return;
    if (beat.start > 0) timeline.set(target, { autoAlpha: 0 }, 0);
    timeline.set(target, { autoAlpha: 1 }, beat.start);
    if (beat.end <= ${frame.voiceDur}) timeline.set(target, { autoAlpha: 0 }, beat.end);
  }
  function requireExplicitFiniteDuration(vars) {
    if (!vars || typeof vars.duration !== "number" || !Number.isFinite(vars.duration)) {
      throw new Error("custom binding requires an explicit finite duration");
    }
    return vars.duration;
  }
  function requireZeroSetDuration(vars) {
    if (vars && Object.prototype.hasOwnProperty.call(vars, "duration") && vars.duration !== 0) {
      throw new Error("custom set duration must be exactly zero");
    }
  }
  window.__md2vidTiming.assertFrameConsumed = function (slug) {
    var unused = (FRAME_BINDINGS[slug] || []).find(function (declaration) {
      return declaration.used !== true;
    });
    if (unused) {
      throw new Error("custom binding declaration was not consumed: " + unused.beat + " / " + unused.target + " / " + unused.method);
    }
  };
  window.__md2vidTiming.forFrame = function (slug) {
    return {
      from: function (timeline, beatId, target, vars) {
        var beat = requireBeat(slug, beatId);
        var declaration = requireBinding(slug, beatId, target, "from");
        var duration = requireExplicitFiniteDuration(vars);
        if (duration !== declaration.duration) throw new Error("custom binding duration mismatch");
        scheduleCoverage(timeline, target, beat);
        timeline.from(target, vars, beat.start);
        declaration.used = true;
        return timeline;
      },
      fromTo: function (timeline, beatId, target, fromVars, toVars) {
        var beat = requireBeat(slug, beatId);
        var declaration = requireBinding(slug, beatId, target, "fromTo");
        var duration = requireExplicitFiniteDuration(toVars);
        if (duration !== declaration.duration) throw new Error("custom binding duration mismatch");
        scheduleCoverage(timeline, target, beat);
        timeline.fromTo(target, fromVars, toVars, beat.start);
        declaration.used = true;
        return timeline;
      },
      set: function (timeline, beatId, target, vars) {
        var beat = requireBeat(slug, beatId);
        var declaration = requireBinding(slug, beatId, target, "set");
        requireZeroSetDuration(vars);
        scheduleCoverage(timeline, target, beat);
        timeline.set(target, vars, beat.start);
        declaration.used = true;
        return timeline;
      },
      exit: function (timeline, beatId, target, options) {
        var beat = requireV2Beat(slug, beatId);
        requireDeclaredBinding(slug, beatId, target);
        var at = options && Object.prototype.hasOwnProperty.call(options, "at") ? options.at : "coverage-end";
        if (at !== "coverage-end") {
          throw new Error("md2vid exit supports only coverage-end");
        }
        return timeline;
      }
    };
  };
})();`;
}

function buildTimelineFinalizer(
  frameSlug: string,
  declarativeStatements: readonly string[],
  hasCustomDeclarations: boolean,
): string {
  if (declarativeStatements.length === 0 && !hasCustomDeclarations) return "";
  return `(function () {
  const timeline = window.__timelines[${serializeScriptData(frameSlug)}];
  if (!timeline) throw new Error("authored timeline is not registered for frame " + ${serializeScriptData(frameSlug)});
${declarativeStatements.map((statement) => `  ${statement}`).join("\n")}
${hasCustomDeclarations ? `  window.__md2vidTiming.assertFrameConsumed(${serializeScriptData(frameSlug)});` : ""}
})();`;
}
