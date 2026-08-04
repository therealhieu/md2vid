# Dependabot Auto-Merge Reliability Implementation Plan — Part 3: Branch Refresh

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely rebase at most one stale eligible patch-group PR per run through a repository-scoped GitHub App.

**Architecture:** A trusted scheduled/manual workflow inventories open exact patch-group refs, selects the oldest as the queue head, fetches live REST and GraphQL state, validates provenance and auto-merge identity, disables the old request, revalidates the head, and submits `updatePullRequestBranch` with `REBASE` and `expectedHeadOid`. The workflow never checks out code or enables auto-merge on the rewritten head.

**Tech Stack:** GitHub Actions, `actions/create-github-app-token` v2.2.2, Bash, jq, inline Node.js ESM, GitHub REST and GraphQL APIs.

---

## Group: `branch-refresh`

### Task 5: Define refresh structure and executable policy [Tester: yes] `[Group: branch-refresh]`

**Files:**
- Modify: `test/ci/workflows.test.ts`
- Test future file: `.github/workflows/dependabot-branch-refresh.yml`

- [x] **Step 1: Register the future workflow**

Add to `WORKFLOW_POLICY_CHECKERS`:

```ts
"dependabot-branch-refresh.yml": assertDependabotBranchRefreshPolicy,
```

Add to `EXPECTED_JOB_RUNNERS`:

```ts
"dependabot-branch-refresh.yml": {
  "refresh-one": "ubuntu-latest",
},
```

- [x] **Step 2: Require the exact workflow boundary**

`assertDependabotBranchRefreshPolicy` must require:

```ts
assert.equal(value.name, "Dependabot branch refresh");
assert.deepEqual(value.on, {
  schedule: [{ cron: "17 5 * * *" }],
  workflow_dispatch: null,
});
assert.deepEqual(value.permissions, {});
assert.deepEqual(value.concurrency, {
  group: "dependabot-branch-refresh",
  "cancel-in-progress": false,
});

const jobs = asRecord(value.jobs, "jobs");
const job = asRecord(jobs["refresh-one"], "refresh-one");
assert.equal(job["runs-on"], "ubuntu-latest");
assert.deepEqual(job.permissions, {});
```

Find the token step and require:

```ts
assert.equal(
  String(token.uses),
  "actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349",
);
assert.deepEqual(token.with, {
  "app-id": "${{ vars.DEPENDABOT_REFRESH_APP_ID }}",
  "private-key": "${{ secrets.DEPENDABOT_REFRESH_APP_PRIVATE_KEY }}",
  owner: "therealhieu",
  repositories: "md2vid",
  "permission-contents": "write",
  "permission-pull-requests": "write",
  "permission-metadata": "read",
});
```

Require every `gh api` step to define:

```yaml
GH_TOKEN: ${{ steps.app-token.outputs.token }}
```

Reject `${{ github.token }}`, PAT-like secrets, checkout, local actions, any second external action, artifacts, caches, npm/corepack, project scripts, PR reviews, approvals, direct merge, admin bypass, and `enablePullRequestAutoMerge`.

- [x] **Step 3: Require exact queue and mutation markers**

Assert the workflow source contains:

```text
runtime-patches
dev-patches
actions-patches
__typename
github-actions
https://github.com/apps/github-actions
SQUASH
disablePullRequestAutoMerge
updatePullRequestBranch
updateMethod: REBASE
expectedHeadOid
```

Assert `disablePullRequestAutoMerge` occurs before `updatePullRequestBranch`.

Require the exact reason-code set:

```ts
assert.deepEqual(
  [...script.matchAll(
    /"(no-candidates|queue-head-not-behind|queue-head-missing-auto-merge|queue-head-invalid|selected-for-rebase|auto-merge-disable-failed|head-changed|rebase-failed|app-token-unavailable)"/g,
  )].map((match) => match[1]).sort(),
  [
    "app-token-unavailable",
    "auto-merge-disable-failed",
    "head-changed",
    "no-candidates",
    "queue-head-invalid",
    "queue-head-missing-auto-merge",
    "queue-head-not-behind",
    "rebase-failed",
    "selected-for-rebase",
  ],
);
```

