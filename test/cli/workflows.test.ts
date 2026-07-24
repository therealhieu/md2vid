import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { run as verifyRun } from "../../scripts/verify.ts";

type Project = {
  root: string;
  shared: string;
  output: string;
};

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
