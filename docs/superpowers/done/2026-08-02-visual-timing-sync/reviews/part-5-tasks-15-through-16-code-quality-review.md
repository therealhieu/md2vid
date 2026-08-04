# Canonical Review Artifact

- Review scope: Part 5, Tasks 15-16
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `17af6d835f75f3c621f9e931d6c5f36ed28dd2da; baseline /var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines.GqFx1e/part-5-tasks-15-through-16`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.H9z5uN/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Findings

### CQ-1 — Must fix — Parse all supported HyperFrames FPS forms before policy enforcement
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/hyperframes_cli.ts:268-280` — the preflight recognizes only `--fps` and `--fps=`, so HyperFrames’ documented `-f` form is not reflected in `policy.fps`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/hyperframes_cli.ts:148-153` — `Number(value)` rejects HyperFrames’ documented rational FPS values such as `30000/1001`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/hyperframes_cli.ts:342-345` — unrecognized `-f 12` is still forwarded literally to HyperFrames.
- Why: `md2vid hyperframes render -f 12 --output renders/final.mp4` computes the default/configured FPS (normally 30), passes the final-FPS gate, then invokes HyperFrames at 12 FPS. This is a direct final-floor bypass. Conversely, valid 29.97/23.976-style upstream arguments now fail before spawn, regressing existing HyperFrames CLI compatibility.
- Guidance: Parse `-f` and `-f=<value>` alongside the long forms, and parse the same documented FPS grammar HyperFrames accepts, including positive rational values. Retain the original literal FPS argument in `forwardedArgs`; use its normalized numeric value only for policy comparison and manifest evidence. Add coverage for:
  - `-f 12` final MP4/MOV → fails before spawn.
  - `-f 24` final MP4/MOV → spawns.
  - `--fps=24000/1001` → fails final floor.
  - `--fps=30000/1001` → succeeds and records the normalized FPS policy.
  - Validate with:
    ```bash
    node --test test/cli/hyperframes-render-policy.test.ts
    ```
- Success checklist:
  - [ ] Every HyperFrames-supported FPS spelling is policy-parsed before spawn.
  - [ ] No short-form low-FPS final render can reach HyperFrames without `--allow-low-fps`.
  - [ ] Valid rational FPS arguments retain their existing HyperFrames behavior.

### CQ-2 — Must fix — Determine final-video enforcement from the render format, not only filename suffix
- Evidence:
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/hyperframes_cli.ts:214-216` — `isFinalVideoOutput()` classifies the output solely by `.mp4`/`.mov` suffix.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/hyperframes_cli.ts:252-280` — preflight parses policy/FPS flags but does not inspect the forwarded HyperFrames `--format` option.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/hyperframes_cli.ts:220-229` — that suffix-only result controls whether the final FPS floor is applied.
- Why: HyperFrames selects its rendered container through `--format` (defaulting to MP4), independently of the output pathname. A final request such as `--format mov --output renders/preview.gif --fps 12` is classified as non-final by the proxy and bypasses the 24 FPS floor despite requesting a MOV render. The inverse can unnecessarily block an intentional GIF/PNG-sequence render whose filename happens to end in `.mp4`.
- Guidance: Parse `--format <value>` and `--format=<value>` without consuming them. Resolve the effective container using HyperFrames’ format semantics, including its MP4 default, and apply the floor only to effective MP4/MOV final renders. Keep case-insensitive suffix handling only as a fallback if the upstream CLI genuinely infers the format from the extension. Add pre-spawn cases for explicit MOV, GIF, PNG-sequence, and default MP4 behavior.
- Success checklist:
  - [ ] A 12-FPS final MP4/MOV request is rejected regardless of a misleading output filename.
  - [ ] Intentional GIF/PNG-sequence output is not blocked solely by its filename suffix.
  - [ ] `--format` remains a literal argument forwarded unchanged to HyperFrames.
  - [ ] The render-policy test validates both `--format value` and `--format=value`.

## Consolidated post-implementation checklist
- [ ] Parse `--fps`, `--fps=`, `-f`, and `-f=` using HyperFrames-compatible integer/rational FPS validation.
- [ ] Ensure the normalized effective FPS, not only the forwarded syntax, drives the final-render floor and manifest.
- [ ] Resolve the actual render container from HyperFrames `--format` semantics before applying MP4/MOV policy.
- [ ] Add regression tests proving no short-FPS or format/path mismatch bypasses the pre-spawn gate.
- [ ] Run:
  ```bash
  node --test \
    test/cli/hyperframes-render-policy.test.ts \
    test/cli/hyperframes-cli.test.ts \
    test/cli/hyperframes-self-heal.test.ts
  ```

## Verification gaps and residual risk
- I did not run tests or render commands, honoring the read-only/no-artifact constraint; the reported Mode A test and typecheck results were not independently reverified.
- Scaffold changes otherwise match the requested contract on inspection: required `visualSync`, plan script, visual-beat example, HyperFrames 30/24 render defaults, cue-first next steps, decoupled paths, and a matching custom declaration/helper invocation in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/templates/frame-template.html`.