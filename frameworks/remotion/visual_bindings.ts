import { readFileSync } from "node:fs";
import type {
  BuildPlan,
  VisualBindingManifest,
  VisualBindingManifestV1,
} from "../../engine/types.ts";
import { REMOTION_COMPOSITION_FPS } from "./verify.ts";
import { quantizeVisualTiming } from "./timing.ts";

export type RemotionEntrance = "fade" | "rise" | "slide-left" | "scale" | "none";

export interface RemotionBindingSpec {
  version: 1;
  frames: Record<string, Array<{
    beat: string;
    target: string;
    enter: RemotionEntrance;
    duration: number;
  }>>;
}

const ENTRANCES = new Set<RemotionEntrance>(["fade", "rise", "slide-left", "scale", "none"]);
const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

type Binding = RemotionBindingSpec["frames"][string][number];

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) throw new Error(`${label} has unknown field "${key}"`);
  }
}

function readOwn(record: Record<string, unknown>, key: string, label: string): unknown {
  if (!hasOwn(record, key)) throw new Error(`${label} is missing required field "${key}"`);
  return record[key];
}

function nonBlankString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function readBinding(value: unknown, label: string): Binding {
  const binding = asRecord(value, label);
  assertOnlyKeys(binding, ["beat", "target", "enter", "duration"], label);
  const beat = nonBlankString(readOwn(binding, "beat", label), `${label}.beat`);
  const target = nonBlankString(readOwn(binding, "target", label), `${label}.target`);
  const enter = readOwn(binding, "enter", label);
  const duration = readOwn(binding, "duration", label);
  if (typeof enter !== "string" || !ENTRANCES.has(enter as RemotionEntrance)) {
    throw new Error(`${label}.enter must be a supported entrance token`);
  }
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) {
    throw new Error(`${label}.duration must be a finite non-negative number`);
  }
  return { beat, target, enter: enter as RemotionEntrance, duration };
}

export function emptyRemotionBindingManifest(): VisualBindingManifest {
  return { version: 1, framework: "remotion", bindings: [], frames: [] };
}

export function readRemotionBindingSpec(path: string): RemotionBindingSpec {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error: unknown) {
    throw new Error(`${path}: visual bindings must be valid JSON: ${(error as Error).message}`);
  }

  const spec = asRecord(value, `${path}: visual bindings`);
  assertOnlyKeys(spec, ["version", "frames"], `${path}: visual bindings`);
  if (readOwn(spec, "version", `${path}: visual bindings`) !== 1) {
    throw new Error(`${path}: visual bindings version must be 1`);
  }
  const rawFrames = asRecord(readOwn(spec, "frames", `${path}: visual bindings`), `${path}: visual bindings frames`);
  const frames: RemotionBindingSpec["frames"] = Object.create(null) as RemotionBindingSpec["frames"];

  for (const [frameSlug, rawBindings] of Object.entries(rawFrames)) {
    if (frameSlug.trim().length === 0) {
      throw new Error(`${path}: visual bindings frame slug must be a non-empty string`);
    }
    if (!Array.isArray(rawBindings)) {
      throw new Error(`${path}: visual bindings for frame "${frameSlug}" must be an array`);
    }

    const targets = new Set<string>();
    frames[frameSlug] = rawBindings.map((binding, index) => {
      const parsed = readBinding(binding, `${path}: visual binding ${frameSlug}[${index}]`);
      if (targets.has(parsed.target)) {
        throw new Error(`${path}: duplicate target "${parsed.target}" in frame "${frameSlug}"`);
      }
      targets.add(parsed.target);
      return parsed;
    });
  }

  return { version: 1, frames };
}

export function resolveRemotionBindings(
  spec: RemotionBindingSpec,
  plan: BuildPlan,
  fps = REMOTION_COMPOSITION_FPS,
): { runtimeBindings: RemotionBindingSpec["frames"]; manifest: VisualBindingManifest } {
  const frames = new Map(plan.frames.map((frame) => [frame.slug, frame]));
  const runtimeBindings: RemotionBindingSpec["frames"] = Object.create(null) as RemotionBindingSpec["frames"];
  const bindings: VisualBindingManifestV1["bindings"] = [];

  for (const [frameSlug, authoredBindings] of Object.entries(spec.frames)) {
    const frame = frames.get(frameSlug);
    if (!frame) throw new Error(`visual bindings reference unknown frame "${frameSlug}"`);

    const beats = new Map((frame.visualBeats ?? []).map((beat) => [beat.id, beat]));
    const targets = new Set<string>();
    runtimeBindings[frameSlug] = authoredBindings.map((authored) => {
      if (targets.has(authored.target)) {
        throw new Error(`visual bindings contain duplicate target "${authored.target}" in frame "${frameSlug}"`);
      }
      targets.add(authored.target);
      const beat = beats.get(authored.beat);
      if (!beat) {
        throw new Error(`visual bindings frame "${frameSlug}" references unknown beat "${authored.beat}"`);
      }
      const timing = quantizeVisualTiming(beat.start, authored.duration, fps);
      bindings.push({
        frameSlug,
        beatId: authored.beat,
        target: authored.target,
        revealStart: timing.revealStart,
        revealDuration: timing.revealDuration,
        source: "custom",
        authoredDuration: frame.voiceDur,
        outerDuration: frame.frameDur,
      });
      return { ...authored };
    });
  }

  return {
    runtimeBindings,
    manifest: {
      version: 1,
      framework: "remotion",
      bindings,
      frames: plan.frames
        .filter((frame) => frame.visualBeats?.length)
        .map((frame) => ({
          frameSlug: frame.slug,
          authoredDuration: frame.voiceDur,
          outerDuration: frame.frameDur,
        })),
    },
  };
}
