# PR 48 — Native Dependabot Recovery Evidence

## Ordered precondition and original PR

- #47 merged first as `97cfc9d422415a30f77f298658b84130648ff970` at `2026-08-05T03:28:23Z`.
- PR: [#48](https://github.com/therealhieu/md2vid/pull/48) — `chore(deps): bump the dev-patches group across 1 directory with 2 updates`.
- Branch: `dependabot/npm_and_yarn/dev-patches-7c5a0793cf`.
- Exact changed-file set: `package-lock.json` only.
- Pre-native-refresh head: `2ec3a55312d1476533f24698dec6ec7c5673968c`.
- The exact prior observer and CI runs on that head were [30889788992](https://github.com/therealhieu/md2vid/actions/runs/30889788992) and [30889789231](https://github.com/therealhieu/md2vid/actions/runs/30889789231), respectively.
- The pre-native head remains queryable as one verified `dependabot[bot]` commit: valid signature; parent `242fdc382f2e99da6c557eb1d8329f5295b31b5f`.
- Historical pre-native authorization tuple retained and verified: `SQUASH` / `Bot` `github-actions` / `https://github.com/apps/github-actions`.

## Native Dependabot refresh — no user mutation

At `2026-08-05T03:30:55Z`, the PR timeline records a Dependabot force push:

| Actor | Before | After |
|---|---|---|
| `dependabot` | `2ec3a55312d1476533f24698dec6ec7c5673968c` | `a90e2c9e4b8c3e0d53807bf19ee85d499a7e2341` |

Native Dependabot automatically rebased #48 onto #47’s merge without user action. No user comment, workflow dispatch, rerun, branch mutation, or manual merge was issued for #48. Therefore the planned v2 dispatch was not performed and no unsafe App-authored head was created.

**Deviation decision:** The planned explicit v2 dispatch was not performed because native Dependabot automatic refresh produced the safer signed Dependabot-owned final head. Its automatic sequence completed every planned success criterion: exact-head observer, CI, policy authorization, all five required checks, and native squash merge.

The v2 App-rebase mutation canary was formally abandoned in Task 9 and was not used for #48.

## Final pristine head and exact-head workflows

Final head: `a90e2c9e4b8c3e0d53807bf19ee85d499a7e2341`.

- Current PR commit set: exactly one `dependabot[bot]` commit with a valid signature.
- Commit author: `dependabot[bot]` (`49699333+dependabot[bot]@users.noreply.github.com`).
- Signature signer: `web-flow`.
- Commit committer identity: `GitHub <noreply@github.com>`; REST committer account: `web-flow`.
- Sole parent: #47’s merge commit `97cfc9d422415a30f77f298658b84130648ff970`.

| Exact-head assertion | Result |
|---|---|
| [Observer run 30972480027](https://github.com/therealhieu/md2vid/actions/runs/30972480027) | `success` on `a90e2c9e4b8c3e0d53807bf19ee85d499a7e2341`; no `action_required` or approval |
| [CI run 30972480069](https://github.com/therealhieu/md2vid/actions/runs/30972480069) | `success` on `a90e2c9e4b8c3e0d53807bf19ee85d499a7e2341`; no `action_required` or approval |

## Exact-head policy authorization

[Auto-merge policy run 30972492232](https://github.com/therealhieu/md2vid/actions/runs/30972492232) completed with `success`.

- Event binding: `EVENT_PR_NUMBER=48`; `EVENT_HEAD_SHA=a90e2c9e4b8c3e0d53807bf19ee85d499a7e2341`.
- The run record’s `workflow_run` head is #47’s merge `97cfc9d422415a30f77f298658b84130648ff970`; this is distinct from the event PR’s exact head above.
- Successful policy steps revalidated the live #48 head and requested native squash auto-merge with `--auto --squash --match-head-commit a90e2c9e4b8c3e0d53807bf19ee85d499a7e2341`.
- This fresh exact-head policy authorization is distinct from the older PR-level `enabledAt` authorization tuple retained above.

## Required checks

| Required check | Conclusion | URL |
|---|---|---|
| `pr-title` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30972480069/job/92199615581) |
| `dependency-review` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30972480069/job/92199615556) |
| `public-snapshot / validate` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30972480069/job/92199615698) |
| `pr-minimum / validate` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30972480069/job/92199615668) |
| `pr-latest / validate` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30972480069/job/92199641132) |

The successful dynamic `public-snapshot / validate` check proves that this dependency-only lockfile commit did not require a companion tracked-mirror update.

## Native merge and dependency result

- Native squash merge commit: `2f358bbb195d53b6ff4da80e14c66e167e2fe1d5`.
- Merge timestamp: `2026-08-05T03:36:56Z`.
- Merge timeline actor: `github-actions`.
- Final-head lockfile versions: `@types/react` `19.2.18`; `@types/react-dom` `19.2.4`.
- React type-family validation: **PASS** — the final exact head resolves `@types/react` `19.2.18` and `@types/react-dom` `19.2.4`, and exact-head CI succeeded.

## Final conclusions

| Assertion | Conclusion |
|---|---|
| #47 first | **PASS** — #47 merged at `2026-08-05T03:28:23Z`, before the #48 native refresh. |
| Pristine one-commit provenance | **PASS** — both asserted #48 heads are verified Dependabot commits; the final head is exactly one signed `dependabot[bot]` commit with #47’s merge as its sole parent. |
| Native refresh / no user action | **PASS** — Dependabot force-pushed the old head to the final head without a user action or App-authored mutation. |
| Exact-head observer and CI / no approval | **PASS** — observer and CI succeeded on the final SHA without `action_required` or approval. |
| Exact-head policy authorization | **PASS** — run 30972492232 bound PR 48 to the final SHA, revalidated it, and requested exact-SHA native squash auto-merge. |
| Required checks | **PASS** — exactly five required checks, all `SUCCESS`. |
| Native merge | **PASS** — GitHub Actions completed the native squash merge at the asserted timestamp. |
| Lockfile versions | **PASS** — final head resolves `@types/react` `19.2.18` and `@types/react-dom` `19.2.4`. |
| v2 App-rebase path | **PASS / FORMALLY NOT USED** — the Task 9 canary remains abandoned and did not mutate #48. |

## Evidence-branch disposition

This evidence branch remains local-only and unre-based until Task 20. Do not push or rebase it before the final audit.
