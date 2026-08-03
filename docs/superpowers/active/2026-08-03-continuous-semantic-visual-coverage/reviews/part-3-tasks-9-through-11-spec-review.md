# Canonical Review Artifact

- Review scope: Part 3, Tasks 9-11
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `219772e22c35ee76a4f5aae40812a524a378e2a2`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines/continuous-visual-coverage/part-3-tasks-9-through-11`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.part3.ckN8k4/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

## Findings

### SPEC-1 — Must fix — Required coverage does not make HyperFrames binding validation strict
- Requirement: “Reveal `mode` and `coverageMode` are independent” and Task 9 requires strict v2 declarative/custom/static bindings. `coverageMode: "required"` must not permit invalid framework bindings merely because reveal mode is off.
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/emit.ts:330-349 — preflight` passes only `resolveVisualSyncPolicy(config).mode` to `prepareFrameVisualTiming`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:73-76 — fail` only throws for `mode === "required"`; with `mode: "off"`, malformed v2 bindings return `false`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/build.ts:159-161,223-240 — buildRun` preflights and promotes output without running semantic-binding verification. Thus `mode: "off", coverageMode: "required"` can complete a full build with an empty/invalid v2 binding manifest.
- Guidance: Derive the parser enforcement mode from both policies. Treat it as `required` when either reveal mode or coverage mode is required; preserve warning behavior when either is warn. Add full-build regressions for coverage-required/reveal-off projects with invalid declarative and custom bindings, asserting build failure before promotion.
- Success checklist:
  - [ ] A project with `mode: "off"` and `coverageMode: "required"` rejects invalid, unknown, or unplanned v2 bindings during full build.
  - [ ] A valid coverage-only project still emits manifest-v2 evidence.
  - [ ] Warn and legacy v1 compatibility behavior remains unchanged.

### SPEC-2 — Must fix — Orphan `data-md2vid-coverage` markers are silently ignored
- Requirement: Task 9 explicitly requires that “`data-md2vid-coverage` on an unplanned shell target fails rather than auto-binding it.”
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:335-347 — prepareFrameVisualTiming` recognizes timing declarations only through `data-md2vid-beat` or custom-binding scripts; a standalone coverage marker does not enter validation.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:267-286 — readDeclarativeBindings` reads and validates `data-md2vid-coverage` only after finding `data-md2vid-beat`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/__tests__/visual_timing.test.ts:239-243` tests an unknown `data-md2vid-beat="shell"`, not an orphan marker such as `<aside id="shell" data-md2vid-coverage="planned">`.
- Guidance: Scan `data-md2vid-coverage` independently. In strict mode, require every such marker to be attached to a valid planned declarative beat target; reject omitted, unknown, and invalid coverage values. Add a regression for an orphan shell marker and retain the existing custom-binding declaration path.
- Success checklist:
  - [ ] An unplanned element with only `data-md2vid-coverage="planned"` fails in required mode.
  - [ ] An invalid standalone coverage value also fails deterministically.
  - [ ] Valid planned declarative, static, and custom bindings remain accepted.

## Consolidated post-implementation checklist
- [ ] Derive HyperFrames binding strictness from both `visualSync.mode` and `visualSync.coverageMode`. (SPEC-1)
- [ ] Reject orphan semantic-coverage attributes instead of silently ignoring them. (SPEC-2)
- [ ] Add focused regressions for both cases.
- [ ] Run:
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

## Residual risk
The focused Part 3 suite passed locally: 208/208 tests, including composed-player direct, sequential, reverse, and held-landing checks. Typecheck was reported passing by the supplied Mode A evidence but was not independently rerun in this read-only review.
