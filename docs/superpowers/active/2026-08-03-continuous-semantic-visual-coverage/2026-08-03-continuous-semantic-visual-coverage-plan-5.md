# Part 5 — Scaffolds, Standards, and Release Evidence

Depends on: `2026-08-03-continuous-semantic-visual-coverage-plan-4.md`.

- [ ] **Task 15: Scaffold v2 coverage and project-standard markers** `[Group: coverage-propagation]` `[Tester: yes]`

**Files:**
- Modify: `scripts/scaffold_project.ts:30-246`
- Modify: `frameworks/hyperframes/scaffold.ts:124-203`
- Modify: `frameworks/remotion/scaffold.ts:37-91`
- Modify: `frameworks/remotion/templates/src/VisualBeats.tsx`
- Modify: `frameworks/remotion/templates/src/types.ts`
- Modify: `test/cli/scaffold-project.test.ts`
- Modify: `test/cli/scaffold-decoupled.test.ts`
- Modify: `test/scaffold.test.ts`
- Modify: `frameworks/remotion/__tests__/scaffold.test.ts`
- Modify: `scripts/verify.ts`
- Modify: `docs/standards/frameworks/hyperframes.md`
- Modify: `docs/standards/frameworks/remotion.md`
- Regenerate: `skill/md2vid/references/standards/**`
- Modify: `test/cli/workflows.test.ts`

- [ ] **Step 1: Write failing scaffold defaults and artifact tests**

Update scaffold assertions to require:

```ts
assert.deepEqual(config.visualSync, {
  mode: "required",
  coverageMode: "required",
  maxLead: 0.25,
  maxLag: 0.75,
  maxUncoveredGap: 0.5,
  minLanding: 1,
});

assert.deepEqual(readJson(join(project, "visual_beats.json.example")), {
  version: 2,
  frames: {
    "frame-slug": {
      kind: "focal",
      beats: [
        {
          id: "opening-context",
          text: "Opening context",
          role: "focal",
          cue: { frameStart: true },
          coverage: { until: "next-state" },
        },
        {
          id: "body-detail",
          text: "Body detail",
          role: "focal",
          cue: { phrase: "body detail", occurrence: 1 },
          coverage: { until: "next-state" },
        },
        {
          id: "final-landing",
          text: "Final landing",
          role: "focal",
          cue: { phrase: "final landing", occurrence: 1 },
          coverage: { until: "frame-end" },
        },
      ],
      coverageExemptions: [],
    },
  },
});
```

Assert generated next steps say:

```text
transcribe → author visual-beats v2 → plan → inspect coverage intervals
→ bind semantic targets → build → verify continuous coverage → review → render
```

Assert both project-local standards contain:

```text
md2vid-continuous-visual-coverage: 2
```

Add workflow tests:

- missing marker under legacy warn mode emits one manual-refresh warning;
- missing marker under v2 required coverage is an error;
- current marker passes;
- verifier never overwrites the local standard;
- diagnostic names the canonical source and exact project-local destination.

- [ ] **Step 2: Run scaffold/workflow tests and confirm failure**

Run:

```bash
node --test \
  test/cli/scaffold-project.test.ts \
  test/cli/scaffold-decoupled.test.ts \
  test/scaffold.test.ts \
  frameworks/remotion/__tests__/scaffold.test.ts \
  test/cli/workflows.test.ts
```

Expected: FAIL because scaffolds emit v1 examples, lack coverage defaults, and standards have no marker.

- [ ] **Step 3: Replace common scaffold defaults and example**

Set the common policy exactly:

```ts
const REQUIRED_VISUAL_SYNC = {
  mode: "required",
  coverageMode: "required",
  maxLead: 0.25,
  maxLag: 0.75,
  maxUncoveredGap: 0.5,
  minLanding: 1,
} as const;
```

Replace `VISUAL_BEATS_EXAMPLE` with the version-2 object asserted in Step 1. Keep the canonical public field name `beats`; do not scaffold exemptions beyond an empty array.

Tighten common Remotion runtime validation so generated projects must contain:

```text
src/VisualBeats.tsx
src/types.ts
```

Preserve existing plan/build/transcribe/verify/check scripts.

- [ ] **Step 4: Add a stable project-standard marker and verify it without overwriting**

Add this exact comment near the top of both canonical framework standards in this task; scaffold copies it unchanged:

```markdown
<!-- md2vid-continuous-visual-coverage: 2 -->
```

In `scripts/verify.ts`, perform the check after the existing `problem()` and `warn()` accumulators are defined and before adapter verification:

