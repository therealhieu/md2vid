# Stabilize md2vid CLI Workflows — Post-Implementation Check

## Source documents

- Goal: `docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-goal.md`
- Design: `docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-design.md`
- Plan index: `docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-plan.md`
- Plan parts: `2026-07-24-stabilize-cli-workflows-plan-1.md` through `2026-07-24-stabilize-cli-workflows-plan-4.md` in the same directory.

## Implementation commits

| Task | Commit | Subject |
|---|---|---|
| 1 | `10681322663c8aea5b978ccf9b2a8c47af1869e7` | `refactor(cli): add strict command parsing` |
| 2 | `a3cd1fc9627e3025c5f179bf86591e76adbbe3fd` | `refactor(cli): centralize project layout resolution` |
| 3 | `d1483d22bbfbcd714762631bcccf712c1eac01e3` | `fix(engine): separate voice identity from frame order` |
| 4 | `ae996cdffefba95192e931055c076b62d423283a` | `fix(cli): require valid configuration during verify` |
| 5 | `24a7ae10744109ea3dc2a270f6d4456a560db7ca` | `fix(captions): make regroup failure-atomic` |
| 6 | `b0221dc837283a7755fa042fa274dbc6767fffee` | `feat(scaffold): add verified narration workflow` |
| 7 | `00317cffef62f99f83e1473bd43aa2b817eed015` | `fix(remotion): make default scaffold content-neutral` |
| 8 | `295c0ec6dfe61cefaf86cbf3884631fbd1cbec32` | `test: cover installed first-run workflows` |
| 9 | `b9c93dea7826dea94c3173586d2dd999c740d593` plus the completion commit containing this record | `docs: synchronize stable CLI workflows`; completion/final-review fixes are in `docs: document stable CLI workflows` |

The completion commit is identified by its subject rather than a fabricated self-hash: a commit cannot contain its own final object ID. Completion: **9/9 tasks implemented and verified**.

## TDD and documentation checks

| Command | Result |
|---|---|
| `node --test test/cli/skill-commands.test.ts test/cli/skill-references.test.ts` before documentation edits | Expected RED: 19 passed, 3 failed on missing shipped narration/workflow contracts. |
| `corepack npm run sync:skill-references` | Exit 0; regenerated synchronized references from authoritative standards. |
| `node --test test/cli/skill-commands.test.ts test/cli/skill-references.test.ts` after edits | Exit 0; 22 passed, 0 failed. |
| `corepack npm run check:skill-references` | Exit 0. |
| `node --test test/cli/package-meta.test.ts` after replacing the stale direct-typecheck README expectation | Exit 0; 17 passed, 0 failed. |
| `node --test test/cli/skill-commands.test.ts` before the final path-consistency fix | Expected RED: 12 passed, 2 failed because explicit flat/canonical branch sections were absent. |
| `node --test test/cli/skill-commands.test.ts` after the final path-consistency fix | Exit 0; 14 passed, 0 failed. |
| Final documentation run: `node --test test/cli/skill-commands.test.ts test/cli/skill-references.test.ts` | Exit 0; 24 passed, 0 failed. |

## Complete gates

The final uninterrupted gate sequence ran in the required order with repository-pinned Corepack npm:

| Order | Command | Exact result |
|---:|---|---|
| 1 | `corepack npm run typecheck` | Exit 0. |
| 2 | `corepack npm run typecheck:remotion` | Exit 0. |
| 3 | `corepack npm test` | Exit 0; 581 passed, 0 failed, 0 skipped. |
| 4 | `corepack npm run check:skill-references` | Exit 0. |
| 5 | `corepack npm run public:snapshot:check` | Exit 0; 581 snapshot tests passed and `public snapshot check passed at 279875b4bbf23b98b212a58a0d11f718e58c2d8e`. |
| 6 | `corepack npm run release:check` | Exit 0; 581 tests passed; packed the current checkout, installed the tarball in isolation, passed CLI/skill checks, HyperFrames generated build/check + bounded Studio HTTP smoke, and Remotion generated build/check/still smoke. Artifact: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T/md2vid-release-DZDWum/artifacts/md2vid-0.1.2.tgz` during the final ordered run. |

## Packed-artifact manual CLI smoke

Because `release:check` removes its invocation-owned artifact directory after success, the manual smoke used the same release harness in retained-output mode:

```text
corepack npm run release:pack -- --output <temporary-pack-directory>
```

The resulting `md2vid-0.1.2.tgz` was installed into a fresh temporary npm project. These commands all exited 0:

- `md2vid --help`
- `md2vid new --help`
- `md2vid build --help`
- `md2vid regroup --help`
- `md2vid transcribe --help`
- `md2vid verify --help`
- `md2vid patch-studio --help`
- `md2vid install-skill --help`

Scaffold checks:

- `md2vid new hf-smoke` exited 0.
- `md2vid new remotion-smoke --framework remotion` exited 0.
- Both scaffolds contained `audio_request.json.example`.
- Both scaffold package manifests contained non-empty `build`, `verify`, and `check` scripts.
- The Remotion scaffold's TypeScript source contained no hash-table, collision, or load-factor subject matter.
- The temporary packed-artifact and install directories were removed and confirmed absent.

After final review changed the user-facing path guidance, the packed smoke was repeated. It created fresh `hf-flat` and `remotion-flat` projects, verified their generated `transcribe`, `build`, `verify`, and `check` scripts plus narration examples, verified the packed skill's complete flat/canonical branches and absence of `md2vid audio`, and removed both temporary directories.

## Review outcomes

- Documentation contract review: authoritative README/standards, generated references, and `/md2vid` orchestration agree on meaningful IDs, `voices[]` array ordering, generated build/check before preview/still/studio/render, no `md2vid audio` command, neutral Remotion defaults, and the opt-in hash-table example.
- Reference review: generated copies are byte-identical to authoritative standards; no generated reference was hand-edited after synchronization.
- Scope review: changes are limited to public documentation, synchronized skill references, documentation contract tests, the approved design's whitespace cleanup, and this completion record.
- Final review found and fixed two issues: the skill previously switched from a flat scaffold to canonical paths mid-workflow, and the approved design retained trailing whitespace on its date/status lines.
- Strong branch contract tests now validate complete flat and canonical sequences, including artifact locations and transcribe/build/check/review/render commands.
- `git diff --check main..HEAD`: clean after the amended completion commit.
- Final review outcome: no remaining correctness, completeness, consistency, whitespace, or scope findings.

## Deviations

1. The final `npm test` gate initially exposed a stale README contract assertion requiring direct `npm run typecheck`. The shipped workflow intentionally uses generated `npm run check`, which includes framework typechecking. The assertion was updated, its focused test passed 17/17, and the complete six-gate sequence was restarted from gate 1 and passed.
2. The first manual-smoke attempt referenced the release harness's already-cleaned temporary tarball. Its temporary install directory was still removed. The smoke was rerun successfully with `release:pack --output`, which is the harness's supported retained-artifact mode.
3. Task 9 spans implementation commit `b9c93dea7826dea94c3173586d2dd999c740d593` and the amended completion/final-review commit `docs: document stable CLI workflows`. The completion commit is named but has no self-hash in this file because embedding that hash would change the commit object and invalidate it.
4. The first final-review `release:check` invocation exited non-zero without a stable reproduced failure. An immediate diagnostic rerun passed all 581 tests and every pack/install/framework smoke, and the complete ordered gate sequence was then rerun from gate 1.

## Remaining risks and follow-ups

- The isolated npm installs emitted dependency audit warnings (`1 moderate`, `4 high`) and the manual npm install reported blocked dependency install scripts under npm's `allowScripts` policy. The required release harness, packed CLI help, and both scaffold smokes still passed. Dependency remediation and install-script policy changes are outside this documentation task.
- No functional follow-up is required for the stabilized CLI workflows.
