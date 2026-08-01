# Resolve Open Pull Requests — Design

## Table of Contents

- [Context and Direction](#context-and-direction)
- [Resolution Architecture](#resolution-architecture)
- [Resolution Units](#resolution-units)
- [Data Flow and Ordering](#data-flow-and-ordering)
- [Failure Handling](#failure-handling)
- [Implementation Shape](#implementation-shape)
- [Testing and Evidence](#testing-and-evidence)
- [Compatibility and Rollout](#compatibility-and-rollout)

## Context and Direction

**Original idea** — resolve all currently open PRs.

**Goal** — replace or safely refresh each blocked Dependabot update without bypassing CI, protected-branch policy, or the trusted auto-merge boundary.

**Relevant context** — nine Dependabot PRs are open: #1–#4, #25–#29. Current repository policy accepts only grouped Dependabot titles; the React package pair is exact-version coupled; the guarded auto-merge path requires one verified bot commit; and `main` has fixes newer than most open branches.

**User choices** — no questions; use in-chat ASCII diagrams; do not run new external research; make safe defaults from live PR evidence and repository contracts.

**Applied evidence** — failed-job logs show #26/#28 are an invalid split React update, #27 is an `onnxruntime-node` network-install failure before project tests, #29 is green but behind, #1–#4 are rejected by the historical individual-bot title path, and #25 needs an exact snapshot-failure diagnosis.

**Selected technical direction** — replace human-reviewed dependency units by compatibility boundary, retain a fresh bot-owned PR only for the patch-group canary, and close stale originals only after their successor is validated.

## Resolution Architecture

**Purpose** — keep ownership and trust boundaries intact while turning stale, unmergeable PRs into independently verifiable replacement paths.

**Current state**

```text
Dependabot individual PR (#1–#4, #27, #29)
  → title is not an allowed grouped-bot title
  → pr-title fails or historical checks become stale
  → PR remains open

Dependabot grouped patch (#25)
  → observer (unprivileged)
  → trusted workflow_run policy
  → requires exactly one verified bot commit

React-only PR (#28) or React-DOM-only PR (#26)
  → manifest / peer contract diverges
  → npm ci or dependency-version validation fails
```

**Expected state**

```text
Human-owned conventional replacement PR
  → required checks
  → normal protected-branch merge
  → close obsolete individual Dependabot PR

Fresh grouped runtime Dependabot PR
  → observer (unprivileged)
  → trusted workflow_run validation
  → native --auto --squash --match-head-commit
  → close #25 after successor merges

Atomic React + React DOM replacement PR
  → exact-version contract remains true
  → normal protected-branch merge
```

The design has two merge paths:

| Path | Used for | Authority | Must not do |
|---|---|---|---|
| Human replacement | Actions majors, React pair, GSAP if retry succeeds, Node types | Existing protected-branch checks | Change bot branches, bypass checks, direct-push main |
| Guarded bot replacement | Fresh `runtime-patches` successor to #25 | Existing observer + trusted workflow-run auto-merge | Add maintainer commits, reviews, approvals, or an immediate merge |

No branch-protection, auto-merge, or Actions-permission setting changes are part of this design.

## Resolution Units

**Purpose** — group changes only where a shared compatibility or CI contract requires atomic handling, and otherwise keep remediation small.

**Current state**

```text
#1  setup-node v4.4.0 → v7.0.0     ┐
#2  download-artifact v4.3.0 → v8.0.1 │ separate stale bot PRs
#3  upload-artifact v4.6.2 → v7.0.1  │ rejected by bot-title policy
#4  checkout v4.4.0 → v7.0.1      ┘

#26 react-dom 19.0.0 → 19.2.8
#28 react     19.0.0 → 19.2.8     → invalid when separated

#25 runtime group → grouped patch, stale snapshot result
#27 gsap 3.14.2 → 3.15.0 → external Node-26 install timeout
#29 @types/node 22.20.0 → 26.1.2 → green checks, behind main
```

**Expected state**

```text
Actions-major replacement
  └── checkout v7.0.1, setup-node v7.0.0,
      download-artifact v8.0.1, upload-artifact v7.0.1

React runtime-pair replacement
  └── react v19.2.8 + react-dom v19.2.8 in one manifest/lockfile change

Runtime patch successor
  └── fresh single-commit Dependabot runtime-patches PR

Independent resolutions
  ├── GSAP: retry Node-26 install first; change only on reproducible project failure
  └── Node types: conventional replacement from current main
```

| Unit | Owns | Depends on | Success condition |
|---|---|---|---|
| Actions-major replacement | All four Actions pin families | Workflow pin contract | All workflow occurrences share authenticated full SHA/version pairs; remote checks pass |
| React-pair replacement | `react`, `react-dom`, lockfile | Exact pair contract | Both packages are `19.2.8`; `npm ci` and generated scaffold checks pass |
| Runtime successor | Current grouped patch only | Trusted bot-commit policy | One verified bot commit, five checks green, native squash auto-merge requested |
| GSAP resolution | Evidence-driven retry or replacement | Node 26 package installation | No code change until fresh evidence distinguishes network from project failure |
| Node-types replacement | `@types/node`, lockfile | Current main, TypeScript checks | Conventional human PR passes all required checks |

## Data Flow and Ordering

**Purpose** — prevent a later dependency update from invalidating evidence or making an older branch stale before its successor is validated.

**Current state**

```text
Nine branches based on older main
  ├── checks reflect historical CI definitions or stale dependencies
  ├── multiple package changes overlap
  └── no verified closure sequence
```

**Expected state**

```text
verify current main
  ↓
Actions-major replacement → merge → close #1–#4
  ↓
React-pair replacement → merge → close #26 + #28
  ↓
diagnose #25 snapshot job
  ├── reproducible project failure → fix in its own PR, then request fresh bot PR
  └── transient/non-reproducible → request fresh bot PR
  ↓
fresh grouped runtime successor → guarded auto-merge → close #25
  ↓
retry #27 Node-26 install
  ├── passes → merge validated successor / close #27
  └── reproducible project failure → targeted fix + successor → close #27
  ↓
Node-types replacement → merge → close #29
  ↓
final main + PR-state audit
```

Each human-owned replacement starts from the latest merged `main` and uses its own worktree. The next replacement begins only after the prior replacement has completed required checks and merged. This makes each lockfile diff, CI result, and rollback boundary attributable to one compatibility unit.

For #25, the fresh bot-owned PR must be created only after its diagnosis is recorded. The maintainer does not run `gh pr update-branch`, alter commits, or add files to #25 because the trusted workflow rejects a PR with maintainer changes or more than one verified bot commit.

## Failure Handling

**Purpose** — classify failures before changing code, so a policy safeguard or external outage is not “fixed” by weakening a repository contract.

**Current state**

```text
Failed required check
  → stale bot PR stays open
  → root cause is mixed: policy, dependency compatibility,
    package network, or snapshot execution
```

**Expected state**

```text
Failed required check
  ├── title-policy mismatch → human conventional replacement
  ├── version-family mismatch → atomic paired replacement
  ├── external install failure → retry affected lane first
  ├── reproducible project failure → targeted fix PR, then replacement
  └── stale bot patch → fresh bot PR only after diagnosis
```

| Failure | Evidence | Handling | Forbidden response |
|---|---|---|---|
| #1–#4 title check | Individual Dependabot title reaches `.github/workflows/ci.yml:78` | Human-owned replacement with a conventional title; preserve current bot-title policy | Broadening bot auto-merge eligibility just to merge current majors |
| #25 snapshot failure | Job `91154094246` failed on a later rerun after an earlier pass | Extract exact command/error; reproduce on current main before recreating PR | Calling it a dependency regression without a reproduction |
| #26 split react-dom | `npm ci` peer conflict with `react@19.0.0` | Atomic React pair replacement | Merge #26 independently |
| #28 split react | `dependency_versions.ts` throws unequal-version error | Atomic React pair replacement | Merge #28 independently |
| #27 Node 26 install | `onnxruntime-node` download timed out / IPv6 unreachable before tests | Rerun Node-26 lane; investigate external availability if it recurs | Change GSAP or CI timeouts without a reproducible project failure |
| #29 stale only | All recorded checks passed | Conventional replacement from latest main | Force update/merge the old bot PR |

A reproducible project-level failure gets its own narrowly scoped fix PR with tests before a dependency replacement proceeds. An external-only failure is recorded and rerun; it does not justify changing production dependency behavior.

## Implementation Shape

**Purpose** — name the exact files and interfaces affected by each replacement so implementation follows existing repository contracts rather than inventing a new dependency mechanism.

**Current state**

```text
Workflow pins → four active workflow YAML files
Dependency authority → package.json + package-lock.json
Version-family invariants → scripts/dependency_versions.ts + tests
Auto-merge guard → Dependabot configuration + workflow policy tests
```

**Expected state**

```text
Actions replacement
  → .github/workflows/{ci,nightly,release,validate}.yml
  → test/ci/workflows.test.ts
  → public-snapshot.json if source inventory changes

Runtime/dependency replacements
  → package.json + package-lock.json
  → dependency-version, scaffold, and focused affected tests
  → public-snapshot.json if source inventory changes

Closure evidence
  → docs/superpowers/active/2026-08-01-resolve-open-prs/evidence/
```

| Replacement | Files / interfaces | Required implementation rule |
|---|---|---|
| Actions major | `.github/workflows/ci.yml`, `nightly.yml`, `release.yml`, `validate.yml`, `test/ci/workflows.test.ts` | Preserve one full immutable SHA/version comment per Action across all active workflows; use the authenticated Dependabot diffs as the pin source |
| React pair | `package.json`, `package-lock.json`, `test/cli/dependency-versions.test.ts`, `test/cli/scaffold-project.test.ts` | Keep `react` and `react-dom` exact-version equal; regenerate lockfile with npm 11.15.0 |
| Runtime patch | Dependabot-controlled `package.json` and `package-lock.json`; `.github/dependabot.yml`; `.github/workflows/dependabot-auto-merge.yml`; `test/ci/workflows.test.ts` | Do not manually edit the successor; validate the existing one-commit policy |
| GSAP | `package.json`, `package-lock.json`, dependency/template tests only if a successor is required | Keep package-derived GSAP URL/token contracts intact |
| Node types | `package.json`, `package-lock.json`, TypeScript checks | Use a human conventional PR because the update is not an eligible patch-group successor |

The design does not change the public CLI, generated project API, or release workflow semantics. Any code change discovered while reproducing #25 or #27 must be narrowly tied to that failure and must not be bundled into another replacement.

## Testing and Evidence

**Purpose** — prove each merge path with the same local and remote gates that protect `main`.

**Current state**

```text
PR checks capture historical branch state
  → passing and failing results do not uniformly describe current main
  → stale branches cannot be used as final evidence
```

**Expected state**

```text
current main baseline
  → targeted contract tests
  → public snapshot check
  → full check + release check
  → five required remote PR checks
  → merge or guarded auto-merge
  → closure evidence linked to obsolete PR
```

Run from each replacement worktree:

```bash
corepack npm ci
node --test test/ci/workflows.test.ts
node --test test/cli/dependency-versions.test.ts
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Add focused tests only when a reproducible project defect is found:

- **#25:** `test/ci/public-snapshot.test.ts`, `test/ci/public-snapshot-check.test.ts`, and `test/ci/public-snapshot-checkout.test.ts` for a reproducible snapshot defect.
- **#27:** a package/runtime regression test only if the fresh Node 26 run reaches project code and fails deterministically; do not write a test for a network timeout.
- **Actions replacement:** retain `test/ci/workflows.test.ts` checks for full SHA pins, comments, cross-workflow consistency, and policy boundaries.

For every replacement PR, record its URL, head SHA, five check results, merge commit, and superseded PR numbers. For the bot runtime successor additionally record that no `github-actions[bot]` review exists and that the timeline contains the native auto-merge request.

## Compatibility and Rollout

**Purpose** — make closure observable and reversible without leaving `main` in a partially upgraded dependency family.

**Current state**

```text
Open PRs occupy Dependabot capacity
  → stale branch state obscures current compatibility
  → some updates cannot merge safely as authored
```

**Expected state**

```text
One validated replacement at a time
  → merge to protected main
  → close only its superseded originals with successor link
  → verify main before next unit
  → final audit shows no original PR open
```

Rollback is PR-scoped:

- Before merge, close the replacement and leave the original open until a new path exists.
- After a merged human replacement causes a regression, create a conventional revert PR; do not rewrite `main` or reopen the stale bot PR as a substitute.
- If the grouped runtime successor behaves unsafely, disable only the auto-merge request for that PR and leave branch protections unchanged; retain the PR for diagnosis.

Final acceptance is reached only when #1, #2, #3, #4, #25, #26, #27, #28, and #29 are no longer open, each has a linked successor or merge record, and the latest `main` passes snapshot, full, and release validation.
