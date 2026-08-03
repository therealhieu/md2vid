import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import type {
  AuthoredVisualInput,
  BuildPlan,
  ResolvedVisualBeat,
  ResolvedVisualStateV2,
  VisualBindingManifest,
  VisualBindingManifestV1,
  VisualBindingManifestV2,
} from "../../engine/types.ts";
import { digestAuthoredInputs, hashCoveragePlan } from "../../engine/visual_evidence.ts";
import { REMOTION_COMPOSITION_FPS } from "./verify.ts";
import { quantizeBoundary, quantizeDuration, quantizeVisualTiming } from "./timing.ts";

export type RemotionEntrance = "fade" | "rise" | "slide-left" | "scale" | "none";

export interface AuthoredRemotionBindingV1 {
  beat: string;
  target: string;
  enter: RemotionEntrance;
  duration: number;
}

export interface AuthoredRemotionBindingV2 {
  beat: string;
  target: string;
  enter: RemotionEntrance;
  duration?: number;
  coverage: "planned";
}

export interface RuntimeRemotionBindingV2 {
  beatId: string;
  target: string;
  role: "focal" | "supporting";
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  enter: RemotionEntrance;
}

export interface RemotionBindingSpecV1 {
  version: 1;
  frames: Record<string, AuthoredRemotionBindingV1[]>;
}

export interface RemotionBindingSpecV2 {
  version: 2;
  frames: Record<string, AuthoredRemotionBindingV2[]>;
}

export type RemotionBindingSpec = RemotionBindingSpecV1 | RemotionBindingSpecV2;
export type RemotionRuntimeBinding = AuthoredRemotionBindingV1 | RuntimeRemotionBindingV2;
export type RemotionRuntimeBindings = Record<string, RemotionRuntimeBinding[]>;

const ENTRANCES = new Set<RemotionEntrance>(["fade", "rise", "slide-left", "scale", "none"]);
const V1_BINDING_FIELDS = ["beat", "target", "enter", "duration"] as const;
const V2_BINDING_FIELDS = ["beat", "target", "enter", "duration", "coverage"] as const;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const EXCLUDED_SOURCE_DIRS = new Set(["node_modules", "build", "dist"]);
const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

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

function readEntrance(value: unknown, label: string): RemotionEntrance {
  if (typeof value !== "string" || !ENTRANCES.has(value as RemotionEntrance)) {
    throw new Error(`${label} must be a supported entrance token`);
  }
  return value as RemotionEntrance;
}

function readDuration(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
  return value;
}

function readV1Binding(value: unknown, label: string): AuthoredRemotionBindingV1 {
  const binding = asRecord(value, label);
  assertOnlyKeys(binding, V1_BINDING_FIELDS, label);
  return {
    beat: nonBlankString(readOwn(binding, "beat", label), `${label}.beat`),
    target: nonBlankString(readOwn(binding, "target", label), `${label}.target`),
    enter: readEntrance(readOwn(binding, "enter", label), `${label}.enter`),
    duration: readDuration(readOwn(binding, "duration", label), `${label}.duration`),
  };
}

function readV2Binding(value: unknown, label: string): AuthoredRemotionBindingV2 {
  const binding = asRecord(value, label);
  assertOnlyKeys(binding, V2_BINDING_FIELDS, label);
  const coverage = readOwn(binding, "coverage", label);
  if (coverage !== "planned") {
    throw new Error(`${label}.coverage must be "planned"`);
  }
  return {
    beat: nonBlankString(readOwn(binding, "beat", label), `${label}.beat`),
    target: nonBlankString(readOwn(binding, "target", label), `${label}.target`),
    enter: readEntrance(readOwn(binding, "enter", label), `${label}.enter`),
    ...(hasOwn(binding, "duration")
      ? { duration: readDuration(binding.duration, `${label}.duration`) }
      : {}),
    coverage,
  };
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
  const version = readOwn(spec, "version", `${path}: visual bindings`);
  if (version !== 1 && version !== 2) {
    throw new Error(`${path}: visual bindings version must be 1 or 2`);
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
      const label = `${path}: visual binding ${frameSlug}[${index}]`;
      const parsed = version === 1 ? readV1Binding(binding, label) : readV2Binding(binding, label);
      if (targets.has(parsed.target)) {
        throw new Error(`${path}: duplicate target "${parsed.target}" in frame "${frameSlug}"`);
      }
      targets.add(parsed.target);
      return parsed;
    }) as RemotionBindingSpec["frames"][string];
  }

  return version === 1
    ? { version, frames: frames as RemotionBindingSpecV1["frames"] }
    : { version, frames: frames as RemotionBindingSpecV2["frames"] };
}

