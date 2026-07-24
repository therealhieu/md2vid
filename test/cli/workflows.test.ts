import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getAdapter } from "../../frameworks/index.ts";
import { run as buildRun } from "../../scripts/build.ts";
import { createProject } from "../../scripts/new_video.ts";
import {
  run as regroupRun,
  type RegroupDependencies,
} from "../../scripts/regroup.ts";
import { run as transcribeRun } from "../../scripts/transcribe.ts";
import { run as verifyRun } from "../../scripts/verify.ts";

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

const SMOKE_WAV = join(import.meta.dirname, "fixtures", "smoke", "assets", "voice", "intro.wav");

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
  for (const { id } of voices) copyFileSync(SMOKE_WAV, join(voiceDir, `${id}.wav`));

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
        `<template data-composition-id="${slug}"><div>${slug}</div></template>\n`,
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

function writeNeutralConfig(shared: string): void {
  writeFileSync(join(shared, "video.config.json"), JSON.stringify({
    timing: { tail: 0.5, xfade: 0.5, gap: 0.5 },
    canvas: { width: 1920, height: 1080 },
    slugs: {},
  }));
}

function validHyperframesProject(): Project {
  const root = mkdtempSync(join(tmpdir(), "md2vid-verify-hf-"));
  const shared = join(root, "shared");
  const output = join(root, "hyperframes");
  mkdirSync(shared, { recursive: true });
  mkdirSync(output, { recursive: true });
  writeNeutralConfig(shared);
  writeFileSync(join(output, "output.config.json"), JSON.stringify({ framework: "hyperframes" }));
  writeFileSync(join(output, "index.html"), '<script>window.__timelines["main"] = 1;</script>');
  return { root, shared, output };
}

function validRemotionProject(): Project {
  const root = mkdtempSync(join(tmpdir(), "md2vid-verify-remotion-"));
  const shared = join(root, "shared");
  const output = join(root, "remotion");
  mkdirSync(shared, { recursive: true });
  mkdirSync(join(output, "src"), { recursive: true });
  writeNeutralConfig(shared);
  writeFileSync(join(output, "output.config.json"), JSON.stringify({ framework: "remotion" }));
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
  const neutralPath = join(shared, "caption_groups.json");
  writeFileSync(neutralPath, ORIGINAL_JSON);

  const originalFramework = framework === "hyperframes" ? ORIGINAL_HTML : ORIGINAL_PLAN;
  const frameworkPath = framework === "hyperframes"
    ? join(output, "compositions", "captions.html")
    : join(output, "build_plan.json");
  mkdirSync(join(frameworkPath, ".."), { recursive: true });
  writeFileSync(frameworkPath, originalFramework);
  return { root, shared, output, neutralPath, frameworkPath, originalFramework };
}

function findTransactionResidue(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => path.includes(".md2vid-regroup-") || path.includes("md2vid-backup"))
    .sort();
}

function failingRegroupDependencies(
  framework: "hyperframes" | "remotion",
  point: "config" | "planning" | "emit" | "verify" | "first-promotion" | "second-promotion",
): RegroupDependencies {
  if (point === "config") {
    return { loadConfig() { throw new Error("injected config failure"); } };
  }
  if (point === "planning") {
    return { buildPlan() { throw new Error("injected planning failure"); } };
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
  const failAt = point === "first-promotion" ? 1 : 2;
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

for (const framework of ["hyperframes", "remotion"] as const) {
  for (const point of [
    "config",
    "planning",
    "emit",
    "verify",
    "first-promotion",
    "second-promotion",
  ] as const) {
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
    const result = captureConsole(() => regroupRun(
      [project.output, "--max-chars", "10"],
      {
        transactionDependencies: {
          remove(path, options) {
            if (String(path).includes("md2vid-backup") && ++backupRemovals === 2) {
              throw new Error("injected committed cleanup failure");
            }
            rmSync(path, options);
          },
        },
      },
    ));

    assert.equal(result.code, 0, result.stderr);
    assert.notEqual(readFileSync(project.neutralPath, "utf8"), ORIGINAL_JSON);
    assert.notEqual(readFileSync(project.frameworkPath, "utf8"), project.originalFramework);
    assert.match(result.stderr, /WARN:.*backup cleanup failed/);
    assert.match(result.stderr, /captions\.html\.md2vid-backup-1/);
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
    writeFileSync(join(output, "index.html"), '<script>window.__timelines["main"] = 1;</script>');

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
