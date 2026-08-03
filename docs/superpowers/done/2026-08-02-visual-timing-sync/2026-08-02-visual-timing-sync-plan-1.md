# Part 1 — Neutral Beat Contract and Cue Resolution

Depends on: none. Complete this part before `2026-08-02-visual-timing-sync-plan-2.md`.

- [ ] **Task 1: Add neutral visual timing and policy types** `[Group: neutral-beat-contract]` `[Tester: yes]`

**Files:**
- Modify: `engine/types.ts:18-112`
- Modify: `engine/config.ts:117-236`
- Modify: `engine/__tests__/config.test.ts`
- Modify: `engine/__tests__/plan.test.ts`

- [ ] **Step 1: Write failing configuration and legacy-shape tests**

Add focused cases asserting accepted defaults and malformed values:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { validateVideoConfig } from "../config.ts";

const VALID_SYNC = {
  mode: "required",
  maxLead: 0.25,
  maxLag: 0.75,
  minLanding: 1,
} as const;

test("visualSync accepts the required policy", () => {
  const config = validateVideoConfig({ visualSync: VALID_SYNC }, "video.config.json");
  assert.deepEqual(config.visualSync, VALID_SYNC);
});

for (const [field, value] of [
  ["maxLead", -0.01],
  ["maxLag", Number.NaN],
  ["minLanding", Number.POSITIVE_INFINITY],
] as const) {
  test(`visualSync rejects ${field}=${String(value)}`, () => {
    assert.throws(
      () => validateVideoConfig({ visualSync: { ...VALID_SYNC, [field]: value } }, "video.config.json"),
      new RegExp(`visualSync\\.${field}`),
    );
  });
}

for (const minLanding of [0, 0.49]) {
  test(`visualSync rejects minLanding=${minLanding} below the standards floor`, () => {
    assert.throws(
      () => validateVideoConfig({ visualSync: { ...VALID_SYNC, minLanding } }, "video.config.json"),
      /visualSync\.minLanding.*>= 0\.5/,
    );
  });
}

test("render policy accepts explicit final defaults", () => {
  const config = validateVideoConfig({
    render: { profile: "final", fps: 30, minimumFinalFps: 24 },
  }, "output.config.json");
  assert.deepEqual(config.render, { profile: "final", fps: 30, minimumFinalFps: 24 });
});

for (const minimumFinalFps of [1, 23]) {
  test(`render policy rejects minimumFinalFps=${minimumFinalFps} below 24`, () => {
    assert.throws(
      () => validateVideoConfig({ render: { minimumFinalFps } }, "output.config.json"),
      /render\.minimumFinalFps.*>= 24/,
    );
  });
}

test("render policy accepts a stricter 30 fps minimum", () => {
  const config = validateVideoConfig({ render: { minimumFinalFps: 30 } }, "output.config.json");
  assert.equal(config.render?.minimumFinalFps, 30);
});
```

In `engine/__tests__/plan.test.ts`, add a legacy assertion:

```ts
test("legacy frames omit optional visual timing fields", () => {
  const result = plan(META, CONFIG);
  assert.equal(Object.hasOwn(result.frames[0], "visualKind"), false);
  assert.equal(Object.hasOwn(result.frames[0], "visualBeats"), false);
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
node --test engine/__tests__/config.test.ts engine/__tests__/plan.test.ts
```

Expected: FAIL because `VideoConfig`/validation do not support `visualSync` or `render` yet.

- [ ] **Step 3: Add the additive neutral types**

Add to `engine/types.ts`:

```ts
export type VisualSyncMode = "off" | "warn" | "required";
export type RenderProfile = "final" | "draft" | "gif";

export interface VisualBeatTolerance {
  maxLead: number;
  maxLag: number;
}

export type VisualCueAnchor =
  | { wordIndex: number }
  | { phrase: string; occurrence: number };

export interface AuthoredVisualBeat {
  id: string;
  text: string;
  cue: VisualCueAnchor;
  sourceRefs?: string[];
  workflowStep?: number;
  tolerance?: Partial<VisualBeatTolerance>;
}

export interface AuthoredVisualFrame {
  kind?: "focal" | "workflow" | "comparison" | "sequence";
  beats: AuthoredVisualBeat[];
}

export interface VisualBeatSpec {
  version: 1;
  frames: Record<string, AuthoredVisualFrame>;
}

export interface ResolvedVisualBeat {
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

export interface VisualSyncConfig {
  mode?: VisualSyncMode;
  maxLead?: number;
  maxLag?: number;
  minLanding?: number;
}

export interface ResolvedVisualSyncPolicy {
  mode: VisualSyncMode;
  maxLead: number;
  maxLag: number;
  minLanding: number;
}

export interface RenderConfig {
  profile?: RenderProfile;
  fps?: number;
  minimumFinalFps?: number;
}
```

Extend existing interfaces without adding empty properties at runtime:

```ts
export interface PlanFrame {
  id: string; frameNum: number; slug: string;
  voicePath: string; voiceDur: number; frameDur: number;
  start: number; words: Word[];
  visualKind?: AuthoredVisualFrame["kind"];
  visualBeats?: ResolvedVisualBeat[];
}

// Add these optional fields to the existing VideoConfig interface.
visualSync?: VisualSyncConfig;
render?: RenderConfig;
```

- [ ] **Step 4: Validate configuration values without resolving scaffold/legacy defaults here**

Extend `engine/config.ts` using the existing path-qualified validator style:

```ts
const VISUAL_SYNC_MODES = new Set(["off", "warn", "required"]);
const RENDER_PROFILES = new Set(["final", "draft", "gif"]);

function optionalNonNegativeNumber(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a finite non-negative number`);
  }
  return value;
}

function optionalPositiveNumber(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a finite positive number`);
  }
  return value;
}

function optionalLandingSeconds(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0.5) {
    throw new Error(`${path} must be a finite number >= 0.5`);
  }
  return value;
}

