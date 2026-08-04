import assert from "node:assert/strict";
import test from "node:test";
import type { BuildPlan } from "../types.ts";
import {
  canonicalizeCoveragePlan,
  compareVisualEvidenceFreshness,
  digestAuthoredInputs,
  hashCoveragePlan,
  validateVisualBindingManifest,
} from "../visual_evidence.ts";

const PLAN: BuildPlan = {
  version: 1,
  canvas: { width: 1920, height: 1080 },
  timing: { tail: 0, xfade: 0, gap: 1 },
  totalDuration: 23.08,
  captionGroups: [],
  frames: [{
    id: "overview",
    frameNum: 1,
    slug: "overview",
    voicePath: "assets/voice/overview.wav",
    voiceDur: 22.08,
    frameDur: 23.08,
    start: 0,
    words: [
      { text: "A", start: 0.07, end: 0.12 },
      { text: "solution", start: 18.26, end: 18.8 },
    ],
    visualSpecVersion: 2,
    visualKind: "focal",
    visualBeats: [{
      version: 2,
      id: "opening",
      text: "Opening context",
      role: "focal",
      start: 0,
      end: 23.08,
      cueText: "<frame-start>",
      sourceRefs: [],
      tolerance: { maxLead: 0.25, maxLag: 0.75 },
    }],
  }],
};

const V1_MANIFEST = {
  version: 1,
  framework: "hyperframes",
  bindings: [{
    frameSlug: "overview",
    beatId: "opening",
    target: "#opening",
    revealStart: 0,
    revealDuration: 0,
    source: "declarative",
  }],
};

const V2_MANIFEST = {
  version: 2,
  framework: "hyperframes",
  planSha256: "a".repeat(64),
  authoredInputs: [{
    path: "compositions/frames/overview.html",
    sha256: "b".repeat(64),
  }],
  bindings: [{
    frameSlug: "overview",
    beatId: "opening",
    target: "#opening",
    role: "focal",
    revealStart: 0,
    revealDuration: 0,
    coverageStart: 0,
    coverageEnd: 23.08,
    source: "static",
  }],
};

test("coverage plan digest ignores caption grouping", () => {
  const changed: BuildPlan = {
    ...PLAN,
    captionGroups: [{
      id: "caption-1",
      frame: 1,
      start: 0,
      end: 1,
      text: "Different caption",
      words: [{ text: "Different", start: 0, end: 1 }],
    }],
  };
  assert.equal(hashCoveragePlan(PLAN), hashCoveragePlan(changed));
});

test("coverage plan digest changes for semantic timing and canonicalizes deterministically", () => {
  const changed = structuredClone(PLAN);
  const state = changed.frames[0].visualBeats?.[0];
  assert.ok(state && state.version === 2);
  state.end = 6;
  assert.notEqual(hashCoveragePlan(PLAN), hashCoveragePlan(changed));
  assert.equal(canonicalizeCoveragePlan(PLAN), canonicalizeCoveragePlan(structuredClone(PLAN)));
  assert.equal(canonicalizeCoveragePlan(PLAN).endsWith("\n"), true);
});

test("authored input digests normalize, sort, and hash project-relative paths", () => {
  const result = digestAuthoredInputs([
    { path: "visual_bindings.json", bytes: Buffer.from("registry") },
    { path: "src\\Video.tsx", bytes: Buffer.from("video") },
  ]);
  assert.deepEqual(result.map(({ path }) => path), [
    "src/Video.tsx",
    "visual_bindings.json",
  ]);
  assert.match(result[0].sha256, /^[a-f0-9]{64}$/);
});

test("authored input digests reject unsafe or duplicate normalized paths", () => {
  for (const path of ["/absolute.ts", "../escape.ts", "src/../Video.tsx", "src//Video.tsx"]) {
    assert.throws(
      () => digestAuthoredInputs([{ path, bytes: Buffer.from("x") }]),
      /project-relative POSIX path/,
      path,
    );
  }
  assert.throws(
    () => digestAuthoredInputs([
      { path: "src/Video.tsx", bytes: Buffer.from("first") },
      { path: "src\\Video.tsx", bytes: Buffer.from("second") },
    ]),
    /duplicate authored visual input: src\/Video\.tsx/,
  );
});

