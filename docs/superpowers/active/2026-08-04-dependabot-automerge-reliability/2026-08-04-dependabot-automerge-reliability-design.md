# Dependabot Auto-Merge Reliability Design

## Summary

Repair the guarded Dependabot pipeline at four boundaries without weakening its existing security model:

1. Extend bot-only title validation to the current and legacy Dependabot title families.
2. Make trusted but non-group Dependabot PRs successful ineligible no-ops instead of policy-workflow failures.
3. Group synchronized minor/major dependency families into atomic manual-review PRs while keeping patch auto-merge unchanged.
4. Add a checkout-free, serial, expected-head-bound branch-refresh workflow so strict protection can converge stale eligible patch PRs onto `main`.

The source requirements are recorded in [2026-08-04-dependabot-automerge-reliability-requirements.md](./2026-08-04-dependabot-automerge-reliability-requirements.md).

## Approved Architecture Decision — Preserve the Existing Trust Boundary

The existing two-stage auto-merge architecture remains authoritative:

```text
Dependabot pull_request event
  → unprivileged observer
  → trusted default-branch workflow_run
  → GitHub API re-query
  → exact repository/PR/head/commit/provenance validation
  → exact patch-group metadata validation
  → head-bound native squash auto-merge request
  → strict branch protection decides when merge is allowed
```

This change must not collapse the observer and privileged stage, use `pull_request_target`, check out PR code, or replace native auto-merge with a direct merge.

A separate branch-refresh workflow receives narrow branch-mutation authority, but it follows the same rule: trusted default-branch workflow content, no checkout, no PR-code execution, complete live API validation, expected-head binding, and one mutation target per run.

## Approved Credential Decision — Repository-Scoped GitHub App

The user approved a narrowly scoped GitHub App for branch refresh on 2026-08-04. `GITHUB_TOKEN` is not suitable: GitHub places `pull_request` runs caused by `GITHUB_TOKEN` PR updates into an approval-required state, which would deadlock unattended required checks. A GitHub App installation token causes the branch update as an external integration, allowing the normal `pull_request/synchronize` observer and CI paths to run without workflow approval.

The App is installed only on `therealhieu/md2vid` with `contents: write`, `pull requests: write`, and metadata read. Repository configuration uses:

```text
Variable: DEPENDABOT_REFRESH_APP_ID
Secret:   DEPENDABOT_REFRESH_APP_PRIVATE_KEY
```

The refresh workflow mints a short-lived installation token through official `actions/create-github-app-token` pinned to a full commit SHA. The App token is used only to query and mutate the selected Dependabot PR. The built-in `GITHUB_TOKEN` is never a fallback mutation credential.

## Goals

- Unblock current eligible patch PRs #47 and #48 without modifying their branches manually or bypassing checks.
- Let valid generated Dependabot title forms pass while retaining strict human title rules.
- Keep all non-patch and unrecognized dependency updates manual.
- Prevent React, React types, and Remotion family updates from being opened as invalid split minor/major PRs.
- Automatically recover one stale eligible patch PR at a time under strict branch protection.
- Preserve one verified Dependabot commit as a mandatory auto-merge condition.
- Make every ambiguous state observable and fail closed.

## Non-Goals

- Making TypeScript 7 compatible with the current Remotion toolchain.
- Auto-merging minor or major dependency updates.
- Changing required status checks or branch protection settings.
- Introducing approvals, a merge queue, PAT, third-party merge action, or admin bypass.
- Using the approved refresh GitHub App for reviews, approvals, direct merges, non-Dependabot branches, or any repository other than `therealhieu/md2vid`.
- Refactoring unrelated release, audit, public-snapshot, or CI execution paths.
- Automatically closing #49.

## Current Architecture

```text
.github/dependabot.yml
  ├─ runtime-patches: patch only
  ├─ dev-patches: patch only
  └─ actions-patches: patch only

Dependabot PR
  ├─ CI pr-title
  │    └─ accepts only legacy grouped sentence
  ├─ five strict required checks
  ├─ observer succeeds
  └─ trusted auto-merge policy
       ├─ generic branch regex rejects dots/slashes
       ├─ group metadata parser runs unconditionally
       └─ exact patch groups request native auto-merge

Native auto-merge enabled
  └─ later main update marks PR BEHIND
       └─ no workflow refreshes it
```

