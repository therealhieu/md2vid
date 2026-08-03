# Canonical Review Artifact

- Review scope: Part 3, Tasks 8-11
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `09f6efdee9ca7a4067bd641491d0ecc6ff49759b`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines.wb96rv/part-3-tasks-8-through-11`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.LlQjbX/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Findings

### SPEC-001 — Must fix — CLI verification drops semantic context

- Requirement: `md2vid verify` must apply the common semantic verifier to current planned visual beats and output-local binding evidence.
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/verify.ts:181-191` calls `adapter.verify()` with `AdapterVerifyContext`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/index.ts:24-28` replaces that object with legacy string arguments.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/verify.ts:68-100` invokes `verifyVisualSync()` only when it receives an object context.
  - Flow: `scripts/verify context → adapter strips context → string-overload verification → semantic checks skipped`.
- Guidance: Forward object contexts unchanged to the HyperFrames verifier; retain the string overload only for legacy direct callers.
- Success checklist:
  - [ ] `adapter.verify(context)` invokes object-context verification.
  - [ ] A CLI workflow test proves a front-loaded emitted manifest fails `md2vid verify`.
  - [ ] A CLI workflow test proves a missing required manifest fails `md2vid verify`.

### SPEC-002 — Must fix — The `none` entrance token reveals before its cue

- Requirement: The supported `none` token must switch visibility at the resolved narration cue without tweening.
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:51-54` emits only `timeline.set(target, { opacity: 1 }, start)`.
  - No generated operation hides the target at frame time zero.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-02-visual-timing-sync/2026-08-02-visual-timing-sync-design.md:389-395` defines `none` as a visibility switch at the cue.
  - A direct GSAP check against the emitted pattern left `opacity` at `1` at both time `0` and the cue.
- Guidance: Emit deterministic hidden state at frame start and visible state at `beat.start`, using a visibility-aware property such as `autoAlpha` where appropriate.
- Success checklist:
  - [ ] `none` targets are hidden before their resolved beat.
  - [ ] `none` targets become visible at the resolved beat.
  - [ ] Browser-state coverage verifies before/after behavior for `none`, not only generated source text.

### SPEC-003 — Must fix — Custom `set` declarations record a duration the runtime never applies

- Requirement: Custom helper binding evidence must report actual scheduling and reveal duration so landing and duration diagnostics are quantitative.
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:166-172` accepts every non-negative custom declaration duration.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:283-290` copies that duration into `revealDuration`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:379-383` schedules `set()` with no duration and does not validate one.
  - A `set` declaration with `duration: 0.7` has an instantaneous runtime reveal but reports a 0.7-second reveal, producing false landing evidence.
- Guidance: Define `set` as instantaneous by rejecting non-zero declaration durations and emitting `revealDuration: 0`; alternatively, remove `set` until it has a matching duration contract.
- Success checklist:
  - [ ] A non-zero-duration `set` declaration is rejected, or runtime semantics consume that duration.
  - [ ] Normalized `set` binding evidence matches actual reveal completion.
  - [ ] Landing coverage includes `set` at the voice-duration boundary.

### SPEC-004 — Must fix — Duration checks disappear when a planned frame has no bindings

- Requirement: Every frame with planned visual beats must independently validate authored semantic duration against `voiceDur` and emitted host duration against `frameDur`, at active-FPS tolerance.
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:253-256` returns before reading authored root duration when no timing declaration exists.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/emit.ts:342-351` stores authored and outer duration only by decorating bindings.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/verify.ts:121-155` reads emitted host duration only for manifest bindings.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_sync.ts:139-158` checks duration only from bindings.
  - Flow: `planned beat + no declaration → no bindings → no duration evidence → coverage finding only`.
- Guidance: Collect and validate duration evidence per planned visual frame independently from bindings. Do not infer either duration from the neutral plan.
- Success checklist:
  - [ ] A planned frame with no target and authored-root mismatch reports both coverage and authored-duration findings.
  - [ ] A planned frame with no target and emitted-host mismatch reports both coverage and outer-duration findings.
  - [ ] Independent duration checks retain 24/30/60 FPS quantization tolerance.

### SPEC-005 — Must fix — Duplicate element IDs can pass required-mode binding validation

- Requirement: Declarative and custom binding targets must have unique, unambiguous IDs.
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:80-88` stores IDs in a `Map`, silently overwriting duplicate entries.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:194-197` uses `ids.has(id)` as proof of declarative target uniqueness.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:156-162` applies the same lookup to custom targets.
  - One beat-bound element and one unbound duplicate-ID element passes validation while generated selectors target ambiguous DOM nodes.
- Guidance: Track occurrence counts for IDs and require exactly one matching element for declarative and custom bindings.
- Success checklist:
  - [ ] Required mode rejects a beat-bound target whose ID occurs more than once.
  - [ ] Required mode rejects a custom target whose ID occurs more than once.
  - [ ] Warn mode does not inject ambiguous timing scripts.

### SPEC-006 — Must fix — Seek coverage uses a mock player and mock timeline, not the emitted HyperFrames runtime

- Requirement: Direct, sequential, and reverse-then-forward seeks must produce equivalent real visual state around every cue at 24, 30, and 60 FPS.
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/visual/fixtures/visual-timing-sync/authored.html:13-46` replaces GSAP and the player with hand-written mocks.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/visual/composed-visual-integrity.test.ts:538-575` loads that fragment through `page.setContent()` and compares state calculated by the mock.
  - Changing `data-fps` in this fixture does not execute an emitted HyperFrames composition or its actual player/render timeline.
- Guidance: Build and load a complete emitted fixture using real HyperFrames runtime and GSAP; compare actual target state or rendered pixels after direct, sequential, and reverse-then-forward seeks around every cue at each FPS.
- Success checklist:
  - [ ] The test loads emitted `index.html`, not only an injected fixture fragment.
  - [ ] The test uses real GSAP and the actual HyperFrames player/seek path.
  - [ ] The main root is emitted with each tested FPS.
  - [ ] Direct, sequential, and reverse-then-forward runs compare actual visual state on both sides of every cue.
  - [ ] The front-loaded manifest remains a separate explicit negative semantic-verification assertion.

No Nice-to-have findings.

## Consolidated post-implementation checklist

- [ ] Preserve `AdapterVerifyContext` through the HyperFrames adapter so CLI verification invokes `verifyVisualSync`.
- [ ] Make the `none` token hidden-before-cue and visible-at-cue.
- [ ] Align custom `set` duration evidence with instantaneous runtime behavior.
- [ ] Validate authored and emitted durations for every planned visual frame, including frames without bindings.
- [ ] Reject duplicate DOM IDs used by declarative or custom binding targets.
- [ ] Replace mock seek coverage with real emitted HyperFrames runtime coverage at 24/30/60 FPS.
- [ ] Run the Part 3 focused suite, typecheck, and `git diff --check` after remediation.

## Residual risk

- `corepack npm run typecheck` exited `0`.
- `git diff --check` exited `0`.
- The focused suite ran 115/116 tests successfully. The remaining failure is the pre-existing browser-discovery test at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/visual/composed-visual-integrity.test.ts:73`: it clears `CHROME_PATH` and expects `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/node_modules/hyperframes/dist/cli.js`, which is absent in this worktree. The same discovery test exists in baseline `09f6efdee9ca7a4067bd641491d0ecc6ff49759b`.
- Untracked review artifacts under `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-02-visual-timing-sync/reviews/` were excluded.
