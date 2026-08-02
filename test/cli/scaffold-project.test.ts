import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AUDIO_REQUEST_EXAMPLE,
  mergePackageManifest,
  validateCommonScaffold,
  validateFrameworkRuntime,
  writeCommonScaffold,
} from "../../scripts/scaffold_project.ts";
import type { FrameworkScaffoldSpec } from "../../engine/types.ts";
import {
  analyzeNarrationRequest,
  validateVersionedNarrationRequest,
} from "../../engine/narration_request.ts";
import { DEFAULT_GSAP_SRC, ensureRuntime } from "../../frameworks/hyperframes/scaffold.ts";
import {
  HYPERFRAMES_VERSION,
  TYPESCRIPT_VERSION,
} from "../../scripts/dependency_versions.ts";

const EXPECTED_AUDIO_REQUEST = {
  version: 1,
  provider: "kokoro",
  voice: "am_michael",
  lang: "en",
  speed: 0.9,
  lines: [
    { id: "intro", text: "Introduce the topic." },
    { id: "recap", text: "Recap the key idea." },
  ],
} as const;

const spec: FrameworkScaffoldSpec = {
  outputConfig: {
    framework: "hyperframes",
    gsapSrc: DEFAULT_GSAP_SRC,
  },
  frameworkCheck: "md2vid hyperframes lint",
  packageScripts: {
    dev: "md2vid hyperframes preview --no-open",
  },
  dependencies: { hyperframes: HYPERFRAMES_VERSION },
  devDependencies: { typescript: TYPESCRIPT_VERSION },
  nextSteps: ["author frames"],
};

test("mergePackageManifest merges common and adapter package fields deterministically", () => {
  assert.deepEqual(mergePackageManifest("demo-video", spec), {
    name: "demo-video",
    private: true,
    type: "module",
    scripts: {
      build: "md2vid build . && md2vid regroup . --max-chars 54",
      plan: "md2vid plan .",
      transcribe: "md2vid transcribe .",
      verify: "md2vid verify .",
      check: "md2vid verify . && md2vid hyperframes lint",
      dev: "md2vid hyperframes preview --no-open",
    },
    dependencies: { hyperframes: HYPERFRAMES_VERSION },
    devDependencies: { typescript: TYPESCRIPT_VERSION },
  });
});

