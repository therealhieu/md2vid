# Part 3 — Semantic Verification and HyperFrames Bindings

Depends on: Parts 1–2. Complete this part before `2026-08-02-visual-timing-sync-plan-4.md`.

- [ ] **Task 8: Add the common binding manifest and semantic verifier** `[Group: hyperframes-sync]` `[Tester: yes]`

**Files:**
- Modify: `engine/types.ts:69-112`
- Create: `engine/visual_sync.ts`
- Create: `engine/__tests__/visual_sync.test.ts`
- Modify: `scripts/verify.ts:86-125`

- [ ] **Step 1: Write failing semantic verifier tests**

Create plan and manifest factories, then cover each requirement:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { verifyVisualSync } from "../visual_sync.ts";

const POLICY = { mode: "required", maxLead: 0.25, maxLag: 0.75, minLanding: 1 } as const;

test("accepts covered cue-aligned workflow bindings", () => {
  assert.deepEqual(verifyVisualSync({ plan: PLAN, manifest: ALIGNED, policy: POLICY, fps: 30 }), []);
});

test("reports an early reveal with quantitative evidence", () => {
  const findings = verifyVisualSync({ plan: PLAN, manifest: FRONT_LOADED, policy: POLICY, fps: 30 });
  assert.equal(findings[0].level, "error");
  assert.match(findings[0].msg, /frame "reserve-flow".*beat "execute"/);
  assert.match(findings[0].msg, /reveal starts at 3\.700s/);
  assert.match(findings[0].msg, /cue starts at 11\.060s/);
  assert.match(findings[0].msg, /lead is 7\.360s/);
});
```

Add separate cases for unknown frame, unknown beat, missing coverage, duplicate target, out-of-order workflow steps, final reveal violating `minLanding`, authored semantic duration versus `voiceDur`, outer duration versus `frameDur`, warn mode, off mode, and missing manifest. The landing test must assert frame, beat, target, cue start, reveal start, reveal end, actual landing, required minimum, and shortfall. Parameterize duration checks at 24, 30, and 60 FPS with non-frame-aligned expected durations: differences up to `max(0.001, 0.5 / fps)` pass, while a difference beyond that tolerance fails with the active FPS in the diagnostic.

- [ ] **Step 2: Run and confirm module failure**

```bash
node --test engine/__tests__/visual_sync.test.ts
```

Expected: FAIL because `engine/visual_sync.ts` does not exist.

- [ ] **Step 3: Add shared manifest and verification context types**

Extend `engine/types.ts`:

```ts
export interface VisualBinding {
  frameSlug: string;
  beatId: string;
  target: string;
  revealStart: number;
  revealDuration: number;
  source: "declarative" | "custom";
  authoredDuration?: number;
  outerDuration?: number;
}

export interface VisualBindingManifest {
  version: 1;
  framework: string;
  bindings: VisualBinding[];
}

export interface AdapterVerifyContext {
  plan: BuildPlan;
  videoDir: string;
  sharedDir: string;
  config: VideoConfig;
  policy: ResolvedVisualSyncPolicy;
  fps: number;
  bindings?: VisualBindingManifest;
  voiceSnapshots?: ReadonlyArray<VoiceAssetSnapshot>;
}
```

Change `FrameworkAdapter.verify` to accept the object context. Add an optional adapter-owned manifest path:

```ts
bindingManifestPath?: string;
resolveVerificationFps(config: VideoConfig, videoDir: string): number;
verify(context: AdapterVerifyContext): Finding[];
```

- [ ] **Step 4: Implement framework-neutral verification**

Create `engine/visual_sync.ts`:

```ts
import type {
  BuildPlan,
  Finding,
  ResolvedVisualSyncPolicy,
  VisualBinding,
  VisualBindingManifest,
} from "./types.ts";

