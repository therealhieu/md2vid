# Part 2 — Continuous Verification and Evidence Freshness

Depends on: `2026-08-03-continuous-semantic-visual-coverage-plan-1.md`.

- [ ] **Task 5: Implement whole-interval semantic coverage verification** `[Group: coverage-verification]` `[Tester: yes]`

**Files:**
- Modify: `engine/types.ts:104-148`
- Modify: `engine/visual_sync.ts:12-223`
- Modify: `engine/__tests__/visual_sync.test.ts`

- [ ] **Step 1: Add failing narrated coverage fixtures and diagnostics tests**

Keep the existing reveal-point fixture for regression coverage. Add a second helper with real words and v2 states:

```ts
function makeCoveragePlan(
  visualBeats: ResolvedVisualStateV2[] = [
    {
      version: 2,
      id: "opening",
      text: "Opening context",
      role: "focal",
      start: 0,
      end: 18.26,
      cueText: "<frame-start>",
      sourceRefs: [],
      tolerance: { maxLead: 0.25, maxLag: 0.75 },
    },
    {
      version: 2,
      id: "solution",
      text: "Solution",
      role: "focal",
      start: 18.26,
      end: 23.08,
      cueWordIndex: 1,
      cueText: "solution",
      sourceRefs: [],
      tolerance: { maxLead: 0.25, maxLag: 0.75 },
    },
  ],
): BuildPlan {
  return {
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
      visualKind: "focal",
      visualBeats,
    }],
  };
}

const COVERAGE_POLICY = {
  mode: "required",
  coverageMode: "required",
  maxLead: 0.25,
  maxLag: 0.75,
  maxUncoveredGap: 0.5,
  minLanding: 1,
} as const;

function focalBinding(
  beatId: string,
  coverageStart: number,
  coverageEnd: number,
): VisualBindingV2 {
  return {
    frameSlug: "overview",
    beatId,
    target: `#${beatId}`,
    role: "focal",
    revealStart: coverageStart,
    revealDuration: 0,
    coverageStart,
    coverageEnd,
    source: "static",
    authoredDuration: 22.08,
    outerDuration: 23.08,
  };
}

function makeV2Manifest(
  bindings: VisualBindingV2[],
): VisualBindingManifestV2 {
  return {
    version: 2,
    framework: "fixture",
    planSha256: "0".repeat(64),
    authoredInputs: [],
    bindings,
  };
}
```

Add the complete matrix:

```ts
test("reports an opening semantic coverage gap", () => {
  const findings = verifyVisualSync({
    plan: makeCoveragePlan(),
    policy: COVERAGE_POLICY,
    fps: 30,
    manifest: makeV2Manifest([
      focalBinding("solution", 18.26, 23.08),
    ]),
  });
  assert.deepEqual(findings.map(({ code, details }) => ({ code, details })), [{
    code: "opening_visual_gap",
    details: {
      frameSlug: "overview",
      start: 0.07,
      end: 18.26,
      duration: 18.19,
      maxUncoveredGap: 0.5,
      nextBeatId: "solution",
      extendsThroughFrameEnd: false,
    },
  }]);
});

test("reports a middle semantic coverage gap", () => {
  const findings = verifyVisualSync({
    plan: makeCoveragePlan(),
    policy: COVERAGE_POLICY,
    fps: 30,
    manifest: makeV2Manifest([
      focalBinding("opening", 0, 6),
      focalBinding("solution", 18.26, 23.08),
    ]),
  });
  assert.equal(findings[0]?.code, "mid_scene_visual_gap");
  assert.match(findings[0]?.msg ?? "", /6\.000s-18\.260s/);
});

test("reports an ending semantic coverage gap", () => {
  const findings = verifyVisualSync({
    plan: makeCoveragePlan(),
    policy: COVERAGE_POLICY,
    fps: 30,
    manifest: makeV2Manifest([
      focalBinding("opening", 0, 18.26),
      focalBinding("solution", 18.26, 20.08),
    ]),
  });
  assert.equal(findings[0]?.code, "ending_visual_gap");
  assert.match(findings[0]?.msg ?? "", /20\.080s-23\.080s/);
});

