# Finish md2vid PR #12 — Design

**Date:** 2026-07-26
**Status:** Approved
**Branch:** `fix/stabilize-cli-workflows`
**PR:** `https://github.com/therealhieu/md2vid/pull/12`

## Goal

Finish PR #12 from the current local candidate through a reproducible packed-artifact Markdown-to-MP4 acceptance run, without hiding review findings, using workarounds, contaminating the isolated install with repository source, or pushing before the final gate records `PASS` and the user authorizes it.

## Source artifacts

This design continues, but does not replace, these records:

- `docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-design.md`
- `docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-check.md`
- `docs/superpowers/active/2026-07-24-md-to-video-e2e/2026-07-24-md-to-video-e2e-checkpoint.md`
- `docs/superpowers/active/2026-07-24-md-to-video-e2e/2026-07-24-md-to-video-e2e-final-gate-checklist.md`
- `docs/superpowers/active/2026-07-24-md-to-video-e2e/2026-07-24-md-to-video-e2e-check.md`

Captured starting state:

```text
local HEAD:       77e36e12f90519df54b06e926dbb9ab86907393c
remote PR head:   60fe838c4b00541a4a22354307c35e0b7a272f84
working tree:     clean before this design document was created
branch relation:  local branch ahead by one commit
final DNS MP4:    absent
final gate:       no accepted PASS
```

The prior validation artifact is tied to temporary commit `39209f80ebf7ed94f296141cfadcf80082ec0f39`, not the candidate that will contain the remaining fixes from this design.

## Scope

In scope:

1. Resolve the confirmed unsafe/duplicate slug-mapping defect.
2. Reject a regular file passed as the build project directory.
3. Correct the final whitespace gate so it checks committed and uncommitted changes.
4. Resolve or explicitly disposition every existing PR review thread.
5. Repeat the three independent Task #115 reviews against the final candidate.
6. Run the complete repository, packed-artifact, isolated-install, DNS authoring, transcription, build, check, preview, render, media-inspection, evidence, and cleanup gates.
7. Record an explicit `PASS` or `FAIL` before requesting authorization to commit or push.
8. Synchronize PR #12 with the accepted candidate and wait for current remote checks.

Out of scope:

- Adding a public `md2vid audio` command.
- Replacing the CLI parser, rendering framework, or package architecture.
- Automating provider-backed installed transcription inside `release:check`.
- Adding automated `ffprobe` assertions to the bounded release smoke.
- Fixing dependency-audit warnings unless they become configured gate failures.
- Version bumps, npm publication, or merging PR #12 without separate authorization.

## Approaches considered

### Approach A — Gate-first uncommitted candidate (recommended)

**Purpose** — Honor the existing release boundary while validating the exact candidate that contains the remaining fixes.

**Current state**

```text
77e36e1 committed locally
  + no final PASS
  + PR remote still at 60fe838
  + remaining correctness findings
```

**Expected state**

```text
77e36e1 baseline
  + uncommitted reviewed fixes
  → temporary validation checkout
  → throwaway clean commit
  → packed DNS-to-MP4 PASS
  → user authorization
  → active-branch commit and push
```

Pros:

- Preserves the no-further-commit/no-push boundary until the candidate passes.
- Tests the exact working-tree source rather than an inferred approximation.
- Avoids sending known blockers to remote CI and reviewers.

Cons:

- Requires a temporary validation checkout and explicit identity records.
- Final tracked completion records create an expected documentation-only delta after the artifact run; that delta must be recorded.

### Approach B — Push-first, CI-driven completion

**Purpose** — Use remote CI and CodeRabbit as the main convergence loop.

**Current state**

```text
local candidate ahead of PR
  + known blockers
  + stale remote checks
```

**Expected state**

```text
push candidate early
  → remote CI/review
  → fix-forward commits
  → eventual local E2E
```

Pros:

- Remote feedback starts earlier.
- The PR UI always reflects the latest source.

Cons:

- Violates the governing no-push-before-PASS constraint.
- Publishes known defects and creates avoidable review churn.
- Makes artifact identity harder to separate from intermediate remote commits.

Decision: rejected.

### Approach C — Expand automation before acceptance

**Purpose** — Add installed-transcription and `ffprobe` assertions to the release harness before running the manual E2E.

**Current state**