export function verifyVisualSync(input: {
  plan: BuildPlan;
  manifest?: VisualBindingManifest;
  policy: ResolvedVisualSyncPolicy;
  fps: number;
}): Finding[] {
  if (input.policy.mode === "off") return [];
  const level = input.policy.mode === "required" ? "error" : "warn";
  const planned = input.plan.frames.flatMap((frame) =>
    (frame.visualBeats ?? []).map((beat) => ({ frame, beat, key: `${frame.slug}:${beat.id}` })),
  );
  if (planned.length === 0) return [];
  if (!input.manifest) return [{ level, msg: "visual binding manifest is missing" }];

  if (!Number.isFinite(input.fps) || input.fps <= 0) return [{ level: "error", msg: "visual sync FPS must be a finite positive number" }];
  const durationTolerance = Math.max(0.001, 0.5 / input.fps);
  const findings: Finding[] = [];
  const push = (msg: string) => findings.push({ level, msg });
  const frames = new Map(input.plan.frames.map((frame) => [frame.slug, frame]));
  const byKey = new Map<string, VisualBinding[]>();
  for (const binding of input.manifest.bindings) {
    const frame = frames.get(binding.frameSlug);
    if (!frame) {
      push(`binding target "${binding.target}" references unknown frame "${binding.frameSlug}"`);
      continue;
    }
    const beat = frame.visualBeats?.find((candidate) => candidate.id === binding.beatId);
    if (!beat) {
      push(`frame "${frame.slug}" target "${binding.target}" references unknown beat "${binding.beatId}"`);
      continue;
    }
    if (!Number.isFinite(binding.revealStart) || !Number.isFinite(binding.revealDuration) || binding.revealDuration < 0) {
      push(`frame "${frame.slug}" beat "${beat.id}" has invalid reveal timing`);
      continue;
    }
    const key = `${frame.slug}:${beat.id}`;
    byKey.set(key, [...(byKey.get(key) ?? []), binding]);
    const delta = binding.revealStart - beat.start;
    if (delta < -beat.tolerance.maxLead) push(formatLeadFinding(frame, beat, binding, -delta));
    if (delta > beat.tolerance.maxLag) push(formatLagFinding(frame, beat, binding, delta));
    const landing = frame.voiceDur - (binding.revealStart + binding.revealDuration);
    if (landing < input.policy.minLanding) push(formatLandingFinding(frame, beat, binding, landing, input.policy.minLanding));
    if (binding.authoredDuration !== undefined && Math.abs(binding.authoredDuration - frame.voiceDur) > durationTolerance) {
      push(`frame "${frame.slug}" authored duration ${binding.authoredDuration.toFixed(3)}s does not match voiceDur ${frame.voiceDur.toFixed(3)}s within ${durationTolerance.toFixed(3)}s at ${input.fps} FPS`);
    }
    if (binding.outerDuration !== undefined && Math.abs(binding.outerDuration - frame.frameDur) > durationTolerance) {
      push(`frame "${frame.slug}" outer duration ${binding.outerDuration.toFixed(3)}s does not match frameDur ${frame.frameDur.toFixed(3)}s within ${durationTolerance.toFixed(3)}s at ${input.fps} FPS`);
    }
  }
  for (const { frame, beat, key } of planned) {
    if ((byKey.get(key) ?? []).length === 0) push(`frame "${frame.slug}" beat "${beat.id}" has no visual binding`);
  }
  appendDuplicateTargetFindings(findings, input.manifest.bindings, level);
  appendWorkflowOrderFindings(findings, input.plan.frames, byKey, level);
  return findings;
}
```

Define the formatting and aggregate helpers in the same module:

```ts
const seconds = (value: number) => value.toFixed(3);

function formatLeadFinding(frame: PlanFrame, beat: ResolvedVisualBeat, binding: VisualBinding, lead: number): string {
  return `frame "${frame.slug}" beat "${beat.id}" target "${binding.target}": reveal starts at ${seconds(binding.revealStart)}s; cue starts at ${seconds(beat.start)}s; lead is ${seconds(lead)}s, exceeding maxLead ${seconds(beat.tolerance.maxLead)}s`;
}

function formatLagFinding(frame: PlanFrame, beat: ResolvedVisualBeat, binding: VisualBinding, lag: number): string {
  return `frame "${frame.slug}" beat "${beat.id}" target "${binding.target}": reveal starts at ${seconds(binding.revealStart)}s; cue starts at ${seconds(beat.start)}s; lag is ${seconds(lag)}s, exceeding maxLag ${seconds(beat.tolerance.maxLag)}s`;
}

function formatLandingFinding(
  frame: PlanFrame,
  beat: ResolvedVisualBeat,
  binding: VisualBinding,
  landing: number,
  minLanding: number,
): string {
  const revealEnd = binding.revealStart + binding.revealDuration;
  const shortfall = minLanding - landing;
  return `frame "${frame.slug}" beat "${beat.id}" target "${binding.target}": ` +
    `reveal starts at ${seconds(binding.revealStart)}s; ` +
    `cue starts at ${seconds(beat.start)}s; ` +
    `reveal ends at ${seconds(revealEnd)}s; ` +
    `landing is ${seconds(landing)}s, short of minLanding ${seconds(minLanding)}s by ${seconds(shortfall)}s`;
}

