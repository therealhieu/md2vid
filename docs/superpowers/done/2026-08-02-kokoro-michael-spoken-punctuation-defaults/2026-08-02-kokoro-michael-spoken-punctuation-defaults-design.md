# Kokoro Michael and Spoken Punctuation Defaults — Design

## Table of Contents

- [Context and Direction](#context-and-direction)
- [Architecture](#architecture)
- [Authority and Artifact Contracts](#authority-and-artifact-contracts)
- [Default Resolution](#default-resolution)
- [Spoken Punctuation Policy](#spoken-punctuation-policy)
- [Narration Preflight](#narration-preflight)
- [Synthesis and Transcription Flow](#synthesis-and-transcription-flow)
- [Scaffold and Skill Contract](#scaffold-and-skill-contract)
- [Overrides and Language Handling](#overrides-and-language-handling)
- [Error Handling](#error-handling)
- [Compatibility and Migration](#compatibility-and-migration)
- [Implementation Shape](#implementation-shape)
- [Testing and Evidence](#testing-and-evidence)
- [Rollout](#rollout)

## Context and Direction

**Original issue** — an md2vid end-to-end run used macOS `Samantha`, while long technical sentences sounded continuous despite containing commas and periods.

**Goal** — make local Kokoro Michael and speech-oriented punctuation the deterministic md2vid defaults without moving synthesis into the neutral planner or removing user choice.

**Relevant context** — md2vid currently scaffolds only `{id,text}` audio-request lines; the shared media engine already understands provider, voice, language, and speed; direct HyperFrames TTS defaults to another voice; Kokoro needs a transcription pass for word timestamps; and md2vid already treats exact WAV sample duration as authoritative.

**Selected technical direction** — md2vid persists an explicit default request, validates spoken text before synthesis, invokes the supported media route with explicit Kokoro/Michael arguments, then transcribes the actual WAV before cue planning.

```text
source document
  ↓
spoken SCRIPT.md
  ↓
audio_request.json
  provider=kokoro
  voice=am_michael
  lang=en
  speed=0.9
  ↓
md2vid narration-check
  ↓
Kokoro synthesis through media-use
  ↓
md2vid transcribe
  ↓
audio_meta.json + exact WAV evidence
  ↓
existing plan/build/verify/render flow
```

The design deliberately does not add synthesis to `engine/`, does not patch installed HyperFrames, and does not treat operating-system TTS as a fallback.

## Architecture

### Purpose

Give md2vid one owned narration policy while preserving the existing separation between generation intent, external media generation, neutral timing, and framework rendering.

### Current state

```text
scripts/scaffold_project.ts
  → audio_request.json.example
       lines only

/md2vid agent
  → chooses any available TTS route
  → may omit provider and voice evidence

external TTS
  → WAV + ad hoc or provider metadata

md2vid plan/build
  → trusts only validated WAV + audio_meta
```

The neutral build path is sound, but the pre-audio policy boundary is under-specified.

### Expected state

```text
┌──────────────────────────────────────────────┐
│ md2vid-owned narration policy               │
│ provider kokoro · voice am_michael           │
│ lang en · speed 0.9 · spoken punctuation    │
└──────────────────────┬───────────────────────┘
                       │ persisted
                       ▼
              audio_request.json
                       │ static preflight
                       ▼
              narration-check result
                       │ explicit provider/voice
                       ▼
        external media-use Kokoro adapter
                       │ generated WAV
                       ▼
               md2vid transcribe
                       │ exact words + duration
                       ▼
           neutral plan/build/verify path
```

Ownership is intentionally split:

| Layer | Owns | Does not own |
|---|---|---|
| md2vid scaffold/skill | default request, spoken script rules, workflow ordering | Kokoro model execution |
| narration preflight | deterministic request and sentence checks | rewriting prose, listening judgment |
| media-use/HyperFrames | Kokoro synthesis | md2vid planning or visual timing |
| md2vid transcribe | actual-WAV word times and safe duration | provider selection |
| neutral planner | frame/caption/visual timing | TTS configuration |
| framework adapters | emitted media and visuals | narration defaults |

## Authority and Artifact Contracts

### `audio_request.json` is generation intent

The real request is the reviewable authority for provider, voice, language, speed, and spoken text:

```json
{
  "version": 1,
  "provider": "kokoro",
  "voice": "am_michael",
  "lang": "en",
  "speed": 0.9,
  "lines": [
    {
      "id": "intro",
      "text": "A prepaid ledger has two jobs. First, preserve accounting history. Second, authorize spending safely."
    }
  ],
  "bgm": {
    "mode": "none"
  }
}
```

`bgm` remains optional and outside the default-voice policy. The scaffold may omit it or show `mode: "none"`; the voice contract must not depend on it.

Proposed types:

```ts
export interface NarrationLine {
  id: string;
  text: string;
}

export interface NarrationRequest {
  version?: 1;
  provider?: "kokoro" | "heygen" | "elevenlabs";
  voice?: string;
  lang?: string;
  speed?: number;
  lines: NarrationLine[];
  bgm?: Record<string, unknown>;
}

export interface ResolvedNarrationDefaults {
  provider: "kokoro";
  voice: "am_michael";
  lang: "en";
  speed: 0.9;
}
```

The parser preserves additional media-engine fields such as `sfx` and `bgm`; narration preflight validates only fields it owns.

### `SCRIPT.md` is human review text

`SCRIPT.md` remains the readable narration artifact. It must match `audio_request.json.lines[].text` semantically and should match byte-for-byte after heading/format removal where practical.

```text
SCRIPT.md section id
  ↕ same stable ID
 audio_request line id
  ↕ same spoken text
 audio_meta voice id
  ↕ mapped by video.config slugs
 planned frame
```

Display copy in frames may be shorter. TTS must use the spoken script, not headings, table cells, source Markdown, or on-screen labels concatenated automatically.

### `audio_meta.json` is measured audio evidence

After synthesis and transcription, `audio_meta.json` remains the neutral measured input:

```json
{
  "tts_provider": "kokoro",
  "voice_id": "am_michael",
  "voices": [
    {
      "id": "intro",
      "path": "assets/voice/intro.wav",
      "duration_s": 8.314562,
      "words": [
        { "id": "w0", "text": "A", "start": 0.12, "end": 0.21 }
      ]
    }
  ]
}
```

The existing audio parser allows additional root fields, so provider provenance can survive without changing the core `AudioMeta` interface immediately. Tests must prove that `md2vid transcribe` preserves `tts_provider` and `voice_id` while replacing voice timing data.

The provenance fields are evidence, not timing authority. WAV sample extent and transcript words remain authoritative.

### `narration_evidence.json` links request to audio

For a versioned request, `md2vid transcribe` atomically writes a sibling evidence file:

```json
{
  "version": 1,
  "requestSha256": "<canonical-request-sha256>",
  "provider": "kokoro",
  "voice": "am_michael",
  "voices": [
    {
      "id": "intro",
      "path": "assets/voice/intro.wav",
      "duration_s": 8.314562,
      "sha256": "<source-wav-sha256>"
    }
  ],
  "transcription": {
    "source": "md2vid transcribe"
  }
}
```

Canonical request hashing includes only narration-affecting fields in stable order:

```text
version
provider
voice
lang
speed
ordered lines[].id + exact lines[].text
```

It excludes BGM, SFX, formatting whitespace, and unrelated extension fields. The implementation validates the request, serializes this owned projection deterministically, and hashes the UTF-8 bytes.

The evidence makes invalidation enforceable:

```text
current versioned request digest
  ↕ must equal
narration_evidence.requestSha256

current source WAV identity
  ↕ must equal
narration_evidence.voices[]
```

Legacy projects without a versioned request or evidence do not participate in this gate.

## Default Resolution

### md2vid-owned defaults

Define one exported constant in md2vid source rather than duplicating literals across scaffold, validator, and tests:

```ts
export const DEFAULT_NARRATION_POLICY = Object.freeze({
  provider: "kokoro",
  voice: "am_michael",
  lang: "en",
  speed: 0.9,
} as const);
```

Suggested owner:

```text
engine/narration_request.ts
```

The scaffold imports this constant. The preflight compares against it. Tests assert the serialized example derives from it.

### Resolution order

```text
explicit user request
  → authored audio_request.json value
  → md2vid English default
```

For each field:

| Field | Default | Override behavior |
|---|---|---|
| `provider` | `kokoro` | explicit supported provider wins |
| `voice` | `am_michael` for English Kokoro | explicit compatible voice wins |
| `lang` | `en` | explicit language wins |
| `speed` | `0.9` | explicit finite supported speed wins |

No environment-based provider precedence participates after md2vid materializes the request.

### Skill-owned synthesis boundary

`skill/md2vid/SKILL.md` is the sole production orchestrator for external synthesis. The md2vid CLI validates requests and attests resulting audio; it never imports, locates, or spawns a user-installed media-use skill.

Even when the request contains defaults, the `/md2vid` skill passes them explicitly to media-use:

```bash
node ~/.claude/skills/media-use/audio/scripts/audio.mjs \
  --request "$PROJECT/audio_request.json" \
  --hyperframes "$PROJECT" \
  --out "$PROJECT/audio_meta.json" \
  --only tts \
  --provider kokoro \
  --voice am_michael \
  --speed 0.9
```

This double expression is intentional:

```text
persisted request → review and reproducibility
explicit flags    → protection from external default drift
```

The flags must equal the resolved request. The workflow may not pass hardcoded defaults that overwrite an explicit user choice.

Repository tests validate the skill's documented command contract and use an acceptance-harness runner supplied by the test itself. Production package code contains no absolute skill path and no external synthesis runner.

## Spoken Punctuation Policy

### Purpose

Convert source meaning into speech that has audible conceptual boundaries rather than grammatically valid but breathless clause chains.

### Sentence model

The preflight uses a conservative spoken-sentence model:

- strong boundaries: `.`, `?`, `!`, or a paragraph break;
- soft punctuation: comma, colon, semicolon, parentheses, and em dash;
- target sentence length: 6–14 lexical words;
- warning range: 15–18 lexical words;
- error: more than 18 lexical words without an explicit approval flag;
- terminal punctuation required for every non-empty narration line.

Soft punctuation shapes a sentence but does not reset the hard word count. This directly prevents a long series of comma-separated operations from evading the rule.

### Lexical counting

The scanner must be deterministic and Unicode-aware:

1. normalize text with NFKC;
2. preserve paragraph boundaries;
3. mask URLs, backtick code spans, version strings, and decimal numbers as one lexical token each;
4. count Unicode letter/number runs with internal apostrophes or hyphens as one word;
5. do not treat decimal points, domain dots, or common abbreviations as automatic sentence endings; and
6. return source offsets for diagnostics.

Example:

```text
"Use PostgreSQL 18.1, then retry api.example.com."

spoken words:
Use | PostgreSQL | 18.1 | then | retry | api.example.com
```

The implementation does not need a general natural-language parser. It needs stable conservative detection for narration authoring.

### Style findings

The preflight returns typed findings:

```ts
export type NarrationFindingCode =
  | "missing-terminal-punctuation"
  | "sentence-too-long"
  | "sentence-above-target"
  | "comma-chain"
  | "conjunction-chain";

export interface NarrationFinding {
  severity: "error" | "warning";
  code: NarrationFindingCode;
  lineId: string;
  sentenceIndex: number;
  wordCount: number;
  excerpt: string;
  guidance: string;
}
```

Default classification:

| Finding | Severity | Rule |
|---|---|---|
| Missing terminal punctuation | error | line does not end in `.`, `?`, or `!` |
| Sentence over 18 words | error | split before synthesis |
| Sentence 15–18 words | warning | review for a stronger pause |
| Three or more commas in one sentence | warning | inspect for chained clauses |
| Three or more coordinating transitions | warning | inspect `and`, `or`, `but`, `then` chain |

Warnings do not block a deliberate short technical script, but `/md2vid` must review and resolve them before claiming the narration is approved.

### Preferred rewrite pattern

```text
Before:
Lock the wallet projection, select eligible grants in earliest expiration order,
append balanced postings, and update the projection atomically.

After:
Lock the wallet projection.
Select eligible grants by earliest expiration.
Append balanced postings.
Update the projection atomically.
```

The preflight never performs this rewrite itself. Narration wording is authored work and must preserve source meaning.

### Explicit long-sentence approval

The check command supports a narrow runtime exception:

```text
--allow-long-sentence <line-id>:<sentence-index>
```

The exception:

- applies only to the named line and zero-based sentence index;
- is printed in the check report;
- does not alter the request;
- must be supplied again after text changes; and
- does not suppress missing punctuation or malformed request errors.

The `/md2vid` workflow uses this only after the user approves the exact sentence. Default generation rewrites the sentence instead.

## Narration Preflight

### Public command

Add a check-only command:

```text
md2vid narration-check <dir>
md2vid narration-check <dir> --request <path>
md2vid narration-check <dir> --allow-long-sentence <id:index>
```

It does not synthesize audio and therefore does not violate the boundary that there is no `md2vid audio` command.

CLI behavior:

| Result | Exit code |
|---|---:|
| Valid request, no warnings | 0 |
| Valid request, warnings printed | 0 |
| Contract or hard punctuation error | 1 |
| Usage error | 2 |

Default request path:

```text
<dir>/audio_request.json
```

The command is pure except for stdout/stderr. It does not write normalized JSON, create evidence files, invoke providers, or access the network.

### Validation flow

```text
read JSON
  → validate root shape
  → validate provider/voice/lang/speed
  → validate line IDs and text
  → segment spoken sentences
  → count lexical words
  → classify findings
  → apply exact CLI approvals
  → print stable report
```

Stable success output:

```text
PASS [narration] 4 lines, 15 sentences, provider=kokoro, voice=am_michael, lang=en, speed=0.9
```

Stable failure example:

```text
FAIL [narration] line="concurrency" sentence=2 words=19 code=sentence-too-long
"Lock the wallet projection, select eligible grants ... atomically."
Split the sentence at a conceptual boundary; target 6–14 words, maximum 18.
```

### Default-versus-override classification

The preflight needs to distinguish an incomplete default request from an intentional override.

Rules:

- a request with all four default fields is the normal md2vid path;
- a non-default supported value is an explicit override because it is persisted in the request;
- an omitted field is invalid for a real request generated by the new workflow;
- legacy `{id,text}` examples remain parseable by migration code, but the authoring workflow materializes defaults before preflight and synthesis.

The command reports effective non-default values as overrides rather than warnings:

```text
INFO [narration] override voice=bf_emma (default am_michael)
```

## Synthesis and Transcription Flow

### Readiness preflight

Before TTS, `/md2vid` runs the package-owned HyperFrames doctor or equivalent local capability probe and confirms:

```text
TTS (Kokoro) → installed
voice am_michael → present in local catalog
ffmpeg/ffprobe → available
```

This is operational capability evidence, separate from static narration request validation.

Failure is closed:

```text
Kokoro unavailable
  → stop before writing WAV
  → show doctor/install guidance
  → do not call say
  → do not use HeyGen/ElevenLabs automatically
```

### Synthesis

The media engine receives one line per planned voice/frame. It may synthesize lines concurrently within its supported bounded concurrency, but voice identity and speed are common unless the user explicitly designs a per-line voice feature in a separate change.

Expected retained provenance:

```json
{
  "tts_provider": "kokoro",
  "voice_id": "am_michael"
}
```

The workflow snapshots or hashes fresh WAV files before transcription so stale audio cannot masquerade as regenerated output.

### Required transcription

Kokoro synthesis is followed by:

```bash
npm run transcribe
```

or the equivalent installed md2vid command.

This step is mandatory because:

- Kokoro does not supply accepted word timestamps;
- provider duration may be rounded;
- punctuation and speed affect real pause placement; and
- captions and visual cues must follow what was actually spoken.

```text
Kokoro text
  → WAV waveform
  → transcription of waveform
  → exact words and pauses
  → caption + visual timing authority
```

The transcription transaction retains provider provenance while replacing voice durations and words. When `audio_request.json.version` is `1`, the same transaction stages and promotes `narration_evidence.json` with the canonical request digest and captured WAV identities. If either metadata or evidence promotion fails, both destinations roll back.

### Invalidation rules

Any change to these fields invalidates existing WAV and transcript evidence:

- `provider`;
- `voice`;
- `lang`;
- `speed`;
- any `lines[].text`; or
- line ordering or IDs.

For a versioned participating request, `plan`, `build`, and `verify` compare the current canonical request digest and captured source WAV identities with `narration_evidence.json`. A mismatch fails before neutral planning or framework emission.

The enforced recovery is:

```text
request edit
  → stale-evidence failure
  → re-synthesize through the skill
  → re-transcribe and replace narration evidence
  → re-author/re-resolve visual beats
  → rebuild
  → re-check
  → re-render
```

If neither a versioned request nor narration evidence exists, this gate is absent and legacy behavior remains unchanged.

## Scaffold and Skill Contract

### Scaffold

`scripts/scaffold_project.ts` imports the default policy and emits:

```json
{
  "version": 1,
  "provider": "kokoro",
  "voice": "am_michael",
  "lang": "en",
  "speed": 0.9,
  "lines": [
    {
      "id": "intro",
      "text": "Introduce the topic clearly. Keep each spoken sentence short."
    },
    {
      "id": "recap",
      "text": "Recap the key idea. End with one concise takeaway."
    }
  ]
}
```

The sample text itself must pass narration preflight. Scaffold validation compares the generated shape and values to the canonical constants.

Generated next steps become:

```text
1. review audio_request.json.example and author a spoken SCRIPT.md
2. copy the example to audio_request.json; preserve Kokoro am_michael unless overridden
3. run md2vid narration-check before synthesis
4. verify Kokoro readiness and generate fresh WAV files through media-use
5. run transcription
6. map voice IDs to frame slugs
7. author visual_beats.json
8. plan, author visuals, build, check, review, render
```

### `/md2vid` skill

The skill adds a narration quality gate after storyboard approval and before audio generation:

```text
source prose
  → spoken rewrite
  → sentence-length report
  → request review
  → narration-check
  → TTS
```

Required skill rules:

- never use macOS `say` or another operating-system fallback for default narration;
- do not copy source paragraphs verbatim when they are not natural speech;
- do not treat commas as sufficient segmentation for a long sentence;
- show effective provider, voice, language, and speed before synthesis;
- run provider readiness before synthesis;
- run md2vid transcription after Kokoro;
- invalidate downstream cues after narration regeneration; and
- listen to representative boundaries before approving render.

### Canonical standards and references

Canonical text changes first:

```text
docs/standards/video-generation.md
  → skill/md2vid/references/standards/video-generation.md
```

Framework standards mention only workflow ordering and shared audio authority. They must not define different HyperFrames and Remotion voice defaults.

Bundled references are regenerated by:

```bash
corepack npm run sync:skill-references
```

## Overrides and Language Handling

### User override examples

Alternative English voice:

```json
{
  "version": 1,
  "provider": "kokoro",
  "voice": "bf_emma",
  "lang": "en",
  "speed": 0.85
}
```

Cloud provider:

```json
{
  "version": 1,
  "provider": "heygen",
  "voice": "<starfish-voice-id>",
  "lang": "en",
  "speed": 1.0
}
```

The preflight records these as overrides and validates only md2vid-owned generic fields. Provider-specific availability remains the media layer's responsibility.

### Non-English behavior

```text
lang=en + no explicit voice
  → am_michael

lang!=en + no explicit voice
  → stop and require compatible voice
```

This avoids accidental English phonemization. Future language defaults require a separate approved table and tests.

The validator checks obvious Kokoro prefix compatibility where the selected voice follows the documented Kokoro naming convention, but it does not duplicate the provider's full catalog.

### Speed

Default `0.9` is a policy value, not a universal accessibility setting. The validator accepts a finite positive range supported by the media engine and reports the override.

Suggested policy guard:

```text
0.7 <= speed <= 1.2
```

Values outside that range require explicit user confirmation because they materially affect intelligibility and downstream duration.

## Error Handling

| Failure | Handling | Forbidden fallback |
|---|---|---|
| Missing `audio_request.json` for narration-check | exit 1 with expected path | synthesize from example implicitly |
| Missing provider/voice/lang/speed in new request | exit 1 with canonical default snippet | rely on external defaults |
| Duplicate or empty line ID | exit 1 naming both locations | reorder or rename automatically |
| Sentence over 18 words | exit 1 with line, sentence, count, excerpt | insert punctuation automatically |
| Missing terminal punctuation | exit 1 with line ID | synthesize unchanged |
| Target-range warning | exit 0 but require workflow review | claim warning-free approval |
| Kokoro runtime missing | stop before WAV creation | use `say`, HeyGen, or ElevenLabs silently |
| Michael absent from catalog | stop with catalog evidence | select first available voice |
| TTS line fails | preserve existing authored request; report failed line | emit partial accepted project without review |
| Transcription fails | leave prior `audio_meta.json` unchanged transactionally | estimate words from text length |
| WAV duration mismatch | fail existing audio validation | round or extend metadata duration |
| Versioned request digest or WAV identity differs from narration evidence | plan/build/verify fail before planning or emission; re-synthesize and transcribe | reuse old words/cues |

Diagnostics must not expose credentials or include the full source document when a bounded sentence excerpt is sufficient.

## Compatibility and Migration

### Existing projects

Existing projects fall into three classes:

| State | Behavior |
|---|---|
| WAV + `audio_meta.json`, no request | build/verify unchanged; no retroactive default enforcement |
| Legacy `{lines:[...]}` request before regeneration | materialize defaults into a reviewed real request before TTS |
| Explicit provider/voice request | preserve as user override |

The new command is opt-in for old audio until narration is regenerated. New scaffolds and `/md2vid` runs use it by default.

### Conditional freshness gate without synthesis coupling

`md2vid plan`, `build`, `regroup`, and framework emitters never synthesize audio and never require Kokoro or media-use.

Their input behavior is conditional:

```text
no versioned request + no narration evidence
  → legacy WAV/audio_meta behavior

versioned request present
  → require matching narration evidence
  → validate request digest + source WAV identities
  → continue with existing neutral planning
```

`md2vid verify` does not reject a legacy project solely because provider or voice evidence is absent. It does reject stale or contradictory evidence after a project opts in through a versioned request.

### Upstream default independence

Direct `hyperframes tts` may continue to default to `af_heart`. md2vid's contract remains correct because its workflow passes `am_michael` explicitly.

If HyperFrames later changes its default, md2vid tests must continue passing without updates unless the explicit Michael voice is removed or renamed.

## Implementation Shape

### New neutral narration policy module

Create:

```text
engine/narration_request.ts
engine/narration_evidence.ts
engine/__tests__/narration_request.test.ts
engine/__tests__/narration_evidence.test.ts
```

Responsibilities:

- define request and finding types;
- export canonical defaults;
- parse and validate owned request fields;
- segment spoken sentences;
- count lexical words;
- classify punctuation findings;
- apply exact runtime exception identifiers;
- canonicalize narration-affecting request fields;
- hash canonical request bytes;
- validate narration evidence shape and source WAV identities; and
- report freshness mismatches.

The engine modules perform no file writes, provider calls, or framework work.

### New CLI command

Create:

```text
scripts/narration_check.ts
test/cli/narration-check.test.ts
```

Register in:

```text
bin/md2vid.ts
```

The script owns argument parsing, file loading, stable output, and exit codes. Core analysis stays in `engine/narration_request.ts`.

### Transcription and freshness integration

Update:

```text
engine/transcribe.ts
scripts/transcribe.ts
scripts/plan_project.ts
scripts/verify.ts
```

Responsibilities:

- `scripts/transcribe.ts` loads an optional versioned request, captures validated source WAV identities, and stages `audio_meta.json` plus `narration_evidence.json` in one transaction;
- `scripts/plan_project.ts` validates matching evidence before writing neutral plans when a versioned request is present;
- build inherits the same check through shared planning;
- `scripts/verify.ts` validates the same request/evidence/WAV relationship against current inputs; and
- legacy projects without a versioned request remain on the existing path.

### Scaffold changes

Update:

```text
scripts/scaffold_project.ts
frameworks/hyperframes/scaffold.ts
frameworks/remotion/scaffold.ts
```

Tests:

```text
test/cli/scaffold-project.test.ts
test/cli/scaffold-decoupled.test.ts
test/scaffold.test.ts
frameworks/remotion/__tests__/scaffold.test.ts
```

The framework adapters update next-step language only. They do not own provider constants.

### Documentation and skill changes

Canonical sources:

```text
README.md
docs/standards/video-generation.md
docs/standards/frameworks/hyperframes.md
docs/standards/frameworks/remotion.md
skill/md2vid/SKILL.md
```

Generated references:

```text
skill/md2vid/references/standards/**
```

Validation:

```text
test/cli/skill-references.test.ts
test/cli/skill-commands.test.ts
test/docs-boundary.test.ts
```

### Package and release changes

Ensure packaged artifacts include:

```text
dist/engine/narration_request.js
dist/engine/narration_evidence.js
dist/scripts/narration_check.js
```

Update:

```text
test/release/manifest.ts
test/cli/pack.test.ts
test/release/harness.ts
test/release/harness.test.ts
public-snapshot.json
```

The release harness need not download Kokoro on every CI run. It uses two layers:

1. deterministic unit/spawn tests prove explicit `kokoro` and `am_michael` arguments;
2. a checked-in short Kokoro/Michael fixture or capability-gated local acceptance path proves transcription, safe duration, build, and check behavior.

No test may claim fresh Kokoro synthesis when it used a fixture.

### Expected change flow

```text
narration policy types + tests
  ↓
narration-check CLI + tests
  ↓
scaffold defaults + framework onboarding tests
  ↓
standards + skill + synchronized references
  ↓
package manifest + release evidence + public snapshot
```

## Testing and Evidence

### Unit tests

`engine/__tests__/narration_request.test.ts` covers:

- exact canonical defaults;
- valid default request;
- explicit overrides;
- non-English missing voice;
- duplicate/blank IDs;
- missing terminal punctuation;
- target sentence lengths;
- 19-word hard failure;
- comma chains not resetting count;
- paragraphs as strong boundaries;
- decimals, versions, URLs, abbreviations, apostrophes, and hyphenated words;
- Unicode NFKC handling;
- stable source offsets and bounded excerpts;
- exact long-sentence exception targeting;
- canonical request hashing independent of JSON formatting;
- digest changes for provider, voice, language, speed, line order, IDs, or spoken text;
- digest stability when only BGM/SFX or formatting changes;
- narration evidence schema validation; and
- request, provenance, duration, and WAV-digest mismatch diagnostics.

### CLI tests

`test/cli/narration-check.test.ts` covers:

- default request path;
- explicit `--request` path;
- exit codes 0, 1, and 2;
- stable PASS/WARN/FAIL output;
- no file mutation;
- exception flag parsing;
- malformed JSON; and
- operation from a cwd outside the project.

### Transcription and freshness tests

Focused tests prove:

- versioned transcription stages `audio_meta.json` and `narration_evidence.json` together;
- failure promoting either artifact restores both prior destinations and removes staging residue;
- evidence uses exact safe WAV duration and source digest;
- `plan`, `build`, and `verify` accept a matching request/evidence/WAV set;
- each narration-affecting field change fails with an actionable stale-evidence diagnostic;
- BGM/SFX-only edits do not invalidate narration evidence; and
- legacy projects without a versioned request retain current behavior.

### Scaffold tests

Assertions must compare exact generated values:

```ts
assert.deepEqual(request, {
  version: 1,
  provider: "kokoro",
  voice: "am_michael",
  lang: "en",
  speed: 0.9,
  lines: [/* punctuated passing examples */],
});
```

Generated example lines are run through the real narration policy rather than checked only as string literals.

### Workflow and documentation tests

Ordering assertions verify:

```text
spoken script
  < narration-check
  < Kokoro generation
  < transcribe
  < visual beats
  < plan/build/check
  < render
```

Tests reject guidance that:

- uses `say` as the default;
- omits `am_michael`;
- suggests provider auto-selection for default English generation;
- authors visuals before transcription and planning; or
- estimates word times manually.

### Skill-owned provider-boundary tests

Production synthesis remains skill-owned. Tests therefore cover two explicit boundaries:

1. documentation/skill contract tests assert that `skill/md2vid/SKILL.md` resolves the effective request and invokes media-use with:

```text
--provider kokoro
--voice am_michael
--speed 0.9
```

2. an acceptance-harness-owned fake media runner captures the resolved request values without adding an external runner to md2vid production code.

An explicit override fixture proves the captured values change accordingly. A missing-runtime acceptance fixture proves the skill workflow stops and records that no fallback command ran. Package tests also assert that `bin/md2vid.ts` exposes no synthesis command and no source file imports a personal media-use path.

### Audio and release evidence

The acceptance path proves:

- provider provenance is `kokoro`;
- voice provenance is `am_michael`;
- WAV files are fresh or explicitly identified fixtures;
- `md2vid transcribe` preserves provenance and atomically writes request/WAV evidence;
- `duration_s` exactly matches safe WAV sample extent;
- every word is bounded and ordered;
- changed voice, speed, line order, or spoken text changes the canonical request digest;
- plan/build/verify reject mismatched participating evidence before cue or framework output;
- build and semantic verification pass for both framework-neutral planning and the selected render smoke; and
- final media contains audible narration.

### Required commands

Focused commands are defined by the implementation plan. Final canonical evidence includes:

```bash
corepack npm run typecheck
corepack npm run typecheck:remotion
corepack npm test
corepack npm run check:skill-references
corepack npm run public:snapshot:check
corepack npm run release:check
git diff --check
```

## Rollout

### Phase 1 — Contract and preflight

- add canonical defaults and request parser;
- add sentence policy and tests;
- add canonical request hashing and narration evidence validation;
- add `md2vid narration-check`.

### Phase 2 — Transcription and freshness evidence

- make transcription atomically write `audio_meta.json` and `narration_evidence.json` for versioned requests;
- validate request digest and source WAV identities in shared planning and verification;
- preserve the legacy path when no versioned request participates.

### Phase 3 — New scaffold defaults

- update the common audio request example;
- update both framework onboarding paths;
- require narration preflight before synthesis in generated guidance.

### Phase 4 — Skill and standards

- update canonical video-generation standards;
- update `/md2vid` as the sole external synthesis orchestrator;
- regenerate bundled references;
- update README and framework guidance.

### Phase 5 — Package and release proof

- include new dist artifacts;
- test the skill-owned provider/voice command contract without adding a production external runner;
- add transcription/provenance/freshness acceptance evidence;
- regenerate public snapshot through the required command.

### Migration message

For existing projects:

```text
Existing WAV/audio_meta project
  → no action required

Regenerating English narration
  → add version=1
  → add provider=kokoro
  → add voice=am_michael
  → add lang=en
  → add speed=0.9
  → run narration-check
  → synthesize + transcribe again
  → retain matching narration_evidence.json
```

The rollout is additive for build compatibility and required for newly generated or regenerated English narration.
