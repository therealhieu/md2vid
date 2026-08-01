# Automatic Dependency Updates Design

## Summary

Configure weekly grouped Dependabot patch updates for npm runtime/optional dependencies, npm development dependencies, and GitHub Actions. A guarded workflow requests GitHub native squash auto-merge for eligible Dependabot patch pull requests without creating a review or approval side effect. Required checks, dependency review, and protected-branch rules remain the authority that permits or blocks the merge.

## Approved architecture decision — 2026-07-28

The original design required one privileged `pull_request` workflow. Independent verification of current GitHub Actions behavior found that a `pull_request` run uses the workflow version at the event-associated merge ref. The event therefore permits a Dependabot Actions PR that changes this workflow or its metadata action reference to execute the proposed privileged content before merge. This is a trust-origin failure that tests, commit binding, and branch protection cannot repair inside the single-stage design.

The approved replacement is:

```text
Dependabot PR
  → unprivileged pull_request observer from the PR event
  → no writes, checkout, artifacts, caches, or PR-code execution
  → successful completion only
  → privileged workflow_run defined on default-branch content
  → trusted GitHub API re-query and complete commit/provenance validation
  → head-bound auto-merge request
  → live-head recheck
  → --auto --squash --match-head-commit
```

The observer is intentionally not a source of metadata. The privileged stage re-queries the live PR and its commits. `dependabot/fetch-metadata@v2.5.0` is not retained because its pinned implementation requires `context.payload.pull_request`, while `workflow_run` supplies `workflow_run` payload data. Trusted checkout-free API queries and inline parsing replace it. No external action runs in the privileged stage.

This decision is an approved exception to the original `pull_request`-only requirement. The original requirement, its concrete security reason, and this replacement must remain separately traceable in the goal, research, and plan artifacts.

## Approved no-review remediation — 2026-07-28

The user explicitly decided that a green eligible patch should auto-merge without approval. The former one-approval protection deadlocked normal pull requests because `therealhieu` is the repository's only collaborator and GitHub forbids self-approval. The live `main` rule is therefore zero required approvals, with strict enforcement of the five required checks and all other protections unchanged.

The trusted workflow is merge-request-only: after the trusted observer query, complete live PR/commit/provenance/policy validation, and an immediate exact-head recheck, it requests native squash auto-merge with `--match-head-commit`. It must not create a review, call the reviews API, carry approval-specific environment values or guards, or add any other side effect. `actions: read` remains required for observer-run queries; `default_workflow_permissions` remains `read`; after this remediation merges, `can_approve_pull_request_reviews` is disabled and the real canary is rerun.

## Goals

- Group compatible patch updates on the existing weekly schedule.
- Auto-merge patch updates across runtime, optional, development, and GitHub Actions dependencies.
- Keep minor and major updates visible for manual review.
- Fail closed when metadata, validation, security review, or repository protections are incomplete.
- Remove test assertions that make routine dependency updates require unrelated source edits while retaining meaningful policy invariants.

## Non-goals

- Auto-merging minor or major updates.
- Replacing Dependabot with another update service.
- Changing the release process.
- Adding a merge queue, GitHub App, or personal access token.
- Automatically merging every Dependabot security update regardless of semantic update type.

## Research basis

The supporting research is recorded in [2026-07-28-auto-dependency-updates-research.md](./2026-07-28-auto-dependency-updates-research.md).

Key conclusions:

- GitHub native auto-merge waits for applicable required checks and branch protections.
- GitHub's documented Dependabot pattern verifies the actor and metadata before requesting auto-merge.
- Dependabot-triggered workflows have restricted credentials; write permissions must be narrow and explicit.
- Privileged workflows must not check out or execute pull-request code.
- Full commit SHAs are the only immutable GitHub Action references.

## Architecture

**Purpose** — Add guarded weekly patch auto-merge while making repository-level protections a prerequisite rather than assuming CI execution alone is sufficient.

**Current state**

```text
.github/dependabot.yml
  ├── npm weekly scan → up to 5 PRs
  └── Actions weekly scan → up to 5 PRs

Dependabot PR
  → CI / dependency review run
  → no auto-merge workflow
  → manual merge

GitHub repository settings
  ├── auto-merge: disabled
  ├── main branch: unprotected
  └── rulesets: none
```

**Expected state**

