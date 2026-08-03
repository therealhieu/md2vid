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
} from "../../engine/types.ts";
import { verifyVisualSync } from "../../engine/visual_sync.ts";
import { verifyEmittedVoiceSnapshots } from "../../engine/voice_assets.ts";

export const REMOTION_COMPOSITION_FPS = 30; // must match templates/src/Root.tsx FPS

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