```text
release:check
  → packed build/check/browser/short-render smoke

manual final gate
  → installed transcribe + full render + ffprobe
```

**Expected state**

```text
release:check
  → packed transcribe + full media probing
  → broader automated contract
```

Pros:

- Reduces future manual coverage.
- Detects more media-contract regressions in one command.

Cons:

- Expands scope beyond the approved packed-smoke contract.
- Adds provider-fixture and platform/tooling complexity before closing the current PR.
- Does not remove the need for a real authored DNS visual review.

Decision: defer as follow-up hardening. The preserved manual installed-transcribe and `ffprobe` gates remain mandatory.

## 1. Candidate and commit boundary

**Purpose** — Establish one auditable candidate while acknowledging the pre-gate implementation commit and the separately authorized planning-artifact commit.

**Current state**

```text
checkpoint says:
  active changes uncommitted

repository before planning commit:
  HEAD = 77e36e1
  final PASS absent

2026-07-26 user instruction:
  commit the design/plan/goal artifacts first
```

**Expected state**

```text
77e36e1 = recorded pre-gate implementation baseline exception
planning docs commit = explicitly authorized documentation-only baseline
remaining implementation fixes = active working-tree changes

active tree ──snapshot──→ temporary validation checkout
                              ↓
                       throwaway clean commit
                              ↓
                    artifact identity under test
```

The existing implementation commit must not be rewritten solely to simulate compliance. The documentation-only planning commit is explicitly authorized before implementation and must contain no production, test, evidence, render, or PR-state change. After that commit, no additional active-branch commit or push occurs before `PASS` and separate explicit authorization.

The temporary validation checkout must reproduce the intentional active tree while excluding ignored evidence, dependencies, build products, credentials, and unrelated temporary files. Its commit SHA, tree SHA, clean status, npm version, artifact metadata, and tarball hashes become the candidate identity.

## 2. Safe and unique slug contract

**Purpose** — Prevent duplicate composition ownership, path traversal, and HTML attribute injection before planning or output mutation.

**Current state**

```text
slug mapping
  → non-empty check only
  → authored-frame path
  → composition/template/host IDs
  → HTML attributes

examples accepted today:
  intro → same
  recap → same
  intro → ../outside
  intro → x" data-start="999
```

**Expected state**

```text
voice IDs + slug mappings
  ↓
validate complete, safe, unique mapping
  ├─ one mapping per voice ID
  ├─ no unknown mapping keys
  ├─ unique mapped values
  ├─ single path segment
  └─ grammar: ^[A-Za-z0-9][A-Za-z0-9._-]*$
  ↓
plan → filesystem paths → HTML identities
```

Reserved values `.` and `..` are invalid. Slashes, backslashes, whitespace, quotes, control characters, and HTML metacharacters are invalid under the grammar. Existing values such as `01-intro` and `05-load-factor` remain valid.

Validation must protect both CLI configuration loading and direct `plan()` callers. Failure must occur before neutral files, framework files, managed outputs, or temporary promotion state change. The error must identify the offending voice mapping and reason without interpolating unsafe content into generated HTML.

The contract applies to:

- authored frame filenames;
- frame IDs and composition IDs;
- embedded template IDs;
- host element IDs;
- timeline ownership keys.

## 3. Build project-directory contract

**Purpose** — Fail early and accurately when `md2vid build` receives a path that is not a directory.

**Current state**

```text
md2vid build <regular-file>
  → existsSync = true
  → look for <regular-file>/audio_meta.json
  → misleading missing-metadata error
```

**Expected state**

```text
md2vid build <path>
  → resolve path
  → require directory using the repository's directory policy
      ├─ missing       → not a directory
      └─ regular file → not a directory
  → resolve layout and required files
```

The error contract must stay consistent with other CLI path validation. The directory check precedes layout resolution and metadata lookup. Existing valid flat and canonical directories remain unchanged.

## 4. Review-thread convergence

**Purpose** — Finish the PR with every existing review thread either fixed with evidence or explicitly resolved with a verified technical disposition.

**Current state**

```text
PR #12 at remote 60fe838
  ├─ fixed locally but unresolved remotely
  │    ├─ Remotion workflow documentation
  │    └─ managed-file post-commit cleanup
  ├─ still valid
  │    ├─ plan heading hierarchy
  │    ├─ build regular-file validation
  │    └─ Remotion direct verify fallback
  └─ not reviewed remotely
       └─ local 77e36e1 changes
```