function optionalMinimumFinalFps(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 24) {
    throw new Error(`${path} must be a finite number >= 24`);
  }
  return value;
}
```

Use `optionalLandingSeconds` for `visualSync.minLanding`, `optionalMinimumFinalFps` for `render.minimumFinalFps`, and `optionalPositiveNumber` for `render.fps`. Validate `visualSync` and `render` only when present, retaining all current neutral/local config behavior until Task 4 changes planning ownership.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test engine/__tests__/config.test.ts engine/__tests__/plan.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add engine/types.ts engine/config.ts engine/__tests__/config.test.ts engine/__tests__/plan.test.ts
git commit -m "feat(engine): add visual timing contracts"
```

---

- [ ] **Task 2: Parse and resolve authored visual beats** `[Group: neutral-beat-contract]` `[Tester: yes]`

**Files:**
- Create: `engine/visual_beats.ts`
- Create: `engine/__tests__/visual_beats.test.ts`

- [ ] **Step 1: Write parser and resolver tests first**

Create fixtures directly in the test so failures identify one behavior at a time:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { PlanFrame, VisualBeatSpec } from "../types.ts";
import { resolveVisualBeats, validateVisualBeatSpec } from "../visual_beats.ts";

const FRAME: PlanFrame = {
  id: "voice-1",
  frameNum: 1,
  slug: "reserve-flow",
  voicePath: "assets/voice/voice-1.wav",
  voiceDur: 18,
  frameDur: 18,
  start: 0,
  words: [
    { text: "First", start: 2.95, end: 3.2 },
    { text: "reserve", start: 3.21, end: 3.6 },
    { text: "execute", start: 11.06, end: 11.5 },
    { text: "Finally", start: 14.35, end: 14.8 },
  ],
};

const POLICY = { mode: "required", maxLead: 0.25, maxLag: 0.75, minLanding: 1 } as const;

test("resolves word index and phrase occurrence to original word timing", () => {
  const spec: VisualBeatSpec = {
    version: 1,
    frames: {
      "reserve-flow": {
        kind: "workflow",
        beats: [
          { id: "reserve", text: "Reserve", cue: { phrase: "first reserve", occurrence: 1 }, workflowStep: 1 },
          { id: "execute", text: "Execute", cue: { wordIndex: 2 }, workflowStep: 2 },
          { id: "settle", text: "Settle", cue: { phrase: "finally", occurrence: 1 }, workflowStep: 3 },
        ],
      },
    },
  };
  const resolved = resolveVisualBeats(spec, [FRAME], POLICY, "visual_beats.json");
  assert.deepEqual(resolved.get("reserve-flow")?.visualBeats.map((beat) => [beat.id, beat.start]), [
    ["reserve", 2.95],
    ["execute", 11.06],
    ["settle", 14.35],
  ]);
});

