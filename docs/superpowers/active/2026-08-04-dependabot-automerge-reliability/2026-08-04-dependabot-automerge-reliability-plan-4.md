# Dependabot Auto-Merge Reliability Implementation Plan — Part 4: Verification and Canary

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regenerate the public snapshot, complete local verification, then prove ordered #47 and #48 refresh behavior against the live repository.

**Architecture:** Local verification closes the implementation boundary before merge. Remote canaries run only from merged default-branch workflow content and collect durable evidence of expected-head rebase, preserved provenance, normal workflow triggering, fresh head-bound native auto-merge, all five checks, and final squash merge.

**Tech Stack:** npm scripts, Node test runner, Actionlint, GitHub CLI, GitHub REST and GraphQL APIs, Git worktrees.

---

### Task 7: Regenerate the snapshot and run the complete local gate [Tester: yes]

**Files:**
- Regenerate: `public-snapshot.json`

- [x] **Step 1: Prove the snapshot is stale before regeneration**

```bash
corepack npm run public:snapshot:check
```

Expected: FAIL because changed public workflows, configuration, and tests no longer match `public-snapshot.json`.

- [x] **Step 2: Regenerate and immediately check the snapshot**

```bash
corepack npm run public:snapshot
corepack npm run public:snapshot:check
```

Expected: both commands exit `0`; the first reports the generated file count and SHA-256 manifest hash.

- [x] **Step 3: Run every focused and full check**

```bash
node --test test/ci/workflows.test.ts
node --test test/cli/dependency-versions.test.ts

if command -v actionlint >/dev/null 2>&1; then
  actionlint -config-file .github/actionlint.yaml
else
  printf '%s\n' "actionlint unavailable; no installation attempted"
fi

corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected:

- Every required command exits `0`.
- Actionlint prints no diagnostics when installed; absence is reported and does not trigger an installation.
- All 1,258 pre-change tests still exist and pass, plus the newly added tests. Do not require a frozen final aggregate count.
- No snapshot drift or whitespace errors remain.

- [x] **Step 4: Commit the regenerated manifest**

```bash
git add public-snapshot.json
git commit -m "chore(snapshot): refresh Dependabot automation hashes"
```

- [x] **Step 5: Verify the implementation branch is ready**

```bash
git status --short
BASE=$(git merge-base HEAD origin/main)
COMMIT_SUBJECTS=$(mktemp)
git log --reverse --format='%s' "$BASE"..HEAD > "$COMMIT_SUBJECTS"
node --input-type=module - "$COMMIT_SUBJECTS" <<'NODE'
import { readFileSync } from "node:fs";

const subjects = readFileSync(process.argv[2], "utf8")
  .trim()
  .split("\n")
  .filter(Boolean);
const expected = [
  "test(ci): define Dependabot title and no-op policy",
  "ci(deps): accept generated Dependabot PRs",
  "test(deps): define synchronized family groups",
  "chore(deps): group synchronized dependency families",
  "test(ci): define Dependabot branch refresh policy",
  "ci(deps): refresh one stale Dependabot branch",
  "chore(snapshot): refresh Dependabot automation hashes",
];

let cursor = -1;
for (const subject of expected) {
  cursor = subjects.indexOf(subject, cursor + 1);
  if (cursor === -1) throw new Error(`missing or out-of-order commit: ${subject}`);
}
NODE
rm "$COMMIT_SUBJECTS"
```

Expected: `git status --short` is empty and the seven planned implementation commit subjects are present in order anywhere in the branch range. A separate earlier companion-artifact documentation commit does not hide an implementation commit from this check.

The implementation PR must merge to `main` with all five required checks before Task 8.

### Task 8: Run and record the #47 refresh canary [Tester: yes]

**Files:**
- Create after rollout: `.worktrees/dependabot-refresh-evidence/docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/evidence/pr-47-refresh-canary.md`

**Remote prerequisites:**

- Tasks 1–7 are merged to `main`.
- The user explicitly authorizes the workflow dispatch and later push/PR creation at execution time.
- The App is installed only on `therealhieu/md2vid`.
- Repository variable `DEPENDABOT_REFRESH_APP_ID` exists.
- Repository secret `DEPENDABOT_REFRESH_APP_PRIVATE_KEY` exists.
- Installation permissions are exactly contents write, pull requests write, and metadata read.
- #47 is the oldest open exact patch-group queue head.
- Run each canary’s preflight-through-merge commands in one persistent shell session or one generated shell script so `PR`, `OLD_HEAD`, `NEW_HEAD`, run IDs, and allowlisted evidence variables remain available. Do not split state-dependent blocks across process-isolated shells.

- [ ] **Step 1: Verify App configuration without exposing secrets**

```bash
APP_ID=$(gh variable get DEPENDABOT_REFRESH_APP_ID \
  --repo therealhieu/md2vid)
