# Canonical Review Artifact

- Review scope: Part 4, Tasks 12-14
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `2c12a9bbcf4c8ca5db37cb49088bc1e34a3f2fce`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines/continuous-visual-coverage/part-4-tasks-12-through-14`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.part4.clyCkY/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

## Findings

### SPEC-1 — Must fix — Verification trusts manifest intervals without validating current runtime bindings
- Requirement: “Coverage evidence must describe the state produced by owned framework behavior” and Task 14 Step 3 requires structural verification plus the neutral verifier, without parsing arbitrary TSX.
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/verify.ts:125-146` verifies only that `build_plan.json` has a defined `visualBindings` property, then passes the separately loaded manifest to `verifyVisualSync()`. It never compares the runtime `visualBindings` consumed by `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/templates/src/Video.tsx:64-72` with the manifest.
- Guidance: Add a structural projection check for v2 that compares each current runtime binding with manifest evidence: frame slug, `beatId`, target, role, `startFrame`, `endFrame`, `durationFrames`, and entrance. Reject missing, extra, or mismatched runtime bindings before accepting manifest coverage. Add a test that mutates generated `build_plan.json.visualBindings` after a successful build and confirms `md2vid verify` fails without reading TSX.
- Success checklist:
  - [ ] Altering a v2 runtime binding’s boundary, target, role, or entrance in `build_plan.json` causes verification to fail.
  - [ ] Missing or extra runtime bindings cause verification to fail.
  - [ ] A valid generated runtime projection still passes structural checks and neutral verification.
  - [ ] `node --test frameworks/remotion/__tests__/verify.test.ts test/cli/workflows.test.ts` covers the mutation path.

### SPEC-2 — Must fix — Source walk excludes generated/dependency directories only at `src/` root
- Requirement: Task 12 Step 5 requires deterministic `src/**/*.{ts,tsx,js,jsx}` enumeration that excludes generated/output/dependency directories; Step 1 requires source additions and extension changes to invalidate evidence.
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/visual_bindings.ts:381` skips `node_modules`, `build`, and `dist` only when `relative === "src"`. A nested generated/dependency path such as `src/scenes/node_modules/dependency.ts` or `src/scenes/build/generated.ts` is recursively included at lines 382-385, contrary to the exclusion contract.
- Guidance: Apply excluded-directory filtering at every recursion level before descending, while retaining symlink rejection. Extend tests to cover nested exclusions and all covered extensions (`.ts`, `.tsx`, `.js`, `.jsx`), including a post-build `.js`/`.jsx` source-set mutation that produces stale evidence.
- Success checklist:
  - [ ] No nested `node_modules`, `build`, or `dist` subtree under `src/` contributes an authored input.
  - [ ] Legitimate nested `.ts`, `.tsx`, `.js`, and `.jsx` scene files remain collected in sorted POSIX order.
  - [ ] Symlinked files and directories still fail closed.
  - [ ] Added, removed, changed, and extension-varied relevant sources all make a v2 manifest stale.
  - [ ] `node --test frameworks/remotion/__tests__/emit.test.ts test/cli/workflows.test.ts` proves these cases.

### SPEC-3 — Must fix — Generated Remotion `PlanFrame` mirror omits v2 coverage exemptions
- Requirement: Task 13 Step 3 says “Mirror neutral v2 types exactly.” The neutral `PlanFrame` includes `visualCoverageExemptions?: ResolvedCoverageExemption[]`.
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/types.ts:163-171` defines `visualCoverageExemptions`; `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/templates/src/types.ts:54-60` does not mirror that field or the `ResolvedCoverageExemption` type.
- Guidance: Add the exact local `ResolvedCoverageExemption` mirror and `PlanFrame.visualCoverageExemptions?: ResolvedCoverageExemption[]`. Add an explicit parity assertion against the neutral contract alongside the existing optional `cueWordIndex` assertion.
- Success checklist:
  - [ ] Template and neutral `PlanFrame` coverage-relevant fields match, including exemptions.
  - [ ] Frame-start v2 states still compile without `cueWordIndex`, and generated output omits the property rather than serializing `null`.
  - [ ] `node --test frameworks/remotion/__tests__/visual_beats.test.ts frameworks/remotion/__tests__/scaffold.test.ts` passes.