function requirePlannedBeat(
  frameSlug: string,
  binding: AuthoredRemotionBindingV1 | AuthoredRemotionBindingV2,
  beats: Map<string, ResolvedVisualBeat>,
): ResolvedVisualBeat {
  const beat = beats.get(binding.beat);
  if (!beat) {
    throw new Error(`visual bindings frame "${frameSlug}" references unknown beat "${binding.beat}"`);
  }
  return beat;
}

function requirePlannedState(
  frameSlug: string,
  binding: AuthoredRemotionBindingV2,
  beats: Map<string, ResolvedVisualBeat>,
): ResolvedVisualStateV2 {
  const state = requirePlannedBeat(frameSlug, binding, beats);
  if (state.version !== 2) {
    throw new Error(
      `visual bindings frame "${frameSlug}" target "${binding.target}" requires a visual-beats v2 state`,
    );
  }
  return state;
}

function resolveV1Bindings(
  spec: RemotionBindingSpecV1,
  plan: BuildPlan,
  fps: number,
): { runtimeBindings: RemotionRuntimeBindings; manifest: VisualBindingManifestV1 } {
  const frames = new Map(plan.frames.map((frame) => [frame.slug, frame]));
  const runtimeBindings: RemotionRuntimeBindings = Object.create(null) as RemotionRuntimeBindings;
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
      requirePlannedBeat(frameSlug, authored, beats);
      const timing = quantizeVisualTiming(authored.beat === undefined ? 0 : beats.get(authored.beat)!.start, authored.duration, fps);
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

function quantizedStateBoundaries(
  frameSlug: string,
  states: readonly ResolvedVisualStateV2[],
  fps: number,
): Map<number, ReturnType<typeof quantizeBoundary>> {
  const boundaries = new Map<number, ReturnType<typeof quantizeBoundary>>();
  for (const state of states) {
    if (state.end < state.start) {
      throw new Error(`${frameSlug}:${state.id} has invalid coverage interval ${state.start}-${state.end}`);
    }
    if (!boundaries.has(state.start)) boundaries.set(state.start, quantizeBoundary(state.start, fps));
    if (!boundaries.has(state.end)) boundaries.set(state.end, quantizeBoundary(state.end, fps));
  }
  return boundaries;
}

function resolveV2Bindings(
  spec: RemotionBindingSpecV2,
  plan: BuildPlan,
  fps: number,
  authoredInputs: readonly AuthoredVisualInput[] = [],
): { runtimeBindings: RemotionRuntimeBindings; manifest: VisualBindingManifestV2 } {
  const frames = new Map(plan.frames.map((frame) => [frame.slug, frame]));
  const runtimeBindings: RemotionRuntimeBindings = Object.create(null) as RemotionRuntimeBindings;
  const bindings: VisualBindingManifestV2["bindings"] = [];

  for (const [frameSlug, authoredBindings] of Object.entries(spec.frames)) {
    const frame = frames.get(frameSlug);
    if (!frame) throw new Error(`visual bindings reference unknown frame "${frameSlug}"`);

    const visualBeats = frame.visualBeats ?? [];
    const beats = new Map(visualBeats.map((beat) => [beat.id, beat]));
    const boundaries = quantizedStateBoundaries(
      frame.slug,
      visualBeats.filter((beat): beat is ResolvedVisualStateV2 => beat.version === 2),
      fps,
    );
    const targets = new Set<string>();
    runtimeBindings[frameSlug] = authoredBindings.map((authored) => {
      if (targets.has(authored.target)) {
        throw new Error(`visual bindings contain duplicate target "${authored.target}" in frame "${frameSlug}"`);
      }
      targets.add(authored.target);
      const state = requirePlannedState(frameSlug, authored, beats);
      const start = boundaries.get(state.start)!;
      const end = boundaries.get(state.end)!;
      if (end.frame < start.frame) {
        throw new Error(
          `${frame.slug}:${state.id} quantizes to inverted coverage ${start.frame}-${end.frame}`,
        );
      }
      const duration = authored.duration ?? 0;
      const revealDuration = quantizeDuration(duration, fps, { allowZero: authored.enter === "none" });
      const runtimeBinding: RuntimeRemotionBindingV2 = {
        beatId: state.id,
        target: authored.target,
        role: state.role,
        startFrame: start.frame,
        endFrame: end.frame,
        durationFrames: revealDuration.frames,
        enter: authored.enter,
      };
      bindings.push({
        frameSlug: frame.slug,
        beatId: state.id,
        target: authored.target,
        role: state.role,
        revealStart: start.seconds,
        revealDuration: revealDuration.seconds,
        coverageStart: start.seconds,
        coverageEnd: end.seconds,
        source: authored.enter === "none" ? "static" : "custom",
        authoredDuration: frame.voiceDur,
        outerDuration: frame.frameDur,
      });
      return runtimeBinding;
    });
  }

  return {
    runtimeBindings,
    manifest: {
      version: 2,
      framework: "remotion",
      planSha256: hashCoveragePlan(plan),
      authoredInputs: digestAuthoredInputs(authoredInputs),
      bindings,
      frames: plan.frames
        .filter((frame) => frame.visualSpecVersion === 2 || frame.visualBeats?.length)
        .map((frame) => ({
          frameSlug: frame.slug,
          authoredDuration: frame.voiceDur,
          outerDuration: frame.frameDur,
        })),
    },
  };
}

export function resolveRemotionBindings(
  spec: RemotionBindingSpec,
  plan: BuildPlan,
  fps = REMOTION_COMPOSITION_FPS,
  authoredInputs: readonly AuthoredVisualInput[] = [],
): { runtimeBindings: RemotionRuntimeBindings; manifest: VisualBindingManifest } {
  return spec.version === 1
    ? resolveV1Bindings(spec, plan, fps)
    : resolveV2Bindings(spec, plan, fps, authoredInputs);
}

function assertRegularAuthoredInput(videoDir: string, path: string): boolean {
  const absolutePath = join(videoDir, ...path.split("/"));
  if (!existsSync(absolutePath)) return false;
  const stat = lstatSync(absolutePath);
  if (stat.isSymbolicLink()) {
    throw new Error(
      `authored visual input ${path} contains a symlink; replace it with a regular project file and run md2vid build`,
    );
  }
  return stat.isFile();
}

function collectRemotionSourcePaths(videoDir: string, relative = "src"): string[] {
  const directory = join(videoDir, ...relative.split("/"));
  if (!existsSync(directory)) return [];
  const directoryStat = lstatSync(directory);
  if (directoryStat.isSymbolicLink()) {
    throw new Error(
      `authored visual input ${relative} contains a symlink; replace it with a regular project file and run md2vid build`,
    );
  }
  if (!directoryStat.isDirectory()) return [];

  const paths: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = `${relative}/${entry.name}`;
    const absolutePath = join(videoDir, ...path.split("/"));
    const stat = lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `authored visual input ${path} contains a symlink; replace it with a regular project file and run md2vid build`,
      );
    }
    if (stat.isDirectory()) {
      if (EXCLUDED_SOURCE_DIRS.has(entry.name)) continue;
      paths.push(...collectRemotionSourcePaths(videoDir, path));
    } else if (stat.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      paths.push(path);
    }
  }
  return paths;
}

export function collectRemotionVisualBindingInputs(videoDir: string): AuthoredVisualInput[] {
  return ["visual_bindings.json", ...collectRemotionSourcePaths(videoDir)]
    .filter((path) => assertRegularAuthoredInput(videoDir, path))
    .sort()
    .map((path) => ({
      path,
      bytes: readFileSync(join(videoDir, ...path.split("/"))),
    }));
}
