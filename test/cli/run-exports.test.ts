// run-exports.test.ts — Task 0.1: each script exposes a callable run(argv) that
// returns an exit code instead of calling process.exit at module top-level.
//
// This is the shared body the future bin router imports, so both the legacy
// `node scripts/x.ts` path and `md2vid <cmd>` dispatch to one implementation.
// Happy paths reuse the pinned golden fixtures (a real build/regroup/verify
// chain); failure paths assert a non-zero code without touching the real tree.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { validateAudioMeta } from "../../engine/audio_meta.ts";
import { plan } from "../../engine/plan.ts";
import { transcribeVoices } from "../../engine/transcribe.ts";
import { run as buildScriptRun } from "../../scripts/build.ts";
import { makePcmWav, makeWavForSafeDuration } from "../helpers/wav.ts";
import { DEFAULT_GSAP_SRC } from "../../scripts/dependency_versions.ts";

const ONE_SECOND_WAV = makePcmWav({ sampleRate: 48_000, sampleFrames: 48_000 });

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SCRIPTS = join(REPO_ROOT, "scripts");
const FIXTURES = join(REPO_ROOT, "test", "golden", "fixtures", "hash-table-example", "inputs");
const PINNED_GSAP = DEFAULT_GSAP_SRC;

function authoredFrame(slug: string): string {
  return `<template data-composition-id="${slug}">
<div data-composition-id="${slug}" data-frame-theme="light" data-width="1920" data-height="1080" data-duration="1"></div>
<script src="${PINNED_GSAP}"></script>
<script>window.__timelines = window.__timelines || {}; window.__timelines["${slug}"] = gsap.timeline({ paused: true });</script>
</template>\n`;
}

