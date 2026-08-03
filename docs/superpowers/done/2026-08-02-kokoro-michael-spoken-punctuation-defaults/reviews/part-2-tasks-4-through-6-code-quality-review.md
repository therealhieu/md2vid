# Canonical Review Artifact

- Review scope: Part 2, Tasks 4-6
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `f1a1ab44fb7ec55575d3bdd76a1beef4280d29ff`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baseline.VFQjhf/part-2-tasks-4-through-6`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.tqV30J/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Findings

### CQ-1 — Must fix — Valid versioned transcription can produce evidence that every downstream command rejects
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/transcribe.ts:105-111` permits absent `tts_provider` and `voice_id`; it still creates versioned evidence at `:119-129`. The new freshness gate invokes `verifyNarrationEvidence()` at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/plan_project.ts:69-76`, which unconditionally rejects absent metadata provenance at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/narration_evidence.ts:180-184`.
- Why it is wrong: a versioned request with valid WAVs, matching evidence, and no optional root metadata provenance exits `md2vid transcribe` successfully, then `plan`, `build`, `regroup`, and `verify` fail because `undefined !== request.provider/voice`. This contradicts FR-6, which permits retaining effective provenance in `narration_evidence.json` *or* `audio_meta.json`, and makes a successful transcription non-progressing.
- Guidance: make the evidence verifier treat `audio_meta.tts_provider` and `audio_meta.voice_id` as contradiction checks only when each field exists, matching the transcribe-time rule. Preserve failure for an explicitly present conflicting value. Add a workflow test for a versioned request with provenance omitted from `audio_meta.json`: transcribe succeeds, evidence is written, and plan/build/regroup/verify all succeed. Keep the existing contradictory-provenance failures.
  
  Validate with:
  ```bash
  node --test \
    engine/__tests__/narration_evidence.test.ts \
    test/cli/run-exports.test.ts \
    test/cli/workflows.test.ts
  corepack npm run typecheck
  ```
- Success checklist:
  - [ ] Versioned transcription with no root `tts_provider` or `voice_id` produces valid evidence and succeeds through plan, build, regroup, and verify.
  - [ ] Present metadata provenance that conflicts with the request still blocks transcribe and every freshness-gated route.
  - [ ] Existing matching-provenance and legacy fixtures remain unchanged.

### CQ-2 — Nice to have — Malformed request/evidence JSON loses the actionable path and stale-artifact recovery instruction
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/transcribe.ts:82-87` and `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/plan_project.ts:53,65-68` pass raw `JSON.parse()` exceptions to the top-level CLI handler. By contrast, `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/narration_check.ts:87-91` identifies the offending request path.
- Why it is wrong: invalid `audio_request.json` or `narration_evidence.json` reports only a parser message such as `Unexpected token`, not the file to repair. A corrupt participating evidence file also omits the required resynthesis/transcription recovery guidance, despite being unusable for freshness verification.
- Guidance: introduce a small filesystem-bound JSON reader for the transcription/freshness paths that prefixes syntax and read errors with the concrete artifact path. For evidence-read or evidence-schema failures, append the standard recovery instruction without weakening fail-closed behavior. Add tests proving no provider invocation or output mutation on malformed request JSON, and unchanged plan/build/regroup/verify outputs on malformed evidence JSON.
  
  Validate with:
  ```bash
  node --test \
    test/cli/run-exports.test.ts \
    test/cli/plan-project.test.ts \
    test/cli/plan.test.ts \
    test/cli/workflows.test.ts
  ```
- Success checklist:
  - [ ] Malformed request JSON names `audio_request.json`, exits nonzero before provider execution, and leaves managed artifacts unchanged.
  - [ ] Malformed evidence JSON names `narration_evidence.json`, includes recovery guidance, and leaves plan/build/regroup/verify outputs byte-for-byte unchanged.
  - [ ] Valid request and evidence diagnostics retain their current ordering.

### CQ-3 — Nice to have — Transcribe hides retained backup paths after post-commit cleanup failure
- Evidence: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/transcribe.ts:130-131` logs only cleanup error messages. `promoteManagedFiles()` returns `retainedBackups` and `uncertainBackups` at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/managed_file_transaction.ts:385-395`. The build path already reports both sets at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/build.ts:55-67`.
- Why it is wrong: a committed metadata/evidence transaction can leave prior artifact backups behind, but the transcribe diagnostic does not identify where they are. This diverges from the repository’s established transaction-cleanup reporting and makes manual cleanup unnecessarily difficult.
- Guidance: use the build/regroup warning format, or a shared reporter, so transcribe prints known retained and uncertain backup paths alongside cleanup errors. Add an injected backup-cleanup-failure test.
  
  Validate with:
  ```bash
  node --test test/cli/run-exports.test.ts test/cli/managed-file-transaction.test.ts
  ```
- Success checklist:
  - [ ] Post-commit cleanup failure still returns success and preserves promoted metadata/evidence.
  - [ ] Warning output identifies every known retained backup and any uncertain backup path.
  - [ ] Normal successful transcription leaves no transaction residue.

## Consolidated post-implementation checklist
- [ ] Make optional root provenance non-blocking when matching versioned evidence supplies the effective provider and voice; retain explicit contradiction checks.
- [ ] Add the no-root-provenance versioned workflow regression across transcribe, plan, build, regroup, and verify.
- [ ] Add path-qualified JSON read failures and evidence recovery guidance without mutating outputs.
- [ ] Report retained/uncertain transaction backup paths from transcribe cleanup warnings.
- [ ] Run:
  ```bash
  node --test \
    engine/__tests__/narration_evidence.test.ts \
    test/cli/managed-file-transaction.test.ts \
    test/cli/plan-project.test.ts \
    test/cli/plan.test.ts \
    test/cli/run-exports.test.ts \
    test/cli/workflows.test.ts
  corepack npm run typecheck
  ```

## Verification gaps and residual risk
- The supplied Mode A evidence states that 246 Part 2 tests and typecheck passed; this review did not rerun those commands.
- `captureVoiceWavSnapshot()` protects the read itself from path and descriptor changes, but separate processes can still replace request, evidence, or WAV inputs after a command snapshots them. Subsequent freshness-gated commands detect stale persisted WAV evidence; no cross-process filesystem lock exists.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync` contains only the excluded untracked review-artifact directory; `git diff --check` completed without output.