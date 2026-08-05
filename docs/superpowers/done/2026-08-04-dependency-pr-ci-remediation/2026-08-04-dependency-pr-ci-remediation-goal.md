# 2026-08-04-dependency-pr-ci-remediation — Execution Goal

## Persona

You are a senior implementation and rollout agent working in the md2vid repository. Follow project rules, use TDD for repository changes, keep each remediation unit isolated, protect user work and pristine Dependabot branches, use the repository-configured Git identity, and stop for explicit user authorization before every outward-facing GitHub mutation.

## Context

- Requirements: `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/2026-08-04-dependency-pr-ci-remediation-requirements.md`
- Design: `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/2026-08-04-dependency-pr-ci-remediation-design.md`
- Plan index: `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/2026-08-04-dependency-pr-ci-remediation-plan.md`
- Plan parts:
  - `2026-08-04-dependency-pr-ci-remediation-plan-1.md`
  - `2026-08-04-dependency-pr-ci-remediation-plan-2.md`
  - `2026-08-04-dependency-pr-ci-remediation-plan-3.md`
  - `2026-08-04-dependency-pr-ci-remediation-plan-4.md`
  - `2026-08-04-dependency-pr-ci-remediation-plan-5.md`
  - `2026-08-04-dependency-pr-ci-remediation-plan-6.md`
- Inherited policy artifacts:
  - `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-requirements.md`
  - `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-design.md`
- Git standard: `docs/standards/git.md`
- No post-implementation check exists during planning. Part 6 creates `2026-08-04-dependency-pr-ci-remediation-check.md` only after Units A–F and their remote dispositions complete.
- Goal: remove the dependency-PR snapshot contradiction, add exact HyperFrames 0.7.87 compatibility, recover #47/#48 without maintainer commits, replace TypeScript 7 with a validated TypeScript 6 successor, and replace the privileged App-token action through a human-reviewed v3 rollout.
- Architecture: execute Units A–F sequentially in separate worktrees or existing bot PRs. Repository prerequisites land on `main` before bot refresh; compatibility/policy-coupled majors use human replacement PRs; the persistent evidence branch rebases onto final `main`, creates the post-implementation check, and archives the completed package.
- Tech stack: TypeScript, Node.js tests, npm 11.15.0, Git committed-tree inspection, SHA-256, GitHub Actions, GitHub CLI, REST/GraphQL APIs, `jq`, HyperFrames exact Studio patching, Remotion generated-project release smoke, and Superpowers review/verifier lifecycles.
- Required checks remain exactly:
  - `pr-title`
  - `dependency-review`
  - `public-snapshot / validate`
  - `pr-minimum / validate`
  - `pr-latest / validate`
- Execute in strict order:

  ```text
  Unit A snapshot authority
    → Unit B HyperFrames compatibility
    → #47 recovery/merge
    → #48 recovery/merge
    → TypeScript 6 successor/merge and #49 closure
    → Action v3 replacement/merge, no-candidate dispatch, and #51 closure
    → final audit/check/archive PR
  ```

- No implementation writers or remote rollout units run concurrently. Only the planned read-only review pass within a completed coherent group runs in parallel.
- Coherent groups:
  - Tasks 1–3: `dynamic-snapshot`
  - Tasks 5–7: `hyperframes-0-7-87`
  - Tasks 11–12: `typescript-6-successor`
  - Tasks 15–17: `app-token-v3`
- Preserve these decisions:
  - Repository-root `public-snapshot.json` is removed; generated snapshots retain and verify their internal manifest.
  - `public:snapshot` is deterministic and non-mutating; `public:snapshot:check` remains the full committed-tree security/package/release gate.
  - HyperFrames patching remains exact, reviewed, idempotent, one-variant/one-bundle, and fail-closed.
  - Never add a maintainer commit to #47 or #48.
  - Never refresh or merge #49. Close it only after the TypeScript 6.0.3 human successor merges and passes the generated Remotion bundle/render path.
  - Keep App-token v2.2.2 deployed until #47/#48 resolve or their canary is formally abandoned.
  - Never add commits to #51. Close it only after the human v3 replacement merges and its first guaranteed no-candidate dispatch succeeds.
  - The v3 workflow remains checkout-free, repository-scoped to `therealhieu/md2vid`, explicitly limited to contents write, pull requests write, and metadata read, proxy-free, and uses default token revocation.
  - Keep `app-id`; `client-id` migration is separate.
  - Do not edit the open PR #52 check or existing canary-evidence files.
  - Branch protection, strict up-to-date enforcement, required contexts, admin enforcement, conversation resolution, force-push denial, and branch-deletion denial remain unchanged.
