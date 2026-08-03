// verify.ts — the Remotion adapter's verifier. Remotion output (MP4) can't be byte-
// compared like HF HTML, so these are cheap structural checks: the composition id
// exists, build_plan.json is well-formed, and the fps math yields a positive frame
// count. The heavy render smoke (renderStill) is an opt-in command (npm run still),
// kept out of verify so Chromium never enters the fast test lane (design R5).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  AdapterVerifyContext,
  CaptionArtifactContext,
  Finding,
  VerifyOptions,
  VideoConfig,
  VisualBindingManifestV2,
  VisualBindingV2,
} from "../../engine/types.ts";
import { verifyVisualSync } from "../../engine/visual_sync.ts";
import { verifyEmittedVoiceSnapshots } from "../../engine/voice_assets.ts";

export const REMOTION_COMPOSITION_FPS = 30; // must match templates/src/Root.tsx FPS

type RuntimeVisualBindingV2 = {
  beatId: string;
  target: string;
  role: "focal" | "supporting";
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  enter: "fade" | "rise" | "slide-left" | "scale" | "none";
};

const ENTRANCES = new Set(["fade", "rise", "slide-left", "scale", "none"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function runtimeBindingKey(binding: Pick<RuntimeVisualBindingV2, "beatId" | "target">): string {
  return JSON.stringify([binding.beatId, binding.target]);
}

function parseRuntimeBinding(value: unknown, label: string): RuntimeVisualBindingV2 | string {
  if (!isRecord(value)) return `${label} must be an object`;
  const keys = ["beatId", "target", "role", "startFrame", "endFrame", "durationFrames", "enter"];
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) return `${label} has unknown field "${key}"`;
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) return `${label} is missing required field "${key}"`;
  }
  if (typeof value.beatId !== "string" || value.beatId.length === 0) return `${label}.beatId must be a non-empty string`;
  if (typeof value.target !== "string" || value.target.length === 0) return `${label}.target must be a non-empty string`;
  if (value.role !== "focal" && value.role !== "supporting") return `${label}.role must be focal or supporting`;
  for (const key of ["startFrame", "endFrame", "durationFrames"] as const) {
    if (typeof value[key] !== "number" || !Number.isInteger(value[key]) || value[key] < 0) {
      return `${label}.${key} must be a non-negative integer`;
    }
  }
  const startFrame = value.startFrame as number;
  const endFrame = value.endFrame as number;
  if (endFrame < startFrame) return `${label}.endFrame must be greater than or equal to startFrame`;
  if (typeof value.enter !== "string" || !ENTRANCES.has(value.enter)) return `${label}.enter must be a supported entrance token`;
  return value as RuntimeVisualBindingV2;
}

