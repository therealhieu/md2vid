# 2026-08-03-continuous-semantic-visual-coverage — Execution Goal

## Persona

You are a senior implementation agent working in this repository. Follow the project rules, use strict TDD, keep scope tight, protect authored user files, and make one focused conventional commit after every completed task. Work only in the existing `fix-visual-timing-sync` worktree.

## Context

- Requirements: `docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-requirements.md`
- Design: `docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-design.md`
- Index plan: `docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-plan.md`
- Part plans:
  - `docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-plan-1.md`
  - `docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-plan-2.md`
  - `docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-plan-3.md`
  - `docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-plan-4.md`
  - `docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-plan-5.md`
- No inspection, manual-verification, or post-implementation check file exists. Create the check file only after implementation and final verification complete.
- Canonical standards:
  - `docs/standards/video-generation.md`
  - `docs/standards/design/frame.md`
  - `docs/standards/design/knowledge-expression.md`
  - `docs/standards/design/frame-content.md`
  - `docs/standards/frameworks/hyperframes.md`
  - `docs/standards/frameworks/remotion.md`
  - `docs/standards/git.md`
- Goal: make md2vid reject every unapproved semantic visual vacuum across narrated frames—from the first spoken word through the held landing—while allowing long static explanatory visuals and preserving framework-neutral timing authority.
- Architecture: `visual_beats.json` v2 resolves focal/supporting semantic intervals and exemptions into the neutral plan; HyperFrames and Remotion own deterministic visibility and emit normalized manifest-v2 evidence; one neutral verifier unions observed focal intervals, subtracts them from the required frame interval, classifies opening/middle/ending gaps, and rejects stale plan/source evidence.
- Tech stack: TypeScript, Node.js built-in tests, deterministic JSON, SHA-256 source snapshots, transactional filesystem promotion, HyperFrames/GSAP, React/Remotion, npm package/snapshot/release tooling.
- Execute Parts 1–5 and Tasks 1–18 strictly in order. Never run implementation writers concurrently.
- Coherent groups are `neutral-coverage-contract`, `coverage-verification`, `hyperframes-coverage`, `remotion-coverage`, and `coverage-propagation`. For each group, complete Mode A, run one parallel `spec-reviewer` + `code-quality-reviewer` + `tester` pass, resume the same implementer for remediation, and run one read-only verifier before moving on.
- Fixed contract decisions:
  - v2 retains the serialized `beats` field; no `states` alias;
  - v1 and v2 remain explicit unions;
  - `PlanFrame.visualSpecVersion` preserves v2 provenance for empty or supporting-only frames;
  - frame-start output omits `cueWordIndex`;
  - coverage runs independently from reveal mode;
  - required interval is first spoken word through `frameDur`;
  - only observed planned `focal` bindings count;
  - complete-frame gaps use `opening_visual_gap` plus `extendsThroughFrameEnd`;
  - captions, background, logo, decoration, shell, and supporting-only targets do not count automatically;
  - static focal visuals may cover arbitrarily long narration;
  - manifest v2 contains canonical plan and authored-input SHA-256 evidence;
  - captions-only build/regroup preserve old semantic evidence and cannot bless changed visibility inputs;
  - project-local standards use a version marker and manual refresh instruction; no automatic overwrite command;
  - rendered pixel/freeze checks remain diagnostic-only.
- HyperFrames keeps authored root duration at `voiceDur` and outer host duration at `frameDur`; final coverage through landing relies on owned host retention.
- Remotion quantizes shared start/end boundaries once so adjacent states do not acquire artificial gaps.
- New scaffolds use v2 plus required coverage. Legacy v1 projects remain buildable in warning mode until explicitly migrated.
- Do not modify the retained prepaid-ledger project, change narration/caption timing authority, add automatic storyboard generation, require motion cadence, parse arbitrary animation source, or replace HyperFrames/Remotion/GSAP.
- `public-snapshot.json` is generated from committed Git state. Regenerate it only after intended public changes are committed.

## Tasks

