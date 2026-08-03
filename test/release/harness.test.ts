import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, parse, relative } from "node:path";
import { gzipSync } from "node:zlib";
import {
  addDiagnosticSensitivePaths,
  assertCliVersionMatchesPackageMetadata,
  assertNoRepoRelativePaths,
  assertPackedFiles,
  assertRegistryIntegrity,
  createReleaseContext,
  deriveSmokeCoverageChecks,
  deriveSmokeRevealChecks,
  finishReleaseContext,
  packArtifact,
  packedFileListing,
  pollRegistryIntegrity,
  registryInstallArguments,
  requiredHyperframesVersion,
  installRegistryArtifact,
  verifyRegistryArtifact,
  installedBinInvocation,
  installedCommandEnvironment,
  listTarGzEntries,
  localNpmExecInvocation,
  mergeEnvironment,
  parseGsapUrls,
  parseVoiceUrls,
  REPO_ROOT,
  RETAINED_NARRATION_STAGES,
  RetainedNarrationStageSequence,
  runInstalledCli,
  runStage,
  runWithHyperframesReadinessRetry,
  skillInstallTarget,
  stopProcessTree,
  terminateProcessTree,
  useSuppliedArtifact,
  validateRetainedAbsoluteWords,
  waitForExit,
  withPackLock,
  type CommandRunner,
} from "./harness.ts";
import { FORBIDDEN_PACKED_FILES, REQUIRED_PACKED_FILES } from "./manifest.ts";
import { readPackageManagerMetadata } from "../../scripts/package_root.ts";
import { HYPERFRAMES_VERSION } from "../../scripts/dependency_versions.ts";
import { captureVoiceWavSnapshot } from "../../engine/voice_assets.ts";
import {
  currentNpmVersion,
  parseReleaseArguments,
  resolveDiagnosticsDirectory,
  runRelease,
  USAGE,
} from "./run.ts";
import { createArtifactMetadata, writeArtifactMetadata } from "./artifact.ts";

const PACKAGE_METADATA = readPackageManagerMetadata(import.meta.url);
const PACKAGE_VERSION = PACKAGE_METADATA.version;
const PACKAGE_TAG = `v${PACKAGE_VERSION}`;
const PACKAGE_TARBALL = `md2vid-${PACKAGE_VERSION}.tgz`;
const NPM_VERSION = PACKAGE_METADATA.packageManager.slice("npm@".length);

test("release smoke status reports generated check scripts for both frameworks", () => {
  const source = readFileSync(join(import.meta.dirname, "run.ts"), "utf8");
  assert.match(source, /smoke:hyperframes[^\n]*generated build\/check.*browser.*render/i);
  assert.match(source, /smoke:remotion[^\n]*generated build\/check\/still/);
  assert.doesNotMatch(source, /build\/typecheck\/still/);
});

test("packed release narration declares and enforces its semantic stage order", async () => {
  assert.deepEqual(RETAINED_NARRATION_STAGES, [
    "assert scaffold audio_request.json.example",
    "copy versioned retained fixture request",
    "run installed narration-check",
    "capture test-owned media arguments",
    "copy retained Kokoro/Michael WAVs",
    "run installed transcribe with injected transcript provider",
    "assert narration_evidence.json",
    "mutate spoken text and prove planning rejects stale evidence",
    "restore request",
    "build/check HyperFrames",
    "build/check Remotion",
  ]);
  const sequence = new RetainedNarrationStageSequence();
  await sequence.run(RETAINED_NARRATION_STAGES[0], () => undefined);
  await assert.rejects(
    sequence.run(RETAINED_NARRATION_STAGES[2], () => undefined),
    /must run after copy versioned retained fixture request/,
  );

  const hyperframesSequence = new RetainedNarrationStageSequence();
  for (const stage of RETAINED_NARRATION_STAGES.slice(0, 10)) {
    await hyperframesSequence.run(stage, () => undefined);
  }
  assert.doesNotThrow(() => hyperframesSequence.complete("build/check HyperFrames"));

  const remotionSequence = new RetainedNarrationStageSequence();
  for (const stage of RETAINED_NARRATION_STAGES.slice(0, 9)) {
    await remotionSequence.run(stage, () => undefined);
  }
  await remotionSequence.run("build/check Remotion", () => undefined);
  assert.doesNotThrow(() => remotionSequence.complete("build/check Remotion"));

  const status = readFileSync(join(import.meta.dirname, "run.ts"), "utf8");
  assert.match(status, /fixture-backed Kokoro am_michael narration evidence/);
  assert.doesNotMatch(status, /fresh Kokoro synthesis/);
});

test("retained Kokoro fixture preserves actual WAV and absolute transcript integrity", () => {
  const fixtureRoot = join(REPO_ROOT, "test", "release", "fixtures", "kokoro-am-michael");
  const fixture = JSON.parse(readFileSync(join(fixtureRoot, "fixture.json"), "utf8")) as {
    version: number;
    kind: string;
    freshSynthesisDuringTest: boolean;
    freshTranscriptionDuringTest: boolean;
    provider: string;
    voice: string;
    requestedSpeed: number;
    transcriptSource: string;
    transcriptSha256: string;
    sourceLines: Record<string, string>;
    wavSha256: Record<string, string>;
  };
  assert.deepEqual({
    version: fixture.version,
    kind: fixture.kind,
    freshSynthesisDuringTest: fixture.freshSynthesisDuringTest,
    freshTranscriptionDuringTest: fixture.freshTranscriptionDuringTest,
    provider: fixture.provider,
    voice: fixture.voice,
    requestedSpeed: fixture.requestedSpeed,
    transcriptSource: fixture.transcriptSource,
  }, {
    version: 1,
    kind: "retained-kokoro-fixture",
    freshSynthesisDuringTest: false,
    freshTranscriptionDuringTest: false,
    provider: "kokoro",
    voice: "am_michael",
    requestedSpeed: 0.9,
    transcriptSource: "retained-md2vid-transcribe",
  });
  assert.deepEqual(fixture.sourceLines, {
    intro: "Introduce the topic.",
    followup: "Recap the key idea.",
  });

  for (const [relativePath, expected] of Object.entries(fixture.wavSha256)) {
    const actual = createHash("sha256").update(readFileSync(join(fixtureRoot, relativePath))).digest("hex");
    assert.equal(actual, expected, `retained WAV hash ${relativePath}`);
  }
  const transcriptBytes = readFileSync(join(fixtureRoot, "expected_words.json"));
  assert.equal(createHash("sha256").update(transcriptBytes).digest("hex"), fixture.transcriptSha256);

  const request = JSON.parse(readFileSync(join(fixtureRoot, "audio_request.json"), "utf8"));
  assert.deepEqual(request, {
    version: 1,
    provider: "kokoro",
    voice: "am_michael",
    lang: "en",
    speed: 0.9,
    lines: [
      { id: "intro", text: "Introduce the topic." },
      { id: "followup", text: "Recap the key idea." },
    ],
  });
  const metadata = JSON.parse(readFileSync(join(fixtureRoot, "audio_meta.json"), "utf8")) as {
    tts_provider: string;
    voice_id: string;
    voices: Array<{ id: string; path: string; duration_s: number; words: unknown[] }>;
  };
  assert.equal(metadata.tts_provider, "kokoro");
  assert.equal(metadata.voice_id, "am_michael");
  const expectedWords = JSON.parse(transcriptBytes.toString("utf8")) as Record<string, Array<{
    id: string;
    text: string;
    start: number;
    end: number;
    [field: string]: unknown;
  }>>;
  assert.deepEqual(Object.keys(expectedWords), metadata.voices.map((voice) => voice.id));
  for (const voice of metadata.voices) {
    assert.deepEqual(voice.words, [], `${voice.id} must retain pre-transcription metadata`);
    const snapshot = captureVoiceWavSnapshot(fixtureRoot, voice.path);
    assert.equal(voice.duration_s, snapshot.duration_s, `${voice.id} safe WAV duration`);
    const words = expectedWords[voice.id];
    assert.ok(Array.isArray(words) && words.length > 0, `${voice.id} retained transcript must be non-empty`);
    assert.deepEqual(
      validateRetainedAbsoluteWords(voice.id, words, snapshot.duration_s),
      words,
      `${voice.id} must retain only ordered, safe absolute word timing`,
    );
  }
});

test("retained transcript validation rejects an alternative proportional timing field before replay", () => {
  assert.throws(
    () => validateRetainedAbsoluteWords("intro", [{
      id: "w0",
      text: "Introduce",
      start: 0.13,
      end: 0.7,
      timeRatio: 0.5,
    }], 1.792),
    /must contain only id, text, start, and end/,
  );
});

test("HyperFrames smoke retries one exact zero-duration readiness failure", () => {
  let attempts = 0;
  let cleanups = 0;
  runWithHyperframesReadinessRetry(
    () => {
      attempts++;
      if (attempts === 1) {
        const error = new Error("render failed") as Error & { stderr: string };
        error.stderr = "[FrameCapture] Composition has zero duration.";
        throw error;
      }
    },
    () => { cleanups++; },
  );
  assert.equal(attempts, 2);
  assert.equal(cleanups, 1);
});

test("HyperFrames smoke does not retry unrelated or repeated failures", () => {
  for (const stderr of ["FFmpeg not found", "[FrameCapture] Composition has zero duration."]) {
    let attempts = 0;
    const expectedAttempts = stderr.includes("zero duration") ? 2 : 1;
    assert.throws(() => runWithHyperframesReadinessRetry(() => {
      attempts++;
      const error = new Error("render failed") as Error & { stderr: string };
      error.stderr = stderr;
      throw error;
    }));
    assert.equal(attempts, expectedAttempts);
  }
});

test("HyperFrames smoke derives semantic coverage seek samples from manifest intervals", () => {
  const source = readFileSync(join(import.meta.dirname, "harness.ts"), "utf8");
  assert.match(source, /coverageStart/);
  assert.match(source, /coverageEnd/);
  assert.match(source, /binding\.coverageStart - 0\.01/);
  assert.match(source, /binding\.coverageEnd - 0\.01/);
  assert.match(source, /direct.*sequential.*reverse/s);
  assert.match(source, /voiceDur.*frameDur|frameDur.*voiceDur/s);
});