test("mergePackageManifest rejects adapter conflicts with common script names", () => {
  for (const name of ["build", "plan", "transcribe", "verify", "check"]) {
    assert.throws(
      () => mergePackageManifest("demo-video", { ...spec, packageScripts: { [name]: "other" } }),
      new RegExp(`common package script "${name}"`),
    );
  }
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
      $comment: "Map every audio_meta voices[].id to its frame slug. Voice IDs may be meaningful strings; frame order follows the voices[] array. gap=0 is back-to-back; gap>0 adds a held landing.",
      timing: { tail: 0.5, xfade: 0.5, gap: 0.5 },
      canvas: { width: 1920, height: 1080 },
      slugs: {},
      visualSync: { mode: "required", maxLead: 0.25, maxLag: 0.75, minLanding: 1 },
    });
    const audioRequest = JSON.parse(readFileSync(join(stage, "audio_request.json.example"), "utf8"));
    assert.deepEqual(audioRequest, EXPECTED_AUDIO_REQUEST);
    const analyzed = analyzeNarrationRequest(
      validateVersionedNarrationRequest(audioRequest, "audio_request.json.example"),
    );
    assert.equal(analyzed.findings.some((finding) => finding.severity === "error"), false);
    assert.equal(existsSync(join(stage, "audio_meta.json")), false);
    assert.deepEqual(JSON.parse(readFileSync(join(stage, "visual_beats.json.example"), "utf8")), {
      version: 1,
      frames: {
        "replace-with-workflow-slug": {
          kind: "workflow",
          beats: [
            {
              id: "first-step",
              text: "First step",
              cue: { phrase: "first step", occurrence: 1 },
              workflowStep: 1,
              sourceRefs: ["source.md:1-3"],
            },
            {
              id: "second-step",
              text: "Second step",
              cue: { wordIndex: 8 },
              workflowStep: 2,
              sourceRefs: ["source.md:4-6"],
            },
          ],
        },
        "replace-with-focal-slug": {
          kind: "focal",
          beats: [{ id: "focal", text: "Main idea", cue: { phrase: "main idea", occurrence: 1 } }],
        },
      },
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

test("narration scaffold oracle is recursively immutable", () => {
  assert.equal(Object.isFrozen(AUDIO_REQUEST_EXAMPLE), true);
  assert.equal(Object.isFrozen(AUDIO_REQUEST_EXAMPLE.lines), true);
  assert.equal(Object.isFrozen(AUDIO_REQUEST_EXAMPLE.lines[0]), true);
  assert.equal(Reflect.set(AUDIO_REQUEST_EXAMPLE.lines[0], "text", "Mutated narration."), false);
  assert.equal(Reflect.set(AUDIO_REQUEST_EXAMPLE.lines, 0, { id: "mutated", text: "Mutated narration." }), false);
  assert.deepEqual(AUDIO_REQUEST_EXAMPLE, EXPECTED_AUDIO_REQUEST);

  const stage = mkdtempSync(join(tmpdir(), "common-scaffold-immutable-narration-"));
  try {
    writeCommonScaffold(stage, "demo-video", "hyperframes", spec);
    assert.deepEqual(JSON.parse(readFileSync(join(stage, "audio_request.json.example"), "utf8")), EXPECTED_AUDIO_REQUEST);
    assert.doesNotThrow(() => validateCommonScaffold(stage, "demo-video"));
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

for (const [field, value] of [
  ["version", 2],
  ["provider", "heygen"],
  ["voice", "af_heart"],
  ["lang", "en-gb"],
  ["speed", 1],
] as const) {
  test(`validateCommonScaffold rejects audio request ${field} drift`, () => {
    const stage = mkdtempSync(join(tmpdir(), `common-scaffold-narration-${field}-`));
    try {
      writeCommonScaffold(stage, "demo-video", "hyperframes", spec);
      const path = join(stage, "audio_request.json.example");
      const request = JSON.parse(readFileSync(path, "utf8"));
      writeFileSync(path, `${JSON.stringify({ ...request, [field]: value }, null, 2)}\n`);
      assert.throws(
        () => validateCommonScaffold(stage, "demo-video"),
        /audio_request\.json\.example/,
      );
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  });
}

const { speed: _defaultSpeed, ...MISSING_SPEED_REQUEST } = EXPECTED_AUDIO_REQUEST;
for (const [name, request] of [
  ["missing required field", MISSING_SPEED_REQUEST],
  ["extra field", { ...EXPECTED_AUDIO_REQUEST, unexpected: true }],
  ["reordered lines", { ...EXPECTED_AUDIO_REQUEST, lines: [...EXPECTED_AUDIO_REQUEST.lines].reverse() }],
  ["changed line text", {
    ...EXPECTED_AUDIO_REQUEST,
    lines: [{ ...EXPECTED_AUDIO_REQUEST.lines[0], text: "Introduce this topic." }, EXPECTED_AUDIO_REQUEST.lines[1]],
  }],
] as const) {
  test(`validateCommonScaffold rejects narration request ${name}`, () => {
    const stage = mkdtempSync(join(tmpdir(), "common-scaffold-narration-shape-"));
    try {
      writeCommonScaffold(stage, "demo-video", "hyperframes", spec);
      writeFileSync(join(stage, "audio_request.json.example"), `${JSON.stringify(request, null, 2)}\n`);
      assert.throws(() => validateCommonScaffold(stage, "demo-video"), /audio_request\.json\.example/);
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  });
}

test("validateCommonScaffold requires the narration request example", () => {
  const stage = mkdtempSync(join(tmpdir(), "common-scaffold-missing-audio-request-"));
  try {
    writeCommonScaffold(stage, "demo-video", "hyperframes", spec);
    const requestPath = join(stage, "audio_request.json.example");
    writeFileSync(requestPath, "{}\n");
    rmSync(requestPath);
    assert.throws(
      () => validateCommonScaffold(stage, "demo-video"),
      new RegExp(`missing required scaffold file ${requestPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

test("validateCommonScaffold requires visual timing files and required policy defaults", () => {
  const stage = mkdtempSync(join(tmpdir(), "common-scaffold-visual-timing-"));
  try {
    writeCommonScaffold(stage, "demo-video", "hyperframes", spec);
    const beatsPath = join(stage, "visual_beats.json.example");
    rmSync(beatsPath);
    assert.throws(
      () => validateCommonScaffold(stage, "demo-video"),
      new RegExp(`missing required scaffold file ${beatsPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );

    writeCommonScaffold(stage, "demo-video", "hyperframes", spec);
    const configPath = join(stage, "video.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    delete config.visualSync;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    assert.throws(
      () => validateCommonScaffold(stage, "demo-video"),
      /video\.config\.json visualSync must equal the required scaffold policy/,
    );
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

test("validateFrameworkRuntime accepts the pinned CDN and canonical local gsapSrc", () => {
  for (const gsapSrc of [DEFAULT_GSAP_SRC, "assets/gsap/gsap.min.js"]) {
    const stage = mkdtempSync(join(tmpdir(), "hyperframes-runtime-valid-"));
    try {
      ensureRuntime(stage, "demo-video");
      if (gsapSrc !== DEFAULT_GSAP_SRC) {
        const runtimeDir = join(stage, "assets", "gsap");
        mkdirSync(runtimeDir, { recursive: true });
        writeFileSync(join(runtimeDir, "gsap.min.js"), "CUSTOM GSAP\n");
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
  for (const [key, value] of [
    ["framework", "hyperframes"],
    ["visualContract", { version: 1, projectTheme: "light", allowMixedThemes: false, allowLegacyThemeInference: false }],
  ] as const) {
    const stage = mkdtempSync(join(tmpdir(), "common-scaffold-invalid-"));
    try {
      writeCommonScaffold(stage, "demo-video", "hyperframes", spec);
      const configPath = join(stage, "video.config.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      config[key] = value;
      writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
      assert.throws(
        () => validateCommonScaffold(stage, "demo-video"),
        new RegExp(`framework-local key "${key}"`),
      );
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  }
});
