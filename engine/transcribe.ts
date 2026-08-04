// transcribe.mjs — the whisper provider, isolated. NEUTRAL: no framework/HTML
// knowledge. A future provider swap (a different whisper build, a cloud API) is a
// one-file change here; callers only see transcribeVoices(meta, baseDir).
//
// The shared audio engine's Kokoro→Whisper chain returns 0 words on this machine
// (the engine's spawned `hyperframes transcribe` yields an empty transcript), but the
// standalone `hyperframes transcribe <wav> --model small.en --dir <tmp>` works. So we
// run that per wav, read its transcript.json, and merge word arrays back into meta.
// Deterministic; no network. `hyperframes` resolves the repo-root pinned devDependency.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runHyperframes,
  type RunHyperframesOptions,
} from "../scripts/hyperframes_cli.ts";
import { normalizeTranscriptWords, validateAudioMeta } from "./audio_meta.ts";
import type { AudioMeta, Word } from "./types.ts";
import { captureVoiceWavSnapshots, type VoiceWavSnapshot } from "./voice_assets.ts";

type HyperframesRunner = (
  args: string[],
  options?: Pick<RunHyperframesOptions, "cwd">,
) => number;

export interface TranscribeResult {
  meta: AudioMeta;
  ok: number;
  total: number;
  voiceSnapshots: VoiceWavSnapshot[];
}

// Transcribe every voice wav referenced by meta.voices (paths are relative to
// baseDir), normalize provider timings, and fill `words` only after every voice
// succeeds. Returns { meta, ok, total } so the caller can report + set an exit code.
export function transcribeVoices(
  meta: AudioMeta,
  baseDir: string,
  {
    model = "small.en",
    run = runHyperframes,
  }: { model?: string; run?: HyperframesRunner } = {},
): TranscribeResult {
  const validated = validateAudioMeta(meta, "audio_meta.json", { allowInvalidWords: true });
  const snapshots = captureVoiceWavSnapshots(baseDir, validated.voices.map((voice) => voice.path));
  const snapshotsByPath = new Map(snapshots.map((snapshot) => [snapshot.path, snapshot]));
  const snapshotRoot = mkdtempSync(join(tmpdir(), "md2vid-transcribe-snapshot-"));

  try {
    for (const snapshot of snapshots) {
      const destination = join(snapshotRoot, snapshot.path);
      mkdirSync(join(destination, ".."), { recursive: true });
      writeFileSync(destination, snapshot.readBytes(), { mode: snapshot.mode });
      chmodSync(destination, snapshot.mode);
    }

    let ok = 0;
    const completed: AudioMeta["voices"] = [];
    for (const voice of validated.voices) {
      const wav = snapshotsByPath.get(voice.path)!;
      const candidate = { ...voice, duration_s: wav.duration_s, words: [] as Word[] };
      const tempDir = mkdtempSync(join(snapshotRoot, ".transcript-"));
      try {
        const status = run(
          ["transcribe", voice.path, "--model", model, "--dir", tempDir],
          { cwd: snapshotRoot },
        );
        const transcript = join(tempDir, "transcript.json");
        if (status === 0 && existsSync(transcript)) {
          const words = JSON.parse(readFileSync(transcript, "utf8"));
          if (Array.isArray(words) && words.length > 0) {
            candidate.words = normalizeTranscriptWords(words, candidate, transcript);
            completed.push(candidate);
            ok++;
            console.log(`  ${voice.id}: ${candidate.words.length} words`);
            continue;
          }
        }
        console.error(`  ${voice.id}: FAILED (status ${status})`);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
    if (ok !== validated.voices.length) {
      return { meta, ok, total: validated.voices.length, voiceSnapshots: snapshots };
    }
    return {
      meta: { ...validated, voices: completed },
      ok,
      total: validated.voices.length,
      voiceSnapshots: snapshots,
    };
  } finally {
    rmSync(snapshotRoot, { recursive: true, force: true });
  }
}
