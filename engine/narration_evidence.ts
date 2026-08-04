import type { AudioMeta, Finding } from "./types.ts";
import {
  narrationRequestSha256,
  type VersionedNarrationRequest,
} from "./narration_request.ts";
import {
  validateAudioMetaVoiceSnapshots,
  validateVoicePath,
  type VoiceWavSnapshot,
} from "./voice_assets.ts";

export interface NarrationEvidenceVoice {
  id: string;
  path: string;
  duration_s: number;
  sha256: string;
}

export interface NarrationEvidence {
  version: 1;
  requestSha256: string;
  provider: string;
  voice: string;
  voices: NarrationEvidenceVoice[];
  transcription: { source: "md2vid transcribe" };
}

export type NarrationAudioMeta = AudioMeta & {
  tts_provider?: unknown;
  voice_id?: unknown;
};

type JsonRecord = Record<string, unknown>;

const ROOT_FIELDS = new Set(["version", "requestSha256", "provider", "voice", "voices", "transcription"]);
const VOICE_FIELDS = new Set(["id", "path", "duration_s", "sha256"]);
const TRANSCRIPTION_FIELDS = new Set(["source"]);
const SHA256 = /^[a-f0-9]{64}$/u;
const RECOVERY = "Re-synthesize narration and rerun `md2vid transcribe`.";

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(path, "must be a non-empty string");
  }
  return value;
}

function ensureOnlyFields(value: JsonRecord, allowed: ReadonlySet<string>, path: string): void {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) fail(`${path}.${field}`, "is not supported");
  }
}

function validateHash(value: unknown, path: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(path, "must be a lowercase SHA-256 hex digest");
  }
  return value;
}

function validateEvidenceVoice(value: unknown, path: string): NarrationEvidenceVoice {
  if (!isRecord(value)) fail(path, "must be an object");
  ensureOnlyFields(value, VOICE_FIELDS, path);
  const id = requireNonEmptyString(value.id, `${path}.id`);
  let voicePath: string;
  try {
    voicePath = validateVoicePath(value.path);
  } catch (error) {
    fail(`${path}.path`, (error as Error).message);
  }
  if (typeof value.duration_s !== "number" || !Number.isFinite(value.duration_s) || value.duration_s < 0) {
    fail(`${path}.duration_s`, "must be a finite non-negative number");
  }
  return {
    id,
    path: voicePath,
    duration_s: value.duration_s,
    sha256: validateHash(value.sha256, `${path}.sha256`),
  };
}

function validateTranscription(value: unknown, path: string): NarrationEvidence["transcription"] {
  if (!isRecord(value)) fail(path, "must be an object");
  ensureOnlyFields(value, TRANSCRIPTION_FIELDS, path);
  if (value.source !== "md2vid transcribe") fail(`${path}.source`, 'expected "md2vid transcribe"');
  return { source: "md2vid transcribe" };
}

export function validateNarrationEvidence(value: unknown, path: string): NarrationEvidence {
  if (!isRecord(value)) fail(path, "expected an object");
  ensureOnlyFields(value, ROOT_FIELDS, path);
  if (value.version !== 1) fail(`${path}.version`, "expected 1");
  const requestSha256 = validateHash(value.requestSha256, `${path}.requestSha256`);
  const provider = requireNonEmptyString(value.provider, `${path}.provider`);
  const voice = requireNonEmptyString(value.voice, `${path}.voice`);
  if (!Array.isArray(value.voices) || value.voices.length === 0) {
    fail(`${path}.voices`, "must be a non-empty array");
  }
  const voices = value.voices.map((raw, index) => validateEvidenceVoice(raw, `${path}.voices[${index}]`));
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const evidenceVoice of voices) {
    if (ids.has(evidenceVoice.id)) fail(`${path}.voices`, `duplicate voice id ${JSON.stringify(evidenceVoice.id)}`);
    if (paths.has(evidenceVoice.path)) fail(`${path}.voices`, `duplicate voice path ${JSON.stringify(evidenceVoice.path)}`);
    ids.add(evidenceVoice.id);
    paths.add(evidenceVoice.path);
  }
  return {
    version: 1,
    requestSha256,
    provider,
    voice,
    voices,
    transcription: validateTranscription(value.transcription, `${path}.transcription`),
  };
}