Normalize duplicate occurrences before comparing if the implementation writes a reason in more than one branch; the contract is the exact unique set, not a fixed occurrence count.

- [x] **Step 4: Add an executable refresh fixture harness**

Extract the queue-selection and validation inline Node scripts using the same pattern as `dependabotPolicyScript`. Define:

```ts
type RefreshFixture = {
  inventory: WorkflowRecord[][];
  pr: WorkflowRecord;
  commits: WorkflowRecord[];
  graphql: WorkflowRecord;
};

type RefreshMutationFixture = {
  selected: {
    pullRequestId: string;
    expectedHeadOid: string;
  };
  responses: WorkflowRecord[];
};
```

Add `runRefreshMutation(yaml, fixture)` beside the existing policy harness. It must execute the extracted mutation-step shell with a temporary stub `gh` executable first in `PATH`. The stub dequeues `responses`, records each GraphQL operation plus `pullRequestId`, `expectedHeadOid`, and `updateMethod`, and returns the response JSON. The helper returns exit status, ordered call trace, and parsed summary state. This makes both race-window checks executable rather than text-only.

Define the exact repository identities used by the fixtures:

```ts
const restRepository = {
  id: 1309960592,
  full_name: "therealhieu/md2vid",
  url: "https://api.github.com/repos/therealhieu/md2vid",
};
const graphqlRepository = {
  id: "R_kgDOThQpsA",
  nameWithOwner: "therealhieu/md2vid",
  url: "https://github.com/therealhieu/md2vid",
};
```

Use this valid base:

```ts
const expectedHead = "a".repeat(40);
const validRefreshFixture: RefreshFixture = {
  inventory: [[{
    number: 47,
    created_at: "2026-07-28T00:00:00Z",
    state: "open",
    user: { login: "dependabot[bot]" },
    base: {
      ref: "main",
      repo: { ...restRepository },
    },
    head: {
      ref: "dependabot/npm_and_yarn/runtime-patches-abc123",
      sha: expectedHead,
      repo: { ...restRepository },
    },
  }]],
  pr: {
    number: 47,
    state: "open",
    user: { login: "dependabot[bot]" },
    base: {
      ref: "main",
      repo: { ...restRepository },
    },
    head: {
      ref: "dependabot/npm_and_yarn/runtime-patches-abc123",
      sha: expectedHead,
      repo: { ...restRepository },
    },
    commits: 1,
    body: "Dependabot update.",
  },
  commits: [{
    sha: expectedHead,
    author: { login: "dependabot[bot]" },
    commit: {
      verification: { verified: true },
      message: [
        "Bumps the runtime-patches group with 1 update.",
        "",
        "---",
        "updated-dependencies:",
        "- dependency-name: hyperframes",
        "  dependency-version: 0.7.81",
        "  dependency-type: direct:production",
        "  update-type: version-update:semver-patch",
        "  dependency-group: runtime-patches",
        "...",
      ].join("\n"),
    },
  }],
  graphql: {
    data: {
      repository: {
        ...graphqlRepository,
        pullRequest: {
          id: "PR_kwDOThQpsM6example",
          number: 47,
          state: "OPEN",
          baseRefName: "main",
          baseRepository: { ...graphqlRepository },
          headRefName: "dependabot/npm_and_yarn/runtime-patches-abc123",
          headRefOid: expectedHead,
          headRepository: { ...graphqlRepository },
          mergeStateStatus: "BEHIND",
          autoMergeRequest: {
            mergeMethod: "SQUASH",
            enabledBy: {
              __typename: "Bot",
              login: "github-actions",
              url: "https://github.com/apps/github-actions",
            },
          },
        },
      },
    },
  },
};
```

- [x] **Step 5: Test queue-head behavior and every validation class**

Add executable cases for:

