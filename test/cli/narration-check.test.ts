import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { run } from "../../scripts/narration_check.ts";

const DEFAULT_REQUEST = {
  version: 1,
  provider: "kokoro",
  voice: "am_michael",
  lang: "en",
  speed: 0.9,
  lines: [
    { id: "intro", text: "Introduce the topic." },
    { id: "recap", text: "Recap the key idea." },
  ],
};

function fixture(request: unknown = DEFAULT_REQUEST): string {
  const project = mkdtempSync(join(tmpdir(), "md2vid-narration-check-"));
  writeFileSync(join(project, "audio_request.json"), `${JSON.stringify(request, null, 2)}\n`);
  return project;
}

function longRequest(id: string) {
  return {
    ...DEFAULT_REQUEST,
    lines: [{
      id,
      text: "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen.",
    }],
  };
}

function snapshotTree(root: string): Array<{ path: string; type: "dir" | "file"; contents?: string }> {
  if (!existsSync(root)) return [];
  const entries: Array<{ path: string; type: "dir" | "file"; contents?: string }> = [];
  const visit = (dir: string, relative = "") => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const child = relative ? `${relative}/${name}` : name;
      if (statSync(path).isDirectory()) {
        entries.push({ path: child, type: "dir" });
        visit(path, child);
      } else {
        entries.push({ path: child, type: "file", contents: readFileSync(path).toString("base64") });
      }
    }
  };
  visit(root);
  return entries;
}

function captureRun(argv: string[]): { code: number; stdout: string; stderr: string } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  try {
    console.log = (...args: unknown[]) => stdout.push(args.join(" "));
    console.error = (...args: unknown[]) => stderr.push(args.join(" "));
    return { code: run(argv), stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test("prints the stable PASS summary for the default request", () => {
  const project = fixture({
    version: 1,
    provider: "kokoro",
    voice: "am_michael",
    lang: "en",
    speed: 0.9,
    lines: [
      { id: "intro", text: "Introduce the topic." },
      { id: "recap", text: "Recap the key idea." },
    ],
  });
  try {
    const result = captureRun([project]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /PASS \[narration\] 2 lines, 2 sentences, provider=kokoro, voice=am_michael, lang=en, speed=0\.9/);
    assert.equal(result.stderr, "");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("returns one for a 19-word sentence without mutating the project", () => {
  const project = fixture({
    version: 1,
    provider: "kokoro",
    voice: "am_michael",
    lang: "en",
    speed: 0.9,
    lines: [{ id: "long", text: "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen." }],
  });
  try {
    const before = snapshotTree(project);
    const result = captureRun([project]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /FAIL \[narration\] line="long" sentence=0 words=19 code=sentence-too-long/);
    assert.deepEqual(snapshotTree(project), before);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("parses approval at the final colon", () => {
  const project = fixture(longRequest("chapter:intro"));
  try {
    const result = captureRun([project, "--allow-long-sentence", "chapter:intro:0"]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /approved line="chapter:intro" sentence=0/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("prints warnings to stdout without failing validation", () => {
  const project = fixture({
    ...DEFAULT_REQUEST,
    lines: [{ id: "review", text: "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen." }],
  });
  try {
    const result = captureRun([project]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /WARN \[narration\] line="review" sentence=0 words=15 code=sentence-above-target/);
    assert.match(result.stdout, /PASS \[narration\] 1 lines, 1 sentences/);
    assert.equal(result.stderr, "");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("uses an explicit request path without reading or mutating the default request", () => {
  const project = fixture(longRequest("default-long"));
  const alternate = join(project, "alternate.json");
  writeFileSync(alternate, `${JSON.stringify(DEFAULT_REQUEST, null, 2)}\n`);
  try {
    const before = snapshotTree(project);
    const result = captureRun([project, "--request", alternate]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /PASS \[narration\] 2 lines, 2 sentences/);
    assert.deepEqual(snapshotTree(project), before);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("reports persisted overrides as INFO lines", () => {
  const project = fixture({
    ...DEFAULT_REQUEST,
    provider: "heygen",
    voice: "starfish-voice-id",
    speed: 1,
  });
  try {
    const result = captureRun([project]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /INFO \[narration\] override provider=heygen \(default kokoro\)/);
    assert.match(result.stdout, /INFO \[narration\] override voice=starfish-voice-id \(default am_michael\)/);
    assert.match(result.stdout, /INFO \[narration\] override speed=1 \(default 0\.9\)/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("reports malformed JSON, a missing request, and unmatched approvals without mutation", () => {
  const malformed = fixture();
  writeFileSync(join(malformed, "audio_request.json"), "{not JSON\n");
  const missing = mkdtempSync(join(tmpdir(), "md2vid-narration-check-missing-"));
  const unmatched = fixture(DEFAULT_REQUEST);
  try {
    const malformedBefore = snapshotTree(malformed);
    const malformedResult = captureRun([malformed]);
    assert.equal(malformedResult.code, 1);
    assert.match(malformedResult.stderr, /FAIL \[narration\].*invalid JSON/);
    assert.deepEqual(snapshotTree(malformed), malformedBefore);

    const missingBefore = snapshotTree(missing);
    const missingResult = captureRun([missing]);
    assert.equal(missingResult.code, 1);
    assert.match(missingResult.stderr, /audio_request\.json/);
    assert.deepEqual(snapshotTree(missing), missingBefore);

    const unmatchedBefore = snapshotTree(unmatched);
    const unmatchedResult = captureRun([unmatched, "--allow-long-sentence", "intro:9"]);
    assert.equal(unmatchedResult.code, 1);
    assert.match(unmatchedResult.stderr, /approval references unknown line or sentence/);
    assert.deepEqual(snapshotTree(unmatched), unmatchedBefore);
  } finally {
    rmSync(malformed, { recursive: true, force: true });
    rmSync(missing, { recursive: true, force: true });
    rmSync(unmatched, { recursive: true, force: true });
  }
});

test("returns usage code two for invalid options and excess positionals", () => {
  const project = fixture();
  try {
    for (const argv of [[project, "--unknown"], [project, "extra"]]) {
      const result = captureRun(argv);
      assert.equal(result.code, 2);
      assert.match(result.stderr, /Usage: md2vid narration-check/);
      assert.equal(result.stdout, "");
    }
    const help = captureRun(["--help"]);
    assert.equal(help.code, 0);
    assert.equal(help.stdout, "Usage: md2vid narration-check <dir> [--request <path>] [--allow-long-sentence <line-id>:<sentence-index>]");
    assert.equal(help.stderr, "");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("resolves the default request from a project path outside the caller cwd", () => {
  const project = fixture();
  const outside = mkdtempSync(join(tmpdir(), "md2vid-narration-check-cwd-"));
  const original = process.cwd();
  try {
    process.chdir(outside);
    const result = captureRun([project]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /PASS \[narration\]/);
  } finally {
    process.chdir(original);
    rmSync(project, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
