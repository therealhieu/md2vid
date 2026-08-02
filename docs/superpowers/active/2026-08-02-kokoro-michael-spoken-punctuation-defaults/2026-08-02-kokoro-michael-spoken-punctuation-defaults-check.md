# Kokoro Michael and Spoken Punctuation Defaults — Post-Implementation Check

Date completed locally: 2026-08-03

## Outcome

- [x] Tasks 1–13 completed in numeric order.
- [x] External media-use Kokoro `--speed` forwarding prerequisite passed before repository implementation.
- [x] English versioned requests default to `kokoro`, `am_michael`, `en`, and `0.9`.
- [x] `md2vid narration-check` is check-only, deterministic, non-mutating, and supports repeatable exact approvals.
- [x] Actual WAV transcription and versioned narration evidence gate plan/build/regroup/verify while legacy projects remain compatible.
- [x] HyperFrames and Remotion scaffolds share the exact FR-1 request and workflow order.
- [x] `/md2vid` remains the sole production media-use orchestrator; production TypeScript contains no synthesis runner or `md2vid audio` route.
- [x] Canonical docs, generated skill references, package contents, release proof, and public snapshot agree with shipped behavior.
- [x] Retained release fixtures truthfully report `freshSynthesisDuringTest: false` and `freshTranscriptionDuringTest: false`.

## Commits

| Commit | Subject |
|---|---|
| `cd5bb3e5fa1dba538e85ef76d271aa048106e554` | `feat(engine): add narration request policy` |
| `c6546ee041a37ca1c88ab9f3ab863e83a1acead8` | `feat(engine): add narration freshness evidence` |
| `954ceea993af49c958dec498d2417fe61d9ea5a2` | `feat(cli): add narration request preflight` |
| `f1a1ab44fb7ec55575d3bdd76a1beef4280d29ff` | `fix(engine): harden narration preflight` |
| `e8d448042d00da6976d023d2ce16903e3ff5020b` | `fix(transcribe): preserve narration provenance` |
| `119352118324a988c4a820fe9c1fa5ff1777b6ae` | `feat(transcribe): attest narration request and audio` |
| `0589264f1cffe510d9d2196fa858cfd83b7b6b72` | `feat(planning): reject stale narration evidence` |
| `ac9a7037b0682dc98ee5cc428e8b0cdcd11823d3` | `fix(transcribe): harden narration evidence freshness` |
| `595c16ab7af1272efe362f6a8a87fdf5703c18a6` | `feat(scaffold): pin Kokoro Michael narration defaults` |
| `85fb26098bb0dff25d3d393e6667c896417ac3c8` | `docs(skill): require explicit Kokoro media synthesis` |
| `e7eb238b509146b3d92c45a4b0797045377902a0` | `fix(md2vid): harden narration synthesis contract` |
| `7b09a054786874934b34729822ae1c9e0a3c0544` | `docs(md2vid): document Kokoro narration workflow` |
| `d33d2b5f1376db982aaac264e469f8306f842344` | `build(package): require narration artifacts in tarball` |
| `1e87bb4445b689ec88ef7e73a3cbd7a1ce4c550f` | `test(md2vid): harden narration contract coverage` |
| `55b6b6115f17f8a66be8c25f0e9d22c688f4f1ac` | `test(release): prove fixture-backed narration workflow` |
| `417a9f15bbdb6983f3a19c8dfe032749f8355aac` | `test(release): harden retained narration proof` |
| `ab473b3c3a7303dfb500a1eb4ada53899a5ea343` | `test(ci): require narration public snapshot coverage` |
| `880f4f3f8398002499044f6994fb462201dea991` | `chore(public): refresh narration snapshot` |

## Review lifecycle

Six execution scopes completed the required single parallel review pass, same-implementer remediation, and exactly one read-only verifier:

| Scope | Canonical artifacts | Result |
|---|---:|---|
| Part 1 Tasks 1–3 | 3 | All Must fixes resolved; verifier PASS |
| Part 2 Tasks 4–6 | 3 | All Must fixes and adopted Nice items resolved; verifier PASS |
| Part 3 Tasks 7–8 | 3 | All Must fixes resolved; verifier PASS |
| Part 4 Tasks 9–10 | 3 | Must fixes and both Nice items resolved; verifier PASS |
| Part 4 Task 11 | 3 | Must fix and both Nice items resolved; verifier PASS |
| Part 5 Tasks 12–13 | 3 | No findings; verifier PASS |

