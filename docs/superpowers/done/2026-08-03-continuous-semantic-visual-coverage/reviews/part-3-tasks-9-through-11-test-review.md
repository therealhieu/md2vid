# Canonical Review Artifact

- Review scope: Part 3, Tasks 9-11
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `219772e22c35ee76a4f5aae40812a524a378e2a2`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines/continuous-visual-coverage/part-3-tasks-9-through-11`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.part3.ckN8k4/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

## TEST-1 Must fix — Coverage-required builds can silently downgrade invalid HyperFrames v2 bindings when reveal mode is off

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/emit.ts:330-349`
  - `preflight()` passes only `resolveVisualSyncPolicy(config).mode` into `prepareFrameVisualTiming()`.
  - It ignores `coverageMode`, even though Part 3 depends on `mode` and `coverageMode` being independent.

```ts
const mode = resolveVisualSyncPolicy(config).mode;
// ...
const prepared = prepareFrameVisualTiming({
  frame,
  authoredHtml: sanitizedHtml,
  documentPath: relativePath,
  mode,
});
```

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:73-75`
  - Invalid coverage declarations only throw when `mode === "required"`.

```ts
function fail(mode: VisualSyncMode, documentPath: string, message: string): never | false {
  if (mode === "required") throw new Error(`${documentPath}: ${message}`);
  return false;
}
```

- Reproduction command:

```bash
node --input-type=module <<'EOF'
import { prepareFrameVisualTiming } from './frameworks/hyperframes/visual_timing.ts';
const frame = { id:'overview', frameNum:1, slug:'overview', voicePath:'assets/voice/overview.wav', voiceDur:2, frameDur:3, start:0, words:[{text:'A',start:0,end:0.1}], visualSpecVersion:2, visualKind:'focal', visualBeats:[{version:2,id:'opening',text:'Opening',role:'focal',start:0,end:3,cueText:'<frame-start>',sourceRefs:[],tolerance:{maxLead:0.25,maxLag:0.75}}] };
const html = '<template data-composition-id="overview"><div data-composition-id="overview" data-duration="2"><article id="opening" data-md2vid-beat="opening" data-md2vid-enter="none">Opening</article></div></template>';
const result = prepareFrameVisualTiming({ frame, authoredHtml: html, documentPath: 'compositions/frames/overview.html', mode: 'off' });
console.log(JSON.stringify({bindings: result.bindings.length, htmlUnchanged: result.html === html}));
EOF
```

Output:

```text
{"bindings":0,"htmlUnchanged":true}
```

**Why this matters**

Part 3 and the index plan require reveal mode and coverage mode to be independent. A project can set:

```json
{ "visualSync": { "mode": "off", "coverageMode": "required" } }
```

In that state, v2 coverage binding contract errors should be hard failures. Instead, the adapter treats them as non-required, drops bindings, and leaves authored HTML unchanged. Verification may later fail from missing coverage, but the build-time contract violation is no longer reported at the exact offending declaration.

**Guidance**

Pass an effective strictness into HyperFrames timing preparation based on both modes:

```text
effectiveTimingMode =
  policy.mode === "required" || policy.coverageMode === "required" ? "required"
  : policy.mode === "warn" || policy.coverageMode === "warn" ? "warn"
  : "off"
```

Then add a regression test for:

```json
visualSync: { mode: "off", coverageMode: "required" }
```

with a v2 semantic target missing `data-md2vid-coverage="planned"`.

---

## TEST-2 Must fix — Browser seek coverage samples are not generated for every v2 binding

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.ts:1678-1700`

```ts
export function deriveSmokeCoverageChecks(
  frames: ReadonlyArray<{ slug: string; start: number; frameDur: number }>,
  bindings: ReadonlyArray<{
    frameSlug: string;
    target: string;
    coverageStart?: number;
    coverageEnd?: number;
  }>,
  fps: number,
): SmokeCoverageCheck[] {
  assert.ok(Number.isFinite(fps) && fps > 0, `generated root FPS must be positive, got ${fps}`);
  const epsilon = 0.001;
  return SMOKE_FRAME_PROBES.map((probe) => {
    const frame = frames.find((candidate) => candidate.slug === probe.compositionId);
    // ...
    const target = `#${probe.futureId}`;
    const matches = bindings.filter((binding) =>
      binding.frameSlug === probe.compositionId &&
      binding.target === target &&
      Number.isFinite(binding.coverageStart) &&
      Number.isFinite(binding.coverageEnd)
    );
