# Canonical Review Artifact

- Review scope: Part 2, Tasks 5-8
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `f68de8253a2877cfb568a6fd87d8055e0d7e65d0`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines/continuous-visual-coverage/part-2-tasks-5-through-8`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.part2.zLxvN1/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

## Canonical tester report — grouped Part 2 Tasks 5-8

### Scope

Reviewed dirty-baseline scope from:

- Base: `f68de8253a2877cfb568a6fd87d8055e0d7e65d0`
- HEAD: `e23b6d79e09f2e6117a525f49c73841e594f5fa5`
- Task patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.part2.zLxvN1/task-scope.patch`
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`

Read required artifacts:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-requirements.md`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-design.md`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-plan.md`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-plan-2.md`

Command-generated repository mutations:

- None observed.
- `git status --porcelain=v1` before and after test gate only showed pre-existing untracked review directory:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/reviews/`

---

## Findings

### TEST-1 — Must fix — Required v2 coverage can be bypassed by a v1 manifest

**Evidence**

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_sync.ts:211-219`

```ts
if (coverageEnabled && manifest.version === 2) {
  appendCoverageFindings(
    findings,
    coverageFrames,
    coverageByFrame,
    input.policy,
    coverageLevel,
    coverageEpsilon,
  );
}
```

The verifier only runs coverage interval checks when `manifest.version === 2`. If a v2 coverage plan is verified with a v1 manifest, coverage verification is silently skipped.

Reproduction command:

```bash
node --input-type=module <<'EOF'
import { verifyVisualSync } from './engine/visual_sync.ts';
const policy = { mode: 'off', coverageMode: 'required', maxLead: 0.25, maxLag: 0.75, maxUncoveredGap: 0.5, minLanding: 1 };
const plan = { version: 1, canvas: {width:1920,height:1080}, timing:{tail:0,xfade:0,gap:0}, totalDuration: 10, captionGroups: [], frames: [{ id:'f', frameNum:1, slug:'f', voicePath:'v.wav', voiceDur:9, frameDur:10, start:0, words:[{text:'hello', start:0.1, end:0.3}], visualSpecVersion:2, visualKind:'focal', visualBeats:[{version:2,id:'state',text:'State',role:'focal',start:0,end:10,cueText:'<frame-start>',sourceRefs:[],tolerance:{maxLead:0.25,maxLag:0.75}}] }] };
const manifest = { version: 1, framework: 'fixture', bindings: [{ frameSlug:'f', beatId:'state', target:'#state', revealStart:0, revealDuration:0, source:'declarative' }] };
console.log(JSON.stringify(verifyVisualSync({ plan, manifest, policy, fps:30 }), null, 2));
EOF
```

Output:

```json
[]
```

**Why this is a Must fix**

This violates the fixed Part 2/overall contract:

- Strict continuous coverage requires v2 evidence.
- Coverage-only verification (`mode: "off", coverageMode: "required"`) must not fall back to reveal-only v1 bindings.
- A v1 manifest has no `role`, `coverageStart`, `coverageEnd`, `planSha256`, or `authoredInputs`, so it cannot prove continuous semantic coverage or freshness.

**Guidance**

Add an explicit coverage-required manifest-version guard before interval evaluation:

- If `coverageMode !== "off"` and any narrated `visualSpecVersion === 2` frame exists:
  - missing manifest → existing missing-manifest finding is fine;
  - `manifest.version !== 2` → emit `missing_visual_coverage_evidence` or equivalent structured error/warn according to `coverageMode`;
  - do not allow v1 manifest bindings to satisfy v2 coverage.
- Add focused tests for:
  - v2 plan + v1 manifest + `coverageMode: "required"` fails;
  - v2 plan + v1 manifest + `coverageMode: "warn"` warns;
  - v2 plan + v1 manifest + `coverageMode: "off"` keeps reveal-only behavior.

---

### TEST-2 — Must fix — Missing authored inputs can throw raw filesystem errors instead of structured stale-evidence diagnostics

**Evidence**

HyperFrames collector:

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/index.ts:25-28`

```ts
collectVisualBindingInputs: ({ plan, videoDir }) => plan.frames.map((frame) => ({
  path: `compositions/frames/${frame.slug}.html`,
  bytes: readFileSync(join(videoDir, "compositions", "frames", `${frame.slug}.html`)),
})),
```

