import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readAudioMeta } from "../engine/audio_meta.ts";
import { loadConfigFiles } from "../engine/config.ts";
import { plan, resolveVisualSyncPolicy } from "../engine/plan.ts";
import type { BuildPlan, VideoConfig, VoiceAssetSnapshot } from "../engine/types.ts";
import {
  captureVoiceWavSnapshots,
  validateAudioMetaVoiceSnapshots,
} from "../engine/voice_assets.ts";
import { readVisualBeatSpec } from "../engine/visual_beats.ts";
import { resolveProjectLayout, type ProjectLayout } from "./project_layout.ts";
import type { ManagedFile } from "./managed_file_transaction.ts";

export interface ProjectPlanResult {
  layout: ProjectLayout;
  neutralConfig: VideoConfig;
  adapterConfig: VideoConfig;
  plan: BuildPlan;
  voiceSnapshots: VoiceAssetSnapshot[];
  warnings: string[];
}

export interface SerializedNeutralArtifacts {
  cues: string;
  captionGroups: string;
  buildPlan: string;
  visualTiming: string;
}

export function createProjectPlan(outputDir: string): ProjectPlanResult {
  const layout = resolveProjectLayout(outputDir);
  const metaPath = join(layout.sharedDir, "audio_meta.json");
  const meta = readAudioMeta(metaPath);
  const voiceSnapshots = validateAudioMetaVoiceSnapshots(
    meta,
    captureVoiceWavSnapshots(layout.sharedDir, meta.voices.map((voice) => voice.path)),
    metaPath,
  );
  const loaded = loadConfigFiles(layout.sharedDir, layout.outputDir);
  const policy = resolveVisualSyncPolicy(loaded.neutral);
  const visualBeatsPath = join(layout.sharedDir, "visual_beats.json");
  const visualSpec = policy.mode === "off" || !existsSync(visualBeatsPath)
    ? undefined
    : readVisualBeatSpec(visualBeatsPath);
  if (policy.mode === "required" && visualSpec === undefined) {
    throw new Error(`${visualBeatsPath}: required by visualSync.mode=required`);
  }

  return {
    layout,
    neutralConfig: loaded.neutral,
    adapterConfig: loaded.config,
    plan: plan(meta, loaded.neutral, visualSpec),
    voiceSnapshots,
    warnings: policy.mode === "warn" && visualSpec === undefined
      ? [`${visualBeatsPath}: no visual beat specification; semantic checks are skipped`]
      : [],
  };
}

export function serializeNeutralArtifacts(plan: BuildPlan): SerializedNeutralArtifacts {
  const cues = plan.frames.map((frame) => ({
    frame: frame.frameNum,
    slug: frame.slug,
    start: frame.start,
    voiceDur: frame.voiceDur,
    frameDur: frame.frameDur,
    words: frame.words.map((word) => ({ text: word.text, start: word.start, end: word.end })),
    ...(frame.visualKind === undefined ? {} : { visualKind: frame.visualKind }),
    ...(frame.visualBeats === undefined ? {} : { visualBeats: frame.visualBeats }),
  }));
  const visualFrames = Object.fromEntries(
    plan.frames.flatMap((frame) => frame.visualBeats === undefined ? [] : [[frame.slug, {
      duration: frame.voiceDur,
      ...(frame.visualKind === undefined ? {} : { kind: frame.visualKind }),
      beats: frame.visualBeats.map(({ id, start, workflowStep }) => ({
        id,
        start,
        ...(workflowStep === undefined ? {} : { workflowStep }),
      })),
    }]]),
  );

  return {
    cues: `${JSON.stringify(cues, null, 2)}\n`,
    captionGroups: `${JSON.stringify({
      total_duration_s: +plan.totalDuration.toFixed(3),
      width: plan.canvas.width,
      height: plan.canvas.height,
      groups: plan.captionGroups,
    }, null, 2)}\n`,
    buildPlan: `${JSON.stringify(plan, null, 2)}\n`,
    visualTiming: `${JSON.stringify({ version: 1, frames: visualFrames }, null, 2)}\n`,
  };
}

export function stageNeutralArtifacts(planResult: BuildPlan, stagingRoot: string): ManagedFile[] {
  const artifacts = serializeNeutralArtifacts(planResult);
  const files: Array<[string, string]> = [
    ["cues.json", artifacts.cues],
    ["caption_groups.json", artifacts.captionGroups],
    ["build/build_plan.json", artifacts.buildPlan],
    ["build/visual_timing.json", artifacts.visualTiming],
  ];
  for (const [relativePath, contents] of files) {
    const staged = join(stagingRoot, relativePath);
    mkdirSync(dirname(staged), { recursive: true });
    writeFileSync(staged, contents);
  }
  return files.map(([target]) => ({ target, staged: join(stagingRoot, target) }));
}
