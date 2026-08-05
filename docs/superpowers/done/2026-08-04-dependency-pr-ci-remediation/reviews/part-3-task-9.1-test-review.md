# Canonical Review Artifact

- Review scope: Part 3, Task 9.1 deviation prerequisite
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id`
- Scope mode: `clean-head`
- Scope origin: `f6add45f954daf13d054948f0aaf8718e6ecb844`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T/superpowers-scope.repo-id.W2Sxtw/task-scope.patch`
- Created: 2026-08-05
- Tester dispatched: yes

---

## Scope/Suites

Scope matches the required two files:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/.github/workflows/dependabot-branch-refresh.yml`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/test/ci/workflows.test.ts`

Patch is four value replacements only. Workflow changes update the GraphQL repository ID at:

- Queue-policy validation: `dependabot-branch-refresh.yml:208`
- Mutation live-query revalidation: `dependabot-branch-refresh.yml:419`

The test retains the exact-ID structural guard at `test/ci/workflows.test.ts:2204` and updates the executable GraphQL fixture at `:2282`. All other v2 workflow guards are unchanged.

| Check | Result |
|---|---|
| Workflow suite | Pass — 81/81 |
| `actionlint .github/workflows/*.yml` | Pass |
| Full Node suite | Pass — 1281/1281 |
| Release validation | Pass — package, install, CLI, skill isolation, HyperFrames/Remotion smoke, narration |
| Diff whitespace check | Pass |
| Stale-ID mutation relevance | Pass — mutant fails |
| Public snapshot check | Blocked by local npm version mismatch |

## Must fix

None.

## Nice to have

None.

## Consolidated checklist

- [x] Base `f6add45f954daf13d054948f0aaf8718e6ecb844` contains stale `R_kgDOThQpsA` in both workflow validation points and test fixture/expectation.
- [x] Patch replaces it with exact live `R_kgDOThRpkA` at both required workflow boundaries.
- [x] Queue-policy validation remains closed over repository ID, owner/name, and URL at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/.github/workflows/dependabot-branch-refresh.yml:257-268`.
- [x] Mutation revalidation retains the same ID, owner/name, URL, PR ID, and head OID checks at `:499-506`.
- [x] Existing mutation sequence remains `live query → disable auto-merge → live query → rebase` at `:513-533`.
- [x] Exact two-file scope confirmed; target worktree remained clean.
- [x] `git diff --check` passed.

## Residual risks

### TEST-001 — Public snapshot verification is not reproducible in this local npm environment

**Evidence**

`npm run public:snapshot:check` exits before snapshot evaluation:

```text
public snapshot check: npm version: expected 11.15.0, got 11.17.0
```

`package.json:8` declares `npm@11.15.0`. This is an environment/toolchain mismatch, not introduced by the two-file patch.

**Guidance**

Run the snapshot check under npm 11.15.0, such as through the repository’s pinned Corepack setup.

**Success checklist**

- [ ] `npm --version` reports `11.15.0`
- [ ] `npm run public:snapshot:check` passes

### Mutation relevance

A temporary, isolated copy of the workflow was changed from `R_kgDOThRpkA` back to `R_kgDOThQpsA`; no repository files were modified. The targeted test run failed as required:

```text
Dependabot branch refresh workflow enforces the exact privileged boundary
AssertionError: expected /id: "R_kgDOThRpkA"/
stale-id-mutant-exit=1
```

The same run’s executable GraphQL policy test passed, confirming the updated fixture exercises the current ID while the structural guard catches regression to the stale value.

### Command mutations

- No target-worktree files were edited.
- Workflow/full/release tests created only their normal OS temporary artifacts.
- Mutation relevance created a temporary copied fixture under `/private/var/folders/.../tmp.*` and removed it with `trap` cleanup.
- Final target status showed only the two expected branch-vs-base files and no uncommitted changes.
