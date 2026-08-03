# Part 1 — Neutral Coverage Contract and Planning

Depends on: none. Complete this part before `2026-08-03-continuous-semantic-visual-coverage-plan-2.md`.

- [ ] **Task 1: Add v1/v2 coverage types and policy configuration** `[Group: neutral-coverage-contract]` `[Tester: yes]`

**Files:**
- Modify: `engine/types.ts:19-126`
- Modify: `engine/config.ts:46-48,120-149,182-192`
- Modify: `engine/plan.ts:27-34`
- Modify: `engine/__tests__/config.test.ts`
- Modify: `engine/__tests__/plan.test.ts`

- [ ] **Step 1: Write failing policy and compatibility tests**

Extend the existing `VALID_SYNC` fixture and add independent mode cases:

```ts
const VALID_SYNC = {
  mode: "required",
  coverageMode: "required",
  maxLead: 0.25,
  maxLag: 0.75,
  maxUncoveredGap: 0.5,
  minLanding: 1,
} as const;

test("visualSync accepts required reveal and coverage policy", () => {
  const config = validateVideoConfig(
    { visualSync: VALID_SYNC },
    "video.config.json",
  );
  assert.deepEqual(config.visualSync, VALID_SYNC);
});

for (const coverageMode of ["off", "warn", "required"] as const) {
  test(`visualSync accepts coverageMode=${coverageMode}`, () => {
    const config = validateVideoConfig(
      { visualSync: { coverageMode } },
      "video.config.json",
    );
    assert.equal(config.visualSync?.coverageMode, coverageMode);
  });
}

for (const value of [-0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`visualSync rejects maxUncoveredGap=${String(value)}`, () => {
    assert.throws(
      () => validateVideoConfig(
        { visualSync: { maxUncoveredGap: value } },
        "video.config.json",
      ),
      /visualSync\.maxUncoveredGap.*finite non-negative/,
    );
  });
}

test("visualSync accepts a zero uncovered-gap threshold", () => {
  const config = validateVideoConfig(
    { visualSync: { maxUncoveredGap: 0 } },
    "video.config.json",
  );
  assert.equal(config.visualSync?.maxUncoveredGap, 0);
});
```

In `engine/__tests__/plan.test.ts`, add policy-resolution cases:

```ts
test("legacy visual coverage defaults to warn", () => {
  assert.deepEqual(resolveVisualSyncPolicy(CONFIG), {
    mode: "warn",
    coverageMode: "warn",
    maxLead: 0.25,
    maxLag: 0.75,
    maxUncoveredGap: 0.5,
    minLanding: 1,
  });
});

test("coverage planning remains enabled when reveal timing is off", () => {
  const policy = resolveVisualSyncPolicy({
    ...CONFIG,
    visualSync: { mode: "off", coverageMode: "required" },
  });
  assert.equal(policy.mode, "off");
  assert.equal(policy.coverageMode, "required");
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
node --test engine/__tests__/config.test.ts engine/__tests__/plan.test.ts
```

Expected: FAIL because `coverageMode`, `maxUncoveredGap`, and their resolved defaults do not exist.

- [ ] **Step 3: Add explicit v1/v2 authored and resolved type unions**

Replace the single-version visual contract in `engine/types.ts` with additive unions while retaining existing public aliases used by callers:

```ts
export type VisualSyncMode = "off" | "warn" | "required";
export type VisualCoverageMode = "off" | "warn" | "required";
export type VisualSemanticRole = "focal" | "supporting";

export interface VisualBeatTolerance {
  maxLead: number;
  maxLag: number;
}

export type VisualCueAnchorV1 =
  | { wordIndex: number }
  | { phrase: string; occurrence: number };

export type VisualCueAnchorV2 =
  | { frameStart: true }
  | VisualCueAnchorV1;

export type VisualCoverageEnd =
  | "next-state"
  | "voice-end"
  | "frame-end"
  | { cue: VisualCueAnchorV2 };

export interface AuthoredVisualBeatV1 {
  id: string;
  text: string;
  cue: VisualCueAnchorV1;
  sourceRefs?: string[];
  workflowStep?: number;
  tolerance?: Partial<VisualBeatTolerance>;
}

export interface AuthoredVisualBeatV2 {
  id: string;
  text: string;
  role: VisualSemanticRole;
  cue: VisualCueAnchorV2;
  coverage?: { until?: VisualCoverageEnd };
  sourceRefs?: string[];
  workflowStep?: number;
  tolerance?: Partial<VisualBeatTolerance>;
}

export interface AuthoredCoverageExemption {
  id: string;
  from: VisualCueAnchorV2;
  until: VisualCoverageEnd;
  reason: string;
  approvedBy: string;
}

export interface AuthoredVisualFrameV1 {
  kind?: "focal" | "workflow" | "comparison" | "sequence";
  beats: AuthoredVisualBeatV1[];
}

export interface AuthoredVisualFrameV2 {
  kind?: AuthoredVisualFrameV1["kind"];
  beats: AuthoredVisualBeatV2[];
  coverageExemptions?: AuthoredCoverageExemption[];
}

export interface VisualBeatSpecV1 {
  version: 1;
  frames: Record<string, AuthoredVisualFrameV1>;
}

export interface VisualBeatSpecV2 {
  version: 2;
  frames: Record<string, AuthoredVisualFrameV2>;
}

export type VisualBeatSpec = VisualBeatSpecV1 | VisualBeatSpecV2;
export type VisualCueAnchor = VisualCueAnchorV1 | VisualCueAnchorV2;

export interface ResolvedVisualBeatV1 {
  version: 1;
  id: string;
  text: string;
  start: number;
  end?: number;
  cueWordIndex: number;
  cueText: string;
  sourceRefs: string[];
  workflowStep?: number;
  tolerance: VisualBeatTolerance;
}

export interface ResolvedVisualStateV2 {
  version: 2;
  id: string;
  text: string;
  role: VisualSemanticRole;
  start: number;
  end: number;
  cueWordIndex?: number;
  cueText: string;
  sourceRefs: string[];
  workflowStep?: number;
  tolerance: VisualBeatTolerance;
}

export interface ResolvedCoverageExemption {
  id: string;
  start: number;
  end: number;
  reason: string;
  approvedBy: string;
}

export type ResolvedVisualBeat =
  | ResolvedVisualBeatV1
  | ResolvedVisualStateV2;
```

Extend `PlanFrame` additively:

```ts
export interface PlanFrame {
  id: string;
  frameNum: number;
  slug: string;
  voicePath: string;
  voiceDur: number;
  frameDur: number;
  start: number;
  words: Word[];
  visualSpecVersion?: 1 | 2;
  visualKind?: AuthoredVisualFrameV1["kind"];
  visualBeats?: ResolvedVisualBeat[];
  visualCoverageExemptions?: ResolvedCoverageExemption[];
}
```

`visualSpecVersion` preserves authored v1/v2 provenance even when a v2 frame has no focal state. Verification must not infer v2 participation from a non-empty `visualBeats` array.

Add coverage policy fields:

```ts
export interface VisualSyncConfig {
  mode?: VisualSyncMode;
  coverageMode?: VisualCoverageMode;
  maxLead?: number;
  maxLag?: number;
  maxUncoveredGap?: number;
  minLanding?: number;
}

export interface ResolvedVisualSyncPolicy {
  mode: VisualSyncMode;
  coverageMode: VisualCoverageMode;
  maxLead: number;
  maxLag: number;
  maxUncoveredGap: number;
  minLanding: number;
}
```

Do not add `states` as an alternate serialized field. Do not assign v1 beats a synthetic focal role.

- [ ] **Step 4: Validate and resolve the new policy fields**

In `engine/config.ts`, reuse the existing mode and numeric validators:

```ts
const VISUAL_SYNC_MODES = new Set(["off", "warn", "required"]);

function optionalVisualMode(
  value: unknown,
  path: string,
): VisualSyncMode | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !VISUAL_SYNC_MODES.has(value)) {
    throw new Error(`${path} must be one of off, warn, required`);
  }
  return value as VisualSyncMode;
}
```

Add these exact assignments inside `validateVideoConfig`:

```ts
visualSync: visualSyncValue === undefined
  ? undefined
  : {
      mode: optionalVisualMode(
        visualSyncObject.mode,
        `${path}.visualSync.mode`,
      ),
      coverageMode: optionalVisualMode(
        visualSyncObject.coverageMode,
        `${path}.visualSync.coverageMode`,
      ),
      maxLead: optionalNonNegativeNumber(
        visualSyncObject.maxLead,
        `${path}.visualSync.maxLead`,
      ),
      maxLag: optionalNonNegativeNumber(
        visualSyncObject.maxLag,
        `${path}.visualSync.maxLag`,
      ),
      maxUncoveredGap: optionalNonNegativeNumber(
        visualSyncObject.maxUncoveredGap,
        `${path}.visualSync.maxUncoveredGap`,
      ),
      minLanding: optionalLandingSeconds(
        visualSyncObject.minLanding,
        `${path}.visualSync.minLanding`,
      ),
    },
```