## Expected Architecture

```text
.github/dependabot.yml
  ├─ patch groups → guarded auto-merge
  └─ synchronized minor/major family groups → manual review

Dependabot PR
  │
  ├─ CI title policy
  │    ├─ humans: unchanged conventional grammar + 72 chars
  │    └─ Dependabot: exact generated title families + branch binding
  │
  ├─ observer
  │
  └─ trusted auto-merge policy
       ├─ validate event/run/live PR/commit provenance
       ├─ exact patch-group branch?
       │    ├─ yes → parse complete grouped metadata → eligible decision
       │    └─ no  → eligible=false, group=none, successful no-op
       └─ eligible=true → exact-head native squash auto-merge request

Trusted branch refresh (daily/manual)
  ├─ mint repository-scoped GitHub App installation token
  ├─ inventory exact patch-group PRs
  ├─ serialize on oldest open patch-group PR
  ├─ validate live identity/provenance/metadata/auto-merge actor
  ├─ if oldest is BEHIND:
  │    ├─ disable old auto-merge request
  │    └─ GraphQL REBASE with expectedHeadOid using App token
  └─ App-caused synchronize event restarts CI, observer, and trusted policy
```

## Component Changes

| Component | Change | Security boundary |
|---|---|---|
| `.github/workflows/ci.yml` | Accept current/legacy grouped titles and generated individual titles for exact Dependabot identity | Title validity only; never grants merge eligibility |
| `.github/workflows/dependabot-auto-merge.yml` | Broaden valid Dependabot namespace handling and short-circuit non-policy branches to a successful no-op | Existing exact group policy, metadata, provenance, and head binding remain unchanged |
| `.github/dependabot.yml` | Add three minor/major family groups after patch groups | New groups remain absent from auto-merge policies |
| `.github/workflows/dependabot-branch-refresh.yml` | Mint a repository-scoped GitHub App token, serialize, and rebase one stale eligible patch PR through trusted APIs | Checkout-free, expected-head-bound, disables old authorization first, and relies on App-caused normal workflow triggering |
| `test/ci/workflows.test.ts` | Add positive, negative, structural, and mutation coverage for every new contract | Prevents authority broadening and title-policy drift |
| `public-snapshot.json` | Refresh hashes for changed public files | Keeps public artifact contract current |

## Title Validation Design

### Purpose

Make the required `pr-title` check compatible with generated Dependabot titles while preventing the title check from becoming an eligibility or security substitute.

### Human path

The existing human path remains byte-for-byte equivalent in behavior:

```text
allowed type
+ optional lowercase scope
+ colon and one space
+ nonempty summary
+ no trailing punctuation
+ at most 72 characters
+ actor/author/head are not Dependabot
```

### Dependabot identity

The fallback requires:

```text
PR_ACTOR == dependabot[bot]
AND PR_AUTHOR == dependabot[bot]
AND PR_HEAD_REF belongs to a supported Dependabot ecosystem namespace
```

Supported namespace shapes must include real generated refs:

```text
dependabot/npm_and_yarn/<dependency-or-group-ref>
dependabot/github_actions/<dependency-or-group-ref>
```

The payload may contain dots and additional slash segments after the ecosystem, for example:

```text
dependabot/npm_and_yarn/typescript-7.0.2
dependabot/npm_and_yarn/types/node-26.1.2
dependabot/github_actions/actions/setup-node-7.0.0
```

### Grouped title grammar

Known group IDs:

| Ecosystem | Group IDs accepted by title policy | Auto-merge eligible |
|---|---|---:|
| npm | `runtime-patches`, `dev-patches` | Yes |
| npm | `react-family`, `react-types-family`, `remotion-family` | No |
| GitHub Actions | `actions-patches` | Yes |

Accepted forms:

```text
chore(deps): bump the <group> group with <updates> <update-word>

chore(deps): bump the <group> group across <directories> <directory-word> with <updates> <update-word>
```

Rules:

- Counts use canonical positive decimal syntax: `[1-9][0-9]*`.
- `1` requires singular words; values greater than `1` require plural words.
- The group ID must map to the exact branch prefix for its ecosystem.
- Optional Dependabot digest suffixes remain allowed on grouped branches.
- Unknown groups, near-prefixes, wrong ecosystem mappings, and punctuation suffixes fail.

