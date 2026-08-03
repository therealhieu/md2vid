# Canonical Review Artifact

- Review scope: Part 4, Tasks 12-14
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `ef92f635111a38827fa24dc2a0dcd548dcdfdafb; baseline /var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines.CAUhja/part-4-tasks-12-through-14`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.UauX4k/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Findings

### SPEC-1 — Must fix — Captions-only build leaves Remotion binding evidence stale
- Requirement: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-02-visual-timing-sync/2026-08-02-visual-timing-sync-plan-4.md:251-260` requires emission to write both additive runtime bindings and `build/visual_bindings.json`, while retaining normalized visual bindings during captions-only regroup emission.
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/emit.ts:90-98 — emit()` writes both staged `build_plan.json` (with `visualBindings`) and staged `build/visual_bindings.json`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/index.ts:20-24 — adapter` declares `build_plan.json` as the captions artifact and `build/visual_bindings.json` as its binding manifest.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/build.ts:163-210 — run()` promotes only `adapter.captionArtifactPath` in the `--captions-only` branch. The manifest promotion exists only in the full-build branch at `:263-269`.
  - Consequently, changing the output-local registry and running `md2vid build <output> --captions-only` promotes new runtime bindings in `build_plan.json` while retaining the prior `build/visual_bindings.json`; runtime scheduling and verifier evidence then describe different registries.
- Guidance: Add the staged `adapter.bindingManifestPath` to the captions-only managed-file transaction when the adapter emits it, so `build_plan.json` and the normalized manifest promote atomically. Add an orchestration-level regression test: full-build a Remotion output, change `visual_bindings.json`, run captions-only build, then assert the promoted plan bindings and manifest entries describe the same updated registry.
- Success checklist:
  - [ ] A captions-only Remotion build atomically promotes both `build_plan.json` and `build/visual_bindings.json`.
  - [ ] After a registry edit followed by captions-only build, the promoted manifest has no stale bindings and agrees with `build_plan.json.visualBindings`.
  - [ ] A failed promotion preserves both prior artifacts rather than publishing only one new artifact.

## Consolidated post-implementation checklist
- [ ] Resolve SPEC-1 and add the end-to-end captions-only manifest-promotion regression.
- [ ] Run:
  ```bash
  node --test \
    frameworks/remotion/__tests__/visual_beats.test.ts \
    frameworks/remotion/__tests__/scaffold.test.ts \
    frameworks/remotion/__tests__/emit.test.ts \
    frameworks/remotion/__tests__/verify.test.ts \
    test/examples/hash-table-remotion.test.ts
  ```
- [ ] Run `corepack npm run typecheck:remotion && corepack npm run typecheck`.
- [ ] Run `git diff --check ef92f635111a38827fa24dc2a0dcd548dcdfdafb 0087b10cf93b114ff430a91c1bfbec03c7657b18`.

## Residual risk
- The current Part 4 suite passes 35/35 tests; both requested typechecks and the committed-patch whitespace check pass.
- The suite verifies direct adapter staging for captions-only emission, but does not verify the `scripts/build.ts` captions-only promotion path for Remotion’s separate binding-manifest artifact.
- No arbitrary TSX/Chromium path, raw `CUES` array in `LookupFlowScene`, template local-type mismatch, FPS/Root mismatch, registry validation gap required by Tasks 12–14, or example/scaffold documentation mismatch was found.