Resolve defaults in `engine/plan.ts`:

```ts
export function resolveVisualSyncPolicy(
  config: VideoConfig,
): ResolvedVisualSyncPolicy {
  return {
    mode: config.visualSync?.mode ?? "warn",
    coverageMode: config.visualSync?.coverageMode ?? "warn",
    maxLead: config.visualSync?.maxLead ?? 0.25,
    maxLag: config.visualSync?.maxLag ?? 0.75,
    maxUncoveredGap: config.visualSync?.maxUncoveredGap ?? 0.5,
    minLanding: config.visualSync?.minLanding ?? 1,
  };
}
```

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
node --test engine/__tests__/config.test.ts engine/__tests__/plan.test.ts
corepack npm run typecheck
```

Expected: PASS. Existing v1 callers compile through the explicit unions, and no runtime empty properties are added to legacy plan frames.

- [ ] **Step 6: Commit**

```bash
git add engine/types.ts engine/config.ts engine/plan.ts engine/__tests__/config.test.ts engine/__tests__/plan.test.ts
git commit -m "feat(engine): add semantic coverage contracts"
```

---

- [ ] **Task 2: Parse strict visual-beats v2 input** `[Group: neutral-coverage-contract]` `[Tester: yes]`

**Files:**
- Modify: `engine/visual_beats.ts:23-207`
- Modify: `engine/__tests__/visual_beats.test.ts`

- [ ] **Step 1: Add failing exact-shape parser tests**

Add a valid v2 fixture:

```ts
const V2_SPEC = {
  version: 2,
  frames: {
    "reserve-flow": {
      kind: "workflow",
      beats: [
        {
          id: "opening",
          text: "Reserve before external work",
          role: "focal",
          cue: { frameStart: true },
          coverage: { until: "next-state" },
          workflowStep: 1,
        },
        {
          id: "execute",
          text: "Execute the operation",
          role: "focal",
          cue: { phrase: "execute", occurrence: 1 },
          coverage: { until: "frame-end" },
          workflowStep: 2,
        },
      ],
      coverageExemptions: [],
    },
  },
} as const;

