import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createNarrationEvidence } from "../../engine/narration_evidence.ts";
import { validateVersionedNarrationRequest } from "../../engine/narration_request.ts";
import { captureVoiceWavSnapshots } from "../../engine/voice_assets.ts";
import { run } from "../../scripts/plan.ts";
import { makePcmWav } from "../helpers/wav.ts";

function captureRun(argv: string[], dependencies?: Parameters<typeof run>[1]): {
  code: number;
  stdout: string;
  stderr: string;
  warnings: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const warnings: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  try {
    console.log = (...args: unknown[]) => stdout.push(args.join(" "));
    console.error = (...args: unknown[]) => stderr.push(args.join(" "));
    console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
    return { code: run(argv, dependencies), stdout: stdout.join("\n"), stderr: stderr.join("\n"), warnings };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
}

function seedNeutralInputs(sharedDir: string): void {
  mkdirSync(join(sharedDir, "assets", "voice"), { recursive: true });
  writeFileSync(join(sharedDir, "assets", "voice", "intro.wav"), makePcmWav({
    sampleRate: 48_000,
    sampleFrames: 48_000,
  }));
  writeFileSync(join(sharedDir, "audio_meta.json"), `${JSON.stringify({
    voices: [{
      id: "intro",
      path: "assets/voice/intro.wav",
      duration_s: 1,
      words: [{ text: "Intro", start: 0, end: 1 }],
    }],
  }, null, 2)}\n`);
  writeFileSync(join(sharedDir, "video.config.json"), `${JSON.stringify({
    slugs: { intro: "01-intro" },
    visualSync: { mode: "off" },
  }, null, 2)}\n`);
}

function seedVersionedInputs(sharedDir: string): void {
  seedNeutralInputs(sharedDir);
  const request = validateVersionedNarrationRequest({
    version: 1,
    provider: "kokoro",
    voice: "am_michael",
    lang: "en",
    speed: 0.9,
    lines: [{ id: "intro", text: "Introduce the topic." }],
  }, join(sharedDir, "audio_request.json"));
  const meta = {
    tts_provider: "kokoro",
    voice_id: "am_michael",
    voices: [{
      id: "intro",
      path: "assets/voice/intro.wav",
      duration_s: 1,
      words: [{ text: "Intro", start: 0, end: 1 }],
    }],
  };
  const snapshots = captureVoiceWavSnapshots(sharedDir, meta.voices.map((voice) => voice.path));
  const evidence = createNarrationEvidence({
    request,
    meta,
    snapshots,
    metadataPath: join(sharedDir, "audio_meta.json"),
  });
  writeFileSync(join(sharedDir, "audio_request.json"), `${JSON.stringify(request, null, 2)}\n`);
  writeFileSync(join(sharedDir, "audio_meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  writeFileSync(join(sharedDir, "narration_evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
}

test("plan writes only neutral artifacts in a flat project", () => {
  const project = mkdtempSync(join(tmpdir(), "md2vid-plan-flat-"));
  try {
    const frame = join(project, "compositions", "frames", "01-intro.html");
    mkdirSync(join(project, "compositions", "frames"), { recursive: true });
    writeFileSync(frame, "AUTHORED FRAME\n");
    seedNeutralInputs(project);
    const beforeFrame = readFileSync(frame);

    assert.equal(run([project]), 0);
    for (const path of [
      "cues.json",
      "caption_groups.json",
      "build/build_plan.json",
      "build/visual_timing.json",
    ]) assert.equal(existsSync(join(project, path)), true, path);
    assert.deepEqual(readFileSync(frame), beforeFrame);
    assert.equal(existsSync(join(project, "index.html")), false);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("plan targets sibling shared in canonical layout", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-plan-canonical-"));
  const sharedDir = join(root, "shared");
  const hyperframesOutput = join(root, "hyperframes");
  try {
    mkdirSync(hyperframesOutput, { recursive: true });
    seedNeutralInputs(sharedDir);

    assert.equal(run([hyperframesOutput]), 0);
    assert.equal(existsSync(join(sharedDir, "build", "visual_timing.json")), true);
    assert.equal(existsSync(join(hyperframesOutput, "build", "visual_timing.json")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plan rejects stale versioned narration before changing neutral outputs", () => {
  const project = mkdtempSync(join(tmpdir(), "md2vid-plan-stale-narration-"));
  try {
    seedVersionedInputs(project);
    const requestPath = join(project, "audio_request.json");
    const request = JSON.parse(readFileSync(requestPath, "utf8"));
    request.speed = 1;
    writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`);
    mkdirSync(join(project, "build"), { recursive: true });
    const outputs = new Map([
      [join(project, "cues.json"), "ORIGINAL_CUES\n"],
      [join(project, "caption_groups.json"), "ORIGINAL_CAPTIONS\n"],
      [join(project, "build", "build_plan.json"), "ORIGINAL_PLAN\n"],
      [join(project, "build", "visual_timing.json"), "ORIGINAL_VISUAL_TIMING\n"],
    ]);
    for (const [path, bytes] of outputs) writeFileSync(path, bytes);

    const result = captureRun([project]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /request digest.*Re-synthesize narration and rerun `md2vid transcribe`/);
    for (const [path, bytes] of outputs) assert.equal(readFileSync(path, "utf8"), bytes, path);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("plan reports help and argument errors without mutation", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-plan-args-"));
  try {
    const before = readdirSync(root);
    const help = captureRun(["--help"]);
    assert.equal(help.code, 0);
    assert.equal(help.stdout, "Usage: md2vid plan <video-dir>");
    assert.equal(help.stderr, "");

    for (const argv of [[root, "extra"], [root, "--unknown"]]) {
      const result = captureRun(argv);
      assert.equal(result.code, 2, argv.join(" "));
      assert.match(result.stderr, /Usage: md2vid plan/);
    }
    const missing = captureRun([join(root, "missing")]);
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /not a directory/);
    assert.deepEqual(readdirSync(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plan rolls back all four neutral artifacts after promotion failure", () => {
  const project = mkdtempSync(join(tmpdir(), "md2vid-plan-rollback-"));
  try {
    seedNeutralInputs(project);
    mkdirSync(join(project, "build"), { recursive: true });
    const originals = new Map([
      [join(project, "cues.json"), "OLD_CUES\n"],
      [join(project, "caption_groups.json"), "OLD_CAPTIONS\n"],
      [join(project, "build", "build_plan.json"), "OLD_PLAN\n"],
      [join(project, "build", "visual_timing.json"), "OLD_VISUAL_TIMING\n"],
    ]);
    for (const [path, contents] of originals) writeFileSync(path, contents);

    const result = captureRun([project], {
      transactionDependencies: {
        rename(source, destination) {
          if (String(source).includes(".md2vid-plan-")) throw new Error("injected plan promotion failure");
          writeFileSync(destination, readFileSync(source));
          rmSync(source);
        },
      },
    });

    assert.equal(result.code, 1);
    assert.match(result.stderr, /injected plan promotion failure/);
    for (const [path, contents] of originals) assert.equal(readFileSync(path, "utf8"), contents, path);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("invalid visual beats leave no partial neutral artifacts", () => {
  const project = mkdtempSync(join(tmpdir(), "md2vid-plan-invalid-beats-"));
  try {
    seedNeutralInputs(project);
    writeFileSync(join(project, "video.config.json"), `${JSON.stringify({
      slugs: { intro: "01-intro" },
      visualSync: { mode: "required" },
    }, null, 2)}\n`);
    writeFileSync(join(project, "visual_beats.json"), "{ invalid JSON");

    const result = captureRun([project]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /visual_beats\.json: invalid JSON/);
    for (const path of [
      "cues.json",
      "caption_groups.json",
      "build/build_plan.json",
      "build/visual_timing.json",
    ]) assert.equal(existsSync(join(project, path)), false, path);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
