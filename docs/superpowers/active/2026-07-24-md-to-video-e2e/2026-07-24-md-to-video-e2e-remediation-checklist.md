# Markdown-to-Video E2E Remediation Checklist

## Purpose

Fix the two blockers found by the packed-artifact Markdown-to-MP4 E2E run, prove the fixes with focused tests and full release gates, then repeat the black-box E2E test without workarounds.

```text
B1: invalid word timings
  → transcribe/plan/verify validation
  → focused regression tests

B2: local GSAP asset paths
  → adapter/scaffold/docs alignment
  → installed-project regression test

Both fixes
  → full gates
  → repack PR artifact
  → isolated E2E rerun
  → PASS
  → merge and release
```

## Current failure record

- [ ] Source E2E report reviewed:
      `2026-07-24-md-to-video-e2e-check.md`
- [ ] PR under repair: `https://github.com/therealhieu/md2vid/pull/12`
- [ ] Branch: `fix/stabilize-cli-workflows`
- [ ] Original commit under test: `60fe838c4b00541a4a22354307c35e0b7a272f84`
- [ ] No package release is made before this remediation cycle passes.

Observed failures:

```text
resolution-path: duration_s=15.381, final word end=15.520
latency:         duration_s=17.451, final word start=17.890, end=18.220

Documented local GSAP path:
  frame HTML → ../../runtime/gsap.min.js
  generated captions → ../runtime/...
  HyperFrames lint → invalid_parent_traversal_in_asset_path
```

## 1. Establish a clean remediation baseline

- [ ] Confirm the current branch and working tree.
- [ ] Preserve the existing E2E evidence directory.
- [ ] Read the relevant implementation and tests before editing:
  - [ ] `scripts/transcribe.ts`
  - [ ] `engine/config.ts`
  - [ ] `engine/plan.ts`
  - [ ] `scripts/verify.ts`
  - [ ] `frameworks/hyperframes/emit.ts`
  - [ ] `frameworks/hyperframes/scaffold.ts`
  - [ ] `frameworks/hyperframes/verify.ts`
  - [ ] `skill/md2vid/SKILL.md`
  - [ ] `docs/standards/frameworks/hyperframes.md`
  - [ ] Relevant CLI, engine, framework, and release tests
- [ ] Record the starting commit SHA.
- [ ] Run the focused existing tests before editing.

Record:

```text
Starting commit:
Focused baseline command:
Focused baseline result:
```

## 2. Remediate B1 — word-timing bounds

### Contract

Every generated voice must satisfy:

```text
voices[] is non-empty
voice.id is non-empty and unique
voice.duration_s is finite and positive
word.text is non-empty
word.start and word.end are finite
0 ≤ word.start ≤ word.end ≤ voice.duration_s
word[n].start ≥ word[n-1].end
```

### Decide normalization behavior

Use one documented policy consistently:

- [ ] Minor end overruns from transcription are clamped to `duration_s`.
- [ ] A word whose start is after `duration_s` is moved to a valid final interval or causes a clear failure.
- [ ] Non-monotonic, negative, non-finite, or materially invalid timings fail with a path-aware error.
- [ ] The policy does not silently invent a new audio duration longer than the WAV file.
- [ ] The normalized result remains ordered and non-empty.

### Tests first

Add failing regression tests for:

- [ ] Final word ends after `duration_s`.
- [ ] Final word starts after `duration_s`.
- [ ] A middle word has `end > duration_s`.
- [ ] Word timings are non-monotonic.
- [ ] A word has a negative start.
- [ ] A word has `NaN` or `Infinity`.
- [ ] A voice has no words.
- [ ] Build and verify report the voice ID and word ID in failures.
- [ ] Valid clamped output passes the normal build/verify path.

Focused commands:

```bash
node --test <timing-focused-test-files>
```

Expected initial result:

```text
RED before implementation
```

### Implement

- [ ] Add one shared timing-normalization or validation function rather than duplicating rules.
- [ ] Apply it at the boundary where transcribed metadata is written.
- [ ] Apply defensive validation before planning/build mutation.
- [ ] Keep error exit behavior consistent:
  - CLI usage error → exit `2`
  - project/config/timing failure → exit `1`
- [ ] Ensure invalid metadata cannot produce `caption_groups.json`, `build_plan.json`, or framework output.
- [ ] Ensure the command does not partially mutate managed output on failure.

### Verify B1

- [ ] Focused timing tests pass.
- [ ] Existing engine/config/plan tests pass.
- [ ] A raw overrun fixture is either normalized correctly or rejected clearly.
- [ ] No manual editing of `audio_meta.json` is required.
- [ ] `md2vid build` no longer accepts invalid out-of-duration timings.
- [ ] `md2vid verify` reports malformed timing data with the relevant path and voice/word identity.

