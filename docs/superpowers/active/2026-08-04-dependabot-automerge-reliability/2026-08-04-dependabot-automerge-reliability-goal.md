# 2026-08-04-dependabot-automerge-reliability — Execution Goal

## Persona

You are a senior implementation agent working in this repository. Follow project rules, use TDD, keep scope tight, protect user work, and make small focused commits after completed tasks. Use the repository-configured Git identity and never override authorship.

## Context

- Start only after the approved companion artifacts are committed. Create or enter `.worktrees/fix-dependabot-automerge` on branch `fix/dependabot-automerge`; verify `.worktrees` is ignored before creation. Follow `docs/standards/git.md`: one flat path segment, no agent prefix, Conventional Commits under 72 characters, one logical change per commit, and no `--author` or identity overrides.
- Required implementation skill: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` and preserve the plan’s group boundaries, review loops, and sequential execution.
- Source artifacts:
  - Requirements: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-requirements.md`
  - Design: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-design.md`
  - Index plan: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-plan.md`
  - Part 1: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-plan-1.md`
  - Part 2: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-plan-2.md`
  - Part 3: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-plan-3.md`
  - Part 4: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-plan-4.md`
  - Git standard: `docs/standards/git.md`
- No inspection, manual-verification, or post-implementation check file exists. Do not create the check file until implementation is complete.
- Goal: make eligible Dependabot patch groups pass title policy, remain current with `main`, and reach native squash auto-merge while valid non-group PRs become safe no-ops and synchronized minor/major families remain manual.
- Architecture: preserve the unprivileged observer → trusted default-branch `workflow_run` policy. Extend title handling and no-op classification without broadening patch eligibility; add manual synchronized-family groups; add a separate checkout-free workflow that uses a repository-scoped GitHub App to disable old auto-merge and GraphQL-rebase one validated queue head with `expectedHeadOid`.
- Tech stack: GitHub Actions, Dependabot v2, Bash, inline Node.js ESM, GitHub CLI, REST and GraphQL APIs, YAML 2.9.0, Node tests, Actionlint, and public snapshot tooling.
- Strict order:

  ```text
  Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7
  → implementation merged to main → Task 8 → #47 merged → Task 9
  ```

  No implementation writers run in parallel. Only the read-only reviewer pass inside a completed group runs concurrently.
- Group boundaries:
  - Tasks 1–2: `title-policy`
  - Tasks 3–4: `dependency-families`
  - Tasks 5–6: `branch-refresh`
  - Tasks 7–9: standalone verification and rollout boundaries
- Preserve these decisions:
  - Human title grammar and the 72-character limit remain unchanged.
  - Title acceptance, supported namespace acceptance, and manual family grouping never grant merge eligibility.
  - Only `runtime-patches`, `dev-patches`, and `actions-patches` remain auto-merge eligible, and only for patch metadata.
  - Trusted non-policy Dependabot PRs return `eligible=false`, `group=none`, and no writes after complete identity/provenance validation.
  - **Active App-token v3 supersession:** v2.2.2 is superseded for future branch-refresh executions. The refresh workflow uses only `actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0`, owner `therealhieu`, repository `md2vid`, `DEPENDABOT_REFRESH_APP_ID`, `DEPENDABOT_REFRESH_APP_PRIVATE_KEY`, and `contents: write`, `pull-requests: write`, and `metadata: read` inputs. Completed v2 history remains intact.
  - Default token revocation remains enabled (`skip-token-revoke` absent); the job and App-token step omit `NODE_USE_ENV_PROXY`, `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY`. The v3 pin proves token-creation policy and no-candidate runtime readiness only: Task 9's live App-rebase mutation canary remains abandoned and is not reauthorized.
  - Refresh selects only the oldest exact patch-group queue head, never skips a blocked head, validates the exact `Bot` / `github-actions` / `https://github.com/apps/github-actions` actor tuple, disables old auto-merge before `REBASE`, and never authorizes the new head.
  - Privileged workflows do not check out or execute PR-controlled code, install packages, restore caches, download artifacts, approve/review PRs, direct-merge, use admin bypass, use a PAT, or fall back to `github.token` for refresh writes.
  - Five strict required checks remain the final merge authority.
- Non-goals: do not make TypeScript 7 compatible, auto-merge minor/major updates, weaken release smoke or branch protection, add a merge queue/PAT/approval bot, close #49 automatically, or refactor unrelated systems.
- Operational risk: the canary may show that App-caused rebase changes commit provenance or fails to start normal workflows. If so, document the failure and stop; do not weaken the one-verified-Dependabot-commit, signature, workflow-approval, or exact auto-merge-actor guards.
- Remote workflow dispatches, pushes, and PR creation are outward-facing. Obtain explicit user authorization immediately before each such action unless the user has separately granted durable authorization.

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

