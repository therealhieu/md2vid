# Canonical Review Artifact

- Review scope: Part 2, Tasks 4-6
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `f1a1ab44fb7ec55575d3bdd76a1beef4280d29ff`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baseline.VFQjhf/part-2-tasks-4-through-6`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.tqV30J/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Must fix

### TEST-001 — Promotion rollback lacks prior-evidence-absent coverage

**Evidence**

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/run-exports.test.ts:453-487` tests first and second promotion failures only after creating prior evidence:

```ts
const originalEvidence = Buffer.from('{"old":true}\n');
writeFileSync(project.evidencePath, originalEvidence);
```

The exact Part 2 plan requires coverage for “first promotion failure, prior evidence absent” and “second promotion failure, prior evidence absent”:

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-02-kokoro-michael-spoken-punctuation-defaults/2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-2.md:198`.

The current test verifies restoration of two existing destinations but does not verify that a failed paired promotion leaves `narration_evidence.json` absent when it did not exist before promotion.

**Guidance**

Extend the first/second promotion-failure matrix with both evidence states:

```text
prior evidence present → original evidence bytes restored
prior evidence absent  → narration_evidence.json remains absent
```

For each state and failure position, retain assertions that:

- `audio_meta.json` is byte-identical to its pre-run state;
- `narration_evidence.json` is restored or absent as appropriate;
- no `.md2vid-transcribe-*` or `.md2vid-backup-*` residue remains.

**Success checklist**

- [ ] First staged promotion failure with no prior evidence preserves metadata and leaves no evidence file.
- [ ] Second staged promotion failure with no prior evidence restores metadata and leaves no evidence file.
- [ ] Both cases assert transaction-residue cleanup.
- [ ] The Part 2 focused gate remains green.

## Nice to have

None.

## Commands and results

| Command | Result |
|---|---|
| `node --test engine/__tests__/transcribe.test.ts engine/__tests__/voice_assets.test.ts engine/__tests__/narration_request.test.ts engine/__tests__/narration_evidence.test.ts test/cli/managed-file-transaction.test.ts test/cli/plan-project.test.ts test/cli/plan.test.ts test/cli/workflows.test.ts test/cli/run-exports.test.ts` | PASS — 246 passed, 0 failed |
| `corepack npm run typecheck` | PASS |
| `git diff --check f1a1ab44fb7ec55575d3bdd76a1beef4280d29ff..HEAD` | PASS |
| `node --test --test-name-pattern='snapshot result\|versioned metadata/evidence promotion failure\|partial transcription\|unsupported version\|missing versioned fields\|mismatched line IDs and provenance\|legacy transcribe\|plan, build, regroup, and verify reject stale\|BGM and SFX-only\|legacy behavior with' engine/__tests__/transcribe.test.ts test/cli/run-exports.test.ts test/cli/workflows.test.ts` | PASS — 22 passed, 0 failed |
| `node --test --test-name-pattern='versioned transcribe rejects invalid request versions and required fields' test/cli/run-exports.test.ts` | PASS — 1 passed, 0 failed |

The focused tests cover immutable pre-provider snapshots, partial-transcription non-writes, first/second rollback with **prior evidence present**, unsupported/missing versioned fields, ordered IDs/provenance, every enumerated stale mutation through plan/build/regroup/verify, same-duration byte changes, BGM/SFX-only request edits, legacy absent/unversioned/orphan behavior, and unchanged outputs on stale-evidence failures.

## Consolidated checklist

- [x] Immutable pre-provider WAV snapshot identity verified.
- [x] Partial transcription preserves both managed artifacts.
- [x] Promotion rollback with prior evidence present verified at first and second promotion.
- [ ] Promotion rollback with prior evidence absent verified at first and second promotion. `TEST-001`
- [x] Invalid versioned request rejects before provider execution.
- [x] Ordered line IDs and provider/voice provenance mismatch reject without writes.
- [x] All specified stale mutations reject before plan/build/regroup/verify output changes.
- [x] Same-duration different WAV bytes reject.
- [x] BGM/SFX-only edits preserve validity.
- [x] Legacy no-request, unversioned-request, and orphan-evidence behavior remains valid.
- [x] Complete Part 2 focused gate and typecheck pass.

## Command-generated mutations

None in the repository.

Final status contains only the supplied, excluded pre-existing review artifacts under:

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-02-kokoro-michael-spoken-punctuation-defaults/reviews/`

No transaction staging or backup residue was found.

## Residual risks

- The no-prior-evidence rollback state is implemented through the shared transaction path but lacks a direct regression test. A future transaction-order or rollback change could create a stray `narration_evidence.json` without the current suite detecting it.