test("accepts strict visual-beats v2 coverage input", () => {
  const result = validateVisualBeatSpec(V2_SPEC, "visual_beats.json");
  assert.equal(result.version, 2);
  assert.deepEqual(result.frames["reserve-flow"], V2_SPEC.frames["reserve-flow"]);
});
```

Add table-driven malformed cases:

```ts
for (const [name, mutate, pattern] of [
  [
    "states alias",
    () => ({ version: 2, frames: { "reserve-flow": { states: [] } } }),
    /frames\.reserve-flow\.states.*unknown/,
  ],
  [
    "false frame-start",
    () => ({
      ...V2_SPEC,
      frames: {
        "reserve-flow": {
          ...V2_SPEC.frames["reserve-flow"],
          beats: [{ ...V2_SPEC.frames["reserve-flow"].beats[0], cue: { frameStart: false } }],
        },
      },
    }),
    /cue\.frameStart.*true/,
  ],
  [
    "mixed cue branches",
    () => ({
      ...V2_SPEC,
      frames: {
        "reserve-flow": {
          ...V2_SPEC.frames["reserve-flow"],
          beats: [{
            ...V2_SPEC.frames["reserve-flow"].beats[0],
            cue: { frameStart: true, wordIndex: 0 },
          }],
        },
      },
    }),
    /cue.*exactly one/,
  ],
  [
    "invalid role",
    () => ({
      ...V2_SPEC,
      frames: {
        "reserve-flow": {
          ...V2_SPEC.frames["reserve-flow"],
          beats: [{ ...V2_SPEC.frames["reserve-flow"].beats[0], role: "shell" }],
        },
      },
    }),
    /role.*focal.*supporting/,
  ],
] as const) {
  test(`rejects v2 ${name}`, () => {
    assert.throws(
      () => validateVisualBeatSpec(mutate(), "visual_beats.json"),
      pattern,
    );
  });
}
```

Add exemption validation:

```ts
test("rejects an exemption without review metadata", () => {
  const value = structuredClone(V2_SPEC) as Record<string, unknown>;
  const frame = (value.frames as Record<string, Record<string, unknown>>)["reserve-flow"];
  frame.coverageExemptions = [{
    id: "pause",
    from: { wordIndex: 1 },
    until: "voice-end",
    reason: "Intentional audio-only pause",
  }];
  assert.throws(
    () => validateVisualBeatSpec(value, "visual_beats.json"),
    /coverageExemptions\[0\]\.approvedBy/,
  );
});
```

Add a v2 parser case proving `beats: []` is structurally valid so policy-aware planning can error in required mode or preserve v2 provenance for warn-mode diagnostics. Retain the v1 non-empty-beat rule and all existing v1 parser tests unchanged.

- [ ] **Step 2: Run the parser tests and confirm failure**

Run:

```bash
node --test engine/__tests__/visual_beats.test.ts
```

Expected: FAIL because only version 1, word-index cues, phrase cues, and v1 beat fields are accepted.

- [ ] **Step 3: Add exact v2 validators**

Define exact field sets next to the current v1 constants:

```ts
const V2_FRAME_FIELDS = new Set([
  "kind",
  "beats",
  "coverageExemptions",
]);
const V2_BEAT_FIELDS = new Set([
  "id",
  "text",
  "role",
  "cue",
  "coverage",
  "sourceRefs",
  "workflowStep",
  "tolerance",
]);
const V2_COVERAGE_FIELDS = new Set(["until"]);
const V2_EXEMPTION_FIELDS = new Set([
  "id",
  "from",
  "until",
  "reason",
  "approvedBy",
]);
```

Add a strict v2 cue validator:

```ts
function validateCueV2(value: unknown, path: string): VisualCueAnchorV2 {
  const object = requireObject(value, path);
  const keys = Object.keys(object);
  if (keys.length !== 1) {
    throw new Error(`${path} must contain exactly one cue branch`);
  }
  if (Object.hasOwn(object, "frameStart")) {
    if (object.frameStart !== true) {
      throw new Error(`${path}.frameStart must be true`);
    }
    return { frameStart: true };
  }
  return validateCueV1(object, path);
}
```

Add coverage-end validation:

```ts
function validateCoverageEnd(
  value: unknown,
  path: string,
): VisualCoverageEnd {
  if (
    value === "next-state"
    || value === "voice-end"
    || value === "frame-end"
  ) {
    return value;
  }
  const object = requireObject(value, path);
  rejectUnknownFields(object, new Set(["cue"]), path);
  if (!Object.hasOwn(object, "cue")) {
    throw new Error(`${path}.cue is required`);
  }
  return { cue: validateCueV2(object.cue, `${path}.cue`) };
}
```

Branch at the top-level version:

```ts
export function validateVisualBeatSpec(
  value: unknown,
  path: string,
): VisualBeatSpec {
  const object = requireObject(value, path);
  rejectUnknownFields(object, new Set(["version", "frames"]), path);
  if (object.version === 1) return validateV1Spec(object, path);
  if (object.version === 2) return validateV2Spec(object, path);
  throw new Error(`${path}.version must be 1 or 2`);
}
```

Validate non-empty `text`, `role`, `coverage`, and exemptions with the existing path-qualified error style. Preserve prototype-like frame slugs and the existing v1 behavior.

- [ ] **Step 4: Run parser tests**

Run:

```bash
node --test engine/__tests__/visual_beats.test.ts
```

Expected: PASS for strict v1 and v2 input; unknown fields and mixed cue branches fail with exact paths.

- [ ] **Step 5: Commit**

```bash
git add engine/visual_beats.ts engine/__tests__/visual_beats.test.ts
git commit -m "feat(engine): parse visual coverage v2"
```

---

- [ ] **Task 3: Resolve semantic intervals, exemptions, and frame completeness** `[Group: neutral-coverage-contract]` `[Tester: yes]`

**Files:**
- Modify: `engine/visual_beats.ts:209-363`
- Modify: `engine/plan.ts:39-109`
- Modify: `engine/__tests__/visual_beats.test.ts`
- Modify: `engine/__tests__/plan.test.ts`

- [ ] **Step 1: Add failing interval-resolution tests**

Use a frame with real narration and landing time:

```ts
const COVERAGE_FRAME: PlanFrame = {
  id: "overview",
  frameNum: 1,
  slug: "reserve-flow",
  voicePath: "assets/voice/overview.wav",
  voiceDur: 18,
  frameDur: 19,
  start: 0,
  words: [
    { text: "First", start: 2.95, end: 3.2 },
    { text: "reserve", start: 3.21, end: 3.6 },
    { text: "execute", start: 11.06, end: 11.5 },
    { text: "Finally", start: 14.35, end: 14.8 },
  ],
};

