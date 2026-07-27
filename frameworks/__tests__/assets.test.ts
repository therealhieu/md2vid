import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { test } from "node:test";
import {
  collectVoicePaths,
  stageVoiceAssets,
  validateVoicePath,
} from "../assets.ts";

const invalidVoicePaths = [
  "",
  "/tmp/voice.wav",
  "C:\\voice.wav",
  "assets/voice/../escape.wav",
  "assets\\voice\\..\\escape.wav",
  "../assets/voice/01.wav",
  "assets/music/01.wav",
  "assets/voice/01.mp3",
  "assets/voice/bad name.wav",
  "assets/voice/%2e%2e/escape.wav",
  "assets/voice/intro:.wav",
  "assets/voice//01.wav",
  "assets/voice/./01.wav",
  "assets/voice/",
];

for (const invalid of invalidVoicePaths) {
  test(`rejects unsafe voice path: ${JSON.stringify(invalid)}`, () => {
    assert.throws(() => validateVoicePath(invalid), /voice asset path/);
  });
}

test("accepts a nested portable WAV path", () => {
  assert.equal(
    validateVoicePath("assets/voice/chapter/01.wav"),
    "assets/voice/chapter/01.wav",
  );
});

test("rejects backslash-separated voice paths instead of normalizing them", () => {
  assert.throws(
    () => validateVoicePath("assets\\voice\\chapter\\01.wav"),
    /voice asset path/,
  );
});

test("deduplicates portable voice paths while preserving first-seen order", () => {
  assert.deepEqual(
    collectVoicePaths([
      { voicePath: "assets/voice/01.wav" },
      { voicePath: "assets/voice/02.wav" },
      { voicePath: "assets/voice/01.wav" },
    ]),
    ["assets/voice/01.wav", "assets/voice/02.wav"],
  );
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), "md2vid-voice-stage-"));
  const shared = join(root, "shared");
  const output = join(root, "output");
  mkdirSync(join(shared, "assets", "voice"), { recursive: true });
  mkdirSync(join(output, "assets", "voice"), { recursive: true });
  return { root, shared, output };
}

function transactionResidue(destinationRoot: string): string[] {
  const assets = join(destinationRoot, "assets");
  if (!existsSync(assets)) return [];
  return readdirSync(assets).filter((entry) => entry.includes("md2vid-tx"));
}

