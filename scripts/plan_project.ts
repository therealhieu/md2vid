import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { readAudioMeta } from "../engine/audio_meta.ts";
import {
  validateNarrationEvidence,
  verifyNarrationEvidence,
} from "../engine/narration_evidence.ts";
import {
  validateNarrationRequest,
  validateVersionedNarrationRequest,
} from "../engine/narration_request.ts";
import { loadConfigFiles } from "../engine/config.ts";
import { plan, resolveVisualSyncPolicy } from "../engine/plan.ts";
import type { AudioMeta, BuildPlan, VideoConfig, VoiceAssetSnapshot } from "../engine/types.ts";
import {
  captureVoiceWavSnapshots,
  validateAudioMetaVoiceSnapshots,
  type VoiceWavSnapshot,
} from "../engine/voice_assets.ts";
import { readVisualBeatSpec } from "../engine/visual_beats.ts";
import { readJsonFile } from "./json_file.ts";
import { resolveProjectLayout, type ProjectLayout } from "./project_layout.ts";
import {
  promoteManagedFiles,
  type ManagedFile,
  type ManagedFilePromotionResult,
  type ManagedFileTransactionDependencies,
} from "./managed_file_transaction.ts";

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

const NARRATION_RECOVERY = "Re-synthesize narration and rerun `md2vid transcribe`.";

function narrationEvidenceError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${message} ${NARRATION_RECOVERY}`);
}

export function validateProjectNarrationFreshness(
  sharedDir: string,
  meta: AudioMeta,
  voiceSnapshots: readonly VoiceWavSnapshot[],
): void {
  const requestPath = join(sharedDir, "audio_request.json");
  if (!existsSync(requestPath)) return;

  const rawRequest = readJsonFile(requestPath);
  const request = validateNarrationRequest(rawRequest, requestPath);
  if (request.version !== 1) return;
  const versioned = validateVersionedNarrationRequest(rawRequest, requestPath);

  const evidencePath = join(sharedDir, "narration_evidence.json");
  if (!existsSync(evidencePath)) {
    throw new Error(
      `${evidencePath}: missing for versioned narration request. `
      + "Re-synthesize narration and rerun `md2vid transcribe`.",
    );
  }
  let evidence: ReturnType<typeof validateNarrationEvidence>;
  try {
    evidence = validateNarrationEvidence(readJsonFile(evidencePath), evidencePath);
  } catch (error) {
    throw narrationEvidenceError(error);
  }
  const findings = verifyNarrationEvidence({
    request: versioned,
    evidence,
    meta,
    snapshots: voiceSnapshots,
    metadataPath: join(sharedDir, "audio_meta.json"),
  });
  if (findings.length) throw new Error(findings.map((finding) => finding.msg).join("\n"));
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
  validateProjectNarrationFreshness(layout.sharedDir, meta, voiceSnapshots);
  const loaded = loadConfigFiles(layout.sharedDir, layout.outputDir);
  const policy = resolveVisualSyncPolicy(loaded.neutral);
  const visualBeatsPath = join(layout.sharedDir, "visual_beats.json");
  const visualPlanningEnabled = policy.mode !== "off" || policy.coverageMode !== "off";
  const visualSpec = !visualPlanningEnabled || !existsSync(visualBeatsPath)
    ? undefined
    : readVisualBeatSpec(visualBeatsPath);
  if (
    visualSpec === undefined
    && (policy.mode === "required" || policy.coverageMode === "required")
  ) {
    throw new Error(`${visualBeatsPath}: required by visualSync policy`);
  }

  return {
    layout,
    neutralConfig: loaded.neutral,
    adapterConfig: loaded.config,
    plan: plan(meta, loaded.neutral, visualSpec),
    voiceSnapshots,
    warnings: visualPlanningEnabled && visualSpec === undefined
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
  const hasCoverageV2 = plan.frames.some((frame) => frame.visualSpecVersion === 2);
  const visualTiming = hasCoverageV2
    ? {
        version: 2,
        frames: Object.fromEntries(
          plan.frames
            .filter((frame) => frame.visualSpecVersion === 2)
            .map((frame) => [frame.slug, {
              visualSpecVersion: 2,
              voiceDuration: frame.voiceDur,
              frameDuration: frame.frameDur,
              requiredCoverage: {
                start: frame.words[0].start,
                end: frame.frameDur,
              },
              ...(frame.visualKind === undefined ? {} : { kind: frame.visualKind }),
              beats: (frame.visualBeats ?? [])
                .filter((beat) => beat.version === 2)
                .map((beat) => ({
                  id: beat.id,
                  role: beat.role,
                  start: beat.start,
                  end: beat.end,
                  ...(beat.workflowStep === undefined ? {} : { workflowStep: beat.workflowStep }),
                })),
              coverageExemptions: frame.visualCoverageExemptions ?? [],
            }]),
        ),
      }
    : {
        version: 1,
        frames: Object.fromEntries(
          plan.frames.flatMap((frame) => frame.visualBeats === undefined ? [] : [[frame.slug, {
            duration: frame.voiceDur,
            ...(frame.visualKind === undefined ? {} : { kind: frame.visualKind }),
            beats: frame.visualBeats
              .filter((beat) => beat.version === 1)
              .map(({ id, start, workflowStep }) => ({
                id,
                start,
                ...(workflowStep === undefined ? {} : { workflowStep }),
              })),
          }]]),
        ),
      };

  return {
    cues: `${JSON.stringify(cues, null, 2)}\n`,
    captionGroups: `${JSON.stringify({
      total_duration_s: +plan.totalDuration.toFixed(3),
      width: plan.canvas.width,
      height: plan.canvas.height,
      groups: plan.captionGroups,
    }, null, 2)}\n`,
    buildPlan: `${JSON.stringify(plan, null, 2)}\n`,
    visualTiming: `${JSON.stringify(visualTiming, null, 2)}\n`,
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

export interface NeutralPlanPromotionDependencies {
  transactionDependencies?: ManagedFileTransactionDependencies;
  cleanupStaging?: (path: string) => void;
}

export function promoteNeutralPlan(
  planning: ProjectPlanResult,
  dependencies: NeutralPlanPromotionDependencies = {},
): ManagedFilePromotionResult {
  const projectRoot = planning.layout.flat
    ? planning.layout.outputDir
    : dirname(planning.layout.outputDir);
  const stagingRoot = mkdtempSync(join(projectRoot, ".md2vid-plan-"));
  const cleanupStaging = dependencies.cleanupStaging
    ?? ((path: string) => rmSync(path, { recursive: true, force: true }));
  try {
    const stagedArtifacts = stageNeutralArtifacts(planning.plan, join(stagingRoot, "shared"));
    const promotion = promoteManagedFiles(
      projectRoot,
      stagingRoot,
      stagedArtifacts.map(({ target, staged }) => ({
        target: relative(projectRoot, join(planning.layout.sharedDir, target)),
        staged,
      })),
      dependencies.transactionDependencies,
    );
    try {
      cleanupStaging(stagingRoot);
    } catch (error) {
      promotion.cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
    }
    return promotion;
  } catch (error) {
    try {
      cleanupStaging(stagingRoot);
    } catch {
      // The primary planning or promotion error remains actionable.
    }
    throw error;
  }
}