test -n "$APP_ID"

gh secret list \
  --repo therealhieu/md2vid \
  --json name \
  --jq '.[] | select(.name == "DEPENDABOT_REFRESH_APP_PRIVATE_KEY") | .name' \
  | grep -qx DEPENDABOT_REFRESH_APP_PRIVATE_KEY

INSTALLATION=$(gh api --paginate /user/installations \
  --jq ".installations[] | select(.app_id == ($APP_ID | tonumber))")
test -n "$INSTALLATION"

INSTALLATION_ID=$(printf '%s' "$INSTALLATION" | jq -er .id)
printf '%s' "$INSTALLATION" | jq -e '
  .repository_selection == "selected"
  and .permissions.contents == "write"
  and .permissions.pull_requests == "write"
  and .permissions.metadata == "read"
  and ([.permissions | to_entries[] | select(
    (.key != "contents" and .key != "pull_requests" and .key != "metadata")
    and .value != "none"
  )] | length) == 0
' >/dev/null

gh api --paginate "/user/installations/$INSTALLATION_ID/repositories?per_page=100" \
  --slurp \
  | jq -e '
      [.[].repositories[] | .full_name] == ["therealhieu/md2vid"]
    ' >/dev/null
```

If the authenticated user cannot inspect the installation through `/user/installations`, stop and verify the same App ID, repository selection, selected repository, and permission tuple in GitHub App installation settings. Record that manual verification; do not substitute a broader token or infer scope.

- [ ] **Step 2: Capture and assert #47 preflight**

```bash
PR=47
REPOSITORY=therealhieu/md2vid

OLD_JSON=$(gh pr view "$PR" \
  --repo "$REPOSITORY" \
  --json number,state,author,baseRefName,headRefName,headRefOid,mergeStateStatus,autoMergeRequest,statusCheckRollup)

OLD_HEAD=$(printf '%s' "$OLD_JSON" | jq -er .headRefOid)
HEAD_REF=$(printf '%s' "$OLD_JSON" | jq -er .headRefName)

printf '%s' "$OLD_JSON" | jq -e '
  .number == 47
  and .state == "OPEN"
  and .author.login == "dependabot[bot]"
  and .baseRefName == "main"
  and (.headRefName | test("^dependabot/(npm_and_yarn/(runtime|dev)-patches|github_actions/actions-patches)(-[a-z0-9]+)?$"))
  and .mergeStateStatus == "BEHIND"
  and .autoMergeRequest.mergeMethod == "SQUASH"
' >/dev/null

COMMIT_EVIDENCE=$(gh api \
  "repos/$REPOSITORY/pulls/$PR/commits?per_page=100" \
  | jq '[.[] | {
      sha,
      author_login: .author.login,
      signature_verified: .commit.verification.verified,
      signature_reason: .commit.verification.reason
    }]')

printf '%s' "$COMMIT_EVIDENCE" | jq -e --arg head "$OLD_HEAD" '
  length == 1
  and .[0].sha == $head
  and .[0].author_login == "dependabot[bot]"
  and .[0].signature_verified == true
' >/dev/null
```

Run the exact GraphQL identity query:

```bash
OLD_GRAPHQL_EVIDENCE=$(gh api graphql \
  -F owner=therealhieu \
  -F name=md2vid \
  -F number=47 \
  -f query='
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          headRefOid
          commits(first: 2) {
            totalCount
            nodes {
              commit {
                oid
                author { user { login } }
                signature {
                  __typename
                  isValid
                  signer { login }
                }
              }
            }
          }
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
    }')
printf '%s' "$OLD_GRAPHQL_EVIDENCE" | jq -e --arg head "$OLD_HEAD" '
  .data.repository.pullRequest.headRefOid == $head
  and .data.repository.pullRequest.commits.totalCount == 1
  and .data.repository.pullRequest.commits.nodes[0].commit.oid == $head
  and .data.repository.pullRequest.commits.nodes[0].commit.author.user.login == "dependabot[bot]"
  and .data.repository.pullRequest.commits.nodes[0].commit.signature.isValid == true
  and .data.repository.pullRequest.autoMergeRequest.mergeMethod == "SQUASH"
  and .data.repository.pullRequest.autoMergeRequest.enabledBy.__typename == "Bot"
  and .data.repository.pullRequest.autoMergeRequest.enabledBy.login == "github-actions"
  and .data.repository.pullRequest.autoMergeRequest.enabledBy.url == "https://github.com/apps/github-actions"
