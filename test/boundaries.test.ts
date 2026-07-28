// boundaries.test.mjs — architectural boundary enforcement (Success Criteria).
//
// The whole point of the refactor is a one-way dependency: frameworks depend on the
// neutral engine, never the reverse, and adapters never depend on each other. These
// tests grep import statements to enforce that mechanically, plus assert the dispatch
// registry selects adapters correctly and build writes the versioned build_plan.json.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { getAdapter, FRAMEWORKS } from "../frameworks/index.ts";
import { makeWavForSafeDuration } from "./helpers/wav.ts";
import { DEFAULT_GSAP_SRC } from "../scripts/dependency_versions.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const ENGINE = join(REPO_ROOT, "engine");
const FRAMEWORKS_DIR = join(REPO_ROOT, "frameworks");

// Collect all .ts source files under a dir (excluding __tests__ and *.test.ts).
function tsFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) {
        if (name !== "__tests__") walk(p);
      } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
        out.push(p);
      }
    }
  };
  walk(root);
  return out;
}

const IMPORT_RE = /^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm;
function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(IMPORT_RE)].map((m) => m[1]);
}

test("engine/ imports nothing from frameworks/", () => {
  for (const file of tsFiles(ENGINE)) {
    for (const spec of importsOf(file)) {
      assert.ok(
        !spec.includes("frameworks/"),
        `${file} imports "${spec}" — engine must not depend on frameworks/`
      );
    }
  }
});

test("frameworks/* import nothing from a sibling framework", () => {
  const fwNames = readdirSync(FRAMEWORKS_DIR).filter((n) =>
    statSync(join(FRAMEWORKS_DIR, n)).isDirectory()
  );
  for (const fw of fwNames) {
    for (const file of tsFiles(join(FRAMEWORKS_DIR, fw))) {
      for (const spec of importsOf(file)) {
        for (const other of fwNames) {
          if (other === fw) continue;
          assert.ok(
            !spec.includes(`frameworks/${other}/`) && !spec.includes(`../${other}/`),
            `${file} imports "${spec}" — framework "${fw}" must not depend on "${other}"`
          );
        }
      }
    }
  }
});

test("getAdapter selects hyperframes by default and by explicit name", () => {
  assert.equal(getAdapter().name, "hyperframes");
  assert.equal(getAdapter("hyperframes").name, "hyperframes");
});

test("getAdapter hard-fails on an unknown framework", () => {
  // Throws (does NOT process.exit) so a caller's run() can catch and return a
  // code — keeps the router/tests alive for repeated in-process dispatch.
  assert.throws(() => getAdapter("no-such-framework"), /unknown framework/);
});

test("every registered adapter exposes the complete scaffold lifecycle", () => {
  for (const [key, adapter] of Object.entries(FRAMEWORKS)) {
    assert.equal(adapter.name, key, `adapter key "${key}" must match adapter.name`);
    for (const method of [
      "scaffoldSpec",
      "writeScaffoldRuntime",
      "ensureRuntime",
      "emit",
      "verify",
    ]) {
      assert.equal(typeof (adapter as unknown as Record<string, unknown>)[method], "function", `${key}.${method} must be a function`);
    }
  }
});

test("build.mjs writes a versioned build_plan.json into shared/build/", () => {
  const FIXTURES = join(HERE, "golden", "fixtures");
  const slug = "hash-table-example";
  const tmp = mkdtempSync(join(tmpdir(), "boundaries-"));
  try {
    const shared = join(tmp, "shared");
    const output = join(tmp, "hyperframes");
    mkdirSync(join(shared, "assets", "voice"), { recursive: true });
    mkdirSync(join(output, "compositions", "frames"), { recursive: true });
    for (const slug of [
      "01-cover", "02-core-idea", "03-lookup-flow", "04-collisions",
      "05-load-factor", "06-why-matters", "07-recap",
    ]) {
      writeFileSync(
        join(output, "compositions", "frames", `${slug}.html`),
        `<template data-composition-id="${slug}"><div data-composition-id="${slug}" data-width="1920" data-height="1080" data-duration="1"></div><script src="${DEFAULT_GSAP_SRC}"></script><script>window.__timelines = window.__timelines || {}; window.__timelines["${slug}"] = gsap.timeline({ paused: true });</script></template>\n`,
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
      readFileSync(join(inputs, "output.config.json"), "utf8").replaceAll(
        "__MD2VID_DEFAULT_GSAP_SRC__",
        DEFAULT_GSAP_SRC,
      ),
    );

    execFileSync("node", [join(REPO_ROOT, "scripts", "build.ts"), output], { stdio: "pipe" });

    const plan = JSON.parse(readFileSync(join(shared, "build", "build_plan.json"), "utf8"));
    assert.equal(plan.version, 1, "build_plan.json must carry a version");
    assert.ok(Array.isArray(plan.frames) && plan.frames.length > 0, "plan has frames");
    assert.ok(plan.canvas && plan.timing, "plan has canvas + timing");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
