# Dependabot Auto-Merge Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make eligible Dependabot patch groups pass title policy, remain current with `main`, and reach native squash auto-merge while valid non-group PRs become safe no-ops and synchronized minor/major families remain manual.

**Architecture:** Preserve the observer → trusted `workflow_run` auto-merge boundary. Extend title and policy classification without broadening eligibility, add exact manual-review family groups, and introduce a separate checkout-free workflow that uses a repository-scoped GitHub App to disable the old auto-merge authorization and rebase at most one exact stale patch-group PR with `expectedHeadOid`.

**Tech Stack:** GitHub Actions, Dependabot v2 configuration, Bash, inline Node.js ESM policy scripts, GitHub CLI, GitHub REST and GraphQL APIs, YAML 2.9.0, Node test runner, public snapshot tooling.

---

## Source Artifacts

- Requirements: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-requirements.md`
- Design: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-design.md`
- Git standard: `docs/standards/git.md`
- Part 1: `2026-08-04-dependabot-automerge-reliability-plan-1.md`
- Part 2: `2026-08-04-dependabot-automerge-reliability-plan-2.md`
- Part 3: `2026-08-04-dependabot-automerge-reliability-plan-3.md`
- Part 4: `2026-08-04-dependabot-automerge-reliability-plan-4.md`

> **Dynamic snapshot supersession:** The repository-root
> `public-snapshot.json` contract was removed by the dependency PR CI
> remediation design. `corepack npm run public:snapshot` is now a non-mutating
> committed-HEAD report, and `corepack npm run public:snapshot:check` performs
> the required committed-tree scan, generated-manifest verification, isolated
> repository construction, package validation, and release smoke. Do not
> regenerate or commit a repository-root snapshot mirror.
>
> Run `corepack npm run public:snapshot` only when a deterministic count/hash
> report is useful. It must not change `git status`. The required correctness
> gate is `corepack npm run public:snapshot:check`.

## Worktree and Pre-Implementation Baseline

The approved companion artifacts must be committed before implementation. From the primary checkout at that commit, create the standard-compliant flat worktree:

```bash
git check-ignore -q .worktrees
git worktree add \
  .worktrees/fix-dependabot-automerge \
  -b fix/dependabot-automerge
cd .worktrees/fix-dependabot-automerge
```

If `fix/dependabot-automerge` already exists, enter its existing `.worktrees/fix-dependabot-automerge` worktree instead of creating a second branch. Do not implement from a nested path or a worktree with an agent prefix.

Run the baseline:

```bash
pwd
git status --short
node --test test/ci/workflows.test.ts
node --test test/cli/dependency-versions.test.ts
corepack npm run check
```

Expected:

- `pwd` ends in `.worktrees/fix-dependabot-automerge`.
- `git status --short` is empty. Stop and inspect any uncommitted file before Task 1.
- Both focused test commands exit `0`.
- `corepack npm run check` exits `0` with the pre-change baseline of 1,258 passing tests and zero failures.
- Stop if the test baseline differs before implementation changes are made.

## File Responsibility Map

| File | Responsibility |
|---|---|
| `.github/workflows/ci.yml` | Validate unchanged human title grammar plus exact generated Dependabot grouped and individual title families. |
| `.github/workflows/dependabot-auto-merge.yml` | Validate trusted identity and provenance, then classify unsupported exact policies as successful `eligible=false`, `group=none` no-ops. |
| `.github/dependabot.yml` | Keep patch groups first and add exact minor/major React, React types, and Remotion manual-review groups. |
| `.github/workflows/dependabot-branch-refresh.yml` | Mint a repository-scoped GitHub App token, validate the oldest exact patch-group queue head, disable old auto-merge, and submit one expected-head-bound GraphQL rebase. |
| `test/ci/workflows.test.ts` | Execute title, auto-merge, grouping, refresh selection, refresh identity, summary, structural, and mutation contracts. |
| `publicSnapshotReport()` and generated snapshot manifest | Validate all changed public workflows, configuration, and tests from committed `HEAD`; the generated snapshot retains its internal manifest. |
| `evidence/pr-47-refresh-canary.md` | Record exact #47 preflight, refresh, provenance, workflow, authorization, checks, and final merge evidence. |
| `evidence/pr-48-refresh-canary.md` | Record the same evidence for #48 only after #47 merges. |

