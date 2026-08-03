# Part 5 — Render Policy, Scaffolds, Standards, and Release

Depends on: Parts 1–4.

- [ ] **Task 15: Enforce final-render FPS policy in the HyperFrames proxy** `[Group: delivery-policy]` `[Tester: yes]`

**Files:**
- Modify: `scripts/hyperframes_cli.ts:109-168`
- Create: `test/cli/hyperframes-render-policy.test.ts`
- Modify: `test/cli/hyperframes-cli.test.ts`
- Modify: `test/cli/hyperframes-self-heal.test.ts`

- [ ] **Step 1: Write failing policy-resolution tests**

Cover every precedence and escape path:

```ts
test("final render defaults to 30 fps", () => {
  const result = preflightHyperframesRender(["render", "--output", "renders/video.mp4"], project);
  assert.deepEqual(result.policy, {
    profile: "final",
    fps: 30,
    minimumFinalFps: 24,
    lowFpsOverride: false,
    outputPath: join(project, "renders/video.mp4"),
  });
});

test("12 fps final render fails before spawning", () => {
  let spawned = false;
  const status = runHyperframes(
    ["render", "--output", "renders/video.mp4", "--fps", "12"],
    { cwd: project, spawn: () => { spawned = true; return { status: 0 }; } },
  );
  assert.equal(status, 1);
  assert.equal(spawned, false);
});

test("explicit draft profile allows 12 fps and is not forwarded", () => {
  const result = preflightHyperframesRender([
    "render", "--profile", "draft", "--fps=12", "--output", "renders/draft.mp4",
  ], project);
  assert.equal(result.policy.profile, "draft");
  assert.equal(result.policy.fps, 12);
  assert.equal(result.forwardedArgs.includes("--profile"), false);
  assert.equal(result.forwardedArgs.includes("draft"), false);
});
```

Add cases for config profile/FPS, main-composition `data-fps`, explicit `--profile final|draft|gif`, invalid profile, `--allow-low-fps` consumption, 24/30/60 FPS, MP4/MOV enforcement, non-render command pass-through, failed child/no manifest, successful child/manifest, unknown output path, and `--quality draft` remaining independent. Also write an invalid output config with `minimumFinalFps: 1`; configuration validation must reject it, and a final `--fps 12` request must still fail before spawn. Accept `minimumFinalFps: 24` and stricter values such as `30`, never a value below the fixed 24 FPS floor.

- [ ] **Step 2: Run and confirm failure**

```bash
node --test test/cli/hyperframes-render-policy.test.ts
```

Expected: FAIL because render preflight exports do not exist.

- [ ] **Step 3: Implement explicit policy parsing**

Add exported testable helpers:

```ts
export interface EffectiveRenderPolicy {
  profile: "final" | "draft" | "gif";
  fps: number;
  minimumFinalFps: number;
  lowFpsOverride: boolean;
  outputPath?: string;
}

export function preflightHyperframesRender(
  args: readonly string[],
  cwd: string,
): { forwardedArgs: string[]; policy: EffectiveRenderPolicy };
```

Resolve profile:

```text
--profile → output.config.json render.profile → final
```

Resolve FPS:

```text
--fps/--fps= → output.config.json render.fps → main root data-fps → 30
```

Only inspect the main composition root, not caption `data-fps`. Validate finite positive FPS and `minimumFinalFps`. Remove `--profile` and `--allow-low-fps` before spawn; preserve every other literal argument without shell interpolation.

- [ ] **Step 4: Fail before spawn and write success evidence atomically**

Before invoking HyperFrames:

```ts
if (policy.profile === "final" && policy.fps < policy.minimumFinalFps && !policy.lowFpsOverride) {
  throw new Error(
    `effective final-render FPS is ${policy.fps}; minimum is ${policy.minimumFinalFps}. ` +
    "Use 30 FPS, select --profile draft, or pass --allow-low-fps intentionally.",
  );
}
```

After successful child exit and when output is known, atomically write:

```text
<output>.md2vid-render.json
```

with:

```json
{
  "version": 1,
  "profile": "final",
  "fps": 30,
  "minimumFps": 24,
  "lowFpsOverride": false
}
```

Do not write a success manifest after failed render or when output cannot be determined. Do not add an ffprobe dependency.

