# Resolve Open Pull Requests — Requirements

## Table of Contents

- [Problem](#problem)
- [Goal](#goal)
- [Project Context](#project-context)
- [Constraints](#constraints)
- [Decisions](#decisions)
- [Candidate Directions](#candidate-directions)
- [Success Criteria](#success-criteria)
- [Risks and Assumptions](#risks-and-assumptions)

## Problem

Nine Dependabot PRs are open against `main`: #1–#4, #25–#29. They represent stale GitHub Actions upgrades, one grouped runtime patch, an invalid split React/React DOM update, a GSAP update blocked by an external install timeout, and an `@types/node` update that is green but behind.

The open set is blocked for three distinct reasons:

```text
Individual old Dependabot PR
  → current title policy does not accept its bot branch/title shape
  → required pr-title check fails

React-only or React-DOM-only PR
  → peer/version-family contract disagrees
  → npm ci or dependency-version validation fails

Valid/stale or transiently failed PR
  → base moves or external package install fails
  → requires fresh evidence, not a bypass
```

## Goal

Resolve every currently open PR by safely merging a validated successor or closing an obsolete PR with a linked replacement, while retaining branch protection, CI, and the guarded Dependabot auto-merge boundary.

## Project Context

- `.github/workflows/ci.yml:43-78` accepts ordinary conventional titles for human PRs and a narrow set of grouped Dependabot titles only.
- `.github/workflows/dependabot-auto-merge.yml:201-221` permits native auto-merge only for one verified Dependabot commit with approved group metadata and no maintainer changes.
- `scripts/dependency_versions.ts:61` and `test/cli/dependency-versions.test.ts:62-69` require exact React/React DOM parity.
- `test/ci/workflows.test.ts` enforces immutable, consistent workflow Action pins and guarded-auto-merge policy.
- `docs/standards/git.md` requires worktrees and conventional commits for repository changes.

Current evidence:

| PR set | Observed state | Required resolution shape |
|---|---|---|
| #1–#4 | Blocked by historical individual-bot title policy | One human-owned Actions-major replacement PR, then close stale bot PRs |
| #25 | Grouped runtime patch; public-snapshot rerun failed after prior success | Extract failure first; recreate as a bot-owned grouped patch only if safe |
| #26 + #28 | Split React/React DOM upgrade fails dependency constraints | One atomic human-owned React pair replacement PR |
| #27 | Node 26 `npm ci` failed downloading `onnxruntime-node`; project tests did not run | Retry the affected validation lane before changing GSAP |
| #29 | All recorded checks passed; branch is behind | Replace from current main with a conventional human-owned Node-types PR |

## Constraints

- Do not use force pushes, direct pushes to `main`, `gh pr merge --admin`, or a merge bypass.
- Do not weaken branch protection, Actions permissions, required checks, or the auto-merge policy.
- Do not alter a Dependabot branch that must satisfy the one-verified-commit guard.
- Do not merge React and React DOM separately.
- Do not treat an external package-download timeout as dependency incompatibility without a reproducible project failure.
- Keep all operational changes ordered; do not modify replacement PRs concurrently.
- The user requested no clarification questions; use repository evidence and safe defaults.

## Decisions

- **Visual format:** in-chat ASCII diagrams; this is an operational workflow, not a UI design.
- **Research:** no new external research. Current GitHub state, failed-job logs, existing auto-dependency design records, and source contracts answer the local design decisions.
- **Resolution model:** use fresh human-owned replacement PRs for updates that cannot qualify for guarded bot auto-merge; use a fresh Dependabot-owned PR only for the eligible runtime patch.
- **Closure rule:** close an original only after its successor has passed all required checks and either merged or has a verified native auto-merge request.

## Candidate Directions

### Selected: replace stale updates by compatibility boundary

**Purpose** — Preserve each dependency policy while making every open PR resolvable.

**Current state**

```text
#1–#4 individual Actions upgrades ── blocked by bot-title policy
#25 grouped runtime patch           ── stale / snapshot diagnosis pending
#26 react-dom only + #28 react only ── invalid independently
#27 GSAP                            ── external Node-26 install failure
#29 @types/node                    ── green but stale
```

**Expected state**

```text
human Actions-major replacement ── green → merge → close #1–#4
fresh grouped runtime bot PR     ── guarded native auto-merge → close #25
human atomic React-pair PR       ── green → merge → close #26 + #28
retry/fresh GSAP successor       ── green → merge → close #27
human Node-types successor       ── green → merge → close #29
```

### Rejected: modify or force-merge existing bot branches

**Purpose** — Avoid bypassing the repository's guarded-merge trust boundary.

**Current state**

```text
Maintainer change on guarded bot PR
  → more than one / non-bot commit or maintainer-change marker
  → trusted policy rejects auto-merge
```

**Expected state**

```text
Stale bot PR remains untouched
  → green validated successor exists
  → old PR closes with a traceable replacement link
```

## Success Criteria

- #1, #2, #3, #4, #25, #26, #27, #28, and #29 are closed or merged, and each has a linked successor/merge record.
- A single Actions replacement updates checkout, setup-node, download-artifact, and upload-artifact using authenticated full-SHA inputs.
- React and React DOM reach `19.2.8` together in manifest and lockfile.
- A runtime-patch successor has exactly one verified Dependabot commit, five successful required checks, and a native squash auto-merge request without an Actions-created review.
- GSAP is unchanged unless a fresh validation run proves a project-level failure.
- Node types replacement passes typecheck, full validation, release validation, and all required remote checks.
- Final `main` passes `corepack npm run public:snapshot:check`, `corepack npm run check`, and `corepack npm run release:check`.

## Risks and Assumptions

| Risk / assumption | Handling |
|---|---|
| #25's failed snapshot is reproducible | Extract the exact failed command first; stop for a targeted fix if it reproduces. |
| #27's ONNX download failure repeats | Retry only the affected lane; investigate network/package availability separately from GSAP. |
| Dependabot does not immediately recreate #25 | Leave #25 open until a compliant successor exists; do not make a maintainer commit on it. |
| Action v7/v8 updates expose workflow incompatibility | Validate all pins together in one human-owned PR with workflow tests and Actionlint. |
| A replacement causes main validation to fail | Stop at that PR; diagnose and remediate before resolving later PRs. |