1. Two valid behind PRs select only #47 when #47 is older.
2. Equal creation times use lower PR number as the tie-breaker.
3. Oldest exact patch-group PR with a non-`BEHIND` state returns `waiting / queue-head-not-behind`; #48 is not selected.
4. No exact patch-group refs returns `no-candidates / no-candidates`.
5. Missing `autoMergeRequest` returns `blocked / queue-head-missing-auto-merge`.
6. A present request with wrong enabled-by typename, login, or URL returns `blocked / queue-head-invalid` and no mutation target.
7. A present request using `MERGE` instead of `SQUASH` returns `blocked / queue-head-invalid` and no mutation target.
8. An older open exact patch-group ref that is forked, non-main, non-bot-authored, or has a mismatched base/head repository ID, full name, or API URL remains the selected queue head, returns `blocked / queue-head-invalid`, exposes no mutation target, and prevents a newer valid PR from being selected.
9. A selected queue head with a maintainer marker, multi-commit state, wrong commit SHA, wrong commit author, unsigned commit, malformed/duplicate metadata, non-patch metadata, wrong group, unauthorized dependency, or changed live repository identity returns no mutation target and never advances to a newer PR.
10. Mutating any GraphQL repository/baseRepository/headRepository `id`, `nameWithOwner`, or web `url` returns no mutation target and leaves the newer PR waiting.
11. Manual-family and near-prefix refs are not inventory candidates.
12. Every enumerated outcome renders exactly five trusted summary fields.

Add executable mutation-step cases through `runRefreshMutation`:

```ts
const selected = {
  pullRequestId: "PR_kwDOThQpsM6example",
  expectedHeadOid: expectedHead,
};
const live = {
  data: {
    repository: {
      ...graphqlRepository,
      pullRequest: {
        id: selected.pullRequestId,
        headRefOid: expectedHead,
      },
    },
  },
};
```

Require these exact traces:

```text
first live OID differs
  → failed / head-changed
  → query only
  → no disable and no rebase

second live OID differs
  → failed / head-changed
  → query → disable → query
  → no rebase

both live IDs/OIDs match
  → query → disable → query → updatePullRequestBranch
  → updateMethod=REBASE
  → expectedHeadOid=<selected old head>
  → exactly one disable and one rebase
```

Also mutate either live repository identity or pull-request node ID and require the same no-unsafe-write behavior for that stage.

- [x] **Step 6: Add structural mutation tests**

Mutations must fail if they:

- change either permission map from `{}`;
- broaden owner or repositories;
- replace the action SHA or remove the `# v2.2.2` comment;
- use `github.token` or a PAT-like secret;
- add another `uses`, checkout, artifact, cache, install, project execution, review, approval, direct merge, or admin;
- change fixed concurrency or enable cancellation;
- select a second candidate or skip a blocked queue head;
- move rebase before disable;
- change `REBASE` to `MERGE`;
- remove `expectedHeadOid`;
- accept an enabled-by actor other than the exact tuple;
- request auto-merge for the new head;
- remove a reason code or add title/body/API error text to the summary.

- [x] **Step 7: Verify the red state**

```bash
node --test test/ci/workflows.test.ts
```

Expected: FAIL because `dependabot-branch-refresh.yml` does not exist and workflow inventory no longer matches.

- [x] **Step 8: Commit the red contract**

```bash
git add test/ci/workflows.test.ts
git commit -m "test(ci): define Dependabot branch refresh policy"
```

### Task 6: Create the repository-scoped refresh workflow [Tester: yes] `[Group: branch-refresh]`

**Files:**
- Create: `.github/workflows/dependabot-branch-refresh.yml`

- [x] **Step 1: Create the exact workflow envelope**

```yaml
name: Dependabot branch refresh

"on":
  schedule:
    - cron: "17 5 * * *"
  workflow_dispatch:

permissions: {}

concurrency:
  group: dependabot-branch-refresh
  cancel-in-progress: false

jobs:
  refresh-one:
    runs-on: ubuntu-latest
    permissions: {}
```

- [x] **Step 2: Initialize fail-closed summary state before token creation**

