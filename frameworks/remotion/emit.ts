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
  collectRemotionVisualBindingInputs,
  emptyRemotionBindingManifest,
  readRemotionBindingSpec,
  resolveRemotionBindings,
  type RemotionBindingSpec,
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

function hasVisualStates(plan: BuildPlan): boolean {
  return plan.frames.some((frame) => frame.visualBeats?.length);
}

function resolveBindingSpecForPlan(
  plan: BuildPlan,
  outputDir: string,
  config: VideoConfig,
): RemotionBindingSpec | undefined {
  const policy = resolveVisualSyncPolicy(config);
  const visualBindingEnabled = policy.mode !== "off" || policy.coverageMode !== "off";
  const hasBeats = hasVisualStates(plan);
  const bindingSpecPath = join(outputDir, "visual_bindings.json");
  if (!visualBindingEnabled || !hasBeats) return undefined;
  if (!existsSync(bindingSpecPath)) {
    if (policy.mode === "required" || policy.coverageMode === "required") {
      throw new Error(`${bindingSpecPath}: required visual_bindings.json is missing for planned visual beats`);
    }
    return undefined;
  }
  return readRemotionBindingSpec(bindingSpecPath);
}

function prepareRemotionBindings(
  plan: BuildPlan,
  outputDir: string,
  config: VideoConfig,
  { ensureRuntimeBeforeDigest = false }: { ensureRuntimeBeforeDigest?: boolean } = {},
) {
  const bindingSpec = resolveBindingSpecForPlan(plan, outputDir, config);
  if (!bindingSpec) {
    return {
      bindingSpec,
      resolvedBindings: { runtimeBindings: undefined, manifest: emptyRemotionBindingManifest() },
    };
  }
  if (bindingSpec.version === 2 && ensureRuntimeBeforeDigest) {
    collectRemotionVisualBindingInputs(outputDir);
    resolveRemotionBindings(bindingSpec, plan, undefined, []);
    ensureRuntime(outputDir, "remotion");
  }
  const authoredInputs = bindingSpec.version === 2
    ? collectRemotionVisualBindingInputs(outputDir)
    : [];
  return {
    bindingSpec,
    resolvedBindings: resolveRemotionBindings(bindingSpec, plan, undefined, authoredInputs),
  };
}

export function preflight(
  plan: BuildPlan,
  sharedDir: string,
  outputDir: string,
  config: VideoConfig,
  { captionsOnly = false, runtimeSourceDir, assetSourceDir, voiceSnapshots }: EmitOptions = {},
): FrameworkPreparation {
  if (captionsOnly) return {};
  const voicePaths = collectVoicePaths(plan.frames);
  const capturedVoiceSnapshots = voiceSnapshots
    ? [...voiceSnapshots]
    : captureVoiceWavSnapshots(assetSourceDir ?? sharedDir, voicePaths);
  validateVoiceAssets(join(runtimeSourceDir ?? outputDir, "public"), voicePaths, { allowMissing: true });
  const { resolvedBindings } = prepareRemotionBindings(
    plan,
    runtimeSourceDir ?? outputDir,
    config,
    { ensureRuntimeBeforeDigest: true },
  );
  return {
    voiceSnapshots: capturedVoiceSnapshots,
    bindingManifest: resolvedBindings.manifest,
  };
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
    if (existingOutputPlan === undefined) {
      throw new Error("Remotion captions-only build requires an existing full-build build_plan.json; run md2vid build to regenerate semantic runtime evidence");
    }
    const hasSemanticStates = existingOutputPlan.frames.some((frame) => frame.visualBeats?.length);
    if (hasSemanticStates && existingOutputPlan.visualBindings === undefined) {
      throw new Error("Remotion captions-only build cannot preserve semantic runtime bindings from an incomplete build_plan.json; run md2vid build to regenerate semantic runtime evidence");
    }
    const captionsOnlyPlan: EmittedRemotionPlan = { ...existingOutputPlan, captionGroups: groups };
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

  const preparedBindings = preparation.bindingManifest
    ? undefined
    : prepareRemotionBindings(plan, runtimeSourceDir ?? outputDir, _config);
  const bindingSpec = preparedBindings?.bindingSpec
    ?? resolveBindingSpecForPlan(plan, runtimeSourceDir ?? outputDir, _config);
  const resolvedBindings = preparedBindings?.resolvedBindings
    ?? (bindingSpec
      ? resolveRemotionBindings(
          bindingSpec,
          plan,
          undefined,
          bindingSpec.version === 2 ? collectRemotionVisualBindingInputs(runtimeSourceDir ?? outputDir) : [],
        )
      : { runtimeBindings: undefined, manifest: emptyRemotionBindingManifest() });
  if (preparation.bindingManifest) {
    resolvedBindings.manifest = preparation.bindingManifest;
  }

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