**Expected state**

```text
post-PASS pushed candidate
  → reply in each original thread
  → link exact code/test evidence
  → resolve fixed threads
  → rerun CodeRabbit on current head
  → zero unresolved blocking threads
```

The completion candidate will:

- fix all four plan-part heading increments from H1 directly to H3;
- fix the build regular-file defect with a regression test;
- preserve the already-correct `npm run check` documentation and managed-file commit boundary;
- make `verify(videoDir)` use `videoDir` as the fallback shared directory when no explicit `sharedDir` is supplied, with a focused direct-adapter regression test;
- avoid unrelated changes to Remotion emission unless the regression demonstrates they are required.

Replies must be posted in the original inline threads after the candidate is pushed. A top-level summary does not replace thread-specific resolution.

## 5. Repository verification matrix

**Purpose** — Prove the candidate passes every source, snapshot, packed-release, and whitespace gate in one uninterrupted sequence.

**Current state**

```text
prior runs
  → useful evidence
  → performed before remaining fixes

bare git diff --check on clean branch
  → does not inspect main...HEAD commits
```

**Expected state**

```text
npm 11.15.0
  → typecheck
  → Remotion typecheck
  → full tests
  → skill references
  → public snapshot
  → release check
  → committed-range whitespace
  → working-tree whitespace
  → gate record
```

Required order:

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

The final-gate checklist must be corrected to include both whitespace commands. A documentation-contract test must prevent regression to a bare working-tree-only gate.

Any non-zero exit stops the sequence. Preserve the failing log, record `FAIL`, and return to the relevant focused test. After a fix, restart the complete matrix from the first command.

Warnings are recorded separately from failures. Existing dependency-audit or install-script warnings do not become failures unless a configured command exits non-zero or the warning invalidates the isolated execution contract.

## 6. Independent review gate

**Purpose** — Close Task #115 only after independent reviewers evaluate the final post-fix candidate rather than an earlier tree.

**Current state**

```text
spec review     → completed with blockers
quality review  → completed with blockers
reviewer tests  → completed with blockers
Task #115       → remains open
```

**Expected state**

```text
post-fix candidate
  ├─ spec-reviewer
  ├─ code-quality-reviewer
  └─ tester
       ↓
zero Must fix findings
       ↓
reviews preserved under evidence
       ↓
Task #115 complete
```

The three reviews run independently and may run in parallel. Each must cover:

- safe slug ownership and identity;
- build path validation;
- top-level style and script transport;
- exact configured GSAP removal;
- two-frame global-to-local conversion;
- standalone/composed parity;
- nonmonotonic seeks;
- timeline/controller uniqueness;
- evidence confinement and identity;
- final gate completeness.

A Must fix finding reopens implementation and all affected checks. Nice-to-have findings are either adopted or explicitly deferred with a reason in the completion record.

## 7. Artifact packing and isolated installation

**Purpose** — Prove the candidate works only from its packed npm artifact and package-owned dependencies.

**Current state**

```text
preserved tarball
  → verifies temporary commit 39209f80
  → not the final candidate identity
```

**Expected state**

```text
temporary validation commit
  → release:pack
  → artifact.json identity check
  → tarball SHA-256/SRI
  → fresh npm prefix
  → local node_modules/.bin/md2vid
  → no global/repository imports
```

The installation record must include:

- temporary validation commit and tree;
- tarball path, size, SHA-256, and SRI;
- npm version `11.15.0`;
- installed `md2vid` executable and real target;
- installed package and HyperFrames versions;
- CLI help exit code;
- lifecycle, audit, or install-script warnings;
- checks proving no global executable or active repository module is used.

The artifact and install directories remain available until all evidence is copied and hashed.

## 8. Fresh DNS black-box workflow

**Purpose** — Prove a user can turn representative Markdown into a verified preview using only the installed artifact and supported narration workflow.

**Current state**

```text
prior DNS E2E
  → rendered successfully
  → required manual audio_meta.json corrections
  → not accepted

Task #115 packed smoke
  → validates fixtures and short render
  → does not replace fresh DNS acceptance
```

**Expected state**

```text
fresh installed tarball
  → fresh DNS project
  → reviewed Markdown coverage
  → storyboard/script/authored frames
  → fresh Kokoro WAVs
  → installed md2vid transcribe
  → build
  → check
  → preview and deterministic seek review
```