export function createNarrationEvidence(input: {
  request: VersionedNarrationRequest;
  meta: NarrationAudioMeta;
  snapshots: readonly VoiceWavSnapshot[];
  metadataPath: string;
}): NarrationEvidence {
  const validatedSnapshots = validateAudioMetaVoiceSnapshots(input.meta, input.snapshots, input.metadataPath);
  const byPath = new Map(validatedSnapshots.map((snapshot) => [snapshot.path, snapshot]));
  return {
    version: 1,
    requestSha256: narrationRequestSha256(input.request),
    provider: input.request.provider,
    voice: input.request.voice,
    voices: input.meta.voices.map((voice) => {
      const snapshot = byPath.get(voice.path)!;
      return {
        id: voice.id,
        path: voice.path,
        duration_s: snapshot.duration_s,
        sha256: snapshot.digest,
      };
    }),
    transcription: { source: "md2vid transcribe" },
  };
}

function error(message: string): Finding {
  return { level: "error", msg: `${message} ${RECOVERY}` };
}

export function verifyNarrationEvidence(input: {
  request: VersionedNarrationRequest;
  evidence?: unknown;
  meta: NarrationAudioMeta;
  snapshots: readonly VoiceWavSnapshot[];
  metadataPath: string;
}): Finding[] {
  if (input.evidence === undefined || input.evidence === null) {
    return [error("missing narration evidence.")];
  }

  const evidence = validateNarrationEvidence(input.evidence, "narration_evidence.json");
  const snapshots = validateAudioMetaVoiceSnapshots(input.meta, input.snapshots, input.metadataPath);
  const findings: Finding[] = [];
  const expectedRequestDigest = narrationRequestSha256(input.request);
  if (evidence.requestSha256 !== expectedRequestDigest) {
    findings.push(error("narration request digest does not match narration evidence"));
  }
  if (evidence.provider !== input.request.provider) {
    findings.push(error(`narration evidence provider ${JSON.stringify(evidence.provider)} does not match request provider ${JSON.stringify(input.request.provider)}`));
  }
  if (evidence.voice !== input.request.voice) {
    findings.push(error(`narration evidence voice ${JSON.stringify(evidence.voice)} does not match request voice ${JSON.stringify(input.request.voice)}`));
  }
  if (input.meta.tts_provider !== undefined && input.meta.tts_provider !== input.request.provider) {
    findings.push(error(`audio metadata tts_provider ${JSON.stringify(input.meta.tts_provider)} does not match request provider ${JSON.stringify(input.request.provider)}`));
  }
  if (input.meta.voice_id !== undefined && input.meta.voice_id !== input.request.voice) {
    findings.push(error(`audio metadata voice_id ${JSON.stringify(input.meta.voice_id)} does not match request voice ${JSON.stringify(input.request.voice)}`));
  }

  if (input.request.lines.length !== input.meta.voices.length) {
    findings.push(error(`narration request line count ${input.request.lines.length} does not match audio metadata voice count ${input.meta.voices.length}`));
  }
  for (let index = 0; index < Math.min(input.request.lines.length, input.meta.voices.length); index++) {
    const line = input.request.lines[index]!;
    const metadataVoice = input.meta.voices[index]!;
    if (line.id !== metadataVoice.id) {
      findings.push(error(`narration request line ID ${JSON.stringify(line.id)} does not match audio metadata voice ID ${JSON.stringify(metadataVoice.id)} at index ${index}`));
    }
  }

  if (evidence.voices.length !== input.meta.voices.length) {
    findings.push(error(`narration evidence voice count ${evidence.voices.length} does not match audio metadata voice count ${input.meta.voices.length}`));
  }
  for (let index = 0; index < Math.min(evidence.voices.length, input.meta.voices.length); index++) {
    const evidenceVoice = evidence.voices[index]!;
    const metadataVoice = input.meta.voices[index]!;
    const snapshot = snapshots[index]!;
    if (evidenceVoice.id !== metadataVoice.id) {
      findings.push(error(`narration evidence voice ID ${JSON.stringify(evidenceVoice.id)} does not match audio metadata voice ID ${JSON.stringify(metadataVoice.id)} at index ${index}`));
    }
    if (evidenceVoice.path !== metadataVoice.path) {
      findings.push(error(`narration evidence voice path ${JSON.stringify(evidenceVoice.path)} does not match audio metadata voice path ${JSON.stringify(metadataVoice.path)} at index ${index}`));
    }
    if (evidenceVoice.duration_s !== snapshot.duration_s) {
      findings.push(error(`narration evidence voice duration ${evidenceVoice.duration_s} does not match safe WAV duration ${snapshot.duration_s} at index ${index}`));
    }
    if (evidenceVoice.sha256 !== snapshot.digest) {
      findings.push(error(`narration evidence WAV SHA-256 does not match current source WAV at index ${index}`));
    }
  }
  return findings;
}
