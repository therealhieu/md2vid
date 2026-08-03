# Canonical Review Artifact

- Review scope: Part 1, Tasks 1-3
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `clean-head`
- Scope origin: `d11493065b71b360f6f3395bb8813db912448150`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.cfQVBk/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Findings

### CQ-1 — Must fix — Cue-resolution diagnostics omit required recovery context
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_beats.ts:309` — `resolveVisualBeats()` reports an unknown slug only as `unknown frame slug`; it does not list valid frame slugs.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_beats.ts:171` — `validateFrame()` detects duplicate beat IDs but reports neither the first nor duplicate beat location.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_beats.ts:262-266` — phrase failures report only the requested phrase or match count, without transcript context or candidate match locations.
- Why it is wrong: The approved error-handling contract requires unknown-frame diagnostics to include valid slugs, duplicate IDs to identify both locations, and missing/ambiguous cues to include transcript context and candidate matches. Current errors force an author to manually inspect the complete transcript/spec before correcting an invalid anchor.
- Guidance: Enrich resolver errors with bounded, deterministic context:
  - Unknown slugs: include sorted valid slugs.
  - Duplicate IDs: retain the first beat index/path and report it with the duplicate’s path.
  - Phrase failures: include a compact original-text transcript context and, for occurrence failures, candidate occurrences with their original word indexes/text.
  
  Add assertion predicates in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/visual_beats.test.ts` that require those recovery details. Validate with:
  ```bash
  node --test engine/__tests__/visual_beats.test.ts
  corepack npm run typecheck
  ```
- Success checklist:
  - [ ] Unknown-slug errors include the rejected slug and available frame slugs.
  - [ ] Duplicate-ID errors identify both the original and duplicate beat locations.
  - [ ] Missing and invalid-occurrence phrase errors include actionable transcript/candidate context.
  - [ ] Focused visual-beat tests assert the diagnostic context and pass.

## Consolidated post-implementation checklist
- [ ] Implement deterministic, actionable diagnostics for unknown slugs, duplicate IDs, and phrase-resolution failures.
- [ ] Add regression tests covering each required diagnostic detail.
- [ ] Run `node --test engine/__tests__/visual_beats.test.ts engine/__tests__/plan.test.ts engine/__tests__/config.test.ts`.
- [ ] Run `corepack npm run typecheck`.
- [ ] Run `git diff --check`.

## Verification gaps and residual risk
- Verified: 55 focused Part 1 tests passed; `corepack npm run typecheck` and range-scoped `git diff --check` passed; the worktree and supplied untracked-paths artifact were clean.
- The full repository test suite was not run because this review is limited to Part 1 Tasks 1–3.
- Later plan parts own loading `visual_beats.json`, neutral-config authority, artifact serialization, framework bindings, and semantic verification; those integration paths are not yet present in this scoped change.
