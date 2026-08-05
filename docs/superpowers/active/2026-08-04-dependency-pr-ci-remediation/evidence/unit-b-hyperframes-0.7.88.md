# Unit B — HyperFrames 0.7.88 Package Verification

## Published package

- Package: `hyperframes`
- Version: `0.7.88`
- npm tarball: `https://registry.npmjs.org/hyperframes/-/hyperframes-0.7.88.tgz`
- npm pack filename: `hyperframes-0.7.88.tgz`
- Tarball SHA-1: `5555ed44070807cb1e94ae9bccb8d3de7d9b822e`
- Studio bundle candidates: `3`
- Matching bundles: `1`
- Matching relative bundle path: `dist/studio/assets/index-DbY124Po.js`

## Exact marker and idempotence results

The one matching published bundle has the exact already-reviewed `0.7.87` `rr` / `p` / `v` anchor pair. No distinct `0.7.88` production variant is safe or necessary: duplicating this identical variant would make the fail-closed selector observe two matching variants.

| Marker set | First application count |
|---|---:|
| Original anchor 1 | 1 |
| Original anchor 2 | 1 |
| Patched marker 1 | 1 |
| Patched marker 2 | 1 |

- Original anchors after first application: `0`, `0`.
- Byte-idempotence: pass; applying the existing exact patch a second time returned identical bytes.

## TDD prerequisite result

- The existing executable `0.7.87` regression contract already accepts this byte-identical anchor pair.
- Focused patch tests therefore passed before a production change: `13/13`.
- A new exact behavioral regression test for this published bundle would also pass before a production change, so it cannot supply the required RED state.
- No duplicate variant, contrived source-inspection test, or production mutation was created. This preserves the one-variant fail-closed invariant.

## Verification outcomes

- `corepack npm --version`: `11.15.0`.
- `node --test frameworks/hyperframes/__tests__/patch-studio.test.ts`: pass, `13/13`.
- `node --test test/cli/hyperframes-self-heal.test.ts`: pass, `14/14`.
- `node --test test/cli/hyperframes-cli.test.ts`: pass, `13/13`.
- `node --test test/cli/hyperframes-render-policy.test.ts`: pass, `15/15`.
- `corepack npm run public:snapshot:check`: pass.
- `corepack npm run check`: pass, `1,283/1,283`; `0` failures.
- `corepack npm run release:check`: pass, including `OK [all]` after package, install, CLI, isolated skill, HyperFrames smoke/render, Remotion smoke/still, and narration stages.
- `git diff --check origin/main...HEAD`: pass.
- Final `git status --short`: empty.
- Historical reviewed scope: at scope origin `82a4044d04e495d9883ccb79302e4d2f3f2c7cf0`, `package.json` and `package-lock.json` remained `hyperframes: 0.7.80`; this evidence-only proof made no dependency change.
- Publication context: after native #47 merged and this branch rebased onto publication base `2f358bbb195d53b6ff4da80e14c66e167e2fe1d5`, `origin/main` already contains `hyperframes: 0.7.88`; this documentation-only PR changes neither package manifest.