' >/dev/null
```

Stop without dispatch if any assertion fails.

- [ ] **Step 3: Dispatch the trusted default-branch workflow**

After explicit user authorization for this branch mutation:

```bash
RUNS_API="repos/therealhieu/md2vid/actions/workflows/dependabot-branch-refresh.yml/runs?event=workflow_dispatch&branch=main&per_page=100"
DISPATCH_ACTOR=$(gh api user --jq .login)
BASELINE_RUN_IDS=$(gh api "$RUNS_API" --jq '[.workflow_runs[].id]')
DISPATCHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

gh workflow run dependabot-branch-refresh.yml \
  --repo therealhieu/md2vid \
  --ref main

RUN_ID=""
for attempt in $(seq 1 30); do
  NEW_RUNS=$(gh api "$RUNS_API" \
    | jq \
      --arg actor "$DISPATCH_ACTOR" \
      --arg dispatched_at "$DISPATCHED_AT" \
      --argjson baseline "$BASELINE_RUN_IDS" '
        [.workflow_runs[]
          | .id as $id
          | select(
              .event == "workflow_dispatch"
              and .head_branch == "main"
              and .actor.login == $actor
              and .created_at >= $dispatched_at
              and (($baseline | index($id)) == null)
            )]
      ')
  NEW_RUN_COUNT=$(printf '%s' "$NEW_RUNS" | jq 'length')
  test "$NEW_RUN_COUNT" -le 1
  if test "$NEW_RUN_COUNT" -eq 1; then
    RUN_ID=$(printf '%s' "$NEW_RUNS" | jq -er '.[0].id')
    break
  fi
  sleep 2
done

test -n "$RUN_ID"
gh run watch "$RUN_ID" --repo therealhieu/md2vid --exit-status

RUN_RECORD=$(gh run view "$RUN_ID" \
  --repo therealhieu/md2vid \
  --json databaseId,event,headBranch,status,conclusion,createdAt)
printf '%s' "$RUN_RECORD" | jq -e \
  --argjson run_id "$RUN_ID" \
  --arg dispatched_at "$DISPATCHED_AT" '
    .databaseId == $run_id
    and .event == "workflow_dispatch"
    and .headBranch == "main"
    and .createdAt >= $dispatched_at
    and .conclusion == "success"
  ' >/dev/null

REFRESH_SUMMARY=$(gh run view "$RUN_ID" \
  --repo therealhieu/md2vid \
  --log \
  | cut -f3- \
  | rg '^(### Dependabot branch refresh|- Outcome:|- Reason:|- PR:|- Group:|- Expected head:)' )

EXPECTED_SUMMARY=$(printf '%s\n' \
  '### Dependabot branch refresh' \
  '- Outcome: selected' \
  '- Reason: selected-for-rebase' \
  '- PR: #47' \
  '- Group: runtime-patches' \
  "- Expected head: $OLD_HEAD")

test "$REFRESH_SUMMARY" = "$EXPECTED_SUMMARY"
```

Require the summary to equal:

```text
### Dependabot branch refresh
- Outcome: selected
- Reason: selected-for-rebase
- PR: #47
- Group: runtime-patches
- Expected head: <the exact OLD_HEAD value>
```

Stop if any field differs. A live group mismatch must be reconciled with the source artifacts before continuing.

- [ ] **Step 4: Prove the new head and normal workflow triggering**

```bash
NEW_HEAD=$(gh pr view 47 \
  --repo therealhieu/md2vid \
  --json headRefOid \
  --jq .headRefOid)

test "$NEW_HEAD" != "$OLD_HEAD"
[[ "$NEW_HEAD" =~ ^[a-f0-9]{40}$ ]]

CI_RUNS="[]"
OBSERVER_RUNS="[]"
for attempt in $(seq 1 60); do
  CI_RUNS=$(gh run list \
    --repo therealhieu/md2vid \
    --workflow ci.yml \
    --branch "$HEAD_REF" \
    --event pull_request \
    --limit 5 \
    --json databaseId,status,conclusion,headSha,event,workflowName)
  OBSERVER_RUNS=$(gh run list \
    --repo therealhieu/md2vid \
    --workflow dependabot-auto-merge-observer.yml \
    --branch "$HEAD_REF" \
    --event pull_request \
    --limit 5 \
    --json databaseId,status,conclusion,headSha,event,workflowName)

  printf '%s' "$CI_RUNS" | jq -e --arg head "$NEW_HEAD" '
    all(.[] | select(.headSha == $head); .conclusion != "action_required")
  ' >/dev/null
  printf '%s' "$OBSERVER_RUNS" | jq -e --arg head "$NEW_HEAD" '
    all(.[] | select(.headSha == $head); .conclusion != "action_required")
  ' >/dev/null

  if printf '%s' "$CI_RUNS" | jq -e --arg head "$NEW_HEAD" '
      ([.[] | select(.headSha == $head)] | length) > 0
    ' >/dev/null \
    && printf '%s' "$OBSERVER_RUNS" | jq -e --arg head "$NEW_HEAD" '
      ([.[] | select(.headSha == $head)] | length) > 0
    ' >/dev/null; then
    break
  fi
  sleep 10
done

printf '%s' "$CI_RUNS" | jq -e --arg head "$NEW_HEAD" '
  ([.[] | select(.headSha == $head)] | length) > 0
  and all(.[] | select(.headSha == $head); .conclusion != "action_required")
' >/dev/null
printf '%s' "$OBSERVER_RUNS" | jq -e --arg head "$NEW_HEAD" '
  ([.[] | select(.headSha == $head)] | length) > 0
  and all(.[] | select(.headSha == $head); .conclusion != "action_required")
' >/dev/null
```

Stop before provenance checks if either exact-head run is missing or any exact-head run requires approval.

- [ ] **Step 5: Prove new-head provenance and fresh authorization**

Capture only allowlisted commit fields:

```bash
NEW_COMMIT_EVIDENCE=$(gh api \
  "repos/$REPOSITORY/pulls/$PR/commits?per_page=100" \
  | jq '[.[] | {
      sha,
      author_login: .author.login,
      signature_verified: .commit.verification.verified,
      signature_reason: .commit.verification.reason
    }]')

