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
- `package.json` and `package-lock.json`: unchanged from `origin/main`; root HyperFrames dependency remains `0.7.80`.
