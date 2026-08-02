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
};

type PreparedTiming = {
  html: string;
  bindings: VisualBinding[];
};

const ENTRANCES: Record<HyperframesEntranceToken, {
  revealDuration: (duration: number) => number;
  statement: (target: string, duration: number, start: number) => string;
}> = {
  fade: {
    revealDuration: (duration) => duration,
    statement: (target, duration, start) =>
      `timeline.from(${JSON.stringify(target)}, { opacity: 0, duration: ${duration}, ease: "power2.out" }, ${start});`,
  },
  rise: {
    revealDuration: (duration) => duration,
    statement: (target, duration, start) =>
      `timeline.from(${JSON.stringify(target)}, { opacity: 0, y: 28, duration: ${duration}, ease: "power3.out" }, ${start});`,
  },
  "slide-left": {
    revealDuration: (duration) => duration,
    statement: (target, duration, start) =>
      `timeline.from(${JSON.stringify(target)}, { opacity: 0, x: 28, duration: ${duration}, ease: "power3.out" }, ${start});`,
  },
  scale: {
    revealDuration: (duration) => duration,
    statement: (target, duration, start) =>
      `timeline.from(${JSON.stringify(target)}, { opacity: 0, scale: 0.96, duration: ${duration}, ease: "power2.out" }, ${start});`,
  },
  none: {
    revealDuration: () => 0,
    statement: (target, _duration, start) =>
      `timeline.set(${JSON.stringify(target)}, { opacity: 1 }, ${start});`,
  },
};

const CUSTOM_METHODS = new Set<CustomMethod>(["from", "fromTo", "set"]);

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

function elementIds(tags: readonly HtmlTag[]): Map<string, HtmlTag> {
  const ids = new Map<string, HtmlTag>();
  for (const tag of tags) {
    if (tag.closing) continue;
    const id = htmlAttribute(tag, "id");
    if (id !== undefined && id.length > 0) ids.set(id, tag);
  }
  return ids;
}

function readDuration(
  root: HtmlTag | undefined,
  frame: PlanFrame,
  mode: VisualSyncMode,
  documentPath: string,
): number | false {
  const raw = root ? htmlAttribute(root, "data-duration") : undefined;
  const duration = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(duration) || duration < 0) {
    return fail(mode, documentPath, "composition root data-duration must be a finite non-negative number");
  }
  if (Math.abs(duration - frame.voiceDur) > 0.001) {
    return fail(
      mode,
      documentPath,
      `authored duration ${duration.toFixed(3)}s does not match voiceDur ${frame.voiceDur.toFixed(3)}s`,
    );
  }
  return duration;
}

function customScriptBody(tags: readonly HtmlTag[], html: string, index: number): string | undefined {
  const opening = tags[index];
  const closing = tags.slice(index + 1).find((tag) => tag.name === "script" && tag.closing);
  return closing ? html.slice(opening.end, closing.start) : undefined;
}

function parseCustomDeclarations(
  tags: readonly HtmlTag[],
  html: string,
  beats: ReadonlyMap<string, ResolvedVisualBeat>,
  ids: ReadonlyMap<string, HtmlTag>,
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
    if (typeof beatId !== "string" || !beats.has(beatId)) {
      return fail(mode, documentPath, `custom binding references unknown beat "${String(beatId)}"`);
    }
    if (typeof target !== "string" || !/^#[A-Za-z0-9][A-Za-z0-9_-]*$/.test(target)) {
      return fail(mode, documentPath, `custom binding target must be an ID selector (got ${JSON.stringify(target)})`);
    }
    const id = target.slice(1);
    if (!ids.has(id)) {
      return fail(mode, documentPath, `custom binding target "${target}" does not match an element id`);
    }
    if (typeof method !== "string" || !CUSTOM_METHODS.has(method as CustomMethod)) {
      return fail(mode, documentPath, `unsupported custom method "${String(method)}"`);
    }
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) {
      return fail(mode, documentPath, `custom binding duration must be a finite non-negative duration`);
    }
    const key = `${beatId}:${target}:${method}`;
    if (seen.has(key)) return fail(mode, documentPath, `duplicate custom declaration "${key}"`);
    seen.add(key);
    declarations.push({ beat: beatId, target, method: method as CustomMethod, duration });
  }
  return declarations;
}