test("stages the complete set under the concrete managed destination and removes stale files", () => {
  const { root, shared, output } = setup();
  try {
    writeFileSync(join(shared, "assets", "voice", "01.wav"), "NEW01");
    mkdirSync(join(shared, "assets", "voice", "chapter"));
    writeFileSync(join(shared, "assets", "voice", "chapter", "02.wav"), "NEW02");
    writeFileSync(join(output, "assets", "voice", "stale.wav"), "STALE");

    stageVoiceAssets({
      framework: "hyperframes",
      voicePaths: ["assets/voice/01.wav", "assets/voice/chapter/02.wav"],
      sourceRoot: shared,
      destinationRoot: output,
    });

    assert.equal(readFileSync(join(output, "assets", "voice", "01.wav"), "utf8"), "NEW01");
    assert.equal(
      readFileSync(join(output, "assets", "voice", "chapter", "02.wav"), "utf8"),
      "NEW02",
    );
    assert.equal(existsSync(join(output, "assets", "voice", "stale.wav")), false);
    assert.equal(existsSync(join(output, "chapter", "02.wav")), false);
    assert.deepEqual(transactionResidue(output), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uses destinationRoot as the concrete root for the managed directory", () => {
  const { root, shared, output } = setup();
  try {
    const publicRoot = join(output, "public");
    writeFileSync(join(shared, "assets", "voice", "01.wav"), "VOICE");

    stageVoiceAssets({
      framework: "remotion",
      voicePaths: ["assets/voice/01.wav"],
      sourceRoot: shared,
      destinationRoot: publicRoot,
    });

    assert.equal(
      readFileSync(join(publicRoot, "assets", "voice", "01.wav"), "utf8"),
      "VOICE",
    );
    assert.equal(existsSync(join(output, "assets", "voice", "01.wav")), false);
    assert.deepEqual(transactionResidue(publicRoot), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("flat layout validates in place without copying, pruning, or starting a transaction", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-voice-flat-"));
  try {
    mkdirSync(join(root, "assets", "voice"), { recursive: true });
    const wav = join(root, "assets", "voice", "01.wav");
    const sentinel = join(root, "assets", "voice", "sentinel.wav");
    writeFileSync(wav, "FLAT");
    writeFileSync(sentinel, "KEEP");
    const before = lstatSync(wav);
    let renameCalls = 0;

    stageVoiceAssets({
      framework: "hyperframes",
      voicePaths: ["assets/voice/01.wav"],
      sourceRoot: root,
      destinationRoot: root,
      fs: {
        rename() {
          renameCalls += 1;
          throw new Error("flat layout must not rename");
        },
      },
    });

    const after = lstatSync(wav);
    assert.equal(readFileSync(wav, "utf8"), "FLAT");
    assert.equal(readFileSync(sentinel, "utf8"), "KEEP");
    assert.equal(after.ino, before.ino);
    assert.equal(renameCalls, 0);
    assert.deepEqual(transactionResidue(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing source preserves the prior managed voice set without transaction residue", () => {
  const { root, shared, output } = setup();
  try {
    writeFileSync(join(output, "assets", "voice", "prior.wav"), "PRIOR");

    assert.throws(
      () =>
        stageVoiceAssets({
          framework: "hyperframes",
          voicePaths: ["assets/voice/missing.wav"],
          sourceRoot: shared,
          destinationRoot: output,
        }),
      /FAIL \[hyperframes:emit\]: missing voice asset assets\/voice\/missing\.wav/,
    );

    assert.equal(readFileSync(join(output, "assets", "voice", "prior.wav"), "utf8"), "PRIOR");
    assert.deepEqual(transactionResidue(output), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a source directory as a non-regular voice file", () => {
  const { root, shared, output } = setup();
  try {
    mkdirSync(join(shared, "assets", "voice", "dir.wav"));

    assert.throws(
      () =>
        stageVoiceAssets({
          framework: "remotion",
          voicePaths: ["assets/voice/dir.wav"],
          sourceRoot: shared,
          destinationRoot: output,
        }),
      /FAIL \[remotion:emit\]: voice asset is not a regular file/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a final source symlink", () => {
  const { root, shared, output } = setup();
  try {
    writeFileSync(join(shared, "target.wav"), "TARGET");
    symlinkSync(join(shared, "target.wav"), join(shared, "assets", "voice", "link.wav"));

    assert.throws(
      () =>
        stageVoiceAssets({
          framework: "remotion",
          voicePaths: ["assets/voice/link.wav"],
          sourceRoot: shared,
          destinationRoot: output,
        }),
      /FAIL \[remotion:emit\]: voice asset path contains a symlink component/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a final destination symlink before mutation", () => {
  const { root, shared, output } = setup();
  try {
    writeFileSync(join(shared, "assets", "voice", "01.wav"), "NEW");
    const outside = join(root, "outside.wav");
    writeFileSync(outside, "OUTSIDE");
    symlinkSync(outside, join(output, "assets", "voice", "01.wav"));

    assert.throws(
      () =>
        stageVoiceAssets({
          framework: "hyperframes",
          voicePaths: ["assets/voice/01.wav"],
          sourceRoot: shared,
          destinationRoot: output,
        }),
      /FAIL \[hyperframes:emit\]: voice asset path contains a symlink component/,
    );
    assert.equal(readFileSync(outside, "utf8"), "OUTSIDE");
    assert.deepEqual(transactionResidue(output), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a symlinked source ancestor in canonical and flat layouts", () => {
  const { root, shared, output } = setup();
  try {
    const outside = join(root, "outside-source");
    mkdirSync(outside);
    writeFileSync(join(outside, "01.wav"), "OUTSIDE");
    symlinkSync(outside, join(shared, "assets", "voice", "external"));

    for (const destinationRoot of [output, shared]) {
      assert.throws(
        () =>
          stageVoiceAssets({
            framework: "hyperframes",
            voicePaths: ["assets/voice/external/01.wav"],
            sourceRoot: shared,
            destinationRoot,
          }),
        /FAIL \[hyperframes:emit\]: voice asset path contains a symlink component/,
      );
      assert.deepEqual(transactionResidue(destinationRoot), []);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a symlinked destination ancestor before any destination mutation", () => {
  const { root, shared, output } = setup();
  try {
    writeFileSync(join(shared, "assets", "voice", "01.wav"), "VOICE");
    const outside = join(root, "outside-destination");
    mkdirSync(outside);
    rmSync(join(output, "assets"), { recursive: true, force: true });
    symlinkSync(outside, join(output, "assets"));

    assert.throws(
      () =>
        stageVoiceAssets({
          framework: "hyperframes",
          voicePaths: ["assets/voice/01.wav"],
          sourceRoot: shared,
          destinationRoot: output,
        }),
      /FAIL \[hyperframes:emit\]: voice asset path contains a symlink component/,
    );
    assert.deepEqual(readdirSync(outside), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("promotion second-rename failure restores the prior directory and removes residue", () => {
  const { root, shared, output } = setup();
  try {
    writeFileSync(join(shared, "assets", "voice", "01.wav"), "NEW");
    writeFileSync(join(output, "assets", "voice", "prior.wav"), "PRIOR");
    let renameCalls = 0;

    assert.throws(
      () =>
        stageVoiceAssets({
          framework: "hyperframes",
          voicePaths: ["assets/voice/01.wav"],
          sourceRoot: shared,
          destinationRoot: output,
          fs: {
            rename(source, destination) {
              renameCalls += 1;
              if (renameCalls === 2) throw new Error("promote fixture failure");
              renameSync(source, destination);
            },
          },
        }),
      /promote fixture failure/,
    );

    assert.equal(renameCalls, 3);
    assert.equal(readFileSync(join(output, "assets", "voice", "prior.wav"), "utf8"), "PRIOR");
    assert.equal(existsSync(join(output, "assets", "voice", "01.wav")), false);
    assert.deepEqual(transactionResidue(output), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("failed promotion and failed restoration retain the recoverable backup", () => {
  const { root, shared, output } = setup();
  try {
    writeFileSync(join(shared, "assets", "voice", "01.wav"), "NEW");
    writeFileSync(join(output, "assets", "voice", "prior.wav"), "PRIOR");
    let renameCalls = 0;
    let thrown: unknown;

    try {
      stageVoiceAssets({
        framework: "hyperframes",
        voicePaths: ["assets/voice/01.wav"],
        sourceRoot: shared,
        destinationRoot: output,
        fs: {
          rename(source, destination) {
            renameCalls += 1;
            if (renameCalls === 2) throw new Error("promote fixture failure");
            if (renameCalls === 3) throw new Error("restore fixture failure");
            renameSync(source, destination);
          },
        },
      });
    } catch (error) {
      thrown = error;
    }

    assert.equal(renameCalls, 3);
    assert.ok(thrown instanceof AggregateError);
    assert.deepEqual(
      thrown.errors.map((error) => (error as Error).message),
      ["promote fixture failure", "restore fixture failure"],
    );
    const match = /retained backup at (.+)$/.exec(thrown.message);
    assert.ok(match);
    const retainedBackup = match[1];
    assert.equal(isAbsolute(retainedBackup), true);
    assert.equal(readFileSync(join(retainedBackup, "prior.wav"), "utf8"), "PRIOR");
    assert.equal(existsSync(join(output, "assets", "voice")), false);
    assert.equal(transactionResidue(output).length, 1);
    assert.equal(existsSync(dirname(retainedBackup)), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