```ts
const expectedMarker = "md2vid-continuous-visual-coverage: 2";
const relativeStandard = `.md2vid/standards/${adapter.name}.md`;
const standardPath = join(layout.outputDir, relativeStandard);
const standardText = existsSync(standardPath)
  ? readFileSync(standardPath, "utf8")
  : "";
const message =
  `${relativeStandard} is missing ${expectedMarker}. `
  + `Refresh it from docs/standards/frameworks/${adapter.name}.md `
  + `without changing authored project files.`;

if (!standardText.includes(expectedMarker)) {
  if (policy.coverageMode === "required") problem(message);
  else warn(message);
}
```

Do not add an automatic upgrade command in this scope.

- [ ] **Step 5: Update framework next steps and runtime source validation**

HyperFrames and Remotion scaffold messages must teach static opening focal, body states, final landing, and full verify before preview/render. Keep framework commands unchanged.

- [ ] **Step 6: Run focused scaffold gates**

Run:

```bash
corepack npm run sync:skill-references
node --test \
  test/cli/scaffold-project.test.ts \
  test/cli/scaffold-decoupled.test.ts \
  test/scaffold.test.ts \
  frameworks/remotion/__tests__/scaffold.test.ts \
  test/cli/workflows.test.ts
corepack npm run check:skill-references
corepack npm run typecheck
corepack npm run typecheck:remotion
```

Expected: PASS. Fresh projects are v2-required and decoupled from repository paths; old project standards receive actionable diagnostics only.

- [ ] **Step 7: Commit**

```bash
git add scripts/scaffold_project.ts frameworks/hyperframes/scaffold.ts frameworks/remotion/scaffold.ts frameworks/remotion/templates/src/VisualBeats.tsx frameworks/remotion/templates/src/types.ts scripts/verify.ts docs/standards/frameworks/hyperframes.md docs/standards/frameworks/remotion.md skill/md2vid/references/standards test/cli/scaffold-project.test.ts test/cli/scaffold-decoupled.test.ts test/scaffold.test.ts frameworks/remotion/__tests__/scaffold.test.ts test/cli/workflows.test.ts
git commit -m "feat(scaffold): require continuous visual coverage"
```

---

- [ ] **Task 16: Update canonical standards, md2vid skill, and README** `[Group: coverage-propagation]` `[Tester: yes]`

**Files:**
- Modify: `docs/standards/video-generation.md:49-68,247-268`
- Modify: `docs/standards/design/frame.md:139-145,250-260`
- Modify: `docs/standards/design/knowledge-expression.md:60-78`
- Modify: `docs/standards/design/frame-content.md:5-20`
- Modify: `docs/standards/frameworks/hyperframes.md:1-132`
- Modify: `docs/standards/frameworks/remotion.md:1-57`
- Modify: `skill/md2vid/SKILL.md:37-77,266-414`
- Modify: `README.md:109-120,154-186`
- Regenerate: `skill/md2vid/references/standards/**`
- Modify: `test/cli/skill-references.test.ts`
- Modify: `test/cli/skill-commands.test.ts`
- Modify: `test/docs-boundary.test.ts`

- [ ] **Step 1: Write failing standards and skill contract tests**

Assert every canonical/bundled standard contains the required language. Example:

```ts
const videoStandard = readFileSync(
  "docs/standards/video-generation.md",
  "utf8",
);
assert.match(videoStandard, /continuous semantic visual coverage/i);
assert.match(videoStandard, /first spoken word.*held landing/is);
assert.match(videoStandard, /captions.*do not.*satisfy/is);
assert.match(videoStandard, /maxUncoveredGap/);

const hyperframesStandard = readFileSync(
  "docs/standards/frameworks/hyperframes.md",
  "utf8",
);
assert.match(
  hyperframesStandard,
  /md2vid-continuous-visual-coverage: 2/,
);
assert.match(hyperframesStandard, /data-md2vid-coverage="planned"/);
assert.match(hyperframesStandard, /owned semantic exit/i);

const remotionStandard = readFileSync(
  "docs/standards/frameworks/remotion.md",
  "utf8",
);
assert.match(remotionStandard, /BeatState/);
assert.match(remotionStandard, /authored input digest/i);
```

Assert `skill/md2vid/SKILL.md` requires:

- storyboard opening/body/final coverage map;
- `visual_beats.json` v2 after transcription;
- inspect intervals after `npm run plan`;
- continuous verify before preview/render;
- captions/title/background alone are insufficient;
- no fixed motion cadence.

Assert README documents v1 compatibility, v2 schema, configuration, manifest freshness, both frameworks, and manual project-standard refresh.

- [ ] **Step 2: Run contract tests and confirm failure**

