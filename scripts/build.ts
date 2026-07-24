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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "../engine/config.ts";
import { plan as buildPlan } from "../engine/plan.ts";
import { getAdapter } from "../frameworks/index.ts";
import { parseCommand } from "./cli_args.ts";
import { isMainModule } from "./main-guard.ts";

class BuildError extends Error {}

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

export function run(argv: string[]): number {
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
  const OUTPUT = resolve(parsed.positionals[0]);
  const captionsOnly = parsed.values["captions-only"] === true;

  try {
    if (!existsSync(OUTPUT)) throw new BuildError(`not a directory: ${OUTPUT}`);

    // Neutral inputs/IR live in the sibling shared/ dir (reshaped layout); flat
    // layout-reference / freshly-scaffolded videos keep them beside the output. Mirror
    // the same shared/-else-flat resolution verify.ts + transcribe.ts use.
    const sharedSibling = resolve(OUTPUT, "..", "shared");
    const SHARED = existsSync(sharedSibling) ? sharedSibling : OUTPUT;

    const metaPath = join(SHARED, "audio_meta.json");
    if (!existsSync(metaPath)) throw new BuildError(`missing audio_meta.json — ${metaPath}`);

    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    const config = loadConfig(SHARED, OUTPUT);
    const PLAN = buildPlan(meta, config);
    const { frames, totalDuration: TOTAL, captionGroups: groups } = PLAN;
    const { width: WIDTH, height: HEIGHT } = PLAN.canvas;

    const adapter = getAdapter(config.framework);

    if (!captionsOnly) {
      // ── cues.json — per-frame word timings for authoring (LOCAL 0-based times) ──
      const cues = frames.map((f) => ({
        frame: f.frameNum,
        slug: f.slug,
        start: f.start,
        voiceDur: f.voiceDur,
        frameDur: f.frameDur,
        words: f.words.map((w) => ({ text: w.text, start: w.start, end: w.end })),
      }));
      writeFileSync(join(SHARED, "cues.json"), JSON.stringify(cues, null, 2) + "\n");

      // ── caption_groups.json — one group per line, GLOBAL times (from the plan) ──
      writeFileSync(
        join(SHARED, "caption_groups.json"),
        JSON.stringify({ total_duration_s: +TOTAL.toFixed(3), width: WIDTH, height: HEIGHT, groups }, null, 2) + "\n"
      );

      // ── build/build_plan.json — the serialized neutral IR contract (gitignored) ──
      const buildDir = join(SHARED, "build");
      mkdirSync(buildDir, { recursive: true });
      writeFileSync(join(buildDir, "build_plan.json"), JSON.stringify(PLAN, null, 2) + "\n");
    }

    // ── Framework emission — the adapter owns all output files. ──────────────────
    adapter.emit(PLAN, SHARED, OUTPUT, config, { captionsOnly });

    console.log(`OK build: ${OUTPUT}  (framework: ${adapter.name})`);
    if (!captionsOnly) {
      console.log(`  frames: ${frames.length}  total: ${TOTAL.toFixed(3)}s  caption groups: ${groups.length}`);
    }
    return 0;
  } catch (e: unknown) {
    console.error(`FAIL: ${(e as Error).message}`);
    return 1;
  }
}

if (isMainModule(import.meta.url)) process.exit(run(process.argv.slice(2)));
