# Part 2 — Transactional Transcription Evidence and Freshness Gates

Depends on: `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-1.md`. Complete this part before `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-3.md`.

- [ ] **Task 4: Preserve audio provenance and expose the immutable WAV snapshots transcription used** `[Group: narration-freshness]` `[Tester: yes]`

**Files:**
- Modify: `engine/transcribe.ts:38-88`
- Modify: `engine/__tests__/transcribe.test.ts`
- Modify: `test/cli/run-exports.test.ts`

- [ ] **Step 1: Write failing provenance and snapshot-result tests**

In `engine/__tests__/transcribe.test.ts`, extend the successful fixture:

```ts
test("preserves root provenance and returns the pre-provider WAV snapshots", () => {
  const root = fixtureRoot();
  const meta = {
    tts_provider: "kokoro",
    voice_id: "am_michael",
    voices: [voice("intro", "assets/voice/intro.wav", 999, [])],
  };
  const result = transcribeVoices(meta, root, {
    run: transcriptRunner([{ id: "w0", text: "Hello", start: 0, end: 0.5 }]),
  });
  assert.equal((result.meta as typeof meta).tts_provider, "kokoro");
  assert.equal((result.meta as typeof meta).voice_id, "am_michael");
  assert.equal(result.voiceSnapshots.length, 1);
  assert.equal(result.voiceSnapshots[0].path, "assets/voice/intro.wav");
  assert.equal(result.meta.voices[0].duration_s, result.voiceSnapshots[0].duration_s);
});

test("snapshot result remains tied to bytes captured before provider execution", () => {
  const root = fixtureRoot();
  const original = readFileSync(join(root, "assets/voice/intro.wav"));
  const result = transcribeVoices(META, root, {
    run: (args) => {
      writeFileSync(join(root, "assets/voice/intro.wav"), differentValidWav());
      const outIndex = args.indexOf("--dir");
      assert.notEqual(outIndex, -1);
      const outDir = args[outIndex + 1];
      writeFileSync(
        join(outDir, "transcript.json"),
        JSON.stringify([{ text: "Hello", start: 0, end: 0.5 }]),
      );
      return 0;
    },
  });
  assert.deepEqual(result.voiceSnapshots[0].readBytes(), original);
  assert.notDeepEqual(result.voiceSnapshots[0].readBytes(), readFileSync(join(root, "assets/voice/intro.wav")));
});
```

Extend the partial-failure assertion to require that persisted metadata is not built from partial results and that snapshots are still returned only as diagnostic input.

- [ ] **Step 2: Run tests and confirm RED**

```bash
node --test engine/__tests__/transcribe.test.ts
```

Expected: FAIL because `voiceSnapshots` is absent and successful transcription returns `{ voices: completed }`, dropping root provenance.

- [ ] **Step 3: Add a concrete transcription result type**

In `engine/transcribe.ts`:

```ts
import type { VoiceWavSnapshot } from "./voice_assets.ts";

export interface TranscribeResult {
  meta: AudioMeta;
  ok: number;
  total: number;
  voiceSnapshots: VoiceWavSnapshot[];
}

export function transcribeVoices(
  meta: AudioMeta,
  baseDir: string,
  {
    model = "small.en",
    run = runHyperframes,
  }: { model?: string; run?: HyperframesRunner } = {},
): TranscribeResult {
```

Keep the existing single upfront `captureVoiceWavSnapshots()` call. Return those exact snapshots on every result:

```ts
if (ok !== validated.voices.length) {
  return { meta, ok, total: validated.voices.length, voiceSnapshots: snapshots };
}
return {
  meta: { ...validated, voices: completed },
  ok,
  total: validated.voices.length,
  voiceSnapshots: snapshots,
};
```

Do not recapture WAVs after provider calls.

- [ ] **Step 4: Run focused tests**

```bash
node --test engine/__tests__/transcribe.test.ts engine/__tests__/voice_assets.test.ts test/cli/run-exports.test.ts
corepack npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/transcribe.ts engine/__tests__/transcribe.test.ts test/cli/run-exports.test.ts
git commit -m "fix(transcribe): preserve narration provenance"
```

---

- [ ] **Task 5: Atomically promote `audio_meta.json` and versioned narration evidence** `[Group: narration-freshness]` `[Tester: yes]`

**Files:**
- Modify: `scripts/transcribe.ts:1-95`
- Modify: `test/cli/run-exports.test.ts:339-436`
- Reuse: `scripts/managed_file_transaction.ts`
- Test: `test/cli/managed-file-transaction.test.ts`