```text
.github/dependabot.yml
  ├── npm runtime/optional patch group
  ├── npm development patch group
  └── GitHub Actions patch group

Dependabot PR
  → PR-title validation
  → required CI checks
  → required dependency review
  → no-write pull_request observer completion
  → trusted default-branch workflow_run policy
       ├── exact observer run + one associated PR
       ├── event/live head and repository binding
       ├── verified single Dependabot commit
       ├── patch-only metadata + exact group policy
       └── live-head recheck + head-bound merge request
  → native squash auto-merge
  → protected main branch
```

The repository must enable native auto-merge and protect `main` before unattended merging is activated. At design time, `allow_auto_merge` is false, `main` has no branch protection, and the repository has no rulesets.

## Dependency grouping policy

**Purpose** — Reduce pull-request noise without combining runtime, development, and CI updates into one broad failure domain.

**Current state**

```text
npm update discovered     → individual PR
Actions update discovered → individual PR
patch/minor/major         → same PR-creation policy
```

**Expected state**

```text
npm runtime/optional patch → runtime patch group PR
npm development patch      → development patch group PR
GitHub Actions patch       → Actions patch group PR
minor or major update      → individual manual-review PR
```

### Group definitions

| Group ID | Matching policy | Merge policy |
|---|---|---|
| `runtime-patches` | Explicit patterns for current shipped packages: `hyperframes`, `@remotion/*`, `react`, and `react-dom`; patch only | Eligible for guarded auto-merge |
| `dev-patches` | npm `dependency-type: development`; patch only | Eligible for guarded auto-merge |
| `actions-patches` | All GitHub Actions dependencies; patch only | Eligible for guarded auto-merge |
| Unmatched minor/major updates | Individual Dependabot PRs | Manual review and merge |

Explicit runtime patterns avoid relying on undocumented classification of npm `optionalDependencies`. Adding a new runtime or optional dependency requires adding it to the runtime group policy before it becomes eligible for grouped auto-merge.

The existing staggered Monday schedule remains unchanged. Dependabot receives a `chore(deps)` commit-message prefix so generated pull-request titles satisfy the conventional-title policy.

## Components and interfaces

**Purpose** — Separate update selection, merge eligibility, validation, and repository enforcement so each unit has one clear responsibility.

**Current state**

```text
.github/dependabot.yml
  └── selects schedule + ecosystem only

.github/workflows/ci.yml
  ├── validates title
  ├── performs dependency review
  └── runs project validation

GitHub settings
  └── no enforced merge policy
```

**Expected state**

```text
┌───────────────────────────────────────────────┐
│ .github/dependabot.yml                        │
│ Select cadence, groups, patch boundaries,     │
│ and conventional commit prefix                │
└───────────────────────┬───────────────────────┘
                        │ opens PR
┌───────────────────────▼───────────────────────┐
│ .github/workflows/ci.yml                      │
│ Prove title, dependency safety, type safety,  │
│ tests, and supported Node compatibility       │
└───────────────────────┬───────────────────────┘
                        │ required checks
┌───────────────────────▼───────────────────────┐
│ dependabot-auto-merge-observer.yml            │
│ No-write pull_request completion signal only  │
└───────────────────────┬───────────────────────┘
                        │ trusted workflow_run
┌───────────────────────▼───────────────────────┐
│ dependabot-auto-merge.yml                     │
│ Re-query live state, verify exact head and    │
│ metadata, recheck head, request auto-merge    │
└───────────────────────┬───────────────────────┘
                        │ pending auto-merge
┌───────────────────────▼───────────────────────┐
│ Main protection / ruleset                     │
│ Enforce pull request and strict checks         │
└───────────────────────┬───────────────────────┘
                        │ conditions pass
                    squash merge
```

### Component contracts

| Component | Responsibility | Must not do |
|---|---|---|
| `.github/dependabot.yml` | Create weekly patch groups and conventional titles | Decide whether validation passed |
| `.github/workflows/ci.yml` | Validate every PR with read-only permissions | Approve or merge PRs |
| `.github/workflows/dependabot-auto-merge-observer.yml` | Emit a successful Dependabot PR completion signal with no write authority | Check out code, emit artifacts/caches, or provide metadata to the privileged stage |
| `.github/workflows/dependabot-auto-merge.yml` | From trusted default-branch `workflow_run` content, re-query and bind observer/live PR state, verify commit provenance and exact metadata policy, recheck the exact live head, and request head-bound auto-merge | Submit a review or approval, check out or execute PR code, consume observer artifacts, or perform any other side effect |
| Main protection/ruleset | Enforce pull request, strict required checks, and branch integrity with zero required approvals | Bypass failed or missing checks |
| Workflow contract tests | Verify policy structure and security invariants | Freeze routine versions without a deliberate contract reason |

