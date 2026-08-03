# Canonical Review Artifact

- Review scope: Part 1, Tasks 1-3
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `clean-head`
- Scope origin: `edcf4ef30ee82e1114f0eb4cca68c50895d27b4d`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.Os62Hg/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Suites run

- `node --test engine/__tests__/narration_request.test.ts engine/__tests__/narration_evidence.test.ts engine/__tests__/voice_assets.test.ts test/cli/cli-args.test.ts test/cli/narration-check.test.ts test/cli/router.test.ts test/cli/run-exports.test.ts`  
  → `138` tests passed, `0` failed, duration `9288.061875ms`.
- `corepack npm run typecheck`  
  → exited `0` (`tsc --noEmit`).
- Media-use prerequisite gate from the active plan  
  → exited `0`: `PASS: media-use Kokoro branch forwards --speed`.
- Routed CLI boundary regression from an unrelated cwd:
  ```bash
  node bin/md2vid.ts narration-check <fixture>
  ```
  → valid protected URL/decimal/domain/backtick fixture: exit `0`; 19-word fixture: exit `1`; two exact repeated approvals: exit `0`; invalid option: exit `2`; fixture content SHA-256 unchanged.
- Production-boundary static inspection:
  ```bash
  grep -RInE 'media-use|audio/scripts/audio\.mjs|child_process|spawn\(|exec\(' ...
  ```
  → no production `media-use` or external-audio-runner reference. Reported process spawns belong to existing HyperFrames, upgrade, release, and package scripts.
- `git diff --check && git status --short`  
  → exited `0`; worktree remained clean. Scoped changes from `edcf4ef30ee82e1114f0eb4cca68c50895d27b4d` are limited to the Part 1 files.

## Findings

### TEST-1 — Must fix — No automated end-to-end coverage for repeated exact approvals

- **Evidence:** `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/narration-check.test.ts:112` tests one `--allow-long-sentence` value with a colon-containing line ID. `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/cli-args.test.ts` tests parser retention of repeated values, but no command-level test proves two approvals reach the analyzer and independently suppress both hard failures.
  
  Narrow manual regression passed:
  ```text
  INFO [narration] approved line="chapter:one" sentence=0
  INFO [narration] approved line="chapter:two" sentence=0
  PASS [narration] 2 lines, 2 sentences, provider=kokoro, voice=am_michael, lang=en, speed=0.9
  ```
  This behavior lacks a durable automated regression test.

- **Guidance:** Add an independent test in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/narration-check.test.ts`, named `applies repeated exact long-sentence approvals independently`. Use two 19-word lines whose IDs contain colons, pass two `--allow-long-sentence <id>:0` options, and assert:
  - exit code `0`;
  - both `INFO approved` lines appear;
  - no `sentence-too-long` failure appears;
  - project tree is byte-for-byte unchanged.
  
  Then run:
  ```bash
  node --test test/cli/narration-check.test.ts test/cli/cli-args.test.ts
  ```

- **Success checklist:**
  - [ ] Two repeated approval options suppress only their corresponding two hard length errors.
  - [ ] Colon-containing IDs remain parsed at the final colon.
  - [ ] The command remains non-mutating.
  - [ ] The focused CLI parser and narration-check tests pass.

### TEST-2 — Must fix — Digest coverage omits several narration-affecting fields

- **Evidence:** `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/narration_request.ts:406-418` includes `provider`, `voice`, `lang`, `speed`, and ordered `{id,text}` in the canonical hash. But `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/narration_request.test.ts:112-121` only proves digest changes for spoken text and line order. The evidence ordering fixture at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/narration_evidence.test.ts:109-145` changes text only for the request-digest mismatch.
  
  The design requires provider, voice, language, speed, line IDs, order, and exact text to participate in invalidation.

- **Guidance:** Add a table-driven unit test in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/narration_request.test.ts`, named `canonical hashing changes for every narration-affecting field`. For a valid baseline, independently vary:
  - `provider`;
  - `voice`;
  - `lang` with a compatible voice;
  - `speed`;
  - a line ID;
  - line order;
  - exact spoken text.
  
  Validate each fixture with `validateVersionedNarrationRequest` and assert each SHA-256 differs from baseline. Retain the existing BGM/SFX stability test as the excluded-fields complement.
  
  Then run:
  ```bash
  node --test engine/__tests__/narration_request.test.ts engine/__tests__/narration_evidence.test.ts
  ```

- **Success checklist:**
  - [ ] Every narration-affecting canonical field has an independent digest-change assertion.
  - [ ] Media-only extensions remain digest-stable.
  - [ ] Request/evidence focused tests pass.

## Consolidated post-implementation checklist

- [ ] Add command-level coverage for two repeated, colon-containing exact approvals and non-mutation.
- [ ] Add table-driven SHA-256 invalidation coverage for provider, voice, language, speed, line ID, order, and text.
- [ ] Run:
  ```bash
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
- [ ] Confirm `git diff --check` and `git status --short` remain clean.

## Coverage gaps and residual risk

- The focused gate exercised protected URLs, domains, decimals/versions, abbreviations, quotes/brackets, backticks, Unicode normalization, deterministic evidence mismatch ordering, exit codes `0/1/2`, no authored-project mutation, and the no-synthesis boundary.
- The two missing automated tests above leave regression risk in the repeatable CLI approval transport and the completeness of request-to-audio invalidation.
- Command-generated mutations were limited to temporary fixtures under `/var/folders/.../T/`, created and cleaned by the suites and the narrow CLI regression. The focused suite logged that an existing HyperFrames patch was already applied in `node_modules`; no repository files changed, and no restoration edits were made.