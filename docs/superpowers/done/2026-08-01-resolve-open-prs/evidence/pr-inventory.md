| Original PR | Initial classification | Required successor |
|---|---|---|
| #1–#4 | Individual Actions major updates rejected by historical bot-title policy | One human-owned Actions v7/v8 PR |
| #25 | Grouped runtime patch; snapshot rerun failure needs diagnosis | Fresh single-commit Dependabot runtime-patches PR after diagnosis |
| #26 + #28 | Split React/React DOM `19.2.8` update | One atomic human-owned React pair PR |
| #27 | Node 26 install-time `onnxruntime-node` network failure | Retry before creating a successor |
| #29 | Green checks but stale branch | Human-owned Node-types PR from current main |

- #1–#4: historical `pr-title` reaches the fallback `exit 1` for individual Dependabot action-update titles.
- #25: `public-snapshot / validate` jobs `90371714621` and `91154094246` failed on 2026-07-28 and 2026-07-31, respectively.
- #26: `react-dom@19.2.8` peer-requires `react@^19.2.8` while the PR retains `react@19.0.0`.
- #27: Node 26 `npm ci` fails before tests while downloading `onnxruntime-node` with `ETIMEDOUT` / `ENETUNREACH`.
- #28: `scripts/dependency_versions.ts` rejects unequal React and React DOM exact versions.
- #29: all recorded checks pass; the branch is only behind main.

## Baseline

- Remote `main` recorded at `2026-08-01T02:34:05Z` (UTC) with `gh api repos/therealhieu/md2vid/git/ref/heads/main --jq .object.sha`: `9369c1fb3627e295230475eaa58b6e2583318ef8`.
- `corepack npm ci` — exit `0`; installed 186 packages and audited 187 packages in 6s. Output reported one deprecation warning and 5 vulnerabilities (1 moderate, 4 high).
- `node --test test/ci/workflows.test.ts` — exit `0`; `tests 64`, `pass 64`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`; duration `2224.1325ms`.
- `node --test test/cli/dependency-versions.test.ts` — exit `0`; `tests 7`, `pass 7`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`; duration `90.883083ms`.
- `corepack npm run public:snapshot:check` — exit `0`; nested suite reported `tests 861`, `pass 861`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`; duration `72133.301667ms`; final release smoke result: `OK [all]`.
- `corepack npm run check` — exit `0`; completed `tsc --noEmit`, `tsc --noEmit -p frameworks/remotion/templates/tsconfig.json`, then `tests 861`, `pass 861`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`; duration `66623.62675ms`.
- `corepack npm run release:check` — exit `0`; nested suite reported `tests 861`, `pass 861`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`; duration `71201.012542ms`; final result: `OK [all]`.
- `git diff --check` — exit `0`; no output.

## Runtime patch resolution

### Failure extraction and current-main classification

- Exact original Mode A extraction command, used before its output path was replaced by the tracked extract: `gh run view 30387899259 --repo therealhieu/md2vid --job 91154094246 --log-failed > docs/superpowers/active/2026-08-01-resolve-open-prs/evidence/pr-25-snapshot-failure.log`.
- Safe re-extraction preserves the tracked extract by writing raw generated output outside the worktree: `raw_log=/tmp/pr-25-snapshot-failure.raw.log; gh run view 30387899259 --repo therealhieu/md2vid --job 91154094246 --log-failed > "$raw_log"`.
- The tracked diagnostic extract at `docs/superpowers/done/2026-08-01-resolve-open-prs/evidence/pr-25-snapshot-failure.log` is derived by recording the raw line/byte count and SHA-256, then copying raw lines `6332-6339` and `11769-11786` verbatim. It records the source run/job URLs and both nested suites with `861` passing tests and `0` failures. The exact terminal failure was:
  - `FAIL [release]: retained diagnostics at /tmp/md2vid-public-check-BM230m/snapshot/release-diagnostics`
  - `FAIL [smoke:hyperframes]: Command failed: /opt/hostedtoolcache/node/22.18.0/x64/bin/node /home/runner/.cache/node/corepack/v1/npm/11.15.0/bin/npm-cli.js run check`
  - `public snapshot check: npm run release:check exited with status 1`
  - `##[error]Process completed with exit code 1.`
