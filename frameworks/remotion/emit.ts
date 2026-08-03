// emit.ts — the Remotion adapter's emitter. Consumes the neutral build plan and
// writes the Remotion project's inputProps source (build_plan.json) + staged voice
// assets into the output dir. The composition subtree (.tsx) is written by scaffold();
// emit lazily scaffolds it on first run so `npm run build` alone produces a runnable
// project. Mirrors the HF emit contract: emit(plan, sharedDir, outputDir, config, opts).
//
// GROUPS SOURCE IS LOAD-BEARING (mirrors HF): the regrouped caption_groups.json on
// disk is the source of truth for captions, NOT plan.captionGroups (pre-regroup). We
// write the regrouped groups back into the plan we serialize so the composition's
// karaoke timeline matches the regrouped lines.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  BuildPlan,
  CaptionGroup,
  EmitOptions,
  FrameworkPreparation,
  VideoConfig,
} from "../../engine/types.ts";
import {
  captureVoiceWavSnapshots,
  validateVoiceAssets,
} from "../../engine/voice_assets.ts";
import { resolveVisualSyncPolicy } from "../../engine/plan.ts";
import { collectVoicePaths, stageVoiceAssets } from "../assets.ts";
import { ensureRuntime } from "./scaffold.ts";
import {
  emptyRemotionBindingManifest,
  readRemotionBindingSpec,
  resolveRemotionBindings,
} from "./visual_bindings.ts";

type EmittedRemotionPlan = BuildPlan & { visualBindings?: Record<string, unknown> };

function readExistingOutputPlan(outputDir: string): EmittedRemotionPlan | undefined {
  const path = join(outputDir, "build_plan.json");
  if (!existsSync(path)) return undefined;
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: expected a generated build plan object`);
  }
  return value as EmittedRemotionPlan;
}

export function preflight(
  plan: BuildPlan,
  sharedDir: string,
  outputDir: string,
  _config: VideoConfig,
  { captionsOnly = false, runtimeSourceDir, assetSourceDir, voiceSnapshots }: EmitOptions = {},
): FrameworkPreparation {
  if (captionsOnly) return {};
  const voicePaths = collectVoicePaths(plan.frames);
  const capturedVoiceSnapshots = voiceSnapshots
    ? [...voiceSnapshots]
    : captureVoiceWavSnapshots(assetSourceDir ?? sharedDir, voicePaths);
  validateVoiceAssets(join(runtimeSourceDir ?? outputDir, "public"), voicePaths, { allowMissing: true });
  return { voiceSnapshots: capturedVoiceSnapshots };
}

export function emit(
  plan: BuildPlan, sharedDir: string, outputDir: string,
  _config: VideoConfig, options: EmitOptions = {}
): void {
  const { captionsOnly = false, runtimeSourceDir, assetSourceDir, voiceSnapshots, prepared } = options;
  const preparation = prepared ?? preflight(plan, sharedDir, outputDir, _config, {
    captionsOnly,
    runtimeSourceDir,
    assetSourceDir,
    voiceSnapshots,
  });
  // Re-read the regrouped caption groups off disk (the source of truth, post-regroup).
  const groupsPath = join(sharedDir, "caption_groups.json");
  const groups: CaptionGroup[] = existsSync(groupsPath)
    ? JSON.parse(readFileSync(groupsPath, "utf8")).groups
    : plan.captionGroups;

  if (captionsOnly) {
    const existingOutputPlan = readExistingOutputPlan(runtimeSourceDir ?? outputDir);
    const captionsOnlyPlan: EmittedRemotionPlan = existingOutputPlan === undefined
      ? { ...plan, captionGroups: groups }
      : { ...existingOutputPlan, captionGroups: groups };
    writeFileSync(join(outputDir, "build_plan.json"), `${JSON.stringify(captionsOnlyPlan, null, 2)}\n`);
    return;
  }

  if (!captionsOnly) {
    // Fill only missing runtime files. Authored src files are preserved.
    ensureRuntime(outputDir, "remotion");
    stageVoiceAssets({
      framework: "remotion",
      voicePaths: collectVoicePaths(plan.frames),
      sourceRoot: assetSourceDir ?? sharedDir,
      destinationRoot: join(outputDir, "public"),
      voiceSnapshots: preparation.voiceSnapshots ?? voiceSnapshots,
    });
  }

  const policy = resolveVisualSyncPolicy(_config);
  const hasVisualBeats = plan.frames.some((frame) => frame.visualBeats?.length);
  const bindingSpecPath = join(runtimeSourceDir ?? outputDir, "visual_bindings.json");
  const bindingSpec = policy.mode !== "off" && hasVisualBeats && existsSync(bindingSpecPath)
    ? readRemotionBindingSpec(bindingSpecPath)
    : undefined;
  if (!bindingSpec && hasVisualBeats && policy.mode === "required") {
    throw new Error(`${bindingSpecPath}: required visual_bindings.json is missing for planned visual beats`);
  }
  const resolvedBindings = policy.mode === "off"
    ? { runtimeBindings: undefined, manifest: emptyRemotionBindingManifest() }
    : resolveRemotionBindings(bindingSpec ?? { version: 1, frames: Object.create(null) }, plan);

  // Publish the full neutral plan only after a full emit has staged every required
  // voice asset. Replacing caption groups must retain additive visual timing fields.
  const inputPlan: BuildPlan & { visualBindings?: typeof resolvedBindings.runtimeBindings } = {
    ...plan,
    captionGroups: groups,
    ...(bindingSpec ? { visualBindings: resolvedBindings.runtimeBindings } : {}),
  };
  writeFileSync(join(outputDir, "build_plan.json"), JSON.stringify(inputPlan, null, 2) + "\n");
  const bindingManifestPath = join(outputDir, "build", "visual_bindings.json");
  mkdirSync(join(outputDir, "build"), { recursive: true });
  writeFileSync(bindingManifestPath, JSON.stringify(resolvedBindings.manifest, null, 2) + "\n");
}
