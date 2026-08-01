# Markdown-to-Video End-to-End Verification Checklist

## Purpose

Verify the real user journey from a Markdown document to a reviewed, narrated MP4 using the package built from PR #12. Do this before merging and releasing the next package version.

```text
Markdown source
  → /md2vid skill orchestration
  → storyboard + script
  → narration + word timings
  → framework visuals
  → npm run build
  → npm run check
  → preview and human review
  → render
  → MP4 validation
```

This is a black-box test. Do not use a globally installed `md2vid`, repository source imports, prebuilt project output, or hand-authored neutral build artifacts to bypass the installed package.

## Test record

- [ ] Date:
- [ ] Tester:
- [ ] Branch: `fix/stabilize-cli-workflows`
- [ ] PR: `https://github.com/therealhieu/md2vid/pull/12`
- [ ] Commit under test:
- [ ] Packed tarball path:
- [ ] Node version:
- [ ] npm version:
- [ ] Framework: HyperFrames
- [ ] Optional second pass: Remotion

## 1. Preconditions

- [ ] PR #12 GitHub Actions checks are green.
- [ ] The working tree is clean before packing.
- [ ] `git diff --check main..HEAD` exits `0`.
- [ ] Node satisfies the package requirement.
- [ ] Corepack resolves the repository-pinned npm version.
- [ ] FFmpeg and `ffprobe` are available.
- [ ] The test uses fresh temporary directories.
- [ ] No published release is required before this test.

Record:

```text
Commit:
Node:
npm:
ffmpeg:
ffprobe:
```

## 2. Prepare representative Markdown

Create a source document that exercises more than plain paragraphs.

Required content:

- [ ] One H1 title.
- [ ] At least three H2 sections.
- [ ] A numbered or bulleted process.
- [ ] A table containing numeric data.
- [ ] A code or text block.
- [ ] A flow or diagram that must be redrawn visually.
- [ ] Enough material for an intro, multiple explanation frames, and a recap.

Suggested fixture:

```markdown
# How DNS Resolution Works

## Overview
A browser resolves a domain before connecting to a server.

## Resolution Steps
1. Browser cache
2. Operating-system cache
3. Recursive resolver
4. Authoritative nameserver

## Typical Latency

| Stage | Latency |
|---|---:|
| Cache hit | <1 ms |
| Recursive lookup | 20–100 ms |

## Example

```text
example.com → resolver → authoritative server → 93.184.216.34
```
```

- [ ] Save the fixture outside the repository or in an invocation-owned temporary directory.
- [ ] Record its SHA-256 hash so the exact input is known.

## 3. Pack the PR checkout

From the repository root:

```bash
artifact_dir="$(mktemp -d /tmp/md2vid-e2e-artifact.XXXXXX)"
corepack npm run release:pack -- --output "$artifact_dir"
```

- [ ] Packing exits `0`.
- [ ] `artifact.json` exists.
- [ ] `md2vid-0.1.2.tgz` exists and is non-empty.
- [ ] Artifact metadata identifies the current PR commit.
- [ ] Record the tarball SHA-256 hash.

Notes:

- The filename still contains `0.1.2`; this test validates the current checkout, not the previously published package.
- Do not publish this tarball.

## 4. Install in isolation

```bash
install_dir="$(mktemp -d /tmp/md2vid-e2e-install.XXXXXX)"
cd "$install_dir"
corepack npm init -y
corepack npm install "$artifact_dir/md2vid-0.1.2.tgz"
```

- [ ] Installation exits `0`.
- [ ] `node_modules/.bin/md2vid` exists.
- [ ] `npm ls md2vid` resolves the local package.
- [ ] The executable does not resolve to a global `md2vid` binary.
- [ ] `./node_modules/.bin/md2vid --help` exits `0`.
- [ ] Installed skill files exist inside the package.
- [ ] Record dependency audit or `allowScripts` warnings without treating warnings alone as an E2E failure.

## 5. Run the `/md2vid` workflow

Use the installed `/md2vid` skill to transform the Markdown fixture. Start with a flat HyperFrames project.

