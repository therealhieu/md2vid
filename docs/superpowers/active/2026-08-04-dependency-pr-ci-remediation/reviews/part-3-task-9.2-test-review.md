# Canonical Review Artifact

- Review scope: Part 3, Task 9.2 deviation prerequisite
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/dependency-pr-ci-blockers/.worktrees/dependabot-refresh-live-query`
- Scope mode: `clean-head`
- Scope origin: `44904123724d86a9367b00eb05027e5f68317162`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.live-query.IQsMSc/task-scope.patch`
- Created: 2026-08-05
- Tester dispatched: yes

---

## Tester report — Part 3 / Task 9.2 deviation prerequisite

### TEST-MUST-FIX-1 — Root repository identity can be weakened without test failure

`test/ci/workflows.test.ts:2910` checks the root query fields but does not require all three root repository comparisons in `liveMatches()`.

The following temporary-only mutation passed all 82 workflow tests:

```diff
- return repository?.id === expectedGraphqlRepository.id
-   && repository?.nameWithOwner === expectedGraphqlRepository.nameWithOwner
-   && repository?.url === expectedGraphqlRepository.url
+ return repository?.id === expectedGraphqlRepository.id
    && pullRequest?.id === pullRequestId
```

This violates the stated regression requirement: tests must fail if response matching weakens. Add structural assertions for all root `repository` comparisons, and/or executable fixtures that independently corrupt its `nameWithOwner` and `url` before each mutation boundary.

The production implementation itself correctly validates root repository `id`, `nameWithOwner`, and `url` at `.github/workflows/dependabot-branch-refresh.yml:502-519`.

### TEST-NICE-TO-HAVE

None.

## Validation evidence

| Check | Exact command | Result |
|---|---|---|
| Pinned package manager | `corepack npm --version` | `11.15.0` |
| Focused workflow suite | `corepack npm exec -- node --test test/ci/workflows.test.ts` | 82/82 passed |
| Workflow lint | `actionlint .github/workflows/*.yml` | Passed; no output |
| Full project check | `corepack npm run check` | TypeScript checks passed; 1282/1282 tests passed |
| Diff whitespace/scope/status | `git diff --check 44904123724d86a9367b00eb05027e5f68317162..HEAD && git status --short && git diff --name-only 44904123724d86a9367b00eb05027e5f68317162..HEAD` | No whitespace errors; worktree clean; only expected paths changed |
| Commit sequence | `git show --format=fuller --no-ext-diff --stat 427d26d` and `git show --format=fuller --no-ext-diff --stat 3a22b51` | RED test commit followed by GREEN workflow commit |

## Mutation disclosure

All mutations ran in disposable `/tmp` snapshots created with `git archive HEAD`; source `node_modules` was symlinked read-only for dependency resolution. Temporary directories were removed on exit. No tracked implementation files were edited.

| Mutation | Result | Interpretation |
|---|---|---|
| Nest `node(id:)` below `repository` again | Failed, exit 1 | Root-level query structural test catches the original GraphQL regression |
| Remove PR repository `nameWithOwner` and `url` comparisons | Failed, exit 1 | PR repository identity matching is protected |
| Remove root repository `nameWithOwner` and `url` comparisons | **Passed, exit 0** | TEST-MUST-FIX-1 |

## Consolidated checklist

- [x] Scope matches the two allowed paths: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/dependency-pr-ci-blockers/.worktrees/dependabot-refresh-live-query/.github/workflows/dependabot-branch-refresh.yml`, `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/dependency-pr-ci-blockers/.worktrees/dependabot-refresh-live-query/test/ci/workflows.test.ts`
- [x] Commits are RED `427d26d` → GREEN `3a22b51`
- [x] Live PR query uses root-level `pullRequest: node(id:)`
- [x] Production validates root repo, PR repo/base/head repo, PR ID, and expected head before both mutation boundaries
- [x] Privileged guard set and `disable → revalidate → rebase` order remain intact
- [x] Regression detects nesting `node(id:)` under `repository`
- [ ] Regression detects weakening root repository response matching
- [x] Focused, actionlint, full check, diff-check, and clean-worktree validations passed

## Residual risks

- The missing root `nameWithOwner`/`url` regression coverage permits a future edit to reduce root identity validation to ID-only without CI detecting it.
- Public snapshot and release checks were not independently rerun because they are unrelated to this workflow/test-only scope.