## Tasks

- Execute `2026-08-04-dependabot-automerge-reliability-plan.md` and Parts 1–4 task-by-task in the exact order above.
- **Task 1 — Define generated-title and no-op contracts:** add failing title, namespace, no-op output, and provenance regression tests; run them to prove the current implementation fails; commit the test-only contract.
- **Task 2 — Implement exact generated titles and early no-op:** preserve human behavior, accept exact Dependabot generated title families, broaden only the generic supported namespace check, return before grouped metadata parsing for non-policy refs, run focused checks, and commit.
- **Task 3 — Define exact family-group contracts:** add failing order, membership, update-type, exclusion, and mutation tests; commit the test-only contract.
- **Task 4 — Add exact minor/major family groups:** add React, React types, and Remotion groups after patch groups, run workflow and dependency-version tests, and commit.
- **Task 5 — Define refresh structure and executable policy:** add failing inventory, App-token boundary, queue-head, provenance, actor, mutation-order, summary, and mutation-resistance tests; commit the test-only contract.
- **Task 6 — Create the repository-scoped refresh workflow:** implement the pinned token step, one-target inventory, full live validation, disable/revalidate/REBASE sequence, fixed summary, focused tests, and Actionlint; commit.
- **Task 7 — Regenerate snapshot and run the local gate:** prove snapshot staleness, regenerate it, run focused/full/release/diff checks, and commit the manifest.
- After each coherent group, run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel; resume the same implementer for accepted fixes; then run one read-only verifier. Do not begin the next group until verification passes.
- Mark plan checkboxes only from completed evidence. If implementation must deviate from the requirements, design, security values, sequence, or commit boundaries, stop and document the exact reason before continuing.
- Merge the implementation through the normal protected-branch PR process before remote canaries.
- **Task 8 — Run and record #47 canary:** verify App scope and credentials without exposing secrets, assert #47 preflight, obtain authorization, dispatch once, verify the new head, provenance, normal workflow triggering, fresh native auto-merge authorization, five checks, and final squash merge; record non-sensitive evidence.
- **Task 9 — Run and record #48 canary:** begin only after #47 is merged; repeat the full preflight and verification; record evidence; obtain authorization before push and evidence PR creation.
- If a canary fails, leave newer PRs untouched, record safe failure evidence, and stop rollout. #49 remains manual throughout.

## Success Criteria

- Tasks 1–9 and every required group review/remediation/verifier cycle are complete in order.
- Human PR-title behavior is unchanged; current/legacy grouped and generated individual Dependabot titles have exact positive and negative coverage.
- Supported trusted non-policy refs succeed with `eligible=false`, `group=none`, validated PR/head outputs, and no write steps; inconsistent or unsupported identity still fails closed.
- Existing patch groups remain first, patch-only, and the only privileged groups. Manual family groups have exact package membership and only `minor`/`major` update types.
- The refresh workflow is checkout-free, globally serialized, one-target-only, expected-head-bound, full-SHA pinned, repository-scoped, and has no fallback credential.
- Candidate selection requires one verified Dependabot commit, complete patch metadata, SQUASH auto-merge, and the exact GitHub Actions Bot tuple.
- Old auto-merge is disabled before GraphQL `REBASE`; the head is checked before and after disable; the refresh workflow never enables auto-merge for the rewritten head.
- Every terminal outcome emits exactly the fixed five-field, non-sensitive summary contract with an allowed reason code.
- `node --test test/ci/workflows.test.ts`, `node --test test/cli/dependency-versions.test.ts`, `corepack npm run public:snapshot:check`, `corepack npm run check`, `corepack npm run release:check`, and `git diff --check` succeed. Actionlint emits no diagnostics when available.
- #47 completes before #48. Each successful canary records old/new heads, one verified Dependabot commit, normal CI/observer triggering without approval, fresh SQUASH authorization by `github-actions`, five successful required checks, and final native squash merge.
- A failed canary produces safe evidence and stops rollout without weakening any guard.
- #49 remains manual and the Remotion release smoke test remains unchanged.
- The implementation matches the requirements, design, plan, and Git standard with no extra scope, placeholders, TODOs, or unfinished work.
- After implementation completes, create the post-implementation check file from concrete commits, changed files, test results, rollout evidence, deviations, and remaining risks.
