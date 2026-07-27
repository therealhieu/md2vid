# Canonical Review Artifact

- Review scope: Part 1, Tasks 1-5
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade`
- Scope mode: `clean-head`
- Scope origin: `fa7cbeb4074cb5167214b29ab49937b8f9c1e10f`
- Task-scope patch: `/tmp/md2vid-upgrade-core-scope/task-scope.patch`
- Created: 2026-07-27
- Tester dispatched: yes

---

## Suites run

- `node --test test/cli/upgrade.test.ts` → exit `0`; `21` tests passed, `0` failed. The suite also emitted:
  - `OK upgraded md2vid 0.1.11 → 0.1.11`
  - `OK refreshed Claude skill`
- `corepack npm run typecheck` → exit `0`; `tsc --noEmit` passed.
- `git diff --check` → exit `0`; no output.
- `node scripts/upgrade.ts --help` → exit `0`; printed `Usage: md2vid upgrade`.
- Symlink-replacement probe using an injected `spawn` and a temporary fixture → exit `0`, but reproduced stale-CLI behavior:
  - Fresh CLI invoked: `…/linked-source/dist/bin/md2vid.js`
  - Expected fresh CLI: `…/lib/node_modules/md2vid/dist/bin/md2vid.js`
  - Reported version: `0.1.11 → 0.1.11`, despite the simulated npm installation replacing the global package with `0.1.12`.
- `cmp -s <(git diff fa7cbeb4074cb5167214b29ab49937b8f9c1e10f..4d2422944dcaa1031313257f14a2bc962e5dadb7) /tmp/md2vid-upgrade-core-scope/task-scope.patch` → exit `0`; supplied scope patch matches the commit range.
- `git status --short` before and after validation → exit `0`; no output.
- Commit verification → exactly five commits in the required order, ending at `4d2422944dcaa1031313257f14a2bc962e5dadb7`, all using the configured repository identity:
  1. `feat(cli): resolve global npm installation`
  2. `feat(cli): report upgrade validation failures`
  3. `feat(cli): run synchronized upgrade`
  4. `feat(cli): stop failed package upgrades`
  5. `feat(cli): report skill refresh recovery`

## Findings

### TEST-1 — Must fix — A replaced global symlink launches the pre-upgrade CLI

- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/scripts/upgrade.ts:87-101` — `resolveGlobalInstallation()` canonicalizes the pre-upgrade package path and permanently derives `cliEntry` from that realpath.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/scripts/upgrade.ts:178-201` — after npm completes, `run()` validates, reads metadata from, and launches that pre-upgrade path without resolving `<globalRoot>/md2vid` again.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/test/cli/upgrade.test.ts:212-260` — the success test covers only a regular directory whose path remains stable through installation.
  - Focused temporary-fixture probe replaced a valid global symlink during the fake npm call. `run()` returned `0`, launched `…/linked-source/dist/bin/md2vid.js`, and reported `0.1.11 → 0.1.11`; the new global package was `0.1.12` at `…/lib/node_modules/md2vid/dist/bin/md2vid.js`.
- Guidance:
  - Add `test/cli/upgrade.test.ts` test `upgrade re-resolves the fresh CLI after a global symlink is replaced`.
  - Begin with `<globalRoot>/md2vid` as a symlink to the running package. During the injected npm-install call, replace it with a new `0.1.12` package directory.
  - Assert the metadata and skill handoff use the post-install global package location, not the old canonical source path.
  - Preserve canonical realpath comparison for pre-mutation authorization, but resolve the fresh package/CLI from `<globalRoot>/<package-name>` after npm succeeds.
  - Required command: `node --test test/cli/upgrade.test.ts`.
- Success checklist:
  - [ ] The regression test fails against `4d2422944dcaa1031313257f14a2bc962e5dadb7`.
  - [ ] The fresh child receives the post-install global `dist/bin/md2vid.js`.
  - [ ] Output reports `0.1.11 → 0.1.12`.
  - [ ] The old linked-source CLI is never launched after npm replaces the link.
  - [ ] All upgrade tests and typecheck pass.

### TEST-2 — Must fix — Real `spawnSync` start-failure results are untested

- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/scripts/upgrade.ts:46-54` — `childFailure()` has a distinct `child.error` branch for child-process start failures.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/test/cli/upgrade.test.ts:110-156` — npm-root “start failure” only simulates the injected function throwing.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/test/cli/upgrade.test.ts:284-337` — npm-install “start” likewise only throws.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/test/cli/upgrade.test.ts:396-453` — skill-refresh “start” likewise only throws.
  - No test returns a `SpawnSyncReturns` object with its `error` field populated, leaving the realistic `spawnSync` failure branch unprotected for all three child invocations.
- Guidance:
  - Extend the root, npm-install, and skill-refresh failure tables with a `child.error` result, for example `result(null, "", { error: new Error("spawn … ENOENT") })`.
  - Assert the same technical cause, exit/short-circuit behavior, recovery guidance, partial-state wording where applicable, and exactly one `FAIL [upgrade]:` prefix.
  - Required command: `node --test test/cli/upgrade.test.ts`.
- Success checklist:
  - [ ] npm-root `child.error` includes both manual recovery commands.
  - [ ] npm-install `child.error` returns `1` and does not start skill refresh.
  - [ ] skill-refresh `child.error` returns `1`, reports partial completion, and includes `md2vid install-skill`.
  - [ ] Each emitted orchestration error contains exactly one failure prefix.
  - [ ] All upgrade tests and typecheck pass.

### TEST-3 — Must fix — Direct-script main-guard behavior has no automated regression test

- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/scripts/upgrade.ts:211` — Task 5 adds direct-entry behavior through `isMainModule()` and `process.exit(run(...))`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/test/cli/upgrade.test.ts:1-453` — tests only import and call `run()` or `resolveGlobalInstallation()`; none invokes `scripts/upgrade.ts` as the process entry point.
  - Manual focused check `node scripts/upgrade.ts --help` currently exits `0` and prints the correct usage, but removal or breakage of line 211 would not fail the suite.
- Guidance:
  - Add `test/cli/upgrade.test.ts` test `direct upgrade script serves help without starting an upgrade`.
  - Spawn `process.execPath` with `["scripts/upgrade.ts", "--help"]` from the repository root.
  - Assert exit `0`, stdout is `Usage: md2vid upgrade`, stderr is empty, and no upgrade process is invoked.
  - Required command: `node --test test/cli/upgrade.test.ts`.
- Success checklist:
  - [ ] The test exercises `scripts/upgrade.ts` as the actual process entry point.
  - [ ] It verifies exit `0` and the exact usage output.
  - [ ] It performs no npm installation or skill mutation.
  - [ ] Removing or breaking the main guard makes the test fail.
  - [ ] All upgrade tests and typecheck pass.

## Consolidated post-implementation checklist

- [ ] Add the global-symlink replacement regression and use the post-install global package for metadata and fresh-CLI handoff.
- [ ] Cover returned `child.error` results for npm-root lookup, npm installation, and skill refresh.
- [ ] Add automated direct-script `--help` coverage for the Task 5 main guard.
- [ ] Run `node --test test/cli/upgrade.test.ts` with all tests passing.
- [ ] Run `corepack npm run typecheck` successfully.
- [ ] Run `git diff --check` with no output.
- [ ] Confirm no test contacts the registry or writes outside test-created temporary directories.
- [ ] Confirm `git status --short` is empty.

## Command-generated mutation report

No repository mutation detected.

- Initial `git status --short`: empty.
- Final `git status --short`: empty.
- `corepack npm run typecheck` used `tsc --noEmit`.
- Upgrade tests and the focused symlink probe wrote only to OS temporary directories and removed their fixtures.
- No real upgrade, registry access, global npm mutation, Claude skill mutation, implementation edit, commit, or delegation occurred.

## Coverage gaps and residual risk

- A real npm/global installation was intentionally not exercised because it would mutate the active global package and Claude skill.
- npm’s platform-specific replacement behavior was simulated through injected process results and temporary filesystem fixtures.
- Part 2 router, packed-artifact, README, skill-guidance, full-project, and release checks are outside this grouped Part 1 Tasks 1–5 review.
- Until TEST-1 is fixed, an accepted npm-global symlink installation can report synchronized success while launching the pre-upgrade CLI and refreshing from stale package contents.
- Until TEST-2 and TEST-3 are covered, realistic returned start errors and direct-script entry behavior can regress without failing the core suite.
