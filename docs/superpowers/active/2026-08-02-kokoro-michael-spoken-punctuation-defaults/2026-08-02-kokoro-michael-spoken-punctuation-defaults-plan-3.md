# Part 3 — Scaffold Defaults and Skill-Owned Kokoro Orchestration

Depends on: `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-2.md`. Complete this part before `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-4.md`.

- [ ] **Task 7: Pin the exact versioned narration defaults in both framework scaffolds** `[Group: narration-onboarding]` `[Tester: yes]`

**Files:**
- Modify: `scripts/scaffold_project.ts:14-19,105-180`
- Modify: `frameworks/hyperframes/scaffold.ts:124-156`
- Modify: `frameworks/remotion/scaffold.ts:37-63`
- Modify: `test/cli/scaffold-project.test.ts`
- Modify: `test/scaffold.test.ts`
- Modify: `test/cli/scaffold-decoupled.test.ts`
- Modify: `frameworks/remotion/__tests__/scaffold.test.ts`

- [ ] **Step 1: Write failing exact-default and next-step-order tests**

In `test/cli/scaffold-project.test.ts`, replace the lines-only expectation with the requirements FR-1 oracle:

```ts
const EXPECTED_AUDIO_REQUEST = {
  version: 1,
  provider: "kokoro",
  voice: "am_michael",
  lang: "en",
  speed: 0.9,
  lines: [
    { id: "intro", text: "Introduce the topic." },
    { id: "recap", text: "Recap the key idea." },
  ],
} as const;

test("common scaffold writes the exact versioned narration defaults", () => {
  const project = scaffoldProject("narration-defaults", "hyperframes");
  assert.deepEqual(readJson(join(project, "audio_request.json.example")), EXPECTED_AUDIO_REQUEST);
  const analyzed = analyzeNarrationRequest(
    validateVersionedNarrationRequest(EXPECTED_AUDIO_REQUEST, "audio_request.json.example"),
  );
  assert.equal(analyzed.findings.some((finding) => finding.severity === "error"), false);
});
```

Add a table that mutates one field at a time and expects `validateCommonScaffold()` to reject drift:

```ts
for (const [field, value] of [
  ["version", 2],
  ["provider", "heygen"],
  ["voice", "af_heart"],
  ["lang", "en-gb"],
  ["speed", 1],
] as const) {
  test(`common scaffold rejects audio request ${field} drift`, () => {
    const project = scaffoldProject(`drift-${field}`, "hyperframes");
    const path = join(project, "audio_request.json.example");
    const request = readJson(path);
    writeFileSync(path, `${JSON.stringify({ ...request, [field]: value }, null, 2)}\n`);
    assert.throws(() => validateCommonScaffold(project, `drift-${field}`), /audio_request\.json\.example/);
  });
}
```

In `test/cli/scaffold-decoupled.test.ts` and Remotion scaffold tests, assert exact order:

```text
spoken script
< materialize audio_request.json
< narration-check
< Kokoro readiness/media-use
< transcribe
< slugs
< visual_beats
< plan
< visual authoring
< build
< check
< review
< render
```

Remotion retains `npm install` as its first framework-specific step.

- [ ] **Step 2: Run scaffold tests and confirm RED**

```bash
node --test \
  test/cli/scaffold-project.test.ts \
  test/scaffold.test.ts \
  test/cli/scaffold-decoupled.test.ts \
  frameworks/remotion/__tests__/scaffold.test.ts
```

Expected: FAIL because the scaffold still emits only `lines[]` and onboarding omits narration-check/Kokoro ordering.

- [ ] **Step 3: Derive the common example from canonical defaults**

In `scripts/scaffold_project.ts`:

```ts
import {
  DEFAULT_NARRATION_POLICY,
  analyzeNarrationRequest,
  validateVersionedNarrationRequest,
} from "../engine/narration_request.ts";

export const AUDIO_REQUEST_EXAMPLE = Object.freeze({
  version: 1,
  ...DEFAULT_NARRATION_POLICY,
  lines: [
    { id: "intro", text: "Introduce the topic." },
    { id: "recap", text: "Recap the key idea." },
  ],
});
```

Use the requirements text exactly; do not replace it with the longer illustrative design example.

Strengthen `validateCommonScaffold()`:

```ts
const audioRequestPath = join(root, "audio_request.json.example");
const audioRequest = JSON.parse(readFileSync(audioRequestPath, "utf8"));
if (JSON.stringify(audioRequest) !== JSON.stringify(AUDIO_REQUEST_EXAMPLE)) {
  throw new Error(`${audioRequestPath} does not match the canonical narration example`);
}
const validatedRequest = validateVersionedNarrationRequest(audioRequest, audioRequestPath);
const analysis = analyzeNarrationRequest(validatedRequest);
const errors = analysis.findings.filter((finding) => finding.severity === "error");
if (errors.length > 0) {
  throw new Error(`${audioRequestPath} violates narration policy: ${errors.map((finding) => finding.code).join(", ")}`);
}
```

- [ ] **Step 4: Update framework next-step lists without moving policy ownership**

HyperFrames next steps:

```ts
nextSteps: [
  "review audio_request.json.example and author the spoken script",
  "materialize audio_request.json with explicit effective narration settings",
  "run md2vid narration-check .",
  "verify Kokoro readiness and generate fresh WAVs through /media-use",
  "run npm run transcribe",
  "fill video.config.json voice-id -> frame-slug mappings",
  "author visual_beats.json",
  "run npm run plan",
  "author cue-bound frames in compositions/frames/",
  "run npm run build",
  "run npm run check",
  "run npm run dev for review",
  "run npm run render after review",
],
```

Remotion uses the same neutral ordering, with `npm install` first and Remotion scene/still/studio wording retained.

- [ ] **Step 5: Run focused tests**

```bash
node --test \
  engine/__tests__/narration_request.test.ts \
  test/cli/scaffold-project.test.ts \
  test/scaffold.test.ts \
  test/cli/scaffold-decoupled.test.ts \
  frameworks/remotion/__tests__/scaffold.test.ts
corepack npm run typecheck
corepack npm run typecheck:remotion
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/scaffold_project.ts frameworks/hyperframes/scaffold.ts frameworks/remotion/scaffold.ts test/cli/scaffold-project.test.ts test/scaffold.test.ts test/cli/scaffold-decoupled.test.ts frameworks/remotion/__tests__/scaffold.test.ts
git commit -m "feat(scaffold): pin Kokoro Michael narration defaults"
```

---

- [ ] **Task 8: Make `/md2vid` the sole portable media-use orchestrator and prove fail-closed readiness** `[Group: narration-onboarding]` `[Tester: yes]`

**Files:**
- Modify: `skill/md2vid/SKILL.md:120-264`
- Modify: `scripts/skill_references.ts:93-110`
- Modify: `test/cli/skill-commands.test.ts`
- Create: `test/cli/skill-media-contract.test.ts`
- Modify: `test/boundaries.test.ts`

- [ ] **Step 1: Write failing skill contract and no-runner boundary tests**

Create `test/cli/skill-media-contract.test.ts`. The test extracts a fenced shell block marked with `<!-- md2vid-media-contract:start -->` and `<!-- md2vid-media-contract:end -->`, then executes it with fake tools.

Use a fake `md2vid` executable that returns:

```json
{
  "checks": [
    { "name": "TTS (Kokoro)", "ok": true },
    { "name": "FFmpeg", "ok": true },
    { "name": "FFprobe", "ok": true }
  ]
}
```

for `hyperframes doctor --json`, and:

```json
[
  { "id": "af_heart", "label": "Heart" },
  { "id": "am_michael", "label": "Michael" }
]
```

for `hyperframes tts --list --json`.

Use a fake `${CLAUDE_CONFIG_DIR}/skills/media-use/audio/scripts/audio.mjs` that writes its `process.argv.slice(2)` to a capture file. Assert:

```ts
assert.deepEqual(captured, [
  "--request", join(project, "audio_request.json"),
  "--hyperframes", project,
  "--out", join(project, "audio_meta.json"),
  "--only", "tts",
  "--provider", "kokoro",
  "--voice", "am_michael",
  "--lang", "en",
  "--speed", "0.9",
]);
```

Add an explicit `heygen` override request and assert captured values reflect it. For that case, make doctor report only FFmpeg/FFprobe and make the fake CLI fail if `hyperframes tts --list --json` is called; explicit non-Kokoro overrides must not require Kokoro readiness. Add missing Kokoro and missing Michael cases for the default request; assert capture file absent and stderr contains all four stable recovery lines:

```text
Kokoro readiness failed: <failed capability or voice>
Preflight command: md2vid hyperframes doctor --json
Next step: md2vid hyperframes doctor
No system, cloud, or automatic fallback was used.
```

Assert the skill's warning-review instruction appears after `md2vid narration-check` and before the marked media contract.

In `test/boundaries.test.ts`, scan production `.ts` files and assert none imports, discovers, resolves, or spawns media-use. For every production TypeScript file except `scripts/skill_references.ts`, reject:

```text
skills/media-use
audio/scripts/audio.mjs
COMMANDS audio synthesis route
"audio": audioRun
```

`scripts/skill_references.ts` may contain only the exact non-executing documentation-contract literal `node "$MEDIA_USE_ROOT/audio/scripts/audio.mjs"`. Add assertions that this file does not import `node:child_process`, call `spawn`/`exec`, inspect `$HOME`/`CLAUDE_CONFIG_DIR`, or resolve a media-use filesystem path. Permit executable media-use discovery/invocation only in `skill/md2vid/SKILL.md` and tests.

- [ ] **Step 2: Run skill tests and confirm RED**

```bash
node --test test/cli/skill-commands.test.ts test/cli/skill-media-contract.test.ts test/boundaries.test.ts
```

Expected: FAIL because the skill has no marked portable media contract and current portability checks reject `.mjs` command references broadly.

- [ ] **Step 3: Add the portable skill-owned readiness and invocation block**

In `skill/md2vid/SKILL.md`, after the spoken script and `md2vid narration-check` steps, place the executable fence between these Markdown markers so the test extracts shell only:

<!-- md2vid-media-contract:start -->
```bash
set -e
MEDIA_USE_ROOT="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/media-use"
NARRATION_ROOT="${NARRATION_ROOT:?set NARRATION_ROOT to the flat project or canonical shared root}"

TTS_PROVIDER=$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.provider)' "$NARRATION_ROOT/audio_request.json")
TTS_VOICE=$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.voice)' "$NARRATION_ROOT/audio_request.json")
TTS_LANG=$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.lang)' "$NARRATION_ROOT/audio_request.json")
TTS_SPEED=$(node -e 'const r=require(process.argv[1]); process.stdout.write(String(r.speed))' "$NARRATION_ROOT/audio_request.json")

DOCTOR_JSON=$(md2vid hyperframes doctor --json)
VOICES_JSON='[]'
if [ "$TTS_PROVIDER" = kokoro ]; then
  VOICES_JSON=$(md2vid hyperframes tts --list --json)
fi
node - "$DOCTOR_JSON" "$VOICES_JSON" "$TTS_PROVIDER" "$TTS_VOICE" <<'NODE'
const [doctorJson, voicesJson, provider, voice] = process.argv.slice(2);
const doctor = JSON.parse(doctorJson);
const voices = JSON.parse(voicesJson);
function failReadiness(capability) {
  const label = provider === "kokoro" ? "Kokoro readiness failed" : "Narration readiness failed";
  console.error(`${label}: ${capability}`);
  console.error("Preflight command: md2vid hyperframes doctor --json");
  console.error("Next step: md2vid hyperframes doctor");
  console.error("No system, cloud, or automatic fallback was used.");
  process.exit(1);
}
for (const name of ["FFmpeg", "FFprobe"]) {
  const check = doctor.checks?.find((candidate) => candidate.name === name);
  if (!check?.ok) failReadiness(name);
}
if (provider === "kokoro") {
  const kokoro = doctor.checks?.find((candidate) => candidate.name === "TTS (Kokoro)");
  if (!kokoro?.ok) failReadiness("TTS (Kokoro)");
  if (!voices.some((candidate) => candidate.id === voice)) {
    failReadiness(`voice ${voice}`);
  }
}
NODE

node "$MEDIA_USE_ROOT/audio/scripts/audio.mjs" \
  --request "$NARRATION_ROOT/audio_request.json" \
  --hyperframes "$NARRATION_ROOT" \
  --out "$NARRATION_ROOT/audio_meta.json" \
  --only tts \
  --provider "$TTS_PROVIDER" \
  --voice "$TTS_VOICE" \
  --lang "$TTS_LANG" \
  --speed "$TTS_SPEED"
```
<!-- md2vid-media-contract:end -->

