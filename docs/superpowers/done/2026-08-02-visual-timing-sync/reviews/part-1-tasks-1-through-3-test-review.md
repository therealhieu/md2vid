# Canonical Review Artifact

- Review scope: Part 1, Tasks 1-3
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `clean-head`
- Scope origin: `d11493065b71b360f6f3395bb8813db912448150`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.cfQVBk/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Suites run
- `node --test engine/__tests__/visual_beats.test.ts engine/__tests__/plan.test.ts engine/__tests__/config.test.ts` → PASS: 55 tests, 55 passed, 0 failed.
- `corepack npm run typecheck` → PASS: `tsc --noEmit` exited 0.
- `git diff --check d11493065b71b360f6f3395bb8813db912448150 3b98c6e53c0ea6307d275ab4f58c098b1e0f72f0 && git diff --check && git status --short && git ls-files --others --exclude-standard` → PASS: exited 0 with no output; Mode A worktree is clean and has no untracked files.
- `git show --format= --check d11493065b71b360f6f3395bb8813db912448150..3b98c6e53c0ea6307d275ab4f58c098b1e0f72f0 && git fsck --no-dangling --no-reflogs` → PASS: exited 0 with no output.
- Command-generated mutation: none. The focused config suite creates and removes its own system-temporary directory; no repository files changed.

## Findings

### TEST-1 — Must fix — Configuration policy validation and override paths lack regression coverage
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/config.ts:181-202 — validateVideoConfig()` adds the `visualSync` and `render` validation surface. `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/config.test.ts:19-64` tests one accepted complete policy, selected invalid numeric values, and `minimumFinalFps` below 24, but does not cover invalid enum values; `maxLead`/`maxLag` zero, non-finite, or wrong-type inputs; `render.fps` zero, negative, non-finite, or wrong-type inputs; or `minimumFinalFps` non-finite/wrong-type inputs. `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/plan.test.ts:78-85` tests only all-default policy resolution, not partial explicit overrides.
- Guidance: In `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/config.test.ts`, add a table-driven test named `rejects malformed visual sync and render policy values` covering invalid `mode` and `profile`, invalid numeric boundaries/types for every new numeric field, and valid zero tolerance values. In `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/plan.test.ts`, add `resolves supplied visual sync policy keys over legacy defaults`, asserting each supplied key replaces only its corresponding default. Run `node --test engine/__tests__/config.test.ts engine/__tests__/plan.test.ts`.
- Success checklist:
  - [ ] Every newly introduced policy enum rejects unknown values with a path-qualified diagnostic.
  - [ ] Each new numeric policy field has tests for its allowed boundary and invalid finite/type boundaries.
  - [ ] Partial `visualSync` configuration preserves unspecified legacy defaults while applying supplied values.
  - [ ] `node --test engine/__tests__/config.test.ts engine/__tests__/plan.test.ts` exits 0.

### TEST-2 — Must fix — Repeated identical phrase occurrence selection is unprotected
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_beats.ts:221-230 — matchingPhraseLocations()` enumerates every token-sequence match; `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_beats.ts:257-265 — resolveBeat()` selects `matches[occurrence - 1]`. The positive phrase test at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/visual_beats.test.ts:29-50` has one occurrence only. The out-of-range assertion at lines 211-238 proves rejection, but no test proves that occurrence `2` selects the second occurrence of the same normalized phrase and preserves its original word index/timing.
- Guidance: In `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/visual_beats.test.ts`, add `resolves a repeated normalized phrase by explicit occurrence`. Use the same phrase twice at distinct original word indexes, request `occurrence: 2`, and assert the second occurrence’s `cueWordIndex`, `start`, and original-text `cueText`. Run `node --test engine/__tests__/visual_beats.test.ts`.
- Success checklist:
  - [ ] A repeated identical phrase with `occurrence: 2` resolves to the second match rather than the first.
  - [ ] The resolved beat retains the selected original word index, local start time, and original cue text.
  - [ ] `node --test engine/__tests__/visual_beats.test.ts` exits 0.

### TEST-3 — Must fix — Exact cue-union rejection is only partially covered
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_beats.ts:48-73 — validateCue()` requires exactly either `{ wordIndex }` or `{ phrase, occurrence }`, including no additional own keys. `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/visual_beats.test.ts:149-169` covers absent keys, both branches, and invalid branch values, but does not exercise non-object cues or either valid branch with an extraneous key. A future loosening of `Object.keys(value).length` would pass the current suite while accepting an unsupported or ambiguous authored cue.
- Guidance: Extend `rejects malformed beat fields and cue union branches` in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/visual_beats.test.ts` with `cue: null`, `cue: []`, `{ wordIndex: 0, extra: true }`, and `{ phrase: "beat", occurrence: 1, extra: true }`. Assert the stable cue-object/exact-branch diagnostic. Run `node --test engine/__tests__/visual_beats.test.ts`.
- Success checklist:
  - [ ] Null and array cue values are rejected.
  - [ ] Both otherwise-valid union branches reject undeclared keys.
  - [ ] `node --test engine/__tests__/visual_beats.test.ts` exits 0.

### TEST-4 — Must fix — Legacy serialization and selective additive attachment are not asserted end-to-end
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/plan.ts:100-109 — plan()` mutates only frames returned by `resolveVisualBeats`; `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/plan.test.ts:37-44` asserts absent runtime properties for one legacy frame, and lines 46-61 asserts attachment to one fully covered plan. Neither test compares a legacy serialized plan with its prior serialized shape nor verifies that frames omitted from a supplied multi-frame beat specification remain byte-for-byte legacy-shaped while a sibling receives beat data. This leaves the Part 1 additive serialization requirement unprotected.
- Guidance: In `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/plan.test.ts`, add:
  - `serializes a legacy plan without visual timing keys`, comparing the legacy frame JSON to the expected pre-change frame shape.
  - `attaches beats only to frames named by the visual specification`, using at least two voices, one beat-spec frame, and assertions that the unmentioned frame has neither visual property in both runtime and serialized output.
  
  Run `node --test engine/__tests__/plan.test.ts`.
