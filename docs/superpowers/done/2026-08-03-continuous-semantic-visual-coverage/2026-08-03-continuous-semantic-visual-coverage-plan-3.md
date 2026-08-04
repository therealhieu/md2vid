# Part 3 — HyperFrames Owned Semantic Visibility

Depends on: `2026-08-03-continuous-semantic-visual-coverage-plan-2.md`.

- [ ] **Task 9: Add HyperFrames v2 coverage declarations and owned visibility** `[Group: hyperframes-coverage]` `[Tester: yes]`

**Files:**
- Modify: `frameworks/hyperframes/visual_timing.ts:12-450`
- Modify: `frameworks/hyperframes/__tests__/visual_timing.test.ts`

- [ ] **Step 1: Write failing declarative and custom coverage tests**

Add a v2 frame fixture containing a static opening focal, an animated body focal, and a supporting target:

```ts
const FRAME_V2: PlanFrame = {
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
  visualBeats: [
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
    {
      version: 2,
      id: "label",
      text: "Supporting label",
      role: "supporting",
      start: 0,
      end: 23.08,
      cueText: "<frame-start>",
      sourceRefs: [],
      tolerance: { maxLead: 0.25, maxLag: 0.75 },
    },
  ],
};
```

Use authored HTML:

```html
<article id="opening" data-md2vid-beat="opening" data-md2vid-enter="none" data-md2vid-coverage="planned">Opening</article>
<article id="solution" data-md2vid-beat="solution" data-md2vid-enter="rise" data-md2vid-duration="0.48" data-md2vid-coverage="planned">Solution</article>
<span id="label" data-md2vid-beat="label" data-md2vid-enter="none" data-md2vid-coverage="planned">Label</span>
```

Add tests:

```ts
test("emits v2 coverage evidence for static and animated targets", () => {
  const result = prepareFrameVisualTiming({
    frame: FRAME_V2,
    authoredHtml: frameHtml(AUTHORED_V2),
    documentPath: "compositions/frames/overview.html",
    mode: "required",
  });
  assert.deepEqual(result.bindings.map((binding) => ({
    beatId: binding.beatId,
    role: binding.role,
    revealStart: binding.revealStart,
    coverageStart: binding.coverageStart,
    coverageEnd: binding.coverageEnd,
    source: binding.source,
  })), [
    {
      beatId: "opening",
      role: "focal",
      revealStart: 0,
      coverageStart: 0,
      coverageEnd: 18.26,
      source: "static",
    },
    {
      beatId: "solution",
      role: "focal",
      revealStart: 18.26,
      coverageStart: 18.26,
      coverageEnd: 23.08,
      source: "declarative",
    },
    {
      beatId: "label",
      role: "supporting",
      revealStart: 0,
      coverageStart: 0,
      coverageEnd: 23.08,
      source: "static",
    },
  ]);
});
```

Add runtime `vm` tests asserting:

- before `0`, no semantic target is active;
- opening target is visible at `0`, `5`, and immediately before `18.26`;
- opening is inactive and solution active immediately after `18.26` when planned retention hands off;
- solution remains active through inner authored duration `22.08`;
- final evidence ends at outer `frameDur=23.08` without appending a hide that extends the inner GSAP timeline;
- direct seek, reverse seek, and sequential progression agree;
- `data-md2vid-coverage` on an unplanned shell target fails rather than auto-binding it.

Add custom declaration tests:

```html
<script type="application/json" data-md2vid-custom-bindings>
{"bindings":[{"beat":"solution","target":"#solution","method":"from","duration":0.7,"coverage":"planned"}]}
</script>
```

Require the owned helper call to match the declaration and add an owned `exit(..., { at: "coverage-end" })` test for an intermediate state.

- [ ] **Step 2: Run HyperFrames timing tests and confirm failure**

Run:

```bash
node --test frameworks/hyperframes/__tests__/visual_timing.test.ts
```

Expected: FAIL because v2 roles/intervals, `data-md2vid-coverage`, static source classification, retention, and owned exits do not exist.

- [ ] **Step 3: Extend exact declarative and custom parsing**

Add coverage to the accepted declarative fields and custom declaration:

```ts
interface CustomBindingDeclarationV2 {
  beat: string;
  target: string;
  method: "from" | "fromTo" | "set";
  duration: number;
  coverage?: "planned";
}
```

For declarative targets:

```ts
const coverage = element.getAttribute("data-md2vid-coverage");
if (coverage !== null && coverage !== "planned") {
  throw new Error(
    `${frame.slug}: data-md2vid-coverage must be "planned"`,
  );
}
```

Require `coverage: "planned"` for v2 focal/supporting semantic evidence. Preserve v1 reveal-only behavior in compatibility mode.

Classify `enter="none"` with zero duration as `source: "static"`; other generated declarative targets remain `source: "declarative"`. Do not infer static source solely from role.

- [ ] **Step 4: Serialize role, start, end, and deterministic owned visibility**

Serialize v2 beat data into the generated runtime:

```ts
const timingData = Object.fromEntries(
  frame.visualBeats?.map((beat) => [beat.id, beat.version === 2
    ? {
        version: 2,
        start: beat.start,
        end: beat.end,
        role: beat.role,
      }
    : { version: 1, start: beat.start }]) ?? [],
);
```

Generate activation/deactivation without changing the `.clip` visibility contract. Use wrapper/target `autoAlpha` only through timeline-owned boundary sets:

```js
function scheduleCoverage(tl, target, beat) {
  tl.set(target, { autoAlpha: 1 }, beat.start);
  if (beat.end < FRAME_VOICE_DURATION) {
    tl.set(target, { autoAlpha: 0 }, beat.end);
  }
}
```

Important final-state rule:

- the inner authored composition duration remains `voiceDur`;
- intermediate `end <= voiceDur` may schedule owned deactivation;
- a final `end === frameDur > voiceDur` does **not** append an inner hide at `frameDur`;
- HyperFrames host retention freezes/retains the final inner state through the outer host tail, and evidence records `coverageEnd = frameDur`.

Keep entrance tweens at `beat.start` and compose coverage sets with the one paused registered timeline.

- [ ] **Step 5: Add owned custom exit validation**

Extend `window.__md2vidTiming.forFrame(slug)` with an exit method that accepts only a declared custom binding and planned endpoint:

```js
exit(tl, beatId, target, options = { at: "coverage-end" }) {
  const beat = requireV2Beat(beatId);
  requireDeclaredBinding(beatId, target);
  if (options.at !== "coverage-end") {
    throw new Error("md2vid exit supports only coverage-end");
  }
  if (beat.end <= FRAME_VOICE_DURATION) {
    tl.set(target, { autoAlpha: 0 }, beat.end);
  }
  return tl;
}
```

The helper does not return numeric timestamps. Unsupported freehand semantic exits remain outside strict coverage.

- [ ] **Step 6: Run timing tests and typecheck**

Run:

```bash
node --test frameworks/hyperframes/__tests__/visual_timing.test.ts
corepack npm run typecheck
```

Expected: PASS. v1 reveal behavior remains intact; v2 runtime/evidence agree across direct and reverse seeks.

- [ ] **Step 7: Commit**

```bash
git add frameworks/hyperframes/visual_timing.ts frameworks/hyperframes/__tests__/visual_timing.test.ts
git commit -m "feat(hyperframes): own semantic visibility intervals"
```

---

- [ ] **Task 10: Emit fresh HyperFrames manifest-v2 evidence** `[Group: hyperframes-coverage]` `[Tester: yes]`

**Files:**
- Modify: `frameworks/hyperframes/emit.ts:293-437`
- Modify: `frameworks/hyperframes/index.ts:11-28`
- Modify: `frameworks/hyperframes/verify.ts:62-174`
- Modify: `frameworks/hyperframes/__tests__/emit.test.ts`
- Modify: `frameworks/hyperframes/__tests__/verify.test.ts`
- Modify: `test/cli/workflows.test.ts`

- [ ] **Step 1: Write failing manifest and source-mutation tests**

Add emit assertions:

```ts
test("HyperFrames emits manifest v2 with plan and raw frame digests", () => {
  const result = preflightCoverageProject();
  const manifest = result.bindingManifest;
  assert.equal(manifest?.version, 2);
  assert.match(manifest?.planSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.deepEqual(manifest?.authoredInputs.map(({ path }) => path), [
    "compositions/frames/overview.html",
  ]);
  assert.match(manifest?.authoredInputs[0]?.sha256 ?? "", /^[a-f0-9]{64}$/);
  assert.equal(manifest?.bindings[0]?.coverageEnd, 18.26);
});
```

Add verification workflow tests:

```ts
test("HyperFrames verify rejects frame mutation after full build", () => {
  const project = buildCoverageProject();
  appendFileSync(
    join(project, "compositions/frames/overview.html"),
    "\n<!-- semantic mutation -->\n",
  );
  const result = verifyProject(project);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /stale_visual_evidence/);
  assert.match(result.stderr, /compositions\/frames\/overview\.html/);
});

test("HyperFrames verify rejects a newly planned frame source set", () => {
  const project = buildCoverageProject();
  addPlannedFrame(project, "second");
  const result = verifyProject(project);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /compositions\/frames\/second\.html/);
});
```

Add rollback coverage proving old manifest and neutral plan remain together after a failed full-build promotion.

- [ ] **Step 2: Run adapter tests and confirm failure**

Run:

```bash
node --test \
  frameworks/hyperframes/__tests__/emit.test.ts \
  frameworks/hyperframes/__tests__/verify.test.ts \
  test/cli/workflows.test.ts
```

Expected: FAIL because preflight emits manifest v1 without digests.

- [ ] **Step 3: Hash raw authored frame bytes before preparation**

In HyperFrames preflight, read each planned frame once and retain both raw bytes and prepared output:

```ts
const authoredInputs = plan.frames.map((frame) => {
  const relativePath = `compositions/frames/${frame.slug}.html`;
  const absolutePath = join(videoDir, relativePath);
  const bytes = readFileSync(absolutePath);
  return { frame, relativePath, bytes };
});

const preparedFrames = authoredInputs.map(({ frame, relativePath, bytes }) =>
  prepareFrameVisualTiming({
    frame,
    authoredHtml: bytes.toString("utf8"),
    documentPath: relativePath,
    mode: policy.mode,
  })
);
```

Build manifest v2 only when the plan contains v2 states:

```ts
const bindingManifest: VisualBindingManifestV2 = {
  version: 2,
  framework: "hyperframes",
  planSha256: hashCoveragePlan(plan),
  authoredInputs: digestAuthoredInputs(
    authoredInputs.map(({ relativePath, bytes }) => ({
      path: relativePath,
      bytes,
    })),
  ),
  bindings: preparedFrames.flatMap((prepared) => prepared.bindings),
  frames: preparedFrames.map((prepared) => prepared.durationEvidence),
};
```

Use the same plan-derived path list in `collectVisualBindingInputs` registered by `frameworks/hyperframes/index.ts`.

- [ ] **Step 4: Keep structural verification and outer-duration retention intact**

Preserve `withObservedOuterDurations()` and the existing checks:

```ts
const observedManifest = withObservedOuterDurations(
  context.bindings,
  context.videoDir,
);
return [
  ...layoutFindings,
  ...verifyVisualSync({
    plan: context.plan,
    manifest: observedManifest,
    policy: context.policy,
    fps: context.fps,
    freshness: context.visualEvidenceFreshness,
  }),
];
```

Do not interpret the inner root's `voiceDur` as the final coverage end. The host's observed `frameDur` proves final-state retention through landing.

- [ ] **Step 5: Run adapter and workflow tests**

Run:

```bash
node --test \
  frameworks/hyperframes/__tests__/visual_timing.test.ts \
  frameworks/hyperframes/__tests__/emit.test.ts \
  frameworks/hyperframes/__tests__/verify.test.ts \
  test/cli/workflows.test.ts
corepack npm run typecheck
```

Expected: PASS. Full build emits atomically fresh v2 evidence; post-build raw HTML mutations fail verify.

- [ ] **Step 6: Commit**

```bash
git add frameworks/hyperframes/emit.ts frameworks/hyperframes/index.ts frameworks/hyperframes/verify.ts frameworks/hyperframes/__tests__/emit.test.ts frameworks/hyperframes/__tests__/verify.test.ts test/cli/workflows.test.ts
git commit -m "feat(hyperframes): emit coverage evidence"
```

---

- [ ] **Task 11: Prove HyperFrames seek safety and update the authored template** `[Group: hyperframes-coverage]` `[Tester: yes]`

**Files:**
- Modify: `frameworks/hyperframes/templates/frame-template.html:72-129`
- Modify: `frameworks/hyperframes/__tests__/visual_timing.test.ts`
- Modify: `test/visual/composed-visual-integrity.test.ts`
- Modify: `test/release/harness.ts`
- Modify: `test/release/harness.test.ts`

- [ ] **Step 1: Write failing template and browser-seek assertions**

Add a template contract test proving the scaffolded source contains:

```text
data-md2vid-beat="opening-context"
data-md2vid-enter="none"
data-md2vid-coverage="planned"
data-md2vid-beat="body-detail"
data-md2vid-beat="final-landing"
```

