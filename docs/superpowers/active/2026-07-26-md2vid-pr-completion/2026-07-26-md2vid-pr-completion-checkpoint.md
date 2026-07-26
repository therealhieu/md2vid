# md2vid PR Completion — Session Checkpoint

Written: 2026-07-26. Purpose: resume state for `/goal execute
docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-goal.md`.

## Current position

Tasks 1–9 complete. **Task 10 Steps 1–5 complete; Step 6 (render approval stop) is the next
action.** The render has not run. No commit, push, or PR mutation has been authorized or performed.

## Hard constraints still in force

- No further active-branch commit or push before local `PASS` **and** separate explicit
  authorization. The temporary validation commit must not move the active branch.
- Separate explicit approvals required for: render, commit, push/PR mutation, merge, version bump,
  tag, publish.
- Do not add automated installed-transcribe or full `ffprobe` release-harness coverage (deferred
  follow-ups). The preserved manual black-box gate is required now.
- Do not expose credentials, manually edit `audio_meta.json`, use a global CLI, import active
  repository source into the isolated project, reuse prior generated outputs/audio/MP4s, or use CDN
  GSAP.
- Task 11 Step 12: do not use placeholders or rewrite the historical workaround-backed 2026-07-24
  check as a pass.
- Task 11 Steps 9/15: credential scan over all evidence must produce an empty log.
- Any deviation from the approved design or plan must stop and be documented first.

## Identities

| Item | Value |
| --- | --- |
| Branch | `fix/stabilize-cli-workflows` |
| Active HEAD | `07a11647fc76d79f71402ce0c8fbbe170052d8de` |
| Candidate tree | `be6dd03759bb609408dd5cbfe74bee5c1fda24bd` |
| Validation commit (detached) | `9607ed72090269da72f0202183993d9ba5f4ae0c` |
| Tarball sha256 | `38317cf8e5a8c5d4cee00d71fd9b6f7e530f597d4aa328ebcfb0d1b61aff9106` |
| SRI | `sha512-BI5Nn4Jc7XMAqVl+OuDhGGO1mDKiE8MEzuo6TXv5OEYx52nlUpglYjd8nWSoY30PKDm6cuwrj3hLuHCEVGBtkA==` |
| Package / version | `md2vid` `0.1.2` (tag `v0.1.2`) |
| Node / npm | `v26.4.0` / `11.15.0` (pinned) |
| RUN_ID | `pr12-20260726T132024Z` |

## Live temp state (must be removed in Task 11)

| Var | Path | State |
| --- | --- | --- |
| `SNAPSHOT_ROOT` | `/tmp/md2vid-pr12-candidate.MzkS61` | exists (temp index) |
| `VALIDATION_ROOT` | `/tmp/md2vid-pr12-validation.5ba2kN` | exists (`artifact/`, `checkout/`) |
| `VALIDATION_CHECKOUT` | `/tmp/md2vid-pr12-validation.5ba2kN/checkout` | detached worktree at `9607ed7` |
| `INSTALL_ROOT` | `/tmp/md2vid-pr12-install.jErkeL` | exists |
| Acceptance project | `/tmp/md2vid-pr12-install.jErkeL/dns-resolution` | exists |
| Installed CLI realpath | `/private/tmp/md2vid-pr12-install.jErkeL/node_modules/md2vid/dist/bin/md2vid.js` | v0.1.2 |
| Preview | PID `25935` (`npm run dev`) at `http://localhost:3002` | running; stop in Task 11 |

Helper scripts: `/tmp/md2vid-pr12-task9.sh`, `/tmp/md2vid-pr12-task9-resume.sh`,
`/tmp/fix-dns-tracks.py`, `/tmp/verify-dns-browser.mjs`,
`/tmp/md2vid-pr12-track-structure.mjs`, `/tmp/md2vid-pr12-track-structure-red.json`.

Unrelated pre-existing worktrees (do **not** remove): `md2vid-e2e-final-candidate-worktree.kGDA3W`,
`md2vid-e2e-final-validation.GraAOi`, `md2vid-task109-postfix.Wz2kPv`.

## Repository changes (tracked, uncommitted — 20 files)

Source: `engine/config.ts` (shared `validateSlugMappings`), `engine/plan.ts` (slug validation for
direct callers), `scripts/build.ts` (regular-file project path fails `not a directory` via
`statSync`), `frameworks/remotion/verify.ts` (`sharedDir ?? videoDir` caption fallback).

