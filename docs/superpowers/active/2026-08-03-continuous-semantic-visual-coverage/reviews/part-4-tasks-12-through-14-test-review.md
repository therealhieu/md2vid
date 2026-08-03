# Canonical Review Artifact

- Review scope: Part 4, Tasks 12-14
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `2c12a9bbcf4c8ca5db37cb49088bc1e34a3f2fce`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines/continuous-visual-coverage/part-4-tasks-12-through-14`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.part4.clyCkY/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

## Scope

Reviewed grouped Part 4 Tasks 12–14 only.

## TEST-* findings

### TEST-1 — Must fix — Nested generated/dependency directories enter Remotion authored-input freshness

`collectRemotionSourcePaths()` excludes `node_modules`, `build`, and `dist` only when they are immediate children of `src`. Nested generated/dependency folders under `src/**` are included in `authoredInputs`, contrary to the Part 4 requirement that generated/output/dependency directories never enter the authored-input set.

Relevant code:

```ts
// frameworks/remotion/visual_bindings.ts:380-382
if (stat.isDirectory()) {
  if (relative === "src" && EXCLUDED_SOURCE_DIRS.has(entry.name)) continue;
  paths.push(...collectRemotionSourcePaths(videoDir, path));
}
```

Reproduction probe, read-only temp project:

```text
Input temp tree:
src/Video.tsx
src/components/node_modules/dep.ts
visual_bindings.json

Observed collectRemotionVisualBindingInputs():
["src/Video.tsx","src/components/node_modules/dep.ts","visual_bindings.json"]
```

Why this matters:

```text
Expected freshness set:
visual_bindings.json + authored src source files
excluding node_modules/build/dist at any depth

Actual freshness set:
visual_bindings.json + authored src source files
+ src/components/node_modules/dep.ts
```

Impact:

- False stale-evidence failures if a nested dependency/build output under `src/**` changes.
- Violates Task 12 Step 5 and Step 1 exclusion coverage.
- Existing tests cover only top-level `src/node_modules`, `src/build`, and `src/dist`, so the regression is unguarded.

Guidance:

- Exclude `node_modules`, `build`, and `dist` by directory basename at every recursion depth.
- Add a test under `frameworks/remotion/__tests__/emit.test.ts` or `test/cli/workflows.test.ts` proving nested `src/components/node_modules/*.ts`, `src/scenes/build/*.tsx`, and `src/lib/dist/*.js` are omitted.

### TEST-2 — Nice to have — Packed Remotion smoke does not assert direct/reverse runtime visibility or final landing DOM state

Task 14 Step 4 asks the packed Remotion smoke to assert direct and reverse visibility for `smoke-opening` and `smoke-landing`, and that `smoke-landing` remains visible through each neutral `frameDur`.

The current packed Remotion path injects the custom targets and runs build/check/still:

```ts
// test/release/harness.ts:2727-2731
await narrationStages.run("build/check Remotion", () => {
  runProjectNpm(context, project, ["install"]);
  runProjectNpm(context, project, ["run", "build"]);
  runProjectNpm(context, project, ["run", "check"]);
  runProjectNpm(context, project, ["run", "still"]);
});
```

But it does not inspect Remotion-rendered visibility at opening/start/middle/end/direct/reverse samples. The lower-level helper tests cover deterministic boundary logic, and `md2vid verify` covers manifest intervals, but the packed smoke does not prove the generated package’s Remotion runtime DOM behavior for final landing retention.

Guidance:

- Keep current build/check/still smoke.
- Add a focused Remotion runtime probe against the packed project that samples `data-testid="smoke-opening"` and `data-testid="smoke-landing"` around before start, at start, middle, before end, direct seek, reverse seek, and final landing near `frameDur`.
- Assert `smoke-landing` is visible at the last renderable frame for each smoke frame.

## Command evidence

All required Part 4 gate commands were run exactly.

| Command | Result |
|---|---|
| `corepack npm run typecheck` | exit 0; `tsc --noEmit` |
| `corepack npm run typecheck:remotion` | exit 0; template `tsc --noEmit` |
| `node --test frameworks/remotion/__tests__/visual_beats.test.ts frameworks/remotion/__tests__/emit.test.ts frameworks/remotion/__tests__/verify.test.ts frameworks/remotion/__tests__/scaffold.test.ts test/cli/workflows.test.ts test/release/harness.test.ts` | 246 pass, 0 fail |
| `git diff --check` | exit 0; no output |

## Generated mutations

Worktree after tests:

```text
?? docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/reviews/
```

The untracked reviews directory was already present; no files were edited by the reviewer.

## Success checklists

### Registry v2 exactness / role source

- Covered: v2 parser rejects authored `role`.
- Covered: `coverage: "planned"` required.
- Covered: role copied from neutral state.

### Shared boundary quantization

- Covered: adjacent state end/start produce matching rounded values in current fixtures.
- Covered: runtime frame boundaries use emitted `startFrame`/`endFrame`.

### Invalid interval handling

- Covered: inverted planned interval rejected rather than clamped.

### Source mutations / add / remove / symlink / exclusions

- Covered: registry/source mutation, addition, removal, symlink rejection, top-level exclusions.
- Failing behavior: nested generated/dependency dirs are included. See TEST-1.

### BeatState / BeatReveal start / middle / end / direct / reverse

- Covered: helper-level active interval and progress behavior.
- Gap: packed smoke lacks DOM visibility proof. See TEST-2.

### Fallback non-semantic

- Covered: default title card remains outside semantic registry/evidence by default.

### Parity

- Covered: HyperFrames and Remotion neutral visual-gap findings match.

### Packed custom targets and final landing

- Covered: custom source strings, build/check/still.
- Gap: no packed runtime assertion for landing DOM visibility.

### SSR / typecheck

- Covered: root and Remotion typechecks; release still smoke.

## Consolidated checklist

Must fix:

- [ ] TEST-1: Exclude generated/dependency directories by basename at every recursion depth.
- [ ] TEST-1: Add nested exclusion regression tests.

Nice to have:

- [ ] TEST-2: Add packed Remotion runtime visibility assertions for direct/reverse/final landing samples.

## Residual risks

- The verifier remains manifest-based and does not parse arbitrary TSX.
- Remotion packed smoke currently proves build/check/still and manifest verification, but not sampled DOM visibility across all semantic boundaries.