function appendDuplicateTargetFindings(findings: Finding[], bindings: readonly VisualBinding[], level: Finding["level"]): void {
  const seen = new Set<string>();
  for (const binding of bindings) {
    const key = `${binding.frameSlug}:${binding.target}`;
    if (seen.has(key)) findings.push({ level, msg: `duplicate visual target "${binding.target}" in frame "${binding.frameSlug}"` });
    seen.add(key);
  }
}

function appendWorkflowOrderFindings(
  findings: Finding[],
  frames: readonly PlanFrame[],
  byKey: ReadonlyMap<string, readonly VisualBinding[]>,
  level: Finding["level"],
): void {
  for (const frame of frames) {
    const steps = (frame.visualBeats ?? [])
      .filter((beat) => beat.workflowStep !== undefined)
      .sort((left, right) => left.workflowStep! - right.workflowStep!);
    let previous = Number.NEGATIVE_INFINITY;
    for (const beat of steps) {
      const starts = (byKey.get(`${frame.slug}:${beat.id}`) ?? []).map((binding) => binding.revealStart);
      if (starts.length === 0) continue;
      const current = Math.min(...starts);
      if (current < previous) findings.push({ level, msg: `frame "${frame.slug}" workflow beat "${beat.id}" reveals out of order` });
      previous = current;
    }
  }
}
```

Import `PlanFrame` and `ResolvedVisualBeat` with the other types. Do not count gap or crossfade.

- [ ] **Step 5: Re-plan current inputs in `scripts/verify.ts`**

Use `createProjectPlan()` so verification catches transcript/spec changes after build:

```ts
const planning = createProjectPlan(OUTPUT, planningDependencies);
const bindings = adapter.bindingManifestPath
  ? readBindingManifest(join(OUTPUT, adapter.bindingManifestPath))
  : undefined;
const findings = adapter.verify({
  plan: planning.plan,
  videoDir: OUTPUT,
  sharedDir: SHARED,
  config: planning.adapterConfig,
  policy: resolveVisualSyncPolicy(planning.neutralConfig),
  fps: adapter.resolveVerificationFps(planning.adapterConfig, OUTPUT),
  bindings,
  voiceSnapshots: planning.voiceSnapshots,
});
```

Retain existing neutral caption and voice verification. Emit exactly one actionable warning when the beat spec is absent in legacy warn mode.

- [ ] **Step 6: Run focused tests**

```bash
node --test engine/__tests__/visual_sync.test.ts test/cli/workflows.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add engine/types.ts engine/visual_sync.ts engine/__tests__/visual_sync.test.ts scripts/verify.ts test/cli/workflows.test.ts
git commit -m "feat(verify): add semantic visual timing checks"
```

---

- [ ] **Task 9: Implement HyperFrames declarative and owned custom scheduling** `[Group: hyperframes-sync]` `[Tester: yes]`

**Files:**
- Create: `frameworks/hyperframes/visual_timing.ts`
- Create: `frameworks/hyperframes/__tests__/visual_timing.test.ts`
- Modify: `frameworks/hyperframes/html.ts` to add a root-scoped prefix/suffix script insertion helper

- [ ] **Step 1: Write failing parser and runtime tests**

Cover each entrance token and helper ownership:

```ts
test("declarative rise binding schedules at the resolved beat", () => {
  const prepared = prepareFrameVisualTiming({
    frame: FRAME_WITH_EXECUTE_BEAT,
    authoredHtml: `<div id="root" data-composition-id="reserve-flow"><div id="execute" data-md2vid-beat="execute" data-md2vid-enter="rise" data-md2vid-duration="0.7"></div></div>`,
    documentPath: "compositions/frames/01-reserve-flow.html",
    mode: "required",
  });
  assert.match(prepared.html, /__md2vidTiming/);
  assert.match(prepared.html, /power3\.out|rise/);
  assert.deepEqual(prepared.bindings, [{
    frameSlug: "reserve-flow",
    beatId: "execute",
    target: "#execute",
    revealStart: 11.06,
    revealDuration: 0.7,
    source: "declarative",
    authoredDuration: FRAME_WITH_EXECUTE_BEAT.voiceDur,
  }]);
});

