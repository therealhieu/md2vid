# Automatic Dependency Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add weekly grouped Dependabot patch updates that safely auto-merge across runtime, optional, development, and GitHub Actions dependencies after repository-enforced checks pass.

**Architecture:** Root `package.json` becomes the authoritative source for dependency versions consumed by runtime code, generated projects, templates, tests, and release verification. Dependabot creates three patch-only groups. An unprivileged `pull_request` observer emits only a completion signal; a checkout-free privileged `workflow_run` stage defined on the default branch independently re-queries and validates the live Dependabot PR before commit-bound approval and native squash auto-merge. Protected `main` remains the final merge authority.

**Tech Stack:** Node.js 22.18+, TypeScript ESM, npm 11.15.0, Node test runner, YAML 2.9.0, Dependabot v2 configuration, GitHub Actions, trusted inline Node.js metadata parsing, GitHub CLI, GitHub REST API.

---

## Source Artifacts

- Design: `docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-design.md`
- Research: `docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-research.md`
- Git standard: `docs/standards/git.md`
- Part 1: `docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan-1.md`
- Part 2: `docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan-2.md`
- Execution goal: `docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-goal.md`

## Standards Used

- Plan structure: `docs/superpowers/active/2026-07-27-md2vid-upgrade/2026-07-27-md2vid-upgrade-plan.md`
- Part-plan structure: `docs/superpowers/active/2026-07-27-md2vid-upgrade/2026-07-27-md2vid-upgrade-plan-2.md`
- Goal structure: `docs/superpowers/active/2026-07-27-md2vid-upgrade/2026-07-27-md2vid-upgrade-goal.md`
- Git/worktree/commit rules: `docs/standards/git.md`

## Verified Initial Remote State

Planning-time read-only API checks found:

```text
allow_auto_merge: false
allow_squash_merge: true
main protected: false
repository rulesets: []
```

Remote settings must be read again immediately before rollout. If they differ, stop and obtain user confirmation before applying writes.

## Approved TEST-001 architecture revision

The original Task 5 sketch used a privileged `pull_request` workflow. Current GitHub documentation confirms that this event uses workflow content from the PR-associated merge ref, so an Actions patch updating the workflow or its metadata action could execute proposed privileged content before merge. The approved replacement is a read-only `pull_request` observer plus a privileged default-branch `workflow_run` stage. The privileged stage consumes no observer artifact or cache, re-queries all trusted state through GitHub APIs, verifies every current PR commit, and binds approval and auto-merge to one live head SHA.

The pinned `dependabot/fetch-metadata` action is removed from the revised implementation because it requires a `pull_request` payload and cannot operate directly on `workflow_run`. Trusted inline API parsing replaces it. This is an approved exception to the original trigger architecture; Task 6 remains unchanged and blocked until this remediation and verification complete.

## File Responsibility Map

| File | Responsibility |
|---|---|
| `scripts/dependency_versions.ts` | Read and validate exact operational dependency versions from root `package.json`; expose synchronized HyperFrames, Remotion, React, TypeScript, and GSAP values. |
| `frameworks/hyperframes/scaffold.ts` | Build the default GSAP CDN URL, materialize version-independent template tokens, validate current and historical canonical GSAP URLs, and scaffold a materialized caption skin. |
| `frameworks/hyperframes/emit.ts` | Materialize the caption template with the configured GSAP source before emitting HTML. |
| `scripts/copy_dist_assets.ts` | Copy framework assets and materialize HyperFrames GSAP tokens in `dist`. |
| `frameworks/hyperframes/templates/*.html` | Store version-independent GSAP source tokens rather than static dependency versions. |
| `frameworks/hyperframes/patches.ts`, `frameworks/hyperframes/patch-studio.ts`, `scripts/hyperframes_cli.ts` | Consume the package-derived HyperFrames version while preserving patch-anchor fail-closed behavior. |
| `frameworks/remotion/scaffold.ts` | Generate synchronized Remotion, React, React type, and TypeScript dependency values from root metadata. |
| `test/cli/dependency-versions.test.ts` | Enforce package-authority, family synchronization, template materialization, and generated-output contracts. |
| Existing HyperFrames, scaffold, golden, and release tests | Replace routine version literals with derived values while retaining behavioral coverage. |
| `test/ci/workflows.test.ts` | Validate generic immutable Action pins, Dependabot groups, and privileged auto-merge workflow boundaries. |
| `.github/dependabot.yml` | Define weekly runtime, development, and Actions patch groups with conventional commit prefixes. |
| `.github/workflows/dependabot-auto-merge-observer.yml` | Observe eligible Dependabot `pull_request` events with no write authority, checkout, artifact, cache, or PR-code execution; provide only a completion signal. |
| `.github/workflows/dependabot-auto-merge.yml` | On trusted default-branch `workflow_run`, re-query the observer run and exactly one associated live PR; validate repository, actor, author, base, head repository/ref/SHA, complete commit provenance, patch metadata, group branch, and dependency names; approve the exact commit and request head-bound native squash auto-merge. |
| `public-snapshot.json` | Record changed public source hashes after source, template, workflow, test, and documentation updates. |

