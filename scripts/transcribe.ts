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

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { validateAudioMeta } from "../engine/audio_meta.ts";
import { transcribeVoices } from "../engine/transcribe.ts";
import { parseCommand } from "./cli_args.ts";
import { isMainModule } from "./main-guard.ts";
import { resolveProjectLayout } from "./project_layout.ts";

const MISSING_AUDIO_NEXT_STEP =
  "Create narration with the /md2vid skill workflow or follow https://github.com/therealhieu/md2vid#narration.";

function missingAudioMeta(path: string): string {
  return `missing audio_meta.json at ${path}\n${MISSING_AUDIO_NEXT_STEP}`;
}

const USAGE = "Usage: md2vid transcribe <output-dir>";

function parseTranscribeArgs(argv: string[]) {
  return parseCommand({
    command: "transcribe",
    usage: USAGE,
    options: {},
    minPositionals: 1,
    maxPositionals: 1,
  }, argv);
}

interface TranscribeDependencies {
  transcribeVoices?: typeof transcribeVoices;
}

export function run(argv: string[], deps: TranscribeDependencies = {}): number {
  const parsed = parseTranscribeArgs(argv);
  if (parsed.kind === "help") {
    console.log(USAGE);
    return 0;
  }
  if (parsed.kind === "error") {
    console.error(parsed.message);
    console.error(parsed.usage);
    return 2;
  }
  const transcribe = deps.transcribeVoices ?? transcribeVoices;

  try {
    const { sharedDir: SHARED } = resolveProjectLayout(parsed.positionals[0]);
    const metaPath = join(SHARED, "audio_meta.json");
    if (!existsSync(metaPath)) {
      console.error(`FAIL: ${missingAudioMeta(metaPath)}`);
      return 1;
    }
    const raw = JSON.parse(readFileSync(metaPath, "utf8"));
    const meta = validateAudioMeta(raw, metaPath, { allowInvalidWords: true });
    const result = transcribe(meta, SHARED);
    if (result.ok !== result.total) {
      console.error(`FAIL: ${result.ok}/${result.total} lines transcribed; audio_meta.json unchanged`);
      return 1;
    }

    const normalized = validateAudioMeta(result.meta, metaPath);
    const transaction = mkdtempSync(join(SHARED, ".md2vid-transcribe-"));
    try {
      const staged = join(transaction, "audio_meta.json");
      writeFileSync(staged, JSON.stringify(normalized, null, 2) + "\n");
      renameSync(staged, metaPath);
    } finally {
      rmSync(transaction, { recursive: true, force: true });
    }
    console.log(`\nOK: ${result.ok}/${result.total} lines transcribed → audio_meta.json`);
    return 0;
  } catch (e: unknown) {
    console.error(`FAIL: ${(e as Error).message}`);
    return 1;
  }
}

if (isMainModule(import.meta.url)) process.exit(run(process.argv.slice(2)));
