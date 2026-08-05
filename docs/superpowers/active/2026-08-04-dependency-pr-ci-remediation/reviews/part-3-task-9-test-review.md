# Canonical Review Artifact

- Review scope: Part 3, Task 9
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependency-pr-ci-evidence`
- Scope mode: `clean-head`
- Scope origin: `05bb5b5273d87b0415414abb1d448980f051afd7`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.pr47-evidence.iiViRZ/task-scope.patch`
- Created: 2026-08-05
- Tester dispatched: yes

---

## Tester Report — Part 3, Task 9 PR #47 recovery evidence

### Must fix

None.

### Nice to have

None.

### Exact commands and results

| Command | Result |
|---|---|
| PR #47 REST query | Closed/merged; `commits: 1`; recreated head `78193f6…`; base `82a4044…`; squash merge `97cfc9d…`; merged at `2026-08-05T03:28:23Z`. |
| Commit queries for `c42a…`, `6baa…`, `78193…`, `97cfc…` | Original and recreated commits: author `dependabot[bot]`, valid PGP verification, parents `242fdc…` and `82a404…`; App-rebased `6baa…`: `md2vid-dependabot-refresh[bot]` committer and unsigned; final native squash merge validly signed. |
| GraphQL `Commit.signature` | Original and recreated heads are valid `GpgSignature`s signed by `web-flow`; authors are `dependabot[bot]`. |
| Runs `30964637649`, `30968545288`, `30971739505` | Trusted summaries exactly match `blocked / queue-head-invalid`, `failed / head-changed`, and `selected / selected-for-rebase`, all for #47 / `runtime-patches` / expected `c42a83e…`. |
| Runs `30971754622`, `30971754475` | App-rebased head is `6baa…`; observer skipped; `pr-title` failed; CI cancelled. |
| PR timeline | Auto-merge disabled at `2026-08-05T03:15:46Z` by `md2vid-dependabot-refresh[bot]`; fresh request was `SQUASH`, enabled at `03:21:32Z`, `github-actions` Bot/App. |
| Comment `5187141634` | Native recovery command was exactly `@dependabot recreate`. |
| Runs `30972007088`, `30972007186` | Observer and CI both succeeded on exact recreated head; no workflow-approval/action-required state observed. |
| Exact-head check runs | Five documented required checks succeeded with documented job URLs. |
| `package-lock.json?ref=78193…` | HyperFrames `0.7.88`; Remotion family each `4.0.503`. |
| PRs #55, #56, #57 | Merge commits exactly `4490412…`, `82a4044…`, and `c6fbd6b…`. |
| Git scope/diff/status | Only the evidence file added; patch matches; whitespace clean; worktree clean at `4aac147…`. |
| Forbidden-content scans | No credentials, tokens, secrets, or key material found. |

### Mutation disclosure

None. All commands were read-only API, Git inspection, log retrieval, or content scans. No repository files, Git refs, GitHub state, or workflow state were changed.

### Consolidated checklist

| Requirement | Result |
|---|---|
| Original/final commit count, authors, signatures, parents | Verified |
| Trusted refresh summaries | Verified |
| #55 / #56 prerequisite and #57 compatibility merge commits | Verified |
| App-rebased unsigned provenance, skipped observer, failed title | Verified |
| Auto-merge disabled by App bot | Verified |
| Native recreation comment and recreated-head provenance | Verified |
| Exact-head observer/CI without approval blockage | Verified |
| Exact fresh auto-merge tuple | Verified |
| Five required checks, links, and successes | Verified |
| Native merge SHA and timestamp | Verified |
| Recreated-head dependency versions | Verified |
| No forbidden evidence content | Verified |
| Scope, patch identity, whitespace, clean status | Verified |

### Residual risks

- GitHub Actions logs and API state remain externally retained state; future retention/deletion could make the linked live evidence unavailable.
- The evidence documents historical workflow outcomes accurately, but a later policy or branch-protection change could alter equivalent future recovery behavior.