test("classifies a complete-frame gap as opening through frame end", () => {
  const findings = verifyVisualSync({
    plan: makeCoveragePlan(),
    policy: COVERAGE_POLICY,
    fps: 30,
    manifest: makeV2Manifest([]),
  });
  const gap = findings.find((finding) =>
    finding.code === "opening_visual_gap"
  );
  assert.equal(gap?.details?.extendsThroughFrameEnd, true);
});
```

Add tests for:

- one static focal interval covering `0`–`23.08` passes;
- supporting-only bindings do not cover;
- a `0.5` gap passes and `0.500001` fails;
- overlapping intervals merge;
- arithmetic adjacency within half-frame epsilon merges;
- multiple focal targets union correctly;
- invalid/non-finite/inverted evidence reports an evidence error and contributes no coverage;
- first speech and first focal at `2.95` pass after leading silence;
- partial and full exemptions remain visible as `visual_coverage_exemption` findings;
- unapproved portions of a partially exempt gap still fail;
- warn mode downgrades gaps; off mode skips interval checks;
- all current lead/lag/order/landing/duration tests remain unchanged.

- [ ] **Step 2: Run the verifier tests and confirm failure**

Run:

```bash
node --test engine/__tests__/visual_sync.test.ts
```

Expected: FAIL because findings lack structured codes/details and the verifier has no interval coverage algorithm.

- [ ] **Step 3: Extend findings and manifest binding types additively**

Add optional structured metadata to `Finding`:

```ts
export interface Finding {
  level: "error" | "warn";
  msg: string;
  code?: string;
  details?: Record<string, unknown>;
}
```

Add v2 binding types while retaining v1:

```ts
export interface VisualBindingV1 {
  frameSlug: string;
  beatId: string;
  target: string;
  revealStart: number;
  revealDuration: number;
  source: "declarative" | "custom";
  authoredDuration?: number;
  outerDuration?: number;
}

export interface VisualBindingV2 extends Omit<
  VisualBindingV1,
  "source"
> {
  role: VisualSemanticRole;
  coverageStart: number;
  coverageEnd: number;
  source: "declarative" | "custom" | "static";
}

export type VisualBinding = VisualBindingV1 | VisualBindingV2;

export interface VisualBindingInputDigest {
  path: string;
  sha256: string;
}

export interface VisualBindingManifestV1 {
  version: 1;
  framework: string;
  bindings: VisualBindingV1[];
  frames?: VisualFrameDuration[];
}

export interface VisualBindingManifestV2 {
  version: 2;
  framework: string;
  planSha256: string;
  authoredInputs: VisualBindingInputDigest[];
  bindings: VisualBindingV2[];
  frames?: VisualFrameDuration[];
}

export type VisualBindingManifest =
  | VisualBindingManifestV1
  | VisualBindingManifestV2;
```

- [ ] **Step 4: Add pure interval helpers and coverage evaluation**

Add private helpers to `engine/visual_sync.ts`:

```ts
interface Interval {
  start: number;
  end: number;
}

function unionIntervals(
  intervals: readonly Interval[],
  epsilon: number,
): Interval[] {
  const sorted = intervals
    .map((interval) => ({ ...interval }))
    .sort((left, right) =>
      left.start - right.start || left.end - right.end
    );
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end + epsilon) {
      merged.push(interval);
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
  }
  return merged;
}