printf '%s' "$NEW_COMMIT_EVIDENCE" | jq -e --arg head "$NEW_HEAD" '
  length == 1
  and .[0].sha == $head
  and .[0].author_login == "dependabot[bot]"
  and .[0].signature_verified == true
' >/dev/null
```

Poll for the fresh authorization and retain only the named GraphQL fields:

```bash
NEW_GRAPHQL_EVIDENCE=""
for attempt in $(seq 1 60); do
  NEW_GRAPHQL_EVIDENCE=$(gh api graphql \
    -F owner=therealhieu \
    -F name=md2vid \
    -F number="$PR" \
    -f query='
      query($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $number) {
            headRefOid
            commits(first: 2) {
              totalCount
              nodes {
                commit {
                  oid
                  author { user { login } }
                  signature { __typename isValid signer { login } }
                }
              }
            }
            autoMergeRequest {
              mergeMethod
              enabledBy { __typename login url }
            }
          }
        }
      }')

  if printf '%s' "$NEW_GRAPHQL_EVIDENCE" | jq -e --arg head "$NEW_HEAD" '
    .data.repository.pullRequest.headRefOid == $head
    and .data.repository.pullRequest.commits.totalCount == 1
    and .data.repository.pullRequest.commits.nodes[0].commit.oid == $head
    and .data.repository.pullRequest.commits.nodes[0].commit.author.user.login == "dependabot[bot]"
    and .data.repository.pullRequest.commits.nodes[0].commit.signature.isValid == true
    and .data.repository.pullRequest.autoMergeRequest.mergeMethod == "SQUASH"
    and .data.repository.pullRequest.autoMergeRequest.enabledBy.__typename == "Bot"
    and .data.repository.pullRequest.autoMergeRequest.enabledBy.login == "github-actions"
    and .data.repository.pullRequest.autoMergeRequest.enabledBy.url == "https://github.com/apps/github-actions"
  ' >/dev/null; then
    break
  fi
  sleep 10
done

printf '%s' "$NEW_GRAPHQL_EVIDENCE" | jq -e --arg head "$NEW_HEAD" '
  .data.repository.pullRequest.headRefOid == $head
  and .data.repository.pullRequest.commits.totalCount == 1
  and .data.repository.pullRequest.commits.nodes[0].commit.oid == $head
  and .data.repository.pullRequest.commits.nodes[0].commit.author.user.login == "dependabot[bot]"
  and .data.repository.pullRequest.commits.nodes[0].commit.signature.isValid == true
  and .data.repository.pullRequest.autoMergeRequest.mergeMethod == "SQUASH"
  and .data.repository.pullRequest.autoMergeRequest.enabledBy.__typename == "Bot"
  and .data.repository.pullRequest.autoMergeRequest.enabledBy.login == "github-actions"
  and .data.repository.pullRequest.autoMergeRequest.enabledBy.url == "https://github.com/apps/github-actions"
' >/dev/null
```

If the final assertion fails, stop. Do not dispatch #48 and do not weaken policy.

- [ ] **Step 6: Wait for five checks and native squash merge**

```bash
gh pr checks 47 \
  --repo therealhieu/md2vid \
  --required \
  --watch

