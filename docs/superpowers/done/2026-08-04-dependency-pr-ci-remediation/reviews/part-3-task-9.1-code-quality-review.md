# Canonical Review Artifact

- Review scope: Part 3, Task 9.1 deviation prerequisite
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id`
- Scope mode: `clean-head`
- Scope origin: `f6add45f954daf13d054948f0aaf8718e6ecb844`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T/superpowers-scope.repo-id.W2Sxtw/task-scope.patch`
- Created: 2026-08-05
- Tester dispatched: yes

---

## Scope

Reviewed `f6add45f954daf13d054948f0aaf8718e6ecb844..310dcbbabd4e7a0f8aa0c7a361291154cc744d52`.

| Area | Reviewed locations |
|---|---|
| Production policy validation | `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/.github/workflows/dependabot-branch-refresh.yml:207` |
| Production pre-mutation validation | `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/.github/workflows/dependabot-branch-refresh.yml:418` |
| Static positive assertion | `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/test/ci/workflows.test.ts:2200` |
| Executable GraphQL fixture | `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/test/ci/workflows.test.ts:2281` |

The range changes exactly those two files; no unrelated paths or uncommitted changes were present.

## Must fix

No CQ-* must-fix findings.

The live GitHub API identifies `therealhieu/md2vid` as:

```text
REST id: 1309960592
GraphQL node_id: R_kgDOThRpkA
```

Both production validation boundaries now use that value:

```text
policy validation → R_kgDOThRpkA
pre-mutation live check → R_kgDOThRpkA
```

## Nice to have

No CQ-* nice-to-have findings.

- The two production constants are deliberately duplicated because they execute in isolated Node heredocs; centralizing them is not practical without broadening this narrowly scoped workflow change.
- Mutation coverage is meaningful: the policy fixture validates the positive path, identity-field mutations fail closed, and the mutation harness validates the live repository identity before disabling auto-merge or rebasing. See `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/test/ci/workflows.test.ts:2779` and `:2906`.

## Consolidated checklist

- [x] **CQ-SCOPE-01** — Only the four intended stale-ID occurrences changed: two production checks, one exact source assertion, and one executable fixture.
- [x] **CQ-CORRECTNESS-01** — The replacement matches the live repository’s `node_id`, while the REST identity tuple remains unchanged.
- [x] **CQ-CONSISTENCY-01** — Both production GraphQL validation sites use the same current ID.
- [x] **CQ-TEST-01** — The positive fixture and static assertion use the same current ID; existing negative identity mutations still exercise fail-closed behavior.
- [x] **CQ-SECURITY-01** — The change preserves the repository-identity gates before privileged mutations; no permissions, token handling, query shape, or mutation sequencing changed.
- [x] **CQ-HYGIENE-01** — `git diff --check` produced no whitespace errors.
- [x] **CQ-VERIFY-01** — `actionlint -config-file .github/actionlint.yaml .github/workflows/dependabot-branch-refresh.yml` completed successfully.
- [x] **CQ-VERIFY-02** — `node --test test/ci/workflows.test.ts` completed with **81/81 passing**.

## Residual risks

- The GraphQL node ID is an external, opaque repository identity. A repository recreation or transfer that changes its node ID will intentionally fail closed until both production literals and the test fixture are refreshed.
- Historical planning text retains the former ID at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependabot-refresh-repo-id/docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-plan-3.md:160` and `:585`. It is outside this executable-only scope and has no runtime effect.