test("normalizes NFKC punctuation while preserving original cue word index", () => {
  const frame = {
    ...FRAME,
    words: [
      { text: "Settle—once", start: 4, end: 4.5 },
      { text: "safely.", start: 4.6, end: 5 },
    ],
  };
  const spec = validateVisualBeatSpec({
    version: 1,
    frames: {
      "reserve-flow": { beats: [{ id: "settle", text: "Settle", cue: { phrase: "settle once safely", occurrence: 1 } }] },
    },
  }, "visual_beats.json");
  const [beat] = resolveVisualBeats(spec, [frame], POLICY).get("reserve-flow")!.visualBeats;
  assert.equal(beat.cueWordIndex, 0);
  assert.equal(beat.cueText, "Settle—once safely.");
});
```

Add a default-Unicode casing regression using transcript words `I`, `İ`, and `ı`: normalized phrase `i` occurrence 1 resolves `I`, occurrence 2 resolves `İ`, and phrase `ı` resolves the dotless word. This documents locale-independent `toLowerCase()` behavior and prevents a future switch to locale-sensitive casing.

Add separate `assert.throws` cases for malformed top-level shape, version, unknown slug, duplicate ID, missing phrase, repeated phrase without a valid occurrence, out-of-range word index, invalid source refs, negative tolerance, duplicate/missing workflow steps, and workflow cue times that are not monotonic.

- [ ] **Step 2: Run the new tests and confirm module failure**

Run:

```bash
node --test engine/__tests__/visual_beats.test.ts
```

Expected: FAIL because `engine/visual_beats.ts` does not exist.

- [ ] **Step 3: Implement structural validation**

Create `engine/visual_beats.ts` using the path-qualified style from `engine/audio_meta.ts`:

```ts
import { readFileSync } from "node:fs";
import type {
  AuthoredVisualBeat,
  AuthoredVisualFrame,
  PlanFrame,
  ResolvedVisualBeat,
  ResolvedVisualSyncPolicy,
  VisualBeatSpec,
} from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

export function validateVisualBeatSpec(value: unknown, path: string): VisualBeatSpec {
  if (!isRecord(value)) fail(path, "expected an object");
  if (value.version !== 1) fail(`${path}.version`, "expected 1");
  if (!isRecord(value.frames)) fail(`${path}.frames`, "expected an object");

  const frames: Record<string, AuthoredVisualFrame> = {};
  for (const [slug, frameValue] of Object.entries(value.frames)) {
    frames[slug] = validateFrame(frameValue, `${path}.frames.${slug}`);
  }
  return { version: 1, frames };
}

export function readVisualBeatSpec(path: string): VisualBeatSpec {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path}: invalid JSON: ${(error as Error).message}`);
  }
  return validateVisualBeatSpec(value, path);
}
```

Implement `validateFrame()`/`validateBeat()` with exact union-branch checks and stable diagnostics. Reject an object containing both `wordIndex` and `phrase`, or neither.

- [ ] **Step 4: Implement token-to-word-preserving normalization and resolution**

Use an internal token map so punctuation splitting never loses the original word index:

```ts
interface NormalizedToken {
  token: string;
  wordIndex: number;
}

function normalizedTokens(words: readonly PlanFrame["words"][number][]): NormalizedToken[] {
  return words.flatMap((word, wordIndex) =>
    word.text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[‐‑‒–—]/g, "-")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => ({ token, wordIndex })),
  );
}
```

Export the resolver:

```ts
export function resolveVisualBeats(
  spec: VisualBeatSpec,
  frames: readonly PlanFrame[],
  defaults: ResolvedVisualSyncPolicy,
  path = "visual_beats.json",
): Map<string, { visualKind?: AuthoredVisualFrame["kind"]; visualBeats: ResolvedVisualBeat[] }> {
  const bySlug = new Map(frames.map((frame) => [frame.slug, frame]));
  const resolved = new Map<string, { visualKind?: AuthoredVisualFrame["kind"]; visualBeats: ResolvedVisualBeat[] }>();
  for (const [slug, authored] of Object.entries(spec.frames)) {
    const frame = bySlug.get(slug) ?? fail(`${path}.frames.${slug}`, "unknown frame slug");
    const visualBeats = authored.beats.map((beat, index) => resolveBeat(beat, frame, defaults, `${path}.frames.${slug}.beats[${index}]`));
    validateWorkflowOrder(visualBeats, `${path}.frames.${slug}`);
    resolved.set(slug, { ...(authored.kind === undefined ? {} : { visualKind: authored.kind }), visualBeats });
  }
  return resolved;
}
```