function subtractCoverage(
  required: Interval,
  covered: readonly Interval[],
  epsilon: number,
): Interval[] {
  const gaps: Interval[] = [];
  let cursor = required.start;
  for (const interval of covered) {
    if (interval.end <= cursor + epsilon) continue;
    if (interval.start > cursor + epsilon) {
      gaps.push({ start: cursor, end: Math.min(interval.start, required.end) });
    }
    cursor = Math.max(cursor, interval.end);
    if (cursor >= required.end - epsilon) break;
  }
  if (cursor < required.end - epsilon) {
    gaps.push({ start: cursor, end: required.end });
  }
  return gaps.filter((gap) => gap.end > gap.start + epsilon);
}
```

Use half-frame arithmetic epsilon only for boundary stability:

```ts
const epsilon = 0.5 / input.fps;
```

Select narrated v2 frames by the explicit provenance marker, not by a non-empty beat list:

```ts
for (const frame of input.plan.frames) {
  if (frame.visualSpecVersion !== 2 || frame.words.length === 0) continue;
  const required = {
    start: frame.words[0].start,
    end: frame.frameDur,
  };
  const focalIntervals = frameBindings
    .filter((binding): binding is VisualBindingV2 =>
      "coverageStart" in binding
      && binding.role === "focal"
      && validCoverageBinding(binding, frame, findings)
    )
    .map((binding) => ({
      start: Math.max(0, binding.coverageStart),
      end: Math.min(frame.frameDur, binding.coverageEnd),
    }));
  const gaps = subtractCoverage(
    required,
    unionIntervals(focalIntervals, epsilon),
    epsilon,
  );
  evaluateCoverageGaps(frame, required, gaps, input.policy, findings);
}
```

Split gaps against resolved exemptions before evaluating `maxUncoveredGap`. Always emit one warning with code `visual_coverage_exemption` for each used exemption.

- [ ] **Step 5: Add stable classification and messages**

Use exactly three public gap codes:

```ts
function classifyGap(
  gap: Interval,
  required: Interval,
  epsilon: number,
): {
  code: "opening_visual_gap" | "mid_scene_visual_gap" | "ending_visual_gap";
  extendsThroughFrameEnd: boolean;
} {
  if (Math.abs(gap.start - required.start) <= epsilon) {
    return {
      code: "opening_visual_gap",
      extendsThroughFrameEnd:
        Math.abs(gap.end - required.end) <= epsilon,
    };
  }
  if (Math.abs(gap.end - required.end) <= epsilon) {
    return { code: "ending_visual_gap", extendsThroughFrameEnd: false };
  }
  return { code: "mid_scene_visual_gap", extendsThroughFrameEnd: false };
}
```

Only report unapproved gaps whose duration is strictly greater than `policy.maxUncoveredGap`. Include frame slug, interval, duration, threshold, surrounding beat IDs, and recovery action in `msg` and `details`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
node --test engine/__tests__/visual_sync.test.ts
corepack npm run typecheck
```

Expected: PASS. Existing reveal tests still pass; interval coverage uses observed focal v2 evidence only.

- [ ] **Step 7: Commit**

```bash
git add engine/types.ts engine/visual_sync.ts engine/__tests__/visual_sync.test.ts
git commit -m "feat(verify): detect semantic visual gaps"
```

---

- [ ] **Task 6: Add manifest-v2 parsing and deterministic evidence digests** `[Group: coverage-verification]` `[Tester: yes]`

**Files:**
- Modify: `engine/types.ts:104-218`
- Create: `engine/visual_evidence.ts`
- Create: `engine/__tests__/visual_evidence.test.ts`
- Modify: `scripts/verify.ts:72-115`
- Modify: `frameworks/index.ts:7-20`
- Modify: `test/release/manifest.ts` if the new engine module creates a new shipped `dist` path
- Modify: `test/cli/pack.test.ts` if the new engine module creates a new shipped `dist` path

- [ ] **Step 1: Write failing digest and parser tests**

