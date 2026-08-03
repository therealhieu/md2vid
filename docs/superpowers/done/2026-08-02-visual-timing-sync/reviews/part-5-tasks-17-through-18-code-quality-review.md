# Canonical Review Artifact

- Review scope: Part 5, Tasks 17-18
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `7c0855a8393a1f6d18453bd14af2b778b600c651; baseline /var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines.7eIxOv/part-5-tasks-17-through-18`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.avI1H8/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Findings

### CQ-001 — Must fix — `public:snapshot:check` does not reject a stale tracked manifest

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/check_public_snapshot.ts:191-209` materializes a new temporary snapshot from `HEAD`, but never reads or compares the repository’s tracked `public-snapshot.json`.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/check_public_snapshot.ts:234-237` validates only that newly generated temporary tree.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/ci/public-snapshot-check.test.ts:51-64` asserts presence of selected paths, not the tracked manifest’s full path list, count, or aggregate hash.

**Why**

A source-file change, or an incorrect tracked manifest `count`/`hash`, can leave `public-snapshot.json` stale while `npm run public:snapshot:check` still passes: the check validates a freshly generated snapshot rather than the release artifact committed to the repository. This misses Task 18’s required stale-snapshot detection.

**Guidance**

Generate the expected report in memory from the selected commit, load the tracked manifest, and require exact equality before running the temporary-snapshot integration gate. Compare the full deterministic report, not only `count` and `hash`.

Add a focused regression test that makes the tracked report stale while preserving otherwise-valid public source, and assert the checker fails before acceptance validation.

**Success checklist**

- [ ] `public:snapshot:check` fails when a tracked path hash, aggregate hash, count, or path entry is stale.
- [ ] It passes only when the tracked `public-snapshot.json` exactly matches the selected `HEAD` tree.
- [ ] The check continues to exclude dirty and untracked worktree files by deriving expected data from the Git commit.

---

### CQ-002 — Must fix — Canonical framework standards still prescribe the obsolete build-first workflow

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/standards/frameworks/hyperframes.md:42-62` directs users to author `compositions/frames/*.html` and run `npm run build`, while its “generated scripts” block omits `npm run plan`.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/standards/frameworks/remotion.md:9-24` likewise has a generated-project pipeline with scene authoring and build but no `visual_beats.json` or `npm run plan`.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/scaffold_project.ts:21-35` configures new projects with `visualSync.mode: "required"`.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/scaffold_project.ts:76-83` ships `plan: "md2vid plan ."` as a generated package script.

**Why**

These are canonical standards copied into every generated project. Their primary onboarding paths contradict the shipped required-mode contract: following them leads users to author visuals before resolving beat IDs and then build without the required `visual_beats.json`/binding workflow. The later cue-timing sections are correct, but do not repair contradictory first-run instructions.

**Guidance**

Update both framework standards’ primary pipelines and generated-script examples to make the sequence unambiguous:

```text
prepare/transcribe audio
  → author visual_beats.json
  → npm run plan
  → author beat-bound framework visuals
  → npm run build
  → npm run check
```

Include `plan` in the documented generated scripts. Regenerate bundled references and add assertions that check the ordering in the first-run/pipeline sections, rather than only checking whether isolated terms exist.

**Success checklist**

- [ ] HyperFrames and Remotion first-run workflows require `visual_beats.json` and `npm run plan` before visual authoring.
- [ ] Both documented generated-script blocks include `plan: "md2vid plan ."`.
- [ ] Canonical and bundled standards remain byte-identical.
- [ ] Documentation tests reject a build-first ordering in the framework onboarding sections.

---

### CQ-003 — Must fix — Packed HyperFrames smoke does not verify the resolved visual reveal time

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts:1077-1102` creates the smoke beats with `wordIndex: 6`.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/fixtures/smoke/audio_meta.json:14` resolves that cue to `1.3s`.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts:1653-1669` reads composed target opacity but no longer compares it to an expected timing state.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts:1761-1769` only proves the first target is hidden at `0.5s` and visible at `2.4s`; it labels `2.4s` as the cue despite the configured cue being `1.3s`.

**Why**

The smoke can pass if the packed generated helper schedules a reveal at any time between `0.5s` and `2.4s`, including a front-loaded reveal that exceeds the configured `0.25s` maximum lead. `md2vid verify` validates the generated binding manifest, but this browser assertion does not prove that the rendered timeline follows that manifest. This leaves false timing evidence in the release smoke.

**Guidance**

Keep testing the mounted/composed target, but derive each expected reveal start from generated `build/build_plan.json` or `build/visual_timing.json`. For both smoke frames:

```text
cue start − ε  → target remains hidden
cue start + reveal duration + ε  → target is visible
```

Convert frame-local cue time to global time using the actual generated host start. Do not restore standalone/composed opacity parity: standalone authored frames intentionally lack emitted timing injection. The assertion must target the packed, composed runtime state.

**Success checklist**

- [ ] The smoke derives cue starts from generated plan artifacts, not hard-coded offsets.
- [ ] Both packed HyperFrames targets are checked immediately before and after their resolved cue windows.
- [ ] A front-loaded helper schedule fails the browser smoke even if the binding manifest remains nominally correct.
- [ ] The test continues to verify draft-profile flag consumption and render evidence.

## Consolidated checklist

- [ ] Add tracked-manifest freshness validation to `public:snapshot:check` and stale-manifest regression coverage.
- [ ] Correct HyperFrames and Remotion canonical onboarding workflows, then regenerate bundled standards.
- [ ] Make the packed browser smoke assert actual composed reveal timing against generated beat data.

## Residual risk

- I did not rerun the reported test/gate commands, per the read-only review constraint.
- I verified the canonical/bundled standards are byte-identical, and spot-checked that the reviewed `public-snapshot.json` hashes match `HEAD` for the changed README, standards, emitter, snapshot script, and release harness. The missing freshness check remains a release-process gap for future changes.