# Resolve Open Pull Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all nine open Dependabot PRs through validated replacements or a guarded fresh patch successor, without bypassing repository protections.

**Architecture:** Replace updates that cannot pass the bot trust/title policy with small, human-owned conventional PRs. Keep the fresh `runtime-patches` successor bot-owned and allow only the existing observer → trusted `workflow_run` path to request its native squash auto-merge. Each replacement begins from the latest merged `main`; every stale original closes only after its successor is green.

**Tech Stack:** Node.js 22.18+, npm 11.15.0, Node test runner, GitHub Actions, Dependabot, GitHub CLI, YAML workflows.

---

## Source Artifacts

- Requirements: `docs/superpowers/done/2026-08-01-resolve-open-prs/2026-08-01-resolve-open-prs-requirements.md`
- Design: `docs/superpowers/done/2026-08-01-resolve-open-prs/2026-08-01-resolve-open-prs-design.md`
- Git standards: `docs/standards/git.md`
- Prior dependency automation design: `docs/superpowers/done/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-design.md`

## File Responsibility Map

| File | Responsibility |
|---|---|
| `docs/superpowers/done/2026-08-01-resolve-open-prs/evidence/pr-inventory.md` | Immutable before/after PR state, successor links, required-check and merge evidence |
| `.github/workflows/ci.yml` | Actions-major replacement pins and current PR title policy |
| `.github/workflows/nightly.yml` | Actions-major replacement `setup-node` pin |
| `.github/workflows/release.yml` | Actions-major replacement checkout/setup-node/download/upload pins |
| `.github/workflows/validate.yml` | Actions-major replacement checkout/setup-node/upload pins and CI execution contract |
| `test/ci/workflows.test.ts` | Immutable-pin, current major-version, and guarded auto-merge contracts |
| `package.json`, `package-lock.json` | Atomic React pair, GSAP, and Node-types version resolution |
| `scripts/dependency_versions.ts` | React-family and GSAP authority contracts; no routine version change unless a test proves it necessary |
| `test/cli/dependency-versions.test.ts` | React pair and package-derived operational version contracts |
| `test/ci/public-snapshot*.test.ts` | Test surface for a reproducible #25 snapshot defect only |

## Plan Parts and Dependencies

1. **Part 1 — Baseline and Actions major replacement:** `2026-08-01-resolve-open-prs-plan-1.md`
   - Captures evidence and validates current main.
   - Replaces #1–#4 with a human-owned Actions v7/v8 update PR.
2. **Part 2 — Runtime and package updates:** `2026-08-01-resolve-open-prs-plan-2.md`
   - Replaces #26/#28 atomically, diagnoses then refreshes #25, resolves #27 from fresh Node-26 evidence, and replaces #29.
   - Audits the final PR and main state.

Execute every task and group sequentially in the listed order. Reviewers (`spec-reviewer`, `code-quality-reviewer`, and required `tester`) may run in parallel only after their scoped implementer finishes Mode A. Complete Mode B remediation and one nested verification before beginning the next scope.

## Grouping and Boundaries

- **`[Group: actions-major]`** contains only the Actions v7/v8 test-contract and workflow-pin changes. It ends before package resolution because workflow YAML and lockfile review are independent.
- **`[Group: react-pair]`** contains only the React and React DOM atomic upgrade plus its lockfile/contract evidence. It ends before #25 because the latter must remain bot-owned.
- **`[Group: closeout]`** contains the independent GSAP retry, Node-types replacement, and final audit only when each prior successor has merged; split it if the #27 retry reveals a reproducible code defect.

## Worktree and Git Rules

Create one dedicated worktree for each human-owned replacement, using the exact flat names below. Run Part 1 Tasks 1–4 in `resolve-open-actions`; evidence commits become part of that replacement branch. Begin each later replacement only after its predecessor has merged and create its worktree from the then-current `main`.

```bash
git worktree add .worktrees/resolve-open-actions -b chore/resolve-open-actions
git worktree add .worktrees/resolve-react-pair -b chore/resolve-react-pair
git worktree add .worktrees/resolve-gsap -b chore/resolve-gsap
git worktree add .worktrees/resolve-node-types -b chore/resolve-node-types
```

Use the configured Git identity. Do not pass author overrides, rewrite Dependabot branches, force-push, direct-push `main`, use `--admin`, or change remote settings.

## Final Verification

```bash
corepack npm ci
node --test test/ci/workflows.test.ts
node --test test/cli/dependency-versions.test.ts
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected: every command exits `0`, no original PR number remains open, and every original PR has a linked validated replacement or merge record.