Create `engine/__tests__/visual_evidence.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { BuildPlan } from "../types.ts";
import {
  canonicalizeCoveragePlan,
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

test("coverage plan digest ignores caption grouping", () => {
  const changed = {
    ...PLAN,
    captionGroups: [{ start: 0, end: 1, text: "Different caption" }],
  };
  assert.equal(hashCoveragePlan(PLAN), hashCoveragePlan(changed));
});

test("coverage plan digest changes for semantic timing", () => {
  const changed = structuredClone(PLAN);
  const state = changed.frames[0].visualBeats?.[0];
  assert.ok(state && state.version === 2);
  state.end = 6;
  assert.notEqual(hashCoveragePlan(PLAN), hashCoveragePlan(changed));
});

test("authored input digests normalize and sort paths", () => {
  const result = digestAuthoredInputs([
    { path: "src\\Video.tsx", bytes: Buffer.from("video") },
    { path: "visual_bindings.json", bytes: Buffer.from("registry") },
  ]);
  assert.deepEqual(result.map(({ path }) => path), [
    "src/Video.tsx",
    "visual_bindings.json",
  ]);
  assert.match(result[0].sha256, /^[a-f0-9]{64}$/);
});

test("manifest v2 requires plan and authored input digests", () => {
  assert.throws(
    () => validateVisualBindingManifest({
      version: 2,
      framework: "hyperframes",
      bindings: [],
    }, "build/visual_bindings.json"),
    /planSha256/,
  );
});
```

Add exact-shape cases for:

- v1 manifest accepted unchanged;
- v2 `role`, `coverageStart`, `coverageEnd`, and `source` validation;
- lowercase 64-character SHA-256 validation;
- normalized project-relative POSIX paths only;
- duplicate paths rejected;
- paths sorted in output;
- unknown v2 fields rejected.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
node --test engine/__tests__/visual_evidence.test.ts
```

Expected: FAIL because the module and v2 manifest validation do not exist.

- [ ] **Step 3: Define manifest-v2 and adapter evidence contracts**

Keep the manifest-v2 types introduced in Task 5 and add the adapter evidence context to `engine/types.ts`:

```ts
export interface VisualBindingEvidenceContext {
  plan: BuildPlan;
  videoDir: string;
  sharedDir: string;
  config: VideoConfig;
}

export interface AuthoredVisualInput {
  path: string;
  bytes: Buffer;
}
```

Extend `FrameworkAdapter`:

```ts
collectVisualBindingInputs?: (
  context: VisualBindingEvidenceContext,
) => AuthoredVisualInput[];
```

Build and verify must call the same adapter method. An adapter with v2 evidence must implement it.

- [ ] **Step 4: Implement a canonical coverage plan projection and SHA-256 helpers**

Create `engine/visual_evidence.ts` using `node:crypto`:

```ts
import { createHash } from "node:crypto";
import type {
  AuthoredVisualInput,
  BuildPlan,
  VisualBindingInputDigest,
  VisualBindingManifest,
} from "./types.ts";

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalizeCoveragePlan(plan: BuildPlan): string {
  const projection = {
    version: plan.version,
    frames: plan.frames.map((frame) => ({
      slug: frame.slug,
      voiceDur: frame.voiceDur,
      frameDur: frame.frameDur,
      firstWordStart: frame.words[0]?.start,
      words: frame.words.map((word) => ({
        text: word.text,
        start: word.start,
        end: word.end,
      })),
      ...(frame.visualSpecVersion === undefined
        ? {}
        : { visualSpecVersion: frame.visualSpecVersion }),
      ...(frame.visualKind === undefined
        ? {}
        : { visualKind: frame.visualKind }),
      visualBeats: frame.visualBeats ?? [],
      visualCoverageExemptions: frame.visualCoverageExemptions ?? [],
    })),
  };
  return `${JSON.stringify(projection)}\n`;
}

export function hashCoveragePlan(plan: BuildPlan): string {
  return sha256(canonicalizeCoveragePlan(plan));
}

