# Continuous Semantic Visual Coverage — Requirements

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

md2vid can verify whether each declared visual beat has a framework binding and whether its reveal aligns with its narration cue. It cannot verify that meaningful visual content continuously covers the narrated timeline.

A frame may therefore contain substantial narration while its explanatory region is empty, irrelevant, or reduced to persistent shell elements such as a background, heading, logo, decorative rail, or captions. The project can still pass because the verifier checks only the beats the author declared.

```text
Narration:  ├──────── problem ────────┼──── example ────┼── solution ──┤
Visuals:    │                         │                 ├── card A ─────┤
            └──── no semantic visual coverage ─────────┘

Declared beats:                                      ✓ aligned
Narrated interval coverage:                          ✗ incomplete
Current verification:                                PASS
```

This is not only an opening-frame problem. The same defect may occur:

- before the first semantic visual state;
- between otherwise valid visual states;
- after a visual exits while narration continues;
- near the end of a frame before its held landing completes;
- across any narrated frame omitted from `visual_beats.json`; or
- in either HyperFrames or Remotion output.

Animated captions do not solve the defect. Captions communicate the spoken words, but they do not replace the visual explanation required by the expression triad.

## Goal

Make continuous semantic visual coverage a first-class, framework-neutral md2vid contract so that:

1. every narrated frame has meaningful visual content throughout its narrated and held-landing interval;
2. static explanatory visuals are valid and do not require continuous animation;
3. backgrounds, captions, logos, decorative shell, and persistent headings do not count as semantic coverage by themselves;
4. machine verification detects uncovered intervals at the opening, middle, and end of every frame;
5. HyperFrames and Remotion emit equivalent normalized coverage evidence from one neutral plan;
6. intentional audio-only or blank intervals require an explicit reviewed exemption; and
7. new projects enforce the contract by default while existing projects receive an actionable migration path.

The fix must strengthen the canonical md2vid standards, skill workflow, neutral schema, adapters, verifier, scaffolds, diagnostics, and tests. It must not patch the inspected prepaid-ledger project or encode assumptions specific to that source.

## Confirmed Evidence

### The standards already intend early focal coverage

`docs/standards/design/frame.md:250-260` requires every frame to establish a headline and focal anchor by `t <= 0.5s`, reveal content beat by beat, and end on a held landing.

`docs/standards/video-generation.md:184-190` defines the expression triad:

```text
visual focal = narration beat = caption beat
```

These prose rules express the intended experience but are not represented as continuous machine-checkable intervals.

### The neutral schema models cue points, not coverage

`engine/types.ts:27-60` defines cue anchors and resolved beats. A resolved beat contains a required `start` and an optional `end`, but current resolution populates only the point cue.

The binding manifest records reveal timing rather than semantic visibility duration. It therefore cannot distinguish:

```text
meaningful static diagram held for 10 seconds
```

from:

```text
visual revealed briefly, then absent for 10 seconds
```

### Required mode does not require every narrated frame

`scripts/plan_project.ts:89-119` checks that `visual_beats.json` exists when visual synchronization is required. It does not require every narrated frame to appear in that file.

`engine/visual_beats.ts:333-360` resolves only authored frame entries. A narrated frame omitted from the authored map contributes no planned beats and no coverage evidence.

### Verification treats no planned beats as no findings

`engine/visual_sync.ts:20-25` flattens declared beats and returns no findings when none are planned:

```ts
const planned = input.plan.frames.flatMap(/* declared visual beats */);
if (planned.length === 0) return [];
```

The remaining checks validate declared binding presence, reveal tolerance, ordering, landing, and duration. They do not subtract bound visual intervals from the narrated timeline.

### Framework evidence contains reveal events only

- `frameworks/hyperframes/visual_timing.ts:195-240` maps declarative targets to `beat.start` and reveal duration.
- `frameworks/remotion/visual_bindings.ts:106-159` records the same cue-oriented evidence after frame quantization.

Neither adapter reports `coverageStart` or `coverageEnd` for a semantic visual state.

### The retained render demonstrates the failure mode

The retained prepaid-ledger evidence is a regression example, not an implementation target:

- narration begins at `0.070s`;
- the first declared semantic beat begins at `18.260s`;
- the explanatory region remains visually frozen for approximately `18.467s`; and
- semantic verification passes because the late declared bindings are correctly aligned.