REQUIRED_CHECKS=$(gh pr checks 47 \
  --repo therealhieu/md2vid \
  --required \
  --json name,state,startedAt,completedAt,link)
printf '%s' "$REQUIRED_CHECKS" | jq -e '
  length == 5
  and ([.[].name] | sort) == ([
    "dependency-review",
    "pr-latest / validate",
    "pr-minimum / validate",
    "pr-title",
    "public-snapshot / validate"
  ] | sort)
  and all(.[]; .state == "SUCCESS")
' >/dev/null

FINAL_STATE=""
for attempt in $(seq 1 60); do
  FINAL_STATE=$(gh pr view 47 \
    --repo therealhieu/md2vid \
    --json state,mergedAt,mergeCommit)
  if printf '%s' "$FINAL_STATE" | jq -e '
    .state == "MERGED"
    and .mergedAt != null
    and .mergeCommit.oid != null
  ' >/dev/null; then
    break
  fi
  sleep 10
done

printf '%s' "$FINAL_STATE" | jq -e '
  .state == "MERGED"
  and .mergedAt != null
  and .mergeCommit.oid != null
' >/dev/null
```

- [ ] **Step 7: Create a flat evidence worktree and write exact evidence**

Run from the primary checkout, not from inside the implementation worktree:

```bash
PRIMARY_CHECKOUT=/Users/hieunguyen/git/hieu/projects/md2vid-public
git -C "$PRIMARY_CHECKOUT" check-ignore -q .worktrees
git -C "$PRIMARY_CHECKOUT" fetch origin main
git -C "$PRIMARY_CHECKOUT" worktree add \
  .worktrees/dependabot-refresh-evidence \
  -b docs-dependabot-refresh-evidence \
  origin/main
```

The evidence path has one segment below the primary checkout’s `.worktrees/` directory and no agent prefix, matching `docs/standards/git.md`.

Create `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/evidence/pr-47-refresh-canary.md` with:

- old and new head values;
- refresh run ID;
- exact commands from Steps 1–6;
- allowlisted `OLD_JSON`, `COMMIT_EVIDENCE`, old-head GraphQL identity, `RUN_RECORD`, `CI_RUNS`, `OBSERVER_RUNS`, `NEW_COMMIT_EVIDENCE`, `NEW_GRAPHQL_EVIDENCE`, `REQUIRED_CHECKS`, and `FINAL_STATE`;
- the exact six-line `REFRESH_SUMMARY`, not the unfiltered workflow log;
- explicit PASS/FAIL statements for provenance, workflow approval behavior, fresh authorization, five checks, and merge.

Only record fields named by this task. Do not copy a raw commits response, raw workflow log, secret value, token, private key, PR body, dependency metadata, or arbitrary API error into the file.

- [ ] **Step 8: Commit and publish #47 evidence**

After explicit user authorization for the push:

```bash
cd /Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-evidence
git add docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/evidence/pr-47-refresh-canary.md
git commit -m "docs(deps): record PR 47 refresh canary"
git push -u origin docs-dependabot-refresh-evidence
```

If #47 fails, record the exact non-sensitive failure evidence, push only when authorized, stop rollout, and leave #48 untouched.

### Task 9: Run and record the #48 canary [Tester: yes]

**Files:**
- Create after successful #47 rollout: `.worktrees/dependabot-refresh-evidence/docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/evidence/pr-48-refresh-canary.md`

- [ ] **Step 1: Prove #47 is merged before touching #48**

```bash
test "$(
  gh pr view 47 \
    --repo therealhieu/md2vid \
    --json state \
    --jq .state
)" = "MERGED"
```

- [ ] **Step 2: Capture and assert #48 preflight**

```bash
PR=48
REPOSITORY=therealhieu/md2vid

OLD_JSON=$(gh pr view "$PR" \
  --repo "$REPOSITORY" \
  --json number,state,author,baseRefName,headRefName,headRefOid,mergeStateStatus,autoMergeRequest,statusCheckRollup)
OLD_HEAD=$(printf '%s' "$OLD_JSON" | jq -er .headRefOid)
HEAD_REF=$(printf '%s' "$OLD_JSON" | jq -er .headRefName)

case "$HEAD_REF" in
  dependabot/npm_and_yarn/runtime-patches*) GROUP=runtime-patches ;;
  dependabot/npm_and_yarn/dev-patches*) GROUP=dev-patches ;;
  dependabot/github_actions/actions-patches*) GROUP=actions-patches ;;
  *) exit 1 ;;
esac

