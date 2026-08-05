# Dependency PR CI Remediation Implementation Plan — Part 3: Ordered #47 and #48 Recovery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover pristine Dependabot PRs #47 and #48 in order through the existing v2 branch-refresh workflow, prove preserved provenance and all five required checks, and record allowlisted evidence without maintainer commits.

**Architecture:** The trusted default-branch workflow disables the old auto-merge request and performs one expected-head-bound GraphQL rebase. The resulting App-authored synchronize event starts normal CI/observer runs; the trusted policy independently authorizes the new exact head for native squash auto-merge.

**Tech Stack:** GitHub CLI, REST and GraphQL APIs, `jq`, Bash, native GitHub auto-merge, ignored Superpowers evidence files.

---

Run every stateful preflight-through-merge sequence in one persistent shell session. Do not split `OLD_HEAD`, `NEW_HEAD`, run IDs, or evidence variables across process-isolated shells.

### Task 9: Recover #47 and record evidence [Tester: yes]

**Files:**
- Create: `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/pr-47-recovery.md`
- Create worktree/branch: `.worktrees/dependency-pr-ci-evidence` / `docs/dependency-pr-ci-evidence`

**Preconditions:**

- Units A and B are merged to `main`.
- #47 remains open and pristine.
- #47 is the oldest exact patch-group queue head.
- App-token v2.2.2 remains deployed.
- The user has not authorized a workflow dispatch yet; authorization is requested in Step 4.

- [ ] **Step 1: Create the persistent evidence worktree from latest `main`**

```bash
PRIMARY=/Users/hieunguyen/git/hieu/projects/md2vid-public
git -C "$PRIMARY" check-ignore -q .worktrees
git -C "$PRIMARY" fetch origin main
git -C "$PRIMARY" worktree add \
  .worktrees/dependency-pr-ci-evidence \
  -b docs/dependency-pr-ci-evidence \
  origin/main
cd "$PRIMARY/.worktrees/dependency-pr-ci-evidence"
git status --short
```

Expected: clean status. Do not create a second evidence worktree in Task 10.

- [ ] **Step 2: Verify App installation configuration without exposing credentials**

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
  | jq -e '[.[].repositories[] | .full_name] == ["therealhieu/md2vid"]' \
  >/dev/null
```

If `/user/installations` is unavailable to the authenticated user, stop and verify the same App ID, selected repository, and permission tuple in GitHub App installation settings. Record only that the manual verification passed; never record the private key or token.

- [ ] **Step 3: Capture and assert the complete #47 read-only preflight**

```bash
PR=47
REPOSITORY=therealhieu/md2vid
EXPECTED_GROUP=runtime-patches
EXPECTED_FILES='["package-lock.json","package.json"]'

OLD_JSON=$(gh pr view "$PR" \
  --repo "$REPOSITORY" \
  --json number,state,author,baseRefName,headRefName,headRefOid,mergeStateStatus,autoMergeRequest)
OLD_HEAD=$(printf '%s' "$OLD_JSON" | jq -er .headRefOid)
HEAD_REF=$(printf '%s' "$OLD_JSON" | jq -er .headRefName)

printf '%s' "$OLD_JSON" | jq -e --argjson pr "$PR" '
  .number == $pr
  and .state == "OPEN"
  and .author.login == "dependabot[bot]"
  and .baseRefName == "main"
  and (.headRefName | test("^dependabot/(npm_and_yarn/(runtime|dev)-patches|github_actions/actions-patches)(-[a-z0-9]+)?$"))
  and .mergeStateStatus == "BEHIND"
  and .autoMergeRequest.mergeMethod == "SQUASH"
' >/dev/null

FILES=$(gh pr view "$PR" \
  --repo "$REPOSITORY" \
  --json files \
  --jq '[.files[].path] | sort')
test "$FILES" = "$EXPECTED_FILES"

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

Stop without dispatch if any assertion fails. Do not treat `BLOCKED`, `UNKNOWN`, `DIRTY`, or an unexplained current branch as permission to dispatch.

- [ ] **Step 4: Obtain explicit authorization for one branch-refresh dispatch**

Tell the user that one `workflow_dispatch` will disable #47’s old auto-merge request and may rebase its branch. Obtain explicit authorization immediately before Step 5.

- [ ] **Step 5: Dispatch and correlate exactly one refresh run**

After authorization:

```bash
RUNS_API="repos/$REPOSITORY/actions/workflows/dependabot-branch-refresh.yml/runs?event=workflow_dispatch&branch=main&per_page=100"
DISPATCH_ACTOR=$(gh api user --jq .login)
BASELINE_RUN_IDS=$(gh api "$RUNS_API" --jq '[.workflow_runs[].id]')
DISPATCHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

gh workflow run dependabot-branch-refresh.yml \
  --repo "$REPOSITORY" \
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
gh run watch "$RUN_ID" --repo "$REPOSITORY" --exit-status

RUN_RECORD=$(gh run view "$RUN_ID" \
  --repo "$REPOSITORY" \
  --json databaseId,event,headBranch,status,conclusion,createdAt,url)
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
  --repo "$REPOSITORY" \
  --log \
  | awk -F '\t' '$2 == "Summarize branch refresh" {
      line = $3
      sub(/^[^[:space:]]+[[:space:]]+/, "", line)
      print line
    }' \
  | rg '^(### Dependabot branch refresh|- Outcome:|- Reason:|- PR:|- Group:|- Expected head:)')
EXPECTED_SUMMARY=$(printf '%s\n' \
  '### Dependabot branch refresh' \
  '- Outcome: selected' \
  '- Reason: selected-for-rebase' \
  "- PR: #$PR" \
  "- Group: $EXPECTED_GROUP" \
  "- Expected head: $OLD_HEAD")
test "$REFRESH_SUMMARY" = "$EXPECTED_SUMMARY"
```

Stop if no unique run appears, more than one appears, or any summary field differs.

- [ ] **Step 6: Prove the new head starts normal CI and observer workflows without approval**

```bash
NEW_HEAD=""
for attempt in $(seq 1 30); do
  NEW_HEAD=$(gh pr view "$PR" \
    --repo "$REPOSITORY" \
    --json headRefOid \
    --jq .headRefOid)
  if test "$NEW_HEAD" != "$OLD_HEAD"; then break; fi
  sleep 2
done

test "$NEW_HEAD" != "$OLD_HEAD"
[[ "$NEW_HEAD" =~ ^[a-f0-9]{40}$ ]]

CI_RUNS='[]'
OBSERVER_RUNS='[]'
for attempt in $(seq 1 60); do
  CI_RUNS=$(gh run list \
    --repo "$REPOSITORY" \
    --workflow ci.yml \
    --branch "$HEAD_REF" \
    --event pull_request \
    --limit 5 \
    --json databaseId,status,conclusion,headSha,event,workflowName,url)
  OBSERVER_RUNS=$(gh run list \
    --repo "$REPOSITORY" \
    --workflow dependabot-auto-merge-observer.yml \
    --branch "$HEAD_REF" \
    --event pull_request \
    --limit 5 \
    --json databaseId,status,conclusion,headSha,event,workflowName,url)

  printf '%s' "$CI_RUNS" | jq -e --arg head "$NEW_HEAD" '
    all(.[] | select(.headSha == $head); .conclusion != "action_required")
  ' >/dev/null
  printf '%s' "$OBSERVER_RUNS" | jq -e --arg head "$NEW_HEAD" '
    all(.[] | select(.headSha == $head); .conclusion != "action_required")
  ' >/dev/null

  if printf '%s' "$CI_RUNS" | jq -e --arg head "$NEW_HEAD" \
      '([.[] | select(.headSha == $head)] | length) > 0' >/dev/null \
    && printf '%s' "$OBSERVER_RUNS" | jq -e --arg head "$NEW_HEAD" \
      '([.[] | select(.headSha == $head)] | length) > 0' >/dev/null; then
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

- [ ] **Step 7: Prove new-head provenance and fresh exact-head authorization**

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

NEW_GRAPHQL_EVIDENCE=''
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

If the final assertion fails, stop. Do not manually enable auto-merge or dispatch #48.

- [ ] **Step 8: Require all five checks and native squash merge**

```bash
gh pr checks "$PR" \
  --repo "$REPOSITORY" \
  --required \
  --watch

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

FINAL_STATE=''
for attempt in $(seq 1 60); do
  FINAL_STATE=$(gh pr view "$PR" \
    --repo "$REPOSITORY" \
    --json state,mergedAt,mergeCommit,url)
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

Do not issue `gh pr merge`; the existing trusted native auto-merge request must complete.

- [ ] **Step 9: Capture exact dependency versions from the refreshed head**