Run:

```bash
node --test \
  test/cli/skill-references.test.ts \
  test/cli/skill-commands.test.ts \
  test/docs-boundary.test.ts
```

Expected: FAIL because current guidance is reveal-point-only and framework standards lack the marker.

- [ ] **Step 3: Update the canonical neutral and design standards**

Add this normative paragraph to `video-generation.md`:

```markdown
### Continuous semantic visual coverage

Every narrated frame maintains at least one bound focal semantic state from its first spoken word through its held landing. A state may remain completely static while narration continues to explain the same concept. Captions, backgrounds, logos, decoration, persistent headings, and shell chrome do not satisfy coverage by themselves. No unapproved uncovered interval may exceed `visualSync.maxUncoveredGap`; this applies before the first focal, between states, and through frame end.
```

Update the verification checklist with every-frame representation, opening/middle/ending coverage, exemption review, manifest freshness, and project-standard marker checks.

Update `frame.md`, `knowledge-expression.md`, and `frame-content.md` so:

```text
at every narrated timestamp:
active focal semantic state = narration concept = caption concept
```

Document static focal validity, owned exits, shell exclusion, transition gaps, and held landing. Preserve the visual theme and existing treatment mapping.

- [ ] **Step 4: Update framework standards and markers**

Place this exact marker near the top of both framework standards:

```markdown
<!-- md2vid-continuous-visual-coverage: 2 -->
```

HyperFrames guidance must show:

```html
<div data-md2vid-beat="opening-context" data-md2vid-enter="none" data-md2vid-coverage="planned"></div>
```

and document planned retention, owned exits, raw frame-source digests, and host retention through `frameDur`.

Remotion guidance must show `BeatState`, interval-aware `BeatReveal`, registry v2, shared boundary quantization, and registry/source-tree freshness.

- [ ] **Step 5: Update the skill and README workflow**

Use this sequence consistently:

```text
source coverage → storyboard semantic coverage map → script
→ narration/transcription → visual_beats v2 → npm run plan
→ inspect resolved intervals → bind framework visibility → full build
→ continuous verify → preview/manual semantic review → render
```

Document that manual review judges semantic honesty and treatment quality; machine verification proves declared/bound continuity.

- [ ] **Step 6: Regenerate bundled standards and run focused tests**

Run:

```bash
corepack npm run sync:skill-references
node --test \
  test/cli/skill-references.test.ts \
  test/cli/skill-commands.test.ts \
  test/docs-boundary.test.ts
corepack npm run check:skill-references
```

Expected: PASS; bundled references are byte-equal to canonical sources. Do not hand-edit generated copies.

- [ ] **Step 7: Commit**

```bash
git add docs/standards skill/md2vid README.md test/cli/skill-references.test.ts test/cli/skill-commands.test.ts test/docs-boundary.test.ts
git commit -m "docs(md2vid): require continuous visual coverage"
```

---

- [ ] **Task 17: Add golden, integration, browser, and packed regression evidence** `[Group: coverage-propagation]` `[Tester: yes]`

**Files:**
- Modify: `test/golden/fixtures/visual-timing-sync/inputs/visual_beats.json`
- Modify: `test/golden/fixtures/visual-timing-sync/inputs/visual_bindings.json`
- Modify: `test/golden/fixtures/visual-timing-sync/expected/visual_timing.json`
- Modify: `test/golden/golden.test.ts:117-149`
- Create: `test/golden/fixtures/continuous-visual-coverage/**`
- Modify: `test/visual/composed-visual-integrity.test.ts`
- Modify: `test/cli/pack.test.ts`
- Modify: `test/ci/public-snapshot-check.test.ts`
- Modify: `test/release/manifest.ts` if new shipped files exist
- Modify: `test/release/harness.ts`
- Modify: `test/release/harness.test.ts`

- [ ] **Step 1: Write failing golden and release assertions**

Convert the existing `2.95/11.06/14.35` fixture to v2 while preserving the proof that unvoiced leading silence is valid. Assert:

```ts
assert.equal(result.frames[0].visualBeats?.[0]?.start, 2.95);
assert.equal(result.frames[0].visualBeats?.[0]?.end, 11.06);
assert.equal(result.frames[0].words[0].start, 2.95);
```

Create a synthetic fixture with:

```json
{
  "firstWordStart": 0.07,
  "lateFocalStart": 18.26,
  "frameDuration": 23.08
}
```

Variants must prove:

- no early focal → `opening_visual_gap`;
- frame-start focal to `18.26` → pass opening;
- focal ends at `6`, next starts `18.26` → `mid_scene_visual_gap`;
- final focal ends before `23.08` → `ending_visual_gap`;
- supporting-only/captions-only/shell-only → complete-frame opening gap;
- static focal for fifteen seconds → pass.

