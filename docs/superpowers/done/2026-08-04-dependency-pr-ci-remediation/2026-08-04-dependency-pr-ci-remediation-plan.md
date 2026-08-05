# Dependency PR CI Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dependency-PR snapshot contradiction, add exact HyperFrames 0.7.87 compatibility, recover #47/#48 without maintainer commits, replace TypeScript 7 with a validated TypeScript 6 successor, and replace the privileged App-token action through a human-reviewed v3 rollout.

**Architecture:** Execute six ordered remediation units in separate branches or operational worktrees. Repository-owned prerequisites land on `main` before pristine Dependabot branches are refreshed; incompatible or policy-coupled major updates use human replacement PRs; every privileged GitHub mutation remains authorization-gated, exact-head-bound, and evidence-backed.

**Tech Stack:** TypeScript, Node.js test runner, npm 11.15.0, Git committed-tree inspection, GitHub Actions, GitHub CLI, REST and GraphQL APIs, `jq`, HyperFrames Studio patching, Remotion generated-project release smoke, Superpowers review and verification lifecycle.

---

## Source Artifacts

- Requirements: `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/2026-08-04-dependency-pr-ci-remediation-requirements.md`
- Design: `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/2026-08-04-dependency-pr-ci-remediation-design.md`
- Inherited requirements: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-requirements.md`
- Inherited design: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-design.md`
- Git standard: `docs/standards/git.md`
- Part 1: `2026-08-04-dependency-pr-ci-remediation-plan-1.md`
- Part 2: `2026-08-04-dependency-pr-ci-remediation-plan-2.md`
- Part 3: `2026-08-04-dependency-pr-ci-remediation-plan-3.md`
- Part 4: `2026-08-04-dependency-pr-ci-remediation-plan-4.md`
- Part 5: `2026-08-04-dependency-pr-ci-remediation-plan-5.md`
- Part 6: `2026-08-04-dependency-pr-ci-remediation-plan-6.md`
- Goal: `2026-08-04-dependency-pr-ci-remediation-goal.md`

Do not create `2026-08-04-dependency-pr-ci-remediation-check.md` during planning or implementation. Part 6 creates it only after Units A–F, their verification, and their remote dispositions complete.

## Parts and Dependencies

1. **Part 1 — Unit A: Dynamic public snapshot authority**
   - Task 1 defines failing dynamic-authority and report-integrity contracts.
   - Task 2 removes the repository-root mirror and implements committed-tree validation.
   - Task 3 supersedes active tracked-mirror instructions and verifies Unit A.
   - Task 4 publishes and lands Unit A.
2. **Part 2 — Unit B: HyperFrames 0.7.87 compatibility**
   - Task 5 defines failing `rr/p/v` patch and self-healing contracts.
   - Task 6 adds the exact production variant.
   - Task 7 verifies the published package and records evidence.
   - Task 8 publishes and lands Unit B after Unit A merges.
3. **Part 3 — Units C/D: Ordered #47/#48 recovery**
   - Task 9 refreshes, validates, and records #47.
   - Task 10 begins only after #47 merges, then refreshes, validates, and records #48.
4. **Part 4 — Unit E: TypeScript 6 successor**
   - Task 11 creates and verifies the TypeScript 6.0.3 update.
   - Task 12 records complete generated-project compatibility evidence.
   - Task 13 publishes and lands the human successor.
   - Task 14 closes #49 only after the successor merges and records the disposition.
5. **Part 5 — Unit F: App-token action v3 replacement**
   - Task 15 defines failing exact-v3, revocation, proxy, and mutation contracts.
   - Task 16 updates only the immutable workflow pin.
   - Task 17 supersedes v2 authority and runs the local security gate.
   - Task 18 publishes and lands the human replacement after #47/#48 resolve.
   - Task 19 runs a guaranteed no-candidate v3 dispatch, then closes #51 and records evidence.
6. **Part 6 — Final audit and check lifecycle**
   - Task 20 rebases all evidence onto final `main`, verifies every disposition and branch-protection invariant, creates the post-implementation check, and moves the package to `done`.
   - Task 21 publishes and lands the final audit package, then performs read-only post-merge confirmation.

Implementation and rollout order is strict:

```text
Plan artifacts approved and committed
  → Task 1 → Task 2 → Task 3 → Task 4 → Unit A merged
  → Task 5 → Task 6 → Task 7 → Task 8 → Unit B merged
  → Task 9 → #47 merged
  → Task 10 → #48 merged
  → Task 11 → Task 12 → Task 13 → TypeScript 6 merged
  → Task 14 → #49 closed
  → Task 15 → Task 16 → Task 17 → Task 18 → Action v3 merged
  → Task 19 → no-candidate dispatch passed → #51 closed
  → Task 20 → Task 21
```

