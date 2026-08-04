# PR #47 Refresh Canary Evidence — Safe Preflight Failure

Date: 2026-08-04

## Outcome

This was a safe preflight failure, not a dispatched canary.

- Implementation PR #50 merged to `main` at `242fdc382f2e99da6c557eb1d8329f5295b31b5f`.
- Repository variable `DEPENDABOT_REFRESH_APP_ID` is present and numeric.
- Repository secret name `DEPENDABOT_REFRESH_APP_PRIVATE_KEY` is present.
- User manually verified the GitHub App is installed only on `therealhieu/md2vid` with contents write, pull requests write, metadata read, and no other permissions.
- The authorized one-shot script `/private/tmp/md2vid-pr47-canary.sh` was invoked as `bash /private/tmp/md2vid-pr47-canary.sh` and exited `1` during PR-state preflight with exact non-sensitive output:

```text
Task 8: verifying repository configuration and PR #47 preflight
FAIL stage=preflight reason=pr-state
```

At preflight, the branch was current (`behind_by=0`). The captured evidence does not establish why the branch was current.

The controlled script invocation terminated before its own dispatch command and before the later workflow-driven mutation path could be reached. Post-failure run-list samples below are point-in-time corroborating observations, not a complete historical baseline. No pre-invocation PR #48 head snapshot or run-ID baseline was captured, so this file does not independently prove historical PR #48 branch nonmutation; it records that no Task 9 script/dispatch was run and that PR #48 remained in the allowlisted point-in-time state below.

Rollout stopped per plan. There was no retry, forced staleness, policy weakening, or substitution of PR #48.

## Original script invocation and control-flow boundary

Original non-sensitive invocation record from the controlled canary attempt:

```bash
bash /private/tmp/md2vid-pr47-canary.sh
```

Original non-sensitive terminal output:

```text
Task 8: verifying repository configuration and PR #47 preflight
FAIL stage=preflight reason=pr-state
```

Original exit status:

```text
1
```

The coordinator wrapper first asserted `/private/tmp/md2vid-pr47-canary` did not exist. Current local state later shows that state directory exists because the script created it during the failed preflight attempt; this current local fact is not used as a pre-invocation baseline.

Command used to inspect non-sensitive control flow without rerunning the script:

```bash
python3 - <<'PY'
from pathlib import Path
lines = Path('/private/tmp/md2vid-pr47-canary.sh').read_text().splitlines()
for start, end in [(9, 14), (27, 33), (86, 91)]:
    for n in range(start, end + 1):
        line = lines[n-1]
        print(f'{n}: {line}' if line else f'{n}:')
    if end != 91:
        print('---')
PY
```

Literal output:

```text
9: fail() {
10:   printf 'FAIL stage=%s reason=%s\n' "$1" "$2" | tee "$STATE_DIR/status.txt"
11:   exit 1
12: }
13:
14: printf 'Task 8: verifying repository configuration and PR #47 preflight\n'
---
27:   and .state == "OPEN"
28:   and .author.login == "dependabot[bot]"
29:   and .baseRefName == "main"
30:   and (.headRefName | test("^dependabot/(npm_and_yarn/(runtime|dev)-patches|github_actions/actions-patches)(-[a-z0-9]+)?$"))
31:   and .mergeStateStatus == "BEHIND"
32:   and .autoMergeRequest.mergeMethod == "SQUASH"
33: ' >/dev/null || fail preflight pr-state
---
86: printf 'Task 8: dispatching the trusted main-branch refresh workflow exactly once\n'
87: RUNS_API="repos/$REPOSITORY/actions/workflows/dependabot-branch-refresh.yml/runs?event=workflow_dispatch&branch=main&per_page=100"
88: DISPATCH_ACTOR=$(gh api user --jq .login) || fail dispatch actor-query
89: BASELINE_RUN_IDS=$(gh api "$RUNS_API" --jq '[.workflow_runs[].id]') || fail dispatch baseline-runs
90: DISPATCHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
91: gh workflow run dependabot-branch-refresh.yml --repo "$REPOSITORY" --ref main || fail dispatch workflow-run
```

