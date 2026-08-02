// crucial: the oracle for the whole refactor — bytes, not semantics.
//
// Copies PINNED inputs into a temp dir laid out as shared/ + hyperframes/, runs
// the FULL build chain (build_video → regroup_captions --max-chars 54, matching
// each video's package.json), and diffs the four artifacts against committed
// expected/ fixtures.
//
// Why pinned inputs: the live build outputs are NOT a reliable oracle —
// audio_meta.json + caption_groups.json + captions.html are all gitignored, and
// audio_meta.json is produced by a non-deterministic Whisper chain. So the
// expected outputs are only reproducible from a clean checkout if we freeze each
// video's audio_meta.json + video.config.json + output.config.json (including the
// pinned GSAP CDN source) as committed read-only inputs
// and commit the four expected outputs as fixtures.
//
// Why the FULL chain, not build alone: the committed caption_groups.json /
// captions.html are POST-regroup (hash-table-example ships 41 groups), while build alone
// emits one group per frame (7). Running build in isolation reproduces
// index.html + cues.json but NEVER the committed captions — the oracle must run
// the same `build` chain each package.json defines.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { makeWavForSafeDuration } from "../helpers/wav.ts";
import { DEFAULT_GSAP_SRC } from "../../scripts/dependency_versions.ts";
import { run as buildRun } from "../../scripts/build.ts";
import { run as planRun } from "../../scripts/plan.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SCRIPTS = join(REPO_ROOT, "scripts");
const FIXTURES = join(HERE, "fixtures");

const SLUGS = ["hash-table-example"];

// The four blessed artifacts and where each lands after the build chain, relative
// to the temp video root (shared/ neutral IR + hyperframes/ framework output).
const ARTIFACTS = [
  { fixture: "cues.json", built: join("shared", "cues.json") },
  { fixture: "caption_groups.json", built: join("shared", "caption_groups.json") },
  { fixture: "index.html", built: join("hyperframes", "index.html") },
  { fixture: "captions.html", built: join("hyperframes", "compositions", "captions.html") },
];

function materializeDefaultGsapSrc(body: string): string {
  return body.replaceAll("__MD2VID_DEFAULT_GSAP_SRC__", DEFAULT_GSAP_SRC);
}

function readExpected(slug: string, name: string) {
  return materializeDefaultGsapSrc(
    readFileSync(join(FIXTURES, slug, "expected", name), "utf8"),
  );
}

// Seed a temp dir from fixtures/<slug>/inputs/, run build + regroup (the exact
// commands each video's package.json runs), return the temp video root.
function buildChainIntoTemp(slug: string) {
  const tmp = mkdtempSync(join(tmpdir(), `golden-${slug}-`));
  const shared = join(tmp, "shared");
  const output = join(tmp, "hyperframes");
  mkdirSync(join(shared, "assets", "voice"), { recursive: true });
  mkdirSync(join(output, "compositions", "frames"), { recursive: true });
  for (const frameSlug of [
    "01-cover", "02-core-idea", "03-lookup-flow", "04-collisions",
    "05-load-factor", "06-why-matters", "07-recap",
  ]) {
    writeFileSync(
      join(output, "compositions", "frames", `${frameSlug}.html`),
      `<template data-composition-id="${frameSlug}"><div data-composition-id="${frameSlug}" data-width="1920" data-height="1080" data-duration="1"></div><script src="${DEFAULT_GSAP_SRC}"></script><script>window.__timelines = window.__timelines || {}; window.__timelines["${frameSlug}"] = gsap.timeline({ paused: true });</script></template>\n`,
    );
  }

  const inputs = join(FIXTURES, slug, "inputs");
  const metaPath = join(shared, "audio_meta.json");
  copyFileSync(join(inputs, "audio_meta.json"), metaPath);
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  for (const voice of meta.voices) {
    writeFileSync(join(shared, voice.path), makeWavForSafeDuration(voice.duration_s));
  }
  copyFileSync(join(inputs, "video.config.json"), join(shared, "video.config.json"));
  writeFileSync(
    join(output, "output.config.json"),
    materializeDefaultGsapSrc(
      readFileSync(join(inputs, "output.config.json"), "utf8"),
    ),
  );

  execFileSync("node", [join(SCRIPTS, "build.ts"), output], { stdio: "pipe" });
  execFileSync(
    "node",
    [join(SCRIPTS, "regroup.ts"), output, "--max-chars", "54"],
    { stdio: "pipe" }
  );
  return tmp;
}

for (const slug of SLUGS) {
  test(`golden: ${slug} outputs are byte-identical`, () => {
    const tmp = buildChainIntoTemp(slug);
    try {
      for (const { fixture, built } of ARTIFACTS) {
        const got = readFileSync(join(tmp, built), "utf8");
        assert.equal(got, readExpected(slug, fixture), `${slug}/${fixture} diverged`);
      }
      assert.equal(existsSync(join(tmp, "hyperframes", "assets", "gsap.min.js")), false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
}

test("golden: visual timing plan and build artifacts are byte-identical", () => {
  const fixture = join(FIXTURES, "visual-timing-sync");
  const root = mkdtempSync(join(tmpdir(), "golden-visual-timing-sync-"));
  const shared = join(root, "shared");
  const output = join(root, "remotion");
  try {
    mkdirSync(join(shared, "assets", "voice"), { recursive: true });
    mkdirSync(output, { recursive: true });
    for (const name of ["audio_meta.json", "video.config.json", "visual_beats.json"]) {
      copyFileSync(join(fixture, "inputs", name), join(shared, name));
    }
    copyFileSync(join(fixture, "inputs", "output.config.json"), join(output, "output.config.json"));
    copyFileSync(join(fixture, "inputs", "visual_bindings.json"), join(output, "visual_bindings.json"));
    const meta = JSON.parse(readFileSync(join(shared, "audio_meta.json"), "utf8"));
    for (const voice of meta.voices) {
      writeFileSync(join(shared, voice.path), makeWavForSafeDuration(voice.duration_s));
    }

    assert.equal(planRun([output]), 0);
    const plannedBuild = readFileSync(join(shared, "build", "build_plan.json"), "utf8");
    const plannedVisualTiming = readFileSync(join(shared, "build", "visual_timing.json"), "utf8");

    assert.equal(buildRun([output]), 0);
    assert.equal(readFileSync(join(shared, "build", "build_plan.json"), "utf8"), plannedBuild);
    assert.equal(readFileSync(join(shared, "build", "visual_timing.json"), "utf8"), plannedVisualTiming);
    assert.equal(
      plannedVisualTiming,
      readFileSync(join(fixture, "expected", "visual_timing.json"), "utf8"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
