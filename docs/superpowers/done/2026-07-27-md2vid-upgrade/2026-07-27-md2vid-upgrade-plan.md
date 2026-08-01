# `md2vid upgrade` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe `md2vid upgrade` command that updates a verified global npm installation to `md2vid@latest`, launches the newly installed CLI to refresh the Claude skill, and reports synchronized or recoverable partial state accurately.

**Architecture:** `scripts/upgrade.ts` validates that the running package is exactly npm's global `md2vid` package, invokes npm with fixed arguments and `shell: false`, then invokes the new absolute `dist/bin/md2vid.js` with `install-skill`. `bin/md2vid.ts` remains a dispatch-only router, while the existing atomic skill installer remains the single owner of skill copying and rollback.

**Tech Stack:** Node.js 22.18+, TypeScript ESM, `node:child_process.spawnSync`, `node:test`, npm 11.15.0, existing `parseCommand()` and package metadata helpers.

---

## Source Artifacts

- Design: `docs/superpowers/done/2026-07-27-md2vid-upgrade/2026-07-27-md2vid-upgrade-design.md`
- Standard: `docs/standards/git.md`
- Core plan: `docs/superpowers/done/2026-07-27-md2vid-upgrade/2026-07-27-md2vid-upgrade-plan-1.md`
- Integration plan: `docs/superpowers/done/2026-07-27-md2vid-upgrade/2026-07-27-md2vid-upgrade-plan-2.md`
- Execution goal: `docs/superpowers/done/2026-07-27-md2vid-upgrade/2026-07-27-md2vid-upgrade-goal.md`

## File Responsibility Map

| File | Responsibility |
|---|---|
| `scripts/upgrade.ts` | Parse arguments, verify global npm provenance, orchestrate package installation and fresh-process skill refresh, and report complete or partial state. |
| `test/cli/upgrade.test.ts` | Test every process, path, ordering, exit-code, and recovery branch without network or user-directory mutation. |
| `bin/md2vid.ts` | Register `upgrade` and list it in root help; no upgrade logic. |
| `test/cli/router.test.ts` | Verify root help, subcommand help, invalid arguments, and router boundaries. |
| `test/release/manifest.ts` | Require the compiled upgrade module in the packed artifact. |
| `test/cli/pack.test.ts` | Assert the release manifest includes the compiled module. |
| `README.md` | Document normal update and manual recovery. |
| `skill/md2vid/SKILL.md` | Teach the installed skill the new update command and retain `install-skill` for repair. |
| `test/cli/package-meta.test.ts` | Enforce public README guidance. |
| `test/cli/skill-commands.test.ts` | Enforce installed-skill command guidance. |

## Plan Parts and Dependencies

1. **Part 1 — Upgrade core:** `2026-07-27-md2vid-upgrade-plan-1.md`
   - Tasks 1–2 establish the global-install authorization boundary and recovery guidance.
   - Tasks 3–5 add success orchestration, package-failure short-circuiting, and partial skill-failure reporting.
2. **Part 2 — Integration and guidance:** `2026-07-27-md2vid-upgrade-plan-2.md`
   - Task 6 registers and packages the completed `run()` implementation.
   - Task 7 commits failing public-guidance contract tests.
   - Task 8 updates README, skill guidance, and any generated public snapshot.

Implementation is strictly sequential: Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Never dispatch implementation writers in parallel.

## Grouping and Review Lifecycle

- Tasks 1–5: `[Group: upgrade-core]` — shared module, dependency injection, and unit tests.
- Tasks 6–8: `[Group: upgrade-integration]` — one public CLI, package, and documentation contract.
- After each group completes Mode A, run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel.
- Resume the same implementer for Mode B remediation.
- The implementer may then spawn exactly one read-only verifier for the supplied checklist before the next group begins.

## Worktree and Git Rules

Before implementation, create the isolated worktree required by `docs/standards/git.md`:

```bash
git worktree add .worktrees/feat-md2vid-upgrade -b feat-md2vid-upgrade
```

All implementation and verification happens inside `.worktrees/feat-md2vid-upgrade`. Use the configured git identity and never pass author overrides. Preserve the focused Conventional Commit subjects specified by each task:

```text
feat(cli): resolve global npm installation
feat(cli): report upgrade validation failures
feat(cli): run synchronized upgrade
feat(cli): stop failed package upgrades
feat(cli): report skill refresh recovery
feat(cli): expose upgrade command
test(cli): define synchronized upgrade guidance
docs(cli): document synchronized upgrades
```

## Final Verification

Run from the implementation worktree:

```bash
corepack npm --version
node --test test/cli/upgrade.test.ts
node --test test/cli/router.test.ts test/cli/pack.test.ts
node --test test/cli/package-meta.test.ts test/cli/skill-commands.test.ts
corepack npm run check:skill-references
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check main...HEAD
git diff --check
git status --short
```

Expected:

- npm prints exactly `11.15.0`.
- Every test and npm script exits `0`.
- Both `git diff --check` commands print nothing.
- `git status --short` prints nothing after the final commit.

Do not execute a real successful `md2vid upgrade` during verification. It would mutate the active global npm installation and Claude skill; injected tests are authoritative for orchestration.

## Completion Criteria

- All eight tasks and both review/remediation/verifier cycles are complete.
- All eight design acceptance criteria are satisfied.
- Every validation failure includes its technical cause and manual global-install recovery.
- Every child-process call uses fixed arguments, the intended environment, and `shell: false`.
- npm failure skips skill refresh; every fresh-CLI failure shape reports partial completion and `md2vid install-skill` recovery with one failure prefix.
- Packed artifact coverage requires `dist/scripts/upgrade.js`.
- README and skill guidance agree on normal update, first install, and recovery.
- The full verification sequence passes with a clean worktree.