## Plan Parts and Dependencies

1. **Part 1 — Dependency authority and update-safe contracts:** `2026-07-28-auto-dependency-updates-plan-1.md`
   - Task 1 records failing package-authority and template-materialization contracts.
   - Task 2 centralizes HyperFrames, Remotion/React, and GSAP version consumers and removes operational static-version coupling.
   - Task 3 replaces routine exact Action SHA assertions with immutable-pin and cross-workflow consistency checks.
2. **Part 2 — Dependabot automation and remote rollout:** `2026-07-28-auto-dependency-updates-plan-2.md`
   - Task 4 records failing Dependabot grouping and guarded-workflow contracts.
   - Task 5 implements grouped patch updates and checkout-free native auto-merge requests.
   - Task 6 activates repository protections after the implementation reaches `main`, then verifies one real Dependabot canary.

Implementation is strictly sequential: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6. Never dispatch implementation writers in parallel.

## Grouping and Review Lifecycle

- Tasks 1–3: `[Group: dependency-contracts]` — one package-authority and generated-output scope.
- Tasks 4–5: `[Group: dependabot-automation]` — one dependency-update and privileged-workflow policy scope.
- Task 6: standalone remote rollout. It begins only after Tasks 1–5 are reviewed, verified, merged to `main`, and the user confirms remote writes after seeing the live settings diff.
- After each implementation group completes Mode A, run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel.
- Resume the same implementer for Mode B remediation.
- The implementer may then spawn exactly one read-only verifier for the supplied checklist before the next group begins.

## Worktree and Git Rules

Create the implementation worktree required by `docs/standards/git.md`:

```bash
git worktree add .worktrees/auto-dependency-updates-impl \
  -b auto-dependency-updates-impl \
  feat/auto-dependency-updates
```

All repository-file implementation and verification happens inside `.worktrees/auto-dependency-updates-impl`. Use the configured git identity and never pass author overrides.

Preserve these focused commits:

```text
test(deps): define package version authority
chore(deps): derive operational dependency versions
test(ci): generalize immutable action pins
test(ci): define Dependabot patch policy
ci(deps): enable guarded patch auto-merge
```

Task 6 changes remote repository settings and creates no local commit.

## Final Local Verification

Run from the implementation worktree after Task 5:

```bash
corepack npm --version
node --test test/cli/dependency-versions.test.ts
node --test frameworks/hyperframes/__tests__/emit.test.ts
node --test frameworks/hyperframes/__tests__/patch-studio.test.ts
node --test test/cli/hyperframes-cli.test.ts
node --test test/cli/scaffold-decoupled.test.ts test/cli/scaffold-project.test.ts
node --test test/ci/workflows.test.ts
corepack npm run check:skill-references
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check feat/auto-dependency-updates...HEAD
git diff --check
git status --short
```

Expected:

- npm prints exactly `11.15.0`.
- Every test and npm command exits `0`.
- Source templates contain no dependency version literal and built/package templates contain no unresolved GSAP token.
- HyperFrames patch anchors still reject incompatible package contents.
- Remotion/React generated manifests use package-derived synchronized versions.
- Workflow tests enforce full immutable Action SHAs without freezing routine SHA values.
- Both diff checks print nothing.
- `git status --short` is empty after the final commit.

## Remote Rollout Gate

Task 6 is outward-facing and changes merge policy. Immediately before any write:

1. Read current repository, Actions approval, branch protection, and ruleset state.
2. Show the exact current → proposed settings diff to the user.
3. Obtain explicit confirmation.
4. Apply only the confirmed settings.
5. Read them back and stop if any field differs from the plan.

Do not weaken or remove branch protection as rollback. Disable auto-merge and Actions approval first if the canary is unsafe.

## Completion Criteria

- Every current runtime, optional, and development dependency patch is eligible for its designed group; no dependency is silently excluded.
- HyperFrames, Remotion, React, and GSAP patch updates require no unrelated static-version edit.
- Existing generated projects may retain an older exact canonical jsDelivr GSAP URL without becoming invalid.
- Runtime, development, and Actions groups are weekly and patch-only; minor and major updates remain manual.
- Dependabot titles use `chore(deps)`.
- The observer uses `pull_request` with no write authority and no checkout, artifact, cache, or PR-controlled execution; the privileged default-branch stage uses `workflow_run`, keeps top-level `permissions: {}`, checks out no code, executes no PR-controlled file, and grants its trusted job exactly `actions: read`, `contents: write`, and `pull-requests: write`. The job-scoped `actions: read` grant is only for querying the triggering observer run and associated PRs.
- A PR changing either workflow cannot execute proposed privileged content; the trusted stage correlates exactly one observer run to exactly one Dependabot PR and binds review plus auto-merge to the same verified live head SHA.
- `main` requires one approval and the verified stable CI checks, blocks force pushes and deletion, and uses native squash auto-merge.
- A real grouped Dependabot patch canary is approved by Actions, remains open while required checks are pending, and squash-merges only after all checks pass.
- All local verification succeeds with a clean worktree.
