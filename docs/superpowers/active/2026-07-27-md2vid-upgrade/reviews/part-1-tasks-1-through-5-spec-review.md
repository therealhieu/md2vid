# Canonical Review Artifact

- Review scope: Part 1, Tasks 1-5
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade`
- Scope mode: `clean-head`
- Scope origin: `fa7cbeb4074cb5167214b29ab49937b8f9c1e10f`
- Task-scope patch: `/tmp/md2vid-upgrade-core-scope/task-scope.patch`
- Created: 2026-07-27
- Tester dispatched: yes

---

## Findings

No findings.

## Consolidated post-implementation checklist

- [ ] Confirm `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/scripts/upgrade.ts` resolves `npm root --global` using the injected environment, `shell: false`, piped stdout, and inherited stderr.
- [ ] Confirm global and running package roots are compared after realpath resolution, and local or `npx` execution fails before mutation.
- [ ] Confirm every root lookup, path-resolution, and package-mismatch failure includes its technical cause plus `npm install --global md2vid@latest` and `md2vid install-skill`.
- [ ] Confirm invalid arguments return `2`, help returns `0`, and neither path starts npm.
- [ ] Confirm the package child uses `npm install --global md2vid@latest`, the injected environment, `shell: false`, and inherited stdio.
- [ ] Confirm an already-current installation still runs npm installation and skill refresh.
- [ ] Confirm the updated absolute `dist/bin/md2vid.js` exists and its package metadata is valid before skill refresh.
- [ ] Confirm npm start, signal, missing-status, and nonzero failures return `1` and skip skill refresh.
- [ ] Confirm the fresh CLI runs through `process.execPath` with `[<absolute-cli>, "install-skill"]`, the injected environment, `shell: false`, and inherited stdio.
- [ ] Confirm all four fresh-CLI failure shapes report partial completion, exactly one `FAIL [upgrade]:` prefix, and `recovery: md2vid install-skill`.
- [ ] Confirm success is printed only after both mutating children succeed and includes the old → new version.
- [ ] Confirm `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/test/cli/upgrade.test.ts` uses mocked children and temporary package roots without contacting the registry or mutating global npm or Claude configuration.
- [ ] Confirm the five required commits remain ordered and focused, with the repository-configured identity.
- [ ] Run `node --test test/cli/upgrade.test.ts` and confirm all 21 tests pass.
- [ ] Run `corepack npm run typecheck` and confirm exit `0`.
- [ ] Run `git diff --check` and confirm no output.
- [ ] Confirm only `scripts/upgrade.ts` and `test/cli/upgrade.test.ts` changed within the Part 1 scope.

## Residual risk

- A real public-registry global upgrade was not executed because the plan explicitly prohibits mutating the active global npm installation and Claude skill during tests. Injected orchestration tests are the specified evidence.
- Historical red-state command execution cannot be reconstructed from the final repository state; this review verified the five resulting commits, implementation, green suite, typecheck, diff checks, identity, and scope.
- Router exposure, packed-artifact coverage, public guidance, and full release verification belong to Part 2 and were outside this review scope.