printf '%s' "$OLD_JSON" | jq -e '
  .number == 48
  and .state == "OPEN"
  and .author.login == "dependabot[bot]"
  and .baseRefName == "main"
  and (.headRefName | test("^dependabot/(npm_and_yarn/(runtime|dev)-patches|github_actions/actions-patches)(-[a-z0-9]+)?$"))
  and .mergeStateStatus == "BEHIND"
  and .autoMergeRequest.mergeMethod == "SQUASH"
' >/dev/null

COMMIT_EVIDENCE=$(gh api \
  "repos/$REPOSITORY/pulls/$PR/commits?per_page=100" \
  | jq '[.[] | {
      sha,
      author_login: .author.login,
      signature_verified: .commit.verification.verified,
      signature_reason: .commit.verification.reason
    }]')
printf '%s' "$COMMIT_EVIDENCE" | jq -e --arg head "$OLD_HEAD" '
  length == 1
  and .[0].sha == $head
  and .[0].author_login == "dependabot[bot]"
  and .[0].signature_verified == true
' >/dev/null

OLD_GRAPHQL_EVIDENCE=$(gh api graphql \
  -F owner=therealhieu \
  -F name=md2vid \
  -F number="$PR" \
  -f query='
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          headRefOid
          commits(first: 2) {
            totalCount
            nodes {
              commit {
                oid
                author { user { login } }
                signature { __typename isValid signer { login } }
              }
            }
          }
          autoMergeRequest {
            mergeMethod
            enabledBy { __typename login url }
          }
        }
      }
    }')
printf '%s' "$OLD_GRAPHQL_EVIDENCE" | jq -e --arg head "$OLD_HEAD" '
  .data.repository.pullRequest.headRefOid == $head
  and .data.repository.pullRequest.commits.totalCount == 1
  and .data.repository.pullRequest.commits.nodes[0].commit.oid == $head
  and .data.repository.pullRequest.commits.nodes[0].commit.author.user.login == "dependabot[bot]"
  and .data.repository.pullRequest.commits.nodes[0].commit.signature.isValid == true
  and .data.repository.pullRequest.autoMergeRequest.mergeMethod == "SQUASH"
  and .data.repository.pullRequest.autoMergeRequest.enabledBy.__typename == "Bot"
  and .data.repository.pullRequest.autoMergeRequest.enabledBy.login == "github-actions"
  and .data.repository.pullRequest.autoMergeRequest.enabledBy.url == "https://github.com/apps/github-actions"
' >/dev/null
```

Stop without dispatch if any assertion fails.

- [ ] **Step 3: Dispatch and correlate exactly one #48 refresh run**

After explicit user authorization:

```bash
RUNS_API="repos/therealhieu/md2vid/actions/workflows/dependabot-branch-refresh.yml/runs?event=workflow_dispatch&branch=main&per_page=100"
DISPATCH_ACTOR=$(gh api user --jq .login)
BASELINE_RUN_IDS=$(gh api "$RUNS_API" --jq '[.workflow_runs[].id]')
DISPATCHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

gh workflow run dependabot-branch-refresh.yml \
  --repo therealhieu/md2vid \
  --ref main

