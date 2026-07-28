# Canonical Review Artifact

- Review scope: Part 2, Task 5.2
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `clean-head`
- Scope origin: `950e8bdb78abedf1a38834e6fdbf1a084d089515`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.N7NNCz/task-scope.patch`
- Created: 2026-07-28
- Tester dispatched: yes

---

No TEST findings. I did not verify a defect in the scoped Task 5.2 changes.

## Scope

Reviewed read-only in:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-goal.md`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-design.md`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan.md`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan-2.md`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/public-snapshot.json`

No source edits, commits, pushes, remote writes, or delegation performed. Temporary-copy mutation probes only.

## Exact command results

| Command | Result |
|---|---|
| `node --test /Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts` | PASS — `55/55`, `fail 0`, `duration_ms 1408.578125` |
| `actionlint /Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml /Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge-observer.yml` | PASS — no output |
| `npm run check` | PASS — `846/846`, `fail 0` |
| `npm run public:snapshot:check` | EXPECTED LOCAL GAP — failed because this shell used unpinned npm `11.17.0`; repository expects `11.15.0` |
| `npm run release:check` | EXPECTED LOCAL GAP — full test phase passed `846/846`, then release pack failed because this shell used unpinned npm `11.17.0`; repository expects `11.15.0` |

Unpinned failure evidence:

```text
public snapshot check: npm version: expected 11.15.0, got 11.17.0
FAIL [pack]: npm version must be exactly 11.15.0, got 11.17.0
```

Mode A already reported the pinned `corepack npm` snapshot/release commands passing, so my unpinned failures do not contradict the Mode A GREEN state.

## Focused workflow evidence

The workflow test file passed all 55 policy tests, including:

- Dependabot patch groups are exact and weekly.
- Trusted policy constants equal repository metadata.
- Only exact grouped patch updates become eligible.
- Stale, rotated, unverified, wrong-repo, wrong-actor, multi-commit, and maintainer-change PR states fail closed.
- Observer rejects authority and execution broadening.
- Privileged workflow rejects broadened boundaries.
- No approval/review API side effect is allowed.
- Native merge request remains `--auto --squash --match-head-commit "$EXPECTED_HEAD_SHA"`.
- Top-level workflow permissions remain `{}`.
- Trusted job permissions remain exact:
  - `actions: read`
  - `contents: write`
  - `pull-requests: write`

## Mutation probe evidence

Temporary-copy mutation probes against `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml` were rejected by the existing contract tests.

| Probe | Evidence |
|---|---|
| Add approval step | Rejected by exact step-name sequence assertion |
| POST reviews API / `event=APPROVE` side effect | Rejected by `doesNotMatch` side-effect guard |
| Replace native auto-merge with immediate merge | Rejected by exact merge command assertion |
| Remove `--match-head-commit "$EXPECTED_HEAD_SHA"` | Rejected by exact merge command assertion |
| Broaden `actions: read` to `actions: write` | Rejected by exact permissions assertion |
| Add extra POST side-channel step | Rejected by exact step-name sequence assertion |

Representative rejected assertions included:

```text
actual: [ 'Fetch trusted observer and PR state', 'Validate Dependabot patch group policy', 'Approve eligible update', 'Revalidate live head', 'Request native squash auto-merge' ],
expected: [ 'Fetch trusted observer and PR state', 'Validate Dependabot patch group policy', 'Revalidate live head', 'Request native squash auto-merge' ]
```

```text
expected: /\|\|\s*true|set\s+\+e|gh\s+pr\s+review|event=APPROVE|reviews\//
```

```text
expected: '... gh pr merge "$PR_NUMBER" --repo "$REPOSITORY" --auto --squash --match-head-commit "$EXPECTED_HEAD_SHA"'
```

## Consolidated success/remediation checklist

- [x] No approval step remains in the trusted workflow.
- [x] No `gh pr review` remains in the trusted workflow.
- [x] No review API endpoint or `event=APPROVE` side effect remains.
- [x] No immediate `--merge` / non-auto merge path was accepted by tests.
- [x] Auto-merge request remains bound with `--match-head-commit "$EXPECTED_HEAD_SHA"`.
- [x] Live head is revalidated before requesting native auto-merge.
- [x] Trusted workflow stays checkout-free and does not execute PR-controlled repository files.
- [x] Observer remains unprivileged with `permissions: {}`.
- [x] Trusted workflow top-level permissions remain `{}`.
- [x] Trusted job permissions remain exact and do not broaden to `actions: write`.
- [x] Provenance/head-rotation negative cases remain covered and passing.
- [x] Docs record zero required approvals and post-merge Actions approval permission must be disabled.
- [x] Actionlint accepts the scoped Dependabot workflows.
- [x] Full local `npm run check` passes under the current shell.
- [ ] Re-run unpinned local snapshot/release checks under pinned npm `11.15.0`, or rely on Mode A’s already-recorded pinned `corepack npm` pass evidence.

## Verification gaps

- My direct `npm run public:snapshot:check` and `npm run release:check` attempts were not run through pinned `corepack npm`; they failed at the intended npm-version guard with local npm `11.17.0`.
- No remote repository settings were read or changed in this read-only tester pass.
- No live Dependabot canary was observed in this read-only tester pass.
- No GitHub API write path was exercised.

## Canonical residual risk

- The scoped local tests strongly cover workflow shape, trust boundary, permission exactness, no-review side-effect removal, native head-bound auto-merge, and preserved provenance/head-rotation negative cases.
- Residual risk is operational: unattended merging still depends on Task 6 remote settings matching the documented contract:
  - native auto-merge enabled;
  - required approvals `0`;
  - strict required checks configured;
  - Actions pull-request approval permission disabled after merge;
  - protected `main` settings preserved.
- The only local verification gap from this pass is environmental npm pinning; Mode A already reported the pinned `corepack npm` snapshot/release commands passing.
