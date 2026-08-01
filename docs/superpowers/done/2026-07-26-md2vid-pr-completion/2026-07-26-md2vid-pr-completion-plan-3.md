# Finish md2vid PR #12 — Plan Part 3: DNS Acceptance, Render, Evidence, and PR Synchronization

> **Dependency:** Start only after Part 2 verifies the retained tarball and establishes `INSTALL_ROOT`, `MD2VID_BIN`, `SAFE_PATH`, `VALIDATION_COMMIT`, `CANDIDATE_TREE`, `RUN_ID`, and `RUN_EVIDENCE`.
>
> **Approval boundaries:** Task 10 stops for explicit render approval. Task 12 stops separately for commit authorization, push/PR-mutation authorization, and merge authorization.

## Task 9: Run the fresh installed-artifact DNS workflow [Tester: no]

**Purpose:** Prove fresh Kokoro narration, installed transcription, build, and check work without prior generated outputs or manual metadata edits.

**Files:**
- Read reviewed authored sources from: `docs/superpowers/active/2026-07-24-md-to-video-e2e/evidence/final-e2e/final-candidate-project/preserved/project/`
- Create temporary project under: `$INSTALL_ROOT/dns-resolution/`
- Create ignored evidence under: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/$RUN_ID/05-dns/`
- Create ignored evidence under: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/$RUN_ID/06-build-check/`

- [ ] **Step 1: Create a fresh HyperFrames scaffold from the installed CLI**

Run:

```bash
export PROJECT="$INSTALL_ROOT/dns-resolution"
export REVIEWED_SOURCE="$REPO/docs/superpowers/active/2026-07-24-md-to-video-e2e/evidence/final-e2e/final-candidate-project/preserved/project"

mkdir -p \
  "$RUN_EVIDENCE/05-dns/source/frames" \
  "$RUN_EVIDENCE/05-dns/audio" \
  "$RUN_EVIDENCE/06-build-check"

MD2VID_OUTPUTS_ROOT="$INSTALL_ROOT" \
  env -u NODE_PATH PATH="$SAFE_PATH" \
  "$MD2VID_BIN" new dns-resolution --framework hyperframes

test -d "$PROJECT"
cd "$PROJECT"
env -u NODE_PATH PATH="$SAFE_PATH" corepack npm install
mkdir -p assets/gsap
cp node_modules/gsap/dist/gsap.min.js assets/gsap/gsap.min.js
```

Expected: the project is newly created under `INSTALL_ROOT`; no active-repository package is installed or imported.

- [ ] **Step 2: Copy only reviewed authored inputs**

Run:

```bash
cp "$REVIEWED_SOURCE/dns-resolution.md" "$PROJECT/dns-resolution.md"
cp "$REVIEWED_SOURCE/STORYBOARD.md" "$PROJECT/STORYBOARD.md"
cp "$REVIEWED_SOURCE/SCRIPT.md" "$PROJECT/SCRIPT.md"
cp "$REVIEWED_SOURCE/audio_request.json" "$PROJECT/audio_request.json"
cp "$REVIEWED_SOURCE/video.config.json" "$PROJECT/video.config.json"
cp "$REVIEWED_SOURCE/output.config.json" "$PROJECT/output.config.json"
cp "$REVIEWED_SOURCE"/compositions/frames/*.html \
  "$PROJECT/compositions/frames/"
```

Do not copy:

```text
audio_meta.json
assets/voice/*.wav
package.json
package-lock.json
node_modules/
generated index.html
build_plan.json
caption artifacts
snapshots
logs
MP4 files
```

- [ ] **Step 3: Preserve source provenance and hashes**

Run:

```bash
cp "$PROJECT/dns-resolution.md" "$RUN_EVIDENCE/05-dns/source/"
cp "$PROJECT/STORYBOARD.md" "$RUN_EVIDENCE/05-dns/source/"
cp "$PROJECT/SCRIPT.md" "$RUN_EVIDENCE/05-dns/source/"
cp "$PROJECT/audio_request.json" "$RUN_EVIDENCE/05-dns/source/"
cp "$PROJECT/video.config.json" "$RUN_EVIDENCE/05-dns/source/"
cp "$PROJECT/output.config.json" "$RUN_EVIDENCE/05-dns/source/"
cp "$PROJECT"/compositions/frames/*.html \
  "$RUN_EVIDENCE/05-dns/source/frames/"

(
  cd "$RUN_EVIDENCE/05-dns/source"
  shasum -a 256 \
    dns-resolution.md \
    STORYBOARD.md \
    SCRIPT.md \
    audio_request.json \
    video.config.json \
    output.config.json \
    frames/*.html
) > "$RUN_EVIDENCE/05-dns/source-hashes.txt"

cat > "$RUN_EVIDENCE/05-dns/provenance.md" <<EOF
# DNS Source Provenance

- Candidate tree: \`$CANDIDATE_TREE\`
- Installed tarball: \`$TARBALL\`
- Reviewed source root: \`$REVIEWED_SOURCE\`
- Fresh project: \`$PROJECT\`
- Copied content: Markdown, storyboard, script, audio request, configuration, and five authored frame HTML files only.
- Excluded content: prior WAVs, audio metadata, generated outputs, dependencies, snapshots, logs, and MP4s.
EOF
```

