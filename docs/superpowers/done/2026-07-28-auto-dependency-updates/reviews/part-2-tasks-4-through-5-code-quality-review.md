# Canonical Review Artifact

- Review scope: Part 2, Tasks 4-5
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `dirty-baseline`
- Scope origin: `6825cfe19f5da332216427bb898c13ead11703e5`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines/part-2-tasks-4-through-5`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.uCCjee/task-scope.patch`
- Created: 2026-07-28
- Tester dispatched: yes

---

# Canonical Review Artifact

- Review scope: Part 2, Tasks 4–5 (`dependabot-automation`)
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `dirty-baseline`
- Scope origin: `6825cfe19f5da332216427bb898c13ead11703e5`
- Immutable baseline: `/var/folders/g6/8qxn2g4x7mdv4k5l7h340000gn/T/superpowers-baselines/part-2-tasks-4-through-5`
- Supplied task-scope patch: `/var/folders/g6/8qxn2g4x7mdv4k5l7h340000gn/T/superpowers-current.uCCjee/task-scope.patch`
- Created: 2026-07-28
- Delegation: none, as required
- Excluded untracked content: the pre-existing Part 1 canonical review artifacts

---

## Findings

### CQ-1 — Must fix — Approval and auto-merge are not bound to the head that metadata validated

- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml:20-24` — the workflow runs `dependabot/fetch-metadata` but does not capture the event-time `github.event.pull_request.head.sha`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml:29-32` — the policy receives only the branch name, parsed update type, and dependency names. It receives neither the expected head SHA nor `maintainer-changes`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml:93-107` — `gh pr review "$PR_URL" --approve` approves the PR’s current head, and `gh pr merge "$PR_URL" --auto --squash` has no `--match-head-commit`.
  - The pinned [`dependabot/fetch-metadata` commit-verification implementation](https://github.com/dependabot/fetch-metadata/blob/21025c705c08248db411dc16f3619e6b5f9ea21a/src/dependabot/verified_commits.ts#L32-L56) lists the commits but validates and parses only `commits[0]`. It does not prove that every commit currently in the PR was authored and signed by Dependabot.
  - The pinned action exposes [`maintainer-changes`](https://github.com/dependabot/fetch-metadata/blob/21025c705c08248db411dc16f3619e6b5f9ea21a/action.yml#L51-L54), but the workflow ignores it.
  - GitHub’s review API supports an exact [`commit_id`](https://docs.github.com/en/rest/pulls/reviews) for the reviewed head, while the current CLI approval command omits that binding.
  - `gh pr merge --help` confirms that `--match-head-commit SHA` is supported with native auto-merge, but the workflow does not use it.
- Why it is wrong:
  - There is a metadata-to-side-effect race:
    ```text
    eligible Dependabot head A
      → fetch-metadata validates/parses first Dependabot commit
      → another commit changes PR head to B
      → unbound review approves current head B
      → unbound auto-merge is enabled for current head B
    ```
  - Branch protection with stale-review dismissal does not close this gap. The automated approval occurs after the head changes, so it can approve the new head rather than becoming stale.
  - A later run can also encounter a multi-commit PR where the first commit is the authentic Dependabot commit but a subsequent commit is not. The pinned metadata action still derives eligibility from the first commit.
  - A collaborator or compromised write credential that can push to a Dependabot branch could therefore obtain the workflow’s required approval for changes that were not represented by the validated dependency metadata. This violates the requirement that policy cannot approve or merge an ineligible or attacker-controlled PR.
- Guidance:
  - Capture the event-time PR number and head SHA in trusted environment values:
    ```yaml
    PR_NUMBER: ${{ github.event.pull_request.number }}
    EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha }}
    ```
  - Before approval, query the current PR and complete commit list without checking out code. Fail unless:
    - the current PR head equals `EXPECTED_HEAD_SHA`;
    - every commit author is `dependabot[bot]`;
    - every commit signature is verified;
    - the metadata group, ecosystem, target branch, and directory match the selected policy;
    - no maintainer changes are present.
  - Submit the approval through `POST /repos/{owner}/{repo}/pulls/{number}/reviews` with:
    ```text
    event=APPROVE
    commit_id=$EXPECTED_HEAD_SHA
    ```
    GitHub documents that omitting `commit_id` defaults the review to the latest commit, which is the unsafe behavior here.
  - Bind the native merge request to the same head:
    ```bash
    gh pr merge "$PR_NUMBER" \
      --repo "$GITHUB_REPOSITORY" \
      --auto \
      --squash \
      --match-head-commit "$EXPECTED_HEAD_SHA"
    ```
  - Prefer the fixed repository plus numeric PR identity over an event-supplied HTML URL.
  - Add per-PR concurrency with stale-run cancellation as defense in depth. Commit binding must remain the authoritative race control.
- Success checklist:
  - [ ] The workflow captures the event-time head SHA.
  - [ ] Every current PR commit is independently confirmed as Dependabot-authored and signature-verified.
  - [ ] The current PR head must still equal the captured SHA before approval.
  - [ ] The approval is explicitly attached to that SHA with `commit_id`.
  - [ ] `gh pr merge` uses `--match-head-commit` with the same SHA.
  - [ ] A head change between metadata validation and approval produces no approval for the new head.
  - [ ] A head change between approval and the merge request causes the merge command to fail closed.
  - [ ] A PR containing an authentic first Dependabot commit plus a later maintainer commit is ineligible.
  - [ ] Tests cover multi-commit and head-rotation cases.

### CQ-2 — Nice to have — The privileged-workflow contract permits unmodeled write-capable steps

- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:292-308` — the checker finds four steps by name but does not require exactly four steps or enforce their order.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:310-327` — command and failure-handling checks apply only to the four found steps.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:329-334` — the global deny list rejects checkout and selected project commands, but does not reject an additional pinned action, `gh api`, `curl`, another review command, an immediate merge command, or other write-capable shell logic.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:736-772` — mutation coverage tests selected guard changes but does not test an extra step before policy validation or an extra side effect after it.
- Why it is wrong:
  - This job holds `contents: write` and `pull-requests: write`. An extra step such as a pinned third-party action or an additional `gh api` command could perform unrelated writes and still satisfy the current checker.
  - The tests therefore do not enforce the documented contract that approval and a native squash auto-merge request are the workflow’s only side effects.
  - The present workflow has no extra step, so this is a contract-hardening gap rather than an additional current execution path.
- Guidance:
  - Require the exact ordered step inventory:
    ```text
    Fetch Dependabot metadata
      → Validate patch group policy
      → Approve eligible update
      → Request native squash auto-merge
    ```
  - Validate exact keys for each step, including IDs, shell, environment bindings, action input, guards, and commands.
  - Reject:
    - extra steps;
    - duplicate step names or IDs;
    - additional `uses`;
    - additional `gh`, `curl`, or network-writing commands;
    - `if: always()` or broadened side-effect guards;
    - extra write-producing output paths;
    - step-level failure suppression.
  - After resolving CQ-1, make the checker enforce the exact commit-bound review API call and `--match-head-commit` merge command.
  - Add mutation cases for an extra pinned action, an extra `gh api` write, an immediate merge command, reordered side effects, and duplicate policy/merge steps.
- Success checklist:
  - [ ] The workflow checker requires the exact ordered step list.
  - [ ] Duplicate and additional steps are rejected.
  - [ ] Only the pinned metadata action may appear under `uses`.
  - [ ] Only the modeled policy, commit-bound approval, and commit-bound native auto-merge commands are accepted.
  - [ ] Every side-effect step uses the exact eligibility guard.
  - [ ] Mutation tests prove that additional write-capable steps fail the contract.

---

## Consolidated post-implementation checklist

- [ ] Validate every current PR commit, not only the first Dependabot commit.
- [ ] Bind metadata validation, approval, and auto-merge to one exact head SHA.
- [ ] Use a commit-specific review API request and `gh pr merge --match-head-commit`.
- [ ] Fail closed on maintainer commits, head rotation, metadata mismatch, or incomplete commit verification.
- [ ] Enforce the exact privileged-workflow step and side-effect inventory.
- [ ] Add negative tests for multi-commit PRs, stale workflow runs, duplicate steps, extra actions, and extra API writes.
- [ ] Run `node --test test/ci/workflows.test.ts`.
- [ ] Run `actionlint -config-file .github/actionlint.yaml`.
- [ ] Run `corepack npm run public:snapshot:check`.
- [ ] Run `corepack npm run check`.
- [ ] Run `corepack npm run release:check`.
- [ ] Run `git diff --check 6825cfe19f5da332216427bb898c13ead11703e5..HEAD`.
- [ ] Run `git diff --check`.
- [ ] Confirm only the three pre-existing Part 1 review artifacts remain untracked.

---

## Verification gaps and residual risk

Independent verification completed:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts` passed: 52/52.
- `actionlint -config-file .github/actionlint.yaml` completed with no diagnostics.
- Both scoped and working-tree `git diff --check` commands completed with no output.
- The `dependabot/fetch-metadata` pin resolves to exact commit `21025c705c08248db411dc16f3619e6b5f9ea21a` with the matching `v2.5.0` comment.
- The pinned action source was inspected directly; its current commit-verification path validates only the first listed PR commit.
- Mode A reports full and release validation passing: 843/843. Those complete suites were not independently rerun during this read-only review.

Canonical residual risk:

- Tasks 4–5 do not activate unattended merging by themselves. Task 6 must still verify and configure branch protection, required checks, Actions approval, and repository auto-merge in the prescribed order.
- No local test can prove the live repository’s protection settings or GitHub’s final merge enforcement. API read-back and the real Dependabot canary remain mandatory.
- Even after commit binding, the workflow continues to trust GitHub’s Dependabot identity, verified-commit status, the pinned metadata action, GitHub CLI behavior, and hosted-runner integrity.
- Grouped patch PRs retain a larger dependency blast radius than individual PRs. Required CI, dependency review, synchronized-family checks, and HyperFrames patch-anchor validation must remain blocking controls.