## Parts and Dependencies

1. **Part 1 — Title policy and successful no-op classification**
   - Task 1 adds failing title and non-policy classification contracts.
   - Task 2 implements exact title families and early successful no-op output.
2. **Part 2 — Atomic manual-review dependency families**
   - Task 3 adds failing order, membership, update-type, and policy-exclusion tests.
   - Task 4 adds the three exact minor/major groups.
3. **Part 3 — Repository-scoped GitHub App branch refresh**
   - Task 5 adds failing workflow structure, executable selection, identity, mutation, and summary contracts.
   - Task 6 creates the checkout-free one-target refresh workflow.
4. **Part 4 — Snapshot, full verification, and ordered remote canary**
   - Task 7 regenerates the public snapshot and runs the complete local gate.
   - Task 8 runs and records the #47 canary.
   - Task 9 begins only after #47 is merged, then runs and records #48.

Implementation order is strict:

```text
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7
→ merge implementation to main → Task 8 → #47 merged → Task 9
```

No implementation task may run in parallel.

## Coherent Groups and Review Lifecycle

- Tasks 1–2: `[Group: title-policy]`
- Tasks 3–4: `[Group: dependency-families]`
- Tasks 5–6: `[Group: branch-refresh]`
- Tasks 7, 8, and 9 are standalone verification/rollout boundaries.

After each group completes Mode A:

1. Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel.
2. Resume the same implementer for accepted Mode B remediation.
3. Run one read-only verifier over the combined group.
4. Do not start the next group until the verifier passes.

All grouped tasks have `[Tester: yes]`.

## Required Commits

Preserve these focused Conventional Commits:

```text
test(ci): define Dependabot title and no-op policy
ci(deps): accept generated Dependabot PRs
test(deps): define synchronized family groups
chore(deps): group synchronized dependency families
test(ci): define Dependabot branch refresh policy
ci(deps): refresh one stale Dependabot branch
chore(snapshot): refresh Dependabot automation hashes
docs(deps): record PR 47 refresh canary
docs(deps): record PR 48 refresh canary
```

Use repository-configured identity. Do not pass `--author`, override identity variables, amend authorship, or push directly to `main`.

## Fixed Security Values

```text
Repository: therealhieu/md2vid
Base branch: main
Refresh schedule: 17 5 * * *
Concurrency group: dependabot-branch-refresh
cancel-in-progress: false
App variable: DEPENDABOT_REFRESH_APP_ID
App secret: DEPENDABOT_REFRESH_APP_PRIVATE_KEY
App installation scope: therealhieu/md2vid only
App permissions: contents write, pull requests write, metadata read
Action: actions/create-github-app-token
Action version: v2.2.2
Action SHA: fee1f7d63c2ff003460e3d139729b119787bc349
Refresh method: REBASE
Required checks:
  pr-title
  dependency-review
  public-snapshot / validate
  pr-minimum / validate
  pr-latest / validate
```

## Completion Criteria

- Human title behavior is unchanged.
- Current and legacy grouped titles pass only for exact known group/branch pairs.
- Individual npm, scoped npm, and Action titles pass title validation only for exact Dependabot identity and supported namespaces.
- Trusted non-policy refs emit `eligible=false`, `group=none`, `pr_number`, and `expected_head_sha` without grouped metadata parsing or writes.
- Patch groups remain first and patch-only.
- `react-family`, `react-types-family`, and `remotion-family` contain only their exact package sets and only `minor`/`major`.
- Only `runtime-patches`, `dev-patches`, and `actions-patches` occur in privileged eligibility policies.
- Refresh uses only the repository-scoped App token, selects no more than the oldest exact patch-group queue head, and never skips an unhealthy queue head.
- The exact `github-actions` Bot tuple and `SQUASH` method are required.
- Auto-merge disable happens before GraphQL `REBASE`; both head reads and the rebase are expected-head-bound.
- The refresh workflow never enables auto-merge for the new head.
- Every terminal path writes the fixed, non-sensitive summary schema.
- Focused, snapshot, full, release, Actionlint, and diff checks pass.
- #47 is processed before #48; #49 remains manual.
- Canary failure is documented and stops rollout without weakening any guard.
