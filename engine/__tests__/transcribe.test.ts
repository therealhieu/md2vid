import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transcribeVoices } from "../transcribe.ts";
import type { AudioMeta } from "../types.ts";

test("transcribe invokes the package-owned runner once per existing WAV", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-"));
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    writeFileSync(join(root, "assets", "voice", "01.wav"), "RIFF");
    writeFileSync(join(root, "assets", "voice", "02.wav"), "RIFF");
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
    for (const outDir of outDirs) {
      assert.ok(outDir.startsWith(join(tmpdir(), "hf-trans-")));
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
        cwd: root,
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
        cwd: root,
      },
    ]);
    assert.equal(result.ok, 2);
    assert.deepEqual(meta.voices[0].words, [
      { id: "w0", text: "hello", start: 0, end: 0.5 },
      { id: "w1", text: "world", start: 0.5, end: 1 },
    ]);
    for (const outDir of outDirs) {
      assert.equal(existsSync(outDir), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe does not invoke a child for a missing WAV", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-"));
  try {
    const meta: AudioMeta = {
      voices: [
        { id: "01", path: "assets/voice/01.wav", duration_s: 1, words: [] },
      ],
    };
    let called = false;

    const result = transcribeVoices(meta, root, {
      run() {
        called = true;
        return 0;
      },
    });

    assert.equal(called, false);
    assert.deepEqual(result, { meta, ok: 0, total: 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe removes the temp directory after a nonzero runner status", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-"));
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    writeFileSync(join(root, "assets", "voice", "01.wav"), "RIFF");
    const meta: AudioMeta = {
      voices: [
        { id: "01", path: "assets/voice/01.wav", duration_s: 1, words: [] },
      ],
    };
    let outDir = "";

    const result = transcribeVoices(meta, root, {
      run(args) {
        outDir = args[args.indexOf("--dir") + 1];
        return 7;
      },
    });

    assert.deepEqual(result, { meta, ok: 0, total: 1 });
    assert.notEqual(outDir, "");
    assert.equal(existsSync(outDir), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe removes the temp directory when the runner throws", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-transcribe-"));
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    writeFileSync(join(root, "assets", "voice", "01.wav"), "RIFF");
    const meta: AudioMeta = {
      voices: [
        { id: "01", path: "assets/voice/01.wav", duration_s: 1, words: [] },
      ],
    };
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
    assert.notEqual(outDir, "");
    assert.equal(existsSync(outDir), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
