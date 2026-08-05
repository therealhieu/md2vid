# PR 49 — TypeScript 7 Disposition Evidence

## Closed original dependency PR

- PR: [#49](https://github.com/therealhieu/md2vid/pull/49)
- State at closure: `CLOSED` / **UNMERGED** at `2026-08-05T06:42:36Z`.
- Branch and head at closure: `dependabot/npm_and_yarn/typescript-7.0.2` / `6125c0e3d76242b8d7544677d95c512dfc7021b6`.
- PR author: `app/dependabot`.
- `mergedAt` and GraphQL `mergeCommit` are `null`; #49 was closed without merging. GitHub REST reports synthetic merge-test object `5d36d264eae13a66506e7ca08cfe0fd045e4f9ef` in `merge_commit_sha`; it is not a PR merge.
- Current provenance remains exactly one commit, `6125c0e3d76242b8d7544677d95c512dfc7021b6`: author `dependabot[bot]`, GitHub/web-flow committer identity, and no maintainer commit. No commits were added to #49.
- Human closure rationale: [#issuecomment-5188463407](https://github.com/therealhieu/md2vid/pull/49#issuecomment-5188463407), posted at `2026-08-05T06:42:35Z` by `therealhieu`.

The recorded closure rationale was that merged human-owned TypeScript 6.0.3 successor #58 superseded #49: TypeScript 7.0.2 is incompatible with the `@remotion/bundler` JavaScript compiler API (`readConfigFile` and `typescript.sys.readFile`), while #58 preserved root-to-scaffold version authority, passed the typecheck, dynamic snapshot, full-check, and generated Remotion smoke gates, and added no compatibility shim or unstable internal entry.

## Verified release-smoke root cause

#49 changed the root TypeScript declaration from `^5.7.0` to `^7.0.2` and resolved `typescript@7.0.2`. The generated Remotion release smoke installs `@remotion/bundler` at the authority-controlled Remotion version. Published `@remotion/bundler@4.0.503` source references the JavaScript compiler API `readConfigFile` and `typescript.sys.readFile`; TypeScript 7.0.2 is incompatible with those APIs in this smoke path.

The TypeScript 6 successor verification retained this conclusion without a workaround: no TypeScript 7 shim, no unstable/internal compiler entry, no root-to-scaffold version decoupling, no compiler-option relaxation, and no release-smoke reduction.

## Human-owned TypeScript 6 successor

- Successor: [#58](https://github.com/therealhieu/md2vid/pull/58)
- Branch and head: `build/typescript-6` / `6e8724f91ff9dcb583d32759611387456dc6f3f8`.
- State: `MERGED` at `2026-08-05T06:42:04Z`.
- Squash merge commit: `508b3fbd27d7bc770f501789febfb0bf61994eaf`.
- Root TypeScript range: `^6.0.3`; lockfile root range: `^6.0.3`; resolved package: `6.0.3`.
- Lockfile integrity: `sha512-y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw==`.
- No root `overrides` field is present.

### Successor verification

| Assertion | Result |
|---|---|
| Root and generated Remotion template typechecks | **PASS** |
| Root-to-generated-Remotion TypeScript authority | **PASS** — focused authority suite: 9/9 checks; both derive `^6.0.3` from the root declaration |
| Dynamic public snapshot validation | **PASS** |
| Full check | **PASS** — 1283/1283 tests passed; 0 failed, cancelled, skipped, or todo |
| Release check | **PASS** — generated package install; HyperFrames generated build/check/browser execution/short render; generated Remotion build/check/still-render probes; bundled CLI and runtime-browser probes |
| TypeScript 7 workaround | **PASS** — none added; no shim or unstable/internal compiler entry |

### Required checks on #58

| Required check | Conclusion | Exact job URL |
|---|---|---|
| `dependency-review` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30981869617/job/92227824384) |
| `pr-latest / validate` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30981869617/job/92227863262) |
| `pr-minimum / validate` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30981869617/job/92227824442) |
| `pr-title` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30981869617/job/92227824414) |
| `public-snapshot / validate` | `SUCCESS` | [run job](https://github.com/therealhieu/md2vid/actions/runs/30981869617/job/92227824470) |

## Final disposition

| Assertion | Conclusion |
|---|---|
| Successor and dependency authority | **PASS** — #58 merged with root-authoritative TypeScript 6.0.3 and all required checks `SUCCESS` |
| PR #49 | **CLOSED UNMERGED** — `mergedAt` and GraphQL `mergeCommit` are `null`; #49 was closed without merging, and its sole Dependabot commit is unchanged. The REST synthetic merge-test object is not a PR merge. |
| #49 closure rationale | **PASS** — #58 replaced the incompatible TypeScript 7.0.2 proposal without an unsupported compatibility path |

## Evidence-branch disposition

This evidence branch remains local-only and unre-based until Task 20. Do not push or rebase it before the final audit.
