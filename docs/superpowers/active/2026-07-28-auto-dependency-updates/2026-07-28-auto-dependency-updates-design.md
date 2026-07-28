# Automatic Dependency Updates Design

## Summary

Configure weekly grouped Dependabot patch updates for npm runtime/optional dependencies, npm development dependencies, and GitHub Actions. A guarded workflow will approve eligible Dependabot patch pull requests and request GitHub native squash auto-merge. Required checks, dependency review, and protected-branch rules remain the authority that permits or blocks the merge.

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
  → commit-bound approval
  → live-head recheck
  → --auto --squash --match-head-commit
```

The observer is intentionally not a source of metadata. The privileged stage re-queries the live PR and its commits. `dependabot/fetch-metadata@v2.5.0` is not retained because its pinned implementation requires `context.payload.pull_request`, while `workflow_run` supplies `workflow_run` payload data. Trusted checkout-free API queries and inline parsing replace it. No external action runs in the privileged stage.

This decision is an approved exception to the original `pull_request`-only requirement. The original requirement, its concrete security reason, and this replacement must remain separately traceable in the goal, research, and plan artifacts.

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
  → guarded auto-merge workflow
       ├── actor: dependabot[bot]
       ├── repository: therealhieu/md2vid
       ├── base branch: main
       ├── update type: patch
       └── approved dependency group
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
│ dependabot-auto-merge.yml                     │
│ Verify metadata, approve, and request native  │
│ squash auto-merge                             │
└───────────────────────┬───────────────────────┘
                        │ pending auto-merge
┌───────────────────────▼───────────────────────┐
│ Main protection / ruleset                     │
│ Enforce pull request, approval, and checks     │
└───────────────────────┬───────────────────────┘
                        │ conditions pass
                    squash merge
```

### Component contracts

| Component | Responsibility | Must not do |
|---|---|---|
| `.github/dependabot.yml` | Create weekly patch groups and conventional titles | Decide whether validation passed |
| `.github/workflows/ci.yml` | Validate every PR with read-only permissions | Approve or merge PRs |
| `.github/workflows/dependabot-auto-merge.yml` | Verify actor, repository, base branch, Dependabot metadata, and group; approve eligible PRs; request auto-merge | Check out or execute PR code |
| Main protection/ruleset | Enforce pull request, approval, required checks, and branch integrity | Bypass failed or missing checks |
| Workflow contract tests | Verify policy structure and security invariants | Freeze routine versions without a deliberate contract reason |

The auto-merge workflow accepts a PR only when all of these conditions are true:

```text
author == dependabot[bot]
AND repository == therealhieu/md2vid
AND base branch == main
AND semantic update == patch
AND head branch identifies runtime-patches, dev-patches, or actions-patches
AND metadata dependency names satisfy that group's policy
```

Its only merge side effects are approving the eligible PR and requesting native squash auto-merge. GitHub remains responsible for deciding when the PR is mergeable.

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
    → approve PR                               │
    → request native squash auto-merge         │
                                               │
                    GitHub waits ◄─────────────┘
                      │
             required checks pass
             + required approval exists
                      │
                      ▼
                 merge to main
```

The observer uses the `pull_request` event with no write permissions and emits only a successful completion signal. The merge-policy job uses `workflow_run`, is defined on the default branch, grants only explicit `contents: write` plus `pull-requests: write` permissions, and re-queries the live PR through trusted GitHub APIs. It does not use `pull_request_target`, check out the PR, install dependencies, or execute changed code. The untrusted observer run is never consumed as an artifact or metadata source.

## Repository protection and approval

**Purpose** — Preserve fully unattended eligible patch merges while requiring repository-enforced validation and review conditions.

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
  ├── require one approval
  ├── require stable CI checks
  ├── block force pushes
  └── block branch deletion

GitHub Actions settings
  ├── allow native auto-merge
  └── allow Actions to approve pull requests
```

The guarded workflow supplies the required approval only for eligible Dependabot patch PRs. Other pull requests continue to require a human approval. Repository settings are a rollout prerequisite and must be verified through the GitHub API after configuration.

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
  ├─ policy mismatch ───────────────→ no approval; no auto-merge
  ├─ metadata unavailable ──────────→ workflow fails; PR stays open
  ├─ CI/title/review failure ───────→ required check blocks merge
  ├─ conflict or stale branch ──────→ GitHub blocks merge
  ├─ approval/API failure ──────────→ workflow fails; PR stays open
  └─ every condition succeeds ──────→ native squash auto-merge
```

| Failure | Result | Recovery |
|---|---|---|
| Actor, repository, base branch, group, or update type mismatch | Merge job skips without side effects | Manual review |
| Dependabot metadata cannot be fetched | Merge job fails | Rerun after service recovery |
| Dependency review finds a high-severity risk | Required check fails | Investigate, update, or exclude the dependency |
| One package breaks a grouped PR | Entire group remains open | Diagnose, recreate selectively, or add a narrow temporary exclusion |
| PR title violates policy | Required title check fails | Correct Dependabot naming configuration |
| Auto-merge or Actions approval is disabled | Approval or merge command fails | Complete rollout prerequisites |
| Merge conflict or stale state exists | GitHub blocks merge | Dependabot rebase/recreate or manual resolution |

The merge workflow must not suppress approval or merge-command failures.

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
  ├── approval + native squash auto-merge
  ├── no PR-code execution in merge job
  └── synchronized-version invariants

Remote rollout verification
  ├── enable auto-merge
  ├── allow Actions approval
  ├── protect main / create ruleset
  ├── require one approval
  ├── require stable CI checks
  └── observe one Dependabot patch canary
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
- Assert the workflow approves the PR and requests `--auto --squash`.
- Assert it never performs an immediate unconditional merge.

### Brittle-test cleanup

Exact Action SHA assertions should become invariant checks for the expected upstream action, a full immutable SHA, and cross-workflow consistency where required. Routine package-version literals should become checks for exact pinning and synchronized package-family versions, deriving values from `package.json` where appropriate. Exact literals remain only when the version itself is a deliberate release contract.

### Rollout order

1. Add or update local contract tests.
2. Add the Dependabot grouping and merge-policy workflow.
3. Run type-checks and the full test suite.
4. Enable native repository auto-merge.
5. Allow GitHub Actions to approve pull requests.
6. Protect `main` or add a ruleset with one approval and stable required checks.
7. Query repository settings to verify the remote policy.
8. Observe the first eligible Dependabot patch PR as a canary.
9. Treat the feature as active only after the canary is approved automatically, waits for checks, and squash-merges successfully.

## Acceptance criteria

- Weekly Dependabot patch updates are grouped into runtime/optional, development, and Actions pull requests.
- Minor and major updates remain manual.
- Generated Dependabot titles pass the repository title policy.
- Only Dependabot patch PRs against `main` in the expected repository receive automated approval and native auto-merge.
- The merge workflow never checks out or executes PR code.
- Required CI and dependency-review checks block failed updates.
- `main` requires one approval and required checks before merging.
- Eligible patch PRs squash-merge without human action only after all protections pass.
- Tests validate policy invariants without pinning routine dependency-update values unnecessarily.
