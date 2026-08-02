import { readFileSync } from "node:fs";
import type { BuildPlan, VisualBindingManifest } from "../../engine/types.ts";

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

type Binding = RemotionBindingSpec["frames"][string][number];

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readBinding(value: unknown, label: string): Binding {
  const binding = asRecord(value, label);
  if (typeof binding.beat !== "string" || binding.beat.length === 0) {
    throw new Error(`${label}.beat must be a non-empty string`);
  }
  if (typeof binding.target !== "string" || binding.target.length === 0) {
    throw new Error(`${label}.target must be a non-empty string`);
  }
  if (typeof binding.enter !== "string" || !ENTRANCES.has(binding.enter as RemotionEntrance)) {
    throw new Error(`${label}.enter must be a supported entrance token`);
  }
  if (typeof binding.duration !== "number" || !Number.isFinite(binding.duration) || binding.duration < 0) {
    throw new Error(`${label}.duration must be a finite non-negative number`);
  }
  return {
    beat: binding.beat,
    target: binding.target,
    enter: binding.enter as RemotionEntrance,
    duration: binding.duration,
  };
}

export function readRemotionBindingSpec(path: string): RemotionBindingSpec {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error: unknown) {
    throw new Error(`${path}: visual bindings must be valid JSON: ${(error as Error).message}`);
  }

  const spec = asRecord(value, `${path}: visual bindings`);
  if (spec.version !== 1) throw new Error(`${path}: visual bindings version must be 1`);
  const rawFrames = asRecord(spec.frames, `${path}: visual bindings frames`);
  const frames: RemotionBindingSpec["frames"] = {};

  for (const [frameSlug, rawBindings] of Object.entries(rawFrames)) {
    if (frameSlug.length === 0) throw new Error(`${path}: visual bindings frame slug must be non-empty`);
    if (!Array.isArray(rawBindings)) throw new Error(`${path}: visual bindings for frame "${frameSlug}" must be an array`);

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
): { runtimeBindings: RemotionBindingSpec["frames"]; manifest: VisualBindingManifest } {
  const frames = new Map(plan.frames.map((frame) => [frame.slug, frame]));
  const runtimeBindings: RemotionBindingSpec["frames"] = {};
  const bindings: VisualBindingManifest["bindings"] = [];

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
      bindings.push({
        frameSlug,
        beatId: authored.beat,
        target: authored.target,
        revealStart: beat.start,
        revealDuration: authored.duration,
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