- The original raw transcript was `11,812` lines, `1,265,359` bytes, and SHA-256 `1aa28ae0609a8d8c5d2b5448a827dabedbab9452ed4fc0d114446ff01225607a`. It is represented by the tracked diagnostic extract rather than retained verbatim because the raw CI output is 1.2 MB, high-noise, and contains trailing whitespace. The failed job exposes no deeper `npm run check` diagnostic beyond the retained command/error chain.
- Current main was `8cf22d8482bc19650ff10edb83db404647a49493` (`origin/main`) throughout reproduction. `corepack npm ci` exited `0` and installed/audited `153` packages with `0` vulnerabilities. A clean rerun of `corepack npm run public:snapshot:check` from `2026-08-01T05:48:50Z` through `2026-08-01T05:52:33Z` exited `0`; both nested suites reported `863` passed and `0` failed, all release smoke lanes reported `OK`, and the command ended with `public snapshot check passed at f9d3b22577f1609a04073c0d0fef1b19992b1050`.
- Classification: **non-reproducible on current main**. The historical nested release-check failure has no deeper diagnostic in the failed-job log and is not classified as a dependency or project defect.

### PR #25 refreshed-in-place deviation

- The approved plan expected a fresh Dependabot runtime-patches successor followed by closure of #25. Live state deviated safely: Dependabot refreshed the existing #25 in place on `dependabot/npm_and_yarn/runtime-patches-18e60cdf6b`, then the already-enabled native guarded auto-merge merged it. No replacement PR was manufactured, and #25 was not closed/reopened.
- PR #25 is `MERGED` on base `main`, authored by `dependabot[bot]` (GraphQL app author `app/dependabot`), with exact title `chore(deps): bump the runtime-patches group across 1 directory with 4 updates`. Its head branch matches `^dependabot/npm_and_yarn/runtime-patches(-[a-z0-9-]+)?$`.
- Head SHA: `0d133947dc8cef717af6ed4ae56c3405a5380fd8`.
- Merge commit and current `main`: `8cf22d8482bc19650ff10edb83db404647a49493`.
- The live PR commit API reports exactly one current commit. Its Git author is `dependabot[bot]` (`49699333+dependabot[bot]@users.noreply.github.com`); GitHub reports the platform committer as `GitHub`/REST user `web-flow`, with `commit.verification.verified: true`, `reason: valid`, verified at `2026-08-01T05:26:50Z`. This is the standard GitHub representation of a Dependabot-authored, GitHub-committed verified bot commit; there is no maintainer-authored commit. The PR body has no `Maintainer changes` marker and `maintainer_can_modify` is `false`.

### Required checks and merge trust proof

- All five required checks passed on head `0d133947dc8cef717af6ed4ae56c3405a5380fd8`:
  - `pr-title`: success at `2026-08-01T05:27:01Z` — https://github.com/therealhieu/md2vid/actions/runs/30685848492/job/91331336791
  - `dependency-review`: success at `2026-08-01T05:27:11Z` — https://github.com/therealhieu/md2vid/actions/runs/30685848492/job/91331336792
  - `pr-minimum / validate`: success at `2026-08-01T05:29:07Z` — https://github.com/therealhieu/md2vid/actions/runs/30685848492/job/91331336828
  - `pr-latest / validate`: success at `2026-08-01T05:29:08Z` — https://github.com/therealhieu/md2vid/actions/runs/30685848492/job/91331356589
  - `public-snapshot / validate`: success at `2026-08-01T05:32:53Z` — https://github.com/therealhieu/md2vid/actions/runs/30685848492/job/91331336827
