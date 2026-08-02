# Part 4 — Remotion Static Bindings and Owned Reveals

Depends on: Parts 1–3. Complete this part before `2026-08-02-visual-timing-sync-plan-5.md`.

- [ ] **Task 12: Add the Remotion binding registry and runtime helpers** `[Group: remotion-sync]` `[Tester: yes]`

**Files:**
- Create: `frameworks/remotion/templates/src/VisualBeats.tsx`
- Modify: `frameworks/remotion/templates/src/types.ts:1-19`
- Modify: `frameworks/remotion/templates/src/Video.tsx:14-69`
- Modify: `frameworks/remotion/templates/src/primitives.tsx`
- Create: `frameworks/remotion/__tests__/visual_beats.test.ts`

- [ ] **Step 1: Write failing template/runtime tests**

Add tests that inspect the shipped template source and typecheck a generated project:

```ts
test("Remotion templates expose beat-owned reveal helpers", () => {
  const source = readFileSync(template("src/VisualBeats.tsx"), "utf8");
  assert.match(source, /VisualBeatProvider/);
  assert.match(source, /BeatReveal/);
  assert.match(source, /useVisualBeatBinding/);
  assert.doesNotMatch(source, /startSeconds\s*:/);
});
```

Add a runtime test fixture proving the component starts from the registered beat at the active FPS:

```tsx
const binding = resolveVisualBeatBinding({
  frame: FRAME,
  bindings: REGISTRY.frames["reserve-flow"],
  target: "WorkflowStep:execute",
  fps: 30,
});
assert.equal(binding.startFrame, Math.round(11.06 * 30));
assert.equal(binding.durationFrames, Math.round(0.5 * 30));
```

Add failures for unknown target, unknown beat, duplicate target, unsupported entrance, negative duration, and registry/frame mismatch.

- [ ] **Step 2: Run and confirm missing module failure**

```bash
node --test frameworks/remotion/__tests__/visual_beats.test.ts
```

Expected: FAIL because `VisualBeats.tsx` and registry types do not exist.

- [ ] **Step 3: Mirror additive plan and binding types in the standalone template**

Update `frameworks/remotion/templates/src/types.ts` with the optional neutral fields and output-local binding data:

```ts
export interface ResolvedVisualBeat {
  id: string;
  text: string;
  start: number;
  end?: number;
  cueWordIndex: number;
  cueText: string;
  sourceRefs: string[];
  workflowStep?: number;
  tolerance: { maxLead: number; maxLag: number };
}

export interface RemotionVisualBinding {
  beat: string;
  target: string;
  enter: "fade" | "rise" | "slide-left" | "scale" | "none";
  duration: number;
}

// Add these fields to the existing PlanFrame interface.
visualKind?: "focal" | "workflow" | "comparison" | "sequence";
visualBeats?: ResolvedVisualBeat[];

// Add this field to the existing BuildPlan interface.
visualBindings?: Record<string, RemotionVisualBinding[]>;
```

Keep the intentional standalone type duplication documented and add parity assertions in the test.

- [ ] **Step 4: Implement pure binding resolution and owned components**

Create `VisualBeats.tsx`:

```tsx
import React, { createContext, useContext } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { PlanFrame, RemotionVisualBinding } from "./types";
import { secToFrames } from "./primitives";

type ContextValue = { frame: PlanFrame; bindings: readonly RemotionVisualBinding[] };
const VisualBeatContext = createContext<ContextValue | null>(null);

export const VisualBeatProvider: React.FC<ContextValue & { children: React.ReactNode }> = ({
  frame,
  bindings,
  children,
}) => <VisualBeatContext.Provider value={{ frame, bindings }}>{children}</VisualBeatContext.Provider>;

export function useVisualBeatBinding(target: string) {
  const value = useContext(VisualBeatContext);
  const { fps } = useVideoConfig();
  if (!value) throw new Error("VisualBeatProvider is missing");
  const matches = value.bindings.filter((binding) => binding.target === target);
  if (matches.length !== 1) throw new Error(`expected one visual binding for ${target}, found ${matches.length}`);
  const binding = matches[0];
  const beat = value.frame.visualBeats?.find((candidate) => candidate.id === binding.beat);
  if (!beat) throw new Error(`unknown visual beat ${binding.beat} for ${target}`);
  return {
    beat,
    binding,
    startFrame: secToFrames(beat.start, fps),
    durationFrames: secToFrames(binding.duration, fps),
  };
}
```

Implement `BeatReveal` so it owns interpolation for all standard entrance tokens. Export an owned custom hook returning normalized progress rather than raw cue seconds:

```ts
export function useVisualBeatProgress(target: string): number {
  const current = useCurrentFrame();
  const { startFrame, durationFrames } = useVisualBeatBinding(target);
  return interpolate(current, [startFrame, startFrame + Math.max(1, durationFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}
```

- [ ] **Step 5: Wrap routed scenes with frame bindings**

In `Video.tsx`, pass the current frame and output-plan registry into the provider:

```tsx
const bindings = plan.visualBindings?.[frame.slug] ?? [];
return (
  <VisualBeatProvider frame={frame} bindings={bindings}>
    <Scene opacity={opacity} />
  </VisualBeatProvider>
);
```

Legacy scenes without bindings remain valid when the project is in warn/off mode.

- [ ] **Step 6: Run focused tests and template typecheck**

```bash
node --test frameworks/remotion/__tests__/visual_beats.test.ts
corepack npm run typecheck:remotion
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frameworks/remotion/templates/src frameworks/remotion/__tests__/visual_beats.test.ts
git commit -m "feat(remotion): add cue-bound reveal helpers"
```

---

- [ ] **Task 13: Validate, emit, and verify the Remotion static registry** `[Group: remotion-sync]` `[Tester: yes]`

**Files:**
- Create: `frameworks/remotion/visual_bindings.ts`
- Modify: `frameworks/remotion/emit.ts:28-76`
- Modify: `frameworks/remotion/verify.ts:52-110`
- Modify: `frameworks/remotion/__tests__/emit.test.ts`
- Modify: `frameworks/remotion/__tests__/verify.test.ts`

- [ ] **Step 1: Write failing registry parser and adapter tests**

Use this authored output-local file:

```json
{
  "version": 1,
  "frames": {
    "reserve-flow": [
      { "beat": "reserve", "target": "WorkflowStep:reserve", "enter": "rise", "duration": 0.5 },
      { "beat": "execute", "target": "WorkflowStep:execute", "enter": "rise", "duration": 0.5 },
      { "beat": "settle", "target": "WorkflowStep:settle", "enter": "rise", "duration": 0.5 }
    ]
  }
}
```

Tests must prove:

- the registry validates without importing TSX;
- unknown frame/beat and duplicate target fail;
- normalized bindings are embedded into output `build_plan.json`;
- `build/visual_bindings.json` uses shared `VisualBindingManifest` shape;
- second builds replace stale manifest content;
- verifier reports missing/early/order/duration findings through `verifyVisualSync()`.

- [ ] **Step 2: Run and confirm failure**

```bash
node --test frameworks/remotion/__tests__/emit.test.ts frameworks/remotion/__tests__/verify.test.ts
```

Expected: FAIL because no registry reader or manifest exists.

- [ ] **Step 3: Implement the pure JSON registry reader**

Create `frameworks/remotion/visual_bindings.ts`:

```ts
export interface RemotionBindingSpec {
  version: 1;
  frames: Record<string, Array<{
    beat: string;
    target: string;
    enter: "fade" | "rise" | "slide-left" | "scale" | "none";
    duration: number;
  }>>;
}

export function readRemotionBindingSpec(path: string): RemotionBindingSpec;

export function resolveRemotionBindings(
  spec: RemotionBindingSpec,
  plan: BuildPlan,
): { runtimeBindings: RemotionBindingSpec["frames"]; manifest: VisualBindingManifest };
```

For each normalized manifest entry:

```ts
{
  frameSlug,
  beatId: authored.beat,
  target: authored.target,
  revealStart: beat.start,
  revealDuration: authored.duration,
  source: "custom",
  authoredDuration: frame.voiceDur,
  outerDuration: frame.frameDur,
}
```

- [ ] **Step 4: Integrate registry resolution into Remotion emission**

During full emit:

1. Read `<output>/visual_bindings.json` if present.
2. In required mode, fail when planned beats exist but the registry is absent.
3. Normalize against the neutral plan.
4. Write output `build_plan.json` with additive `visualBindings` runtime data.
5. Write `build/visual_bindings.json` with shared manifest data.
6. Retain normalized visual bindings during captions-only regroup emission.

Add `bindingManifestPath: "build/visual_bindings.json"` and ensure build always promotes it.

- [ ] **Step 5: Make Remotion verification plan-aware**

Change the verifier to `verify(context: AdapterVerifyContext)`, preserve current composition/canvas/caption/voice checks, and append the common semantic verifier. Implement mandatory `resolveVerificationFps()` on the Remotion adapter by returning the adapter-owned composition FPS constant used by the shipped `Root.tsx`; do not parse arbitrary scene TSX. Check semantic scene duration against `voiceDur` and sequence duration against `frameDur` with the FPS-derived tolerance.