- [ ] **Step 5: Run proxy tests**

```bash
node --test \
  test/cli/hyperframes-render-policy.test.ts \
  test/cli/hyperframes-cli.test.ts \
  test/cli/hyperframes-self-heal.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/hyperframes_cli.ts test/cli/hyperframes-render-policy.test.ts test/cli/hyperframes-cli.test.ts test/cli/hyperframes-self-heal.test.ts
git commit -m "fix(render): guard final video frame rates"
```

---

- [ ] **Task 16: Update generated project scaffolds** `[Group: delivery-policy]` `[Tester: yes]`

**Files:**
- Modify: `scripts/scaffold_project.ts:14-135`
- Modify: `frameworks/hyperframes/scaffold.ts:122-184`
- Modify: `frameworks/hyperframes/templates/frame-template.html`
- Modify: `frameworks/remotion/scaffold.ts:37-60`
- Modify: `test/cli/scaffold-project.test.ts`
- Modify: `test/cli/scaffold-decoupled.test.ts`
- Modify: `test/scaffold.test.ts`
- Modify: `frameworks/remotion/__tests__/scaffold.test.ts`

- [ ] **Step 1: Write failing exact scaffold assertions**

Assert generated manifests/config/files contain:

```ts
assert.equal(pkg.scripts.plan, "md2vid plan .");
assert.deepEqual(videoConfig.visualSync, {
  mode: "required",
  maxLead: 0.25,
  maxLag: 0.75,
  minLanding: 1,
});
assert.equal(existsSync(join(project, "visual_beats.json.example")), true);
assert.deepEqual(hyperframesOutput.render, {
  profile: "final",
  fps: 30,
  minimumFinalFps: 24,
});
```

Assert the example contains one workflow, one focal beat, phrase/occurrence and word-index anchors. Assert HyperFrames next steps place `npm run plan` before frame authoring. Assert Remotion includes `VisualBeats.tsx` and cue-first next steps. Keep decoupled scaffolds free of repository-only imports.

- [ ] **Step 2: Run and confirm failure**

```bash
node --test \
  test/cli/scaffold-project.test.ts \
  test/cli/scaffold-decoupled.test.ts \
  test/scaffold.test.ts \
  frameworks/remotion/__tests__/scaffold.test.ts
```

Expected: FAIL on missing plan script/example/config/runtime.

- [ ] **Step 3: Update common scaffold output**

In `scripts/scaffold_project.ts`:

```ts
const VISUAL_BEATS_EXAMPLE = {
  version: 1,
  frames: {
    "replace-with-workflow-slug": {
      kind: "workflow",
      beats: [
        { id: "first-step", text: "First step", cue: { phrase: "first step", occurrence: 1 }, workflowStep: 1, sourceRefs: ["source.md:1-3"] },
        { id: "second-step", text: "Second step", cue: { wordIndex: 8 }, workflowStep: 2, sourceRefs: ["source.md:4-6"] },
      ],
    },
    "replace-with-focal-slug": {
      kind: "focal",
      beats: [{ id: "focal", text: "Main idea", cue: { phrase: "main idea", occurrence: 1 } }],
    },
  },
};
```

Add `visualSync` to neutral config, `plan` to common scripts/conflict checks, write `visual_beats.json.example`, and validate all new files/keys.

- [ ] **Step 4: Update framework scaffolds**

HyperFrames output config gains:

```ts
render: { profile: "final", fps: 30, minimumFinalFps: 24 },
```

Materialize an updated `.hyperframes/frame-template.html` showing declarative and custom declaration/helper patterns without copied semantic timestamps. Update both adapters' next-step arrays to:

```text
review/generate narration
run transcription when needed
author visual_beats.json
npm run plan
author cue-bound visuals
npm run build
npm run check
preview/still/studio
render after review
```

Do not add unused Remotion render config unless `render.ts` and `Root.tsx` consume it end-to-end. Remotion remains 30 FPS through its existing runtime in this change.

- [ ] **Step 5: Run scaffold tests**