- [ ] **Step 4: Verify local GSAP configuration**

Run:

```bash
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const config = JSON.parse(readFileSync("output.config.json", "utf8"));
if (config.framework !== "hyperframes") {
  throw new Error(`expected hyperframes, got ${config.framework}`);
}
if (config.gsapSrc !== "assets/gsap/gsap.min.js") {
  throw new Error(`expected local GSAP path, got ${config.gsapSrc}`);
}
NODE

test -s assets/gsap/gsap.min.js
```

Expected: exit `0`; no CDN or parent-traversal path is configured.

- [ ] **Step 5: Record provider preflight and Kokoro decision**

Run:

```bash
env -u NODE_PATH PATH="$SAFE_PATH" \
  "$MD2VID_BIN" hyperframes auth status --json \
  > "$RUN_EVIDENCE/05-dns/auth-status.json"

cat > "$RUN_EVIDENCE/05-dns/provider-decision.txt" <<'EOF'
provider=kokoro
voice=am_michael
bgm=none
sfx=none
EOF
```

Expected: provider choice is explicit and local; no credential value is written to evidence.

- [ ] **Step 6: Generate fresh narration**

Run:

```bash
export MEDIA_DIR=/Users/hieunguyen/.claude/skills/hyperframes-media

set -o pipefail
node "$MEDIA_DIR/scripts/audio.mjs" \
  --request "$PROJECT/audio_request.json" \
  --hyperframes "$PROJECT" \
  --out "$PROJECT/audio_meta.json" \
  2>&1 | tee "$RUN_EVIDENCE/05-dns/audio/audio-generation.log"
```

Expected: five new WAV files are generated under `assets/voice/`; the request uses Kokoro and does not generate BGM or SFX.

- [ ] **Step 7: Preserve pre-transcription metadata and WAV identities**

Run:

```bash
cp "$PROJECT/audio_meta.json" \
  "$RUN_EVIDENCE/05-dns/audio/audio_meta.pre-transcribe.json"

(
  cd "$PROJECT"
  shasum -a 256 assets/voice/*.wav
) > "$RUN_EVIDENCE/05-dns/audio/wav-sha256.txt"

printf '%s\n' "$PROJECT"/assets/voice/*.wav \
  | sort \
  > "$RUN_EVIDENCE/05-dns/audio/wav-paths.txt"

test "$(wc -l < "$RUN_EVIDENCE/05-dns/audio/wav-paths.txt" | tr -d ' ')" -eq 5
```

Expected: exactly five fresh WAV paths are listed.

- [ ] **Step 8: Run installed transcription**

Run:

```bash
cd "$PROJECT"
set -o pipefail
env -u NODE_PATH PATH="$SAFE_PATH" \
  corepack npm run transcribe \
  2>&1 | tee "$RUN_EVIDENCE/05-dns/audio/transcribe.log"
```

Expected: exit `0`; all five lines are transcribed. Do not edit `audio_meta.json` after this command.

- [ ] **Step 9: Validate sample-accurate durations and word bounds with the installed package**

Run:

```bash
export MD2VID_PACKAGE_ROOT="$INSTALL_ROOT/node_modules/md2vid"

PROJECT="$PROJECT" \
MD2VID_PACKAGE_ROOT="$MD2VID_PACKAGE_ROOT" \
node --input-type=module <<'NODE' \
  > "$RUN_EVIDENCE/05-dns/audio/timing-validation.json"
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const project = process.env.PROJECT;
const packageRoot = process.env.MD2VID_PACKAGE_ROOT;
if (!project || !packageRoot) throw new Error("missing validation environment");

const { validateAudioMeta } = await import(
  pathToFileURL(join(packageRoot, "engine", "audio_meta.ts")).href
);
const { probeVoiceWav } = await import(
  pathToFileURL(join(packageRoot, "engine", "voice_assets.ts")).href
);

const metadataPath = join(project, "audio_meta.json");
const metadata = validateAudioMeta(
  JSON.parse(readFileSync(metadataPath, "utf8")),
  metadataPath,
);

const voices = metadata.voices.map((voice) => {
  const probe = probeVoiceWav(project, voice.path);
  if (voice.duration_s !== probe.duration_s) {
    throw new Error(
      `${voice.id}: metadata duration ${voice.duration_s} != WAV duration ${probe.duration_s}`,
    );
  }

  for (const [index, word] of voice.words.entries()) {
    if (
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.start < 0 ||
      word.start > word.end ||
      word.end > voice.duration_s
    ) {
      throw new Error(`${voice.id}: invalid word ${index}`);
    }
    if (index > 0 && word.start < voice.words[index - 1].end) {
      throw new Error(`${voice.id}: overlapping word ${index}`);
    }
  }

  return {
    id: voice.id,
    path: voice.path,
    metadataDuration: voice.duration_s,
    wavDuration: probe.duration_s,
    sampleFrames: probe.sampleFrames,
    sampleRate: probe.sampleRate,
    words: voice.words.length,
  };
});

console.log(JSON.stringify({ result: "PASS", voices }, null, 2));
NODE

cp "$PROJECT/audio_meta.json" \
  "$RUN_EVIDENCE/05-dns/audio/audio_meta.json"
```

Expected: JSON result is `PASS`; metadata durations equal safely floored RIFF sample extents and all words satisfy the required bounds without manual correction.

- [ ] **Step 10: Run build and check through the isolated installation**

Run:

```bash
cd "$PROJECT"

set -o pipefail
env -u NODE_PATH PATH="$SAFE_PATH" \
  corepack npm run build \
  2>&1 | tee "$RUN_EVIDENCE/06-build-check/build.log"

set -o pipefail
env -u NODE_PATH PATH="$SAFE_PATH" \
  corepack npm run check \
  2>&1 | tee "$RUN_EVIDENCE/06-build-check/check.log"
```

Expected: both commands exit `0`; md2vid verification passes, HyperFrames lint has zero errors, validation has zero console errors, and inspect has zero layout errors.

- [ ] **Step 11: Preserve generated plans and caption metadata**

Run:

```bash
cp "$PROJECT/build_plan.json" \
  "$RUN_EVIDENCE/06-build-check/build_plan.json"
cp "$PROJECT/caption_groups.json" \
  "$RUN_EVIDENCE/06-build-check/caption_groups.json"
```

If generated locations differ in the scaffold, use the paths printed by build/check and record those exact paths in `generated-paths.txt`; do not search or copy from the active repository.

- [ ] **Step 12: Prove narration digest integrity**

Run:

```bash
(
  cd "$PROJECT"
  shasum -a 256 assets/voice/*.wav
) > "$RUN_EVIDENCE/06-build-check/source-voice-sha256.txt"

find "$PROJECT" -type f -path '*/assets/voice/*.wav' -print \
  | sort \
  > "$RUN_EVIDENCE/06-build-check/all-emitted-voice-paths.txt"
```

Compare every staged/emitted WAV digest with the corresponding source digest. Save the comparison as `narration-digests.json` with `result: "PASS"`. A mismatch is a hard failure.

- [ ] **Step 13: Prove local GSAP and package isolation**

Run:

```bash
rg -n 'https?://|\.\./.*gsap|data-composition-src' \
  "$PROJECT/index.html" \
  > "$RUN_EVIDENCE/06-build-check/generated-reference-scan.txt" || true

PATH="$SAFE_PATH" command -v md2vid \
  > "$RUN_EVIDENCE/06-build-check/cli-resolution.txt"
PATH="$SAFE_PATH" realpath "$(PATH="$SAFE_PATH" command -v md2vid)" \
  >> "$RUN_EVIDENCE/06-build-check/cli-resolution.txt"

rg -n '/Users/hieunguyen/git/hieu/projects/md2vid-public|node_modules/md2vid.*md2vid-public' \
  "$PROJECT" \
  > "$RUN_EVIDENCE/06-build-check/contamination-scan.txt" || true
```

Expected:

- composed output references `assets/gsap/gsap.min.js` and no remote GSAP URL;
- no `../` GSAP workaround;
- embedded mounts do not retain duplicate external `data-composition-src` sources;
- CLI resolves under `INSTALL_ROOT`;
- contamination scan is empty.

- [ ] **Step 14: Enforce the pre-preview stop condition**

Stop before Task 10 if narration required an edit, any timing/digest check failed, build/check failed, local GSAP was not used, or repository/global contamination was detected.