- Execute the index plan and all five part plans task-by-task without reordering.
- For every task: write the listed failing tests first, run the exact focused command and confirm the expected failure, implement only the specified behavior, run the listed green checks, complete the required review/remediation/verifier lifecycle, mark checkboxes, and make the listed conventional commit.
- Preserve the neutral plan as the sole semantic timing authority. Framework adapters must never independently match transcript text or accept copied semantic timestamps.
- Preserve authored HyperFrames frame HTML and Remotion scene source. Build may replace only generated neutral/framework artifacts through the existing transaction boundary.
- Keep v1 parsing and reveal verification available under compatibility behavior; do not claim strict continuous coverage from v1 point metadata.
- Ensure `mode` and `coverageMode` are independent and that complete opt-out requires both to be `off`.
- Keep interval verification pure: observed focal bindings → union → required-interval subtraction → exemption split → threshold/classification.
- Keep manifest validation and SHA-256 canonicalization in neutral code. Build and verify must call the same adapter authored-input enumeration API.
- HyperFrames must hash raw planned frame HTML before sanitization/injection and use owned activation/retention/exit scheduling.
- Remotion must hash the authored registry plus its sorted authored source set and use shared frame boundaries in `BeatState` and `BeatReveal`.
- Preserve prior binding manifests during captions-only build and regroup. Require a full build to publish new semantic evidence.
- Update canonical standards first, run `corepack npm run sync:skill-references`, and prove bundled-copy equality. Never hand-edit bundled references.
- Keep framework project-standard marker checks non-destructive and provide exact manual refresh instructions.
- Extend golden, browser, packed, and release evidence without using rendered pixel motion as semantic truth.
- Regenerate `public-snapshot.json` only after the prior implementation task is committed; never hand-edit snapshot hashes or counts.
- If implementation must deviate from the approved plan, stop and document the exact correctness or architectural reason before continuing.

## Success Criteria

- Task 1: v1/v2 visual coverage and independent policy types validate and resolve without changing legacy runtime shape.
- Task 2: strict v2 input accepts only `beats`, frame-start/word/phrase cues, roles, coverage ends, and reviewed exemptions.
- Task 3: v2 states resolve deterministic starts/ends, omit frame-start word index, preserve v1 behavior, and require every narrated frame in strict mode.
- Task 4: plan/build planning writes deterministic version-2 coverage projection transactionally for flat and canonical layouts.
- Task 5: the neutral verifier detects opening, middle, ending, and complete-frame gaps while allowing exact-threshold transitions, overlap, static holds, and approved exemptions.
- Task 6: manifest-v2 parsing, canonical plan hashing, authored-input normalization, and adapter evidence contracts are deterministic and packaged.
- Task 7: verify rejects changed plans, changed/missing/new authored inputs, and never uses stale focal intervals to claim success.
- Task 8: full builds atomically publish semantic evidence; captions-only build/regroup preserve prior evidence and expose later staleness.
- Task 9: HyperFrames declarative/custom/static targets obey planned intervals and owned exits without extending inner authored duration incorrectly.
- Task 10: HyperFrames emits fresh manifest-v2 evidence from raw frame inputs and rejects post-build mutations.
- Task 11: HyperFrames direct, sequential, and reverse seeks agree at every activation/exit/landing boundary; template teaches opening/body/final coverage.
- Task 12: Remotion registry v2 copies role from the neutral plan, quantizes shared boundaries once, and emits plan/source freshness evidence.
- Task 13: Remotion `BeatState` and interval-aware `BeatReveal` own visibility; fallback title/shell never becomes semantic coverage automatically.
- Task 14: Remotion stale-source behavior and neutral findings match HyperFrames without parsing arbitrary TSX.
- Task 15: new scaffolds enable required v2 coverage and project-local standards carry the current non-destructive version marker.
- Task 16: canonical standards, md2vid skill, bundled references, and README document continuous whole-video coverage and manual semantic review boundaries.
- Task 17: golden, synthetic `0.070/18.260/23.080`, browser, packed, and release regressions prove the shipped behavior.
- Task 18: public snapshot and all final repository/release gates pass from a clean tree.
- A static fifteen-second explanatory focal passes without additional animation.
- Animated captions, background, logo, persistent heading, shell, or supporting-only bindings do not satisfy coverage.
- Six-second middle gaps and three-second ending gaps fail with quantitative diagnostics.
- HyperFrames and Remotion produce the same neutral gap codes/details from the same plan.
- Changed neutral semantic data or authored framework source always invalidates manifest-v2 evidence until a full build.
- Existing narration, caption, workflow-order, reveal-tolerance, duration, and landing checks continue to pass.
- `corepack npm run typecheck`, `corepack npm run typecheck:remotion`, `corepack npm test`, `corepack npm run check:skill-references`, `corepack npm run public:snapshot:check`, `corepack npm run check`, `corepack npm run release:check`, and `git diff --check` all exit `0`.
- The implementation matches requirements, design, and plans with no extra scope, placeholders, unfinished work, stale generated artifacts, or uncommitted drift.