The auto-merge workflow accepts a PR only when all of these conditions are true:

```text
observer run actor == dependabot[bot]
AND observer event == pull_request with success conclusion
AND observer run maps to exactly one PR
AND event PR head == API-associated head == live PR head
AND author == dependabot[bot]
AND repository and head repository == therealhieu/md2vid
AND base branch == main
AND exactly one current commit is Dependabot-authored and signature-verified
AND semantic update == patch
AND head branch identifies runtime-patches, dev-patches, or actions-patches
AND metadata dependency names satisfy that group's policy
```

Its only side effect is requesting native squash auto-merge bound to the exact validated live head. GitHub remains responsible for deciding when the PR is mergeable.

## Data flow

**Purpose** — Define exactly how an update moves from discovery to unattended merge without letting the merge workflow substitute for CI or repository protections.

**Current state**

```text
Monday 04:17 → npm scan → independent PRs
Monday 04:23 → Actions scan → independent PRs

PR opened
  ├── CI runs
  ├── dependency review runs
  └── maintainer reviews and merges manually
```

**Expected state**

```text
Monday weekly scan
  │
  ├─ npm
  │   ├─ runtime/optional patches → runtime group PR
  │   ├─ development patches      → development group PR
  │   └─ minor/major updates       → individual manual PRs
  │
  └─ GitHub Actions
      ├─ patches      → Actions group PR
      └─ minor/major  → individual manual PRs

Eligible grouped patch PR against main
  │
  ├──────────── validation path ────────────────┐
  │ title → dependency review → project checks │
  │                                            │
  └──────── merge-policy path ─────────────────┤
    verify actor/repository/base/metadata/group │
    → request native squash auto-merge         │
                                               │
                    GitHub waits ◄─────────────┘
                      │
             required checks pass
             + branch rules pass
                      │
                      ▼
                 merge to main
```

The observer uses the `pull_request` event with no write permissions and emits only a successful completion signal. The merge-policy workflow retains top-level `permissions: {}`. Its trusted `workflow_run` job is defined on the default branch and grants exactly `actions: read`, `contents: write`, and `pull-requests: write`; `actions: read` is job-scoped only to query the triggering observer run and its associated PRs before the live PR is re-queried through trusted GitHub APIs. It does not use `pull_request_target`, check out the PR, install dependencies, or execute changed code. The untrusted observer run is never consumed as an artifact or metadata source.

## Repository protection and merge authority

**Purpose** — Preserve fully unattended eligible patch merges while requiring repository-enforced validation and branch-integrity conditions.

**Current state**

```text
main
  ├── direct protection: none
  ├── ruleset: none
  └── auto-merge: disabled
```

**Expected state**

```text
main rules
  ├── require pull request
  ├── require zero approvals
  ├── require five strict stable CI checks
  ├── enforce admins and conversation resolution
  ├── block force pushes
  └── block branch deletion

GitHub Actions settings
  ├── allow native auto-merge
  ├── keep default workflow permissions read-only
  └── disallow Actions pull-request approvals
```

The guarded workflow requests native auto-merge only for eligible Dependabot patch PRs and submits no review. Other pull requests may merge when the same branch rules and required checks pass; the removed approval requirement avoids the only-collaborator self-approval deadlock. Repository settings are a rollout prerequisite and must be verified through the GitHub API after configuration.

Required-check names must be chosen from stable CI job/check names. A required check must not be conditional in a way that leaves an expected check permanently pending for an eligible pull request.

## Failure handling

**Purpose** — Make every ambiguous or unsafe state fail closed, leaving the dependency PR open for diagnosis instead of merging.

**Current state**

```text
Dependabot PR
  → CI may pass or fail
  → maintainer interprets result
  → maintainer decides whether to merge
```

**Expected state**

```text
Dependabot PR
  │
  ├─ policy mismatch ───────────────→ no auto-merge request
  ├─ metadata unavailable ──────────→ workflow fails; PR stays open
  ├─ CI/title/dependency-review failure → required check blocks merge
  ├─ conflict or stale branch ──────→ GitHub blocks merge
  ├─ merge API failure ─────────────→ workflow fails; PR stays open
  └─ every condition succeeds ──────→ native squash auto-merge
```