```

The generator iterates `SMOKE_FRAME_PROBES`, then looks for exactly one hard-coded `futureId` target per frame. It does not iterate all manifest-v2 bindings with `coverageStart`/`coverageEnd`.

**Why this matters**

Part 3 requires boundary samples “for each v2 binding”:

```text
coverageStart - 0.01
coverageStart
coverageStart + 0.1
coverageEnd - 0.01
coverageEnd
```

Current coverage proves only the two smoke “future” targets. Extra focal/supporting/final targets in the manifest can regress on direct/reverse/sequential seek behavior without being sampled unless they happen to match `SMOKE_FRAME_PROBES`.

**Guidance**

Make `deriveSmokeCoverageChecks()` derive checks from `bindings.filter(isV2CoverageBinding)` and join each binding to its frame timing. If smoke still wants to assert fixture-specific IDs, keep that as an additional assertion, not the sample-generation loop.

---

## Command evidence

| Command | Result | Evidence |
|---|---:|---|
| `corepack npm run typecheck` | exit 0 | `tsc --noEmit` completed with no errors |
| `node --test frameworks/hyperframes/__tests__/visual_timing.test.ts frameworks/hyperframes/__tests__/emit.test.ts frameworks/hyperframes/__tests__/verify.test.ts test/visual/composed-visual-integrity.test.ts test/release/harness.test.ts` | exit 0 | `tests 208`, `pass 208`, `fail 0`, duration `74711.632916ms` |
| `git diff --check` | exit 0 | no output |
| `git status --short` before gate | exit 0 | `?? docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/reviews/` |
| `git status --short` after gate | exit 0 | unchanged: `?? docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/reviews/` |

## Command-generated mutations

- No repository mutations detected by `git status --short`.
- The test command generated temporary diagnostics/artifacts under `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T/`, including retained release diagnostics paths printed by the harness.

## Success checklists

### Static / animated / supporting / custom declarations

- Static declarative v2 evidence is covered in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/__tests__/visual_timing.test.ts`.
- Animated declarative v2 evidence is covered.
- Supporting declaration evidence is covered.
- Custom `coverage: "planned"` evidence is covered.
- Gap: strictness is tied to reveal `mode`, not effective coverage strictness. See TEST-1.

### Shell rejection

- Unknown shell target with `data-md2vid-coverage="planned"` is rejected by test coverage.
- Unplanned coverage target does not auto-bind.

### Owned exit

- `timing.exit(..., { at: "coverage-end" })` is covered.
- Mismatched target and unsupported `at` value are covered.
- Gap: strictness mode issue can still downgrade invalid declarations when `mode=off`, `coverageMode=required`. See TEST-1.

### Inner / outer duration

- Tests assert authored inner duration remains `voiceDur`.
- Tests assert final evidence can end at outer `frameDur`.
- Runtime avoids appending an inner hide at final `frameDur > voiceDur`.

### Raw-source freshness mutation / new frame

- Full build manifest-v2 raw frame digest is covered.
- Post-build authored frame mutation rejection is covered.
- Newly planned frame source-set rejection is covered.

### v1 compatibility

- Manifest-v1 path is preserved for non-v2 plans in `emit.ts`.
- Existing v1 reveal tests still pass in the focused test gate.

### Direct / reverse / sequential boundary samples

- Runtime/unit coverage exists for declarative timing handoff.
- Browser smoke now compares direct/sequential/reverse state.
- Gap: browser sample generation is limited to `SMOKE_FRAME_PROBES`, not every v2 binding. See TEST-2.

### Held landing

- Browser smoke includes a final landing check between `voiceDur` and `frameDur`.
- Final landing target visibility and nonzero opacity are asserted.

### Template contract

- Template contract test checks:
  - `data-md2vid-beat="opening-context"`
  - `data-md2vid-enter="none"`
  - `data-md2vid-coverage="planned"`
  - `data-md2vid-beat="body-detail"`
  - `data-md2vid-beat="final-landing"`

## Consolidated checklist

- [ ] TEST-1: Use an effective timing strictness derived from both `mode` and `coverageMode`.
- [ ] TEST-1: Add regression coverage for `mode: "off", coverageMode: "required"` invalid v2 declarations.
- [ ] TEST-2: Generate browser coverage samples from every manifest-v2 binding, not only `SMOKE_FRAME_PROBES`.
- [ ] TEST-2: Keep fixture-specific smoke target assertions separate from generic v2 binding sample generation.
- [x] Part 3 completion gate commands ran and exited 0.
- [x] No repository mutations from review commands.

## Residual risks

- The browser harness checks `checkVisibility()` for semantic visibility and only asserts opacity for held landing. That is acceptable for the current `autoAlpha` implementation, but future opacity-only activation regressions at exact start samples may need a stricter opacity threshold if the semantic contract requires visible pixels at `coverageStart`.
- Temporary release diagnostics under `/var/folders/.../T/` were produced by tests. They are outside the repository and were not cleaned by this read-only review.
