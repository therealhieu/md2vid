# Canonical Review Artifact

- Review scope: Part 1, Tasks 1-3
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `clean-head`
- Scope origin: `266ea8ee4ac9d51ceb1389f64f123f045f635dac`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.LEdV3R/task-scope.patch`
- Created: 2026-07-28
- Tester dispatched: yes

---

## Findings

### CQ-1 — Must fix — Published source adapters import files omitted from the package
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/package.json:32-46` — the tarball includes `frameworks/` but not `scripts/`, and now explicitly excludes `frameworks/hyperframes/templates/**`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/frameworks/hyperframes/scaffold.ts:12-23` — the published source adapter imports `../../scripts/dependency_versions.ts` and resolves templates from the excluded source-template directory.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/frameworks/remotion/scaffold.ts:10-16` — the published Remotion source adapter imports the same omitted module.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/cli/dependency-versions.test.ts:62-75` — source behavior is tested only in the repository checkout, not from the packed artifact.
- Why it is wrong: The change breaks a previously shipped source path. An actual tarball contains `frameworks/hyperframes/scaffold.ts` and `frameworks/remotion/scaffold.ts`, but omits `scripts/dependency_versions.ts`. Importing the packed HyperFrames adapter fails with:
  ```text
  ERR_MODULE_NOT_FOUND: Cannot find module '.../package/scripts/dependency_versions.ts'
  ```
  Even after supplying that module, HyperFrames source scaffolding would not find its templates because their source path is excluded. Compiled `dist/` behavior works, but source, distribution, and packed contexts no longer have equivalent package-root behavior.
- Guidance: Preserve the packed source-adapter contract. Ensure every dependency required by the shipped source adapters is packed, and give the HyperFrames source adapter access to materialized templates without shipping unresolved tokens. Add a pack-level regression that extracts the tarball from an unrelated directory, imports both source scaffold modules, and executes `scaffoldSpec()`. Validate with:
  ```bash
  cd /Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl
  tmp=$(mktemp -d)
  corepack npm pack --pack-destination "$tmp"
  tar -xzf "$(find "$tmp" -name '*.tgz' -print -quit)" -C "$tmp"
  cd "$tmp/package"
  node -e "Promise.all([import('./frameworks/hyperframes/scaffold.ts'), import('./frameworks/remotion/scaffold.ts')]).then(([hf, remotion]) => { hf.scaffoldSpec('test'); remotion.scaffoldSpec('test'); })"
  ```
- Success checklist:
  - [ ] Both packed source scaffold modules import successfully from an unrelated working directory.
  - [ ] Calling both packed `scaffoldSpec()` functions succeeds.
  - [ ] Packed HyperFrames templates contain no unresolved `__MD2VID_GSAP_SRC__` token.
  - [ ] Compiled `dist/` scaffolding continues to use materialized templates.
  - [ ] A release/pack test fails if a shipped source adapter references an omitted module or asset.

### CQ-2 — Must fix — Security exception rationales retain mutable dependency versions
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/security/audit-exceptions.json:7` — the active sharp exception describes the “Current path” as `hyperframes@0.7.26 -> sharp@0.34.5`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/security/audit-exceptions.json:16` — the active adm-zip exception describes current paths using `hyperframes@0.7.26` and exact transitive versions.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/scripts/check_audit_policy.ts:195-228` — exception validation requires a non-empty rationale but does not verify that dependency versions named by the rationale match the lockfile.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/scripts/check_audit_policy.ts:231-260` — approval identity excludes the rationale, so a HyperFrames patch can leave inaccurate “Current path” text while the exception continues to pass.
- Why it is wrong: The task removes operational static-version coupling specifically so HyperFrames patches can merge automatically, but active security-boundary documentation still freezes the old root and transitive versions. If an update preserves the same advisory tuple while changing those versions or exposure details, `security:audit` remains green with a stale justification. This weakens the fail-closed security review record.
- Guidance: Make active exception rationales version-neutral where the exact version is not part of the exception identity—for example, describe the current dependency path and constrained upstream range without embedding the mutable md2vid HyperFrames pin. Add a contract test rejecting operational root-version literals such as `hyperframes@\d+\.\d+\.\d+` in active exception rationales. Keep historical compatibility ranges, such as the patch-anchor comment, unchanged where the version range is deliberate evidence. Validate with:
  ```bash
  cd /Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl
  rg -n 'hyperframes@\d+\.\d+\.\d+' security/audit-exceptions.json
  corepack npm run security:audit
  node --test test/cli/dependency-versions.test.ts
  ```
- Success checklist:
  - [ ] Active audit-exception rationales contain no mutable md2vid HyperFrames version literal.
  - [ ] Each rationale still explains the affected path, exposure, compensating constraint, and removal condition.
  - [ ] Audit policy remains fail-closed for stale, expired, malformed, and unapproved exceptions.
  - [ ] A test prevents operational dependency pins from reappearing in active security rationales.

## Consolidated post-implementation checklist

- [ ] Extract the real npm tarball and successfully import and execute both published source scaffold adapters.
- [ ] Verify source templates retain exactly one stable token while every packed and `dist/` template contains none.
- [ ] Verify active audit-exception rationales remain accurate across routine HyperFrames patch changes.
- [ ] Run `node --test test/cli/dependency-versions.test.ts test/ci/workflows.test.ts`.
- [ ] Run the HyperFrames emit, patch, CLI, and scaffold tests.
- [ ] Run `corepack npm run typecheck`.
- [ ] Run `corepack npm run check:skill-references`.
- [ ] Run `corepack npm run public:snapshot:check`.
- [ ] Run `corepack npm run check`.
- [ ] Run `corepack npm run release:check`.
- [ ] Run both `git diff --check` commands and confirm `git status --short` is empty.
- [ ] Confirm `git ls-files 'dist/**'` remains empty.

## Verification gaps and residual risk

Independent verification completed:

- `corepack npm --version` returned `11.15.0`.
- Dependency and workflow contracts passed: 55/55.
- HyperFrames, patch, CLI, and scaffold tests passed: 84/84.
- TypeScript type-checking passed.
- Both diff checks passed and the worktree remained clean.
- Generated `dist/` is ignored and no `dist/**` file is committed.
- Built templates were materialized correctly.
- An actual packed-source import reproduced CQ-1.

The full `corepack npm run check` and `corepack npm run release:check` results were not independently rerun during this review; Mode A reports them passing. Future HyperFrames patch compatibility also cannot be proven in advance, so the existing exact-version and patch-anchor checks must remain the blocking compatibility gate.
