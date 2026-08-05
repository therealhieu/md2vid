# App-token v3 local verification

## Scope and authority

- Official GitHub API verification: `actions/create-github-app-token` tag `v3.2.0` resolves directly to commit `bcd2ba49218906704ab6c1aa796996da409d3eb1`; the commit verification is `verified=true`, `reason=valid`.
- Exact production pin: `actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0`.
- App scope remains `DEPENDABOT_REFRESH_APP_ID` and `DEPENDABOT_REFRESH_APP_PRIVATE_KEY`, owner `therealhieu`, repository `md2vid`, with only `contents: write`, `pull-requests: write`, and `metadata: read` inputs.
- Default token revocation remains enabled: `skip-token-revoke` is absent.
- `NODE_USE_ENV_PROXY`, `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` are absent from both the privileged job and App-token step.
- The privileged workflow remains checkout-free and excludes local actions, package installation, project execution, caches, artifacts, reviews, approvals, direct merge, and fallback credentials.

## Test-first delivery

- Baseline: `corepack npm@11.15.0 ci` completed, then `node --test test/ci/workflows.test.ts` passed 83/83 against the deployed v2.2.2 pin.
- RED: the v3 policy contract failed while production remained v2.2.2, as intended. The inventory, exact-boundary, and structural-mutation tests each observed the required v3 pin mismatch.
- GREEN: after the one-line pin replacement, `node --test test/ci/workflows.test.ts` passed 83/83.
- Mutation resistance rejects an added `skip-token-revoke` as a valid `with:` input, job-level `NODE_USE_ENV_PROXY`, token-step `HTTP_PROXY`, an altered v3 SHA, and an altered v3 version comment, while retaining the existing credential, scope, execution, actor, mutation-order, and expected-head checks.

## Local verification

| Stage | Command | Result |
|---|---|---|
| Controlled setup | `rm -rf dist && corepack npm@11.15.0 ci` | PASS: ignored stale `dist/` removed; clean install completed |
| Focused workflow policy | `node --test test/ci/workflows.test.ts` | PASS: 83/83 |
| Actionlint | `actionlint -config-file .github/actionlint.yaml` | PASS: no diagnostics |
| Public report | `corepack npm@11.15.0 run public:snapshot` | PASS: 334 files, SHA-256 `852d0d1f44eeae53fad9f97a527555a566f1b4e67440bb5ce52fbeb8d7c6ad3b` |
| Queue snapshot | GitHub API open-PR inventory at `2026-08-05T08:24:26Z` | PASS: no exact open patch-group candidate; re-query immediately before any first v3 dispatch |
| Public snapshot gate | `corepack npm@11.15.0 run public:snapshot:check` | PASS: isolated full and release-derived stages each passed 1,283/1,283; final report passed |
| Direct full gate | `corepack npm@11.15.0 run check` | PASS: 1,283/1,283 in 90,340.8 ms |
| Release gate | `corepack npm@11.15.0 run release:check` | PASS: nested full stage 1,283/1,283 in 105,807.2 ms; pack, install, CLI, skill isolation, HyperFrames, Remotion, narration, and release-all stages passed |
| Diff hygiene | `git diff --check origin/main...HEAD` | PASS after all post-review commits |

The earlier 900 ms narration timing failures did not recur in this controlled serial run. No narration implementation, threshold, concurrency, or coverage change was made.

## Bounded runtime claim

Local validation proves the v3 token-creation policy and no-candidate runtime readiness only. It does not prove a live App-authored rebase. The Task 9 live App-rebase mutation canary remains abandoned after its unsigned App-committed head skipped actor-bound policy, and this pin-only change does not reauthorize that canary.
