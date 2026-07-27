# md2vid PR Completion — Corrected Local Gate Check

Date: 2026-07-27
Result: **PASS — local only; commit/push/PR mutation not authorized**

## Identity

| Item | Value |
|---|---|
| Active HEAD | `00f39e250133fd576941b4b69ce122c8e17051d2` |
| Candidate tree | `0bf217e53b9886f6caa3ee3e0fef14cc1c3299e5` |
| Detached validation commit | `bdbc554e25156d066b8ccb8973c8c3359babcbc2` |
| Package | `md2vid@0.1.2` |
| Tarball SHA-256 | `5bec6fb40df2b93fc1d0bac0482a1d48bb2964c398830f10c41feb13064453b2` |
| Tarball SRI | `sha512-zOSTXcjboyI1hBs5D1z/UBhkiveUiRaRh1zl1wyyX8dMN8loiawywc+4RCz0XAXNN+Wr4a5NccfSh8SUtEYDSQ==` |
| Node / npm | `v26.4.0` / `11.15.0` |
| Evidence | `evidence/pr12-20260727T022527Z/` |

## Verification

- Focused suites: **208/208 PASS**, 0 skipped.
- Nine-command repository matrix: **793/793 PASS**, 0 skipped; every command exit `0`.
- Public snapshot and packed release checks: PASS.
- Exact tarball installed outside the repository; CLI realpath confined to the isolated install.
- Fresh DNS project used new Kokoro narration and supported transcription; no manual `audio_meta.json` edits.
- Build/check: PASS with local pinned `gsap@3.14.2`; no CDN or parent-traversal workaround.
- Browser/runtime: console, page errors, unexpected network, identities, nonmonotonic seeks, and standalone/composed parity PASS.
- Caption state/contrast: **742 samples / 186 seeks / 0 failures**.
- Text occlusion: **46 samples / 0 failures**.
- Frame theme: **15 samples / 0 failures**.
- Genuine render approval was recorded before rendering.

## Final media

| Item | Value |
|---|---|
| Preserved MP4 | `evidence/pr12-20260727T022527Z/08-render/final-dns-resolution.mp4` |
| SHA-256 | `c9506ac8606f8373490af45a8f683cd4ee6d3c2ae88524d1695701d6cb987c57` |
| Size | `6,310,228` bytes |
| Duration | `84.586667s` |
| Video | H.264, 1920×1080 |
| Audio | AAC-LC, 48 kHz stereo |
| Build-plan difference | `0.026669s` |

Rendered midpoint and transition contact sheets pass content/layout review. The final MP4 matches all 15 reviewed preview samples within normalized RMSE `0.0320182` (threshold `0.05`). Frame 03 captions remain readable on parchment; Frame 05 titles remain clear of markers and rail. Audio peaks at `-5.3 dB`, the four planned narration boundaries are exactly `0.5s`, and no clipping, overlap, or truncation was detected.

## Evidence and cleanup

- `manifest.json`: 250 preserved files.
- `SHA256SUMS`: 251 entries, including the completed manifest hash.
- Credential scan: PASS, zero findings, empty log.
- Evidence confinement: PASS; evidence is gitignored and excluded from public/package payloads.
- Preview/player processes stopped.
- Validation worktrees, artifact temp roots, isolated installs, and fresh project removed after preservation.

## Warnings

1. Generated `index.html` retains the non-blocking `composition_file_too_large` warning.
2. Five expected local-WAV `ERR_ABORTED` events occur during deliberate browser seek tests; unexpected failed requests are zero.
3. The first approved render completed, but its evidence `tee` path was wrong; the unchanged candidate was rendered again with a retained full log and exit `0`. The second MP4 is authoritative.

No workaround remains in the corrected source, browser gate, or preserved MP4. The historical 2026-07-26 MP4 remains **FAIL — do not publish**.

This PASS grants no authorization to commit, push, mutate PR #12, merge, bump, tag, or publish.
