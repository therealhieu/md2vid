# Canonical Review Artifact

- Review scope: Part 3, Tasks 9-11
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `219772e22c35ee76a4f5aae40812a524a378e2a2`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines/continuous-visual-coverage/part-3-tasks-9-through-11`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.part3.ckN8k4/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

## Findings

### CQ-1 — Must fix — HyperFrames accepts symlinked authored frame inputs
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/index.ts:25-29` — `collectVisualBindingInputs` uses `existsSync` and `readFileSync`, which follow file and parent-directory symlinks.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/emit.ts:331-335` — preflight also reads planned frame paths without `lstat` or containment checks.
  - The equivalent Remotion collector rejects symlinks at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/index.ts:18-60`; current workflow tests cover Remotion only.
- Why it is wrong: A planned `compositions/frames/<slug>.html` can resolve outside the project and be embedded, hashed, and trusted as semantic evidence. This violates the inherited Part 2 regular-input/symlink boundary and makes the build/freshness source set non-portable and unsafe.
- Guidance: Use one HyperFrames authored-input collector for both preflight and verification. Reject symlink components from the output root through the final file, require a regular file, and produce an actionable missing-input diagnostic rather than an `ENOENT`. Add file-symlink and parent-directory-symlink cases to the HyperFrames workflow tests.
- Success checklist:
  - [ ] A symlinked frame file and a symlinked `compositions`/`frames` directory both fail before reading external bytes.
  - [ ] Missing planned frames fail with a stable authored-input diagnostic.
  - [ ] Build and verify enumerate and hash exactly the same regular, project-contained files.

### CQ-2 — Must fix — Strict v2 declaration errors fail open when reveal mode is off
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/emit.ts:330,344-349` derives parser severity exclusively from `resolveVisualSyncPolicy(config).mode`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:73-76` throws only for `mode === "required"`; otherwise invalid declarations return `false`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/workflows.test.ts:182-189` deliberately uses the supported independent policy `{ mode: "off", coverageMode: "required" }`.
  - With that policy, a v2 target with `data-md2vid-coverage="typo"` returns an empty binding list instead of failing preflight.
- Why it is wrong: Strict v2 coverage parsing becomes permissive under the supported coverage-only mode. A full build can promote a v2 manifest with missing bindings and defer a malformed authored declaration until later verification, violating the strict-declaration and invalid-input transactional requirements.
- Guidance: Derive semantic parsing strictness from both policies. For v2 states, treat `coverageMode: "required"` as required parsing even if reveal mode is off; retain legacy v1 reveal-mode compatibility independently. Add regressions for invalid declarative and custom v2 coverage declarations under `mode: "off", coverageMode: "required"`.
- Success checklist:
  - [ ] Invalid v2 `data-md2vid-coverage` fails a coverage-required build even when reveal mode is off.
  - [ ] Invalid v2 custom `coverage` declarations fail under the same policy.
  - [ ] Valid v1 warn/off behavior remains unchanged.

### CQ-3 — Must fix — Selector validation accepts non-rendered targets as focal coverage
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:257-307` accepts any unique safe `id` found by `elementIds`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:93-100` collects IDs from every parsed tag without limiting them to live descendants of the composition root.
  - A nested inert template such as `<template><div id="decoy" data-md2vid-beat="state" ...></div></template>` produces a focal manifest binding for `#decoy`, even though no rendered target exists for the generated GSAP sets.
- Why it is wrong: The manifest can claim coverage for a target which the runtime cannot display. This bypasses the core “observed framework visibility” invariant and lets an inert nested template satisfy the semantic coverage verifier.
- Guidance: Parse enough document structure to require each declarative target to be a rendered descendant of the one composition root. Exclude nested template content and non-rendered elements; preserve the unique-ID and safe-selector checks. Add a required-mode regression for nested-template and `<template>` target decoys.
- Success checklist:
  - [ ] Nested template content cannot generate a semantic binding.
  - [ ] A live composition-root descendant with a unique safe ID still binds normally.
  - [ ] The generated manifest contains only targets the runtime can address and render.