## Task 10: Prove browser behavior and obtain render approval [Tester: no] `[S after Task 9]`

**Purpose:** Validate the composed runtime at derived DNS times and obtain explicit approval before spending time on the final render.

**Files:**
- Create ignored evidence under: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/$RUN_ID/07-browser/`

- [ ] **Step 1: Derive midpoint and transition timestamps from the generated plan**

Run:

```bash
mkdir -p "$RUN_EVIDENCE/07-browser/snapshots"

BUILD_PLAN="$PROJECT/build_plan.json" \
node --input-type=module <<'NODE' \
  > "$RUN_EVIDENCE/07-browser/derived-times.json"
import { readFileSync } from "node:fs";

const planPath = process.env.BUILD_PLAN;
if (!planPath) throw new Error("missing BUILD_PLAN");
const plan = JSON.parse(readFileSync(planPath, "utf8"));

const frames = plan.frames.map((frame) => ({
  id: frame.id,
  start: frame.start,
  duration: frame.frameDur,
  midpoint: frame.start + frame.frameDur / 2,
  beforeEnd: Math.max(frame.start, frame.start + frame.frameDur - 0.05),
  afterStart: frame.start + Math.min(0.05, frame.frameDur / 2),
}));

const times = [...new Set(frames.flatMap((frame) => [
  frame.afterStart,
  frame.midpoint,
  frame.beforeEnd,
]))].sort((a, b) => a - b);

console.log(JSON.stringify({ frames, times }, null, 2));
NODE
```

Expected: every frame has early, midpoint, and late samples derived from its actual host start and duration.

- [ ] **Step 2: Capture package-owned snapshots**

Convert `derived-times.json.times` to the comma-separated value expected by the installed HyperFrames snapshot command, then run:

```bash
env -u NODE_PATH PATH="$SAFE_PATH" \
  "$MD2VID_BIN" hyperframes snapshot --at "$DERIVED_TIMES"
```

Copy the produced snapshots to `$RUN_EVIDENCE/07-browser/snapshots/` and record the original output paths in `snapshot-paths.txt`.

Expected: no blank, black, tiny, unstyled, stale, clipped, or partially mounted snapshot.

- [ ] **Step 3: Start the preview as a tracked background process**

Run from `PROJECT`:

```bash
cd "$PROJECT"

env -u NODE_PATH PATH="$SAFE_PATH" \
  corepack npm run dev \
  > "$RUN_EVIDENCE/07-browser/preview.log" 2>&1 &
export PREVIEW_PID=$!
printf '%s\n' "$PREVIEW_PID" \
  > "$RUN_EVIDENCE/07-browser/preview.pid"
```

Wait only until the log reports the preview URL. Record the URL in `preview-url.txt`. If the process exits early, preserve the log and stop.

- [ ] **Step 4: Run browser runtime assertions**

Using Playwright against the recorded preview URL, save machine-readable results for:

```text
console errors = 0
page errors = 0
unexpected failed requests = 0
remote GSAP requests = 0
main timelines = 1
caption timelines = 1
scoped frame controllers = frame count
normalized duplicate timeline IDs = 0
__hf2 mounts = 0
mounted roots per host = 1
root geometry = 1920×1080 host fill
player/main/caption time agreement = true
local time = clamp(global - hostStart, 0, frameDuration)
standalone/composed parity = true
late → early → late restoration = true
caption group/active word agreement = true
```

Derive global sample times from each DNS host’s actual `data-start`. Do not hardcode the fixture-only `3.6`, `5.9`, and `6.4` samples here; those were already proven by `release:verify-artifact` in Task 8.

Write:

```text
$RUN_EVIDENCE/07-browser/console.json
$RUN_EVIDENCE/07-browser/page-errors.json
$RUN_EVIDENCE/07-browser/network.json
$RUN_EVIDENCE/07-browser/runtime-identities.json
$RUN_EVIDENCE/07-browser/seek-assertions.json
$RUN_EVIDENCE/07-browser/standalone-composed-parity.json
```

Expected: each result records `PASS` and the exact sampled values.

- [ ] **Step 5: Create midpoint and transition contact sheets**

Use the captured snapshots to create:

```text
$RUN_EVIDENCE/07-browser/midpoint-contact-sheet.png
$RUN_EVIDENCE/07-browser/transition-contact-sheet.png
```

Review every source section, caption band, transition, and final visual state. Record the decision in `visual-review.md` with explicit `approved` or `rejected` plus any warnings.

- [ ] **Step 6: Stop for explicit render approval**

Present:

- candidate and artifact identity;
- build/check result;
- browser assertion summary;
- midpoint contact sheet;
- transition contact sheet;
- warnings;
- explicit statement that render has not run.

Use `AskUserQuestion` with:

```text
Render approved (Recommended only if the preview is correct)
Reject and fix
Stop without rendering
```

Do not continue without the user selecting render approval. Approval to write the design or plan is not render approval.

## Task 11: Render, inspect media, preserve evidence, clean up, and record PASS/FAIL [Tester: no] `[S after Task 10 approval]`

**Purpose:** Produce the final MP4, verify its streams/content/audio, preserve reproducible evidence, remove temporary resources, and write the authoritative completion record.

**Files:**
- Create ignored evidence under: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/$RUN_ID/08-render/`
- Create ignored evidence under: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/$RUN_ID/09-media-inspection/`
- Create ignored evidence under: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/$RUN_ID/10-cleanup/`
- Create after execution: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-check.md`
- Modify after execution: `docs/superpowers/active/2026-07-24-md-to-video-e2e/2026-07-24-md-to-video-e2e-checkpoint.md`

- [ ] **Step 1: Preserve the explicit render approval**

Create `render-approval.md` with the approval timestamp, selected option, preview URL, candidate tree, validation commit, and contact-sheet paths. Do not claim approval from any system/background notification.

- [ ] **Step 2: Render through the isolated project**

Run:

```bash
mkdir -p \
  "$RUN_EVIDENCE/08-render" \
  "$RUN_EVIDENCE/09-media-inspection/midpoint-frames" \
  "$RUN_EVIDENCE/09-media-inspection/transition-frames" \
  "$RUN_EVIDENCE/10-cleanup"

