# TypeScript 6 successor verification

## Published package

- Official Microsoft release: <https://github.com/microsoft/TypeScript/releases/tag/v6.0.3> (`v6.0.3`, published, non-draft, non-prerelease).
- npm package: `typescript@6.0.3`.
- npm integrity: `sha512-y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw==`.

## Lockfile transition

- With the manifest-only `^6.0.3` change, `corepack npm ci` failed because the stale lockfile resolved TypeScript `5.9.3`.
- `corepack npm install --package-lock-only --ignore-scripts` updated only `package-lock.json`.
- `corepack npm ci` then succeeded with the regenerated lockfile.

## Dependency authority

- Root `devDependencies.typescript`: `^6.0.3`.
- Lockfile root range: `^6.0.3`; resolved package: `6.0.3` with the verified integrity; no lockfile `overrides`.
- `TYPESCRIPT_VERSION = ^6.0.3`, derived from root `devDependencies.typescript`.
- Generated Remotion `devDependencies.typescript = ^6.0.3`, derived from `TYPESCRIPT_VERSION`; the focused dependency-authority suite passed 9/9 checks.

## Verification

- Pinned Corepack `npm@11.15.0` clean install passed.
- Root and Remotion template typechecks passed.
- Dynamic public snapshot check passed.
- Full `npm run check`: 1283 tests, 1283 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo.
- Release check passed through generated package install, HyperFrames generated build/check/browser execution/short render, and Remotion generated build/check/still render probes; bundled CLI and runtime-browser probes passed.
- Diff check passed.
- Post-review serial confirmation: after removing ignored stale `dist/`, the complete pinned gate passed serially. Full check was 1283/1283 in 88.04 seconds; release check completed in 163.75 seconds. The unchanged narration timing threshold and validation coverage remained intact.

## Compatibility constraints

- No TypeScript 7 shim was added.
- No internal or unstable compiler entry was added.
- No scaffold-only pin or root/generated-Remotion version decoupling was introduced.
- No compiler-option relaxation or release-smoke reduction was introduced.