- Pushes, PR creation, merges, workflow dispatches, reruns, comments, closures, and repository-setting changes require explicit user authorization immediately before execution. Authorization for one unit does not carry to another.
- Evidence directories are ignored. Force-add only named evidence files, and never record credentials, token values, private keys, raw PR bodies, raw workflow logs, or arbitrary API responses.

## Tasks

- Execute Tasks 1–21 from the plan index and Parts 1–6 in exact order.
- For every repository-change task: write the listed failing contract first, run it and observe the expected failure, implement the minimal change, run the targeted green commands, then commit with the planned Conventional Commit subject.
- Run committed-tree public-snapshot integration checks only after the relevant implementation commit exists, or against an explicit committed fixture.
- For each coherent group, finish Mode A, run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel, add the security review for Unit F, resume the same implementer for Mode B remediation, rerun affected commands, and require one nested read-only verifier before continuing.
- Preserve every planned branch, flat worktree path, task commit, group boundary, and merge prerequisite. If accepted Mode B remediation changes files, add a focused Conventional Commit after the affected planned task commit; do not amend or rewrite planned commits.
- Re-query remote PR heads, file sets, commit count, author, signature, merge state, check results, and auto-merge identity immediately before acting. Never rely on planning-time head values.
- If #47/#48 refresh changes provenance, creates multiple commits, requires workflow approval, loses exact-head authorization, or reveals a new compatibility failure, stop rather than weakening policy.
- Require #47 to merge before touching #48.
- Require zero open exact patch-group candidates before the first Action v3 dispatch. If any candidate exists, wait.
- Create allowlisted evidence during rollout. Keep the evidence branch local until all Units A–F complete, then rebase it onto final `origin/main`.
- Create the post-implementation check only in Task 20 from concrete commits, checks, merges, closures, dispatch results, deviations, and risks.
- Move the package from `active` to `done` only after Task 20 verification.
- If implementation must deviate from the requirements, design, security boundary, ordering, or commit structure, stop and document the exact reason before continuing.

## Success Criteria

- Tasks 1–21 and every required review/remediation/verifier lifecycle complete in order.
- Unit A removes the repository-root mirror and preserves committed-tree path selection, content scanning, report count/hash validation, exact materialization, generated-manifest verification, isolated one-commit repository construction, package validation, and release smoke.
- `public:snapshot` does not change `git status`; `public:snapshot:check` remains required and green.
- HyperFrames 0.7.87 matches one reviewed `rr/p/v` variant, patches both anchors exactly once, remains byte-idempotent, and fails closed on missing, duplicate, mixed, or ambiguous markers.
- Published `hyperframes@0.7.87` evidence proves exactly one bundle match without changing the root dependency version in Unit B.
- #47 and #48 each retain one verified Dependabot-authored commit, start normal exact-head CI/observer runs without approval, receive fresh `SQUASH` authorization from the exact `github-actions` Bot identity, pass the five required checks, and native squash-merge in order.
- TypeScript 6.0.3 remains the root and generated-scaffold authority, matches the approved npm integrity, and passes root typecheck, Remotion template typecheck, dynamic snapshot validation, full checks, and generated Remotion bundle/render/runtime probes.
- #49 closes unmerged with a link to the merged TypeScript 6 successor and no TypeScript 7 shim or unstable internal entry point.
- The Action v3 replacement uses `bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0`, updates every exact policy/mutation reference, preserves scope and permissions, declares no proxy environment, and leaves token revocation enabled.
- The first v3 dispatch occurs with zero exact patch-group candidates, emits the exact `no-candidates` summary, and completes token creation, summary, and post/revocation steps.
- #51 closes unmerged with links to the validated replacement and dispatch.
- Strict branch protection still requires exactly the five named contexts.
- Final focused, snapshot, full, release, and diff commands pass from the rebased evidence worktree.
- The post-implementation check contains concrete values and no placeholders.
- The completed requirements, design, plan index, six plan parts, goal, evidence, and check exist under `docs/superpowers/done/2026-08-04-dependency-pr-ci-remediation/`.
- No TODOs, placeholders, credentials, raw tokens, private keys, raw workflow logs, or unfinished work remain.
