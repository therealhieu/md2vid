#!/usr/bin/env node
// verify.mjs — thin framework-dispatch verifier.
//
// Usage: node scripts/verify.mjs <output-dir> [--max-chars N]
//
// The argument is a framework OUTPUT dir (e.g. outputs/<input>/hyperframes) or a flat
// layout-reference video dir. Runs the NEUTRAL caption invariants (engine/verify.mjs)
// on any video, then dispatches the framework-specific layout checks off valid project
// configuration. Only valid flat legacy projects may omit `framework` and use HyperFrames.

import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { readAudioMeta } from "../engine/audio_meta.ts";
import { verifyNeutral } from "../engine/verify.ts";
import {
  captureVoiceWavSnapshots,
  validateAudioMetaVoiceSnapshots,
} from "../engine/voice_assets.ts";
import { loadConfigFiles, type LoadedVideoConfig } from "../engine/config.ts";
import { resolveVisualSyncPolicy } from "../engine/plan.ts";
import type { BuildPlan, CaptionGroup, VisualBindingManifest } from "../engine/types.ts";
import { validateVisualBindingManifest } from "../engine/visual_evidence.ts";
import { getAdapter } from "../frameworks/index.ts";
import { parseCommand } from "./cli_args.ts";
import { isMainModule } from "./main-guard.ts";
import {
  createProjectPlan,
  validateProjectNarrationFreshness,
} from "./plan_project.ts";
import { resolveProjectLayout } from "./project_layout.ts";

// Line-length target from docs/standards/video-generation.md (Captions). Advisory band
// — a hard ceiling only kicks in well past the readable target so a legitimately long
// single-clause line is not a failure.
const TARGET_MAX_CHARS_DEFAULT = 56;
const HARD_MAX_CHARS = 72;

const isFile = (p: string) => existsSync(p) && statSync(p).isFile();
const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

const USAGE = "Usage: md2vid verify <output-dir> [--max-chars N]";

function parseVerifyArgs(argv: string[]) {
  return parseCommand({
    command: "verify",
    usage: USAGE,
    options: { "max-chars": { type: "string" } },
    minPositionals: 1,
    maxPositionals: 1,
  }, argv);
}

function configuredFramework(loaded: LoadedVideoConfig, flat: boolean, outputDir: string): string {
  if (!flat) {
    if (!loaded.local) throw new Error(`missing output.config.json — ${loaded.localPath}`);
    if (loaded.local.framework === undefined) {
      throw new Error(`missing framework in ${loaded.localPath}`);
    }
    return loaded.local.framework;
  }

  return loaded.local?.framework ?? loaded.neutral.framework ?? "hyperframes";
}

function readCaptionGroups(path: string): CaptionGroup[] {
  try {
    return (JSON.parse(readFileSync(path, "utf8")) as { groups?: CaptionGroup[] }).groups ?? [];
  } catch (error: unknown) {
    throw new Error(`invalid caption_groups.json at ${path}: ${(error as Error).message}`);
  }
}

