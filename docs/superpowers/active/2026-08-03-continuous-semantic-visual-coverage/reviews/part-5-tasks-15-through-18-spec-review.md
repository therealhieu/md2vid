# Canonical Review Artifact

- Review scope: Part 5, Tasks 15-18
- Reviewer role: spec-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `f53713f0faccf365796d8b63823575d0c7147d2c`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines/continuous-visual-coverage/part-5-tasks-15-through-18`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.part5.EW2gcu/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

## Findings

### SPEC-1 — Must fix — Coverage workflow guidance is not consistent across canonical entry points
- Requirement: Plan 5 requires: “Use this sequence consistently: source coverage → storyboard semantic coverage map → script → narration/transcription → visual_beats v2 → npm run plan → inspect resolved intervals → bind framework visibility → full build → continuous verify → preview/manual semantic review → render.” It also requires the skill and README workflow to require v2 coverage before framework authoring.
- Evidence:
  - `docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-plan-5.md:307-318` mandates the v2/interval-inspection/continuous-verify sequence consistently.
  - `docs/standards/video-generation.md:53-68` still directs `transcription → visual_beats.json → npm run plan → cue-bound visual authoring → npm run build + npm run check`; it omits v2, interval inspection, and continuous verification.
  - `README.md:111-118` retains the old point-beat-only sequence and says verification checks “beat coverage,” rather than directing readers to the coverage-interval contract immediately below.
  - `skill/md2vid/SKILL.md:470-503` quick command sheets tell users to author `visual_beats.json` and plan without requiring v2 opening/body/final states or inspection of `build/visual_timing.json`.
  - `docs/standards/frameworks/hyperframes.md:48-56` and `docs/standards/frameworks/remotion.md:15-29` onboarding flows have the same incomplete wording despite later v2 sections.
- Guidance: Replace every competing onboarding/quick-reference workflow with the canonical v2 sequence. Each must require opening/body/final frame-end focal states for every narrated frame; plan then inspect `build/visual_timing.json`; framework binding plus full build; continuous `npm run check` before preview/still/studio/render. Add contract assertions rejecting retained point-only wording.
- Success checklist:
  - [ ] No canonical standard, README workflow, or skill workflow presents current `visual_beats.json` authoring without v2 coverage requirements.
  - [ ] Every onboarding/quick-reference flow directs interval inspection after planning and continuous verification before review/render.
  - [ ] `test/cli/skill-references.test.ts` covers formerly stale workflow sections.
  - [ ] Bundled standards are byte-identical after sync/check.

## Consolidated post-implementation checklist
- [ ] Replace point-only workflow copies in canonical standards, README, and skill quick-reference sections.
- [ ] Preserve exact scaffold policy/example and project-standard marker behavior.
- [ ] Retain synthetic/golden/browser/packed/release evidence.
- [ ] Re-run full Part 5 matrix, including snapshot and release checks, after remediation.

## Residual risk
- Scope matches supplied patch; no ledger fixture/check/unrelated committed path was found. Bundled standards are byte-equal.
- Pre-existing untracked reviews prevent literal empty `git status`, but are outside implementation scope.
- The reported 1257/1257 matrix was supplied as Mode A evidence and not rerun by this reviewer.
