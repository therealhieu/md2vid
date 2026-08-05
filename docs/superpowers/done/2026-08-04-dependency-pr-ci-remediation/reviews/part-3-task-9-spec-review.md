# Canonical Review Artifact

- Review scope: Part 3, Task 9
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependency-pr-ci-evidence`
- Scope mode: `clean-head`
- Scope origin: `05bb5b5273d87b0415414abb1d448980f051afd7`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.pr47-evidence.iiViRZ/task-scope.patch`
- Created: 2026-08-05
- Tester dispatched: yes

---

## Must fix

### SPEC-MF-001 — Record the evidence-branch lifecycle constraint

**Location:** `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependency-pr-ci-evidence/docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/pr-47-recovery.md` after line 111.

The evidence correctly documents the remote recovery, but it does not record the required local-only, unre-based evidence-branch disposition through Task 20.

**Why this is required**

- Task 20 explicitly owns the first rebase of the persistent evidence branch.
- The review branch is currently local-only: no matching remote branch exists.
- Commit `4aac147e3dfd006341a64b086bf7882208b74a27` is not an ancestor of current `origin/main`; this is the intended pre-Task-20 state.
- Without a durable statement, a later worker can misinterpret the divergence as accidental and push or rebase the evidence branch early.

**Required correction**

Add a concise, non-sensitive statement such as:

```md
## Evidence-branch disposition

This evidence branch remains local-only and unre-based until Task 20. Do not push or rebase it before the final audit.
```

No credentials, commands, logs, PR bodies, or API payloads are needed.

## Nice to have

None.

## Evidence checklist

| Check | Evidence | Status |
|---|---|---|
| Scope | Only `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/pr-47-recovery.md` changed from `05bb5b5` to `4aac147`; whitespace check is clean. | Met |
| Original head | `c42a83e…` is recorded with signed Dependabot provenance and the two changed dependency files. | Met |
| Recreated head | `78193f6…` is recorded; live GitHub data confirms one Dependabot-authored, signature-valid commit with parent `82a4044…`. | Met |
| Exact-head workflows | Observer run `30972007088` and CI run `30972007186` both completed successfully on `78193f6…`; neither was approval-gated. | Met |
| Fresh authorization | Live GraphQL state reports `SQUASH`, enabling type `Bot`, login `github-actions`, and the GitHub Actions App URL. | Met |
| Required checks | All five required contexts and their linked successful jobs are recorded. | Met |
| Native merge | Merge commit `97cfc9d…` and timestamp `2026-08-05T03:28:23Z` match GitHub. | Met |
| Dependency result | HyperFrames `0.7.88` and Remotion family `4.0.503` are recorded. | Met |
| Fail-closed sequence | The three refresh-run summaries and #55/#56 prerequisites are concise summaries, not raw logs or payloads. | Met |
| v2 canary abandonment | Remote facts confirm the unsigned App-committed head, skipped observer, and failed `pr-title`; the evidence formally rejects the path for #48. | Met |
| 0.7.88 deviation | The native Dependabot recreation and compatibility proof PR #57 are documented. | Met |
| Sensitive-content exclusion | No credentials, tokens, private-key material, raw PR body, raw log, arbitrary API payload, or placeholder was found. | Met |
| Evidence branch disposition | Local and unre-based state is observable, but not documented in this evidence file. | Missing |

## Guidance checklist

- [ ] Add `SPEC-MF-001`’s brief local-only/unre-based disposition.
- [ ] Preserve the single-file scope and force-add behavior for the ignored evidence file.
- [ ] Re-run `git diff --check` and re-query only the branch locality/rebase assertions affected by the addition.
- [ ] Do not push or rebase the evidence branch before Task 20.

## Success checklist

- [ ] Evidence explicitly says the branch remains local-only and unre-based until Task 20.
- [x] Original and recreated heads, provenance, CI/observer runs, authorization, checks, merge, and dependency versions are durably recorded.
- [x] The v2 mutation canary is documented as failed and abandoned.
- [x] The 0.7.88 compatibility deviation and PR #57 proof are documented.
- [x] Evidence remains allowlisted and free of sensitive/raw material.

## Consolidated checklist

```text
Task 9 evidence
├─ Scope and commit hygiene                           [x]
├─ Remote recovery/provenance/check evidence          [x]
├─ Fail-closed and compatibility-deviation evidence   [x]
├─ Sensitive-content restrictions                     [x]
└─ Local/unre-based-until-Task-20 disposition         [ ]
```

## Residual risks

- GitHub workflow and PR metadata are externally retained records; the immutable run IDs, commit SHAs, and job links reduce but do not eliminate later retention/access risk.
- Current branch protection and final evidence-branch ancestry remain intentionally deferred to Task 20’s final-audit re-query.
