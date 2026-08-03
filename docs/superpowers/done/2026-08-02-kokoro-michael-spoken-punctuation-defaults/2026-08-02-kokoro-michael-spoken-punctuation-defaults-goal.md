# 2026-08-02-kokoro-michael-spoken-punctuation-defaults — Execution Goal

## Persona

You are a senior implementation agent working in the md2vid repository. Follow repository rules, use strict TDD, protect existing user work, keep scope tight, preserve framework-neutral contracts, and make the focused commit listed for every completed task.

## Context

- Execute in the existing feature worktree and never on `main` or `master` without explicit user consent.
- Required execution skill: `superpowers:subagent-driven-development` is recommended; `superpowers:executing-plans` is the inline alternative.
- Requirements: `docs/superpowers/active/2026-08-02-kokoro-michael-spoken-punctuation-defaults/2026-08-02-kokoro-michael-spoken-punctuation-defaults-requirements.md`.
- Design: `docs/superpowers/active/2026-08-02-kokoro-michael-spoken-punctuation-defaults/2026-08-02-kokoro-michael-spoken-punctuation-defaults-design.md`.
- Index plan: `docs/superpowers/active/2026-08-02-kokoro-michael-spoken-punctuation-defaults/2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan.md`.
- Part plans:
  - `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-1.md`
  - `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-2.md`
  - `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-3.md`
  - `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-4.md`
  - `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-5.md`
- Canonical standard: `docs/standards/video-generation.md`.
- Related standards: `docs/standards/frameworks/hyperframes.md` and `docs/standards/frameworks/remotion.md`.
- Goal: make versioned English narration requests default to local Kokoro `am_michael` at effective speed `0.9`, reject breathless spoken scripts before synthesis, and bind synthesized WAVs to their exact request through freshness evidence.
- Architecture:

```text
versioned audio_request.json
  → pure request validation + spoken-sentence analysis
  → canonical request SHA-256
  → /md2vid-owned media-use orchestration
  → immutable Kokoro WAV snapshots
  → md2vid transcribe
  → audio_meta.json + narration_evidence.json
  → shared plan/build/regroup/verify freshness gate
```

- New requests persist `version: 1`, `provider: "kokoro"`, `voice: "am_michael"`, `lang: "en"`, and `speed: 0.9` with the exact FR-1 scaffold lines `Introduce the topic.` and `Recap the key idea.`.
- Spoken sentences target 6–14 lexical words. Sentences of 15–18 words warn. More than 18 words fails unless the exact line ID and sentence index is approved. Only `.`, `?`, `!`, and paragraph breaks reset the hard count.
- Exact authored `lines[].text`, including whitespace, is part of the canonical digest. JSON formatting, BGM, SFX, and unknown extension fields are excluded.
- `skill/md2vid/SKILL.md` is the sole production synthesis orchestrator. Production TypeScript must not locate, import, or spawn media-use.
- Do not add `md2vid audio`, a media-use package dependency, macOS `say`, provider auto-selection, silent cloud fallback, heuristic word timings, or an installed HyperFrames patch.
- Explicit compatible provider, voice, language, and speed overrides remain supported. Non-Kokoro overrides must not require Kokoro readiness; non-English narration must not silently use `am_michael`.
- `md2vid transcribe` remains the word-timing and safe-WAV-duration authority and atomically promotes `audio_meta.json` with `narration_evidence.json` for versioned requests.
- Freshness enforcement is conditional: matching versioned requests are required; absent or unversioned legacy requests remain buildable and verifiable.
- Release proof uses retained Kokoro/Michael fixtures and must state `freshSynthesisDuringTest: false`; it must never claim the release test freshly synthesized Kokoro audio.
- Canonical skill references are generated only by `corepack npm run sync:skill-references`.
- `public-snapshot.json` is generated only by `corepack npm run public:snapshot` after Tasks 1–12 are committed; generation reads committed `HEAD` and ignores dirty or untracked files.
- Do not modify `.tmp` generated projects, requirements, or design during implementation.

## Tasks