test("manifest validation accepts unchanged v1 evidence", () => {
  assert.deepEqual(
    validateVisualBindingManifest(V1_MANIFEST, "build/visual_bindings.json"),
    V1_MANIFEST,
  );
});

test("manifest v2 requires exact digests and normalized bindings", () => {
  const missingPlan = { ...V2_MANIFEST } as Record<string, unknown>;
  delete missingPlan.planSha256;
  assert.throws(
    () => validateVisualBindingManifest(missingPlan, "build/visual_bindings.json"),
    /planSha256/,
  );

  const cases: Array<[string, unknown, RegExp]> = [
    ["uppercase digest", { ...V2_MANIFEST, planSha256: "A".repeat(64) }, /planSha256/],
    ["missing role", {
      ...V2_MANIFEST,
      bindings: [{ ...V2_MANIFEST.bindings[0], role: undefined }],
    }, /role/],
    ["inverted coverage", {
      ...V2_MANIFEST,
      bindings: [{ ...V2_MANIFEST.bindings[0], coverageStart: 3, coverageEnd: 2 }],
    }, /coverageStart/],
    ["unsupported source", {
      ...V2_MANIFEST,
      bindings: [{ ...V2_MANIFEST.bindings[0], source: "shell" }],
    }, /source/],
    ["unknown field", { ...V2_MANIFEST, unexpected: true }, /unexpected/],
    ["absolute input", {
      ...V2_MANIFEST,
      authoredInputs: [{ ...V2_MANIFEST.authoredInputs[0], path: "/overview.html" }],
    }, /project-relative POSIX path/],
    ["duplicate input", {
      ...V2_MANIFEST,
      authoredInputs: [
        V2_MANIFEST.authoredInputs[0],
        { ...V2_MANIFEST.authoredInputs[0] },
      ],
    }, /duplicate.*authoredInputs/],
    ["unknown frame duration field", {
      ...V2_MANIFEST,
      frames: [{ frameSlug: "overview", unexpected: true }],
    }, /frames\[0\]\.unexpected/],
  ];

  for (const [name, value, expected] of cases) {
    assert.throws(
      () => validateVisualBindingManifest(value, "build/visual_bindings.json"),
      expected,
      name,
    );
  }
});

test("manifest v2 validation rejects inherited structural fields", () => {
  const inheritedManifest = Object.create(V2_MANIFEST) as Record<string, unknown>;
  assert.throws(
    () => validateVisualBindingManifest(inheritedManifest, "build/visual_bindings.json"),
    /plain object|own property|version/,
  );

  const inheritedBinding = Object.create(V2_MANIFEST.bindings[0]) as Record<string, unknown>;
  assert.throws(
    () => validateVisualBindingManifest({
      ...V2_MANIFEST,
      bindings: [inheritedBinding],
    }, "build/visual_bindings.json"),
    /plain object|own property|frameSlug/,
  );
});

test("manifest validation requires authored inputs in sorted path order", () => {
  assert.throws(
    () => validateVisualBindingManifest({
      ...V2_MANIFEST,
      authoredInputs: [
        { path: "z.html", sha256: "c".repeat(64) },
        { path: "a.html", sha256: "d".repeat(64) },
      ],
    }, "build/visual_bindings.json"),
    /authoredInputs.*sorted/,
  );
});

test("freshness comparison reports stale plan and exact input set changes", () => {
  const manifest = validateVisualBindingManifest(V2_MANIFEST, "build/visual_bindings.json");
  assert.equal(manifest.version, 2);
  const changes = compareVisualEvidenceFreshness(manifest, {
    planSha256: "c".repeat(64),
    authoredInputs: [
      { path: "compositions/frames/overview.html", sha256: "d".repeat(64) },
      { path: "compositions/frames/new.html", sha256: "e".repeat(64) },
    ],
  });
  assert.deepEqual(changes, [
    { kind: "planSha256", expected: "a".repeat(64), actual: "c".repeat(64) },
    { kind: "added", path: "compositions/frames/new.html", actual: "e".repeat(64) },
    {
      kind: "changed",
      path: "compositions/frames/overview.html",
      expected: "b".repeat(64),
      actual: "d".repeat(64),
    },
  ]);
});
