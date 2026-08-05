# Unit B — HyperFrames 0.7.87 Package Verification

## Published package

- Package: `hyperframes`
- Version: `0.7.87`
- npm tarball: `hyperframes-0.7.87.tgz`
- Studio bundle candidates: `3`
- Matching bundles: `1`
- Matching relative bundle path: `dist/studio/assets/index-BblzZ6Av.js`

## Exact marker and idempotence results

| Marker set | First application count |
|---|---:|
| Original anchor 1 | 1 |
| Original anchor 2 | 1 |
| Patched marker 1 | 1 |
| Patched marker 2 | 1 |

- Byte-idempotence: pass; applying the exact patch a second time returned identical bytes.

## Verification outcomes

- `corepack npm ci`: pass.
- `node --test frameworks/hyperframes/__tests__/patch-studio.test.ts`: pass, 13/13.
- `node --test test/cli/hyperframes-self-heal.test.ts`: pass, 14/14.
- `corepack npm run public:snapshot:check`: pass.
- `corepack npm run check`: pass, 1,281/1,281; 0 failures.
- `corepack npm run release:check`: pass; package, install, CLI, HyperFrames smoke, Remotion smoke, narration, and aggregate release stages passed.
- `git diff --check origin/main...HEAD`: pass.
- `package.json` and `package-lock.json`: unchanged from `origin/main`; root HyperFrames dependency remains `0.7.80`.