test("HyperFrames smoke coverage probes include before start inside before-end and end", () => {
  const checks = deriveSmokeCoverageChecks(
    [
      { slug: "01-smoke", start: 0, frameDur: 4 },
      { slug: "02-smoke", start: 5, frameDur: 4 },
    ],
    [
      { frameSlug: "01-smoke", target: "#s01-future", coverageStart: 1, coverageEnd: 4 },
      { frameSlug: "02-smoke", target: "#s02-future", coverageStart: 1.5, coverageEnd: 3 },
    ],
    100,
  );

  assert.deepEqual(checks[0].samples.map((sample) => [sample.phase, sample.localTime, sample.globalTime, sample.expectedVisible]), [
    ["before", 0.99, 0.99, false],
    ["start", 1, 1, true],
    ["inside", 1.1, 1.1, true],
    ["before-end", 3.99, 3.99, true],
    ["end", 4, 4, true],
  ]);
  assert.deepEqual(checks[1].samples.map((sample) => [sample.phase, sample.localTime, sample.globalTime, sample.expectedVisible]), [
    ["before", 1.49, 6.49, false],
    ["start", 1.5, 6.5, true],
    ["inside", 1.6, 6.6, true],
    ["before-end", 2.99, 7.99, true],
    ["end", 3, 8, false],
  ]);
});

test("HyperFrames smoke derives each cue probe from generated binding evidence", () => {
  const checks = deriveSmokeRevealChecks(
    [
      { slug: "01-smoke", start: 0 },
      { slug: "02-smoke", start: 4 },
    ],
    [
      { frameSlug: "01-smoke", target: "#s01-future", revealStart: 1.3, revealDuration: 0.2 },
      { frameSlug: "02-smoke", target: "#s02-future", revealStart: 0.6, revealDuration: 0.4 },
    ],
    30,
  );

  assert.equal(checks.length, 2);
  assert.ok(Math.abs(checks[0].before - (1.3 - 1 / 30)) < 1e-9);
  assert.ok(Math.abs(checks[0].after - (1.3 + 0.2 + 1 / 30)) < 1e-9);
  assert.ok(Math.abs(checks[1].before - (4 + 0.6 - 1 / 30)) < 1e-9);
  assert.ok(Math.abs(checks[1].after - (4 + 0.6 + 0.4 + 1 / 30)) < 1e-9);
});

test("HyperFrames cue samples use the same floor-to-frame seek contract", () => {
  const [check] = deriveSmokeRevealChecks(
    [
      { slug: "01-smoke", start: 0 },
      { slug: "02-smoke", start: 1 },
    ],
    [
      { frameSlug: "01-smoke", target: "#s01-future", revealStart: 0.13, revealDuration: 0.2 },
      { frameSlug: "02-smoke", target: "#s02-future", revealStart: 0.1, revealDuration: 0.2 },
    ],
    30,
  );
  assert.equal(check.before, 2 / 30);
  assert.equal(check.after, 10 / 30);
});