- [ ] The skill reads the full Markdown source.
- [ ] A source-section → frame coverage map is created.
- [ ] Every heading, list, table, code block, and diagram is covered or explicitly proposed for omission.
- [ ] Proposed omissions receive approval before authoring continues.
- [ ] The project is scaffolded before files are written into it.
- [ ] The flat project stays under one project directory; it does not switch unexpectedly to `outputs/<slug>/` paths.

Expected flat project artifacts:

```text
<slug>/
├── STORYBOARD.md
├── SCRIPT.md
├── audio_request.json.example
├── audio_meta.json
├── assets/voice/*.wav
├── video.config.json
├── output.config.json
├── package.json
└── compositions/frames/*.html
```

- [ ] `STORYBOARD.md` includes an intro/agenda and recap.
- [ ] `SCRIPT.md` contains one narration block per frame.
- [ ] `video.config.json.slugs` maps every voice ID to one visual slug.
- [ ] Visual filenames match configured slugs.
- [ ] No nonexistent `md2vid audio` command is suggested or executed.

## 6. Generate narration

Use the supported HyperFrames media workflow rather than inventing an audio format.

- [ ] Run the media authentication/status preflight.
- [ ] Record whether the test uses authenticated TTS or an explicitly selected local/offline provider.
- [ ] For reproducibility, prefer local Kokoro unless provider-specific coverage is required.
- [ ] Generate one WAV file per narration line.
- [ ] Generate or transcribe word-level timings.

Validate `audio_meta.json`:

- [ ] `voices` is a non-empty array.
- [ ] Every `id` is a meaningful, non-empty, unique string.
- [ ] Frame order follows `voices[]` array order.
- [ ] Every `path` is project-relative and resolves to a real WAV file.
- [ ] Every `duration_s` is finite and positive.
- [ ] Every voice has a non-empty `words` array.
- [ ] Every word contains `text`, `start`, and `end`.
- [ ] Word timings are finite, ordered, and inside the voice duration.
- [ ] Every voice ID has an own-property slug mapping.

## 7. Author HyperFrames visuals

- [ ] Create one composition frame per configured slug.
- [ ] Redraw the process, table, and diagram using visual elements rather than pasted screenshots.
- [ ] Use deterministic, seek-safe motion.
- [ ] Keep one clear focal point per frame.
- [ ] Keep captions clear of visual content.
- [ ] Preserve the generated runtime and caption skin contracts.
- [ ] Do not hand-edit generated `index.html` or `compositions/captions.html`.

## 8. Build and verify

From the generated flat project:

```bash
cd "$install_dir/<slug>"
corepack npm run build
corepack npm run check
```

- [ ] `npm run build` exits `0`.
- [ ] Build runs both `md2vid build .` and `md2vid regroup . --max-chars 54`.
- [ ] `npm run check` exits `0`.
- [ ] Check starts with `md2vid verify .`.
- [ ] HyperFrames lint passes.
- [ ] HyperFrames validation passes.
- [ ] HyperFrames inspection passes.
- [ ] No command resolves to the repository checkout or a global executable.

Generated-output checks:

- [ ] `cues.json` exists.
- [ ] `caption_groups.json` exists.
- [ ] `build/build_plan.json` exists.
- [ ] `index.html` exists.
- [ ] `compositions/captions.html` exists.
- [ ] Baked caption groups match neutral caption JSON.
- [ ] Voice assets exist in the emitted framework output.
- [ ] Frame IDs remain meaningful strings.
- [ ] `frameNum` values are `1..N` in voice-array order.

## 9. Preview and human review

```bash
corepack npm run dev
```

Do not render until review is complete.

Content review:

- [ ] Every Markdown section appears in the video or has an approved omission.
- [ ] Intro states the agenda.
- [ ] Recap mirrors the agenda.
- [ ] The DNS/process sequence is technically correct.
- [ ] Numeric table values match the Markdown source.
- [ ] Code/text examples match the source.
- [ ] No unrelated hash-table subject matter appears.

Audio/visual review:

- [ ] Narration is audible and intelligible.
- [ ] Narration, captions, and visual focal point express the same beat.
- [ ] Captions match spoken words.
- [ ] Captions do not overlap or clip.
- [ ] Frames have held landings rather than ending during an active reveal.
- [ ] Transitions are deterministic and visually clean.
- [ ] No blank, black, unstyled, or partially mounted frame appears.
- [ ] No console/runtime errors appear.