RUN_ID=""
for attempt in $(seq 1 30); do
  NEW_RUNS=$(gh api "$RUNS_API" \
    | jq \
      --arg actor "$DISPATCH_ACTOR" \
      --arg dispatched_at "$DISPATCHED_AT" \
      --argjson baseline "$BASELINE_RUN_IDS" '
        [.workflow_runs[]
          | .id as $id
          | select(
              .event == "workflow_dispatch"
              and .head_branch == "main"
              and .actor.login == $actor
              and .created_at >= $dispatched_at
              and (($baseline | index($id)) == null)
            )]
      ')
  NEW_RUN_COUNT=$(printf '%s' "$NEW_RUNS" | jq 'length')
  test "$NEW_RUN_COUNT" -le 1
  if test "$NEW_RUN_COUNT" -eq 1; then
    RUN_ID=$(printf '%s' "$NEW_RUNS" | jq -er '.[0].id')
    break
  fi
  sleep 2
done

test -n "$RUN_ID"
gh run watch "$RUN_ID" --repo therealhieu/md2vid --exit-status

RUN_RECORD=$(gh run view "$RUN_ID" \
  --repo therealhieu/md2vid \
  --json databaseId,event,headBranch,status,conclusion,createdAt)
printf '%s' "$RUN_RECORD" | jq -e \
  --argjson run_id "$RUN_ID" \
  --arg dispatched_at "$DISPATCHED_AT" '
    .databaseId == $run_id
    and .event == "workflow_dispatch"
    and .headBranch == "main"
    and .createdAt >= $dispatched_at
    and .conclusion == "success"
  ' >/dev/null

REFRESH_SUMMARY=$(gh run view "$RUN_ID" \
  --repo therealhieu/md2vid \
  --log \
  | cut -f3- \
  | rg '^(### Dependabot branch refresh|- Outcome:|- Reason:|- PR:|- Group:|- Expected head:)' )
EXPECTED_SUMMARY=$(printf '%s\n' \
  '### Dependabot branch refresh' \
  '- Outcome: selected' \
  '- Reason: selected-for-rebase' \
  '- PR: #48' \
  "- Group: $GROUP" \
  "- Expected head: $OLD_HEAD")
test "$REFRESH_SUMMARY" = "$EXPECTED_SUMMARY"
```

Stop if no unique run appears, more than one matching run appears, or the exact summary differs.

- [ ] **Step 4: Verify #48’s new head, workflows, authorization, checks, and merge**

```bash
NEW_HEAD=$(gh pr view "$PR" \
  --repo "$REPOSITORY" \
  --json headRefOid \
  --jq .headRefOid)
test "$NEW_HEAD" != "$OLD_HEAD"
[[ "$NEW_HEAD" =~ ^[a-f0-9]{40}$ ]]

CI_RUNS="[]"
OBSERVER_RUNS="[]"
for attempt in $(seq 1 60); do
  CI_RUNS=$(gh run list \
    --repo "$REPOSITORY" \
    --workflow ci.yml \
    --branch "$HEAD_REF" \
    --event pull_request \
    --limit 5 \
    --json databaseId,status,conclusion,headSha,event,workflowName)
  OBSERVER_RUNS=$(gh run list \
    --repo "$REPOSITORY" \
    --workflow dependabot-auto-merge-observer.yml \
    --branch "$HEAD_REF" \
    --event pull_request \
    --limit 5 \
    --json databaseId,status,conclusion,headSha,event,workflowName)

  printf '%s' "$CI_RUNS" | jq -e --arg head "$NEW_HEAD" '
    all(.[] | select(.headSha == $head); .conclusion != "action_required")
  ' >/dev/null
  printf '%s' "$OBSERVER_RUNS" | jq -e --arg head "$NEW_HEAD" '
    all(.[] | select(.headSha == $head); .conclusion != "action_required")
  ' >/dev/null

  if printf '%s' "$CI_RUNS" | jq -e --arg head "$NEW_HEAD" '
      ([.[] | select(.headSha == $head)] | length) > 0
    ' >/dev/null \
    && printf '%s' "$OBSERVER_RUNS" | jq -e --arg head "$NEW_HEAD" '
      ([.[] | select(.headSha == $head)] | length) > 0
    ' >/dev/null; then
    break
  fi
  sleep 10
done

printf '%s' "$CI_RUNS" | jq -e --arg head "$NEW_HEAD" '
  ([.[] | select(.headSha == $head)] | length) > 0
  and all(.[] | select(.headSha == $head); .conclusion != "action_required")
' >/dev/null
printf '%s' "$OBSERVER_RUNS" | jq -e --arg head "$NEW_HEAD" '
  ([.[] | select(.headSha == $head)] | length) > 0
  and all(.[] | select(.headSha == $head); .conclusion != "action_required")
' >/dev/null

NEW_COMMIT_EVIDENCE=$(gh api \
  "repos/$REPOSITORY/pulls/$PR/commits?per_page=100" \
  | jq '[.[] | {
      sha,
      author_login: .author.login,
      signature_verified: .commit.verification.verified,
      signature_reason: .commit.verification.reason
    }]')
printf '%s' "$NEW_COMMIT_EVIDENCE" | jq -e --arg head "$NEW_HEAD" '
  length == 1
  and .[0].sha == $head
  and .[0].author_login == "dependabot[bot]"
  and .[0].signature_verified == true
' >/dev/null

NEW_GRAPHQL_EVIDENCE=""
for attempt in $(seq 1 60); do
  NEW_GRAPHQL_EVIDENCE=$(gh api graphql \
    -F owner=therealhieu \
    -F name=md2vid \
    -F number="$PR" \
    -f query='
      query($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $number) {
            headRefOid
            commits(first: 2) {
              totalCount
              nodes {
                commit {
                  oid
                  author { user { login } }
                  signature { __typename isValid signer { login } }
                }
              }
            }
            autoMergeRequest {
              mergeMethod
              enabledBy { __typename login url }
            }
          }
        }
      }')
  if printf '%s' "$NEW_GRAPHQL_EVIDENCE" | jq -e --arg head "$NEW_HEAD" '
    .data.repository.pullRequest.headRefOid == $head
    and .data.repository.pullRequest.commits.totalCount == 1
    and .data.repository.pullRequest.commits.nodes[0].commit.oid == $head
    and .data.repository.pullRequest.commits.nodes[0].commit.author.user.login == "dependabot[bot]"
    and .data.repository.pullRequest.commits.nodes[0].commit.signature.isValid == true
    and .data.repository.pullRequest.autoMergeRequest.mergeMethod == "SQUASH"
    and .data.repository.pullRequest.autoMergeRequest.enabledBy.__typename == "Bot"
    and .data.repository.pullRequest.autoMergeRequest.enabledBy.login == "github-actions"
    and .data.repository.pullRequest.autoMergeRequest.enabledBy.url == "https://github.com/apps/github-actions"
  ' >/dev/null; then
    break
  fi
  sleep 10
