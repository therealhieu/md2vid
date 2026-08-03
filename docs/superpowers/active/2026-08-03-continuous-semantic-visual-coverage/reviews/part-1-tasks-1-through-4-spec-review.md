# Canonical Review Artifact

- Review scope: Part 1, Tasks 1-4
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `clean-head`
- Scope origin: `4663088d28e8de04fa045c7b8fe73cd36930cd22`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.part1.Jj2tCD/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

## Must fix

### SPEC-001 — Duplicate v2 exemption IDs are accepted

**Evidence**

- [FR-3](file:///Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-requirements.md#L243) requires the schema to reject duplicate IDs.
- [`validateFrameV2`](file:///Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_beats.ts#L304) enforces unique IDs for `beats` at lines 320–328, but [`coverageExemptions`](file:///Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_beats.ts#L331) are only shape-validated and mapped; no duplicate-ID validation exists.
- Reproduction: two `coverageExemptions` with `id: "pause"` validate successfully. This makes the resolved exemption identity ambiguous in generated timing and later verification reports.

**Guidance**

Validate exemption IDs within each v2 frame using the same path-qualified duplicate reporting used for beat IDs. The error should identify the duplicate exemption’s `id` path and its first declaration.

**Success checklist**

- [ ] Two v2 exemptions with the same ID fail parsing.
- [ ] The error names the second `coverageExemptions[n].id` and first declaration path.
- [ ] Distinct exemption IDs continue to parse and resolve unchanged.
- [ ] Existing v1 and valid v2 parser tests remain green.

## Nice to have

None.

## Consolidated checklist

- [ ] SPEC-001: enforce per-frame unique `coverageExemptions` IDs in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_beats.ts`.
- [ ] Add the duplicate-exemption parser regression case in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/visual_beats.test.ts`.
- [ ] Run the Part 1 neutral gate, including parser, planning, CLI transaction, and typecheck suites.

## Residual risks

- Part 1 correctly keeps `beats` as the sole v2 state field, preserves v1/v2 provenance, avoids synthetic v1 focal roles, omits `cueWordIndex` for frame-start states, enables planning when either mode is active, rejects missing/supporting-only v2 frames in required coverage mode, and preserves atomic neutral artifact promotion.
- The interval verifier, manifest-v2 evidence, digest freshness, and framework runtime parity remain intentionally outside this Part 1 review scope.