| Failure | Result | Recovery |
|---|---|---|
| Actor, repository, base branch, group, or update type mismatch | Merge job skips without side effects | Manual review |
| Dependabot metadata cannot be fetched | Merge job fails | Rerun after service recovery |
| Dependency review finds a high-severity risk | Required check fails | Investigate, update, or exclude the dependency |
| One package breaks a grouped PR | Entire group remains open | Diagnose, recreate selectively, or add a narrow temporary exclusion |
| PR title violates policy | Required title check fails | Correct Dependabot naming configuration |
| Native auto-merge is disabled | Merge command fails | Complete rollout prerequisites |
| Merge conflict or stale state exists | GitHub blocks merge | Dependabot rebase/recreate or manual resolution |

The merge workflow must not suppress observer-query, validation, live-head, or merge-command failures.

## Testing and rollout

**Purpose** — Verify policy invariants locally and prove the remote GitHub settings before unattended merging is activated.

**Current state**

```text
Workflow tests
  ├── verify two weekly Dependabot ecosystems
  ├── assert several exact Action SHAs
  └── assert selected exact dependency versions

Remote repository
  ├── auto-merge disabled
  └── main has no protection/ruleset
```

**Expected state**

```text
Local contract tests
  ├── groups, cadence, and title prefix
  ├── patch-only eligibility
  ├── actor/repository/base guards
  ├── least-privilege permissions
  ├── immutable action pins
  ├── no review API + head-bound native squash auto-merge
  ├── no PR-code execution in merge job
  └── synchronized-version invariants

Remote rollout verification
  ├── keep native auto-merge enabled
  ├── disable Actions approval permission
  ├── preserve protected main
  ├── require zero approvals
  ├── require five strict stable CI checks
  └── rerun one Dependabot patch canary
```

### Configuration tests

- Assert that all three patch groups exist.
- Assert that npm and GitHub Actions remain weekly at the existing staggered times.
- Assert that runtime patterns cover every current dependency and optional dependency.
- Assert that development grouping uses `dependency-type: development`.
- Assert that all groups are patch-only.
- Assert the `chore(deps)` prefix.
- Assert that no rule auto-merges minor or major updates.

### Workflow tests

- Assert the `pull_request` trigger.
- Assert actor, repository, base-branch, patch, and group guards.
- Assert narrow write permissions on the merge job.
- Assert all external actions use full 40-character SHAs.
- Assert the merge workflow contains no checkout or project-code execution.
- Assert the workflow contains no approval step, review API call, or other review side effect.
- Assert it requests exactly `--auto --squash --match-head-commit` after an immediate live-head recheck.
- Assert it never performs an immediate unconditional merge.

### Brittle-test cleanup

Exact Action SHA assertions should become invariant checks for the expected upstream action, a full immutable SHA, and cross-workflow consistency where required. Routine package-version literals should become checks for exact pinning and synchronized package-family versions, deriving values from `package.json` where appropriate. Exact literals remain only when the version itself is a deliberate release contract.

### Rollout order

1. Add or update local contract tests.
2. Add the Dependabot grouping and merge-policy workflow.
3. Run type-checks and the full test suite.
4. Preserve native repository auto-merge and protected `main` with zero required approvals and five strict required checks.
5. After the no-review remediation merges, disable GitHub Actions pull-request approvals while preserving read-only default workflow permissions.
6. Query repository settings to verify the remote policy and every unchanged branch protection.
7. Rerun an eligible Dependabot patch PR as a canary.
8. Treat the feature as active only after the canary receives a head-bound auto-merge request, waits for all required checks, and squash-merges successfully without a workflow-created review.

## Acceptance criteria

- Weekly Dependabot patch updates are grouped into runtime/optional, development, and Actions pull requests.
- Minor and major updates remain manual.
- Generated Dependabot titles pass the repository title policy.
- Only Dependabot patch PRs against `main` in the expected repository receive a native auto-merge request; no workflow-created review or approval is permitted.
- The merge workflow never checks out or executes PR code.
- Required CI and dependency-review checks block failed updates.
- `main` requires zero approvals, five strict required checks, admin enforcement, conversation resolution, and no force pushes or deletion before merging.
- Eligible patch PRs squash-merge without human action only after all protections pass.
- Tests validate policy invariants without pinning routine dependency-update values unnecessarily.
