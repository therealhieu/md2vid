// transcribe.mjs — the whisper provider, isolated. NEUTRAL: no framework/HTML
// knowledge. A future provider swap (a different whisper build, a cloud API) is a
// one-file change here; callers only see transcribeVoices(meta, baseDir).
//
// The shared audio engine's Kokoro→Whisper chain returns 0 words on this machine
// (the engine's spawned `hyperframes transcribe` yields an empty transcript), but the
// standalone `hyperframes transcribe <wav> --model small.en --dir <tmp>` works. So we
// run that per wav, read its transcript.json, and merge word arrays back into meta.
// Deterministic; no network. `hyperframes` resolves the repo-root pinned devDependency.

import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runHyperframes,
  type RunHyperframesOptions,
} from "../scripts/hyperframes_cli.ts";
import type { AudioMeta } from "./types.ts";

type HyperframesRunner = (
  args: string[],
  options?: Pick<RunHyperframesOptions, "cwd">,
) => number;

// Transcribe every voice wav referenced by meta.voices (paths are relative to
// baseDir) and fill each voice's `words`. Mutates and returns meta. Returns
// { meta, ok, total } so the caller can report + set an exit code.
export function transcribeVoices(
  meta: AudioMeta,
  baseDir: string,
  {
    model = "small.en",
    run = runHyperframes,
  }: { model?: string; run?: HyperframesRunner } = {},
): { meta: AudioMeta; ok: number; total: number } {
  let ok = 0;
  for (const voice of meta.voices) {
    const wavRel = voice.path; // e.g. assets/voice/01.wav
    const wavAbs = join(baseDir, wavRel);
    if (!existsSync(wavAbs)) {
      console.error(`MISSING wav: ${wavRel}`);
      continue;
    }

    const tempDir = mkdtempSync(join(tmpdir(), "hf-trans-"));
    try {
      const status = run(
        ["transcribe", wavRel, "--model", model, "--dir", tempDir],
        { cwd: baseDir },
      );
      const transcript = join(tempDir, "transcript.json");
      if (status === 0 && existsSync(transcript)) {
        const words = JSON.parse(readFileSync(transcript, "utf8"));
        if (Array.isArray(words) && words.length > 0) {
          voice.words = words.map((word, index) => ({
            id: `w${index}`,
            text: String(word.text),
            start: word.start,
            end: word.end,
          }));
          ok++;
          console.log(`  ${voice.id}: ${voice.words.length} words`);
          continue;
        }
      }
      console.error(`  ${voice.id}: FAILED (status ${status})`);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
  return { meta, ok, total: meta.voices.length };
}
