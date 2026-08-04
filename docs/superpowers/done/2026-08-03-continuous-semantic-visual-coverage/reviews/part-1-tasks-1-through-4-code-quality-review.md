# Canonical Review Artifact

- Review scope: Part 1, Tasks 1-4
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `clean-head`
- Scope origin: `4663088d28e8de04fa045c7b8fe73cd36930cd22`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.part1.Jj2tCD/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

## Findings

### CQ-1 — Must fix — Required v2 completeness crashes for valid prototype-like slugs
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/plan.ts:108-118` reads `visualBeats.frames[frame.slug]` before `resolveVisualBeats()` normalizes the input to null-prototype records.
- Why it is wrong: `constructor` and `toString` are valid configured slugs. With a direct `plan()` call and `{ version: 2, frames: {} }`, inherited `Object.prototype` values bypass the missing-frame branch, then `authoredFrame.beats.some(...)` throws `Cannot read properties of undefined`. Required coverage must instead emit the path-qualified missing-narrated-frame diagnostic. This violates the prototype-safe slug contract.
- Guidance: Guard the lookup with `Object.hasOwn(visualBeats.frames, frame.slug)` (or validate/normalize the specification before the completeness loop). Add table-driven tests for `constructor` and `toString` with omitted v2 frames.

  Validate with:
  ```bash
  node --test engine/__tests__/plan.test.ts
  ```
- Success checklist:
  - [ ] Required v2 coverage with omitted `constructor` or `toString` frame entries throws the documented `missing narrated frame` error.
  - [ ] No inherited object property is treated as an authored frame.

### CQ-2 — Must fix — `coverageMode: "required"` accepts legacy v1 as if strict coverage were enabled
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/plan.ts:105-120` performs completeness validation only when `visualBeats.version === 2`; `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_beats.ts:501-521` resolves v1 beats without focal roles or coverage endpoints.
- Why it is wrong: A project with `mode: "off", coverageMode: "required"` and a v1 specification completes planning successfully. v1 contains only reveal points and cannot establish strict focal interval coverage. The confirmed contract requires v2 for strict continuous coverage; the compatibility matrix requires a migration/configuration error unless strict v1 derivation is explicitly designed.
- Guidance: Reject `coverageMode: "required"` with a v1 visual specification during planning, with an actionable version-2 migration message. Cover both direct `plan()` and `createProjectPlan()` paths.

  Validate with:
  ```bash
  node --test engine/__tests__/plan.test.ts test/cli/plan-project.test.ts
  ```
- Success checklist:
  - [ ] A v1 spec plus `coverageMode: "required"` fails before neutral artifacts are staged or promoted.
  - [ ] The error identifies v2 migration as the recovery path.
  - [ ] V1 with absent coverage mode or `coverageMode: "warn"` remains compatible.

### CQ-3 — Must fix — Warn-mode omitted v2 frames lose v2 provenance and serialize as legacy v1
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/plan.ts:122-131` assigns `visualSpecVersion` only to frames returned by `resolveVisualBeats()`, which has entries only for authored frame keys. `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/plan_project.ts:136-180` determines the projection version solely from per-frame `visualSpecVersion`.
- Why it is wrong: With v2 input, `coverageMode: "warn"`, and an omitted narrated frame, the plan carries no v2 provenance and `visual_timing.json` becomes:
  ```json
  { "version": 1, "frames": {} }
  ```
  This is indistinguishable from legacy v1/no-coverage input. Part 2 cannot reliably apply v2 coverage warnings while preserving the required migration-warning behavior for actual v1 projects. It also contradicts the requirement that v2 provenance survives frames without focal bindings.
- Guidance: Preserve the loaded specification version for every narrated frame or add an equivalent build-plan-level provenance field. Ensure the v2 projection remains version 2 and includes zero-beat narrated frames so downstream verification can report their coverage gap.

  Validate with:
  ```bash
  node --test engine/__tests__/plan.test.ts test/cli/plan-project.test.ts test/cli/plan.test.ts
  ```
- Success checklist:
  - [ ] A v2 spec that omits a narrated frame in warn mode remains identifiable as v2 in `BuildPlan`.
  - [ ] Its `visual_timing.json` is version 2 and deterministically represents the zero-state frame.
  - [ ] Explicit empty v2 frames and omitted v2 frames remain distinguishable from legacy v1 inputs for future coverage verification.

## Consolidated post-implementation checklist
- [ ] Add prototype-like slug tests for required-v2 frame completeness and return stable missing-frame diagnostics.
- [ ] Reject v1 specs when `coverageMode: "required"` before artifact promotion; retain v1 warn/default compatibility.
- [ ] Preserve document-level v2 provenance for omitted and zero-focal frames, and serialize a deterministic v2 coverage projection.
- [ ] Run:
  ```bash
  corepack npm run typecheck
  node --test \
    engine/__tests__/config.test.ts \
    engine/__tests__/visual_beats.test.ts \
    engine/__tests__/plan.test.ts \
    test/cli/plan-project.test.ts \
    test/cli/plan.test.ts \
    test/cli/workflows.test.ts
  git diff --check
  ```

## Verification gaps and residual risk
- Confirmed locally: typecheck and the specified Part 1 focused suite passed (`211` tests).
- The fixture/type updates outside the neutral implementation are necessary shared-contract updates; no unnecessary functional cross-scope edit was identified.
- Interval-union coverage verification, manifest-v2 evidence, and independent coverage behavior in `md2vid verify` belong to Part 2 and later. Until those parts land, a successful verify command is not evidence of continuous semantic coverage.
