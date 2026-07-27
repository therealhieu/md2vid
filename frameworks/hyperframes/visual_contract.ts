import { htmlAttribute, scanHtmlTags, type HtmlTag } from "./html.ts";

export type FrameTheme = "light" | "dark";
export type VisualContractDiagnosticCode =
  | "frame_theme_missing"
  | "frame_theme_mismatch"
  | "caption_contrast_insufficient"
  | "caption_token_unknown"
  | "caption_token_invalid_color"
  | "visual_contract_browser_required";

export interface CssColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface VisualContractDiagnostic {
  code: VisualContractDiagnosticCode;
  frameSlug: string;
  severity: "error" | "warn";
  message: string;
}

export interface AuthoredFrameVisualContractOptions {
  projectTheme: FrameTheme;
  captionForeground: string;
  allowMixedThemes?: boolean;
  allowLegacyThemeInference?: boolean;
  contrastThreshold?: number;
  frameSlug?: string;
}

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const LIGHT_LUMINANCE_MIN = 0.5;
const DARK_LUMINANCE_MAX = 0.2;

function expandHex(hex: string): string {
  return hex.length <= 4
    ? [...hex].map((character) => character + character).join("")
    : hex;
}

export function parseCssColor(value: string): CssColor {
  const normalized = value.trim();
  const match = normalized.match(HEX_COLOR);
  if (!match) {
    throw new Error(`invalid color ${JSON.stringify(value)}: expected a literal #RGB, #RGBA, #RRGGBB, or #RRGGBBAA hex color`);
  }

  const expanded = expandHex(match[1]);
  return {
    red: Number.parseInt(expanded.slice(0, 2), 16),
    green: Number.parseInt(expanded.slice(2, 4), 16),
    blue: Number.parseInt(expanded.slice(4, 6), 16),
    alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
  };
}

function linearChannel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(value: string | CssColor): number {
  const color = typeof value === "string" ? parseCssColor(value) : value;
  if (color.alpha !== 1) {
    throw new Error("invalid color for luminance: translucent hex colors require a composited background");
  }
  return (
    0.2126 * linearChannel(color.red) +
    0.7152 * linearChannel(color.green) +
    0.0722 * linearChannel(color.blue)
  );
}

export function contrastRatio(foreground: string | CssColor, background: string | CssColor): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function compositionRoot(html: string): HtmlTag | undefined {
  const candidates = scanHtmlTags(html).filter((tag) =>
    !tag.closing && htmlAttribute(tag, "data-composition-id") !== undefined
  );
  return candidates.find((tag) => tag.name !== "template") ?? candidates[0];
}

export function extractFrameTheme(html: string): { frameSlug: string; theme?: FrameTheme } {
  const root = compositionRoot(html);
  const frameSlug = root ? htmlAttribute(root, "data-composition-id") ?? "unknown" : "unknown";
  const declared = root ? htmlAttribute(root, "data-frame-theme") : undefined;
  return {
    frameSlug,
    ...(declared === "light" || declared === "dark" ? { theme: declared } : {}),
  };
}

interface CssDeclarations {
  [property: string]: string;
}

type Specificity = readonly [ids: number, classes: number, types: number];

interface CascadedDeclaration {
  value: string;
  priority: readonly [important: number, inline: number, ids: number, classes: number, types: number, order: number];
}

function styleBlocks(html: string): string[] {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map((match) => match[1]);
}

