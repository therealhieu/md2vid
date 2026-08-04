# Dependabot Auto-Merge Reliability — Requirements

## Table of Contents

- [Problem](#problem)
- [Goal](#goal)
- [Project Context](#project-context)
- [Failure Inventory](#failure-inventory)
- [Constraints](#constraints)
- [Decisions](#decisions)
- [Functional Requirements](#functional-requirements)
- [Security Requirements](#security-requirements)
- [Operational Requirements](#operational-requirements)
- [Non-Goals](#non-goals)
- [Success Criteria](#success-criteria)
- [Risks and Assumptions](#risks-and-assumptions)

## Problem

The guarded Dependabot patch auto-merge path is enabled, but eligible pull requests do not reliably reach merge. Three independent defects are present:

```text
Eligible grouped patch PR
  → Dependabot emits a valid but changed title sentence
  → required pr-title check rejects it
  → native auto-merge remains pending

Valid individual Dependabot PR
  → privileged policy workflow rejects dots/slashes in the branch ref
  → workflow fails before it can classify the PR as ineligible

Auto-merge-enabled patch PR
  → another PR moves main
  → strict protection marks the patch PR BEHIND
  → no trusted workflow refreshes the branch
  → auto-merge cannot complete
```

A fourth policy gap creates dependency PRs that are invalid by construction: Dependabot groups patch updates, but emits minor and major updates individually even when repository rules require a package family to move atomically.

## Goal

Make Dependabot automation reliable without weakening the existing trust boundary:

- Eligible patch groups pass title validation, remain subject to all five required checks, stay current with `main`, and squash-merge through GitHub native auto-merge.
- Valid non-patch or non-group Dependabot PRs complete the policy workflow as safe, successful no-ops and remain manual.
- Synchronized dependency families receive atomic manual-review minor/major PRs instead of known-invalid split PRs.
- Every branch mutation is serialized, expected-head-bound, checkout-free, and fail-closed.

## Project Context

- `.github/workflows/ci.yml:30-78` validates human Conventional Commit titles and contains a separate Dependabot title path.
- `.github/workflows/dependabot-auto-merge-observer.yml` is an unprivileged `pull_request` completion signal.
- `.github/workflows/dependabot-auto-merge.yml:81-259` is a trusted default-branch `workflow_run` policy that re-queries GitHub, verifies one signed Dependabot commit, validates patch-group metadata, and requests head-bound native squash auto-merge.
- `.github/dependabot.yml:12-26` defines the npm patch groups.
- `scripts/dependency_versions.ts:45-67` requires exact synchronization for Remotion, React/React DOM, and React type packages.
- `test/ci/workflows.test.ts` executes workflow policy scripts with controlled fixtures and mutation-tests the privileged boundary.
- `public-snapshot.json` hashes the affected workflows and workflow tests.
- `main` currently requires five strict checks: `pr-title`, `dependency-review`, `public-snapshot / validate`, `pr-minimum / validate`, and `pr-latest / validate`.
- Repository-native auto-merge is enabled; GitHub Actions default permissions remain read-only; Actions-created PR approvals are disabled.

This work extends, rather than replaces, the architecture recorded in:

- `docs/superpowers/done/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-design.md`
- `docs/superpowers/done/2026-08-01-resolve-open-prs/2026-08-01-resolve-open-prs-requirements.md`

## Failure Inventory

| PR / path | Observed state | Root cause | Required disposition |
|---|---|---|---|
| #47 `runtime-patches` | Auto-merge enabled; dependency checks green; `pr-title` failed; branch `BEHIND` | CI accepts only the older grouped-title sentence | Accept the current canonical grouped title, refresh safely, rerun checks, then allow native auto-merge |
| #48 `dev-patches` | Auto-merge enabled; dependency checks green; `pr-title` failed; branch `BEHIND` | Same title defect and stale branch | Process only after #47 completes to avoid repeated stale-branch CI |
| #49 TypeScript 7 | No auto-merge request; `pr-title` and release smoke failed | Individual title is rejected; TypeScript 7 is incompatible with the current Remotion bundler | Policy workflow must no-op successfully; dependency upgrade remains manual or deferred |
| Historical React / React DOM PRs | Separate PRs failed repository version-family checks | Minor/major family updates were not grouped | Create atomic manual-review family groups |
| Historical scoped package / Action PRs | Valid refs include dots and extra slash segments | Generic policy ref regex permits only `[a-z0-9-]+` | Accept valid Dependabot namespaces, then classify through exact group policies |

## Constraints

- Do not weaken strict required checks, branch protection, admin enforcement, conversation resolution, force-push protection, or branch-deletion protection.
- Do not add approvals, reviews, `--admin`, direct merges, direct pushes to `main`, a merge queue, or a PAT.
- A narrowly scoped GitHub App installation token is approved only for the branch-refresh mutation because `GITHUB_TOKEN`-caused `pull_request` synchronization runs require manual workflow approval. The App must be installed only on this repository and grant only the repository permissions required to rebase a PR branch and manage its auto-merge request.
- Do not use `pull_request_target` for privileged mutation.
- Privileged workflows must not check out code, execute PR-controlled code, install packages, restore caches, download artifacts, or trust observer-provided metadata. The refresh workflow may use only the official `actions/create-github-app-token` action pinned to a full commit SHA; no other external action is permitted.
- Preserve exact repository, base branch, head ref, head SHA, PR author, commit author, commit count, and signature verification.
- Preserve the one-current-verified-Dependabot-commit auto-merge invariant.
- Do not make minor or major dependency updates auto-merge eligible.
- Do not change #49 into an eligible update or weaken the Remotion release smoke test.
- Do not update multiple stale Dependabot branches concurrently.
- Any branch refresh that cannot preserve the existing provenance invariant must stop and require manual recovery; the invariant must not be relaxed to make automation pass.

## Decisions

### D1 — Validate generated title families, not one frozen sentence

Human title rules remain unchanged. The Dependabot path accepts exact known generated title families while retaining bot identity and branch correlation:

```text
Grouped current:
  chore(deps): bump the <group> group with <N> update(s)

Grouped legacy/multi-directory:
  chore(deps): bump the <group> group across <N> directory/directories with <N> update(s)

Individual npm or Action:
  chore(deps): bump <dependency> from <version> to <version>
```

Grouped titles must bind known group IDs to their exact branch family. Individual titles are title-valid but never become auto-merge eligible unless an independent exact policy permits them.

### D2 — Separate trusted identity from eligibility

The privileged policy first validates trusted event/run/live-PR identity and commit provenance. It then applies exact group policies:

```text
trusted Dependabot PR + exact patch policy → parse grouped metadata → eligible or fail closed
trusted Dependabot PR + no exact policy    → eligible=false, group=none, success
untrusted or inconsistent identity         → workflow failure, no side effects
```

A valid individual Dependabot PR must not fail merely because it is intentionally ineligible.

### D3 — Group synchronized non-patch families for manual review

Add manual-review minor/major groups after existing patch groups for:

- `react` + `react-dom`
- `@types/react` + `@types/react-dom`
- `remotion` + `@remotion/google-fonts` + `@remotion/media`

These group IDs may pass title validation but must not appear in auto-merge eligibility policies.

### D4 — Serialize stale-branch refreshes with a repository-scoped GitHub App

Add a separate trusted scheduled/manual workflow that considers at most one exact eligible patch-group PR per run. It authenticates branch mutations with a repository-scoped GitHub App installation token, not `GITHUB_TOKEN`, so the resulting `pull_request/synchronize` event runs required workflows without the manual approval state GitHub applies to `GITHUB_TOKEN`-caused PR updates.

The workflow must disable the old head-bound auto-merge request before rebasing, then request a GraphQL `updatePullRequestBranch` mutation with:

```text
updateMethod: REBASE
expectedHeadOid: <revalidated current head>
```

The App configuration contract is:

```text
Repository variable: DEPENDABOT_REFRESH_APP_ID
Repository secret:   DEPENDABOT_REFRESH_APP_PRIVATE_KEY
Installation scope:  therealhieu/md2vid only
Permissions:         contents: write, pull requests: write, metadata: read
```

The resulting `synchronize` event must re-enter the existing observer and trusted policy. The policy must independently validate the new head before re-enabling native auto-merge. The refresh workflow never authorizes the new head itself.

### D5 — Roll out branch refresh as a fail-closed canary

The first remote refresh targets only the oldest eligible stale PR, currently #47. Success requires the rebased PR to remain one current, verified Dependabot-authored commit and to receive a fresh head-bound auto-merge request. If GitHub's rebase changes provenance or commit shape, stop automation and retain manual stale-branch recovery.

## Functional Requirements

### FR1 — Human title behavior remains unchanged

- Existing allowed types, optional lowercase scope, spacing, nonempty summary, punctuation rule, and 72-character limit remain intact.
- Human-authored or maintainer-synchronized PRs must not receive a Dependabot exemption.

### FR2 — Current and legacy grouped Dependabot titles pass

- Accept both grouped title forms in Decision D1.
- Require positive canonical counts.
- Require correct `directory`/`directories` and `update`/`updates` singular/plural agreement.
- Require a known configured group ID.
- Require the group ID to match the exact Dependabot branch family.
- Reject near-prefix groups, unknown groups, malformed counts, extra punctuation, and branch/title mismatches.

### FR3 — Valid individual Dependabot titles pass title validation

- Accept npm unscoped dependencies, npm scoped dependencies, and GitHub Action owner/name dependencies.
- Accept dotted and prerelease-like version text only as nonempty title fields; title validation must not decide semantic update eligibility.
- Require both PR actor and PR author to be `dependabot[bot]` for the bot-only fallback.
- Require the head ref to remain in a supported Dependabot ecosystem namespace.

### FR4 — Non-group Dependabot policy runs succeed without writes

For a trusted, internally consistent Dependabot PR whose head does not match an exact auto-merge group policy:

- Exit successfully.
- Emit `eligible=false`.
- Emit `group=none`.
- Preserve validated `pr_number` and `expected_head_sha` outputs.
- Skip metadata parsing that requires `dependency-group`.
- Skip live-head revalidation and auto-merge mutation steps because they remain gated on `eligible == 'true'`.

### FR5 — Exact group policy remains patch-only

- Existing `runtime-patches`, `dev-patches`, and `actions-patches` policies remain the only auto-merge groups.
- Grouped metadata must remain complete and well-formed.
- Every updated dependency must report `version-update:semver-patch`.
- Dependency names must remain within the group-specific allowlist.

### FR6 — Manual family groups remain manual

- Add the three synchronized families in Decision D3.
- Permit only `minor` and `major` update types in those groups.
- Keep existing patch groups ordered first.
- Do not add manual family group IDs to `.github/workflows/dependabot-auto-merge.yml`.
- Tests must prove patch groups remain patch-only and manual family groups cannot become auto-merge eligible.

### FR7 — Branch refresh selects at most one PR

The refresh workflow must:

1. Query current repository data through trusted GitHub APIs.
2. Consider only open same-repository Dependabot PRs against `main` whose heads match exact auto-merge patch groups.
3. Require native squash auto-merge and validate `autoMergeRequest.enabledBy` as the exact live GitHub Actions bot identity: `__typename=Bot`, `login=github-actions`, and `url=https://github.com/apps/github-actions`.
4. Require one current verified Dependabot commit and complete patch metadata.
5. Refuse to refresh another PR while a previously refreshed eligible PR is still open and awaiting checks or merge.
6. Select the oldest eligible `BEHIND` PR only when no active refreshed PR exists.
7. Mutate no more than one PR per run.

### FR8 — Refresh invalidates the old authorization before rewriting the head

- Revalidate the selected head SHA immediately before mutation.
- Disable the existing auto-merge request first.
- Rebase with expected-head binding.
- Never use merge-style branch update, because an added merge commit violates the one-commit guard.
- Rely on the existing observer and trusted policy to authorize the new head.

### FR9 — Existing patch PR recovery is ordered

```text
merge implementation to main
  → run refresh canary for #47
  → verify new head provenance and five required checks
  → allow native squash auto-merge
  → only after #47 merges, refresh #48
```

#49 remains manual. It must not block processing #47 or #48.

## Security Requirements

- Privileged workflows use top-level `permissions: {}` and job-scoped least privilege.
- The refresh workflow's built-in `GITHUB_TOKEN` remains read-only/unused for mutation. All refresh writes use a minted repository-scoped GitHub App installation token explicitly limited by action inputs to `contents: write`, `pull-requests: write`, and `metadata: read`.
- The refresh workflow uses a fixed global concurrency group with `cancel-in-progress: false`. The existing auto-merge workflow retains its PR/head-oriented cancellation behavior so a stale authorization run cannot outlive a newer head.
- The only external Action allowed in a privileged workflow is official `actions/create-github-app-token`, pinned to a full 40-character commit SHA and configured for owner `therealhieu` and repository `md2vid` only.
- Repository, repository ID/URL/name, base ref, head repository, head ref, head SHA, PR number, actor, author, commit author, commit signature, commit count, and `autoMergeRequest.enabledBy` identity are re-queried and cross-checked.
- All write operations are bound to the revalidated expected head.
- Malformed, forked, non-main, unsigned, multi-commit, maintainer-modified, unknown-group, non-patch, or stale-read inputs produce no branch mutation.
- Security mutation tests must prove that removing or weakening any critical guard causes the test suite to fail.

## Operational Requirements

- The refresh workflow supports both `schedule` and `workflow_dispatch`.
- The schedule uses an off-minute value and does not run more often than needed for weekly Dependabot updates.
- A final `if: always()` summary step writes only trusted enumerated fields to `GITHUB_STEP_SUMMARY`:

  ```text
  ### Dependabot branch refresh
  - Outcome: no-candidates | waiting | blocked | selected | failed
  - Reason: <fixed reason code>
  - PR: none | #<validated integer>
  - Group: none | runtime-patches | dev-patches | actions-patches
  - Expected head: none | <validated 40-character SHA>
  ```

- Required reason codes cover: `no-candidates`, `queue-head-not-behind`, `queue-head-missing-auto-merge`, `queue-head-invalid`, `selected-for-rebase`, `auto-merge-disable-failed`, `head-changed`, `rebase-failed`, and `app-token-unavailable`.
- Summaries must not include PR titles, bodies, dependency metadata text, tokens, API responses, or other untrusted free-form strings.
- Remote rollout evidence is written to:
  - `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/evidence/pr-47-refresh-canary.md`
  - `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/evidence/pr-48-refresh-canary.md`
- Each canary record includes the exact `gh api`/GraphQL queries and resulting new head SHA, commit count, commit author, signature verification, fresh `autoMergeRequest.enabledBy` identity and merge method, five required check states, and final merge state.
- If the canary violates provenance or required workflows do not start without approval, disable or leave the refresh workflow unused and document manual recovery; do not loosen policy.

## Non-Goals

- Auto-merging TypeScript 7 or resolving its Remotion compatibility in this change.
- Auto-merging any minor or major dependency update.
- Changing the five required checks or making strict checks loose.
- Replacing native auto-merge with direct merge.
- Adding a merge queue, PAT, third-party auto-merge action, or approval bot.
- Using the approved refresh GitHub App for any purpose beyond serial Dependabot branch refresh.
- Refactoring unrelated CI, release, audit, or snapshot systems.
- Fixing historical closed PRs beyond using them as regression evidence.

## Success Criteria

- #47 and #48 titles pass the required `pr-title` policy after synchronization.
- Current and legacy grouped title forms are regression-tested with positive and negative mutations.
- Valid dotted/scoped individual Dependabot refs complete the privileged policy with `eligible=false`, `group=none`, and no write step.
- Untrusted or inconsistent refs still fail closed.
- React, React type, and Remotion minor/major updates are grouped atomically for manual review.
- Only the three existing patch groups are auto-merge eligible.
- The branch-refresh workflow can select and attempt to rebase no more than one exact eligible `BEHIND` PR.
- Refresh writes use only the approved repository-scoped GitHub App token; missing credentials fail before mutation.
- Candidate selection accepts only a SQUASH auto-merge request enabled by the exact live `github-actions` Bot identity and rejects maintainer or unrelated bot/app actors.
- The old auto-merge request is disabled before the head changes.
- Refresh uses `REBASE` with `expectedHeadOid`; no merge commit is introduced by design.
- Every outcome emits the fixed non-sensitive job-summary schema and reason code.
- The canary evidence is recorded in the defined evidence files and either preserves one verified Dependabot commit, starts required workflows without approval, and proceeds through five checks to native squash merge, or fails closed without weakening guards.
- `node --test test/ci/workflows.test.ts` passes.
- `node --test test/cli/dependency-versions.test.ts` passes.
- `corepack npm run public:snapshot:check`, `corepack npm run check`, and `corepack npm run release:check` pass after snapshot regeneration.
- `git diff --check` passes.

## Risks and Assumptions

| Risk / assumption | Handling |
|---|---|
| Dependabot generated title prose changes again | Test exact known families while keeping auto-merge eligibility independent from title prose; future unknown forms fail title-only, not privileged provenance checks |
| Individual Dependabot metadata omits `dependency-group` | Skip group-specific metadata parsing when no exact policy matches |
| Manual family grouping creates larger PRs | Accept the larger manual review unit because repository invariants require atomic movement |
| GitHub App credentials are missing, invalid, or over-scoped | Fail before candidate mutation; document exact repository installation and permission prerequisites; never fall back to `GITHUB_TOKEN` or PAT |
| GraphQL rebase changes commit author, signature, or commit count | Canary must fail closed; preserve manual recovery rather than weaken provenance |
| GitHub App branch update does not trigger normal required workflows | Canary must fail closed; preserve manual recovery and revisit the credential/event design rather than approving runs manually |
| Old auto-merge survives a head rewrite | Disable it before rebase and require a fresh observer/policy authorization for the new head |
| Multiple stale PRs cause repeated CI churn | Serialize refreshes and stop behind an active refreshed PR |
| Scheduled workflow receives unexpected GitHub API state | Treat malformed or ambiguous state as a no-mutation failure, with diagnostic summary |
| #49 consumes Dependabot PR capacity | Keep it manual or close/defer separately; do not make it eligible in this scope |
