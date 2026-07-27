# md2vid PR Completion — Session Checkpoint

Written: 2026-07-26. Purpose: resume state for `/goal execute
docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-goal.md`.

## Current position

The historical 2026-07-26 render remains rejected failure evidence because its apparent approval was
not genuine human authorization and the stricter 2026-07-27 review found VIS-1 through VIS-3.
The visual-integrity remediation is implemented and verified through a new candidate tree, repacked
tarball, isolated install, fresh narration/transcription/build, composed-player assertions, genuine
render approval, final MP4 inspection, evidence hashing, credential scan, and cleanup. **The corrected
local gate is PASS. The active tree remains uncommitted and PR synchronization remains blocked pending
separate explicit authorization.**

The corrected run is isolated under `pr12-20260727T022527Z`; none of the failed render's narration,
transcription, generated index, screenshots, or MP4 was reused.

## Hard constraints still in force

- No further active-branch commit or push before local `PASS` **and** separate explicit
  authorization. The temporary validation commit must not move the active branch.
- Separate explicit approvals required for: render, commit, push/PR mutation, merge, version bump,
  tag, publish.
- Do not add automated installed-transcribe or full `ffprobe` release-harness coverage (deferred
  follow-ups). The preserved manual black-box gate is required now.
- Do not expose credentials, manually edit `audio_meta.json`, use a global CLI, import active
  repository source into the isolated project, reuse prior generated outputs/audio/MP4s, or use CDN
  GSAP.
- Task 11 Step 12: do not use placeholders or rewrite the historical workaround-backed 2026-07-24
  check as a pass.
- Task 11 Steps 9/15: credential scan over all evidence must produce an empty log.
- The failed MP4 is `FAIL — do not publish`; do not reuse its generated media, screenshots, or
  acceptance outputs for the corrected run.
- PR synchronization remains blocked until a fresh candidate completes the full local gate and
  receives separate authorization.
- Any deviation from the approved design or plan must stop and be documented first.

## Identities

| Item | Value |
| --- | --- |
| Branch | `fix/stabilize-cli-workflows` |
| Active HEAD | `00f39e250133fd576941b4b69ce122c8e17051d2` (active branch remains uncommitted) |
| Corrected candidate tree | Recorded after the final freeze in `evidence/pr12-20260727T022527Z/00-candidate/reviewed-candidate-tree.txt` |
| Corrected validation commit (detached) | Recorded in `evidence/pr12-20260727T022527Z/03-validation-artifact/validation-commit.txt` |
| Corrected tarball SHA-256 | `5bec6fb40df2b93fc1d0bac0482a1d48bb2964c398830f10c41feb13064453b2` |
| Corrected tarball SRI | `sha512-zOSTXcjboyI1hBs5D1z/UBhkiveUiRaRh1zl1wyyX8dMN8loiawywc+4RCz0XAXNN+Wr4a5NccfSh8SUtEYDSQ==` |
| Historical failed tree / tarball | `be6dd03759bb609408dd5cbfe74bee5c1fda24bd` / `38317cf8e5a8c5d4cee00d71fd9b6f7e530f597d4aa328ebcfb0d1b61aff9106` |
| Package / version | `md2vid` `0.1.2` (tag `v0.1.2`) |
| Node / npm | `v26.4.0` / `11.15.0` (pinned) |
| Corrected RUN_ID | `pr12-20260727T022527Z` |
| Failed MP4 path | `/private/tmp/md2vid-pr12-install.jErkeL/dns-resolution/renders/dns-resolution_2026-07-26_22-34-27.mp4` |
| Failed MP4 SHA-256 | `56eaa1bd9d8618e41f9aa0d5363c2dea57cf299ac763811223e2d3094858844e` |
| Failed MP4 size / duration | `6,255,553` bytes / `84.586667s` |
| Failed MP4 disposition | **FAIL — do not publish** |

## Temporary-resource state

Cleanup is complete. The Studio and composed-player ports are stopped; all validation worktrees,
artifact temporary roots, isolated installs, and fresh project directories recorded under
`10-cleanup/` are absent. Preserved evidence remains under the ignored repository evidence tree.

Unrelated pre-existing worktrees (do **not** remove): `md2vid-e2e-final-candidate-worktree.kGDA3W`,
`md2vid-e2e-final-validation.GraAOi`, `md2vid-task109-postfix.Wz2kPv`.

## Repository changes (tracked and untracked, still uncommitted)