### Individual title grammar

Accepted form:

```text
chore(deps): bump <dependency> from <old-version> to <new-version>
```

The dependency token must be nonempty and compatible with npm scoped names and Action owner/name values. Version fields must be nonempty and must not contain line breaks. The title parser does not classify semantic version impact.

Individual title acceptance changes only the `pr-title` result. The privileged policy still returns `eligible=false` because no exact patch-group branch policy matches.

## Auto-Merge Policy No-Op Design

### Purpose

Distinguish a trusted but intentionally ineligible Dependabot PR from a malformed or untrusted workflow event.

### Existing validation retained

Before eligibility classification, continue to validate:

- Triggering run ID, name, event, conclusion, actor, and repository identity.
- Exactly one associated PR.
- Event head ref/SHA equal the run-associated PR head and live PR head.
- Same head and base repository.
- Base branch `main`.
- Open PR authored by `dependabot[bot]`.
- No maintainer-change marker.
- Exactly one current commit.
- Commit SHA equals the validated head.
- Commit author is Dependabot and signature verification is true.

### Generic branch namespace check

Replace the incomplete payload character class with a namespace check that admits normal generated dependency refs while rejecting unsupported ecosystems and empty payloads.

Conceptual rule:

```text
head starts with dependabot/npm_and_yarn/
OR head starts with dependabot/github_actions/
AND text remains after the ecosystem separator
```

Security does not depend on parsing every legal Git ref character: the ref is cross-bound to event, workflow run, associated PR, live PR, repository, and head SHA. Exact auto-merge group regexes remain narrower.

### Eligibility branching

```text
policy = exact group policy matching live head ref

if policy is absent:
  emit eligible=false
  emit group=none
  emit validated PR number and head SHA
  exit successfully

if policy exists:
  parse grouped dependency metadata
  validate complete fields
  require exact dependency-group
  require every update to be semver patch
  require group allowlist
  emit eligible result and exact group
```

The metadata parser remains strict for exact auto-merge group branches. Missing, malformed, duplicate, incomplete, non-patch, or unauthorized grouped metadata still fails or produces ineligibility according to the existing policy contract.

### Side effects

No new side effects are added. Existing revalidation and merge-request steps remain guarded by:

```yaml
if: steps.policy.outputs.eligible == 'true'
```

## Dependency Grouping Design

### Purpose

Align Dependabot PR boundaries with repository-enforced version-family boundaries.

### Group ordering

Dependabot applies the first matching group. Preserve patch groups first:

```text
1. runtime-patches      patch
2. dev-patches          patch
3. react-family         minor, major
4. react-types-family   minor, major
5. remotion-family      minor, major
```

GitHub Actions keeps its existing `actions-patches` patch group. Action minor/major updates remain individual and manual.

### Manual family definitions

| Group | Exact package set | Update types | Merge mode |
|---|---|---|---|
| `react-family` | `react`, `react-dom` | minor, major | Manual |
| `react-types-family` | `@types/react`, `@types/react-dom` | minor, major | Manual |
| `remotion-family` | `remotion`, `@remotion/google-fonts`, `@remotion/media` | minor, major | Manual |

The workflow tests derive expected family members from `package.json` and `scripts/dependency_versions.ts` contracts where possible. They must reject:

- An omitted family member.
- An unrelated package added to a family.
- `patch` added to a manual family group.
- `minor` or `major` added to an auto-merge group.
- A manual family group added to the privileged policy allowlist.

## Branch Refresh Design

### Purpose

Allow strict branch protection and native auto-merge to converge without merge commits, human comments, or concurrent CI churn.

### Workflow trigger

Create `.github/workflows/dependabot-branch-refresh.yml` with:

```yaml
on:
  schedule:
    - cron: "17 5 * * *"
  workflow_dispatch:
```

The daily off-minute schedule limits delay after `main` changes while remaining proportionate to weekly dependency scans. `workflow_dispatch` supports the initial canary and manual recovery.

### Credentials, permissions, and execution boundary

The workflow keeps its built-in token empty/read-only and mints a short-lived repository installation token:

```yaml
permissions: {}

jobs:
  refresh-one:
    permissions: {}
    steps:
      - id: app-token
        uses: actions/create-github-app-token@<full-40-character-sha>
        with:
          app-id: ${{ vars.DEPENDABOT_REFRESH_APP_ID }}
          private-key: ${{ secrets.DEPENDABOT_REFRESH_APP_PRIVATE_KEY }}
          owner: therealhieu
          repositories: md2vid
```

The installed App grants only `contents: write`, `pull requests: write`, and metadata read on `therealhieu/md2vid`. Every GitHub API/CLI step in this workflow receives `GH_TOKEN: ${{ steps.app-token.outputs.token }}` explicitly. No step may fall back to `github.token`.

The workflow must contain:

- No checkout.
- No external action except official `actions/create-github-app-token` pinned to a full SHA.
- No package install.
- No project script execution.
- No artifact/cache use.
- No untrusted shell interpolation.
- A fixed global concurrency group with `cancel-in-progress: false`.

The existing `dependabot-auto-merge.yml` concurrency remains PR/head-oriented with cancellation enabled; cancelling a stale authorization run is intentional and independent from serial refresh mutation.

### Candidate inventory

Query all open PRs and keep exact patch-group branch families only:

```text
dependabot/npm_and_yarn/runtime-patches[-digest]
dependabot/npm_and_yarn/dev-patches[-digest]
dependabot/github_actions/actions-patches[-digest]
```

Sort by creation time, then PR number. The oldest open exact patch-group PR becomes the queue head. Do not skip an unhealthy queue head to mutate a newer PR.

This queue-head rule provides serialization without labels or repository state:

```text
oldest open patch-group PR
  ├─ waiting for checks / merge → no-op; newer PRs wait
  ├─ malformed or unauthorized → fail/no mutation; newer PRs wait
  ├─ behind and fully eligible → refresh this PR only
  └─ merged/closed → next run naturally advances to the next PR
```

### Queue-head validation

Re-query and validate the queue head using the existing policy invariants:

- Open same-repository PR against `main`.
- PR author is `dependabot[bot]`.
- Exact supported patch-group branch.
- Exactly one current commit.
- Current commit SHA equals head SHA.
- Commit is Dependabot-authored and signature-verified.
- No maintainer-change marker.
- Complete grouped metadata.
- Every update is `version-update:semver-patch`.
- Dependency names satisfy the exact group allowlist.
- Native auto-merge request exists and uses `SQUASH`.
- GraphQL `autoMergeRequest.enabledBy` exactly matches the observed native Actions actor tuple: `__typename=Bot`, `login=github-actions`, `url=https://github.com/apps/github-actions`. A maintainer, unrelated bot, or unrelated App actor blocks selection before writes.

If the queue head is not `BEHIND`, the workflow exits successfully without mutation and reports that it is waiting for checks or merge.

If the queue head is `BEHIND` but lacks an expected auto-merge request or fails any invariant, the workflow must not advance to another PR. It fails or reports a blocked queue head according to whether the state is malformed or merely pending.

### Mutation sequence

The workflow performs exactly this order with the generated GitHub App installation token:

```text
1. Read validated pullRequestId and expectedHeadOid.
2. Re-query live head OID and require equality.
3. Disable the existing auto-merge request:
     disablePullRequestAutoMerge(pullRequestId)
4. Re-query live head OID again and require equality.
5. Rebase:
     updatePullRequestBranch(
       pullRequestId,
       updateMethod: REBASE,
       expectedHeadOid
     )
6. Record selected-for-rebase outcome.
7. Stop. Do not request auto-merge in the refresh workflow.
```

Disabling the old request before the head rewrite prevents an authorization tied to the old head from surviving the mutation. The refresh workflow does not authorize the new head.

Because the mutation actor is the installed GitHub App rather than `GITHUB_TOKEN`, the resulting `pull_request/synchronize` event follows the normal workflow path without the approval-required state. CI and the unprivileged observer run for the new head. The trusted auto-merge policy then validates that new current head and requests a fresh head-bound squash auto-merge only if all provenance and patch metadata invariants still hold.

### Why REBASE is mandatory

The REST update-branch endpoint and default `gh pr update-branch` behavior merge `main` into the PR branch. A merge-style update normally introduces a second commit and breaks the one-current-verified-Dependabot-commit invariant.

