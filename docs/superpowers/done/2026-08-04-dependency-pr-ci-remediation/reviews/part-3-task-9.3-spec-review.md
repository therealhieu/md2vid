# Canonical Review Artifact

- Review scope: Part 3, Task 9.3 deviation prerequisite
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/dependency-pr-ci-blockers/.worktrees/hyperframes-0-7-88`
- Scope mode: `clean-head`
- Scope origin: `82a4044d04e495d9883ccb79302e4d2f3f2c7cf0`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.hyperframes-0.7.88.obdGZz/task-scope.patch`
- Created: 2026-08-05
- Tester dispatched: yes

---

## Spec Review — Part 3, Task 9.3 Prerequisite

### Must fix

#### SPEC-9.3-1 — Evidence omits required public, full, and release verification

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/dependency-pr-ci-blockers/.worktrees/hyperframes-0-7-88/docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/unit-b-hyperframes-0.7.88.md:35-41` records only the focused `13/13` and `14/14` tests plus package/lock state. It does not record the required public-snapshot, full-suite, and release checks.

Update the evidence-only record to include:

- `corepack npm run public:snapshot:check` — pass.
- `corepack npm run check` — `1,283/1,283`, `0` failures.
- `corepack npm run release:check` — pass, including `OK [all]`.
- `git diff --check` and clean working-tree results.

These checks were independently run during this review and exited successfully, but the committed compatibility proof must retain them as durable evidence.

### Nice to have

None.

### Evidence

- Scope is exact and clean:
  - Only changed path: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/dependency-pr-ci-blockers/.worktrees/hyperframes-0-7-88/docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/unit-b-hyperframes-0.7.88.md`
  - `git diff --check 82a4044d04e495d9883ccb79302e4d2f3f2c7cf0 f577c1a` passed.
  - The working tree is clean.
- Published-package proof in `unit-b-hyperframes-0.7.88.md:3-12` is correct:
  - Registry tarball: `https://registry.npmjs.org/hyperframes/-/hyperframes-0.7.88.tgz`
  - Registry and independently downloaded SHA-1: `5555ed44070807cb1e94ae9bccb8d3de7d9b822e`
  - Three Studio `index-*.js` candidates exist.
  - Exactly one candidate has known patch markers: `dist/studio/assets/index-DbY124Po.js`.
- The actual published candidate has the existing `0.7.87` anchor pair:
  - Original anchors: `1/1`.
  - First-application patched markers: `1/1`.
  - Original anchors after patch: `0/0`.
  - A second application returns identical bytes.
- The existing fail-closed contract remains appropriate:
  - `frameworks/hyperframes/patches.ts:103-108` selects exactly one matching variant.
  - `frameworks/hyperframes/patches.ts:141-153` selects exactly one matching Studio bundle.
  - The staged promotion, lock, exact version pin, and postinstall propagation code is untouched because this commit changes evidence only.
- The no-production-change TDD deviation is explicitly and honestly explained in `unit-b-hyperframes-0.7.88.md:28-33`:
  - Existing executable `0.7.87` coverage already accepts the byte-identical published anchors.
  - A new behavior test would pass before any production change, so it cannot establish RED.
  - A duplicate variant would violate the one-variant fail-closed selector.
  - No source-only test, duplicate variant, or production mutation was created.
- Fresh focused verification:
  - `node --test frameworks/hyperframes/__tests__/patch-studio.test.ts` → `13/13`.
  - `node --test test/cli/hyperframes-self-heal.test.ts` → `14/14`.
- Root dependency ownership is preserved:
  - `package.json` and `package-lock.json` are unchanged from both scope origin and `origin/main`.
  - Root `hyperframes` remains `0.7.80`; this evidence does not promote `0.7.88` into the root lockfile.

### Guidance

Keep this as an evidence-only deviation. Do not add a `0.7.88`-labeled production variant or a synthetic RED test for byte-identical published bytes. Complete the durable verification record required by `SPEC-9.3-1`; future upstream byte changes must receive a genuine RED → GREEN compatibility change.

### Success checklist

- [x] Scope contains only the designated evidence file.
- [x] Tarball URL, pack filename, and SHA-1 identify published `hyperframes@0.7.88`.
- [x] Candidate count is `3`; exactly one Studio bundle matches.
- [x] Exactly one existing `0.7.87` patch variant matches.
- [x] Original anchors are `1/1`; patched markers are `1/1`; original anchors become `0/0`.
- [x] Second patch application is byte-idempotent.
- [x] One-variant/one-bundle, staged promotion, locking, pin enforcement, and postinstall behavior remain unchanged.
- [x] Root package and lock remain unchanged; root HyperFrames remains `0.7.80`.
- [x] The evidence explains why production TDD work stopped without manufacturing RED.
- [ ] Durable evidence records public-snapshot, `1,283/1,283` full-suite, release, whitespace, and clean-tree outcomes.

### Consolidated checklist

```text
Task scope            → one evidence file only
Published package     → tarball + SHA-1 verified
Bundle selection      → 3 candidates → 1 matching bundle
Variant selection     → 1 existing 0.7.87 variant
Patch semantics       → anchors 1/1 → markers 1/1 → anchors 0/0
Idempotence           → second application preserves bytes
TDD deviation         → no honest RED; no contrived production/test mutation
Behavior preservation → code, lock, root pin, and postinstall unchanged
Verification record   → focused checks recorded; public/full/release missing
```

### Residual risks

- This proof applies only to the published `0.7.88` tarball with SHA-1 `5555ed44070807cb1e94ae9bccb8d3de7d9b822e`; a republished or later HyperFrames package requires fresh byte-level verification.
- The compatibility patch intentionally fails closed if upstream changes the bundle count, anchor variant count, or exact anchors.
- Until `SPEC-9.3-1` is resolved, the committed evidence does not independently preserve the full public/release verification trail.
