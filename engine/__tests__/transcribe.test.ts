import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { normalizeTranscriptWords } from "../audio_meta.ts";
import { transcribeVoices } from "../transcribe.ts";
import type { AudioMeta } from "../types.ts";
import { makePcmWav, riffWave, wavFormatChunk } from "../../test/helpers/wav.ts";

const ONE_SECOND_WAV = makePcmWav({ sampleRate: 48_000, sampleFrames: 48_000 });

test("transcribe invokes the package-owned runner once per existing WAV", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-"));
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    writeFileSync(join(root, "assets", "voice", "01.wav"), ONE_SECOND_WAV);
    writeFileSync(join(root, "assets", "voice", "02.wav"), ONE_SECOND_WAV);
    const meta: AudioMeta = {
      voices: [
        { id: "01", path: "assets/voice/01.wav", duration_s: 1, words: [] },
        { id: "02", path: "assets/voice/02.wav", duration_s: 1, words: [] },
      ],
    };
    const calls: Array<{ args: string[]; cwd?: string }> = [];
    const outDirs: string[] = [];

    const result = transcribeVoices(meta, root, {
      run(args, options) {
        calls.push({ args, cwd: options?.cwd });
        const outDir = args[args.indexOf("--dir") + 1];
        outDirs.push(outDir);
        writeFileSync(
          join(outDir, "transcript.json"),
          JSON.stringify([
            { text: "hello", start: 0, end: 0.5 },
            { text: "world", start: 0.5, end: 1 },
          ]),
        );
        return 0;
      },
    });

    assert.equal(outDirs.length, 2);
    assert.notEqual(outDirs[0], outDirs[1]);
    const snapshotRoot = calls[0].cwd!;
    assert.notEqual(snapshotRoot, root);
    for (const outDir of outDirs) {
      assert.ok(outDir.startsWith(join(snapshotRoot, ".transcript-")));
    }
    assert.deepEqual(calls, [
      {
        args: [
          "transcribe",
          "assets/voice/01.wav",
          "--model",
          "small.en",
          "--dir",
          outDirs[0],
        ],
        cwd: snapshotRoot,
      },
      {
        args: [
          "transcribe",
          "assets/voice/02.wav",
          "--model",
          "small.en",
          "--dir",
          outDirs[1],
        ],
        cwd: snapshotRoot,
      },
    ]);
    assert.equal(result.ok, 2);
    assert.notEqual(result.meta, meta);
    assert.deepEqual(meta.voices.map((voice) => voice.words), [[], []]);
    assert.deepEqual(result.meta.voices[0].words, [
      { id: "w0", text: "hello", start: 0, end: 0.5 },
      { id: "w1", text: "world", start: 0.5, end: 1 },
    ]);
    for (const outDir of outDirs) {
      assert.equal(existsSync(outDir), false);
    }
    assert.equal(existsSync(snapshotRoot), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe preserves root provenance and returns the pre-provider WAV snapshots", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-provenance-"));
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    writeFileSync(join(root, "assets", "voice", "intro.wav"), ONE_SECOND_WAV);
    const meta: AudioMeta & { tts_provider: string; voice_id: string } = {
      tts_provider: "kokoro",
      voice_id: "am_michael",
      voices: [{ id: "intro", path: "assets/voice/intro.wav", duration_s: 999, words: [] }],
    };

    const result = transcribeVoices(meta, root, {
      run(args) {
        const outDir = args[args.indexOf("--dir") + 1]!;
        writeFileSync(join(outDir, "transcript.json"), JSON.stringify([
          { text: "Hello", start: 0, end: 0.5 },
        ]));
        return 0;
      },
    });

    assert.equal((result.meta as typeof meta).tts_provider, "kokoro");
    assert.equal((result.meta as typeof meta).voice_id, "am_michael");
    assert.equal(result.voiceSnapshots.length, 1);
    assert.equal(result.voiceSnapshots[0]!.path, "assets/voice/intro.wav");
    assert.equal(result.meta.voices[0]!.duration_s, result.voiceSnapshots[0]!.duration_s);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe snapshot result remains tied to bytes captured before provider execution", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-result-snapshot-"));
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    const voicePath = join(root, "assets", "voice", "intro.wav");
    const original = Buffer.from(ONE_SECOND_WAV);
    writeFileSync(voicePath, original);
    const meta: AudioMeta = {
      voices: [{ id: "intro", path: "assets/voice/intro.wav", duration_s: 1, words: [] }],
    };

    const result = transcribeVoices(meta, root, {
      run(args) {
        writeFileSync(voicePath, makePcmWav({ sampleRate: 48_000, sampleFrames: 96_000 }));
        const outDir = args[args.indexOf("--dir") + 1]!;
        writeFileSync(join(outDir, "transcript.json"), JSON.stringify([
          { text: "Hello", start: 0, end: 0.5 },
        ]));
        return 0;
      },
    });

    assert.deepEqual(result.voiceSnapshots[0]!.readBytes(), original);
    assert.notDeepEqual(result.voiceSnapshots[0]!.readBytes(), readFileSync(voicePath));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe normalizes provider final-word overruns without extending voice duration", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-"));
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    writeFileSync(join(root, "assets", "voice", "01.wav"), ONE_SECOND_WAV);
    writeFileSync(join(root, "assets", "voice", "02.wav"), ONE_SECOND_WAV);
    const meta: AudioMeta = {
      voices: [
        { id: "01", path: "assets/voice/01.wav", duration_s: 1, words: [] },
        { id: "02", path: "assets/voice/02.wav", duration_s: 1, words: [] },
      ],
    };

    const result = transcribeVoices(meta, root, {
      run(args) {
        const outDir = args[args.indexOf("--dir") + 1];
        const words = args[1].includes("01.wav")
          ? [
              { text: "one", start: 0, end: 0.6 },
              { text: "two", start: 0.7, end: 1.1 },
            ]
          : [
              { text: "one", start: 0, end: 0.6 },
              { text: "two", start: 1.1, end: 1.4 },
            ];
        writeFileSync(join(outDir, "transcript.json"), JSON.stringify(words));
        return 0;
      },
    });

    assert.equal(result.ok, 2);
    assert.deepEqual(meta.voices.map(({ duration_s }) => duration_s), [1, 1]);
    assert.deepEqual(meta.voices.map((voice) => voice.words), [[], []]);
    assert.deepEqual(result.meta.voices.map(({ duration_s }) => duration_s), [1, 1]);
    assert.deepEqual(result.meta.voices[0].words, [
      { id: "w0", text: "one", start: 0, end: 0.6 },
      { id: "w1", text: "two", start: 0.7, end: 1 },
    ]);
    assert.deepEqual(result.meta.voices[1].words, [
      { id: "w0", text: "one", start: 0, end: 0.6 },
      { id: "w1", text: "two", start: 0.7, end: 1 },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe replaces stale longer and shorter JSON durations from every WAV before provider calls", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-duration-"));
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    writeFileSync(join(root, "assets", "voice", "01.wav"), makePcmWav({ sampleRate: 48_000, sampleFrames: 24_000 }));
    writeFileSync(join(root, "assets", "voice", "02.wav"), makePcmWav({ sampleRate: 48_000, sampleFrames: 60_000 }));
    const meta: AudioMeta = {
      voices: [
        { id: "01", path: "assets/voice/01.wav", duration_s: 9, words: [{ id: "old", text: "old", start: 0, end: 9 }] },
        { id: "02", path: "assets/voice/02.wav", duration_s: 0.25, words: [] },
      ],
    };
    const original = structuredClone(meta);
    let calls = 0;

    const result = transcribeVoices(meta, root, {
      run(args) {
        calls += 1;
        const outDir = args[args.indexOf("--dir") + 1];
        const end = args[1].includes("01.wav") ? 0.7 : 1.5;
        writeFileSync(join(outDir, "transcript.json"), JSON.stringify([{ text: "final", start: end - 0.2, end }]));
        return 0;
      },
    });

    assert.equal(calls, 2);
    assert.deepEqual(meta, original);
    assert.deepEqual(result.meta.voices.map((voice) => voice.duration_s), [0.5, 1.25]);
    assert.deepEqual(result.meta.voices.map((voice) => voice.words[0]), [
      { id: "w0", text: "final", start: 0.5, end: 0.5 },
      { id: "w0", text: "final", start: 1.05, end: 1.25 },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe probes every WAV before provider calls and preserves input when a later WAV is invalid", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-preprobe-"));
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    writeFileSync(join(root, "assets", "voice", "01.wav"), ONE_SECOND_WAV);
    writeFileSync(join(root, "assets", "voice", "02.wav"), riffWave([
      { id: "fmt ", data: wavFormatChunk({ formatTag: 6 }) },
      { id: "data", data: Buffer.alloc(2) },
    ]));
    const meta: AudioMeta = {
      voices: [
        { id: "01", path: "assets/voice/01.wav", duration_s: 2, words: [] },
        { id: "02", path: "assets/voice/02.wav", duration_s: 2, words: [] },
      ],
    };
    const original = structuredClone(meta);
    let calls = 0;

    assert.throws(
      () => transcribeVoices(meta, root, { run() { calls += 1; return 0; } }),
      /02\.wav.*unsupported WAVE format/i,
    );
    assert.equal(calls, 0);
    assert.deepEqual(meta, original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe uses the safely floored 17.450666-second WAV extent", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-floor-"));
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    writeFileSync(join(root, "assets", "voice", "latency.wav"), makePcmWav({
      sampleRate: 48_000,
      sampleFrames: 837_632,
    }));
    const meta: AudioMeta = {
      voices: [{ id: "latency", path: "assets/voice/latency.wav", duration_s: 17.451, words: [] }],
    };

    const result = transcribeVoices(meta, root, {
      run(args) {
        const outDir = args[args.indexOf("--dir") + 1];
        writeFileSync(join(outDir, "transcript.json"), JSON.stringify([
          { text: "latency", start: 17.44, end: 17.451 },
        ]));
        return 0;
      },
    });

    assert.equal(result.meta.voices[0].duration_s, 17.450666);
    assert.deepEqual(result.meta.voices[0].words[0], {
      id: "w0",
      text: "latency",
      start: 17.44,
      end: 17.450666,
    });
    assert.equal(meta.voices[0].duration_s, 17.451);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const replacement of ["changed file", "symlink"] as const) {
  test(`transcribe uses pre-provider immutable snapshots when a later WAV becomes a ${replacement}`, () => {
    const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-snapshot-"));
    try {
      mkdirSync(join(root, "assets", "voice"), { recursive: true });
      const firstPath = join(root, "assets", "voice", "01.wav");
      const secondPath = join(root, "assets", "voice", "02.wav");
      const originalSecond = makePcmWav({ sampleRate: 48_000, sampleFrames: 48_000 });
      writeFileSync(firstPath, ONE_SECOND_WAV);
      writeFileSync(secondPath, originalSecond);
      const meta: AudioMeta = {
        voices: [
          { id: "01", path: "assets/voice/01.wav", duration_s: 9, words: [] },
          { id: "02", path: "assets/voice/02.wav", duration_s: 9, words: [] },
        ],
      };
      const originalMeta = structuredClone(meta);
      let snapshotRoot = "";
      let calls = 0;

      const result = transcribeVoices(meta, root, {
        run(args, options) {
          calls += 1;
          snapshotRoot = options?.cwd ?? "";
          assert.notEqual(snapshotRoot, root);
          assert.deepEqual(readFileSync(join(snapshotRoot, args[1])), args[1].includes("02.wav") ? originalSecond : ONE_SECOND_WAV);
          if (calls === 1) {
            if (replacement === "changed file") {
              writeFileSync(secondPath, makePcmWav({ sampleRate: 48_000, sampleFrames: 96_000 }));
            } else {
              const outside = join(root, "outside.wav");
              writeFileSync(outside, makePcmWav({ sampleRate: 48_000, sampleFrames: 96_000 }));
              rmSync(secondPath);
              symlinkSync(outside, secondPath);
            }
          }
          const outDir = args[args.indexOf("--dir") + 1];
          writeFileSync(join(outDir, "transcript.json"), JSON.stringify([
            { text: args[1].includes("01.wav") ? "one" : "two", start: 0, end: 1 },
          ]));
          return 0;
        },
      });

      assert.equal(calls, 2);
      assert.deepEqual(meta, originalMeta);
      assert.deepEqual(result.meta.voices.map((voice) => voice.duration_s), [1, 1]);
      assert.notEqual(snapshotRoot, "");
      assert.equal(existsSync(snapshotRoot), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("normalization never rounds a valid seventh-decimal end above duration", () => {
  const duration_s = 0.9999996;
  const words = normalizeTranscriptWords(
    [
      { text: "one", start: 0, end: 0.5 },
      { text: "two", start: 0.5, end: duration_s },
    ],
    { id: "precision", duration_s },
  );

  assert.equal(words[1].end, duration_s);
  assert.ok(words[1].end <= duration_s);
});

test("normalization clamps a shifted seventh-decimal final interval without rounding upward", () => {
  const duration_s = 0.9999996;
  const words = normalizeTranscriptWords(
    [
      { text: "one", start: 0, end: 0.5 },
      { text: "two", start: 1.1, end: 1.2 },
    ],
    { id: "precision", duration_s },
  );

  assert.deepEqual(words[1], {
    id: "w1",
    text: "two",
    start: 0.9,
    end: duration_s,
  });
  assert.ok(words[1].start <= words[1].end);
  assert.ok(words[1].end <= duration_s);
});

test("transcribe rejects materially invalid middle intervals without partial mutation", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-"));
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    writeFileSync(join(root, "assets", "voice", "01.wav"), ONE_SECOND_WAV);
    writeFileSync(join(root, "assets", "voice", "02.wav"), ONE_SECOND_WAV);
    const meta: AudioMeta = {
      voices: [
        { id: "01", path: "assets/voice/01.wav", duration_s: 9, words: [] },
        { id: "02", path: "assets/voice/02.wav", duration_s: 8, words: [] },
      ],
    };
    const original = structuredClone(meta);

    assert.throws(
      () => transcribeVoices(meta, root, {
        run(args) {
          const outDir = args[args.indexOf("--dir") + 1];
          const voice = args[1].includes("01.wav")
            ? [{ text: "valid", start: 0, end: 0.5 }]
            : [
                { text: "bad", start: 0, end: 1.1 },
                { text: "middle", start: 1.1, end: 1.2 },
              ];
          writeFileSync(join(outDir, "transcript.json"), JSON.stringify(voice));
          return 0;
        },
      }),
      /voice "02".*word "w0".*duration/i,
    );
    assert.deepEqual(meta, original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe validates voice headers, IDs, and paths before any provider call", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-invalid-meta-"));
  try {
    let calls = 0;
    const run = () => {
      calls += 1;
      return 0;
    };
    const cases: Array<[AudioMeta, RegExp]> = [
      [{ voices: [{ id: "", path: "assets/voice/01.wav", duration_s: 1, words: [] }] }, /id.*non-empty/i],
      [{ voices: [
        { id: "same", path: "assets/voice/01.wav", duration_s: 1, words: [] },
        { id: "same", path: "assets/voice/02.wav", duration_s: 1, words: [] },
      ] }, /duplicate voice id/i],
      [{ voices: [{ id: "intro", path: "assets\\voice\\intro.wav", duration_s: 1, words: [] }] }, /path.*portable.*\.wav/i],
    ];

    for (const [meta, expected] of cases) {
      assert.throws(() => transcribeVoices(meta, root, { run }), expected);
    }
    assert.equal(calls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe rejects a symlinked voice source before any provider call", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-symlink-"));
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    const outside = join(root, "outside.wav");
    writeFileSync(outside, ONE_SECOND_WAV);
    symlinkSync(outside, join(root, "assets", "voice", "intro.wav"));
    const meta: AudioMeta = {
      voices: [{ id: "intro", path: "assets/voice/intro.wav", duration_s: 1, words: [] }],
    };
    let calls = 0;

    assert.throws(
      () => transcribeVoices(meta, root, { run() { calls += 1; return 0; } }),
      /symlink component/i,
    );
    assert.equal(calls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe rejects a missing WAV before invoking a provider", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-"));
  try {
    const meta: AudioMeta = {
      voices: [
        { id: "01", path: "assets/voice/01.wav", duration_s: 1, words: [] },
      ],
    };
    let called = false;

    assert.throws(
      () => transcribeVoices(meta, root, {
        run() {
          called = true;
          return 0;
        },
      }),
      /missing voice asset.*01\.wav/i,
    );

    assert.equal(called, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe removes the temp directory after a nonzero runner status", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-"));
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    writeFileSync(join(root, "assets", "voice", "01.wav"), ONE_SECOND_WAV);
    const meta: AudioMeta = {
      voices: [
        { id: "01", path: "assets/voice/01.wav", duration_s: 9, words: [] },
      ],
    };
    const original = structuredClone(meta);
    let outDir = "";

    const result = transcribeVoices(meta, root, {
      run(args) {
        outDir = args[args.indexOf("--dir") + 1];
        return 7;
      },
    });

    assert.equal(result.meta, meta);
    assert.equal(result.ok, 0);
    assert.equal(result.total, 1);
    assert.equal(result.voiceSnapshots.length, 1);
    assert.deepEqual(result.voiceSnapshots[0]!.readBytes(), ONE_SECOND_WAV);
    assert.deepEqual(meta, original);
    assert.notEqual(outDir, "");
    assert.equal(existsSync(outDir), false);
    assert.equal(existsSync(dirname(outDir)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe removes the temp directory when the runner throws", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-"));
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    writeFileSync(join(root, "assets", "voice", "01.wav"), ONE_SECOND_WAV);
    const meta: AudioMeta = {
      voices: [
        { id: "01", path: "assets/voice/01.wav", duration_s: 9, words: [] },
      ],
    };
    const original = structuredClone(meta);
    let outDir = "";

    assert.throws(
      () => transcribeVoices(meta, root, {
        run(args) {
          outDir = args[args.indexOf("--dir") + 1];
          throw new Error("runner failed");
        },
      }),
      /runner failed/,
    );
    assert.deepEqual(meta, original);
    assert.notEqual(outDir, "");
    assert.equal(existsSync(outDir), false);
    assert.equal(existsSync(dirname(outDir)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