Add a parity test that reads the shipped `frameworks/remotion/templates/src/Root.tsx` contract and proves the adapter resolver returns the same FPS. The test must fail if one side changes independently.

- [ ] **Step 6: Run focused tests**

```bash
node --test \
  frameworks/remotion/__tests__/visual_beats.test.ts \
  frameworks/remotion/__tests__/emit.test.ts \
  frameworks/remotion/__tests__/verify.test.ts \
  engine/__tests__/visual_sync.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frameworks/remotion/visual_bindings.ts frameworks/remotion/emit.ts frameworks/remotion/verify.ts frameworks/remotion/__tests__
git commit -m "feat(remotion): verify static visual bindings"
```

---

- [ ] **Task 14: Migrate the public Remotion example and prove parity** `[Group: remotion-sync]` `[Tester: yes]`

**Files:**
- Modify: `examples/hash-table/remotion/src/scenes/LookupFlowScene.tsx`
- Modify: `examples/hash-table/remotion/src/Video.tsx`
- Create: `examples/hash-table/remotion/visual_bindings.json`
- Modify: `examples/hash-table/remotion/README.md`
- Modify: `examples/hash-table/remotion/video.config.json`
- Modify: `test/examples/hash-table-remotion.test.ts`
- Modify: `frameworks/remotion/__tests__/scaffold.test.ts`

- [ ] **Step 1: Replace hardcoded-cue expectations with binding expectations**

Update the test to reject the current array:

```ts
assert.doesNotMatch(sceneSource, /const CUES\s*=\s*\[/);
assert.match(sceneSource, /useVisualBeatProgress\("LookupFlow:/);
assert.equal(existsSync(join(exampleRoot, "visual_bindings.json")), true);
const readme = readFileSync(join(exampleRoot, "README.md"), "utf8");
assert.match(readme, /cp .*visual_bindings\.json \./);
assert.match(readme, /visual_beats\.json/);
assert.match(readme, /after narration.*transcript|after transcription/i);
```

Assert registry beat IDs match the example's visual beat IDs, all targets are unique, and README installation copies both scene source and the required output-local registry.

- [ ] **Step 2: Run and confirm failure**

```bash
node --test test/examples/hash-table-remotion.test.ts frameworks/remotion/__tests__/scaffold.test.ts
```

Expected: FAIL because the example still uses `CUES` and scaffolds lack new helper expectations.

- [ ] **Step 3: Migrate the example scene**

Replace:

```ts
const CUES = [2.4, 4.8, 7.5, 12.1];
```

with target-owned progress:

```ts
const probe = useVisualBeatProgress("LookupFlow:probe");
const match = useVisualBeatProgress("LookupFlow:match");
const returnValue = useVisualBeatProgress("LookupFlow:return");
```

Add matching output-local `visual_bindings.json`. Update the README installation flow to copy the registry with the scene source:

```bash
cp examples/hash-table/remotion/src/Video.tsx src/Video.tsx
cp -R examples/hash-table/remotion/src/scenes src/
cp examples/hash-table/remotion/visual_bindings.json .
```

The README must then require the consumer, after narration/transcription, to author or merge compatible neutral `visual_beats.json` entries whose beat IDs match the copied registry before running `npm run plan`. Explain that phrase/word-index anchors resolve timing while `visual_bindings.json` names framework targets only.

- [ ] **Step 4: Add scaffold parity assertions**

Assert generated Remotion projects include `VisualBeats.tsx`, the additive local types, cue-first next steps, and no repository-root imports.

- [ ] **Step 5: Run Part 4 tests**

```bash
node --test \
  frameworks/remotion/__tests__/visual_beats.test.ts \
  frameworks/remotion/__tests__/scaffold.test.ts \
  frameworks/remotion/__tests__/emit.test.ts \
  frameworks/remotion/__tests__/verify.test.ts \
  test/examples/hash-table-remotion.test.ts
corepack npm run typecheck:remotion
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add examples/hash-table/remotion frameworks/remotion test/examples/hash-table-remotion.test.ts
git commit -m "docs(remotion): migrate example to visual beats"
```

## Part 4 Verification

```bash
node --test \
  frameworks/remotion/__tests__/visual_beats.test.ts \
  frameworks/remotion/__tests__/scaffold.test.ts \
  frameworks/remotion/__tests__/emit.test.ts \
  frameworks/remotion/__tests__/verify.test.ts \
  test/examples/hash-table-remotion.test.ts
corepack npm run typecheck:remotion
corepack npm run typecheck
git diff --check
```

Expected: all commands exit `0`; Remotion verification uses static JSON evidence and no semantic scene timing remains in a hardcoded cue array.
