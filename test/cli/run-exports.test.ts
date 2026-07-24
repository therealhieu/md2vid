// run-exports.test.ts — Task 0.1: each script exposes a callable run(argv) that
// returns an exit code instead of calling process.exit at module top-level.
//
// This is the shared body the future bin router imports, so both the legacy
// `node scripts/x.ts` path and `md2vid <cmd>` dispatch to one implementation.
// Happy paths reuse the pinned golden fixtures (a real build/regroup/verify
// chain); failure paths assert a non-zero code without touching the real tree.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { plan } from "../../engine/plan.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SCRIPTS = join(REPO_ROOT, "scripts");
const FIXTURES = join(REPO_ROOT, "test", "golden", "fixtures", "hash-table-example", "inputs");

// Seed a temp video (shared/ neutral inputs + hyperframes/ output) from the pinned
// golden inputs so build/regroup/verify have a real, deterministic target.
function seedVideo() {
  const tmp = mkdtempSync(join(tmpdir(), "run-exports-"));
  const shared = join(tmp, "shared");
  const output = join(tmp, "hyperframes");
  mkdirSync(join(shared, "assets", "voice"), { recursive: true });
  mkdirSync(join(output, "compositions", "frames"), { recursive: true });
  for (const id of ["01", "02", "03", "04", "05", "06", "07"]) {
    writeFileSync(join(shared, "assets", "voice", `${id}.wav`), `VOICE${id}`);
  }
  copyFileSync(join(FIXTURES, "audio_meta.json"), join(shared, "audio_meta.json"));
  copyFileSync(join(FIXTURES, "video.config.json"), join(shared, "video.config.json"));
  copyFileSync(join(FIXTURES, "output.config.json"), join(output, "output.config.json"));
  for (const slug of [
    "01-cover",
    "02-core-idea",
    "03-lookup-flow",
    "04-collisions",
    "05-load-factor",
    "06-why-matters",
    "07-recap",
  ]) {
    writeFileSync(join(output, "compositions", "frames", `${slug}.html`), "<html></html>\n");
  }
  return { tmp, shared, output };
}

async function runOf(script: string): Promise<(argv: string[]) => Promise<number> | number> {
  const mod = await import(join(SCRIPTS, script));
  assert.equal(typeof mod.run, "function", `${script} must export run(argv)`);
  return mod.run;
}