## 3. Remediate B2 — local GSAP asset paths

### Contract

A generated project using a local GSAP file must pass all of these:

```text
md2vid build .
md2vid regroup . --max-chars 54
md2vid verify .
md2vid hyperframes lint
md2vid hyperframes validate
md2vid hyperframes inspect
md2vid hyperframes preview
md2vid hyperframes render
```

The same local asset path must resolve correctly from:

```text
project root index.html
compositions/frames/*.html
compositions/captions.html
Studio preview
rendered browser context
```

### Choose and document one path strategy

- [ ] Use the HyperFrames-supported root-relative asset contract.
- [ ] Decide the canonical config value, for example:

```json
{
  "framework": "hyperframes",
  "gsapSrc": "assets/gsap/gsap.min.js"
}
```

- [ ] Ensure every generated consumer references the same project-root-resolvable path.
- [ ] Do not emit `../` or `../../` parent traversal from generated compositions if HyperFrames rejects it.
- [ ] Preserve CDN behavior as the default if that remains the supported default.
- [ ] Make local GSAP an explicit, documented opt-in.

### Tests first

Add failing tests for:

- [ ] Scaffolded local-GSAP configuration points to the canonical path.
- [ ] HyperFrames frame emission does not produce parent traversal.
- [ ] Caption emission does not produce parent traversal.
- [ ] Generated index and captions reference the same GSAP source.
- [ ] A packed tarball installed in a fresh project passes local-GSAP build/check.
- [ ] No generated file references a missing runtime path.

Focused commands:

```bash
node --test <hyperframes-focused-test-files>
node --test <release-or-workflow-focused-test-files>
```

Expected initial result:

```text
RED before implementation
```

### Implement

- [ ] Update the HyperFrames adapter/runtime path resolution.
- [ ] Update generated caption emission.
- [ ] Update scaffold configuration and any copied standards.
- [ ] Update `skill/md2vid/SKILL.md` and synchronized references.
- [ ] Update contract tests to validate complete generated paths, not only token presence.
- [ ] Keep write-if-missing behavior for authored runtime files.
- [ ] Ensure the change does not rewrite existing generated projects unexpectedly.

### Verify B2

- [ ] A fresh flat HyperFrames project with local GSAP passes `npm run build`.
- [ ] The same project passes `npm run check` with zero lint errors.
- [ ] Studio preview loads local GSAP without browser console errors.
- [ ] A local-GSAP render succeeds.
- [ ] The generated captions and frames animate correctly.
- [ ] No `invalid_parent_traversal_in_asset_path` finding remains.

## 4. Documentation synchronization

- [ ] Update authoritative HyperFrames documentation first.
- [ ] Update `/md2vid` orchestration instructions.
- [ ] Regenerate synchronized skill references.
- [ ] Remove contradictory relative-path examples.
- [ ] Document the timing normalization/rejection policy.
- [ ] Document that word timings must remain inside the WAV duration.
- [ ] Confirm no nonexistent `md2vid audio` command is introduced.

Commands:

```bash
corepack npm run sync:skill-references
corepack npm run check:skill-references
```

- [ ] Documentation tests pass.
- [ ] Generated references are byte-identical to authoritative sources.

## 5. Full repository verification

Run in this exact order:

```bash
corepack npm run typecheck
corepack npm run typecheck:remotion
corepack npm test
corepack npm run check:skill-references
corepack npm run public:snapshot:check
corepack npm run release:check
```

- [ ] Every command exits `0`.
- [ ] No test is skipped unexpectedly.
- [ ] Packed HyperFrames smoke passes.
- [ ] Packed Remotion smoke passes.
- [ ] `git diff --check main..HEAD` exits `0`.
- [ ] Any dependency audit or blocked-script warnings are recorded but do not hide functional failures.

Record:

```text
typecheck:
typecheck:remotion:
test count:
skill references:
public snapshot:
release check:
diff check:
```

## 6. Repack the fixed PR artifact

Use a clean temporary clone or clean checkout of the fixed commit.

```bash
artifact_dir="$(mktemp -d /tmp/md2vid-e2e-remediation-artifact.XXXXXX)"
corepack npm run release:pack -- --output "$artifact_dir"
```

- [ ] Packing exits `0`.
- [ ] `artifact.json` exists.
- [ ] Tarball is non-empty.
- [ ] Metadata commit matches the fixed commit.
- [ ] Tarball SHA-256 is recorded.
- [ ] No published package is used.

## 7. Install the fixed artifact in isolation

