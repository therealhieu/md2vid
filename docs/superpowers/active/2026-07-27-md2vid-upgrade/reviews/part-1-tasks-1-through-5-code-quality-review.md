# Canonical Review Artifact

- Review scope: Part 1, Tasks 1-5
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade`
- Scope mode: `clean-head`
- Scope origin: `fa7cbeb4074cb5167214b29ab49937b8f9c1e10f`
- Task-scope patch: `/tmp/md2vid-upgrade-core-scope/task-scope.patch`
- Created: 2026-07-27
- Tester dispatched: yes

---

## Findings

### CQ-1 — Must fix — Pre-upgrade realpath can authorize and execute a stale linked checkout
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/scripts/upgrade.ts:87-101 — resolveGlobalInstallation()` canonicalizes `<global-root>/md2vid` immediately and stores `cliEntry` under that pre-install realpath. `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/scripts/upgrade.ts:171-201 — run()` reuses the stored path after npm replaces the package instead of resolving the current global entry again.
- Why it is wrong: `npm link` creates `<global-root>/md2vid` as a symlink to a development checkout. Realpath equality therefore accepts that checkout and starts the mutating npm command. npm 11.15.0 was then reproduced replacing the linked entry with a normal installed directory, but `run()` still read and executed the old checkout. The isolated probe returned `0`, launched the old CLI, and reported `0.1.11 → 0.1.11` even though the global entry now resolved to `0.1.12`. This violates both the local-invocation authorization boundary and the requirement to execute the newly installed CLI.
- Guidance: Preserve the lexical `<global-root>/md2vid` path. Reject a symlinked package entry before mutation because linked development checkouts are outside the supported distribution, then resolve that lexical path again after npm succeeds. Derive `cliEntry` from the post-install realpath and confirm `readPackageMetadata()` resolves to that refreshed package root before spawning it. Add regression tests covering a globally linked checkout and replacement of the global package entry. Validate with:
  `node --test --test-name-pattern="linked global|post-install package" test/cli/upgrade.test.ts && node --test test/cli/upgrade.test.ts && corepack npm run typecheck && git diff --check`
- Success checklist:
  - [ ] A local checkout exposed through `<global-root>/md2vid` as a symlink fails before `npm install --global md2vid@latest` starts.
  - [ ] After npm succeeds, metadata and `install-skill` use the package currently reachable through `<global-root>/md2vid`, not its pre-install realpath.
  - [ ] A simulated package-entry replacement launches the new CLI and reports the new version.
  - [ ] All 21 existing upgrade tests plus the new regressions pass.

## Consolidated post-implementation checklist
- [ ] Reject linked development package roots before any mutation.
- [ ] Re-resolve and validate the global package root and absolute CLI path after npm installation.
- [ ] Prove package-entry replacement launches the updated CLI rather than the pre-upgrade target.
- [ ] Run `node --test test/cli/upgrade.test.ts`.
- [ ] Run `corepack npm run typecheck`.
- [ ] Run `git diff --check`.

## Verification gaps and residual risk

The existing upgrade suite passed 21/21, typecheck passed, the scoped diff check passed, and the worktree was clean. No real registry upgrade or Claude skill mutation was executed, as required by the plan. An isolated npm 11.15.0 prefix experiment confirmed that installing a package can replace a globally linked package symlink with a normal directory. Full-project and release verification remain outside this Part 1 review cycle.

Sources:

- [npm link — npm CLI v11](https://docs.npmjs.com/cli/v11/commands/npm-link/) — documents the global package symlink created for a development checkout.
- [npm install — npm CLI v11](https://docs.npmjs.com/cli/v11/commands/npm-install/) — documents global installation and local-folder link behavior.
- [npm folders](https://docs.npmjs.com/files/folders.html/) — documents the Unix global package location used by the authorization check.
