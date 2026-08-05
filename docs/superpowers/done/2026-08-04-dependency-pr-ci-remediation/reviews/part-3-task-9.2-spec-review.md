# Canonical Review Artifact

- Review scope: Part 3, Task 9.2 deviation prerequisite
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/dependency-pr-ci-blockers/.worktrees/dependabot-refresh-live-query`
- Scope mode: `clean-head`
- Scope origin: `44904123724d86a9367b00eb05027e5f68317162`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.live-query.IQsMSc/task-scope.patch`
- Created: 2026-08-05
- Tester dispatched: yes

---

## Spec Review — Part 3, Task 9.2 Prerequisite

### Must fix

None.

### Nice to have

None.

### Evidence

- Scope is exact and clean:
  - Changed paths: `.github/workflows/dependabot-branch-refresh.yml`, `test/ci/workflows.test.ts`
  - `git diff --check` passed.
  - Working tree is clean.

- The live query is now correctly root-level in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/dependency-pr-ci-blockers/.worktrees/dependabot-refresh-live-query/.github/workflows/dependabot-branch-refresh.yml:427`:

  ```graphql
  repository(owner: $owner, name: $name) { ... }
  pullRequest: node(id: $pullRequestId) {
    ... on PullRequest { ... }
  }
  ```

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/dependency-pr-ci-blockers/.worktrees/dependabot-refresh-live-query/.github/workflows/dependabot-branch-refresh.yml:502` validates:
  - Root repository ID, `nameWithOwner`, URL.
  - PR node ID and exact expected head OID.
  - PR `repository`, `baseRepository`, and `headRepository` ID, `nameWithOwner`, and URL.

- The required mutation ordering remains fail-closed:

  ```text
  live query → disable auto-merge → live query → REBASE(expectedHeadOid)
  ```

- Security and policy boundary remains intact:
  - App token SHA pin with `# v2.2.2`, exact owner/repository scope, and exact token permissions.
  - Top-level and job `permissions: {}`.
  - Checkout-free execution with no npm/cache/artifact/local-action expansion.
  - Existing queue, REST/GraphQL identity, signed single-commit, patch allowlist, SQUASH/github-actions tuple, fixed summary, and branch-protection checks are preserved.

- Regression coverage in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/dependency-pr-ci-blockers/.worktrees/dependabot-refresh-live-query/test/ci/workflows.test.ts`:
  - Rejects the former nested-node query shape through an exact root-level query assertion at `2910`.
  - Uses root-level `data.repository` and `data.pullRequest` fixture shape at `2599`.
  - Exercises that response shape at both live-check positions in the executable mutation sequence at `2925`.
  - Preserves failure-closed tests for first and second head mismatches and identity/mutation failures.

- Strict TDD sequence is evidenced by commits:
  - `427d26d test(ci): cover root live PR query` changes only `test/ci/workflows.test.ts`; against its parent, the workflow still contains the invalid nested `repository { node(...) }` shape.
  - `3a22b51 fix(ci): query live pull request at root` changes only `.github/workflows/dependabot-branch-refresh.yml`.

- Independent targeted verification:
  - `node --test test/ci/workflows.test.ts` → **82 passed, 0 failed**.

### Guidance

No changes are needed for this prerequisite. Keep the root-level response contract coupled to the executable mutation harness if the live query is changed later; it prevents returning to the invalid `Repository.node` shape.

### Success checklist

- [x] Root `repository(owner:name)` query retained.
- [x] Root `node(id:$pullRequestId)` query retained.
- [x] Exact root repository, PR, and PR repository/base/head identity checks retained.
- [x] Required live → disable → live → REBASE sequence retained.
- [x] Existing trust, authorization, provenance, queue, summary, and protection controls preserved.
- [x] Nested-node regression rejected.
- [x] Root-level response exercised for both live mutation-stage checks.
- [x] Test-only RED commit precedes minimal workflow-only GREEN commit.
- [x] No workflow dispatch or PR mutation performed during review.
- [x] Scope and whitespace checks pass.

### Consolidated checklist

```text
Task scope        → exact two files only
TDD history       → test-only RED → workflow-only GREEN
GraphQL shape     → root repository + root PR node
Live verification → repository + PR + PR/base/head identities
Mutation safety   → live → disable → live → REBASE(expected head)
Regression        → nested shape rejected; root response exercised twice
Verification      → 82/82 workflow tests pass
```

### Residual risks

- GitHub-side behavior remains dependent on live API availability and token configuration; this review intentionally did not dispatch the workflow or mutate PR #47.
- The workflow fails closed on GraphQL transport, schema, response-shape, or identity mismatches, so a future GitHub API change blocks the refresh rather than weakening the trust boundary.