Only reviewed authored source inputs may be carried forward. Generated outputs, metadata, builds, prior project directories, and prior MP4s must not be copied.

Narration requirements:

- generate fresh WAV files through the supported local Kokoro route;
- run the installed `md2vid transcribe` path;
- never manually edit `audio_meta.json`;
- verify each voice path and sample-accurate duration;
- verify every word satisfies `0 <= start <= end <= duration_s`;
- preserve the raw emitted metadata and validation output.

Build and preview requirements:

- `npm run build` and `npm run check` exit `0`;
- all staged narration digests match the source snapshots;
- all emitted narration digests match the staged files;
- no CDN GSAP fallback is present;
- no repository-source import is present;
- browser console and runtime contain no errors;
- frame 2 maps global `3.6`, `5.9`, and `6.4` seconds to local `0.1`, `2.4`, and `2.9` seconds;
- exactly one scoped controller/timeline exists per frame;
- no `__hf2` mount or `const tl` redeclaration collision exists;
- standalone and composed states match;
- nonmonotonic cross-frame seeks restore the correct visual and caption state.

## 9. Render approval and media inspection

**Purpose** — Render only an approved preview and prove the final file satisfies the video, audio, duration, and content contracts.

**Current state**

```text
preview evidence absent for final candidate
  → no render authorization
  → no accepted final MP4
```

**Expected state**

```text
machine checks pass
  + visual review passes
  + explicit render approval
  → render MP4
  → ffprobe
  → extracted-frame review
  → audio-tail review
  → accepted media evidence
```

Rendering is a hard stop point. It begins only after machine assertions and the visual preview are explicitly approved.

Required `ffprobe` evidence:

- one H.264 video stream;
- dimensions `1920x1080`;
- one AAC audio stream;
- finite positive duration;
- duration within the documented tolerance of `build_plan.json.totalDuration`;
- non-zero reported and filesystem size.

Inspection must use frames extracted from the rendered MP4, not preview state. Check the intro, each source section, transitions, midpoint states, captions, final visual frame, and audio tail. Reject blank, black, unstyled, partially mounted, stale, clipped, or out-of-order output.

## 10. Evidence, cleanup, and final decision

**Purpose** — Preserve enough evidence to reproduce the decision while leaving no temporary process or directory behind.

**Current state**

```text
old E2E evidence
  → useful history
  → stale candidate identity
  → no final PASS
```

**Expected state**

```text
new completion evidence
  ├─ identities and hashes
  ├─ full gate logs
  ├─ review reports
  ├─ transcription metadata
  ├─ browser assertions/snapshots
  ├─ MP4 + ffprobe + extracted frames
  └─ cleanup record
       ↓
explicit PASS or FAIL
```

Store new evidence under the ignored directory:

```text
docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/
```

The evidence manifest must hash every preserved file and remain free of credentials and secrets. Preserve failure evidence before cleanup.

Cleanup covers:

- temporary validation checkout;
- artifact and isolated-install directories;
- fresh DNS project;
- preview/studio servers;
- browser processes;
- renderers and FFmpeg children;
- unrelated temporary files created by the run.

The post-execution check must record:

- active and validation identities;
- exact command results and test counts;
- artifact and MP4 hashes;
- review dispositions;
- warnings and deviations;
- cleanup results;
- explicit `PASS` or `FAIL`.

The final tracked check and checkpoint updates are expected documentation-only changes created after the validation artifact. Record that delta explicitly and verify it does not alter the packed package payload.

## 11. PR synchronization after PASS

**Purpose** — Make PR #12 reflect the accepted candidate and obtain current remote verification without granting implicit merge or release permission.

**Current state**

```text
local accepted work: not yet established
remote PR: 60fe838
remote checks/review: stale for local 77e36e1
```

**Expected state**

```text
local PASS
  → explicit user authorization
  → commit active candidate and tracked records
  → push PR branch
  → update PR description
  → reply/resolve review threads
  → CI + CodeRabbit on current head
  → PR ready-to-merge decision
```

After `PASS`, commit and push still require explicit authorization. The PR description must replace stale test counts and artifact claims with the accepted run. Every inline review response must reference current code or test evidence.

A new remote blocker returns the work to the relevant focused test and affected gates. The PR is ready to merge only when:

- required remote checks pass on the pushed head;
- no blocking review thread remains;
- the local completion record remains accurate;
- the branch is mergeable.

Merge, version bump, tag, and publish are separate user-authorized actions.

## Error handling and stop conditions

**Purpose** — Prevent partial success or a workaround from being reported as completion.

**Current state**

```text
prior E2E
  → successful MP4
  + manual metadata corrections
  → correctly recorded FAIL
```

**Expected state**

```text
any failed requirement
  → stop downstream actions
  → preserve failure evidence
  → record FAIL
  → fix root cause
  → rerun affected focused checks
  → restart required uninterrupted gate
```

Stop immediately when:

- a focused regression test fails unexpectedly;
- any independent review has a Must fix finding;
- any repository matrix command exits non-zero;
- artifact identity does not match the temporary validation commit;
- the isolated executable resolves globally or into the repository;
- transcription requires manual metadata correction;
- build/check/browser assertions fail;
- preview approval is absent;
- render, probe, extracted-frame, or audio inspection fails;
- evidence cannot be preserved safely;
- credentials or secrets appear in evidence.

No workaround can be reclassified as `PASS`. Fix the source or record `FAIL`.

## Testing strategy

**Purpose** — Use focused red-green tests for each defect, then prove no regression through the full source and black-box gates.

**Current state**

```text
broad tests and release smoke pass
  + two uncovered correctness defects
  + stale final black-box evidence
```

**Expected state**

```text
focused RED
  → minimal fix
  → focused GREEN
  → independent reviews
  → full repository matrix
  → packed isolated DNS E2E
  → rendered media inspection
```

Focused automated coverage:

1. `engine/__tests__/config.test.ts`
   - unsafe slug grammar;
   - duplicate slug values;
   - missing and unknown mappings;
   - valid existing slug forms.
2. `engine/__tests__/plan.test.ts`
   - direct planning rejects unsafe and duplicate mappings.
3. `test/cli/workflows.test.ts`
   - invalid mappings fail before managed output mutation.
4. `test/cli/run-exports.test.ts`
   - build rejects a regular-file project path with the expected error.
5. `frameworks/remotion/__tests__/verify.test.ts`
   - direct `verify(videoDir)` uses `videoDir` for caption-group verification when `sharedDir` is omitted.
6. `test/cli/package-meta.test.ts`
   - the final runbook checks both `main...HEAD` and working-tree whitespace.

Full automated coverage is the uninterrupted matrix in section 5.

Manual acceptance coverage is the installed-artifact DNS workflow, browser seek assertions, approved render, `ffprobe`, extracted-frame inspection, audio-tail inspection, evidence manifest, and cleanup record.

Optional follow-ups—not required for this PR—may add installed-transcribe execution and full media probing to the automated release harness or replace source-text browser-smoke assertions with extracted behavioral validators.

## Acceptance criteria

The design is complete when all of the following are true:

- [ ] Unsafe, duplicate, path-escaping, and HTML-breaking slug mappings fail before output mutation.
- [ ] A regular-file build path fails as `not a directory`.
- [ ] The final runbook checks committed and uncommitted whitespace.
- [ ] Every existing PR review thread has a current, evidence-backed disposition.
- [ ] Three independent post-fix reviews contain no Must fix finding.
- [ ] The full repository matrix passes uninterrupted with npm `11.15.0`.
- [ ] A fresh artifact identifies the exact temporary validation commit and tree.
- [ ] The tarball installs and runs without a global CLI or repository source.
- [ ] Fresh Kokoro narration and installed transcription require no metadata edits.
- [ ] Build, check, browser runtime, local-time conversion, captions, and audio synchronization pass.
- [ ] Render begins only after explicit machine and visual approval.
- [ ] The final MP4 passes codec, dimensions, audio, duration, content, transition, final-frame, and audio-tail checks.
- [ ] Evidence is complete, hashed, ignored, credential-free, and preserved before cleanup.
- [ ] Temporary resources and processes are removed.
- [ ] The post-execution check records explicit `PASS` or `FAIL`.
- [ ] No active-branch commit or push occurs before `PASS` and explicit authorization.
- [ ] PR #12 receives current CI/review after the accepted candidate is pushed.
- [ ] Merge, version bump, and publish remain unperformed without separate authorization.
