# 2026-08-02-visual-timing-sync — Execution Goal

## Persona

You are a senior implementation agent working in this repository. Follow the project rules, use TDD, keep scope tight, protect user work, and make one focused conventional commit after each completed task. Work only in the existing `fix-visual-timing-sync` worktree.

## Context

- Requirements: `docs/superpowers/active/2026-08-02-visual-timing-sync/2026-08-02-visual-timing-sync-requirements.md`
- Design: `docs/superpowers/active/2026-08-02-visual-timing-sync/2026-08-02-visual-timing-sync-design.md`
- Index plan: `docs/superpowers/active/2026-08-02-visual-timing-sync/2026-08-02-visual-timing-sync-plan.md`
- Part plans:
  - `2026-08-02-visual-timing-sync-plan-1.md`
  - `2026-08-02-visual-timing-sync-plan-2.md`
  - `2026-08-02-visual-timing-sync-plan-3.md`
  - `2026-08-02-visual-timing-sync-plan-4.md`
  - `2026-08-02-visual-timing-sync-plan-5.md`
- No inspection, manual-verification, or post-implementation check file exists yet. Create the check file only after implementation completes.
- Canonical standards:
  - `docs/standards/video-generation.md`
  - `docs/standards/design/frame.md`
  - `docs/standards/design/knowledge-expression.md`
  - `docs/standards/design/frame-content.md`
  - `docs/standards/frameworks/hyperframes.md`
  - `docs/standards/frameworks/remotion.md`
  - `docs/standards/git.md`
- Goal: give md2vid one transcript-resolved semantic timing authority for narration, captions, and framework visuals, while preventing accidental low-FPS final renders.
- Architecture: `visual_beats.json` resolves into additive neutral plan beats; one shared planning transaction serves plan/build/regroup/verify; framework-owned scheduling and static binding evidence feed a common verifier; the HyperFrames proxy enforces explicit render profiles with a 30 FPS final default.
- Tech stack: TypeScript, Node.js built-in test runner, transactional filesystem writes, HyperFrames/GSAP, React/Remotion, JSON artifacts, npm package/release tooling.
- Execute Parts 1–5 and Tasks 1–18 strictly in order. Never run implementation writers concurrently.
- For each marked coherent group, complete Mode A implementation, run the parallel `spec-reviewer` + `code-quality-reviewer` + `tester` pass, resume the same implementer for remediation, and run one read-only verifier before moving on.
- Confirmed choices: helper-owned custom scheduling; Remotion static `visual_bindings.json`; explicit md2vid `--profile`; final default 30 FPS; final minimum 24 FPS unless `--allow-low-fps`.
- Neutral config owns shared planning. Output-local config may own framework/render settings but cannot change neutral timing, canvas, slugs, or `visualSync`.
- Authored semantic duration matches `voiceDur`; emitted host/sequence duration matches `frameDur`; landing time ends at `voiceDur`.
- Legacy projects without visual beats remain buildable in warn mode. New scaffolds use required mode.
- Do not modify `.tmp/prepaid-ledger`, add a Markdown-to-storyboard parser, virtualize captions, change `timing.tail`, or replace GSAP/HyperFrames/Remotion.

## Tasks

- Execute the index plan and each part plan task-by-task without reordering.
- For every task: write the listed failing tests first, run them and confirm the expected failure, implement the minimal specified behavior, run targeted checks, complete the required review/remediation/verifier lifecycle, mark checkboxes, and commit with the listed message.
- Preserve authored frame HTML and Remotion scene source; generated planning, binding, and emitted artifacts must remain transactionally managed.
- Keep HyperFrames custom bindings machine-readable through `data-md2vid-custom-bindings`, and allow only scheduling helpers that own the actual timeline position.
- Keep Remotion bindings in output-local `visual_bindings.json`; normal verification must not parse arbitrary TSX or require Chromium.
- Keep `--quality` independent from md2vid `--profile`; consume md2vid-only flags before spawning HyperFrames.
- Synchronize canonical standards to `skill/md2vid/references/standards/**` with `corepack npm run sync:skill-references` and prove equality.
- Regenerate `public-snapshot.json` with `corepack npm run public:snapshot`; never hand-edit its count or hash.
- If implementation must deviate from the approved plan, stop and document the exact architectural or correctness reason before continuing.

## Success Criteria

- Task 1: neutral visual timing and policy types are validated without changing legacy plan shape.
- Task 2: cue anchors resolve deterministically by word index or normalized phrase occurrence.
- Task 3: resolved beats attach additively to `PlanFrame`.
- Task 4: shared planning and neutral serialization replace duplicated build logic.
- Task 5: `md2vid plan <dir>` writes only neutral timing artifacts transactionally.
- Task 6: build and regroup preserve visual timing and neutral config authority.
- Task 7: semantic planning golden and rollback coverage passes.
- Task 8: common semantic verification reports coverage, timing, order, landing, and duration failures quantitatively.
- Task 9: HyperFrames declarative and custom reveals use beat-owned scheduling.
- Task 10: HyperFrames emits and verifies always-replaced binding manifests.
- Task 11: direct, reverse, and sequential seeks produce equivalent visual states.
- Task 12: Remotion templates expose static-registry-driven owned reveal helpers.
- Task 13: Remotion validates, emits, and verifies binding evidence without executing arbitrary TSX.
- Task 14: the public Remotion example no longer carries hardcoded semantic cue arrays.
- Task 15: final low-FPS HyperFrames renders fail before spawn unless explicit intent is supplied; successful known-output renders write evidence.
- Task 16: new scaffolds include plan workflow, beat example, required visual sync, helpers, and 30 FPS final defaults.
- Task 17: standards, skill guidance, bundled references, and README match shipped behavior.
- Task 18: package, public snapshot, release harness, and all repository gates pass.
- The 3s/11s/14s workflow fixture passes when aligned and detects front-loaded 1.5s/3.7s/5.9s reveals.
- Narration and caption timing behavior remains unchanged.
- `corepack npm run typecheck`, `typecheck:remotion`, `npm test`, `check:skill-references`, `public:snapshot:check`, `check`, `release:check`, and `git diff --check` all exit `0`.
- Implementation matches requirements, design, and plans with no extra scope, placeholders, unfinished work, or uncommitted generated drift.
