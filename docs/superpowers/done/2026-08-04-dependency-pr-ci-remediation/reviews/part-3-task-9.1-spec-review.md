# Canonical Review Artifact

- Review scope: Part 3, Task 9.1 deviation prerequisite
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id`
- Scope mode: `clean-head`
- Scope origin: `f6add45f954daf13d054948f0aaf8718e6ecb844`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T/superpowers-scope.repo-id.W2Sxtw/task-scope.patch`
- Created: 2026-08-05
- Tester dispatched: yes

---

## Scope

Reviewed the deviation from `f6add45f954daf13d054948f0aaf8718e6ecb844` through:

- `76939a2 test(ci): define current repository identity`
- `310dcbb fix(ci): update refresh repository identity`

Changed scope is restricted to four identity substitutions in:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/.github/workflows/dependabot-branch-refresh.yml`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/test/ci/workflows.test.ts`

Reviewed against the approved requirements, design, and Task 9 recovery plan under:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/dependency-pr-ci-blockers/docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/`

## Must fix

No `SPEC-*` must-fix findings.

The exact GraphQL repository identity is updated at both security-relevant validation stages:

```text
Policy validation
  expected GraphQL repository ID R_kgDOThRpkA
  → validates root repository + PR base repository + PR head repository
  → validates provenance, metadata, auto-merge actor, and BEHIND state

Pre-mutation live revalidation
  expected GraphQL repository ID R_kgDOThRpkA
  → validates repository + exact PR node + expected head
  → disable old auto-merge
  → revalidate same repository and head
  → expected-head-bound REBASE
```

Evidence:

- Initial policy-stage identity and matching logic:
  `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/.github/workflows/dependabot-branch-refresh.yml:202-268,357-363`
- Pre-mutation live identity and exact-head revalidation:
  `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/.github/workflows/dependabot-branch-refresh.yml:418-422,499-528`
- First-stage positive identity assertion and fixture update:
  `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/test/ci/workflows.test.ts:2200-2206,2276-2285`
- Second-stage wrong-repository regression proves rejection before any mutation:
  `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/test/ci/workflows.test.ts:2944-2958`

No guard, pin, permission, scope, or ordering change is present. In particular, the diff does not alter:

- App-token pin, credentials, owner/repository scope, or explicit permission tuple.
- Checkout-free/no-PR-code-execution boundary.
- Queue-head ordering and malformed-inventory failure behavior.
- REST identity checks, provenance checks, patch-group metadata allowlists, or auto-merge actor tuple.
- `disablePullRequestAutoMerge → second live check → expectedHeadOid REBASE` ordering.
- Fail-closed outcomes or summary allowlists.

## Nice to have

No `SPEC-*` nice-to-have findings.

## Consolidated checklist

- [x] **SPEC-ID-001 — Both workflow validation stages use `R_kgDOThRpkA`.**
  **Evidence:** The policy-stage and mutation-stage constants are both updated; no stale `R_kgDOThQpsA` occurrence remains in the workflow or workflow-policy test.
  **Guidance:** Keep both constants synchronized for any future repository-identity migration.
  **Success checklist:** Both stage constants, test assertion, and GraphQL fixture name the same current repository ID.

- [x] **SPEC-GUARD-002 — Exact identity checks remain multi-field and fail closed.**
  **Evidence:** Initial policy retains REST ID/name/API URL checks and GraphQL ID/nameWithOwner/URL checks for root, base, and head. Live mutation revalidation retains GraphQL ID/nameWithOwner/URL, exact PR node ID, and exact head OID checks.
  **Guidance:** Do not reduce identity validation to repository name, URL, or PR node alone.
  **Success checklist:** A mismatched repository ID prevents mutation; the existing executable mutation test demonstrates this.

- [x] **SPEC-MUTATION-003 — Privileged mutation order and exact-head binding are unchanged.**
  **Evidence:** The workflow still validates live state before disabling auto-merge, revalidates it after disabling, and issues only `updatePullRequestBranch` with `REBASE` plus `expectedHeadOid`.
  **Guidance:** Preserve the second revalidation; it closes the mutation-window race after auto-merge is disabled.
  **Success checklist:** Tests continue to reject head changes, wrong repository identity, missing/incorrect disable responses, non-REBASE updates, and malformed rebase responses.

- [x] **SPEC-TEST-004 — The test-first commit updates executable fixtures and structural assertions without weakening mutation coverage.**
  **Evidence:** `76939a2` changes the positive policy assertion and GraphQL fixture before `310dcbb` changes production constants. Existing negative mutations and live identity-failure test remain in place.
  **Guidance:** Future identity changes should retain this test-first ordering and preserve negative identity mutations.
  **Success checklist:** `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/test/ci/workflows.test.ts` passes: 81 tests, 81 passed, 0 failed.

- [x] **SPEC-SCOPE-005 — Deviation scope is minimal.**
  **Evidence:** The complete diff contains only four old-to-new GraphQL repository-ID substitutions across the workflow and its test. `git diff --check` reported no whitespace errors.
  **Guidance:** Keep this deviation isolated; do not bundle action-version, permission, or refresh-policy changes.
  **Success checklist:** The patch remains limited to the two stated files and the repository ID replacement.

## Residual risks

- The exact GraphQL node ID is an external GitHub value. Per the supplied live-query root cause, `R_kgDOThRpkA` is current; if it changes again, both validation stages fail closed as intended until a similarly synchronized, reviewed update lands.
- This review independently ran the workflow-policy suite (`81/81` passing) and diff whitespace check. The reported actionlint, snapshot, full-suite, and release results were treated as supplied execution evidence rather than rerun in this read-only review.