- Success checklist:
  - [ ] A two-argument legacy plan serializes without `visualKind` or `visualBeats`.
  - [ ] A multi-frame plan adds visual fields only to the frame named in `visual_beats`.
  - [ ] Captions and timeline values for untouched frames remain unchanged.
  - [ ] `node --test engine/__tests__/plan.test.ts` exits 0.

## Consolidated post-implementation checklist
- [ ] Add exhaustive `visualSync`/`render` enum, numeric-boundary, and partial-default-resolution coverage.
- [ ] Add a positive repeated-phrase occurrence-resolution test.
- [ ] Add strict cue-union tests for non-object and extraneous-key inputs.
- [ ] Add legacy JSON serialization and multi-frame selective-attachment tests.
- [ ] `node --test engine/__tests__/visual_beats.test.ts engine/__tests__/plan.test.ts engine/__tests__/config.test.ts` exits 0.
- [ ] `corepack npm run typecheck` exits 0.
- [ ] `git diff --check` exits 0.
- [ ] `git status --short` and `git ls-files --others --exclude-standard` produce no output.

## Coverage gaps and residual risk
The focused suite confirms the reported 55 passing tests, including Unicode/punctuation mapping, one prototype-like slug (`__proto__`), ordinary unknown slugs, workflow sequencing and monotonicity, default policy resolution, off mode, and basic additive fields. It does not yet protect all newly exposed configuration bounds, positive repeated-phrase selection, the complete exact cue union, or serialized additive behavior across partially specified multi-frame plans. Part 1 does not yet exercise later plan/build transaction, binding, semantic-verifier, seek, legacy-warning, or render-policy workflow behavior; those belong to subsequent plan parts.