- Reviews API evidence is empty (`review_count: 0`, `github-actions[bot]` reviews: `0`): https://api.github.com/repos/therealhieu/md2vid/pulls/25/reviews. Thus no Actions-created approval/review exists.
- Timeline evidence records native squash auto-merge enabled by `github-actions[bot]` at `2026-07-28T16:26:12Z` (`auto_squash_enabled`), the refreshed head force-push to `0d133947dc8cef717af6ed4ae56c3405a5380fd8` at `2026-08-01T05:26:52Z`, and the merge by `github-actions[bot]` at `2026-08-01T05:32:55Z`: https://api.github.com/repos/therealhieu/md2vid/issues/25/timeline.
- The guarded run `30685853057` completed successfully from `2026-08-01T05:27:04Z` to `2026-08-01T05:27:13Z`; its `request-auto-merge` job passed live-head revalidation and the `Request native squash auto-merge` step: https://github.com/therealhieu/md2vid/actions/runs/30685853057/job/91331350069. The PR API reports `auto_merge.enabled_by: github-actions[bot]` and `merge_method: squash`: https://api.github.com/repos/therealhieu/md2vid/pulls/25.
- The last required check completed at `05:32:53Z`; the native squash merge event occurred at `05:32:55Z`, after all five required checks, with no Actions-created review. Final merged PR: https://github.com/therealhieu/md2vid/pull/25.

## GSAP PR #27 Node-26 evidence and successor basis

### Immutable historical failure transcript

- Source run: https://github.com/therealhieu/md2vid/actions/runs/30341897375
- Source failed job: https://github.com/therealhieu/md2vid/actions/runs/30341897375/job/90219210160
- The failed `pr-latest / validate` job completed on `2026-07-28T08:19:56Z` for historical head `c67fa8e6120126846b6186851b45af013a7fc058`. Its job metadata records `Install dependencies` as the failed step and `Run requested validation` as skipped.
- The complete raw `gh run view 30341897375 --repo therealhieu/md2vid --job 90219210160 --log-failed` terminal transcript measured `274` lines and `32,812` bytes with SHA-256 `1a7db5fcd82af8603f8cc9a3a3c4be925d1562da0caf53e7cd75baaea7d11308`. The tracked `evidence/pr-27-node-26-install.log` is its source-linked diagnostic extract (raw lines `200–248`); it preserves terminal content while normalizing terminal whitespace so the repository-wide `git diff --check` gate remains meaningful.
- Exact terminal evidence from that transcript:
  - `##[group]Run npm ci`
  - `npm error path /home/runner/work/md2vid/md2vid/node_modules/onnxruntime-node`
  - `npm error command sh -c node ./script/install`
  - `npm error AggregateError [ETIMEDOUT]:`
  - `npm error Error: connect ETIMEDOUT 150.171.109.66:443`
  - `npm error Error: connect ENETUNREACH 2603:1061:14:75::1:443 - Local (:::0)`
  - `npm error Node.js v26.5.0`
  - `##[error]Process completed with exit code 1.`
- Classification is limited to the evidence: Node 26 failed during `npm ci` in the `onnxruntime-node` install script with network connection errors, and the requested validation step did not run. This evidence does not establish GSAP or project-code causality.

### Live PR context after Dependabot refresh (read-only)

- PR: https://github.com/therealhieu/md2vid/pull/27
- Title: `chore(deps): bump gsap from 3.14.2 to 3.15.0`; state: `OPEN`; base: `main`; author returned by `gh pr view`: `app/dependabot` (`is_bot: true`).
- Head branch: `dependabot/npm_and_yarn/gsap-3.15.0`; refreshed head SHA: `5ab3130bd771022773bd468b6a6140609cd1cc58`; merge-state status: `UNKNOWN`.
- Live checks: `resolve-latest-node` success; `observe-dependabot` success; `pr-title` failure; `dependency-review` success; `public-snapshot / validate` success; `pr-minimum / validate` success; `pr-latest / validate` success; `main-full` skipped. The check URLs are reported by `gh pr view` for this head; the historical failure above is not attributed to any current successful check.

### Test decision