Visual contract and caption behavior: `engine/config.ts`, `engine/types.ts`,
`frameworks/hyperframes/{visual_contract.ts,verify.ts,emit.ts,scaffold.ts}`, caption/frame templates,
and `scripts/scaffold_project.ts`.

Validation coverage: focused config/emit/verify tests, release-harness and smoke-fixture contracts,
package-meta public-snapshot compatibility, regenerated goldens, and `test/visual/` with real-player
manifest timing, seek quantization, xfade, caption-state, paint-stack, contrast, occlusion, and theme
fixtures.

Docs: the durable final-gate checklist, public/skill video-generation standards, the rejected-render
record, the visual-integrity implementation plan, HyperFrames upstream reproduction, and this
checkpoint. Ignored evidence contains the reviewed DNS inputs and both historical and corrected runs.

## Verified results so far

- Focused corrected-candidate suites: 208/208 tests, 0 skipped, all exit `0`.
- Complete nine-command repository matrix: 793/793 tests, 0 skipped, every command exit `0`, including
  public-snapshot and packed release checks.
- Pack → isolated install identity: the final detached commit/tree recorded under `03-validation-artifact/`
  produces tarball SHA-256 `5bec6fb4…`; installed CLI and HyperFrames `0.7.26` resolve only inside
  the isolated path recorded under `04-isolated-install/`.
- Fresh DNS acceptance: new Kokoro WAVs, supported transcription with no manual `audio_meta.json` edit,
  build/check exit `0`, local pinned `gsap@3.14.2`, and no CDN/parent-traversal workaround.
- Composed runtime: console/page/unexpected-network/remote-GSAP all PASS; runtime identity, nonmonotonic
  seek restoration, and 15-sample standalone/composed parity PASS.
- Visual integrity: caption timing/state/contrast PASS (742 samples, 186 seeks), text occlusion PASS
  (46 samples), frame theme PASS (15 samples), all with zero failures.
- Caption-inclusive midpoint and transition contact sheets pass agent review, including Frame 03 caption
  states and Frame 05 station-title/marker geometry. Genuine render approval was recorded.
- Final media PASS: H.264 1920×1080 plus AAC audio, `84.586667s`, `6,310,228` bytes, SHA-256
  `c9506ac8606f8373490af45a8f683cd4ee6d3c2ae88524d1695701d6cb987c57`; rendered visual/audio review,
  credential scan, evidence checksums, and cleanup all pass.
- The historical MP4 remains **FAIL — do not publish** and was not reused.

## Evidence layout

Corrected run:
`docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/pr12-20260727T022527Z/`
→ `00-candidate/` through `10-cleanup/`, including focused/matrix logs, validation artifact and exact
tarball, isolated-install identity, fresh DNS sources/audio, build/check outputs, browser machine evidence,
16 preview snapshots and both preview contact sheets, genuine render approval, preserved MP4, ffprobe and
audio analysis, extracted rendered frames/contact sheets, credential/confinement/cleanup results,
`manifest.json`, and `SHA256SUMS`.

Historical failed run remains under `evidence/pr12-20260726T132024Z/`.

## Historical warnings recorded before render

1. Authored acceptance-input corrections were required in `/tmp` (cross-frame
   `data-track-index` collisions → 41 `overlapping_clips_same_track`; one recap text overflow
   9.81px; two later `fromTo` handoffs needed `immediateRender:false`). Not package-source changes;
   artifact stays valid at tree `be6dd03…`.
2. Documented deviations: two Task 1/2 test-shape deviations; `ℹ tests` matrix-parser format;
   `artifact.json` tree-field assertion correction; packed `dist/engine/*.js` exports used instead
   of the plan's `node_modules` `.ts` imports (Node 26 forbids type stripping under `node_modules`).
3. One lint warning remains: `composition_file_too_large` on generated `index.html` (434 lines).
4. Studio's own runtime fetches `cdn.jsdelivr.net/npm/gsap@3.12.5/dist/MotionPathPlugin.min.js`;
   the composition uses local `assets/gsap/gsap.min.js`.

## Remaining work

1. Request separate explicit commit authorization if the user wants these uncommitted changes recorded.
2. Do not commit, push, mutate PR #12, merge, bump, tag, or publish without the corresponding separate
   authorization. The corrected local PASS and render approval do not imply any of those permissions.

**PR synchronization is blocked.** Do not push or mutate PR #12 from the rejected candidate. Any
future commit, push/PR mutation, merge, version bump, tag, or publish action still requires its
separate authorization gate.