const COVERAGE_POLICY = {
  mode: "required",
  coverageMode: "required",
  maxLead: 0.25,
  maxLag: 0.75,
  maxUncoveredGap: 0.5,
  minLanding: 1,
} as const;

test("resolves frame-start, next-state, and frame-end coverage", () => {
  const resolved = resolveVisualBeats(
    validateVisualBeatSpec(V2_SPEC, "visual_beats.json"),
    [COVERAGE_FRAME],
    COVERAGE_POLICY,
    "visual_beats.json",
  );
  assert.deepEqual(resolved.get("reserve-flow")?.visualBeats, [
    {
      version: 2,
      id: "opening",
      text: "Reserve before external work",
      role: "focal",
      start: 0,
      end: 11.06,
      cueText: "<frame-start>",
      sourceRefs: [],
      workflowStep: 1,
      tolerance: { maxLead: 0.25, maxLag: 0.75 },
    },
    {
      version: 2,
      id: "execute",
      text: "Execute the operation",
      role: "focal",
      start: 11.06,
      end: 19,
      cueWordIndex: 2,
      cueText: "execute",
      sourceRefs: [],
      workflowStep: 2,
      tolerance: { maxLead: 0.25, maxLag: 0.75 },
    },
  ]);
});
```

Add explicit endpoint and exemption tests:

```ts
test("resolves voice-end and cue-end coverage plus exemptions", () => {
  const spec = validateVisualBeatSpec({
    version: 2,
    frames: {
      "reserve-flow": {
        beats: [
          {
            id: "opening",
            text: "Opening",
            role: "focal",
            cue: { frameStart: true },
            coverage: { until: { cue: { wordIndex: 2 } } },
          },
          {
            id: "execute",
            text: "Execute",
            role: "focal",
            cue: { wordIndex: 2 },
            coverage: { until: "voice-end" },
          },
        ],
        coverageExemptions: [{
          id: "pause",
          from: { wordIndex: 1 },
          until: { cue: { wordIndex: 2 } },
          reason: "Intentional audio-only pause",
          approvedBy: "storyboard-review:42",
        }],
      },
    },
  }, "visual_beats.json");
  const frame = resolveVisualBeats(
    spec,
    [COVERAGE_FRAME],
    COVERAGE_POLICY,
    "visual_beats.json",
  ).get("reserve-flow");
  assert.deepEqual(frame?.visualBeats.map((beat) => [beat.start, beat.end]), [
    [0, 11.06],
    [11.06, 18],
  ]);
  assert.deepEqual(frame?.visualCoverageExemptions, [{
    id: "pause",
    start: 3.21,
    end: 11.06,
    reason: "Intentional audio-only pause",
    approvedBy: "storyboard-review:42",
  }]);
});
```

Add failures for inverted/out-of-frame ends and omitted narrated frames in required v2 coverage mode. Add required-mode failures for `beats: []` and supporting-only v2 frames. Add warn-mode cases proving those frames retain `visualSpecVersion: 2` so later verification reports their complete-frame gap instead of treating them as legacy. Add a pass case proving first speech at `2.95` is not forced to frame zero.

- [ ] **Step 2: Run resolver tests and confirm failure**

Run:

```bash
node --test engine/__tests__/visual_beats.test.ts engine/__tests__/plan.test.ts
```

Expected: FAIL because v2 starts, ends, exemptions, independent coverage enablement, and frame completeness are unresolved.

- [ ] **Step 3: Resolve v2 cues and endpoints deterministically**

Split the current cue resolver into v1/v2-compatible helpers:

```ts
function resolveCueV2(
  cue: VisualCueAnchorV2,
  frame: PlanFrame,
  path: string,
): { start: number; cueWordIndex?: number; cueText: string } {
  if ("frameStart" in cue) {
    return { start: 0, cueText: "<frame-start>" };
  }
  return resolveTranscriptCue(cue, frame, path);
}
```

Resolve v2 beats in two passes:

```ts
const starts = authored.beats.map((beat, index) => ({
  beat,
  resolved: resolveCueV2(
    beat.cue,
    frame,
    `${framePath}.beats[${index}].cue`,
  ),
}));

