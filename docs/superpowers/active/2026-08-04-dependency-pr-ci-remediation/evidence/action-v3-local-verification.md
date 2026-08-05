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
- Mutation resistance rejects an added `skip-token-revoke`, job-level `NODE_USE_ENV_PROXY`, token-step `HTTP_PROXY`, an altered v3 SHA, and an altered v3 version comment, while retaining the existing credential, scope, execution, actor, mutation-order, and expected-head checks.

## Local verification

| Stage | Command | Result |
|---|---|---|
| Focused workflow policy | `node --test test/ci/workflows.test.ts` | PASS: 83/83 |
| Actionlint | `actionlint -config-file .github/actionlint.yaml` | PASS: no diagnostics |
| Public report | `corepack npm@11.15.0 run public:snapshot` | PASS: 334 files, SHA-256 `2a54191e0fd6478327be9e034585dcd7bc2453c86e9c3316de4bbbbd59eac9bf` |
| Public snapshot gate | `corepack npm@11.15.0 run public:snapshot:check` | BLOCKED by unrelated performance budget: 1,282/1,283 passed; `segments many protected domains within a practical preflight budget` exceeded 900 ms (1,165.6 ms) in the isolated snapshot tree |
| Direct full gate | `corepack npm@11.15.0 run check` | BLOCKED by the same unrelated 900 ms performance test: 1,282/1,283 passed (1,864.0 ms) |
| Release gate | `corepack npm@11.15.0 run release:check` | PASS: nested full stage 1,283/1,283; pack, install, CLI, skill isolation, HyperFrames, Remotion, narration, and release-all stages passed |
| Diff hygiene | `git diff --cached --check` | PASS after staging all authority and evidence paths |

The full and public-snapshot failures are not caused by the App-token change: the only failure is the existing performance budget at `engine/__tests__/narration_request.test.ts:167`, while the release gate's nested full suite passes. This unit does not change that unrelated performance contract.

## Bounded runtime claim

Local validation proves the v3 token-creation policy and no-candidate runtime readiness only. It does not prove a live App-authored rebase. The Task 9 live App-rebase mutation canary remains abandoned after its unsigned App-committed head skipped actor-bound policy, and this pin-only change does not reauthorize that canary.
