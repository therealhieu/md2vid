import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  mergePackageManifest,
  validateCommonScaffold,
  validateFrameworkRuntime,
  writeCommonScaffold,
} from "../../scripts/scaffold_project.ts";
import type { FrameworkScaffoldSpec } from "../../engine/types.ts";
import { DEFAULT_GSAP_SRC, ensureRuntime } from "../../frameworks/hyperframes/scaffold.ts";

const spec: FrameworkScaffoldSpec = {
  outputConfig: {
    framework: "hyperframes",
    gsapSrc: "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js",
  },
  packageScripts: {
    check: "md2vid hyperframes lint",
    dev: "md2vid hyperframes preview --no-open",
  },
  dependencies: { hyperframes: "0.7.26" },
  devDependencies: { typescript: "^5.7.0" },
  nextSteps: ["author frames"],
};

test("mergePackageManifest merges common and adapter package fields deterministically", () => {
  assert.deepEqual(mergePackageManifest("demo-video", spec), {
    name: "demo-video",
    private: true,
    type: "module",
    scripts: {
      build: "md2vid build . && md2vid regroup . --max-chars 54",
      transcribe: "md2vid transcribe .",
      check: "md2vid hyperframes lint",
      dev: "md2vid hyperframes preview --no-open",
    },
    dependencies: { hyperframes: "0.7.26" },
    devDependencies: { typescript: "^5.7.0" },
  });
});

test("mergePackageManifest rejects adapter conflicts with common script names", () => {
  assert.throws(
    () => mergePackageManifest("demo-video", { ...spec, packageScripts: { build: "other" } }),
    /common package script "build"/,
  );
});

test("writeCommonScaffold writes neutral common files and packaged framework guidance", () => {
  const stage = mkdtempSync(join(tmpdir(), "common-scaffold-"));
  try {
    writeCommonScaffold(stage, "demo-video", "hyperframes", spec);

    const meta = JSON.parse(readFileSync(join(stage, "meta.json"), "utf8"));
    assert.equal(meta.id, "demo-video");
    assert.equal(meta.name, "demo-video");
    assert.match(meta.createdAt, /^\d{4}-\d{2}-\d{2}T/);

    assert.deepEqual(JSON.parse(readFileSync(join(stage, "video.config.json"), "utf8")), {
      $comment: "Per-project build config for `md2vid build .`. Fill slugs with every voice id -> frame slug. gap=0 => back-to-back narration; gap>0 => a silent held-landing stop between frames.",
      timing: { tail: 0.5, xfade: 0.5, gap: 0.5 },
      canvas: { width: 1920, height: 1080 },
      slugs: {},
    });
    assert.deepEqual(JSON.parse(readFileSync(join(stage, "output.config.json"), "utf8")), spec.outputConfig);
    assert.deepEqual(JSON.parse(readFileSync(join(stage, "package.json"), "utf8")), mergePackageManifest("demo-video", spec));
    assert.equal(readFileSync(join(stage, "CLAUDE.md"), "utf8"), "@.md2vid/standards/hyperframes.md\n");
    assert.equal(readFileSync(join(stage, "AGENTS.md"), "utf8"), "@.md2vid/standards/hyperframes.md\n");
    assert.ok(existsSync(join(stage, ".md2vid", "standards", "hyperframes.md")));
    assert.doesNotThrow(() => validateCommonScaffold(stage, "demo-video"));
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

test("validateFrameworkRuntime accepts the pinned CDN and an existing local gsapSrc", () => {
  for (const gsapSrc of [DEFAULT_GSAP_SRC, "runtime/custom-gsap.js"]) {
    const stage = mkdtempSync(join(tmpdir(), "hyperframes-runtime-valid-"));
    try {
      ensureRuntime(stage, "demo-video");
      if (gsapSrc !== DEFAULT_GSAP_SRC) {
        const runtimeDir = join(stage, "runtime");
        mkdirSync(runtimeDir, { recursive: true });
        writeFileSync(join(runtimeDir, "custom-gsap.js"), "CUSTOM GSAP\n");
      }
      writeFileSync(
        join(stage, "output.config.json"),
        `${JSON.stringify({ framework: "hyperframes", gsapSrc }, null, 2)}\n`,
      );
      assert.doesNotThrow(() => validateFrameworkRuntime(stage, "hyperframes"));
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  }
});

test("validateFrameworkRuntime rejects unsafe or missing local gsapSrc", () => {
  const invalidSources = [
    null,
    "",
    "runtime/missing.js",
    "../escape.js",
    "/absolute/gsap.js",
    "https://cdn.example.test/gsap.min.js",
    "runtime\\custom-gsap.js",
    "runtime/custom gsap.js",
    "runtime/custom-gsap.js?debug=1",
    "runtime/custom-gsap.js#fragment",
    "runtime/custom%2dgsap.js",
    "runtime/custom-gsap.css",
    "runtime/custom\"gsap.js",
    "runtime/<custom-gsap>.js",
    "runtime/`custom-gsap`.js",
  ];
  for (const gsapSrc of invalidSources) {
    const stage = mkdtempSync(join(tmpdir(), "hyperframes-runtime-invalid-"));
    try {
      ensureRuntime(stage, "demo-video");
      writeFileSync(
        join(stage, "output.config.json"),
        `${JSON.stringify({ framework: "hyperframes", gsapSrc }, null, 2)}\n`,
      );
      const expected = gsapSrc === "runtime/missing.js" ? /missing gsapSrc file/ : /invalid gsapSrc/;
      assert.throws(() => validateFrameworkRuntime(stage, "hyperframes"), expected);
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  }
});

test("validateCommonScaffold rejects framework-local keys in neutral config", () => {
  const stage = mkdtempSync(join(tmpdir(), "common-scaffold-invalid-"));
  try {
    writeCommonScaffold(stage, "demo-video", "hyperframes", spec);
    const configPath = join(stage, "video.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.framework = "hyperframes";
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    assert.throws(() => validateCommonScaffold(stage, "demo-video"), /framework-local key "framework"/);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});