Extend the browser harness sample generator to include, for each v2 binding:

```ts
const samples = [
  Math.max(0, binding.coverageStart - 0.01),
  binding.coverageStart,
  Math.min(binding.coverageEnd, binding.coverageStart + 0.1),
  Math.max(binding.coverageStart, binding.coverageEnd - 0.01),
  binding.coverageEnd,
];
```

For each sample, capture direct seek, sequential seek, and reverse-then-forward seek state. Assert target visibility matches manifest evidence and all three routes agree.

Add a final landing sample between `voiceDur` and `frameDur` proving the outer host retains the final focal state.

- [ ] **Step 2: Run browser/template tests and confirm failure**

Run:

```bash
node --test frameworks/hyperframes/__tests__/visual_timing.test.ts
node --test test/visual/composed-visual-integrity.test.ts
node --test test/release/harness.test.ts
```

Expected: FAIL because the template teaches point reveals only and browser probes do not cover semantic interval boundaries.

- [ ] **Step 3: Replace the template's point-only example with three semantic states**

Use authored content-neutral markup:

```html
<article
  id="FRAME_ID-opening-context"
  class="clip focal-card"
  data-start="0"
  data-duration="VOICEDUR"
  data-track-index="0"
  data-md2vid-beat="opening-context"
  data-md2vid-enter="none"
  data-md2vid-coverage="planned"
>
  <h2>Opening context</h2>
</article>

<article
  id="FRAME_ID-body-detail"
  class="clip focal-card"
  data-start="0"
  data-duration="VOICEDUR"
  data-track-index="1"
  data-md2vid-beat="body-detail"
  data-md2vid-enter="rise"
  data-md2vid-duration="0.48"
  data-md2vid-coverage="planned"
>
  <h2>Body detail</h2>
</article>

<article
  id="FRAME_ID-final-landing"
  class="clip focal-card"
  data-start="0"
  data-duration="VOICEDUR"
  data-track-index="2"
  data-md2vid-beat="final-landing"
  data-md2vid-enter="rise"
  data-md2vid-duration="0.48"
  data-md2vid-coverage="planned"
>
  <h2>Final landing</h2>
</article>
```

Keep all load-bearing content above the caption safe area, preserve one paused timeline, and avoid example subject matter.

- [ ] **Step 4: Extend deterministic browser checks**

Use manifest-v2 intervals as the expected truth. Browser tests may prove runtime/evidence agreement, but do not classify pixel freezes as semantic failures.

For final host retention, query the composed target after seeking the root timeline into the tail:

```ts
const state = await page.evaluate(
  ({ selector, frameStart, frameEnd }) => {
    window.__player.pause();
    window.__player.seek(frameStart + frameEnd - 0.01);
    const element = document.querySelector(selector);
    return element
      ? {
          opacity: getComputedStyle(element).opacity,
          visible: element.checkVisibility(),
        }
      : null;
  },
  { selector: finalTarget, frameStart, frameEnd },
);
assert.equal(state?.visible, true);
assert.notEqual(state?.opacity, "0");
```

Match existing test harness APIs exactly rather than introducing a second browser runner.

- [ ] **Step 5: Run focused browser, adapter, and type gates**

Run:

```bash
node --test frameworks/hyperframes/__tests__/visual_timing.test.ts
node --test test/visual/composed-visual-integrity.test.ts
node --test test/release/harness.test.ts
corepack npm run typecheck
```

Expected: PASS. Direct/reverse/sequential visibility agrees at every activation/exit boundary, including held landing.

- [ ] **Step 6: Commit**

```bash
git add frameworks/hyperframes/templates/frame-template.html frameworks/hyperframes/__tests__/visual_timing.test.ts test/visual/composed-visual-integrity.test.ts test/release/harness.ts test/release/harness.test.ts
git commit -m "test(hyperframes): prove semantic coverage seeking"
```

## Part 3 Completion Gate

Run:

```bash
corepack npm run typecheck
node --test \
  frameworks/hyperframes/__tests__/visual_timing.test.ts \
  frameworks/hyperframes/__tests__/emit.test.ts \
  frameworks/hyperframes/__tests__/verify.test.ts \
  test/visual/composed-visual-integrity.test.ts \
  test/release/harness.test.ts
git diff --check
```

Expected: all commands exit `0`; HyperFrames runtime visibility, manifest evidence, freshness, and seek behavior agree without changing authored duration authority.
