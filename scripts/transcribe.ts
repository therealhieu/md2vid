#!/usr/bin/env node
// transcribe.mjs — thin wrapper over the isolated whisper provider (engine/transcribe.mjs).
//
// Usage: node scripts/transcribe.mjs <output-dir>
//
// The argument is a framework OUTPUT dir; audio_meta.json + the wavs it references are
// neutral inputs in the sibling shared/ dir (reshaped layout), falling back to the
// output dir itself for flat layout-reference videos. This script only handles fs +
// the shared/ resolution; the provider itself lives behind engine/transcribe.mjs so a
// future swap is a one-file change.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { transcribeVoices } from "../engine/transcribe.ts";
import { isMainModule } from "./main-guard.ts";

export function run(argv: string[]): number {
  const dirArg = argv.find((a) => !a.startsWith("--"));
  if (!dirArg) {
    console.error("Usage: md2vid transcribe <output-dir>");
    return 2;
  }
  const OUTPUT = resolve(dirArg);
  const sharedDir = resolve(OUTPUT, "..", "shared");
  const BASE = existsSync(join(sharedDir, "audio_meta.json")) ? sharedDir : OUTPUT;
  const metaPath = join(BASE, "audio_meta.json");
  if (!existsSync(metaPath)) {
    console.error(`FAIL: missing audio_meta.json — ${metaPath}`);
    return 1;
  }

  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    const { ok, total } = transcribeVoices(meta, BASE);
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
    console.log(`\nOK: ${ok}/${total} lines transcribed → audio_meta.json`);
    return ok !== total ? 1 : 0;
  } catch (e: unknown) {
    console.error(`FAIL: ${(e as Error).message}`);
    return 1;
  }
}

if (isMainModule(import.meta.url)) process.exit(run(process.argv.slice(2)));
