# Canonical Review Artifact

- Review scope: Part 3, Tasks 7-8
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `ac9a7037b0682dc98ee5cc428e8b0cdcd11823d3`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baseline.34fCmr/part-3-tasks-7-through-8`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.hsIdQX/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Must fix

### CQ-001 — Readiness failures bypass the required fail-closed diagnostic

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/skill/md2vid/SKILL.md:167-171` runs doctor and the Kokoro catalog in unguarded command substitutions under `set -e`:

  ```bash
  DOCTOR_JSON=$(md2vid hyperframes doctor --json)
  ...
  VOICES_JSON=$(md2vid hyperframes tts --list --json)
  ```

  A non-zero doctor/catalog exit terminates the shell immediately, without the four required recovery lines.

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/skill/md2vid/SKILL.md:172-191` assumes `doctor.checks` is an array and the catalog is an array. Malformed JSON, a changed schema, or a non-array catalog throws from `JSON.parse`, `.find`, or `.some`; it does not call `failReadiness()`.

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/skill/md2vid/SKILL.md:159,195` derives a portable media-use path but never verifies that `audio/scripts/audio.mjs` exists and is readable. A missing installed `media-use` skill ends in a Node module-resolution error rather than the required actionable failure.

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/skill-media-contract.test.ts:149-158` covers `ok: false` and a missing voice only. It does not cover doctor/catalog process failures, invalid JSON/schema, or a missing media-use runner.

**Guidance**

Create one shell-level failure helper before any external invocation. It must print the required failed capability, `md2vid hyperframes doctor --json`, `md2vid hyperframes doctor`, and the no-fallback statement. Use it for:

```text
media-use executable missing
doctor command failed
Kokoro catalog command failed
invalid doctor JSON/schema
invalid catalog JSON/schema
```

Validate that the doctor response contains a `checks` array of `{ name: string, ok: boolean }`, and that the Kokoro catalog is an array with string `id` values, before testing capabilities. Preserve the current provider-specific behavior: non-Kokoro overrides must not invoke or require the Kokoro catalog.

**Success checklist**

- [ ] Doctor command failure exits non-zero before audio invocation and prints all four recovery lines.
- [ ] Kokoro catalog command failure exits non-zero before audio invocation and prints all four recovery lines.
- [ ] Malformed or schema-invalid doctor/catalog JSON exits through the stable recovery path, not a stack trace.
- [ ] Missing `$MEDIA_USE_ROOT/audio/scripts/audio.mjs` exits through the stable recovery path.
- [ ] Valid HeyGen/ElevenLabs overrides still skip Kokoro runtime/catalog checks.
- [ ] All failure cases prove the fake media runner was not invoked.

---

### CQ-002 — The exported “frozen” scaffold oracle remains mutable and can self-authorize drift

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/scaffold_project.ts:19-26` freezes only the outer object:

  ```ts
  export const AUDIO_REQUEST_EXAMPLE = Object.freeze({
    version: 1,
    ...DEFAULT_NARRATION_POLICY,
    lines: [
      { id: "intro", text: "Introduce the topic." },
      { id: "recap", text: "Recap the key idea." },
    ],
  });
  ```

- The review reproduced:

  ```text
  Object.isFrozen(AUDIO_REQUEST_EXAMPLE)         === true
  Object.isFrozen(AUDIO_REQUEST_EXAMPLE.lines)   === false
  Object.isFrozen(AUDIO_REQUEST_EXAMPLE.lines[0]) === false
  ```

  `AUDIO_REQUEST_EXAMPLE.lines[0].text = "mutated"` succeeds.

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/scaffold_project.ts:125,186` uses that same mutable export for both generation and validation. Any importer that mutates a nested line changes the emitted example and the comparison oracle together, so the claimed exact-shape validation accepts the altered contract.

**Guidance**

Make the canonical example deeply immutable, or keep the mutable implementation detail unexported and expose a function that returns a fresh deep copy for writing. At minimum freeze every line and the `lines` array; model it as readonly in TypeScript. Keep validation anchored to an immutable canonical serialization/value.

**Success checklist**

- [ ] `lines` and each line object reject mutation at runtime.
- [ ] TypeScript exposes the example as recursively readonly.
- [ ] A regression test attempts to mutate a nested line, then proves scaffold output and `validateCommonScaffold()` still enforce the FR-1 text.
- [ ] Validation continues to reject missing fields, extra fields, reordered lines, and changed line text.

## Nice to have

None.

## Consolidated checklist

- [ ] CQ-001: Route missing media-use, doctor/catalog process failures, and invalid external JSON/schema through one stable fail-closed diagnostic.
- [ ] CQ-001: Add contract tests for each external failure path and prove synthesis is never reached.
- [ ] CQ-002: Replace shallow freezing of `AUDIO_REQUEST_EXAMPLE` with deep immutability or a private immutable oracle plus fresh writer copies.
- [ ] CQ-002: Add mutation-resistance coverage for the exact scaffold default oracle.

## Residual risks

- The documented contract intentionally depends on HyperFrames’ external doctor check names (`FFmpeg`, `FFprobe`, `TTS (Kokoro)`) and voice-catalog IDs. HyperFrames upgrades require the compatibility contract tests to run against the upgraded CLI.
- The shell fence remains an operator-executed workflow. The repository can enforce its command contract, but cannot technically prove an operator performed narration-warning review before manually invoking the fence.