The surrounding instructions must say:

- run this only after `md2vid narration-check` has no errors;
- inspect every warning before synthesis, rewrite the sentence or explicitly retain it with a stated project-specific rationale, and never call warning-bearing output "warning-free";
- stop if doctor/catalog validation fails and print the failed capability, exact preflight command, `md2vid hyperframes doctor` recovery command, and explicit no-fallback statement;
- do not use `say`, provider auto-selection, or a network fallback;
- run `npm run transcribe` immediately after successful synthesis;
- any request change invalidates audio and downstream cues.

- [ ] **Step 4: Narrow the skill portability rule precisely**

In `scripts/skill_references.ts`, retain rejection of bare repository-relative commands such as `node scripts/*.mjs`, but permit only:

```text
node "$MEDIA_USE_ROOT/audio/scripts/audio.mjs"
```

The existing `findStaleSkillGuidance()` regex matches the `scripts/audio.mjs` substring, so apply the exact exception before that regex evaluates the Markdown body:

```ts
const PORTABLE_MEDIA_COMMAND = 'node "$MEDIA_USE_ROOT/audio/scripts/audio.mjs"';
const STALE_SKILL_GUIDANCE = /(?:\.\.\/)*scripts\/\S+\.(?:ts|mjs)|\.\.\/\.\.\/scripts|@\.\.\/\.\.\/docs|docs\/standards\/|outputs\/hash-table-example\/|frameworks\/[^/\s]+\/templates(?:\/\S+)?/;

export function findStaleSkillGuidance(skillRoot: string): string[] {
  return markdownFiles(skillRoot)
    .filter((path) => {
      const body = readFileSync(path, "utf8");
      const withoutExactPortableCommand = body.split("\n").map((line) => {
        const command = line.trim().replace(/\\\s*$/u, "").trim();
        return command === PORTABLE_MEDIA_COMMAND ? "" : line;
      }).join("\n");
      return STALE_SKILL_GUIDANCE.test(withoutExactPortableCommand);
    })
    .map((path) => relative(skillRoot, path));
}
```

This removes only the exact non-executing documentation command before stale matching. A missing `$MEDIA_USE_ROOT`, different executable, repository-relative path, or any other near-match remains visible to the broad stale regex. Add `validateSkillTree()` regressions in `test/cli/skill-commands.test.ts` proving the exact command passes and each near-match fails.

- [ ] **Step 5: Run focused tests and external compatibility gate**

```bash
node --test \
  test/cli/skill-commands.test.ts \
  test/cli/skill-media-contract.test.ts \
  test/boundaries.test.ts

MEDIA_USE_ROOT="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/media-use"
node - "$MEDIA_USE_ROOT/audio/scripts/lib/tts.mjs" <<'NODE'
const { readFileSync } = require("node:fs");
const source = readFileSync(process.argv[2], "utf8");
const branch = source.slice(source.indexOf("// kokoro"), source.indexOf("// kokoro") + 1800);
if (!branch.includes('"--speed"') && !branch.includes("'--speed'")) throw new Error("media-use does not forward --speed");
console.log("PASS: media-use forwards Kokoro speed");
NODE
```

Expected: all PASS. If the external compatibility gate fails, stop; do not commit a claim that speed `0.9` is effective.

- [ ] **Step 6: Commit**

```bash
git add skill/md2vid/SKILL.md scripts/skill_references.ts test/cli/skill-commands.test.ts test/cli/skill-media-contract.test.ts test/boundaries.test.ts
git commit -m "docs(skill): require explicit Kokoro media synthesis"
```

## Part 3 Focused Gate

```bash
node --test \
  test/cli/scaffold-project.test.ts \
  test/scaffold.test.ts \
  test/cli/scaffold-decoupled.test.ts \
  frameworks/remotion/__tests__/scaffold.test.ts \
  test/cli/skill-commands.test.ts \
  test/cli/skill-media-contract.test.ts \
  test/boundaries.test.ts
corepack npm run typecheck
corepack npm run typecheck:remotion
```

Expected: exact scaffold defaults, framework parity, explicit skill-owned media arguments, fail-closed readiness, and no production external runner are all proved.
