# Canonical Review Artifact

- Review scope: Part 3, Tasks 7-8
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `ac9a7037b0682dc98ee5cc428e8b0cdcd11823d3`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baseline.34fCmr/part-3-tasks-7-through-8`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.hsIdQX/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Scope

Dirty-baseline review from `ac9a7037b0682dc98ee5cc428e8b0cdcd11823d3`.

Reviewed Part 3 Tasks 7–8 changes in:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/scaffold_project.ts`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/scaffold.ts`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/scaffold.ts`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/skill/md2vid/SKILL.md`
- Related focused tests and boundary checks.

Pre-existing review artifacts under `docs/superpowers/active/.../reviews/` were excluded.

## Must fix

None.

## Nice to have

None.

## Verification evidence

| Check | Exact command | Result | Evidence |
|---|---|---|---|
| Part 3 focused gate | `node --test test/cli/scaffold-project.test.ts test/scaffold.test.ts test/cli/scaffold-decoupled.test.ts frameworks/remotion/__tests__/scaffold.test.ts test/cli/skill-commands.test.ts test/cli/skill-media-contract.test.ts test/boundaries.test.ts` | PASS | 78 passed, 0 failed |
| Primary typecheck | `corepack npm run typecheck` | PASS | `tsc --noEmit` exited 0 |
| Remotion typecheck | `corepack npm run typecheck:remotion` | PASS | `tsc --noEmit -p frameworks/remotion/templates/tsconfig.json` exited 0 |
| External speed compatibility | Required plan command against `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/media-use/audio/scripts/lib/tts.mjs` | PASS | `PASS: media-use forwards Kokoro speed` |
| Fail-closed readiness regression | Isolated extracted media-contract harness for FFmpeg, FFprobe, Kokoro, and Michael failures | PASS | All four exited 1, invoked no media runner, and emitted the exact four recovery lines |
| Scope whitespace | `git diff --check ac9a7037b0682dc98ee5cc428e8b0cdcd11823d3` | PASS | No whitespace errors |
| Production synthesis boundary | Included in focused gate: `test/boundaries.test.ts` | PASS | No production TypeScript media-use locator, runner, or audio synthesis route detected |
| Exact portable-command / near-match rejection | Included in focused gate: `test/cli/skill-commands.test.ts` | PASS | Exact portable command accepted; request-bearing, root-changed, executable-changed, and extension-changed near matches rejected |

### Requirement coverage exercised

```text
FR-1 exact request
  → common scaffold default
  → HyperFrames project scaffold
  → Remotion project scaffold

Onboarding order
  → spoken script
  → materialized request
  → narration-check
  → Kokoro readiness / media-use
  → transcribe
  → slugs → beats → plan → visuals → build → check → review → render

Media contract
  → default Kokoro/Michael arguments
  → explicit HeyGen provider/voice/speed override
  → non-Kokoro skips Kokoro catalog lookup
  → FFmpeg / FFprobe / Kokoro / Michael failure closes before invocation
```

The isolated readiness checks verified exact stderr for each failure:

```text
Kokoro readiness failed: <capability>
Preflight command: md2vid hyperframes doctor --json
Next step: md2vid hyperframes doctor
No system, cloud, or automatic fallback was used.
```

## Finding guidance and success checklists

No `TEST-*` findings were recorded, so no remediation guidance or per-finding success checklist applies.

## Consolidated checklist

- [x] Exact versioned `audio_request.json.example` defaults tested.
- [x] Per-field drift rejection tested for version, provider, voice, language, and speed.
- [x] HyperFrames and Remotion onboarding order tested.
- [x] Default Kokoro/Michael command arguments tested.
- [x] Explicit HeyGen override tested.
- [x] Non-Kokoro path confirmed not to call the Kokoro voice catalog.
- [x] Missing FFmpeg, FFprobe, Kokoro runtime, and Michael all fail closed before media invocation.
- [x] Warning-review instruction precedes media contract and follows narration-check.
- [x] Exact portable command accepted and near matches rejected.
- [x] Production boundary scan tested.
- [x] Both TypeScript checks completed.
- [x] External Kokoro speed-forwarding gate completed.
- [x] No repository mutations made by this pass.

## Mutations

No repository files were modified. The focused tests and isolated contract harness created and cleaned temporary directories only. Working-tree status remains limited to the pre-existing untracked review directory:

```text
?? docs/superpowers/active/2026-08-02-kokoro-michael-spoken-punctuation-defaults/reviews/
```

## Residual risks

- The external speed gate is source inspection of the installed media-use implementation; it confirms `--speed` forwarding exists but does not synthesize audio.
- The contract tests use fake `md2vid` and media-use executables by design, so they verify command ownership, arguments, and fail-closed behavior without requiring a local Kokoro synthesis run.