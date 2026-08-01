# Markdown-to-Video E2E Checkpoint

Captured: 2026-07-25

## Purpose

Resumable snapshot of where the packed-artifact Markdown-to-video E2E validation stands, so work can restart without re-deriving state. This file records status only; the gate procedure lives in `2026-07-24-md-to-video-e2e-final-gate-checklist.md`.

## Repository state

```text
Branch:               fix/stabilize-cli-workflows
Active checkout HEAD: 60fe838c4b00541a4a22354307c35e0b7a272f84
Working tree:         dirty, 67 paths, nothing committed
Evidence:             preserved under ignored /docs/superpowers/**/evidence/
Final MP4:            none rendered
```

Every remediation change is still uncommitted by design. Commit, push, merge, version bump, and publish stay out of scope until the final gate checklist passes **and** the user explicitly asks.

## Durable validation artifact (Task #115)

```text
Validation commit:  39209f80ebf7ed94f296141cfadcf80082ec0f39
Tree:               d73873def6b0c0479e1c1ec7ccac42b6e31065ad
Tarball SHA-256:    351dbec6a7f5d3097c80170823e22ebe9a39c51c565e9d4f02fd0b0d3dc2e967
npm:                11.15.0
Location:           docs/superpowers/active/2026-07-24-md-to-video-e2e/evidence/task-115/artifact/
```

This is a throwaway validation commit used only to pack the exact uncommitted source state. It is not part of the branch history.

## Source fixes landed

| # | Fix | Root cause resolved |
|---|---|---|
| 1 | Word timing normalization | Whisper cues exceeded WAV duration |
| 2 | Local GSAP paths | Root-relative `assets/gsap/gsap.min.js`, no CDN |
| 3 | Atomic full build | Partial promotion survived a mid-build failure |
| 4 | Caption loop self-heal | Studio proxy patch drift |
| 5 | Embedded **style** transport | Style nodes were siblings of the mounted root, so they were dropped |
| 6 | Top-level template safety | A nested decoy `<template>` could intercept reserved-ID replacement |
| 7 | Sample-accurate WAV duration | Metadata drifted `0.000333s` from the RIFF sample extent |
| 8 | Immutable voice snapshots | Source WAV could change between planning and staging |
| 9 | Emitted narration verification | Rendered assets were never compared to source digests |
| 10 | Embedded **script** transport | Frame timelines were entirely absent in the composed runtime |

## Fix 10 runtime contract

```text
authored template
  → strip the exact configured external GSAP script
  → move top-level styles AND scripts into the matching composition root
  → preserve pre-root / existing-root / post-root order
  → HyperFrames clones the root → inline frame script executes
  → scoped frame controller registers
  → global player seeks the child timeline at LOCAL host time
```

Packed regression proving global-to-local conversion (review iteration 1 added the second frame because two frames at `0.0` could not distinguish global from local time):

```text
01-smoke @ 0.0     02-smoke @ 3.5

global 3.6 → frame2 local 0.1
global 5.9 → frame2 local 2.4
global 6.4 → frame2 local 2.9
```

The browser assertions also cover: exactly one controller per frame, no `__hf2`, hidden/revealed/late visual states, standalone-versus-composed parity, nonmonotonic cross-frame seeks, and no `const tl` redeclaration collision.

## Verification status at this checkpoint

```text
Full tests:                       704 / 704 passed
Typechecks:                       passed
Skill references:                 passed
Packed browser/render checks:     passed
git diff --check:                 passed
Root evidence pollution:          removed, relocated to evidence/task-115/
```

## Task board

| Task | Status | Note |
|---|---|---|
| #55–#103 | completed | Mapping, fixes 1–4, gates, pack, isolated authoring |
| #107–#114 | completed | Style transport, WAV bounds, repacks, fresh DNS projects |
| #115 | in_progress | Implementation + review iteration 1 done; three independent re-reviews outstanding |
| #104 | blocked by #115 | Prior DNS candidate approval revoked, it predates #115 |
| #105 | blocked by #104, #115 | No final MP4 exists |
| #106 | blocked by #105 | Evidence, cleanup, PASS/FAIL |
| #60 | in_progress | Overall packed E2E |

## Resume sequence

1. Rerun the three independent Task #115 reviews (spec, quality, tester) against the latest two-frame and evidence fixes. Do not close #115 before they pass.
2. Rerun the exact seven-gate repository matrix from the final gate checklist.
3. Create a new validation commit and pack a new tarball; record commit, tree, and SHA-256.
4. Install the tarball into a fresh isolated prefix. No global CLI, no repository-source imports.
5. Create a fresh DNS project. Carry forward only reviewed authored source inputs; never copy generated outputs.
6. Generate fresh Kokoro narration, then run installed `md2vid transcribe`. No manual `audio_meta.json` edits.
7. Build and check, then preview with per-frame local-state assertions.
8. Render the MP4 only after explicit machine and visual approval.
9. Inspect codecs, dimensions, duration, audio, and final rendered frames with ffprobe.
10. Preserve evidence under the ignored tree, clean temporary resources, record PASS or FAIL.

## Standing constraints

- No commit or push until PASS and an explicit user request.
- PASS does not imply permission to merge, bump, or publish.
- The earlier manually corrected MP4 is not release evidence.
- No manual `audio_meta.json` edits.
- No CDN GSAP fallback while validating the local-GSAP contract.
- No public `md2vid audio` command.
- Never throw after a managed-file commit boundary.
- Use project-pinned npm `11.15.0` for release and public-snapshot gates.
- Never write credentials or secrets into project files or evidence.

## Known limitation carried forward

Voice snapshot confinement is best-effort under a quiescent tree. Node core lacks `openat`/`openat2`, so a hostile same-user swap-and-restore race cannot be fully prevented. This is documented in the standards, not silently assumed, and a native addon was rejected as outside approved scope.
