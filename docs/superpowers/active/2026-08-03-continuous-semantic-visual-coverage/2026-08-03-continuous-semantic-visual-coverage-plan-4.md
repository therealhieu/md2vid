# Part 4 — Remotion Coverage Parity

Depends on: `2026-08-03-continuous-semantic-visual-coverage-plan-3.md`.

- [ ] **Task 12: Add Remotion registry-v2 interval evidence and freshness** `[Group: remotion-coverage]` `[Tester: yes]`

**Files:**
- Modify: `frameworks/remotion/visual_bindings.ts:6-160`
- Modify: `frameworks/remotion/timing.ts:1-31`
- Modify: `frameworks/remotion/emit.ts:34-103`
- Modify: `frameworks/remotion/index.ts:13-29`
- Modify: `frameworks/remotion/__tests__/emit.test.ts`
- Modify: `frameworks/remotion/__tests__/verify.test.ts`

- [ ] **Step 1: Write failing v2 registry, quantization, and freshness tests**

Use a v2 registry:

```json
{
  "version": 2,
  "frames": {
    "overview": [
      {
        "beat": "opening",
        "target": "OpeningContext",
        "enter": "none",
        "coverage": "planned"
      },
      {
        "beat": "solution",
        "target": "SolutionCard",
        "enter": "rise",
        "duration": 0.5,
        "coverage": "planned"
      }
    ]
  }
}
```

Add parser and emit assertions:

```ts
test("Remotion emits registry-v2 coverage evidence", () => {
  const result = preflightRemotionCoverageProject();
  const manifest = result.bindingManifest;
  assert.equal(manifest?.version, 2);
  assert.deepEqual(manifest?.bindings.map((binding) => ({
    beatId: binding.beatId,
    role: binding.role,
    coverageStart: binding.coverageStart,
    coverageEnd: binding.coverageEnd,
  })), [
    {
      beatId: "opening",
      role: "focal",
      coverageStart: 0,
      coverageEnd: 18.266666666666666,
    },
    {
      beatId: "solution",
      role: "focal",
      coverageStart: 18.266666666666666,
      coverageEnd: 23.066666666666666,
    },
  ]);
  assert.match(manifest?.planSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.deepEqual(manifest?.authoredInputs.map(({ path }) => path), [
    "src/Video.tsx",
    "src/VisualBeats.tsx",
    "src/types.ts",
    "visual_bindings.json",
  ]);
});
```

Use the actual sorted source set created by the test fixture; include every relevant `.ts`, `.tsx`, `.js`, and `.jsx` file.

Add tests proving:

- v1 registry remains accepted in compatibility mode;
- v2 exact fields reject unknown `role` input because role comes from the neutral plan;
- `coverage: "planned"` is required for v2 entries;
- adjacent state end/start share one rounded frame boundary;
- invalid planned intervals are not clamped into validity;
- registry mutation after build is stale;
- scene source mutation, addition, removal, and extension changes are stale;
- generated `build_plan.json`, `public`, `build`, `dist`, and `node_modules` never enter the authored-input set.

- [ ] **Step 2: Run Remotion adapter tests and confirm failure**

Run:

```bash
node --test \
  frameworks/remotion/__tests__/emit.test.ts \
  frameworks/remotion/__tests__/verify.test.ts
```

Expected: FAIL because the registry and manifest are v1 and source enumeration does not exist.

- [ ] **Step 3: Add strict registry-v2 parsing without authored roles**

Define explicit unions:

```ts
interface AuthoredRemotionBindingV1 {
  beat: string;
  target: string;
  enter: "fade" | "rise" | "slide-left" | "scale" | "none";
  duration: number;
}

interface AuthoredRemotionBindingV2 {
  beat: string;
  target: string;
  enter: AuthoredRemotionBindingV1["enter"];
  duration?: number;
  coverage: "planned";
}
```

The registry cannot provide `role`; copy role from the resolved neutral state:

```ts
const state = requirePlannedState(frame, binding.beat);
if (state.version !== 2) {
  throw new Error(
    `${path}: version 2 registry target "${binding.target}" `
    + `requires a visual-beats v2 state`,
  );
}
```

Preserve exact-field validation and duplicate target rejection.

- [ ] **Step 4: Quantize shared boundaries once**

Add a shared helper in `frameworks/remotion/timing.ts`:

```ts
export function quantizeBoundary(seconds: number, fps: number): {
  frame: number;
  seconds: number;
} {
  const frame = Math.round(seconds * fps);
  return { frame, seconds: frame / fps };
}
```

For each planned state:

```ts
const start = quantizeBoundary(state.start, fps);
const end = quantizeBoundary(state.end, fps);
if (end.frame < start.frame) {
  throw new Error(
    `${frame.slug}:${state.id} quantizes to inverted coverage `
    + `${start.frame}-${end.frame}`,
  );
}
```