This proves that declared-beat correctness is not equivalent to narrated-interval coverage.

## Project Context

- `engine/types.ts` is the framework-neutral contract shared by planning and adapters.
- `engine/audio_meta.ts` validates the transcript words that define voiced timing authority.
- `engine/visual_beats.ts` validates and resolves authored semantic beats.
- `engine/plan.ts` attaches resolved beats to neutral `PlanFrame` entries.
- `scripts/plan_project.ts` owns neutral planning and serialization.
- `engine/visual_sync.ts` owns framework-neutral semantic verification.
- HyperFrames and Remotion emit normalized binding manifests rather than requiring the verifier to parse arbitrary framework source.
- `docs/standards/` contains canonical standards.
- `skill/md2vid/references/standards/**` contains generated copies synchronized from the canonical standards.
- New projects receive framework-standard snapshots under `.md2vid/standards/` during scaffolding.
- Existing projects may use v1 reveal-only visual metadata and must remain buildable during migration.
- Authored visual files remain source inputs; build must not overwrite custom frame HTML or scene code.

## Scope

### In scope

- A framework-neutral definition of meaningful semantic visual coverage.
- Continuous coverage across every narrated frame, including opening, middle, ending, transitions, and held landing.
- A versioned authored visual-beat contract that can declare static frame-start states and semantic coverage boundaries.
- Resolution of coverage intervals against transcript and frame timing.
- A normalized framework binding manifest containing semantic visibility intervals.
- Interval-union verification against each frame's required coverage interval.
- Distinct diagnostics for opening, middle, and ending gaps.
- Explicit, reviewed exemptions for intentional audio-only or blank intervals.
- Exclusion of captions, decorative shell, logos, backgrounds, and non-semantic headings from automatic coverage.
- HyperFrames and Remotion parity.
- New scaffold defaults, examples, standards, skill workflow, migration guidance, and public documentation.
- Unit, CLI, framework, golden, visual-integrity, package, snapshot, and release evidence.

### Out of scope

- Modifying the retained prepaid-ledger project as the source fix.
- Requiring animation or a new reveal at a fixed cadence.
- Machine-judging whether a visual treatment is aesthetically strong or pedagogically optimal.
- Parsing arbitrary GSAP, CSS, React, or JavaScript to infer semantic visibility.
- Treating captions as sufficient semantic visual content.
- Automatically generating missing diagrams or visual treatments from narration.
- Replacing the existing cue-alignment, workflow-order, duration, or landing checks.
- Changing narration generation, transcription, caption grouping, audio duration authority, or voice asset handling.
- Replacing HyperFrames, Remotion, GSAP, or current adapter ownership boundaries.
- Refreshing project-local standards by silently overwriting user-modified project files.
- Introducing a render-time pixel-difference heuristic as the primary semantic verifier.

## Constraints

- The neutral plan remains the sole timing and semantic authority shared by framework adapters.
- Coverage must be based on transcript and planned frame timing, not wall-clock playback callbacks.
- Direct seeking and sequential playback must produce the same semantic state.
- A visual may remain static for an arbitrary duration when it continues to explain the active narration concept.
- The verifier must measure absence of semantic coverage, not absence of motion.
- A framework target counts only when it binds to a planned semantic state and emits normalized evidence.
- Captions, backgrounds, logos, decorative elements, frame chrome, and persistent section labels must not generate coverage evidence automatically.
- A title may count only when explicitly authored as the active semantic focal rather than as shell content.
- Verification must not parse arbitrary framework implementation code.
- Coverage configuration must be finite, non-negative, deterministic, and framework-neutral.
- Authored source files must not copy resolved numeric semantic timestamps.
- Generated artifacts must remain emitter-owned and transactionally promoted.
- Existing v1 projects must receive warnings rather than unexplained hard failures until migrated or explicitly opted into required coverage.
- New scaffolds must enable required continuous coverage.
- Explicit exemptions must remain visible in authored input and verification output; they must not silently suppress findings.
- Unvoiced leading WAV silence must not be reported as a narrated visual gap.
- The design must work for both flat single-framework and canonical shared multi-framework layouts.

## Decisions

