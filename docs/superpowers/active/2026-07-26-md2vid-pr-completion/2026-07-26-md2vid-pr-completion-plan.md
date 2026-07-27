# Finish md2vid PR #12 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining correctness findings, validate the exact packed candidate through a fresh installed-artifact DNS-to-MP4 run, record `PASS` or `FAIL`, and synchronize PR #12 only after the required user approvals.

**Architecture:** Treat the active working tree as an uncommitted candidate layered on baseline commit `77e36e1`. Validate it through focused TDD, three independent reviews, an uninterrupted repository matrix, a throwaway Git tree/commit, retained tarball verification, isolated installation, fresh Kokoro transcription, deterministic browser checks, approved render, media inspection, evidence preservation, and cleanup. Commit, push, PR mutation, merge, versioning, and publication remain separate authorization boundaries.

**Tech Stack:** Node.js ESM/TypeScript, Node test runner, npm `11.15.0` via Corepack, md2vid CLI, HyperFrames `0.7.26`, Remotion `4.0.486`, GSAP `3.14.2`, Playwright/browser inspection, FFmpeg/ffprobe, Git/GitHub CLI.

---

## Source artifacts

- Approved design: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-design.md`
- Prior workflow design: `docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-design.md`
- Prior workflow check: `docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-check.md`
- E2E checkpoint: `docs/superpowers/active/2026-07-24-md-to-video-e2e/2026-07-24-md-to-video-e2e-checkpoint.md`
- Final gate: `docs/superpowers/active/2026-07-24-md-to-video-e2e/2026-07-24-md-to-video-e2e-final-gate-checklist.md`
- Historical failed E2E check: `docs/superpowers/active/2026-07-24-md-to-video-e2e/2026-07-24-md-to-video-e2e-check.md`

Do not create the new post-implementation check during planning. Task 11 creates it from actual execution evidence.

## Plan parts

1. `2026-07-26-md2vid-pr-completion-plan-1.md` — Correctness and review fixes
   - Task 1: safe, unique slug validator
   - Task 2: direct planner protection and full-build atomicity
   - Task 3: build project-directory validation
   - Task 4: direct Remotion caption verification
   - Task 5: plan headings and final whitespace gate
2. `2026-07-26-md2vid-pr-completion-plan-2.md` — Reviews, repository gates, and artifact isolation
   - Task 6: candidate identity and three independent reviews
   - Task 7: uninterrupted repository matrix
   - Task 8: throwaway validation commit, retained artifact, and isolated install
3. `2026-07-26-md2vid-pr-completion-plan-3.md` — DNS acceptance, render, evidence, and PR synchronization
   - Task 9: fresh DNS scaffold, Kokoro, installed transcription, build, and check
   - Task 10: browser/runtime verification and render approval
   - Task 11: render, media inspection, evidence, cleanup, and PASS/FAIL
   - Task 12: authorized commit, push, PR synchronization, and ready-to-merge stop

## File responsibility map

| File or directory | Responsibility |
|---|---|
| `engine/config.ts` | Canonical runtime validation for safe and unique slug values. |
| `engine/plan.ts` | Complete mapping validation for direct callers before timeline/caption construction. |
| `engine/__tests__/config.test.ts` | Unsafe, duplicate, valid, missing, and unknown slug contracts. |
| `engine/__tests__/plan.test.ts` | Direct planner protection. |
| `test/cli/workflows.test.ts` | HyperFrames and Remotion pre-mutation build atomicity. |
| `scripts/build.ts` | Early project-directory validation. |
| `test/cli/run-exports.test.ts` | Regular-file project-path regression. |
| `frameworks/remotion/verify.ts` | `videoDir` fallback when `sharedDir` is omitted. |
| `frameworks/remotion/__tests__/verify.test.ts` | Direct adapter caption mismatch regression. |
| `test/cli/package-meta.test.ts` | Final-gate documentation contract. |
| `docs/superpowers/active/2026-07-24-stabilize-cli-workflows/*-plan-*.md` | Correct task heading hierarchy. |
| `docs/superpowers/active/2026-07-24-md-to-video-e2e/*-final-gate-checklist.md` | Committed-range and working-tree whitespace gates. |
| `docs/superpowers/active/2026-07-24-md-to-video-e2e/*-checkpoint.md` | Historical continuity and final task closure. |
| `docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/` | Ignored review, gate, artifact, DNS, browser, render, media, and cleanup evidence. |
| `docs/superpowers/active/2026-07-26-md2vid-pr-completion/*-check.md` | Authoritative post-execution PASS/FAIL record, created only in Task 11. |

## Cross-part dependencies

```text
Part 1 focused RED/GREEN fixes
  ↓
Task 6 immutable candidate tree
  ↓
3 independent reviews, zero Must fix
  ↓
Task 7 uninterrupted matrix
  ↓
Task 8 validation commit + tarball + isolated install
  ↓
Task 9 fresh DNS Kokoro/transcribe/build/check
  ↓
Task 10 browser/runtime/visual approval
  ↓
explicit render approval
  ↓
Task 11 render/media/evidence/cleanup/PASS
  ↓
explicit commit authorization
  ↓
explicit push/PR authorization
  ↓
Task 12 remote CI/review → ready to merge
```

Any source change after Task 6 starts invalidates downstream evidence. Recompute the candidate tree and rerun the affected reviews, complete matrix, artifact, and E2E path.

## Plan-level parallelism

- Tasks 1-5 touch mostly independent files, but the default execution is sequential because the active working tree must remain one coherent uncommitted candidate.
- If the execution workflow provides isolated worktrees, Tasks 3, 4, and 5 may run in parallel. Tasks 1 and 2 remain sequential as `[Group: slug-contract]` because Task 2 consumes Task 1's helper.
- Task 6's three read-only reviews run in parallel against the same candidate tree.
- Tasks 7-12 are sequential because each consumes identity or evidence produced by the prior task.
- In Task 11, visual-frame and audio analyses may be performed in parallel only after the MP4 exists; the final media decision waits for both.

## Execution rules

1. Invoke `test-driven-development` before implementing Tasks 1-5.
2. Write each failing test first and observe the expected RED result.
3. Implement only the minimal production/documentation change required for GREEN.
4. Run every focused command listed by the task.
5. The user explicitly authorized one documentation-only commit containing this design, plan, and goal before implementation. After that planning commit, do not commit or push the active branch during Tasks 1-11; this release constraint overrides the normal per-task commit cadence.
6. Do not stage unknown untracked files. Evidence remains ignored.
7. Do not reuse a review, matrix, artifact, or E2E result after the candidate source changes.
8. Do not manually edit `audio_meta.json`.
9. Do not use a global `md2vid`, repository-source import, prior WAV, prior generated output, prior MP4, or CDN GSAP fallback.
10. Preserve failure evidence before cleanup; never relabel a workaround-backed run as `PASS`.
11. Render requires explicit approval after browser and visual checks.
12. Commit and push require separate explicit approvals after local `PASS`.
13. Merge, version bump, tag, and publish require further separate approvals.

## Required review loop

After Part 1:

```text
spec-reviewer ───────────┐
code-quality-reviewer ───┼→ finding disposition → zero Must fix
independent tester ──────┘
```

A Must fix finding returns to focused TDD and invalidates the prior candidate tree. Nice-to-have findings are adopted or explicitly deferred with evidence.

## Final verification

The final source matrix is:

```bash
corepack npm --version
corepack npm run typecheck
corepack npm run typecheck:remotion
corepack npm test
corepack npm run check:skill-references
corepack npm run public:snapshot:check
corepack npm run release:check
git diff --check main...HEAD
git diff --check
```

The final black-box path is:

```text
reviewed candidate tree
  → throwaway validation commit
  → retained npm tarball
  → package-owned artifact verification
  → separate isolated install
  → fresh DNS project
  → fresh Kokoro WAVs
  → installed md2vid transcribe
  → build/check
  → derived browser seeks and visual review
  → explicit render approval
  → MP4
  → ffprobe + extracted frames + audio review
  → evidence manifest + credential scan + cleanup
  → PASS or FAIL
```

## Completion criteria

- All 12 tasks are checked from concrete results.
- Slugs are safe, unique, complete, and validated before mutation.
- Build rejects non-directory project paths accurately.
- Direct Remotion verification checks local caption groups.
- Existing PR review debt has an evidence-backed disposition.
- Three current independent reviews contain no Must fix.
- The complete matrix passes uninterrupted with npm `11.15.0`.
- Artifact metadata identifies the reviewed validation commit/tree.
- The isolated DNS workflow uses no global/repository contamination and no manual metadata correction.
- Browser, visual, render, codec, dimensions, duration, caption, final-frame, and audio-tail checks pass.
- Evidence is complete, hashed, ignored, credential-free, and preserved before cleanup.
- Temporary resources and processes are removed.
- The new check records explicit `PASS` or `FAIL`.
- Commit/push occur only after their explicit approvals.
- Current remote CI/review pass on the pushed head.
- Execution stops ready-to-merge; merge/version/publish are not performed without further authorization.
