# 2026-07-28-auto-dependency-updates — Execution Goal

## Persona

You are a senior implementation agent working in this repository. Follow strict TDD, keep privileged workflows checkout-free, treat package metadata and repository protection as security boundaries, protect existing generated-project compatibility, and create focused Conventional Commits with the repository-configured identity.

## Context

- Required execution skill: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`.
- Design: `docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-design.md`.
- Research: `docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-research.md`.
- Plan index: `docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan.md`.
- Dependency-authority plan: `docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan-1.md`.
- Automation/rollout plan: `docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan-2.md`.
- Git standard: `docs/standards/git.md`.
- Goal: add weekly grouped Dependabot patch updates that safely auto-merge across runtime, optional, development, and GitHub Actions dependencies after repository-enforced checks pass.
- Architecture: root `package.json` supplies operational dependency versions; source templates use stable materialization tokens; Dependabot creates three patch groups; a checkout-free workflow validates immutable metadata and requests native squash auto-merge; protected `main` remains the merge authority.
- Tech stack: Node.js 22.18+, TypeScript ESM, npm 11.15.0, Node test runner, YAML 2.9.0, Dependabot, GitHub Actions, GitHub CLI, and GitHub REST API.
- Create `.worktrees/auto-dependency-updates-impl` on branch `auto-dependency-updates-impl` from `feat/auto-dependency-updates`. All repository-file implementation happens there.
- Execute Tasks 1–6 strictly in order. Never dispatch implementation writers in parallel.
- Tasks 1–3 are group `dependency-contracts`; Tasks 4–5 are group `dependabot-automation`; Task 6 is a standalone post-merge remote rollout.
- Complete each group's Mode A, parallel read-only spec/quality/tester review, Mode B remediation, and one read-only verifier before continuing.
- Do not exclude GSAP or another current dependency from patch grouping. Remove operational static-version coupling instead.
- Preserve HyperFrames patch-anchor validation as the compatibility gate for new HyperFrames patches.
- Preserve existing projects that explicitly use an older exact canonical jsDelivr GSAP URL.
- The original privileged workflow requirement was `pull_request`, not `pull_request_target`, with no checkout, install, build, import, or pull-request-file execution.
- **Approved architecture decision (2026-07-28):** authoritative GitHub documentation confirms that `pull_request` runs use workflow content from the event-associated merge ref. Because the privileged workflow used the mutable `dependabot/fetch-metadata` action, an Actions update could execute its proposed workflow/action revision with write authority before merge. The approved replacement is an unprivileged `pull_request` observer that emits only a successful completion signal, followed by a privileged default-branch `workflow_run` stage that re-queries and validates the live PR through GitHub APIs. This is an explicit architecture exception to the original trigger requirement, approved before implementation.
- Remote settings must not change until Tasks 1–5 are merged to `main`, live state is read back, the exact settings diff is shown, and the user explicitly confirms the write.
- Minor and major dependency updates, merge queues, external auto-merge apps, PATs, and GitHub App tokens remain out of scope.

## Tasks

- Execute every checkbox in `2026-07-28-auto-dependency-updates-plan-1.md` with the listed red test before implementation and the listed green checks afterward.
- Preserve the dependency-contract commits in order:
  - `test(deps): define package version authority`
  - `chore(deps): derive operational dependency versions`
  - `test(ci): generalize immutable action pins`
- Complete the `dependency-contracts` review, remediation, tester, and verifier lifecycle.
- Execute every checkbox in Tasks 4–5 of `2026-07-28-auto-dependency-updates-plan-2.md`.
- Preserve the automation commits in order:
  - `test(ci): define Dependabot patch policy`
  - `ci(deps): enable guarded patch auto-merge`
- Complete the `dependabot-automation` review, remediation, tester, and verifier lifecycle.
- Run every command in the index plan's Final Local Verification section and stop on any nonzero result.
- Merge the implementation PR before beginning Task 6.
- For Task 6, read current remote state, present the exact diff, obtain user confirmation, apply only the confirmed settings, and verify them through API read-back.
- Observe one real grouped Dependabot patch PR as a canary. Use the executable policy decision table as the blocking negative proof; inspect an unmatched live Dependabot PR only when one already exists.
- If implementation must deviate from the design or plan, stop and document the concrete reason before changing scope.
- After implementation and verification, create the post-implementation check file required by the writing-plans workflow; do not create it during planning.

## Success Criteria

- Task 1 records package-authority, synchronized-family, and version-independent-template contracts in a failing test commit.
- Task 2 makes package.json authoritative for HyperFrames, Remotion, React, TypeScript, and GSAP operational values; source templates contain one stable GSAP token and built templates contain none.
- Task 2 preserves HyperFrames patch-anchor failure behavior and accepts existing exact canonical GSAP CDN pins without accepting arbitrary remote URLs.
- Task 3 enforces full immutable Action SHAs and version comments without freezing routine current SHA values.
- Task 4 records failing structural tests for all three patch groups and every privileged workflow guard.
- Task 5 creates weekly `runtime-patches`, `dev-patches`, and `actions-patches` groups with `chore(deps)` titles and no patch exclusions.
- Every current runtime, optional, and development dependency is covered by the intended group; minor and major updates remain manual.
- Only Dependabot-authored grouped patch PRs against `main` in `therealhieu/md2vid` can reach approval and native auto-merge steps.
- The merge workflow grants only `contents: write` and `pull-requests: write`, checks out no code, and executes no PR-controlled repository file.
- `main` requires one approval and these stable checks:
  - `pr-title`
  - `dependency-review`
  - `public-snapshot / validate`
  - `pr-minimum / validate`
  - `pr-latest / validate`
- `main` blocks force pushes and deletion, enforces admins, and requires conversation resolution.
- The canary is approved by GitHub Actions, remains open while checks are pending, and squash-merges only after every required check passes.
- A minor or major Dependabot PR receives no automated approval or auto-merge request.
- `corepack npm --version` prints `11.15.0`; all targeted tests, full checks, release checks, snapshot checks, and diff checks pass.
- No unresolved template token, unrelated refactor, generated `dist/` commit, placeholder, or unfinished work remains.