```bash
PACKAGE_JSON=$(gh api \
  "repos/$REPOSITORY/contents/package.json?ref=$NEW_HEAD" \
  --jq .content \
  | base64 --decode)

printf '%s' "$PACKAGE_JSON" | jq -e '
  .dependencies.hyperframes == "0.7.87"
  and .optionalDependencies.remotion == "4.0.503"
  and .optionalDependencies["@remotion/google-fonts"] == "4.0.503"
  and .optionalDependencies["@remotion/media"] == "4.0.503"
' >/dev/null
```

- [ ] **Step 10: Write and commit allowlisted #47 evidence**

Create `evidence/pr-47-recovery.md` containing only:

- original PR URL and `OLD_HEAD`;
- `NEW_HEAD` and final merge commit;
- old/new commit count, author login, and signature result;
- refresh run URL and exact six-line summary;
- exact five check names, URLs, and conclusions;
- exact-head CI/observer run URLs and no-approval conclusion;
- fresh `SQUASH`/`github-actions` authorization tuple;
- HyperFrames `0.7.87` and Remotion family `4.0.503`;
- explicit PASS/FAIL conclusions.

Never include raw workflow logs, PR bodies, credentials, tokens, keys, or arbitrary error text.

```bash
git add -f \
  docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/pr-47-recovery.md
git commit -m "docs(deps): record PR 47 recovery"
```

Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel over the evidence and its source assertions. Resume the same implementer for accepted remediation. If remediation changes files, force-add the ignored evidence file, stage affected files, and commit `docs(deps): correct PR 47 recovery evidence` after the planned evidence commit; do not amend or rewrite prior commits. Re-run the exact PR preflight/provenance/check/evidence assertions affected by any edit, and require one read-only verifier before Task 10.

### Task 10: Recover #48 after #47 merges [Tester: yes]

**Files:**
- Create: `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/pr-48-recovery.md`

- [ ] **Step 1: Prove #47 merged and capture a complete fresh #48 preflight**

```bash
test "$(gh pr view 47 \
  --repo therealhieu/md2vid \
  --json state \
  --jq .state)" = "MERGED"

PR=48
REPOSITORY=therealhieu/md2vid
EXPECTED_GROUP=dev-patches
EXPECTED_FILES='["package-lock.json"]'

OLD_JSON=$(gh pr view "$PR" \
  --repo "$REPOSITORY" \
  --json number,state,author,baseRefName,headRefName,headRefOid,mergeStateStatus,autoMergeRequest)
OLD_HEAD=$(printf '%s' "$OLD_JSON" | jq -er .headRefOid)
HEAD_REF=$(printf '%s' "$OLD_JSON" | jq -er .headRefName)

printf '%s' "$OLD_JSON" | jq -e --argjson pr "$PR" '
  .number == $pr
  and .state == "OPEN"
  and .author.login == "dependabot[bot]"
  and .baseRefName == "main"
  and (.headRefName | test("^dependabot/npm_and_yarn/dev-patches(-[a-z0-9]+)?$"))
  and .mergeStateStatus == "BEHIND"
  and .autoMergeRequest.mergeMethod == "SQUASH"
' >/dev/null

FILES=$(gh pr view "$PR" \
  --repo "$REPOSITORY" \
  --json files \
  --jq '[.files[].path] | sort')
test "$FILES" = "$EXPECTED_FILES"

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

Stop without dispatch if any assertion fails. These values are independent from #47 and must be freshly captured.

- [ ] **Step 2: Obtain explicit authorization for one #48 refresh**

Tell the user that the workflow will disable #48’s old auto-merge request and may rebase its branch. Obtain explicit authorization immediately before Step 3.

- [ ] **Step 3: Dispatch and correlate exactly one #48 refresh run**

```bash
RUNS_API="repos/$REPOSITORY/actions/workflows/dependabot-branch-refresh.yml/runs?event=workflow_dispatch&branch=main&per_page=100"
DISPATCH_ACTOR=$(gh api user --jq .login)
BASELINE_RUN_IDS=$(gh api "$RUNS_API" --jq '[.workflow_runs[].id]')
DISPATCHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

gh workflow run dependabot-branch-refresh.yml \
  --repo "$REPOSITORY" \
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
gh run watch "$RUN_ID" --repo "$REPOSITORY" --exit-status

