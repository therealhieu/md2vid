# Part 4 — Public Documentation, Packaging, and Fixture-Backed Release Proof

Depends on: `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-3.md`. Complete this part before `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-5.md`.

- [ ] **Task 9: Align canonical standards, README, framework guidance, and synchronized skill references** `[Group: narration-public-contract]` `[Tester: yes]`

**Files:**
- Modify: `README.md`
- Modify: `docs/standards/video-generation.md:77-119`
- Modify: `docs/standards/frameworks/hyperframes.md`
- Modify: `docs/standards/frameworks/remotion.md`
- Modify: `skill/md2vid/SKILL.md`
- Regenerate: `skill/md2vid/references/standards/video-generation.md`
- Regenerate: `skill/md2vid/references/standards/frameworks/hyperframes.md`
- Regenerate: `skill/md2vid/references/standards/frameworks/remotion.md`
- Modify: `test/cli/skill-references.test.ts`
- Modify: `test/cli/skill-commands.test.ts`
- Modify: `test/cli/package-meta.test.ts`
- Modify: `test/docs-boundary.test.ts`

- [ ] **Step 1: Write failing documentation-contract tests**

In `test/cli/skill-references.test.ts`, assert canonical video standards and the skill contain all fixed terms:

```ts
for (const [label, text] of [
  ["canonical", readFileSync("docs/standards/video-generation.md", "utf8")],
  ["skill", readFileSync("skill/md2vid/SKILL.md", "utf8")],
] as const) {
  test(`${label} documents the narration default and ordering`, () => {
    for (const term of [
      "\"provider\": \"kokoro\"",
      "\"voice\": \"am_michael\"",
      "\"lang\": \"en\"",
      "\"speed\": 0.9",
      "6–14",
      "18",
      "md2vid narration-check",
      "/media-use",
      "md2vid transcribe",
      "narration_evidence.json",
      "For non-English narration",
    ]) assert.match(text, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
}
```

Extract one marked normative workflow and assert order only inside it:

```ts
const startMarker = "<!-- md2vid-narration-workflow:start -->";
const endMarker = "<!-- md2vid-narration-workflow:end -->";
const start = skill.indexOf(startMarker);
const end = skill.indexOf(endMarker);
assert.ok(start >= 0 && end > start, "missing marked narration workflow");
const workflow = skill.slice(start + startMarker.length, end);
const ordered = [
  "spoken narration script",
  "md2vid narration-check",
  "Kokoro",
  "md2vid transcribe",
  "visual_beats.json",
  "npm run plan",
  "npm run build",
  "npm run check",
  "review",
  "render",
];
for (const term of ordered) assert.notEqual(workflow.indexOf(term), -1, `workflow missing ${term}`);
for (let index = 1; index < ordered.length; index++) {
  assert.ok(workflow.indexOf(ordered[index - 1]) < workflow.indexOf(ordered[index]));
}
```

Add rejection assertions:

```ts
for (const forbidden of [
  "/hyperframes-media",
  "provider: \"auto\"",
  "say -v",
  "estimate word timings",
  "author visuals before transcription",
]) assert.equal(skill.includes(forbidden), false, `forbidden guidance remains: ${forbidden}`);
```

In `test/docs-boundary.test.ts`, assert framework standards defer provider defaults to the neutral narration contract and contain no contradictory `af_heart`, provider auto-selection, or framework-local voice default.

- [ ] **Step 2: Run documentation tests and confirm RED**

```bash
node --test \
  test/cli/skill-references.test.ts \
  test/cli/skill-commands.test.ts \
  test/cli/package-meta.test.ts \
  test/docs-boundary.test.ts
```

Expected: FAIL because canonical docs still reference `/hyperframes-media`, omit the new defaults/preflight/evidence, and bundled references are stale.

- [ ] **Step 3: Update the canonical video-generation narration section**

In `docs/standards/video-generation.md`, add this default before the audio metadata example:

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

Add normative rules:

```text
- English defaults apply only when the user has not selected another supported provider/voice.
- For non-English narration, supply a compatible explicit voice; never default to am_michael.
- Spoken sentences target 6–14 lexical words; more than 18 fails narration-check unless the exact sentence is approved.
- Commas and dashes do not reset the hard count.
- The /md2vid skill is the sole synthesis orchestrator; there is no md2vid audio command.
- Never fall back to say, provider auto-selection, or a cloud provider silently.
- Run narration-check before synthesis and md2vid transcribe after Kokoro.
- Versioned requests require matching narration_evidence.json before plan/build/regroup/verify.
```

Update the workflow diagram:

```text
source coverage
  → storyboard
  → spoken narration script
  → md2vid narration-check
  → explicit Kokoro am_michael synthesis through /media-use
  → md2vid transcribe
  → visual_beats.json
  → npm run plan
  → cue-bound visual authoring
  → npm run build + npm run check
  → listening + visual review
  → render
```

Replace `/hyperframes-media` with `/media-use`.

- [ ] **Step 4: Update README and framework standards without duplicating policy ownership**

README must show:

```bash
cp audio_request.json.example audio_request.json
md2vid narration-check .
# /md2vid then runs the documented /media-use Kokoro path
npm run transcribe
npm run plan
npm run build
npm run check
```

README and the skill must state: `For non-English narration, supply a compatible explicit voice; do not use am_michael.` HyperFrames and Remotion standards state that both consume the same neutral WAV/metadata/evidence and share the same ordering. They must not define separate provider constants or suggest framework adapters synthesize audio.

- [ ] **Step 5: Finalize skill wording and regenerate references**

Wrap the skill's complete normative narration sequence, from spoken-script authoring through render, between `<!-- md2vid-narration-workflow:start -->` and `<!-- md2vid-narration-workflow:end -->`. Retain the tested media contract from Task 8 inside that section. Before it, add the exact effective default request so the skill materializes and reviews the same FR-1 values rather than relying on the shell block alone:

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

Add concise narration-authoring guidance:

```text
Target 6–14 spoken words per sentence.
Split at one conceptual idea.
A comma does not count as a strong sentence boundary.
Run narration-check before TTS.
Listen to sentence transitions before rendering.
```

Regenerate only through:

```bash
corepack npm run sync:skill-references
```

Do not hand-edit files under `skill/md2vid/references/standards/**`.

- [ ] **Step 6: Run focused documentation checks**

```bash
corepack npm run check:skill-references
node --test \
  test/cli/skill-references.test.ts \
  test/cli/skill-commands.test.ts \
  test/cli/package-meta.test.ts \
  test/docs-boundary.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/standards/video-generation.md docs/standards/frameworks/hyperframes.md docs/standards/frameworks/remotion.md skill/md2vid/SKILL.md skill/md2vid/references/standards test/cli/skill-references.test.ts test/cli/skill-commands.test.ts test/cli/package-meta.test.ts test/docs-boundary.test.ts
git commit -m "docs(md2vid): document Kokoro narration workflow"
```

---

- [ ] **Task 10: Require narration policy, evidence, and CLI artifacts in the packed package** `[Group: narration-public-contract]` `[Tester: yes]`

**Files:**
- Modify: `test/release/manifest.ts:1-45`
- Modify: `test/cli/pack.test.ts:22-59`
- Modify: `test/cli/package-meta.test.ts`

- [ ] **Step 1: Write failing packed-file assertions**

Add to `REQUIRED_PACKED_FILES` and pack tests:

```ts
const NARRATION_PACKED_FILES = [
  "dist/engine/narration_request.js",
  "dist/engine/narration_evidence.js",
  "dist/scripts/narration_check.js",
  "dist/docs/standards/video-generation.md",
  "dist/docs/standards/frameworks/hyperframes.md",
  "dist/docs/standards/frameworks/remotion.md",
] as const;
```

Add forbidden package assertions:

```ts
for (const forbidden of [
  "dist/scripts/audio.js",
  "scripts/audio.ts",
  "scripts/audio.mjs",
]) assert.equal(packedPaths.has(forbidden), false);
```

Assert `package.json` has no media-use dependency and the root CLI help contains `narration-check` but no synthesis `audio` command.

- [ ] **Step 2: Run pack tests and confirm RED**

```bash
corepack npm run build:dist
node --test test/cli/pack.test.ts test/cli/package-meta.test.ts
```

Expected: FAIL until the required file arrays include the new compiled artifacts.

- [ ] **Step 3: Update package/release manifests only**

Add the six exact paths to `test/release/manifest.ts` and `test/cli/pack.test.ts`. Do not modify `package.json`, `tsconfig.dist.json`, or `scripts/copy_dist_assets.ts`; their existing globs already compile/copy the new production files and standards.

- [ ] **Step 4: Verify dist and tarball contents**

```bash
corepack npm run build:dist
test -f dist/engine/narration_request.js
test -f dist/engine/narration_evidence.js
test -f dist/scripts/narration_check.js
node --test test/cli/pack.test.ts test/cli/package-meta.test.ts
corepack npm run release:pack
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/release/manifest.ts test/cli/pack.test.ts test/cli/package-meta.test.ts
git commit -m "build(package): require narration artifacts in tarball"
```

---

- [ ] **Task 11: Add accurately labelled fixture-backed packed-release narration evidence** `[Tester: yes]`