### SPEC-4 — Must fix — Required Remotion runtime and packed-smoke visibility proof is absent
- Requirement: Task 13 requires exercising `<VisualBeatProvider>`, `<BeatState>`, and `<BeatReveal>` for direct/sequential/reverse behavior and fallback-title exclusion. Task 14 requires packed smoke to assert direct and reverse visibility for `smoke-opening` and `smoke-landing`, with `smoke-landing` retained through each neutral `frameDur`.
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/__tests__/visual_beats.test.ts:230-291` tests pure resolution helpers, not rendered `BeatState`/`BeatReveal` components under a provider. `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts:2727-2744` runs install/build/check/still and verifies only artifact existence; it performs no direct or reverse runtime visibility assertions on `smoke-opening` or `smoke-landing`.
- Guidance: Add generated-project/runtime coverage tests that inspect component output at the quantized start, interior, end-minus-one, and end boundaries after direct, sequential, and reverse seeks. Cover both smoke targets and prove the final landing remains visible after `voiceDur` until `frameDur`. Add a separate fallback-`TitleCard` assertion proving no semantic binding is created when there is no custom scene/registered target.
- Success checklist:
  - [ ] `BeatState` is absent before start, present on `[startFrame, endFrame)`, and absent at `endFrame`.
  - [ ] `BeatReveal` begins its entrance at the same shared boundary and remains present through its interval.
  - [ ] Direct, sequential, and reverse evaluation produce identical visibility for both smoke targets.
  - [ ] The final landing is visible in the voice-to-frame landing interval.
  - [ ] The fallback title remains non-semantic without a registered planned target.
  - [ ] The Part 4 focused test command covers the runtime assertions.

### SPEC-5 — Must fix — Adjacent shared boundaries are independently quantized rather than reused
- Requirement: Task 12 Step 4 requires: “Reuse the same quantized boundary when one state’s end equals the next state’s start.”
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/visual_bindings.ts:282-283` independently calls `quantizeBoundary()` for every state start and end. Current equal-value fixtures happen to produce equal numbers, but the required shared-boundary ownership is not implemented.
- Guidance: Resolve/canonicalize state boundaries once per frame, then assign the exact same `{ frame, seconds }` result to a prior state’s end and the next state’s start whenever their planned boundary is shared. Retain the inversion check after reuse.
- Success checklist:
  - [ ] Adjacent states sharing a planned boundary use one quantized boundary result for both emitted/runtime endpoints.
  - [ ] Adjacent runtime activation/exit remains gap-free at the shared frame.
  - [ ] Materially inverted intervals still fail rather than being repaired.
  - [ ] `node --test frameworks/remotion/__tests__/emit.test.ts frameworks/remotion/__tests__/visual_beats.test.ts` proves shared-boundary reuse and invalid-interval rejection.

## Consolidated post-implementation checklist
- [ ] Remotion verification structurally validates emitted runtime bindings against manifest-v2 evidence before neutral interval evaluation.
- [ ] Remotion authored-input enumeration recursively excludes generated and dependency subtrees, rejects symlinks, and detects every relevant supported-extension mutation.
- [ ] Generated Remotion types exactly mirror coverage-relevant neutral plan types, including exemptions and optional frame-start `cueWordIndex`.
- [ ] `BeatState` and `BeatReveal` have rendered direct/sequential/reverse boundary tests; fallback shell/title remains non-semantic.
- [ ] Packed Remotion smoke proves `smoke-opening` and `smoke-landing` visibility across direct/reverse seeks and through the held landing.
- [ ] Shared adjacent state boundaries are quantized once and reused for manifest and runtime endpoints.
- [ ] Run the Part 4 gate:
  - [ ] `corepack npm run typecheck`
  - [ ] `corepack npm run typecheck:remotion`
  - [ ] `node --test frameworks/remotion/__tests__/visual_beats.test.ts frameworks/remotion/__tests__/emit.test.ts frameworks/remotion/__tests__/verify.test.ts frameworks/remotion/__tests__/scaffold.test.ts test/cli/workflows.test.ts test/release/harness.test.ts`
  - [ ] `git diff --check`

## Residual risk
The reported Mode A typecheck and Part 4 gate results were not independently rerun during this read-only review. Manual semantic honesty remains intentionally outside automated verification: a focal declaration can establish machine-checkable coverage but cannot prove the rendered visual explains the narration.
