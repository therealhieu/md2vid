# PR #47 Refresh Canary Evidence — Safe Preflight Failure

Date: 2026-08-04

## Outcome

This was a safe preflight failure, not a dispatched canary.

- Implementation PR #50 merged to `main` at `242fdc382f2e99da6c557eb1d8329f5295b31b5f`.
- Repository variable `DEPENDABOT_REFRESH_APP_ID` is present and numeric.
- Repository secret name `DEPENDABOT_REFRESH_APP_PRIVATE_KEY` is present.
- User manually verified the GitHub App is installed only on `therealhieu/md2vid` with contents write, pull requests write, metadata read, and no other permissions.
- The authorized one-shot script `/private/tmp/md2vid-pr47-canary.sh` reran preflight and exited before dispatch with exact safe status: `FAIL stage=preflight reason=pr-state`.
- Therefore no `workflow_dispatch` occurred, no refresh run ID exists, the App performed no branch write, and PR #48 was untouched.

Dependabot or GitHub had already made the PR #47 branch current before the authorized script ran. The compare evidence below only proves the branch was current when checked; it does not establish the cause.

Rollout stopped per plan. There was no retry, forced staleness, policy weakening, or substitution of PR #48.

## Read-only evidence commands and allowlisted outputs

### App variable name and numeric-shape check

Command:

```bash
gh variable list --json name,value --jq '.[] | select(.name == "DEPENDABOT_REFRESH_APP_ID") | {name, present: true, numeric: (.value | test("^[0-9]+$"))}'
```

Allowlisted output:

```text
name=DEPENDABOT_REFRESH_APP_ID
present=true
numeric=true
```

### App private-key secret-name check

Command:

```bash
gh secret list --json name --jq '.[] | select(.name == "DEPENDABOT_REFRESH_APP_PRIVATE_KEY") | {name, present: true}'
```

Allowlisted output:

```text
name=DEPENDABOT_REFRESH_APP_PRIVATE_KEY
present=true
```

### PR #47 state query

Command:

```bash
gh pr view 47 --json number,state,author,baseRefName,headRefName,headRefOid,mergeStateStatus,statusCheckRollup,autoMergeRequest --jq '{number,state,author,baseRefName,headRefName,headRefOid,mergeStateStatus,statusCheckRollup,autoMergeRequest}'
```

Allowlisted output:

```text
number=47
state=OPEN
author=Dependabot (app/dependabot)
baseRefName=main
headRefName=dependabot/npm_and_yarn/runtime-patches-556008032a
headRefOid=c42a83ee61f93ed06ff757a9795a0a318920c99c
mergeStateStatus=BLOCKED
autoMergeRequest.mergeMethod=SQUASH
autoMergeRequest.enabledBy.type=Bot
autoMergeRequest.enabledBy.login=github-actions
autoMergeRequest.enabledBy.url=https://github.com/apps/github-actions
statusCheckRollup:
  pr-title=SUCCESS
  dependency-review=SUCCESS
  public-snapshot / validate=FAILURE
  pr-minimum / validate=FAILURE
  pr-latest / validate=FAILURE
  observer=SUCCESS
```

### PR #47 commits query

Command:

```bash
gh pr view 47 --json commits --jq '{totalCount: (.commits | length), commits: [.commits[] | {oid, author: .authors[0].login, signature: .verification}]}'
```

Allowlisted output:

```text
totalCount=1
commit.oid=c42a83ee61f93ed06ff757a9795a0a318920c99c
commit.author=dependabot[bot]
commit.signature.verified=true
commit.signature.reason=valid
```

### PR #47 GraphQL provenance and native auto-merge query

Command:

```bash
gh api graphql \
  -f owner=therealhieu \
  -f name=md2vid \
  -F number=47 \
  -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){headRefOid mergeStateStatus commits(first:10){totalCount nodes{commit{oid authors(first:10){nodes{user{login}}} signature{__typename ... on GpgSignature{isValid state}}}}} autoMergeRequest{mergeMethod enabledBy{__typename login url}}}}}'
```

Allowlisted output:

```text
headRefOid=c42a83ee61f93ed06ff757a9795a0a318920c99c
mergeStateStatus=BLOCKED
commits.totalCount=1
commit.author=dependabot[bot]
commit.signature.__typename=GpgSignature
commit.signature.isValid=true
commit.signature.state=VALID
autoMergeRequest.mergeMethod=SQUASH
autoMergeRequest.enabledBy.__typename=Bot
autoMergeRequest.enabledBy.login=github-actions
autoMergeRequest.enabledBy.url=https://github.com/apps/github-actions
```

### Compare `main...headRef`

Command:

```bash
gh api repos/therealhieu/md2vid/compare/main...dependabot/npm_and_yarn/runtime-patches-556008032a --jq '{status,ahead_by,behind_by,total_commits,base_commit: .base_commit.sha, merge_base_commit: .merge_base_commit.sha}'
```

Allowlisted output:

```text
status=ahead
ahead_by=1
behind_by=0
total_commits=1
base_commit=242fdc382f2e99da6c557eb1d8329f5295b31b5f
merge_base_commit=242fdc382f2e99da6c557eb1d8329f5295b31b5f
```

### Refresh workflow run list

Command:

```bash
gh run list --workflow dependabot-branch-refresh.yml --limit 5 --json databaseId,headBranch,headSha,status,conclusion,event,createdAt --jq 'map(select(.event == "workflow_dispatch" or .headBranch == "dependabot/npm_and_yarn/runtime-patches-556008032a"))'
```

Allowlisted output:

```json
[]
```

## Explicit checks

- PASS: Credential names present and manual installation verification recorded.
- PASS: One verified Dependabot commit and exact native SQUASH authorization.
- FAIL: Required `BEHIND` precondition; live branch was current (`behind_by=0`) and merge status `BLOCKED`.
- PASS: Failed closed before dispatch; zero branch mutations; PR #48 untouched.
- NOT RUN: New-head provenance, workflow triggering, fresh authorization, five new-head checks, native merge.
