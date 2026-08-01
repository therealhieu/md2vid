# Canonical Review Artifact

- Review scope: Part 2, Task 5.1
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `clean-head`
- Scope origin: `7e58bda385b80cffbc99260f8c89067b37ba61eb`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.pJ1msq/task-scope.patch`
- Created: 2026-07-28
- Tester dispatched: yes

---

## TEST-MUST-FIX

None found.

## TEST-NICE-TO-HAVE

None found.

## TEST-EVIDENCE

Reviewed scope:

```text
7e58bda385b80cffbc99260f8c89067b37ba61eb
  → 5b69a35870bedb9bf25808af949d86dd5e35eb46
```

The trusted job now grants exactly the required permissions:

```yaml
# /Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml:25
permissions:
  actions: read
  contents: write
  pull-requests: write
```

The regression contract requires the exact same object:

```ts
// /Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:324
assert.deepEqual(job.permissions, {
  actions: "read",
  contents: "write",
  "pull-requests": "write",
});
```

This exact-object assertion rejects missing permissions, changed access levels, extra permission scopes, and scalar broadening such as `write-all`.

The scoped workflow diff adds only `actions: read`. Existing top-level permissions, observer permissions, trust-origin checks, observer/run/PR/commit binding, eligibility policy, head-SHA rechecks, approval binding, and native auto-merge command are unchanged.

## TEST-COMMAND-RESULTS

| Command | Exact result |
|---|---|
| `node --test test/ci/workflows.test.ts` | Exit `0`; **55 tests, 55 pass, 0 fail** |
| `actionlint .github/workflows/*.yml` | Exit `0`; no diagnostics |
| `npm run public:snapshot:test` | Exit `0`; **42 tests, 42 pass, 0 fail** |
| `npm run public:snapshot:check` | Exit `1`; environment preflight correctly rejected local npm `11.17.0`, expected `11.15.0` |
| `corepack npm --version` | `11.15.0` |
| `corepack npm run public:snapshot:check` | Exit `0`; snapshot check passed; nested checks each reported **846/846**; pack, install, CLI, skill, HyperFrames smoke, and Remotion smoke passed |
| `git diff --check 7e58bda385b80cffbc99260f8c89067b37ba61eb..HEAD` | Exit `0`; no whitespace errors |
| `git status --short` | Exit `0`; no output, clean worktree |

The unpinned snapshot-check failure is not a source defect: the repository deliberately requires npm `11.15.0`, and the pinned invocation passed.

## TEST-TDD-RED-CHECK

Temporary archive of commit `2348aea` with the new test but without the workflow fix:

```text
tests 55
pass 54
fail 1
exit 1
```

Failure evidence:

```text
actual:   { contents: 'write', 'pull-requests': 'write' }
expected: { actions: 'read', contents: 'write', 'pull-requests': 'write' }
operator: 'deepStrictEqual'
```

The failure was anchored at:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:324`
- Policy-inventory invocation at line `714`

## TEST-MUTATION-PROBES

Each probe ran against a temporary `git archive` copy; the reviewed worktree was not modified.

| Temporary mutation | Result |
|---|---|
| Remove `actions: read` | Exit `1`; 1 failing test |
| Change to `actions: write` | Exit `1`; 1 failing test |
| Change to `actions: none` | Exit `1`; 1 failing test |

All three failed through `workflow policy inventory covers and checks every active workflow file`, which invokes the exact trusted-workflow policy checker. This independently confirms detection of removal, broadening, and other access-level changes.

## TEST-SUCCESS-CHECKLIST

- [x] Trusted job has `actions: read`.
- [x] Trusted permissions remain exactly `actions:read`, `contents:write`, `pull-requests:write`.
- [x] Top-level trusted workflow permissions remain `{}`.
- [x] Observer top-level and job permissions remain `{}`.
- [x] Permission removal fails the test suite.
- [x] `actions: write` broadening fails the test suite.
- [x] Other changes to the Actions permission fail the test suite.
- [x] Workflow policy tests pass 55/55.
- [x] Actionlint passes.
- [x] Public snapshot is synchronized.
- [x] Full snapshot/check/release validation passes with pinned npm.
- [x] Scoped and working-tree diff checks are clean.
- [x] No source files, remote settings, commits, or remotes were changed during this review.
- [ ] Remediation is merged into the branch used by GitHub Actions.
- [ ] A real grouped Dependabot canary reruns the trusted workflow.
- [ ] The trusted run successfully fetches both observer-run endpoints.
- [ ] Canary evidence confirms approval and native squash auto-merge remain properly gated.

## TEST-GUIDANCE-CHECKLIST

For subsequent changes:

- [ ] Preserve the exact `deepEqual` permission assertion; do not replace it with presence-only checks.
- [ ] Keep `actions` at `read`; neither `write` nor `write-all` is required by the observed GET calls.
- [ ] Keep top-level and observer permissions empty.
- [ ] Rerun the mutation probes after any workflow-policy helper refactor.
- [ ] Use pinned npm `11.15.0` for snapshot and release verification.
- [ ] Use a real Dependabot PR for live eligibility evidence; an ordinary PR cannot prove the trusted-token behavior.

## TEST-CONSOLIDATED-REMEDIATION-CHECKLIST

```text
Local remediation
  [x] Add exact actions: read grant
  [x] Add exact permission regression contract
  [x] Refresh public snapshot
  [x] Prove TDD RED 54/55
  [x] Prove GREEN 55/55
  [x] Prove removal/write/none mutations fail
  [x] Pass actionlint and full pinned validation

Live completion
  [ ] Merge remediation
  [ ] Trigger/rerun a real grouped Dependabot canary
  [ ] Confirm GET /actions/runs/{observer-run-id} succeeds
  [ ] Confirm GET /actions/runs/{observer-run-id}/pull_requests succeeds
  [ ] Record trusted policy validation evidence
  [ ] Record approval and native auto-merge evidence
  [ ] Confirm required checks and branch protection still gate merging
```

## TEST-VERIFICATION-GAPS

Local tests cannot prove GitHub’s runtime token authorization or repository policy state. Only a merged workflow and real canary can establish:

1. GitHub issues the trusted `GITHUB_TOKEN` with effective `actions:read`.
2. Observer run `30341879923` or a replacement canary is visible through both Actions API endpoints instead of returning the prior permission-shaped HTTP 404.
3. `workflow_run.pull_requests` and live API responses match for a real grouped Dependabot PR.
4. Repository Actions defaults, required checks, review policy, branch protection, and native auto-merge settings still match the approved remote configuration.
5. Approval and auto-merge side effects execute only after all fail-closed provenance and head-binding checks pass.

## TEST-RESIDUAL-RISK

**Canonical residual risk: live-integration risk remains until the remediation is merged and a real grouped Dependabot canary completes.**

The local evidence strongly covers configuration shape and regression resistance, but GitHub’s effective token permissions and the original HTTP 404 remediation are observable only in a real `workflow_run`. No local simulation can close that gap.