- **Core invariant:** every timeline point from the first spoken word of a narrated frame through its held landing must be covered by at least one bound semantic visual state, except short configured transitions or explicit reviewed exemptions.
- **Coverage model:** semantic states have intervals, not only reveal points.
- **Static validity:** a semantic state may remain completely static and still provide valid coverage.
- **Non-semantic exclusion:** captions and visual shell do not count automatically.
- **Timing authority:** coverage is resolved in the neutral plan and projected into framework evidence.
- **Default interval semantics:** a state covers from its resolved start until the next state; the final state covers through frame end unless an explicit owned boundary is declared.
- **Gap policy:** one `maxUncoveredGap` policy applies across opening, middle, and ending gaps. Diagnostic codes identify the location.
- **Default threshold:** new scaffolds use `maxUncoveredGap: 0.5` seconds.
- **Required interval start:** the first transcript word's local `start`, not absolute frame zero.
- **Required interval end:** planned frame end, so the held landing must remain visually covered after narration ends.
- **Framework evidence:** adapters emit `coverageStart` and `coverageEnd` in addition to reveal timing.
- **Semantic role:** coverage-capable states identify themselves as semantic focal content; shell and caption targets are not inferred as focal states.
- **Exceptions:** intentional uncovered intervals require explicit authored anchors, a non-empty reason, and review metadata; verification still reports them.
- **Compatibility:** introduce versioned v2 coverage metadata and an additive `coverageMode` rollout.
- **Authoritative documentation:** edit `docs/standards/**` first, then regenerate bundled skill copies.
- **Regression strategy:** add a small synthetic fixture representing a long voiced gap; do not depend on the retained ledger project.

## Functional Requirements

### FR-1 — Continuous frame coverage invariant

For every narrated frame, md2vid must define a required semantic coverage interval:

```text
requiredStart = first transcript word start
requiredEnd   = planned frame duration
```

The union of valid bound semantic coverage intervals must span that required interval, allowing only uncovered gaps whose duration is less than or equal to `maxUncoveredGap`.

The invariant applies equally to:

- the interval before the first state;
- intervals between states;
- intervals created by semantic exits;
- the interval after the last state; and
- the held landing through frame end.

### FR-2 — Meaningful semantic visual state

A state may contribute coverage only when:

- it is declared in the neutral authored visual specification;
- it has a stable ID unique within its frame;
- it has semantic text describing the concept it expresses;
- it has a semantic role eligible for coverage;
- its cue and coverage boundaries resolve deterministically;
- at least one framework target binds to it; and
- the framework emits normalized visibility evidence for the target.

Captions, backgrounds, logos, decoration, shell, and persistent headings must not become semantic states implicitly.

### FR-3 — Versioned authored coverage contract

The neutral visual specification must support a version that can express:

- frame-start semantic states;
- word-index and phrase cue anchors;
- semantic role;
- coverage through the next state;
- coverage through voice end or frame end;
- an explicit coverage endpoint anchor when required;
- workflow metadata and source references; and
- reviewed uncovered-interval exemptions.

The schema must reject unknown fields, duplicate IDs, invalid roles, inverted intervals, invalid anchors, and ambiguous phrases with path-specific diagnostics.

### FR-4 — Frame-start anchor

The authored cue union must support a frame-start semantic anchor without requiring a transcript word or copied timestamp.

A frame-start state may begin before the first spoken word and cover the opening narration. It remains subject to binding and semantic-role requirements.

### FR-5 — Coverage resolution

The planner must resolve every semantic state to frame-local coverage timing.

Default behavior:

```text
state start       = resolved cue start
non-final end     = next semantic state start
final state end   = planned frame duration
```

Explicit endpoints may override the default when they resolve within frame bounds and do not produce an inverted interval.

Resolved coverage must be included in neutral plan output and compact visual-timing projections.

### FR-6 — Every narrated frame must be represented

When continuous coverage is required, every narrated frame in the neutral plan must have at least one authored semantic state.

A required project must fail when:

- `visual_beats.json` exists but omits a narrated frame;
- a represented frame contains no coverage-capable state; or
- all states in a frame lack valid framework bindings.

### FR-7 — Normalized framework visibility evidence

Each adapter must emit a normalized binding manifest containing at least:

- frame slug;
- beat/state ID;
- target identity;
- semantic role;
- reveal start and duration;
- coverage start and end;
- binding source such as declarative, custom, or static;
- manifest version and framework identity;
- a digest of the canonical coverage-relevant neutral plan; and
- deterministic SHA-256 digests for every authored framework source or binding-registry input whose contents can affect semantic visibility evidence.

The manifest is generated evidence, not a second semantic authority. Verification must recompute the plan and authored-input digests, compare both values and source-file sets, and reject stale evidence after any relevant post-build mutation.

### FR-8 — HyperFrames coverage bindings

HyperFrames must support:

- declarative static frame-start states;
- cue-bound entrance states;
- custom owned bindings;
- deterministic semantic coverage through the resolved endpoint; and
- owned semantic exits that update coverage evidence.

Authored HTML must bind stable state IDs and must not copy resolved numeric timestamps.

The adapter must not infer captions, shell elements, or arbitrary DOM visibility as semantic coverage.

### FR-9 — Remotion coverage bindings

Remotion must support equivalent static and cue-bound semantic state registration through pure authored data and owned runtime helpers/components.

The adapter must emit coverage evidence without compiling or statically interpreting arbitrary scene JSX during ordinary verification.

Frame quantization must not create a coverage gap larger than the configured tolerance.

### FR-10 — Whole-interval semantic verification

`engine/visual_sync.ts` must:

1. collect the required interval for every narrated frame;
2. collect coverage intervals from valid bound semantic states;
3. union overlapping and adjacent intervals;
4. subtract the union from the required interval;
5. ignore uncovered intervals within `maxUncoveredGap`;
6. account for approved exemptions without silently removing them from the report; and
7. report every remaining gap with quantitative evidence.

The existing checks for cue lead/lag, unknown beats, missing bindings, duplicate targets, workflow order, landing, and duration must remain active.

### FR-11 — Gap classification and diagnostics

A coverage finding must be classified as:

- `opening_visual_gap` when it begins at the required interval start;
- `mid_scene_visual_gap` when it lies between covered intervals; or
- `ending_visual_gap` when it reaches the required interval end.

A gap spanning the complete required interval uses `opening_visual_gap` with `extendsThroughFrameEnd: true`; it does not introduce a fourth public category.

Every diagnostic must include:

- frame slug;
- uncovered interval start, end, and duration;
- configured maximum;
- first and last spoken timings where relevant;
- previous and next semantic state IDs when present;
- whether an expected binding or coverage endpoint is missing; and
- a concrete recovery action.

### FR-12 — Configuration

The neutral `visualSync` configuration must support continuous coverage policy independently from reveal-alignment mode.

New scaffold default:

```json
{
  "visualSync": {
    "mode": "required",
    "coverageMode": "required",
    "maxLead": 0.25,
    "maxLag": 0.75,
    "maxUncoveredGap": 0.5,
    "minLanding": 1.0
  }
}
```

Coverage modes:

| Mode | Behavior |
|---|---|
| `off` | Do not evaluate continuous coverage |
| `warn` | Evaluate and report coverage findings as warnings |
| `required` | Treat unapproved coverage findings as errors |

All numeric values must be finite and non-negative. Existing `minLanding` constraints remain in force.

### FR-13 — Explicit exemptions

An intentional audio-only or blank interval must require authored exemption metadata containing:

- deterministic start and end anchors;
- a non-empty reason;
- review or approval metadata; and
- the frame to which it applies.

Exemptions must:

- be validated and resolved during planning;
- appear in generated timing evidence;
- appear in verification output;
- never be scaffolded by default; and
- never suppress unrelated uncovered intervals.

### FR-14 — Manual-review boundary

Machine verification must determine whether declared, bound semantic coverage exists continuously.

Manual review remains responsible for whether:

- the declared state actually explains the narrated concept;
- a title is a true focal state rather than shell;
- the visual treatment is pedagogically sufficient;
- the expression triad is semantically honest; and
- hierarchy, typography, motion, and composition are polished.

Standards and the skill workflow must explicitly prohibit declaring decorative shell as a semantic state merely to satisfy verification.

### FR-15 — Standards and skill propagation

The canonical standards must define continuous semantic coverage consistently across:

- `docs/standards/video-generation.md`;
- `docs/standards/design/frame.md`;
- `docs/standards/design/knowledge-expression.md`;
- `docs/standards/design/frame-content.md`;
- `docs/standards/frameworks/hyperframes.md`; and
- `docs/standards/frameworks/remotion.md`.

`skill/md2vid/SKILL.md` must require every narrated frame to declare opening, body, and landing coverage before framework authoring.

Bundled copies under `skill/md2vid/references/standards/**` must be regenerated through the repository synchronization command and remain byte-equal to canonical sources.

### FR-16 — Scaffold contract

New HyperFrames and Remotion projects must include:

- required continuous coverage configuration;
- a v2 visual specification example;
- a static opening semantic state;
- at least one later cue-bound state;
- a final state that covers the held landing;
- framework-specific binding examples; and
- next steps that run planning before visual authoring and verification before render.

The scaffold must not imply that captions or a persistent heading satisfy semantic coverage.

### FR-17 — Compatibility and migration

The rollout must distinguish reveal-only v1 projects from coverage-aware v2 projects.

- New scaffolds use v2 and required coverage.
- Existing v1 projects with no explicit coverage mode remain buildable and receive actionable warnings.
- Existing projects may opt into required coverage after migration.
- Existing authored source files are never rewritten automatically.
- Generated artifacts must be rebuilt after migration.
- Project-local standard snapshots must be refreshed through an explicit safe operation or documented migration step.

### FR-18 — Determinism and seeking

For every supported state and coverage boundary, the semantic visibility result at timestamp `t` must be the same when:

- played sequentially to `t`;
- sought directly to `t`;
- sought backward and forward across boundaries; and
- rendered at supported frame rates.

Coverage evidence must describe the state produced by owned framework behavior, not an aspirational interval that runtime code does not honor.

### FR-19 — Transactional behavior

Planning, build, regroup, and verify must preserve current transactional guarantees.

Invalid coverage input must not partially update neutral or output-local generated artifacts. Regrouping captions must not strip coverage metadata from plans or manifests.

### FR-20 — Regression and release evidence

Tests must cover opening, middle, ending, static, overlapping, omitted-frame, exemption, legacy, framework, and packaging behavior.

At minimum:

| Scenario | Expected result |
|---|---|
| Speech begins at `0.07s`, first coverage begins at `18.26s` | `opening_visual_gap` error |
| Valid state ends and next begins 6 seconds later | `mid_scene_visual_gap` error |
| Final state ends 3 seconds before frame end | `ending_visual_gap` error |
| Static explanatory diagram covers 15 seconds | Pass |
| Only captions animate during narration | Coverage error |
| Only background and shell heading remain | Coverage error |
| Transition gap is `0.4s` at default policy | Pass |
| Transition gap is `0.8s` at default policy | Error |
| Coverage states overlap | Pass |
| Narrated frame is omitted from visual specification | Error |
| First speech and first state both begin after `2.95s` unvoiced silence | Pass |
| Explicit reviewed audio-only interval | Reported exemption, no unrelated failure |
| Coverage-relevant neutral input changes after build | Stale plan digest error; rebuild required |
| HyperFrames authored frame changes after build | Stale authored-input digest error; rebuild required |
| Remotion registry or relevant scene source changes after build | Stale source-set or digest error; rebuild required |
| Legacy v1 project | Migration warning under compatibility defaults |

## Candidate Directions

### Selected: semantic coverage intervals with normalized framework evidence

```text
visual_beats v2 + transcript words + frame duration
                        ↓
                 neutral resolution
                        ↓
            semantic coverage intervals
                  ┌─────┴─────┐
                  ↓           ↓
          HyperFrames     Remotion
          visibility      visibility
           evidence        evidence
                  └─────┬─────┘
                        ↓
           interval-union verification
                        ↓
         opening / middle / ending findings
```

Why selected:

- applies to all parts of every narrated frame;
- permits long static explanatory holds;
- preserves one neutral timing authority;
- works across frameworks;
- produces quantitative diagnostics;
- does not require parsing arbitrary animation source; and
- extends the existing optional resolved `end` concept naturally.

### Rejected: opening-only first-beat threshold

```text
first beat - first spoken word <= threshold
```

