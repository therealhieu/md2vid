# Markdown-to-Video Final E2E Gate Checklist

## Purpose

Complete the only unfinished remediation task: prove that the current source changes can be packed, installed, and used as a black-box CLI to produce a valid Markdown-to-MP4 video without manual metadata edits, CDN fallbacks, or repository-source contamination.

```text
Exact repository gates
  → clean temporary validation commit
  → packed tarball
  → isolated installation
  → fresh DNS Markdown-to-video project
  → build/check/preview/render
  → media and content inspection
  → evidence preservation and cleanup
  → PASS or FAIL
```

## Release constraint

- [ ] Do not commit or push the active working tree before this checklist passes and the user explicitly requests it.
- [ ] Do not merge PR #12, bump the package version, or publish before this checklist passes.
- [ ] Do not use the earlier manually corrected MP4 as release evidence.
- [ ] Do not manually edit `audio_meta.json`.
- [ ] Do not use a CDN GSAP fallback when validating the local-GSAP contract.
- [ ] Do not use a globally installed CLI or repository source from the isolated test project.
- [ ] Use the project-pinned npm `11.15.0` for release and public-snapshot gates.
- [ ] Preserve all evidence under the ignored `evidence/` directory before removing temporary resources.

## 1. Record the starting state

- [ ] Confirm the active branch is `fix/stabilize-cli-workflows`.
- [ ] Record the active checkout HEAD.
- [ ] Record `git status --short`.
- [ ] Confirm the remediation changes are still uncommitted.
- [ ] Confirm the evidence directory remains ignored and preserved.
- [ ] Confirm no unexpected background E2E, preview, render, or temporary server process remains active.
- [ ] Record why the previous final E2E attempt is not accepted: it stopped without a completion record.

Record:

```text
Branch:
Active checkout HEAD:
Working-tree status log:
Previous attempt disposition:
Unexpected running processes:
```

## 2. Run the exact repository gate matrix

Run in this exact order from the active repository:

```bash
corepack npm --version
corepack npm run typecheck
corepack npm run typecheck:remotion
corepack npm test
corepack npm run check:skill-references
corepack npm run public:snapshot:check
corepack npm run release:check
git diff --check main...HEAD
git diff --check
```

- [ ] `corepack npm --version` exits `0` and reports exactly `11.15.0`.
- [ ] `typecheck` exits `0`.
- [ ] `typecheck:remotion` exits `0`.
- [ ] Full tests exit `0`.
- [ ] Record the exact test count.
- [ ] Record the exact unexpected skip count and require `0`.
- [ ] Skill-reference verification exits `0`.
- [ ] Public-snapshot verification exits `0`.
- [ ] Release verification exits `0`.
- [ ] Packed HyperFrames smoke passes.
- [ ] Packed Remotion smoke passes.
- [ ] Real-GSAP browser smoke passes.
- [ ] `git diff --check main...HEAD` exits `0`.
- [ ] `git diff --check` exits `0`.
- [ ] Record warnings separately from failures.

Record:

```text
npm version: 11.15.0
typecheck:
typecheck:remotion:
test count:
unexpected skips: 0
skill references:
public snapshot:
release check:
committed diff check:
working-tree diff check:
warnings:
```

Failure rule:

```text
Any non-zero gate
  → stop
  → preserve the failing log
  → record FAIL
  → do not pack or render
```

## 3. Create a clean temporary validation commit

The active branch must remain uncommitted. Create the validation commit only in an isolated temporary clone or checkout.

- [ ] Create a temporary validation directory.
- [ ] Copy or otherwise reproduce the exact active working-tree source state there.
- [ ] Exclude ignored evidence, dependencies, build products, credentials, and unrelated temporary files.
- [ ] Confirm the temporary checkout diff matches the intentional active remediation diff.
- [ ] Create a temporary local validation commit.
- [ ] Record its full commit SHA and full validation tree SHA.
- [ ] Confirm the validation commit tree exactly matches the reviewed active candidate tree.
- [ ] Confirm the temporary validation checkout is clean after committing.
- [ ] Confirm the active branch and working tree were not committed or changed by this step.

Record:

```text
Temporary validation directory:
Validation commit SHA:
Validation tree SHA:
Reviewed candidate tree SHA:
Validation checkout status:
Active checkout status after snapshot:
```

## 4. Pack the validation commit

From the clean temporary validation checkout:

```bash
artifact_dir="$(mktemp -d /tmp/md2vid-e2e-final-artifact.XXXXXX)"
corepack npm run release:pack -- --output "$artifact_dir"
```

- [ ] Packing exits `0`.
- [ ] `artifact.json` exists and records the complete artifact identity.
- [ ] The tarball exists and is non-empty.
- [ ] `artifact.json.packageName` is exactly `md2vid`.
- [ ] `artifact.json.version` is exactly `0.1.2` and `artifact.json.tag` is exactly `v0.1.2`.
- [ ] `artifact.json.commit` equals the temporary validation commit SHA, whose tree equals the recorded validation tree SHA.
- [ ] `artifact.json.nodeVersion` records the validation runtime and `artifact.json.npmVersion` is exactly `11.15.0`.
- [ ] `artifact.json.tarball` equals the retained tarball filename.
- [ ] `artifact.json.sha256` equals the retained tarball SHA-256.
- [ ] `artifact.json.integrity` equals the retained tarball SRI (`sha512-...`).
- [ ] No published or registry package is substituted for the tarball.
- [ ] Compute and record the tarball SHA-256 and SRI from the retained bytes.
- [ ] Save the complete packing log and exit code.

Record:

```text
Artifact directory:
Artifact package name: md2vid
Artifact package version: 0.1.2
Artifact tag: v0.1.2
Artifact metadata commit:
Artifact validation tree:
Artifact node version:
Artifact npm version: 11.15.0
Artifact tarball filename:
Tarball path:
Tarball size:
Tarball SHA-256:
Tarball SRI:
Pack exit code:
```

## 5. Install the tarball in isolation

```bash
install_dir="$(mktemp -d /tmp/md2vid-e2e-final-install.XXXXXX)"
cd "$install_dir"
corepack npm init -y
corepack npm install "$artifact_dir"/*.tgz
```

- [ ] Installation exits `0`.
- [ ] `node_modules/.bin/md2vid` exists.
- [ ] The executable resolves inside the isolated installation.
- [ ] Installed package files and skill files exist.
- [ ] `md2vid --help` exits `0`.
- [ ] Record lifecycle-script and dependency warnings.
- [ ] Confirm the installed HyperFrames dependency is the pinned supported version.
- [ ] Confirm no global `md2vid` executable is used.
- [ ] Confirm no command imports code from the active repository checkout.

Record:

```text
Install directory:
Installed md2vid path:
Installed md2vid version:
Installed HyperFrames version:
Help exit code:
Warnings:
```

## 6. Create a fresh DNS Markdown-to-video project

Use the original DNS Markdown fixture and create a new project. Do not copy generated output from an earlier run.

- [ ] Save the source Markdown in the evidence directory.
- [ ] Compute and record the source Markdown SHA-256.
- [ ] Scaffold a fresh flat HyperFrames project using the installed CLI.
- [ ] Configure the documented project-root local GSAP path.
- [ ] Confirm the local GSAP asset exists at that exact path.
- [ ] Write the coverage map, storyboard, and narration script.
- [ ] Author all five DNS frames.
- [ ] Preserve meaningful composition IDs and correct `frameNum` order.
- [ ] Keep captions clear of important visual content.
- [ ] Confirm no prior generated files were copied into the project.

Record:

```text
Project directory:
Source Markdown path:
Source Markdown SHA-256:
Composition IDs:
Local GSAP path:
```

## 7. Generate and transcribe narration without workarounds

- [ ] Run media provider authentication/status preflight.
- [ ] Select local Kokoro explicitly if remote media providers are unauthenticated.
- [ ] Generate every WAV through the supported media workflow.
- [ ] Run the installed `md2vid transcribe` command when required.
- [ ] Do not manually edit `audio_meta.json` before or after transcription.
- [ ] Validate every voice has a finite positive WAV duration.
- [ ] Validate every word satisfies:

```text
0 ≤ start ≤ end ≤ duration_s
next.start ≥ previous.end
```