### CQ-4 — Must fix — Coverage-only verification ignores inner and observed host duration mismatches
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/verify.ts:128-184` observes current host durations and attaches them to the manifest.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_sync.ts:213-227` validates duration evidence only inside `if (revealEnabled)`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_sync.ts:512-530` therefore never compares `authoredDuration → voiceDur` or `outerDuration → frameDur` for `{ mode: "off", coverageMode: "required" }`.
  - Reproduction: a v2 focal binding covering `0..frameDur` with `authoredDuration: 0.5` and `outerDuration: 0.5`, against `voiceDur: 1` and `frameDur: 2`, returns no findings in coverage-required/reveal-off mode.
- Why it is wrong: Final-state retention is asserted through `frameDur`, but a shortened emitted host is accepted in the exact policy mode where coverage is mandatory. A generated-index host mutation is not part of the authored-input digest, so freshness does not cover this gap either.
- Guidance: Validate authored and observed outer durations whenever v2 coverage is enabled, assigning findings at the coverage policy level when reveal checks are off. Add end-to-end tests that mutate the emitted host duration after build and that exercise an authored duration mismatch under coverage-only required mode.
- Success checklist:
  - [ ] A v2 coverage-required project rejects an authored root duration that differs materially from `voiceDur`.
  - [ ] A post-build emitted host duration differing from `frameDur` fails verification even with reveal mode off.
  - [ ] Final coverage through `frameDur` is accepted only when the observed host can retain it.

### CQ-5 — Must fix — Browser coverage seek samples use unquantized expectations and miss opacity-hidden states
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts:1705-1725` computes `expectedVisible` from the requested local boundary, then floors the actual seek through `frameSafeSeekTime`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts:1731-1735` floors to the preceding render frame.
  - At 30 FPS, `coverageStart: 0.13` creates two probes at actual `0.1s`: the “before” probe expects hidden and the “start” probe expects visible. The runtime has not reached `0.13s` for either.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts:2139-2151,2371-2375` records `opacity` but asserts only `checkVisibility()`/display/visibility. An animated `from({ opacity: 0 })` target can be fully transparent while passing this assertion.
- Why it is wrong: The new release proof can fail on valid non-frame-aligned coverage boundaries, and it can pass when a claimed semantic target has zero opacity. It therefore does not reliably prove direct, sequential, and reverse visibility at the manifest boundaries.
- Guidance: Calculate expected state from the effective quantized seek time. Use frame-safe “before” and “after/start” samples that remain on opposite sides of a boundary at 24/30/60 FPS. Require a non-zero opacity threshold for samples expected to be visibly semantic, while retaining explicit final-landing checks. Add a browser regression with `coverageStart: 0.13`.
- Success checklist:
  - [ ] No two probes at the same quantized timestamp assert opposite expected states.
  - [ ] Boundary tests pass at 24, 30, and 60 FPS for non-grid-aligned starts and ends.
  - [ ] Claimed visible coverage samples fail when the target is transparent.
  - [ ] An intermediate owned exit and a final host-retained state are both exercised by real browser seeks.

### CQ-6 — Nice to have — Custom intermediate exits schedule duplicate deactivation sets
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:483-488` schedules `autoAlpha: 0` at every v2 intermediate `beat.end`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:539-549` schedules the same set again when the authored custom binding calls `exit(..., { at: "coverage-end" })`.
- Why it is wrong: The expected custom `from` plus `exit` path adds duplicate identical timeline writes at the same target and time. It is currently deterministic, but obscures ownership and makes later exit changes easier to diverge from manifest evidence.
- Guidance: Make coverage deactivation idempotent per timeline/target/endpoint, or make `exit()` validation-only when generated coverage scheduling already owns the endpoint. Add an assertion that an intermediate custom state has one deactivation set.
- Success checklist:
  - [ ] A custom intermediate state has exactly one endpoint deactivation.
  - [ ] Custom `exit()` still rejects undeclared targets and non-`coverage-end` positions.
  - [ ] Manifest coverage endpoints and runtime state remain unchanged.

## Consolidated post-implementation checklist
- [ ] CQ-1: Reject missing, file-symlinked, and parent-symlinked HyperFrames frame inputs in both build and verify.
- [ ] CQ-2: Make v2 parsing strict whenever coverage mode is required, independent of reveal mode.
- [ ] CQ-3: Require declarative semantic targets to be rendered descendants of the composition root.
- [ ] CQ-4: Validate `voiceDur` and observed `frameDur` evidence for coverage-only verification.
- [ ] CQ-5: Quantize browser expectations correctly and verify opacity-visible semantic coverage across direct, sequential, and reverse seeks.
- [ ] CQ-6: Eliminate duplicate custom exit deactivation sets.
- [ ] Run:
  ```bash
  corepack npm run typecheck
  node --test \
    frameworks/hyperframes/__tests__/visual_timing.test.ts \
    frameworks/hyperframes/__tests__/emit.test.ts \
    frameworks/hyperframes/__tests__/verify.test.ts \
    test/visual/composed-visual-integrity.test.ts \
    test/release/harness.test.ts \
    test/cli/workflows.test.ts
  git diff --check
  ```

## Verification gaps and residual risk
- Executed successfully:
  - `corepack npm run typecheck`
  - focused HyperFrames/workflow/release unit suite: 261 passing tests
  - `node --test test/visual/composed-visual-integrity.test.ts`: 31 passing tests
  - `git diff --check` against the supplied baseline range
- The focused release harness tests validate helper arithmetic but do not execute the complete packed-artifact HyperFrames browser smoke path. That path remains necessary after CQ-5 because current 30 FPS fractional-boundary arithmetic is demonstrably inconsistent.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/specs/development.md` was not present; repository and HyperFrames standards available under `docs/standards/` were reviewed instead.
