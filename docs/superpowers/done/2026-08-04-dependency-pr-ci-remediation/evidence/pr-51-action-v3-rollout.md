# PR 51 — App Token v3 Rollout Evidence

## Original Dependabot proposal

- Original PR: [#51](https://github.com/therealhieu/md2vid/pull/51)
- Branch and head: `dependabot/github_actions/actions/create-github-app-token-3.2.0` / `8b5890e70982bc109ac623ba833f6d653f24c43a`.
- Dependabot identity: PR author `app/dependabot`; the sole commit author is `dependabot[bot]` and its GitHub committer is `web-flow`.
- Provenance: exactly one commit, `8b5890e70982bc109ac623ba833f6d653f24c43a`; no maintainer commit and no commits were added.
- Final state: `CLOSED` and **UNMERGED**. `mergedAt` is `null`; `closedAt` is `2026-08-05T08:54:31Z`.
- Human closure rationale: [#issuecomment-5189702101](https://github.com/therealhieu/md2vid/pull/51#issuecomment-5189702101), posted by `therealhieu` at `2026-08-05T08:54:30Z`. Its reason links the merged replacement #59 and [no-candidate run 30990924960](https://github.com/therealhieu/md2vid/actions/runs/30990924960).

#51 changed a privileged workflow pin alone while coupled security-policy and mutation-sentinel assertions still approved v2.2.2; policy tests intentionally failed and the tracked public snapshot was stale. The direct bot pin proposal was replaced by a human-owned policy, security, and evidence rollout; #51 was not the merge vehicle.

## Human-owned replacement

- Replacement: [#59](https://github.com/therealhieu/md2vid/pull/59)
- Branch and final head: `ci/create-app-token-v3` / `6e010275a3356f9efb2b162619525626641c7707`.
- Final state: `MERGED` at `2026-08-05T08:52:56Z`.
- Merge commit: `acd129e719fadbac22a968ced9f5d2377e1aa657`.
- Official `actions/create-github-app-token` tag `v3.2.0` resolves to `bcd2ba49218906704ab6c1aa796996da409d3eb1`; GitHub reports that commit as verified.
- Deployed `main` pin: `actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0`.

### Required checks from final head

All five required checks concluded `SUCCESS` in final CI run `30990378502`:

| Required check | Conclusion | Exact job URL |
|---|---|---|
| `dependency-review` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30990378502/job/92254824768) |
| `pr-latest / validate` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30990378502/job/92254863514) |
| `pr-minimum / validate` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30990378502/job/92254824861) |
| `pr-title` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30990378502/job/92254824777) |
| `public-snapshot / validate` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30990378502/job/92254824845) |

## Guaranteed no-candidate runtime validation

During the first v3 workflow dispatch, inventory and exact patch-group selection returned zero candidates before any candidate-dependent mutation step; those steps were skipped. The run therefore had no mutation target.

- Dispatch: [run 30990924960](https://github.com/therealhieu/md2vid/actions/runs/30990924960)
- Run state: `completed` / `success`, `workflow_dispatch` on `main` at `acd129e719fadbac22a968ced9f5d2377e1aa657`.
- Fixed summary:

```text
### Dependabot branch refresh
- Outcome: no-candidates
- Reason: no-candidates
- PR: none
- Group: none
- Expected head: none
```

The `Create repository-scoped App token`, `Summarize branch refresh`, and `Post Create repository-scoped App token` steps each completed with `success`. The post step executed the default token-revocation lifecycle; no token material or raw logs are retained here.

This no-candidate run validates v3 token creation, execution of the default revocation post lifecycle, and the fixed summary only; it does not independently prove revocation succeeded. The Task 9 live App-rebase canary remains abandoned and was not reauthorized.

## Bounded residual and branch disposition

The runtime emitted the action's `app-id` deprecation warning. This rollout intentionally retains `app-id`; the separate `client-id` migration remains out of scope. This is a bounded residual, not a rollout failure.

This evidence branch is local-only, has no upstream or same-name remote branch, and remains unre-based until Task 20. Do not push or rebase it before the final audit.
