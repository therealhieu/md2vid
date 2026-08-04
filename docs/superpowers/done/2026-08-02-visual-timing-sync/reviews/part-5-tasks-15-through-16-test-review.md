# Canonical Review Artifact

- Review scope: Part 5, Tasks 15-16
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `17af6d835f75f3c621f9e931d6c5f36ed28dd2da; baseline /var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines.GqFx1e/part-5-tasks-15-through-16`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.H9z5uN/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Suites run
- `node --test test/cli/hyperframes-render-policy.test.ts test/cli/hyperframes-cli.test.ts test/cli/hyperframes-self-heal.test.ts` → 35 passed, 0 failed.
- `node --test test/cli/scaffold-project.test.ts test/cli/scaffold-decoupled.test.ts test/scaffold.test.ts frameworks/remotion/__tests__/scaffold.test.ts` → 42 passed, 0 failed.
- `corepack npm run typecheck` → exited 0 (`tsc --noEmit`).
- `corepack npm run typecheck:remotion` → exited 0 (`tsc --noEmit -p frameworks/remotion/templates/tsconfig.json`).
- `git diff --check 17af6d835f75f3c621f9e931d6c5f36ed28dd2da 22749f98d4ee49f38c3cc23a51e268c6140e8741` → exited 0; no whitespace errors.

## Findings

### TEST-1 — Must fix — Invalid output configuration is not exercised through the no-spawn CLI path
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/hyperframes-render-policy.test.ts:165` tests `minimumFinalFps: 1` only via `preflightHyperframesRender()`. The required final `--fps 12` invalid-config route never invokes `runHyperframes()` and therefore does not prove the proxy returns `1` before child spawn. The implementation catches this preflight error at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/hyperframes_cli.ts:322`.
- Guidance: In `test/cli/hyperframes-render-policy.test.ts`, add a focused test such as `invalid output configuration fails before spawn`. Write `output.config.json` with `{ render: { minimumFinalFps: 1 } }`, call `runHyperframes(["render", "--fps", "12"], { cwd, spawn })`, and assert status `1`, `spawned === false`, and an error matching `render.minimumFinalFps.*>= 24`. Run `node --test test/cli/hyperframes-render-policy.test.ts`.
- Success checklist:
  - [ ] An invalid `minimumFinalFps` configuration is tested through `runHyperframes()`, not only the exported preflight helper.
  - [ ] The test proves the child is never spawned.
  - [ ] The focused render-policy suite passes.

### TEST-2 — Must fix — Atomic manifest write failure has no regression test
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/hyperframes-render-policy.test.ts:279` verifies child-exit failure produces no manifest and successful output removes its staging directory, but it does not exercise a successful child followed by `writeRenderManifest()` failure. The atomic staging/promotion cleanup branch is `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/hyperframes_cli.ts:294-311`, with failure handling at `:370-376`.
- Guidance: Add `manifest promotion failure returns 1 and removes its staging directory` in `test/cli/hyperframes-render-policy.test.ts`. Make `${output}.md2vid-render.json` a directory before a fake successful render, causing `renameSync()` to fail; assert `runHyperframes()` returns `1`, reports manifest-write failure, preserves the pre-existing destination, and leaves no `.md2vid-render.json.stage-*` directory. Run `node --test test/cli/hyperframes-render-policy.test.ts`.
- Success checklist:
  - [ ] A successful child plus manifest-promotion failure is covered.
  - [ ] The test proves staging cleanup on manifest-write failure.
  - [ ] The focused render-policy suite passes.

## Consolidated post-implementation checklist
- [ ] Invalid `minimumFinalFps` configuration with final `--fps 12` returns `1` before spawn.
- [ ] Successful-child manifest-promotion failure returns `1`, retains no staged manifest directory, and does not create a success manifest.
- [ ] `node --test test/cli/hyperframes-render-policy.test.ts test/cli/hyperframes-cli.test.ts test/cli/hyperframes-self-heal.test.ts` passes.
- [ ] `node --test test/cli/scaffold-project.test.ts test/cli/scaffold-decoupled.test.ts test/scaffold.test.ts frameworks/remotion/__tests__/scaffold.test.ts` passes.
- [ ] `corepack npm run typecheck` and `corepack npm run typecheck:remotion` pass.

## Coverage gaps and residual risk
- Covered: CLI/config/main-root precedence; fixed 24 FPS floor; low-FPS no-spawn for MP4/MOV; draft/GIF and `--allow-low-fps` escapes; `--quality` independence; non-render passthrough; known/unknown output manifests; exact scaffold `visualSync`, visual-beat example, render defaults, plan script/conflicts, cue-first steps, Remotion 30 FPS/no render config, and scaffold decoupling.
- The tests use a synthetic HyperFrames installation and stubbed child process. They do not run an actual HyperFrames render, so upstream CLI output-path semantics remain integration risk.
- No command-generated tracked mutations were observed. The only working-tree entry remains the excluded dirty-baseline review-artifact directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-02-visual-timing-sync/reviews/`.