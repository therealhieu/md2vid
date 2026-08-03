# Canonical Review Artifact

- Review scope: Part 4, Tasks 12–14
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Base/current: `2c12a9bbcf4c8ca5db37cb49088bc1e34a3f2fce` → `e2587dd89bb65789f6c6c773215a005b7b160c76`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T/superpowers-current.part4.clyCkY/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

## Findings

### CQ-1 — Must fix — Verification trusts mutable runtime timing instead of the manifest
- Evidence:
  - `frameworks/remotion/emit.ts:179-184` serializes generated `visualBindings` into `build_plan.json`; this is consumed at render time.
  - `frameworks/remotion/templates/src/VisualBeats.tsx:67-81` trusts the emitted binding’s role, start/end frames, and duration.
  - `frameworks/remotion/verify.ts:125-137` checks only that `plan.visualBindings` is present; it does not compare its contents with `build/visual_bindings.json`.
  - `engine/visual_sync.ts:69-82` validates plan/source digests, but neither covers mutable output-local runtime bindings.
- Why it is wrong: Editing runtime bindings after build can hide/move/change a focal target while the manifest continues to claim original coverage; verify can accept evidence the runtime no longer implements.
- Guidance: Strictly parse and compare every runtime binding with the manifest-derived quantized projection. Reject missing, extra, duplicate, malformed, or mismatched frame, beat, target, role, start/end, entrance, and duration.
- Success checklist:
  - [ ] Mutating emitted timing/target/role/duration fails verify.
  - [ ] Missing/malformed/duplicate/extra runtime binding fails.
  - [ ] Runtime and manifest agree before neutral coverage is trusted.

### CQ-2 — Must fix — Manifest coverage begins while the target is fully transparent
- Evidence:
  - `frameworks/remotion/templates/src/VisualBeats.tsx:101-119,145-171` activates `BeatReveal` at startFrame with progress 0 and opacity 0 for animated entrances.
  - At a shared boundary the outgoing state is end-exclusive and unmounted while the incoming reveal is mounted transparent.
  - `frameworks/remotion/visual_bindings.ts:282-313` emits adjacent coverage end/start at that boundary.
  - `frameworks/remotion/templates/src/Video.tsx:51-57` also applies scene opacity, which is zero on the first local frame.
- Why it is wrong: Evidence claims meaningful visibility from coverageStart while owned runtime can display no semantic content at that frame.
- Guidance: Define evidence from actual visible frames. Preserve outgoing focal until incoming is visibly present, or emit observed start after the first visible frame and represent overlap/gap truthfully. Include scene opacity in the contract.
- Success checklist:
  - [ ] At every shared boundary at least one focal target has nonzero rendered opacity.
  - [ ] Static opening state is visible at first claimed frame.
  - [ ] Coverage intervals describe runtime-visible state after component and scene opacity.
  - [ ] Static and animated entrances remain deterministic.

### CQ-3 — Must fix — A lazy-scaffold v2 build emits permanently stale source evidence
- Evidence:
  - `frameworks/remotion/emit.ts:83-113` collects authored inputs during preflight before runtime scaffolding.
  - `frameworks/remotion/emit.ts:147-150` then calls `ensureRuntime()`, which creates missing `src` files.
  - `frameworks/remotion/visual_bindings.ts:390-398` records only currently existing registry/src sources.
  - Verify re-enumerates newly created runtime sources and reports them as newly added inputs.
- Why it is wrong: A supported first-run lazy scaffold completes build then immediately fails freshness because the emitter created sources after digesting.
- Guidance: Stabilize source set before v2 evidence: provision missing runtime files transactionally before collection, or include exact template bytes/paths that will be materialized. Build and verify must use the same post-scaffold set.
- Success checklist:
  - [ ] Registry-only v2 project builds and immediately verifies.
  - [ ] First manifest includes every materialized runtime source.
  - [ ] Later custom source changes still invalidate evidence.
  - [ ] Preflight failure leaves missing runtime files and prior outputs unchanged.

### CQ-4 — Must fix — The Remotion smoke does not prove runtime coverage behavior
- Evidence:
  - Plan Task 14 requires direct/reverse visibility and final-landing retention.
  - `test/release/harness.ts:2727-2735` runs install/build/typecheck/still/verify but inspects no semantic target boundary.
  - Template `render.ts` renders one midpoint still.
  - Unit tests exercise pure helpers, not rendered BeatState/BeatReveal or inherited scene opacity.
  - Harness source-text assertions pass even if runtime never displays targets.
- Why it is wrong: Bundling and a nonempty still cannot catch mutable runtime projection or transparent-boundary failures.
- Guidance: Add packed runtime probe rendering exact boundary frames from generated v2 manifest and assert target presence/effective nonzero opacity for direct, sequential, and reverse paths at opening, handoff, interior, and held landing.
- Success checklist:
  - [ ] Smoke checks every focal v2 target.
  - [ ] Direct/sequential/reverse rendering agree at starts, boundaries, interior, ends.
  - [ ] Final focal is visibly present after narration and before frame end.
  - [ ] Transparent/missing/early-exit/mutated runtime payload fails smoke.

## Consolidated post-implementation checklist

- [ ] CQ-1: Validate emitted runtime bindings against manifest-v2 before trusting coverage.
- [ ] CQ-2: Align claimed intervals with actual rendered visibility across entrance and scene transitions.
- [ ] CQ-3: Stabilize v2 authored source enumeration across lazy scaffolding.
- [ ] CQ-4: Add real packed Remotion boundary/seek/landing runtime assertions.
- [ ] Run:
  ```bash
  corepack npm run typecheck
  corepack npm run typecheck:remotion
  node --test \
    frameworks/remotion/__tests__/visual_beats.test.ts \
    frameworks/remotion/__tests__/emit.test.ts \
    frameworks/remotion/__tests__/verify.test.ts \
    frameworks/remotion/__tests__/scaffold.test.ts \
    test/cli/workflows.test.ts \
    test/release/harness.test.ts
  git diff --check
  ```

## Verification gaps and residual risk

- Typechecks and 246 focused tests passed during review.
- Registry parsing is exact, roles come from neutral state, null-prototype maps and duplicate target rejection are present, and source symlinks are rejected.
- Existing tests do not prove runtime target visibility at v2 boundaries; passing results do not mitigate CQ-1, CQ-2, or CQ-4.