```bash
node --test \
  test/cli/scaffold-project.test.ts \
  test/cli/scaffold-decoupled.test.ts \
  test/scaffold.test.ts \
  frameworks/remotion/__tests__/scaffold.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/scaffold_project.ts frameworks/hyperframes/scaffold.ts frameworks/hyperframes/templates/frame-template.html frameworks/remotion/scaffold.ts test/cli/scaffold-project.test.ts test/cli/scaffold-decoupled.test.ts test/scaffold.test.ts frameworks/remotion/__tests__/scaffold.test.ts
git commit -m "feat(scaffold): teach cue-first visual timing"
```

---

- [ ] **Task 17: Synchronize standards, skill instructions, and README** `[Group: release-artifacts]` `[Tester: yes]`

**Files:**
- Modify: `docs/standards/video-generation.md`
- Modify: `docs/standards/design/frame.md`
- Modify: `docs/standards/design/knowledge-expression.md`
- Modify: `docs/standards/frameworks/hyperframes.md`
- Modify: `docs/standards/frameworks/remotion.md`
- Modify: `docs/standards/design/frame-content.md` to clarify that one registered parent timeline may compose generated and authored child timelines
- Modify: `skill/md2vid/SKILL.md`
- Regenerate: `skill/md2vid/references/standards/**`
- Modify: `README.md`
- Modify: `test/cli/skill-references.test.ts`
- Modify: `test/cli/skill-commands.test.ts`
- Modify: `test/cli/package-meta.test.ts`
- Modify: `test/docs-boundary.test.ts`

- [ ] **Step 1: Write failing documentation contract assertions**

Assert canonical and bundled docs include exact shipped terms:

```ts
for (const { body } of readSourceAndCopy("docs/standards/video-generation.md")) {
  assert.match(body, /visual_beats\.json/);
  assert.match(body, /npm run plan/);
  assert.match(body, /--allow-low-fps/);
}
for (const { body } of readSourceAndCopy("docs/standards/frameworks/hyperframes.md")) {
  assert.match(body, /data-md2vid-beat/);
  assert.match(body, /data-md2vid-custom-bindings/);
  assert.match(body, /--profile final\|draft\|gif/);
}
```

Assert `SKILL.md` places plan before framework visual authoring and no longer states without qualification that machine checks cannot judge focal timing.

- [ ] **Step 2: Run and confirm failure**

```bash
node --test \
  test/cli/skill-references.test.ts \
  test/cli/skill-commands.test.ts \
  test/cli/package-meta.test.ts \
  test/docs-boundary.test.ts
```

Expected: FAIL because current guidance uses the old build-first workflow.

- [ ] **Step 3: Update canonical standards**

Apply the exact matrix from the design:

- `video-generation.md`: transcription → beats → plan → author → build/check → review → render; semantic and FPS gates.
- `frame.md`: every narrated node/row/card/code line/station binds to a beat ID; no copied semantic offsets or front-loaded workflows.
- `knowledge-expression.md`: ordered beat coverage and explicit grouped source references for Flow/Enumerate/Matrix/Contrast.
- `frameworks/hyperframes.md`: declarative attributes, custom JSON declaration, owned helper, manifest, seek/duration rules, profiles/FPS.
- `frameworks/remotion.md`: static registry, provider/components, owned progress, duration and 30 FPS expectations.

Keep visual theme, caption, safe-area, and git rules intact.

- [ ] **Step 4: Update skill and README**

In `skill/md2vid/SKILL.md`, add `md2vid plan`, `visual_beats.json`, both binding paths, machine/manual gate boundary, migration mode, and final/draft/GIF render policy to flat and canonical workflows.

In `README.md`, document:

```text
md2vid plan <dir>
visual_beats.json
legacy warn vs scaffold required
--profile final|draft|gif
--allow-low-fps
30 FPS final default / 24 FPS minimum
<output>.md2vid-render.json
```

- [ ] **Step 5: Regenerate and verify bundled references**

Run:

```bash
corepack npm run sync:skill-references
corepack npm run check:skill-references
```

Expected: both commands exit `0`; changed copies are byte-identical to canonical sources. `git.md` and `frame-content.md` remain byte-identical unless the approved timeline clarification changed `frame-content.md`.

- [ ] **Step 6: Run documentation tests**