- [ ] **Step 1: Write failing paired-promotion and rollback tests**

In `test/cli/run-exports.test.ts`, add a versioned transcription fixture with real WAVs and provider provenance:

```ts
const request = {
  version: 1,
  provider: "kokoro",
  voice: "am_michael",
  lang: "en",
  speed: 0.9,
  lines: [{ id: "intro", text: "Introduce the topic." }],
};
writeFileSync(join(project, "audio_request.json"), `${JSON.stringify(request, null, 2)}\n`);
writeFileSync(join(project, "audio_meta.json"), `${JSON.stringify({
  tts_provider: "kokoro",
  voice_id: "am_michael",
  voices: [{ id: "intro", path: "assets/voice/intro.wav", duration_s: 999, words: [] }],
}, null, 2)}\n`);
```

Add success assertions:

```ts
test("versioned transcribe atomically writes metadata and narration evidence", () => {
  const code = transcribeRun([project], { transcribeVoices: successfulTranscriber });
  assert.equal(code, 0);
  const meta = JSON.parse(readFileSync(join(project, "audio_meta.json"), "utf8"));
  const evidence = JSON.parse(readFileSync(join(project, "narration_evidence.json"), "utf8"));
  assert.equal(meta.tts_provider, "kokoro");
  assert.equal(meta.voice_id, "am_michael");
  assert.equal(evidence.provider, "kokoro");
  assert.equal(evidence.voice, "am_michael");
  assert.equal(evidence.voices[0].duration_s, meta.voices[0].duration_s);
  assert.equal(evidence.voices[0].sha256.length, 64);
  assert.deepEqual(findResidue(project), []);
});
```

Inject failures through `transactionDependencies.rename`:

```ts
test("second promotion failure restores both prior destinations", () => {
  const oldMeta = readFileSync(join(project, "audio_meta.json"));
  const oldEvidence = Buffer.from('{"old":true}\n');
  writeFileSync(join(project, "narration_evidence.json"), oldEvidence);
  let promotions = 0;
  const code = transcribeRun([project], {
    transcribeVoices: successfulTranscriber,
    transactionDependencies: {
      rename(from, to) {
        if (from.includes(".md2vid-transcribe-") && ++promotions === 2) {
          const error = new Error("forced second promotion failure") as NodeJS.ErrnoException;
          error.code = "EIO";
          throw error;
        }
        renameSync(from, to);
      },
    },
  });
  assert.equal(code, 1);
  assert.deepEqual(readFileSync(join(project, "audio_meta.json")), oldMeta);
  assert.deepEqual(readFileSync(join(project, "narration_evidence.json")), oldEvidence);
  assert.deepEqual(findResidue(project), []);
});
```

Add: first promotion failure, prior evidence absent, transcription partial failure, unsupported request version, missing versioned fields, request line IDs not matching voice IDs, and legacy transcription updating only metadata while leaving orphan evidence untouched.

- [ ] **Step 2: Run the transcription integration tests and confirm RED**

```bash
node --test --test-name-pattern='transcribe|narration evidence|promotion' test/cli/run-exports.test.ts
```

Expected: FAIL because `scripts/transcribe.ts` only renames one metadata file and does not parse requests or create evidence.

- [ ] **Step 3: Replace the single-file rename with managed-file promotion**

Update imports in `scripts/transcribe.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createNarrationEvidence } from "../engine/narration_evidence.ts";
import {
  validateNarrationRequest,
  validateVersionedNarrationRequest,
  type VersionedNarrationRequest,
} from "../engine/narration_request.ts";
import { promoteManagedFiles, type ManagedFileTransactionDependencies } from "./managed_file_transaction.ts";
```

Export the dependency interface:

```ts
export interface TranscribeDependencies {
  transcribeVoices?: typeof transcribeVoices;
  transactionDependencies?: ManagedFileTransactionDependencies;
}
```

Load optional request before provider execution:

```ts
const requestPath = join(SHARED, "audio_request.json");
let versionedRequest: VersionedNarrationRequest | undefined;
if (existsSync(requestPath)) {
  const rawRequest = JSON.parse(readFileSync(requestPath, "utf8"));
  const request = validateNarrationRequest(rawRequest, requestPath);
  if (request.version === 1) versionedRequest = validateVersionedNarrationRequest(rawRequest, requestPath);
}
```

After full transcription success, validate ordered line/voice IDs and provenance:

```ts
if (versionedRequest) {
  const requestIds = versionedRequest.lines.map((line) => line.id);
  const voiceIds = result.meta.voices.map((voice) => voice.id);
  if (JSON.stringify(requestIds) !== JSON.stringify(voiceIds)) {
    throw new Error(`${requestPath}: ordered lines[].id must match audio_meta.json voices[].id`);
  }
  const provenance = result.meta as AudioMeta & { tts_provider?: unknown; voice_id?: unknown };
  if (provenance.tts_provider !== undefined && provenance.tts_provider !== versionedRequest.provider) {
    throw new Error(`${metaPath}: tts_provider contradicts ${requestPath}`);
  }
  if (provenance.voice_id !== undefined && provenance.voice_id !== versionedRequest.voice) {
    throw new Error(`${metaPath}: voice_id contradicts ${requestPath}`);
  }
}
```

Stage both JSON files under one staging root:

```ts
const stagingRoot = mkdtempSync(join(SHARED, ".md2vid-transcribe-"));
try {
  const stagedMeta = join(stagingRoot, "audio_meta.json");
  writeFileSync(stagedMeta, `${JSON.stringify(result.meta, null, 2)}\n`);
  const managed = [{ target: "audio_meta.json", staged: stagedMeta }];

  if (versionedRequest) {
    const evidence = createNarrationEvidence({
      request: versionedRequest,
      meta: result.meta,
      snapshots: result.voiceSnapshots,
      metadataPath: metaPath,
    });
    const stagedEvidence = join(stagingRoot, "narration_evidence.json");
    writeFileSync(stagedEvidence, `${JSON.stringify(evidence, null, 2)}\n`);
    managed.push({ target: "narration_evidence.json", staged: stagedEvidence });
  }

  const promotion = promoteManagedFiles(SHARED, stagingRoot, managed, deps.transactionDependencies);
  for (const warning of promotion.cleanupErrors) console.warn(`WARN [transcribe]: ${warning}`);
} finally {
  rmSync(stagingRoot, { recursive: true, force: true });
}
```

Report promotion failures as exit `1` while preserving originals.

- [ ] **Step 4: Run paired transaction tests**

```bash
node --test \
  engine/__tests__/transcribe.test.ts \
  test/cli/managed-file-transaction.test.ts \
  test/cli/run-exports.test.ts
corepack npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/transcribe.ts test/cli/run-exports.test.ts
git commit -m "feat(transcribe): attest narration request and audio"
```

---

- [ ] **Task 6: Reject stale participating narration before plan, build, regroup, or verify** `[Group: narration-freshness]` `[Tester: yes]`

**Files:**
- Modify: `scripts/plan_project.ts:1-65`
- Modify: `scripts/verify.ts:133-152`
- Verify call path: `scripts/regroup.ts:75-82` (already delegates through `createProjectPlan`; modify only if this owned path changes)
- Modify: `test/cli/plan-project.test.ts`
- Modify: `test/cli/plan.test.ts`
- Modify: `test/cli/workflows.test.ts`

- [ ] **Step 1: Write failing freshness integration tests**

Create a helper in `test/cli/plan-project.test.ts` that writes a matching versioned request, metadata, WAV, and evidence through the real engine creators. Add:

```ts
test("createProjectPlan accepts matching versioned narration evidence", () => {
  const project = versionedFixture();
  assert.doesNotThrow(() => createProjectPlan(project));
});

test("createProjectPlan rejects changed spoken text before planning", () => {
  const project = versionedFixture();
  const requestPath = join(project, "audio_request.json");
  const request = JSON.parse(readFileSync(requestPath, "utf8"));
  request.lines[0].text = "Introduce this topic.";
  writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`);
  assert.throws(
    () => createProjectPlan(project),
    /request digest.*Re-synthesize narration and rerun `md2vid transcribe`/,
  );
});
```

In `test/cli/workflows.test.ts`, add table-driven plan/build/regroup/verify cases for:

```text
matching evidence → pass
missing evidence → fail
changed provider/voice/lang/speed/text/order/ID → fail
same-duration different WAV bytes → fail
evidence voice path/duration/digest → fail
BGM/SFX-only request edits → pass
no request → legacy pass
unversioned request → legacy pass
orphan evidence without versioned request → ignored and retained
```

For failed plan/build/regroup operations, snapshot all neutral/framework outputs and assert byte-for-byte unchanged.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
node --test test/cli/plan-project.test.ts test/cli/plan.test.ts test/cli/workflows.test.ts
```

Expected: stale requests currently pass because shared planning and verify do not load narration evidence.

- [ ] **Step 3: Add a filesystem-facing freshness gate to shared planning**