1. Before Task 1, run the index plan's external media-use compatibility gate. Stop if the installed supported Kokoro branch does not forward `--speed`; resolve that external prerequisite in its own authorized scope rather than adding an md2vid workaround.
2. Execute Tasks 1–13 strictly in numeric order across Parts 1–5.
3. Preserve coherent groups and commit boundaries:
   - Part 1 Tasks 1–3: narration request, evidence, and check-only CLI contract.
   - Part 2 Tasks 4–6: transcription provenance, atomic evidence, and freshness gates.
   - Part 3 Tasks 7–8: exact scaffolds and skill-owned portable synthesis contract.
   - Part 4 Tasks 9–10: public documentation and packed artifacts; Task 11 is separate fixture-backed release proof.
   - Part 5 Tasks 12–13: public-snapshot tests followed immediately by committed-HEAD regeneration.
4. For each standalone task or group:
   - capture the execution scope before implementation;
   - write the listed failing tests first and confirm the expected failure;
   - implement only the minimal planned behavior;
   - run every targeted check and focused part gate;
   - preserve the listed conventional commit for each task;
   - complete one parallel read-only `spec-reviewer` + `code-quality-reviewer` + `tester` pass;
   - persist canonical review artifacts under this feature's `reviews/` directory;
   - resume the same implementer for all remediation;
   - require exactly one read-only verifier after every adopted finding is implemented and all first-confirmation checks pass.
5. Never run implementation writers concurrently. Reviewers may run in parallel only after Mode A implementation for the current task or group is complete.
6. Treat Task 12's tracked-manifest failure as the intentional TDD boundary: commit the snapshot contract first, then Task 13 alone regenerates `public-snapshot.json` from that committed `HEAD` and returns the group to green.
7. If implementation reveals a contradiction, unsupported external interface, or hidden subsystem boundary, stop before crossing it and document the exact deviation. Do not guess or weaken a success criterion.
8. After Task 13 and all review lifecycles, create the post-implementation check file from concrete shipped results. Do not create it before implementation completes.
9. Publish only after the complete final verification matrix passes, using `superpowers:finishing-a-development-branch`.

## Success Criteria

- Tasks 1–13 and every checkbox in all five part plans are complete in order.
- The external speed-forwarding prerequisite passed before implementation.
- `DEFAULT_NARRATION_POLICY` resolves English defaults to Kokoro `am_michael`, `en`, and effective speed `0.9` without relying on downstream implicit defaults.
- `md2vid narration-check` is check-only, supports repeatable exact long-sentence approvals, protects URLs/decimals/versions/abbreviations/backtick code, reports bounded source diagnostics, and uses exit codes `0`, `1`, and `2` as planned.
- The exact FR-1 request is identical in HyperFrames and Remotion scaffolds.
- Explicit compatible overrides are preserved; non-English requests do not silently use the English voice.
- No production source contains a media-use locator/runner or synthesis `audio` route.
- Successful versioned transcription atomically writes matching `audio_meta.json` and `narration_evidence.json` from immutable pre-provider WAV snapshots.
- Request provider/voice/lang/speed/text/order/ID changes and same-duration WAV-byte changes fail before plan/build/regroup/verify until synthesis and transcription are rerun.
- BGM/SFX-only changes and legacy WAV-plus-metadata projects remain valid.
- README, canonical standards, framework standards, `/md2vid`, and generated skill references agree on workflow order and defaults.
- The packed artifact includes both narration engine modules, `narration-check`, and canonical standards, while excluding a production synthesis runner.
- Fixture-backed release proof validates request values, retained WAV hashes, actual-WAV transcription, freshness rejection, and both frameworks without claiming fresh synthesis.
- `public-snapshot.json` includes the committed narration code, tests, docs, skill, synchronized references, release harness, fixture metadata, and retained WAVs; it excludes `dist/` and `docs/superpowers/`.
- Every command in the index plan's Final Verification section exits `0` with fresh output:

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

- No placeholders, hand-edited generated references, hand-edited snapshot hashes, unfinished code, unrelated implementation changes, or generated-project changes remain.
- The post-implementation check records actual commits, review artifacts, deviations, test results, remaining risks, PR state, and remote CI results after implementation.