cd "$PROJECT"
set -o pipefail
env -u NODE_PATH PATH="$SAFE_PATH" \
  corepack npm run render \
  2>&1 | tee "$RUN_EVIDENCE/08-render/render.log"
```

Expected: exit `0`; capture the exact MP4 path printed by HyperFrames as `OUTPUT_MP4`.

- [ ] **Step 3: Preserve and hash the MP4**

Run:

```bash
test -s "$OUTPUT_MP4"
cp "$OUTPUT_MP4" "$RUN_EVIDENCE/08-render/dns-resolution-pr12.mp4"
shasum -a 256 "$OUTPUT_MP4" \
  | tee "$RUN_EVIDENCE/08-render/mp4.sha256"
```

Expected: non-empty source and evidence copies with matching SHA-256.

- [ ] **Step 4: Probe streams, dimensions, size, and duration**

Run:

```bash
ffprobe -v error \
  -show_entries format=duration,size \
  -show_entries stream=codec_type,codec_name,width,height \
  -of json "$OUTPUT_MP4" \
  > "$RUN_EVIDENCE/09-media-inspection/ffprobe.json"
```

Validate and save `duration-comparison.json` requiring:

```text
one H.264 video stream
video dimensions 1920×1080
one AAC audio stream
finite positive duration
non-zero size
rendered duration within documented tolerance of build_plan.json.totalDuration
```

- [ ] **Step 5: Extract midpoint and transition frames from the MP4**

For each derived midpoint and transition-side time, run:

```bash
ffmpeg -v error \
  -ss "$TIME" \
  -i "$OUTPUT_MP4" \
  -frames:v 1 \
  "$FRAME_OUTPUT"
```

Store outputs in the matching `midpoint-frames/` or `transition-frames/` directory. Build separate contact sheets and save:

```text
$RUN_EVIDENCE/09-media-inspection/midpoint-contact-sheet.png
$RUN_EVIDENCE/09-media-inspection/transition-contact-sheet.png
```

- [ ] **Step 6: Inspect rendered visual content**

Review MP4-derived frames for:

```text
intro and agenda
all source sections
DNS sequence and numeric values
redrawn process/table/route visuals
captions and active-word states
all transitions
final visual frame
no blank/black/unstyled/tiny/clipped/stale/duplicated/out-of-order output
```

Write `visual-inspection.md` with an explicit `PASS` or `FAIL` and referenced frame filenames.

- [ ] **Step 7: Extract and inspect audio**

Run:

```bash
ffmpeg -v error \
  -i "$OUTPUT_MP4" \
  -vn -acodec pcm_s16le \
  "$RUN_EVIDENCE/09-media-inspection/extracted-audio.wav"

ffmpeg -v error \
  -sseof -3 \
  -i "$OUTPUT_MP4" \
  -vn \
  "$RUN_EVIDENCE/09-media-inspection/audio-tail.wav"

ffmpeg -i "$OUTPUT_MP4" \
  -af silencedetect=noise=-40dB:d=0.5 \
  -f null - \
  2> "$RUN_EVIDENCE/09-media-inspection/silence-detect.log"

