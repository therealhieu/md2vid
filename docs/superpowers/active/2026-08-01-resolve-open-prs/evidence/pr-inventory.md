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

- Exact failed-job extraction command: `gh run view 30387899259 --repo therealhieu/md2vid --job 91154094246 --log-failed > docs/superpowers/active/2026-08-01-resolve-open-prs/evidence/pr-25-snapshot-failure.log`.
- The retained log records the workflow command `corepack npm run public:snapshot:check` and two nested suites with `861` passing tests and `0` failures. The exact terminal failure was:
  - `FAIL [release]: retained diagnostics at /tmp/md2vid-public-check-BM230m/snapshot/release-diagnostics`
  - `FAIL [smoke:hyperframes]: Command failed: /opt/hostedtoolcache/node/22.18.0/x64/bin/node /home/runner/.cache/node/corepack/v1/npm/11.15.0/bin/npm-cli.js run check`
  - `public snapshot check: npm run release:check exited with status 1`
  - `##[error]Process completed with exit code 1.`
- The failed job does not expose a deeper `npm run check` diagnostic beyond that command/error; the failure is therefore recorded exactly, without claiming a project-level root cause. Full extracted evidence remains at `docs/superpowers/active/2026-08-01-resolve-open-prs/evidence/pr-25-snapshot-failure.log`.
- Current main was `8cf22d8482bc19650ff10edb83db404647a49493` (`origin/main`) throughout reproduction. `corepack npm ci` exited `0` and installed/audited `153` packages with `0` vulnerabilities. A clean rerun of `corepack npm run public:snapshot:check` from `2026-08-01T05:48:50Z` through `2026-08-01T05:52:33Z` exited `0`; both nested suites reported `863` passed and `0` failed, all release smoke lanes reported `OK`, and the command ended with `public snapshot check passed at f9d3b22577f1609a04073c0d0fef1b19992b1050`.
- Classification: **non-reproducible on current main**. No project behavior was changed; the historical nested release-check failure is retained as an environment/stale-runtime observation, not reclassified as a dependency defect.

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