This proves the controlled invocation prints `FAIL stage=preflight reason=pr-state` and exits from `fail preflight pr-state` before the script reaches its later `gh workflow run` dispatch block.

## Remediation read-only evidence capture

Capture time for the following point-in-time read-only observations: `2026-08-04T08:41:40Z`.

### App variable name and numeric-shape check

Command:

```bash
gh variable list -R therealhieu/md2vid --json name,value --jq '[.[] | select(.name == "DEPENDABOT_REFRESH_APP_ID") | {name, present: true, numeric: (.value | test("^[0-9]+$"))}]'
```

Literal output:

```json
[{"name":"DEPENDABOT_REFRESH_APP_ID","numeric":true,"present":true}]
```

### App private-key secret-name check

Command:

```bash
gh secret list -R therealhieu/md2vid --json name --jq '[.[] | select(.name == "DEPENDABOT_REFRESH_APP_PRIVATE_KEY") | {name, present: true}]'
```

Literal output:

```json
[{"name":"DEPENDABOT_REFRESH_APP_PRIVATE_KEY","present":true}]
```

### PR #47 state query

Command:

```bash
gh pr view 47 -R therealhieu/md2vid --json number,state,author,baseRefName,headRefName,headRefOid,mergeStateStatus,autoMergeRequest,statusCheckRollup --jq '{number,state,author:{login:.author.login,type:.author.type},baseRefName,headRefName,headRefOid,mergeStateStatus,autoMergeRequest:{mergeMethod:.autoMergeRequest.mergeMethod,enabledBy:{type:.autoMergeRequest.enabledBy.type,login:.autoMergeRequest.enabledBy.login,url:.autoMergeRequest.enabledBy.url}},statusCheckRollup:[.statusCheckRollup[] | select(.name == "pr-title" or .name == "dependency-review" or .name == "public-snapshot / validate" or .name == "pr-minimum / validate" or .name == "pr-latest / validate" or .name == "observer") | {name,conclusion}]}'
```

Literal output:

```json
{"author":{"login":"app/dependabot","type":null},"autoMergeRequest":{"enabledBy":{"login":"app/github-actions","type":null,"url":null},"mergeMethod":"SQUASH"},"baseRefName":"main","headRefName":"dependabot/npm_and_yarn/runtime-patches-556008032a","headRefOid":"c42a83ee61f93ed06ff757a9795a0a318920c99c","mergeStateStatus":"BLOCKED","number":47,"state":"OPEN","statusCheckRollup":[{"conclusion":"SUCCESS","name":"pr-title"},{"conclusion":"SUCCESS","name":"dependency-review"},{"conclusion":"FAILURE","name":"public-snapshot / validate"},{"conclusion":"FAILURE","name":"pr-minimum / validate"},{"conclusion":"FAILURE","name":"pr-latest / validate"}]}
```

The original failure-state observation recorded `observer=SUCCESS`; the remediation live allowlisted PR query above did not return an `observer` entry, so this file does not reconstruct one into the literal output.

### PR #47 checks projection

Command:

```bash
gh pr checks 47 -R therealhieu/md2vid --json name,state --jq '[.[] | select(.name == "pr-title" or .name == "dependency-review" or .name == "public-snapshot / validate" or .name == "pr-minimum / validate" or .name == "pr-latest / validate" or .name == "observer") | {name,state}]'
```

Literal output:

```json
[{"name":"pr-latest / validate","state":"FAILURE"},{"name":"pr-minimum / validate","state":"FAILURE"},{"name":"pr-title","state":"SUCCESS"},{"name":"dependency-review","state":"SUCCESS"},{"name":"public-snapshot / validate","state":"FAILURE"}]
```

### PR #47 REST commits query

Command:

```bash
gh api 'repos/therealhieu/md2vid/pulls/47/commits?per_page=100' --jq '[.[] | {sha,author_login:.author.login,signature_verified:.commit.verification.verified,signature_reason:.commit.verification.reason}]'
```

