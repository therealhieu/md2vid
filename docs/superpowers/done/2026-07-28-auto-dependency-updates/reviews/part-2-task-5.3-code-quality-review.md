# Canonical Review Artifact

- Review scope: Part 2, Task 5.3
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `clean-head`
- Scope origin: `3bcbd6ae028209a9d255798b76a4228fb083dfdb`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7mdv4k5l7h340000gn/T//superpowers-scope.Q1H2Ji/task-scope.patch`
- Created: 2026-07-28
- Tester dispatched: yes

---

### CQ-001 — Must fix — `jq` precedence makes every valid `pull_requests` run fail closed

**Severity:** Critical

**Problem**

- `.github/workflows/dependabot-auto-merge.yml:47`

```bash
PR_NUMBER=$(jq -er 'if .pull_requests | type == "array" and length == 1 and (.[0].number | type) == "number" then .[0].number else error("observer run must map to exactly one PR") end' "$RUN_FILE")
```

This expression does not index `run.pull_requests[0]`. Because of `jq` pipeline precedence, the condition changes the current input before `then .[0].number` runs. With valid input `{"pull_requests":[{"number":1}]}`, it fails with `Cannot index object with number`.

**Solution**

Bind the array once:

```bash
PR_NUMBER=$(jq -er '
  .pull_requests as $prs
  | if ($prs | type == "array") and ($prs | length == 1) and (($prs[0].number | type) == "number")
    then $prs[0].number
    else error("observer run must map to exactly one PR")
    end
' "$RUN_FILE")
```

Add a focused regression that executes the actual extraction against valid and invalid run JSON rather than only string-matching workflow text.

**Checklist**

- [ ] Valid `{"pull_requests":[{"number":123}]}` returns `123`.
- [ ] Missing, empty, multiple, non-array, zero/negative, and string numbers fail closed.
- [ ] Test executes the actual extraction expression/state fragment.
- [ ] Unsupported `/actions/runs/$RUN_ID/pull_requests` remains forbidden.

### Verification gaps

- `test/ci/workflows.test.ts` locks the exact broken string but does not execute extraction.
- Node policy fixtures use already-materialized JSON and do not cover the shell state step.
- Broader suite passed 846/846 despite runtime extraction failure.

### Consolidated checklist

- [ ] Replace line-47 expression with precedence-safe binding.
- [ ] Add positive and malformed-shape extraction coverage.
- [ ] Rerun focused workflow tests and state-fragment fixtures.
- [ ] Preserve unsupported endpoint rejection.

### Residual risk

After this fix, remaining design appears fail-closed: no unsupported subendpoint, live PR/commits requery, event/run/live bindings, no approval side effect, exact match-head merge. Remaining external risk is GitHub run-object schema drift.