function simpleCompoundTargets(compound: string, tag: HtmlTag): boolean {
  if (!/^(?:[A-Za-z][A-Za-z0-9-]*)?(?:#[A-Za-z0-9_-]+)?(?:\.[A-Za-z0-9_-]+)*$/.test(compound)) {
    return false;
  }
  const type = compound.match(/^[A-Za-z][A-Za-z0-9-]*/)?.[0].toLowerCase();
  if (type && type !== tag.name) return false;
  const expectedId = compound.match(/#([A-Za-z0-9_-]+)/)?.[1];
  if (expectedId && expectedId !== htmlAttribute(tag, "id")) return false;
  const classes = new Set((htmlAttribute(tag, "class") ?? "").split(/\s+/).filter(Boolean));
  return [...compound.matchAll(/\.([A-Za-z0-9_-]+)/g)].every((match) => classes.has(match[1]));
}

function parseSimpleDescendantSelector(selector: string): string[] | undefined {
  const withoutComments = selector.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (!withoutComments || /[>+~:[\]]/.test(withoutComments)) return undefined;
  const compounds = withoutComments.split(/\s+/).filter(Boolean);
  return compounds.length > 0 && compounds.every((compound) =>
    /^(?:[A-Za-z][A-Za-z0-9-]*)?(?:#[A-Za-z0-9_-]+)?(?:\.[A-Za-z0-9_-]+)*$/.test(compound)
  ) ? compounds : undefined;
}

function specificity(compounds: readonly string[]): Specificity {
  return [
    compounds.reduce((count, compound) => count + (compound.match(/#/g)?.length ?? 0), 0),
    compounds.reduce((count, compound) => count + (compound.match(/\./g)?.length ?? 0), 0),
    compounds.reduce((count, compound) => count + (/^[A-Za-z]/.test(compound) ? 1 : 0), 0),
  ];
}

function ancestorsForTag(html: string, target: HtmlTag): HtmlTag[] {
  const stack: HtmlTag[] = [];
  for (const tag of scanHtmlTags(html)) {
    if (!tag.closing && tag.start === target.start) return [...stack];
    if (tag.closing) {
      const matching = stack.findLastIndex((candidate) => candidate.name === tag.name);
      if (matching !== -1) stack.splice(matching);
    } else if (!tag.selfClosing) {
      stack.push(tag);
    }
  }
  return [];
}

function selectorMatches(
  compounds: readonly string[],
  target: HtmlTag,
  ancestors: readonly HtmlTag[],
): boolean {
  const rightmost = compounds.at(-1);
  if (!rightmost || !simpleCompoundTargets(rightmost, target)) return false;
  let ancestorIndex = ancestors.length - 1;
  for (let compoundIndex = compounds.length - 2; compoundIndex >= 0; compoundIndex--) {
    while (ancestorIndex >= 0 && !simpleCompoundTargets(compounds[compoundIndex], ancestors[ancestorIndex])) {
      ancestorIndex -= 1;
    }
    if (ancestorIndex < 0) return false;
    ancestorIndex -= 1;
  }
  return true;
}

function rightmostSelectorCompound(selector: string): string | undefined {
  const trimmed = selector.trim();
  let quote = "";
  let brackets = 0;
  let parentheses = 0;
  for (let index = trimmed.length - 1; index >= 0; index--) {
    const character = trimmed[index];
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "]") {
      brackets += 1;
    } else if (character === "[") {
      brackets = Math.max(0, brackets - 1);
    } else if (character === ")") {
      parentheses += 1;
    } else if (character === "(") {
      parentheses = Math.max(0, parentheses - 1);
    } else if (brackets === 0 && parentheses === 0 && (/\s/.test(character) || /[>+~]/.test(character))) {
      return trimmed.slice(index + 1).trim() || undefined;
    }
  }
  return trimmed || undefined;
}

function attributeConditionMatches(source: string, tag: HtmlTag): boolean | undefined {
  const match = source.match(/^\[\s*([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\s*([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]/);
  if (!match) return undefined;
  const actual = htmlAttribute(tag, match[1]);
  if (actual === undefined) return false;
  if (!match[2]) return true;
  const expected = match[3] ?? match[4] ?? match[5] ?? "";
  switch (match[2]) {
    case "=": return actual === expected;
    case "~=": return actual.split(/\s+/).includes(expected);
    case "|=": return actual === expected || actual.startsWith(`${expected}-`);
    case "^=": return actual.startsWith(expected);
    case "$=": return actual.endsWith(expected);
    case "*=": return actual.includes(expected);
    default: return undefined;
  }
}

function unsupportedSelectorCouldTarget(selector: string, tag: HtmlTag): boolean {
  const rightmost = rightmostSelectorCompound(selector);
  if (!rightmost) return false;
  const specialStart = rightmost.search(/[:[]/);
  const base = specialStart === -1 ? rightmost : rightmost.slice(0, specialStart);
  if (base && !simpleCompoundTargets(base, tag)) return false;

  let remainder = specialStart === -1 ? "" : rightmost.slice(specialStart);
  let matchedAttribute = false;
  while (remainder.startsWith("[")) {
    const closing = remainder.indexOf("]");
    if (closing === -1) return true;
    const condition = remainder.slice(0, closing + 1);
    const matches = attributeConditionMatches(condition, tag);
    if (matches === false) return false;
    if (matches === undefined) return true;
    matchedAttribute = true;
    remainder = remainder.slice(closing + 1).trim();
  }
  if (remainder === ":root") return tag.name === "html";
  if (remainder.startsWith(":")) return true;
  return matchedAttribute || (base.length > 0 && simpleCompoundTargets(base, tag));
}

function comparePriority(
  left: CascadedDeclaration["priority"],
  right: CascadedDeclaration["priority"],
): number {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function applyDeclarations(
  cascaded: Record<string, CascadedDeclaration>,
  source: string,
  selectorSpecificity: Specificity,
  inline: boolean,
  order: { value: number },
): void {
  for (const declaration of source.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator === -1) continue;
    const rawProperty = declaration.slice(0, separator).trim().toLowerCase();
    let value = declaration.slice(separator + 1).trim();
    if (!rawProperty || !value) continue;
    const important = /\s*!important\s*$/i.test(value);
    if (important) value = value.replace(/\s*!important\s*$/i, "").trim();
    const property = rawProperty === "background" ? "background-color" : rawProperty;
    const priority = [
      important ? 1 : 0,
      inline ? 1 : 0,
      ...selectorSpecificity,
      order.value++,
    ] as const;
    const previous = cascaded[property];
    if (!previous || comparePriority(priority, previous.priority) >= 0) {
      cascaded[property] = { value, priority };
    }
  }
}

function declarationsForTag(html: string, tag: HtmlTag): CssDeclarations | undefined {
  const cascaded: Record<string, CascadedDeclaration> = {};
  const ancestors = ancestorsForTag(html, tag);
  const order = { value: 0 };
  for (const style of styleBlocks(html)) {
    for (const match of style.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      let matchedSpecificity: Specificity | undefined;
      for (const selector of match[1].split(",")) {
        const compounds = parseSimpleDescendantSelector(selector);
        if (!compounds) {
          if (unsupportedSelectorCouldTarget(selector, tag)) return undefined;
          continue;
        }
        if (!selectorMatches(compounds, tag, ancestors)) continue;
        const candidate = specificity(compounds);
        if (!matchedSpecificity || comparePriority([0, 0, ...candidate, 0], [0, 0, ...matchedSpecificity, 0]) > 0) {
          matchedSpecificity = candidate;
        }
      }
      if (matchedSpecificity) applyDeclarations(cascaded, match[2], matchedSpecificity, false, order);
    }
  }
  const inlineStyle = htmlAttribute(tag, "style");
  if (inlineStyle) applyDeclarations(cascaded, inlineStyle, [0, 0, 0], true, order);
  return Object.fromEntries(Object.entries(cascaded).map(([property, declaration]) => [property, declaration.value]));
}

function isFullCanvas(declarations: CssDeclarations): boolean {
  const position = declarations.position?.toLowerCase();
  const inset = declarations.inset?.replace(/\s+/g, "").toLowerCase();
  const width = declarations.width?.replace(/\s+/g, "").toLowerCase();
  const height = declarations.height?.replace(/\s+/g, "").toLowerCase();
  return position === "absolute" && (inset === "0" || inset === "0px" || (width === "100%" && height === "100%"));
}

function literalBackground(declarations: CssDeclarations): string | undefined {
  const background = declarations["background-color"] ?? declarations.background;
  if (!background) return undefined;
  const match = background.match(/^\s*(#[0-9a-f]{3,8})\s*(?:!important\s*)?$/i);
  if (!match || !HEX_COLOR.test(match[1])) return undefined;
  return parseCssColor(match[1]).alpha === 1 ? match[1] : undefined;
}

export function extractLiteralFrameGround(html: string): string | undefined {
  const tags = scanHtmlTags(html).filter((tag) => !tag.closing);
  const trackZero = tags.find((tag) => htmlAttribute(tag, "data-track-index") === "0");
  const candidate = trackZero ?? compositionRoot(html);
  if (!candidate) return undefined;
  const declarations = declarationsForTag(html, candidate);
  if (!declarations) return undefined;
  const background = literalBackground(declarations);
  return background && isFullCanvas(declarations) ? background : undefined;
}

function detectedTheme(background: string): FrameTheme | undefined {
  const luminance = relativeLuminance(background);
  if (luminance >= LIGHT_LUMINANCE_MIN) return "light";
  if (luminance <= DARK_LUMINANCE_MAX) return "dark";
  return undefined;
}

function diagnostic(
  code: VisualContractDiagnosticCode,
  frameSlug: string,
  severity: "error" | "warn",
  values: string,
): VisualContractDiagnostic {
  return { code, frameSlug, severity, message: `${code} frame=${frameSlug} ${values}` };
}

export function checkAuthoredFrameVisualContract(
  html: string,
  options: AuthoredFrameVisualContractOptions,
): VisualContractDiagnostic[] {
  const root = compositionRoot(html);
  const extracted = extractFrameTheme(html);
  const frameSlug = extracted.frameSlug === "unknown"
    ? options.frameSlug ?? extracted.frameSlug
    : extracted.frameSlug;
  const theme = extracted.theme;
  const declaredValue = root ? htmlAttribute(root, "data-frame-theme") : undefined;

  if (!theme) {
    if (declaredValue !== undefined) {
      return [diagnostic(
        "frame_theme_mismatch",
        frameSlug,
        "error",
        `declared=${JSON.stringify(declaredValue)} expected=light-or-dark`,
      )];
    }
    return [diagnostic(
      "frame_theme_missing",
      frameSlug,
      options.allowLegacyThemeInference ? "warn" : "error",
      `data-frame-theme=missing compatibility=${options.allowLegacyThemeInference ? "legacy-warning" : "strict"}`,
    )];
  }

  const ground = extractLiteralFrameGround(html);
  if (!ground) {
    return [diagnostic(
      "visual_contract_browser_required",
      frameSlug,
      "warn",
      "ground=dynamic-or-unsupported reason=literal-full-canvas-ground-not-found",
    )];
  }

  const detected = detectedTheme(ground);
  if (!detected) {
    return [diagnostic(
      "visual_contract_browser_required",
      frameSlug,
      "warn",
      `ground=${ground} reason=ground-polarity-ambiguous`,
    )];
  }

  const diagnostics: VisualContractDiagnostic[] = [];
  if (theme !== detected) {
    diagnostics.push(diagnostic(
      "frame_theme_mismatch",
      frameSlug,
      "error",
      `declared=${theme} ground=${ground} detected=${detected}`,
    ));
  } else if (theme !== options.projectTheme && !options.allowMixedThemes) {
    diagnostics.push(diagnostic(
      "frame_theme_mismatch",
      frameSlug,
      "error",
      `declared=${theme} ground=${ground} project=${options.projectTheme} mixed=false`,
    ));
  }

  const threshold = options.contrastThreshold ?? 4.5;
  const ratio = contrastRatio(options.captionForeground, ground);
  if (ratio < threshold) {
    diagnostics.push(diagnostic(
      "caption_contrast_insufficient",
      frameSlug,
      "error",
      `foreground=${options.captionForeground} background=${ground} ratio=${ratio.toFixed(2)} threshold=${threshold.toFixed(2)}`,
    ));
  }

  return diagnostics;
}