Literal output:

```json
[{"author_login":"dependabot[bot]","sha":"c42a83ee61f93ed06ff757a9795a0a318920c99c","signature_reason":"valid","signature_verified":true}]
```

### PR #47 GraphQL provenance and native auto-merge query

Command:

```bash
gh api graphql -f owner=therealhieu -f name=md2vid -F number=47 -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){headRefOid mergeStateStatus commits(first:10){totalCount nodes{commit{oid author{user{login}} signature{__typename ... on GpgSignature{isValid state signer{login}}}}}} autoMergeRequest{mergeMethod enabledBy{__typename login url}}}}}' --jq '.data.repository.pullRequest | {headRefOid,mergeStateStatus,commits:{totalCount:.commits.totalCount,nodes:[.commits.nodes[] | {oid:.commit.oid,author_login:.commit.author.user.login,signature:{type:.commit.signature.__typename,isValid:.commit.signature.isValid,state:.commit.signature.state,signer_login:.commit.signature.signer.login}}]},autoMergeRequest:{mergeMethod:.autoMergeRequest.mergeMethod,enabledBy:{type:.autoMergeRequest.enabledBy.__typename,login:.autoMergeRequest.enabledBy.login,url:.autoMergeRequest.enabledBy.url}}}'
```

Literal output:

```json
{"autoMergeRequest":{"enabledBy":{"login":"github-actions","type":"Bot","url":"https://github.com/apps/github-actions"},"mergeMethod":"SQUASH"},"commits":{"nodes":[{"author_login":"dependabot[bot]","oid":"c42a83ee61f93ed06ff757a9795a0a318920c99c","signature":{"isValid":true,"signer_login":"web-flow","state":"VALID","type":"GpgSignature"}}],"totalCount":1},"headRefOid":"c42a83ee61f93ed06ff757a9795a0a318920c99c","mergeStateStatus":"BLOCKED"}
```

### PR #47 compare `main...headRef`

Command:

```bash
gh api repos/therealhieu/md2vid/compare/main...dependabot/npm_and_yarn/runtime-patches-556008032a --jq '{status,ahead_by,behind_by,total_commits,base_commit:.base_commit.sha,merge_base_commit:.merge_base_commit.sha}'
```

Literal output:

```json
{"ahead_by":1,"base_commit":"242fdc382f2e99da6c557eb1d8329f5295b31b5f","behind_by":0,"merge_base_commit":"242fdc382f2e99da6c557eb1d8329f5295b31b5f","status":"ahead","total_commits":1}
```

### PR #47 refresh workflow run-list sample

Command:

```bash
gh run list -R therealhieu/md2vid --workflow dependabot-branch-refresh.yml --limit 5 --json databaseId,headBranch,headSha,status,conclusion,event,createdAt --jq 'map(select(.event == "workflow_dispatch" or .headBranch == "dependabot/npm_and_yarn/runtime-patches-556008032a") | {databaseId,headBranch,headSha,status,conclusion,event,createdAt})'
```

Literal output:

```json
[]
```

This is a point-in-time sample corroborating that no matching recent refresh run was visible in the sampled set; it is not a complete historical workflow-run baseline.

## PR #48 point-in-time evidence and limits

No Task 9 script or dispatch was run. No `evidence/pr-48-refresh-canary.md` file was created. The following read-only observations are post-failure point-in-time evidence only; because no pre-invocation PR #48 head snapshot or run-ID baseline was captured, they do not independently prove historical PR #48 branch nonmutation.

### PR #48 state query

Command:

```bash
gh pr view 48 -R therealhieu/md2vid --json number,state,author,baseRefName,headRefName,headRefOid,mergeStateStatus,autoMergeRequest --jq '{number,state,author:{login:.author.login},baseRefName,headRefName,headRefOid,mergeStateStatus,autoMergeRequest:{mergeMethod:.autoMergeRequest.mergeMethod,enabledBy:{login:.autoMergeRequest.enabledBy.login}}}'
```