Review decision:

- [ ] Approved for render.
- [ ] Changes requested and reapplied through authored source followed by build/check.

## 10. Render

After explicit review approval:

```bash
corepack npm run render
```

- [ ] Render exits `0`.
- [ ] The reported MP4 exists.
- [ ] The MP4 is non-empty and has a plausible file size.

Probe it:

```bash
ffprobe -v error \
  -show_entries format=duration,size \
  -show_entries stream=codec_type,codec_name,width,height \
  -of json <output.mp4>
```

Required result:

- [ ] Video stream exists.
- [ ] Video codec is H.264.
- [ ] Width is `1920`.
- [ ] Height is `1080`.
- [ ] Audio stream exists.
- [ ] Audio codec is AAC.
- [ ] Duration is finite, positive, and close to the planned duration.
- [ ] File size is plausible for the duration.

## 11. Rendered-output inspection

Extract representative frames from the final MP4, including the midpoint of every scene.

- [ ] Intro frame is correct.
- [ ] Each explanation frame is correct.
- [ ] Table frame is readable.
- [ ] Diagram frame is complete.
- [ ] Recap frame is correct.
- [ ] Captions at sampled timestamps match narration.
- [ ] Exact rendered frames—not only preview snapshots—show correct scene timing.
- [ ] Listen through scene boundaries for audio gaps, overlaps, clipping, or truncation.

## 12. Optional Remotion pass

Repeat the same source document using a fresh isolated Remotion scaffold.

```bash
./node_modules/.bin/md2vid new <slug>-remotion --framework remotion
cd <slug>-remotion
corepack npm install
# Generate narration and author/register scenes.
corepack npm run build
corepack npm run check
corepack npm run still
corepack npm run studio
# Render only after review approval.
corepack npm run render
```

- [ ] Default source is content-neutral.
- [ ] Scenes are explicitly registered by slug.
- [ ] `npm run check` includes md2vid verification and TypeScript validation.
- [ ] Still smoke succeeds.
- [ ] Studio review succeeds.
- [ ] Final MP4 passes the same `ffprobe` and content checks.

## 13. Isolation and cleanup

Before cleanup, copy only the required evidence into a durable, non-temporary location.

- [ ] Save command logs and exit codes.
- [ ] Save tarball and input hashes.
- [ ] Save `ffprobe` JSON.
- [ ] Save representative rendered frames/contact sheet.
- [ ] Record output MP4 path and hash.
- [ ] Record every workaround or confusing instruction.
- [ ] Remove the temporary install directory.
- [ ] Remove the temporary artifact directory.
- [ ] Confirm both temporary directories are absent.
- [ ] Confirm the repository working tree is unchanged by the black-box test.

## 14. Pass/fail decision

The E2E test passes only if all required conditions hold:

- [ ] The current PR checkout was packed and installed in isolation.
- [ ] A real Markdown document drove the workflow.
- [ ] The skill produced a complete coverage map, storyboard, and script.
- [ ] Real narration WAV files and word timings were generated.
- [ ] New framework visuals were authored from the source content.
- [ ] Generated `build` and `check` scripts passed.
- [ ] Human preview review passed.
- [ ] A final MP4 rendered successfully.
- [ ] The MP4 contains valid H.264 video and AAC audio at 1920×1080.
- [ ] Rendered content accurately covers the Markdown source.
- [ ] No global CLI or repository-source dependency contaminated the test.
- [ ] Temporary resources were cleaned up.

Decision:

```text
Result: PASS | FAIL
Blocking findings:
Non-blocking warnings:
Workarounds used:
Recommended fixes:
```

## 15. Release decision

If the E2E result is **FAIL**:

```text
Fix PR #12 → repack current checkout → repeat this checklist
```

If the E2E result is **PASS**:

```text
Merge PR #12
  → bump package version (expected patch: 0.1.3)
  → rerun release:check on the version-bump commit
  → publish
  → verify the registry artifact
```

- [ ] Do not release a new version merely to perform this E2E test.
- [ ] Do not publish until the packed-PR E2E test passes.
- [ ] After publishing, perform a shorter registry-installed smoke as release confirmation.
