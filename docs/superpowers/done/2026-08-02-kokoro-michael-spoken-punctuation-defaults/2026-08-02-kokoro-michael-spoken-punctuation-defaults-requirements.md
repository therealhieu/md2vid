# Kokoro Michael and Spoken Punctuation Defaults — Requirements

## Table of Contents

- [Problem](#problem)
- [Goal](#goal)
- [Confirmed Evidence](#confirmed-evidence)
- [Project Context](#project-context)
- [Scope](#scope)
- [Constraints](#constraints)
- [Decisions](#decisions)
- [Functional Requirements](#functional-requirements)
- [Candidate Directions](#candidate-directions)
- [Success Criteria](#success-criteria)
- [Risks and Assumptions](#risks-and-assumptions)

## Problem

md2vid scaffolds an `audio_request.json.example` and instructs the authoring agent to generate narration through an external media workflow, but it does not currently define one durable provider, voice, pace, or spoken-punctuation default.

```text
Markdown source
  → agent-authored narration
  → unspecified TTS route
       ├── system voice
       ├── cloud provider
       └── local Kokoro
  → inconsistent voice and pacing
```

This gap produced a valid but undesirable end-to-end result:

- narration used the macOS `Samantha` voice rather than Kokoro Michael;
- `audio_request.json` contained only `lines[]`, so provider and voice intent were not persisted;
- technical sentences reached 17–19 words with several clauses; and
- measured pauses were only about 0.23–0.31 seconds, making the narration sound continuous even where punctuation existed.

The defect is project-wide policy, not a problem specific to the inspected prepaid-ledger video. A future `/md2vid` run can repeat it whenever an agent bypasses the supported media workflow or depends on whichever provider default happens to be active.

## Goal

Make md2vid-generated English narration deterministic and listenable by default:

1. local Kokoro is the default md2vid narration provider;
2. Kokoro voice `am_michael` is the default English voice;
3. default speed is appropriate for technical explanation;
4. narration is written for speech, with strong punctuation and bounded sentence length;
5. explicit user choices still override every default;
6. generated word timings come from the synthesized WAV, not estimated text timing; and
7. scaffolds, standards, skill instructions, tests, and release evidence agree on the same contract.

The selected default is:

```json
{
  "version": 1,
  "provider": "kokoro",
  "voice": "am_michael",
  "lang": "en",
  "speed": 0.9
}
```

## Confirmed Evidence

### The scaffold does not persist narration defaults

`scripts/scaffold_project.ts:14-19` currently emits only example lines:

```ts
const AUDIO_REQUEST_EXAMPLE = {
  lines: [
    { id: "intro", text: "Introduce the topic." },
    { id: "recap", text: "Recap the key idea." },
  ],
};
```

A generated request therefore does not record provider, voice, language, speed, or a no-BGM decision.

### md2vid intentionally delegates synthesis

- `bin/md2vid.ts:27-38` has no audio-synthesis command.
- `docs/standards/video-generation.md:84-87` states that narration is prepared through the md2vid and media skills or an external TTS provider.
- The current architecture treats `audio_request.json` as authored generation intent and `audio_meta.json` plus WAV files as neutral inputs to planning and build.

This boundary should remain: the fix defines and checks md2vid defaults without embedding a TTS engine into the neutral planner.

### Kokoro Michael is available and already has partial precedent

- The installed HyperFrames voice catalog includes `am_michael` as Michael, American English, male.
- HyperFrames doctor reports Kokoro dependencies installed in the inspected environment.
- `docs/superpowers/done/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-plan-3.md:133-167` records a successful local decision of `provider=kokoro` and `voice=am_michael`.
- The shared media engine resolves English Kokoro to `am_michael` in `~/.claude/skills/media-use/audio/scripts/lib/tts.mjs:56-61`.

### Defaults currently disagree across boundaries

The shared media engine defaults English Kokoro to Michael, while the packaged direct HyperFrames CLI defaults to Heart:

```text
media-use audio engine → am_michael
hyperframes tts        → af_heart
TTS reference docs     → af_heart
```

The md2vid fix cannot depend on either implicit default. It must persist and pass `am_michael` explicitly at the md2vid-to-media boundary.

### Existing narration punctuation is insufficient for spoken pacing

The inspected narration contained punctuation, but several sentences remained structurally long:

| Frame | Words per sentence |
|---|---|
| Overview | 12, 18, 12 |
| Reserve | 9, 14, 17 |
| Concurrency | 11, 19, 11 |
| Safety | 5, 19, 12 |

Example:

```text
Lock the wallet projection, select eligible grants in earliest expiration order,
append balanced postings, and update the projection atomically.
```

A comma-separated list of operations is grammatically valid but weak spoken segmentation. The default rule must target audible sentence boundaries rather than merely requiring any punctuation character.

### WAV and transcript timing already have a strict authority

`docs/standards/video-generation.md:105-119` defines the WAV sample extent as authoritative and requires exact, ordered word timings. `md2vid transcribe` snapshots the WAV, replaces stale duration metadata with the safely floored sample duration, and writes all transcription updates transactionally.

The new narration workflow must use that path after Kokoro synthesis. It must not generate proportional or heuristic word timestamps from text length.

## Project Context

- `scripts/scaffold_project.ts` owns the framework-neutral `audio_request.json.example` content.
- `skill/md2vid/SKILL.md` owns the agent workflow that turns source material into storyboard, spoken script, audio request, and framework visuals.
- `docs/standards/video-generation.md` is the canonical narration standard; bundled skill references are synchronized from canonical standards.
- HyperFrames and Remotion share the same neutral audio metadata and transcript contract.
- The external media-use audio engine already accepts `provider`, `voice`, `lang`, `speed`, and `lines`.
- Kokoro does not provide the word-timestamp contract md2vid needs, so transcription remains a required separate step.
- Existing projects may have user-selected providers, voices, speeds, WAVs, or no retained `audio_request.json`.

## Scope

### In scope

- A durable md2vid default narration request for English projects:
  - provider `kokoro`;
  - voice `am_michael`;
  - language `en`;
  - speed `0.9`.
- Explicit provider and voice persistence in generated scaffold examples and `/md2vid` output.
- Spoken-language authoring rules for sentence length, punctuation, clause count, and conceptual pauses.
- A deterministic narration-request preflight that can run before synthesis.
- Clear diagnostics for requests that omit or contradict md2vid defaults without an explicit override.
- Supported override behavior for user-selected provider, voice, language, and speed.
- Non-English behavior that does not force an English voice.
- Kokoro availability preflight and actionable failure when the local provider is unavailable.
- Required post-synthesis transcription and exact WAV-duration normalization.
- Versioned request-to-audio evidence that detects stale WAV, transcript, cue, and render artifacts after narration changes.
- HyperFrames and Remotion scaffold parity.
- Canonical standards, skill instructions, synchronized references, README guidance, tests, package evidence, and release smoke coverage.

### Out of scope

- Adding a TTS engine to `engine/`, the neutral planner, or framework adapters.
- Adding a general `md2vid audio` synthesis command.
- Making the md2vid production CLI locate or invoke a user-installed media-use skill directly; `skill/md2vid/SKILL.md` remains the sole synthesis orchestrator.
- Modifying vendored or installed `node_modules/hyperframes` to change its global `hyperframes tts` default.
- Changing HeyGen, ElevenLabs, Kokoro, or media-use provider internals outside md2vid-owned integration boundaries.
- Voice cloning, custom voice training, or speaker identity matching.
- Background music, sound effects, mastering, or general sound-design policy.
- Rewriting every existing narration script or regenerating existing WAV files automatically.
- Using SSML unless the selected Kokoro path gains documented deterministic support in a separately approved change.
- Treating punctuation quality as a substitute for listening review.

## Constraints

- The default must be md2vid-owned and explicit. It may not depend on provider auto-selection, environment credentials, operating-system voices, or the direct HyperFrames CLI default.
- User intent has higher authority than defaults. An explicit provider, voice, language, or speed must not be overwritten.
- English defaults apply only when language is English and the user has not selected another voice.
- Non-English narration requires a compatible explicit voice or a documented language-specific default; `am_michael` must not be applied blindly.
- A missing Kokoro runtime must fail before synthesis with an actionable installation/preflight diagnostic. It must not silently fall back to `say`, another local system voice, or a network provider.
- Spoken text is the authority for TTS and transcription. Display copy may differ, but the relationship must remain traceable through frame/line IDs.
- Word timings must be obtained from transcription of the generated WAV unless the selected provider supplies equivalent native word timestamps accepted by md2vid.
- `duration_s` must exactly equal the safe WAV sample extent after transcription; provider-reported or rounded duration is not authoritative.
- The preflight must be deterministic, locale-explicit, and free of network access.
- The md2vid package must not depend on an absolute personal skill path. The installed `/md2vid` skill owns media-use discovery, readiness checks, and synthesis invocation.
- A versioned request participates in request-to-audio freshness checks. Legacy projects without a versioned request or narration evidence remain buildable.
- Existing projects and already-generated audio remain valid. Defaults apply when creating or regenerating narration, not retroactively during unrelated build or verify operations.
- Canonical standards are edited first. Bundled references are regenerated only with `corepack npm run sync:skill-references`.
- `public-snapshot.json` is regenerated only with `corepack npm run public:snapshot`; count and hashes are never hand-edited.

## Decisions

- **Provider default:** md2vid-generated English narration uses local Kokoro by default.
- **Voice default:** md2vid explicitly pins `am_michael`; it never relies on `hyperframes tts` or media-use implicit voice selection.
- **Language default:** scaffolded English narration uses `lang: "en"`.
- **Speed default:** technical narration uses `speed: 0.9`, balancing clarity with reasonable duration.
- **Request authority:** versioned `audio_request.json` is the persisted generation-intent artifact. It records defaults and explicit overrides.
- **Synthesis ownership:** `skill/md2vid/SKILL.md` is the sole production orchestrator that locates media-use, checks readiness, and invokes synthesis; the md2vid CLI only validates and attests artifacts.
- **Freshness authority:** `md2vid transcribe` writes request-to-audio evidence containing the canonical request digest and source WAV identities. Plan, build, and verify enforce it only for participating versioned requests.
- **Spoken text authority:** each `lines[].text` value is authored for speech, not copied verbatim from Markdown or dense display text.
- **Punctuation policy:** target 6–14 spoken words per sentence; a sentence exceeding 18 lexical words fails preflight unless the user explicitly approves the exact script.
- **Strong boundary:** `.`, `?`, `!`, or a paragraph break ends a spoken sentence. Commas, colons, semicolons, parentheses, and dashes may shape delivery but do not reset the hard sentence-length count.
- **Workflow gate:** narration preflight runs before TTS; transcription runs after TTS and before visual-beat planning.
- **Unavailable provider:** fail closed with Kokoro setup guidance; never substitute macOS `say` or another voice silently.
- **Overrides:** explicit user choices are preserved and recorded. The default policy is not a ban on other voices or providers.
- **Compatibility:** core build continues to consume WAV plus `audio_meta.json`; it does not require `audio_request.json` for legacy projects.

## Functional Requirements

### FR-1 — Default narration request

Every new md2vid scaffold must include an `audio_request.json.example` with:

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

The example must be framework-neutral and identical for HyperFrames and Remotion scaffolds except where a framework-specific path is unavoidable.

### FR-2 — Explicit md2vid provider and voice ownership

The `/md2vid` skill workflow must copy or author the default fields into the real `audio_request.json` before invoking media tooling. This skill is the sole production synthesis orchestrator; no md2vid CLI command imports, locates, or spawns media-use.

The skill must pass provider and voice explicitly to the supported media path. A generated request may not use:

- `provider: "auto"` for the default English workflow;
- an omitted voice with the expectation that another tool chooses one;
- macOS `say`, platform speech APIs, or another undocumented fallback; or
- a cloud provider solely because credentials happen to be present.

### FR-3 — Override and language behavior

When the user explicitly selects provider, voice, language, or speed:

- the selected value replaces only the corresponding default;
- the request records the effective value;
- the workflow validates that the provider and voice are compatible;
- diagnostics identify unsupported combinations before synthesis; and
- documentation distinguishes the md2vid default from a user override.

For non-English narration, the workflow must not default to `am_michael`. It must require a compatible explicit voice or apply a documented language-specific voice policy.

### FR-4 — Spoken punctuation and sentence structure

Before TTS, every non-empty narration line must satisfy the default spoken-language policy:

- use complete spoken sentences rather than Markdown fragments or display-label syntax;
- target 6–14 lexical words per sentence;
- contain no sentence longer than 18 lexical words without explicit user approval;
- split multi-step explanations into separate sentences rather than comma-chaining operations;
- use one primary idea per sentence;
- add a paragraph break between major conceptual beats when a stronger pause is intended; and
- retain correct pronunciation punctuation for numbers, abbreviations, code identifiers, and quoted terms.

A comma does not count as a sentence boundary for the hard maximum.

### FR-5 — Narration preflight

md2vid must provide a deterministic preflight for `audio_request.json` that runs before synthesis and reports:

- missing or invalid provider, voice, language, or speed;
- English default requests that do not resolve to Kokoro Michael unless marked as an explicit override;
- empty or duplicate line IDs;
- empty spoken text;
- missing terminal punctuation;
- sentence word counts above the hard maximum;
- long comma- or conjunction-chained clauses that require author review; and
- the exact line ID and sentence excerpt for every finding.

The preflight may warn for target-range deviations and must fail for hard-contract violations. It must not mutate the authored request.

### FR-6 — Kokoro readiness and synthesis

Before generating default narration, the workflow must verify that the local Kokoro runtime and `am_michael` voice are available.

If unavailable, the workflow must stop with:

- the failed capability;
- the command used for preflight;
- the supported installation or doctor command; and
- a statement that no fallback provider or system voice was used.

A successful synthesis must record effective provider and voice provenance in retained evidence or `audio_meta.json` fields that existing md2vid readers safely preserve.

### FR-7 — Transcript and duration authority

After Kokoro synthesis:

1. snapshot the generated WAV files;
2. run the supported md2vid transcription workflow;
3. replace rounded/provider durations with the exact safely floored WAV sample duration;
4. obtain ordered word timestamps from the actual audio;
5. reject missing, inverted, overlapping, or out-of-duration words; and
6. only then author or resolve `visual_beats.json`.

Proportional text-length timestamps, guessed pauses, or copied timestamps from an earlier voice are forbidden.

### FR-8 — Request-to-audio freshness evidence

A versioned narration request must be linked to the synthesized source audio by a generated `narration_evidence.json` artifact containing:

- evidence version;
- SHA-256 of a canonical serialization of provider, voice, language, speed, ordered line IDs, and exact spoken text;
- effective provider and voice;
- one entry per voice with ID, path, exact safe duration, and source WAV SHA-256; and
- the transcription operation that produced the current word timings.

`md2vid transcribe` must write or replace this evidence atomically with updated `audio_meta.json` when a versioned request is present.

For a participating versioned request, plan, build, and verify must fail when:

- narration evidence is missing;
- the current canonical request digest differs from the attested digest;
- voice IDs, paths, duration, or WAV hashes differ from the attested source audio; or
- provider/voice provenance contradicts the effective request.

Diagnostics must instruct the author to re-synthesize and rerun transcription. Legacy projects without a versioned request or evidence remain valid and do not receive this gate retroactively.

### FR-9 — Workflow ordering

New scaffolds, standards, and `/md2vid` must use this order:

```text
source coverage
  → storyboard
  → spoken narration script
  → narration preflight
  → explicit Kokoro am_michael synthesis
  → md2vid transcribe
  → visual_beats.json
  → md2vid plan
  → cue-bound visual authoring
  → build + check
  → listening and visual review
  → render
```

Any narration edit after synthesis invalidates downstream transcript, cue, caption, binding, and render evidence and requires regeneration from synthesis onward.

### FR-10 — Scaffold, standards, and skill consistency

The following public surfaces must agree on the same default and ordering:

- `scripts/scaffold_project.ts`;
- generated `audio_request.json.example`;
- generated framework onboarding instructions;
- `README.md`;
- `docs/standards/video-generation.md`;
- framework standards where they describe narration setup;
- `skill/md2vid/SKILL.md`; and
- synchronized skill references.

Examples must demonstrate short spoken sentences and may not reintroduce provider ambiguity or long comma-chained narration.

### FR-11 — Compatibility and framework parity

- Existing projects with only WAV files and `audio_meta.json` continue to build and verify unchanged.
- Existing `{ lines: [{ id, text }] }` requests remain readable, but `/md2vid` must materialize effective defaults before new synthesis.
- A user-selected provider or voice remains valid when supported.
- HyperFrames and Remotion receive identical default narration policy.
- Framework adapters do not implement or override provider selection.
- `md2vid build`, `plan`, `regroup`, and `verify` do not synthesize or silently regenerate audio.

### FR-12 — Testing and release evidence

Tests must prove:

- new scaffolds contain the exact default provider, voice, language, and speed;
- scaffold validation rejects drift from the required example shape;
- narration preflight accepts well-punctuated examples;
- narration preflight rejects an unapproved sentence over 18 lexical words;
- commas alone do not evade the hard sentence-length rule;
- explicit overrides are preserved;
- non-English requests do not receive `am_michael` automatically;
- the `/md2vid` skill command contract passes explicit Kokoro/Michael values, while no md2vid production CLI path imports or spawns media-use;
- missing Kokoro fails closed in the skill workflow without invoking a system voice or network provider;
- generated Kokoro evidence identifies `am_michael`;
- transcription uses the generated WAV, produces exact safe duration plus bounded word timings, and writes request/WAV evidence atomically;
- changed provider, voice, speed, line order, or spoken text causes plan/build/verify to reject stale participating evidence;
- both framework scaffolds remain valid;
- canonical skill references are synchronized; and
- the isolated packed release harness completes scaffold → request preflight → Kokoro/fixture evidence → transcription → build → check without manual audio metadata edits.

## Candidate Directions

### Selected: explicit request defaults plus pre-synthesis narration gate

```text
md2vid scaffold / skill
  → audio_request.json
       provider=kokoro
       voice=am_michael
       lang=en
       speed=0.9
       punctuated lines
  → deterministic narration preflight
  → media-use Kokoro synthesis
  → md2vid transcribe
  → existing neutral plan/build path
```

Why selected:

- md2vid owns its behavior even when external defaults change;
- the effective voice choice is reviewable and reproducible;
- unsupported environments fail before producing the wrong voice;
- spoken-text quality is checked before expensive synthesis; and
- the neutral planner and framework adapters remain independent from TTS implementation.

### Rejected: rely on media-use auto provider selection

```text
environment credentials → whichever provider is available first
```

Rejected because the same project could use HeyGen, ElevenLabs, or Kokoro on different machines, violating the requested md2vid default.

### Rejected: rely on `hyperframes tts` implicit voice

The installed direct CLI currently defaults to `af_heart`. Depending on that implicit value would contradict the Michael requirement and remain vulnerable to upstream changes.

### Rejected: patch installed HyperFrames

Editing `node_modules/hyperframes/dist/cli.js` would be non-durable, package-manager-owned, and broader than md2vid's integration boundary. md2vid can guarantee its own default by passing `--voice am_michael` explicitly.

### Rejected: use operating-system TTS as fallback

System voices vary by platform and installation. A silent fallback to `say`, SAPI, or another platform API loses provider provenance and produces inconsistent voice identity and pacing.

### Rejected: documentation-only punctuation guidance

The inspected narration was grammatically punctuated but still sounded continuous. Documentation without a deterministic preflight cannot prevent long comma-chained sentences from recurring.

### Rejected: infer word times from text length

Heuristic timestamps do not reflect actual pronunciation, pauses, or speed. They break caption and visual-cue authority after any voice or script change.

## Success Criteria

- A newly scaffolded project contains `version: 1`, `provider: "kokoro"`, `voice: "am_michael"`, `lang: "en"`, and `speed: 0.9` in `audio_request.json.example`.
- `/md2vid` materializes those values in the real request when the user provides no override.
- Default generation never invokes macOS `say`, another system voice, or a cloud provider.
- A user-requested alternative provider or voice is preserved and recorded.
- Non-English generation does not silently use Michael.
- A sentence with 19 ordinary lexical words and no `.`, `?`, `!`, or paragraph break fails narration preflight with line ID and word count.
- A well-punctuated technical script with short sentences passes preflight.
- Kokoro readiness failure stops before WAV creation and names the installation/doctor path.
- Generated narration evidence identifies provider `kokoro` and voice `am_michael`.
- `md2vid transcribe` derives words and exact duration from the generated Michael WAV files without manual metadata edits and atomically writes `narration_evidence.json`.
- Editing a participating request causes plan, build, and verify to reject stale audio/transcript evidence until synthesis and transcription are rerun.
- HyperFrames and Remotion scaffold tests pass with identical neutral defaults.
- Existing audio-only projects still build and verify unchanged.
- Documentation, skill text, bundled references, package contents, public snapshot, and release harness all reflect the new default.
- Full typecheck, unit, scaffold, documentation, snapshot, package, and release checks pass.

## Risks and Assumptions

| Risk / assumption | Handling |
|---|---|
| Direct HyperFrames CLI still defaults to `af_heart` | the `/md2vid` skill passes `am_michael` explicitly; skill-contract and acceptance tests verify the invocation while the md2vid CLI remains synthesis-free. |
| Media-use provider precedence changes | persist `provider: "kokoro"` and pass an explicit provider override. |
| Kokoro is unavailable on a new machine | run readiness preflight and fail with installation guidance; never silently substitute. |
| Michael is unsuitable for a specific project | explicit user-selected voice overrides the default. |
| English defaults leak into non-English narration | apply Michael only to English; require compatible non-English voice policy. |
| Hard sentence limits reject legitimate technical wording | target 6–14 words, fail only above 18 by default, and allow explicit user approval of the exact script. |
| Abbreviations and decimals confuse sentence splitting | use a tested conservative lexical scanner and include regression fixtures for abbreviations, versions, decimals, URLs, and code. |
| More sentence breaks lengthen the video | completeness and intelligibility outrank arbitrary duration; recalculate storyboard and frame timing from actual audio. |
| Kokoro punctuation still produces weak pauses | require listening review and permit stronger paragraph segmentation or lower speed; do not fabricate transcript gaps. |
| Audio-engine duration is rounded | run md2vid transcription after synthesis so safe WAV duration replaces provider metadata. |
| Request changes cannot be linked to existing audio | canonicalize and hash versioned requests during transcription; validate the digest and WAV identities before plan/build/verify. |
| Existing projects lack `audio_request.json` | do not require the request for build/verify; apply defaults and freshness evidence only when narration is created or regenerated. |
| Skill and canonical docs drift | edit canonical standards first and enforce `sync:skill-references` freshness in tests. |
