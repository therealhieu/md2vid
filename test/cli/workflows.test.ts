import assert from "node:assert/strict";
import {
  chmodSync,
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
import { join } from "node:path";
import test from "node:test";
import { getAdapter } from "../../frameworks/index.ts";
import { DEFAULT_GSAP_SRC } from "../../frameworks/hyperframes/scaffold.ts";
import {
  run as buildRun,
  type BuildDependencies,
} from "../../scripts/build.ts";
import { createProject } from "../../scripts/new_video.ts";
import {
  run as regroupRun,
  type RegroupDependencies,
} from "../../scripts/regroup.ts";
import { run as transcribeRun } from "../../scripts/transcribe.ts";
import { run as verifyRun } from "../../scripts/verify.ts";
import { makePcmWav } from "../helpers/wav.ts";

type Project = {
  root: string;
  shared: string;
  output: string;
};

interface WorkflowCase {
  framework: "hyperframes" | "remotion";
  layout: "flat" | "canonical";
}

interface WorkflowProject {
  root: string;
  outputDir: string;
  sharedDir: string;
}

const ONE_SECOND_WAV = makePcmWav({ sampleRate: 48_000, sampleFrames: 48_000 });

function createWorkflowCase({ framework, layout }: WorkflowCase): WorkflowProject {
  const root = mkdtempSync(join(tmpdir(), `md2vid-workflow-${layout}-${framework}-`));
  const outputDir = layout === "flat" ? join(root, "video") : join(root, framework);
  createProject(outputDir, "video", getAdapter(framework));

  const sharedDir = layout === "flat" ? outputDir : join(root, "shared");
  if (layout === "canonical") {
    mkdirSync(sharedDir, { recursive: true });
    renameSync(join(outputDir, "video.config.json"), join(sharedDir, "video.config.json"));
  }

  const phrases = {
    intro: ["Intro", "sets", "the", "workflow", "context", "clearly."],
    details: ["Details", "exercise", "each", "framework", "layout", "path."],
    recap: ["Recap", "confirms", "the", "verified", "result", "again."],
  };
  const voices = (Object.keys(phrases) as Array<keyof typeof phrases>).map((id) => ({
    id,
    path: `assets/voice/${id}.wav`,
    duration_s: 1,
    words: phrases[id].map((text, index) => ({
      text,
      start: +(index / 7).toFixed(3),
      end: +((index + 1) / 7).toFixed(3),
    })),
  }));
  writeFileSync(join(sharedDir, "audio_meta.json"), `${JSON.stringify({ voices }, null, 2)}\n`);
  const voiceDir = join(sharedDir, "assets", "voice");
  mkdirSync(voiceDir, { recursive: true });
  for (const { id } of voices) writeFileSync(join(voiceDir, `${id}.wav`), ONE_SECOND_WAV);

  const configPath = join(sharedDir, "video.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.slugs = {
    intro: "01-intro",
    details: "02-details",
    recap: "03-recap",
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  if (framework === "hyperframes") {
    const framesDir = join(outputDir, "compositions", "frames");
    for (const slug of Object.values(config.slugs) as string[]) {
      writeFileSync(
        join(framesDir, `${slug}.html`),
        `<template data-composition-id="${slug}">
<div data-composition-id="${slug}" data-frame-theme="light" data-width="1920" data-height="1080" data-duration="1">${slug}</div>
<script src="${DEFAULT_GSAP_SRC}"></script>
<script>window.__timelines = window.__timelines || {}; window.__timelines["${slug}"] = gsap.timeline({ paused: true });</script>
</template>\n`,
      );
    }
  }

  return { root, outputDir, sharedDir };
}

function captureConsole(run: () => number): { code: number; stdout: string; stderr: string } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  try {
    console.log = (...args: unknown[]) => stdout.push(args.join(" "));
    console.error = (...args: unknown[]) => stderr.push(args.join(" "));
    return { code: run(), stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test("build emits one actionable visual-sync warning for a legacy project", () => {
  const project = createWorkflowCase({ framework: "hyperframes", layout: "flat" });
  const warnings: string[] = [];
  const originalWarn = console.warn;
  try {
    console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
    const result = captureConsole(() => buildRun([project.outputDir]));

    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(warnings, [
      `WARN [build] ${join(project.sharedDir, "visual_beats.json")}: no visual beat specification; semantic checks are skipped`,
    ]);
  } finally {
    console.warn = originalWarn;
    rmSync(project.root, { recursive: true, force: true });
  }
});

test("build and regroup emit one legacy visual-sync warning", () => {
  const project = createWorkflowCase({ framework: "hyperframes", layout: "flat" });
  const warnings: string[] = [];
  const originalWarn = console.warn;
  try {
    console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
    assert.equal(buildRun([project.outputDir]), 0);
    assert.equal(regroupRun([project.outputDir, "--max-chars", "54"]), 0);

    assert.deepEqual(warnings, [
      `WARN [build] ${join(project.sharedDir, "visual_beats.json")}: no visual beat specification; semantic checks are skipped`,
    ]);
  } finally {
    console.warn = originalWarn;
    rmSync(project.root, { recursive: true, force: true });
  }
});

test("verify replans current visual-beat inputs instead of trusting emitted artifacts", () => {
  const project = createWorkflowCase({ framework: "hyperframes", layout: "flat" });
  try {
    assert.equal(buildRun([project.outputDir]), 0);
    writeFileSync(join(project.sharedDir, "visual_beats.json"), `${JSON.stringify({
      version: 1,
      frames: {
        "unknown-frame": {
          beats: [{ id: "unknown", text: "Unknown", cue: { wordIndex: 0 } }],
        },
      },
    }, null, 2)}\n`);

    const result = captureConsole(() => verifyRun([project.outputDir]));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /unknown frame slug "unknown-frame"/);
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
});

function enableIntroVisualBeat(project: WorkflowProject): void {
  const configPath = join(project.sharedDir, "video.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.visualSync = { mode: "required" };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(join(project.sharedDir, "visual_beats.json"), `${JSON.stringify({
    version: 1,
    frames: {
      "01-intro": {
        beats: [{ id: "intro", text: "Intro", cue: { wordIndex: 0 } }],
      },
    },
  }, null, 2)}\n`);
}

test("regroup preserves resolved visual beats in Remotion output", () => {
  const project = createWorkflowCase({ framework: "remotion", layout: "canonical" });
  try {
    enableIntroVisualBeat(project);
    assert.equal(buildRun([project.outputDir]), 0);
    const before = JSON.parse(readFileSync(join(project.outputDir, "build_plan.json"), "utf8"));

    assert.equal(regroupRun([project.outputDir, "--max-chars", "54"]), 0);
    const after = JSON.parse(readFileSync(join(project.outputDir, "build_plan.json"), "utf8"));

    assert.deepEqual(
      after.frames.map((frame: { visualBeats?: unknown }) => frame.visualBeats),
      before.frames.map((frame: { visualBeats?: unknown }) => frame.visualBeats),
    );
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
});

test("multi-framework builds preserve one shared neutral plan", () => {
  const hyperframes = createWorkflowCase({ framework: "hyperframes", layout: "canonical" });
  const remotionOutput = join(hyperframes.root, "remotion");
  try {
    createProject(remotionOutput, "video", getAdapter("remotion"));
    enableIntroVisualBeat(hyperframes);

    assert.equal(buildRun([hyperframes.outputDir]), 0);
    const hyperframesPlan = JSON.parse(readFileSync(join(hyperframes.sharedDir, "build", "build_plan.json"), "utf8"));
    assert.equal(buildRun([remotionOutput]), 0);
    const remotionPlan = JSON.parse(readFileSync(join(hyperframes.sharedDir, "build", "build_plan.json"), "utf8"));

    assert.deepEqual(hyperframesPlan.frames, remotionPlan.frames);
    assert.equal(hyperframesPlan.frames[0].start, 0);
  } finally {
    rmSync(hyperframes.root, { recursive: true, force: true });
  }
});

test("build rejects neutral timing keys in output-local configuration", () => {  const project = createWorkflowCase({ framework: "remotion", layout: "canonical" });
  try {
    writeFileSync(join(project.outputDir, "output.config.json"), `${JSON.stringify({
      framework: "remotion",
      visualSync: { mode: "off" },
    }, null, 2)}\n`);

    const result = captureConsole(() => buildRun([project.outputDir]));

    assert.equal(result.code, 1);
    assert.match(result.stderr, /output\.config\.json\.visualSync is neutral-only/);
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
});

function writeNeutralConfig(shared: string): void {
  writeFileSync(join(shared, "video.config.json"), JSON.stringify({
    timing: { tail: 0.5, xfade: 0.5, gap: 0.5 },
    canvas: { width: 1920, height: 1080 },
    slugs: {},
  }));
}

function writeValidAudioMeta(shared: string): void {
  writeFileSync(join(shared, "audio_meta.json"), JSON.stringify({
    voices: [{
      id: "intro",
      path: "assets/voice/intro.wav",
      duration_s: 1,
      words: [{ id: "w0", text: "Intro", start: 0, end: 1 }],
    }],
  }));
  mkdirSync(join(shared, "assets", "voice"), { recursive: true });
  writeFileSync(join(shared, "assets", "voice", "intro.wav"), ONE_SECOND_WAV);
}

function validHyperframesProject(): Project {
  const root = mkdtempSync(join(tmpdir(), "md2vid-verify-hf-"));
  const shared = join(root, "shared");
  const output = join(root, "hyperframes");
  mkdirSync(shared, { recursive: true });
  mkdirSync(output, { recursive: true });
  writeNeutralConfig(shared);
  writeValidAudioMeta(shared);
  writeFileSync(join(output, "output.config.json"), JSON.stringify({ framework: "hyperframes" }));
  mkdirSync(join(output, "assets", "voice"), { recursive: true });
  writeFileSync(join(output, "assets", "voice", "intro.wav"), ONE_SECOND_WAV);
  writeFileSync(join(output, "index.html"), `<script src="${DEFAULT_GSAP_SRC}"></script><script>window.__timelines["main"] = 1;</script>`);
  return { root, shared, output };
}

function validRemotionProject(): Project {
  const root = mkdtempSync(join(tmpdir(), "md2vid-verify-remotion-"));
  const shared = join(root, "shared");
  const output = join(root, "remotion");
  mkdirSync(shared, { recursive: true });
  mkdirSync(join(output, "src"), { recursive: true });
  writeNeutralConfig(shared);
  writeValidAudioMeta(shared);
  writeFileSync(join(output, "output.config.json"), JSON.stringify({ framework: "remotion" }));
  mkdirSync(join(output, "public", "assets", "voice"), { recursive: true });
  writeFileSync(join(output, "public", "assets", "voice", "intro.wav"), ONE_SECOND_WAV);
  writeFileSync(join(output, "src", "Root.tsx"), 'id="video"\n');
  writeFileSync(join(output, "build_plan.json"), JSON.stringify({
    totalDuration: 1,
    canvas: { width: 1920, height: 1080 },
    frames: [{ id: "intro" }],
  }));
  return { root, shared, output };
}

function cleanup(project: Project): void {
  rmSync(project.root, { recursive: true, force: true });
}

const ORIGINAL_JSON = `${JSON.stringify({
  total_duration_s: 2,
  width: 1920,
  height: 1080,
  groups: [{
    id: "caption-group-original",
    frame: 1,
    start: 0,
    end: 2,
    text: "One two three four five six.",
    words: [
      { id: "w1", text: "One", start: 0, end: 0.3 },
      { id: "w2", text: "two", start: 0.3, end: 0.6 },
      { id: "w3", text: "three", start: 0.6, end: 0.9 },
      { id: "w4", text: "four", start: 0.9, end: 1.2 },
      { id: "w5", text: "five", start: 1.2, end: 1.5 },
      { id: "w6", text: "six.", start: 1.5, end: 2 },
    ],
  }],
}, null, 2)}\n`;
const ORIGINAL_HTML = "ORIGINAL_HTML\n";
const ORIGINAL_PLAN = "ORIGINAL_PLAN\n";

function regroupProject(framework: "hyperframes" | "remotion"): Project & {
  neutralPath: string;
  frameworkPath: string;
  originalFramework: string;
  indexPath?: string;
  originalIndex?: string;
} {
  const root = mkdtempSync(join(tmpdir(), `md2vid-regroup-${framework}-`));
  const shared = join(root, "shared");
  const output = join(root, framework);
  mkdirSync(shared, { recursive: true });
  mkdirSync(output, { recursive: true });
  writeFileSync(join(shared, "video.config.json"), JSON.stringify({
    timing: { tail: 0.5, xfade: 0.5, gap: 0 },
    canvas: { width: 1920, height: 1080 },
    slugs: { intro: "intro" },
  }));
  writeFileSync(join(output, "output.config.json"), JSON.stringify({ framework }));
  writeFileSync(join(shared, "audio_meta.json"), JSON.stringify({
    voices: [{
      id: "intro",
      path: "assets/voice/intro.wav",
      duration_s: 2,
      words: [
        { text: "One", start: 0, end: 0.3 },
        { text: "two", start: 0.3, end: 0.6 },
        { text: "three", start: 0.6, end: 0.9 },
        { text: "four", start: 0.9, end: 1.2 },
        { text: "five", start: 1.2, end: 1.5 },
        { text: "six.", start: 1.5, end: 2 },
      ],
    }],
  }));
  mkdirSync(join(shared, "assets", "voice"), { recursive: true });
  writeFileSync(join(shared, "assets", "voice", "intro.wav"), makePcmWav({
    sampleRate: 48_000,
    sampleFrames: 96_000,
  }));
  const neutralPath = join(shared, "caption_groups.json");
  writeFileSync(neutralPath, ORIGINAL_JSON);

  const originalGroups = JSON.parse(ORIGINAL_JSON).groups;
  const originalFramework = framework === "hyperframes"
    ? `<template id="captions-template" data-composition-id="captions"><div data-composition-id="captions"><script src="${DEFAULT_GSAP_SRC}"></script><script>\n  var GROUPS = ${JSON.stringify(originalGroups)};\nwindow.__timelines["captions"] = gsap.timeline({ paused: true });</script></div></template>\n`
    : ORIGINAL_PLAN;
  const frameworkPath = framework === "hyperframes"
    ? join(output, "compositions", "captions.html")
    : join(output, "build_plan.json");
  mkdirSync(join(frameworkPath, ".."), { recursive: true });
  writeFileSync(frameworkPath, originalFramework);
  if (framework === "hyperframes") {
    const indexPath = join(output, "index.html");
    const originalIndex = `<script src="${DEFAULT_GSAP_SRC}"></script>\n<template id="captions-template" data-composition-id="captions"><div data-composition-id="captions"><script>\n  var GROUPS = ${JSON.stringify(originalGroups)};\nwindow.__timelines["captions"] = gsap.timeline({ paused: true });</script></div></template>\n`;
    writeFileSync(indexPath, originalIndex);
    return { root, shared, output, neutralPath, frameworkPath, originalFramework, indexPath, originalIndex };
  }
  return { root, shared, output, neutralPath, frameworkPath, originalFramework };
}

function buildPreflightProject({ missingVoice = false, missingGsap = false, voicePath = "assets/voice/intro.wav" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "md2vid-build-preflight-"));
  const shared = join(root, "shared");
  const output = join(root, "hyperframes");
  mkdirSync(join(shared, "build"), { recursive: true });
  mkdirSync(join(output, "compositions"), { recursive: true });
  writeFileSync(join(shared, "video.config.json"), JSON.stringify({
    slugs: { intro: "01-intro" },
    timing: { tail: 0.5, xfade: 0.5, gap: 0 },
    canvas: { width: 1920, height: 1080 },
  }));
  writeFileSync(join(shared, "audio_meta.json"), JSON.stringify({
    voices: [{
      id: "intro",
      path: voicePath,
      duration_s: 1,
      words: [{ id: "w0", text: "Intro", start: 0, end: 1 }],
    }],
  }));
  if (!missingVoice && voicePath === "assets/voice/intro.wav") {
    mkdirSync(join(shared, "assets", "voice"), { recursive: true });
    writeFileSync(join(shared, voicePath), ONE_SECOND_WAV);
  }
  writeFileSync(join(output, "output.config.json"), JSON.stringify({
    framework: "hyperframes",
    ...(missingGsap ? { gsapSrc: "assets/gsap/missing.js" } : {}),
  }));

  const artifacts = new Map<string, string>([
    [join(shared, "cues.json"), "ORIGINAL_CUES\n"],
    [join(shared, "caption_groups.json"), "ORIGINAL_CAPTIONS\n"],
    [join(shared, "build", "build_plan.json"), "ORIGINAL_PLAN\n"],
    [join(output, "index.html"), "ORIGINAL_INDEX\n"],
    [join(output, "compositions", "captions.html"), "ORIGINAL_FRAMEWORK_CAPTIONS\n"],
  ]);
  for (const [path, body] of artifacts) writeFileSync(path, body);
  return { root, shared, output, artifacts };
}

function assertArtifactBytesUnchanged(artifacts: Map<string, string>): void {
  for (const [path, body] of artifacts) {
    assert.equal(readFileSync(path, "utf8"), body, path);
  }
}

function buildDestinationPreflightProject(framework: "hyperframes" | "remotion") {
  const root = mkdtempSync(join(tmpdir(), `md2vid-build-destination-${framework}-`));
  const shared = join(root, "shared");
  const output = join(root, framework);
  mkdirSync(join(shared, "assets", "voice"), { recursive: true });
  mkdirSync(join(shared, "build"), { recursive: true });
  mkdirSync(output, { recursive: true });
  writeFileSync(join(shared, "assets", "voice", "intro.wav"), ONE_SECOND_WAV);
  writeFileSync(join(shared, "video.config.json"), JSON.stringify({
    slugs: { intro: "01-intro" },
    timing: { tail: 0.5, xfade: 0.5, gap: 0 },
    canvas: { width: 1920, height: 1080 },
  }));
  writeFileSync(join(shared, "audio_meta.json"), JSON.stringify({
    voices: [{
      id: "intro",
      path: "assets/voice/intro.wav",
      duration_s: 1,
      words: [{ id: "w0", text: "Intro", start: 0, end: 1 }],
    }],
  }));
  writeFileSync(join(output, "output.config.json"), JSON.stringify({ framework }));

  const artifacts = new Map<string, string>([
    [join(shared, "cues.json"), "ORIGINAL_CUES\n"],
    [join(shared, "caption_groups.json"), "ORIGINAL_CAPTIONS\n"],
    [join(shared, "build", "build_plan.json"), "ORIGINAL_PLAN\n"],
  ]);
  if (framework === "hyperframes") {
    mkdirSync(join(output, "compositions"), { recursive: true });
    artifacts.set(join(output, "index.html"), "ORIGINAL_INDEX\n");
    artifacts.set(join(output, "compositions", "captions.html"), "ORIGINAL_FRAMEWORK_CAPTIONS\n");
  } else {
    artifacts.set(join(output, "build_plan.json"), "ORIGINAL_REMOTION_PLAN\n");
  }
  for (const [path, body] of artifacts) writeFileSync(path, body);

  const outside = join(root, "outside-voice");
  writeFileSync(join(root, "outside-sentinel.txt"), "OUTSIDE\n");
  mkdirSync(outside);
  const destinationParent = framework === "hyperframes"
    ? join(output, "assets")
    : join(output, "public", "assets");
  mkdirSync(destinationParent, { recursive: true });
  symlinkSync(outside, join(destinationParent, "voice"));
  return { root, output, artifacts, outside };
}

function findTransactionResidue(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) =>
      path.includes(".md2vid-regroup-")
      || path.includes(".md2vid-build-")
      || path.includes("md2vid-backup")
    )
    .sort();
}

type FullBuildProject = WorkflowProject & {
  framework: "hyperframes" | "remotion";
  managedFiles: Map<string, string>;
  voiceDir: string;
  authoredPath: string;
  authoredBytes: string;
};

function fullBuildProject(framework: "hyperframes" | "remotion"): FullBuildProject {
  const project = createWorkflowCase({ framework, layout: "canonical" });
  const managedFiles = new Map<string, string>([
    [join(project.sharedDir, "cues.json"), "ORIGINAL_CUES\n"],
    [join(project.sharedDir, "caption_groups.json"), "ORIGINAL_CAPTION_GROUPS\n"],
    [join(project.sharedDir, "build", "build_plan.json"), "ORIGINAL_NEUTRAL_PLAN\n"],
    [join(project.sharedDir, "build", "visual_timing.json"), "ORIGINAL_VISUAL_TIMING\n"],
  ]);
  mkdirSync(join(project.sharedDir, "build"), { recursive: true });

  let voiceDir: string;
  let authoredPath: string;
  if (framework === "hyperframes") {
    managedFiles.set(join(project.outputDir, "index.html"), "ORIGINAL_INDEX\n");
    managedFiles.set(
      join(project.outputDir, "compositions", "captions.html"),
      "ORIGINAL_STANDALONE_CAPTIONS\n",
    );
    voiceDir = join(project.outputDir, "assets", "voice");
    authoredPath = join(project.outputDir, "compositions", "frames", "01-intro.html");
  } else {
    managedFiles.set(join(project.outputDir, "build_plan.json"), "ORIGINAL_REMOTION_PLAN\n");
    voiceDir = join(project.outputDir, "public", "assets", "voice");
    authoredPath = join(project.outputDir, "src", "Video.tsx");
  }

  for (const [path, bytes] of managedFiles) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, bytes);
  }
  mkdirSync(voiceDir, { recursive: true });
  writeFileSync(join(voiceDir, "old.wav"), "ORIGINAL_OLD_VOICE");
  writeFileSync(join(voiceDir, "stale.wav"), "ORIGINAL_STALE_VOICE");

  return {
    ...project,
    framework,
    managedFiles,
    voiceDir,
    authoredPath,
    authoredBytes: readFileSync(authoredPath, "utf8"),
  };
}

function assertFullBuildOriginals(project: FullBuildProject): void {
  assertArtifactBytesUnchanged(project.managedFiles);
  assert.deepEqual(readdirSync(project.voiceDir).sort(), ["old.wav", "stale.wav"]);
  assert.equal(readFileSync(join(project.voiceDir, "old.wav"), "utf8"), "ORIGINAL_OLD_VOICE");
  assert.equal(readFileSync(join(project.voiceDir, "stale.wav"), "utf8"), "ORIGINAL_STALE_VOICE");
  assert.equal(readFileSync(project.authoredPath, "utf8"), project.authoredBytes);
  assert.deepEqual(findTransactionResidue(project.root), []);
}

const invalidSlugCases = [
  {
    name: "path traversal",
    slugs: {
      intro: "../outside",
      details: "02-details",
      recap: "03-recap",
    },
    expected: /field "slugs\.intro".*safe single path segment/i,
  },
  {
    name: "duplicate ownership",
    slugs: {
      intro: "01-intro",
      details: "01-intro",
      recap: "03-recap",
    },
    expected: /field "slugs\.details".*unique.*voice id "intro"/i,
  },
] as const;

for (const framework of ["hyperframes", "remotion"] as const) {
  for (const { name, slugs, expected } of invalidSlugCases) {
    test(`full ${framework} build rejects ${name} before managed output mutation`, () => {
      const project = fullBuildProject(framework);

      try {
        const configPath = join(project.sharedDir, "video.config.json");
        const config = JSON.parse(readFileSync(configPath, "utf8")) as {
          slugs: Record<string, string>;
        };
        config.slugs = slugs;
        writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

        const result = captureConsole(() => buildRun([project.outputDir]));

        assert.equal(result.code, 1, result.stderr);
        assert.match(result.stderr, expected);
        assertFullBuildOriginals(project);
      } finally {
        rmSync(project.root, { recursive: true, force: true });
      }
    });
  }
}

function failingBuildDependencies(
  framework: "hyperframes" | "remotion",
  point: "emit" | "verify" | number,
): BuildDependencies {
  if (point === "emit") {
    return {
      getAdapter() {
        return {
          ...getAdapter(framework),
          emit(plan, sharedDir, outputDir, config, options) {
            getAdapter(framework).emit(plan, sharedDir, outputDir, config, options);
            writeFileSync(join(outputDir, "injected-partial-stage"), "partial");
            throw new Error("injected full-build emitter failure");
          },
        };
      },
    };
  }
  if (point === "verify") {
    return {
      getAdapter() {
        return {
          ...getAdapter(framework),
          verifyCaptionArtifact() {
            return [{ level: "error", msg: "injected full-build staged verification failure" }];
          },
        };
      },
    };
  }

  let promotions = 0;
  return {
    transactionDependencies: {
      rename(source, destination) {
        if (String(source).includes(".md2vid-build-") && ++promotions === point) {
          throw new Error(`injected full-build promotion failure ${point}`);
        }
        renameSync(source, destination);
      },
    },
  };
}

function failingRegroupDependencies(
  framework: "hyperframes" | "remotion",
  point: "config" | "planning" | "emit" | "verify" | "first-promotion" | "second-promotion" | "third-promotion",
): RegroupDependencies {
  if (point === "config") {
    return { createProjectPlan() { throw new Error("injected config failure"); } };
  }
  if (point === "planning") {
    return { createProjectPlan() { throw new Error("injected planning failure"); } };
  }
  if (point === "emit") {
    return {
      getAdapter() {
        return {
          ...getAdapter(framework),
          emit() { throw new Error("injected emit failure"); },
        };
      },
    };
  }
  if (point === "verify") {
    return {
      getAdapter() {
        return {
          ...getAdapter(framework),
          verifyCaptionArtifact() {
            return [{ level: "error", msg: "injected staged verification failure" }];
          },
        };
      },
    };
  }

  let promotions = 0;
  const failAt = point === "first-promotion" ? 1 : point === "second-promotion" ? 2 : 3;
  return {
    transactionDependencies: {
      rename(source, destination) {
        if (String(source).includes(".md2vid-regroup-") && ++promotions === failAt) {
          throw new Error(`injected ${point} failure`);
        }
        renameSync(source, destination);
      },
    },
  };
}

for (const failure of ["missing local GSAP", "missing voice asset"] as const) {
  test(`build preserves every neutral and framework artifact after ${failure} preflight failure`, () => {
    const project = buildPreflightProject({
      missingGsap: failure === "missing local GSAP",
      missingVoice: failure === "missing voice asset",
    });
    try {
      const result = captureConsole(() => buildRun([project.output]));
      assert.equal(result.code, 1);
      assert.match(
        result.stderr,
        failure === "missing local GSAP" ? /missing gsapSrc file/ : /missing voice asset/,
      );
      assertArtifactBytesUnchanged(project.artifacts);
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });
}

for (const framework of ["hyperframes", "remotion"] as const) {
  test(`build preserves neutral and ${framework} artifacts after symlinked destination preflight failure`, () => {
    const project = buildDestinationPreflightProject(framework);
    try {
      const result = captureConsole(() => buildRun([project.output]));
      assert.equal(result.code, 1);
      assert.match(result.stderr, /voice asset path contains a symlink component/i);
      assertArtifactBytesUnchanged(project.artifacts);
      assert.deepEqual(readdirSync(project.outside), []);
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });
}

test("build rejects a non-portable voice path before changing managed artifacts", () => {
  const project = buildPreflightProject({ voicePath: "assets\\voice\\intro.wav" });
  try {
    const result = captureConsole(() => buildRun([project.output]));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /path.*portable.*\.wav/i);
    assertArtifactBytesUnchanged(project.artifacts);
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
});

test("build rejects stale JSON duration against the safely floored WAV before managed output mutation", () => {
  const project = buildPreflightProject();
  try {
    writeFileSync(join(project.shared, "assets", "voice", "intro.wav"), makePcmWav({
      sampleRate: 48_000,
      sampleFrames: 837_632,
    }));
    writeFileSync(join(project.shared, "audio_meta.json"), JSON.stringify({
      voices: [{
        id: "intro",
        path: "assets/voice/intro.wav",
        duration_s: 17.451,
        words: [{ id: "w0", text: "Intro", start: 0, end: 17.451 }],
      }],
    }));

    const result = captureConsole(() => buildRun([project.output]));
    assert.equal(result.code, 1);
    assert.match(
      result.stderr,
      /audio_meta\.json.*voice "intro".*assets\/voice\/intro\.wav.*expected 17\.450666.*actual 17\.451/i,
    );
    assertArtifactBytesUnchanged(project.artifacts);
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
});

for (const framework of ["hyperframes", "remotion"] as const) {
  test(`full ${framework} build stages the immutable bytes validated before adapter preflight`, () => {
    const project = fullBuildProject(framework);
    try {
      const source = join(project.sharedDir, "assets", "voice", "details.wav");
      chmodSync(source, 0o640);
      const original = readFileSync(source);
      const replacement = makePcmWav({ sampleRate: 48_000, sampleFrames: 96_000 });
      const base = getAdapter(framework);
      const result = captureConsole(() => buildRun([project.outputDir], {
        getAdapter() {
          return {
            ...base,
            preflight(plan, sharedDir, outputDir, config, options) {
              writeFileSync(source, replacement);
              return base.preflight(plan, sharedDir, outputDir, config, options);
            },
          };
        },
      }));

      assert.equal(result.code, 0, result.stderr);
      assert.equal(
        readFileSync(join(project.voiceDir, "details.wav")).equals(original),
        true,
        "emitted bytes must come from the pre-plan immutable snapshot",
      );
      assert.equal(lstatSync(join(project.voiceDir, "details.wav")).mode & 0o777, 0o640);
      assert.equal(readFileSync(source).equals(original), false);
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  for (const point of ["emit", "verify"] as const) {
    test(`full ${framework} build preserves all managed outputs after staged ${point} failure`, () => {
      const project = fullBuildProject(framework);
      try {
        const result = captureConsole(() => buildRun(
          [project.outputDir],
          failingBuildDependencies(framework, point),
        ));
        assert.equal(result.code, 1, result.stdout);
        assert.match(result.stderr, point === "emit" ? /emitter failure/ : /staged verification failure/);
        assertFullBuildOriginals(project);
      } finally {
        rmSync(project.root, { recursive: true, force: true });
      }
    });
  }

  const promotionCount = framework === "hyperframes" ? 7 : 6;
  for (let position = 1; position <= promotionCount; position += 1) {
    test(`full ${framework} build rolls back every managed output after promotion failure ${position}/${promotionCount}`, () => {
      const project = fullBuildProject(framework);
      try {
        const result = captureConsole(() => buildRun(
          [project.outputDir],
          failingBuildDependencies(framework, position),
        ));
        assert.equal(result.code, 1, result.stdout);
        assert.match(result.stderr, new RegExp(`promotion failure ${position}`));
        assertFullBuildOriginals(project);
      } finally {
        rmSync(project.root, { recursive: true, force: true });
      }
    });
  }

  test(`successful full ${framework} build atomically replaces generated outputs, prunes stale voice files, and preserves authored source`, () => {
    const project = fullBuildProject(framework);
    try {
      const result = captureConsole(() => buildRun([project.outputDir]));
      assert.equal(result.code, 0, result.stderr);
      for (const [path, original] of project.managedFiles) {
        assert.notEqual(readFileSync(path, "utf8"), original, path);
      }
      assert.deepEqual(readdirSync(project.voiceDir).sort(), ["details.wav", "intro.wav", "recap.wav"]);
      assert.equal(readFileSync(project.authoredPath, "utf8"), project.authoredBytes);
      assert.deepEqual(findTransactionResidue(project.root), []);
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });
}

test("full HyperFrames build rejects a directory index target without changing any managed output", () => {
  const project = fullBuildProject("hyperframes");
  const indexPath = join(project.outputDir, "index.html");
  try {
    rmSync(indexPath);
    mkdirSync(indexPath);
    writeFileSync(join(indexPath, "sentinel.txt"), "DIRECTORY_SENTINEL");
    project.managedFiles.delete(indexPath);

    const result = captureConsole(() => buildRun([project.outputDir]));

    assert.equal(result.code, 1, result.stdout);
    assert.match(result.stderr, /managed target must be a regular file/i);
    assert.equal(readFileSync(join(indexPath, "sentinel.txt"), "utf8"), "DIRECTORY_SENTINEL");
    assertFullBuildOriginals(project);
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
});

test("full HyperFrames build rejects a symlink index target without changing it or any managed output", () => {
  const project = fullBuildProject("hyperframes");
  const indexPath = join(project.outputDir, "index.html");
  const outside = join(project.root, "outside-index.html");
  try {
    rmSync(indexPath);
    writeFileSync(outside, "OUTSIDE_INDEX");
    symlinkSync(outside, indexPath);
    project.managedFiles.delete(indexPath);

    const result = captureConsole(() => buildRun([project.outputDir]));

    assert.equal(result.code, 1, result.stdout);
    assert.match(result.stderr, /symbolic link/i);
    assert.equal(readFileSync(outside, "utf8"), "OUTSIDE_INDEX");
    assertFullBuildOriginals(project);
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
});

test("full build reports committed backup cleanup warnings without returning failure", () => {
  const project = fullBuildProject("hyperframes");
  try {
    let backupRemovals = 0;
    let cleanupStarted = false;
    const uncertainBackup = join(project.sharedDir, "build", "build_plan.json.md2vid-backup-2");
    const injectedLstat = new Proxy(lstatSync, {
      apply(target, thisArg, argumentsList) {
        if (cleanupStarted && argumentsList[0] === uncertainBackup) {
          throw new Error("injected full-build backup inspection failure");
        }
        return Reflect.apply(target, thisArg, argumentsList);
      },
    });
    const result = captureConsole(() => buildRun([project.outputDir], {
      transactionDependencies: {
        remove(path, options) {
          if (String(path).includes("md2vid-backup")) {
            cleanupStarted = true;
            if (++backupRemovals === 2) {
              throw new Error("injected full-build cleanup failure");
            }
          }
          rmSync(path, options);
        },
        lstat: injectedLstat,
      },
    }));

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stderr, /WARN:.*backup cleanup failed/);
    assert.match(result.stderr, /retained backups: .*caption_groups\.json\.md2vid-backup-1/);
    assert.match(result.stderr, /uncertain backups: .*build_plan\.json\.md2vid-backup-2/);
    assert.equal(readFileSync(project.authoredPath, "utf8"), project.authoredBytes);
    assert.equal(
      readdirSync(project.root, { recursive: true, encoding: "utf8" })
        .some((path) => path.includes(".md2vid-build-")),
      false,
    );
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
});

test("committed full build returns success when staging cleanup fails", () => {
  const project = fullBuildProject("hyperframes");
  let retainedStaging = "";
  try {
    const result = captureConsole(() => buildRun([project.outputDir], {
      cleanupStaging(path) {
        retainedStaging = path;
        throw new Error("injected committed staging cleanup failure");
      },
    }));

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /OK build/);
    assert.match(result.stderr, /WARN: build committed but staging cleanup failed/);
    assert.match(result.stderr, /retained staging path:/);
    assert.ok(retainedStaging);
    assert.ok(result.stderr.includes(retainedStaging), result.stderr);
    assert.equal(existsSync(retainedStaging), true);
    for (const [path, original] of project.managedFiles) {
      assert.notEqual(readFileSync(path, "utf8"), original, path);
    }
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
});

test("failed full build preserves its error result when staging cleanup also fails", () => {
  const project = fullBuildProject("hyperframes");
  let retainedStaging = "";
  try {
    const dependencies = failingBuildDependencies("hyperframes", "emit");
    const result = captureConsole(() => buildRun([project.outputDir], {
      ...dependencies,
      cleanupStaging(path) {
        retainedStaging = path;
        throw new Error("injected failed-build staging cleanup failure");
      },
    }));

    assert.equal(result.code, 1, result.stderr);
    assert.doesNotMatch(result.stdout, /OK build/);
    assert.match(result.stderr, /FAIL: injected full-build emitter failure/);
    assert.match(result.stderr, /WARN: build failed before commit and staging cleanup failed/);
    assert.match(result.stderr, /retained staging path:/);
    assert.ok(retainedStaging);
    assert.ok(result.stderr.includes(retainedStaging), result.stderr);
    assert.equal(existsSync(retainedStaging), true);
    assertArtifactBytesUnchanged(project.managedFiles);
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
});

for (const framework of ["hyperframes", "remotion"] as const) {
  for (const layout of ["flat", "canonical"] as const) {
    test(`${layout} ${framework} build, regroup, transcribe, and verify`, () => {
      const project = createWorkflowCase({ framework, layout });
      try {
        assert.equal(buildRun([project.outputDir]), 0);
        assert.equal(regroupRun([project.outputDir, "--max-chars", "54"]), 0);

        let transcribeBaseDir = "";
        assert.equal(transcribeRun([project.outputDir], {
          transcribeVoices(meta, baseDir) {
            transcribeBaseDir = baseDir;
            return { meta, ok: meta.voices.length, total: meta.voices.length };
          },
        }), 0);
        assert.equal(transcribeBaseDir, project.sharedDir);
        assert.equal(verifyRun([project.outputDir]), 0);

        const plan = JSON.parse(readFileSync(join(project.sharedDir, "build", "build_plan.json"), "utf8"));
        assert.deepEqual(
          plan.frames.map((frame: { id: string; frameNum: number }) => [frame.id, frame.frameNum]),
          [["intro", 1], ["details", 2], ["recap", 3]],
        );
        assert.equal(existsSync(join(project.sharedDir, "caption_groups.json")), true);
      } finally {
        rmSync(project.root, { recursive: true, force: true });
      }
    });
  }
}

test("HyperFrames regroup atomically refreshes JSON, standalone captions, and embedded captions", () => {
  const project = createWorkflowCase({ framework: "hyperframes", layout: "flat" });
  try {
    assert.equal(buildRun([project.outputDir]), 0);
    const indexPath = join(project.outputDir, "index.html");
    const before = readFileSync(indexPath, "utf8");
    const beforeEmbedded = before.match(/<template id="captions-template"[\s\S]*?var GROUPS = (\[[^;]*\]);[\s\S]*?<\/template>/);
    assert.ok(beforeEmbedded);
    const beforeGroups = JSON.parse(beforeEmbedded[1]);

    assert.equal(regroupRun([project.outputDir, "--max-chars", "10"]), 0);

    const jsonGroups = JSON.parse(readFileSync(join(project.sharedDir, "caption_groups.json"), "utf8")).groups;
    const standalone = readFileSync(join(project.outputDir, "compositions", "captions.html"), "utf8");
    const embeddedIndex = readFileSync(indexPath, "utf8");
    const standaloneMatch = standalone.match(/^\s*var GROUPS = (\[.*\]);$/m);
    const embeddedMatch = embeddedIndex.match(/<template id="captions-template"[\s\S]*?var GROUPS = (\[[^;]*\]);[\s\S]*?<\/template>/);
    assert.ok(standaloneMatch);
    assert.ok(embeddedMatch);
    assert.ok(jsonGroups.length > beforeGroups.length, "regroup must materially split caption groups");
    assert.deepEqual(JSON.parse(standaloneMatch[1]), jsonGroups);
    assert.deepEqual(JSON.parse(embeddedMatch[1]), jsonGroups);
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
});

for (const framework of ["hyperframes", "remotion"] as const) {
  const failurePoints = [
    "config",
    "planning",
    "emit",
    "verify",
    "first-promotion",
    "second-promotion",
    ...(framework === "hyperframes" ? ["third-promotion" as const] : []),
  ] as const;
  for (const point of failurePoints) {
    test(`regroup preserves ${framework} artifacts after ${point} failure`, () => {
      const project = regroupProject(framework);
      try {
        const result = captureConsole(() => regroupRun(
          [project.output, "--max-chars", "10"],
          failingRegroupDependencies(framework, point),
        ));

        assert.equal(result.code, 1, result.stdout);
        assert.equal(readFileSync(project.neutralPath, "utf8"), ORIGINAL_JSON);
        assert.equal(readFileSync(project.frameworkPath, "utf8"), project.originalFramework);
        if (project.indexPath && project.originalIndex) {
          assert.equal(readFileSync(project.indexPath, "utf8"), project.originalIndex);
        }
        assert.deepEqual(findTransactionResidue(project.root), []);
        assert.doesNotMatch(result.stdout, /wrote|re-emitted/);
      } finally {
        cleanup(project);
      }
    });
  }
}

test("regroup reports committed backup cleanup warnings without returning failure", () => {
  const project = regroupProject("hyperframes");
  try {
    let backupRemovals = 0;
    let cleanupStarted = false;
    const uncertainBackup = `${project.neutralPath}.md2vid-backup-0`;
    const injectedLstat = new Proxy(lstatSync, {
      apply(target, thisArg, argumentsList) {
        if (cleanupStarted && argumentsList[0] === uncertainBackup) {
          throw new Error("injected committed backup inspection failure");
        }
        return Reflect.apply(target, thisArg, argumentsList);
      },
    });
    const result = captureConsole(() => regroupRun(
      [project.output, "--max-chars", "10"],
      {
        transactionDependencies: {
          remove(path, options) {
            if (String(path).includes("md2vid-backup")) {
              cleanupStarted = true;
              if (++backupRemovals === 2) {
                throw new Error("injected committed cleanup failure");
              }
            }
            rmSync(path, options);
          },
          lstat: injectedLstat,
        },
      },
    ));

    assert.equal(result.code, 0, result.stderr);
    assert.notEqual(readFileSync(project.neutralPath, "utf8"), ORIGINAL_JSON);
    assert.notEqual(readFileSync(project.frameworkPath, "utf8"), project.originalFramework);
    assert.ok(project.indexPath && project.originalIndex);
    assert.notEqual(readFileSync(project.indexPath, "utf8"), project.originalIndex);
    assert.match(result.stderr, /WARN:.*backup cleanup failed/);
    assert.match(result.stderr, /retained backups: .*captions\.html\.md2vid-backup-1/);
    assert.match(result.stderr, /uncertain backups: .*caption_groups\.json\.md2vid-backup-0/);
    assert.equal(
      readdirSync(project.root, { recursive: true, encoding: "utf8" })
        .some((path) => path.includes(".md2vid-regroup-")),
      false,
    );
  } finally {
    cleanup(project);
  }
});

test("verify fails when neutral config is missing even if emitted files exist", () => {
  const project = validHyperframesProject();
  try {
    rmSync(join(project.shared, "video.config.json"));
    const result = captureConsole(() => verifyRun([project.output]));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /video\.config\.json/);
    assert.doesNotMatch(result.stdout, /video contract satisfied/);
  } finally {
    cleanup(project);
  }
});

test("verify reports malformed output config instead of assuming HyperFrames", () => {
  const project = validRemotionProject();
  try {
    writeFileSync(join(project.output, "output.config.json"), "{bad json");
    const result = captureConsole(() => verifyRun([project.output]));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /output\.config\.json/);
  } finally {
    cleanup(project);
  }
});

test("verify reports malformed neutral config", () => {
  const project = validHyperframesProject();
  try {
    writeFileSync(join(project.shared, "video.config.json"), "{bad json");
    const result = captureConsole(() => verifyRun([project.output]));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /video\.config\.json/);
  } finally {
    cleanup(project);
  }
});

test("verify validates audio metadata with path, voice, and word identity", () => {
  const project = validHyperframesProject();
  try {
    const metaPath = join(project.shared, "audio_meta.json");
    writeFileSync(metaPath, JSON.stringify({
      voices: [{
        id: "intro",
        path: "assets/voice/intro.wav",
        duration_s: 1,
        words: [{ id: "closing", text: "late", start: 0.8, end: 1.1 }],
      }],
    }));

    const result = captureConsole(() => verifyRun([project.output]));
    assert.equal(result.code, 1);
    assert.ok(result.stderr.includes(metaPath), result.stderr);
    assert.match(result.stderr, /voice "intro"/);
    assert.match(result.stderr, /word "closing"/);
    assert.doesNotMatch(result.stdout, /video contract satisfied/);
  } finally {
    cleanup(project);
  }
});

test("verify rejects stale JSON duration and accepts the exact safely floored WAV duration", () => {
  const project = validHyperframesProject();
  try {
    const metaPath = join(project.shared, "audio_meta.json");
    const wavPath = join(project.shared, "assets", "voice", "intro.wav");
    const exactWav = makePcmWav({ sampleRate: 48_000, sampleFrames: 837_632 });
    writeFileSync(wavPath, exactWav);
    const metadata = {
      voices: [{
        id: "intro",
        path: "assets/voice/intro.wav",
        duration_s: 17.451,
        words: [{ id: "w0", text: "Intro", start: 0, end: 17.451 }],
      }],
    };
    writeFileSync(metaPath, JSON.stringify(metadata));

    const stale = captureConsole(() => verifyRun([project.output]));
    assert.equal(stale.code, 1);
    assert.match(
      stale.stderr,
      /audio_meta\.json.*voice "intro".*assets\/voice\/intro\.wav.*expected 17\.450666.*actual 17\.451/i,
    );

    metadata.voices[0].duration_s = 17.450666;
    metadata.voices[0].words[0].end = 17.450666;
    writeFileSync(metaPath, JSON.stringify(metadata));
    writeFileSync(join(project.output, "assets", "voice", "intro.wav"), exactWav);
    const valid = captureConsole(() => verifyRun([project.output]));
    assert.equal(valid.code, 0, valid.stderr);
  } finally {
    cleanup(project);
  }
});

for (const framework of ["hyperframes", "remotion"] as const) {
  for (const emittedCase of ["missing", "symlinked", "truncated", "duration-mismatched", "same-duration-different"] as const) {
    test(`verify reports ${framework} canonical ${emittedCase} emitted WAV as a finding`, () => {
      const project = framework === "hyperframes" ? validHyperframesProject() : validRemotionProject();
      try {
        const emitted = framework === "hyperframes"
          ? join(project.output, "assets", "voice", "intro.wav")
          : join(project.output, "public", "assets", "voice", "intro.wav");
        if (emittedCase === "missing") {
          rmSync(emitted);
        } else if (emittedCase === "symlinked") {
          const outside = join(project.root, "outside-emitted.wav");
          writeFileSync(outside, ONE_SECOND_WAV);
          rmSync(emitted);
          symlinkSync(outside, emitted);
        } else if (emittedCase === "truncated") {
          writeFileSync(emitted, "RIFF");
        } else if (emittedCase === "duration-mismatched") {
          writeFileSync(emitted, makePcmWav({ sampleRate: 48_000, sampleFrames: 96_000 }));
        } else {
          const different = Buffer.from(ONE_SECOND_WAV);
          different[different.length - 1] = 1;
          writeFileSync(emitted, different);
        }

        const result = captureConsole(() => verifyRun([project.output]));
        assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stderr, /emitted voice asset.*assets\/voice\/intro\.wav/i);
        if (emittedCase === "same-duration-different") {
          assert.match(result.stderr, /digest|bytes differ/i);
        }
      } finally {
        cleanup(project);
      }
    });
  }
}

test("verify rejects non-portable voice paths from audio metadata", () => {
  const project = validHyperframesProject();
  try {
    const metaPath = join(project.shared, "audio_meta.json");
    writeFileSync(metaPath, JSON.stringify({
      voices: [{
        id: "intro",
        path: "assets\\voice\\intro.wav",
        duration_s: 1,
        words: [{ id: "w0", text: "Intro", start: 0, end: 1 }],
      }],
    }));

    const result = captureConsole(() => verifyRun([project.output]));
    assert.equal(result.code, 1);
    assert.ok(result.stderr.includes(metaPath), result.stderr);
    assert.match(result.stderr, /voice "intro".*path.*portable.*\.wav/i);
  } finally {
    cleanup(project);
  }
});

test("verify rejects symlinked voice assets that escape the shared root", () => {
  const project = validHyperframesProject();
  try {
    mkdirSync(join(project.shared, "assets", "voice"), { recursive: true });
    const outside = join(project.root, "outside.wav");
    writeFileSync(outside, ONE_SECOND_WAV);
    rmSync(join(project.shared, "assets", "voice", "intro.wav"));
    symlinkSync(outside, join(project.shared, "assets", "voice", "intro.wav"));

    const result = captureConsole(() => verifyRun([project.output]));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /symlink component/i);
  } finally {
    cleanup(project);
  }
});

test("verify reports malformed caption groups with their exact path", () => {
  const project = validHyperframesProject();
  try {
    const captionPath = join(project.shared, "caption_groups.json");
    writeFileSync(captionPath, "{bad json");
    const result = captureConsole(() => verifyRun([project.output]));
    assert.equal(result.code, 1);
    assert.ok(result.stderr.includes(captionPath), result.stderr);
    assert.doesNotMatch(result.stdout, /video contract satisfied/);
  } finally {
    cleanup(project);
  }
});

test("canonical verify requires framework in output config", () => {
  const project = validHyperframesProject();
  try {
    rmSync(join(project.output, "output.config.json"));
    writeFileSync(join(project.shared, "video.config.json"), JSON.stringify({
      framework: "hyperframes",
      slugs: {},
    }));
    const result = captureConsole(() => verifyRun([project.output]));
    assert.equal(result.code, 1);
    assert.ok(result.stderr.includes(join(project.output, "output.config.json")), result.stderr);
  } finally {
    cleanup(project);
  }
});

test("verify rejects malformed nested config with path and field", () => {
  const project = validHyperframesProject();
  try {
    const configPath = join(project.shared, "video.config.json");
    writeFileSync(configPath, JSON.stringify({ slugs: "not-an-object" }));
    const result = captureConsole(() => verifyRun([project.output]));
    assert.equal(result.code, 1);
    assert.ok(result.stderr.includes(configPath), result.stderr);
    assert.match(result.stderr, /slugs/);
  } finally {
    cleanup(project);
  }
});

test("verify rejects unknown, missing, and malformed framework declarations", () => {
  for (const outputConfig of [
    {},
    { framework: "unknown" },
    { framework: 42 },
  ]) {
    const project = validHyperframesProject();
    try {
      writeFileSync(join(project.output, "output.config.json"), JSON.stringify(outputConfig));
      const result = captureConsole(() => verifyRun([project.output]));
      assert.equal(result.code, 1, JSON.stringify(outputConfig));
      assert.match(result.stderr, /framework/i, JSON.stringify(outputConfig));
    } finally {
      cleanup(project);
    }
  }
});

test("verify treats a missing output directory as a project failure", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-verify-missing-"));
  try {
    const missing = join(root, "missing");
    const result = captureConsole(() => verifyRun([missing]));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /not a directory/);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verify accepts valid canonical HyperFrames and Remotion configuration", () => {
  for (const project of [validHyperframesProject(), validRemotionProject()]) {
    try {
      const result = captureConsole(() => verifyRun([project.output]));
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /video contract satisfied/);
      assert.equal(result.stderr, "");
    } finally {
      cleanup(project);
    }
  }
});

test("verify accepts explicit legacy flat HyperFrames configuration", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-verify-flat-"));
  const output = join(root, "video");
  try {
    mkdirSync(output, { recursive: true });
    writeNeutralConfig(output);
    writeValidAudioMeta(output);
    writeFileSync(join(output, "index.html"), `<script src="${DEFAULT_GSAP_SRC}"></script><script>window.__timelines["main"] = 1;</script>`);

    const result = captureConsole(() => verifyRun([output]));
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /video contract satisfied/);
    assert.equal(result.stderr, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verify keeps argument errors at exit 2", () => {
  for (const argv of [["--unknown"], ["output", "--max-chars", "nope"]]) {
    const result = captureConsole(() => verifyRun(argv));
    assert.equal(result.code, 2, argv.join(" "));
    assert.match(result.stderr, /Usage: md2vid verify/);
    assert.equal(result.stdout, "");
  }
});