ffmpeg -i "$OUTPUT_MP4" \
  -af volumedetect \
  -f null - \
  2> "$RUN_EVIDENCE/09-media-inspection/volume-detect.log"
```

Listen at each narration boundary and the final tail. Write `audio-inspection.md`; reject clipping, truncation, unintended overlap, unexplained long silence, missing final audio, or caption/voice/visual desynchronization.

- [ ] **Step 8: Create the evidence manifest and checksums**

Run:

```bash
RUN_EVIDENCE="$RUN_EVIDENCE" python3 - <<'PY'
from hashlib import sha256
from pathlib import Path
import json
import os

root = Path(os.environ["RUN_EVIDENCE"])
manifest_path = root / "manifest.json"
checksums_path = root / "SHA256SUMS"
excluded = {manifest_path, checksums_path}

entries = []
for path in sorted(p for p in root.rglob("*") if p.is_file() and p not in excluded):
    digest = sha256(path.read_bytes()).hexdigest()
    entries.append({
        "path": path.relative_to(root).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": digest,
    })

manifest_path.write_text(json.dumps({"files": entries}, indent=2) + "\n")
manifest_digest = sha256(manifest_path.read_bytes()).hexdigest()
lines = [f"{entry['sha256']}  {entry['path']}" for entry in entries]
lines.append(f"{manifest_digest}  manifest.json")
checksums_path.write_text("\n".join(lines) + "\n")
PY
```

Expected: every preserved evidence file except `SHA256SUMS` is hashed; `manifest.json` itself is included in `SHA256SUMS`.

- [ ] **Step 9: Scan evidence for credentials**

Run:

```bash
grep -R -n -E \
  'BEGIN .*PRIVATE KEY|Authorization:[[:space:]]*(Bearer|Basic)|[_-]?authToken[[:space:]]*=|NPM_TOKEN[[:space:]]*=|HEYGEN_API_KEY[[:space:]]*=|HYPERFRAMES_API_KEY[[:space:]]*=' \
  "$RUN_EVIDENCE" \
  > "$RUN_EVIDENCE/credential-scan.log" || true

test ! -s "$RUN_EVIDENCE/credential-scan.log"
```

Expected: no secret value. If a value is found, remove it from evidence, rotate it if exposed, regenerate hashes, and record `FAIL` until resolved.

- [ ] **Step 10: Stop preview and verify processes exit**

Run:

```bash
ps -p "$PREVIEW_PID" -o pid=,command= \
  > "$RUN_EVIDENCE/10-cleanup/processes-before.txt" || true
kill "$PREVIEW_PID" 2>/dev/null || true
wait "$PREVIEW_PID" 2>/dev/null || true
ps -p "$PREVIEW_PID" -o pid=,command= \
  > "$RUN_EVIDENCE/10-cleanup/processes-after.txt" || true
```

Expected: `processes-after.txt` is empty.

- [ ] **Step 11: Remove temporary validation and project resources after evidence preservation**

Run from the active repository:

```bash
cd "$REPO"

git worktree remove --force "$VALIDATION_CHECKOUT"
git worktree prune
rm -rf "$VALIDATION_ROOT" "$INSTALL_ROOT" "$SNAPSHOT_ROOT"

for path in "$VALIDATION_ROOT" "$INSTALL_ROOT" "$SNAPSHOT_ROOT"; do
  if test -e "$path"; then
    printf 'remaining: %s\n' "$path"
    exit 1
  fi
done

git worktree list \
  > "$RUN_EVIDENCE/10-cleanup/worktree-list-after.txt"
git status --short \
  > "$RUN_EVIDENCE/10-cleanup/active-status-after.txt"
```

Expected: temporary paths are absent; evidence remains present and ignored; no preview/browser/renderer process remains.

- [ ] **Step 12: Write the post-implementation check**

Create:

```text
docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-check.md
```

Use concrete values and include:

```text
active HEAD
candidate tree
validation commit/tree
tarball SHA-256/SRI
npm/Node/HyperFrames versions
three review dispositions
complete matrix and exact test count
isolated executable realpath
Kokoro/transcription result
build/check/browser result
render approval evidence
MP4 path/size/SHA-256
ffprobe and visual/audio results
warnings/deviations
cleanup result
explicit PASS or FAIL
```

Do not use placeholders or rewrite the historical workaround-backed 2026-07-24 check as a pass.

- [ ] **Step 13: Update the old checkpoint for continuity**

Update `2026-07-24-md-to-video-e2e-checkpoint.md` with actual final state:

```text
Task #115 → complete only if three reviews passed
Task #104 → complete only if preview approval passed
Task #105 → complete only if render/media inspection passed
Task #106 → complete only if evidence/cleanup passed
Task #60  → complete only if the full packed E2E passed
```

Replace stale candidate/artifact identity and link the new check/evidence. Preserve the old FAIL check as historical evidence.

- [ ] **Step 14: Prove post-artifact changes are documentation-only**

Run:

```bash
git status --short
git diff --name-only "$VALIDATION_COMMIT" \
  > "$RUN_EVIDENCE/10-cleanup/post-artifact-delta.txt"