test("custom declaration is verified and the helper owns scheduling", () => {
  const prepared = prepareFrameVisualTiming({
    frame: FRAME_WITH_EXECUTE_BEAT,
    authoredHtml: `<div id="root" data-composition-id="reserve-flow">
      <div id="execute"></div>
      <script type="application/json" data-md2vid-custom-bindings>{"bindings":[{"beat":"execute","target":"#execute","method":"from","duration":0.7}]}</script>
    </div>`,
    documentPath: "compositions/frames/01-reserve-flow.html",
    mode: "required",
  });
  assert.deepEqual(prepared.bindings[0], {
    frameSlug: "reserve-flow",
    beatId: "execute",
    target: "#execute",
    revealStart: 11.06,
    revealDuration: 0.7,
    source: "custom",
    authoredDuration: FRAME_WITH_EXECUTE_BEAT.voiceDur,
  });
  const runtime = buildHyperframesTimingRuntime(FRAME_WITH_EXECUTE_BEAT, prepared.bindings);
  assert.match(runtime, /timing\.from|from:function/);
  assert.doesNotMatch(runtime, /return beat\.start/);
});
```

Add failures for unknown beats, unsupported tokens/methods, missing target IDs, invalid/negative duration, duplicate declarations, runtime calls without a matching declaration, duration mismatch, beat attributes on a frame without planned beats, and required versus warn behavior.

- [ ] **Step 2: Run and confirm module failure**

```bash
node --test frameworks/hyperframes/__tests__/visual_timing.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement declarative parsing through the HTML scanner**

Use `scanHtmlTags()`/`htmlAttribute()` rather than regex-only parsing:

```ts
export type HyperframesEntranceToken = "fade" | "rise" | "slide-left" | "scale" | "none";

export function prepareFrameVisualTiming(input: {
  frame: PlanFrame;
  authoredHtml: string;
  documentPath: string;
  mode: VisualSyncMode;
}): { html: string; bindings: VisualBinding[] } {
  const beats = new Map((input.frame.visualBeats ?? []).map((beat) => [beat.id, beat]));
  const tags = scanHtmlTags(input.authoredHtml);
  const declarative = readDeclarativeBindings(tags, input.authoredHtml, beats, input.frame, input.documentPath);
  const custom = readCustomBindingDeclarations(tags, input.authoredHtml, beats, input.frame, input.documentPath);
  const bindings = [...declarative.bindings, ...custom.bindings];
  const prefix = buildHyperframesTimingRuntime(input.frame, bindings);
  const suffix = buildTimelineFinalizer(input.frame.slug, declarative.statements);
  return {
    html: insertCompositionRootScripts(input.authoredHtml, input.frame.slug, prefix, suffix),
    bindings,
  };
}
```

Map tokens to fixed deterministic variables:

```ts
const ENTRANCES = {
  fade: { opacity: 0 },
  rise: { opacity: 0, y: 28 },
  "slide-left": { opacity: 0, x: 28 },
  scale: { opacity: 0, scale: 0.96 },
  none: null,
} as const;
```

Implement private helpers with these concrete contracts:

```ts
function readDeclarativeBindings(
  tags: readonly HtmlTag[],
  html: string,
  beats: ReadonlyMap<string, ResolvedVisualBeat>,
  frame: PlanFrame,
  documentPath: string,
): { statements: string[]; bindings: VisualBinding[] };

function readCustomBindingDeclarations(
  tags: readonly HtmlTag[],
  html: string,
  beats: ReadonlyMap<string, ResolvedVisualBeat>,
  frame: PlanFrame,
  documentPath: string,
): { bindings: VisualBinding[] };

function buildTimelineFinalizer(frameSlug: string, declarativeStatements: readonly string[]): string;
```

`readDeclarativeBindings` requires a unique element `id`, defaults `data-md2vid-enter` to `fade` and duration to `0.48`, and emits one GSAP statement at `beat.start`. `readCustomBindingDeclarations` parses exactly one JSON declaration block, validates `beat`, `target`, `method`, and duration, and converts it to normalized `source: "custom"` evidence.

Add `insertCompositionRootScripts(html, compositionId, prefix, suffix)` to `frameworks/hyperframes/html.ts`; it places the prefix before transported authored scripts and the suffix after them without changing unrelated root content.

- [ ] **Step 4: Implement helper-owned custom scheduling**

Parse `<script type="application/json" data-md2vid-custom-bindings>` into normalized declarations during preflight. Generate an embedded helper API whose supported methods require a matching declaration and schedule atomically:

```js
window.__md2vidTiming = window.__md2vidTiming || {};
window.__md2vidTiming.forFrame = function (slug) {
  const beats = FRAME_BEATS[slug];
  const declarations = FRAME_BINDINGS[slug];
  return {
    from: function (timeline, beatId, target, vars) {
      const beat = requireBeat(beats, beatId);
      const declaration = requireBinding(declarations, beatId, target, "from");
      const duration = Number(vars.duration || 0);
      if (duration !== declaration.duration) throw new Error("custom binding duration mismatch");
      timeline.from(target, vars, beat.start);
      return timeline;
    },
    fromTo: function (timeline, beatId, target, fromVars, toVars) {
      const beat = requireBeat(beats, beatId);
      const declaration = requireBinding(declarations, beatId, target, "fromTo");
      const duration = Number(toVars.duration || 0);
      if (duration !== declaration.duration) throw new Error("custom binding duration mismatch");
      timeline.fromTo(target, fromVars, toVars, beat.start);
      return timeline;
    },
    set: function (timeline, beatId, target, vars) {
      const beat = requireBeat(beats, beatId);
      requireBinding(declarations, beatId, target, "set");
      timeline.set(target, vars, beat.start);
      return timeline;
    }
  };
};
```

Do not expose a method that returns raw semantic seconds. Finalize exactly one paused parent timeline under `window.__timelines[slug]` while preserving authored script order.

- [ ] **Step 5: Run focused tests**

```bash
node --test frameworks/hyperframes/__tests__/visual_timing.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frameworks/hyperframes/visual_timing.ts frameworks/hyperframes/html.ts frameworks/hyperframes/__tests__/visual_timing.test.ts
git commit -m "feat(hyperframes): bind reveals to narration beats"
```

---

- [ ] **Task 10: Emit and verify HyperFrames binding manifests** `[Group: hyperframes-sync]` `[Tester: yes]`

**Files:**
- Modify: `frameworks/hyperframes/emit.ts:119-398`
- Modify: `frameworks/hyperframes/verify.ts:46-67`
- Modify: `scripts/build.ts:92-321`
- Modify: `frameworks/hyperframes/__tests__/emit.test.ts`
- Modify: `frameworks/hyperframes/__tests__/verify.test.ts`

- [ ] **Step 1: Write failing emission and stale-manifest tests**

Add assertions that full emit writes:

```text
build/visual_bindings.json
```

with normalized content, and a second build replaces the first manifest when targets change. Add verifier cases for missing, stale, early, unknown, and aligned manifests.

```ts
test("full rebuild replaces the binding manifest", () => {
  buildProject({ targetId: "execute-v1" });
  buildProject({ targetId: "execute-v2" });
  const manifest = JSON.parse(readFileSync(join(project, "build/visual_bindings.json"), "utf8"));
  assert.equal(manifest.bindings[0].target, "#execute-v2");
});
```

- [ ] **Step 2: Run and confirm failures**

```bash
node --test frameworks/hyperframes/__tests__/emit.test.ts frameworks/hyperframes/__tests__/verify.test.ts
```

Expected: FAIL because no manifest is generated or loaded.

- [ ] **Step 3: Prepare timing before mutation**

In HyperFrames `preflight()`, read each authored frame, call `prepareFrameVisualTiming()`, and return prepared embedded templates plus one normalized manifest:

```ts
const manifest: VisualBindingManifest = {
  version: 1,
  framework: "hyperframes",
  bindings: preparedFrames.flatMap((frame) => frame.bindings),
};
```

Write `build/visual_bindings.json` during full `emit()`. Captions-only emission must retain the existing manifest rather than replace it with an empty one.

- [ ] **Step 4: Always promote generated manifest metadata**

Add `bindingManifestPath: "build/visual_bindings.json"` to the adapter and explicitly add that staged file to build's managed-file list on every full build. Do not route it through `addMissingRuntimeFiles()`, which intentionally skips existing targets.

- [ ] **Step 5: Make HyperFrames verification plan-aware**

Change the verifier signature to `verify(context: AdapterVerifyContext)`. Keep existing file/layout/theme/caption/voice checks, then append:

```ts
findings.push(...verifyVisualSync({
  plan: context.plan,
  manifest: context.bindings,
  policy: context.policy,
  fps: context.fps,
}));
```

Make `resolveVerificationFps(config, videoDir)` mandatory on the HyperFrames adapter. Full emission writes the effective configured FPS onto the main composition root as `data-fps`; the resolver reads that main-root value, rejects missing/non-finite/non-positive values, and never reads the captions root. Load authored root duration evidence during preparation/verification and compare it to `voiceDur`; verify emitted host duration separately against `frameDur` using `Math.max(0.001, 0.5 / context.fps)`.