export function digestAuthoredInputs(
  inputs: readonly AuthoredVisualInput[],
): VisualBindingInputDigest[] {
  const normalized = inputs.map((input) => ({
    path: input.path.replaceAll("\\", "/"),
    sha256: sha256(input.bytes),
  })).sort((left, right) => left.path.localeCompare(right.path));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].path === normalized[index].path) {
      throw new Error(`duplicate authored visual input: ${normalized[index].path}`);
    }
  }
  return normalized;
}
```

Do not hash `captionGroups`, pretty-printed artifact bytes, output-local generated files, or absolute paths.

Move the current CLI-local manifest structural validation into `validateVisualBindingManifest()` in this module. Keep `scripts/verify.ts::readBindingManifest()` as a file reader that delegates to the neutral validator.

- [ ] **Step 5: Run tests, typecheck, and package-path checks**

Run:

```bash
node --test engine/__tests__/visual_evidence.test.ts
corepack npm run typecheck
node --test test/cli/pack.test.ts
```

Expected: PASS. If `build:dist` produces `dist/engine/visual_evidence.js`, add that exact path to `test/release/manifest.ts` and pack assertions before committing.

- [ ] **Step 6: Commit**

```bash
git add engine/types.ts engine/visual_evidence.ts engine/__tests__/visual_evidence.test.ts scripts/verify.ts frameworks/index.ts test/release/manifest.ts test/cli/pack.test.ts
git commit -m "feat(evidence): version visual binding manifests"
```

---

- [ ] **Task 7: Reject stale plan and authored-source evidence during verify** `[Group: coverage-verification]` `[Tester: yes]`

**Files:**
- Modify: `scripts/verify.ts:117-226`
- Modify: `engine/visual_sync.ts`
- Modify: `engine/__tests__/visual_sync.test.ts`
- Modify: `test/cli/workflows.test.ts`
- Modify: `frameworks/hyperframes/index.ts`
- Modify: `frameworks/remotion/index.ts`

- [ ] **Step 1: Write failing freshness workflow tests**

Add a fake adapter with deterministic authored input enumeration:

```ts
const adapter: FrameworkAdapter = {
  ...BASE_ADAPTER,
  name: "fixture",
  bindingManifestPath: "build/visual_bindings.json",
  collectVisualBindingInputs: ({ videoDir }) => [{
    path: "compositions/frames/overview.html",
    bytes: readFileSync(
      join(videoDir, "compositions/frames/overview.html"),
    ),
  }],
};
```

Add workflow cases:

```ts
test("verify rejects a stale coverage plan digest", () => {
  const project = createCoverageProject();
  writeFreshV2Manifest(project, adapter);
  mutateVisualBeatsEnd(project, 6);
  const result = runVerify(project, adapter);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /stale_visual_evidence/);
  assert.match(result.stderr, /planSha256/);
  assert.match(result.stderr, /md2vid build/);
});

test("verify rejects changed and newly relevant authored inputs", () => {
  const project = createCoverageProject();
  writeFreshV2Manifest(project, adapter);
  appendFileSync(
    join(project, "compositions/frames/overview.html"),
    "\n<!-- changed -->\n",
  );
  const changed = runVerify(project, adapter);
  assert.equal(changed.code, 1);
  assert.match(changed.stderr, /compositions\/frames\/overview\.html/);
});
```

Add warn-mode behavior proving stale bindings are excluded from positive coverage evaluation: output contains `stale_visual_evidence`, and no message claims semantic coverage passed.

Add a workflow case with `mode: "off", coverageMode: "required"` proving verify replans current visual input, performs project-standard/freshness checks, and emits a coverage finding rather than throwing or skipping the plan.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
node --test engine/__tests__/visual_sync.test.ts test/cli/workflows.test.ts
```

Expected: FAIL because verify does not compute or compare freshness evidence.

- [ ] **Step 3: Compute current freshness in `scripts/verify.ts`**

Replace the current reveal-only verify planning guard with independent coverage-aware logic before selecting the adapter:

