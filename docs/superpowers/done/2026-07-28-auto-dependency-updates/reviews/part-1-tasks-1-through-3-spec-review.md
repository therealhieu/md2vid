# Canonical Review Artifact

- Review scope: Part 1, Tasks 1-3
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `clean-head`
- Scope origin: `266ea8ee4ac9d51ceb1389f64f123f045f635dac`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.LEdV3R/task-scope.patch`
- Created: 2026-07-28
- Tester dispatched: yes

---

## Findings

### SPEC-1 — Must fix — Active tests still freeze current HyperFrames and GSAP versions
- Requirement: “Replace active version literals with derived contracts” and “HyperFrames, Remotion, React, and GSAP patch updates require no unrelated static-version edit.”
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/frameworks/hyperframes/__tests__/patch-studio.test.ts:59,78,98` — three diagnostics still require `hyperframes@0\.7\.26` instead of `HYPERFRAMES_VERSION`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/cli/hyperframes-self-heal.test.ts:170` — the anchor-mismatch diagnostic still requires `hyperframes@0\.7\.26`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/frameworks/hyperframes/__tests__/emit.test.ts:177,347` — emitted output still requires the literal GSAP `3.14.2` CDN URL.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/release/harness.ts:1911` — packed browser verification still requires response text matching `3\.14\.2`.
  - These assertions pass only because `package.json` currently retains those versions. A routine HyperFrames or GSAP patch update would make the full checks fail despite the production consumers deriving their values correctly.
- Guidance:
  - Build HyperFrames diagnostic regular expressions from the already-imported `HYPERFRAMES_VERSION`.
  - Build emitted-URL assertions from the already-imported `DEFAULT_GSAP_SRC`.
  - Match packed GSAP response content using the already-imported `GSAP_VERSION`.
  - Search both plain and regex-escaped literals, then rerun:
    ```bash
    rg -n -F '0\.7\.26' test frameworks
    rg -n -F '3\.14\.2' test frameworks
    node --test frameworks/hyperframes/__tests__/emit.test.ts
    node --test frameworks/hyperframes/__tests__/patch-studio.test.ts
    node --test test/cli/hyperframes-self-heal.test.ts
    corepack npm run check
    corepack npm run release:check
    ```
- Success checklist:
  - [ ] No active assertion encodes the current HyperFrames or GSAP version, including regex-escaped literals.
  - [ ] HyperFrames diagnostic assertions derive from `HYPERFRAMES_VERSION`.
  - [ ] Emission and packed-browser assertions derive from `DEFAULT_GSAP_SRC` or `GSAP_VERSION`.
  - [ ] Targeted, full, and release checks pass.

### SPEC-2 — Nice to have — Completed Part 1 steps remain unchecked
- Requirement: The Part 1 plan says its checkboxes track execution, and the execution goal requires every checkbox in the plan to be executed.
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/done/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan-1.md:28-648` — all 19 Task 1–3 step checkboxes remain `- [ ]`, including red-test, implementation, verification, and commit steps.
- Guidance: Mark the completed Task 1–3 steps and record the documented command correction for `public:snapshot`. Do not mark a step unless its corresponding evidence is retained.
- Success checklist:
  - [ ] Every completed Task 1–3 step is marked.
  - [ ] The snapshot step records that `corepack npm run public:snapshot` requires `--output`.
  - [ ] The successful final `corepack npm run public:snapshot:check` result remains documented.

## Consolidated post-implementation checklist

- [ ] Remove all remaining active `0\.7\.26` and `3\.14\.2` test assertions and derive them from package authority.
- [ ] Mark or explicitly account for all 19 Part 1 plan checkboxes.
- [x] Task 1 is isolated in test-only commit `ff9f661` before implementation.
- [x] Task 2 is isolated in `fe3c493`; no generated `dist/` files are committed.
- [x] Task 3 is isolated in `4bba15c`.
- [x] Commit order, Conventional Commit messages, configured identity, and clean-head boundaries match the plan.
- [x] Root `package.json` supplies HyperFrames, Remotion, React, React type, TypeScript, and GSAP operational values.
- [x] Source HyperFrames templates each contain exactly one stable GSAP token.
- [x] Built HyperFrames templates contain no unresolved GSAP token.
- [x] Default, custom-local, and historical exact canonical GSAP sources materialize correctly.
- [x] Unversioned, query-string, other-host, and protocol-relative GSAP URLs remain rejected.
- [x] HyperFrames patch version and exact anchor-count checks remain fail-closed.
- [x] Remotion and React package families remain synchronized.
- [x] Public HyperFrames and GSAP guidance is version-neutral and the shipped skill reference is synchronized.
- [x] Source templates are excluded from packed assets while materialized `dist` templates remain published.
- [x] GitHub Action contracts require upstream names, full 40-character SHAs, version comments, and shared-pin consistency without freezing current routine SHA values.
- [x] Targeted dependency-contract and workflow tests pass.
- [x] Type checking, skill-reference checking, `public:snapshot:check`, full checks, and release checks pass at the current pins.
- [x] Both diff checks produce no errors and the worktree is clean.
- [x] No out-of-scope implementation changes or untracked paths were found.

## Residual risk

- Current verification is green because the remaining frozen assertions match today’s package versions. SPEC-1 means the central goal—routine HyperFrames and GSAP patch updates without unrelated source edits—has not yet been demonstrated.
- The Task 1 red command was not re-executed against commit `ff9f661` from the current checkout. Its tree provides structural TDD evidence: the test-only commit imports `scripts/dependency_versions.ts`, while that module first appears in the following implementation commit.
- The plan command `corepack npm run public:snapshot` is not executable as written: it exits `1` with `public snapshot: --output is required`. The final exact `corepack npm run public:snapshot:check` command passes.
- Remote Dependabot automation, repository protection, rollout, and canary behavior belong to Part 2 and were not evaluated in this Part 1 review.