// Seed a temp video (shared/ neutral inputs + hyperframes/ output) from the pinned
// golden inputs so build/regroup/verify have a real, deterministic target.
function seedVideo() {
  const tmp = mkdtempSync(join(tmpdir(), "run-exports-"));
  const shared = join(tmp, "shared");
  const output = join(tmp, "hyperframes");
  mkdirSync(join(shared, "assets", "voice"), { recursive: true });
  mkdirSync(join(output, "compositions", "frames"), { recursive: true });
  copyFileSync(join(FIXTURES, "audio_meta.json"), join(shared, "audio_meta.json"));
  const metaPath = join(shared, "audio_meta.json");
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  for (const voice of meta.voices) {
    writeFileSync(join(shared, voice.path), makeWavForSafeDuration(voice.duration_s));
  }
  copyFileSync(join(FIXTURES, "video.config.json"), join(shared, "video.config.json"));
  writeFileSync(
    join(output, "output.config.json"),
    readFileSync(join(FIXTURES, "output.config.json"), "utf8").replaceAll(
      "__MD2VID_DEFAULT_GSAP_SRC__",
      DEFAULT_GSAP_SRC,
    ),
  );
  for (const slug of [
    "01-cover",
    "02-core-idea",
    "03-lookup-flow",
    "04-collisions",
    "05-load-factor",
    "06-why-matters",
    "07-recap",
  ]) {
    writeFileSync(join(output, "compositions", "frames", `${slug}.html`), authoredFrame(slug));
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

test("build rejects a regular-file project path before layout lookup", async () => {
  const run = await runOf("build.ts");
  const root = mkdtempSync(join(tmpdir(), "run-exports-build-file-"));
  const projectFile = join(root, "project.md");

  try {
    writeFileSync(
      projectFile,
      "# This is a file, not a project directory\n",
    );

    const result = await captureRun(run, [projectFile]);

    assert.equal(result.code, 1);
    assert.equal(
      result.stderr,
      `FAIL: not a directory: ${resolve(projectFile)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("build validation failures leave neutral and framework outputs unchanged", async () => {
  const run = await runOf("build.ts");

  for (const failure of ["duplicate IDs", "missing slug mapping", "string slugs", "array slugs", "invalid timings"] as const) {
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
      } else if (failure === "invalid timings") {
        const word = meta.voices[0].words.at(-1);
        word.id = "closing";
        word.end = meta.voices[0].duration_s + 0.1;
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
      if (failure === "invalid timings") {
        assert.ok(result.stderr.includes(metaPath), result.stderr);
        assert.match(result.stderr, /voice "01"/);
        assert.match(result.stderr, /word "closing"/);
      }
      for (const [path, contents] of sentinels) {
        assert.equal(readFileSync(path, "utf8"), contents, `${failure}: ${path} was mutated`);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});

test("build rejects invalid authored frame templates before changing neutral or framework artifacts", async () => {
  const run = await runOf("build.ts");
  for (const invalid of ["missing", "malformed", "mismatched"] as const) {
    const { tmp, shared, output } = seedVideo();
    try {
      const frame = join(output, "compositions", "frames", "01-cover.html");
      if (invalid === "missing") rmSync(frame);
      else if (invalid === "malformed") writeFileSync(frame, '<template data-composition-id="01-cover"><div data-composition-id="01-cover"></div>');
      else writeFileSync(frame, authoredFrame("wrong-id"));

      mkdirSync(join(shared, "build"), { recursive: true });
      const sentinels = [
        [join(shared, "cues.json"), `cues ${invalid}\n`],
        [join(shared, "caption_groups.json"), `groups ${invalid}\n`],
        [join(shared, "build", "build_plan.json"), `plan ${invalid}\n`],
        [join(output, "index.html"), `index ${invalid}\n`],
        [join(output, "compositions", "captions.html"), `captions ${invalid}\n`],
      ] as const;
      for (const [path, bytes] of sentinels) writeFileSync(path, bytes);

      const result = await captureRun(run, [output]);
      assert.equal(result.code, 1, invalid);
      assert.match(result.stderr, invalid === "missing" ? /01-cover\.html/ : /template|composition id/i);
      for (const [path, bytes] of sentinels) assert.equal(readFileSync(path, "utf8"), bytes, `${invalid}: ${path}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});

test("direct build --captions-only atomically updates or preserves standalone and embedded captions", () => {
  const mutateGroups = (shared: string) => {
    const path = join(shared, "caption_groups.json");
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    parsed.groups = [{ id: "changed", frame: 1, start: 0, end: 1, text: "Changed captions", words: [{ id: "changed-word", text: "Changed", start: 0, end: 1 }] }];
    writeFileSync(path, JSON.stringify(parsed, null, 2) + "\n");
  };

  {
    const { tmp, shared, output } = seedVideo();
    try {
      assert.equal(buildScriptRun([output]), 0);
      mutateGroups(shared);
      assert.equal(buildScriptRun([output, "--captions-only"]), 0);
      assert.match(readFileSync(join(output, "compositions", "captions.html"), "utf8"), /Changed captions/);
      assert.match(readFileSync(join(output, "index.html"), "utf8"), /<template id="captions-template"[\s\S]*Changed captions/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  {
    const { tmp, shared, output } = seedVideo();
    try {
      assert.equal(buildScriptRun([output]), 0);
      const captionsPath = join(output, "compositions", "captions.html");
      const indexPath = join(output, "index.html");
      const captionsBefore = readFileSync(captionsPath, "utf8");
      writeFileSync(indexPath, "MALFORMED INDEX WITHOUT CAPTIONS TEMPLATE\n");
      const indexBefore = readFileSync(indexPath, "utf8");
      mutateGroups(shared);

      assert.equal(buildScriptRun([output, "--captions-only"]), 1);
      assert.equal(readFileSync(captionsPath, "utf8"), captionsBefore);
      assert.equal(readFileSync(indexPath, "utf8"), indexBefore);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  {
    const { tmp, shared, output } = seedVideo();
    try {
      assert.equal(buildScriptRun([output]), 0);
      const captionsPath = join(output, "compositions", "captions.html");
      const indexPath = join(output, "index.html");
      const captionsBefore = readFileSync(captionsPath, "utf8");
      const indexBefore = readFileSync(indexPath, "utf8");
      mutateGroups(shared);
      let promotions = 0;
      const result = (buildScriptRun as any)([output, "--captions-only"], {
        transactionDependencies: {
          rename(source: string, destination: string) {
            if (String(source).includes(".md2vid-build-captions-") && ++promotions === 1) {
              throw new Error("injected caption promotion failure");
            }
            renameSync(source, destination);
          },
        },
      });
      assert.equal(result, 1);
      assert.equal(readFileSync(captionsPath, "utf8"), captionsBefore);
      assert.equal(readFileSync(indexPath, "utf8"), indexBefore);
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

test("transcribe does not persist partial provider results", async () => {
  const module = await import(join(SCRIPTS, "transcribe.ts"));
  const root = mkdtempSync(join(tmpdir(), "run-exports-transcribe-partial-"));
  const output = join(root, "hyperframes");
  const shared = join(root, "shared");
  try {
    mkdirSync(output, { recursive: true });
    mkdirSync(shared, { recursive: true });
    const metaPath = join(shared, "audio_meta.json");
    const original = `${JSON.stringify({
      voices: [
        { id: "01", path: "assets/voice/01.wav", duration_s: 1, words: [{ id: "stale-1", text: "late", start: 0.9, end: 1.2 }] },
        { id: "02", path: "assets/voice/02.wav", duration_s: 1, words: [{ id: "stale-2", text: "inverted", start: 0.8, end: 0.2 }] },
      ],
    }, null, 2)}\n`;
    writeFileSync(metaPath, original);

    const result = await captureRun(
      (argv) => module.run(argv, {
        transcribeVoices(meta: import("../../engine/types.ts").AudioMeta) {
          meta.voices[0].words = [{ id: "w0", text: "partial", start: 0, end: 0.5 }];
          return { meta, ok: 1, total: 2 };
        },
      }),
      [output],
    );

    assert.equal(result.code, 1);
    assert.equal(readFileSync(metaPath, "utf8"), original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("transcribe replaces invalid existing words and persists normalized provider output", async () => {
  const module = await import(join(SCRIPTS, "transcribe.ts"));
  const root = mkdtempSync(join(tmpdir(), "run-exports-transcribe-repair-"));
  const output = join(root, "hyperframes");
  const shared = join(root, "shared");
  try {
    mkdirSync(output, { recursive: true });
    mkdirSync(join(shared, "assets", "voice"), { recursive: true });
    writeFileSync(
      join(shared, "assets", "voice", "resolution-path.wav"),
      makePcmWav({ sampleRate: 48_000, sampleFrames: 837_632 }),
    );
    const metaPath = join(shared, "audio_meta.json");
    writeFileSync(metaPath, `${JSON.stringify({
      voices: [{
        id: "resolution-path",
        path: "assets/voice/resolution-path.wav",
        duration_s: 17.451,
        words: [{ id: "stale", text: "stale", start: 17.2, end: 17.451 }],
      }],
    }, null, 2)}\n`);
    let providerCalls = 0;

    const result = await captureRun(
      (argv) => module.run(argv, {
        transcribeVoices(meta: import("../../engine/types.ts").AudioMeta, baseDir: string) {
          return transcribeVoices(meta, baseDir, {
            run(args) {
              providerCalls += 1;
              const transcriptDir = args[args.indexOf("--dir") + 1];
              writeFileSync(join(transcriptDir, "transcript.json"), JSON.stringify([
                { text: "repaired", start: 17.44, end: 17.451 },
              ]));
              return 0;
            },
          });
        },
      }),
      [output],
    );

    assert.equal(result.code, 0, result.stderr);
    assert.equal(providerCalls, 1);
    const persisted = JSON.parse(readFileSync(metaPath, "utf8"));
    assert.equal(persisted.voices[0].duration_s, 17.450666);
    assert.deepEqual(persisted.voices[0].words, [
      { id: "w0", text: "repaired", start: 17.44, end: 17.450666 },
    ]);
    assert.doesNotThrow(() => validateAudioMeta(persisted, metaPath));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("project commands report neutral artifacts from the resolved shared directory", async () => {
  const build = await runOf("build.ts");
  const plan = await runOf("plan.ts");
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

      writeFileSync(join(shared, "video.config.json"), JSON.stringify({ slugs: { intro: "01-intro" } }));
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
      if (layout === "canonical") {
        writeFileSync(join(output, "output.config.json"), JSON.stringify({ framework: "hyperframes" }));
      }
      const verifyResult = await captureRun(verify, [output]);
      assert.ok(verifyResult.stdout.includes(join(shared, "caption_groups.json")), verifyResult.stdout);

      const planResult = await captureRun(plan, [output]);
      assert.equal(planResult.code, 0, planResult.stderr);
      assert.ok(planResult.stdout.includes(shared), planResult.stdout);
      assert.equal(existsSync(join(shared, "build", "visual_timing.json")), true);
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

    for (const script of ["build.ts", "plan.ts", "regroup.ts", "transcribe.ts", "verify.ts"]) {
      const result = await captureRun(await runOf(script), [output]);
      assert.equal(result.code, 1, script);
      assert.match(result.stderr, script === "plan.ts" ? /FAIL \[plan\]/ : /FAIL:/, script);
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
    writeFileSync(join(shared, "audio_meta.json"), JSON.stringify({
      voices: [{
        id: "intro",
        path: "assets/voice/intro.wav",
        duration_s: 1,
        words: [{ id: "w0", text: "Intro", start: 0, end: 1 }],
      }],
    }));

    const transcribe: typeof import("../../engine/transcribe.ts").transcribeVoices = (meta, baseDir) => {
      receivedBase = baseDir;
      return { meta, ok: 1, total: 1, voiceSnapshots: [] };
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

test("narration-check: run() returns 0 for help without creating project files", async () => {
  const run = await runOf("narration_check.ts");
  const root = mkdtempSync(join(tmpdir(), "run-exports-narration-check-"));
  try {
    const result = await captureRun(run, ["--help"]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Usage: md2vid narration-check/);
    assert.equal(result.stderr, "");
    assert.deepEqual(readdirSync(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
