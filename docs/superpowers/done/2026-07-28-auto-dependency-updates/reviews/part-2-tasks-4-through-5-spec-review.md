# Canonical Review Artifact

- Review scope: Part 2, Tasks 4-5
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `dirty-baseline`
- Scope origin: `6825cfe19f5da332216427bb898c13ead11703e5`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines/part-2-tasks-4-through-5`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.uCCjee/task-scope.patch`
- Created: 2026-07-28
- Tester dispatched: yes

---

# Canonical Spec Review Artifact

- Review scope: Part 2, Tasks 4–5 — `dependabot-automation`
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `dirty-baseline`
- Scope origin: `6825cfe19f5da332216427bb898c13ead11703e5`
- Immutable baseline: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T/superpowers-baselines/part-2-tasks-4-through-5`
- Reconstructed task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.uCCjee/task-scope.patch`
- Status evidence: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.uCCjee/status-short`
- Untracked-path evidence: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.uCCjee/untracked.paths`
- Reviewed commits:
  - `c42f616` — `test(ci): define Dependabot patch policy`
  - `bc5f865` — `ci(deps): enable guarded patch auto-merge`
- Pre-existing untracked paths excluded from scope: the three Part 1 canonical review artifacts under `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/done/2026-07-28-auto-dependency-updates/reviews/`

---

## Findings

### SPEC-3 — Must fix — Policy tests do not reject all authority, dependency, update, or side-effect broadening

- Requirement: “Execute the policy decision table and mutate every authority boundary”; the workflow must fail closed for all authority, dependency, and update-policy mutations; merge must use the exact native `--auto --squash` command; no pull-request-controlled file may execute.

- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:317-319` — merge validation uses `assert.match(...)`, so additional flags after `--auto --squash` are accepted.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:329-334` — forbidden execution checks only a narrow list of strings. It does not reject arbitrary repository-file execution such as `node test/ci/workflows.test.ts`, `bash scripts/check.sh`, `source ./file`, or equivalent commands.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:337-385` — the policy script is extracted and executed, but its policy structure is not asserted exactly.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml:50-87` — runtime and development allowlists, branch expressions, and the patch-type condition are duplicated inline without equality checks against the Dependabot configuration and `package.json`.
  - Mutation probes against a temporary copy of the current tree all passed the 52-test suite:
    - `gh pr merge "$PR_URL" --auto --squash --delete-branch`
    - added `node test/ci/workflows.test.ts` execution step
    - added an unauthorized `left-pad` runtime dependency to the workflow allowlist
    - allowed `security-update:semver-patch`
    - broadened the Actions branch expression from the exact group to all `dependabot/github_actions/*` branches
  - The probes reported `52` tests, `52` passes, and `0` failures for each mutation.

- Impact:
  - The current workflow contains the intended commands and current allowlists, but the contract suite does not protect those boundaries against future changes.
  - A later edit could authorize an unplanned dependency, update class, branch family, merge flag, or repository-file execution path while all local workflow tests remain green.
  - This directly fails the requested “trusted policy decision table fail closed for all authority/dependency/update mutations” criterion.

- Guidance:
  - Assert exact command bodies rather than substring matches:
    - approval: exactly `gh pr review "$PR_URL" --approve`
    - merge: exactly `gh pr merge "$PR_URL" --auto --squash`
  - Enforce a closed step inventory for the privileged job. Permit only:
    - pinned `dependabot/fetch-metadata`
    - inline trusted policy validation
    - approval command
    - native squash auto-merge command
  - Replace the blacklist-only execution check with a positive policy:
    - reject every `uses:` except the exact metadata action;
    - reject every `run:` except the exact approved command bodies and inline policy script;
    - reject repository paths, shell sourcing, interpreters receiving file paths, package installation, builds, imports, checkout, and arbitrary GitHub CLI/API mutations.
  - Assert policy constants against source-of-truth metadata:
    - runtime allowlist equals all `dependencies` plus `optionalDependencies`;
    - development allowlist equals all `devDependencies`;
    - branch expressions equal the three intended group names;
    - update type equals only `version-update:semver-patch`;
    - Actions group accepts only the exact `actions-patches` branch family.
  - Add mutation cases for each authority boundary:
    - actor;
    - repository;
    - PR author;
    - base branch;
    - runtime group branch;
    - development group branch;
    - Actions group branch;
    - patch/minor/major/security update types;
    - each runtime and development allowlist;
    - metadata action identity and SHA;
    - approval command;
    - exact merge flags;
    - arbitrary additional steps and repository-file execution.

