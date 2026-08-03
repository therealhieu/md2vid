# Canonical Review Artifact

- Review scope: Part 4, Task 11
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `1e87bb4445b689ec88ef7e73a3cbd7a1ce4c550f`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baseline.N19hH0/part-4-task-11`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.xzz3kK/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

## Findings

No Must fix findings.

### CQ-1 — Nice to have — Smoke assertions mislabel quantized pre-state samples
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts:1694` — `frame2StartSample` is `Math.floor(frame2HostStart * fps) / fps`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts:2090` — the assertion labels the sample immediately before the generated cue as “must start hidden.”
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts:2095` — the assertion labels the floored, potentially pre-host sample as “zero at host start.”
- Why it is wrong: with the retained `intro.wav` duration of `1.792s` at a frame-grid FPS, flooring can produce a sample strictly before the nominal host start. These assertions correctly check safe pre-cue/pre-host state, but their messages overstate what was sampled. A future regression that affects time `0` or the exact host boundary could be obscured by the misleading labels.
- Guidance: rename the assertions to describe their actual samples, or add separate probes:
  - retain the existing pre-cue assertion as “hidden immediately before resolved cue”;
  - name the host sample `frame2PreHostSample` and assert it is pre-host/clamped;
  - if needed, add an explicit global-zero probe for “starts hidden.”
  
  Validate with:
  ```bash
  node --test test/release/harness.test.ts
  corepack npm run release:check
  ```
- Success checklist:
  - [ ] Every smoke assertion message matches the exact frame-quantized instant it samples.
  - [ ] Pre-cue, pre-host, and true initial-state checks are distinguishable.
  - [ ] Focused harness tests and the packed release check pass.

## Consolidated post-implementation checklist

- [ ] Address CQ-1’s frame-quantized probe labels or split the probes as described.
- [ ] Confirm fixture hashes remain stable:
  - `intro.wav`: `4334b64e55f587ac639be63c75ec7986452556af6ad044147dd20b4cbf1f168d`
  - `followup.wav`: `cda8b701f2c9b60db41685793014ee1cb61e903fb7276b0b9345b7053af63405`
  - transcript JSON: `9c96065bae53fb3c34e1ccd3186f40ee0034555cba0ae5faa46de4b16802b963`
- [ ] Run `node --test test/release/harness.test.ts`.
- [ ] Run `corepack npm run release:check`.

## Verification gaps and residual risk

- Verified read-only:
  - Task 11 scope is limited to the nine planned fixture/harness/status files.
  - WAV hashes match fixture metadata.
  - WAV sample extents match retained metadata: `43008 / 24000 = 1.792s`; `40960 / 24000`, safely floored to six decimals, is `1.706666s`.
  - The installed-package harness imports packaged `dist/scripts/transcribe.js` and `dist/engine/transcribe.js`, replays retained absolute transcript words, asserts request/WAV evidence, rejects stale spoken text without changing outputs, then continues both framework flows.
  - `node --test test/release/harness.test.ts` passed: 77 tests.
  - `git diff --check 1e87bb4445b689ec88ef7e73a3cbd7a1ce4c550f 55b6b61` passed.

- The full `corepack npm run release:check` was not rerun during this read-only review; this report relies on the supplied Mode A pass for that end-to-end evidence.
- Fixture integrity can prove the checked-in bytes, sample extents, and replay behavior, but cannot independently recreate the historical one-time Kokoro synthesis offline. The implementation accurately declares that limitation with `freshSynthesisDuringTest: false` and the fixture-backed release status.