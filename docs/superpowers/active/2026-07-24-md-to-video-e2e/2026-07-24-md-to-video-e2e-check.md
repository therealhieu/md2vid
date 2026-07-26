# Markdown-to-Video End-to-End — Post-Execution Check

## Result

**FAIL — the full Markdown-to-MP4 path rendered successfully, but two manual workarounds were required.**

```text
Markdown fixture
  → packed PR artifact
  → isolated install
  → flat HyperFrames scaffold
  → coverage + storyboard + script
  → local Kokoro narration
  → authored DNS visuals
  → build + check
  → Studio/snapshot review
  → render
  → H.264/AAC MP4 validation
```

## Test record

| Field | Value |
|---|---|
| Date | 2026-07-24 |
| Tester | Claude Code E2E agent |
| Branch | `fix/stabilize-cli-workflows` |
| PR | `https://github.com/therealhieu/md2vid/pull/12` |
| Commit | `60fe838c4b00541a4a22354307c35e0b7a272f84` |
| Framework | HyperFrames |
| Node | `v26.4.0` |
| npm | `11.15.0` |
| FFmpeg / ffprobe | `8.1.1` |
| PR checks | 7 passed, 0 failed |
| Optional Remotion pass | Not run |

## Input and artifact identity

| Artifact | SHA-256 |
|---|---|
| Markdown fixture | `4939e1293e0a72747dd453c88cf8a759b9983d42e353846770c8495bbea7b0c4` |
| Packed `md2vid-0.1.2.tgz` | `48789d52ec3ce56cafd33b559fe6674bedea168276f23d78a80ec703a2dbbff6` |
| Rendered MP4 | `3fc908138b4c27c5ee0969c63bd83eefe18691eae1b017b518382808134c3d55` |

`artifact.json` identifies package `md2vid@0.1.2` at commit `60fe838c4b00541a4a22354307c35e0b7a272f84` with npm `11.15.0`.

## Checklist outcome

### 1. Preconditions — PASS

- PR checks were green.
- `git diff --check main..HEAD` exited `0`.
- A fresh temporary clone of the PR branch was clean before packing.
- Node, npm, FFmpeg, and ffprobe met requirements.
- No published package was used.

The main checkout already contained the untracked checklist directory, so packing ran from a clean temporary clone of the same commit rather than altering or stashing the user's working tree.

### 2. Representative Markdown — PASS

The DNS fixture contains an H1, five H2 sections, a numbered process, a numeric latency table, a text block, a flow requiring redraw, an intro, explanation material, and a recap. No source unit was omitted.

### 3. Pack current PR checkout — PASS

`corepack npm run release:pack -- --output <artifact-dir>` exited `0`. The tarball was non-empty (125,645 bytes), and metadata matched the commit under test.

### 4. Isolated installation — PASS WITH WARNINGS

- Local executable: `<install-dir>/node_modules/.bin/md2vid`
- Real target: `<install-dir>/node_modules/md2vid/dist/bin/md2vid.js`
- Installed skill: present
- `md2vid --help`: exit `0`
- `npm ls md2vid`: resolved local `md2vid@0.1.2`

Warnings:

- npm audit: 2 moderate and 4 high vulnerabilities in the isolated dependency tree.
- npm `allowScripts` blocked six install scripts, including the package postinstall. CLI, skill, build, check, preview, and render still completed.

### 5. `/md2vid` workflow — PASS

A flat `dns-resolution/` project remained flat throughout. The source coverage map, `STORYBOARD.md`, `SCRIPT.md`, meaningful voice IDs, slug mappings, and five authored frame files were created. No `md2vid audio` command was used.

### 6. Narration — FAIL WITHOUT WORKAROUND

The authentication preflight reported no configured account and selected the explicit local/offline route. The HyperFrames media engine generated five Kokoro WAV files and 176 word timings:

| Voice ID | Duration | Words |
|---|---:|---:|
| `intro` | 13.653s | 35 |
| `resolution-path` | 15.381s | 36 |
| `latency` | 17.451s | 40 |
| `example` | 17.813s | 31 |
| `recap` | 16.128s | 35 |

`npm run transcribe` completed but left two final word timings outside their WAV durations:

```text
resolution-path: duration=15.381, final end=15.520 (+0.139s)
latency:         duration=17.451, final start=17.890, end=18.220 (+0.769s)
```

A probe restored those invalid timings in a fresh copy. `md2vid build` still exited `0`, proving the installed build path does not reject word timings outside `duration_s`.

Workaround used for the final render:

- Clamp `resolution-path` final end to `15.381`.
- Move/clamp `latency` final word to `17.310..17.451`.

After the workaround, all IDs, paths, durations, word arrays, ordering, timing bounds, and slug own-properties validated.

### 7. HyperFrames visual authoring — PASS

Five deterministic, seek-safe frames redraw the title/agenda, resolver process, latency table, request/response route, and recap. Footer content was moved above the 200px caption band after the first snapshot review.

### 8. Build and check — PASS WITH WARNINGS

- `npm run build`: exit `0`
- `npm run check`: exit `0`
- md2vid verification: 0 warnings
- HyperFrames lint: 0 errors, 65 `composition_self_attribute_selector` warnings in the authored frames
- HyperFrames validation: no console errors; WCAG checks passed
- HyperFrames inspection: 0 layout issues across 9 samples

Generated output validation:

- Five meaningful frame IDs remained intact.
- `frameNum` values were `1..5` in narration-array order.
- 27 baked caption groups exactly matched `caption_groups.json.groups`.
- All required neutral and framework artifacts and staged WAV files existed.
- The executable resolved to the isolated install, not the repository or a global CLI.

### 9. Preview and review — PASS

Studio started at `http://localhost:3002`. Before shutdown it reported 0 runtime errors. Midpoint and transition-boundary snapshots showed:

- Every source section represented.
- Correct DNS sequence and numeric values.
- No hash-table or unrelated subject matter.
- Clear captions after the footer-layout correction.
- No blank, black, unstyled, or partially mounted scene.
- Deterministic crossfades and held landings.

Review decision: **approved for render after the footer correction, rebuild, check, and snapshot rerun.**

### 10. Render — PASS

`npm run render` exited `0` and produced a non-empty 5,493,460-byte MP4.

```text
Video:    H.264, 1920×1080
Audio:    AAC, 48 kHz, stereo
Duration: 82.453333s
Plan:     82.426s
Delta:    +0.027333s
Peak:     -5.3 dB
```

### 11. Rendered-output inspection — PASS

Frames extracted from the final MP4—not preview state—confirmed the intro, process, table, route diagram, recap, and captions. Silence analysis found normal intra-sentence pauses and intentional scene landing gaps; peak analysis found no clipping.

### 12. Optional Remotion pass — SKIPPED

The checklist marks this pass optional. The release harness had already exercised packed Remotion build/check/still smoke before this E2E run; no second full DNS Remotion authoring/render was performed.

## Blocking findings

### B1. Word timings can exceed WAV duration and still pass build

```text
Kokoro WAV
  → transcription timestamps exceed duration_s
  → md2vid build accepts invalid bounds
  → manual metadata correction required
```

Recommended fix:

1. In `md2vid transcribe`, normalize every word interval to `0 <= start <= end <= duration_s` while preserving monotonic order, or fail with a path/voice/word-specific error.
2. In planner/config validation, reject any word whose start/end is non-finite, negative, out of order, or outside its voice duration.
3. Add regression tests for final-word overrun, start-after-duration, and non-monotonic timing.
4. Repack the PR and repeat this checklist without editing `audio_meta.json` manually.

### B2. Installed local-GSAP guidance conflicts with HyperFrames lint

The installed standard says a local config path such as `runtime/custom-gsap.js` becomes `../../runtime/custom-gsap.js` in frame documents. Following that guidance caused:

```text
invalid_parent_traversal_in_asset_path
```

for all authored frames, while md2vid generated `compositions/captions.html` with `../runtime/...` and triggered the same lint error. The E2E reverted to the scaffold's pinned CDN URL to pass checks.

Recommended fix:

- Align md2vid local-runtime emission and documentation with HyperFrames' root-relative asset-path contract, then add an installed-project test where local GSAP passes generated `npm run check`.

## Non-blocking warnings

- The authored frames produced 65 selector-isolation warnings. They are not duplicated instances and caused no runtime or render failure, but future authored examples should use stable root IDs to avoid warning noise.
- npm audit and blocked-install-script warnings remain as recorded above.
- No external render-feedback event was sent because that would publish data outside the local E2E run.

## Workarounds used

1. Manually bounded two final word timings after `npm run transcribe`.
2. Reverted local GSAP paths to the scaffold's pinned CDN URL after generated checks rejected documented parent-relative paths.
3. Moved footer labels above the caption band after visual review; this was a normal authored-source correction, not a package workaround.

## Evidence

Evidence is preserved under `evidence/` beside this check.

Task #107 regression evidence:

- [Original RED: sibling frame styles are not mounted](evidence/task-107-red.log)
- [Original focused GREEN](evidence/task-107-green-focused.log)
- [Original packed artifact verification](evidence/task-107-release-verify-artifact.log)
- [Review iteration 1 RED](evidence/task-107-review-1-red.log)
- [Review iteration 1 ambiguity RED](evidence/task-107-review-1-red-ambiguity.log)
- [Review iteration 1 focused GREEN](evidence/task-107-review-1-green-focused.log)
- [Review iteration 1 relevant GREEN](evidence/task-107-review-1-green-relevant.log)
- [Review iteration 1 pinned packed artifact verification](evidence/task-107-review-1-release-verify-artifact.log)

```text
evidence/
├── SHA256SUMS
├── artifact/
│   ├── artifact.json
│   └── md2vid-0.1.2.tgz
├── project/
│   ├── dns-resolution.md
│   ├── STORYBOARD.md
│   ├── SCRIPT.md
│   ├── audio_request.json
│   ├── audio_meta.json
│   ├── video.config.json
│   ├── output.config.json
│   └── ffprobe.json
├── media/
│   ├── dns-resolution-e2e.mp4
│   ├── preview-contact-sheet.jpg
│   ├── transition-contact-sheet.jpg
│   └── rendered-contact-sheet.png
└── logs/
    ├── build.log
    ├── check.log
    ├── overflow-build.log
    ├── preview.log
    ├── render.log
    └── silence.log
```

## Release decision

```text
Result: FAIL
Blocking findings: B1, B2
Non-blocking warnings: selector warnings; npm audit/allowScripts warnings
Workarounds used: timing clamp; CDN GSAP fallback
Recommended action:
  fix PR #12
    → repack current checkout
    → repeat this checklist with no metadata/runtime-path workaround
    → merge only after PASS
```

Do not publish `0.1.3` from the current PR state based on this E2E result.
