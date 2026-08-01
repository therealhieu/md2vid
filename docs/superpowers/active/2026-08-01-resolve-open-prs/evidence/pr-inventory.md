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
