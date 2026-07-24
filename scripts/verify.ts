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
import { verifyNeutral } from "../engine/verify.ts";
import { loadConfigFiles, type LoadedVideoConfig } from "../engine/config.ts";
import type { CaptionGroup } from "../engine/types.ts";
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

    const loaded = loadConfigFiles(layout.sharedDir, layout.outputDir);
    const adapter = getAdapter(configuredFramework(loaded, layout.flat, layout.outputDir));
    const problems: string[] = [];
    const warnings: string[] = [];
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

    // Framework-specific layout checks — dispatch off validated config.framework.
    for (const finding of adapter.verify(layout.outputDir, layout.sharedDir)) {
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
