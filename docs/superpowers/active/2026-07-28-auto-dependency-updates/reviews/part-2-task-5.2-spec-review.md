# Canonical Review Artifact

- Review scope: Part 2, Task 5.2
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `clean-head`
- Scope origin: `950e8bdb78abedf1a38834e6fdbf1a084d089515`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.N7NNCz/task-scope.patch`
- Created: 2026-07-28
- Tester dispatched: yes

---

### SPEC-1 🔴 Must fix — Task 6 still requires an approval that the approved no-review architecture forbids

**Problem**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan-2.md:941-982` — Step 10 still captures `reviews` and requires an `APPROVED` review from `github-actions[bot]`.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan-2.md:984-1052` — Step 11 repeats the same approval requirement and treats it as canary success evidence.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-goal.md:28` and `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-design.md:31-34` already say the trusted workflow must be merge-request-only and must not create a review or approval side effect.

**Why this is a spec mismatch**

The approved architecture is explicitly no-review. The canary procedure in Task 6 still proves success by observing an approval review, which reintroduces the exact side effect the design removed.

**Solution**

Rewrite Task 6 so the canary proves the no-review path only:

- remove `reviews` from the `gh pr view` JSON payloads
- remove all jq predicates that require `APPROVED` reviews from `github-actions[bot]`
- keep the checks that prove:
  - the PR stays `OPEN` while required checks are pending
  - `autoMergeRequest.mergeMethod == "SQUASH"`
  - required checks complete before `mergedAt`
  - the merge is head-bound and happens without any workflow-created review

Current flow

```text
canary PR
  → inspect reviews
  → require APPROVED review
  → prove merge
```

Expected flow

```text
canary PR
  → inspect autoMergeRequest + checks
  → confirm no workflow-created review
  → prove merge
```

**Success checklist**

- [ ] Step 10 no longer requests `reviews` in `gh pr view`
- [ ] Step 10 no longer asserts `APPROVED` from `github-actions[bot]`
- [ ] Step 11 no longer asserts any workflow-created review
- [ ] Step 11 still proves pending checks block merging
- [ ] Step 11 still proves `mergedAt` occurs after required checks complete
- [ ] Task 6 text matches the approved no-review architecture in goal/design docs

---

### SPEC-2 🟢 Nice-to-have — Approval-branded identifiers still linger in the checked-in contract surface

**Problem**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml:17` — job id is still `approve-and-enable-auto-merge`.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:321-444` — the workflow contract test still anchors on that approval-branded job id.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:1011-1014` — mutation coverage still uses an `Approve eligible update` label even though the workflow no longer approves anything.

**Why this matters**

It does not change runtime behavior, but it leaves stale approval terminology in the contract surface and makes the no-review rollout harder to read and maintain.

**Solution**

Rename approval-branded names to approval-neutral ones, for example:

- `approve-and-enable-auto-merge` → `request-auto-merge`
- `Approve eligible update` → `Request native squash auto-merge`

Keep the validation semantics unchanged.

**Success checklist**

- [ ] Workflow job id no longer implies approval
- [ ] Test contract uses the renamed job id
- [ ] Mutation test labels no longer reference approval
- [ ] All workflow behavior assertions remain unchanged

---

### Proposals

**Summary**

- **SPEC-1** — Remove approval evidence from Task 6 and replace it with canary checks that prove only auto-merge request, live-head binding, and required-check ordering.
- **SPEC-2** — Rename approval-branded identifiers to approval-neutral names so the docs and tests match the no-review policy.

**Current State**

```text
Task 6 canary
  → read reviews
  → expect github-actions[bot] approval
  → prove merge

Workflow/test labels
  → still say "approve"
```

**Expected State**

```text
Task 6 canary
  → read autoMergeRequest + checks
  → confirm no workflow-created review
  → prove merge

Workflow/test labels
  → approval-neutral names only
```

**Post-implementation checklist**

- [ ] Docs no longer require or mention an approval review for the canary
- [ ] Canary evidence is based on merge-request state and check timing only
- [ ] No workflow-created review side effect is asserted anywhere in Task 6
- [ ] Contract test names and labels are approval-neutral
- [ ] The approved no-review architecture is consistent across goal, design, plan, and tests

**Verification gaps**

- [ ] I did not re-run the workflow canary against the live repository state in this review pass
- [ ] I did not verify whether `can_approve_pull_request_reviews` is already disabled in the remote settings
- [ ] I did not validate the renamed identifiers on disk, because this review is read-only and findings are limited to the documented mismatch

**Residual risk**

- The implementation can still pass CI while leaving the rollout docs inconsistent if Task 6 keeps approval-based proof.
- Approval-branded names can keep confusing future maintenance even when runtime behavior is correct.
- Once SPEC-1 is fixed, the remaining risk is mostly readability and future drift, not merge safety.