```bash
node --test \
  test/cli/skill-references.test.ts \
  test/cli/skill-commands.test.ts \
  test/cli/package-meta.test.ts \
  test/docs-boundary.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add docs/standards skill/md2vid README.md test/cli/skill-references.test.ts test/cli/skill-commands.test.ts test/cli/package-meta.test.ts test/docs-boundary.test.ts
git commit -m "docs(md2vid): require cue-bound visual timing"
```

---

- [ ] **Task 18: Update package, snapshot, and release evidence** `[Group: release-artifacts]` `[Tester: yes]`

**Files:**
- Modify: `test/release/manifest.ts:1-38`
- Modify: `test/cli/pack.test.ts:22-51`
- Modify: `test/release/harness.ts`
- Modify: `test/release/harness.test.ts`
- Modify: `test/ci/public-snapshot.test.ts`
- Modify: `test/ci/public-snapshot-check.test.ts` to cover the new public files and stale-snapshot detection
- Modify: `test/ci/public-snapshot-checkout.test.ts` to cover checkout-based snapshot verification with the new files
- Regenerate: `public-snapshot.json`

- [ ] **Step 1: Write failing package and release assertions**

Require packed outputs:

```text
dist/scripts/plan.js
dist/scripts/plan_project.js
dist/engine/visual_beats.js
dist/engine/visual_sync.js
dist/frameworks/hyperframes/visual_timing.js
dist/frameworks/remotion/visual_bindings.js
dist/frameworks/remotion/templates/src/VisualBeats.tsx
```

Require release scaffolds to contain `scripts.plan`, `visualSync`, `visual_beats.json.example`, framework helpers, and copied standards.

Update the release smoke render from accidental final low FPS to explicit intent:

```text
md2vid hyperframes render ... --profile draft --fps 1 --quality draft
```

Assert the md2vid-only `--profile` flag is consumed before HyperFrames spawn.

- [ ] **Step 2: Run focused release tests and confirm failure**

```bash
node --test \
  test/cli/pack.test.ts \
  test/release/harness.test.ts \
  test/ci/public-snapshot.test.ts
```

Expected: FAIL on missing package files/scaffold fields and stale snapshot.

- [ ] **Step 3: Update release harness fixtures for required mode**

In `stageFlatAuthoredInputs()` and canonical smoke setup, write resolvable `visual_beats.json` and framework binding artifacts. HyperFrames smoke frames use `data-md2vid-beat` or custom declared bindings. Remotion smoke writes `visual_bindings.json` with targets consumed by the template.

Do not weaken required mode to make release smoke pass.

- [ ] **Step 4: Update package manifest tests and regenerate public snapshot**

Add exact required files to `test/release/manifest.ts`; the existing package `files` list and dist-copy discovery should include them automatically. Run:

```bash
corepack npm run public:snapshot
corepack npm run public:snapshot:check
```

Do not hand-edit the snapshot hash or file count.

Expected: `public:snapshot` regenerates the tracked artifact and `public:snapshot:check` exits `0`.

- [ ] **Step 5: Run focused package/release tests**

```bash
node --test \
  test/golden/golden.test.ts \
  test/cli/pack.test.ts \
  test/release/artifact.test.ts \
  test/release/harness.test.ts \
  test/ci/public-snapshot.test.ts \
  test/ci/public-snapshot-check.test.ts \
  test/ci/public-snapshot-checkout.test.ts \
  test/ci/release-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run all final gates**

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

Expected: every command exits `0`.

- [ ] **Step 7: Commit**

```bash
git add test/release test/cli/pack.test.ts test/ci public-snapshot.json
git commit -m "test(release): verify visual timing delivery"
```

## Part 5 and Final Verification

```bash
node --test \
  test/cli/hyperframes-render-policy.test.ts \
  test/cli/hyperframes-cli.test.ts \
  test/cli/scaffold-project.test.ts \
  test/cli/scaffold-decoupled.test.ts \
  test/cli/skill-references.test.ts \
  test/cli/skill-commands.test.ts \
  test/cli/package-meta.test.ts \
  test/scaffold.test.ts \
  test/docs-boundary.test.ts \
  test/cli/pack.test.ts \
  test/release/harness.test.ts
corepack npm run typecheck
corepack npm run typecheck:remotion
corepack npm test
corepack npm run check:skill-references
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected: all commands exit `0`; release smoke uses explicit draft intent, final renders default to 30 FPS, and the packed skill/standards match the implemented contract.