const visualBeats = starts.map(({ beat, resolved }, index) => {
  const defaultEnd = starts[index + 1]?.resolved.start ?? frame.frameDur;
  const end = resolveCoverageEnd(
    beat.coverage?.until,
    defaultEnd,
    frame,
    `${framePath}.beats[${index}].coverage.until`,
  );
  if (end < resolved.start || end > frame.frameDur) {
    throw new Error(
      `${framePath}.beats[${index}] resolves to invalid interval `
      + `${resolved.start.toFixed(3)}s-${end.toFixed(3)}s within frame `
      + `${frame.frameDur.toFixed(3)}s`,
    );
  }
  return {
    version: 2 as const,
    id: beat.id,
    text: beat.text,
    role: beat.role,
    start: resolved.start,
    end,
    ...(resolved.cueWordIndex === undefined
      ? {}
      : { cueWordIndex: resolved.cueWordIndex }),
    cueText: resolved.cueText,
    sourceRefs: beat.sourceRefs ?? [],
    ...(beat.workflowStep === undefined
      ? {}
      : { workflowStep: beat.workflowStep }),
    tolerance: mergeTolerance(defaults, beat.tolerance),
  };
});
```

Resolve exemptions with the same cue/end functions and reject inverted or out-of-frame intervals.

- [ ] **Step 4: Enforce independent planning and narrated-frame completeness**

In `engine/plan.ts`, replace the reveal-only condition:

```ts
const visualPlanningEnabled =
  policy.mode !== "off" || policy.coverageMode !== "off";
```

When `spec.version === 2 && policy.coverageMode === "required"`, require every narrated frame to have a v2 entry with at least one focal beat:

```ts
for (const frame of frames) {
  if (frame.words.length === 0) continue;
  const authoredFrame = spec.frames[frame.slug];
  if (!authoredFrame) {
    throw new Error(
      `${path}.frames is missing narrated frame "${frame.slug}" `
      + `required by visualSync.coverageMode=required`,
    );
  }
  if (!authoredFrame.beats.some((beat) => beat.role === "focal")) {
    throw new Error(
      `${path}.frames.${frame.slug}.beats must contain at least one `
      + `focal beat required by visualSync.coverageMode=required`,
    );
  }
}
```

Return `visualSpecVersion: spec.version` for every authored frame and attach it to `PlanFrame` even when the resolved beat list is empty or supporting-only in warn mode. Attach `visualCoverageExemptions` only when non-empty, preserving unrelated legacy serialized shape.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test engine/__tests__/visual_beats.test.ts engine/__tests__/plan.test.ts
corepack npm run typecheck
```

Expected: PASS. v1 remains point-based; v2 resolves complete intervals and required-frame coverage.

- [ ] **Step 6: Commit**

```bash
git add engine/visual_beats.ts engine/plan.ts engine/__tests__/visual_beats.test.ts engine/__tests__/plan.test.ts
git commit -m "feat(engine): resolve semantic coverage intervals"
```

---

- [ ] **Task 4: Serialize v2 coverage through plan workflows** `[Group: neutral-coverage-contract]` `[Tester: yes]`

**Files:**
- Modify: `scripts/plan_project.ts:30-44,89-170`
- Modify: `scripts/plan.ts:13-58`
- Modify: `test/cli/plan-project.test.ts`
- Modify: `test/cli/plan.test.ts`
- Modify: `test/cli/workflows.test.ts`

- [ ] **Step 1: Write failing projection and transaction tests**

Add a v2 `PLAN_WITH_COVERAGE` fixture and assert the version-2 projection exactly:

