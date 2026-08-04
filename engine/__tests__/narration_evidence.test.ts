import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateVersionedNarrationRequest } from "../narration_request.ts";
import {
  createNarrationEvidence,
  validateNarrationEvidence,
  verifyNarrationEvidence,
} from "../narration_evidence.ts";
import { captureVoiceWavSnapshots } from "../voice_assets.ts";

function wav(sampleFrames = 48_000, sampleRate = 48_000): Buffer {
  const channels = 1;
  const bits = 16;
  const blockAlign = channels * bits / 8;
  const dataBytes = sampleFrames * blockAlign;
  const out = Buffer.alloc(44 + dataBytes);
  out.write("RIFF", 0); out.writeUInt32LE(36 + dataBytes, 4); out.write("WAVE", 8);
  out.write("fmt ", 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
  out.writeUInt16LE(channels, 22); out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * blockAlign, 28); out.writeUInt16LE(blockAlign, 32);
  out.writeUInt16LE(bits, 34); out.write("data", 36); out.writeUInt32LE(dataBytes, 40);
  return out;
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "md2vid-narration-evidence-"));
  mkdirSync(join(root, "assets/voice"), { recursive: true });
  writeFileSync(join(root, "assets/voice/intro.wav"), wav());
  const request = validateVersionedNarrationRequest({
    version: 1,
    provider: "kokoro",
    voice: "am_michael",
    lang: "en",
    speed: 0.9,
    lines: [{ id: "intro", text: "Introduce the topic." }],
  }, "audio_request.json");
  const meta = {
    tts_provider: "kokoro",
    voice_id: "am_michael",
    voices: [{
      id: "intro",
      path: "assets/voice/intro.wav",
      duration_s: 1,
      words: [{ id: "w0", text: "Introduce", start: 0.1, end: 0.4 }],
    }],
  };
  const snapshots = captureVoiceWavSnapshots(root, ["assets/voice/intro.wav"]);
  return { root, request, meta, snapshots };
}

test("creates evidence from the exact validated WAV snapshot", () => {
  const { request, meta, snapshots } = fixture();
  const evidence = createNarrationEvidence({ request, meta, snapshots, metadataPath: "audio_meta.json" });
  assert.equal(evidence.provider, "kokoro");
  assert.equal(evidence.voice, "am_michael");
  assert.equal(evidence.voices[0]!.duration_s, snapshots[0]!.duration_s);
  assert.equal(evidence.voices[0]!.sha256, snapshots[0]!.digest);
  assert.deepEqual(verifyNarrationEvidence({ request, evidence, meta, snapshots, metadataPath: "audio_meta.json" }), []);
});

test("reports digest and WAV changes with recovery guidance", () => {
  const { request, meta, snapshots } = fixture();
  const evidence = createNarrationEvidence({ request, meta, snapshots, metadataPath: "audio_meta.json" });
  const changed = validateVersionedNarrationRequest({
    ...request,
    lines: [{ id: "intro", text: "Introduce this topic." }],
  }, "audio_request.json");
  const findings = verifyNarrationEvidence({ request: changed, evidence, meta, snapshots, metadataPath: "audio_meta.json" });
  assert.match(findings[0]!.msg, /request digest.*Re-synthesize narration and rerun `md2vid transcribe`/);
});

test("rejects malformed evidence fields and unknown properties", () => {
  assert.throws(
    () => validateNarrationEvidence({
      version: 1,
      requestSha256: "bad",
      provider: "kokoro",
      voice: "am_michael",
      voices: [],
      transcription: { source: "md2vid transcribe" },
      extra: true,
    }, "narration_evidence.json"),
    /narration_evidence\.json\.(requestSha256|extra)/,
  );
});

test("reports a missing narration evidence file before other freshness failures", () => {
  const { request, meta, snapshots } = fixture();
  const findings = verifyNarrationEvidence({ request, meta, snapshots, metadataPath: "audio_meta.json" });
  assert.deepEqual(findings.map((finding) => finding.msg), [
    "missing narration evidence. Re-synthesize narration and rerun `md2vid transcribe`.",
  ]);
});

test("ignores BGM and SFX-only request changes", () => {
  const { request, meta, snapshots } = fixture();
  const evidence = createNarrationEvidence({ request, meta, snapshots, metadataPath: "audio_meta.json" });
  const mediaOnly = validateVersionedNarrationRequest({
    ...request,
    bgm: { mode: "none" },
    sfx: [{ id: "click" }],
  }, "audio_request.json");
  assert.deepEqual(verifyNarrationEvidence({ request: mediaOnly, evidence, meta, snapshots, metadataPath: "audio_meta.json" }), []);
});

test("reports freshness mismatches in deterministic recovery order", () => {
  const { request, meta, snapshots } = fixture();
  const evidence = createNarrationEvidence({ request, meta, snapshots, metadataPath: "audio_meta.json" });
  const changedRequest = validateVersionedNarrationRequest({
    ...request,
    lines: [{ id: "intro", text: "Introduce this topic." }],
  }, "audio_request.json");
  const mismatched = {
    ...evidence,
    provider: "heygen",
    voice: "alternate-voice",
    voices: [{
      id: "other",
      path: "assets/voice/other.wav",
      duration_s: 2,
      sha256: "f".repeat(64),
    }],
  };
  const changedMeta = { ...meta, tts_provider: "elevenlabs", voice_id: "alternate-voice" };
  const findings = verifyNarrationEvidence({
    request: changedRequest,
    evidence: mismatched,
    meta: changedMeta,
    snapshots,
    metadataPath: "audio_meta.json",
  });
  assert.deepEqual(findings.map((finding) => finding.msg.replace(" Re-synthesize narration and rerun `md2vid transcribe`.", "")), [
    "narration request digest does not match narration evidence",
    "narration evidence provider \"heygen\" does not match request provider \"kokoro\"",
    "narration evidence voice \"alternate-voice\" does not match request voice \"am_michael\"",
    "audio metadata tts_provider \"elevenlabs\" does not match request provider \"kokoro\"",
    "audio metadata voice_id \"alternate-voice\" does not match request voice \"am_michael\"",
    "narration evidence voice ID \"other\" does not match audio metadata voice ID \"intro\" at index 0",
    "narration evidence voice path \"assets/voice/other.wav\" does not match audio metadata voice path \"assets/voice/intro.wav\" at index 0",
    "narration evidence voice duration 2 does not match safe WAV duration 1 at index 0",
    "narration evidence WAV SHA-256 does not match current source WAV at index 0",
  ]);
});

test("rejects strict evidence hashes, duplicate identities, and unsafe paths", () => {
  const { request, meta, snapshots } = fixture();
  const evidence = createNarrationEvidence({ request, meta, snapshots, metadataPath: "audio_meta.json" });
  for (const [name, patch, expected] of [
    ["uppercase hash", { requestSha256: "A".repeat(64) }, /requestSha256/],
    ["short hash", { requestSha256: "a".repeat(63) }, /requestSha256/],
    ["unsafe path", { voices: [{ ...evidence.voices[0]!, path: "../intro.wav" }] }, /voices\[0\]\.path/],
    ["duplicate IDs", { voices: [evidence.voices[0]!, { ...evidence.voices[0]!, path: "assets/voice/second.wav" }] }, /duplicate voice id/],
    ["duplicate paths", { voices: [evidence.voices[0]!, { ...evidence.voices[0]!, id: "second" }] }, /duplicate voice path/],
  ] as const) {
    assert.throws(
      () => validateNarrationEvidence({ ...evidence, ...patch }, "narration_evidence.json"),
      expected,
      name,
    );
  }
});
