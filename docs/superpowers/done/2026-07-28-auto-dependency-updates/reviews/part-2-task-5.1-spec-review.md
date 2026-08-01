# Canonical Review Artifact

- Review scope: Part 2, Task 5.1
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `clean-head`
- Scope origin: `7e58bda385b80cffbc99260f8c89067b37ba61eb`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.pJ1msq/task-scope.patch`
- Created: 2026-07-28
- Tester dispatched: yes

---

## Findings

### SPEC-1 — Must fix — Canonical permission requirements contradict the remediation
- Requirement: “add only `actions: read` to the trusted job’s exact permissions” while retaining top-level `permissions: {}`, `contents: write`, and `pull-requests: write`.
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/done/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-goal.md:61` — success criterion still requires only `contents: write` and `pull-requests: write`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/done/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-design.md:269` — data-flow contract still says the trusted job grants only those two permissions.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/done/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan.md:164` — completion criterion repeats the obsolete two-permission contract.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/done/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan-2.md:689-693` correctly documents the canary failure and required deviation before commit `e3044ea`, but does not reconcile the other active canonical criteria.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml:25-28` correctly implements the new three-permission contract.
- Guidance: Update the active goal, design, and plan-index criteria to require exactly:
  ```yaml
  permissions:
    actions: read
    contents: write
    pull-requests: write
  ```
  State that `actions: read` is limited to querying the triggering observer run and associated PRs. Preserve the documented deviation chronology in Part 2. Then regenerate `public-snapshot.json`.
- Success checklist:
  - [ ] Goal, design, plan index, and Part 2 agree on the exact three job permissions.
  - [ ] The documents retain top-level `permissions: {}` and describe `actions: read` as read-only observer-run access.
  - [ ] No trust-origin, provenance, commit-binding, checkout-free, approval, or merge requirement is weakened.
  - [ ] `public-snapshot.json` reflects all documentation changes.
  - [ ] Focused, Actionlint, snapshot, full, release, and diff checks still pass.

## Consolidated post-implementation checklist

- [x] Canary deviation was documented in commit `2348aea` before the workflow change in commit `e3044ea`.
- [x] The contract test requires exactly `actions: read`, `contents: write`, and `pull-requests: write`.
- [x] Top-level workflow permissions remain `{}`.
- [x] The implementation adds only `actions: read`.
- [x] Existing workflow-run origin, repository, actor, conclusion, PR identity, live-head, commit provenance, and metadata guards remain unchanged.
- [x] No checkout, artifacts, cache handoff, external action, installation, build, project script, or PR-controlled execution was introduced.
- [x] Approval remains bound to the exact `commit_id`.
- [x] Merge remains exactly `--auto --squash --match-head-commit`.
- [x] The scoped patch contains no remote-policy configuration change.
- [x] The snapshot records the workflow and test changes.
- [ ] Reconcile the active goal, design, and plan-index permission contracts.
- [ ] Regenerate and validate the snapshot after that reconciliation.
- [ ] Rerun the real grouped Dependabot canary and capture successful trusted-run, approval, pending-check, and ordered squash-merge evidence.

## Verification gaps

- The reported RED result—`54/55`, failing only because `actions: read` was missing—was not independently rerun because reproducing it requires executing the repository at commit `2348aea`. Commit order and the exact one-line test/workflow diffs support the report.
- Local verification completed:
  - Focused workflow tests: `55/55`.
  - Actionlint: no diagnostics.
  - Public snapshot check: passed.
  - Full and release checks: `846/846`; release smoke checks passed.
  - Scope and working-tree diff checks: passed; worktree remained clean.
- No remote API writes appear in the task patch or the three scoped commits. Git history cannot prove that no out-of-band remote settings command was executed.
- The repaired workflow has not yet been proven by a successful live rerun of canary PR `#25`; that remains Task 6 evidence.

## Residual risk

`actions: read` is required for the two Actions run endpoints and adds no write authority, but it expands the trusted token’s readable Actions metadata surface. The exact-permission test limits future broadening. The main remaining operational risk is unverified live behavior until the trusted `workflow_run` succeeds and the canary completes its commit-bound approval and protected squash auto-merge path.