git diff --check

unexpected="$({
  git diff --name-only "$VALIDATION_COMMIT"
} | grep -v '^docs/superpowers/' || true)"
test -z "$unexpected"
```

Expected: only completion/checkpoint documentation differs from the validated tree after the artifact run. A package-included path change makes the artifact stale and requires a full rerun.

- [ ] **Step 15: Regenerate the final evidence manifest after cleanup and documentation records**

Rerun the credential scan after all evidence-writing steps, then regenerate `manifest.json` and `SHA256SUMS` so they include the final scan, cleanup logs, post-artifact delta, and all other evidence:

```bash
grep -R -n -E \
  --exclude='final-credential-scan.log' \
  'BEGIN .*PRIVATE KEY|Authorization:[[:space:]]*(Bearer|Basic)|[_-]?authToken[[:space:]]*=|NPM_TOKEN[[:space:]]*=|HEYGEN_API_KEY[[:space:]]*=|HYPERFRAMES_API_KEY[[:space:]]*=' \
  "$RUN_EVIDENCE" \
  > "$RUN_EVIDENCE/final-credential-scan.log" || true

test ! -s "$RUN_EVIDENCE/final-credential-scan.log"

RUN_EVIDENCE="$RUN_EVIDENCE" python3 - <<'PY'
from hashlib import sha256
from pathlib import Path
import json
import os

root = Path(os.environ["RUN_EVIDENCE"])
manifest_path = root / "manifest.json"
checksums_path = root / "SHA256SUMS"
excluded = {manifest_path, checksums_path}

entries = []
for path in sorted(p for p in root.rglob("*") if p.is_file() and p not in excluded):
    digest = sha256(path.read_bytes()).hexdigest()
    entries.append({
        "path": path.relative_to(root).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": digest,
    })

manifest_path.write_text(json.dumps({"files": entries}, indent=2) + "\n")
manifest_digest = sha256(manifest_path.read_bytes()).hexdigest()
lines = [f"{entry['sha256']}  {entry['path']}" for entry in entries]
lines.append(f"{manifest_digest}  manifest.json")
checksums_path.write_text("\n".join(lines) + "\n")
PY
```

Expected: the final manifest includes every evidence file except `manifest.json` and `SHA256SUMS`; `SHA256SUMS` includes the completed manifest hash.

- [ ] **Step 16: Record the local final decision**

Record `PASS` only if every required gate passed without workaround. Otherwise record `FAIL`, preserve evidence, and stop before Task 12 authorization requests.

## Task 12: Commit, push, synchronize PR #12, and stop ready-to-merge [Tester: no] `[S after Task 11 PASS]`

**Purpose:** Publish only the accepted candidate, resolve current review threads with evidence, and obtain current remote checks without implicitly merging or releasing.

**Files:**
- Commit only after explicit authorization: production, test, runbook, design, plan, goal, check, and checkpoint files from this work
- Modify external PR #12 only after separate push/PR authorization

- [ ] **Step 1: Present the local PASS package and request commit authorization**

Present:

```text
candidate tree
validation commit/tree
tarball hash
MP4 hash
evidence path
warnings
active git status
proposed commit grouping
```

Use `AskUserQuestion`:

```text
Commit accepted candidate
Do not commit
Request changes
```

Do not commit without explicit selection. Render approval and local PASS are not commit authorization.

- [ ] **Step 2: Create the code/test/runbook commit after authorization**

Stage explicit paths only:

```bash
git add \
  engine/config.ts \
  engine/plan.ts \
  engine/__tests__/config.test.ts \
  engine/__tests__/plan.test.ts \
  scripts/build.ts \
  test/cli/workflows.test.ts \
  test/cli/run-exports.test.ts \
  frameworks/remotion/verify.ts \
  frameworks/remotion/__tests__/verify.test.ts \
  test/cli/package-meta.test.ts \
  docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-plan-1.md \
  docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-plan-2.md \
  docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-plan-3.md \
  docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-plan-4.md \
  docs/superpowers/active/2026-07-24-md-to-video-e2e/2026-07-24-md-to-video-e2e-final-gate-checklist.md

