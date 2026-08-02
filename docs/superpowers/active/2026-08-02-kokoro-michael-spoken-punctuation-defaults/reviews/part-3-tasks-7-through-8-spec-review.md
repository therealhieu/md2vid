# Canonical Review Artifact

- Review scope: Part 3, Tasks 7-8
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `ac9a7037b0682dc98ee5cc428e8b0cdcd11823d3`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baseline.34fCmr/part-3-tasks-7-through-8`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.hsIdQX/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Review scope

- Mode: dirty-baseline
- Reviewed Part 3 Tasks 7–8 changes in commits `595c16a` and `85fb260`
- Authorities: active requirements, design, index plan, and exact Part 3 plan
- Considered supplied evidence: Part 3 focused gate (78 tests), both typechecks, and external Kokoro-speed gate passed.

## Findings

### Must fix

#### SPEC-001 — Canonical multi-framework synthesis bypasses the `/md2vid` media contract

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/skill/md2vid/SKILL.md:292` still says to generate canonical shared audio with `/hyperframes-media`.
- The required `/md2vid` contract is the marked block at `SKILL.md:156-205`, which explicitly loads persisted `provider`, `voice`, `lang`, and `speed`, validates readiness, and forwards those effective values.
- The index plan makes `skill/md2vid/SKILL.md` the sole production synthesis orchestrator. Requirements FR-2 requires the md2vid skill to pass persisted provider and voice explicitly.

The canonical workflow therefore has two competing synthesis paths. A multi-framework project can follow the retained `/hyperframes-media` instruction instead of the explicit persisted-request, readiness-checked contract.

**Guidance**

Replace the canonical `/hyperframes-media` instruction with a reference to the marked narration media contract, explicitly setting `NARRATION_ROOT` to `outputs/<slug>/shared`. Do not duplicate or alter the media command.

Extend `test/cli/skill-commands.test.ts` to prove the canonical branch:
- contains no `/hyperframes-media` synthesis instruction;
- directs synthesis through the narration media contract with the canonical shared root; and
- keeps synthesis before transcription.

**Success checklist**

- [ ] Canonical workflow identifies `outputs/<slug>/shared` as `NARRATION_ROOT`.
- [ ] Canonical workflow invokes only the marked `/md2vid` media contract for synthesis.
- [ ] Canonical workflow cannot direct an agent to an alternate media skill.
- [ ] Regression test fails if `/hyperframes-media` returns in Branch B.

#### SPEC-002 — Both workflow branches conditionally permit skipping mandatory transcription

**Evidence**

- Flat workflow: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/skill/md2vid/SKILL.md:242`
  ```text
  npm run transcribe   # only when audio_meta words[] timings are empty
  ```
- Canonical workflow: `SKILL.md:299`
  ```text
  npm run transcribe   # only when shared audio_meta words[] timings are empty
  ```
- This contradicts `SKILL.md:207`, which correctly requires transcription immediately after successful synthesis.
- Requirements FR-7 requires transcription of the generated WAV before visual beats; FR-9 requires synthesis → transcribe → visual beats. The exact Part 3 plan also requires immediate transcription after synthesis.

A fresh audio request can have existing or provider-populated `words[]`; the conditional instruction permits preserving stale or non-authoritative timings rather than transcribing the newly synthesized WAV and refreshing request/WAV evidence.

**Guidance**

Make synthesis and transcription an inseparable sequence in both branches:

```text
synthesis through marked media contract
  → npm run transcribe
  → author visual_beats.json
  → npm run plan
```

Remove both “only when … timings are empty” qualifiers. Add documentation tests that reject those qualifiers and assert an unconditional transcription instruction following each branch’s synthesis guidance.

**Success checklist**

- [ ] Both flat and canonical paths require `npm run transcribe` after every successful synthesis.
- [ ] Neither path conditions transcription on existing `audio_meta.words[]`.
- [ ] Visual-beat authoring remains after transcription.
- [ ] Regression tests reject the obsolete conditional wording.

### Nice to have

None.

## Consolidated checklist

| Contract | Result | Evidence |
|---|---|---|
| FR-1 exact scaffold serialization | Satisfied | `scripts/scaffold_project.ts:19-26` derives the exact required request from neutral policy; validation rejects drift at `:184-194`. |
| HyperFrames/Remotion parity | Satisfied | Common scaffold owns the example; both adapters use identical neutral onboarding sequence. |
| Remotion install placement | Satisfied | `frameworks/remotion/scaffold.ts:51` retains `npm install` first. |
| Framework adapters do not own narration policy | Satisfied | Defaults are imported only by common scaffold code; adapters contain wording only. |
| Scaffold next-step ordering | Satisfied | Both adapters put script → request → check → readiness → transcribe → beats → plan → visuals → build/check/review/render. |
| Persisted override forwarding | Satisfied | Media contract reads all effective fields from `audio_request.json` and forwards them at `SKILL.md:162-203`. |
| Non-Kokoro readiness behavior | Satisfied | Kokoro catalog/runtime checks execute only for `provider=kokoro`; FFmpeg/FFprobe remain required for every provider. |
| Kokoro runtime, voice, FFmpeg, FFprobe checks | Satisfied | `SKILL.md:167-192`; contract tests cover defaults, override path, and failures. |
| Four fail-closed recovery lines | Satisfied | `SKILL.md:176-182`; exact stderr assertions are at `test/cli/skill-media-contract.test.ts:153-158`. |
| Warning review placement | Satisfied | Warning instruction follows narration-check and precedes the contract; asserted at `skill-media-contract.test.ts:161-169`. |
| No fallback | Satisfied | Skill forbids `say`, auto-selection, and network fallback at `SKILL.md:154`; failure text confirms none was used. |
| Immediate transcription and invalidation across all workflows | Must fix | Global rule is correct, but flat and canonical branch commands retain conditional skip instructions. See SPEC-002. |
| Exact media-contract markers and portable command | Satisfied | Required markers and command appear at `SKILL.md:156-205`. |
| Portable-command near-match rejection | Satisfied | `scripts/skill_references.ts:93-106` removes only the exact literal; regression cases cover near matches. |
| Skill-only production orchestration across all workflow paths | Must fix | Canonical branch retains `/hyperframes-media`. See SPEC-001. |
| No TypeScript media-use runner or audio route | Satisfied | Boundary test rejects production media-use paths, runners, and an audio route at `test/boundaries.test.ts:65-87`. |

## Residual risks

- The supplied external speed gate establishes installed media-use Kokoro `--speed` forwarding, but the repository contract test intentionally uses a fake media runner; it does not synthesize real Kokoro audio.
- The focused tests validate ordering tokens but did not detect the canonical alternate synthesis instruction or the contradictory conditional-transcription wording. The SPEC-001 and SPEC-002 regressions should close that coverage gap.