In `scripts/plan_project.ts`, extend the existing imports without removing current planning imports:

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AudioMeta, BuildPlan, VideoConfig, VoiceAssetSnapshot } from "../engine/types.ts";
import {
  captureVoiceWavSnapshots,
  validateAudioMetaVoiceSnapshots,
  type VoiceWavSnapshot,
} from "../engine/voice_assets.ts";
import {
  validateNarrationRequest,
  validateVersionedNarrationRequest,
} from "../engine/narration_request.ts";
import {
  validateNarrationEvidence,
  verifyNarrationEvidence,
} from "../engine/narration_evidence.ts";
```

Then export:

```ts
export function validateProjectNarrationFreshness(
  sharedDir: string,
  meta: AudioMeta,
  voiceSnapshots: readonly VoiceWavSnapshot[],
): void {
  const requestPath = join(sharedDir, "audio_request.json");
  if (!existsSync(requestPath)) return;

  const rawRequest = JSON.parse(readFileSync(requestPath, "utf8"));
  const request = validateNarrationRequest(rawRequest, requestPath);
  if (request.version !== 1) return;
  const versioned = validateVersionedNarrationRequest(rawRequest, requestPath);

  const evidencePath = join(sharedDir, "narration_evidence.json");
  if (!existsSync(evidencePath)) {
    throw new Error(`${evidencePath}: missing for versioned narration request. Re-synthesize narration and rerun \`md2vid transcribe\`.`);
  }
  const evidence = validateNarrationEvidence(JSON.parse(readFileSync(evidencePath, "utf8")), evidencePath);
  const findings = verifyNarrationEvidence({
    request: versioned,
    evidence,
    meta,
    snapshots: voiceSnapshots,
    metadataPath: join(sharedDir, "audio_meta.json"),
  });
  if (findings.length > 0) throw new Error(findings.map((finding) => finding.msg).join("\n"));
}
```

Call it in `createProjectPlan()` immediately after audio metadata/WAV validation and before config, visual-beat loading, or output creation.

- [ ] **Step 4: Apply the same gate to verify's unconditional input path**

In `scripts/verify.ts`, immediately after `validateAudioMetaVoiceSnapshots(...)`:

```ts
validateProjectNarrationFreshness(SHARED, meta, voiceSnapshots);
```

Do not rely only on `createProjectPlan()`, because verify may skip current visual planning when visual sync is off or absent.

- [ ] **Step 5: Prove the direct regroup route is freshness-gated**

`md2vid regroup` already resolves `layout.outputDir` and calls `createProjectPlan(layout.outputDir)` in `scripts/regroup.ts:75-82`. Keep that call path intact. Add a table-driven case in `test/cli/workflows.test.ts` that invokes the real regroup route with a versioned fixture, mutates `audio_request.json`, and asserts:

```ts
const result = captureConsole(() => regroupRun([project.outputDir]));
assert.equal(result.code, 1);
assert.match(result.stderr, /request digest.*Re-synthesize narration and rerun `md2vid transcribe`/);
assert.deepEqual(readFileSync(join(project.sharedDir, "caption_groups.json")), originalCaptionGroups);
```

Also assert the matching-evidence regroup succeeds and the legacy no-request regroup remains unchanged. If the current regroup route no longer calls `createProjectPlan`, modify only `scripts/regroup.ts` to add the call before `getAdapter()` and include that file in Task 6's commit.

- [ ] **Step 6: Run focused and compatibility tests**

```bash
node --test \
  engine/__tests__/narration_evidence.test.ts \
  test/cli/plan-project.test.ts \
  test/cli/plan.test.ts \
  test/cli/workflows.test.ts \
  test/cli/run-exports.test.ts
corepack npm run typecheck
```

Expected: PASS. Existing flat/canonical HyperFrames/Remotion audio-only workflow fixtures remain green.

- [ ] **Step 7: Commit**

```bash
git add scripts/plan_project.ts scripts/verify.ts scripts/regroup.ts test/cli/plan-project.test.ts test/cli/plan.test.ts test/cli/workflows.test.ts
git commit -m "feat(planning): reject stale narration evidence"
```

## Part 2 Focused Gate

```bash
node --test \
  engine/__tests__/transcribe.test.ts \
  engine/__tests__/voice_assets.test.ts \
  engine/__tests__/narration_request.test.ts \
  engine/__tests__/narration_evidence.test.ts \
  test/cli/managed-file-transaction.test.ts \
  test/cli/plan-project.test.ts \
  test/cli/plan.test.ts \
  test/cli/workflows.test.ts \
  test/cli/run-exports.test.ts
corepack npm run typecheck
```

Expected: all pass; versioned requests are enforced transactionally and legacy projects remain unchanged.