Default tolerance comes from `maxLead`/`maxLag`; per-beat values override only the supplied key. Reconstruct `cueText` from original words spanning the matched first/last original word indexes.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test engine/__tests__/visual_beats.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add engine/visual_beats.ts engine/__tests__/visual_beats.test.ts
git commit -m "feat(engine): resolve narration visual beats"
```

---

- [ ] **Task 3: Attach resolved beats to the neutral plan** `[Group: neutral-beat-contract]` `[Tester: yes]`

**Files:**
- Modify: `engine/plan.ts:13-110`
- Modify: `engine/__tests__/plan.test.ts`

- [ ] **Step 1: Write failing additive-plan tests**

Add a test that passes a visual spec as the optional third argument:

```ts
test("plan attaches resolved visual beats by frame slug", () => {
  const result = plan(META, CONFIG, {
    version: 1,
    frames: {
      intro: {
        kind: "workflow",
        beats: [{ id: "first", text: "First", cue: { wordIndex: 0 }, workflowStep: 1 }],
      },
    },
  });
  assert.equal(result.frames[0].visualKind, "workflow");
  assert.equal(result.frames[0].visualBeats?.[0].id, "first");
  assert.equal(result.frames[0].visualBeats?.[0].start, META.voices[0].words[0].start);
});

test("plan mode off ignores supplied beat data and omits visual fields", () => {
  const result = plan(META, { ...CONFIG, visualSync: { mode: "off" } }, {
    version: 1,
    frames: { intro: { beats: [{ id: "ignored", text: "Ignored", cue: { wordIndex: 0 } }] } },
  });
  assert.equal(Object.hasOwn(result.frames[0], "visualBeats"), false);
});
```

Also assert default policy resolution:

```ts
assert.deepEqual(resolveVisualSyncPolicy({}), {
  mode: "warn",
  maxLead: 0.25,
  maxLag: 0.75,
  minLanding: 1,
});
```

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
node --test engine/__tests__/plan.test.ts
```

Expected: FAIL because `plan()` accepts two arguments and no policy resolver exists.

- [ ] **Step 3: Add one policy resolver and optional plan argument**

In `engine/plan.ts`:

```ts
import { resolveVisualBeats } from "./visual_beats.ts";
import type { ResolvedVisualSyncPolicy, VisualBeatSpec } from "./types.ts";

export function resolveVisualSyncPolicy(config: VideoConfig): ResolvedVisualSyncPolicy {
  return {
    mode: config.visualSync?.mode ?? "warn",
    maxLead: config.visualSync?.maxLead ?? 0.25,
    maxLag: config.visualSync?.maxLag ?? 0.75,
    minLanding: config.visualSync?.minLanding ?? 1,
  };
}

export function plan(
  meta: AudioMeta,
  config: VideoConfig,
  visualBeats?: VisualBeatSpec,
): BuildPlan
```

After creating `frames` and before returning:

```ts
const policy = resolveVisualSyncPolicy(config);
if (visualBeats && policy.mode !== "off") {
  const bySlug = resolveVisualBeats(visualBeats, frames, policy);
  for (const frame of frames) {
    const visual = bySlug.get(frame.slug);
    if (!visual) continue;
    if (visual.visualKind !== undefined) frame.visualKind = visual.visualKind;
    frame.visualBeats = visual.visualBeats;
  }
}
```

Do not set empty arrays on legacy frames.

- [ ] **Step 4: Run all neutral tests**

Run:

```bash
node --test \
  engine/__tests__/visual_beats.test.ts \
  engine/__tests__/plan.test.ts \
  engine/__tests__/config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```bash
corepack npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add engine/plan.ts engine/__tests__/plan.test.ts
git commit -m "feat(engine): add visual beats to build plans"
```

## Part 1 Verification

Run:

```bash
node --test \
  engine/__tests__/visual_beats.test.ts \
  engine/__tests__/plan.test.ts \
  engine/__tests__/config.test.ts
corepack npm run typecheck
git diff --check
```

Expected: all commands exit `0`; the existing two-argument planner remains valid and legacy frames omit optional visual properties.
