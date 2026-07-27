import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  captureVoiceWavSnapshot,
  probeVoiceWav,
  safeWavDuration,
  validateAudioMetaVoiceWavs,
} from "../voice_assets.ts";
import type { AudioMeta } from "../types.ts";
import {
  extensibleFormatExtra,
  makePcmWav,
  riffWave,
  wavFormatChunk,
  type WavChunk,
} from "../../test/helpers/wav.ts";

function withWav(bytes: Buffer, run: (root: string, relative: string, absolute: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "md2vid-wav-probe-"));
  const relative = "assets/voice/voice.wav";
  const absolute = join(root, relative);
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    writeFileSync(absolute, bytes);
    run(root, relative, absolute);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function probe(bytes: Buffer) {
  let result: ReturnType<typeof probeVoiceWav> | undefined;
  withWav(bytes, (root, relative) => {
    result = probeVoiceWav(root, relative);
  });
  return result!;
}

function assertProbeError(bytes: Buffer, expected: RegExp): void {
  withWav(bytes, (root, relative, absolute) => {
    assert.throws(() => probeVoiceWav(root, relative), (error: unknown) => {
      assert.match((error as Error).message, expected);
      assert.match((error as Error).message, new RegExp(absolute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      return true;
    });
  });
}

test("safe WAV duration floors integer sample-frame extent to six decimals", () => {
  assert.equal(safeWavDuration(837_632, 48_000), 17.450666);
  assert.equal(safeWavDuration(999_999, 1_000_000), 0.999999);
  assert.throws(
    () => safeWavDuration(Number.MAX_SAFE_INTEGER, 1),
    /microsecond duration exceeds safe integer range/i,
  );
});

test("probes canonical mono and stereo PCM from data bytes, blockAlign, and sampleRate", () => {
  const mono = probe(makePcmWav({ sampleRate: 48_000, sampleFrames: 837_632 }));
  assert.equal(mono.path, "assets/voice/voice.wav");
  assert.ok(mono.absolutePath.endsWith("/assets/voice/voice.wav"));
  assert.equal(mono.format, "PCM");
  assert.equal(mono.channels, 1);
  assert.equal(mono.sampleRate, 48_000);
  assert.equal(mono.blockAlign, 2);
  assert.equal(mono.dataBytes, 1_675_264);
  assert.equal(mono.sampleFrames, 837_632);
  assert.equal(mono.duration_s, 17.450666);

  const stereo = probe(makePcmWav({ channels: 2, sampleRate: 44_100, sampleFrames: 44_101 }));
  assert.equal(stereo.channels, 2);
  assert.equal(stereo.blockAlign, 4);
  assert.equal(stereo.sampleFrames, 44_101);
  assert.equal(stereo.duration_s, 1.000022);
});

test("walks extended fmt, unknown chunks, odd padding, and data before or after fmt", () => {
  const unknown: WavChunk[] = [
    { id: "JUNK", data: Buffer.from([1, 2, 3]) },
    { id: "LIST", data: Buffer.from("abcde") },
  ];
  for (const dataBeforeFmt of [false, true]) {
    const result = probe(makePcmWav({
      sampleRate: 8_000,
      sampleFrames: 8_001,
      fmtExtra: Buffer.from([2, 0, 9, 9]),
      leadingChunks: unknown,
      trailingChunks: [{ id: "TAIL", data: Buffer.from([7]) }],
      dataBeforeFmt,
    }));
    assert.equal(result.sampleFrames, 8_001);
    assert.equal(result.duration_s, 1.000125);
  }
});

test("accepts IEEE float and WAVE_FORMAT_EXTENSIBLE PCM/float", () => {
  const float = probe(makePcmWav({ formatTag: 3, bitsPerSample: 32, sampleRate: 10, sampleFrames: 12 }));
  assert.equal(float.format, "IEEE_FLOAT");

  for (const subformatTag of [1, 3] as const) {
    const result = probe(makePcmWav({
      formatTag: 0xfffe,
      bitsPerSample: subformatTag === 1 ? 16 : 32,
      sampleRate: 10,
      sampleFrames: 12,
      fmtExtra: extensibleFormatExtra(subformatTag, {
        validBitsPerSample: subformatTag === 1 ? 16 : 32,
      }),
    }));
    assert.equal(result.format, subformatTag === 1 ? "PCM" : "IEEE_FLOAT");
  }
});

test("rejects truncated, missing, and non-WAVE containers", () => {
  assertProbeError(Buffer.from("RIFF"), /truncated RIFF\/WAVE header/i);
  assertProbeError(riffWave([], { formType: "AVI " }), /expected WAVE form type/i);
  assertProbeError(riffWave([{ id: "data", data: Buffer.alloc(2) }]), /missing fmt chunk/i);
  assertProbeError(riffWave([{ id: "fmt ", data: wavFormatChunk() }]), /missing data chunk/i);
  assertProbeError(riffWave([{ id: "fmt ", data: wavFormatChunk() }], { declaredRiffSize: 999 }), /truncated RIFF container/i);
  assertProbeError(riffWave([
    { id: "fmt ", data: wavFormatChunk() },
    { id: "data", data: Buffer.alloc(2), declaredSize: 10, includePadding: false },
  ]), /truncated data chunk/i);
});

test("rejects invalid sample rate, block align, and non-integral sample frames", () => {
  assertProbeError(riffWave([
    { id: "fmt ", data: wavFormatChunk({ sampleRate: 0 }) },
    { id: "data", data: Buffer.alloc(2) },
  ]), /sample rate must be positive/i);
  assertProbeError(riffWave([
    { id: "fmt ", data: wavFormatChunk({ blockAlign: 0 }) },
    { id: "data", data: Buffer.alloc(2) },
  ]), /block align must be positive/i);
  assertProbeError(riffWave([
    { id: "fmt ", data: wavFormatChunk({ channels: 2, blockAlign: 4 }) },
    { id: "data", data: Buffer.alloc(5) },
  ]), /data size 5.*not divisible by block align 4/i);
});

test("explicitly rejects multiple data chunks and unsupported compressed formats", () => {
  assertProbeError(riffWave([
    { id: "fmt ", data: wavFormatChunk() },
    { id: "data", data: Buffer.alloc(2) },
    { id: "data", data: Buffer.alloc(2) },
  ]), /multiple data chunks are unsupported/i);
  assertProbeError(riffWave([
    { id: "fmt ", data: wavFormatChunk({ formatTag: 6 }) },
    { id: "data", data: Buffer.alloc(2) },
  ]), /unsupported WAVE format 0x0006/i);
  const truncatedExtension = extensibleFormatExtra(1);
  truncatedExtension.writeUInt16LE(30, 0);
  assertProbeError(makePcmWav({
    formatTag: 0xfffe,
    fmtExtra: truncatedExtension,
  }), /truncated WAVE_FORMAT_EXTENSIBLE extension/i);
});

test("rejects semantically inconsistent PCM and IEEE float format fields", () => {
  assertProbeError(riffWave([
    { id: "fmt ", data: wavFormatChunk({ channels: 2, bitsPerSample: 16, blockAlign: 2 }) },
    { id: "data", data: Buffer.alloc(4) },
  ]), /block align 2.*expected 4.*2 channels.*16 bits/i);
  assertProbeError(riffWave([
    { id: "fmt ", data: wavFormatChunk({ sampleRate: 48_000, blockAlign: 2, byteRate: 1 }) },
    { id: "data", data: Buffer.alloc(2) },
  ]), /byte rate 1.*expected 96000/i);
  assertProbeError(riffWave([
    { id: "fmt ", data: wavFormatChunk({ bitsPerSample: 0, blockAlign: 1, byteRate: 1 }) },
    { id: "data", data: Buffer.alloc(1) },
  ]), /PCM bits per sample.*8, 16, 24, or 32/i);
  for (const bitsPerSample of [12, 20, 40]) {
    assertProbeError(makePcmWav({ bitsPerSample }), /PCM bits per sample.*8, 16, 24, or 32/i);
  }
  assertProbeError(
    makePcmWav({ formatTag: 3, bitsPerSample: 16 }),
    /IEEE float bits per sample.*32 or 64/i,
  );
});

test("rejects inconsistent WAVE_FORMAT_EXTENSIBLE valid bits and subtype widths", () => {
  for (const validBitsPerSample of [0, 17]) {
    assertProbeError(makePcmWav({
      formatTag: 0xfffe,
      bitsPerSample: 16,
      fmtExtra: extensibleFormatExtra(1, { validBitsPerSample }),
    }), /valid bits per sample.*positive.*no greater than container bits 16/i);
  }
  assertProbeError(makePcmWav({
    formatTag: 0xfffe,
    bitsPerSample: 64,
    fmtExtra: extensibleFormatExtra(1, { validBitsPerSample: 32 }),
  }), /extensible PCM bits per sample.*8, 16, 24, or 32/i);
  assertProbeError(makePcmWav({
    formatTag: 0xfffe,
    bitsPerSample: 16,
    fmtExtra: extensibleFormatExtra(3, { validBitsPerSample: 16 }),
  }), /extensible IEEE float bits per sample.*32 or 64/i);
});

test("FIFO voice assets are rejected promptly without blocking the snapshot process", {
  skip: process.platform !== "darwin" && process.platform !== "linux",
}, () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-wav-fifo-"));
  const relative = "assets/voice/fifo.wav";
  const absolute = join(root, relative);
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    execFileSync("mkfifo", [absolute]);
    const moduleUrl = pathToFileURL(join(import.meta.dirname, "..", "voice_assets.ts")).href;
    const script = `
      import { captureVoiceWavSnapshot } from ${JSON.stringify(moduleUrl)};
      try {
        captureVoiceWavSnapshot(${JSON.stringify(root)}, ${JSON.stringify(relative)});
        process.exit(2);
      } catch (error) {
        console.error(error.message);
        process.exit(0);
      }
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      encoding: "utf8",
      timeout: 2_000,
    });
    assert.equal(result.status, 0, `signal=${result.signal} error=${result.error?.message}\n${result.stderr}`);
    assert.match(result.stderr, /not a regular file.*fifo\.wav/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("directory and Unix socket voice assets fail with path-aware nonregular errors", async () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-wav-nonregular-"));
  const directoryRelative = "assets/voice/directory.wav";
  const socketRelative = "assets/voice/socket.wav";
  const socketAbsolute = join(root, socketRelative);
  const server = createServer();
  try {
    mkdirSync(join(root, directoryRelative), { recursive: true });
    assert.throws(
      () => captureVoiceWavSnapshot(root, directoryRelative),
      /not a regular file.*directory\.wav/i,
    );

    await new Promise<void>((resolveReady, reject) => {
      server.once("error", reject);
      server.listen(socketAbsolute, resolveReady);
    });
    assert.throws(
      () => captureVoiceWavSnapshot(root, socketRelative),
      /not a regular file.*socket\.wav/i,
    );
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    rmSync(root, { recursive: true, force: true });
  }
});

test("snapshot rejects a parent directory replacement that remains in place after open", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-wav-parent-change-"));
  const relative = "assets/voice/voice.wav";
  const parent = join(root, "assets", "voice");
  const movedParent = join(root, "assets", "voice-before-swap");
  try {
    mkdirSync(parent, { recursive: true });
    writeFileSync(join(root, relative), makePcmWav());

    assert.throws(
      () => Reflect.apply(captureVoiceWavSnapshot, undefined, [root, relative, {
        afterOpen() {
          renameSync(parent, movedParent);
          mkdirSync(parent);
          writeFileSync(join(root, relative), makePcmWav({ sampleRate: 48_000, sampleFrames: 96_000 }));
        },
      }]),
      /voice asset changed while snapshotting.*voice\.wav/i,
    );
    assert.equal(Buffer.compare(
      readFileSync(join(root, relative)),
      readFileSync(join(movedParent, "voice.wav")),
    ) === 0, false, "replacement must remain in place through detection");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("captured WAV snapshots expose immutable metadata and defensive byte copies", () => {
  withWav(makePcmWav(), (root, relative) => {
    const snapshot = captureVoiceWavSnapshot(root, relative);
    const first = snapshot.readBytes();
    first[first.length - 1] = 99;
    const second = snapshot.readBytes();
    assert.notEqual(second[second.length - 1], 99);
    assert.equal(Object.isFrozen(snapshot), true);
  });
});

test("metadata validation requires exact safe WAV duration and bounded words", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-wav-meta-"));
  const path = "assets/voice/latency.wav";
  const absolute = join(root, path);
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    writeFileSync(absolute, makePcmWav({ sampleRate: 48_000, sampleFrames: 837_632 }));
    const valid: AudioMeta = {
      voices: [{
        id: "latency",
        path,
        duration_s: 17.450666,
        words: [{ id: "w0", text: "safe", start: 17.44, end: 17.450666 }],
      }],
    };
    assert.doesNotThrow(() => validateAudioMetaVoiceWavs(root, valid, "shared/audio_meta.json"));

    assert.throws(
      () => validateAudioMetaVoiceWavs(root, {
        voices: [{ ...valid.voices[0], duration_s: 17.451 }],
      }, "shared/audio_meta.json"),
      /shared\/audio_meta\.json.*voice "latency".*latency\.wav.*expected 17\.450666.*actual 17\.451/i,
    );
    assert.throws(
      () => validateAudioMetaVoiceWavs(root, {
        voices: [{ ...valid.voices[0], words: [{ id: "late", text: "late", start: 17.45, end: 17.451 }] }],
      }, "shared/audio_meta.json"),
      /shared\/audio_meta\.json.*voice "latency".*word "late".*17\.451.*safe WAV duration 17\.450666/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
