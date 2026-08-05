# Final Audit — Dependency PR CI Remediation

## Scope and final base

- Evidence scope origin: `83810c9328b634c98faa4ad25d03eaaccac7d0ac` on `docs/dependency-pr-ci-evidence`.
- Final `origin/main` base: `acd129e719fadbac22a968ced9f5d2377e1aa657` (Action v3 replacement #59). Task 20 ran `git fetch origin main` and `git rebase origin/main`; Git confirmed the evidence branch was already up to date. The branch upstream was unset before archive work.
- This audit contains allowlisted URLs, commit IDs, state/check conclusions, and sanitized command summaries only. It retains no credentials, raw workflow logs, or PR bodies.

## Merged implementation units

| Unit | PR / final head | Merge | Final audited outcome |
|---|---|---|---|
| A — dynamic snapshot authority | [#53](https://github.com/therealhieu/md2vid/pull/53) / `30c7fdc955239b21faa1a6a473cda4b608f47cfe` | `d3effad35ea78a5b98ac911900cd55370f73c6b4` | Repository-root mirror remains absent; dynamic committed-tree scanning, materialization/internal-manifest validation, isolated repository construction, package validation, and release smoke remain enforced. |
| B — HyperFrames package compatibility | [#54](https://github.com/therealhieu/md2vid/pull/54) / `426643fdb33e6489f84b995d6e9058485912bdf1` | `f6add45f954daf13d054948f0aaf8718e6ecb844` | Published `hyperframes@0.7.87` has one matching bundle at `dist/studio/assets/index-BblzZ6Av.js`; the reviewed anchors each apply once and the patch is byte-idempotent. |
| E — TypeScript 6 successor | [#58](https://github.com/therealhieu/md2vid/pull/58) / `6e8724f91ff9dcb583d32759611387456dc6f3f8` | `508b3fbd27d7bc770f501789febfb0bf61994eaf` | Root and generated Remotion authority is `typescript@^6.0.3`; no TypeScript 7 shim, internal API, compiler relaxation, or smoke reduction was introduced. |
| F — App-token v3 rollout | [#59](https://github.com/therealhieu/md2vid/pull/59) / `6e010275a3356f9efb2b162619525626641c7707` | `acd129e719fadbac22a968ced9f5d2377e1aa657` | Exact v3.2.0 pin is `bcd2ba49218906704ab6c1aa796996da409d3eb1`; App scope and revocation policy stay bounded. |

The later evidence-only compatibility proof [#57](https://github.com/therealhieu/md2vid/pull/57), merged as `c6fbd6b35d18d8953b62b15d0e6a27cd41cacaf2`, proves that published `hyperframes@0.7.88` (`5555ed44070807cb1e94ae9bccb8d3de7d9b822e`) has one matching `dist/studio/assets/index-DbY124Po.js` bundle with the same reviewed 0.7.87 anchors and byte-idempotent patch. It made no production dependency change.

## Original dependency PR dispositions

| PR | Original / final head | Disposition |
|---|---|---|
| [#47](https://github.com/therealhieu/md2vid/pull/47) | original `c42a83ee61f93ed06ff757a9795a0a318920c99c`; native recreated `78193f6d397562423d07afb397d3d361f8f3e0b3` | **MERGED** as `97cfc9d422415a30f77f298658b84130648ff970` at `2026-08-05T03:28:23Z`. Exact-head observer [30972007088](https://github.com/therealhieu/md2vid/actions/runs/30972007088) and CI [30972007186](https://github.com/therealhieu/md2vid/actions/runs/30972007186) succeeded without approval. The five required contexts were all `SUCCESS`; fresh native auto-merge was `SQUASH` by Bot `github-actions` at `https://github.com/apps/github-actions`. |
| [#48](https://github.com/therealhieu/md2vid/pull/48) | pre-refresh `2ec3a55312d1476533f24698dec6ec7c5673968c`; native refreshed `a90e2c9e4b8c3e0d53807bf19ee85d499a7e2341` | **MERGED** as `2f358bbb195d53b6ff4da80e14c66e167e2fe1d5` at `2026-08-05T03:36:56Z`. Exact-head observer [30972480027](https://github.com/therealhieu/md2vid/actions/runs/30972480027), CI [30972480069](https://github.com/therealhieu/md2vid/actions/runs/30972480069), and policy authorization [30972492232](https://github.com/therealhieu/md2vid/actions/runs/30972492232) succeeded. The five required contexts were all `SUCCESS`; policy requested native exact-head `--auto --squash`. |
| [#49](https://github.com/therealhieu/md2vid/pull/49) | `6125c0e3d76242b8d7544677d95c512dfc7021b6` | **CLOSED UNMERGED** at `2026-08-05T06:42:36Z`; `mergedAt` and GraphQL merge commit are null. Successor [#58](https://github.com/therealhieu/md2vid/pull/58) merged as `508b3fbd27d7bc770f501789febfb0bf61994eaf`. |
| [#51](https://github.com/therealhieu/md2vid/pull/51) | `8b5890e70982bc109ac623ba833f6d653f24c43a` | **CLOSED UNMERGED** at `2026-08-05T08:54:31Z`; `mergedAt` is null. Replacement [#59](https://github.com/therealhieu/md2vid/pull/59) merged as `acd129e719fadbac22a968ced9f5d2377e1aa657`. |

For #47 and #48, the exact contexts are `dependency-review`, `pr-latest / validate`, `pr-minimum / validate`, `pr-title`, and `public-snapshot / validate`; each concluded `SUCCESS` on the asserted final head. Supporting details are in [PR 47 recovery](pr-47-recovery.md) and [PR 48 recovery](pr-48-recovery.md).

## TypeScript 6 and Action v3 conclusions

- The TypeScript 6 successor lockfile resolves `typescript@6.0.3` with integrity `sha512-y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw==`; focused authority validation is 9/9.
- [No-candidate dispatch 30990924960](https://github.com/therealhieu/md2vid/actions/runs/30990924960) completed `success` on #59's merge. It selected no mutation target and rendered exactly:

```text
### Dependabot branch refresh
- Outcome: no-candidates
- Reason: no-candidates
- PR: none
- Group: none
- Expected head: none
```

- The App-token creation, summary, and default-revocation post lifecycle steps completed successfully. This validates execution of the lifecycle, not independent proof that deletion/revocation succeeded; it does not reauthorize a live App-authored rebase.

## Remote protection assertion

Read-only GitHub API assertion passed with `strict=true`; contexts exactly `dependency-review`, `pr-latest / validate`, `pr-minimum / validate`, `pr-title`, and `public-snapshot / validate`; administrator enforcement and conversation resolution enabled; force pushes and deletions disabled. No repository setting was mutated.

## Final local verification

All final commands used Corepack `npm@11.15.0` and exited `0` in a controlled serial run. A temporary untracked Node interposer added `--test-concurrency=1` only when a command already contained `--test`; this preserved the `<900ms` narration test and its coverage while avoiding full-suite file-process contention.

| Command / assertion | Result |
|---|---|
| `corepack npm ci` | PASS |
| `node --test test/ci/public-snapshot-check.test.ts` | PASS, 10/10 |
| `node --test frameworks/hyperframes/__tests__/patch-studio.test.ts` | PASS, 13/13 |
| `node --test test/cli/hyperframes-self-heal.test.ts` | PASS, 14/14 |
| `node --test test/cli/dependency-versions.test.ts` | PASS, 9/9 |
| `node --test test/ci/workflows.test.ts` | PASS, 83/83 |
| `corepack npm run public:snapshot` | PASS, 334 files, SHA-256 `852d0d1f44eeae53fad9f97a527555a566f1b4e67440bb5ce52fbeb8d7c6ad3b`; status unchanged; root `public-snapshot.json` absent. |
| serialized `corepack npm run public:snapshot:check` | PASS; source and isolated generated-snapshot full gates each 1,283/1,283; internal manifest verified; threshold case 117.2ms and 352.2ms. |
| serialized `corepack npm run check` | PASS, 1,283/1,283; 0 failed/cancelled/skipped/todo; 245,045.1ms; threshold case 308.6ms. |
| serialized `corepack npm run release:check` | PASS, nested full gate 1,283/1,283; package, install, CLI, isolated skill config/home, HyperFrames browser/short-render, Remotion still-render, narration, and aggregate stages passed; threshold case 119.2ms. |
| `git diff --check` | PASS; final worktree clean before archive edits. |

## Deviations

- Prerequisite [#55](https://github.com/therealhieu/md2vid/pull/55), merged as `44904123724d86a9367b00eb05027e5f68317162`, corrected the stale GraphQL repository ID. Prerequisite [#56](https://github.com/therealhieu/md2vid/pull/56), merged as `82a4044d04e495d9883ccb79302e4d2f3f2c7cf0`, corrected the invalid nested live query.
- The v2 App-authored rebase produced unsigned head `6baa97c69552765b637d6a10277c822f352fcdac`, skipped the Dependabot observer, and failed actor-bound title policy. The canary was formally abandoned. #47 recovered through native Dependabot recreation; #48 refreshed and merged natively without v2 dispatch.
- Native #47 recreation advanced HyperFrames to 0.7.88. The published 0.7.88 variant already matched the reviewed 0.7.87 bytes, so evidence-only #57 documented the proof without a duplicate production variant.
- Unserialized full-suite attempts observed narration timing contention: the unchanged `<900ms` test measured 998.3ms and 1,219.4ms. Three direct serialized controls passed at 159.8ms, 165.6ms, and 160.2ms; the final serialized gates passed without threshold or coverage change.
- The v3 no-candidate run does not reauthorize a live mutation. Its post lifecycle does not independently prove revocation deletion. The action's `app-id` deprecation and a `client-id` migration are separate concerns.
- The evidence branch upstream was unset. Its only final-base rebase was performed in Task 20, where Git reported it already up to date with final `origin/main`.

## Remaining risks

| Owner | Condition / risk |
|---|---|
| Repository maintainers | Live App-rebase mutation remains abandoned; redesign and a new fail-closed candidate are required before any future live candidate may run. |
| Workflow maintainers | `app-id` deprecation requires a separately reviewed `client-id` migration. |
| Repository administrators | External App installation, private-key custody, and upstream runner trust remain external dependencies. |
| Repository maintainers | GitHub retention can expire remote workflow/PR evidence; retain the allowlisted evidence and immutable commit links. |
| CI maintainers | Timing test contention and ignored stale `dist/` can affect broad runs; use clean, controlled serial verification without raising the 900ms threshold. |
| HyperFrames maintainers | Future published package/minifier layouts may require a new reviewed exact variant; preserve the one-variant fail-closed selector. |
