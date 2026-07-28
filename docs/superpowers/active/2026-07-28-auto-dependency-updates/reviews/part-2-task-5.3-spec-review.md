# Canonical Review Artifact

- Review scope: Part 2, Task 5.3
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `clean-head`
- Scope origin: `3bcbd6ae028209a9d255798b76a4228fb083dfdb`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7mdv4k5l7h340000gn/T//superpowers-scope.Q1H2Ji/task-scope.patch`
- Created: 2026-07-28
- Tester dispatched: yes

---

### SPEC-1 Must fix — Task 6 prerequisites still allow rollout before Task 5.3 is merged

**Evidence**

- `docs/superpowers/active/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan-2.md:803-806` requires only Tasks 1–5 and Task 5.2 on `main`.

Task 5.3 is now an active prerequisite for the real no-review canary because it fixes the live 404 caused by the unsupported workflow-run pull-requests subendpoint.

**Guidance**

Require Tasks 1–5, Task 5.2, and Task 5.3 on `main`. Ensure Step 8’s merged-configuration read-back confirms Task 5.3 content, not only file existence.

**Checklist**

- [ ] Add Task 5.3 to Task 6 prerequisites.
- [ ] Confirm merged workflow content includes Task 5.3.

### SPEC-2 Must fix — Task 6 still describes the unsupported associated-PR endpoint as a permission requirement

**Evidence**

- `2026-07-28-auto-dependency-updates-plan-2.md:790-794` says querying the observer run and associated pull requests also requires `actions: read`.
- Task 5.3 records the actual behavior: run GET succeeds with `actions: read`; run JSON contains `pull_requests`; separate `GET .../actions/runs/{id}/pull_requests` is unsupported and returns 404.

**Guidance**

Distinguish the two failures:

1. Missing `actions: read` caused the run GET to 404.
2. With `actions: read`, run GET succeeds; the separate `/pull_requests` subendpoint is unsupported and must not be used. Correlation must use the supported run-object `.pull_requests` field.

**Checklist**

- [ ] Remove/reword the stale associated-PR permission statement.
- [ ] State that Task 6 depends on run-object `.pull_requests` correlation.
- [ ] Keep `actions: read` for the workflow-run GET.

### SPEC-3 Nice-to-have — Task 6 step numbering skips Step 7

**Evidence**

Task 6 proceeds from Step 6 to Step 8 with no Step 7.

**Guidance**

Confirm no safety step was omitted, then make numbering continuous.

**Checklist**

- [ ] Confirm no remote verification step was omitted.
- [ ] Renumber Step 8 onward if this is only a numbering error.

### Consolidated checklist

- [ ] Task 6 prerequisites require Task 5.3 merged to `main`.
- [ ] Task 6 no longer implies the unsupported subendpoint should work.
- [ ] Task 6 identifies `GET /actions/runs/{id}` → `.pull_requests` as source of truth.
- [ ] Task 6 numbering is continuous.
- [ ] Before rollout, read merged workflow content and confirm Task 5.3 implementation.

### Verification performed

- `node --test test/ci/workflows.test.ts` — 55 passed.
- `npm test -- test/ci/workflows.test.ts` — broader configured suite, 846 passed.
- `git status --short` — clean.

### Verification gaps

- No remote API writes or live canary were performed.
- Supplied patch path was unreadable; reviewer reconstructed scope from base `3bcbd6a` to head `4a0f814`.

### Residual risk

Task 5.3 implementation aligns with run-object `.pull_requests`; remaining risk is procedural stale Task 6 text allowing rollout before the fix is merged or confusing diagnosis.