Add a verifier fixture with main-root `data-fps="24"` and a non-frame-aligned duration delta of `0.019s`: it passes at 24 FPS but fails when the same fixture is declared as 60 FPS. Add a parity assertion that emitted `data-fps` equals the adapter's resolved verification FPS.

- [ ] **Step 6: Run focused tests**

```bash
node --test \
  frameworks/hyperframes/__tests__/visual_timing.test.ts \
  frameworks/hyperframes/__tests__/emit.test.ts \
  frameworks/hyperframes/__tests__/verify.test.ts \
  engine/__tests__/visual_sync.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frameworks/hyperframes/emit.ts frameworks/hyperframes/verify.ts scripts/build.ts frameworks/hyperframes/__tests__/emit.test.ts frameworks/hyperframes/__tests__/verify.test.ts
git commit -m "feat(hyperframes): verify visual beat manifests"
```

---

- [ ] **Task 11: Prove seek determinism and front-loading failures** `[Group: hyperframes-sync]` `[Tester: yes]`

**Files:**
- Modify: `test/visual/composed-visual-integrity.test.ts:342-576`
- Add fixture files under the existing visual test fixture location

- [ ] **Step 1: Add aligned and front-loaded semantic fixtures**

Use the Part 2 `3s/11s/14s` beat plan. One frame binds all three targets through declarative/helper-owned scheduling. A negative fixture uses a manually supplied stale/early manifest or unsupported freehand timing to prove the verifier blocks it.

- [ ] **Step 2: Add direct-seek versus sequential-state assertions**

Parameterize rendered-state checks at every supported frame rate. For each cue, compare the renderable frame immediately before and at/after the cue:

```ts
for (const fps of [24, 30, 60]) {
  for (const cue of [2.95, 11.06, 14.35]) {
    const before = Math.max(0, (Math.ceil(cue * fps) - 1) / fps);
    const after = Math.ceil(cue * fps) / fps;
    for (const time of [before, after]) {
      const sequential = await captureStateAfterSequentialPlayback(time, { fps });
      const direct = await captureStateAfterDirectSeek(time, { fps });
      const reverseForward = await captureStateAfterReverseThenForward(time, { fps });
      assert.deepEqual(direct, sequential, `direct state differs at ${time}s / ${fps} FPS`);
      assert.deepEqual(reverseForward, sequential, `reverse state differs at ${time}s / ${fps} FPS`);
    }
  }
}
```

The fixture must set the main composition FPS for each parameterized run so the browser/render timeline uses the tested rate rather than only changing arithmetic in the test.

- [ ] **Step 3: Run and confirm any seek defects**

```bash
node --test test/visual/composed-visual-integrity.test.ts
```

Expected: PASS when Task 9's timeline composition is seek-safe. If an assertion fails, the failure must identify a real deterministic initialization or composition defect.

- [ ] **Step 4: Correct a real seek defect when the new evidence exposes one**

When Step 3 fails, correct only the demonstrated deterministic initialization/composition defect and rerun the affected checks. When Step 3 passes, make no runtime change in this step. Keep paused deterministic timelines and GSAP `set`/`fromTo` semantics. Do not add `.call()` callbacks, wall-clock state, runtime fetches, or source-file mutation.

- [ ] **Step 5: Run Part 3 focused tests**

```bash
node --test \
  engine/__tests__/visual_sync.test.ts \
  frameworks/hyperframes/__tests__/visual_timing.test.ts \
  frameworks/hyperframes/__tests__/emit.test.ts \
  frameworks/hyperframes/__tests__/verify.test.ts \
  test/visual/composed-visual-integrity.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add test/visual frameworks/hyperframes/visual_timing.ts
git commit -m "test(hyperframes): prove cue-bound seek determinism"
```

## Part 3 Verification

```bash
node --test \
  engine/__tests__/visual_sync.test.ts \
  frameworks/hyperframes/__tests__/visual_timing.test.ts \
  frameworks/hyperframes/__tests__/emit.test.ts \
  frameworks/hyperframes/__tests__/verify.test.ts \
  test/visual/composed-visual-integrity.test.ts
corepack npm run typecheck
git diff --check
```

Expected: all commands exit `0`; the front-loaded fixture fails only in its explicit negative assertion, and direct/reverse seeks match sequential state.