Literal output:

```json
{"author":{"login":"app/dependabot"},"autoMergeRequest":{"enabledBy":{"login":"app/github-actions"},"mergeMethod":"SQUASH"},"baseRefName":"main","headRefName":"dependabot/npm_and_yarn/dev-patches-7c5a0793cf","headRefOid":"2ec3a55312d1476533f24698dec6ec7c5673968c","mergeStateStatus":"BLOCKED","number":48,"state":"OPEN"}
```

### PR #48 GraphQL native auto-merge query

Command:

```bash
gh api graphql -f owner=therealhieu -f name=md2vid -F number=48 -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){headRefOid mergeStateStatus autoMergeRequest{mergeMethod enabledBy{__typename login url}}}}}' --jq '.data.repository.pullRequest | {headRefOid,mergeStateStatus,autoMergeRequest:{mergeMethod:.autoMergeRequest.mergeMethod,enabledBy:{type:.autoMergeRequest.enabledBy.__typename,login:.autoMergeRequest.enabledBy.login,url:.autoMergeRequest.enabledBy.url}}}'
```

Literal output:

```json
{"autoMergeRequest":{"enabledBy":{"login":"github-actions","type":"Bot","url":"https://github.com/apps/github-actions"},"mergeMethod":"SQUASH"},"headRefOid":"2ec3a55312d1476533f24698dec6ec7c5673968c","mergeStateStatus":"BLOCKED"}
```

### PR #48 compare `main...headRef`

Command:

```bash
gh api repos/therealhieu/md2vid/compare/main...dependabot/npm_and_yarn/dev-patches-7c5a0793cf --jq '{status,ahead_by,behind_by,total_commits,base_commit:.base_commit.sha,merge_base_commit:.merge_base_commit.sha}'
```

Literal output:

```json
{"ahead_by":1,"base_commit":"242fdc382f2e99da6c557eb1d8329f5295b31b5f","behind_by":0,"merge_base_commit":"242fdc382f2e99da6c557eb1d8329f5295b31b5f","status":"ahead","total_commits":1}
```

### PR #48 branch-specific refresh workflow run-list sample

Command:

```bash
gh run list -R therealhieu/md2vid --workflow dependabot-branch-refresh.yml --limit 5 --json databaseId,headBranch,headSha,status,conclusion,event,createdAt --jq 'map(select(.headBranch == "dependabot/npm_and_yarn/dev-patches-7c5a0793cf") | {databaseId,headBranch,headSha,status,conclusion,event,createdAt})'
```

Literal output:

```json
[]
```

### PR #48 evidence file absence

Command:

```bash
python3 - <<'PY'
from pathlib import Path
import json
p = Path('/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-evidence/docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/evidence/pr-48-refresh-canary.md')
print(json.dumps({'path': str(p), 'exists': p.exists()}, separators=(',', ':')))
PY
```

Literal output:

```json
{"path":"/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-evidence/docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/evidence/pr-48-refresh-canary.md","exists":false}
```

## Explicit checks

- PASS: Credential names present and manual installation verification recorded.
- PASS: PR #47 had one verified Dependabot commit and exact native SQUASH authorization by `Bot` / `github-actions` / `https://github.com/apps/github-actions`.
- FAIL: Required `BEHIND` precondition; at preflight and at remediation capture the branch was current (`behind_by=0`) and merge status was `BLOCKED`.
- PASS: The controlled script invocation failed closed before reaching its own `gh workflow run` dispatch block.
- PASS: Task 9 was not run and no PR #48 evidence file exists.
- LIMITED: Post-failure PR #47 and PR #48 run-list samples returned `[]`, but no complete pre-invocation workflow-run baseline was captured.
- LIMITED: PR #48 point-in-time evidence shows the expected open Dependabot PR state, current branch (`behind_by=0`), and native SQUASH authorization; it does not independently prove historical branch nonmutation.
- NOT RUN: New-head provenance, workflow triggering, fresh authorization, five new-head checks, native merge.
