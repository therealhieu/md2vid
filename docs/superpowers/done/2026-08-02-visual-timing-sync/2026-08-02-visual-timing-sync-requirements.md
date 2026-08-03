# Visual Timing Synchronization — Requirements

## Table of Contents

- [Problem](#problem)
- [Goal](#goal)
- [Confirmed Evidence](#confirmed-evidence)
- [Project Context](#project-context)
- [Scope](#scope)
- [Constraints](#constraints)
- [Decisions](#decisions)
- [Functional Requirements](#functional-requirements)
- [Candidate Directions](#candidate-directions)
- [Success Criteria](#success-criteria)
- [Risks and Assumptions](#risks-and-assumptions)

## Problem

md2vid has one authoritative timing path for narration and captions, but no equivalent contract for semantic visual beats. Framework adapters receive frame boundaries and transcript words while authored animations choose their own reveal offsets.

```text
voice audio ──→ word timestamps ──┬──→ narration playback
                                  └──→ captions
                                         ✓ synchronized

authored frame ──→ freehand animation offsets ──→ visual reveals
                                                 ✗ not tied to words
```

This allows a multi-step workflow to reveal every step near the start of a frame while narration explains those steps over the remaining 10–20 seconds. The viewer experiences this as narration or subtitles falling behind, although the actual defect is that the visuals lead both.

The framework also permits a final MP4 to be rendered at a very low frame rate without warning. The inspected output was encoded at 12 FPS, making short motion transitions visibly stepped.

## Goal

Make semantic visual timing a first-class, framework-neutral part of md2vid so that:

1. narration, captions, and visual reveals share one resolved timing authority;
2. ordered workflow steps appear with the narration that explains them;
3. machine verification detects missing, early, late, or reordered visual beats before render; and
4. final-delivery renders cannot silently use an unsuitable frame rate.

The fix must change framework contracts and generation workflow. It must not patch the inspected prepaid-ledger video or encode assumptions specific to that source document.

## Confirmed Evidence

### Narration and captions already share one clock

- `engine/plan.ts:61-79` derives frame and voice boundaries from measured audio durations.
- `engine/plan.ts:81-100` converts frame-local word times into global caption times.
- `frameworks/hyperframes/templates/caption-skin.html:169-200` schedules captions directly from those word times.

No systematic narration/caption drift was found.

### Visual timing is not represented

`engine/types.ts:19-23` defines `PlanFrame` with frame timing and transcript words only:

```ts
export interface PlanFrame {
  id: string; frameNum: number; slug: string;
  voicePath: string; voiceDur: number; frameDur: number;
  start: number; words: Word[];
}
```

There are no source steps, narration beats, visual target IDs, cue anchors, or reveal timestamps.

### Current workflow generates cues after visual authoring

- `skill/md2vid/SKILL.md:159-183` orders framework visual authoring before `npm run build`.
- `skill/md2vid/SKILL.md:242-248` states that build creates `cues.json` and `build/build_plan.json`.

This encourages authors to guess offsets instead of using resolved transcript timing.

### Verification does not compare reveals with cues

`frameworks/hyperframes/verify.ts:51-67` checks runtime, mounts, captions, imports, themes, and voice snapshots, but it does not read a visual-beat contract or compare visual reveal times with narration cues.

### The inspected render confirms both symptoms

The generated artifact is evidence, not an implementation target:

- `.tmp/prepaid-ledger/author.mjs:231-233` hardcodes every frame to three reveals at `1.5`, `3.7`, and `5.9` seconds.
- Frame 12 narration reaches later concepts at `11.06` and `14.35` seconds, so the visuals lead by `7.36` and `8.45` seconds.
- The final MP4 is exactly 12 FPS because the render command explicitly supplied `--fps 12`; the current HyperFrames default is 30 FPS.

## Project Context

- `scripts/build.ts` owns neutral planning and delegates framework emission while preserving authored frame source files.
- `engine/types.ts` is the serialized neutral `build_plan.json` contract shared by adapters.
- HyperFrames authored frames register paused GSAP timelines on `window.__timelines`.
- Remotion uses the same neutral build plan but owns its framework-specific scene implementation.
- Existing generated projects may not contain any semantic beat specification and must remain buildable.
- Generated `index.html` and caption compositions are emitter-owned; authored frame source remains author-owned.

## Scope

### In scope

- A framework-neutral authored visual-beat specification.
- Resolution of narration cue anchors against transcript word timestamps.
- Optional visual-beat data on `PlanFrame` without breaking legacy plans.
- A plan-only command or phase that makes resolved cues available before framework visual authoring.
- Framework adapter contracts for binding visual elements to resolved beats.
- HyperFrames support for declarative beat-bound reveals and custom beat-bound timelines.
- Equivalent Remotion timing access through generated plan data and helpers.
- Verification of beat coverage, timing tolerance, workflow order, and frame-duration agreement.
- An md2vid final-render FPS policy with an explicit low-FPS escape hatch.
- Tests, scaffold updates, standards, and skill workflow updates for the new contract.

### Out of scope

- Refactoring `.tmp/prepaid-ledger` or any other generated video.
- Making md2vid parse arbitrary Markdown into a complete visual storyboard.
- Automatically deciding the creative treatment, layout, or visual wording for each source concept.
- Replacing GSAP, HyperFrames, or Remotion.
- General animation micro-optimization without profiling evidence.
- Caption DOM virtualization in this fix; it remains a separate performance investigation because it was not the confirmed cause of encoded playback stutter.
- Changing `timing.tail`, crossfade, or gap semantics unless required by a separately approved timing change.
- Breaking old generated projects that have no visual-beat metadata.

## Constraints

- The neutral plan remains the sole shared timing authority across framework adapters.
- Authored source files must remain source inputs; build must not overwrite custom frame HTML or scene code.
- Generated and authored responsibilities must be explicit. Generated timing data may be embedded or imported, but must not require authors to edit emitted `index.html`.
- Timing must be deterministic and seek-safe. It may not depend on playback callbacks, wall-clock time, network fetches, `Date.now()`, or `Math.random()`.
- Cue resolution must fail clearly when an anchor is missing or ambiguous; it must not silently choose an arbitrary repeated word.
- A custom animation path must still emit machine-readable binding evidence so verification does not need to parse arbitrary GSAP or React source.
- Legacy projects without a beat specification continue using current behavior, with an actionable warning rather than an immediate hard failure.
- New scaffolds enable semantic timing verification by default.
- Final-delivery FPS enforcement must preserve intentionally low-FPS draft and GIF workflows through an explicit option.

## Decisions

- **Timing authority:** transcript-resolved visual beats extend the existing neutral plan; framework adapters do not invent separate cue clocks.
- **Authored input:** introduce an optional `visual_beats.json` beside the other neutral inputs. The agent or author supplies semantic beat IDs and cue anchors; md2vid resolves timestamps.
- **Cue availability:** add `md2vid plan <dir>` and make `md2vid build` invoke the same planner internally.
- **Binding model:** use stable beat IDs. Framework implementations bind targets to beat IDs rather than copying numeric timestamps into source files.
- **Default animation path:** declarative bindings use framework-owned standard entrance tokens. Custom animations use helper APIs that record the same binding metadata.
- **Compatibility:** extend the current plan additively with optional beat fields. Projects without `visual_beats.json` remain valid.
- **Enforcement rollout:** new projects require semantic bindings; legacy projects warn until they opt in through configuration.
- **Render quality:** final MP4/MOV defaults to 30 FPS and rejects an effective FPS below 24 unless explicitly allowed.

## Functional Requirements

### FR-1 — Authored semantic beat specification

md2vid must accept a versioned neutral file with frame-scoped beats. Each beat must include:

- a stable ID unique within its frame;
- display or semantic text;
- an unambiguous narration cue anchor;
- zero or more source references;
- optional workflow metadata including ordered step position;
- optional timing policy overrides.

A cue anchor must support at least:

- exact transcript word index; and
- normalized phrase plus explicit occurrence for author-friendly input.

### FR-2 — Deterministic cue resolution

The planner must resolve every authored cue to a frame-local transcript timestamp and preserve the source anchor in generated output.

Resolution must reject:

- missing phrases;
- repeated phrases without an occurrence;
- word indexes outside the frame transcript;
- duplicate beat IDs;
- workflow step indexes that are missing, duplicated, or unordered.

### FR-3 — Plan-only workflow

`md2vid plan <dir>` must:

1. load configuration, audio metadata, and optional visual beats;
2. validate audio and cue anchors;
3. write neutral planning artifacts, including resolved visual timing;
4. avoid framework emission and authored-source mutation; and
5. produce the same resolved plan that a subsequent unchanged `md2vid build` uses.

### FR-4 — Framework-neutral resolved beat data

Each planned frame with authored beats must expose resolved beat data containing:

- beat ID;
- resolved frame-local start;
- optional end or hold boundary;
- cue word index and matched text;
- source references;
- workflow step metadata; and
- permitted lead/lag tolerances.

### FR-5 — Framework bindings

Every framework adapter must provide a supported way to bind a visual target to a beat ID.

For HyperFrames:

- declarative targets use `data-md2vid-beat` and a supported entrance token;
- custom GSAP timelines obtain time through a helper rather than hardcoded numbers; and
- both paths register binding evidence for verification.

For Remotion:

- scenes obtain resolved beat timing from generated build-plan data; and
- a helper records or exposes the target-to-beat contract used by verification/tests.

### FR-6 — Semantic synchronization verification

Verification must detect:

- planned beats with no visual binding;
- visual bindings that reference unknown beats;
- reveals outside configured lead/lag tolerance;
- non-monotonic workflow reveals;
- skipped or duplicate workflow steps;
- all workflow steps being front-loaded before their narration cues;
- a final reveal that leaves no configured landing interval; and
- authored frame duration that disagrees materially with planned frame duration.

Errors must identify frame, beat, visual target, expected cue time, observed reveal time, and difference.

### FR-7 — Legacy behavior

When `visual_beats.json` is absent:

- planning and build remain successful;
- existing plan output remains structurally compatible;
- new semantic checks are skipped with one actionable warning; and
- no existing authored timelines are rewritten.

A project configuration flag must allow legacy projects to opt into required semantic verification after migration.

### FR-8 — Final-render FPS policy

For final MP4/MOV rendering:

- effective FPS defaults to 30 when not otherwise configured;
- effective FPS below 24 fails before rendering unless an explicit low-FPS option is supplied;
- the diagnostic reports requested FPS, minimum policy, and override command;
- draft/GIF modes may intentionally use lower frame rates; and
- effective render settings are recorded with the output or build evidence.

### FR-9 — Documentation and scaffold contract

New scaffolds and the md2vid skill must show this order:

```text
storyboard/script
  → audio/transcription
  → visual_beats.json
  → md2vid plan
  → cue-bound framework authoring
  → build
  → verify
  → preview
  → render
```

Examples must include both an ordered workflow and a non-workflow focal reveal.

### FR-10 — Determinism and seeking

Cue-bound visuals must produce the same state when:

- played sequentially to timestamp `t`;
- sought directly to timestamp `t`;
- sought backward across a cue and forward again; and
- rendered at supported frame rates.

## Candidate Directions

### Selected: neutral beat specification plus adapter bindings

```text
visual_beats.json + audio_meta.json
              ↓
       engine.plan()
              ↓
  resolved PlanFrame.visualBeats
              ↓
      framework binding API
              ↓
 narration ↔ captions ↔ visuals
```

Why selected:

- preserves one timing authority;
- supports both HyperFrames and Remotion;
- keeps creative authoring flexible;
- makes semantic verification possible; and
- does not require md2vid to understand arbitrary animation source code.

### Rejected: infer cue timing by parsing GSAP or React source

```text
authored source → static parser → guessed reveal positions
```

Rejected because arbitrary animation code, helper functions, selectors, and computed timeline positions cannot be interpreted reliably across frameworks.

### Rejected: make each adapter independently match transcript text

```text
HyperFrames matcher ─┐
Remotion matcher ────┼── separate timing authorities
future adapter ──────┘
```

Rejected because resolution behavior would drift across frameworks and duplicate ambiguity handling.

### Rejected: manual review only

Manual review remains useful for treatment quality, but it already failed to prevent multi-second timing leads. Objective cue coverage and ordering must be machine-checked.

### Rejected: fix only the 12 FPS render

A 30 FPS render would improve motion smoothness but would not correct workflows revealing all steps before narration reaches them.

## Success Criteria

- A multi-step fixture with narration cues spread across at least 15 seconds reveals each step within configured cue tolerance and in source order.
- A fixture that reveals all steps in the first six seconds fails semantic verification when later cues occur after ten seconds.
- A planned beat with no target fails with frame and beat identifiers.
- A target bound to an unknown beat fails before render.
- Ambiguous cue phrases fail planning and require an explicit occurrence or word index.
- Direct seek and sequential playback snapshots match at every beat boundary.
- Existing fixtures with no `visual_beats.json` still build and pass existing checks, receiving at most the documented legacy warning.
- New scaffolds contain the visual-beat example and enable required semantic verification.
- A final MP4 render request at 12 FPS fails before capture unless the low-FPS override is explicit.
- Default final MP4 rendering remains 30 FPS.
- Narration/caption timing tests continue to pass unchanged.
- Full typecheck, unit, adapter, visual-integrity, scaffold, snapshot, and release checks pass.

## Risks and Assumptions

| Risk / assumption | Handling |
|---|---|
| Phrase anchors become stale after narration edits | Resolve on every plan/build; include matched text and word index in output; fail on mismatch. |
| Repeated words make anchors ambiguous | Require occurrence or exact word index; never select silently. |
| Beat metadata becomes excessive for simple frames | Keep `visual_beats.json` optional and allow one focal beat per frame. |
| Framework-owned entrance tokens restrict creative motion | Support custom animation helpers that still register binding evidence. |
| Additive plan fields affect adapters or snapshots | Keep fields optional, update adapter fixtures, and verify legacy serialized output. |
| Legacy projects cannot migrate immediately | Warn when absent; enforce only when the project opts in or is newly scaffolded. |
| Minimum FPS blocks intentional stop-motion output | Provide explicit draft/GIF mode or `--allow-low-fps`. |
| Caption runtime contributes to Studio lag | Treat separately; require profiling before changing caption architecture. |
| Landing-interval checks conflict with current tail semantics | Define landing as time between final visual reveal completion and planned frame end; do not change `timing.tail` in this fix. |
