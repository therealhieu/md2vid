# Canonical Review Artifact

- Review scope: Part 1, Tasks 1-3
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `clean-head`
- Scope origin: `edcf4ef30ee82e1114f0eb4cca68c50895d27b4d`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.Os62Hg/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Findings

### CQ-1 — Must fix — Protected-span lookup is quadratic for valid narration text
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/narration_request.ts:244-245 — protectedAt()` linearly scans every protected span; `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/narration_request.ts:279-293 — segmentSentences()` calls it at each terminal-punctuation candidate.
- Why it is wrong: A valid request containing many protected domains/URLs makes sentence scanning Θ(punctuation × spans). The input has no size bound, so `x.com. ` repeated 8,000/16,000/32,000 times took approximately 130ms/412ms/2,186ms in this worktree. This can make a local, check-only preflight unacceptably slow on authored or generated narration input.
- Guidance: Merge spans once and advance a monotonic span cursor while scanning normalized text. Since scan indexes only increase, determine protection from the current merged span in O(1), making the scan O(text length + span count) after span construction. Add a large protected-span regression case that verifies both sentence output and practical completion.
  
  Validate with:
  ```bash
  cd /Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync
  node --test engine/__tests__/narration_request.test.ts
  corepack npm run typecheck
  ```
- Success checklist:
  - [ ] Sentence segmentation no longer calls `Array.prototype.some()` across all protected spans for every punctuation candidate.
  - [ ] URLs, domains, version strings, abbreviations, and inline-code punctuation retain their current boundary behavior.
  - [ ] A many-domain/many-sentence fixture completes within a conservative test budget and returns the expected sentence count/findings.

### CQ-2 — Must fix — Request-digest invalidation lacks coverage for several attested fields
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/narration_request.test.ts:112-121 — canonical-hash tests cover spoken-text and line-order changes only; `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/narration_request.ts:406-414 — the digest contract also includes provider, voice, language, speed, and line IDs.
- Why it is wrong: These fields are freshness authorities under FR-8 and the design’s invalidation rules. A future projection/refactor that omits any one of them would leave synthesized audio incorrectly fresh, and the current test suite would not catch it.
- Guidance: Add table-driven hash tests that independently change `provider`, `voice`, `lang`, `speed`, and a line ID, asserting each digest differs from the validated base request. Retain the existing assertions that BGM/SFX and unknown extensions do not alter the digest.
  
  Validate with:
  ```bash
  cd /Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync
  node --test engine/__tests__/narration_request.test.ts engine/__tests__/narration_evidence.test.ts
  corepack npm run typecheck
  ```
- Success checklist:
  - [ ] A provider change changes the canonical request digest.
  - [ ] Voice, language, speed, and line-ID changes each change the digest.
  - [ ] BGM/SFX-only changes remain digest-stable.
  - [ ] The assertions use validated versioned requests and retain ordered-line behavior coverage.

## Consolidated post-implementation checklist
- [ ] Replace per-punctuation full-span scanning with a merged-span cursor while preserving protected-boundary behavior.
- [ ] Add protected-span scale coverage for valid domain/URL-heavy narration.
- [ ] Add independent digest-invalidation assertions for provider, voice, language, speed, and line IDs.
- [ ] Run the Part 1 focused gate:
  ```bash
  cd /Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync
  node --test \
    engine/__tests__/narration_request.test.ts \
    engine/__tests__/narration_evidence.test.ts \
    engine/__tests__/voice_assets.test.ts \
    test/cli/cli-args.test.ts \
    test/cli/narration-check.test.ts \
    test/cli/router.test.ts \
    test/cli/run-exports.test.ts
  corepack npm run typecheck
  ```

## Verification gaps and residual risk
- I accepted the supplied Mode A evidence that the 138 focused tests and typecheck passed; I did not rerun that full gate.
- The review was read-only. The working tree remained clean when inspected.
- The strict evidence schema, deterministic finding order, no-mutation CLI behavior, path validation, and router/CLI exit-code handling otherwise align with the Part 1 requirements and design reviewed under `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-02-kokoro-michael-spoken-punctuation-defaults/`.