- `corepack npm ci` succeeds for the regenerated GSAP graph. Existing `test/cli/dependency-versions.test.ts` verifies that `GSAP_VERSION` comes from the manifest and that `DEFAULT_GSAP_SRC` is derived from it; `frameworks/hyperframes/__tests__/emit.test.ts` verifies the pinned CDN emission path. Both pass after the update. No fresh, reproducible project-owned GSAP compatibility failure exists, so no regression test was added; an external `onnxruntime-node` download failure is not a project regression-test target.

## Final live audit

Audit performed from clean current-main revision `8ff3ac6dd58e459bd9ae750016668c49032ee275` on 2026-08-01. The live `main` ref returned the same SHA: https://api.github.com/repos/therealhieu/md2vid/git/ref/heads/main.

### Original PR and open-PR matrix

The exact original-PR assertion was:

```bash
gh pr list --repo therealhieu/md2vid --state open --limit 100 --json number \\
  --jq 'map(.number) | map(select(. == 1 or . == 2 or . == 3 or . == 4 or . == 25 or . == 26 or . == 27 or . == 28 or . == 29)) | length'
```

It returned `0`. The complete live open-PR query:

```bash
gh pr list --repo therealhieu/md2vid --state open --limit 100 --json number,url,title,author,headRefName,headRefOid,createdAt,updatedAt --jq '.'
```

returned `[]`. Therefore there were no unrelated or newly opened PRs to classify during this Mode A audit.