done

printf '%s' "$NEW_GRAPHQL_EVIDENCE" | jq -e --arg head "$NEW_HEAD" '
  .data.repository.pullRequest.headRefOid == $head
  and .data.repository.pullRequest.commits.totalCount == 1
  and .data.repository.pullRequest.commits.nodes[0].commit.oid == $head
  and .data.repository.pullRequest.commits.nodes[0].commit.author.user.login == "dependabot[bot]"
  and .data.repository.pullRequest.commits.nodes[0].commit.signature.isValid == true
  and .data.repository.pullRequest.autoMergeRequest.mergeMethod == "SQUASH"
  and .data.repository.pullRequest.autoMergeRequest.enabledBy.__typename == "Bot"
  and .data.repository.pullRequest.autoMergeRequest.enabledBy.login == "github-actions"
  and .data.repository.pullRequest.autoMergeRequest.enabledBy.url == "https://github.com/apps/github-actions"
' >/dev/null

gh pr checks "$PR" --repo "$REPOSITORY" --required --watch
REQUIRED_CHECKS=$(gh pr checks "$PR" \
  --repo "$REPOSITORY" \
  --required \
  --json name,state,startedAt,completedAt,link)
printf '%s' "$REQUIRED_CHECKS" | jq -e '
  length == 5
  and ([.[].name] | sort) == ([
    "dependency-review",
    "pr-latest / validate",
    "pr-minimum / validate",
    "pr-title",
    "public-snapshot / validate"
  ] | sort)
  and all(.[]; .state == "SUCCESS")
' >/dev/null

for attempt in $(seq 1 60); do
  FINAL_STATE=$(gh pr view "$PR" \
    --repo "$REPOSITORY" \
    --json state,mergedAt,mergeCommit)
  if printf '%s' "$FINAL_STATE" | jq -e '
    .state == "MERGED"
    and .mergedAt != null
    and .mergeCommit.oid != null
  ' >/dev/null; then
    break
  fi
  sleep 10
done
printf '%s' "$FINAL_STATE" | jq -e '
  .state == "MERGED"
  and .mergedAt != null
  and .mergeCommit.oid != null
' >/dev/null
```

- [ ] **Step 5: Write and commit #48 evidence**

Create `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/evidence/pr-48-refresh-canary.md` with old/new heads, exact run ID, exact commands, allowlisted `OLD_JSON`, `COMMIT_EVIDENCE`, `OLD_GRAPHQL_EVIDENCE`, `RUN_RECORD`, `REFRESH_SUMMARY`, `CI_RUNS`, `OBSERVER_RUNS`, `NEW_COMMIT_EVIDENCE`, `NEW_GRAPHQL_EVIDENCE`, `REQUIRED_CHECKS`, `FINAL_STATE`, and explicit PASS/FAIL statements. Do not include raw commit responses, raw logs, PR bodies, dependency metadata, credentials, tokens, or arbitrary API errors.

```bash
cd /Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-evidence
git add docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/evidence/pr-48-refresh-canary.md
git commit -m "docs(deps): record PR 48 refresh canary"
```

- [ ] **Step 6: Push and open the evidence PR**

After explicit user authorization for both outward actions:

```bash
git push

gh pr create \
  --repo therealhieu/md2vid \
  --base main \
  --head docs-dependabot-refresh-evidence \
  --title "docs(deps): record branch refresh canaries" \
  --body "$(printf '%s\n' \
    '## Summary' \
    '- record the ordered #47 branch-refresh canary' \
    '- record the #48 canary after #47 merged' \
    '- preserve exact provenance, authorization, required-check, and merge evidence' \
    '' \
    '## Verification' \
    '- #47 and #48 each retained one verified Dependabot-authored commit' \
    '- App-caused synchronize events started CI and observer runs without approval' \
    '- each new head received a fresh SQUASH auto-merge request from the github-actions Bot' \
    '- all five required checks passed before native squash merge')"
```

#49 remains manual and is not modified, closed, refreshed, or made eligible by this plan.