RUN_RECORD=$(gh run view "$RUN_ID" \
  --repo "$REPOSITORY" \
  --json databaseId,event,headBranch,status,conclusion,createdAt,url)
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
  --repo "$REPOSITORY" \
  --log \
  | awk -F '\t' '$2 == "Summarize branch refresh" {
      line = $3
      sub(/^[^[:space:]]+[[:space:]]+/, "", line)
      print line
    }' \
  | rg '^(### Dependabot branch refresh|- Outcome:|- Reason:|- PR:|- Group:|- Expected head:)')
EXPECTED_SUMMARY=$(printf '%s\n' \
  '### Dependabot branch refresh' \
  '- Outcome: selected' \
  '- Reason: selected-for-rebase' \
  '- PR: #48' \
  '- Group: dev-patches' \
  "- Expected head: $OLD_HEAD")
test "$REFRESH_SUMMARY" = "$EXPECTED_SUMMARY"
```

The exact expected-head line must equal the runtime `OLD_HEAD` captured in Step 1. Stop on any mismatch.

- [ ] **Step 4: Prove the new head starts normal CI and observer workflows without approval**

```bash
NEW_HEAD=""
for attempt in $(seq 1 30); do
  NEW_HEAD=$(gh pr view "$PR" \
    --repo "$REPOSITORY" \
    --json headRefOid \
    --jq .headRefOid)
  if test "$NEW_HEAD" != "$OLD_HEAD"; then break; fi
  sleep 2
done

test "$NEW_HEAD" != "$OLD_HEAD"
[[ "$NEW_HEAD" =~ ^[a-f0-9]{40}$ ]]

CI_RUNS='[]'
OBSERVER_RUNS='[]'
for attempt in $(seq 1 60); do
  CI_RUNS=$(gh run list \
    --repo "$REPOSITORY" \
    --workflow ci.yml \
    --branch "$HEAD_REF" \
    --event pull_request \
    --limit 5 \
    --json databaseId,status,conclusion,headSha,event,workflowName,url)
  OBSERVER_RUNS=$(gh run list \
    --repo "$REPOSITORY" \
    --workflow dependabot-auto-merge-observer.yml \
    --branch "$HEAD_REF" \
    --event pull_request \
    --limit 5 \
    --json databaseId,status,conclusion,headSha,event,workflowName,url)

  printf '%s' "$CI_RUNS" | jq -e --arg head "$NEW_HEAD" '
    all(.[] | select(.headSha == $head); .conclusion != "action_required")
  ' >/dev/null
  printf '%s' "$OBSERVER_RUNS" | jq -e --arg head "$NEW_HEAD" '
    all(.[] | select(.headSha == $head); .conclusion != "action_required")
  ' >/dev/null

  if printf '%s' "$CI_RUNS" | jq -e --arg head "$NEW_HEAD" \
      '([.[] | select(.headSha == $head)] | length) > 0' >/dev/null \
    && printf '%s' "$OBSERVER_RUNS" | jq -e --arg head "$NEW_HEAD" \
      '([.[] | select(.headSha == $head)] | length) > 0' >/dev/null; then
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

- [ ] **Step 5: Prove new-head provenance and fresh authorization**

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

Stop if provenance or exact-head authorization fails.

- [ ] **Step 6: Require all five checks and native merge**

```bash
gh pr checks "$PR" \
  --repo "$REPOSITORY" \
  --required \
  --watch

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

FINAL_STATE=""
for attempt in $(seq 1 60); do
  FINAL_STATE=$(gh pr view "$PR" \
    --repo "$REPOSITORY" \
    --json state,mergedAt,mergeCommit,url)
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

The successful `public-snapshot / validate` result is the regression evidence that a dependency-only lockfile commit no longer requires a companion root mirror. Do not manually merge.

- [ ] **Step 7: Write and commit allowlisted #48 evidence**

Create `evidence/pr-48-recovery.md` containing:

- original URL and `OLD_HEAD`;
- exact file set `package-lock.json`;
- `NEW_HEAD` and merge commit;
- old/new commit count, author, and signature result;
- refresh run URL and exact six-line summary;
- exact-head CI/observer URLs and no-approval conclusion;
- fresh `SQUASH`/`github-actions` authorization tuple;
- exact five check names, URLs, and conclusions;
- explicit dynamic snapshot PASS and React type-family validation;
- explicit PASS/FAIL conclusions.

```bash
git add -f \
  docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/pr-48-recovery.md
git commit -m "docs(deps): record PR 48 recovery"
```

Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel over the evidence and its source assertions. Resume the same implementer for accepted remediation. If remediation changes files, force-add the ignored evidence file, stage affected files, and commit `docs(deps): correct PR 48 recovery evidence` after the planned evidence commit; do not amend or rewrite prior commits. Re-run the exact #48 preflight/provenance/check/evidence assertions affected by any edit, and require one read-only verifier. Do not push the evidence branch yet; keep it local through Parts 4 and 5, then rebase it onto final `main` in Part 6.