| Original | Final live state and final bot/human head | Successor or merge path | Merge commit and time | Closure comment or live closure evidence |
|---|---|---|---|---|
| [#1](https://github.com/therealhieu/md2vid/pull/1) | `CLOSED`, Dependabot head `ae44146f7327d90949e4ea49165524041087ad23` | Merged human-owned [#39](https://github.com/therealhieu/md2vid/pull/39), successor head `3be4522a2c73d5f12d543d8f8a89a6df3920dab4` | `3be85d4cecbff7925b539d5e225678588bffc35c`, 2026-08-01T04:25:38Z | https://github.com/therealhieu/md2vid/pull/1#issuecomment-5149789286 at 2026-08-01T04:27:09Z |
| [#2](https://github.com/therealhieu/md2vid/pull/2) | `CLOSED`, Dependabot head `ff7a97b3c54b56e854bfff710a7ffdd88a22a266` | Merged human-owned [#39](https://github.com/therealhieu/md2vid/pull/39), successor head `3be4522a2c73d5f12d543d8f8a89a6df3920dab4` | `3be85d4cecbff7925b539d5e225678588bffc35c`, 2026-08-01T04:25:38Z | https://github.com/therealhieu/md2vid/pull/2#issuecomment-5149789443 at 2026-08-01T04:27:12Z |
| [#3](https://github.com/therealhieu/md2vid/pull/3) | `CLOSED`, Dependabot head `0a8a5bf85ac4a39b6d66329a95518643ee3d0436` | Merged human-owned [#39](https://github.com/therealhieu/md2vid/pull/39), successor head `3be4522a2c73d5f12d543d8f8a89a6df3920dab4` | `3be85d4cecbff7925b539d5e225678588bffc35c`, 2026-08-01T04:25:38Z | https://github.com/therealhieu/md2vid/pull/3#issuecomment-5149789563 at 2026-08-01T04:27:14Z |
| [#4](https://github.com/therealhieu/md2vid/pull/4) | `CLOSED`, Dependabot head `7dab54c8a4722188b55f01984e71a088212f9828` | Merged human-owned [#39](https://github.com/therealhieu/md2vid/pull/39), successor head `3be4522a2c73d5f12d543d8f8a89a6df3920dab4` | `3be85d4cecbff7925b539d5e225678588bffc35c`, 2026-08-01T04:25:38Z | https://github.com/therealhieu/md2vid/pull/4#issuecomment-5149789706 at 2026-08-01T04:27:16Z |
| [#25](https://github.com/therealhieu/md2vid/pull/25) | `MERGED` in place; current Dependabot head `0d133947dc8cef717af6ed4ae56c3405a5380fd8` | Safe live deviation: the existing PR was refreshed in place, so [#25](https://github.com/therealhieu/md2vid/pull/25) is both the original and the guarded runtime merge path; no replacement PR was manufactured | `8cf22d8482bc19650ff10edb83db404647a49493`, 2026-08-01T05:32:55Z | No closure comment; original merged directly |
| [#26](https://github.com/therealhieu/md2vid/pull/26) | `CLOSED`, Dependabot head `31f2de0dc945601e28a8c67c1ab2f56a9a0015ff` | Merged human-owned [#40](https://github.com/therealhieu/md2vid/pull/40), successor head `15dbe67f9c4d7df4f9c5871ed8cf62e60add14f4` | `97f77fa7c5627c49c56f25ece6ad4d95043fbe24`, 2026-08-01T05:24:03Z | https://github.com/therealhieu/md2vid/pull/26#issuecomment-5149974580 at 2026-08-01T05:24:32Z |
| [#27](https://github.com/therealhieu/md2vid/pull/27) | `CLOSED`, Dependabot head `5ab3130bd771022773bd468b6a6140609cd1cc58` | Merged human-owned [#42](https://github.com/therealhieu/md2vid/pull/42), successor head `8904eafa25104af5fec3e0a717ef5d41a7d8963f` | `8b11d55e92e6d55595cd32772492c25ddf6f7b85`, 2026-08-01T07:41:33Z | https://github.com/therealhieu/md2vid/pull/27#issuecomment-5150459912 at 2026-08-01T07:42:01Z |
| [#28](https://github.com/therealhieu/md2vid/pull/28) | `CLOSED`, Dependabot head `d9fb9993cd8590b2b4fbf609502ca169c094863d` | Merged human-owned [#40](https://github.com/therealhieu/md2vid/pull/40), successor head `15dbe67f9c4d7df4f9c5871ed8cf62e60add14f4` | `97f77fa7c5627c49c56f25ece6ad4d95043fbe24`, 2026-08-01T05:24:03Z | https://github.com/therealhieu/md2vid/pull/28#issuecomment-5149974721 at 2026-08-01T05:24:34Z |
| [#29](https://github.com/therealhieu/md2vid/pull/29) | `CLOSED`, Dependabot head `5403018c04c61c302e1be143547d6d4a13665563` | Merged human-owned [#43](https://github.com/therealhieu/md2vid/pull/43), successor head `b8ed4b86a493999ab22ab08c20d6f509c4fd046d` | `8ff3ac6dd58e459bd9ae750016668c49032ee275`, 2026-08-01T08:40:22Z | Timeline records closure by `therealhieu` at 2026-08-01T08:40:23Z: https://api.github.com/repos/therealhieu/md2vid/issues/events/28813848739; Dependabot notification at https://github.com/therealhieu/md2vid/pull/29#issuecomment-5150660524 at 2026-08-01T08:40:25Z; linked human follow-up: https://github.com/therealhieu/md2vid/pull/29#issuecomment-5150662977 at 2026-08-01T08:41:09Z |

### Required checks for every merged successor

The five required contexts are `pr-title`, `dependency-review`, `public-snapshot / validate`, `pr-minimum / validate`, and `pr-latest / validate`. Every check below concluded `SUCCESS` on the listed successor head SHA.

#### [#39](https://github.com/therealhieu/md2vid/pull/39), head `3be4522a2c73d5f12d543d8f8a89a6df3920dab4`

- `pr-title` — SUCCESS at 2026-08-01T04:19:22Z: https://github.com/therealhieu/md2vid/actions/runs/30683715407/job/91325505134
- `dependency-review` — SUCCESS at 2026-08-01T04:19:25Z: https://github.com/therealhieu/md2vid/actions/runs/30683715407/job/91325505137
- `public-snapshot / validate` — SUCCESS at 2026-08-01T04:24:57Z: https://github.com/therealhieu/md2vid/actions/runs/30683715407/job/91325505179
- `pr-minimum / validate` — SUCCESS at 2026-08-01T04:21:28Z: https://github.com/therealhieu/md2vid/actions/runs/30683715407/job/91325505160
- `pr-latest / validate` — SUCCESS at 2026-08-01T04:21:59Z: https://github.com/therealhieu/md2vid/actions/runs/30683715407/job/91325524075

#### [#40](https://github.com/therealhieu/md2vid/pull/40), head `15dbe67f9c4d7df4f9c5871ed8cf62e60add14f4`

- `pr-title` — SUCCESS at 2026-08-01T05:18:11Z: https://github.com/therealhieu/md2vid/actions/runs/30685576752/job/91330536466
- `dependency-review` — SUCCESS at 2026-08-01T05:18:16Z: https://github.com/therealhieu/md2vid/actions/runs/30685576752/job/91330536501
- `public-snapshot / validate` — SUCCESS at 2026-08-01T05:23:31Z: https://github.com/therealhieu/md2vid/actions/runs/30685576752/job/91330536544
- `pr-minimum / validate` — SUCCESS at 2026-08-01T05:20:09Z: https://github.com/therealhieu/md2vid/actions/runs/30685576752/job/91330536546
- `pr-latest / validate` — SUCCESS at 2026-08-01T05:20:36Z: https://github.com/therealhieu/md2vid/actions/runs/30685576752/job/91330552140

#### [#42](https://github.com/therealhieu/md2vid/pull/42), head `8904eafa25104af5fec3e0a717ef5d41a7d8963f`

- `pr-title` — SUCCESS at 2026-08-01T07:35:14Z: https://github.com/therealhieu/md2vid/actions/runs/30690028294/job/91342973761
- `dependency-review` — SUCCESS at 2026-08-01T07:35:18Z: https://github.com/therealhieu/md2vid/actions/runs/30690028294/job/91342973757
- `public-snapshot / validate` — SUCCESS at 2026-08-01T07:40:40Z: https://github.com/therealhieu/md2vid/actions/runs/30690028294/job/91342973790
- `pr-minimum / validate` — SUCCESS at 2026-08-01T07:37:12Z: https://github.com/therealhieu/md2vid/actions/runs/30690028294/job/91342973798
- `pr-latest / validate` — SUCCESS at 2026-08-01T07:37:10Z: https://github.com/therealhieu/md2vid/actions/runs/30690028294/job/91342992718

#### [#43](https://github.com/therealhieu/md2vid/pull/43), head `b8ed4b86a493999ab22ab08c20d6f509c4fd046d`

- `pr-title` — SUCCESS at 2026-08-01T08:34:59Z: https://github.com/therealhieu/md2vid/actions/runs/30692041320/job/91348357564
- `dependency-review` — SUCCESS at 2026-08-01T08:35:01Z: https://github.com/therealhieu/md2vid/actions/runs/30692041320/job/91348357562
- `public-snapshot / validate` — SUCCESS at 2026-08-01T08:39:58Z: https://github.com/therealhieu/md2vid/actions/runs/30692041320/job/91348357605
- `pr-minimum / validate` — SUCCESS at 2026-08-01T08:37:05Z: https://github.com/therealhieu/md2vid/actions/runs/30692041320/job/91348357602
- `pr-latest / validate` — SUCCESS at 2026-08-01T08:37:05Z: https://github.com/therealhieu/md2vid/actions/runs/30692041320/job/91348371531

### #25 guarded trust proof

Fresh API evidence for [#25](https://github.com/therealhieu/md2vid/pull/25):

- Final head SHA: `0d133947dc8cef717af6ed4ae56c3405a5380fd8`; branch `dependabot/npm_and_yarn/runtime-patches-18e60cdf6b`; base `main`; final merge SHA `8cf22d8482bc19650ff10edb83db404647a49493`.
- The commits API returned exactly one current commit, oid `0d133947dc8cef717af6ed4ae56c3405a5380fd8`, authored by `dependabot[bot]` at 2026-08-01T05:26:50Z. GitHub reports `verification.verified: true` and `reason: valid`; the GitHub web-flow committer is the platform commit representation, not a maintainer-authored commit: https://api.github.com/repos/therealhieu/md2vid/pulls/25/commits.
- `maintainerCanModify` is `false`, and the reviews API returned `review_count: 0` and `github-actions[bot]` review count `0`: https://api.github.com/repos/therealhieu/md2vid/pulls/25/reviews.
- The native request was enabled as `SQUASH` by `github-actions[bot]` at 2026-07-28T16:26:12Z. The guarded workflow [run 30685853057](https://github.com/therealhieu/md2vid/actions/runs/30685853057) completed `success`; its `request-auto-merge` job and `Request native squash auto-merge` step both succeeded, with job URL https://github.com/therealhieu/md2vid/actions/runs/30685853057/job/91331350069.
- The final head force-push by Dependabot occurred at 2026-08-01T05:26:52Z; all five required checks completed by 2026-08-01T05:32:53Z; native squash merge occurred at 2026-08-01T05:32:55Z. Timeline: https://api.github.com/repos/therealhieu/md2vid/issues/25/timeline.
- The five required checks all succeeded on the final head: `pr-title` https://github.com/therealhieu/md2vid/actions/runs/30685848492/job/91331336791; `dependency-review` https://github.com/therealhieu/md2vid/actions/runs/30685848492/job/91331336792; `pr-minimum / validate` https://github.com/therealhieu/md2vid/actions/runs/30685848492/job/91331336828; `pr-latest / validate` https://github.com/therealhieu/md2vid/actions/runs/30685848492/job/91331356589; `public-snapshot / validate` https://github.com/therealhieu/md2vid/actions/runs/30685848492/job/91331336827.

The approved fresh-successor shape safely deviated because Dependabot refreshed #25 in place; the trust proof remained intact and no maintainer branch modification was made.

### Protection and live-state deviations

- The live `main` protection response still requires the five exact contexts, strict status checks, admin enforcement, and conversation resolution; force pushes and deletions remain disabled: https://api.github.com/repos/therealhieu/md2vid/branches/main/protection.
- The only safe live-state deviation is #25 refreshing in place instead of opening a successor. The #29 timeline does not confirm Dependabot auto-closure: it records `therealhieu` closing the original at 2026-08-01T08:40:23Z after [#43](https://github.com/therealhieu/md2vid/pull/43) merged, followed by a Dependabot notification and a human successor-link comment. No original PR remained open, no unrelated PR was present, and no protected-branch or trust-policy mutation was performed.

## Final main health

Freshly run from current `main` content at `8ff3ac6dd58e459bd9ae750016668c49032ee275` using npm `11.15.0` through `corepack npm` and Node `v26.4.0`:

| Command | Outcome |
|---|---|
| `corepack npm ci` | Exit `0`; added 152 packages, audited 153, 0 vulnerabilities. npm emitted deprecation warnings for `boolean@3.2.0` and `node-domexception@1.0.0`. |
| `node --test test/ci/workflows.test.ts` | Exit `0`; 65 tests, 65 passed, 0 failed, 0 skipped, 0 todo. |
| `node --test test/cli/dependency-versions.test.ts` | Exit `0`; 9 tests, 9 passed, 0 failed, 0 skipped, 0 todo. |
| `corepack npm run typecheck` | Exit `0`; `tsc --noEmit` completed. |
| `corepack npm run typecheck:remotion` | Exit `0`; Remotion template `tsc --noEmit` completed. |
| `corepack npm run public:snapshot:check` | Exit `0`; nested validation reported 864 tests, 864 passed, 0 failed; release smoke lanes reported `OK [all]`; final snapshot check passed. |
| `corepack npm run check` | Exit `0`; nested validation reported 864 tests, 864 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo. |
| `corepack npm run release:check` | Exit `0`; nested validation reported 864 tests, 864 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo; release smoke lanes reported `OK [all]`. |
| `git diff --check` before evidence edits | Exit `0`; no output. |

The working tree had no tracked changes before this documentation update. The only ignored artifacts observed after verification were `node_modules/` and `dist/`; they are not part of the tracked change set.
