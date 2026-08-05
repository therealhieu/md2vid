# PR 47 — Native Dependabot Recovery Evidence

## Original pristine dependency PR

- PR: [#47](https://github.com/therealhieu/md2vid/pull/47)
- Original verified head: `c42a83ee61f93ed06ff757a9795a0a318920c99c`
- Original commit: exactly one `dependabot[bot]` commit; signature valid.
- Original changed files: `package.json`, `package-lock.json`.

## Fail-closed refresh sequence

### Initial queue-head rejection

[Run 30964637649](https://github.com/therealhieu/md2vid/actions/runs/30964637649) trusted summary:

```text
### Dependabot branch refresh
- Outcome: blocked
- Reason: queue-head-invalid
- PR: #47
- Group: runtime-patches
- Expected head: c42a83ee61f93ed06ff757a9795a0a318920c99c
```

### Repository-identity prerequisite

[#55](https://github.com/therealhieu/md2vid/pull/55) merged as `44904123724d86a9367b00eb05027e5f68317162`.

[Run 30968545288](https://github.com/therealhieu/md2vid/actions/runs/30968545288) trusted summary:

```text
### Dependabot branch refresh
- Outcome: failed
- Reason: head-changed
- PR: #47
- Group: runtime-patches
- Expected head: c42a83ee61f93ed06ff757a9795a0a318920c99c
```

### Live-GraphQL prerequisite and v2 canary

[#56](https://github.com/therealhieu/md2vid/pull/56) merged as `82a4044d04e495d9883ccb79302e4d2f3f2c7cf0`.

[Run 30971739505](https://github.com/therealhieu/md2vid/actions/runs/30971739505) trusted summary:

```text
### Dependabot branch refresh
- Outcome: selected
- Reason: selected-for-rebase
- PR: #47
- Group: runtime-patches
- Expected head: c42a83ee61f93ed06ff757a9795a0a318920c99c
```

The v2 App-rebased head was `6baa97c69552765b637d6a10277c822f352fcdac`:

- Commit author: `dependabot[bot]`; committer: `md2vid-dependabot-refresh[bot]`; signature: unsigned.
- The App-authored synchronize event skipped the Dependabot observer (`observe-dependabot`: skipped) and the actor-bound `pr-title` check failed.
- The pre-existing auto-merge request was disabled by `md2vid-dependabot-refresh[bot]`.

**FAIL — v2 App-rebase mutation canary.** These provenance, observer, title-policy, and authorization outcomes fail closed. The v2 App-rebase mutation canary is formally abandoned and must not be used for #48.

## Native Dependabot recovery

- Native recovery command: [PR #47 comment 5187141634](https://github.com/therealhieu/md2vid/pull/47#issuecomment-5187141634).
- Recreated head: `78193f6d397562423d07afb397d3d361f8f3e0b3`.
- Recreated head provenance: exactly one `dependabot[bot]` commit; valid signature; exact parent `82a4044d04e495d9883ccb79302e4d2f3f2c7cf0`.
- Current identity returned for the recreated commit: signature signer `web-flow`; commit committer `GitHub` (REST committer login `web-flow`).

### Exact-head workflows and authorization

| Assertion | Result |
|---|---|
| [Observer run 30972007088](https://github.com/therealhieu/md2vid/actions/runs/30972007088) | `success` on recreated head; no `action_required` / workflow approval |
| [CI run 30972007186](https://github.com/therealhieu/md2vid/actions/runs/30972007186) | `success` on recreated head; no `action_required` / workflow approval |
| Fresh auto-merge authorization | `SQUASH` / `Bot` `github-actions` / `https://github.com/apps/github-actions` |

### Required checks

| Required check | Conclusion | URL |
|---|---|---|
| `pr-title` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30972007186/job/92198226846) |
| `dependency-review` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30972007186/job/92198226804) |
| `public-snapshot / validate` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30972007186/job/92198226919) |
| `pr-minimum / validate` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30972007186/job/92198226943) |
| `pr-latest / validate` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30972007186/job/92198250894) |

### Native merge and dependency result

- Native squash merge commit: `97cfc9d422415a30f77f298658b84130648ff970`.
- Merge API timestamp: `2026-08-05T03:28:23Z`.
- Recreated-head dependency versions: HyperFrames `0.7.88`; Remotion `4.0.503`; `@remotion/google-fonts` `4.0.503`; `@remotion/media` `4.0.503`.

## HyperFrames compatibility disposition

The planned `0.7.87` target advanced to published `0.7.88` during native recreation. [Compatibility evidence PR #57](https://github.com/therealhieu/md2vid/pull/57), merged as `c6fbd6b35d18d8953b62b15d0e6a27cd41cacaf2`, separately proved that the published `0.7.88` matching bundle has the existing exact reviewed `0.7.87` patch anchor pair and remains byte-idempotent under the existing patch.

#47 merged before this documentation-only proof PR because existing production behavior already supported those exact bytes; no unsafe code gap existed.

## Final conclusions

| Assertion | Conclusion |
|---|---|
| Original and recreated-head provenance | **PASS** — one signed Dependabot commit at each asserted head; recreated parent is exact PR #56 merge |
| Workflow approval | **PASS** — exact-head observer and CI completed without `action_required` |
| Fresh authorization | **PASS** — exact-head `SQUASH` authorization was enabled by `github-actions` |
| Required checks | **PASS** — exactly five required checks, all `SUCCESS` |
| Native merge | **PASS** — PR #47 merged at the asserted API timestamp and commit |
| Dependency versions | **PASS** — recreated head resolves HyperFrames `0.7.88` and the Remotion family `4.0.503` |
| HyperFrames compatibility | **PASS** — #57 documents that the published `0.7.88` bytes match the reviewed `0.7.87` patch variant |
| v2 App-rebase mutation canary | **FAIL / ABANDONED** — do not use this mutation path for #48 |

## Evidence-branch disposition

This evidence branch remains local-only and unre-based until Task 20. Do not push or rebase it before the final audit.
