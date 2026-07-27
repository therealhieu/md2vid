# 2026-07-26-md2vid-pr-completion — Execution Goal

## Persona

You are a senior implementation agent working in `/Users/hieunguyen/git/hieu/projects/md2vid-public` on branch `fix/stabilize-cli-workflows`. Follow repository rules, use strict TDD for every source behavior change, protect existing user work, keep scope limited to the approved design, and report evidence rather than assumptions.

## Context

- Approved design: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-design.md`
- Plan index: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-plan.md`
- Correctness plan: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-plan-1.md`
- Verification/artifact plan: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-plan-2.md`
- DNS/PR plan: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-plan-3.md`
- Historical checkpoint: `docs/superpowers/active/2026-07-24-md-to-video-e2e/2026-07-24-md-to-video-e2e-checkpoint.md`
- Governing final gate: `docs/superpowers/active/2026-07-24-md-to-video-e2e/2026-07-24-md-to-video-e2e-final-gate-checklist.md`
- Historical workaround-backed FAIL: `docs/superpowers/active/2026-07-24-md-to-video-e2e/2026-07-24-md-to-video-e2e-check.md`
- Goal: close the remaining correctness findings, validate the exact packed candidate through a fresh installed-artifact DNS-to-MP4 run, record `PASS` or `FAIL`, and synchronize PR #12 only after the required approvals.
- Architecture: uncommitted focused fixes → immutable candidate tree → three independent reviews → full source matrix → throwaway validation commit → retained tarball → isolated install → fresh Kokoro/transcription/build/check → browser approval → authorized render → media/evidence/cleanup → authorized commit/push → current remote CI/review.
- Tech stack: Node.js ESM/TypeScript, Node test runner, Corepack npm `11.15.0`, md2vid, HyperFrames `0.7.26`, Remotion `4.0.486`, GSAP `3.14.2`, browser/Playwright inspection, FFmpeg/ffprobe, Git, and GitHub CLI.
- Task order is strict across plan parts. Only the three Task 6 reviews run in parallel by default. Tasks 1 and 2 form the sequential `slug-contract` group.
- A documentation-only design/plan/goal commit was explicitly authorized before implementation. After that planning commit, no further active-branch commit or push is allowed before local `PASS` and separate explicit authorization. The temporary validation commit must not move the active branch.
- Render, commit, push/PR mutation, merge, version bump, tag, and publish are separate approval boundaries.
- Do not add automated installed-transcribe or full `ffprobe` release-harness coverage; those are deferred follow-ups. The preserved manual black-box gate is required now.
- Do not expose credentials, manually edit `audio_meta.json`, use a global CLI, import active repository source into the isolated project, reuse prior generated outputs/audio/MP4s, or use CDN GSAP.

## Tasks

- Execute `2026-07-26-md2vid-pr-completion-plan.md` and its three part plans task-by-task, marking each checkbox from actual results.
- Before Tasks 1-5, invoke `test-driven-development`. For each defect: add the listed failing test, run it and confirm the expected RED reason, implement the minimal fix, run the listed focused GREEN commands, and keep the active tree uncommitted.
- Complete the safe/unique slug validator, direct planner enforcement, workflow mutation protection, build directory check, Remotion direct verification fallback, heading cleanup, and dual whitespace gate exactly as specified.
- Freeze the candidate tree and dispatch one read-only `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel. Do not continue with an unresolved Must fix finding.
- Run the complete matrix in the listed order and preserve every log and exit code. Restart from the beginning after any source fix.
- Create the throwaway validation commit/tree, retained tarball, package-owned verification, and separate isolated install without moving or committing the active branch.
- Build the fresh DNS project from reviewed authored inputs only. Generate fresh Kokoro WAVs, run installed transcription, validate RIFF-based durations and every word bound, then build and check through the isolated installation.
- Perform browser/runtime assertions using times derived from the DNS build plan. Present contact sheets and machine results, then stop for explicit render approval.
- After render approval, render, run `ffprobe`, inspect MP4-derived frames and audio, preserve/hash/scan evidence, clean every temporary resource, and create the actual post-implementation check and checkpoint update.
- After local `PASS`, stop for commit authorization. After committing, stop separately for push/PR-mutation authorization. Synchronize PR #12, resolve original threads with evidence, wait for current CI/review, and stop ready-to-merge.
- If implementation must deviate from the approved design or plan, stop and document the exact reason before proceeding.

## Success Criteria

- Tasks 1-12 are complete with no skipped required step.
- Unsafe, duplicate, missing, and unknown slug mappings fail before planning or output mutation; existing valid slugs remain accepted.
- A regular-file build path reports `not a directory` before layout or metadata lookup.
- Direct `verify(videoDir)` performs Remotion caption-group verification.
- The final gate checks both `main...HEAD` and the working tree.
- Three post-fix independent reviews pass with zero unresolved Must fix.
- npm `11.15.0`, both typechecks, the full test suite, skill references, public snapshot, release check, and both whitespace checks exit `0` in one uninterrupted run.
- The tarball metadata, commit, tree, hashes, and installed executable identity agree.
- Fresh Kokoro narration and installed transcription pass without manual metadata edits; metadata durations equal RIFF sample extents and all words are bounded and ordered.
- Build/check, local GSAP, narration digests, browser timelines/controllers, local-time conversion, parity, nonmonotonic seeks, captions, and isolation assertions pass.
- Render occurs only after explicit approval. The final MP4 is non-empty H.264 `1920x1080` with AAC audio and plan-consistent duration; rendered frames and audio pass inspection.
- Evidence is complete, hashed, ignored, credential-free, and preserved before all temporary processes/directories are removed.
- `2026-07-26-md2vid-pr-completion-check.md` records concrete identities, commands, hashes, warnings, cleanup, and explicit `PASS` or `FAIL`.
- No package source changes occur after artifact validation without restarting the affected gates.
- Commit and push occur only after their explicit approvals. PR #12 passes current remote checks/review and has no unresolved blocking thread.
- Execution stops ready-to-merge. Merge, version bump, tag, and publish remain unperformed without separate authorization.
- No placeholders, unfinished work, silent workaround, or unsupported scope expansion remains.