git diff --cached --check
git commit -m "fix: close md2vid PR validation findings"
```

Expected: commit succeeds and contains no completion result files.

- [ ] **Step 3: Create the completion-record commit after authorization**

Stage explicit completion paths:

```bash
git add \
  docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-design.md \
  docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-plan.md \
  docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-plan-1.md \
  docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-plan-2.md \
  docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-plan-3.md \
  docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-goal.md \
  docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-check.md \
  docs/superpowers/active/2026-07-24-md-to-video-e2e/2026-07-24-md-to-video-e2e-checkpoint.md

git diff --cached --check
git commit -m "docs: record md2vid PR completion"
```

Expected: evidence remains ignored and unstaged.

- [ ] **Step 4: Verify the committed local branch**

Run:

```bash
git status --short
git log --oneline --decorate -5
git diff --check main...HEAD
```

Expected: no unexpected tracked/untracked source files; committed-range whitespace passes.

- [ ] **Step 5: Request separate push and PR-mutation authorization**

Use `AskUserQuestion`:

```text
Push and synchronize PR #12
Keep commits local
Request changes
```

Do not infer push authorization from commit authorization.

- [ ] **Step 6: Push only after authorization**

Run:

```bash
git push origin HEAD:fix/stabilize-cli-workflows

gh pr view 12 --repo therealhieu/md2vid \
  --json headRefOid,mergeable,state,statusCheckRollup,url
```

Expected: remote head equals local `HEAD`.

- [ ] **Step 7: Update the PR description with accepted evidence**

Create a body file containing actual:

```text
summary
exact test count
full repository matrix
validation commit/tree
tarball hash
DNS Kokoro/transcription result
browser/render/media result
MP4 hash
warnings
completion-check path
```

Review the body before publishing, then run:

```bash
gh pr edit 12 --repo therealhieu/md2vid --body-file "$PR_BODY_FILE"
```

- [ ] **Step 8: Re-query and reply to every original review thread**

Run the GraphQL thread query from the design/final-gate plan. Reconfirm the IDs before mutating them; the starting inventory is:

| Topic | Thread ID | Root comment ID |
|---|---|---:|
| Remotion workflow command | `PRRT_kwDOThRpkM6Tcv54` | `3642984707` |
| Plan headings | `PRRT_kwDOThRpkM6Tcv56` | `3642984709` |
| Managed-file cleanup | `PRRT_kwDOThRpkM6Tcv59` | `3642984712` |
| Remotion direct verify fallback | `PRRT_kwDOThRpkM6Tcv5-` | `3642984713` |
| Build directory validation | `PRRT_kwDOThRpkM6Tcv6C` | `3642984717` |

For each thread, set `ROOT_COMMENT_ID` and a reviewed `REPLY_BODY` containing the pushed commit SHA, exact fix or verified prior fix, focused test command/result, and completion-check path. Then reply in the original thread:

```bash
gh api -X POST \
  "repos/therealhieu/md2vid/pulls/12/comments/$ROOT_COMMENT_ID/replies" \
  -f body="$REPLY_BODY"
```

Resolve only after confirming the pushed head contains the fix. Set `THREAD_ID` to the reconfirmed thread ID, then run:

```bash
gh api graphql \
  -f query='mutation($id:ID!){
    resolveReviewThread(input:{threadId:$id}) {
      thread { id isResolved }
    }
  }' \
  -f id="$THREAD_ID"
```

- [ ] **Step 9: Request a current-head CodeRabbit review and wait for CI**

Run:

```bash
gh pr comment 12 --repo therealhieu/md2vid --body '@coderabbitai review'
gh pr checks 12 --repo therealhieu/md2vid --watch --interval 10

gh pr view 12 --repo therealhieu/md2vid \
  --json headRefOid,mergeable,reviewDecision,statusCheckRollup,state,url
```

Expected: required checks pass on the pushed head; the branch is mergeable.

- [ ] **Step 10: Re-query unresolved threads and enforce the remote stop rule**

Require zero unresolved blocking thread. A new source-code blocker requires a focused failing test and a restart from Task 6 through artifact, DNS E2E, and render approval. A PR-description-only correction does not require rerendering.

- [ ] **Step 11: Stop and report ready-to-merge**

Report:

```text
local PASS
remote head identity
required CI status
review-thread status
mergeability
completion check/evidence paths
```

Do not merge, version-bump, tag, or publish. Each requires separate explicit authorization.