function verifyRuntimeBindingsAgainstManifest({
  manifest,
  runtimeBindings,
  fps,
  level,
}: {
  manifest: VisualBindingManifestV2;
  runtimeBindings: unknown;
  fps: number;
  level: Finding["level"];
}): Finding[] {
  const findings: Finding[] = [];
  const report = (msg: string, details?: Record<string, unknown>) => findings.push({
    level,
    code: "stale_visual_evidence",
    msg,
    details: { recovery: "md2vid build", ...details },
  });
  if (!isRecord(runtimeBindings)) {
    report("Remotion runtime visual bindings in build_plan.json must be an object");
    return findings;
  }

  const manifestByFrame = new Map<string, VisualBindingV2[]>();
  for (const binding of manifest.bindings) {
    const frameBindings = manifestByFrame.get(binding.frameSlug) ?? [];
    frameBindings.push(binding);
    manifestByFrame.set(binding.frameSlug, frameBindings);
  }

  const frameSlugs = new Set([...Object.keys(runtimeBindings), ...manifestByFrame.keys()]);
  for (const frameSlug of [...frameSlugs].sort()) {
    const rawFrameBindings = runtimeBindings[frameSlug];
    const expected = manifestByFrame.get(frameSlug) ?? [];
    if (!Array.isArray(rawFrameBindings)) {
      report(`Remotion runtime visual bindings for frame "${frameSlug}" must be an array`, { frameSlug });
      continue;
    }

    const actualByKey = new Map<string, RuntimeVisualBindingV2>();
    for (const [index, raw] of rawFrameBindings.entries()) {
      const parsed = parseRuntimeBinding(raw, `build_plan.json.visualBindings[${frameSlug}][${index}]`);
      if (typeof parsed === "string") {
        report(`Remotion runtime visual binding is malformed: ${parsed}`, { frameSlug, index });
        continue;
      }
      const key = runtimeBindingKey(parsed);
      if (actualByKey.has(key)) {
        report(`Remotion runtime visual binding is duplicated for frame "${frameSlug}" target "${parsed.target}" beat "${parsed.beatId}"`, { frameSlug, target: parsed.target, beatId: parsed.beatId });
        continue;
      }
      actualByKey.set(key, parsed);
    }

    const expectedKeys = new Set<string>();
    for (const binding of expected) {
      const key = runtimeBindingKey(binding);
      expectedKeys.add(key);
      const actual = actualByKey.get(key);
      if (!actual) {
        report(`Remotion runtime visual binding is missing for frame "${frameSlug}" target "${binding.target}" beat "${binding.beatId}"`, { frameSlug, target: binding.target, beatId: binding.beatId });
        continue;
      }
      const expectedStartFrame = Math.round(binding.coverageStart * fps);
      const expectedEndFrame = Math.round(binding.coverageEnd * fps);
      const expectedDurationFrames = Math.round(binding.revealDuration * fps);
      const expectedStatic = binding.source === "static";
      const mismatches: string[] = [];
      if (actual.role !== binding.role) mismatches.push(`role ${actual.role} !== ${binding.role}`);
      if (actual.startFrame !== expectedStartFrame) mismatches.push(`startFrame ${actual.startFrame} !== ${expectedStartFrame}`);
      if (actual.endFrame !== expectedEndFrame) mismatches.push(`endFrame ${actual.endFrame} !== ${expectedEndFrame}`);
      if (actual.durationFrames !== expectedDurationFrames) mismatches.push(`durationFrames ${actual.durationFrames} !== ${expectedDurationFrames}`);
      if (expectedStatic && actual.enter !== "none") mismatches.push(`enter ${actual.enter} !== none`);
      if (!expectedStatic && actual.enter === "none") mismatches.push("enter none contradicts custom manifest source");
      if (mismatches.length > 0) {
        report(`Remotion runtime visual binding for frame "${frameSlug}" target "${actual.target}" beat "${actual.beatId}" does not match manifest: ${mismatches.join(", ")}`, {
          frameSlug,
          target: actual.target,
          beatId: actual.beatId,
        });
      }
    }

    for (const actual of actualByKey.values()) {
      if (!expectedKeys.has(runtimeBindingKey(actual))) {
        report(`Remotion runtime visual binding is extra for frame "${frameSlug}" target "${actual.target}" beat "${actual.beatId}"`, { frameSlug, target: actual.target, beatId: actual.beatId });
      }
    }
  }
  return findings;
}

export function verifyRemotionCaptionArtifact(
  context: CaptionArtifactContext,
): Finding[] {
  const findings: Finding[] = [];
  const problem = (msg: string) => findings.push({ level: "error" as const, msg });
  const planPath = join(context.outputDir, "build_plan.json");
  if (!existsSync(planPath)) {
    problem(`missing staged build_plan.json: ${planPath}`);
    return findings;
  }

  let groups: unknown;
  try {
    groups = (JSON.parse(readFileSync(context.captionGroupsPath, "utf8")) as { groups?: unknown }).groups;
  } catch (error) {
    problem(`staged caption_groups.json is not valid JSON: ${(error as Error).message}`);
    return findings;
  }
  if (!Array.isArray(groups)) {
    problem("staged caption_groups.json groups must be an array");
    return findings;
  }

  let captionGroups: unknown;
  try {
    captionGroups = (JSON.parse(readFileSync(planPath, "utf8")) as { captionGroups?: unknown }).captionGroups;
  } catch (error) {
    problem(`staged build_plan.json is not valid JSON: ${(error as Error).message}`);
    return findings;
  }
  if (!Array.isArray(captionGroups)) {
    problem("staged build_plan.json captionGroups must be an array");
  } else if (JSON.stringify(captionGroups) !== JSON.stringify(groups)) {
    problem("caption_groups.json and staged build_plan.json captionGroups differ in content");
  }
  return findings;
}