```yaml
      - name: Initialize refresh summary
        shell: bash
        run: |-
          set -euo pipefail
          printf '%s\n' \
            '{"outcome":"failed","reason":"app-token-unavailable","pr":"none","group":"none","expected_head":"none"}' \
            > "$RUNNER_TEMP/dependabot-branch-refresh-summary.json"
```

- [x] **Step 3: Mint the exact repository installation token**

```yaml
      - name: Create repository-scoped App token
        id: app-token
        uses: actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349 # v2.2.2
        with:
          app-id: ${{ vars.DEPENDABOT_REFRESH_APP_ID }}
          private-key: ${{ secrets.DEPENDABOT_REFRESH_APP_PRIVATE_KEY }}
          owner: therealhieu
          repositories: md2vid
          permission-contents: write
          permission-pull-requests: write
          permission-metadata: read
```

The pinned `actions/create-github-app-token` action supports these explicit permission inputs; omitted permission inputs inherit all installation permissions, so the workflow must downscope the minted token to `contents: write`, `pull requests: write`, and `metadata: read` explicitly. Do not set `continue-on-error`; failed token creation must fail the job while the final `always()` summary reports `app-token-unavailable`.

- [x] **Step 4: Inventory all open PR pages with only the App token**

```yaml
      - name: Inventory open pull requests
        id: inventory
        shell: bash
        env:
          GH_TOKEN: ${{ steps.app-token.outputs.token }}
          REPOSITORY: therealhieu/md2vid
        run: |-
          set -euo pipefail
          INVENTORY_FILE="$RUNNER_TEMP/dependabot-refresh-inventory.json"
          gh api \
            --method GET \
            --paginate \
            --slurp \
            "repos/$REPOSITORY/pulls?state=open&per_page=100&sort=created&direction=asc" \
            > "$INVENTORY_FILE"
          printf 'inventory_file=%s\n' "$INVENTORY_FILE" >> "$GITHUB_OUTPUT"
```

- [x] **Step 5: Select only the oldest exact patch-group queue head**

Add this named step boundary, then place the inline Node.js selector in its `run` block:

```yaml
      - name: Select patch-group queue head
        id: queue
        shell: bash
        env:
          INVENTORY_FILE: ${{ steps.inventory.outputs.inventory_file }}
          SUMMARY_FILE: ${{ runner.temp }}/dependabot-branch-refresh-summary.json
```

The script must:

- flatten the slurped pages;
- require `pr.state === "open"` and a positive integer PR number;
- retain exact patch-group refs before any author/base/repository eligibility decision:

This reconciles the functional requirement with the design’s no-skip queue rule: only a fully validated same-repository Dependabot PR against `main` may be mutated, but the oldest open exact patch-group ref is selected first. If its live author, base, repository, provenance, metadata, or authorization is invalid, it blocks with no mutation and every newer PR waits.

Retain refs matching only:

```js
const policies = [
  {
    group: "runtime-patches",
    branch: /^dependabot\/npm_and_yarn\/runtime-patches(?:-[a-z0-9]+)?$/,
  },
  {
    group: "dev-patches",
    branch: /^dependabot\/npm_and_yarn\/dev-patches(?:-[a-z0-9]+)?$/,
  },
  {
    group: "actions-patches",
    branch: /^dependabot\/github_actions\/actions-patches(?:-[a-z0-9]+)?$/,
  },
];
```

- sort by parsed `created_at`, then numeric PR number;
- emit only the oldest positive integer PR and exact group;
- emit `candidate=false` and overwrite summary with `no-candidates` when none exist;
- never skip the oldest matching ref because later validation fails.

Outputs:

```text
candidate=true|false
pr_number=<validated positive integer>
group=runtime-patches|dev-patches|actions-patches
```

- [x] **Step 6: Fetch selected REST and GraphQL state**

Use the exact step ID and guard:

```yaml
      - name: Fetch queue-head state
        id: state
        if: steps.queue.outputs.candidate == 'true'
        shell: bash
        env:
          GH_TOKEN: ${{ steps.app-token.outputs.token }}
          REPOSITORY: therealhieu/md2vid
          PR_NUMBER: ${{ steps.queue.outputs.pr_number }}
```