No implementation writer, branch mutation, or remote rollout unit runs concurrently.

## Worktree Map

Use the primary checkout at `/Users/hieunguyen/git/hieu/projects/md2vid-public`. Before each creation, run `git check-ignore -q .worktrees`. Keep branch slashes unchanged and flatten only the path.

| Unit | Branch | Flat worktree |
|---|---|---|
| A | `fix/dynamic-public-snapshot` | `.worktrees/dynamic-public-snapshot` |
| B | `fix/hyperframes-0-7-87` | `.worktrees/hyperframes-0-7-87` |
| C/D and dispositions | `docs/dependency-pr-ci-evidence` | `.worktrees/dependency-pr-ci-evidence` |
| E | `build/typescript-6` | `.worktrees/typescript-6` |
| F | `ci/create-app-token-v3` | `.worktrees/create-app-token-v3` |

Create every implementation worktree from the latest `origin/main` only after its prerequisite unit merges. Do not stack Unit B, E, or F on an unmerged predecessor branch.

## File Responsibility Map

| File / area | Responsibility |
|---|---|
| `scripts/public_snapshot.ts` | Generate, self-validate, materialize, and verify the committed public report and generated internal manifest. |
| `scripts/check_public_snapshot.ts` | Build an authentic isolated repository from the selected commit and run package/release validation. |
| `test/ci/public-snapshot*.test.ts` | Prove committed-tree authority, report integrity, materialization safety, and checkout authenticity. |
| `test/cli/package-meta.test.ts` | Verify public/package payload exclusions against the dynamic report. |
| `frameworks/hyperframes/patches.ts` | Recognize and patch exact reviewed Studio bundle layouts. |
| `frameworks/hyperframes/__tests__/patch-studio.test.ts` | Prove exact marker counts, idempotence, and ambiguity failure. |
| `test/cli/hyperframes-self-heal.test.ts` | Prove the CLI installation proxy repairs reviewed layouts before execution. |
| `package.json` / `package-lock.json` | Own the controlled TypeScript 6 dependency update. |
| `.github/workflows/dependabot-branch-refresh.yml` | Own the exact full-SHA App-token action and unchanged privileged refresh boundary. |
| `test/ci/workflows.test.ts` | Own exact action-pin, scope, permission, revocation, proxy, structure, and mutation contracts. |
| `evidence/*.md` | Store allowlisted, non-sensitive rollout evidence; these paths are ignored and require `git add -f`. |
| `2026-08-04-dependency-pr-ci-remediation-check.md` | Post-implementation verification created only in Task 20. |

## Coherent Groups and Review Lifecycle

- Tasks 1–3: `[Group: dynamic-snapshot]`
- Tasks 5–7: `[Group: hyperframes-0-7-87]`
- Tasks 11–12: `[Group: typescript-6-successor]`
- Tasks 15–17: `[Group: app-token-v3]`
- Tasks 4, 8–10, 13–14, 18–21 are standalone publication, rollout, closure, or audit boundaries.

Immediately before each grouped Mode A dispatch, revalidate that the group still shares the planned files and verification boundary. After Mode A:

1. Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel.
2. For `[Group: app-token-v3]`, add a read-only security review in the same pass.
3. Wait for all reviews.
4. Resume the same implementer for accepted Mode B remediation.
5. Commit every accepted remediation that changes files as a focused Conventional Commit after the affected planned task commit. Do not amend or rewrite the planned task commits.
6. Re-run the group’s focused and full commands.
7. Require one nested read-only verifier over the supplied checklist.
8. Do not start the next group or publish the branch until the verifier passes.

Publication gates require the planned task subjects to occur in order. Additional commits are permitted only when they are focused post-review remediation commits, occur after the affected planned subject, and preserve the group’s approved scope.

If implementation reveals a hidden group boundary, preserve completed task commits, finish their review lifecycle, then split the untouched remainder without reordering it.

## Required Conventional Commits

```text
test(snapshot): define dynamic public authority
fix(snapshot): validate committed public source dynamically
docs(snapshot): supersede tracked mirror instructions

test(hyperframes): define 0.7.87 Studio anchors
fix(hyperframes): support Studio 0.7.87
docs(hyperframes): record 0.7.87 package verification

docs(deps): record PR 47 recovery
docs(deps): record PR 48 recovery

build(deps): upgrade TypeScript to 6.0.3
docs(deps): record TypeScript 6 verification
docs(deps): record PR 49 disposition

test(ci): define App token v3 policy
ci(deps): upgrade App token action to v3
docs(ci): supersede App token v2 authority
docs(ci): record App token v3 rollout

docs(superpowers): archive dependency PR CI remediation
```

