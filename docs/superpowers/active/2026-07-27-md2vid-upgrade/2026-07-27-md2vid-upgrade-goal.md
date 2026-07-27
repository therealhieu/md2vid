# 2026-07-27-md2vid-upgrade — Execution Goal

## Persona

You are a senior implementation agent working in this repository. Follow project rules, use strict TDD, keep scope limited to the approved updater, protect user and global installation state, and create focused Conventional Commits with the repository-configured identity.

## Context

- Required execution skill: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`.
- Design: `docs/superpowers/active/2026-07-27-md2vid-upgrade/2026-07-27-md2vid-upgrade-design.md`.
- Plan index: `docs/superpowers/active/2026-07-27-md2vid-upgrade/2026-07-27-md2vid-upgrade-plan.md`.
- Core plan: `docs/superpowers/active/2026-07-27-md2vid-upgrade/2026-07-27-md2vid-upgrade-plan-1.md`.
- Integration plan: `docs/superpowers/active/2026-07-27-md2vid-upgrade/2026-07-27-md2vid-upgrade-plan-2.md`.
- Git standard: `docs/standards/git.md`.
- Goal: add a safe `md2vid upgrade` command that updates a verified global npm installation to `md2vid@latest`, launches the new CLI to refresh the Claude skill, and reports synchronized or recoverable partial state accurately.
- Architecture: `scripts/upgrade.ts` verifies the running package against `npm root --global`, invokes npm with fixed arguments and `shell: false`, validates the new package, and uses `process.execPath` plus the new absolute `dist/bin/md2vid.js` to run `install-skill`. The router only dispatches, and `scripts/install_skill.ts` remains the only skill-copy implementation.
- Tech stack: Node.js 22.18+, TypeScript ESM, npm 11.15.0, `spawnSync`, filesystem realpaths, `node:test`, existing CLI parsing and metadata helpers.
- Create `.worktrees/feat-md2vid-upgrade` on branch `feat-md2vid-upgrade`; all implementation and verification happens there.
- Execute Tasks 1–8 strictly in order. Never run implementation writers in parallel.
- Tasks 1–5 are group `upgrade-core`; Tasks 6–8 are group `upgrade-integration`. Complete each group's Mode A, parallel read-only spec/quality/tester review, Mode B remediation, and one nested read-only verifier before continuing.
- The updater supports only the package's existing macOS/Linux global npm distribution. Local dependencies, `npx`, pnpm, Yarn, Homebrew, standalone binaries, downgrade, rollback, background checks, release channels, and `sudo` retry are out of scope.
- Do not execute a real upgrade during tests. Inject and simulate npm and fresh-CLI processes.
- Do not duplicate skill installation. The fresh CLI must call the existing `install-skill` command.

## Tasks

- Execute every checkbox in `2026-07-27-md2vid-upgrade-plan-1.md`, verifying each listed red state before its minimal implementation and each listed green state afterward.
- Preserve the five core commits in order:
  - `feat(cli): resolve global npm installation`
  - `feat(cli): report upgrade validation failures`
  - `feat(cli): run synchronized upgrade`
  - `feat(cli): stop failed package upgrades`
  - `feat(cli): report skill refresh recovery`
- Complete the `upgrade-core` review, remediation, and verifier checklist before Part 2.
- Execute every checkbox in `2026-07-27-md2vid-upgrade-plan-2.md`, preserving the router-only boundary and public guidance contract.
- Preserve the three integration commits in order:
  - `feat(cli): expose upgrade command`
  - `test(cli): define synchronized upgrade guidance`
  - `docs(cli): document synchronized upgrades`
- Complete the `upgrade-integration` review, remediation, and verifier checklist.
- Run every command in the index plan's Final Verification section. Record exact failures and stop rather than claiming completion if any command is nonzero.
- If implementation must deviate from the design or plan, stop and document the concrete reason before changing scope.
- After implementation and verification, create the post-implementation check file required by the writing-plans workflow; do not create it during planning.

## Success Criteria

- Task 1 resolves only the running package's matching npm-global installation and asserts root child options.
- Task 2 gives every root lookup, path resolution, and package mismatch failure its technical cause plus both manual recovery commands.
- Task 3 performs `npm install --global md2vid@latest`, validates success, runs the fresh absolute CLI, refreshes an already-current skill, and reports old → new version.
- Task 4 prevents skill refresh after npm or updated-package failure.
- Task 5 covers start, signal, missing-status, and nonzero fresh-CLI failures with partial-state guidance, one `FAIL [upgrade]:` prefix, and `md2vid install-skill` recovery.
- Task 6 exposes and packages `upgrade` without moving orchestration into the router.
- Task 7 records failing README and skill contracts in a test-only commit.
- Task 8 makes `md2vid upgrade` the normal update path while preserving first-install and manual recovery guidance in a docs-only commit.
- Every child invocation uses exact fixed arguments, the intended environment, and `shell: false`; no user-controlled package spec or privilege escalation exists.
- Existing `install-skill` atomic staging and rollback behavior remains unchanged.
- `corepack npm --version` prints `11.15.0`; all targeted tests, skill-reference checks, public snapshot checks, full checks, and release checks exit `0`.
- `git diff --check main...HEAD`, `git diff --check`, and final `git status --short` are clean.
- No unrelated refactor, generated `dist/` commit, placeholder, or unfinished work remains.