Canonical artifacts are under `reviews/` and remain untracked by design.

## Retained fixture evidence

| Artifact | Evidence |
|---|---|
| `intro.wav` | Safe duration `1.792s`; SHA-256 `4334b64e55f587ac639be63c75ec7986452556af6ad044147dd20b4cbf1f168d` |
| `followup.wav` | Safe duration `1.706666s`; SHA-256 `cda8b701f2c9b60db41685793014ee1cb61e903fb7276b0b9345b7053af63405` |
| `expected_words.json` | SHA-256 `9c96065bae53fb3c34e1ccd3186f40ee0034555cba0ae5faa46de4b16802b963`; seven absolute words |
| Release label | `fixture-backed Kokoro am_michael narration evidence` |

## Public snapshot

- [x] Generated from committed Task 12 `HEAD` only with `corepack npm run public:snapshot`.
- [x] Count: `321` paths.
- [x] Aggregate hash: `sha256:8d6c00cddcd54aef6ea8525be03d622299a69088488f44cc975a2a628ec1baa5`.
- [x] Includes narration code, tests, docs, skill/references, release proof, fixture metadata, and both retained WAVs.
- [x] Excludes `dist/` and `docs/superpowers/`.

## Verification

All commands used project-pinned `corepack npm` `11.15.0`.

| Check | Result |
|---|---|
| `corepack npm run check:skill-references` | PASS |
| `corepack npm run typecheck` | PASS |
| `corepack npm run typecheck:remotion` | PASS |
| `corepack npm test` | PASS — `1,145/1,145` |
| `corepack npm run build:dist` | PASS |
| `corepack npm run public:snapshot:test` | PASS — `49/49` |
| `corepack npm run public:snapshot:check` | PASS — authenticated snapshot validation, `1,145/1,145`, both framework smokes |
| `corepack npm run check` | PASS — `1,145/1,145` |
| `corepack npm run release:check` | PASS — HyperFrames, Remotion, fixture-backed Kokoro/Michael evidence |
| `git diff --check` | PASS |
| Unexpected-status guard | PASS; only `docs/superpowers/.../reviews/` and this check are untracked |

## Deviations and environment notes

1. The installed media-use Kokoro branch initially did not forward `--speed`. This external prerequisite was fixed outside the md2vid repository with a failing regression test; 21 media-use TTS tests then passed and the exact gate reported `PASS`.
2. Task 10’s plan listed bare `corepack npm run release:pack`, but the pre-existing supported release contract requires `--output <directory>`. Verification used `corepack npm run release:pack -- --output "$artifact_dir"`; no package script or release implementation was changed.
3. One Task 11 attempt used bare npm `11.17.0` and was correctly rejected. The required pinned `corepack npm` `11.15.0` rerun passed.
4. A coordinator shell loop briefly used zsh’s special `path` variable and invalidated that shell’s `PATH`. The invalid baseline attempt was discarded; a fresh immutable baseline and all affected checks were rerun successfully. No repository files changed from that attempt.

No success criterion was weakened and no architectural boundary was crossed.

## Remaining risks

- Release CI intentionally replays retained Kokoro audio instead of freshly synthesizing external audio.
- Managed multi-file rename rollback cannot be crash-atomic across abrupt host/process termination.
- Filesystem freshness reads are snapshots without a cross-process lock; later gates detect persisted divergence.
- Public snapshot delivery lists are intentionally duplicated at assertion sites and must be updated together.

## Pull request and remote CI

- Pull request: [#46](https://github.com/therealhieu/md2vid/pull/46), open against `main`.
- Published head: `880f4f3f8398002499044f6994fb462201dea991` on `origin/worktree-fix-visual-timing-sync`.
- PR title/body were refreshed to describe Kokoro defaults, narration freshness, retained release evidence, and current verification.
- Required remote checks for the published head: PASS.
  - `pr-minimum / validate`
  - `pr-latest / validate`
  - `public-snapshot / validate`
  - `dependency-review`
  - `pr-title`
- Additional checks: `resolve-latest-node` PASS, `CodeRabbit` PASS; `main-full` and Dependabot observer skipped by workflow conditions.
- Branch and worktree are retained while PR #46 remains open.