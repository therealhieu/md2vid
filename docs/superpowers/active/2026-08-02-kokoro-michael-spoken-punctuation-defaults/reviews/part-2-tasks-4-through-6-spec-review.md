# Canonical Review Artifact

- Review scope: Part 2, Tasks 4-6
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `f1a1ab44fb7ec55575d3bdd76a1beef4280d29ff`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baseline.VFQjhf/part-2-tasks-4-through-6`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.tqV30J/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

# Canonical Spec Review — Part 2 Tasks 4–6

**Scope:** dirty-baseline review from `f1a1ab44fb7ec55575d3bdd76a1beef4280d29ff`; reviewed commits `e8d44804`, `11935211`, and `0589264f`. Pre-existing untracked Part 1 review artifacts were excluded.

## Findings

### Must fix

#### SPEC-001 — Versioned transcription can report success while producing artifacts the freshness gate rejects

**Evidence**

- [`scripts/transcribe.ts:105-111`](/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/transcribe.ts#L105-L111) intentionally permits absent `tts_provider` and `voice_id`; it rejects only explicit contradictions.
- [`engine/narration_evidence.ts:180-185`](/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/narration_evidence.ts#L180-L185) then treats those absent metadata fields as mismatches unconditionally during planning/verification.
- [`engine/narration_evidence.ts:135-148`](/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/narration_evidence.ts#L135-L148) successfully writes provider and voice into `narration_evidence.json` even when the metadata has neither field.
- The requirements permit retained provenance in **evidence or metadata**: [`requirements.md:297`](/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-02-kokoro-michael-spoken-punctuation-defaults/2026-08-02-kokoro-michael-spoken-punctuation-defaults-requirements.md#L297).

A versioned request plus otherwise valid `audio_meta.json` with no root provenance therefore follows:

```text
md2vid transcribe → exit 0; writes metadata + valid-looking evidence
md2vid plan/build/regroup/verify → rejects metadata undefined provenance
```

**Guidance**

Make missing metadata provenance non-contradictory when matching versioned evidence contains the required provider and voice. Keep rejection for explicitly present, mismatching metadata fields. Do not synthesize provenance into metadata unless the producer can attest it truthfully.

**Success checklist**

- [ ] A versioned request with metadata that omits both provenance fields transcribes successfully.
- [ ] Its generated evidence passes `plan`, `build`, `regroup`, and `verify`.
- [ ] Explicitly mismatched metadata provenance still fails before outputs change.
- [ ] Add an end-to-end regression that exercises transcription followed by all four freshness-gated commands.

#### SPEC-002 — Duplicate source WAV paths let transcription commit evidence that fails its own schema

**Evidence**

- [`engine/audio_meta.ts:92-110`](/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/audio_meta.ts#L92-L110) requires unique voice IDs but permits multiple voices to reference the same WAV path.
- [`engine/voice_assets.ts:456-465`](/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/voice_assets.ts#L456-L465) deliberately deduplicates snapshots by path.
- [`engine/narration_evidence.ts:139-148`](/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/narration_evidence.ts#L139-L148) emits an evidence entry for every metadata voice, preserving duplicate paths.
- [`engine/narration_evidence.ts:108-115`](/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/narration_evidence.ts#L108-L115) rejects duplicate evidence paths.
- [`scripts/transcribe.ts:120-130`](/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/transcribe.ts#L120-L130) stages and promotes that generated evidence without validating it first.

Thus, versioned transcription can return `0` and atomically publish an evidence document which the next freshness gate rejects as malformed.

**Guidance**

Because the approved evidence schema requires unique paths, reject duplicate `audio_meta.json` voice paths for participating versioned requests before provider execution and before any artifact promotion. Keep legacy audio-only behavior unchanged. Alternatively, changing the evidence schema would require revisiting the Part 1 strict-schema contract, so it is not the narrower fix.

**Success checklist**

- [ ] A versioned request with two voices pointing to one WAV fails before provider execution.
- [ ] `audio_meta.json`, existing evidence, and managed-file residue remain unchanged after that failure.
- [ ] Valid versioned requests with unique paths still promote metadata and evidence atomically.
- [ ] Legacy projects retain their existing duplicate-path behavior unless separately migrated by an approved contract change.

### Nice to have

None.

## Consolidated checklist

- [ ] Resolve **SPEC-001**: permit evidence-backed provenance when metadata provenance is absent, while retaining contradiction checks.
- [ ] Resolve **SPEC-002**: reject duplicate metadata WAV paths on the versioned transcription route before provider/output work.
- [x] Task 4 preserves root metadata fields and returns the pre-provider WAV snapshots.
- [x] Task 5 parses versioned requests before provider execution; validates ordered IDs/provenance; uses paired managed-file promotion with rollback coverage; and preserves legacy/orphan-evidence behavior.
- [x] Task 6 gates plan, build, regroup, and verify before planning/emission; checks request fields and WAV bytes; retains legacy compatibility; and keeps production code free of media-use/synthesis coupling.
- [x] Focused Part 2 gate passed: **246/246** tests.
- [x] `corepack npm run typecheck` passed.
- [x] Scoped production/test changes match the supplied Tasks 4–6 patch; workspace status contains only the excluded pre-existing `reviews/` artifacts.

## Residual risk

- Atomic paired promotion provides rollback for handled rename failures, but it cannot make multiple filesystem renames crash-atomic across abrupt process or host failure.
- The required provider and WAV attestations are verified from retained project artifacts; this review did not invoke an external synthesis provider.