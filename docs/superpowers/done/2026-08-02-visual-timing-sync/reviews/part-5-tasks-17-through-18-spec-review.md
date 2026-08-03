# Canonical Review Artifact

- Review scope: Part 5, Tasks 17-18
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `7c0855a8393a1f6d18453bd14af2b778b600c651; baseline /var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines.7eIxOv/part-5-tasks-17-through-18`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.avI1H8/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Findings

### SPEC-1 — Must fix — Canonical workflow docs still instruct build-first authoring
- **Requirement:** Task 17 requires standards, skill guidance, bundled references, and README to match shipped behavior. The approved flow requires `visual_beats.json → npm run plan → cue-bound framework authoring → build`.
- **Evidence:**
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/standards/frameworks/hyperframes.md:42-62` — “First run” tells users to author `compositions/frames/*.html` before build and omits `npm run plan`; its generated-script block also omits the shipped `plan` script.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/standards/frameworks/remotion.md:9-24` — the generated-project pipeline tells users to author custom scenes before build, without authoring beats or running `npm run plan`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/README.md:139-149` — the Remotion workflow omits `npm run plan`.
  - The same contradictions ship in byte-identical bundled copies under `skill/md2vid/references/standards/frameworks/`.
- **Guidance:** Update every first-run/generated-project workflow and script example to put transcript preparation, `visual_beats.json`, and `npm run plan` before framework visual authoring and build. Regenerate bundled references with `corepack npm run sync:skill-references`, then run:
  ```bash
  node --test \
    test/cli/skill-references.test.ts \
    test/cli/skill-commands.test.ts \
    test/cli/package-meta.test.ts \
    test/docs-boundary.test.ts
  corepack npm run check:skill-references
  ```
- **Success checklist:**
  - [ ] No canonical or bundled first-run workflow directs a required-mode scaffold to author framework visuals before `npm run plan`.
  - [ ] HyperFrames generated-script documentation includes `"plan": "md2vid plan ."`.
  - [ ] README HyperFrames and Remotion workflows show the cue-first sequence.
  - [ ] Canonical and bundled standard pairs remain byte-identical.

### SPEC-2 — Must fix — Public snapshot check does not detect a stale tracked manifest
- **Requirement:** Task 18 requires `test/ci/public-snapshot-check.test.ts` to cover “new public files and stale-snapshot detection”; the tracked `public-snapshot.json` must reflect committed `HEAD`.
- **Evidence:**
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/check_public_snapshot.ts:191-239` — `checkPublicSnapshot()` regenerates a fresh temporary snapshot from `HEAD`, validates that temporary output, and never reads or compares `${gitRoot}/public-snapshot.json`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/ci/public-snapshot-check.test.ts:51-64` — the added test asserts only that the tracked manifest lists seven new paths; it does not mutate or compare the tracked manifest to a report generated from the current commit.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/ci/public-snapshot.test.ts:240-254` — `writePublicSnapshotManifest()` is tested in an isolated fixture, but not against a stale repository manifest.
- **Guidance:** Make `public:snapshot:check` compare the root repository’s regular-file manifest bytes/object to the report generated from its selected committed ref before validating the materialized snapshot. Add a regression test that makes the source manifest stale and proves the checker fails, then prove a regenerated manifest passes.
- **Success checklist:**
  - [ ] A changed public `HEAD` with an outdated tracked `public-snapshot.json` makes `corepack npm run public:snapshot:check` fail.
  - [ ] `corepack npm run public:snapshot` regenerates the manifest from `HEAD`, after which the check passes.
  - [ ] The checker retains the explicit-output snapshot security path and validates the tracked manifest as a regular file.

### SPEC-3 — Nice to have — HyperFrames captions-only manifest guard lacks an absent-manifest integration regression
- **Requirement:** The review scope requires unplanned production changes in `scripts/build.ts` to be necessary, minimal, contract-matching, and tested.
- **Evidence:**
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/build.ts:201-209` adds a condition that skips binding-manifest promotion when captions-only emission did not stage one. This is a minimal, necessary compatibility fix because HyperFrames captions-only emission intentionally retains rather than emits a binding manifest.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/run-exports.test.ts:227-234` tests captions-only only after a full build at line 229; that full build has already created `build/visual_bindings.json`. It does not exercise the new absent-staged-manifest branch.
- **Guidance:** Add a HyperFrames `md2vid build <dir> --captions-only` integration case before any full build/binding-manifest creation. Assert caption artifacts promote successfully and no missing-manifest promotion is attempted.
- **Success checklist:**
  - [ ] A fresh HyperFrames project can run captions-only build with no existing binding manifest.
  - [ ] The command updates only its caption artifacts and does not create or remove binding evidence.
  - [ ] The regression test fails if the conditional manifest-promotion guard is removed.

## Consolidated post-implementation checklist
- [ ] Correct the contradictory HyperFrames, Remotion, README, and bundled cue-first workflows; synchronize and equality-check references.
- [ ] Add tracked-manifest-versus-committed-`HEAD` validation to `public:snapshot:check` and a stale-manifest regression test.
- [ ] Add the fresh HyperFrames captions-only/no-binding-manifest integration regression.
- [ ] Run the Part 5 focused documentation, snapshot, and release tests.
- [ ] Run `corepack npm run typecheck`, `corepack npm run typecheck:remotion`, `corepack npm test`, `corepack npm run check:skill-references`, `corepack npm run public:snapshot:check`, `corepack npm run check`, `corepack npm run release:check`, and `git diff --check`.

## Residual risk
The tracked manifest currently matches committed `HEAD` (`307` files, `sha256:f005797c63f869e859e461cbd21819c8467f71ee944d6560874f0332e227f19f`), and canonical/bundled standard pairs are currently byte-identical. Full test, render, and release gates were not rerun in this read-only review; the reported Mode A results remain the verification evidence for those executions.