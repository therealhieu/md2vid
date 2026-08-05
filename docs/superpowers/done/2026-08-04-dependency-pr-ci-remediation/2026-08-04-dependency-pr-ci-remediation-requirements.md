# Dependency PR CI Remediation — Requirements

## Table of Contents

- [Problem](#problem)
- [Goal](#goal)
- [Confirmed Evidence](#confirmed-evidence)
- [Project Context](#project-context)
- [Scope](#scope)
- [Constraints](#constraints)
- [Decisions](#decisions)
- [Functional Requirements](#functional-requirements)
- [Security Requirements](#security-requirements)
- [Operational Requirements](#operational-requirements)
- [Non-Goals](#non-goals)
- [Success Criteria](#success-criteria)
- [Risks and Assumptions](#risks-and-assumptions)

## Problem

The Dependabot reliability work merged in PR #50 repaired title validation, trusted ineligible no-op handling, dependency-family grouping, and stale-branch refresh. Four open dependency PRs are still blocked by compatibility and artifact-contract failures outside that automation layer:

```text
#47 runtime-patches
  → HyperFrames 0.7.87 changes minified Studio identifiers
  → exact caption-loop patch resolver finds no known bundle
  → postinstall fails
  → all validation stops before tests
  → after that is fixed, strict tracked-snapshot equality also becomes stale

#48 dev-patches
  → package-lock.json changes
  → tracked public-snapshot.json still hashes the old lockfile
  → public-snapshot / validate fails
  → both normal validation lanes otherwise pass

#49 TypeScript 7
  → generated Remotion scaffold inherits root TypeScript 7
  → Remotion bundler requires the JavaScript compiler API
  → typescript.sys/readConfigFile are unavailable from the TypeScript 7 default package entry
  → generated-project render smoke fails

#51 create-github-app-token v3
  → privileged workflow pin changes
  → exact security-policy tests and mutation sentinels still approve v2.2.2
  → workflow tests fail intentionally
  → tracked public snapshot also becomes stale
```

The snapshot failure is cross-cutting. `package.json`, `package-lock.json`, `.github/**`, and `test/**` are hashed public inputs, while eligible Dependabot PRs must remain one verified bot-authored commit with no maintainer-generated companion artifact. An exact checked-in mirror cannot remain a required per-commit equality gate and simultaneously allow immutable dependency PRs to merge.

## Goal

Resolve the current dependency PR CI blockers without weakening branch protection, dependency compatibility checks, release smoke coverage, public-source security scanning, or the trusted Dependabot boundary:

1. Preserve the required `public-snapshot / validate` check while making it validate the current committed tree dynamically instead of requiring a manually refreshed mirror on every dependency commit.
2. Add exact HyperFrames `0.7.87` Studio patch compatibility and retain fail-closed anchor selection.
3. Defer TypeScript 7 and replace it with a controlled TypeScript 6 update that passes the complete Remotion release path.
4. Upgrade `actions/create-github-app-token` to `v3.2.0` only through a human-owned, security-reviewed replacement that updates every coupled policy assertion.
5. Process #47 before #48, leave eligible Dependabot branches untouched, and use the existing trusted refresh/native auto-merge path.
6. Record enough local and remote evidence to distinguish source fixes, dependency compatibility, workflow-policy approval, and operational rollout.

## Confirmed Evidence

### Current baseline

- The dedicated worktree starts from `origin/main` commit `242fdc382f2e99da6c557eb1d8329f5295b31b5f`.
- `corepack npm ci && corepack npm run check` passes with `1,274` tests and `0` failures.
- PR #50 already merged the Dependabot reliability implementation.
- PR #52 separately records that the #47 branch-refresh canary stopped because #47 was current and blocked; this work uses a separate artifact directory to avoid editing PR #52's files.

### Public snapshot contradiction

- `scripts/public_snapshot.ts:25-49` includes `package.json`, `package-lock.json`, `.github/**`, and `test/**` in the public source set.
- `scripts/check_public_snapshot.ts:55-80` requires the tracked manifest to equal a newly generated report for the current committed tree.
- `scripts/check_public_snapshot.ts:222-269` also independently builds and validates a fresh snapshot repository and runs release validation.
- `scripts/public_snapshot.ts:302-399` selects committed Git-tree content and scans it for credentials, developer paths, vendored code, and prohibited content.
- `scripts/public_snapshot.ts:481-533` materializes and verifies the generated snapshot and manifest.
- `test/ci/public-snapshot-check.test.ts:114-138` currently requires every stale tracked-manifest field to fail.

Therefore, the substantive dynamic snapshot, security, package, and release validation can remain strict even if tracked-manifest equality is no longer a prerequisite for every PR commit.

### PR #47 — HyperFrames exact-anchor drift

- All three failed jobs stop during `npm ci` with:

  ```text
  FAIL [patch-studio]: hyperframes@0.7.87 caption-loop bundle matched 0 file(s), expected 1
  ```

- `postinstall.mjs:7-15` always invokes the HyperFrames Studio patch.
- `frameworks/hyperframes/patches.ts:19-34` supports only the `Qn/g/A` and `tr/p/A` minified variants.
- `frameworks/hyperframes/patches.ts:96-100,134-145` requires exactly one known variant and exactly one matching bundle.
- HyperFrames `0.7.87` still contains the affected repeated-fetch flow, but its exact markers are `rr/p/v`.
- The same failure occurs on Node 22 and Node 26, so it is not Node-specific.
- The Remotion `4.0.503` updates in #47 have not reached project tests because installation stops first.

### PR #48 — stale mirror only

- The only failed check is `public-snapshot / validate`.
- Both `pr-minimum / validate` and `pr-latest / validate` pass.
- The PR changes only `package-lock.json`, updating React type patch versions.
- There is no observed typecheck, test, or dependency compatibility failure.

### PR #49 — TypeScript 7 and Remotion are incompatible

- The release smoke fails inside the generated Remotion project at `@remotion/bundler`:

  ```text
  TypeError: Cannot read properties of undefined (reading 'readFile')
  ```

- `scripts/dependency_versions.ts:58,83-87` copies the root TypeScript version into generated Remotion scaffolds.
- `frameworks/remotion/scaffold.ts:37-50` emits those dependencies.
- `test/release/harness.ts:2533-2551` exercises the real generated-project bundle/render path.
- Remotion `4.0.500` and `4.0.503` load `require("typescript")` and call `readConfigFile(..., typescript.sys.readFile)`.
- TypeScript 6 is the final JavaScript-based compiler release; TypeScript 7 is the native rewrite and does not preserve the same default JavaScript compiler API contract.
- The recorded `pr-title` failure is stale: current `main` already accepts this exact individual Dependabot title and correctly leaves it manual.

### PR #51 — exact privileged-workflow contract drift

- The PR changes only the full SHA/version comment for `actions/create-github-app-token` in `.github/workflows/dependabot-branch-refresh.yml`.
- `test/ci/workflows.test.ts:2111-2147` approves the exact current action SHA and exact permitted external-action inventory.
- `test/ci/workflows.test.ts:3044-3090` mutation-tests that pin; its source mutation becomes a no-op when only the workflow changes.
- The v3 action runs on Node 24; self-hosted runners require Actions Runner `2.327.1+`, while this repository uses GitHub-hosted `ubuntu-latest`.
- v3.2.0 has no action proxy input; Node proxy environment support is opt-in through `NODE_USE_ENV_PROXY=1`. This checkout-free privileged workflow intentionally declares no proxy environment.
- Existing repository scoping, `permission-*` inputs, and default end-of-job token revocation remain available.
- `app-id` remains accepted, though `client-id` is preferred. Credential-name migration is not required for this remediation.

## Project Context

- `.github/workflows/ci.yml` owns required PR title validation and calls the reusable validation workflow.
- `.github/workflows/validate.yml` owns minimum, latest, and public-snapshot validation execution.
- `.github/workflows/dependabot-auto-merge.yml` requires one verified Dependabot commit, exact patch-group metadata, no maintainer changes, and exact-head native squash auto-merge.
- `.github/workflows/dependabot-branch-refresh.yml` may rebase only the oldest eligible stale patch PR using a repository-scoped GitHub App token.
- `scripts/public_snapshot.ts` owns committed public-source selection, scanning, materialization, and manifest generation.
- `scripts/check_public_snapshot.ts` owns the required fresh-snapshot validation path.
- `frameworks/hyperframes/patches.ts` owns exact Studio patch variants and fail-closed patch application.
- `scripts/dependency_versions.ts` is the package-version authority for generated HyperFrames and Remotion scaffolds.
- `test/release/harness.ts` is the end-to-end generated-project compatibility boundary.
- `test/ci/workflows.test.ts` is a security contract, not a snapshot of incidental workflow syntax.
- `public-snapshot.json` is currently a checked-in report generated from public source; the required check also generates and validates a fresh isolated snapshot independently.

This work extends the decisions in:

- `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-requirements.md`
- `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-design.md`

The inherited trust, branch-refresh, ordering, and auto-merge decisions remain authoritative. This requirements document supersedes only their non-goals concerning public-snapshot architecture, TypeScript 7 disposition, and the fixed v2 action pin.

## Scope

### In scope

- Dynamic public-snapshot validation that remains required for every PR and validates the current committed tree without requiring a maintainer-refreshed tracked mirror.
- Preservation of public-source selection, content scanning, isolated materialization, hash verification, package construction, and release smoke validation.
- Exact HyperFrames `0.7.87` caption-loop patch support with unit and self-healing coverage.
- TypeScript 7 formal deferral and a controlled TypeScript 6 successor validated through generated Remotion build/render.
- A human-owned `actions/create-github-app-token v3.2.0` replacement with exact full-SHA policy, mutation tests, and post-merge operational evidence.
- Ordered handling of PRs #47, #48, #49, and #51.
- Updated Superpowers implementation plan, goal, verification, and evidence artifacts created after this requirements/design pair is approved.

### Out of scope

- Weakening or removing any required branch-protection check.
- Removing public-source scanning, isolated snapshot construction, package verification, or release validation.
- Broad or regex-based patching of arbitrary HyperFrames minified bundles.
- Making TypeScript 7 compatible by importing unstable native compiler APIs.
- Removing the Remotion generated-project render smoke.
- Adding TypeScript 7 auto-ignore policy in `.github/dependabot.yml` unless separately approved.
- Auto-merging TypeScript major updates or GitHub Action major updates.
- Adding maintainer commits to #47, #48, #49, or #51.
- Changing the branch-refresh GitHub App installation scope or permissions.
- Changing required checks, branch protection, force-push settings, admin enforcement, or conversation resolution.
- Editing the open PR #52 check/evidence files in this branch.

## Constraints

- Preserve the five strict required checks:
  - `pr-title`
  - `dependency-review`
  - `public-snapshot / validate`
  - `pr-minimum / validate`
  - `pr-latest / validate`
- Eligible Dependabot patch PRs must remain exactly one current verified Dependabot-authored commit with no maintainer-change marker.
- Human companion changes must land on `main` before an eligible bot PR is refreshed; they must not be pushed to the bot branch.
- The required public-snapshot check must continue to derive its source from committed Git-tree content, not the mutable working tree.
- Snapshot validation must continue to fail closed on source-selection ambiguity, prohibited content, materialization mismatch, package mismatch, or release failure.
- HyperFrames patch selection must require one exact known variant and one exact bundle.
- TypeScript 6 acceptance requires the complete release path, not only root typechecking.
- The Action v3 replacement must remain checkout-free and must not execute PR-controlled code in the privileged workflow.
- All external Actions remain pinned to full 40-character commit SHAs.
- The branch-refresh token remains scoped to `therealhieu/md2vid` with `contents: write`, `pull requests: write`, and `metadata: read` only.
- Process #47 before #48; do not refresh multiple dependency PRs concurrently.
- Do not change the privileged refresh action while it is needed to recover #47/#48. Upgrade it only after those PRs are resolved or the canary is formally abandoned.

## Decisions

### D1 — Keep dynamic snapshot validation; remove tracked-mirror equality as a merge prerequisite

The required check remains and continues to validate a fresh snapshot generated from committed `HEAD`. It must retain:

```text
committed Git-tree selection
  → prohibited-content scanning
  → exact materialization
  → generated manifest/hash verification
  → fresh isolated repository
  → package/release validation
```

The checked-in `public-snapshot.json` must no longer be an exact-equality precondition for every commit. Implementation may either:

1. remove the tracked mirror and use the dynamic report everywhere; or
2. retain it as an explicitly advisory/release-generated artifact that is not required to equal every PR head.

The implementation plan must select one model and remove contradictory commands/messages/tests. It must not add a Dependabot-only skip that allows stale `main` state.

### D2 — Add one exact HyperFrames `0.7.87` variant

Add an explicit `rr/p/v` patch variant beside the existing legacy/current variants. Preserve exact string counts, idempotence, bundle uniqueness, and fail-closed behavior. Do not generalize to minifier-agnostic regex replacement.

### D3 — Defer TypeScript 7; validate TypeScript 6 as the supported upgrade

PR #49 must not merge. Create a controlled human-owned TypeScript 6 update from current `main`, initially targeting `6.0.3` or the current approved TypeScript 6 release selected during implementation. Acceptance requires root typechecks, generated scaffold checks, and the full Remotion release smoke.

The generated Remotion scaffold continues to use the root TypeScript version while the root remains on the JavaScript-based TypeScript 6 line. Compiler-version decoupling is deferred until the project has a concrete requirement to adopt TypeScript 7.

### D4 — Treat Action v3 as a reviewed security change

PR #51 is evidence, not the merge vehicle. Replace it with a human-owned PR that updates:

- the exact workflow SHA and version comment;
- every positive exact-pin assertion;
- every permitted-action inventory;
- every mutation source/sentinel so each mutation still changes the workflow;
- generated/advisory snapshot artifacts as required by Decision D1;
- the active Dependabot reliability documentation where it names v2.2.2 as the fixed approved pin.

Retain the existing `app-id` credential contract for this remediation. A future `client-id` migration is separate.

### D5 — Preserve ordered bot recovery

```text
land snapshot architecture + HyperFrames compatibility on main
  → refresh #47
  → verify one-commit provenance + five required checks
  → native squash merge #47
  → refresh #48
  → verify five required checks
  → native squash merge #48
```

#49 is resolved manually through a TypeScript 6 successor. #51 is replaced only after #47/#48 no longer depend on the existing v2 refresh implementation.

### D6 — Use human replacement PRs when companion policy changes are required

A dependency proposal that requires repository-owned tests, docs, or workflow policy changes cannot remain a pristine one-commit Dependabot PR. Create a human-owned replacement and close the original only after the replacement is validated or merged.

This applies to #49 and #51. It does not apply to #47/#48 after Decisions D1 and D2 land on `main`.

## Functional Requirements

### FR1 — Public-snapshot validation uses committed current-tree authority

- Build the validation source list from committed `HEAD`.
- Preserve deterministic path ordering and normalized manifest generation.
- Preserve detection of untracked source assumptions and dirty-worktree leakage.
- Do not trust `public-snapshot.json` as the authority for which current files exist or what they contain.
- Do not condition correctness on PR actor, author, branch name, or Dependabot metadata.

### FR2 — Dynamic snapshot security and package validation remain mandatory

The required check must continue to fail when:

- committed public content contains prohibited credentials or developer-local paths;
- a selected source path is missing, duplicated, malformed, or outside the allowed public set;
- materialized content differs from the committed Git object;
- generated path hashes or aggregate hash are internally inconsistent;
- the generated report's `count` differs from `paths.length` or its ordered aggregate `hash` does not recompute exactly;
- the isolated public repository is not one clean commit;
- package contents differ from the declared public contract;
- build, check, scaffold, or release smoke validation fails.

### FR3 — Snapshot commands and diagnostics are coherent

- `corepack npm run public:snapshot:check` must describe the actual dynamic gate.
- If `corepack npm run public:snapshot` remains, its purpose must be explicit and non-contradictory.
- No error may instruct contributors to refresh a file that eligible immutable dependency PRs cannot update.
- Tests must cover ordinary source changes, dependency lockfile changes, workflow/test changes, prohibited content, and generated-snapshot corruption.

### FR4 — HyperFrames `0.7.87` installs through the existing patch path

- Recognize exactly one `rr/p/v` variant.
- Apply both caption-loop replacements exactly once.
- Re-running the patch must be idempotent.
- Mixed, missing, duplicated, or ambiguous markers must fail.
- Existing legacy/current variants must continue to pass.
- `postinstall.mjs` must remain fail-closed.

### FR5 — HyperFrames compatibility is proven before refreshing #47

- Focused patch tests pass against synthetic `0.7.87` markers.
- Self-healing installation tests cover the new variant.
- A local install of HyperFrames `0.7.87` proves exactly one published bundle matches and patches.
- The compatibility PR does not change the project dependency version; #47 remains the dependency owner.

### FR6 — #47 receives complete validation after refresh

After the prerequisites land and #47 is refreshed:

- `npm ci` succeeds on minimum and latest Node lanes.
- The fresh public-snapshot validation passes.
- HyperFrames tests and release smoke pass.
- Remotion `4.0.503` tests and release smoke run and pass.
- The PR remains one verified Dependabot commit.
- Native squash auto-merge is requested for the refreshed exact head.

### FR7 — #48 remains a dependency-only bot PR

- No maintainer commit is added to #48.
- After #47 merges, refresh #48 from the new `main`.
- Both normal validations and the dynamic public-snapshot validation pass.
- Confirm React type-family invariants and generated scaffold typechecks remain green.

### FR8 — TypeScript 7 is rejected with reproducible evidence

- Preserve the #49 release-smoke failure record.
- Record that current Remotion bundler requires the JavaScript TypeScript compiler API.
- Do not replace the failure with a shim over unstable TypeScript 7 internals.
- Close or supersede #49 with a link to the controlled TypeScript 6 replacement.

### FR9 — TypeScript 6 successor proves generated-project compatibility

- Update `package.json` and `package-lock.json` together.
- Preserve the existing root-to-scaffold TypeScript authority.
- Run root typecheck and Remotion template typecheck.
- Run the generated Remotion build/render smoke.
- Run the dynamic public-snapshot validation and complete release validation.
- Keep the update manual; do not add it to patch auto-merge eligibility.

### FR10 — Action v3 replacement updates every exact policy contract

- Use the exact full SHA proposed by #51 for `v3.2.0`, after verifying it against the official release/tag.
- Preserve repository owner/name and explicit `permission-*` inputs.
- Preserve default token revocation; do not set `skip-token-revoke`.
- Preserve checkout-free privileged execution.
- Assert that the privileged job and token step do not set `NODE_USE_ENV_PROXY`, `HTTP_PROXY`, `HTTPS_PROXY`, or `NO_PROXY`.
- Update positive SHA/comment assertions and exact action inventories.
- Update negative mutation inputs so every mutation is non-no-op and still rejected.
- Preserve all repository, PR, head, commit, auto-merge actor, and permission guards.

### FR11 — Action v3 operational validation is non-mutating first

After the replacement merges:

- Dispatch the branch-refresh workflow when there is no eligible `BEHIND` queue head, or use another guaranteed no-mutation state.
- Verify token creation and normal post-job revocation complete on GitHub-hosted `ubuntu-latest`.
- Verify the summary reports a valid no-candidate/waiting outcome.
- Do not use the first v3 run to mutate an unvalidated dependency branch.

### FR12 — Original PR disposition is traceable

For #47, #48, #49, and #51, record:

- original PR URL and head SHA;
- root cause;
- prerequisite or successor PR URL;
- five required check results where applicable;
- provenance/auto-merge state for eligible bot PRs;
- merge commit or closure reason.

## Security Requirements

- Required checks and strict up-to-date enforcement remain unchanged.
- No direct push to `main`, force push, admin merge, review bot, approval bot, or merge bypass.
- No maintainer commit on eligible Dependabot branches.
- Dynamic snapshot validation must not use actor-based skipping.
- The public-source scanner and isolated release validation remain mandatory.
- HyperFrames patching remains exact and fail-closed.
- TypeScript 7 must not be accepted through unstable internal compiler entry points without a separate architecture review.
- The privileged branch-refresh workflow remains checkout-free and executes no PR-controlled source.
- The GitHub App token remains repository-scoped and explicitly permission-limited.
- Action v3 remains full-SHA pinned and the pin remains mutation-tested.
- The v3 replacement must not broaden App permissions, repository scope, triggers, candidate selection, or mutation authority.
- Operational rollout must not mutate a dependency branch until the v3 runtime has passed a non-mutating dispatch.

## Operational Requirements

- Use separate human PRs/commits for the cross-cutting snapshot architecture and HyperFrames compatibility, even if implemented in one worktree.
- Process implementation and live PR recovery sequentially.
- Before each refresh, re-query current PR head, commit count, signature verification, merge state, and native auto-merge request.
- After each refresh, verify the new head remains one current verified Dependabot commit.
- Record all five required check conclusions for #47 and #48.
- Close #49 only after its TypeScript 6 successor exists or the deferral decision is recorded publicly.
- Close #51 only after the human Action v3 replacement is open and linked; prefer closure after replacement validation.
- Keep evidence separate from PR #52's existing canary files unless #52 merges and the implementation plan explicitly reconciles them.
- Final verification includes:

  ```bash
  corepack npm ci
  node --test test/ci/public-snapshot-check.test.ts
  node --test frameworks/hyperframes/__tests__/patch-studio.test.ts
  node --test test/cli/hyperframes-self-heal.test.ts
  node --test test/cli/dependency-versions.test.ts
  node --test test/ci/workflows.test.ts
  corepack npm run public:snapshot:check
  corepack npm run check
  corepack npm run release:check
  git diff --check
  ```

## Non-Goals

- Auto-merging TypeScript 6 or TypeScript 7.
- Supporting TypeScript 7's native compiler APIs in md2vid or Remotion.
- Replacing Remotion or its bundler.
- Removing the generated-project release smoke.
- Making the HyperFrames patch generic across unknown minifier output.
- Removing public snapshot validation or reducing it to manifest comparison only.
- Creating a workflow that commits generated artifacts onto Dependabot branches.
- Broadening GitHub App permissions or using its token outside branch refresh.
- Migrating the App credential from `app-id` to `client-id` in the same change.
- Modifying branch protection or required status contexts.
- Refactoring unrelated CI, release, packaging, dependency, or video-generation code.

## Success Criteria

- A committed dependency lockfile change can pass `public-snapshot / validate` without a companion maintainer commit while all dynamic scanning, isolated snapshot, package, and release checks remain active.
- Tests prove that prohibited content, materialization corruption, generated-manifest corruption, package mismatch, and release failure still fail the required check.
- HyperFrames `0.7.87` matches exactly one known variant, patches successfully, and remains idempotent.
- Existing HyperFrames patch variants remain covered and fail closed on ambiguity.
- #47 passes all five required checks after refresh, remains one verified Dependabot commit, and native squash-merges.
- #48 passes all five required checks after #47 merges and native squash-merges without maintainer changes.
- #49 does not merge; a controlled TypeScript 6 successor passes complete local and remote validation, including generated Remotion render smoke.
- The Action v3 replacement updates the workflow, exact policy tests, mutation sentinels, and relevant design authority together.
- Action v3 completes a non-mutating branch-refresh dispatch with token creation/revocation and the expected fixed summary.
- #51 closes with a link to the validated human replacement.
- `corepack npm run public:snapshot:check`, `corepack npm run check`, `corepack npm run release:check`, and `git diff --check` pass on the final implementation branch.
- Every original PR has a recorded disposition and linked evidence.

## Risks and Assumptions

| Risk / assumption | Handling |
|---|---|
| Removing tracked-mirror equality is perceived as weakening snapshot integrity | Preserve and test committed-tree selection, scanning, materialization, generated hash consistency, isolated repository construction, package verification, and release smoke; document the authority change explicitly |
| `public-snapshot.json` has consumers outside the required check | Inventory all readers before selecting removal versus advisory retention; update each consumer and add regression coverage |
| HyperFrames changes minified identifiers again | Keep exact variants and fail closed; require a new reviewed variant for every new layout |
| HyperFrames `0.7.87` fixes the underlying bug elsewhere | Verify the published bundle still contains the repeated-fetch path before applying the variant; remove the patch only with an upstream behavioral fix and regression evidence |
| Remotion adds TypeScript 7 support after this design | Re-evaluate in a separate dependency PR using the same generated-project release smoke; do not infer compatibility from version numbers |
| TypeScript 6 exposes unrelated typecheck regressions | Treat them as real upgrade blockers and fix or defer; do not weaken compiler options or tests solely to force the upgrade |
| Action v3 changes runtime behavior not covered by structural tests | Run an initial non-mutating dispatch and retain fixed summaries before allowing future branch mutation |
| `app-id` deprecation becomes removal | Keep the current contract for v3.2.0; plan a separate `client-id` credential migration before a release that removes `app-id` |
| #47 or #48 loses one-commit provenance during refresh | Stop recovery and use a human successor; do not relax the provenance invariant |
| #47 reveals a Remotion `4.0.503` regression after install succeeds | Diagnose it as a separate dependency blocker before merging #47; do not bundle speculative fixes into the HyperFrames prerequisite |
| PR #52 merges while this work is active | Rebase and preserve its canary evidence; keep this artifact directory separate and reconcile only during implementation planning |
