# Kokoro Michael and Spoken Punctuation Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make versioned md2vid English narration requests default to local Kokoro `am_michael` at speed `0.9`, reject breathless spoken scripts before synthesis, and bind synthesized WAVs to their exact request through freshness evidence.

**Architecture:** Add a pure neutral narration-request analyzer and evidence verifier, expose a check-only `md2vid narration-check` command, and extend transcription to atomically attest the versioned request and immutable WAV snapshots it actually transcribed. Shared planning and verification reject stale participating evidence, while legacy audio-only projects remain unchanged. Scaffolds and the `/md2vid` skill persist and pass explicit effective media values; production md2vid code never locates or invokes media-use.

**Tech Stack:** TypeScript, Node.js built-in test runner, Unicode-aware deterministic text scanning, SHA-256 JSON/WAV evidence, transactional managed-file promotion, HyperFrames Kokoro/media-use orchestration through skill documentation, npm package/release tooling.

---

## Source Artifacts

- Requirements: `docs/superpowers/active/2026-08-02-kokoro-michael-spoken-punctuation-defaults/2026-08-02-kokoro-michael-spoken-punctuation-defaults-requirements.md`
- Design: `docs/superpowers/active/2026-08-02-kokoro-michael-spoken-punctuation-defaults/2026-08-02-kokoro-michael-spoken-punctuation-defaults-design.md`
- Canonical standard: `docs/standards/video-generation.md`
- Related framework standards:
  - `docs/standards/frameworks/hyperframes.md`
  - `docs/standards/frameworks/remotion.md`
- Related skill source: `skill/md2vid/SKILL.md`

## User-Resolved Decisions

- The exact scaffold line text from requirements FR-1 is authoritative:

```json
{
  "version": 1,
  "provider": "kokoro",
  "voice": "am_michael",
  "lang": "en",
  "speed": 0.9,
  "lines": [
    { "id": "intro", "text": "Introduce the topic." },
    { "id": "recap", "text": "Recap the key idea." }
  ]
}
```

- The longer scaffold example in the design is illustrative, not the serialization oracle.
- Preserve the media-use architecture. Actual Kokoro speed forwarding is an external prerequisite; do not bypass media-use with a new production synthesis runner.
- `skill/md2vid/SKILL.md` remains the sole production synthesis orchestrator.
- No `md2vid audio` command, system-TTS fallback, media-use dependency, or installed HyperFrames patch is added.

## External Prerequisite Gate

Before Task 1, verify that the installed supported media-use implementation forwards effective speed into its Kokoro command:

```bash
MEDIA_USE_ROOT="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/media-use"
node - "$MEDIA_USE_ROOT/audio/scripts/lib/tts.mjs" <<'NODE'
const { readFileSync } = require("node:fs");
const source = readFileSync(process.argv[2], "utf8");
const start = source.indexOf("// kokoro");
if (start < 0) throw new Error("Kokoro branch not found");
const branch = source.slice(start, start + 1800);
if (!branch.includes('"--speed"') && !branch.includes("'--speed'")) {
  throw new Error("media-use Kokoro branch does not forward --speed");
}
console.log("PASS: media-use Kokoro branch forwards --speed");
NODE
```

Expected: exit `0` and the PASS line.

If this fails, stop before implementation. Resolve media-use in its own authorized scope, then rerun the gate. Do not weaken the md2vid `speed: 0.9` success criterion and do not implement an in-repository synthesis workaround.

## Part Plans

| Part | File | Scope | Depends on |
|---:|---|---|---|
| 1 | `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-1.md` | Narration request parser, spoken punctuation analyzer, request hashing, narration evidence, and check-only CLI | External prerequisite gate |
| 2 | `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-2.md` | Transcription provenance, atomic evidence promotion, and stale-evidence gates in plan/build/regroup/verify | Part 1 |
| 3 | `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-3.md` | Exact scaffold defaults, framework onboarding, skill-owned media command contract, readiness checks, and no-runner boundary | Parts 1–2 |
| 4 | `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-4.md` | Canonical standards, README, synchronized skill references, package contents, and fixture-backed release proof | Parts 1–3 |
| 5 | `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-5.md` | Targeted public-snapshot coverage, HEAD-based snapshot regeneration, and final repository gates | Parts 1–4 |

## Cross-Part Contracts

```text
versioned audio_request.json
  ↓ Part 1
validated spoken sentences + canonical request SHA-256
  ↓ Part 2
transcribed audio_meta.json + narration_evidence.json
  ↓ shared planning/verification freshness gate
scaffold + /md2vid skill defaults
  ↓ Part 3
canonical docs + synchronized references + package/release evidence
  ↓ Part 4
tracked public snapshot + full release verification
  ↓ Part 5
```

Fixed public names:

```ts
DEFAULT_NARRATION_POLICY
NarrationProvider
NarrationLine
NarrationRequest
VersionedNarrationRequest
NarrationSentenceApproval
NarrationFinding
NarrationAnalysis
NarrationEvidenceVoice
NarrationEvidence
validateNarrationRequest
validateVersionedNarrationRequest
analyzeNarrationRequest
canonicalizeNarrationRequest
narrationRequestSha256
createNarrationEvidence
validateNarrationEvidence
verifyNarrationEvidence
validateProjectNarrationFreshness
```

Fixed generated path:

```text
<shared>/narration_evidence.json
```

Canonical request digest fields, in order:

```text
version
provider
voice
lang
speed
ordered lines[].id + exact lines[].text
```

Excluded from the digest:

```text
JSON formatting
bgm
sfx
unknown extension fields
```

## Plan-Level Sequencing

- Execute Tasks 1–13 strictly in numeric order.
- Never run implementation writers concurrently.
- Coherent groups are marked in the part plans. Finish Mode A, one parallel `spec-reviewer` + `code-quality-reviewer` + `tester` pass, same-implementer remediation, and one read-only verifier before advancing.
- Preserve one focused conventional commit per task using the listed subject.
- Do not edit requirements, design, or canonical standards except in the tasks that explicitly name a standard as an implementation target.
- Do not modify generated user projects under `.tmp`.
- Do not add a production media-use runner, media-use package dependency, `md2vid audio` route, operating-system TTS fallback, or direct patch to installed HyperFrames.
- Public snapshot generation reads committed `HEAD`. Commit Tasks 1–12 before Task 13 runs `corepack npm run public:snapshot`.

## Part Completion Gates

| Part | Required focused gate |
|---:|---|
| 1 | Request/evidence engine tests, shared CLI parser tests, narration-check tests, router tests, and typecheck pass |
| 2 | Transcription engine/CLI, managed transaction, planning, build/regroup/verify freshness, rollback, and legacy tests pass |
| 3 | Scaffold parity, generated next-step ordering, skill media contract, readiness failure, and no-production-runner boundary tests pass |
| 4 | Canonical docs and synchronized references agree; packed artifacts and fixture-backed release narration evidence pass |
| 5 | Snapshot coverage and generated manifest pass; full check and release gates pass with a clean tracked worktree |

## Requirements Traceability

| Requirement | Implemented and proved by |
|---|---|
| FR-1 default narration request | Task 7 |
| FR-2 explicit provider/voice ownership | Task 8 |
| FR-3 overrides and language behavior | Tasks 1, 3, 8 |
| FR-4 spoken punctuation and sentence structure | Task 1 |
| FR-5 narration preflight | Tasks 1, 3 |
| FR-6 Kokoro readiness and synthesis boundary | Task 8 |
| FR-7 transcript and duration authority | Tasks 4–5, 11 |
| FR-8 request-to-audio freshness evidence | Tasks 2, 4–6, 11 |
| FR-9 workflow ordering | Tasks 7–9 |
| FR-10 scaffold/standards/skill consistency | Tasks 7–9 |
| FR-11 compatibility and framework parity | Tasks 4–7, 11 |
| FR-12 testing and release evidence | Tasks 1–13 |

## Final Verification

Run after every task and review lifecycle is complete:

```bash
corepack npm run check:skill-references
corepack npm run typecheck
corepack npm run typecheck:remotion
corepack npm test
corepack npm run build:dist
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
git status --short
UNEXPECTED_STATUS=$(git status --porcelain=v1 | grep -Ev '^\?\? docs/superpowers/' || true)
test -z "$UNEXPECTED_STATUS"
```

Expected:

- all commands exit `0`;
- synchronized skill references are current;
- the packed CLI exposes `narration-check` and includes both narration engine modules;
- no production source imports or locates media-use;
- fixture-backed release evidence is labelled accurately and does not claim fresh Kokoro synthesis;
- public snapshot matches committed `HEAD`; and
- `git status --short` contains no implementation residue except intentionally untracked canonical review artifacts if the execution workflow created them.

## Completion Criteria

- Every requirement FR-1 through FR-12 maps to completed code, documentation, and passing evidence.
- New scaffolds serialize the exact requirements FR-1 request.
- English default generation uses explicit Kokoro `am_michael`, language `en`, and effective speed `0.9` through the skill-owned media-use contract.
- Long spoken sentences fail before synthesis; warnings remain reviewable and deterministic.
- Kokoro WAVs are transcribed from immutable snapshots; exact durations and words drive captions and visual cues.
- Versioned request edits or source-WAV changes are rejected before plan/build/regroup/verify until synthesis and transcription are rerun.
- Legacy WAV-plus-`audio_meta.json` projects remain buildable and verifiable.
- HyperFrames and Remotion use one framework-neutral narration default.
- No synthesis command or external media runner is added to md2vid production code.
- Canonical standards, skill, bundled references, README, package manifest, release harness, and public snapshot match shipped behavior.
- No placeholders, unfinished code, hand-edited generated references, or hand-edited snapshot hashes remain.
