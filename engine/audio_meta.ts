import { readFileSync } from "node:fs";
import type { AudioMeta, Voice, Word } from "./types.ts";
import { validateVoicePath } from "./voice_assets.ts";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(path: string, detail: string): never {
  throw new Error(`invalid audio metadata at ${path}: ${detail}`);
}

function voiceIdentity(voice: unknown, index: number): string {
  if (isRecord(voice) && typeof voice.id === "string" && voice.id.trim()) {
    return `voice "${voice.id}"`;
  }
  return `voice at index ${index}`;
}

function wordIdentity(word: unknown, index: number): string {
  if (isRecord(word) && typeof word.id === "string" && word.id.trim()) {
    return `word "${word.id}"`;
  }
  return `word at index ${index}`;
}

function validateVoiceHeader(voice: unknown, index: number, path: string): asserts voice is Voice {
  const identity = voiceIdentity(voice, index);
  if (!isRecord(voice)) fail(path, `${identity} must be an object`);
  if (typeof voice.id !== "string" || voice.id.trim().length === 0) {
    fail(path, `${identity} id must be a non-empty string`);
  }
  try {
    validateVoicePath(voice.path);
  } catch (error) {
    fail(path, `${identity} path ${(error as Error).message}`);
  }
  if (typeof voice.duration_s !== "number" || !Number.isFinite(voice.duration_s) || voice.duration_s <= 0) {
    fail(path, `${identity} duration_s must be finite and positive`);
  }
}

function validateWord(
  word: unknown,
  index: number,
  voice: Voice,
  previous: Word | undefined,
  path: string,
): asserts word is Word {
  const voiceLabel = `voice "${voice.id}"`;
  const identity = wordIdentity(word, index);
  if (!isRecord(word)) fail(path, `${voiceLabel} ${identity} must be an object`);
  if (typeof word.text !== "string" || word.text.trim().length === 0) {
    fail(path, `${voiceLabel} ${identity} text must be a non-empty string`);
  }
  if (
    typeof word.start !== "number"
    || typeof word.end !== "number"
    || !Number.isFinite(word.start)
    || !Number.isFinite(word.end)
  ) {
    fail(path, `${voiceLabel} ${identity} start and end must be finite numbers`);
  }
  if (word.start < 0) fail(path, `${voiceLabel} ${identity} start must be non-negative`);
  if (word.start > word.end) fail(path, `${voiceLabel} ${identity} interval is inverted`);
  if (word.end > voice.duration_s) {
    fail(path, `${voiceLabel} ${identity} end exceeds duration_s ${voice.duration_s}`);
  }
  if (previous && word.start < previous.end) {
    fail(
      path,
      `${voiceLabel} ${identity} starts before previous ${wordIdentity(previous, index - 1)} ends`,
    );
  }
}

export function validateAudioMeta(
  value: unknown,
  path: string,
  {
    allowEmptyWords = false,
    allowInvalidWords = false,
  }: { allowEmptyWords?: boolean; allowInvalidWords?: boolean } = {},
): AudioMeta {
  if (!isRecord(value)) fail(path, "expected a JSON object");
  if (!Array.isArray(value.voices) || value.voices.length === 0) {
    fail(path, "voices must be a non-empty array");
  }

  const seen = new Set<string>();
  for (const [voiceIndex, voice] of value.voices.entries()) {
    validateVoiceHeader(voice, voiceIndex, path);
    if (seen.has(voice.id)) fail(path, `duplicate voice id "${voice.id}"`);
    seen.add(voice.id);
    if (!Array.isArray(voice.words)) {
      fail(path, `voice "${voice.id}" words must be an array`);
    }
    if (allowInvalidWords) continue;
    if (!allowEmptyWords && voice.words.length === 0) {
      fail(path, `voice "${voice.id}" words must be a non-empty array`);
    }

    let previous: Word | undefined;
    for (const [wordIndex, word] of voice.words.entries()) {
      validateWord(word, wordIndex, voice, previous, path);
      previous = word;
    }
  }

  return value as unknown as AudioMeta;
}

export function readAudioMeta(path: string): AudioMeta {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error: unknown) {
    fail(path, (error as Error).message);
  }
  return validateAudioMeta(value, path);
}

function normalizeTimingBoundary(value: number, duration: number): number {
  return Math.min(+value.toFixed(6), duration);
}

export function normalizeTranscriptWords(
  value: unknown,
  voice: Pick<Voice, "id" | "duration_s">,
  path = "provider transcript",
): Word[] {
  validateVoiceHeader({ ...voice, path: "assets/voice/provider.wav", words: [] }, 0, path);
  if (!Array.isArray(value) || value.length === 0) {
    fail(path, `voice "${voice.id}" words must be a non-empty array`);
  }

  const words: Word[] = [];
  for (const [index, raw] of value.entries()) {
    const word = isRecord(raw) ? {
      id: `w${index}`,
      text: raw.text,
      start: raw.start,
      end: raw.end,
    } : raw;
    const candidate = word as unknown as Word;
    const previous = words.at(-1);

    if (!isRecord(word)) fail(path, `voice "${voice.id}" word "w${index}" must be an object`);
    if (typeof candidate.text !== "string" || candidate.text.trim().length === 0) {
      fail(path, `voice "${voice.id}" word "w${index}" text must be a non-empty string`);
    }
    if (
      typeof candidate.start !== "number"
      || typeof candidate.end !== "number"
      || !Number.isFinite(candidate.start)
      || !Number.isFinite(candidate.end)
    ) {
      fail(path, `voice "${voice.id}" word "w${index}" start and end must be finite numbers`);
    }
    if (candidate.start < 0) {
      fail(path, `voice "${voice.id}" word "w${index}" start must be non-negative`);
    }
    if (candidate.start > candidate.end) {
      fail(path, `voice "${voice.id}" word "w${index}" interval is inverted`);
    }
    if (previous && candidate.start < previous.end) {
      fail(path, `voice "${voice.id}" word "w${index}" starts before previous word "${previous.id}" ends`);
    }

    const isFinal = index === value.length - 1;
    if (!isFinal && candidate.end > voice.duration_s) {
      fail(path, `voice "${voice.id}" word "w${index}" end exceeds duration_s ${voice.duration_s}`);
    }

    let start = candidate.start;
    let end = candidate.end;
    if (isFinal && start > voice.duration_s) {
      const priorEnd = previous?.end ?? 0;
      const span = end - start;
      start = Math.max(priorEnd, voice.duration_s - span);
      end = voice.duration_s;
    } else if (isFinal && end > voice.duration_s) {
      end = voice.duration_s;
    }

    const normalized: Word = {
      id: `w${index}`,
      text: candidate.text,
      start: normalizeTimingBoundary(start, voice.duration_s),
      end: normalizeTimingBoundary(end, voice.duration_s),
    };
    validateWord(normalized, index, { ...voice, path: "assets/voice/provider.wav", words: [] }, previous, path);
    words.push(normalized);
  }

  return words;
}
