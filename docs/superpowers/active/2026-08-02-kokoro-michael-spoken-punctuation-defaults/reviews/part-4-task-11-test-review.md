# Canonical Review Artifact

- Review scope: Part 4, Task 11
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `1e87bb4445b689ec88ef7e73a3cbd7a1ce4c550f`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baseline.N19hH0/part-4-task-11`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.xzz3kK/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

## Canonical Tester Output — Part 4 Task 11

### Scope
Compared Task 11 patch against:

- Baseline: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T/superpowers-baseline.N19hH0/part-4-task-11`
- Candidate worktree: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Plan authority: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-02-kokoro-michael-spoken-punctuation-defaults/2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-4.md`

Task patch scope contains the two retained WAVs, four fixture JSON files, and:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.test.ts`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/run.ts`

## Findings

### TEST-001 — Must fix — Proportional timing-field rejection is incomplete

**Evidence**

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.test.ts:179-181` rejects only four literal property names:

```ts
for (const proportionalField of ["startRatio", "endRatio", "ratio", "durationRatio"]) {
  assert.equal(Object.hasOwn(word, proportionalField), false, `${voice.id} must not retain ${proportionalField}`);
}
```

Task 11 requires rejection of `startRatio`, `endRatio`, **or any proportional timing field**. A fixture word containing, for example, `timeRatio`, `positionRatio`, `proportion`, or `fraction` passes this test and is replayed unchanged by the injected transcript provider.

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts:1264-1269` writes the selected retained word array directly to `transcript.json`, without an equivalent general validation.

**Guidance**

Validate every word-object key, not a fixed allowlist of currently known ratio names. At minimum, reject property names matching a documented proportional-timing pattern, such as `/ratio|proportion|fraction/i`; preferably define the accepted absolute-word schema (`id`, `text`, `start`, `end`) and reject unexpected timing-like keys. Add a negative fixture/unit case for an alternative name such as `timeRatio`.

### TEST-002 — Nice to have — Make the operational-order test semantic rather than comment-dependent

**Evidence**

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.test.ts:73-90` finds ordered prose strings in the source. The production harness currently supplies those strings as comments at:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts:2182-2203`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts:2229`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts:2370`

The actual sequence is implemented correctly and exercised by the full release run, but this source-contract test would pass if those comments remained in order while the calls moved.

**Guidance**

Keep the comments if useful, but assert ordered calls or expose a small ordered stage list that drives execution and can be checked directly.

## Fixture Evidence

| Check | Result |
|---|---|
| Fixture request | Exact Kokoro / `am_michael` / `en` / `0.9` request; `intro` then `followup` |
| WAV format | Both are RIFF/WAVE, PCM 16-bit mono, 24 kHz |
| Safe WAV durations | `intro`: `1.792s`; `followup`: `1.706666s` |
| WAV SHA-256 | Matches `fixture.json` for both files |
| Transcript hash | `expected_words.json` SHA-256 matches `fixture.json` |
| Transcript content | Non-empty, absolute `start`/`end` words; ordered and bounded by safe WAV duration |
| Current ratio fields | No `startRatio`, `endRatio`, `ratio`, or `durationRatio` present |
| Fresh synthesis/transcription | Fixture metadata declares both `false`; no synthesis or external transcription was run |
| Generated temporary fixture files | None found: no repository `audio_meta.generated.json`, `narration_evidence.json`, or `transcript.json` outside generated/ignored outputs |

Verified hashes:

```text
intro.wav     4334b64e55f587ac639be63c75ec7986452556af6ad044147dd20b4cbf1f168d
followup.wav  cda8b701f2c9b60db41685793014ee1cb61e903fb7276b0b9345b7053af63405
```

## Harness Evidence

| Requirement | Result |
|---|---|
| Installed `narration-check` | Executed and passed in both framework smoke projects |
| Test-owned media arguments | Captures effective Kokoro, `am_michael`, `en`, and `0.9` arguments |
| Retained WAV and pre-transcription metadata | Copied into each generated project |
| Installed-package transcription | Imports installed `dist/scripts/transcribe.js` and injects retained absolute words |
| Evidence validation | Checks request digest, provider/voice provenance, snapshot-safe durations, WAV SHA-256, and exact retained words |
| Stale request rejection | Mutates spoken text; installed `md2vid plan .` rejects stale evidence before output-tree changes |
| Request restoration | Restores retained request before framework checks |
| Framework coverage | HyperFrames build/check/render/browser smoke and Remotion install/build/check/still smoke both pass |
| Release wording | Emits `fixture-backed Kokoro am_michael narration evidence`; does not claim fresh synthesis |
| Installed-package isolation | Release output shows isolated install, isolated `CLAUDE_CONFIG_DIR`, and isolated `HOME` checks passing |

## Commands Run

| Command | Result |
|---|---|
| `node --test test/release/harness.test.ts` | PASS — 77/77 |
| `corepack npm run release:check` | PASS — 1,141/1,141 repository tests; packed install and both framework smokes passed |
| Part 4 focused gate exactly as planned | PASS |
| `git diff --check` | PASS — no whitespace errors |
| Temporary narration-file scan | PASS — no generated Task 11 fixture artifacts found |

The focused gate executed:

```bash
corepack npm run check:skill-references
node --test \
  test/cli/skill-references.test.ts \
  test/cli/skill-commands.test.ts \
  test/cli/package-meta.test.ts \
  test/docs-boundary.test.ts \
  test/cli/pack.test.ts \
  test/release/harness.test.ts
corepack npm run build:dist
corepack npm run release:check
```

Its final release smoke reported retained transcription of `intro: 3 words`, `followup: 4 words`, both framework smoke passes, and the fixture-backed narration status.

## Consolidated Checklist

- [x] Retained fixture files exist with exact request/default identity.
- [x] WAV hashes and transcript hash match fixture metadata.
- [x] WAV snapshot durations match `audio_meta.json`.
- [x] Current words are non-empty, ordered, absolute, and duration-bounded.
- [ ] Reject **all** proportional timing-field names, not only four enumerated names. `TEST-001`
- [x] Harness performs required fixture sequence in each framework smoke.
- [x] Installed package, not repository source, supplies narration check, transcription, and stale-plan rejection.
- [x] Stale request fails before changing generated outputs.
- [x] HyperFrames and Remotion smoke flows pass.
- [x] Status text accurately labels fixture-backed evidence.
- [x] No freshly synthesized/transcribed fixture and no generated fixture temp files.
- [x] Pinned `corepack npm run release:check` passes.
- [x] Part 4 focused gate passes.
- [x] No whitespace errors.

## Diff and Mutation Status

Initial and final worktree status both show only the pre-existing untracked review directory:

```text
?? docs/superpowers/active/2026-08-02-kokoro-michael-spoken-punctuation-defaults/reviews/
```

No tracked/untracked repository mutation was introduced by this tester pass. Build and release artifacts were generated only in ignored build output and system temporary directories. No commits were created.

## Residual Risks

1. `TEST-001`: future fixture edits can introduce a differently named proportional timing field without failing integrity tests.
2. `TEST-002`: the source-order assertion primarily verifies marker comments; the full integration release run mitigates this today, but a semantic operation-order contract would be more durable.