```ts
test("serializes deterministic visual coverage timing", () => {
  const serialized = serializeNeutralArtifacts(PLAN_WITH_COVERAGE);
  assert.deepEqual(JSON.parse(serialized.visualTiming), {
    version: 2,
    frames: {
      "reserve-flow": {
        voiceDuration: 18,
        frameDuration: 19,
        requiredCoverage: { start: 2.95, end: 19 },
        kind: "workflow",
        beats: [
          {
            id: "opening",
            role: "focal",
            start: 0,
            end: 11.06,
            workflowStep: 1,
          },
          {
            id: "execute",
            role: "focal",
            start: 11.06,
            end: 19,
            workflowStep: 2,
          },
        ],
        coverageExemptions: [],
      },
    },
  });
});
```

Add plan CLI cases proving:

- flat and canonical projects write identical v2 coverage projections;
- malformed v2 leaves all four prior neutral files unchanged;
- `mode: "off", coverageMode: "required"` still loads and resolves v2;
- both modes off ignore malformed visual beats;
- v1 warn projects retain the current warning and projection behavior.

Use the existing temporary-directory and transaction rollback helpers; snapshot previous bytes before invoking `run()` and deep-compare after expected failure.

- [ ] **Step 2: Run focused CLI tests and confirm failure**

Run:

```bash
node --test test/cli/plan-project.test.ts test/cli/plan.test.ts test/cli/workflows.test.ts
```

Expected: FAIL because `visual_timing.json` is version 1 and planning conditions use reveal mode only.

- [ ] **Step 3: Serialize v1 or v2 from the resolved plan**

In `serializeNeutralArtifacts`, detect v2 content without changing `BuildPlan.version`:

```ts
const hasCoverageV2 = plan.frames.some((frame) =>
  frame.visualSpecVersion === 2
);

const visualTiming = hasCoverageV2
  ? {
      version: 2,
      frames: Object.fromEntries(
        plan.frames
          .filter((frame) => frame.visualSpecVersion === 2)
          .map((frame) => [
            frame.slug,
            {
              visualSpecVersion: 2,
              voiceDuration: frame.voiceDur,
              frameDuration: frame.frameDur,
              requiredCoverage: {
                start: frame.words[0].start,
                end: frame.frameDur,
              },
              ...(frame.visualKind === undefined
                ? {}
                : { kind: frame.visualKind }),
              beats: frame.visualBeats
                ?.filter((beat) => beat.version === 2)
                .map((beat) => ({
                  id: beat.id,
                  role: beat.role,
                  start: beat.start,
                  end: beat.end,
                  ...(beat.workflowStep === undefined
                    ? {}
                    : { workflowStep: beat.workflowStep }),
                })),
              coverageExemptions: frame.visualCoverageExemptions ?? [],
            },
          ]),
      ),
    }
  : serializeVisualTimingV1(plan);
```

Keep the existing deterministic `JSON.stringify(..., null, 2) + "\n"` formatting and current four-file transaction.

- [ ] **Step 4: Make project planning coverage-aware**

In `createProjectPlan`, use:

```ts
const visualPlanningEnabled =
  policy.mode !== "off" || policy.coverageMode !== "off";
```

Required-file behavior:

```ts
if (
  !visualSpec
  && (policy.mode === "required" || policy.coverageMode === "required")
) {
  throw new Error(
    `${visualBeatsPath}: required by visualSync policy`,
  );
}
```

Warn once when planning is enabled but the file is absent. Do not duplicate reveal and coverage warnings.

- [ ] **Step 5: Run focused and full neutral gates**

Run:

```bash
node --test \
  engine/__tests__/config.test.ts \
  engine/__tests__/visual_beats.test.ts \
  engine/__tests__/plan.test.ts \
  test/cli/plan-project.test.ts \
  test/cli/plan.test.ts \
  test/cli/workflows.test.ts
corepack npm run typecheck
```

Expected: PASS. Planning remains transactional and does not modify framework outputs.

- [ ] **Step 6: Commit**

```bash
git add scripts/plan_project.ts scripts/plan.ts test/cli/plan-project.test.ts test/cli/plan.test.ts test/cli/workflows.test.ts
git commit -m "feat(plan): serialize visual coverage timing"
```

## Part 1 Completion Gate

Run:

```bash
corepack npm run typecheck
node --test \
  engine/__tests__/config.test.ts \
  engine/__tests__/visual_beats.test.ts \
  engine/__tests__/plan.test.ts \
  test/cli/plan-project.test.ts \
  test/cli/plan.test.ts \
  test/cli/workflows.test.ts
git diff --check
```

Expected: all commands exit `0`; v1 behavior remains compatible, v2 intervals are deterministic, and neutral writes remain atomic.
