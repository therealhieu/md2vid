# Stabilize md2vid CLI Workflows — Plan Part 4

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the complete source and packed-install workflows, synchronize public guidance, and pass every release gate.

**Architecture:** A four-case source workflow matrix exercises flat/canonical × HyperFrames/Remotion. The existing release harness packs the current checkout, installs it into isolation, and follows generated scripts in user order. Documentation is updated only after behavior stabilizes, then synchronized through the existing reference generator.

**Tech Stack:** Node subprocess tests, npm pack/install harness, public snapshot tooling, Markdown standards and skill synchronization.

---

### Task 8: Source and packed first-run workflow matrix [Tester: yes] `[Group: completion]`

**Tester:** `yes` — this validates package installation and both framework workflows.

**Files:**
- Modify: `test/cli/workflows.test.ts`
- Modify: `test/cli/fixtures/smoke/audio_meta.json`
- Move fixture: `test/cli/fixtures/smoke/assets/voice/01.wav` → `test/cli/fixtures/smoke/assets/voice/intro.wav`
- Modify: `test/release/harness.ts:1039-1223`
- Modify: `test/release/harness.test.ts`
- Modify: `test/release/manifest.ts`
- Modify: `test/cli/pack.test.ts`
- Modify: `scripts/public_snapshot.ts:38-48`
- Modify: `test/ci/public-snapshot.test.ts`
- Test: `test/examples/hash-table-remotion.test.ts`

- [ ] **Step 1: Build a reusable source workflow fixture**

In `test/cli/workflows.test.ts`, add a helper that creates a valid minimal project without invoking external TTS or rendering:

```ts
interface WorkflowCase {
  framework: "hyperframes" | "remotion";
  layout: "flat" | "canonical";
}

function createWorkflowCase({ framework, layout }: WorkflowCase) {
  // scaffold with createProject(), then arrange flat/canonical directories
  // write audio_meta.json with IDs intro/details/recap
  // write three tiny WAV fixtures or copy the existing valid smoke WAV
  // write video.config.json mappings to 01-intro/02-details/03-recap
  // write minimal framework artifacts required by adapter verification
  return { root, outputDir, sharedDir };
}
```

The neutral metadata must prove ID/order separation:

```json
{
  "voices": [
    { "id": "intro", "path": "assets/voice/intro.wav", "duration_s": 1, "words": [{ "text": "Intro", "start": 0, "end": 0.8 }] },
    { "id": "details", "path": "assets/voice/details.wav", "duration_s": 1, "words": [{ "text": "Details", "start": 0, "end": 0.8 }] },
    { "id": "recap", "path": "assets/voice/recap.wav", "duration_s": 1, "words": [{ "text": "Recap", "start": 0, "end": 0.8 }] }
  ]
}
```

Use existing fixture-copy helpers rather than synthesizing invalid WAV bytes.

- [ ] **Step 2: Add the four-case workflow matrix**

```ts
for (const framework of ["hyperframes", "remotion"] as const) {
  for (const layout of ["flat", "canonical"] as const) {
    test(`${layout} ${framework} build, regroup, and verify`, () => {
      const project = createWorkflowCase({ framework, layout });
      assert.equal(buildRun([project.outputDir]), 0);
      assert.equal(regroupRun([project.outputDir, "--max-chars", "54"]), 0);
      assert.equal(verifyRun([project.outputDir]), 0);

      const plan = readJson(join(project.sharedDir, "build", "build_plan.json"));
      assert.deepEqual(plan.frames.map((frame: { id: string; frameNum: number }) => [frame.id, frame.frameNum]), [
        ["intro", 1],
        ["details", 2],
        ["recap", 3],
      ]);
      assert.equal(existsSync(join(project.sharedDir, "caption_groups.json")), true);
    });
  }
}
```

For each case, inject a fake `transcribeVoices` into `transcribeRun()` and assert its base directory equals `sharedDir`.

- [ ] **Step 3: Run the source matrix and verify GREEN**

```bash
node --test test/cli/workflows.test.ts
```

Expected: all four cases PASS. If the test exposes framework-specific fixture gaps, fix only fixture setup; do not weaken verification.

- [ ] **Step 4: Change the packed smoke fixture to a meaningful ID**

Update `test/cli/fixtures/smoke/audio_meta.json` so the voice uses:

```json
{
  "id": "intro",
  "path": "assets/voice/intro.wav"
}
```

Rename the WAV fixture accordingly. Keep the visual slug `01-smoke` to prove ID and filename/slug are independent. Update all release-harness hard-coded paths and config mappings:

```json
{ "slugs": { "intro": "01-smoke" } }
```

