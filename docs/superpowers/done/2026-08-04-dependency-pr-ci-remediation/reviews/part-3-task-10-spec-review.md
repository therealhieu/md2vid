# Canonical Review Artifact

- Review scope: Part 3, Task 10
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependency-pr-ci-evidence`
- Scope mode: `clean-head`
- Scope origin: `61c765c4e5e18fb79978f3a765eb9f3417510698`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.pr48-evidence.P5JbJG/task-scope.patch`
- Created: 2026-08-05
- Tester dispatched: yes

---

## Must fix

### SPEC-MF-001 — Explicit native-automatic deviation rationale is incomplete

**Location:** `evidence/pr-48-recovery.md:22-24,75-81`

The evidence records that no v2 dispatch occurred and that no unsafe App-authored head was created, but it does not explicitly state the required deviation decision: native automatic Dependabot refresh was **safer** than the planned explicit v2 dispatch and had already completed the planned success criteria.

The facts are present but distributed across the document. Make the rationale explicit so Task 10 is not read as silently skipping Steps 2–3.

**Required correction:** Add a concise deviation statement tying together:

```text
planned explicit v2 dispatch → not performed
native Dependabot force-push → safer, signed Dependabot-owned head
automatic observer/CI/policy/required-check/native-merge sequence → completed criteria
```

**Independent evidence:** GitHub’s timeline records the `dependabot` force-push from `2ec3a…` to `a90e2…`; no PR comments exist; the only nearby user `workflow_dispatch` run, `30971739505`, selected PR #47, not #48. The final observer, CI, policy authorization, checks, and native merge all succeeded.

### SPEC-MF-002 — Required explicit React type-family validation conclusion is absent

**Location:** `evidence/pr-48-recovery.md:62-67,80`

Task 10 requires an explicit React type-family validation result. The evidence records exact lockfile versions, but does not state a validation conclusion for the `@types/react` / `@types/react-dom` pair.

**Required correction:** Add an explicit, bounded conclusion, for example:

```text
React type-family validation: PASS — the final exact head resolves
@types/react 19.2.18 and @types/react-dom 19.2.4, and its exact-head CI
completed successfully.
```

Do not claim a separate typecheck unless its exact run evidence is also recorded.

## Nice to have

None.

## Evidence checklist

- [x] Task-scope patch changes only the required evidence file; commit `9c5cd92` is clean and whitespace-valid.
- [x] #47 merged before #48’s native refresh: `97cfc9d…` at `2026-08-05T03:28:23Z` precedes the force-push at `2026-08-05T03:30:55Z`.
- [x] #48 branch, original head, final head, and sole changed file are recorded.
- [x] Prior head `2ec3a…` and final head `a90e2…` are validly signed, authored by `dependabot[bot]`, and have the recorded respective parents.
- [x] Final head has exactly one PR commit and sole parent `97cfc9d…`.
- [x] Timeline confirms native Dependabot force-push; merge actor was `github-actions`.
- [x] PR issue comments and review comments are empty; no #48-targeting manual dispatch was found.
- [x] v2 canary abandonment agrees with the Task 9 evidence.
- [x] Exact-head observer `30972480027` and CI `30972480069` succeeded on `a90e2…`.
- [x] Policy run `30972492232` succeeded; its log binds `EVENT_PR_NUMBER=48`, `EVENT_HEAD_SHA=a90e2…`, and executes `--auto --squash --match-head-commit`.
- [x] Historical authorization tuple is exact: `SQUASH` / `Bot github-actions` / `https://github.com/apps/github-actions`.
- [x] All five required checks and job links are present and successful.
- [x] Native squash merge `2f358bb…` and timestamp match GitHub.
- [x] Final-head lockfile resolves `@types/react` `19.2.18` and `@types/react-dom` `19.2.4`.
- [x] Evidence branch has no upstream tracking branch, remains local-only, and `61c765c…` is an ancestor of the evidence commit.
- [x] No credential, token, private-key, or raw API/log payload was found.

## Guidance checklist

- [ ] Add one explicit deviation decision and safety/completion rationale. `SPEC-MF-001`
- [ ] Add an explicit React type-family validation conclusion. `SPEC-MF-002`
- [x] Preserve exact SHAs, links, and actor identities.
- [x] Keep evidence allowlisted and local-only/unrebased until Task 20.

## Success checklist

- [x] #47-first ordering
- [x] Exact PR #48 branch/file/old-head identity
- [x] Prior and final Dependabot provenance
- [x] No user comment, dispatch, rerun, manual branch mutation, or manual merge for #48
- [x] Abandoned v2 App-rebase canary
- [x] Exact-head observer and CI success without approval
- [x] Exact-head authorization using `--match-head-commit`
- [x] Historical `SQUASH` / GitHub Actions authorization tuple
- [x] Five successful required checks with links
- [x] Native merge and exact lockfile versions
- [ ] Explicit safer-native-automatic deviation justification. `SPEC-MF-001`
- [ ] Explicit React type-family validation. `SPEC-MF-002`
- [x] Local-only/unrebased disposition and no sensitive/raw evidence

## Consolidated checklist

```text
Task 10 / PR #48 recovery evidence
├─ Scope and commit hygiene                              [x]
├─ #47 ordering and PR identity                          [x]
├─ Native Dependabot provenance                          [x]
├─ No-manual-action and v2-canary controls               [x]
├─ Exact-head CI / observer / policy authorization       [x]
├─ Required checks, native merge, lockfile evidence      [x]
├─ Explicit native-automatic deviation rationale         [ ]
├─ Explicit React type-family validation                 [ ]
└─ Evidence-branch and sensitive-data controls           [x]
```

## Residual risks

- The no-user-action conclusion is strong GitHub audit evidence—empty comments, bot-only relevant timeline actors, and no #48 dispatch—but it remains an absence-based conclusion limited to observable GitHub records.
- Post-merge `autoMergeRequest` metadata is historical state; the fresh authorization proof should continue to rely on policy run `30972492232` and its exact-head command log.
