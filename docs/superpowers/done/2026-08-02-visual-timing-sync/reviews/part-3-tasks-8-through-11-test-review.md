# Canonical Review Artifact

- Review scope: Part 3, Tasks 8-11
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `09f6efdee9ca7a4067bd641491d0ecc6ff49759b`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines.wb96rv/part-3-tasks-8-through-11`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.LlQjbX/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

# Canonical Tester Report

- Review scope: Part 3, Tasks 8–11
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: dirty baseline
- Scope origin: `09f6efd`
- Current commit: `e4bff9e`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.LlQjbX/task-scope.patch`
- Baseline: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines.wb96rv/part-3-tasks-8-through-11`
- Pre-existing review artifacts under `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-02-visual-timing-sync/reviews/` excluded.

---

## Suites run

- `CHROME_PATH=/Users/hieunguyen/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell node --test engine/__tests__/visual_sync.test.ts frameworks/hyperframes/__tests__/visual_timing.test.ts frameworks/hyperframes/__tests__/emit.test.ts frameworks/hyperframes/__tests__/verify.test.ts test/visual/composed-visual-integrity.test.ts`
  → FAIL: 116 tests; 115 passed, 1 failed.

  Failing test:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/visual/composed-visual-integrity.test.ts:73`
  - `browser path discovery returns only an executable path on first use`
  - The test deliberately deletes `CHROME_PATH`, then requires `node_modules/hyperframes/dist/cli.js`; `npm ls hyperframes --depth=0` reports the dependency absent.

- `corepack npm run typecheck`
  → PASS: `tsc --noEmit` exited 0.

- `git diff --check 09f6efd..e4bff9e && git diff --check`
  → PASS: no whitespace errors.

- `git status --short && git ls-files --others --exclude-standard`
  → Existing untracked review artifacts only, all in the excluded review directory.

- Command-generated mutation: none. The focused tests use system-temporary directories and removed them. No tracked repository files, package manifests, lockfiles, or dependencies changed.

## Findings

### TEST-1 — Must fix — Adapter dispatch drops the semantic verification context

- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/verify.ts:181-191` correctly constructs an `AdapterVerifyContext` containing the current plan, policy, resolved FPS, and loaded manifest.
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/index.ts:24-29` discards that context and calls the legacy overload:

  ```ts
  return verify(context.videoDir, context.sharedDir, {
    voiceSnapshots: context.voiceSnapshots,
  });
  ```

- Effect:

  ```text
  scripts/verify.ts
    → adapter.verify(AdapterVerifyContext)
    → HyperFrames adapter converts it to legacy call
    → frameworks/hyperframes/verify.ts receives no context
    → verifyVisualSync() is never invoked
  ```

  Therefore CLI verification does not enforce missing/stale/unknown manifests, front-loaded reveals, cue lag, landing, workflow order, root duration, host duration, or configured FPS. The direct unit tests of `frameworks/hyperframes/verify.ts` pass because they call that module directly rather than the registered adapter.

- Guidance: Forward the object context unchanged: `return verify(context)`. Add an integration test through `getAdapter("hyperframes").verify(context)` and through `scripts/verify.ts` showing a current-plan/manifest mismatch exits nonzero.

- Success checklist:
  - [ ] The adapter passes `AdapterVerifyContext` to `frameworks/hyperframes/verify.ts`.
  - [ ] A stale or front-loaded manifest fails through `md2vid verify`, not only direct module invocation.
  - [ ] Warn and off modes retain their intended CLI behavior.
  - [ ] Current inputs are replanned before manifest verification.

### TEST-2 — Must fix — Duplicate HTML IDs are accepted despite the unique-target contract

- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:80-87` stores IDs in a `Map`, overwriting an earlier occurrence.
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:194-197` then checks only `ids.has(id)`, even though its diagnostic promises a “unique” ID.
- Reproduction: a frame containing both `<div id="same" data-md2vid-beat="b">` and `<div id="same">` is accepted in required mode and emits target `#same`.
- Effect: GSAP’s selector can target multiple elements, while the manifest records a single semantic target. This breaks the declared one-target/one-binding evidence contract and makes semantic verification overstate what was actually scheduled.

- Guidance: Track ID cardinality while scanning. Require exactly one matching element for both declarative and custom targets, with a required-mode failure and warn-mode no-op. Add tests for duplicate declarative IDs and duplicate IDs referenced by custom declarations.

- Success checklist:
  - [ ] Duplicate IDs reject declarative bindings in required mode.
  - [ ] Duplicate IDs reject custom binding targets in required mode.
  - [ ] Warn mode preserves authored source and emits no binding evidence for the malformed declaration.
  - [ ] A selector in the manifest resolves to exactly one frame element.

### TEST-3 — Must fix — Custom binding blocks are not required to be inert JSON scripts

- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:118-123` recognizes any `<script data-md2vid-custom-bindings>`.
- Evidence: the parser does not inspect `type`, although the Part 3 contract requires `<script type="application/json" data-md2vid-custom-bindings>`.
- Effect: a declaration block lacking `type="application/json"` is accepted and transported into the rendered composition as executable JavaScript. Its JSON body can then fail at runtime before timeline initialization, while the manifest still claims the custom binding is valid.

- Guidance: Require `type="application/json"` exactly when locating custom declarations. Reject absent or other `type` values in required mode; leave source untouched in warn mode. Add both negative cases to the parser suite.

- Success checklist:
  - [ ] Only one `script[type="application/json"][data-md2vid-custom-bindings]` is accepted.
  - [ ] An untyped or JavaScript-typed declaration block fails preflight in required mode.
  - [ ] The emitted composition retains only inert JSON declaration blocks.

### TEST-4 — Must fix — The required Part 3 focused suite cannot run in this worktree

- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/visual/composed-visual-integrity.test.ts:73-97` intentionally unsets `CHROME_PATH` to verify first-use browser discovery.
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/visual/composed-visual-integrity.test.ts:65-68` invokes `node_modules/hyperframes/dist/cli.js`, but `npm ls hyperframes --depth=0` reports no installed `hyperframes` package.
- `CHROME_PATH` cannot repair this case because the test clears it before discovery.

- Guidance: restore the declared `hyperframes@0.7.80` dependency with the repository’s normal install workflow, without changing dependency declarations or leaving package-manager residue. Re-run the exact Part 3 suite after confirming `node_modules/hyperframes/dist/cli.js` exists.

- Success checklist:
  - [ ] `npm ls hyperframes --depth=0` lists `hyperframes@0.7.80`.
  - [ ] `browser path discovery returns only an executable path on first use` passes.
  - [ ] The exact Part 3 suite reports 116 passed, 0 failed.
  - [ ] `git status --short` has no new dependency or temporary-file residue.

### TEST-5 — Must fix — Several specified Part 3 contracts lack regression coverage

- Missing declarative defaults:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/__tests__/visual_timing.test.ts:72-89` exercises all entrance tokens but does not assert default `fade` output plus the default `0.48s` manifest duration.

- Missing custom method coverage:
  - The runtime test at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/__tests__/visual_timing.test.ts:117-142` exercises only `from`.
  - `fromTo` and `set`, their declaration matching, and their mismatch/error paths are untested.

- Incomplete front-loading aggregate assertion:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/visual/composed-visual-integrity.test.ts:518-527` verifies only the `execute` and `settle` diagnostics. It does not assert the complete three-cue front-loaded aggregate, including `reserve`.

- Missing main-root versus captions-root FPS isolation:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/__tests__/verify.test.ts:194-209` verifies a main-root FPS value but does not provide a conflicting captions FPS to prove the resolver ignores it.
  - The emitted-FPS test only inspects `buildIndexHtml()` and does not prove full-emit root FPS equals the registered adapter’s resolved verification FPS.

- Missing end-to-end duration evidence:
  - Unit coverage verifies binding duration arithmetic, but does not prove a preflight-produced authored root duration mismatch and an emitted host duration mismatch fail via the registered adapter/CLI.

- Guidance: Add table-driven tests for the omitted entrance defaults and all custom helper methods; one aggregate negative fixture asserting all three front-loaded cues; main/captions conflicting FPS cases; full-emit FPS parity; and CLI-level authored-root/host duration failures.

- Success checklist:
  - [ ] All tokens, defaults, validation errors, and required/warn no-beat behavior are asserted.
  - [ ] `from`, `fromTo`, and `set` each prove matching declarations, unsupported calls, and duration/method mismatches where applicable.
  - [ ] The front-loaded fixture asserts diagnostics for reserve, execute, and settle.
  - [ ] Main-root FPS is authoritative even with a conflicting captions-root FPS.
  - [ ] Full emitted FPS equals `resolveVerificationFps()`.
  - [ ] Root `voiceDur` and host `frameDur` failures are proven through adapter/CLI verification.

## Consolidated post-implementation checklist

- [ ] Forward `AdapterVerifyContext` unchanged through the HyperFrames adapter.
- [ ] Reject duplicate target IDs and non-JSON custom declaration scripts.
- [ ] Restore the declared HyperFrames dependency without dependency-file or temporary residue.
- [ ] Add the missing declarative-default, custom-method, front-loading aggregate, FPS isolation/parity, duration, and CLI integration coverage.
- [ ] Run the exact Part 3 suite with the supplied `CHROME_PATH`.
- [ ] Confirm 116 tests pass and none fail.
- [ ] Run `corepack npm run typecheck`.
- [ ] Run `git diff --check`.
- [ ] Confirm no new files outside the explicitly excluded review artifacts.

## Coverage gaps and residual risk

The focused suite covers common semantic failures: unknown frames/beats, missing coverage, duplicate manifest targets, workflow order, landing diagnostics, warn/off/missing-manifest modes, tolerance arithmetic at 24/30/60 FPS, stale-manifest replacement, captions-only manifest retention, and direct/reverse/sequential state comparison at all three cue times and FPS values.

Residual risk remains in the production verification path because the adapter removes the semantic context before invoking the verifier. The parser also accepts duplicate HTML targets and executable custom-declaration blocks. The failed browser-discovery test prevents a clean focused-suite result. The omitted tests leave default entrance duration, full custom-helper API behavior, complete front-loading aggregation, current-input CLI verification, main-root-over-captions FPS selection, full-emission FPS parity, and root/host duration enforcement susceptible to regression.