Rejected as the complete solution because it catches the retained opening failure but misses middle and ending gaps.

An opening diagnostic remains useful as one classification of the continuous interval algorithm.

### Rejected: require a reveal every N seconds

```text
consecutive reveal starts <= N
```

Rejected because it measures motion cadence rather than semantic coverage. It would incorrectly fail long, valid static diagrams, quote cards, maps, and held comparisons.

### Rejected: full-frame pixel-difference detection

```text
rendered pixels → freeze detector → semantic verdict
```

Rejected as the primary gate because captions and decoration can move while the explanatory region is empty, and a valid explanatory diagram can remain visually static. Render diagnostics may supplement the semantic contract but cannot replace it.

### Rejected: sentence-to-new-visual requirement

```text
every sentence → distinct visual beat
```

Rejected because several sentences may legitimately elaborate one static visual. Sentence mapping may be an advisory storyboard review but is not the base verifier contract.

### Rejected: standards-only guidance

Rejected because the current failure already violates the intended focal and expression-triad guidance while still passing machine checks. Prevention requires executable schema, evidence, and verification changes.

## Success Criteria

- Every narrated frame in a new scaffold has machine-verifiable semantic coverage from its first spoken word through frame end.
- A long uncovered opening fails with `opening_visual_gap` and quantitative timing.
- A long uncovered middle interval fails with `mid_scene_visual_gap` and surrounding state IDs.
- A long uncovered ending or missing held landing fails with `ending_visual_gap`.
- A static explanatory state may cover an arbitrarily long interval without requiring additional motion.
- Captions, background, decorative shell, logo, and persistent section heading do not satisfy coverage automatically.
- A title counts only when explicitly declared and bound as the active semantic focal.
- A narrated frame omitted from the visual specification fails in required coverage mode.
- HyperFrames and Remotion emit equivalent normalized coverage semantics from the same neutral plan.
- Direct seek and sequential playback agree at every coverage boundary.
- Existing reveal-alignment, workflow-order, duration, landing, caption, and audio tests continue to pass.
- Existing v1 projects remain buildable under compatibility defaults and receive actionable migration warnings.
- New scaffolds use v2 coverage metadata and required coverage mode.
- Canonical standards and bundled skill copies remain synchronized.
- Package, public snapshot, scaffold, golden, visual-integrity, and release checks pass.
- The synthetic `0.07s -> 18.26s` regression fails for the continuous-coverage reason without depending on the retained ledger project.

## Risks and Assumptions

| Risk / assumption | Handling |
|---|---|
| Authors register a decorative heading as semantic coverage | Require semantic role and text, exclude shell automatically, and retain manual expression-triad review. |
| A static visual is incorrectly treated as a gap because nothing moves | Verify declared visibility intervals, not pixel motion or reveal cadence. |
| Runtime code hides a target before its declared end | Require owned semantic exits and framework evidence; prohibit unsupported semantic exits in strict coverage mode. |
| Coverage intervals become verbose | Default non-final states to `next-beat` and final states to frame end. |
| Unvoiced opening silence produces false positives | Start the required interval at the first transcript word, not frame zero. |
| Crossfade or transition timing creates small gaps | Permit gaps up to `maxUncoveredGap`; prefer overlapping coverage where possible. |
| Frame quantization differs between frameworks | Normalize evidence in seconds and allow only bounded frame-quantization tolerance. |
| Existing `mode: required` projects break unexpectedly | Add separate `coverageMode`; default absent legacy behavior to warnings. |
| Existing project-local standards remain stale | Provide an explicit refresh/migration path and verifier warning; never overwrite silently. |
| Exemptions become a routine bypass | Require anchors, reason, review metadata, visible warnings, and no default scaffold exemption. |
| `frameDur` includes transition time where prior content is intentionally gone | Define owned transition coverage or an explicit exemption; do not silently discard the interval. |
| A visual remains present but stops matching the narration concept | Machine checks prove declared coverage only; standards and manual review enforce semantic honesty. |
| Binding-manifest changes affect snapshots and adapters | Version manifests, preserve legacy parsing in warn mode, and update cross-framework fixtures. |
| Generated artifacts become stale | Recompute and atomically replace coverage projections/manifests on plan/build/regroup as appropriate. |
