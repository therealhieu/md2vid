# Canonical Review Artifact

- Review scope: Part 3, Task 9.3 deviation prerequisite
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/dependency-pr-ci-blockers/.worktrees/hyperframes-0-7-88`
- Scope mode: `clean-head`
- Scope origin: `82a4044d04e495d9883ccb79302e4d2f3f2c7cf0`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.hyperframes-0.7.88.obdGZz/task-scope.patch`
- Created: 2026-08-05
- Tester dispatched: yes

---

# Tester report — HyperFrames 0.7.88 evidence

**Scope:** `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/dependency-pr-ci-blockers/.worktrees/hyperframes-0-7-88` at `f577c1a72699e87770cfd27d1617136379b57cc5`.

## Findings

- **TEST-MF:** None.
- **TEST-NTH:** None.

## Exact commands and results

| Command | Result |
|---|---|
| `git diff --name-status 82a4044d...f577c1a` | Only added `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/unit-b-hyperframes-0.7.88.md`. |
| `git apply --reverse --check "$task_scope_patch"` | Exit 0; supplied scope patch exactly reverses the committed evidence. |
| `corepack npm view hyperframes@0.7.88 dist --json` | Registry metadata reports tarball URL, SHA-1 `5555ed44070807cb1e94ae9bccb8d3de7d9b822e`, and SRI `sha512-QYqdW/.../aCNpAaSqQ==`. |
| `corepack npm pack hyperframes@0.7.88 --json` | Downloaded `hyperframes-0.7.88.tgz`; npm reports the same SHA-1 and SRI. |
| Temporary extracted-tarball proof script, run with `node --experimental-strip-types` against `frameworks/hyperframes/patches.ts` | `hyperframes@0.7.88`; local SHA-1 and SHA-512 SRI exactly match registry metadata. Three `index-*.js` Studio candidates; exactly one match: `dist/studio/assets/index-DbY124Po.js`, using only the existing `0.7.87` (`rr` / `p` / `v`) variant. Original anchors: `1,1`; initial patch markers: `0,0`; after patch: originals `0,0`, markers `1,1`; second patch produced byte-identical output. |
| `corepack npm --version && node --test frameworks/hyperframes/__tests__/patch-studio.test.ts` | `11.15.0`; **13/13 pass**. |
| `node --test test/cli/hyperframes-self-heal.test.ts` | **14/14 pass**. Includes multiple-match fail-closed, no-match fail-closed, reviewed 0.7.87 layout, byte-idempotence, concurrency, and transactional rollback cases. |
| `node --test test/cli/hyperframes-cli.test.ts` | **13/13 pass**. |
| `node --test test/cli/hyperframes-render-policy.test.ts` | **15/15 pass**. |
| `git diff --exit-code origin/main -- package.json package-lock.json` | Exit 0; both manifests unchanged from `origin/main`. |
| Direct JSON assertion on `package.json` and `package-lock.json` root dependencies | Both remain `hyperframes: "0.7.80"`. |
| Final `git status --short` | Empty; no tracked or untracked worktree mutations. |

## Consolidated checklist

| Check | Result |
|---|---|
| Published package identity | `hyperframes@0.7.88` confirmed |
| Tarball identity/integrity | SHA-1 and SHA-512 SRI match npm registry metadata |
| Candidate bundle count | 3 |
| Matching Studio bundles | Exactly 1 |
| Selected bundle | `dist/studio/assets/index-DbY124Po.js` |
| Existing variant selection | Exactly existing `0.7.87` variant |
| Pre-patch anchor counts | `1, 1` |
| Pre-patch marker counts | `0, 0` |
| Post-patch original anchors | `0, 0` |
| Post-patch markers | `1, 1` |
| Byte idempotence | Pass |
| Duplicate-variant assessment | A duplicated matching variant configuration yields two selected variants; `selectStudioPatchVariant` fails closed on `variants.length !== 1`, so it is ambiguous rather than useful |
| Focused patch suite | 13/13 pass |
| CLI self-heal suite | 14/14 pass |
| Relevant pinned CLI checks | 13/13 and 15/15 pass |
| Manifest/root pin preservation | `package.json` and `package-lock.json` unchanged; root pin remains `0.7.80` |
| Scope compliance | Only expected evidence path changed from scope origin |

## Mutation disclosure

- **Tracked files:** none modified.
- **Worktree state:** clean before and after testing.
- **Disposable files:** created and removed `/tmp/hyperframes-0.7.88-proof.KM1eiM`; test suites also created and cleaned their own OS temporary fixtures.
- **External cache:** `corepack npm pack` may have read or populated the user npm/Corepack cache; this was outside the repository and was not inspected.

## Residual risks

- Verification is tied to the tarball currently served by npm registry metadata and the tested package bytes. It does not independently validate npm publisher provenance or the registry signature’s cryptographic chain.
- The root dependency intentionally remains `0.7.80`; this evidence proves compatibility of the existing patch logic with 0.7.88 but does not install or promote 0.7.88 in the project.
