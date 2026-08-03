# Canonical Review Artifact

- Review scope: Part 4, Tasks 12-14
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `ef92f635111a38827fa24dc2a0dcd548dcdfdafb; baseline /var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines.CAUhja/part-4-tasks-12-through-14`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.UauX4k/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Suites run
- `node --test frameworks/remotion/__tests__/visual_beats.test.ts frameworks/remotion/__tests__/scaffold.test.ts frameworks/remotion/__tests__/emit.test.ts frameworks/remotion/__tests__/verify.test.ts test/examples/hash-table-remotion.test.ts` → PASS: 35 tests, 0 failures.
- `npm run typecheck:remotion` → PASS: `tsc --noEmit -p frameworks/remotion/templates/tsconfig.json`.
- `npm run typecheck` → PASS: `tsc --noEmit`.
- `git diff --check ef92f63 0087b10` → PASS: no whitespace errors.

## Findings

### TEST-1 — Must fix — Owned reveal runtime lacks entrance, provider, FPS, and progress-boundary coverage
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/__tests__/visual_beats.test.ts:126-200 — only verifies the `rise` token at 30 FPS and direct resolver failures; it does not exercise `VisualBeatProvider`, all supported tokens, invalid FPS, or progress before/start/end boundaries in `useVisualBeatProgress`. `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/templates/src/VisualBeats.tsx:82-119` contains those unprotected branches.
- Guidance: Add focused independent tests in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/__tests__/visual_beats.test.ts`, e.g.:
  - `resolveVisualBeatBinding converts cues at each active FPS` — assert frame conversion at 24, 30, and 60 FPS.
  - `useVisualBeatProgress clamps before, at, during, and after a reveal` — assert `0` before/start, interpolated progress during, and `1` at/after the end, including a zero-duration binding.
  - `VisualBeatProvider rejects missing, unknown, and duplicate targets` — render or deterministically invoke the provider-bound hook for no provider, no target, and duplicate target cases.
  - `BeatReveal supports every registered entrance token` — cover `fade`, `rise`, `slide-left`, `scale`, and `none`.
  - `resolveVisualBeatBinding rejects non-positive and non-finite FPS`.
  Then run `node --test frameworks/remotion/__tests__/visual_beats.test.ts`.
- Success checklist:
  - [ ] Each supported entrance token has an owned reveal test.
  - [ ] Progress is asserted at reveal boundaries using the composition’s active FPS.
  - [ ] Missing provider, unknown target, duplicate target, and invalid FPS are protected by tests.
  - [ ] `node --test frameworks/remotion/__tests__/visual_beats.test.ts` passes.

### TEST-2 — Must fix — Static registry parser accepts unsafe prototype keys and lacks malformed-shape coverage
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/visual_bindings.ts:60-75 — assigns parsed frame keys into `{}`. Reproduction with JSON key `__proto__` returns `Object.keys(spec.frames) === []` and changes `spec.frames`’ prototype, silently discarding the authored registry entry. `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/__tests__/emit.test.ts:329-357` only covers duplicate targets, unknown frames, and unknown beats.
- Guidance: Add parser tests in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/__tests__/emit.test.ts`, e.g. `Remotion static registry rejects malformed and unsafe JSON shapes`. Cover non-object root/`frames`, missing or unsupported version, blank slug, non-array frame values, non-object bindings, blank/missing `beat`/`target`, invalid entrance, negative/NaN duration, and `__proto__`, `prototype`, and `constructor` frame keys. Make unsafe keys fail explicitly or preserve them safely with a null-prototype dictionary; do not silently lose entries. Then run `node --test frameworks/remotion/__tests__/emit.test.ts`.
- Success checklist:
  - [ ] All documented registry fields and container shapes reject malformed input.
  - [ ] Unsafe/prototype-like frame keys cannot mutate a registry object or disappear silently.
  - [ ] Duplicate targets, unknown frames, and unknown beats remain covered.
  - [ ] `node --test frameworks/remotion/__tests__/emit.test.ts` passes.

### TEST-3 — Must fix — Emission mode and captions-only manifest behavior are not fully protected
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/emit.ts:75-98` branches on required mode and always writes a manifest. `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/__tests__/emit.test.ts:359-400` verifies required-mode absence, full-build stale replacement, and captions-only `build_plan.json`, but not warn/off missing registries, legacy plans without visual beats, or captions-only `build/visual_bindings.json`.
- Guidance: Add independent tests in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/__tests__/emit.test.ts`:
  - `Remotion emit permits a missing registry in warn and off modes` — assert a successful emit and the expected empty manifest.
  - `Remotion emit preserves legacy plans without visual beats` — assert no required-registry failure and no additive runtime bindings.
  - `Remotion captions-only emission preserves the normalized binding manifest` — assert staged `build/visual_bindings.json` equals the runtime-source registry normalized against the plan.
  Then run `node --test frameworks/remotion/__tests__/emit.test.ts`.