- [ ] **Step 5: Make packed smoke follow generated flat workflow**

In `test/release/harness.ts`, stop immediately reshaping a new scaffold into canonical layout. The installed-package smoke must:

```text
1. execute installed md2vid new <slug> [--framework]
2. keep the generated project flat
3. copy valid audio_meta.json and voice fixture into that project
4. write the slug mapping and minimal framework visual
5. execute npm run build
6. execute npm run check
7. execute framework preview smoke or still smoke
```

For HyperFrames, keep preview non-interactive and bounded by the existing harness method. For Remotion, run `npm install` only in the isolated packed project using the harness's current exact dependency flow, then `npm run still`.

Assert:

- generated `audio_request.json.example` exists;
- generated package scripts match the approved values;
- `npm run build` exercises regroup successfully in flat layout;
- `npm run check` exercises `md2vid verify` plus framework checks;
- no command resolves to the developer's global `md2vid` binary.

- [ ] **Step 6: Update packed manifest expectations**

Add the compiled helpers to `test/release/manifest.ts` and `test/cli/pack.test.ts`:

```text
dist/scripts/cli_args.js
dist/scripts/project_layout.js
dist/scripts/managed_file_transaction.js
```

Add generated `audio_request.json.example` expectations to scaffold smoke, not package file manifest; it is generated at runtime.

Confirm the default Remotion template package excludes the moved hash-table scene files.

- [ ] **Step 7: Keep the opt-in example in the public snapshot**

Add `examples/` to the public snapshot allowlist in `scripts/public_snapshot.ts`. Extend `test/ci/public-snapshot.test.ts` to assert:

```text
examples/hash-table/remotion/README.md is present
examples/hash-table/remotion/src/Video.tsx is present
examples/ is not added to package.json files unless explicitly intended
```

The example is public repository documentation/source, not part of the npm runtime package.

- [ ] **Step 8: Run pack and workflow tests**

```bash
node --test \
  test/cli/workflows.test.ts \
  test/cli/pack.test.ts \
  test/release/harness.test.ts \
  test/examples/hash-table-remotion.test.ts \
  test/ci/public-snapshot.test.ts
npm run build:dist
npm run release:verify-artifact
```

Expected: all tests and artifact verification PASS.

- [ ] **Step 9: Commit**

```bash
git add \
  test/cli/workflows.test.ts \
  test/cli/fixtures/smoke/audio_meta.json \
  test/cli/fixtures/smoke/assets/voice \
  test/release/harness.ts \
  test/release/harness.test.ts \
  test/release/manifest.ts \
  test/cli/pack.test.ts \
  scripts/public_snapshot.ts \
  test/ci/public-snapshot.test.ts \
  test/examples/hash-table-remotion.test.ts
git commit -m "test: cover installed first-run workflows"
```

### Task 9: Documentation synchronization and completion gates [Tester: yes] `[Group: completion]` `[S after Task 8]`

**Tester:** `yes` — public docs and installed skill behavior are part of the shipped interface.

**Files:**
- Modify: `README.md:39-105`
- Modify: `docs/standards/video-generation.md`
- Modify: `docs/standards/frameworks/hyperframes.md`
- Modify: `docs/standards/frameworks/remotion.md`
- Modify: `skill/md2vid/SKILL.md`
- Regenerate: `skill/md2vid/references/standards/video-generation.md`
- Regenerate: `skill/md2vid/references/standards/frameworks/hyperframes.md`
- Regenerate: `skill/md2vid/references/standards/frameworks/remotion.md`
- Modify: `test/cli/skill-commands.test.ts`
- Modify: `test/cli/skill-references.test.ts`
- Create after implementation only: `docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-check.md`

- [ ] **Step 1: Add failing documentation contract tests**

In `test/cli/skill-commands.test.ts`, assert the skill contains only real commands and the approved ordering:

```ts
assert.doesNotMatch(skill, /\bmd2vid audio\b/);
assert.match(skill, /audio_request\.json\.example/);
assert.match(skill, /voice IDs.*meaningful/i);
assertOrder(skill, ["md2vid build", "npm run check", "preview"]);
```

In `test/cli/skill-references.test.ts`, assert source standards and synchronized copies contain:

- `audio_request.json.example`;
- minimal `audio_meta.json` fields `id`, `path`, `duration_s`, `words`;
- array-order frame sequencing;
- `npm run check` before preview/still/render;
- neutral Remotion default and opt-in hash-table example.

- [ ] **Step 2: Run doc tests and verify RED**

```bash
node --test test/cli/skill-commands.test.ts test/cli/skill-references.test.ts
```

