# Canonical Review Artifact

- Review scope: Part 2, Task 5.2
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `clean-head`
- Scope origin: `950e8bdb78abedf1a38834e6fdbf1a084d089515`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7mdv4k5l7h340000gn/T//superpowers-scope.N7NNCz/task-scope.patch`
- Created: 2026-07-28
- Tester dispatched: yes

---

## Canonical code-quality review — commit `6d22c32`

Scope reviewed in read-only mode:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan-2.md`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/public-snapshot.json`

Reviewed for: removal of approval side effect while preserving trusted `workflow_run` validation, exact live-head recheck, exact native auto-squash match-head merge, no checkout/project execution, exact permissions, strict tests, docs/snapshot coherence, and stale approval behavior.

---

## CQ-1 — Must fix — Approved architecture still documents a forbidden review side effect

### Evidence

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan-2.md:29` still lists:

```text
- review POST with commit_id
```

That line appears inside the “Approved Mode B architecture revision” replacement flow, not only inside a clearly obsolete historical sketch.

It conflicts with the Task 5.2 no-review decision in the same file:

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan-2.md:36-40`

```text
The user explicitly decided: `if green auto merge =&gt; don't need approval`.
...
Task 5.2 changes the trusted workflow from approval-plus-merge side effects to merge-request-only.
```

The runtime workflow no longer performs review/approval, but the canonical plan still carries an approved-architecture bullet telling future workers to add the side effect this commit removed.

### Guidance

Replace the stale architecture bullet with the no-review equivalent, for example:

```text
- no review or approval side effect
- live-head recheck
- gh pr merge --auto --squash --match-head-commit
```

Keep any historical approval-producing snippets only if they are explicitly labeled obsolete/superseded and cannot be mistaken for the approved Task 5.2 architecture.

### Success checklist

- [ ] The approved replacement flow no longer says `review POST with commit_id`.
- [ ] The approved replacement flow states that no review/approval side effect is created.
- [ ] The approved replacement flow still preserves the live-head recheck and `gh pr merge --auto --squash --match-head-commit`.
- [ ] Any remaining `gh pr review`, `event=APPROVE`, or reviews API references are only in negative tests, mutation examples, or explicitly superseded historical context.
- [ ] Snapshot/docs checks are rerun if the changed docs are represented in generated public snapshot output.

---

## CQ-2 — Nice-to-have — Trusted job identifier still says “approve”

### Evidence

The workflow behavior no longer approves, but the job ID and test inventory still preserve the old behavior name.

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml:17`

```yaml
approve-and-enable-auto-merge:
```

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:53`

```ts
"approve-and-enable-auto-merge": "ubuntu-latest",
```

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:321`

```ts
const job = parsedJob(value, "approve-and-enable-auto-merge");
```

This is not a behavior bug. The step inventory and mutation tests reject `gh pr review`, `event=APPROVE`, and reviews API calls. The issue is stale naming that can confuse future audit, inventory, and policy work.

### Guidance

Rename the job to a behavior-accurate ID, for example:

```yaml
request-auto-merge:
```

Then update the exact test inventory and parsed job references.

### Success checklist

- [ ] `.github/workflows/dependabot-auto-merge.yml` uses a job ID that does not imply approval.
- [ ] `EXPECTED_JOB_RUNNERS` uses the renamed job ID.
- [ ] `parsedJob` and `parsedSteps` references use the renamed job ID.
- [ ] Workflow policy tests still assert the exact job inventory.
- [ ] `node --test test/ci/workflows.test.ts` passes after the rename.

---

## Positive checks

- The trusted workflow performs no checkout.
- The trusted workflow does not install dependencies, run package scripts, execute project code, or consume PR-controlled artifacts/caches.
- The trusted workflow contains no approval step.
- The trusted workflow contains no `gh pr review`.
- The trusted workflow contains no reviews API POST behavior.
- The trusted workflow revalidates the exact live head immediately before the merge request.
- The merge request remains exact and head-bound:

```text
gh pr merge "$PR_NUMBER" --repo "$REPOSITORY" --auto --squash --match-head-commit "$EXPECTED_HEAD_SHA"
```

- Mutation coverage rejects reintroduced approval/review side effects.
- Mutation coverage rejects extra side-effect steps.
- Mutation coverage still covers authority, trust-origin, complete commit provenance, multi-commit, unverified commit, maintainer-change, and head-rotation boundaries.
- `pull-requests: write` remains justified for now: the remaining side effect modifies PR auto-merge state, and GitHub documents auto-merge enablement as requiring repository write permission. GitHub’s public docs do not expose a narrower endpoint-specific `GITHUB_TOKEN` permission mapping for `gh pr merge --auto`, so the exact retained grant is reasonable pending the real canary.

---

## Consolidated post-implementation checklist

- [ ] Fix CQ-1 by removing the stale approved-architecture `review POST with commit_id` bullet.
- [ ] If adopting CQ-2, rename `approve-and-enable-auto-merge` to a no-review job ID and update exact tests.
- [ ] Re-run focused workflow tests:

```text
node --test test/ci/workflows.test.ts
```

- [ ] Re-run Actionlint for the Dependabot workflows:

```text
actionlint .github/workflows/dependabot-auto-merge.yml .github/workflows/dependabot-auto-merge-observer.yml
```

- [ ] Re-run the public snapshot check if docs/snapshot output changes.
- [ ] Confirm the trusted workflow still contains no checkout, no `uses:`, no package install, no project execution, no `gh pr review`, no `event=APPROVE`, and no reviews API call.
- [ ] Confirm the merge command still uses exactly `--auto --squash --match-head-commit "$EXPECTED_HEAD_SHA"`.
- [ ] Confirm the exact permission map remains intentionally contracted in tests.
- [ ] Complete the Task 6 live canary to prove the retained permissions and no-review merge path against real GitHub repository settings.

---

## Verification performed

Passed:

```text
actionlint .github/workflows/dependabot-auto-merge.yml .github/workflows/dependabot-auto-merge-observer.yml
node --test test/ci/workflows.test.ts
```

`node --test` result:

```text
tests 55
pass 55
fail 0
duration_ms 2544.624209
```

One attempted command failed before the successful direct Actionlint run:

```text
corepack npm exec -- actionlint .github/workflows/dependabot-auto-merge.yml .github/workflows/dependabot-auto-merge-observer.yml
```

Failure:

```text
npm error could not determine executable to run
```

Direct `actionlint` was available at:

```text
/opt/homebrew/bin/actionlint
```

---

## Verification gaps

- No live GitHub canary was run in this read-only review.
- No remote repository settings were read or changed in this review.
- The exact live behavior of `GITHUB_TOKEN` with `gh pr merge --auto --squash --match-head-commit` still requires Task 6 canary evidence.
- Public snapshot coherence was inspected by search, but the snapshot check was not run in this review.
- GitHub’s public permission documentation does not state an endpoint-specific minimal `GITHUB_TOKEN` permission set for `gh pr merge --auto`.

---

## Canonical residual risk

- The stale approved-architecture approval bullet is the main residual risk because future workers can reasonably follow it and reintroduce an approval side effect.
- The stale `approve-and-enable-auto-merge` job ID is lower risk because tests currently enforce no-review behavior, but it keeps obsolete semantics in the privileged workflow inventory.
- `pull-requests: write` appears appropriate for the remaining PR auto-merge mutation, but the live canary remains the authority for whether GitHub accepts this exact permission set.
- Repository-level settings remain out of local-review scope: native auto-merge, zero required approvals, strict required checks, Actions approval permission, and branch protection must be verified remotely in Task 6.

---

## Sources

- [GitHub Actions workflow syntax — permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [GitHub GITHUB_TOKEN security model](https://docs.github.com/en/actions/concepts/security/github_token)
- [GitHub auto-merge documentation](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request)
- [GitHub CLI `gh pr merge` manual](https://cli.github.com/manual/gh_pr_merge)