**Files:**
- Create: `test/release/fixtures/kokoro-am-michael/audio_request.json`
- Create: `test/release/fixtures/kokoro-am-michael/audio_meta.json`
- Create: `test/release/fixtures/kokoro-am-michael/expected_words.json`
- Create: `test/release/fixtures/kokoro-am-michael/fixture.json`
- Create: `test/release/fixtures/kokoro-am-michael/assets/voice/intro.wav`
- Create: `test/release/fixtures/kokoro-am-michael/assets/voice/followup.wav`
- Modify: `test/release/harness.ts`
- Modify: `test/release/harness.test.ts`
- Modify: `test/release/run.ts`

- [ ] **Step 1: Add failing release-harness assertions for the narration sequence**

In `test/release/harness.test.ts`, require the harness source to contain these ordered operations:

```text
assert scaffold audio_request.json.example
copy versioned retained fixture request
run installed narration-check
capture test-owned media arguments
copy retained Kokoro/Michael WAVs
run installed transcribe with injected transcript provider
assert narration_evidence.json
mutate spoken text and prove planning rejects stale evidence
restore request
build/check HyperFrames
build/check Remotion
```

Assert release status text includes `fixture-backed Kokoro am_michael narration evidence` and excludes `fresh Kokoro synthesis`.

- [ ] **Step 2: Run release harness tests and confirm RED**

```bash
node --test test/release/harness.test.ts
```

Expected: FAIL because the harness currently copies pre-transcribed smoke metadata and skips narration-check, transcription, and evidence.

- [ ] **Step 3: Generate and retain Kokoro fixtures with explicit, machine-checked provenance**

Create `audio_request.json` exactly:

```json
{
  "version": 1,
  "provider": "kokoro",
  "voice": "am_michael",
  "lang": "en",
  "speed": 0.9,
  "lines": [
    { "id": "intro", "text": "Introduce the topic." },
    { "id": "followup", "text": "Recap the key idea." }
  ]
}
```

After the external prerequisite gate passes, synthesize the retained WAVs once during implementation:

```bash
set -e
FIXTURE_ROOT="$PWD/test/release/fixtures/kokoro-am-michael"
MEDIA_USE_ROOT="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/media-use"
mkdir -p "$FIXTURE_ROOT/assets/voice"
node "$MEDIA_USE_ROOT/audio/scripts/audio.mjs" \
  --request "$FIXTURE_ROOT/audio_request.json" \
  --hyperframes "$FIXTURE_ROOT" \
  --out "$FIXTURE_ROOT/audio_meta.generated.json" \
  --only tts \
  --provider kokoro \
  --voice am_michael \
  --lang en \
  --speed 0.9
test -s "$FIXTURE_ROOT/assets/voice/intro.wav"
test -s "$FIXTURE_ROOT/assets/voice/followup.wav"
```

Convert generated metadata to the versioned input shape, then transcribe the actual retained WAVs once through md2vid. This one-time fixture creation is allowed to use local synthesis/transcription; the release test itself remains offline and retained-fixture-backed:

```bash
set -e
FIXTURE_ROOT="$PWD/test/release/fixtures/kokoro-am-michael"
node - "$FIXTURE_ROOT" <<'NODE'
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const root = process.argv[2];
const request = JSON.parse(readFileSync(join(root, "audio_request.json"), "utf8"));
const generated = JSON.parse(readFileSync(join(root, "audio_meta.generated.json"), "utf8"));
const ids = request.lines.map((line) => line.id);
if (JSON.stringify(generated.voices.map((voice) => voice.id)) !== JSON.stringify(ids)) {
  throw new Error("generated voice IDs do not match retained request order");
}
const inputMeta = {
  ...generated,
  tts_provider: "kokoro",
  voice_id: "am_michael",
  voices: generated.voices.map((voice) => ({ ...voice, words: [] })),
};
writeFileSync(join(root, "audio_meta.json"), `${JSON.stringify(inputMeta, null, 2)}\n`);
NODE
corepack npm run transcribe -- "$FIXTURE_ROOT"
test -s "$FIXTURE_ROOT/narration_evidence.json"
```

Retain the actual absolute transcription output, reset metadata to its pre-transcription state for the release harness, and calculate every integrity hash mechanically:

