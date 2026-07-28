# Canonical Review Artifact

- Review scope: Part 2, Tasks 6-8
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade`
- Scope mode: `dirty-baseline`
- Scope origin: `b1fff1a9052c1703e84f8d4be98e9c3ae0fed829`; baseline `/tmp/md2vid-upgrade-integration-baseline`
- Task-scope patch: `/tmp/md2vid-upgrade-integration-current/task-scope.patch`
- Created: 2026-07-28
- Tester dispatched: yes

---

## Findings

### SPEC-1 — Must fix — Regenerated public snapshot manifest was not committed
- Requirement: Part 2 Task 8 requires: “Stage `public-snapshot.json` only if the generation command changes it,” and permits the documentation commit to contain “documentation and its generated documentation snapshot only.”
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/public-snapshot.json:469` — `PublicSnapshotReport.paths["README.md"]` retains SHA-256 `224923…`, while the current `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/README.md` hashes to `4eb3d2…`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/public-snapshot.json:655` — `PublicSnapshotReport.paths["skill/md2vid/SKILL.md"]` retains SHA-256 `caf825…`, while the current skill hashes to `4550b6…`.
  - Generating a candidate from `HEAD` produced aggregate hash `sha256:fc11c857…`; the tracked manifest still contains `sha256:4f2ece48…`. `cmp` exited `1`.
  - Commit `4a128b7` contains only `README.md` and `skill/md2vid/SKILL.md`, despite the generated manifest changing.
- Guidance: Generate to an exclusive temporary directory using the required argument, then replace the tracked manifest with the generated one:
  ```bash
  out="$(mktemp -d /private/tmp/md2vid-public-snapshot.XXXXXX)"
  corepack npm run public:snapshot -- --output "$out" --ref HEAD
  cp "$out/public-snapshot.json" public-snapshot.json
  git diff -- public-snapshot.json
  ```
  Keep the resulting change within the documentation/generated-snapshot boundary; do not stage the generated snapshot directory or `dist/`.
- Success checklist:
  - [ ] A fresh `HEAD` candidate’s `public-snapshot.json` is byte-identical to the tracked manifest.
  - [ ] The manifest hashes for `README.md` and `skill/md2vid/SKILL.md` match their current contents.
  - [ ] The manifest change is committed with documentation/generated-snapshot scope only.
  - [ ] `corepack npm run public:snapshot:check`, `corepack npm run check`, and `corepack npm run release:check` exit `0`.
  - [ ] Both `git diff --check` commands print nothing, and status contains no new files besides the three explicitly excluded Part 1 review artifacts.

## Consolidated post-implementation checklist

- [ ] Resolve SPEC-1 by synchronizing the tracked public snapshot manifest with a freshly generated `HEAD` candidate.
- [x] `upgrade` is imported and registered by the dispatch-only router.
- [x] Root help contains the required synchronized-upgrade description.
- [x] `upgrade -h` and `upgrade --help` are mutation-free.
- [x] Typo options and excess positionals are rejected before mutation.
- [x] Packed-artifact coverage requires `dist/scripts/upgrade.js`.
- [x] Commit `ef72cd5` contains only Task 6 router, router-test, and package-manifest changes.
- [x] Commit `5b8d48f` contains only the failing README and installed-skill contract tests; its committed documentation still had the old contract.
- [x] README preserves first-install commands and makes `md2vid upgrade` the normal update path.
- [x] README preserves both manual recovery commands in the required order.
- [x] The shipped skill distinguishes normal upgrade from `install-skill` repair/recovery.
- [x] Commit `4a128b7` contains only documentation changes, but must incorporate the changed generated manifest per SPEC-1.
- [x] No generated `dist/` content is committed.
- [x] The three required Part 2 commits exist in the specified order with the specified subjects.
- [x] npm reports `11.15.0`.
- [x] Targeted upgrade, router, packaging, README, and skill tests pass.
- [x] Skill-reference, public-snapshot check, full check, and release check pass.
- [x] The complete test run reports 830 passed and 0 failed.
- [x] The three known Part 1 review artifacts remain the only untracked paths and were excluded from this review.

## Residual risk

A real global `md2vid upgrade` was intentionally not executed because it would mutate the active global npm installation and Claude skill; injected tests and isolated release checks remain authoritative.

The plan’s bare `corepack npm run public:snapshot` command cannot succeed because `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/feat-md2vid-upgrade/scripts/public_snapshot.ts:572` requires `--output`. Review reproduction used the equivalent explicit `--output` invocation. The existing `public:snapshot:check` validates a freshly generated temporary snapshot but does not compare it with the tracked root manifest, so it does not detect SPEC-1.