Use only the App token and write files under `$RUNNER_TEMP`:

```bash
PR_FILE="$RUNNER_TEMP/dependabot-refresh-pr.json"
COMMITS_FILE="$RUNNER_TEMP/dependabot-refresh-commits.json"
GRAPHQL_FILE="$RUNNER_TEMP/dependabot-refresh-graphql.json"
gh api --method GET "repos/$REPOSITORY/pulls/$PR_NUMBER" > "$PR_FILE"
gh api --method GET "repos/$REPOSITORY/pulls/$PR_NUMBER/commits?per_page=100" > "$COMMITS_FILE"
gh api graphql \
  -F owner=therealhieu \
  -F name=md2vid \
  -F number="$PR_NUMBER" \
  -f query='
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        id
        nameWithOwner
        url
        pullRequest(number: $number) {
          id
          number
          state
          baseRefName
          baseRepository { id nameWithOwner url }
          headRefName
          headRefOid
          headRepository { id nameWithOwner url }
          mergeStateStatus
          autoMergeRequest {
            mergeMethod
            enabledBy { __typename login url }
          }
        }
      }
    }' \
  > "$GRAPHQL_FILE"
printf 'pr_file=%s\n' "$PR_FILE" >> "$GITHUB_OUTPUT"
printf 'commits_file=%s\n' "$COMMITS_FILE" >> "$GITHUB_OUTPUT"
printf 'graphql_file=%s\n' "$GRAPHQL_FILE" >> "$GITHUB_OUTPUT"
```

Use this GraphQL query:

```graphql
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    id
    nameWithOwner
    url
    pullRequest(number: $number) {
      id
      number
      state
      baseRefName
      baseRepository {
        id
        nameWithOwner
        url
      }
      headRefName
      headRefOid
      headRepository {
        id
        nameWithOwner
        url
      }
      mergeStateStatus
      autoMergeRequest {
        mergeMethod
        enabledBy {
          __typename
          login
          url
        }
      }
    }
  }
}
```

Expose only response-file paths through `GITHUB_OUTPUT`.

- [x] **Step 7: Validate the queue head before any write**

Use an inline Node.js validation step with exact ID `policy`, input paths `steps.state.outputs.pr_file`, `steps.state.outputs.commits_file`, and `steps.state.outputs.graphql_file`, plus queue outputs `pr_number` and `group`.

The validation script must preserve the existing auto-merge policy’s exact repository, base, head repository/ref/SHA, open state, Dependabot author, maintainer-marker, one-commit, commit-SHA, commit-author, signature, duplicate metadata, complete metadata, patch update type, group, and dependency allowlist checks.

Bind every repository representation before selection:

```js
const expectedRestRepository = {
  id: 1309960592,
  fullName: "therealhieu/md2vid",
  apiUrl: "https://api.github.com/repos/therealhieu/md2vid",
};
const expectedGraphqlRepository = {
  id: "R_kgDOThQpsA",
  nameWithOwner: "therealhieu/md2vid",
  url: "https://github.com/therealhieu/md2vid",
};
```

Require REST `pr.base.repo` and `pr.head.repo` to match all three REST fields. Require GraphQL `repository`, `pullRequest.baseRepository`, and `pullRequest.headRepository` to match all three GraphQL fields and each other. Repository mismatches write `blocked / queue-head-invalid` and expose no mutation target.

Additionally require:

```js
autoMergeRequest.mergeMethod === "SQUASH"
autoMergeRequest.enabledBy.__typename === "Bot"
autoMergeRequest.enabledBy.login === "github-actions"
autoMergeRequest.enabledBy.url ===
  "https://github.com/apps/github-actions"
```

For valid but non-behind state, write and exit successfully:

```json
{
  "outcome": "waiting",
  "reason": "queue-head-not-behind",
  "pr": "#47",
  "group": "runtime-patches",
  "expected_head": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

Emit `selected=false`.

If `autoMergeRequest` is absent, write `blocked / queue-head-missing-auto-merge`, emit no target, and fail. If a request is present but its method or actor tuple is wrong, write `blocked / queue-head-invalid`, emit no target, and fail. Any other invalid queue-head state also writes `blocked / queue-head-invalid` and exposes no target.

For a valid behind candidate, emit:

```text
selected=true
pull_request_id=<validated GraphQL node ID>
pr_number=<validated integer>
group=<exact group>
expected_head_oid=<40 lowercase hex characters>
```

- [x] **Step 8: Perform the exact mutation sequence in one App-token step**

Guard with:

```yaml
if: steps.policy.outputs.selected == 'true'
```

Use the App token explicitly. Keep the step compatible with the `runRefreshMutation` stub harness: every GraphQL call is made through `gh api graphql`, and the selected node ID/OID are passed as validated environment values rather than interpolated into query text.

The step must:

1. Query live repository `id/nameWithOwner/url` plus `pullRequest.id/headRefOid`; require exact repository identity, original node ID, and expected OID. On mismatch, write `failed / head-changed` and exit before disable.
2. Disable auto-merge exactly once.
3. Query the same live repository/PR fields again; require exact identity, node ID, and OID. On mismatch, write `failed / head-changed` and exit without rebase.
4. Rebase exactly once with the same expected OID.
5. Record `selected / selected-for-rebase`.
6. Never enable auto-merge.

Disable mutation:

```graphql
mutation($pullRequestId: ID!) {
  disablePullRequestAutoMerge(
    input: { pullRequestId: $pullRequestId }
  ) {
    pullRequest { id }
  }
}
```

Rebase mutation:

```graphql
mutation($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) {
  updatePullRequestBranch(
    input: {
      pullRequestId: $pullRequestId
      updateMethod: REBASE
      expectedHeadOid: $expectedHeadOid
    }
  ) {
    pullRequest {
      id
      headRefOid
    }
  }
}
```

On failure, overwrite only with fixed states:

```text
disable failure → failed / auto-merge-disable-failed
either head mismatch → failed / head-changed
rebase failure → failed / rebase-failed
```

Do not copy raw API errors into the summary state file.

- [x] **Step 9: Render the exact final summary**

Use `if: always()`. Parse the state file and validate every value against closed allowlists before rendering exactly:

```text
### Dependabot branch refresh
- Outcome: no-candidates | waiting | blocked | selected | failed
- Reason: no-candidates | queue-head-not-behind | queue-head-missing-auto-merge | queue-head-invalid | selected-for-rebase | auto-merge-disable-failed | head-changed | rebase-failed | app-token-unavailable
- PR: none | #<validated integer>
- Group: none | runtime-patches | dev-patches | actions-patches
- Expected head: none | <validated 40-character lowercase SHA>
```

Write the same trusted lines to stdout and `$GITHUB_STEP_SUMMARY`. Do not render titles, bodies, dependency strings, token values, raw responses, or arbitrary exceptions.

- [x] **Step 10: Run focused tests and Actionlint**

```bash
node --test test/ci/workflows.test.ts

if command -v actionlint >/dev/null 2>&1; then
  actionlint -config-file .github/actionlint.yaml
else
  printf '%s\n' "actionlint unavailable; no installation attempted"
fi
```

Expected: workflow tests pass. Actionlint prints no diagnostics when installed.

- [x] **Step 11: Commit the workflow**

```bash
git add .github/workflows/dependabot-branch-refresh.yml
git commit -m "ci(deps): refresh one stale Dependabot branch"
```

## Group Verification

```bash
node --test test/ci/workflows.test.ts
node --test test/cli/dependency-versions.test.ts
git diff --check HEAD~2..HEAD
```

The verifier must confirm one-target queue behavior, exact App scope and pin, no fallback credential, complete provenance and metadata checks, exact auto-merge actor, disable-before-rebase ordering, two head revalidations, `REBASE`, `expectedHeadOid`, no new-head authorization, and fixed summaries.