- Success checklist:
  - [ ] Required, warn, off, and legacy emission paths are individually covered.
  - [ ] Full-build stale replacement and captions-only preservation both assert manifest output.
  - [ ] `node --test frameworks/remotion/__tests__/emit.test.ts` passes.

### TEST-4 — Must fix — Manifest duration evidence is only tested for one frame
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/visual_bindings.ts:123-129` emits per-frame duration evidence. `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/__tests__/emit.test.ts:262-323` and `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/__tests__/verify.test.ts:205-223` exercise only one frame, so a cross-frame duration mix-up is unprotected.
- Guidance: Add a two-frame fixture to `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/__tests__/emit.test.ts` and `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/__tests__/verify.test.ts`, e.g. `Remotion manifest preserves independent authored and outer durations per frame`. Give each frame distinct `voiceDur` and `frameDur`; assert each normalized manifest entry and `frames` evidence retain its own values, and prove the current shared verifier reports only the deliberately corrupted frame. Then run `node --test frameworks/remotion/__tests__/emit.test.ts frameworks/remotion/__tests__/verify.test.ts`.
- Success checklist:
  - [ ] A multi-frame manifest asserts distinct authored and outer durations.
  - [ ] Shared visual-sync verification identifies duration evidence per frame.
  - [ ] `node --test frameworks/remotion/__tests__/emit.test.ts frameworks/remotion/__tests__/verify.test.ts` passes.

### TEST-5 — Must fix — Example registry copy instruction is text-checked but not executed
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/examples/hash-table-remotion.test.ts:83-89` checks that README text contains the registry copy command and cue-first flow. The integration-style overlay test at `:126-149` executes only `COPY_VIDEO` and `COPY_SCENES`, never `COPY_BINDINGS`; a broken registry path or copy command would pass.
- Guidance: Extend `README copy commands overlay a repo-root scaffold without touching unrelated files or config` in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/examples/hash-table-remotion.test.ts` to execute `COPY_BINDINGS` and assert destination `visual_bindings.json` byte-for-byte equals the example source. Keep the existing no-`CUES`, beat-ID equality, unique-target, and cue-first README assertions. Then run `node --test test/examples/hash-table-remotion.test.ts`.
- Success checklist:
  - [ ] The documented registry command executes successfully from the generated project.
  - [ ] The copied registry matches the example registry.
  - [ ] Existing source/config files remain preserved as asserted.
  - [ ] `node --test test/examples/hash-table-remotion.test.ts` passes.

## Consolidated post-implementation checklist
- [ ] Add active-FPS, progress-boundary, provider, target-cardinality, entrance-token, and invalid-FPS coverage for owned visual reveals.
- [ ] Reject or safely handle malformed and unsafe static registry keys and shapes.
- [ ] Cover required, warn, off, and legacy emission modes plus captions-only manifest preservation.
- [ ] Prove independently normalized duration evidence for multiple frames through the shared semantic verifier.
- [ ] Execute the README’s registry-copy command in the example overlay test.
- [ ] Run `node --test frameworks/remotion/__tests__/visual_beats.test.ts frameworks/remotion/__tests__/scaffold.test.ts frameworks/remotion/__tests__/emit.test.ts frameworks/remotion/__tests__/verify.test.ts test/examples/hash-table-remotion.test.ts`.
- [ ] Run `npm run typecheck:remotion`.
- [ ] Run `npm run typecheck`.
- [ ] Run `git diff --check`.

## Coverage gaps and residual risk
- The static JSON reader is protected from authored TSX imports by the invalid-TSX fixture at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/__tests__/emit.test.ts:304-327`; the focused suite does not launch Chromium.
- Adapter registration, context forwarding, `bindingManifestPath`, and Root-FPS parity are covered by `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/__tests__/verify.test.ts:229-245`.
- Scaffold decoupling is covered by the generated-tree assertions, including no repository-relative source references.
- No generated repository mutations were observed. The only dirty path, `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-02-visual-timing-sync/reviews/`, was already untracked in the supplied baseline and is excluded as a prior artifact.