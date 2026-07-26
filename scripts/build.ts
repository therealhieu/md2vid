#!/usr/bin/env node
// build.mjs — thin framework-dispatch build. Neutral plan in, framework files out.
//
// Usage: node scripts/build.mjs <output-dir>
//
// The argument is a framework OUTPUT dir (e.g. outputs/<input>/hyperframes). Its
// framework-NEUTRAL inputs live in the sibling shared/ dir (outputs/<input>/shared):
//   shared/audio_meta.json    per-line word timings from the shared audio engine
//   shared/video.config.json  neutral slug map + timing knobs + canvas (no gsapSrc)
// and framework-LOCAL config lives in the output dir:
//   <output>/output.config.json   framework-local knobs (framework name, gsapSrc)
//
// Flow: loadConfig → engine.plan() → write neutral IR into shared/ (cues.json,
// caption_groups.json, build/build_plan.json) → getAdapter(config.framework).emit().
// build_plan.json is the serialized neutral contract between planning and emission;
// it is gitignored (shared/build/). Default framework is hyperframes, so existing
// videos with no `framework` field are unchanged.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { readAudioMeta } from "../engine/audio_meta.ts";
import {
  captureVoiceWavSnapshots,
  validateAudioMetaVoiceSnapshots,
} from "../engine/voice_assets.ts";
import { loadConfig } from "../engine/config.ts";
import { plan as buildPlan } from "../engine/plan.ts";
import { getAdapter } from "../frameworks/index.ts";
import { parseCommand } from "./cli_args.ts";
import { isMainModule } from "./main-guard.ts";
import {
  promoteManagedFiles,
  type ManagedFile,
  type ManagedFilePromotionResult,
  type ManagedFileTransactionDependencies,
} from "./managed_file_transaction.ts";
import { resolveProjectLayout } from "./project_layout.ts";

class BuildError extends Error {}

const MISSING_AUDIO_NEXT_STEP =
  "Create narration with the /md2vid skill workflow or follow https://github.com/therealhieu/md2vid#narration.";

function missingAudioMeta(path: string): string {
  return `missing audio_meta.json at ${path}\n${MISSING_AUDIO_NEXT_STEP}`;
}

export interface BuildDependencies {
  getAdapter?: typeof getAdapter;
  transactionDependencies?: ManagedFileTransactionDependencies;
  cleanupStaging?: (path: string) => void;
}

function reportCleanupWarnings(promotion: ManagedFilePromotionResult): void {
  if (!promotion.cleanupErrors.length) return;
  const retained = promotion.retainedBackups.length
    ? `; retained backups: ${promotion.retainedBackups.join(", ")}`
    : "";
  const uncertain = promotion.uncertainBackups.length
    ? `; uncertain backups: ${promotion.uncertainBackups.join(", ")}`
    : "";
  console.error(
    `WARN: managed file promotion committed but backup cleanup failed${retained}${uncertain}: `
      + promotion.cleanupErrors.map((error) => error.message).join("; "),
  );
}

function stagedRegularFiles(root: string, current = root): string[] {
  const files: string[] = [];
  for (const name of readdirSync(current)) {
    const path = join(current, name);
    const status = lstatSync(path);
    if (status.isSymbolicLink()) {
      throw new BuildError(`staged output contains a symbolic link: ${path}`);
    }
    if (status.isDirectory()) files.push(...stagedRegularFiles(root, path));
    else if (status.isFile()) files.push(path);
    else throw new BuildError(`staged output contains a non-regular entry: ${path}`);
  }
  return files;
}

function addMissingRuntimeFiles(
  managedFiles: ManagedFile[],
  projectRoot: string,
  outputDir: string,
  stagedOutputDir: string,
  excludedOutputPaths: Set<string>,
  managedVoicePath: string,
): void {
  for (const staged of stagedRegularFiles(stagedOutputDir)) {
    const outputPath = relative(stagedOutputDir, staged);
    if (
      excludedOutputPaths.has(outputPath)
      || outputPath === managedVoicePath
      || outputPath.startsWith(`${managedVoicePath}${sep}`)
    ) continue;
    const target = join(outputDir, outputPath);
    if (!existsSync(target)) {
      managedFiles.push({ target: relative(projectRoot, target), staged });
    }
  }
}

const USAGE = "Usage: md2vid build <output-dir> [--captions-only]";