- [ ] Confirm final-word overruns are normalized by the supported implementation or rejected clearly.
- [ ] Confirm no generated duration is extended beyond the actual WAV duration.
- [ ] Confirm every voice and word ID remains non-empty and unique where required.
- [ ] Save narration, transcription, and timing-validation logs.

Record:

```text
Media provider:
Voice:
Transcribe exit code:
Manual audio_meta edits: none | describe violation
Timing validation result:
Warnings:
```

Failure rule:

```text
Manual audio_meta.json correction required
  → FAIL
  → preserve raw metadata and logs
  → do not classify the render as release evidence
```

## 8. Build and check using only the installed artifact

Run from the fresh isolated project:

```bash
corepack npm run build
corepack npm run check
```

- [ ] Both commands resolve to scripts created by the installed package workflow.
- [ ] Build exits `0`.
- [ ] Check exits `0`.
- [ ] HyperFrames lint reports zero errors.
- [ ] HyperFrames validation reports zero console errors.
- [ ] HyperFrames inspection reports zero layout errors.
- [ ] No `invalid_parent_traversal_in_asset_path` finding appears.
- [ ] Generated files contain no `../` or `../../` GSAP workaround.
- [ ] The composed index loads the configured GSAP runtime exactly once.
- [ ] Generated hosts backed by embedded templates do not retain duplicate `data-composition-src` mounts.
- [ ] Standalone authored frame and caption files remain present.
- [ ] Generated captions exactly match neutral caption JSON.
- [ ] Build-plan voice and word identities match `audio_meta.json`.
- [ ] Save build and check logs with exit codes.

Record:

```text
Build exit code:
Check exit code:
Lint errors:
Validation console errors:
Inspection layout errors:
GSAP references:
Duplicate composition mounts:
```

## 9. Preview and verify composed caption synchronization

Start the isolated project preview in the background and record its PID and URL.

- [ ] Preview starts successfully.
- [ ] Browser console contains no relevant runtime error.
- [ ] Local GSAP loads successfully from the project-root asset path.
- [ ] Derive global sample times from each DNS host's actual `data-start` and frame duration; do not reuse packed fixture timestamps.
- [ ] At every sampled global time, record DNS-derived local time using `local = clamp(global - hostStart, 0, frameDuration)`.
- [ ] Exactly one scoped controller/timeline exists per frame.
- [ ] Exactly one captions timeline exists.
- [ ] Confirm zero `__hf2` mounts.
- [ ] Confirm zero duplicate IDs, including normalized timeline and mounted-root identities.
- [ ] Confirm zero `const tl` redeclaration collisions when authored controllers are composed.
- [ ] Prove standalone/composed parity for every sampled frame state.
- [ ] Seek forward and backward across multiple frame boundaries.
- [ ] Prove late → early → late nonmonotonic restoration for frame visuals and captions.
- [ ] After each nonmonotonic seek, confirm the main/player and captions timelines report the same logical time.
- [ ] Confirm the visible caption group matches the expected neutral caption group at each sampled time.
- [ ] Confirm active-word styling matches the expected word.
- [ ] Review each frame midpoint.
- [ ] Review transition-boundary snapshots.
- [ ] Confirm all DNS source sections are represented.
- [ ] Confirm no unrelated content appears.
- [ ] Confirm captions do not obscure important content.
- [ ] Confirm held landings and transitions are clean.
- [ ] Record explicit render approval based on this review.

Suggested synchronization samples:

```text
start
middle of each frame
immediately before each transition
immediately after each transition
late timeline → early timeline → late timeline
```

Record:

```text
Preview PID:
Preview URL:
Console errors:
DNS-derived global sample times:
DNS-derived local-time conversions:
Scoped frame controller/timeline count:
Captions timeline count:
__hf2 mount count:
Duplicate ID count:
const tl redeclaration collisions:
Standalone/composed parity:
Late → early → late restoration:
Seek samples and main/caption times:
Caption semantic checks:
Visual review result:
Render approval:
```

Failure rule:

```text
DNS-derived local-time conversion, standalone/composed mismatch, nonmonotonic restoration failure, controller/timeline count mismatch, `__hf2` mount, duplicate ID, or `const tl` redeclaration collision
  → FAIL
  → save machine-readable browser state and screenshots
  → do not render for release approval
```

## 10. Render the final MP4

```bash
corepack npm run render
```

- [ ] Render exits `0`.
- [ ] The MP4 exists and is non-empty.
- [ ] The render uses the isolated project and installed tarball.
- [ ] No CDN GSAP fallback or source-checkout dependency is introduced during render.
- [ ] Save the complete render log and exit code.
- [ ] Compute the final MP4 SHA-256.

Record:

```text
Render exit code:
MP4 path:
MP4 size:
MP4 SHA-256:
```

## 11. Inspect media structure with `ffprobe`

```bash
ffprobe -v error \
  -show_entries format=duration,size \
  -show_entries stream=codec_type,codec_name,width,height \
  -of json <output.mp4>
```

- [ ] Save the complete JSON output.
- [ ] Video codec is H.264.
- [ ] Video dimensions are 1920×1080.
- [ ] Audio codec is AAC.
- [ ] Duration is finite and positive.
- [ ] Duration is close to the generated build plan.
- [ ] Reported file size matches a non-empty MP4.

Record:

```text
Video codec:
Dimensions:
Audio codec:
ffprobe duration:
Build-plan duration:
Duration difference:
ffprobe size:
```

## 12. Inspect final rendered content and audio

Extract frames from the final MP4 rather than relying only on preview snapshots.

- [ ] Extract a midpoint frame for every composition.
- [ ] Extract frames immediately before and after every transition.
- [ ] Build midpoint and transition contact sheets.
- [ ] Compare final-MP4 frames with reviewed preview snapshots.
- [ ] Confirm each frame contains the intended DNS content.
- [ ] Confirm text is readable and remains inside safe bounds.
- [ ] Confirm captions remain clear of important visual content.
- [ ] Confirm no blank, duplicated, stale, or unrelated frame appears.
- [ ] Confirm no visual discontinuity appears at transitions.
- [ ] Inspect or listen at every narration boundary.
- [ ] Confirm no audible gaps, overlaps, clipping, or truncation.
- [ ] Confirm the final narration is synchronized with captions and visuals.

Record:

```text
Midpoint contact sheet:
Transition contact sheet:
Visual findings:
Audio-boundary findings:
Synchronization findings:
```

## 13. Preserve evidence

Before deleting any temporary directory, copy these items under the ignored project evidence directory:

- [ ] Temporary validation commit SHA record.
- [ ] Validation tree SHA record and reviewed candidate tree SHA record.
- [ ] Packed tarball.
- [ ] `artifact.json` with complete package, version, tag, commit, Node, npm, tarball, SHA-256, and SRI identity.
- [ ] Tarball SHA-256 record.
- [ ] Tarball SRI record.
- [ ] Source Markdown.
- [ ] Source Markdown SHA-256 record.
- [ ] Generated project configuration and authored frame sources needed to reproduce the run.
- [ ] Raw generated `audio_meta.json` proving no manual correction.
- [ ] Build plan and neutral caption artifacts.
- [ ] Final MP4.
- [ ] Final MP4 SHA-256 record.
- [ ] `ffprobe` JSON.
- [ ] Midpoint snapshots and contact sheet.
- [ ] Transition snapshots and contact sheet.
- [ ] Repository gate logs and exit codes.
- [ ] Pack and install logs and exit codes.
- [ ] Narration and transcription logs and exit codes.
- [ ] Build, check, preview, and render logs and exit codes.
- [ ] Browser console and timeline synchronization record.
- [ ] Warning and workaround record.
- [ ] `manifest.json` containing path, byte count, and SHA-256 for every preserved evidence file except the manifest and checksum file while they are being generated.
- [ ] `SHA256SUMS` containing every preserved evidence-file hash plus the completed `manifest.json` hash.
- [ ] Credential-scan log and result.
- [ ] Git-ignore and public/package evidence-confinement result.

Evidence integrity:

- [ ] Hash every preserved evidence file, not only release-significant binaries.
- [ ] Regenerate `manifest.json` and `SHA256SUMS` after the final evidence-writing step.
- [ ] Confirm `SHA256SUMS` contains the completed manifest hash and every other preserved file hash; record the manifest hash in `SHA256SUMS`.
- [ ] Confirm copied hashes match the originals.
- [ ] Run the credential scan across the complete evidence tree and confirm no credential, token, cookie, private key, or private environment value is present.
- [ ] Confirm evidence paths are ignored by Git and excluded from the public snapshot and package allowlist.

Record:

```text
Evidence manifest: manifest.json
Evidence checksums: SHA256SUMS
Every-file hashing result:
Manifest hash in SHA256SUMS:
Credential scan result:
Evidence confinement result:
```

## 14. Clean temporary resources

Only begin cleanup after evidence preservation is complete.

- [ ] Stop the preview server.
- [ ] Confirm its process exited.
- [ ] Remove the temporary validation checkout.
- [ ] Remove the temporary artifact directory.
- [ ] Remove the isolated install/project directory.
- [ ] Remove any other E2E-specific temporary directory.
- [ ] Confirm all recorded temporary paths are absent.
- [ ] Confirm no E2E server or renderer process remains.
- [ ] Confirm the active repository contains only intentional source, documentation, and ignored evidence changes.
- [ ] Confirm cleanup did not remove evidence.

Record:

```text
Preview process stopped:
Validation directory removed:
Artifact directory removed:
Install/project directory removed:
Remaining temporary processes:
Active repository status after cleanup:
```

## 15. Final PASS/FAIL decision

The final gate passes only when every condition below is true:

- [ ] The exact repository gate matrix exits `0`.
- [ ] The packed artifact comes from the recorded clean temporary validation commit.
- [ ] The tarball installs in isolation.
- [ ] Only the installed CLI is used by the test project.
- [ ] Narration metadata is valid without manual editing.
- [ ] Local GSAP passes build, lint, validation, inspection, preview, and render without a CDN fallback.
- [ ] The composed preview has one mount per composition.
- [ ] Main/player and caption timelines stay synchronized across nonmonotonic seeks.
- [ ] Caption group and active-word semantics are correct.
- [ ] A real DNS Markdown source produces the reviewed MP4.
- [ ] The final MP4 is H.264 at 1920×1080 with AAC audio.
- [ ] MP4 duration is finite and consistent with the build plan.
- [ ] Extracted final-MP4 frames pass content and layout review.
- [ ] Audio boundaries contain no gaps, overlaps, clipping, or truncation.
- [ ] No repository-source or global-CLI dependency contaminates the run.
- [ ] Evidence is complete, hashed, credential-free, and preserved.
- [ ] Temporary resources are removed.
- [ ] No workaround was required.

Decision:

```text
Result: PASS | FAIL
Active checkout HEAD:
Reviewed candidate tree SHA:
Temporary validation commit SHA:
Validation tree SHA:
Complete artifact identity:
Tarball:
Tarball SHA-256:
Tarball SRI:
Evidence manifest: manifest.json
Evidence checksums: SHA256SUMS
Credential scan result:
Evidence confinement result:
Source Markdown:
Source Markdown SHA-256:
MP4:
MP4 SHA-256:
Repository gates:
Isolated install:
Timing validation:
Local GSAP validation:
Caption synchronization:
Media validation:
Content review:
Cleanup:
Blocking findings:
Non-blocking warnings:
Workarounds: none | describe
Evidence directory:
```

## 16. Action after the decision

If **FAIL**:

```text
Preserve evidence
  → keep PR #12 open
  → identify the first blocking defect
  → add a failing regression test
  → implement the narrow fix
  → rerun focused tests
  → rerun the exact gate matrix
  → create a new temporary validation commit
  → repeat this checklist from packing onward
```

- [ ] Do not commit, push, merge, bump, or publish after a failed decision.

If **PASS**:

```text
Record PASS
  → leave the active working tree uncommitted
  → report hashes and evidence to the user
  → wait for explicit commit/push instruction
  → then follow the separate release sequence
```

- [ ] Do not infer permission to commit or push from a PASS result.
- [ ] Do not infer permission to merge or publish from a commit/push request.