async function captureRun(
  run: (argv: string[]) => Promise<number> | number,
  argv: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  try {
    console.log = (...args: unknown[]) => stdout.push(args.join(" "));
    console.error = (...args: unknown[]) => stderr.push(args.join(" "));
    return { code: await run(argv), stdout: stdout.join("\n"), stderr: stderr.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test("build: run() returns 0 on a valid video, non-zero on a missing dir", async () => {
  const run = await runOf("build.ts");
  const { tmp, output } = seedVideo();
  try {
    assert.equal(await run([output]), 0);
    assert.notEqual(await run([join(tmp, "no-such-dir")]), 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("build validation failures leave neutral and framework outputs unchanged", async () => {
  const run = await runOf("build.ts");

  for (const failure of ["duplicate IDs", "missing slug mapping", "string slugs", "array slugs"] as const) {
    const { tmp, shared, output } = seedVideo();
    try {
      const metaPath = join(shared, "audio_meta.json");
      const configPath = join(shared, "video.config.json");
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      const config = JSON.parse(readFileSync(configPath, "utf8"));

      if (failure === "duplicate IDs") {
        meta.voices[1].id = meta.voices[0].id;
      } else if (failure === "missing slug mapping") {
        delete config.slugs[meta.voices[0].id];
      } else {
        meta.voices.forEach((voice: { id: string }, index: number) => {
          voice.id = String(index);
        });
        config.slugs = failure === "string slugs"
          ? "abcdefg"
          : ["a", "b", "c", "d", "e", "f", "g"];
      }
      writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
      writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

      mkdirSync(join(shared, "build"), { recursive: true });
      const sentinels = [
        [join(shared, "cues.json"), `neutral cues: ${failure}\n`],
        [join(shared, "caption_groups.json"), `neutral captions: ${failure}\n`],
        [join(shared, "build", "build_plan.json"), `neutral plan: ${failure}\n`],
        [join(output, "index.html"), `framework index: ${failure}\n`],
        [join(output, "compositions", "captions.html"), `framework captions: ${failure}\n`],
      ] as const;
      for (const [path, contents] of sentinels) writeFileSync(path, contents);

      const result = await captureRun(run, [output]);
      assert.equal(result.code, 1, failure);
      for (const [path, contents] of sentinels) {
        assert.equal(readFileSync(path, "utf8"), contents, `${failure}: ${path} was mutated`);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});

test("regroup: run() returns 0 after a build, non-zero when caption_groups is missing", async () => {
  const build = await runOf("build.ts");
  const regroup = await runOf("regroup.ts");
  const { tmp, output } = seedVideo();
  try {
    assert.equal(await build([output]), 0);
    assert.equal(await regroup([output, "--max-chars", "54"]), 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const bare = mkdtempSync(join(tmpdir(), "run-exports-"));
  try {
    mkdirSync(join(bare, "hyperframes"), { recursive: true });
    assert.notEqual(await regroup([join(bare, "hyperframes")]), 0);
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
});

test("verify: run() returns 0 after a build, 1 when the dir does not exist", async () => {
  const build = await runOf("build.ts");
  const regroup = await runOf("regroup.ts");
  const verify = await runOf("verify.ts");
  const { tmp, output } = seedVideo();
  try {
    await build([output]);
    await regroup([output, "--max-chars", "54"]);
    assert.equal(await verify([output]), 0);
    assert.equal(await verify([join(tmp, "no-such-dir")]), 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("new_video exports createProject and run() returns 0 into a temp outputs root, non-zero on a bad slug", async () => {
  const module = await import(join(SCRIPTS, "new_video.ts"));
  assert.equal(typeof module.createProject, "function");
  const run = await runOf("new_video.ts");
  const root = mkdtempSync(join(tmpdir(), "run-exports-"));
  const prev = process.env.MD2VID_OUTPUTS_ROOT;
  process.env.MD2VID_OUTPUTS_ROOT = root;
  try {
    assert.equal(await run(["demo-slug"]), 0);
    assert.notEqual(await run(["Bad_Slug"]), 0);
  } finally {
    if (prev === undefined) delete process.env.MD2VID_OUTPUTS_ROOT;
    else process.env.MD2VID_OUTPUTS_ROOT = prev;
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe: run() returns non-zero when audio_meta.json is missing", async () => {
  const run = await runOf("transcribe.ts");
  const bare = mkdtempSync(join(tmpdir(), "run-exports-"));
  try {
    mkdirSync(join(bare, "hyperframes"), { recursive: true });
    assert.notEqual(await run([join(bare, "hyperframes")]), 0);
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
});

test("project commands report neutral artifacts from the resolved shared directory", async () => {
  const build = await runOf("build.ts");
  const regroup = await runOf("regroup.ts");
  const transcribe = await runOf("transcribe.ts");
  const verify = await runOf("verify.ts");

  for (const layout of ["canonical", "flat"] as const) {
    const root = mkdtempSync(join(tmpdir(), `run-exports-${layout}-`));
    const output = layout === "canonical" ? join(root, "hyperframes") : join(root, "demo");
    const shared = layout === "canonical" ? join(root, "shared") : output;
    try {
      mkdirSync(output, { recursive: true });
      if (layout === "canonical") mkdirSync(shared, { recursive: true });

      const audioMetaPath = join(shared, "audio_meta.json");
      const missingAudioError = [
        `FAIL: missing audio_meta.json at ${audioMetaPath}`,
        "Create narration with the /md2vid skill workflow or follow https://github.com/therealhieu/md2vid#narration.",
      ].join("\n");

      const buildResult = await captureRun(build, [output]);
      assert.equal(buildResult.code, 1);
      assert.equal(buildResult.stderr, missingAudioError);

      const transcribeResult = await captureRun(transcribe, [output]);
      assert.equal(transcribeResult.code, 1);
      assert.equal(transcribeResult.stderr, missingAudioError);

      const regroupResult = await captureRun(regroup, [output]);
      assert.equal(regroupResult.code, 1);
      assert.ok(regroupResult.stderr.includes(join(shared, "caption_groups.json")), regroupResult.stderr);

      writeFileSync(join(shared, "video.config.json"), JSON.stringify({ slugs: {} }));
      if (layout === "canonical") {
        writeFileSync(join(output, "output.config.json"), JSON.stringify({ framework: "hyperframes" }));
      }
      const verifyResult = await captureRun(verify, [output]);
      assert.ok(verifyResult.stdout.includes(join(shared, "caption_groups.json")), verifyResult.stdout);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("missing-audio guidance targets an existing package README heading", async () => {
  const build = await runOf("build.ts");
  const root = mkdtempSync(join(tmpdir(), "run-exports-readme-anchor-"));
  try {
    const result = await captureRun(build, [root]);
    assert.equal(result.code, 1);
    const reference = result.stderr.match(/https:\/\/github\.com\/therealhieu\/md2vid#([a-z0-9-]+)/);
    assert.ok(reference, result.stderr);

    const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
    const anchors = [...readme.matchAll(/^##\s+(.+)$/gm)].map((match) =>
      match[1].trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-")
    );
    assert.ok(anchors.includes(reference[1]), `missing README heading for #${reference[1]}`);
    assert.match(readme, /There is no `md2vid audio` command\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("documented minimal audio_meta satisfies the planner contract", () => {
  const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
  const example = readme.match(/A minimal `audio_meta\.json` is:\n\n```json\n([\s\S]*?)\n```/);
  assert.ok(example, "README must contain the minimal audio_meta JSON example");

  const meta = JSON.parse(example[1]);
  const result = plan(meta, { slugs: { intro: "01-intro" } });
  assert.equal(result.frames.length, 1);
  assert.equal(result.frames[0].id, "intro");
  assert.equal(result.frames[0].slug, "01-intro");
});

test("project commands report layout stat failures instead of throwing", async () => {
  const root = mkdtempSync(join(tmpdir(), "run-exports-layout-error-"));
  const output = join(root, "hyperframes");
  const shared = join(root, "shared");
  try {
    mkdirSync(output, { recursive: true });
    symlinkSync("shared", shared);

    for (const script of ["build.ts", "regroup.ts", "transcribe.ts", "verify.ts"]) {
      const result = await captureRun(await runOf(script), [output]);
      assert.equal(result.code, 1, script);
      assert.match(result.stderr, /FAIL:/, script);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verify keeps canonical shared authoritative over stale flat captions", async () => {
  const verify = await runOf("verify.ts");
  const root = mkdtempSync(join(tmpdir(), "run-exports-verify-layout-"));
  const output = join(root, "hyperframes");
  const shared = join(root, "shared");
  try {
    mkdirSync(join(output, "compositions"), { recursive: true });
    mkdirSync(shared, { recursive: true });
    writeFileSync(join(shared, "video.config.json"), JSON.stringify({ slugs: {} }));
    writeFileSync(join(output, "output.config.json"), JSON.stringify({ framework: "hyperframes" }));
    writeFileSync(join(output, "caption_groups.json"), JSON.stringify({ groups: [{ words: ["stale"] }] }));
    writeFileSync(join(output, "compositions", "captions.html"), "var GROUPS = [];\n");

    const result = await captureRun(verify, [output]);
    assert.doesNotMatch(result.stdout, /caption group count out of sync/);
    assert.ok(result.stdout.includes(join(shared, "caption_groups.json")), result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe passes the resolved shared directory to its provider", async () => {
  const module = await import(join(SCRIPTS, "transcribe.ts"));
  const root = mkdtempSync(join(tmpdir(), "run-exports-transcribe-layout-"));
  const output = join(root, "hyperframes");
  const shared = join(root, "shared");
  let receivedBase: string | undefined;
  try {
    mkdirSync(output, { recursive: true });
    mkdirSync(shared, { recursive: true });
    writeFileSync(join(shared, "audio_meta.json"), JSON.stringify({ voices: [] }));

    const transcribe: typeof import("../../engine/transcribe.ts").transcribeVoices = (meta, baseDir) => {
      receivedBase = baseDir;
      return { meta, ok: 0, total: 0 };
    };

    assert.equal(module.run([output], { transcribeVoices: transcribe }), 0);
    assert.equal(receivedBase, resolve(shared));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("invalid semantic CLI values return 2 and print command usage", async () => {
  const cases = [
    { script: "new_video.ts", argv: ["Bad_Slug"] },
    { script: "regroup.ts", argv: ["output", "--max-chars", "nope"] },
    { script: "verify.ts", argv: ["output", "--max-chars", "nope"] },
  ];

  for (const testCase of cases) {
    const result = await captureRun(await runOf(testCase.script), testCase.argv);
    assert.equal(result.code, 2, testCase.script);
    assert.match(result.stderr, /Usage:/, testCase.script);
    assert.equal(result.stdout, "", testCase.script);
  }
});

test("install-skill: help returns 0 without installing files", async () => {
  const run = await runOf("install_skill.ts");
  const root = mkdtempSync(join(tmpdir(), "run-exports-install-help-"));
  try {
    const previous = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = root;
    try {
      const result = await captureRun(run, ["--help"]);
      assert.equal(result.code, 0);
      assert.match(result.stdout, /Usage: md2vid install-skill/);
      assert.equal(result.stderr, "");
      assert.equal(existsSync(join(root, "skills")), false);
    } finally {
      if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = previous;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("patch-studio: run() is idempotent and returns 0 against the installed bundle", async () => {
  const mod = await import(join(REPO_ROOT, "frameworks", "hyperframes", "patch-studio.ts"));
  assert.equal(typeof mod.run, "function", "patch-studio must export run(argv)");
  assert.equal(await mod.run([]), 0);
});