test("packed HyperFrames smoke starts pristine and relies on proxy self-healing", () => {
  const source = readFileSync(join(import.meta.dirname, "harness.ts"), "utf8");
  const installBody = source.slice(
    source.indexOf("export function installArtifact"),
    source.indexOf("export function installRegistryArtifact"),
  );
  assert.match(installBody, /--ignore-scripts/);
  assert.doesNotMatch(installBody, /--foreground-scripts|assertPostinstallOutput/);
  assert.match(source, /captionLoopApplied:\s*false/);
  assert.match(source, /captionLoopApplied:\s*true/);
  assert.doesNotMatch(source, /embeddedTemplateApplied/);
  assert.match(source, /must not patch the HyperFrames CLI bundle/);
  assert.match(source, /runInstalledFromPath\([\s\S]*?\["hyperframes",\s*"--version"\]/);
});

test("packed HyperFrames smoke uses real GSAP and verifies two composed frame timelines with caption seeking", () => {
  const source = readFileSync(join(import.meta.dirname, "harness.ts"), "utf8");
  assert.match(source, /node_modules",\s*"gsap",\s*"dist",\s*"gsap\.min\.js"/);
  assert.doesNotMatch(source, /window\.gsap = window\.gsap \|\| \{ timeline/);
  assert.match(source, /gsap\.version/);
  assert.match(source, /timelineFor\("main"\)/);
  assert.match(source, /expected exactly one timeline for/);
  assert.match(source, /duplicate composition timelines/);
  assert.match(source, /expected exactly one mounted 01-smoke root/);
  assert.match(source, /getElementById\("s01-title"\)/);
  assert.match(source, /fontSize/);
  assert.match(source, /96px/);
  assert.match(source, /left/);
  assert.match(source, /150px/);
  assert.match(source, /backgroundColor/);
  assert.match(source, /rgb\(250, 249, 245\)/);
  assert.match(source, /position/);
  assert.match(source, /absolute/);
  assert.match(source, /rootRect\.width/);
  assert.match(source, /rootRect\.height/);
  assert.match(source, /1920/);
  assert.match(source, /1080/);
  assert.match(source, /intersectionWidth/);
  assert.match(source, /intersectionHeight/);
  assert.match(source, /titleIntersectsViewport/);
  assert.match(source, /timelineFor\("captions"\)/);
  assert.match(source, /timelineFor\("01-smoke"\)/);
  assert.match(source, /timelineFor\("02-smoke"\)/);
  assert.match(source, /captureStandaloneFrameStates/);
  assert.match(source, /derivedLocalPoints/);
  assert.match(source, /frame2HostStart/);
  assert.match(source, /frame1LocalTime/);
  assert.match(source, /frame2LocalTime/);
  assert.match(source, /s01-future/);
  assert.match(source, /s01-late/);
  assert.match(source, /s02-future/);
  assert.match(source, /s02-late/);
  assert.match(source, /rgb\(20, 20, 19\)/);
  assert.match(source, /rgb\(204, 120, 92\)/);
  assert.match(source, /rgb\(31, 41, 55\)/);
  assert.match(source, /rgb\(93, 184, 114\)/);
  assert.match(source, /01-smoke__hf2/);
  assert.match(source, /02-smoke__hf2/);
  assert.match(source, /standalone frame state/);
  assert.doesNotMatch(source, /frame1Timeline\.seek\(time\)/);
  assert.doesNotMatch(source, /frame2Timeline\.seek\(time\)/);
  assert.doesNotMatch(source, /captions\.seek\(time\)/);
  assert.match(source, /visualBindingArtifact/);
  assert.match(source, /deriveSmokeRevealChecks/);
  assert.match(source, /generated main root.*FPS/);
  assert.match(source, /check\.before/);
  assert.match(source, /check\.after/);
  assert.match(source, /before\.every/);
  assert.match(source, /after\.every/);
  assert.match(source, /stageFixtureSmokeFrame/);
  assert.doesNotMatch(source, /frame2HostStart\s*\+\s*2\.4/);
  assert.doesNotMatch(source, /frame2HostStart\s*\+\s*2\.9/);
  assert.match(source, /frame2HostStart\s*\+\s*frame2\.frameDur\s*-\s*0\.1/);
  assert.match(source, /caption-word is-active/);
  assert.match(source, /caption-word is-spoken/);
  assert.match(source, /caption-host/);
  assert.match(source, /captionHostStyle\.pointerEvents/);
  assert.match(source, /elementsFromPoint/);
  assert.match(source, /visual scene beneath caption host/);
  assert.match(source, /performance\.now/);
  assert.match(source, /250/);
  assert.match(source, /--fps",\s*"1"/);
  assert.match(source, /--workers",\s*"1"/);
  assert.match(source, /smoke\.mp4/);
});

test("release smoke supplies required visual timing inputs and consumes draft render policy", () => {
  const source = readFileSync(join(import.meta.dirname, "harness.ts"), "utf8");
  assert.match(source, /visual_beats\.json/);
  assert.match(source, /data-md2vid-beat/);
  assert.match(source, /visual_bindings\.json/);
  assert.match(source, /VisualBeatProvider/);
  assert.match(source, /BeatReveal/);
  assert.match(source, /--profile",\s*"draft"/);
  assert.match(source, /--profile",\s*"draft"[\s\S]*?--fps",\s*"1"/);
  assert.match(source, /--fps",\s*"1"[\s\S]*?--quality",\s*"draft"/);
  assert.match(source, /md2vid-render\.json/);
});

test("retained Kokoro smoke reserves a full landing after its first transcribed word", () => {
  const source = readFileSync(join(import.meta.dirname, "harness.ts"), "utf8");
  assert.match(source, /cue: \{ wordIndex: 0 \}/);
  assert.doesNotMatch(source, /cue: \{ wordIndex: 1 \}/);
});

test("HyperFrames smoke derives assertions from frame-quantized seeks", () => {
  const source = readFileSync(join(import.meta.dirname, "harness.ts"), "utf8");
  assert.match(source, /function frameSafeSeekTime/);
  assert.match(source, /Math\.floor\(time \* fps\) \/ fps/);
});

test("HyperFrames smoke samples the first-frame hidden state before its generated cue", () => {
  const source = readFileSync(join(import.meta.dirname, "harness.ts"), "utf8");
  assert.match(source, /sampleAt\(frame1Reveal\.before\)\.frame1FutureOpacity/);
  assert.doesNotMatch(source, /sampleAt\(0\.5\)\.frame1FutureOpacity/);
});

test("HyperFrames smoke labels true initial, pre-cue, and pre-host samples distinctly", () => {
  const source = readFileSync(join(import.meta.dirname, "harness.ts"), "utf8");
  assert.match(source, /const initialGlobalSample = frameSafeSeekTime\(0, fps\)/);
  assert.match(source, /const frame2PreHostSample = frameSafeSeekTime\(frame2HostStart, fps\)/);
  assert.match(source, /hidden at global time zero/);
  assert.match(source, /hidden immediately before its resolved cue/);
  assert.match(source, /frame-quantized pre-host sample/);
  assert.doesNotMatch(source, /frame 1 future element must start hidden/);
  assert.doesNotMatch(source, /zero at host start/);
});

test("HyperFrames smoke derives post-start local time from the frame-safe global sample", () => {
  const source = readFileSync(join(import.meta.dirname, "harness.ts"), "utf8");
  assert.match(source, /afterFrame2 - frame2HostStart/);
  assert.doesNotMatch(source, /frame2LocalTime - 0\.1/);
});

test("HyperFrames smoke derives caption visibility from transcribed caption expectations", () => {
  const source = readFileSync(join(import.meta.dirname, "harness.ts"), "utf8");
  assert.match(source, /browserExpectations\.find/);
  assert.doesNotMatch(source, /Math\.abs\(sample\.time - beforeFrame2\)/);
});

test("release harness has no Windows command or process execution path", () => {
  const source = readFileSync(join(import.meta.dirname, "harness.ts"), "utf8");

  assert.doesNotMatch(
    source,
    /cmd\.exe|ComSpec|COMSPEC|taskkill|TaskkillExecutor|stopWindowsProcessTree|platform === "win32"|process\.platform !== "win32"/,
  );
});

function tarEntry(
  name: string,
  body = Buffer.alloc(0),
  type = "0",
  prefix = "",
): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write(body.length.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  header.write(type, 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write(prefix, 345, 155, "utf8");
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding]);
}

test("runStage prefixes failures with the release stage", async () => {
  await assert.rejects(
    () => runStage("pack", async () => { throw new Error("missing dist/bin/md2vid.js"); }),
    /FAIL \[pack\]: missing dist\/bin\/md2vid\.js/,
  );
});

test("successful contexts are removed", () => {
  const context = createReleaseContext();
  assert.ok(existsSync(context.root));
  finishReleaseContext(context, true);
  assert.equal(existsSync(context.root), false);
});

test("failed contexts are retained and print their diagnostics root", () => {
  const context = createReleaseContext();
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
  try {
    finishReleaseContext(context, false);
    assert.ok(existsSync(context.root));
    assert.deepEqual(errors, [`FAIL [release]: retained diagnostics at ${context.root}`]);
  } finally {
    console.error = originalError;
    rmSync(context.root, { recursive: true, force: true });
  }
});

test("generated-tree scan rejects repository-relative commands", () => {
  const context = createReleaseContext();
  const project = join(context.work, "bad-project");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "CLAUDE.md"), "@../../docs/standards/frameworks/hyperframes.md\n");
  try {
    assert.throws(() => assertNoRepoRelativePaths(project), /repo-relative path/);
  } finally {
    finishReleaseContext(context, true);
  }
});

test("generated-tree scan ignores installed dependencies", () => {
  const context = createReleaseContext();
  const project = join(context.work, "installed-project");
  mkdirSync(join(project, "node_modules", "dependency"), { recursive: true });
  writeFileSync(join(project, "package.json"), "{}\n");
  writeFileSync(
    join(project, "node_modules", "dependency", "package.json"),
    JSON.stringify({ script: "node ../../scripts/build.ts" }),
  );
  try {
    assert.doesNotThrow(() => assertNoRepoRelativePaths(project));
  } finally {
    finishReleaseContext(context, true);
  }
});

test("HOME skill mode stays under the release root and neutralizes inherited user config", () => {
  const context = createReleaseContext();
  try {
    const target = skillInstallTarget(context, "home");
    const env = mergeEnvironment(
      {
        Claude_Config_Dir: "/inherited/claude",
        Home: "/inherited/home",
        UserProfile: "C:\\inherited\\profile",
        HomeDrive: "C:",
        HomePath: "\\inherited\\profile",
      },
      target.env,
    );

    assert.equal(isAbsolute(target.destination), true);
    assert.equal(relative(context.root, target.destination).startsWith(".."), false);
    assert.equal(target.destination, join(context.root, "claude-home", ".claude", "skills", "md2vid"));
    const environmentEntries = Object.entries(env);
    assert.deepEqual(
      environmentEntries.filter(([name]) => name.toUpperCase() === "HOME"),
      [["HOME", join(context.root, "claude-home")]],
    );
    assert.deepEqual(
      environmentEntries.filter(([name]) => name.toUpperCase() === "USERPROFILE"),
      [["USERPROFILE", join(context.root, "claude-home")]],
    );
    for (const name of ["CLAUDE_CONFIG_DIR", "HOMEDRIVE", "HOMEPATH"]) {
      assert.equal(environmentEntries.some(([candidate]) => candidate.toUpperCase() === name), false);
    }
  } finally {
    finishReleaseContext(context, true);
  }
});

test("tarball listing uses Node and supports ustar prefixes", () => {
  const context = createReleaseContext();
  const archive = join(context.root, "artifact.tgz");
  try {
    const tar = Buffer.concat([
      tarEntry("package/dist/bin/md2vid.js", Buffer.from("cli")),
      tarEntry("package/skill/", Buffer.alloc(0), "5"),
      tarEntry("SKILL.md", Buffer.from("skill"), "0", "package/skill/md2vid"),
      Buffer.alloc(1024),
    ]);
    writeFileSync(archive, gzipSync(tar));
    assert.deepEqual(listTarGzEntries(archive), [
      "package/dist/bin/md2vid.js",
      "package/skill/",
      "package/skill/md2vid/SKILL.md",
    ]);
  } finally {
    finishReleaseContext(context, true);
  }
});

test("local npm exec uses Node with a Windows npm CLI path", () => {
  const npmCli = "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js";
  assert.deepEqual(localNpmExecInvocation(npmCli), {
    command: process.execPath,
    args: [npmCli, "exec", "--yes=false", "--", "md2vid", "--version"],
  });
});

test("local npm exec fails clearly when npm_execpath is unavailable", () => {
  assert.throws(() => localNpmExecInvocation(""), /npm_execpath is unavailable/);
});

test("CLI version must match the installed package metadata version", () => {
  const context = createReleaseContext();
  const packageFile = join(context.root, "package.json");
  try {
    writeFileSync(packageFile, JSON.stringify({ name: "md2vid", version: "9.8.7-test" }));
    assert.doesNotThrow(() => assertCliVersionMatchesPackageMetadata("9.8.7-test\n", packageFile));
    assert.throws(
      () => assertCliVersionMatchesPackageMetadata("1.2.3-other\n", packageFile),
      /CLI version must match package metadata/,
    );
  } finally {
    finishReleaseContext(context, true);
  }
});

test("installed CLI runs through the current Node executable", () => {
  const context = createReleaseContext();
  const cli = join(context.root, "cli.js");
  try {
    writeFileSync(cli, "console.log(process.argv.slice(2).join('|'));\n");
    chmodSync(cli, 0o644);
    context.md2vidBin = cli;
    assert.equal(runInstalledCli(context, ["--version"]), "--version\n");
  } finally {
    finishReleaseContext(context, true);
  }
});

test("packed artifact rejects nested test directories and test files", () => {
  const context = createReleaseContext();
  try {
    context.packedFiles = [
      ...REQUIRED_PACKED_FILES,
      "engine/__tests__/captions.test.ts",
      "frameworks/remotion/verify.test.ts",
    ];
    assert.throws(() => assertPackedFiles(context), /tarball must exclude test file/);
  } finally {
    finishReleaseContext(context, true);
  }
});

test("packed artifact rejects source and dist vendored GSAP paths", () => {
  for (const path of FORBIDDEN_PACKED_FILES) {
    const context = createReleaseContext();
    try {
      context.packedFiles = [...REQUIRED_PACKED_FILES, path];
      const forbidden = path.startsWith("frameworks/hyperframes/templates/")
        ? "frameworks/hyperframes/templates/"
        : path;
      assert.throws(
        () => assertPackedFiles(context),
        (error: unknown) => error instanceof Error && error.message.includes(`tarball must exclude ${forbidden}`),
      );
    } finally {
      finishReleaseContext(context, true);
    }
  }
});

test("pack lock contention reports the pack stage and preserves the existing lock", async () => {
  const context = createReleaseContext();
  const lock = join(context.root, "pack.lock");
  const owner = join(lock, "owner.txt");
  try {
    mkdirSync(lock);
    writeFileSync(owner, "existing owner\n");

    await assert.rejects(
      () => runStage("pack", () => withPackLock(() => undefined, lock)),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /^FAIL \[pack\]: repository pack lock is already held at /);
        assert.match(error.message, new RegExp(lock.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        return true;
      },
    );
    assert.equal(existsSync(owner), true);
  } finally {
    finishReleaseContext(context, true);
  }
});

test("pack lock is removed after failure so the next pack can acquire it", () => {
  const context = createReleaseContext();
  const lock = join(context.root, "pack.lock");
  try {
    assert.throws(
      () => withPackLock(() => { throw new Error("pack failed"); }, lock),
      /pack failed/,
    );
    assert.equal(existsSync(lock), false);
    assert.equal(withPackLock(() => "next pack", lock), "next pack");
    assert.equal(existsSync(lock), false);
  } finally {
    finishReleaseContext(context, true);
  }
});

test("generated scripts resolve md2vid from the isolated install prefix first", () => {
  const context = createReleaseContext();
  try {
    const env = installedCommandEnvironment(context, {
      Path: "/ambient/bin",
      PATH: "/other/bin",
      npm_config_dry_run: "true",
      NPM_CONFIG_DRY_RUN: "1",
      Npm_Config_Dry_Run: "yes",
    });
    const pathEntries = Object.entries(env).filter(([name]) => name.toUpperCase() === "PATH");
    assert.equal(pathEntries.length, 1);
    const pathValue = pathEntries[0][1] ?? "";
    assert.equal(pathValue.split(delimiter)[0], join(context.prefix, "node_modules", ".bin"));

    const dryRunEntries = Object.entries(env)
      .filter(([name]) => name.toUpperCase() === "NPM_CONFIG_DRY_RUN");
    assert.deepEqual(dryRunEntries, [["npm_config_dry_run", "false"]]);
  } finally {
    finishReleaseContext(context, true);
  }
});

test("installed bin invocation uses the isolated POSIX shim", () => {
  const context = createReleaseContext();
  try {
    assert.deepEqual(installedBinInvocation(context, ["--version"]), {
      command: join(context.prefix, "node_modules", ".bin", "md2vid"),
      args: ["--version"],
    });
  } finally {
    finishReleaseContext(context, true);
  }
});

test("extracts every emitted HyperFrames voice URL", () => {
  assert.deepEqual(parseVoiceUrls(`
    <audio src="assets/voice/01.wav"></audio>
    <audio src="assets/voice/chapter/02.wav"></audio>
  `), ["assets/voice/01.wav", "assets/voice/chapter/02.wav"]);
});

test("extracts canonical local GSAP URLs from generated and authored HTML", () => {
  assert.deepEqual(parseGsapUrls(`
    <script src="assets/gsap/gsap.min.js"></script>
    <script>gsap.timeline();</script>
  `), ["assets/gsap/gsap.min.js"]);
});

test("HyperFrames smoke leaves beat-bound target scheduling to the generated helper", () => {
  const fixtureRoot = join(REPO_ROOT, "test", "cli", "fixtures", "smoke");
  for (const [frameSlug, target] of [["01-smoke", "s01-future"], ["02-smoke", "s02-future"]] as const) {
    const frame = readFileSync(join(fixtureRoot, `${frameSlug}.html`), "utf8");
    assert.match(frame, new RegExp(`id="${target}"[^>]*data-md2vid-beat="reveal"`));
    assert.doesNotMatch(frame, new RegExp(`tl\\.to\\("#${target}"`));
  }
});

test("HyperFrames smoke fixture composition roots declare the light frame theme", () => {
  const fixtureRoot = join(REPO_ROOT, "test", "cli", "fixtures", "smoke");

  for (const frameSlug of ["01-smoke", "02-smoke"] as const) {
    const frame = readFileSync(join(fixtureRoot, `${frameSlug}.html`), "utf8");
    const root = frame.match(new RegExp(`<div\\b[^>]*data-composition-id="${frameSlug}"[^>]*>`))?.[0];
    assert.ok(root, `${frameSlug} composition root must exist`);
    assert.match(root, /\sdata-frame-theme="light"(?:\s|>)/, `${frameSlug} composition root must declare the light frame theme`);
  }
});

test("the two-frame meaningful-ID smoke fixture transports authored style and controllers as top-level siblings", () => {
  const fixtureRoot = join(REPO_ROOT, "test", "cli", "fixtures", "smoke");
  const meta = JSON.parse(readFileSync(join(fixtureRoot, "audio_meta.json"), "utf8"));
  assert.deepEqual(
    meta.voices.map((voice: { id: string; path: string; duration_s: number }) => ({
      id: voice.id,
      path: voice.path,
      duration_s: voice.duration_s,
    })),
    [
      { id: "intro", path: "assets/voice/intro.wav", duration_s: 3 },
      { id: "followup", path: "assets/voice/followup.wav", duration_s: 3 },
    ],
  );

  for (const [voicePath, frameSlug] of [
    ["assets/voice/intro.wav", "01-smoke"],
    ["assets/voice/followup.wav", "02-smoke"],
  ] as const) {
    const wavPath = join(fixtureRoot, voicePath);
    const framePath = join(fixtureRoot, `${frameSlug}.html`);
    assert.equal(existsSync(wavPath), true, `${voicePath} must exist`);
    assert.equal(existsSync(framePath), true, `${frameSlug}.html must exist`);
    const wav = readFileSync(wavPath);
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.toString("ascii", 8, 12), "WAVE");
    assert.equal(wav.readUInt32LE(24), 8000);
    assert.equal(wav.readUInt32LE(40), 48_000, `${voicePath} must contain 3.0 seconds of mono 16-bit PCM`);
    assert.equal(wav.length, 48_044);

    const frame = readFileSync(framePath, "utf8");
    const rootStart = frame.indexOf(`data-composition-id="${frameSlug}"`, frame.indexOf("<div"));
    const rootOpenEnd = frame.indexOf(">", rootStart) + 1;
    const rootEnd = frame.lastIndexOf("</div>");
    const rootInner = frame.slice(rootOpenEnd, rootEnd);
    const afterRoot = frame.slice(rootEnd + "</div>".length, frame.indexOf("</template>"));
    assert.doesNotMatch(rootInner, /<(?:style|script)\b/i);
    assert.match(afterRoot, /<style>[\s\S]*?<script src=[\s\S]*?<script>/);
    assert.match(afterRoot, /\(function \(\) \{[\s\S]*?const tl = gsap\.timeline/);
    assert.ok(afterRoot.indexOf("<style>") < afterRoot.indexOf("<script src="));
    assert.ok(afterRoot.indexOf("<script src=") < afterRoot.indexOf("(function ()"));
  }
  assert.equal(REQUIRED_PACKED_FILES.some((path) => path.includes("fixtures/smoke")), false);
});

class FakeStudioChild extends EventEmitter {
  pid?: number;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
}

test("waitForExit resolves after a normal child exit", async () => {
  const child = new FakeStudioChild();
  const waiting = waitForExit(child, 100);
  child.exitCode = 0;
  child.emit("exit", 0, null);
  assert.equal(await waiting, true);
});

test("waitForExit recognizes a child already terminated by signal", async () => {
  const child = new FakeStudioChild();
  child.signalCode = "SIGTERM";
  assert.equal(await waitForExit(child, 100), true);
});

test("terminateProcessTree escalates from SIGTERM to SIGKILL and awaits final exit", async () => {
  const signals: NodeJS.Signals[] = [];
  let waits = 0;
  await terminateProcessTree({
    signal(signal) { signals.push(signal); },
    async wait(timeoutMs) {
      waits++;
      return timeoutMs === undefined;
    },
  }, 0);
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
  assert.equal(waits, 2);
});

test("stopProcessTree terminates a spawned descendant", async () => {
  const parent = spawn(process.execPath, ["-e", `
    const { spawn } = require("node:child_process");
    const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    process.send(descendant.pid);
    setInterval(() => {}, 1000);
  `], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  let descendantPid: number | undefined;
  try {
    const [message] = await once(parent, "message");
    descendantPid = Number(message);
    assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 0);

    await stopProcessTree(parent, 100);
    assert.throws(
      () => process.kill(descendantPid!, 0),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ESRCH",
    );
  } finally {
    if (parent.exitCode === null && parent.signalCode === null) {
      await stopProcessTree(parent, 0).catch(() => undefined);
    }
    if (descendantPid !== undefined) {
      try {
        process.kill(descendantPid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
  }
});

test("packedFileListing strips package prefixes and directories", () => {
  const context = createReleaseContext();
  const archive = join(context.root, "listing.tgz");
  try {
    writeFileSync(archive, gzipSync(Buffer.concat([
      tarEntry("package/dist/", Buffer.alloc(0), "5"),
      tarEntry("package/dist/bin/md2vid.js", Buffer.from("cli")),
      tarEntry("outside.txt", Buffer.from("ignored")),
      Buffer.alloc(1024),
    ])));
    assert.deepEqual(packedFileListing(archive), ["dist/bin/md2vid.js"]);
  } finally {
    finishReleaseContext(context, true);
  }
});

test("packArtifact uses a caller-owned empty directory and invokes npm pack once", () => {
  const context = createReleaseContext();
  const output = join(context.root, "caller-output");
  const invocations: string[][] = [];
  const runner: CommandRunner = (_command, args) => {
    invocations.push(args);
    const destination = args[args.indexOf("--pack-destination") + 1];
    mkdirSync(destination, { recursive: true });
    mkdirSync(join(REPO_ROOT, "dist", "bin"), { recursive: true });
    writeFileSync(join(REPO_ROOT, "dist", "bin", "md2vid.js"), "built\n");
    writeFileSync(join(destination, PACKAGE_TARBALL), gzipSync(Buffer.alloc(1024)));
    return "packed\n";
  };
  const originalNpmExecPath = process.env.npm_execpath;
  process.env.npm_execpath = "/isolated/npm-cli.js";
  try {
    const tarball = packArtifact(context, output, runner);
    assert.equal(tarball, join(output, PACKAGE_TARBALL));
    assert.equal(context.tarball, tarball);
    assert.equal(invocations.filter((args) => args.includes("pack")).length, 1);
    assert.ok(invocations[0].includes("--dry-run=false"));
  } finally {
    if (originalNpmExecPath === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = originalNpmExecPath;
    finishReleaseContext(context, true);
  }
});

test("packArtifact command-runner seam still requires prepack to rebuild dist", () => {
  const context = createReleaseContext();
  const originalNpmExecPath = process.env.npm_execpath;
  process.env.npm_execpath = "/isolated/npm-cli.js";
  try {
    assert.throws(() => packArtifact(context, context.artifacts, (_command, args) => {
      const destination = args[args.indexOf("--pack-destination") + 1];
      writeFileSync(join(destination, PACKAGE_TARBALL), gzipSync(Buffer.alloc(1024)));
      return "packed\n";
    }), /prepack did not rebuild dist/);
  } finally {
    if (originalNpmExecPath === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = originalNpmExecPath;
    finishReleaseContext(context, true);
  }
});

test("packArtifact rejects a nonempty caller-owned output directory", () => {
  const context = createReleaseContext();
  const output = join(context.root, "nonempty");
  mkdirSync(output);
  writeFileSync(join(output, "keep.txt"), "keep\n");
  try {
    assert.throws(() => packArtifact(context, output), /must start empty/);
  } finally {
    finishReleaseContext(context, true);
  }
});

test("useSuppliedArtifact requires a regular file and never removes repository dist", () => {
  const context = createReleaseContext();
  const distSentinel = join(REPO_ROOT, "dist", "supplied-artifact-sentinel.txt");
  const archive = join(context.root, "supplied.tgz");
  mkdirSync(join(REPO_ROOT, "dist"), { recursive: true });
  writeFileSync(distSentinel, "preserve\n");
  writeFileSync(archive, gzipSync(Buffer.concat([
    tarEntry("package/dist/bin/md2vid.js", Buffer.from("cli")),
    Buffer.alloc(1024),
  ])));
  try {
    useSuppliedArtifact(context, archive);
    assert.equal(context.tarball, archive);
    assert.deepEqual(context.packedFiles, ["dist/bin/md2vid.js"]);
    assert.equal(readFileSync(distSentinel, "utf8"), "preserve\n");
    assert.throws(() => useSuppliedArtifact(context, context.root), /regular file/);
  } finally {
    rmSync(distSentinel, { force: true });
    finishReleaseContext(context, true);
  }
});

test("release parser accepts bare and supplied-artifact verify modes and rejects malformed options", () => {
  assert.deepEqual(parseReleaseArguments(["pack", "--output", "out"], {}), {
    mode: "pack", output: "out",
  });
  assert.deepEqual(parseReleaseArguments(["verify"], {}), {
    mode: "all", diagnostics: undefined,
  });
  assert.deepEqual(parseReleaseArguments([
    "verify", "--tarball", "pkg.tgz", "--metadata-only",
  ], {}), {
    mode: "verify", tarball: "pkg.tgz", metadataOnly: true, diagnostics: undefined,
    metadata: undefined, expectedVersion: undefined, expectedTag: undefined, expectedCommit: undefined,
  });
  for (const partial of [
    ["verify", "--metadata", "artifact.json"],
    ["verify", "--metadata-only"],
    [
      "verify", "--expected-version", "1.2.3",
      "--expected-tag", "v1.2.3",
      "--expected-commit", "a".repeat(40),
    ],
  ]) {
    assert.throws(() => parseReleaseArguments(partial, {}), /--tarball.*artifact options.*Usage:/s);
  }
  assert.throws(() => parseReleaseArguments(["pack", "--output", "a", "--output", "b"], {}), /duplicate.*Usage:/s);
  assert.throws(() => parseReleaseArguments(["all", "trailing"], {}), /trailing.*Usage:/s);
  assert.throws(() => parseReleaseArguments(["verify", "--tarball"], {}), /missing.*Usage:/s);
  assert.throws(() => parseReleaseArguments(["verify", "--unknown", "x"], {}), /unknown.*Usage:/s);
  assert.throws(() => parseReleaseArguments(["pack", "--output", "out", "--diagnostics", "logs"], {}), /unknown.*Usage:/s);
  assert.deepEqual(parseReleaseArguments([
    "registry", "--version", "1.2.3", "--integrity", REGISTRY_INTEGRITY,
  ], {}), { mode: "registry", version: "1.2.3", integrity: REGISTRY_INTEGRITY, diagnostics: undefined });
  assert.match(USAGE, /^pack --output <directory>\nverify \[--tarball <path>/);
});

test("pack ignores ambient diagnostics configuration during parse and execution", async () => {
  const ambient = { MD2VID_DIAGNOSTICS_DIR: ".", MD2VID_RELEASE_COMMIT: "a".repeat(40) };
  const output = join(tmpdir(), `md2vid-pack-output-${process.pid}-${Date.now()}`);
  const parsed = parseReleaseArguments(["pack", "--output", output], ambient);
  assert.deepEqual(parsed, { mode: "pack", output });
  const context = createReleaseContext();
  const tarball = join(output, PACKAGE_TARBALL);
  try {
    await runRelease(parsed, ambient, {
      createContext: () => context,
      packArtifact: () => {
        mkdirSync(output, { recursive: true });
        writeFileSync(tarball, gzipSync(Buffer.concat([
          ...REQUIRED_PACKED_FILES.map((path) => tarEntry(`package/${path}`, Buffer.from("file"))),
          Buffer.alloc(1024),
        ])));
        context.tarball = tarball;
        context.packedFiles = [...REQUIRED_PACKED_FILES];
        return tarball;
      },
      currentNpmVersion: () => NPM_VERSION,
    });
    assert.equal(existsSync(join(REPO_ROOT, ".md2vid-diagnostics-owner")), false);
  } finally {
    rmSync(output, { recursive: true, force: true });
    rmSync(context.root, { recursive: true, force: true });
  }
});

test("verify expected identity options are all-or-none", () => {
  assert.throws(() => parseReleaseArguments([
    "verify", "--tarball", "pkg.tgz", "--expected-version", "1.2.3",
  ], {}), /all-or-none/);
  assert.doesNotThrow(() => parseReleaseArguments([
    "verify", "--tarball", "pkg.tgz", "--expected-version", "1.2.3",
    "--expected-tag", "v1.2.3", "--expected-commit", "a".repeat(40),
  ], {}));
});

test("diagnostics prefer equal explicit paths, accept env-only, and reject conflicts", () => {
  const root = join(tmpdir(), "md2vid-diagnostics-resolution");
  assert.equal(resolveDiagnosticsDirectory(undefined, { MD2VID_DIAGNOSTICS_DIR: root }), root);
  assert.equal(resolveDiagnosticsDirectory(root, { MD2VID_DIAGNOSTICS_DIR: join(root, ".") }), root);
  assert.throws(
    () => resolveDiagnosticsDirectory(join(root, "explicit"), { MD2VID_DIAGNOSTICS_DIR: join(root, "env") }),
    /diagnostics.*conflict/,
  );
});

test("unsafe diagnostics paths fail closed without touching existing content", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "md2vid-unsafe-diagnostics-"));
  const existing = join(sandbox, "existing");
  const sentinel = join(existing, "sentinel.txt");
  mkdirSync(existing);
  writeFileSync(sentinel, "preserve\n");
  try {
    assert.throws(() => resolveDiagnosticsDirectory("", {}), /unsafe diagnostics/);
    assert.throws(
      () => resolveDiagnosticsDirectory(undefined, { MD2VID_DIAGNOSTICS_DIR: "" }),
      /unsafe diagnostics/,
    );
    for (const unsafe of [".", REPO_ROOT, dirname(REPO_ROOT), homedir(), parse(REPO_ROOT).root]) {
      assert.throws(() => resolveDiagnosticsDirectory(unsafe, {}), /unsafe diagnostics/, unsafe);
    }
    const fakeHome = join(sandbox, "fake-home");
    const fakeProfile = join(sandbox, "fake-profile");
    mkdirSync(fakeHome);
    mkdirSync(fakeProfile);
    assert.throws(
      () => resolveDiagnosticsDirectory(fakeHome, { HOME: fakeHome }),
      /unsafe diagnostics/,
    );
    assert.throws(
      () => resolveDiagnosticsDirectory(fakeProfile, { USERPROFILE: fakeProfile }),
      /unsafe diagnostics/,
    );
    assert.throws(
      () => createReleaseContext({ diagnosticsDirectory: existing }),
      /not invocation-owned/,
    );
    assert.equal(readFileSync(sentinel, "utf8"), "preserve\n");

    const forged = join(sandbox, "forged");
    const forgedMarker = join(forged, ".md2vid-diagnostics-owner");
    const forgedSentinel = join(forged, "unrelated.txt");
    mkdirSync(forged);
    writeFileSync(forgedMarker, "md2vid-release-diagnostics:v1:forged\n");
    writeFileSync(forgedSentinel, "preserve\n");
    assert.throws(
      () => createReleaseContext({ diagnosticsDirectory: forged }),
      /unowned diagnostics entry/,
    );
    assert.equal(readFileSync(forgedMarker, "utf8"), "md2vid-release-diagnostics:v1:forged\n");
    assert.equal(readFileSync(forgedSentinel, "utf8"), "preserve\n");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("currentNpmVersion executes npm_execpath through Node and rejects another version", () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const good: CommandRunner = (command, args) => {
    calls.push({ command, args });
    return `${NPM_VERSION}\n`;
  };
  assert.equal(currentNpmVersion({ npm_execpath: "/isolated/npm-cli.js" }, good), NPM_VERSION);
  assert.deepEqual(calls, [{ command: process.execPath, args: ["/isolated/npm-cli.js", "--version"] }]);
  assert.throws(
    () => currentNpmVersion({ npm_execpath: "/isolated/npm-cli.js" }, () => "10.9.0\n"),
    /npm version must be exactly 11\.15\.0/,
  );
});

test("verify rejects a supplied filename that does not match metadata", async () => {
  const context = createReleaseContext();
  const expectedTarball = join(context.artifacts, PACKAGE_TARBALL);
  const suppliedTarball = join(context.artifacts, "renamed.tgz");
  const bytes = gzipSync(Buffer.concat([
    ...REQUIRED_PACKED_FILES.map((path) => tarEntry(`package/${path}`, Buffer.from("file"))),
    Buffer.alloc(1024),
  ]));
  writeFileSync(expectedTarball, bytes);
  writeFileSync(suppliedTarball, bytes);
  writeArtifactMetadata(context.artifacts, createArtifactMetadata({
    tarball: expectedTarball, packageName: "md2vid", version: PACKAGE_VERSION, tag: PACKAGE_TAG,
    commit: "a".repeat(40), nodeVersion: process.version, npmVersion: NPM_VERSION,
  }));
  try {
    await assert.rejects(
      () => runRelease({ mode: "verify", tarball: suppliedTarball, metadata: undefined,
        metadataOnly: true, diagnostics: undefined, expectedVersion: undefined,
        expectedTag: undefined, expectedCommit: undefined }, {}, { createContext: () => context }),
      /artifact filename mismatch/,
    );
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

test("verify failure honors diagnostics from the environment", async () => {
  const context = createReleaseContext();
  const caller = join(tmpdir(), `md2vid-env-diagnostics-${process.pid}-${Date.now()}`);
  const tarball = join(context.artifacts, PACKAGE_TARBALL);
  const bytes = gzipSync(Buffer.concat([
    ...REQUIRED_PACKED_FILES.map((path) => tarEntry(`package/${path}`, Buffer.from("file"))),
    Buffer.alloc(1024),
  ]));
  writeFileSync(tarball, bytes);
  const metadata = createArtifactMetadata({
    tarball, packageName: "md2vid", version: PACKAGE_VERSION, tag: PACKAGE_TAG,
    commit: "a".repeat(40), nodeVersion: process.version, npmVersion: NPM_VERSION,
  });
  writeArtifactMetadata(context.artifacts, { ...metadata, sha256: "0".repeat(64) });
  const env = { MD2VID_DIAGNOSTICS_DIR: caller };
  try {
    const args = parseReleaseArguments(["verify", "--tarball", tarball, "--metadata-only"], env);
    await assert.rejects(() => runRelease(args, env), /SHA-256 mismatch/);
    assert.ok(existsSync(join(caller, "summary.json")));
    assert.ok(existsSync(join(caller, "verify.log")));
    assert.equal(existsSync(context.prefix), true, "unrelated caller test context remains isolated");
    const retained = readFileSync(join(caller, "verify.log"), "utf8");
    assert.doesNotMatch(retained, /npm_config|token|credential|md2vid-release-/i);
  } finally {
    finishReleaseContext(context, true);
    rmSync(caller, { recursive: true, force: true });
  }
});

test("pack validation failures retain a sanitized pack stage diagnostic", async () => {
  const caller = join(tmpdir(), `md2vid-pack-diagnostics-${process.pid}-${Date.now()}`);
  const context = createReleaseContext({ diagnosticsDirectory: caller });
  const tarball = join(context.artifacts, PACKAGE_TARBALL);
  try {
    await assert.rejects(
      () => runRelease({ mode: "all", diagnostics: caller }, {}, {
        createContext: () => context,
        packArtifact: () => {
          writeFileSync(tarball, "not-used");
          context.tarball = tarball;
          context.packedFiles = ["forbidden.test.ts"];
          return tarball;
        },
      }),
      /tarball must exclude test file/,
    );
    assert.ok(existsSync(join(caller, "summary.json")));
    assert.ok(existsSync(join(caller, "pack.log")));
  } finally {
    rmSync(caller, { recursive: true, force: true });
    rmSync(context.root, { recursive: true, force: true });
  }
});

test("bare verify packs once while supplied-artifact verify never packs", async () => {
  const root = createReleaseContext();
  const tarball = join(root.artifacts, PACKAGE_TARBALL);
  const packedBytes = gzipSync(Buffer.concat([
    ...REQUIRED_PACKED_FILES.map((path) => tarEntry(`package/${path}`, Buffer.from("file"))),
    Buffer.alloc(1024),
  ]));
  writeFileSync(tarball, packedBytes);
  const metadata = createArtifactMetadata({
    tarball, packageName: "md2vid", version: PACKAGE_VERSION, tag: PACKAGE_TAG,
    commit: "a".repeat(40), nodeVersion: process.version, npmVersion: NPM_VERSION,
  });
  writeArtifactMetadata(root.artifacts, metadata);
  let packs = 0;
  let verifies = 0;
  try {
    await runRelease({ mode: "verify", tarball, metadata: undefined, metadataOnly: true,
      diagnostics: undefined, expectedVersion: undefined, expectedTag: undefined, expectedCommit: undefined }, {}, {
      createContext: () => root,
      packArtifact: () => { packs++; return tarball; },
      verifySuppliedArtifact: () => { verifies++; },
    });
    assert.equal(packs, 0);
    assert.equal(verifies, 0);
  } finally {
    rmSync(root.root, { recursive: true, force: true });
  }

  const allRoot = createReleaseContext();
  const allTarball = join(allRoot.artifacts, PACKAGE_TARBALL);
  packs = 0;
  verifies = 0;
  const bareVerify = parseReleaseArguments(["verify"], {});
  assert.deepEqual(bareVerify, { mode: "all", diagnostics: undefined });
  await runRelease(bareVerify, {
    MD2VID_RELEASE_COMMIT: "b".repeat(40), npm_execpath: "/isolated/npm-cli.js",
  }, {
    createContext: () => allRoot,
    packArtifact: () => {
      packs++;
      writeFileSync(allTarball, packedBytes);
      allRoot.tarball = allTarball;
      allRoot.packedFiles = [...REQUIRED_PACKED_FILES];
      return allTarball;
    },
    currentNpmVersion: () => NPM_VERSION,
    verifySuppliedArtifact: () => { verifies++; },
  });
  assert.equal(packs, 1);
  assert.equal(verifies, 1);
});

test("real release orchestration records one pack and verify records none", async () => {
  const originalNpmExecPath = process.env.npm_execpath;
  process.env.npm_execpath = "/isolated/npm-cli.js";
  try {
  const packedBytes = gzipSync(Buffer.concat([
    ...REQUIRED_PACKED_FILES.map((path) => tarEntry(`package/${path}`, Buffer.from("file"))),
    Buffer.alloc(1024),
  ]));
  const frameworkCalls: string[] = [];
  const makeRunner = (invocations: string[][]): CommandRunner => (_command, args, options = {}) => {
    if (args[0]?.endsWith(join("dist", "bin", "md2vid.js"))) {
      if (args[1] === "--version") return `${PACKAGE_VERSION}\n`;
      if (args[1] === "--help") return "npm install -g md2vid\nnpx --yes=false md2vid\nNode.js >=22.18\n";
      if (args[1] === "install-skill") {
        const env = options.env ?? {};
        const config = env.CLAUDE_CONFIG_DIR;
        const home = env.HOME ?? process.cwd();
        const destination = config
          ? join(config, "skills", "md2vid")
          : join(home, ".claude", "skills", "md2vid");
        rmSync(destination, { recursive: true, force: true });
        mkdirSync(destination, { recursive: true });
        writeFileSync(join(destination, "SKILL.md"), "skill\n");
        return "";
      }
    }
    const npmArgs = args[0] === "/isolated/npm-cli.js" ? args.slice(1) : args;
    invocations.push([...npmArgs]);
    if (npmArgs[0] === "pack") {
      const destination = npmArgs[npmArgs.indexOf("--pack-destination") + 1];
      mkdirSync(join(REPO_ROOT, "dist", "bin"), { recursive: true });
      writeFileSync(join(REPO_ROOT, "dist", "bin", "md2vid.js"), "built\n");
      writeFileSync(join(destination, PACKAGE_TARBALL), packedBytes);
      return "packed\n";
    }
    if (npmArgs[0] === "install") {
      const prefix = npmArgs[npmArgs.indexOf("--prefix") + 1];
      const packageRoot = join(prefix, "node_modules", "md2vid");
      mkdirSync(join(prefix, "node_modules", "hyperframes"), { recursive: true });
      writeFileSync(join(prefix, "node_modules", "hyperframes", "package.json"), JSON.stringify({ version: HYPERFRAMES_VERSION }));
      mkdirSync(join(packageRoot, "skill", "md2vid"), { recursive: true });
      writeFileSync(join(packageRoot, "skill", "md2vid", "SKILL.md"), "skill\n");
      writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "md2vid", version: PACKAGE_VERSION }));
      writeFileSync(join(packageRoot, "dist-bin.js"), "// command-runner test fixture\n");
      // The harness expects the package bin at this path.
      mkdirSync(join(packageRoot, "dist", "bin"), { recursive: true });
      renameSync(join(packageRoot, "dist-bin.js"), join(packageRoot, "dist", "bin", "md2vid.js"));
      return "patch applied\n";
    }
    if (npmArgs[0] === "exec") return `${PACKAGE_VERSION}\n`;
    void options;
    return "";
  };

  const allInvocations: string[][] = [];
  const contextOptions = {
    diagnosticsDirectory: undefined,
    commandRunner: makeRunner(allInvocations),
  };
  await runRelease({ mode: "all", diagnostics: undefined }, {
    npm_execpath: "/isolated/npm-cli.js",
    MD2VID_RELEASE_COMMIT: "a".repeat(40),
  }, {
    createContext: () => createReleaseContext(contextOptions),
    currentNpmVersion: () => NPM_VERSION,
    frameworkSmoke: async (_context, framework) => { frameworkCalls.push(framework); },
  });
  assert.equal(allInvocations.filter((args) => args[0] === "pack").length, 1);
  assert.ok(allInvocations.some((args) => args[0] === "install"));

  const verifyRoot = createReleaseContext();
  const supplied = join(verifyRoot.artifacts, PACKAGE_TARBALL);
  writeFileSync(supplied, packedBytes);
  writeArtifactMetadata(verifyRoot.artifacts, createArtifactMetadata({
    tarball: supplied, packageName: "md2vid", version: PACKAGE_VERSION, tag: PACKAGE_TAG,
    commit: "a".repeat(40), nodeVersion: process.version, npmVersion: NPM_VERSION,
  }));
  const verifyInvocations: string[][] = [];
  try {
    await runRelease({ mode: "verify", tarball: supplied, metadata: undefined, metadataOnly: false,
      expectedVersion: undefined, expectedTag: undefined, expectedCommit: undefined, diagnostics: undefined }, {}, {
      createContext: () => createReleaseContext({ commandRunner: makeRunner(verifyInvocations) }),
      currentNpmVersion: () => NPM_VERSION,
      frameworkSmoke: async (_context, framework) => { frameworkCalls.push(framework); },
    });
  } finally {
    rmSync(verifyRoot.root, { recursive: true, force: true });
  }
  assert.equal(verifyInvocations.filter((args) => args[0] === "pack").length, 0);
  assert.ok(verifyInvocations.some((args) => args[0] === "install"));
  assert.deepEqual(frameworkCalls, ["hyperframes", "remotion", "hyperframes", "remotion"]);
  } finally {
    if (originalNpmExecPath === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = originalNpmExecPath;
  }
});

test("failure diagnostics redact credentials and external paths before retention", async () => {
  const caller = join(tmpdir(), `md2vid-diagnostics-${process.pid}-${Date.now()}`);
  const externalHome = join(tmpdir(), `external-home-${process.pid}`);
  const tarball = join(tmpdir(), `supplied-${process.pid}.tgz`);
  const metadata = join(tmpdir(), `artifact-${process.pid}.json`);
  const windowsDrivePath = "C:\\Users\\alice\\private\\artifact.tgz";
  const windowsUncPath = "\\\\server\\share\\private\\artifact.tgz";
  const windowsDrivePathWithSpaces = "C:\\Users\\Alice Smith\\private\\artifact.tgz";
  const windowsUncPathWithSpaces = "\\\\server\\Private Share\\secret\\artifact.tgz";
  const context = createReleaseContext({ diagnosticsDirectory: caller });
  addDiagnosticSensitivePaths(context, [externalHome, tarball, metadata]);
  const diagnostic = [
    "credential=credential-value",
    "NODE_AUTH_TOKEN=node-auth-value",
    "NPM_TOKEN=npm-token-value",
    "npm_config_registry=https://user:registry-pass@registry.example.test/",
    "npm_config_userconfig=/external/config/.npmrc",
    "//registry.example.test/:_authToken=registry-token-value",
    "_authToken=auth-token-value",
    "Authorization: Bearer bearer-value",
    "Authorization: Basic basic-value",
    "password=password-value secret=secret-value token=token-value",
    "https://url-user:url-password@example.test/private",
    '{"NODE_AUTH_TOKEN":"json-node-secret","NPM_TOKEN":"json-npm-secret","_authToken":"json-auth-secret","credential":"json-credential-secret","password":"json-password-secret","secret":"json-secret-secret","token":"json-token-secret","authorization":"json-authorization-secret","npm_config_registry":"json-registry-secret"}',
    "NODE_AUTH_TOKEN: yaml-node-secret NPM_TOKEN: yaml-npm-secret _authToken: yaml-auth-secret credential: yaml-credential-secret password: yaml-password-secret secret: yaml-secret-secret token: yaml-token-secret authorization: yaml-authorization-secret npm_config_cache: yaml-cache-secret",
    '[{\"token\": \"array-token-secret\"}, {\"Authorization\": \"Bearer array-bearer-secret\"}]',
    externalHome,
    tarball,
    metadata,
    windowsDrivePath,
    windowsUncPath,
    windowsDrivePathWithSpaces,
    windowsUncPathWithSpaces,
    caller,
  ].join("\n");
  try {
    await assert.rejects(
      () => runStage("verify", () => { throw new Error(diagnostic); }, context),
      /FAIL \[verify\]/,
    );
    finishReleaseContext(context, false);
    assert.ok(existsSync(join(caller, "summary.json")));
    const retained = [
      readFileSync(join(caller, "verify.log"), "utf8"),
      readFileSync(join(caller, "summary.json"), "utf8"),
    ].join("\n");
    assert.doesNotMatch(retained, /credential|NODE_AUTH_TOKEN|NPM_TOKEN|npm_config_|_authToken|Authorization|password|secret|token/i);
    assert.doesNotMatch(retained, /credential-value|node-auth-value|npm-token-value|registry-pass|registry-token-value|auth-token-value|bearer-value|basic-value|password-value|secret-value|token-value|url-user|url-password|json-.*-secret|yaml-.*-secret|array-.*-secret/);
    for (const path of [externalHome, tarball, metadata, caller, context.root, context.prefix]) {
      assert.equal(retained.includes(path), false, path);
    }
    for (const value of [
      windowsDrivePath,
      windowsUncPath,
      windowsDrivePathWithSpaces,
      windowsUncPathWithSpaces,
    ]) {
      assert.equal(retained.includes(value), false, value);
    }
    assert.doesNotMatch(retained, /Smith|Private Share|Share|private|secret|artifact\.tgz/i);
    assert.match(retained, /\[REDACTED/);
    assert.equal(existsSync(context.root), false);
  } finally {
    rmSync(caller, { recursive: true, force: true });
    rmSync(context.root, { recursive: true, force: true });
  }
});

test("successful diagnostics cleanup removes only an invocation-owned target", () => {
  const parent = mkdtempSync(join(tmpdir(), "md2vid-owned-diagnostics-"));
  const caller = join(parent, "diagnostics");
  const sibling = join(parent, "sentinel.txt");
  writeFileSync(sibling, "preserve\n");
  const context = createReleaseContext({ diagnosticsDirectory: caller });
  try {
    writeFileSync(join(context.diagnostics, "stage.log"), "ok\n");
    finishReleaseContext(context, true);
    assert.equal(existsSync(caller), false);
    assert.equal(readFileSync(sibling, "utf8"), "preserve\n");
  } finally {
    rmSync(parent, { recursive: true, force: true });
    rmSync(context.root, { recursive: true, force: true });
  }
});

const REGISTRY_INTEGRITY = `sha512-${Buffer.alloc(64).toString("base64")}`;

function npmVersionMissingError(version: string): Error & {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const stdout = JSON.stringify({
    error: {
      code: "E404",
      summary: `No match found for version ${version}`,
      detail: `'md2vid@${version}' is not in this registry.`,
    },
  });
  const stderr = [
    "npm error code E404",
    `npm error 404 No match found for version ${version}`,
    "npm error 404",
    `npm error 404  'md2vid@${version}' is not in this registry.`,
    "npm error 404",
    "npm error 404 Note that you can also install from a tarball, folder, http url, or git url.",
  ].join("\n");
  return Object.assign(new Error(stderr), { status: 1, stdout, stderr });
}

function npmCurrentMissingError(version: string): Error & {
  status: number;
  stdout: string;
  stderr: string;
} {
  const stdout = JSON.stringify({
    error: {
      code: "E404",
      summary: `No match found for version ${version}`,
      detail: `The requested resource 'md2vid@${version}' could not be found or you do not have permission to access it.\n\nNote that you can also install from a\ntarball, folder, http url, or git url.`,
    },
  });
  const stderr = [
    "npm error code E404",
    `npm error 404 No match found for version ${version}`,
    "npm error 404",
    `npm error 404  The requested resource 'md2vid@${version}' could not be found or you do not have permission to access it.`,
    "npm error 404",
    "npm error 404 Note that you can also install from a",
    "npm error 404 tarball, folder, http url, or git url.",
    "npm error A complete log of this run can be found in: /tmp/npm-debug.log",
  ].join("\n");
  return Object.assign(new Error(stderr), { status: 1, stdout, stderr });
}

test("registry integrity accepts canonical matching SRI and distinguishes failures", () => {
  assert.doesNotThrow(() => assertRegistryIntegrity(`${JSON.stringify(REGISTRY_INTEGRITY)}\n`, REGISTRY_INTEGRITY));
  assert.throws(() => assertRegistryIntegrity(JSON.stringify(REGISTRY_INTEGRITY), `sha512-${Buffer.alloc(64, 1).toString("base64")}`), /registry integrity mismatch/);
  assert.throws(() => assertRegistryIntegrity("not-json", REGISTRY_INTEGRITY), /invalid registry integrity JSON/);
  assert.throws(() => assertRegistryIntegrity(JSON.stringify("sha512-abc"), REGISTRY_INTEGRITY), /invalid registry integrity value/);
});

test("registry install arguments are exact and versions are strict stable triples", () => {
  assert.deepEqual(registryInstallArguments("1.2.3", "/tmp/prefix"), [
    "install", "--dry-run=false", "--prefix", "/tmp/prefix", "--foreground-scripts",
    "--registry=https://registry.npmjs.org", "md2vid@1.2.3",
  ]);
  for (const version of ["1.2", "01.2.3", "1.2.3-beta", "../1.2.3"]) {
    assert.throws(() => registryInstallArguments(version, "/tmp/prefix"), /invalid registry version/);
  }
});

test("required HyperFrames version comes from an exact stable package dependency", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-hyperframes-version-"));
  const packageFile = join(root, "package.json");
  try {
    writeFileSync(
      packageFile,
      JSON.stringify({ dependencies: { hyperframes: HYPERFRAMES_VERSION } }),
    );
    assert.equal(requiredHyperframesVersion(packageFile), HYPERFRAMES_VERSION);
    for (const invalid of [
      `^${HYPERFRAMES_VERSION}`,
      `~${HYPERFRAMES_VERSION}`,
      `${HYPERFRAMES_VERSION}-beta`,
      "01.2.3",
    ]) {
      writeFileSync(packageFile, JSON.stringify({ dependencies: { hyperframes: invalid } }));
      assert.throws(() => requiredHyperframesVersion(packageFile), /exact stable HyperFrames dependency/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("registry integrity polling retries only propagation 404s with bounded delays", async () => {
  const attempts: string[] = [];
  const sleeps: number[] = [];
  let call = 0;
  const result = await pollRegistryIntegrity("1.2.3", REGISTRY_INTEGRITY, {
    lookup: async (version) => {
      attempts.push(version);
      call++;
      if (call < 3) throw npmVersionMissingError("1.2.3");
      return JSON.stringify(REGISTRY_INTEGRITY);
    },
    sleep: async (delay) => { sleeps.push(delay); },
  });
  assert.equal(result, REGISTRY_INTEGRITY);
  assert.deepEqual(attempts, ["1.2.3", "1.2.3", "1.2.3"]);
  assert.deepEqual(sleeps, [1000, 2000]);
});

test("registry polling accepts current pinned npm missing-version detail", async () => {
  let attempts = 0;
  const sleeps: number[] = [];
  await pollRegistryIntegrity("9.9.9", REGISTRY_INTEGRITY, {
    lookup: async () => {
      attempts++;
      if (attempts === 1) throw npmCurrentMissingError("9.9.9");
      return JSON.stringify(REGISTRY_INTEGRITY);
    },
    sleep: async (delay) => { sleeps.push(delay); },
  });
  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [1000]);
});

test("registry polling accepts high SemVer components in canonical E404 output", async () => {
  for (const version of ["401.0.0", "1.500.0"]) {
    let attempts = 0;
    const sleeps: number[] = [];
    await pollRegistryIntegrity(version, REGISTRY_INTEGRITY, {
      lookup: async () => {
        attempts++;
        if (attempts === 1) throw npmVersionMissingError(version);
        return JSON.stringify(REGISTRY_INTEGRITY);
      },
      sleep: async (delay) => { sleeps.push(delay); },
    });
    assert.equal(attempts, 2);
    assert.deepEqual(sleeps, [1000]);
  }
});

test("registry integrity polling exhausts six propagation 404 attempts", async () => {
  const sleeps: number[] = [];
  let attempts = 0;
  await assert.rejects(() => pollRegistryIntegrity("1.2.3", REGISTRY_INTEGRITY, {
    lookup: async () => {
      attempts++;
      throw npmVersionMissingError("1.2.3");
    },
    sleep: async (delay) => { sleeps.push(delay); },
  }), /registry propagation timeout after 6 attempts/);
  assert.equal(attempts, 6);
  assert.deepEqual(sleeps, [1000, 2000, 4000, 8000, 15000]);
});

test("registry polling fails immediately for non-404 and invalid responses", async () => {
  const embeddedE404 = npmVersionMissingError("1.2.3");
  for (const error of [
    Object.assign(new Error("network"), { code: "ECONNRESET" }),
    Object.assign(new Error("server"), { status: 500, stderr: "500" }),
    Object.assign(new Error("auth"), { status: 1, stderr: "npm error code E401" }),
    Object.assign(new Error("forbidden"), { status: 1, stderr: "npm error code E403" }),
    Object.assign(new Error("rate limit"), { status: 1, stderr: "npm error code E429" }),
    Object.assign(new Error("tls"), { code: "CERT_HAS_EXPIRED", status: null }),
    Object.assign(new Error("contradictory auth"), {
      status: 1,
      stdout: JSON.stringify({ error: { code: "E401" } }),
      stderr: embeddedE404.stderr,
    }),
    ...[401, 403, 429, 500].map((status) => Object.assign(
      new Error(`contradictory HTTP ${status}`),
      {
        status: 1,
        stdout: embeddedE404.stdout,
        stderr: `${embeddedE404.stderr}\nnpm error ${status} terminal registry response`,
      },
    )),
    Object.assign(new Error("contradictory transport"), {
      status: 1,
      stdout: embeddedE404.stdout,
      stderr: `${embeddedE404.stderr}\nnpm error ECONNRESET`,
    }),
    Object.assign(new Error("contradictory npm code"), {
      status: 1,
      stdout: embeddedE404.stdout,
      stderr: `${embeddedE404.stderr}\nnpm error code EUSAGE`,
    }),
    Object.assign(new Error("embedded HTTP 400"), {
      status: 1,
      stdout: embeddedE404.stdout,
      stderr: embeddedE404.stderr.replace(
        "npm error 404 No match found for version 1.2.3",
        "npm error 404 No match found for version 1.2.3; 400 Bad Request",
      ),
    }),
    Object.assign(new Error("embedded transport"), {
      status: 1,
      stdout: embeddedE404.stdout,
      stderr: embeddedE404.stderr.replace(
        "npm error 404 No match found for version 1.2.3",
        "npm error 404 No match found for version 1.2.3; EHOSTUNREACH",
      ),
    }),
  ]) {
    let attempts = 0;
    let sleeps = 0;
    await assert.rejects(() => pollRegistryIntegrity("1.2.3", REGISTRY_INTEGRITY, {
      lookup: async () => { attempts++; throw error; },
      sleep: async () => { sleeps++; },
    }));
    assert.equal(attempts, 1);
    assert.equal(sleeps, 0);
  }
  let attempts = 0;
  await assert.rejects(() => pollRegistryIntegrity("1.2.3", REGISTRY_INTEGRITY, {
    lookup: async () => { attempts++; return JSON.stringify("sha512-abc"); },
    sleep: async () => { throw new Error("must not sleep"); },
  }), /invalid registry integrity value/);
  assert.equal(attempts, 1);

  let wrongVersionSleeps = 0;
  await assert.rejects(() => pollRegistryIntegrity("1.2.3", REGISTRY_INTEGRITY, {
    lookup: async () => { throw npmVersionMissingError("1.2.4"); },
    sleep: async () => { wrongVersionSleeps++; },
  }));
  assert.equal(wrongVersionSleeps, 0);
});

test("registry parser strictly validates stable version, canonical integrity, and diagnostics", () => {
  assert.deepEqual(parseReleaseArguments(["registry", "--version", "1.2.3", "--integrity", REGISTRY_INTEGRITY], {}), {
    mode: "registry", version: "1.2.3", integrity: REGISTRY_INTEGRITY, diagnostics: undefined,
  });
  for (const argv of [
    ["registry", "--version", "1.2", "--integrity", REGISTRY_INTEGRITY],
    ["registry", "--version", "../1.2.3", "--integrity", REGISTRY_INTEGRITY],
    ["registry", "--version", "1.2.3", "--integrity", "sha512-abc"],
    ["registry", "--version", "1.2.3", "--integrity", "/tmp/hash"],
  ]) assert.throws(() => parseReleaseArguments(argv, {}), /invalid|canonical|integrity/);
});

test("registry verification uses public install checks without framework smoke", async () => {
  const originalNpmExecPath = process.env.npm_execpath;
  process.env.npm_execpath = "/isolated/npm-cli.js";
  const context = createReleaseContext();
  const calls: string[][] = [];
  const skillEnvironments: NodeJS.ProcessEnv[] = [];
  const runner: CommandRunner = (_command, args, options = {}) => {
    const npmArgs = args[0]?.endsWith("npm-cli.js") ? args.slice(1) : args;
    calls.push([...npmArgs]);
    if (npmArgs[0] === "install") {
      const prefix = npmArgs[npmArgs.indexOf("--prefix") + 1];
      const root = join(prefix, "node_modules", "md2vid");
      mkdirSync(join(prefix, "node_modules", "hyperframes"), { recursive: true });
      writeFileSync(join(prefix, "node_modules", "hyperframes", "package.json"), JSON.stringify({ version: HYPERFRAMES_VERSION }));
      mkdirSync(join(root, "dist", "bin"), { recursive: true });
      mkdirSync(join(root, "skill", "md2vid"), { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "md2vid", version: "1.2.3" }));
      writeFileSync(join(root, "dist", "bin", "md2vid.js"), "cli");
      writeFileSync(join(root, "skill", "md2vid", "SKILL.md"), "skill\n");
      return "patch applied\n";
    }
    if (args.includes("--version")) return "1.2.3\n";
    if (args.includes("--help")) return "npm install -g md2vid\nnpx --yes=false md2vid\nNode.js >=22.18\n";
    if (args.includes("install-skill")) {
      const env = options.env ?? {};
      skillEnvironments.push(env);
      const root = env.CLAUDE_CONFIG_DIR ?? join(env.HOME!, ".claude");
      const destination = env.CLAUDE_CONFIG_DIR
        ? join(root, "skills", "md2vid")
        : join(root, "skills", "md2vid");
      rmSync(destination, { recursive: true, force: true });
      mkdirSync(destination, { recursive: true });
      writeFileSync(join(destination, "SKILL.md"), "skill\n");
      return "";
    }
    if (npmArgs[0] === "exec") return "1.2.3\n";
    void options;
    return "";
  };
  context.commandRunner = runner;
  try {
    await verifyRegistryArtifact(context, "1.2.3", REGISTRY_INTEGRITY, {
      poll: async () => REGISTRY_INTEGRITY,
      sleep: async () => undefined,
    });
    assert.equal(existsSync(join(context.work, "smoke-hyperframes-case")), false);
    assert.equal(existsSync(join(context.work, "smoke-remotion-case")), false);
    assert.deepEqual(calls.find((args) => args[0] === "install"), [
      "install", "--dry-run=false", "--prefix", context.prefix, "--foreground-scripts",
      "--registry=https://registry.npmjs.org", "md2vid@1.2.3",
    ]);
    assert.equal(calls.filter((args) => args[1] === "--version").length, 1);
    assert.equal(calls.filter((args) => args[1] === "--help").length, 1);
    assert.equal(calls.filter((args) => args.includes("install-skill")).length, 2);
    assert.equal(skillEnvironments.length, 2);
    assert.ok(skillEnvironments[0].CLAUDE_CONFIG_DIR?.startsWith(context.root));
    assert.equal(skillEnvironments[1].CLAUDE_CONFIG_DIR, undefined);
    assert.ok(skillEnvironments[1].HOME?.startsWith(context.root));
  } finally {
    if (originalNpmExecPath === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = originalNpmExecPath;
    finishReleaseContext(context, true);
  }
});

test("registry verification rejects requested package and HyperFrames version mismatches", async () => {
  const originalNpmExecPath = process.env.npm_execpath;
  process.env.npm_execpath = "/isolated/npm-cli.js";
  try {
  for (const mismatch of ["package", "hyperframes"] as const) {
    const context = createReleaseContext();
    context.commandRunner = (_command, args) => {
      const npmArgs = args[0]?.endsWith("npm-cli.js") ? args.slice(1) : args;
      if (npmArgs[0] !== "install") return npmArgs[0] === "exec" ? "1.2.3\n" : "1.2.3\n";
      const prefix = npmArgs[npmArgs.indexOf("--prefix") + 1];
      const packageRoot = join(prefix, "node_modules", "md2vid");
      mkdirSync(join(prefix, "node_modules", "hyperframes"), { recursive: true });
      mkdirSync(join(packageRoot, "dist", "bin"), { recursive: true });
      mkdirSync(join(packageRoot, "skill", "md2vid"), { recursive: true });
      writeFileSync(
        join(prefix, "node_modules", "hyperframes", "package.json"),
        JSON.stringify({
          version: mismatch === "hyperframes"
            ? "999.999.999"
            : HYPERFRAMES_VERSION,
        }),
      );
      writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "md2vid", version: mismatch === "package" ? "9.9.9" : "1.2.3" }));
      writeFileSync(join(packageRoot, "dist", "bin", "md2vid.js"), "cli");
      writeFileSync(join(packageRoot, "skill", "md2vid", "SKILL.md"), "skill\n");
      return "patch applied\n";
    };
    try {
      await assert.rejects(() => verifyRegistryArtifact(context, "1.2.3", REGISTRY_INTEGRITY, {
        poll: async () => REGISTRY_INTEGRITY,
        sleep: async () => undefined,
      }), mismatch === "package" ? /installed package version/ : /HyperFrames package version/);
    } finally {
      finishReleaseContext(context, true);
    }
  }
  } finally {
    if (originalNpmExecPath === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = originalNpmExecPath;
  }
});

test("production registry lookup uses the current pinned npm command seam", async () => {
  const originalNpmExecPath = process.env.npm_execpath;
  process.env.npm_execpath = "/isolated/npm-cli.js";
  const calls: Array<{ command: string; args: string[] }> = [];
  const context = createReleaseContext({
    commandRunner: (command, args) => {
      calls.push({ command, args });
      return JSON.stringify(REGISTRY_INTEGRITY);
    },
  });
  try {
    await pollRegistryIntegrity("1.2.3", REGISTRY_INTEGRITY, {
      context,
      sleep: async () => undefined,
    });
    assert.deepEqual(calls, [{
      command: process.execPath,
      args: [
        "/isolated/npm-cli.js", "view", "md2vid@1.2.3", "dist.integrity", "--json",
        "--registry=https://registry.npmjs.org",
      ],
    }]);
  } finally {
    if (originalNpmExecPath === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = originalNpmExecPath;
    finishReleaseContext(context, true);
  }
});

test("registry install requires successful postinstall output", () => {
  const originalNpmExecPath = process.env.npm_execpath;
  process.env.npm_execpath = "/isolated/npm-cli.js";
  const context = createReleaseContext({ commandRunner: () => "installed without lifecycle confirmation\n" });
  try {
    assert.throws(() => installRegistryArtifact(context, "1.2.3"), /patch|caption-loop/i);
  } finally {
    if (originalNpmExecPath === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = originalNpmExecPath;
    finishReleaseContext(context, true);
  }
});

test("registry mode rejects unpinned npm before lookup or install", async () => {
  const calls: string[][] = [];
  let registryCalls = 0;
  const context = createReleaseContext({
    commandRunner: (_command, args) => {
      calls.push([...args]);
      return "10.9.0\n";
    },
  });
  try {
    await assert.rejects(() => runRelease({
      mode: "registry", version: "1.2.3", integrity: REGISTRY_INTEGRITY, diagnostics: undefined,
    }, { npm_execpath: "/isolated/npm-cli.js" }, {
      createContext: () => context,
      registryVerification: async () => { registryCalls++; },
    }), /npm version must be exactly 11\.15\.0/);
    assert.deepEqual(calls, [["/isolated/npm-cli.js", "--version"]]);
    assert.equal(registryCalls, 0);
  } finally {
    rmSync(context.root, { recursive: true, force: true });
  }
});

test("registry mode verifies pinned npm through the same npm_execpath before proceeding", async () => {
  const calls: string[][] = [];
  let registryCalls = 0;
  const context = createReleaseContext({
    commandRunner: (_command, args) => {
      calls.push([...args]);
      return `${NPM_VERSION}\n`;
    },
  });
  await runRelease({
    mode: "registry", version: "1.2.3", integrity: REGISTRY_INTEGRITY, diagnostics: undefined,
  }, { npm_execpath: "/isolated/npm-cli.js" }, {
    createContext: () => context,
    registryVerification: async () => { registryCalls++; },
  });
  assert.deepEqual(calls, [["/isolated/npm-cli.js", "--version"]]);
  assert.equal(registryCalls, 1);
  assert.equal(existsSync(context.root), false);
});

test("registry mode creates one context, skips framework smoke, and cleans up on success", async () => {
  const context = createReleaseContext();
  let registryCalls = 0;
  let smokeCalls = 0;
  await runRelease({
    mode: "registry", version: "1.2.3", integrity: REGISTRY_INTEGRITY, diagnostics: undefined,
  }, {}, {
    createContext: () => context,
    currentNpmVersion: () => NPM_VERSION,
    registryVerification: async (actualContext, version, integrity) => {
      registryCalls++;
      assert.equal(actualContext, context);
      assert.equal(version, "1.2.3");
      assert.equal(integrity, REGISTRY_INTEGRITY);
    },
    frameworkSmoke: async () => { smokeCalls++; },
  });
  assert.equal(registryCalls, 1);
  assert.equal(smokeCalls, 0);
  assert.equal(existsSync(context.root), false);
});

test("registry mode retains sanitized diagnostics on failure", async () => {
  const caller = join(tmpdir(), `md2vid-registry-diagnostics-${process.pid}-${Date.now()}`);
  const args = parseReleaseArguments([
    "registry", "--version", "1.2.3", "--integrity", REGISTRY_INTEGRITY,
    "--diagnostics", caller,
  ], {});
  try {
    await assert.rejects(() => runRelease(args, {}, {
      currentNpmVersion: () => NPM_VERSION,
      registryVerification: async () => {
        throw new Error("network failed token=secret-value /private/home");
      },
    }), /FAIL \[registry\]: network failed/);
    assert.ok(existsSync(join(caller, "summary.json")));
    const retained = readFileSync(join(caller, "registry.log"), "utf8");
    assert.doesNotMatch(retained, /secret-value|token|\/private\/home/i);
  } finally {
    rmSync(caller, { recursive: true, force: true });
  }
});
