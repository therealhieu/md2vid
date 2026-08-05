# Dependency PR CI Remediation — Design

## Table of Contents

- [Context and Direction](#context-and-direction)
- [Governing Invariants](#governing-invariants)
- [Architecture](#architecture)
- [Remediation Units](#remediation-units)
- [Dynamic Public Snapshot Design](#dynamic-public-snapshot-design)
- [HyperFrames 0.7.87 Compatibility Design](#hyperframes-0787-compatibility-design)
- [TypeScript 6 Successor Design](#typescript-6-successor-design)
- [GitHub App Token v3 Replacement Design](#github-app-token-v3-replacement-design)
- [PR Recovery and Ordering](#pr-recovery-and-ordering)
- [Failure Handling](#failure-handling)
- [Implementation Shape](#implementation-shape)
- [Test Design](#test-design)
- [Security Model](#security-model)
- [Rollout and Evidence](#rollout-and-evidence)
- [Acceptance Criteria](#acceptance-criteria)

## Context and Direction

**Problem** — PR #50 repaired Dependabot orchestration, but four current dependency PRs expose failures at different compatibility and artifact boundaries. #47 cannot install because an exact HyperFrames patch anchor changed; #48 cannot satisfy a tracked snapshot mirror that Dependabot cannot regenerate; #49 breaks the generated Remotion render path with TypeScript 7; and #51 changes a privileged action pin without updating the exact security policy that approves it.

**Selected direction** — fix shared repository prerequisites on `main`, keep eligible patch PRs pristine, reject the incompatible TypeScript major, and use a human replacement for the privileged Action major.

```text
human prerequisite PR A: make public snapshot validation dynamic
          ↓
human prerequisite PR B: add exact HyperFrames 0.7.87 patch variant
          ↓
refresh #47 → full validation → guarded native squash merge
          ↓
refresh #48 → full validation → guarded native squash merge
          ↓
manual TypeScript 6 successor → validate → merge → close #49
          ↓
human Action v3 replacement → security review → merge → no-op dispatch → close #51
```

The source requirements are recorded in [2026-08-04-dependency-pr-ci-remediation-requirements.md](./2026-08-04-dependency-pr-ci-remediation-requirements.md).

**Superseded assumptions** — the earlier Dependabot reliability artifacts treated tracked `public-snapshot.json` regeneration as an ordinary companion change and declared snapshot architecture, TypeScript 7, and the v2 action pin outside scope. This design explicitly supersedes those three boundaries while preserving all existing trust and refresh invariants.

**External compatibility evidence** — TypeScript 6 is the final JavaScript-based compiler line, while TypeScript 7 is the native rewrite and does not preserve the default JavaScript compiler API expected by tools such as Remotion. `actions/create-github-app-token` v3 moves to Node 24, retains explicit repository/permission scoping and default token revocation, and requires self-hosted runner `2.327.1+`; this repository uses GitHub-hosted runners and no proxy configuration.

## Governing Invariants

### Snapshot invariant

```text
Required snapshot result
  = deterministic report from committed HEAD
  + prohibited-content scan
  + exact materialized file set/modes/hashes
  + authentic one-commit public repository
  + package metadata validation
  + npm ci
  + project check
  + release check
```

A second tracked copy of the report is not an independent authority and must not block immutable dependency PRs.

### HyperFrames patch invariant

```text
one published Studio bundle
  ∧ one exact known minifier variant
  ∧ each original anchor occurs exactly once
      → apply exact replacements once
      → subsequent run recognizes exact patched markers

anything else → fail closed
```

### Generated Remotion compatibility invariant

```text
root TypeScript version
  → generated Remotion scaffold TypeScript version
  → @remotion/bundler compiler API
  → generated project bundle/render smoke must pass
```

A root typecheck pass is insufficient.

### Privileged workflow invariant

```text
approved full action SHA
  = workflow pin
  = exact structural policy
  = permitted external-action inventory
  = mutation-test source state
```

Changing one side requires a human-reviewed synchronized change.

### Dependabot provenance invariant

```text
eligible patch PR
  = one current verified Dependabot commit
  + no maintainer-change marker
  + exact patch-group metadata
  + exact-head native squash auto-merge
  + five strict required checks
```

No remediation may add a companion commit to #47 or #48.

## Architecture

### Current state

```text
Committed source tree
  ├── publicSnapshotReport(HEAD)
  ├── checked-in public-snapshot.json
  └── assert deep equality before fresh snapshot validation
               │
               └── any package/workflow/test change requires a companion commit
                       └── immutable Dependabot PR cannot satisfy the gate

HyperFrames package
  → postinstall exact patch resolver
  → only legacy/current minifier layouts known
  → 0.7.87 layout rejected

Root TypeScript
  → copied into Remotion scaffold
  → TypeScript 7 lacks required JS compiler API
  → render smoke fails

Privileged refresh workflow
  → exact create-github-app-token v2 SHA
  → exact policy tests approve v2 only
```

### Expected state

```text
Committed source tree
  → publicSnapshotReport(sourceCommit)
  → build snapshot in exclusive temporary output
  → verify generated manifest against staged files
  → initialize authentic one-commit public repository
  → run package + release validation
  → required check passes or fails from current committed content

No tracked report mirror participates in correctness.

HyperFrames package
  → exact known variants: legacy | current | 0.7.87
  → same fail-closed resolver and idempotent patch

Root TypeScript
  → supported JavaScript compiler line: TypeScript 6
  → generated Remotion render smoke remains authoritative

Privileged refresh workflow
  → v2 retained through #47/#48 recovery
  → later human-reviewed v3 replacement updates workflow + policy + mutations together
```

### Responsibility boundaries

| Component | Owns | Does not own |
|---|---|---|
| `public_snapshot.ts` | Committed-tree selection, security scan, report generation, materialization, generated manifest verification | Approval of a separately tracked mirror |
| `check_public_snapshot.ts` | Source-commit binding, isolated repository construction, package/release validation | Contributor identity or dependency eligibility |
| HyperFrames patcher | Exact known Studio layouts and idempotent replacement | Generic minified-JavaScript rewriting |
| Dependency authority | Root/scaffold version synchronization | Claiming compatibility without release smoke |
| Workflow tests | Exact privileged behavior and approved action pin | Automatically accepting Dependabot major changes |
| Dependabot automation | Pristine patch PR refresh and native auto-merge request | Generating repository-owned companion commits |
| Human replacement PR | Coordinated compatibility/policy changes for manual majors | Auto-merge eligibility |

## Remediation Units

| Unit | Purpose | Merge vehicle | Depends on |
|---|---|---|---|
| A — Dynamic snapshot authority | Remove the immutable-PR contradiction while retaining all substantive validation | Human prerequisite PR | Current `main` |
| B — HyperFrames exact variant | Make HyperFrames 0.7.87 install safely | Separate human-owned prerequisite PR and commit | Unit A merged on `main` |
| C — #47 recovery | Validate HyperFrames and Remotion runtime patches | Existing Dependabot PR | Units A and B on `main` |
| D — #48 recovery | Validate React type patches | Existing Dependabot PR | Unit A and merged #47 |
| E — TypeScript 6 successor | Replace incompatible TypeScript 7 proposal | Human dependency PR | Unit A and latest `main` |
| F — Action v3 replacement | Upgrade privileged token action and exact security contracts | Human CI/security PR | #47/#48 recovery complete or abandoned |

Units are ordered. No implementation writer or live branch mutation should run concurrently across units.

## Dynamic Public Snapshot Design

### Decision — remove the tracked root manifest

Delete the repository-root `public-snapshot.json`. The same filename remains the manifest **inside each generated public snapshot**, where it is generated and immediately verified against the staged file set.

This avoids two meanings for one artifact:

```text
Before:
root/public-snapshot.json       = manually refreshed mirror of an older/current source tree
snapshot/public-snapshot.json   = generated manifest of the actual materialized snapshot

After:
snapshot/public-snapshot.json   = sole manifest, generated from the selected source commit
```

The authoritative report already exists as the return value of `publicSnapshotReport()` and `buildPublicSnapshot()`.

### Checker flow

Update `checkPublicSnapshot()`:

```text
1. Resolve git root.
2. Resolve MD2VID_PUBLIC_SNAPSHOT_REF or HEAD to one commit.
3. Verify pinned npm CLI version.
4. Create exclusive temporary root and empty Git template.
5. buildPublicSnapshot({ repo, output, ref: sourceCommit }).
   5.1 Parse committed Git tree.
   5.2 Select public entries.
   5.3 Scan every selected blob.
   5.4 Generate report.
   5.5 Materialize entries and generated manifest.
   5.6 Verify paths, modes, bytes, hashes, and manifest bytes.
6. Validate package metadata from the snapshot.
7. Initialize an authentic one-commit repository.
8. Prove private source history is unreachable.
9. Run npm ci, check, and release:check.
10. Require authentic snapshot identity after each step.
11. Require final clean tree.
```

Remove:

- `assertTrackedPublicSnapshotManifest()`;
- `isDeepStrictEqual` import;
- root-manifest file type/JSON/equality checks;
- stale-mirror diagnostic and regeneration instruction.

Add `validatePublicSnapshotReport(report)` as an explicit report self-consistency boundary:

```text
validatePublicSnapshotReport(report)
  → require count === paths.length
  → recompute the ordered aggregate from path, mode, bytes, and sha256
  → require exact hash equality
```

Invoke it before manifest serialization/materialization and again after parsing the generated manifest in `applyManifestModes()`. Corrupted `count` or aggregate `hash` must fail before repository initialization.

No actor, branch, or Dependabot exception is added.

### CLI behavior

Keep `PUBLIC_SNAPSHOT_MANIFEST = "public-snapshot.json"` because generated snapshots still require that internal manifest.

Change no-argument `node scripts/public_snapshot.ts` behavior:

```text
current:
  publicSnapshotReport(HEAD)
    → write repository-root public-snapshot.json
    → print "<count> files <hash>"

new:
  publicSnapshotReport(HEAD)
    → do not mutate repository files
    → print "<count> files <hash>"
```

`--output <path> [--ref <commit>]` continues to materialize a complete snapshot with its internal `public-snapshot.json`.

Remove `writePublicSnapshotManifest()` unless another active code consumer remains after refactoring. Do not retain a function whose name implies a tracked artifact contract that no longer exists.

### Consumer migration

Replace repository-root manifest readers with dynamic reports:

- `test/ci/public-snapshot-check.test.ts`
  - Import `publicSnapshotReport`.
  - Check delivery-path coverage against `publicSnapshotReport(ROOT).paths`.
  - Replace tracked-staleness tests with committed-source dynamic-authority tests.
- `test/cli/package-meta.test.ts`
  - Construct `publicSnapshot` from `publicSnapshotReport(REPO_ROOT)`.
  - Preserve the evidence-directory exclusion assertion.
- `test/ci/public-snapshot.test.ts`
  - Remove tracked-writer regeneration/idempotence tests.
  - Preserve report determinism, generated manifest self-consistency, path selection, content scanning, output safety, and materialization verification.
- `test/ci/public-snapshot-checkout.test.ts`
  - Keep generated snapshot manifest fixtures; they describe an intentional public-snapshot checkout, not the removed root mirror.

### Documentation migration

Active plans and historical records may mention regenerating the old root file. Do not rewrite completed historical artifacts. Update only active source-of-truth artifacts needed for future execution:

- the new requirements/design/plan/goal package;
- active Dependabot reliability requirements, design, goal, and plan sections that require repository-root manifest regeneration; replace those instructions with an explicit reference to this dynamic-snapshot decision;
- contributor/release instructions outside completed history if they direct users to refresh the root file.

Historical `done/**` artifacts remain evidence of the architecture that existed when they shipped.

### Why this preserves integrity

```text
Removed check:
  tracked JSON == generated current report

Retained checks:
  generated report == committed selected blobs
  staged files == generated report paths/modes/bytes/hashes
  staged manifest bytes == generated report
  generated repository == authentic one-clean-commit snapshot
  package payload == declared contract
  build/check/release smoke == pass
```

The removed equality compared two representations produced by the same implementation. It prevented immutable dependency updates but did not add a separate source of truth.

## HyperFrames 0.7.87 Compatibility Design

### Exact variant

Add a third entry to `STUDIO_PATCH_VARIANTS`:

```ts
{
  name: "0.7.87",
  anchor1: "let l=!1;const c=()=>{if(rr.getState().isEditMode||l)return;",
  patch1: "let l=!1,hfLast=null;const c=()=>{if(rr.getState().isEditMode||l)return;",
  anchor2: "if(!p)return;l=!0;const v=p;fetch(",
  patch2: "if(!p)return;if(hfLast===p)return;hfLast=p;l=!0;const v=p;fetch(",
}
```

The exact label may use a semantic name such as `minified-rr-v`; tests must not depend on the label except for diagnostics.

### Retained mechanics

Do not change:

- `countOccurrences()`;
- `replaceExact()` exact marker counts;
- `variantMarkerCount()`;
- `selectStudioPatchVariant()` one-variant requirement;
- `resolveStudioBundle()` one-bundle requirement;
- staged write/promotion behavior;
- postinstall fail-closed status propagation.

### Version documentation

Update `frameworks/hyperframes/patch-studio.ts` to state that the affected behavior remains present through at least `0.7.87`. Avoid claiming an upper bound that has not been verified.

Preferred wording:

```text
HyperFrames Studio versions observed through 0.7.87 can retry the same failed
caption-model fetch indefinitely. This patch recognizes only reviewed exact
bundle layouts and fails closed when upstream output changes.
```

### Published-package verification

Before merging Unit B:

1. Install/extract `hyperframes@0.7.87` in a temporary fixture.
2. Resolve its Studio asset directory through the production resolver.
3. Prove exactly one bundle matches the new unpatched variant.
4. Apply the patch.
5. Prove original anchors are absent and patched markers occur once.
6. Apply again and prove byte identity.

This may be an explicit test fixture or a documented one-off verification. Unit tests remain deterministic and must not require network access.

## TypeScript 6 Successor Design

### Disposition of #49

Close or supersede #49; do not refresh it as a candidate for merge. Its old title failure is obsolete, but its generated Remotion release failure is current and reproducible.

```text
#49 TypeScript 7
  → retain failure evidence
  → link controlled TypeScript 6 successor
  → close as incompatible with current Remotion compiler API
```

### Successor dependency shape

Create a human-owned dependency PR from the latest `main` after Units A-D. Update:

- `package.json` root TypeScript range;
- `package-lock.json` resolved TypeScript package;
- no compiler API shim;
- no scaffold-specific version constant;
- no weakened compiler options.

Use the current approved TypeScript 6 release selected during implementation, with `6.0.3` as the initial target established by investigation.

### Why no version decoupling now

The current authority is simple and correct while root and generated projects can share TypeScript 6:

```ts
export const TYPESCRIPT_VERSION = dependencyValue("devDependencies", "typescript");

export const REMOTION_SCAFFOLD_DEV_DEPENDENCIES = {
  "@types/react": REACT_TYPES_VERSION,
  "@types/react-dom": REACT_TYPES_VERSION,
  typescript: TYPESCRIPT_VERSION,
} as const;
```

Introducing a second compiler pin solely to allow an incompatible root major would add permanent policy and upgrade complexity. Defer that architecture until md2vid needs TypeScript 7 independently of Remotion support.

### Compatibility gate

The successor is acceptable only if this complete path passes:

```text
root npm ci
  → root typecheck
  → Remotion template typecheck
  → all tests
  → package/public snapshot construction
  → generated Remotion scaffold install
  → generated scaffold build/check
  → @remotion/bundler bundle/render smoke
```

No acceptance may rely only on `tsc --noEmit` in the root repository.

## GitHub App Token v3 Replacement Design

### Timing

Keep `actions/create-github-app-token v2.2.2` unchanged while recovering #47 and #48. The current refresh workflow is already structurally reviewed and is the mechanism intended for those branches.

Upgrade only after:

- #47 and #48 merge; or
- the branch-refresh canary is formally abandoned and no live recovery depends on the current action.

### Merge vehicle

Create a human-owned replacement PR. Do not add commits to #51.

### Workflow change

Update only the immutable action pin and version comment in `.github/workflows/dependabot-branch-refresh.yml`:

```yaml
uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0
```

Retain:

- `app-id: ${{ vars.DEPENDABOT_REFRESH_APP_ID }}`;
- `private-key: ${{ secrets.DEPENDABOT_REFRESH_APP_PRIVATE_KEY }}`;
- owner `therealhieu`;
- repository `md2vid`;
- explicit `permission-contents: write`;
- explicit `permission-pull-requests: write`;
- explicit `permission-metadata: read`;
- default token revocation;
- no proxy environment because the workflow uses no proxy;
- no checkout or PR-code execution.

Do not combine the optional `client-id` migration with this upgrade.

### Policy synchronization

Update every exact reference in `test/ci/workflows.test.ts`:

1. Approved full SHA.
2. Exact `# v3.2.0` comment assertion.
3. Exact permitted external-action inventory.
4. Mutation source SHA/comment.
5. Deliberately wrong mutation replacement.
6. Version-specific rejection matcher or diagnostic.

The mutation suite must first assert that each mutation changes the source workflow, then assert that the policy rejects it. This preserves the existing anti-no-op property.

### Documentation synchronization

The active Dependabot reliability requirements/design/goal/plan currently record v2.2.2 as the approved pin. The Action v3 replacement must update the active authority or add an explicit superseding decision reference to this design. Completed artifacts remain unchanged.

### Operational validation

After merge, run a no-mutation dispatch:

```text
workflow_dispatch
  → create v3 installation token
  → inventory queue
  → no eligible BEHIND mutation target
  → fixed no-candidates/waiting summary
  → action post-step revokes token
  → workflow succeeds
```

If no guaranteed no-mutation state exists, wait rather than use the first v3 execution for a live branch rewrite.

## PR Recovery and Ordering

### Sequence

```text
0. Reconcile PR #52 status without editing its open files.
1. Land Unit A: dynamic snapshot authority.
2. Land Unit B: HyperFrames 0.7.87 exact variant.
3. Re-query #47.
4. Refresh #47 only if BEHIND; otherwise rerun/recreate from the current prerequisite base through the approved Dependabot path.
5. Verify provenance, five checks, and fresh native squash auto-merge; let #47 merge.
6. Re-query #48, which will become stale after #47.
7. Refresh #48 through the same guarded path; verify five checks; let it merge.
8. Open and validate the TypeScript 6 human successor; close #49 with the link.
9. Open and validate the Action v3 human replacement; close #51 with the link.
10. Run the v3 no-mutation dispatch and record evidence.
11. Audit final main and all four original PR dispositions.
```

### #47 refresh state machine

```text
#47 current head
  ├── BEHIND + eligible + valid old auto-merge
  │     → trusted refresh disables old request
  │     → REBASE with expectedHeadOid
  │     → new synchronize checks
  │     → trusted policy requests fresh auto-merge
  ├── current + checks can rerun against prerequisite main merge commit
  │     → rerun checks / wait for Dependabot synchronization behavior
  ├── provenance invalid
  │     → stop; create human successor
  └── new Remotion/runtime failure
        → diagnose separately; do not weaken patch/snapshot policy
```

### Closure rule

- #47/#48: close only through merge or after a validated human successor is required by a provenance failure.
- #49: close after the TypeScript 6 successor is open and linked, preferably after it passes required checks.
- #51: close after the Action v3 human replacement is open and linked, preferably after validation/merge.

## Failure Handling

| Failure | Classification | Response | Forbidden response |
|---|---|---|---|
| Dynamic report differs after a dependency change | Expected current-tree behavior | Validate the generated snapshot; no companion mirror update | Add actor-based skip or maintainer commit to bot PR |
| Generated staged manifest differs from staged files | Integrity failure | Fail required check and investigate materialization/report code | Ignore manifest corruption because root mirror was removed |
| Prohibited public content detected | Security failure | Fail closed and remove/exception-review the content | Dependabot exemption |
| HyperFrames new variant matches zero bundles | Upstream layout drift or wrong target | Verify published package and add reviewed exact variant only | Broad regex replacement |
| HyperFrames multiple variants/bundles match | Ambiguous patch target | Fail closed | Patch the first match |
| #47 reaches Remotion tests and fails | New independent runtime blocker | Diagnose with systematic debugging before merge | Attribute it to HyperFrames without evidence |
| TypeScript 6 root typecheck fails | Real upgrade incompatibility | Fix narrowly or defer TypeScript 6 | Weaken compiler options/tests automatically |
| TypeScript 6 render smoke fails | Generated-project incompatibility | Defer and retain current TypeScript | Claim root tests are enough |
| Action v3 policy test fails | Unsynchronized security contract | Update exact approved references or reject upgrade | Loosen exact pin assertions |
| Action v3 no-op dispatch fails on runner/runtime | Operational incompatibility | Revert/defer v3 replacement | Use first run to mutate a branch or broaden permissions |
| Refreshed bot PR has multiple/unverified commits | Provenance violation | Stop automation and create a human successor | Relax one-commit/signature invariant |
| PR #52 changes overlap active reliability docs | Documentation concurrency | Rebase and reconcile after #52 state is known | Overwrite its evidence/check files |

## Implementation Shape

### Unit A — Dynamic snapshot authority

**Modify:**

- `scripts/check_public_snapshot.ts`
  - Remove root tracked-manifest assertion and imports.
  - Keep source-commit resolution and full dynamic validation.
- `scripts/public_snapshot.ts`
  - Add `validatePublicSnapshotReport()` to recompute `count` and ordered aggregate `hash`.
  - Validate before materialization/serialization and after generated-manifest parsing.
  - Make no-argument CLI report-only.
  - Remove tracked-root writer API if unused.
  - Keep internal generated manifest behavior.
- `test/ci/public-snapshot-check.test.ts`
  - Replace tracked mirror tests/readers with dynamic report tests.
  - Add dependency/workflow committed-change cases.
- `test/ci/public-snapshot.test.ts`
  - Remove tracked writer tests.
  - Preserve generated report/materialization/integrity coverage.
- `test/cli/package-meta.test.ts`
  - Use `publicSnapshotReport(REPO_ROOT)` for public path assertions.
- `package.json`
  - Keep `public:snapshot` as non-mutating current-report command.
  - Keep `public:snapshot:check` as the required full validation command.
- `public-snapshot.json`
  - Delete repository-root mirror.

**Conditional active-doc updates:**

- Active Dependabot reliability requirements/design/goal/plan references that require repository-root manifest regeneration; replace them with a reference to this dynamic-snapshot authority.
- Current contributor/release docs if active instructions mention root regeneration.

### Unit B — HyperFrames compatibility

**Modify:**

- `frameworks/hyperframes/patches.ts`
  - Add exact `rr/p/v` variant.
- `frameworks/hyperframes/__tests__/patch-studio.test.ts`
  - Add new exact fixture, idempotence, ambiguity coverage.
- `test/cli/hyperframes-self-heal.test.ts`
  - Add installation/self-healing fixture for the new layout.
- `frameworks/hyperframes/patch-studio.ts`
  - Update affected-version/behavior documentation.

**Do not modify:**

- `package.json` HyperFrames version in the prerequisite; #47 owns it.

### Unit E — TypeScript 6 successor

**Modify in separate human dependency PR:**

- `package.json`
- `package-lock.json`

**Tests exercised without expected source changes:**

- `test/cli/dependency-versions.test.ts`
- Remotion template typecheck
- `test/release/harness.ts` generated-project smoke

Add a focused regression only if TypeScript 6 reveals a contract not already covered by the release harness.

### Unit F — Action v3 replacement

**Modify:**

- `.github/workflows/dependabot-branch-refresh.yml`
- `test/ci/workflows.test.ts`
- active Dependabot reliability requirements/design/goal/plan references to the approved action pin

The root snapshot mirror no longer exists after Unit A; the dynamic check validates these changed files directly.

## Test Design

### Dynamic snapshot tests

#### Authority tests

- `publicSnapshotReport(ROOT)` includes required visual/narration delivery files.
- A committed `package-lock.json` change changes the report hash and still allows the checker to proceed without a root mirror.
- A committed workflow/test change changes the report hash and still allows dynamic validation.
- An uncommitted working-tree change does not alter a report generated from committed `HEAD`.
- `MD2VID_PUBLIC_SNAPSHOT_REF` binds the report and snapshot to the selected commit.

#### Integrity tests

Preserve/add failures for:

- missing staged file;
- extra staged file;
- path hash mismatch;
- `count !== paths.length`;
- ordered aggregate `hash` mismatch after recomputation;
- byte length mismatch;
- mode mismatch;
- generated manifest byte mismatch;
- symlink/special file in output;
- output path escape or identity race;
- prohibited credentials/developer paths;
- reachable private source history;
- non-authentic or dirty generated repository;
- package metadata mismatch;
- npm/check/release step failure.

#### CLI tests

- No-argument `public:snapshot` does not create or modify repository files.
- It prints deterministic count/hash output.
- `--output` remains required when materializing.
- `--output` creates an internal `public-snapshot.json` matching staged content.

### HyperFrames tests

Add constants:

```ts
const V087_ANCHOR_1 = "let l=!1;const c=()=>{if(rr.getState().isEditMode||l)return;";
const V087_ANCHOR_2 = "if(!p)return;l=!0;const v=p;fetch(";
```

Cases:

- valid 0.7.87 bundle patches once;
- second run is byte-identical;
- one missing 0.7.87 anchor fails with exact stage/count;
- duplicate 0.7.87 anchor fails;
- 0.7.87 plus legacy/current markers fails with multiple variants;
- self-healing install finds and patches the new layout;
- existing legacy/current tests remain unchanged and pass.

### TypeScript 6 validation

- `TYPESCRIPT_VERSION` equals the root package range.
- generated Remotion dev dependencies use that version.
- root typecheck passes.
- Remotion template typecheck passes.
- generated-project install/build/check passes.
- Remotion bundler still reaches the JavaScript compiler API successfully.
- release smoke renders/stills successfully.

No synthetic TypeScript 7 compatibility test is needed beyond preserving the recorded failing evidence; the project is explicitly rejecting that major.

### Action v3 workflow tests

Positive:

- exact v3.2.0 full SHA/comment accepted;
- exact action inventory contains only the approved pin;
- repository and permission inputs remain exact;
- token output is used explicitly for every API step;
- checkout/project execution remains absent;
- the privileged job/action step declares none of `NODE_USE_ENV_PROXY`, `HTTP_PROXY`, `HTTPS_PROXY`, or `NO_PROXY`;
- summary, queue, provenance, and mutation policies remain unchanged.

Negative mutations:

- tag instead of full SHA;
- wrong full SHA;
- stale v2 comment;
- broadened owner/repository scope;
- removed explicit permission input;
- added permission;
- `github.token` fallback;
- `skip-token-revoke: true`;
- any `NODE_USE_ENV_PROXY`, `HTTP_PROXY`, `HTTPS_PROXY`, or `NO_PROXY` declaration;
- added checkout or external action;
- mutation source that fails to change the workflow must itself fail the test harness.

### Verification matrix

| Unit | Focused verification | Full verification |
|---|---|---|
| A | public snapshot unit/check/checkout/package-meta tests | `public:snapshot:check`, `check`, `release:check` |
| B | HyperFrames patch + self-heal tests | `npm ci`, `check`, `release:check` |
| C/D | Five remote required checks + provenance | native squash merge evidence |
| E | dependency authority + template typecheck + release smoke | full local and remote checks |
| F | workflow structural/policy/mutation tests | full local checks + remote PR checks + no-op dispatch |

## Security Model

### Trust boundaries

```text
Untrusted PR content
  → normal CI checks committed source
  → dynamic public snapshot derives from exact commit
  → no actor-specific bypass

Eligible Dependabot branch
  → no maintainer writes
  → trusted refresh may only rebase exact validated head
  → trusted auto-merge policy authorizes exact new head

Privileged workflow source
  → current default-branch code only
  → exact external action SHA
  → no checkout / no PR-controlled execution
  → repository-scoped short-lived App token
```

### Snapshot security after mirror removal

The security boundary is the generated report and staged manifest, not the repository-root JSON file:

```text
Git object bytes
  ├── selected path/mode/content
  ├── scanned before materialization
  └── hashed into generated report
          ↓
exclusive staged files
  ├── exact file set
  ├── exact modes
  ├── exact bytes/hashes
  └── exact generated manifest bytes
          ↓
authentic isolated repository
          ↓
package and release validation
```

Tests must mutation-check each boundary so removing the root mirror does not reduce coverage.

### Action v3 supply-chain boundary

- Full commit SHA remains mandatory.
- The official repository/tag is verified before updating the approved SHA.
- The workflow requests only explicit installation permissions.
- The token remains scoped to one owner/repository.
- Token revocation remains enabled.
- No proxy environment is added without an actual repository requirement.
- `app-id` is retained only because v3.2.0 still supports it; deprecation is tracked separately.

## Rollout and Evidence

### Local rollout

1. Write failing dynamic-authority tests that demonstrate a committed lockfile change no longer requires a root mirror.
2. Remove tracked equality from the checker and migrate consumers.
3. Delete the root `public-snapshot.json` and make `public:snapshot` non-mutating.
4. Run focused snapshot tests, then full snapshot/release validation.
5. Write failing HyperFrames 0.7.87 fixture tests.
6. Add the exact variant and update documentation.
7. Run patch/self-heal tests, clean install, full checks, and release checks.
8. After this requirements/design pair is approved, create the linked implementation plan and goal before implementation or live PR mutation. Create evidence records during rollout and the post-implementation check only after implementation and verification complete.

### Original PR disposition ledger

For #47, #48, #49, and #51, record the original PR URL and head SHA, root cause, prerequisite or successor PR URL, applicable required-check conclusions, provenance/auto-merge state for eligible bot PRs, and the final merge commit or explicit closure reason. The #49 and #51 records must link their controlled human replacements and preserve the incompatible-TypeScript and policy-drift evidence, respectively.

### Remote #47/#48 rollout

For each PR, capture:

```text
PR number
old head SHA
merge state
commit count
commit author/login
signature verification
maintainer-change marker absence
autoMergeRequest method and enabledBy identity
refresh run URL and summary
new head SHA
five required check URLs/conclusions
fresh auto-merge request
final merge commit
```

#47 evidence additionally records:

- successful HyperFrames postinstall;
- exact patched package version;
- Remotion `4.0.503` validation results.

#48 evidence additionally records:

- dynamic snapshot check success with its dependency-only lockfile diff;
- React type-family validation.

### TypeScript successor rollout

Record:

- selected TypeScript 6 version and package metadata;
- root and scaffold version authority;
- local `check` and `release:check` results;
- generated Remotion render result;
- remote required checks;
- #49 closure comment/link.

### Action v3 rollout

Record:

- official v3.2.0 tag/SHA verification;
- replacement PR URL/head;
- workflow-policy focused tests;
- five required remote checks;
- merge commit;
- no-mutation workflow dispatch URL;
- token creation step success;
- fixed summary outcome/reason;
- post-job completion/revocation evidence available from the run;
- #51 closure comment/link.

### Rollback

- Unit A regression: revert through a protected PR; do not restore an actor-specific exception. If a tracked mirror is temporarily restored, #47/#48 must use human successors rather than maintainer commits.
- Unit B regression: revert only the new variant and keep #47 blocked; do not make patching permissive.
- TypeScript 6 regression: close/revert the successor and retain the current compiler.
- Action v3 runtime regression: revert to the approved v2.2.2 SHA through a protected PR and leave branch-refresh mutation unused until reviewed.

## Acceptance Criteria

- Repository-root `public-snapshot.json` is removed, and generated snapshots still contain and verify their own `public-snapshot.json`.
- `public:snapshot` is non-mutating and deterministic; `public:snapshot:check` remains the full required validation.
- Dynamic snapshot tests prove committed dependency/workflow changes do not require a companion mirror while all content, materialization, package, and release failure modes remain enforced.
- HyperFrames `0.7.87` is supported through one new exact variant with idempotence and ambiguity coverage.
- #47 passes all five strict required checks, preserves one verified Dependabot commit, receives a fresh exact-head native squash auto-merge request, and merges.
- #48 passes all five strict required checks without a maintainer companion commit and merges after #47.
- #49 is closed/superseded; the controlled TypeScript 6 successor passes generated Remotion build/render and all local/remote checks.
- The Action v3 replacement keeps the same repository/permission boundary and updates every exact policy and mutation reference.
- Action v3 completes a successful non-mutating GitHub-hosted workflow dispatch before future branch mutation relies on it.
- #51 closes with the validated replacement link.
- Final `main` passes:

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

- After this requirements/design pair is approved, the remediation directory receives linked implementation-plan and goal artifacts before implementation, evidence artifacts during rollout, and a post-implementation check after implementation and verification complete.
- Evidence records the final disposition of #47, #48, #49, and #51.
