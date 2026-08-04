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
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { validateAudioMeta } from "../engine/audio_meta.ts";
import { createNarrationEvidence } from "../engine/narration_evidence.ts";
import {
  validateNarrationRequest,
  validateVersionedNarrationRequest,
  type VersionedNarrationRequest,
} from "../engine/narration_request.ts";
import { transcribeVoices } from "../engine/transcribe.ts";
import { parseCommand } from "./cli_args.ts";
import { readJsonFile } from "./json_file.ts";
import {
  promoteManagedFiles,
  type ManagedFileTransactionDependencies,
} from "./managed_file_transaction.ts";
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

export interface TranscribeDependencies {
  transcribeVoices?: typeof transcribeVoices;
  transactionDependencies?: ManagedFileTransactionDependencies;
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
    const requestPath = join(SHARED, "audio_request.json");
    let versionedRequest: VersionedNarrationRequest | undefined;
    if (existsSync(requestPath)) {
      const rawRequest = readJsonFile(requestPath);
      const request = validateNarrationRequest(rawRequest, requestPath);
      if (request.version === 1) {
        versionedRequest = validateVersionedNarrationRequest(rawRequest, requestPath);
      }
    }

    const raw = readJsonFile(metaPath);
    const meta = validateAudioMeta(raw, metaPath, { allowInvalidWords: true });
    if (versionedRequest) {
      const paths = new Set<string>();
      for (const voice of meta.voices) {
        if (paths.has(voice.path)) {
          throw new Error(`${metaPath}: duplicate voice WAV path ${JSON.stringify(voice.path)} is not supported for versioned narration`);
        }
        paths.add(voice.path);
      }
    }
    const result = transcribe(meta, SHARED);
    if (result.ok !== result.total) {
      console.error(`FAIL: ${result.ok}/${result.total} lines transcribed; audio_meta.json unchanged`);
      return 1;
    }

    const normalized = validateAudioMeta(result.meta, metaPath);
    if (versionedRequest) {
      const requestIds = versionedRequest.lines.map((line) => line.id);
      const voiceIds = normalized.voices.map((voice) => voice.id);
      if (JSON.stringify(requestIds) !== JSON.stringify(voiceIds)) {
        throw new Error(`${requestPath}: ordered lines[].id must match audio_meta.json voices[].id`);
      }
      const provenance = normalized as typeof normalized & { tts_provider?: unknown; voice_id?: unknown };
      if (provenance.tts_provider !== undefined && provenance.tts_provider !== versionedRequest.provider) {
        throw new Error(`${metaPath}: tts_provider contradicts ${requestPath}`);
      }
      if (provenance.voice_id !== undefined && provenance.voice_id !== versionedRequest.voice) {
        throw new Error(`${metaPath}: voice_id contradicts ${requestPath}`);
      }
    }

    const transaction = mkdtempSync(join(SHARED, ".md2vid-transcribe-"));
    try {
      const stagedMeta = join(transaction, "audio_meta.json");
      writeFileSync(stagedMeta, JSON.stringify(normalized, null, 2) + "\n");
      const managed = [{ target: "audio_meta.json", staged: stagedMeta }];
      if (versionedRequest) {
        const evidence = createNarrationEvidence({
          request: versionedRequest,
          meta: normalized,
          snapshots: result.voiceSnapshots,
          metadataPath: metaPath,
        });
        const stagedEvidence = join(transaction, "narration_evidence.json");
        writeFileSync(stagedEvidence, JSON.stringify(evidence, null, 2) + "\n");
        managed.push({ target: "narration_evidence.json", staged: stagedEvidence });
      }
      const promotion = promoteManagedFiles(SHARED, transaction, managed, deps.transactionDependencies);
      if (promotion.cleanupErrors.length) {
        const retained = promotion.retainedBackups.length
          ? `; retained backups: ${promotion.retainedBackups.join(", ")}`
          : "";
        const uncertain = promotion.uncertainBackups.length
          ? `; uncertain backups: ${promotion.uncertainBackups.join(", ")}`
          : "";
        console.warn(
          `WARN [transcribe]: managed file promotion committed but backup cleanup failed${retained}${uncertain}: `
          + promotion.cleanupErrors.map((error) => error.message).join("; "),
        );
      }
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