function readDeclarativeBindings(
  tags: readonly HtmlTag[],
  beats: ReadonlyMap<string, ResolvedVisualBeat>,
  ids: ReadonlyMap<string, HtmlTag>,
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
    if (id === undefined || id.length === 0 || !ids.has(id)) {
      return fail(mode, documentPath, `declarative visual target for beat "${beatId}" requires a unique non-empty id`);
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
    statements.push(entrance.statement(target, duration, beat.start));
    bindings.push({
      frameSlug: frame.slug,
      beatId,
      target,
      revealStart: beat.start,
      revealDuration: entrance.revealDuration(duration),
      source: "declarative",
    });
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
      || hasHtmlAttribute(tag, "data-md2vid-custom-bindings")
    ),
  );
  if (!hasTimingDeclaration) return { html: input.authoredHtml, bindings: [] };
  if (!frame.visualBeats?.length) {
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
  const authoredDuration = readDuration(root, frame, input.mode, input.documentPath);
  if (authoredDuration === false) return { html: input.authoredHtml, bindings: [] };
  const ids = elementIds(tags);
  const beats = new Map((frame.visualBeats ?? []).map((beat) => [beat.id, beat]));
  const declarative = readDeclarativeBindings(tags, beats, ids, frame, input.mode, input.documentPath);
  if (declarative === false) return { html: input.authoredHtml, bindings: [] };
  const customDeclarations = parseCustomDeclarations(
    tags,
    body,
    beats,
    ids,
    frame,
    input.mode,
    input.documentPath,
  );
  if (customDeclarations === false) return { html: input.authoredHtml, bindings: [] };
  const customBindings = customDeclarations.map((declaration) => ({
    frameSlug: frame.slug,
    beatId: declaration.beat,
    target: declaration.target,
    revealStart: beats.get(declaration.beat)!.start,
    revealDuration: declaration.duration,
    source: "custom" as const,
  }));
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
    buildTimelineFinalizer(frame.slug, declarative.statements),
  );
  const timedBody = insertCompositionRootScripts(body, frame.slug, prefix, suffix);
  if (hasTemplate) {
    const template = initialTags.find((tag) => !tag.closing && tag.name === "template");
    const templateId = template ? htmlAttribute(template, "id") : undefined;
    html = `<template${templateId ? ` id="${templateId}"` : ""}>\n${timedBody.trim()}\n</template>`;
  } else {
    html = timedBody;
  }
  return { html, bindings };
}

function wrapGeneratedScript(name: string, source: string): string {
  return source ? `<script data-md2vid-generated="${name}">\n${source}\n</script>` : "";
}

export function buildHyperframesTimingRuntime(
  frame: PlanFrame,
  bindings: readonly VisualBinding[],
  customDeclarations: readonly CustomDeclaration[] = [],
): string {
  const beats = Object.fromEntries((frame.visualBeats ?? []).map((beat) => [beat.id, { start: beat.start }]));
  const declarationByBeat = new Map(
    customDeclarations.map((declaration) => [declaration.beat, declaration]),
  );
  const declarations = Object.fromEntries(
    bindings
      .filter((binding) => binding.source === "custom")
      .map((binding) => {
        const declaration = declarationByBeat.get(binding.beatId);
        return [binding.beatId, {
          target: binding.target,
          method: declaration?.method ?? "from",
          duration: binding.revealDuration,
        }];
      }),
  );
  return `(function () {
  var FRAME_BEATS = ${JSON.stringify({ [frame.slug]: beats })};
  var FRAME_BINDINGS = ${JSON.stringify({ [frame.slug]: declarations })};
  window.__md2vidTiming = window.__md2vidTiming || {};
  function requireBeat(slug, beatId) {
    var frameBeats = FRAME_BEATS[slug];
    var beat = frameBeats && frameBeats[beatId];
    if (!beat) throw new Error("unknown visual beat " + beatId + " for frame " + slug);
    return beat;
  }
  function requireBinding(slug, beatId, target, method) {
    var frameBindings = FRAME_BINDINGS[slug];
    var declaration = frameBindings && frameBindings[beatId];
    if (!declaration || declaration.target !== target || declaration.method !== method) {
      throw new Error("custom binding has no matching declaration for " + beatId + " / " + target + " / " + method);
    }
    return declaration;
  }
  window.__md2vidTiming.forFrame = function (slug) {
    return {
      from: function (timeline, beatId, target, vars) {
        var beat = requireBeat(slug, beatId);
        var declaration = requireBinding(slug, beatId, target, "from");
        var duration = Number(vars.duration || 0);
        if (duration !== declaration.duration) throw new Error("custom binding duration mismatch");
        timeline.from(target, vars, beat.start);
        return timeline;
      },
      fromTo: function (timeline, beatId, target, fromVars, toVars) {
        var beat = requireBeat(slug, beatId);
        var declaration = requireBinding(slug, beatId, target, "fromTo");
        var duration = Number(toVars.duration || 0);
        if (duration !== declaration.duration) throw new Error("custom binding duration mismatch");
        timeline.fromTo(target, fromVars, toVars, beat.start);
        return timeline;
      },
      set: function (timeline, beatId, target, vars) {
        var beat = requireBeat(slug, beatId);
        requireBinding(slug, beatId, target, "set");
        timeline.set(target, vars, beat.start);
        return timeline;
      }
    };
  };
})();`;
}

function buildTimelineFinalizer(frameSlug: string, declarativeStatements: readonly string[]): string {
  if (declarativeStatements.length === 0) return "";
  return `(function () {
  const timeline = window.__timelines[${JSON.stringify(frameSlug)}];
  if (!timeline) throw new Error("authored timeline is not registered for frame ${frameSlug}");
${declarativeStatements.map((statement) => `  ${statement}`).join("\n")}
})();`;
}
