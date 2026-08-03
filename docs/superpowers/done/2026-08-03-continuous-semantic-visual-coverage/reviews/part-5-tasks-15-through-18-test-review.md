# Canonical Review Artifact

- Review scope: Part 5, Tasks 15-18
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `f53713f0faccf365796d8b63823575d0c7147d2c`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines/continuous-visual-coverage/part-5-tasks-15-through-18`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.part5.EW2gcu/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

## TEST-001 Must fix — `supporting-only` synthetic fixture is committed but not exercised

**Problem**

- `test/golden/fixtures/continuous-visual-coverage/inputs/supporting-only.visual_beats.json` defines the dedicated supporting-only v2 fixture.
- `test/golden/golden.test.ts` only runs late-focal-opening-gap, frame-start-opening-pass, middle-gap, ending-gap, static-focal-pass.
- The existing supporting-only assertion mutates a focal plan’s manifest role to supporting, creating a planned-role/evidence-role mismatch rather than proving the authored supporting-only plan path.

**Why this matters**

Part 5 requires synthetic coverage for supporting-only/captions-only/shell-only → complete-frame opening gap. The committed supporting-only fixture is in the snapshot but unused by the golden matrix.

**Guidance**

Add a golden case that calls `buildContinuousCoverageVariant("supporting-only")`; emit supporting-role bindings matching the supporting plan or assert the intended planner/verifier diagnostic; assert `opening_visual_gap` with `extendsThroughFrameEnd === true` for the complete-frame semantic vacuum path.

---

## TEST-002 Must fix — packed/release smoke does not prove coverage-relevant stale mutation rejection

**Problem**

- Plan 5 requires packed smoke stale-mutation rejection and shipped runtime proof.
- `test/cli/pack.test.ts` inspects shipped standards/templates but does not execute shipped manifest-v2 verification/staleness.
- `test/release/harness.ts` proves stale narration rejection but does not mutate HyperFrames frame HTML, Remotion registry, or Remotion source after build to prove visual `planSha256`/`authoredInputs` rejection from packed install.

**Why this matters**

Repository unit tests cover stale evidence, but Part 5 requires packed/release evidence that the shipped package rejects coverage-relevant mutations.

**Guidance**

Extend release harness after successful packed build/check:

- HyperFrames: mutate planned frame semantic binding after build, run installed `md2vid verify .`, assert stale authored-input failure, restore, verify pass.
- Remotion: mutate `visual_bindings.json` or authored semantic source after build, verify stale failure, restore, verify pass.
- Keep this in packed/release smoke.

---

## Nice to have

None.

---

## Command evidence

| Command | Result |
|---|---|
| `corepack npm run typecheck` | exit 0 |
| `corepack npm run typecheck:remotion` | exit 0 |
| `corepack npm test` | 1257 pass, 0 fail |
| `corepack npm run check:skill-references` | exit 0 |
| `corepack npm run public:snapshot:check` | exit 0 |
| `corepack npm run check` | exit 0 |
| `corepack npm run release:check` | exit 0, `OK [all]` |
| `git diff --check` | exit 0 |
| `git status --short` | only pre-existing untracked reviews |

## Generated mutations

No tracked source mutations were produced by review commands.

## Coverage assessment checklist

| Area | Status |
|---|---|
| Scaffold policy/example/next steps | Covered |
| Marker diagnostics | Covered |
| Standards/skill/README contracts and bundled equality | Covered |
| Synthetic 0.070/18.260/23.080 opening/mid/end/static | Covered |
| Synthetic supporting-only authored fixture | Gap — TEST-001 |
| Captions/shell complete-frame gap | Partially simulated with empty bindings |
| Browser semantic seeks | Covered |
| Pack shipped paths | Covered for static presence |
| Pack/release stale visual evidence | Gap — TEST-002 |
| Public snapshot committed-state integrity | Covered |

## Consolidated checklist

- [ ] TEST-001: Exercise real supporting-only fixture or planner failure path.
- [ ] TEST-002: Add packed/release stale visual-evidence mutation checks for HyperFrames and Remotion.
- [x] Final matrix executed.
- [x] No tracked review mutations.
- [x] Skill references and snapshot checks passed.
- [x] Release check passed.

## Residual risks

- Final matrix passes, but required Part 5 evidence does not yet prove authored supporting-only path or shipped manifest-v2 stale visual evidence behavior.