export function verify(context: AdapterVerifyContext): Finding[];
export function verify(videoDir: string, sharedDir?: string, options?: VerifyOptions): Finding[];
export function verify(
  contextOrVideoDir: AdapterVerifyContext | string,
  sharedDir?: string,
  options: VerifyOptions = {},
): Finding[] {
  const context = typeof contextOrVideoDir === "string" ? undefined : contextOrVideoDir;
  const videoDir = typeof contextOrVideoDir === "string" ? contextOrVideoDir : contextOrVideoDir.videoDir;
  const effectiveSharedDir = context?.sharedDir ?? sharedDir ?? videoDir;
  const voiceSnapshots = context?.voiceSnapshots ?? options.voiceSnapshots;
  const findings: Finding[] = [];
  const problem = (msg: string) => findings.push({ level: "error", msg });
  const warn = (msg: string) => findings.push({ level: "warn", msg });

  const root = join(videoDir, "src", "Root.tsx");
  if (!existsSync(root)) {
    problem(`missing src/Root.tsx — ${root}`);
  } else if (!readFileSync(root, "utf8").includes('id="video"')) {
    problem('src/Root.tsx has no composition id="video" — render.ts selects that id');
  }

  const planPath = join(videoDir, "build_plan.json");
  if (!existsSync(planPath)) {
    problem(`missing build_plan.json — run md2vid build <dir> on this output first (${planPath})`);
    return findings;
  }

  let plan: {
    totalDuration?: number;
    canvas?: { width?: number; height?: number };
    frames?: unknown[];
    visualBindings?: unknown;
  };
  try {
    plan = JSON.parse(readFileSync(planPath, "utf8"));
  } catch (e) {
    problem(`build_plan.json is not valid JSON: ${String(e)}`);
    return findings;
  }

  if (typeof plan.totalDuration !== "number" || plan.totalDuration <= 0) {
    problem(`build_plan.json totalDuration must be a positive number (got ${plan.totalDuration})`);
  } else if (Math.ceil(plan.totalDuration * REMOTION_COMPOSITION_FPS) < 1) {
    problem("fps math yields < 1 frame — durationInFrames would be empty");
  }
  if (!plan.canvas?.width || !plan.canvas?.height) {
    problem("build_plan.json canvas.width/height missing — composition can't size itself");
  }
  if (!Array.isArray(plan.frames) || plan.frames.length === 0) {
    warn("build_plan.json has no frames — the video will be empty");
  }

  const captionGroupsPath = join(effectiveSharedDir, "caption_groups.json");
  if (existsSync(captionGroupsPath)) {
    findings.push(
      ...verifyRemotionCaptionArtifact({
        sharedDir: effectiveSharedDir,
        outputDir: videoDir,
        captionGroupsPath,
      }),
    );
  }
  if (voiceSnapshots) {
    findings.push(...verifyEmittedVoiceSnapshots(join(videoDir, "public"), voiceSnapshots));
  }
  if (context && context.policy.coverageMode !== "off") {
    const requiresRuntimeBindings = context.bindings?.version === 2
      && context.plan.frames.some((frame) =>
        frame.visualSpecVersion === 2 && frame.words.length > 0,
      );
    if (requiresRuntimeBindings && plan.visualBindings === undefined) {
      findings.push({
        level: context.policy.coverageMode === "required" ? "error" : "warn",
        code: "missing_visual_coverage_evidence",
        msg: "missing Remotion semantic runtime bindings in build_plan.json; run md2vid build to regenerate semantic visual evidence",
        details: { recovery: "md2vid build" },
      });
    } else if (requiresRuntimeBindings && context.bindings?.version === 2) {
      findings.push(...verifyRuntimeBindingsAgainstManifest({
        manifest: context.bindings,
        runtimeBindings: plan.visualBindings,
        fps: context.fps ?? REMOTION_COMPOSITION_FPS,
        level: context.policy.coverageMode === "required" ? "error" : "warn",
      }));
    }
  }
  if (context && (context.policy.mode !== "off" || context.policy.coverageMode !== "off")) {
    findings.push(...verifyVisualSync({
      plan: context.plan,
      manifest: context.bindings,
      policy: context.policy,
      fps: context.fps,
      freshness: context.freshness,
    }));
  }

  return findings;
}

export function resolveVerificationFps(_config: VideoConfig, _videoDir: string): number {
  return REMOTION_COMPOSITION_FPS;
}
