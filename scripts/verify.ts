#!/usr/bin/env node
// verify.mjs — thin framework-dispatch verifier.
//
// Usage: node scripts/verify.mjs <output-dir> [--max-chars N]
//
// The argument is a framework OUTPUT dir (e.g. outputs/<input>/hyperframes) or a flat
// layout-reference video dir. Runs the NEUTRAL caption invariants (engine/verify.mjs)
// on any video, then dispatches the framework-specific layout checks off the output's
// output.config.json `framework` field (default "hyperframes"). Neutral verify runs on
// any video regardless of framework; the framework verify runs only for that framework.

import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { verifyNeutral } from "../engine/verify.ts";
import { loadConfig } from "../engine/config.ts";
import { getAdapter } from "../frameworks/index.ts";
import { parseCommand } from "./cli_args.ts";
import { isMainModule } from "./main-guard.ts";
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

// Resolve the framework for this output dir. Reshaped videos carry it in
// output.config.json; flat layout-reference videos default to hyperframes.
function frameworkFor(sharedDir: string, outputDir: string) {
  try {
    const config = loadConfig(sharedDir, outputDir);
    return config.framework ?? "hyperframes";
  } catch {
    return "hyperframes";
  }
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

  const problems: string[] = [];
  const warnings: string[] = [];
  const problem = (msg: string) => problems.push(msg);
  const warn = (msg: string) => warnings.push(msg);

  let OUTPUT: string;
  let SHARED: string;
  try {
    ({ outputDir: OUTPUT, sharedDir: SHARED } = resolveProjectLayout(parsed.positionals[0]));
  } catch (error: unknown) {
    console.error(`FAIL: ${(error as Error).message}`);
    return 1;
  }
  if (!isDir(OUTPUT)) {
    console.log(`FAIL: not a directory: ${OUTPUT}`);
    return 2;
  }

  // Neutral caption invariants — delegate to the engine, framework-agnostic.
  const src = join(SHARED, "caption_groups.json");
  if (!isFile(src)) {
    warn(`no caption_groups.json (captions disabled?) — ${src}`);
  } else {
    const groups = JSON.parse(readFileSync(src, "utf8")).groups ?? [];
    for (const f of verifyNeutral(groups, { targetMaxChars: maxChars, hardMaxChars: HARD_MAX_CHARS })) {
      if (f.level === "error") problem(f.msg);
      else warn(f.msg);
    }
  }

  // Framework-specific layout checks — dispatch off config.framework.
  const adapter = getAdapter(frameworkFor(SHARED, OUTPUT));
  for (const f of adapter.verify(OUTPUT, SHARED)) {
    if (f.level === "error") problem(f.msg);
    else warn(f.msg);
  }

  for (const w of warnings) console.log(`WARN: ${w}`);
  if (problems.length) {
    for (const p of problems) console.log(`FAIL: ${p}`);
    console.log(`\n${problems.length} problem(s), ${warnings.length} warning(s)`);
    return 1;
  }
  console.log(`OK: video contract satisfied (${warnings.length} warning(s))`);
  return 0;
}

if (isMainModule(import.meta.url)) process.exit(run(process.argv.slice(2)));