GraphQL `updatePullRequestBranch` with `updateMethod: REBASE` is the only designed mutation path. The design does not assume that rebase preserves provenance; that is established by the canary.

### Outcome summary contract

The selection/mutation step writes trusted enum values to a runner-temp state file. A final `if: always()` step renders exactly:

```text
### Dependabot branch refresh
- Outcome: no-candidates | waiting | blocked | selected | failed
- Reason: <fixed reason code>
- PR: none | #<validated integer>
- Group: none | runtime-patches | dev-patches | actions-patches
- Expected head: none | <validated 40-character SHA>
```

Reason codes:

```text
no-candidates
queue-head-not-behind
queue-head-missing-auto-merge
queue-head-invalid
selected-for-rebase
auto-merge-disable-failed
head-changed
rebase-failed
app-token-unavailable
```

The summary must not render PR titles, bodies, dependency metadata text, token values, raw API responses, or arbitrary exception strings. Tests assert every outcome and fixed field label.

## Security Model

### Trust boundaries

```text
Untrusted:
  PR title, body, changed files, branch content, observer job content

Trusted only after cross-check:
  GitHub API repository identity
  workflow_run identity
  associated PR number/head
  live PR identity/head
  commit author/signature/count
  parsed Dependabot commit metadata

Write-authorized:
  existing auto-merge workflow → GITHUB_TOKEN requests native auto-merge for exact validated head
  refresh workflow             → repository-scoped GitHub App token disables old request + rebases one exact validated head
```

### Invariants

- Title acceptance never grants auto-merge eligibility.
- Manual family grouping never grants auto-merge eligibility.
- Namespace acceptance never grants auto-merge eligibility.
- Unknown exact policy always means successful `eligible=false` with no writes.
- Every auto-merge request is bound to the exact validated live head.
- Every refresh is bound to the exact validated live head and uses only the repository-scoped GitHub App installation token.
- Candidate selection requires the exact observed Bot/github-actions auto-merge authorizer tuple.
- An old auto-merge request is removed before the head changes.
- The refresh workflow never authorizes the new head.
- The App-caused synchronize event must start normal CI and observer runs without approval.
- Strict required checks remain the final merge authority.

### Mutation resistance

Tests must fail if a change:

- Removes actor, repository, base, head, commit, signature, or commit-count validation.
- Parses group metadata from an unknown branch and treats it as eligible.
- Adds a manual family group to the auto-merge policy.
- Removes `eligible == 'true'` from a write step.
- Allows checkout, project execution, artifacts, caches, reviews, approvals, or direct merge.
- Adds any external action other than full-SHA-pinned `actions/create-github-app-token`, broadens its owner/repository scope, or permits mutation with `github.token`.
- Accepts an `autoMergeRequest.enabledBy` actor other than the exact `github-actions` Bot tuple.
- Removes a required fixed outcome/reason from the job-summary contract or renders untrusted free-form text.
- Selects more than one refresh candidate.
- Skips a blocked oldest queue head and mutates a newer PR.
- Performs rebase before disabling old auto-merge.
- Uses `MERGE` or omits `expectedHeadOid`.
- Relaxes the one-verified-Dependabot-commit invariant.

## Failure Handling

| Failure | Result | Recovery |
|---|---|---|
| Unknown but trusted Dependabot branch | Policy succeeds with `eligible=false`; no writes | Manual review |
| Malformed or inconsistent event/run/live identity | Privileged workflow fails; no writes | Investigate event/API inconsistency |
| Group branch with missing or malformed metadata | Workflow fails closed | Let Dependabot recreate or investigate metadata |
| Non-patch metadata in patch group | No auto-merge | Manual review / configuration correction |
| Manual family update fails compatibility checks | PR remains manual and blocked | Upgrade family/configuration together |
| Oldest patch PR is not behind | Refresh no-op; newer PRs wait | Wait for checks and native merge |
| Oldest patch PR is behind but auto-merge is missing or enabled by the wrong actor | No mutation; queue remains blocked | Rerun trusted policy or investigate authorization identity |
| App ID/private key is unavailable or token creation fails | No candidate API mutation; `app-token-unavailable` summary | Fix repository App installation, variable, secret, or permissions; never fall back to another token |
| Auto-merge disable fails | Rebase is not attempted | Retry after GitHub API recovery |
| Head changes between validation and mutation | Expected-head check fails; no rebase | Next run re-inventories current state |
| Rebase fails | Old request remains disabled; no new head authorization | Investigate and manually recover the queue head; do not advance |
| App-caused synchronize workflows require approval or do not start | No fresh required checks/authorization; native merge remains blocked | Stop the canary and revisit App installation/event behavior; do not approve runs as the automation design |
| Rebase creates invalid provenance | Existing observer/policy rejects new head | Disable/defer refresh automation; do not weaken provenance |
| Required CI fails after rebase | Native merge remains blocked; queue head prevents refreshing newer PRs | Fix or close the failing dependency PR |