Reuse the same quantized boundary when one state's end equals the next state's start. Clamp only final arithmetic within half-frame tolerance; do not repair material invalid input.

Emit v2 bindings:

```ts
{
  frameSlug: frame.slug,
  beatId: state.id,
  target: binding.target,
  role: state.role,
  revealStart: start.seconds,
  revealDuration: durationFrames / fps,
  coverageStart: start.seconds,
  coverageEnd: end.seconds,
  source: binding.enter === "none" ? "static" : "custom",
  authoredDuration: frame.voiceDur,
  outerDuration: frame.frameDur,
}
```

- [ ] **Step 5: Add deterministic Remotion source enumeration and manifest v2**

Register an adapter collector that returns:

```text
visual_bindings.json
src/**/*.ts
src/**/*.tsx
src/**/*.js
src/**/*.jsx
```

Use a deterministic recursive walk, project-relative POSIX paths, and sorted output. Exclude symlinks/non-files using the repository's existing safe file conventions; exclude generated/output/dependency directories.

Construct manifest v2 with `hashCoveragePlan(plan)` and `digestAuthoredInputs(inputs)`. Full build writes it atomically; captions-only follows Part 2's preserve-only policy.

- [ ] **Step 6: Run focused adapter and type gates**

Run:

```bash
node --test \
  frameworks/remotion/__tests__/emit.test.ts \
  frameworks/remotion/__tests__/verify.test.ts
corepack npm run typecheck
corepack npm run typecheck:remotion
```

Expected: PASS. v2 evidence uses neutral roles and shared quantized boundaries; post-build source mutations are stale.

- [ ] **Step 7: Commit**

```bash
git add frameworks/remotion/visual_bindings.ts frameworks/remotion/timing.ts frameworks/remotion/emit.ts frameworks/remotion/index.ts frameworks/remotion/__tests__/emit.test.ts frameworks/remotion/__tests__/verify.test.ts
git commit -m "feat(remotion): emit semantic coverage evidence"
```

---

- [ ] **Task 13: Add `BeatState` and interval-owned Remotion runtime visibility** `[Group: remotion-coverage]` `[Tester: yes]`

**Files:**
- Modify: `frameworks/remotion/templates/src/types.ts:1-39`
- Modify: `frameworks/remotion/templates/src/VisualBeats.tsx:19-128`
- Modify: `frameworks/remotion/templates/src/Video.tsx:17-57`
- Modify: `frameworks/remotion/__tests__/visual_beats.test.ts`
- Modify: `frameworks/remotion/__tests__/scaffold.test.ts`

- [ ] **Step 1: Write failing runtime and mirrored-type tests**

Add template tests that compile and exercise:

```tsx
<VisualBeatProvider frame={frame}>
  <BeatState target="OpeningContext">
    <div data-testid="opening">Opening</div>
  </BeatState>
  <BeatReveal target="SolutionCard">
    <div data-testid="solution">Solution</div>
  </BeatReveal>
</VisualBeatProvider>
```

At 30 FPS, assert:

- opening hidden before its start frame;
- opening visible at start/middle and hidden at its end frame;
- solution entrance progress begins at the same shared boundary;
- solution remains visible through its end frame;
- direct rendering at a frame equals sequential/reverse conceptual state;
- optional `cueWordIndex` compiles when omitted for frame-start state;
- supporting-only targets do not become focal in generated evidence;
- default fallback title card is not wrapped as semantic coverage when no planned focal registry target exists.

Add scaffold source assertions for exported `BeatState` and v2 runtime fields.

- [ ] **Step 2: Run template tests and confirm failure**

Run:

```bash
node --test \
  frameworks/remotion/__tests__/visual_beats.test.ts \
  frameworks/remotion/__tests__/scaffold.test.ts
corepack npm run typecheck:remotion
```

Expected: FAIL because mirrored types require numeric `cueWordIndex`, runtime registry has no end/role, and `BeatState` does not exist.

- [ ] **Step 3: Mirror neutral v2 types exactly**

Update the generated-project mirror:

```ts
export interface ResolvedVisualStateV2 {
  version: 2;
  id: string;
  text: string;
  role: "focal" | "supporting";
  start: number;
  end: number;
  cueWordIndex?: number;
  cueText: string;
  sourceRefs: string[];
  workflowStep?: number;
  tolerance: { maxLead: number; maxLag: number };
}

export interface RuntimeVisualBindingV2 {
  beatId: string;
  target: string;
  role: "focal" | "supporting";
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  enter: "fade" | "rise" | "slide-left" | "scale" | "none";
}
```

Do not serialize `cueWordIndex: null`.

- [ ] **Step 4: Resolve interval-aware targets**

Change target resolution to return both boundaries:

```ts
interface ResolvedTarget {
  beat: ResolvedVisualStateV2;
  binding: RuntimeVisualBindingV2;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
}

function isActive(
  currentFrame: number,
  target: ResolvedTarget,
): boolean {
  return currentFrame >= target.startFrame
    && currentFrame < target.endFrame;
}
```

Add `BeatState`:

```tsx
export function BeatState({
  target,
  children,
}: {
  target: string;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const resolved = useVisualBeat(target);
  if (!isActive(frame, resolved)) return null;
  return <>{children}</>;
}
```

Update `BeatReveal` so the entrance interpolation occurs only after `startFrame`, but the child remains active until `endFrame`:

```tsx
if (!isActive(frame, resolved)) return null;
const progress = interpolate(
  frame,
  [resolved.startFrame, resolved.startFrame + resolved.durationFrames],
  [0, 1],
  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
);
return <div style={styleForEnter(resolved.binding.enter, progress)}>{children}</div>;
```

- [ ] **Step 5: Keep the fallback title card non-semantic by default**

In `Video.tsx`, render the fallback title normally when no registered planned target exists. Only wrap a custom scene element with `BeatState`/`BeatReveal` when the authored registry contains that target and the neutral plan supplies the state.

Do not auto-register or auto-promote the fallback title, captions, or shell.

- [ ] **Step 6: Run runtime and type tests**

Run:

```bash
node --test \
  frameworks/remotion/__tests__/visual_beats.test.ts \
  frameworks/remotion/__tests__/scaffold.test.ts
corepack npm run typecheck:remotion
```

Expected: PASS. Runtime activation and generated evidence use the same quantized boundaries.

- [ ] **Step 7: Commit**

```bash
git add frameworks/remotion/templates/src/types.ts frameworks/remotion/templates/src/VisualBeats.tsx frameworks/remotion/templates/src/Video.tsx frameworks/remotion/__tests__/visual_beats.test.ts frameworks/remotion/__tests__/scaffold.test.ts
git commit -m "feat(remotion): add semantic beat states"
```

---

- [ ] **Task 14: Prove Remotion verification parity and stale-source behavior** `[Group: remotion-coverage]` `[Tester: yes]`

**Files:**
- Modify: `frameworks/remotion/verify.ts:59-134`
- Modify: `frameworks/remotion/__tests__/verify.test.ts`
- Modify: `test/cli/workflows.test.ts`
- Modify: `test/release/harness.ts`
- Modify: `test/release/harness.test.ts`

- [ ] **Step 1: Write failing parity and mutation tests**

Add a shared neutral fixture and compare only neutral finding codes/details between adapters:

```ts
test("HyperFrames and Remotion report the same semantic gap", () => {
  const plan = makeCoveragePlan();
  const hyperframes = verifyVisualSync({
    plan,
    policy: COVERAGE_POLICY,
    fps: 30,
    manifest: hyperframesGapManifest(plan),
  });
  const remotion = verifyVisualSync({
    plan,
    policy: COVERAGE_POLICY,
    fps: 30,
    manifest: remotionGapManifest(plan),
  });
  assert.deepEqual(
    remotion.map(({ code, details }) => ({ code, details })),
    hyperframes.map(({ code, details }) => ({ code, details })),
  );
});
```

Add packed/workflow cases:

- change `visual_bindings.json` after full build → stale error;
- change `src/Video.tsx` after full build → stale error;
- add `src/scenes/NewScene.tsx` after full build → newly relevant path error;
- remove a recorded source file → missing path error;
- captions-only/regroup preserves old manifest and verify detects the mutation;
- v1 registry remains warn-compatible;
- output-local `build_plan.json` retains v2 interval data after full build.

- [ ] **Step 2: Run Remotion verification tests and confirm failure**

Run:

```bash
node --test \
  frameworks/remotion/__tests__/verify.test.ts \
  test/cli/workflows.test.ts \
  test/release/harness.test.ts
```

Expected: FAIL until Remotion verify passes current source evidence and packed smoke uses v2.

- [ ] **Step 3: Pass current Remotion evidence through adapter verification**

Preserve existing structural checks, then call the neutral verifier with current freshness:

```ts
return [
  ...structuralFindings,
  ...verifyVisualSync({
    plan: context.plan,
    manifest: context.bindings,
    policy: context.policy,
    fps: context.fps,
    freshness: context.visualEvidenceFreshness,
  }),
];
```

Do not parse or execute arbitrary TSX. Freshness comes from the deterministic source walk; interval semantics come from the registry plus neutral plan.

- [ ] **Step 4: Migrate packed Remotion smoke fixtures to v2**

Migrate `stageRetainedKokoroAudio()` in `test/release/harness.ts` so the neutral plan and registry use the retained fixture's actual slugs and transcript indexes:

```json
{
  "version": 2,
  "frames": {
    "01-smoke": [
      {
        "beat": "opening-context",
        "target": "OpeningContext",
        "enter": "none",
        "coverage": "planned"
      },
      {
        "beat": "final-landing",
        "target": "FinalLanding",
        "enter": "rise",
        "duration": 0.5,
        "coverage": "planned"
      }
    ],
    "02-smoke": [
      {
        "beat": "opening-context",
        "target": "OpeningContext",
        "enter": "none",
        "coverage": "planned"
      },
      {
        "beat": "final-landing",
        "target": "FinalLanding",
        "enter": "rise",
        "duration": 0.5,
        "coverage": "planned"
      }
    ]
  }
}
```

Write matching neutral `visual_beats.json` v2 entries in the same function:

```json
{
  "version": 2,
  "frames": {
    "01-smoke": {
      "kind": "focal",
      "beats": [
        {
          "id": "opening-context",
          "text": "Introduce the topic",
          "role": "focal",
          "cue": { "frameStart": true },
          "coverage": { "until": "next-state" },
          "sourceRefs": ["smoke.md:1-1"]
        },
        {
          "id": "final-landing",
          "text": "The topic",
          "role": "focal",
          "cue": { "wordIndex": 2 },
          "coverage": { "until": "frame-end" },
          "sourceRefs": ["smoke.md:1-1"]
        }
      ],
      "coverageExemptions": []
    },
    "02-smoke": {
      "kind": "focal",
      "beats": [
        {
          "id": "opening-context",
          "text": "Recap the key idea",
          "role": "focal",
          "cue": { "frameStart": true },
          "coverage": { "until": "next-state" },
          "sourceRefs": ["smoke.md:2-2"]
        },
        {
          "id": "final-landing",
          "text": "The key idea",
          "role": "focal",
          "cue": { "wordIndex": 3 },
          "coverage": { "until": "frame-end" },
          "sourceRefs": ["smoke.md:2-2"]
        }
      ],
      "coverageExemptions": []
    }
  }
}
```

Update the packed-smoke `Video.tsx` source mutation to import both helpers and replace the empty `SCENES` map with custom smoke scenes that consume the exact registered targets:

```tsx
import {
  BeatReveal,
  BeatState,
  VisualBeatProvider,
} from "./VisualBeats";

const SmokeScene: React.FC<SceneProps> = ({ opacity }) => (
  <AbsoluteFill style={{ opacity }}>
    <BeatState target="OpeningContext">
      <div data-testid="smoke-opening">Opening context</div>
    </BeatState>
    <BeatReveal target="FinalLanding">
      <div data-testid="smoke-landing">Final landing</div>
    </BeatReveal>
  </AbsoluteFill>
);

const SCENES: Record<string, React.FC<SceneProps>> = {
  "01-smoke": SmokeScene,
  "02-smoke": SmokeScene,
};
```

Retain a separate assertion that the fallback `TitleCard` remains non-semantic when no custom scene/registry target exists. In the smoke runtime checks, assert direct and reverse visibility for `smoke-opening` and `smoke-landing`, and assert `smoke-landing` remains visible through each neutral `frameDur`. Keep typechecking and SSR smoke in the existing release harness.

- [ ] **Step 5: Run Remotion and shared workflow gates**

Run:

```bash
node --test \
  frameworks/remotion/__tests__/visual_beats.test.ts \
  frameworks/remotion/__tests__/emit.test.ts \
  frameworks/remotion/__tests__/verify.test.ts \
  frameworks/remotion/__tests__/scaffold.test.ts \
  test/cli/workflows.test.ts \
  test/release/harness.test.ts
corepack npm run typecheck
corepack npm run typecheck:remotion
```

Expected: PASS. Remotion and HyperFrames agree on neutral findings while retaining framework-specific target names and motion.

- [ ] **Step 6: Commit**

```bash
git add frameworks/remotion/verify.ts frameworks/remotion/__tests__/verify.test.ts test/cli/workflows.test.ts test/release/harness.ts test/release/harness.test.ts
git commit -m "test(remotion): prove visual coverage parity"
```

## Part 4 Completion Gate

Run:

```bash
corepack npm run typecheck
corepack npm run typecheck:remotion
node --test \
  frameworks/remotion/__tests__/visual_beats.test.ts \
  frameworks/remotion/__tests__/emit.test.ts \
  frameworks/remotion/__tests__/verify.test.ts \
  frameworks/remotion/__tests__/scaffold.test.ts \
  test/cli/workflows.test.ts \
  test/release/harness.test.ts
git diff --check
```

Expected: all commands exit `0`; registry/runtime/evidence boundaries are quantized consistently, source mutations invalidate evidence, and cross-framework gap outcomes match.