Use repository-configured identity. Do not pass `--author`, override identity variables, amend authorship, or push directly to `main`.

## Fixed Values

```text
Repository: therealhieu/md2vid
Base branch: main
Pinned npm: 11.15.0
TypeScript successor: 6.0.3
TypeScript npm integrity:
  sha512-y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw==
HyperFrames target: 0.7.87
Remotion family in #47: 4.0.503
App-token v2 retained through #47/#48:
  fee1f7d63c2ff003460e3d139729b119787bc349 # v2.2.2
App-token v3 replacement:
  bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0
App variable: DEPENDABOT_REFRESH_APP_ID
App secret: DEPENDABOT_REFRESH_APP_PRIVATE_KEY
App scope: therealhieu/md2vid only
App permissions: contents write, pull requests write, metadata read
Required checks:
  pr-title
  dependency-review
  public-snapshot / validate
  pr-minimum / validate
  pr-latest / validate
```

Planning-time PR heads are evidence only and must be re-queried before action:

```text
#47: c42a83ee61f93ed06ff757a9795a0a318920c99c
#48: 2ec3a55312d1476533f24698dec6ec7c5673968c
#49: 8e03241564c760d0d97397f7d423e1e67877d47f
#51: 28146f789fe9b70e098f2bbf78fa0f25d8b5265a
```

## Authorization Gates

Read-only `gh pr view`, `gh api GET`, `gh run list/view/watch`, and check polling do not mutate remote state. Stop and obtain explicit user authorization immediately before each of these:

- `git push`;
- `gh pr create`;
- `gh pr merge`, including native auto-merge requests;
- `gh workflow run`;
- rerunning a remote workflow or check;
- posting a PR comment;
- `gh pr close`;
- changing repository variables, secrets, App installation scope/permissions, required checks, or branch protection.

One authorization may cover adjacent outward actions only when the executor names all of them before asking. Authorization for one unit does not carry into a later unit.

## Execution Rules

- Follow TDD for repository changes: write the listed failing test, run it and observe the expected failure, implement the minimal change, run the targeted green check, then commit.
- Public-snapshot integration checks read committed `HEAD`; run them only after the implementation commit exists or use an explicit committed fixture.
- Never add a maintainer commit to #47 or #48.
- Never refresh or merge #49. Close it only after the human TypeScript 6 successor merges.
- Never add commits to #51. Close it only after the human v3 replacement merges and the guaranteed no-candidate dispatch passes.
- Keep App-token v2 deployed until #47/#48 resolve or their canary is formally abandoned.
- Do not edit the open PR #52 check or existing canary-evidence files.
- Evidence files contain only allowlisted fields. Never record credentials, token values, private keys, raw PR bodies, raw workflow logs, or arbitrary API responses.
- Evidence directories are ignored by `.gitignore`; use `git add -f` for each intended evidence file.
- If a bot refresh changes provenance, creates multiple commits, requires workflow approval, loses exact-head auto-merge authorization, or reveals a new compatibility failure, stop rather than weakening policy.

## Final Verification

Run from the final evidence worktree after rebasing onto final `origin/main`:

```bash
corepack npm ci
node --test test/ci/public-snapshot-check.test.ts
node --test frameworks/hyperframes/__tests__/patch-studio.test.ts
node --test test/cli/hyperframes-self-heal.test.ts
node --test test/cli/dependency-versions.test.ts
node --test test/ci/workflows.test.ts
corepack npm run public:snapshot
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected:

- every command exits `0`;
- `public:snapshot` does not change `git status`;
- repository-root `public-snapshot.json` does not exist;
- generated snapshots still contain and verify their internal manifest;
- no required security, package, or release boundary is skipped.

## Completion Criteria

- Unit A removes the repository-root mirror and preserves dynamic committed-tree scanning, report integrity, materialization integrity, isolated repository construction, package validation, and release smoke.
- Unit B supports only the reviewed `rr/p/v` layout for 0.7.87 in addition to existing variants and remains fail-closed.
- #47 and #48 retain one verified Dependabot commit, pass the five required checks, and native squash-merge in order.
- TypeScript 6.0.3 remains the root/generated-scaffold authority and passes the full generated Remotion bundle/render path.
- #49 closes unmerged with a link to the merged human successor.
- The v3 replacement preserves exact scope, explicit permissions, checkout-free execution, no proxy environment, and default token revocation.
- The first v3 dispatch has zero exact patch-group candidates, emits the exact `no-candidates` summary, and completes the action post-step.
- #51 closes unmerged with a link to the replacement and dispatch evidence.
- Branch protection remains strict with exactly the five required contexts.
- The final check contains concrete commits, tests, remote evidence, deviations, and risks.
- The completed package moves from `active` to `done` only after Task 20 verification.