Tests: `engine/__tests__/config.test.ts`, `engine/__tests__/plan.test.ts`,
`frameworks/remotion/__tests__/verify.test.ts`, `test/cli/run-exports.test.ts`,
`test/cli/package-meta.test.ts` (24 final-gate contracts), `test/cli/workflows.test.ts`,
`test/release/harness.test.ts` (63), `test/cli/fixtures/smoke/0{1,2}-smoke.html`.

Docs: `2026-07-24-md-to-video-e2e-final-gate-checklist.md` (nine-command matrix),
`2026-07-24-stabilize-cli-workflows-plan-{1,2,3,4}.md` (heading levels),
`2026-07-26-md2vid-pr-completion-plan-{1,2}.md` (checkboxes from actual results).

## Verified results so far

- Independent review round + re-run spec review after remediation: PASS at tree `be6dd03…`.
- Nine-gate repository matrix: 723/723 tests, 0 skipped, all exit 0
  (`evidence/.../02-repository-matrix/00..08-*`).
- Pack → verify → isolated install: commit → tree → tarball identity agrees.
- DNS acceptance in isolation: plan `totalDuration` `84.559998`; frame starts
  `0 / 14.153333 / 30.034666 / 47.985332 / 68.431998`; 28 caption groups; narration total `82.56s`.
- Browser assertions all PASS, `remoteGsapRequests: []`.
- Contact sheets built and inspected; `07-browser/visual-review.md` records decision `approved`.

## Evidence layout

`docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/pr12-20260726T132024Z/`
→ `00-candidate/`, `01-independent-reviews/`, `02-repository-matrix/`, `03-validation-artifact/`,
`04-isolated-install/`, `05-dns/`, `06-build-check/`, `07-browser/` (18 snapshots, both contact
sheets, `visual-review.md`).

## Warnings to disclose at the render-approval stop

1. Authored acceptance-input corrections were required in `/tmp` (cross-frame
   `data-track-index` collisions → 41 `overlapping_clips_same_track`; one recap text overflow
   9.81px; two later `fromTo` handoffs needed `immediateRender:false`). Not package-source changes;
   artifact stays valid at tree `be6dd03…`.
2. Documented deviations: two Task 1/2 test-shape deviations; `ℹ tests` matrix-parser format;
   `artifact.json` tree-field assertion correction; packed `dist/engine/*.js` exports used instead
   of the plan's `node_modules` `.ts` imports (Node 26 forbids type stripping under `node_modules`).
3. One lint warning remains: `composition_file_too_large` on generated `index.html` (434 lines).
4. Studio's own runtime fetches `cdn.jsdelivr.net/npm/gsap@3.12.5/dist/MotionPathPlugin.min.js`;
   the composition uses local `assets/gsap/gsap.min.js`.

## Remaining work

**Task 10 Step 6** — present the render-approval package (candidate + artifact identity,
build/check result, browser assertion summary, both contact sheets, warnings, explicit statement
that render has not run) and stop. Options: Render approved / Reject and fix / Stop without
rendering. Approval to write the design or plan is not render approval.

**Task 11** (after render approval only) — preserve the approval record; render; hash the MP4;
`ffprobe` stream/duration validation; extract MP4-derived midpoint and transition frames + contact
sheets; visual and audio inspection; evidence manifest + `SHA256SUMS`; credential scan (must be
empty); stop the preview and verify process exit; remove `VALIDATION_CHECKOUT`, `VALIDATION_ROOT`,
`INSTALL_ROOT`, `SNAPSHOT_ROOT`; write `2026-07-26-md2vid-pr-completion-check.md`; update the
2026-07-24 checkpoint preserving the historical FAIL check; prove post-artifact changes are
documentation-only; regenerate the final manifest; record `PASS` or `FAIL`.

**Task 12** (after local `PASS` only) — stop for commit authorization; two commits with explicit
paths; stop separately for push/PR authorization; push; update the PR #12 body; reply to and
resolve the five original review threads (`PRRT_kwDOThRpkM6Tcv54`/`3642984707`,
`…5-6`/`3642984709`, `…59`/`3642984712`, `…5-`/`3642984713`, `…6C`/`3642984717`); request a
CodeRabbit review; wait for CI; stop ready-to-merge without merging, bumping, tagging, or
publishing.
