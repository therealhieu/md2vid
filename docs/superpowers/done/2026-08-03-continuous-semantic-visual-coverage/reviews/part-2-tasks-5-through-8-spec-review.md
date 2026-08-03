# Canonical Review Artifact

- Review scope: Part 2, Tasks 5-8
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `f68de8253a2877cfb568a6fd87d8055e0d7e65d0`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines/continuous-visual-coverage/part-2-tasks-5-through-8`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.part2.zLxvN1/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

## Findings

### SPEC-1 — Must fix — Required coverage accepts and full builds publish v1-only evidence
- Requirement: “Strict continuous coverage requires v2”; “required v2 evidence [must be] present when coverage is required”; and Task 8: “adapter preflight computes manifest v2 from the full current plan and authored input set.”
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/emit.ts:354-359 — preflight` always emits `version: 1`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/visual_bindings.ts:117,149-163 — resolveRemotionBindings` creates a `VisualBindingManifestV1`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/build.ts:263-268 — full-build promotion` atomically publishes either of those v1 manifests.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_sync.ts:160-164,211-220 — verifyVisualSync` skips interval collection and coverage evaluation whenever the manifest is v1. Thus, a narrated v2 frame under `coverageMode: "required"` can pass with a valid v1 reveal binding and no focal interval evidence.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/workflows.test.ts:216-248 — writeFreshV2Manifest` manually overwrites the manifest after `buildRun`; the freshness tests do not prove a real full build publishes valid v2 evidence.
- Guidance: Make a full build produce manifest v2 from the current plan and the adapter’s shared authored-input collector. Require manifest v2 before evaluating v2 required coverage; missing or v1 evidence must yield a coverage-level finding, not silently skip coverage. Preserve v1 reveal verification only for legacy v1 plans/default compatibility mode.
- Success checklist:
  - [ ] A v2 narrated plan with `coverageMode: "required"` and a v1 manifest fails verification, including with `mode: "off"`.
  - [ ] Full HyperFrames and Remotion builds emit v2 manifests with `planSha256`, sorted `authoredInputs`, roles, and coverage intervals.
  - [ ] A full build followed by verify passes without a test helper fabricating or replacing the manifest.
  - [ ] Captions-only build and regroup still preserve prior manifest bytes and cannot refresh v2 evidence.

### SPEC-2 — Must fix — Public `VisualBinding` omits the required v2 union
- Requirement: Task 5 Step 3 requires `export type VisualBinding = VisualBindingV1 | VisualBindingV2;` while retaining v1 compatibility.
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/types.ts:205-206 — VisualBinding` is aliased only to `VisualBindingV1`. Consumers using the public alias cannot represent v2 focal coverage evidence.
- Guidance: Change the deprecated compatibility alias to the explicit v1/v2 union. Keep versioned manifest types so manifest-version narrowing remains authoritative.
- Success checklist:
  - [ ] `VisualBinding` accepts both v1 reveal-only and v2 coverage-bearing bindings.
  - [ ] Existing v1 adapter and test call sites remain type-safe.
  - [ ] Typecheck passes.

### SPEC-3 — Must fix — Manifest-v2 exact-shape validation permits unknown frame-duration fields
- Requirement: Task 6 requires exact manifest-v2 validation and tests that “unknown v2 fields [are] rejected.”
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_evidence.ts:203-216 — validateFrameDurations` reads known fields but does not call `ensureOnlyFields`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_evidence.ts:314-327 — validateV2Manifest` delegates its optional `frames` array to that permissive validator. For example, a v2 manifest accepts `{ frames: [{ frameSlug: "overview", unexpected: true }] }`.
- Guidance: Validate the exact `VisualFrameDuration` field set for v2 manifests, and add a negative parser test for an unknown field in `frames[n]`. Preserve v1 permissiveness only if needed for unchanged legacy manifest compatibility.
- Success checklist:
  - [ ] Manifest v2 rejects unknown properties in every structured section: top level, bindings, authored inputs, and frame-duration entries.
  - [ ] An unchanged valid v1 manifest remains accepted.
  - [ ] `node --test engine/__tests__/visual_evidence.test.ts` passes.

## Consolidated post-implementation checklist
- [ ] Full builds produce and atomically promote manifest-v2 evidence using the same normalized collector used by verification.
- [ ] Required v2 coverage rejects missing or v1-only coverage evidence; warn mode reports it without accepting coverage.
- [ ] `VisualBinding` is the required v1/v2 public union.
- [ ] Manifest-v2 parsing rejects unknown nested frame-duration fields while retaining v1 compatibility.
- [ ] Add regression coverage for real full-build → verify behavior, v1-manifest rejection in required v2 coverage mode, public v2 binding typing, and nested manifest-v2 unknown fields.
- [ ] Run:
  - [ ] `corepack npm run typecheck`
  - [ ] `corepack npm run typecheck:remotion`
  - [ ] `node --test engine/__tests__/visual_evidence.test.ts engine/__tests__/visual_sync.test.ts test/cli/workflows.test.ts`
  - [ ] `git diff --check`

## Residual risk
- The supplied Mode A gate is reported as passing but was not rerun in this read-only review.
- Direct isolated probes were not executed because `node --import tsx` cannot resolve `tsx` in this worktree; findings are based on the reviewed control flow and existing test fixtures.
