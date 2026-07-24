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

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BuildPlan, CaptionGroup, EmitOptions, VideoConfig } from "../../engine/types.ts";
import { collectVoicePaths, stageVoiceAssets } from "../assets.ts";
import { ensureRuntime } from "./scaffold.ts";

export function emit(
  plan: BuildPlan, sharedDir: string, outputDir: string,
  _config: VideoConfig, { captionsOnly = false }: EmitOptions = {}
): void {
  // Re-read the regrouped caption groups off disk (the source of truth, post-regroup).
  const groupsPath = join(sharedDir, "caption_groups.json");
  const groups: CaptionGroup[] = existsSync(groupsPath)
    ? JSON.parse(readFileSync(groupsPath, "utf8")).groups
    : plan.captionGroups;

  if (!captionsOnly) {
    // Fill only missing runtime files. Authored src files are preserved.
    ensureRuntime(outputDir, "remotion");
    stageVoiceAssets({
      framework: "remotion",
      voicePaths: collectVoicePaths(plan.frames),
      sourceRoot: sharedDir,
      destinationRoot: join(outputDir, "public"),
    });
  }

  // Publish the plan only after a full emit has staged every required voice asset.
  const inputPlan: BuildPlan = { ...plan, captionGroups: groups };
  writeFileSync(join(outputDir, "build_plan.json"), JSON.stringify(inputPlan, null, 2) + "\n");
}
