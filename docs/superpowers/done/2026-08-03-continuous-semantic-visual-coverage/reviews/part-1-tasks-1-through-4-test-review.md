# Canonical Review Artifact

- Review scope: Part 1, Tasks 1-4
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `clean-head`
- Scope origin: `4663088d28e8de04fa045c7b8fe73cd36930cd22`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.part1.Jj2tCD/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

# Tester Report — Part 1 Tasks 1–4

## Findings

### TEST-001 — Nice to have — Strict-v2 and provenance regression coverage is partial

`engine/visual_beats.ts` enforces exact field sets, but the tests exercise only the frame-level `states` alias. They do not lock down unknown-field rejection at every v2 schema layer, nor do they verify v1 provenance after `plan()` attaches it to a frame.

Relevant coverage:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/visual_beats.test.ts:222-277` checks the frame-level `states` alias, cue forms, and role validation.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_beats.ts:36-55,193-205,227-239` has distinct exact-field validation for v2 frames, beats, coverage objects, and exemptions.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/plan.test.ts:170-181` proves empty v2 frames retain `visualSpecVersion: 2`, but no corresponding `plan()` assertion locks v1 provenance to `visualSpecVersion: 1`.

**Guidance**

Add table-driven rejections for an unknown field in each v2 closed object:

```text
top level → frame → beat → coverage → coverage endpoint → exemption
```

Also add a `plan()` test with a valid v1 specification asserting:

```ts
assert.equal(result.frames[0].visualSpecVersion, 1);
```

This protects the compatibility distinction that later verification depends on:

```text
v1 authored input → PlanFrame.visualSpecVersion = 1 → migration/warn handling
v2 authored input → PlanFrame.visualSpecVersion = 2 → coverage-aware handling
```

**Success checklist**

- [ ] Unknown fields fail with path-qualified diagnostics at every v2 closed-object boundary.
- [ ] A valid v1 frame keeps `visualSpecVersion: 1` after planning.
- [ ] Existing v1/v2 focused tests remain green.

---

## Command evidence

| Command | Result |
|---|---|
| `corepack npm run typecheck` | Pass — `tsc --noEmit` exited 0. |
| `node --test engine/__tests__/config.test.ts engine/__tests__/visual_beats.test.ts engine/__tests__/plan.test.ts test/cli/plan-project.test.ts test/cli/plan.test.ts test/cli/workflows.test.ts` | Pass — 211 tests passed, 0 failed, 0 skipped; duration 1.803s. Full captured output: `/Users/hieunguyen/.claude/projects/-Users-hieunguyen-git-hieu-projects-md2vid-public--claude-worktrees-fix-visual-timing-sync/7f433b71-f441-4c04-8234-0288a63cd12b/tool-results/bqj6pv5v5.txt` |
| `git diff --check` | Pass — no whitespace errors. |
| Final repository status check | Clean — no modified or untracked repository files. |

**Command-generated files**

- No repository files were generated or left behind.
- The CLI tests created temporary directories under the OS temp directory and removed them in their `finally` cleanup paths.
- The test runner’s full output was persisted externally by the tool harness at the path listed above; it is not a repository artifact.

## Obligation coverage assessment

| Obligation | Evidence | Assessment |
|---|---|---|
| v1 compatibility | Legacy plan shape tests at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/plan.test.ts:37-65`; legacy artifact/workflow cases | Covered |
| Coverage-only planning (`mode: off`, `coverageMode: required`) | Planner policy and v2 resolution cases at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/plan.test.ts:130-200` and `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/plan-project.test.ts:185-231` | Covered |
| Both-off malformed input | `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/plan-project.test.ts:289-299` verifies malformed `visual_beats.json` is ignored only when both modes are off | Covered |
| Strict v2 exact fields | Parser implementation is strict; tests cover selected frame/cue cases only | Partial — TEST-001 |
| Frame completeness | Required coverage rejects omitted narrated frames and supporting-only frames at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/plan.test.ts:130-168` | Covered |
| Authored v1/v2 provenance | v2 empty-frame provenance is tested; v1 provenance through `plan()` is not | Partial — TEST-001 |
| Transactional rollback | Promotion-failure rollback at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/plan.test.ts:228-257`; malformed-v2 no-partial-write regression at `:259-285` | Covered |
| Flat/canonical projection identity | Byte-identical v2 projection test at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/plan.test.ts:135-176` | Covered |

## Consolidated checklist

- [x] Part 1 typecheck gate passes.
- [x] Part 1 focused test gate passes: 211/211.
- [x] Patch has no whitespace errors.
- [x] Legacy v1 serialization and behavior regressions are exercised.
- [x] Independent reveal/coverage-mode planning is exercised.
- [x] Both-off malformed-input behavior is exercised.
- [x] Required v2 frame completeness is exercised.
- [x] Neutral artifact rollback is exercised.
- [x] Flat and canonical layouts produce byte-identical v2 timing projections.
- [ ] Extend tests for strict v2 closed-object fields and v1 `PlanFrame` provenance (TEST-001).

## Residual risks

- Part 1 resolves and serializes coverage intervals but does not yet prove framework visibility evidence, interval-union gap detection, freshness digests, or seek behavior; those are explicitly deferred to Parts 2–4.
- The strict schema behavior is implemented, but missing boundary-specific tests leave future schema relaxations more likely to escape the focused gate.