Remotion collector:

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/index.ts:32-38`

```ts
function collectRemotionVisualBindingInputs(videoDir: string) {
  return ["visual_bindings.json", ...collectRemotionSourcePaths(videoDir)]
    .sort()
    .map((path) => ({
      path,
      bytes: readFileSync(join(videoDir, ...path.split("/"))),
    }));
}
```

These collectors call `readFileSync` directly for required authored inputs. If a previously recorded authored input is missing, verification can fail with a raw `ENOENT` instead of producing the required `stale_visual_evidence` finding with:

- normalized project-relative path;
- missing/removed input classification;
- exact `md2vid build` recovery command.

Current workflow tests cover changed authored input and stale plan digest, but not missing HyperFrames frame files or missing Remotion `visual_bindings.json`.

**Why this is a Must fix**

Part 2 Task 7 explicitly requires diagnostics for changed, missing, and newly relevant authored inputs. The current comparison layer can report `removed`, but these adapter collectors can throw before comparison runs for fixed required paths.

**Guidance**

Make current authored-input enumeration non-throwing for missing files that are part of the expected relevant set.

A practical shape:

- Adapter collectors should return existing current inputs plus structured missing-input metadata, or throw a domain error that `scripts/verify.ts` converts into `stale_visual_evidence`.
- Prefer extending freshness comparison input to include missing paths, so all stale evidence reports use one formatter.
- Add workflow tests:
  - remove `compositions/frames/<slug>.html` after a v2 HyperFrames manifest;
  - remove Remotion `visual_bindings.json` after a v2 Remotion manifest;
  - expect `stale_visual_evidence`, project-relative path, and `md2vid build`.

---

## Exact command evidence

Part 2 Completion Gate was run exactly as requested.

| Command | Result | Evidence |
|---|---:|---|
| `corepack npm run typecheck` | exit 0 | `tsc --noEmit` completed |
| `corepack npm run typecheck:remotion` | exit 0 | `tsc --noEmit -p frameworks/remotion/templates/tsconfig.json` completed |
| `node --test engine/__tests__/visual_evidence.test.ts engine/__tests__/visual_sync.test.ts test/cli/workflows.test.ts` | exit 0 | 142 tests passed, 0 failed |
| `git diff --check` | exit 0 | no output |

Focused test summary from Node test gate:

```text
tests 142
pass 142
fail 0
duration_ms 1883.4625
```

Repository mutation check after commands:

```text
?? docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/reviews/
```

No new tracked or unstaged source mutations were introduced by commands.

---

## Coverage assessment for Task 5-8 matrix

| Area | Assessment |
|---|---|
| Opening/middle/ending/complete gaps | Covered in `/engine/__tests__/visual_sync.test.ts`; complete-frame gap uses `opening_visual_gap` + `extendsThroughFrameEnd`. |
| Exact threshold | Covered: `0.5` passes, `0.500001` fails. |
| Overlap/epsilon | Covered for overlapping intervals and half-frame adjacency. |
| Static/supporting/invalid evidence | Covered for static focal pass, supporting-only non-coverage, invalid evidence error. |
| Exemptions | Covered for full and partial exemptions; exemption remains visible. |
| v1/warn/off | Partially covered. Warn/off paths are covered; v1 manifest with required v2 coverage is not covered and currently bypasses coverage. See TEST-1. |
| Digest exactness | Covered for caption grouping ignored, semantic timing changes hash, canonical determinism, SHA format, sorted paths. |
| Path validation and input set mutations | Unit coverage exists for path validation and freshness diff. Workflow coverage covers changed input, but missing fixed authored inputs are not covered and can throw raw FS errors. See TEST-2. |
| Stale plan/source handling | Covered for stale plan digest and changed authored source in workflow tests. |
| Coverage-only verify | Covered for replan path; gap remains around v1 manifest bypass in coverage-only mode. See TEST-1. |
| Full/captions-only/regroup lifecycle | Covered for full build replacement, captions-only manifest preservation, Remotion regroup preservation, rollback paths. |
| Rollback | Covered extensively across full build and regroup promotion failure tests. |

---

## Success checklists

### TEST-1 success checklist

- [ ] v2 narrated frames with `coverageMode: "required"` reject v1 manifests.
- [ ] v2 narrated frames with `coverageMode: "warn"` report a warning for v1 manifests.
- [ ] `mode: "off", coverageMode: "required"` cannot pass using reveal-only v1 evidence.
- [ ] Existing reveal-only v1 compatibility remains buildable under compatibility defaults.
- [ ] Tests prove no empty finding array for required v2 coverage with v1 manifest.

### TEST-2 success checklist

- [ ] Missing HyperFrames authored frame input reports `stale_visual_evidence`.
- [ ] Missing Remotion authored registry input reports `stale_visual_evidence`.
- [ ] Diagnostics include normalized project-relative path.
- [ ] Diagnostics include exact full-build recovery command.
- [ ] Raw `ENOENT` does not leak as the primary verify failure for stale authored evidence.

---

## Consolidated checklist

- [ ] Add missing coverage-required manifest-version guard.
- [ ] Add v1 manifest bypass tests for required/warn/off behavior.
- [ ] Normalize missing authored-input handling in freshness collection.
- [ ] Add workflow tests for missing HyperFrames and Remotion authored inputs.
- [ ] Re-run Part 2 Completion Gate:
  - [ ] `corepack npm run typecheck`
  - [ ] `corepack npm run typecheck:remotion`
  - [ ] `node --test engine/__tests__/visual_evidence.test.ts engine/__tests__/visual_sync.test.ts test/cli/workflows.test.ts`
  - [ ] `git diff --check`

---

## Residual risks

- Part 2 currently proves neutral verifier and lifecycle behavior with synthetic/fake v2 evidence; framework-native v2 manifest emission is deferred to later parts, so end-to-end v2 adapter parity remains a Part 3/4 risk.
- Workflow stale-evidence tests are strong for changed inputs but still thin for missing and newly relevant fixed-path inputs.
- Manual semantic honesty remains out of scope for machine verification; decorative content can still be declared as focal unless later standards/review gates catch it.