```ts
const visualPlanningEnabled =
  policy.mode !== "off" || policy.coverageMode !== "off";
const requiresCurrentVisualPlanning =
  visualPlanningEnabled
  && (
    policy.mode === "required"
    || policy.coverageMode === "required"
    || isFile(visualBeatsPath)
  );
const planning = requiresCurrentVisualPlanning
  ? createProjectPlan(layout.outputDir)
  : undefined;
```

Use `layout.outputDir` and `layout.sharedDir` for checks that do not require a replan. When v2 required coverage or current visual input requires planning, assert `planning` before computing freshness:

```ts
if (!planning) {
  throw new Error("current visual planning is required for semantic verification");
}
const currentPlanSha256 = hashCoveragePlan(planning.plan);
const currentAuthoredInputs = adapter.collectVisualBindingInputs
  ? digestAuthoredInputs(adapter.collectVisualBindingInputs({
      plan: planning.plan,
      videoDir: planning.layout.outputDir,
      sharedDir: planning.layout.sharedDir,
      config: planning.adapterConfig,
    }))
  : [];
```

Pass them into neutral verification through an additive input:

```ts
verifyVisualSync({
  plan: planning.plan,
  manifest,
  policy,
  fps,
  freshness: {
    planSha256: currentPlanSha256,
    authoredInputs: currentAuthoredInputs,
  },
});
```

Register concrete collectors in adapter index files. HyperFrames reads exactly:

```ts
plan.frames.map((frame) => ({
  path: `compositions/frames/${frame.slug}.html`,
  bytes: readFileSync(
    join(videoDir, "compositions", "frames", `${frame.slug}.html`),
  ),
}));
```

Remotion uses a deterministic recursive walk over `src` with extensions `.ts`, `.tsx`, `.js`, `.jsx`, plus `visual_bindings.json`; sort paths before reading, exclude `node_modules`, `build`, `dist`, public assets, and generated `build_plan.json`.

- [ ] **Step 4: Compare manifest-v2 freshness before coverage**

In `verifyVisualSync`, validate freshness before accepting v2 intervals:

```ts
let effectiveManifest = input.manifest;
if (effectiveManifest?.version === 2 && input.freshness) {
  const changes = compareVisualEvidenceFreshness(
    effectiveManifest,
    input.freshness,
  );
  if (changes.length > 0) {
    findings.push({
      level: policy.coverageMode === "required" ? "error" : "warn",
      code: "stale_visual_evidence",
      msg: formatStaleVisualEvidence(changes),
      details: { changes },
    });
    effectiveManifest = {
      ...effectiveManifest,
      bindings: effectiveManifest.bindings.filter(
        (binding) => binding.role !== "focal",
      ),
    };
  }
}

const manifest = effectiveManifest;
```

Do not use stale focal intervals to claim coverage success. Required mode fails; warn mode reports stale evidence plus any resulting inability to prove coverage.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test \
  engine/__tests__/visual_evidence.test.ts \
  engine/__tests__/visual_sync.test.ts \
  test/cli/workflows.test.ts
corepack npm run typecheck
```

Expected: PASS. Diagnostics list changed, missing, and newly relevant project-relative paths plus the exact full-build recovery command.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify.ts engine/visual_sync.ts engine/__tests__/visual_sync.test.ts test/cli/workflows.test.ts frameworks/hyperframes/index.ts frameworks/remotion/index.ts
git commit -m "feat(verify): reject stale visual evidence"
```

---

- [ ] **Task 8: Make build and regroup preserve one semantic evidence lifecycle** `[Group: coverage-verification]` `[Tester: yes]`

**Files:**
- Modify: `scripts/build.ts:145-300`
- Modify: `scripts/regroup.ts:74-165`
- Modify: `frameworks/hyperframes/emit.ts:367-437`
- Modify: `frameworks/remotion/emit.ts:50-103`
- Modify: `test/cli/workflows.test.ts`

- [ ] **Step 1: Write failing full-build and captions-only lifecycle tests**

Add exact policy tests:

```ts
test("full build atomically replaces plan and manifest v2", () => {
  const project = createCoverageProject();
  seedOldPlanAndManifest(project);
  assert.equal(runBuild(project), 0);
  const manifest = readJson(
    join(project, "build/visual_bindings.json"),
  );
  assert.equal(manifest.version, 2);
  assert.equal(manifest.planSha256, hashCoveragePlan(readBuildPlan(project)));
});

test("captions-only build preserves existing semantic manifest", () => {
  const project = createCoverageProject();
  assert.equal(runBuild(project), 0);
  const before = readFileSync(
    join(project, "build/visual_bindings.json"),
  );
  mutateAuthoredVisualSource(project);
  assert.equal(runBuild(project, ["--captions-only"]), 0);
  assert.deepEqual(
    readFileSync(join(project, "build/visual_bindings.json")),
    before,
  );
  assert.equal(runVerify(project), 1);
});

test("regroup preserves manifest and exposes stale semantic input", () => {
  const project = createCoverageProject("remotion");
  assert.equal(runBuild(project), 0);
  const before = readFileSync(
    join(project, "build/visual_bindings.json"),
  );
  mutateRemotionScene(project);
  assert.equal(runRegroup(project), 0);
  assert.deepEqual(
    readFileSync(join(project, "build/visual_bindings.json")),
    before,
  );
  assert.equal(runVerify(project), 1);
});
```

Add rollback tests where manifest promotion fails after neutral staging; previous plan, captions, framework plan, and manifest bytes must all remain unchanged.

- [ ] **Step 2: Run workflow tests and confirm failure**

Run:

```bash
node --test test/cli/workflows.test.ts
```

Expected: FAIL because Remotion captions-only currently regenerates/promotes evidence while HyperFrames preserves it.

- [ ] **Step 3: Make full build the only semantic evidence publisher**

Keep full-build behavior: adapter preflight computes manifest v2 from the full current plan and authored input set, and `scripts/build.ts` promotes neutral artifacts plus framework outputs plus manifest in one transaction.

For `--captions-only` and `regroup`:

- do not stage or promote `bindingManifestPath`;
- do not recompute plan/source digests as fresh semantic evidence;
- preserve existing manifest bytes;
- update only caption-owned artifacts;
- for Remotion, preserve existing generated semantic `visualBindings` in output `build_plan.json` while replacing caption groups, rather than resolving the authored registry again.

Use an explicit merge in Remotion captions-only emission:

```ts
const existingOutputPlan = readExistingOutputPlan(outputDir);
const captionsOnlyPlan = {
  ...existingOutputPlan,
  captionGroups: plan.captionGroups,
};
writeFileSync(
  join(stagingRoot, "build_plan.json"),
  `${JSON.stringify(captionsOnlyPlan, null, 2)}\n`,
);
```

If no existing full-build output exists, captions-only remains unable to create semantic evidence; verification requires a later full build.

- [ ] **Step 4: Run workflow and type gates**

Run:

```bash
node --test test/cli/workflows.test.ts
corepack npm run typecheck
corepack npm run typecheck:remotion
```

Expected: PASS. Captions-only operations never bless semantic mutations, and full builds replace plan/evidence atomically.

- [ ] **Step 5: Commit**

```bash
git add scripts/build.ts scripts/regroup.ts frameworks/hyperframes/emit.ts frameworks/remotion/emit.ts test/cli/workflows.test.ts
git commit -m "fix(build): preserve semantic evidence freshness"
```

## Part 2 Completion Gate

Run:

```bash
corepack npm run typecheck
corepack npm run typecheck:remotion
node --test \
  engine/__tests__/visual_evidence.test.ts \
  engine/__tests__/visual_sync.test.ts \
  test/cli/workflows.test.ts
git diff --check
```

Expected: all commands exit `0`; interval findings are quantitative, manifest v2 is exact and deterministic, stale evidence cannot pass, and only full builds publish semantic freshness.