## Test Design

### Focused title tests

Reuse `runPrTitlePolicy`, `assertPrTitleAccepted`, and `assertPrTitleRejected` in `test/ci/workflows.test.ts`.

Positive cases:

- Current runtime/dev grouped title form.
- Legacy single-directory and plural-directory form.
- Manual family grouped title form.
- Unscoped npm individual title.
- Scoped npm individual title and branch.
- GitHub Action individual title and branch.

Negative mutations:

- Human title over 72 characters.
- Bot actor/author mismatch.
- Unsupported ecosystem.
- Unknown group or near-prefix group.
- Group/branch mismatch.
- Zero, signed, padded, or malformed counts.
- Singular/plural mismatch.
- Trailing punctuation or injected newline.

### Focused auto-merge policy tests

Reuse `makePolicyFixture`, `withDependabotMetadataLines`, and `runDependabotPolicy`.

Add a helper that updates every synchronized head-ref location in the fixture.

Cases:

- Dotted npm individual branch with metadata lacking `dependency-group` → success, `eligible=false`, `group=none`.
- Scoped npm branch → same.
- GitHub Action owner/name branch → same.
- Unsupported namespace or empty ref payload → failure.
- Exact patch group with complete metadata remains eligible.
- Near-prefix/manual-family group remains successful ineligible.
- Existing provenance mutation cases remain failures.
- Write steps remain structurally gated on `eligible == 'true'`.

### Dependabot configuration tests

- Existing patch groups remain first and patch-only.
- Manual families contain exactly their required package sets.
- Manual families permit only minor/major.
- Auto-merge policy contains only patch group IDs.
- Runtime and development allowlists remain derived from current manifest contracts.

### Refresh workflow structural tests

- Exact workflow inventory includes the new file.
- Trigger contains only schedule and workflow dispatch.
- Top-level and job `GITHUB_TOKEN` permissions are empty.
- Official `actions/create-github-app-token` is full-SHA pinned and limited to owner `therealhieu` plus repository `md2vid`.
- App variable/secret names are exact, and every API mutation step explicitly uses the generated App token.
- Tests reject mutation through `github.token`, a PAT-like secret, or a broadened App repository scope.
- Global concurrency is fixed and `cancel-in-progress` is false; the existing auto-merge workflow's head-oriented cancellation contract remains unchanged.
- No checkout, other external `uses`, package commands, project files, artifact/cache operations, reviews, approvals, admin merge, or direct merge.
- Candidate selection is queue-head-only and one-target-only.
- Auto-merge disable precedes rebase.
- Rebase uses GraphQL `REBASE` and `expectedHeadOid`.
- Refresh does not request auto-merge for the new head.

### Refresh policy fixture tests

Extract the inline selection/validation policy similarly to the existing auto-merge policy harness. Test:

- Two eligible behind PRs select only the oldest.
- Oldest non-behind PR blocks selection of the newer behind PR.
- Oldest malformed, unsigned, forked, non-main, multi-commit, non-bot, wrong-group, non-patch, or missing-auto-merge PR causes no mutation target.
- Matching `autoMergeRequest.enabledBy` Bot tuple passes; maintainer, unrelated bot, changed login, changed URL, and wrong typename all block selection.
- A stale expected head fails before any mutation.
- No PRs produces a successful no-op.
- Every fixed outcome/reason renders the exact non-sensitive summary fields; missing reasons or untrusted free-form content fail tests.

### Snapshot and full verification

After implementation:

```bash
node --test test/ci/workflows.test.ts
node --test test/cli/dependency-versions.test.ts
corepack npm run public:snapshot
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Run Actionlint with `.github/actionlint.yaml` if available.

## Rollout Design

### Local rollout

1. Implement title tests first and prove they fail.
2. Implement title support and prove focused tests pass.
3. Add no-op policy tests and prove they fail.
4. Implement no-op classification and prove policy tests pass.
5. Add family-group configuration tests, then configuration.
6. Add refresh workflow structural and policy tests, then the workflow.
7. Regenerate `public-snapshot.json`.
8. Run focused and full verification.

### Remote canary

Before dispatch, create and install the GitHub App only on `therealhieu/md2vid`, configure `DEPENDABOT_REFRESH_APP_ID` and `DEPENDABOT_REFRESH_APP_PRIVATE_KEY`, and verify the installation permissions are exactly contents write plus pull requests write.

Record #47 evidence in:

```text
docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/evidence/pr-47-refresh-canary.md
```

The record includes the exact commands and returned fields from:

```text
gh pr view 47 --json headRefOid,mergeStateStatus,autoMergeRequest,statusCheckRollup

gh api repos/therealhieu/md2vid/pulls/47/commits

gh api graphql
  → pullRequest.headRefOid
  → pullRequest.commits.nodes.commit.author
  → pullRequest.commits.nodes.commit.signature
  → pullRequest.autoMergeRequest.mergeMethod
  → pullRequest.autoMergeRequest.enabledBy { __typename login url }
```

After the implementation PR merges to `main`:

```text
1. Query #47 and record old head, one-commit provenance, github-actions Bot auto-merge request, and BEHIND state.
2. Manually dispatch Dependabot branch refresh.
3. Confirm the summary reports exactly #47, its patch group, old expected head, and selected-for-rebase.
4. Confirm old auto-merge was disabled before the head changed.
5. Confirm the App-caused synchronize event started CI and observer runs without manual approval.
6. Confirm the rebase produced a new head.
7. Confirm the new head remains one verified Dependabot-authored commit.
8. Confirm the trusted policy reran and enabled a fresh SQUASH auto-merge request with enabledBy Bot/github-actions for the new head.
9. Confirm all five required checks pass and #47 squash-merges.
10. Only then dispatch or await the scheduled run for #48.
11. Repeat the same record at `evidence/pr-48-refresh-canary.md`.
```

### Canary failure rule

If normal CI/observer runs require approval, the new head fails provenance, or the fresh auto-merge actor/method differs from the contract, the branch-refresh design is operationally incompatible. Stop the rollout, disable or leave the scheduled workflow unused, revoke or remove the App credentials if appropriate, and use manual Dependabot recreation/rebase recovery. Do not alter the workflow-approval, one-commit, bot-author, signature, or exact auto-merge-actor requirements.

#49 remains open/manual or is closed separately according to dependency compatibility decisions. Its expected no-op policy run is evidence that ineligibility no longer appears as an automation failure.

## Acceptance Criteria

- Both current and legacy grouped Dependabot titles pass with exact branch/group binding.
- Generated individual npm and Action titles pass title validation but remain auto-merge ineligible.
- Valid individual dotted/scoped refs produce successful no-op policy runs.
- Exact grouped metadata and provenance checks remain strict.
- Manual minor/major family groups align with repository synchronization contracts.
- Only runtime, development, and Action patch groups can request auto-merge.
- The refresh workflow is checkout-free, one-target-only, expected-head-bound, and uses only the repository-scoped GitHub App installation token for writes.
- App token creation is full-SHA pinned, repository-scoped, and has no fallback credential.
- Candidate selection validates the exact Bot/github-actions `autoMergeRequest.enabledBy` tuple.
- The refresh workflow disables old auto-merge before GraphQL rebase and never authorizes the new head.
- The App-caused synchronize event starts CI and observer runs without approval; the trusted auto-merge policy independently authorizes the rebased head.
- Every refresh outcome renders the fixed non-sensitive summary contract.
- Local focused, snapshot, full, release, and diff checks pass.
- Durable #47/#48 canary evidence records the exact queries and required provenance, authorization, check, and final merge fields.
- The #47 canary either completes through strict checks and native squash merge or fails closed without a weakened guard.