Add packed smoke assertions for manifest v2, plan/source digests, project-standard marker, HyperFrames static state, Remotion `BeatState`, and stale mutation rejection.

- [ ] **Step 2: Run golden, visual, pack, and release tests and confirm failure**

Run:

```bash
node --test \
  test/golden/golden.test.ts \
  test/visual/composed-visual-integrity.test.ts \
  test/cli/pack.test.ts \
  test/ci/public-snapshot-check.test.ts \
  test/release/harness.test.ts
```

Expected: FAIL until fixtures, browser probes, package paths, and release smoke match v2.

- [ ] **Step 3: Update exact golden inputs and expected bytes**

Keep byte-exact expected JSON with final newline. Do not rewrite legacy coverage behavior accidentally; retain a separate v1 compatibility fixture if the converted golden no longer proves v1.

Use the synthetic fixture rather than the retained ledger project.

- [ ] **Step 4: Extend browser and packed smoke evidence**

Browser smoke derives samples from `coverageStart`/`coverageEnd`, checks direct/reverse/sequential visibility, and includes final host landing. It must not infer semantic truth from pixel motion.

Packed smoke must execute from an unrelated working directory and prove shipped `dist` helpers, templates, standards, skill copies, and manifest-v2 parser are present. Add any new `dist/engine/visual_evidence.js` path to release manifest and pack assertions.

- [ ] **Step 5: Run focused integration gates**

Run:

```bash
node --test \
  test/golden/golden.test.ts \
  test/visual/composed-visual-integrity.test.ts \
  test/cli/pack.test.ts \
  test/ci/public-snapshot-check.test.ts \
  test/release/harness.test.ts
corepack npm run typecheck
corepack npm run typecheck:remotion
```

Expected: PASS. Golden bytes, real browser state, packed package behavior, and release harness agree with the design.

- [ ] **Step 6: Commit**

```bash
git add test/golden test/visual/composed-visual-integrity.test.ts test/cli/pack.test.ts test/ci/public-snapshot-check.test.ts test/release/manifest.ts test/release/harness.ts test/release/harness.test.ts
git commit -m "test(md2vid): cover continuous visual coverage"
```

---

- [ ] **Task 18: Regenerate public snapshot and run final release gates** `[Tester: yes]`

**Files:**
- Regenerate: `public-snapshot.json`
- Modify only if required by actual shipped paths: `test/release/manifest.ts`
- Modify only if required by actual snapshot inventory: `test/ci/public-snapshot.test.ts`

- [ ] **Step 1: Confirm the intended implementation is committed**

Run:

```bash
git status --short
git log -1 --oneline
```

Expected: no uncommitted implementation files before snapshot generation. The only allowed pending work is the snapshot update created in the next step. If implementation files are dirty, stop and commit the completed prior task first because snapshot generation reads committed Git state.

- [ ] **Step 2: Regenerate the public snapshot from the intended commit**

Run:

```bash
corepack npm run public:snapshot
```

Expected: `public-snapshot.json` changes to the committed public inventory and hashes. Never hand-edit counts or digests.

- [ ] **Step 3: Run the complete verification matrix**

Run:

```bash
corepack npm run typecheck
corepack npm run typecheck:remotion
corepack npm test
corepack npm run check:skill-references
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected: every command exits `0` with no stale skill copy, snapshot mismatch, package omission, browser failure, or release-smoke failure.

- [ ] **Step 4: Inspect final scope**

Run:

```bash
git status --short
git diff --stat HEAD
git diff -- public-snapshot.json
```

Expected: only the generated snapshot change remains uncommitted; the diff corresponds to intended source additions/changes already committed. No `.tmp` project, user-generated output, requirements/design source, or unrelated refactor is modified.

- [ ] **Step 5: Commit the generated snapshot**

```bash
git add public-snapshot.json
git commit -m "chore(public): refresh coverage snapshot"
```

- [ ] **Step 6: Re-run final clean-tree proof**

Run:

```bash
corepack npm run public:snapshot:check
corepack npm run release:check
git diff --check
git status --short
```

Expected: every command exits `0`; `git status --short` is empty.

## Part 5 Completion Gate

Run:

```bash
corepack npm run typecheck
corepack npm run typecheck:remotion
corepack npm test
corepack npm run check:skill-references
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
git status --short
```

Expected: all commands exit `0`, status is clean, and shipped standards/runtime/tests enforce continuous semantic visual coverage across every narrated interval.