Expected: narration/check/neutral-example assertions fail.

- [ ] **Step 3: Update README narration and workflows**

Add `## Narration` with anchor `#narration`. Include this minimal schema:

```json
{
  "voices": [
    {
      "id": "intro",
      "path": "assets/voice/intro.wav",
      "duration_s": 3.2,
      "words": [
        { "text": "Welcome", "start": 0.1, "end": 0.5 }
      ]
    }
  ]
}
```

State:

- paths are relative to the shared/flat project root;
- WAV files live under `assets/voice/`;
- IDs may be meaningful strings and must be unique;
- frame order follows `voices[]`;
- `video.config.json.slugs` maps each ID to a framework visual slug;
- `audio_request.json.example` is an onboarding example;
- `/md2vid` plus the HyperFrames media engine generates narration; no `md2vid audio` command exists.

Replace preview/render sequences with:

```bash
npm run build
npm run check
npm run dev        # HyperFrames
# or
npm run still      # Remotion smoke
npm run studio     # Remotion review
```

Rendering remains after review.

- [ ] **Step 4: Update authoritative standards**

In `docs/standards/video-generation.md`, define the narration input contract and make `npm run check` the required pre-preview/pre-render gate.

In `docs/standards/frameworks/hyperframes.md`, update generated scripts and first-run commands. Keep local/CDN GSAP statements aligned with the actual scaffold implemented on this branch.

In `docs/standards/frameworks/remotion.md`, document:

- neutral title-card default;
- explicit scene registration;
- opt-in `examples/hash-table/remotion/` reference;
- `npm run check` before still/render.

- [ ] **Step 5: Update the md2vid skill orchestration**

In `skill/md2vid/SKILL.md`:

- after scaffold, instruct the agent to review `audio_request.json.example`;
- generate shared audio via `/hyperframes-media` as before;
- describe meaningful IDs and array order;
- use generated `npm run build` and `npm run check` where applicable;
- keep `md2vid verify` described as part of check and available directly;
- never mention `md2vid audio`;
- preserve coverage and expression-triad gates.

- [ ] **Step 6: Regenerate synchronized references**

Run:

```bash
npm run sync:skill-references
```

Expected: only the three declared synchronized standard copies change. Do not hand-edit those generated files afterward.

- [ ] **Step 7: Run documentation tests**

```bash
node --test test/cli/skill-commands.test.ts test/cli/skill-references.test.ts
npm run check:skill-references
```

Expected: PASS.

- [ ] **Step 8: Run the complete verification suite**

Run in this exact order and stop at the first failure:

```bash
npm run typecheck
npm run typecheck:remotion
npm test
npm run check:skill-references
npm run public:snapshot:check
npm run release:check
```

Expected:

```text
typecheck                exit 0
typecheck:remotion       exit 0
all node tests           exit 0
skill reference check    exit 0
public snapshot check    exit 0
release pack/install     exit 0
```

The release check must report that it packed the current checkout and installed that tarball in isolation. Do not use global `md2vid --version` as evidence.

- [ ] **Step 9: Perform manual CLI smoke against the packed artifact**

Using the tarball path produced by the release harness, create a fresh temporary install and run:

```text
md2vid --help
md2vid new hf-smoke
md2vid new remotion-smoke --framework remotion
md2vid build --help
md2vid regroup --help
md2vid transcribe --help
md2vid verify --help
```

Verify:

- every help command exits `0`;
- both scaffolds contain `audio_request.json.example`;
- HyperFrames and Remotion package scripts contain build/verify/check;
- Remotion default files contain no hash-table subject matter;
- temporary directories are removed afterward.

- [ ] **Step 10: Write the post-implementation check file**

Only after implementation and all verification pass, create:

`docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-check.md`

Populate it with:

- design and plan paths;
- exact implementation commits;
- exact tests/checks run and results;
- task completion count `9/9`;
- concrete deviations or `None`;
- review outcomes;
- remaining risks/follow-ups or `None`.

Do not leave unchecked placeholders in the final check file.

- [ ] **Step 11: Commit documentation and completion evidence**

```bash
git add \
  README.md \
  docs/standards \
  skill/md2vid/SKILL.md \
  skill/md2vid/references/standards \
  test/cli/skill-commands.test.ts \
  test/cli/skill-references.test.ts \
  docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-check.md
git commit -m "docs: document stable CLI workflows"
```

- [ ] **Step 12: Confirm final branch state**

```bash
git status --short --branch
git log --oneline --decorate -10
```

Expected: clean working tree on `fix/stabilize-cli-workflows`, with the nine implementation commits after the design/plan commits.
