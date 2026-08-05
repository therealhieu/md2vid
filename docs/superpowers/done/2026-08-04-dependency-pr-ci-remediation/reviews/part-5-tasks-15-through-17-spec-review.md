# Canonical Review Artifact

- Review scope: Part 5, Tasks 15-17
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/create-app-token-v3`
- Scope mode: `clean-head`
- Scope origin: `508b3fbd27d7bc770f501789febfb0bf61994eaf`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.app-token-v3.8JqiTu/task-scope.patch`
- Created: 2026-08-05
- Tester dispatched: yes

---

# SPEC Review — Part 5, Tasks 15–17

## Must fix

None identified by the reviewer.

## Nice to have

None.

## Evidence

- Test-first order: `2899cc4` tests only → `395f549` one workflow line → `82b5e04` authority/evidence.
- Official `v3.2.0` tag resolves directly to `bcd2ba49218906704ab6c1aa796996da409d3eb1`; verified commit.
- Production line exactly pins that SHA/comment.
- Exact App ID/secret/owner/repository/three permissions retained; skip revoke and proxy vars absent.
- No checkout/local action/install/project/cache/artifact/fallback credential path.
- Negative mutations cover pin/comment, revocation, proxy, scope/permission, credentials, checkout/setup/cache, and mutation order.
- Complete workflow production diff is one pin line; candidate/mutation behavior unchanged.
- Future authority supersedes v2 while preserving history.
- No #52/check/canary edits.
- Review-time: workflow tests 83/83, actionlint pass, public snapshot report 334 files/hash, diff check pass, clean.

## Guidance

Keep publication/runtime bounded to the v3 pin and no-candidate readiness. Do not treat local policy evidence as authorization to retry abandoned live App-rebase canary.

## Success checklist

- [x] Exact SHA/tag/signature.
- [x] RED precedes production change.
- [x] One workflow line.
- [x] Inputs/scope/permissions/revocation/proxy/execution boundaries.
- [x] Mutation logic unchanged and tests fail closed.
- [x] Authority docs preserve history.
- [x] No #52/canary edits.
- [x] Bounded no-candidate claim.

## Residual risks

- Direct public/full checks hit the unchanged narration timing threshold under load, while Mode A release nested full passed 1283/1283.
- No live App-authored rebase was run; the canary remains abandoned.
- Local checks cannot verify remote App installation configuration.