export function readBindingManifest(path: string): VisualBindingManifest | undefined {
  if (!isFile(path)) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error: unknown) {
    throw new Error(`invalid visual binding manifest at ${path}: ${(error as Error).message}`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid visual binding manifest at ${path}: expected an object`);
  }
  return validateVisualBindingManifest(value, path);
}

export function run(argv: string[]): number {
  const parsed = parseVerifyArgs(argv);
  if (parsed.kind === "help") {
    console.log(USAGE);
    return 0;
  }
  if (parsed.kind === "error") {
    console.error(parsed.message);
    console.error(parsed.usage);
    return 2;
  }

  const maxChars = Number(parsed.values["max-chars"] ?? TARGET_MAX_CHARS_DEFAULT);
  if (!Number.isFinite(maxChars)) {
    console.error(`--max-chars must be a number (got ${maxChars})`);
    console.error(USAGE);
    return 2;
  }

  try {
    const layout = resolveProjectLayout(parsed.positionals[0]);
    if (!isDir(layout.outputDir)) throw new Error(`not a directory: ${layout.outputDir}`);

    const metaPath = join(layout.sharedDir, "audio_meta.json");
    if (!isFile(metaPath)) throw new Error(`missing audio_meta.json — ${metaPath}`);
    const meta = readAudioMeta(metaPath);
    const voiceSnapshots = captureVoiceWavSnapshots(
      layout.sharedDir,
      meta.voices.map((voice) => voice.path),
    );
    validateAudioMetaVoiceSnapshots(meta, voiceSnapshots, metaPath);
    validateProjectNarrationFreshness(layout.sharedDir, meta, voiceSnapshots);

    const loaded = loadConfigFiles(layout.sharedDir, layout.outputDir);
    const policy = resolveVisualSyncPolicy(loaded.neutral);
    const visualBeatsPath = join(layout.sharedDir, "visual_beats.json");
    const requiresCurrentVisualPlanning = policy.mode !== "off"
      && (policy.mode === "required" || isFile(visualBeatsPath));
    const planning = requiresCurrentVisualPlanning ? createProjectPlan(layout.outputDir) : undefined;
    const adapter = getAdapter(configuredFramework(loaded, layout.flat, layout.outputDir));
    const problems: string[] = [];
    const warnings: string[] = planning?.warnings ?? (
      policy.mode === "warn"
        ? [`${visualBeatsPath}: no visual beat specification; semantic checks are skipped`]
        : []
    );
    const verificationPlan: BuildPlan = planning?.plan ?? {
      version: 1,
      canvas: { width: 1, height: 1 },
      timing: { tail: 0, xfade: 0, gap: 0 },
      totalDuration: 0,
      frames: [],
      captionGroups: [],
    };
    const problem = (msg: string) => problems.push(msg);
    const warn = (msg: string) => warnings.push(msg);

    // Neutral caption invariants — delegate to the engine, framework-agnostic.
    const src = join(layout.sharedDir, "caption_groups.json");
    if (!isFile(src)) {
      warn(`no caption_groups.json (captions disabled?) — ${src}`);
    } else {
      const groups = readCaptionGroups(src);
      for (const finding of verifyNeutral(groups, {
        targetMaxChars: maxChars,
        hardMaxChars: HARD_MAX_CHARS,
      })) {
        if (finding.level === "error") problem(finding.msg);
        else warn(finding.msg);
      }
    }

    const bindings = adapter.bindingManifestPath
      ? readBindingManifest(join(layout.outputDir, adapter.bindingManifestPath))
      : undefined;
    const hasPlannedVisualBeats = verificationPlan.frames.some((frame) => frame.visualBeats?.length);
    const verificationConfig = planning?.adapterConfig ?? loaded.config;

    // Framework-specific layout checks — dispatch off validated config.framework.
    for (const finding of adapter.verify({
      plan: verificationPlan,
      videoDir: layout.outputDir,
      sharedDir: layout.sharedDir,
      config: verificationConfig,
      policy,
      fps: hasPlannedVisualBeats
        ? adapter.resolveVerificationFps(verificationConfig, layout.outputDir)
        : 30,
      bindings,
      voiceSnapshots: planning?.voiceSnapshots ?? voiceSnapshots,
    })) {
      if (finding.level === "error") problem(finding.msg);
      else warn(finding.msg);
    }

    for (const warning of warnings) console.log(`WARN: ${warning}`);
    if (problems.length) {
      for (const message of problems) console.error(`FAIL: ${message}`);
      console.error(`\n${problems.length} problem(s), ${warnings.length} warning(s)`);
      return 1;
    }
    console.log(`OK: video contract satisfied (${warnings.length} warning(s))`);
    return 0;
  } catch (error: unknown) {
    console.error(`FAIL: ${(error as Error).message}`);
    return 1;
  }
}

if (isMainModule(import.meta.url)) process.exit(run(process.argv.slice(2)));