```bash
set -e
FIXTURE_ROOT="$PWD/test/release/fixtures/kokoro-am-michael"
node - "$FIXTURE_ROOT" <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const root = process.argv[2];
const request = JSON.parse(readFileSync(join(root, "audio_request.json"), "utf8"));
const transcribed = JSON.parse(readFileSync(join(root, "audio_meta.json"), "utf8"));
const expectedWords = Object.fromEntries(transcribed.voices.map((voice) => {
  if (!Array.isArray(voice.words) || voice.words.length === 0) {
    throw new Error(`retained transcription is empty for ${voice.id}`);
  }
  for (const word of voice.words) {
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.end <= word.start || word.end > voice.duration_s) {
      throw new Error(`retained transcript word is outside ${voice.id} WAV duration`);
    }
  }
  return [voice.id, voice.words];
}));
const expectedWordsBody = `${JSON.stringify(expectedWords, null, 2)}\n`;
writeFileSync(join(root, "expected_words.json"), expectedWordsBody);
const preTranscriptionMeta = {
  ...transcribed,
  voices: transcribed.voices.map((voice) => ({ ...voice, words: [] })),
};
writeFileSync(join(root, "audio_meta.json"), `${JSON.stringify(preTranscriptionMeta, null, 2)}\n`);
const wavSha256 = Object.fromEntries(preTranscriptionMeta.voices.map((voice) => {
  const bytes = readFileSync(join(root, voice.path));
  return [voice.path, createHash("sha256").update(bytes).digest("hex")];
}));
const fixture = {
  version: 1,
  kind: "retained-kokoro-fixture",
  freshSynthesisDuringTest: false,
  freshTranscriptionDuringTest: false,
  provider: "kokoro",
  voice: "am_michael",
  requestedSpeed: 0.9,
  transcriptSource: "retained-md2vid-transcribe",
  transcriptSha256: createHash("sha256").update(expectedWordsBody).digest("hex"),
  sourceLines: Object.fromEntries(request.lines.map((line) => [line.id, line.text])),
  wavSha256,
};
writeFileSync(join(root, "fixture.json"), `${JSON.stringify(fixture, null, 2)}\n`);
NODE
rm "$FIXTURE_ROOT/audio_meta.generated.json" "$FIXTURE_ROOT/narration_evidence.json"
```

The release harness replays those retained absolute provider words by writing the selected array unchanged to the injected runner's `transcript.json`. It must never derive word times from duration, character count, token count, or ratios.

- [ ] **Step 4: Refactor the installed-package smoke sequence**

In `test/release/harness.ts`:

1. Scaffold with the packed CLI.
2. Assert the exact requirements FR-1 example.
3. Copy retained request/WAV/metadata fixtures.
4. Run installed `md2vid narration-check .` and require exit `0`.
5. Use a test-owned fake media runner to capture effective `kokoro`, `am_michael`, `en`, and `0.9`; do not add a production runner.
6. Import installed `dist/scripts/transcribe.js` and inject a deterministic transcript runner using `expected_words.json`.
7. Assert `audio_meta.json` exact safe durations and provenance.
8. Assert `narration_evidence.json` request digest and WAV hashes.
9. Mutate one line's text; run installed `md2vid plan .`; require stale-evidence failure before outputs change.
10. Restore request and continue existing visual-beat build/check/render/still flows.

Use a helper that labels every retained fixture assertion:

```ts
function assertRetainedKokoroFixture(meta: FixtureMeta): void {
  assert.equal(meta.kind, "retained-kokoro-fixture");
  assert.equal(meta.freshSynthesisDuringTest, false);
  assert.equal(meta.freshTranscriptionDuringTest, false);
  assert.equal(meta.transcriptSource, "retained-md2vid-transcribe");
  assert.equal(meta.provider, "kokoro");
  assert.equal(meta.voice, "am_michael");
  assert.equal(meta.requestedSpeed, 0.9);
}
```

- [ ] **Step 5: Add fixture integrity tests**

In `test/release/harness.test.ts`, verify:

```ts
for (const [relativePath, expected] of Object.entries(fixture.wavSha256)) {
  const actual = createHash("sha256").update(readFileSync(join(fixtureRoot, relativePath))).digest("hex");
  assert.equal(actual, expected);
}
const transcriptBytes = readFileSync(join(fixtureRoot, "expected_words.json"));
assert.equal(createHash("sha256").update(transcriptBytes).digest("hex"), fixture.transcriptSha256);
```

Also validate WAV sample extent with existing voice snapshot APIs and ensure every retained absolute word in `expected_words.json` is ordered, non-empty, and inside its safe WAV duration. Reject `startRatio`, `endRatio`, or any proportional timing field.

- [ ] **Step 6: Run release tests**

```bash
node --test test/release/harness.test.ts
corepack npm run release:check
```

Expected: PASS. Output explicitly says fixture-backed evidence and never claims fresh synthesis.

- [ ] **Step 7: Commit**

```bash
git add test/release/fixtures/kokoro-am-michael test/release/harness.ts test/release/harness.test.ts test/release/run.ts
git commit -m "test(release): prove fixture-backed narration workflow"
```

## Part 4 Focused Gate

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

Expected: canonical documentation, synchronized references, packed files, and accurately labelled fixture-backed release evidence all pass.