function parseBuildArgs(argv: string[]) {
  return parseCommand({
    command: "build",
    usage: USAGE,
    options: { "captions-only": { type: "boolean" } },
    minPositionals: 1,
    maxPositionals: 1,
  }, argv);
}

export function run(argv: string[], dependencies: BuildDependencies = {}): number {
  const parsed = parseBuildArgs(argv);
  if (parsed.kind === "help") {
    console.log(USAGE);
    return 0;
  }
  if (parsed.kind === "error") {
    console.error(parsed.message);
    console.error(parsed.usage);
    return 2;
  }
  const captionsOnly = parsed.values["captions-only"] === true;
  const cleanupStaging = dependencies.cleanupStaging
    ?? ((path: string) => rmSync(path, { recursive: true, force: true }));
  let stagingRoot: string | undefined;
  let committed = false;

  try {
    const layout = resolveProjectLayout(parsed.positionals[0]);
    const { outputDir: OUTPUT, sharedDir: SHARED } = layout;
    if (!existsSync(OUTPUT)) throw new BuildError(`not a directory: ${OUTPUT}`);

    const metaPath = join(SHARED, "audio_meta.json");
    if (!existsSync(metaPath)) throw new BuildError(missingAudioMeta(metaPath));

    const meta = readAudioMeta(metaPath);
    const voiceSnapshots = captureVoiceWavSnapshots(
      SHARED,
      meta.voices.map((voice) => voice.path),
    );
    validateAudioMetaVoiceSnapshots(meta, voiceSnapshots, metaPath);
    const config = loadConfig(SHARED, OUTPUT);
    const PLAN = buildPlan(meta, config);
    const { frames, totalDuration: TOTAL, captionGroups: groups } = PLAN;
    const { width: WIDTH, height: HEIGHT } = PLAN.canvas;

    const adapter = (dependencies.getAdapter ?? getAdapter)(config.framework);
    const prepared = adapter.preflight(PLAN, SHARED, OUTPUT, config, {
      captionsOnly,
      voiceSnapshots,
    });

    if (captionsOnly) {
      const projectRoot = layout.flat ? OUTPUT : dirname(OUTPUT);
      stagingRoot = mkdtempSync(join(projectRoot, ".md2vid-build-captions-"));
      const stagedOutput = join(stagingRoot, "output");
      const stagedCaptionPath = join(stagedOutput, adapter.captionArtifactPath);
      mkdirSync(dirname(stagedCaptionPath), { recursive: true });
      if (adapter.captionIndexArtifactPath) {
        mkdirSync(dirname(join(stagedOutput, adapter.captionIndexArtifactPath)), { recursive: true });
      }
      adapter.emit(PLAN, SHARED, stagedOutput, config, {
        captionsOnly: true,
        runtimeSourceDir: OUTPUT,
        voiceSnapshots,
        prepared: prepared ?? undefined,
      });
      const captionGroupsPath = join(SHARED, "caption_groups.json");
      const findings = adapter.verifyCaptionArtifact({
        sharedDir: SHARED,
        outputDir: stagedOutput,
        captionGroupsPath,
      });
      const errors = findings.filter((finding) => finding.level === "error");
      if (errors.length) {
        throw new BuildError(
          `staged caption verification failed: ${errors.map((finding) => finding.msg).join("; ")}`,
        );
      }
      const managedFiles = [{
        target: relative(projectRoot, join(OUTPUT, adapter.captionArtifactPath)),
        staged: stagedCaptionPath,
      }];
      if (adapter.captionIndexArtifactPath) {
        managedFiles.push({
          target: relative(projectRoot, join(OUTPUT, adapter.captionIndexArtifactPath)),
          staged: join(stagedOutput, adapter.captionIndexArtifactPath),
        });
      }
      const promotion = promoteManagedFiles(
        projectRoot,
        stagingRoot,
        managedFiles,
        dependencies.transactionDependencies,
      );
      committed = true;
      reportCleanupWarnings(promotion);
      console.log(`OK build: ${OUTPUT}  (framework: ${adapter.name})`);
      return 0;
    }

    const projectRoot = layout.flat ? OUTPUT : dirname(OUTPUT);
    stagingRoot = mkdtempSync(join(projectRoot, ".md2vid-build-"));
    const stagedShared = join(stagingRoot, "shared");
    const stagedOutput = join(stagingRoot, "output");
    const stagedBuildDir = join(stagedShared, "build");
    mkdirSync(stagedBuildDir, { recursive: true });
    mkdirSync(stagedOutput, { recursive: true });

    // ── Stage the complete neutral IR before framework emission. ────────────────
    const cues = frames.map((f) => ({
      frame: f.frameNum,
      slug: f.slug,
      start: f.start,
      voiceDur: f.voiceDur,
      frameDur: f.frameDur,
      words: f.words.map((w) => ({ text: w.text, start: w.start, end: w.end })),
    }));
    const stagedCuesPath = join(stagedShared, "cues.json");
    const stagedCaptionGroupsPath = join(stagedShared, "caption_groups.json");
    const stagedNeutralPlanPath = join(stagedBuildDir, "build_plan.json");
    writeFileSync(stagedCuesPath, JSON.stringify(cues, null, 2) + "\n");
    writeFileSync(
      stagedCaptionGroupsPath,
      JSON.stringify({
        total_duration_s: +TOTAL.toFixed(3),
        width: WIDTH,
        height: HEIGHT,
        groups,
      }, null, 2) + "\n",
    );
    writeFileSync(stagedNeutralPlanPath, JSON.stringify(PLAN, null, 2) + "\n");

    // ── Emit only into staging; authored frames/src remain source inputs. ───────
    adapter.emit(PLAN, stagedShared, stagedOutput, config, {
      captionsOnly: false,
      runtimeSourceDir: OUTPUT,
      assetSourceDir: SHARED,
      voiceSnapshots,
      prepared: prepared ?? undefined,
    });

    const findings = adapter.verifyCaptionArtifact({
      sharedDir: stagedShared,
      outputDir: stagedOutput,
      captionGroupsPath: stagedCaptionGroupsPath,
    });
    const errors = findings.filter((finding) => finding.level === "error");
    if (errors.length) {
      throw new BuildError(
        `staged framework verification failed: ${errors.map((finding) => finding.msg).join("; ")}`,
      );
    }

    const stagedFrameworkPath = join(stagedOutput, adapter.captionArtifactPath);
    const managedFiles: ManagedFile[] = [
      { target: relative(projectRoot, join(SHARED, "cues.json")), staged: stagedCuesPath },
      {
        target: relative(projectRoot, join(SHARED, "caption_groups.json")),
        staged: stagedCaptionGroupsPath,
      },
      {
        target: relative(projectRoot, join(SHARED, "build", "build_plan.json")),
        staged: stagedNeutralPlanPath,
      },
      {
        target: relative(projectRoot, join(OUTPUT, adapter.captionArtifactPath)),
        staged: stagedFrameworkPath,
      },
    ];
    const excludedOutputPaths = new Set([adapter.captionArtifactPath]);
    if (adapter.captionIndexArtifactPath) {
      excludedOutputPaths.add(adapter.captionIndexArtifactPath);
      managedFiles.push({
        target: relative(projectRoot, join(OUTPUT, adapter.captionIndexArtifactPath)),
        staged: join(stagedOutput, adapter.captionIndexArtifactPath),
      });
    }
    addMissingRuntimeFiles(
      managedFiles,
      projectRoot,
      OUTPUT,
      stagedOutput,
      excludedOutputPaths,
      adapter.managedVoiceArtifactPath,
    );
    managedFiles.push({
      target: relative(projectRoot, join(OUTPUT, adapter.managedVoiceArtifactPath)),
      staged: join(stagedOutput, adapter.managedVoiceArtifactPath),
      kind: "directory",
    });

    const promotion = promoteManagedFiles(
      projectRoot,
      stagingRoot,
      managedFiles,
      dependencies.transactionDependencies,
    );
    committed = true;
    reportCleanupWarnings(promotion);

    console.log(`OK build: ${OUTPUT}  (framework: ${adapter.name})`);
    if (!captionsOnly) {
      console.log(`  frames: ${frames.length}  total: ${TOTAL.toFixed(3)}s  caption groups: ${groups.length}`);
    }
    return 0;
  } catch (e: unknown) {
    console.error(`FAIL: ${(e as Error).message}`);
    return 1;
  } finally {
    if (stagingRoot) {
      try {
        cleanupStaging(stagingRoot);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const state = committed ? "committed but" : "failed before commit and";
        console.error(
          `WARN: build ${state} staging cleanup failed; retained staging path: ${stagingRoot}: ${message}`,
        );
      }
    }
  }
}

if (isMainModule(import.meta.url)) process.exit(run(process.argv.slice(2)));