- Success checklist:
  - [ ] Every privileged step has an exact positive contract.
  - [ ] Additional merge flags fail the policy test.
  - [ ] Arbitrary repository-file execution fails the policy test.
  - [ ] Runtime and development allowlists are checked for exact equality with package metadata.
  - [ ] Group branch expressions cannot be broadened without a failing test.
  - [ ] Only `version-update:semver-patch` is eligible.
  - [ ] Metadata action identity, full SHA, and version comment remain constrained.
  - [ ] All authority, dependency, update, and side-effect mutations fail closed.
  - [ ] The focused workflow test remains green after the contract strengthening.

### SPEC-4 — Nice to have — Tasks 4–5 execution checkboxes remain unrecorded

- Requirement: The execution goal requires every checkbox in `2026-07-28-auto-dependency-updates-plan-2.md` to be executed and the group review/verifier lifecycle to be completed.

- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/done/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-plan-2.md:23-644` — Task 4, Task 5, and the group review/verifier checklist remain marked `- [ ]`.
  - The implementation commits and command evidence demonstrate execution, but the plan itself does not record which red tests, green checks, review steps, remediation steps, and verifier checks were completed.

- Guidance:
  - Mark each completed Task 4–5 checkbox only after retaining its corresponding evidence.
  - Record the verified red state from `c42f616`: `52` tests, `48` passed, `4` failed.
  - Record the green state after `bc5f865`, including the focused tests, actionlint, snapshot check, full check, and release check.
  - Record the mutation-probe result and the unresolved SPEC-3 contract gap rather than marking the affected verifier item complete.

- Success checklist:
  - [ ] Task 4 red-test checkbox is marked with its `48/52` evidence.
  - [ ] Task 5 focused, lint, snapshot, full, and release checks are recorded.
  - [ ] Group review and verifier checkboxes identify completed and unresolved items.
  - [ ] The SPEC-3 contract gap is not represented as verified until remediated.

### SPEC-5 — Nice to have — Required post-implementation check artifact is absent

- Requirement: The execution goal requires creation of the post-implementation check file required by the writing-plans workflow after implementation and verification.

- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/done/2026-07-28-auto-dependency-updates/2026-07-28-auto-dependency-updates-goal.md:48` — explicitly requires the post-implementation check file.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/docs/superpowers/done/2026-07-28-auto-dependency-updates/` contains the goal, design, research, plan files, and review directory, but no Part 2 post-implementation check file.

- Guidance:
  - Create the required check artifact after SPEC-3 remediation and final verification.
  - Include command results, commit boundaries, scope confirmation, and the remaining Task 6 remote-rollout dependency.
  - Do not treat the three pre-existing Part 1 review artifacts as the Part 2 check artifact.

- Success checklist:
  - [ ] The required Part 2 post-implementation check file exists.
  - [ ] It records the final verification commands and results.
  - [ ] It records that Task 6 remote settings and canary work remain unexecuted.

---

## Consolidated post-implementation checklist

### Scope and commit boundaries

- [x] Only `c42f616`, `bc5f865`, and the dirty-baseline delta are in scope.
- [x] The scoped delta contains only:
  - `.github/dependabot.yml`
  - `.github/workflows/dependabot-auto-merge.yml`
  - `test/ci/workflows.test.ts`
  - `public-snapshot.json`
- [x] No Task 6 remote settings or remote rollout changes are present.
- [x] No unrelated source refactor or generated `dist/` commit is present.
- [x] Commit messages are Conventional Commits:
  - `test(ci): define Dependabot patch policy`
  - `ci(deps): enable guarded patch auto-merge`
- [x] Commit identity uses the configured repository identity.
- [x] Commit order matches the plan.
- [x] `git diff --check 6825cfe19f5da332216427bb898c13ead11703e5..HEAD` passes.
- [x] Dirty `git diff --check` passes.
- [x] The only untracked paths are the three pre-existing Part 1 review artifacts, excluded from this review.

### Task 4 contract coverage

- [x] Workflow inventory registers `dependabot-auto-merge.yml`.
- [x] The privileged job runner is constrained to `ubuntu-latest`.
- [x] Root package metadata is loaded for dependency coverage checks.
- [x] The two npm groups and one Actions group are structurally checked.
- [x] The workflow uses the `pull_request` trigger.
- [x] Actor, repository, PR-author, and base-branch guards are structurally checked.
- [x] Job permissions are exactly `contents: write` and `pull-requests: write`.
- [x] Top-level permissions are `{}`.
- [x] Checkout, `pull_request_target`, package installation, and known project execution patterns are rejected.
- [x] Approval and merge failures are not suppressed by `continue-on-error`, `|| true`, or `set +e`.
- [x] The red state is reproducible from `c42f616`: `52` tests, `48` passed, `4` failed.
- [ ] The policy tests reject every broadened dependency, update-type, branch, command, and arbitrary execution mutation. See SPEC-3.

### Task 5 Dependabot configuration

- [x] npm and GitHub Actions remain separate ecosystems.
- [x] npm schedule remains weekly on Monday at `04:17`.
- [x] GitHub Actions schedule remains weekly on Monday at `04:23`.
- [x] Both ecosystems retain an open PR limit of `5`.
- [x] Both ecosystems use the `chore(deps)` commit-message prefix.
- [x] `runtime-patches` exists.
- [x] `dev-patches` exists.
- [x] `actions-patches` exists.
- [x] Runtime patterns cover all current root `dependencies` and `optionalDependencies`:
  - `hyperframes`
  - `@remotion/google-fonts`
  - `@remotion/media`
  - `react`
  - `react-dom`
  - `remotion`
- [x] Development grouping uses `dependency-type: development`.
- [x] GSAP is included in the development dependency set and workflow allowlist.
- [x] All groups are patch-only.
- [x] No `ignore` rule or patch exclusion is present.
- [x] Minor and major updates remain unmatched and manual.
- [x] No Task 6 remote configuration is included.

### Guarded workflow

- [x] Trigger is exactly `pull_request`, not `pull_request_target`.
- [x] Actor guard requires `dependabot[bot]`.
- [x] PR author guard requires `dependabot[bot]`.
- [x] Repository guard requires `therealhieu/md2vid`.
- [x] Base branch guard requires `main`.
- [x] Metadata action is `dependabot/fetch-metadata`.
- [x] Metadata action uses the full SHA `21025c705c08248db411dc16f3619e6b5f9ea21a`.
- [x] The SHA resolves to upstream `v2.5.0`.
- [x] The workflow contains no checkout.
- [x] The workflow contains no install, build, import, or project-script execution.
- [x] The policy rejects empty dependency metadata.
- [x] Runtime and development names are checked against explicit allowlists.
- [x] Actions updates are limited to the Actions group branch family.
- [x] Eligibility requires `version-update:semver-patch`.
- [x] Only eligible updates reach the approval and merge steps.
- [x] Approval uses `gh pr review "$PR_URL" --approve`.
- [x] Native merge uses `gh pr merge "$PR_URL" --auto --squash`.
- [x] `--admin`, `--merge`, and `--rebase` are rejected.
- [x] There is no immediate unconditional merge.
- [ ] The test contract enforces the exact merge command rather than a substring.
- [ ] The test contract positively constrains all privileged steps.
- [ ] The test contract rejects all arbitrary PR-file execution forms.
- [ ] The test contract detects every authority/dependency/update-policy broadening. See SPEC-3.

### Snapshot and local verification

- [x] `corepack npm --version` prints `11.15.0`.
- [x] `node --test test/ci/workflows.test.ts` passes: `52/52`.
- [x] `node --test test/cli/dependency-versions.test.ts` passes: `7/7`.
- [x] `corepack npm run public:snapshot:check` passes.
- [x] `corepack npm run check:skill-references` passes.
- [x] `corepack npm run check` passes: `843` tests, `843` passed, `0` failed.
- [x] `corepack npm run release:check` passes: `843` tests, `843` passed, `0` failed.
- [x] `actionlint -config-file .github/actionlint.yaml` passes.
- [x] The public snapshot includes the new workflow and updated Dependabot/test hashes.
- [x] No unresolved GSAP template token or unrelated generated output was introduced.
- [ ] The required post-implementation check artifact exists. See SPEC-5.

### Task 6 boundary

- [x] No remote settings were changed in this scope.
- [x] No branch protection was changed in this scope.
- [x] No Actions approval permission was changed in this scope.
- [x] Native repository auto-merge was not enabled in this scope.
- [ ] Stable required-check names have not been verified against merged `main`.
- [ ] A real Dependabot patch canary has not been observed.
- [ ] A negative live Dependabot case has not been observed.
- [ ] Remote rollout remains Task 6 work after merge and explicit confirmation.

---

## Residual risk

- The current implementation is structurally aligned with the intended Dependabot grouping and guarded auto-merge design, and all current local checks pass.
- SPEC-3 remains material because the policy tests do not prove that future edits fail closed across every authority, dependency, update-type, branch, command, and execution boundary. Temporary mutation probes demonstrated that unsafe broadenings can retain a green `52/52` workflow test result.
- The current runtime and development allowlists match `package.json`, including GSAP, but the tests do not enforce that equality against future changes.
- The exact metadata SHA was independently verified against upstream `v2.5.0`; the local contract currently checks the immutable SHA shape and version comment rather than asserting the resolved release identity.
- Repository protections, Actions approval permission, native auto-merge, required check enforcement, and canary ordering remain unverified because they belong to Task 6 and were correctly excluded from this local scope.
- The full and release checks passed at the current dependency versions; this does not substitute for a real grouped Dependabot PR canary.
- The required post-implementation check artifact has not been created.