```bash
install_dir="$(mktemp -d /tmp/md2vid-e2e-remediation-install.XXXXXX)"
cd "$install_dir"
corepack npm init -y
corepack npm install "$artifact_dir/md2vid-0.1.2.tgz"
```

- [ ] `node_modules/.bin/md2vid` exists.
- [ ] The executable resolves to the isolated install.
- [ ] Installed skill files exist.
- [ ] `md2vid --help` exits `0`.
- [ ] Dependency warnings are recorded.

## 8. Repeat the black-box Markdown-to-MP4 E2E test

Use the original DNS fixture and a fresh project. Do not copy prebuilt output from the previous run.

### Narration

- [ ] Run media auth/status preflight.
- [ ] Select local Kokoro explicitly when unauthenticated.
- [ ] Generate WAV files through the supported media engine.
- [ ] Run the installed `md2vid transcribe` command when required.
- [ ] Confirm no word timing exceeds its WAV duration.
- [ ] Confirm no manual metadata edits are needed.

### Authoring

- [ ] Scaffold a flat HyperFrames project with the installed CLI.
- [ ] Write coverage map, storyboard, and script.
- [ ] Author five DNS frames.
- [ ] Use local GSAP only if the fixed local-GSAP contract is being tested.
- [ ] Keep captions clear of visual content.

### Build/check

```bash
corepack npm run build
corepack npm run check
```

- [ ] Both exit `0`.
- [ ] Zero HyperFrames lint errors.
- [ ] Zero validation console errors.
- [ ] Zero inspection layout errors.
- [ ] Generated captions exactly match neutral caption JSON.
- [ ] Meaningful IDs and `frameNum` order remain correct.

### Preview/review

- [ ] Start `npm run dev` in the background.
- [ ] Review midpoint snapshots for every frame.
- [ ] Review transition-boundary snapshots.
- [ ] Confirm no source sections are omitted.
- [ ] Confirm no unrelated content appears.
- [ ] Confirm captions do not overlap content.
- [ ] Confirm held landings and clean transitions.
- [ ] Record explicit approval for render.

### Render/inspect

```bash
corepack npm run render
ffprobe -v error \
  -show_entries format=duration,size \
  -show_entries stream=codec_type,codec_name,width,height \
  -of json <output.mp4>
```

- [ ] Render exits `0`.
- [ ] MP4 exists and is non-empty.
- [ ] Video is H.264 at 1920×1080.
- [ ] Audio is AAC.
- [ ] Duration is finite and close to the build plan.
- [ ] Extracted final-MP4 frames match the reviewed snapshots.
- [ ] Audio boundaries contain no gaps, overlaps, clipping, or truncation.

## 9. Cleanup and evidence

Before deleting temporary directories:

- [ ] Save the fixed tarball and `artifact.json`.
- [ ] Save Markdown input and SHA-256.
- [ ] Save MP4 and SHA-256.
- [ ] Save `ffprobe` JSON.
- [ ] Save midpoint and transition contact sheets.
- [ ] Save command logs and exit codes.
- [ ] Record any remaining workaround.
- [ ] Remove temporary clone, artifact, and install directories.
- [ ] Confirm all temporary directories are absent.
- [ ] Confirm the repository contains only intentional documentation/evidence changes.

## 10. Final decision

The remediation cycle passes only when all of these are true:

- [ ] Word timings are generated or rejected without manual metadata editing.
- [ ] Invalid timing fixtures fail or normalize according to the documented contract.
- [ ] Local GSAP paths pass generated build/check/preview/render.
- [ ] Full repository gates pass.
- [ ] The fixed PR tarball installs in isolation.
- [ ] A real Markdown source produces a reviewed MP4.
- [ ] Final MP4 passes codec, dimension, duration, audio, and content checks.
- [ ] No global CLI or repository-source dependency contaminates the run.
- [ ] Temporary resources are cleaned up.

Decision:

```text
Result: PASS | FAIL
Fixed commit:
Tarball:
Tarball SHA-256:
MP4:
MP4 SHA-256:
Blocking findings:
Non-blocking warnings:
Workarounds:
```

## 11. Release gate

If **FAIL**:

```text
Keep PR #12 open
  → fix remaining findings
  → rerun focused tests
  → rerun full gates
  → repack
  → repeat this checklist
```

If **PASS**:

```text
Commit and push the fixes
  → confirm PR CI is green
  → merge PR #12
  → bump package version to 0.1.3
  → rerun release:check on the version bump
  → publish
  → install the registry artifact in a fresh directory
  → run the shorter registry smoke
```

- [ ] Do not publish before this remediation checklist passes.
- [ ] Do not treat the previous manually corrected MP4 as release evidence.
