| Original PR | Initial classification | Required successor |
|---|---|---|
| #1–#4 | Individual Actions major updates rejected by historical bot-title policy | One human-owned Actions v7/v8 PR |
| #25 | Grouped runtime patch; snapshot rerun failure needs diagnosis | Fresh single-commit Dependabot runtime-patches PR after diagnosis |
| #26 + #28 | Split React/React DOM `19.2.8` update | One atomic human-owned React pair PR |
| #27 | Node 26 install-time `onnxruntime-node` network failure | Retry before creating a successor |
| #29 | Green checks but stale branch | Human-owned Node-types PR from current main |

- #1–#4: historical `pr-title` reaches the fallback `exit 1` for individual Dependabot action-update titles.
- #25: `public-snapshot / validate` job `91154094246` failed on 2026-07-31 after an earlier pass on 2026-07-28.
- #26: `react-dom@19.2.8` peer-requires `react@^19.2.8` while the PR retains `react@19.0.0`.
- #27: Node 26 `npm ci` fails before tests while downloading `onnxruntime-node` with `ETIMEDOUT` / `ENETUNREACH`.
- #28: `scripts/dependency_versions.ts` rejects unequal React and React DOM exact versions.
- #29: all recorded checks pass; the branch is only behind main.
