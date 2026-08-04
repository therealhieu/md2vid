# Continuous Semantic Visual Coverage — Design

## Table of Contents

- [Context and Direction](#context-and-direction)
- [Architecture](#architecture)
- [Authority and Artifact Contracts](#authority-and-artifact-contracts)
- [Semantic Coverage Model](#semantic-coverage-model)
- [Coverage Intervals and Continuity](#coverage-intervals-and-continuity)
- [Planning and Serialization](#planning-and-serialization)
- [Framework Visibility Evidence](#framework-visibility-evidence)
- [Verification](#verification)
- [Standards and Skill Contract](#standards-and-skill-contract)
- [Error Handling](#error-handling)
- [Compatibility and Migration](#compatibility-and-migration)
- [Implementation Shape](#implementation-shape)
- [Testing and Evidence](#testing-and-evidence)
- [Rollout](#rollout)

## Context and Direction

**Problem** — md2vid resolves narration words and declared visual-beat cue points, but it does not model whether meaningful visual content continuously covers narration. A project can pass when all declared late beats are aligned even though the explanatory region is empty for a long opening, middle, or ending interval.

**Confirmed behavior** — the retained prepaid-ledger render begins narration at `0.070s`, does not begin its first semantic card reveal until `18.260s`, and keeps the explanatory region effectively frozen until approximately `18.467s`. The binding is correctly aligned to the declared beat, so current verification passes. The retained project is evidence only and is not an implementation target.

**Selected direction** — extend the neutral semantic beat contract from point reveals to coverage intervals. Resolve authored semantic states into frame-local intervals, make adapters emit observed visibility evidence, and verify the union of bound focal intervals against the complete required narrated-and-landing interval.

**Non-direction** — do not require animation every few seconds, infer semantic meaning from pixel changes, parse arbitrary GSAP or React source, treat captions as sufficient visual content, or repair the ledger fixture as the source solution.

### Governing invariant

```text
For every narrated frame:

  required interval
    = [first spoken word, planned frame end]

  valid coverage
    = union(bound focal semantic-state visibility intervals)

  invalid gap
    = any uncovered interval longer than maxUncoveredGap
```

The same invariant covers opening, middle, ending, transition, and held-landing gaps.

## Architecture

### Current state

```text
SCRIPT + audio + visual_beats v1
                 ↓
            engine.plan()
                 ├── transcript word timing
                 ├── frame timing
                 └── resolved beat start points
                              ↓
                    framework adapter
                              ├── reveal scheduling
                              └── reveal binding manifest
                                        ↓
                              verifyVisualSync()
                                ├── declared beat bound?
                                ├── reveal near cue?
                                ├── workflow ordered?
                                └── landing available?

No declared beat or no interval semantics
                 ↓
No continuous-coverage finding
```

### Expected state

```text
SCRIPT + audio + visual_beats v2
                 ↓
            engine.plan()
                 ├── transcript word timing
                 ├── frame timing
                 ├── resolved state starts
                 ├── resolved state coverage ends
                 └── resolved approved exemptions
                              ↓
                    neutral BuildPlan
                              ↓
              ┌───────────────┴────────────────┐
              ↓                                ↓
      HyperFrames adapter               Remotion adapter
        owned visibility                  owned visibility
        + binding evidence                 + binding evidence
              └───────────────┬────────────────┘
                              ↓
                    verifyVisualSync()
                       ├── cue alignment
                       ├── workflow order
                       ├── binding completeness
                       ├── coverage-evidence agreement
                       ├── interval union
                       ├── opening gaps
                       ├── middle gaps
                       ├── ending gaps
                       └── exemption reporting
                              ↓
                   verify before preview/render
```

### Responsibility boundaries

| Layer | Owns | Does not own |
|---|---|---|
| Author/agent | Semantic state IDs, text, role, cue anchors, coverage intent, source references, exemptions | Resolved numeric timestamps |
| Neutral engine | Anchor resolution, state intervals, required frame interval, policy defaults, exemption resolution | Framework animation code |
| Framework adapter | Owned visibility behavior, target binding, normalized observed evidence | Independent semantic interpretation or transcript matching |
| Verifier | Objective binding, timing, interval, continuity, and exemption checks | Whether a visual is aesthetically or pedagogically strong |
| Standards and skill | Semantic honesty, shell exclusions, workflow order, manual review requirements | Runtime state |
| Render/runtime | Deterministic seek-safe visibility at timestamp `t` | Semantic policy decisions |

### Design principles

1. **Coverage is semantic visibility, not motion cadence.**
2. **The neutral plan is authoritative.** Frameworks project it; they do not create competing coverage clocks.
3. **Evidence is explicit.** The verifier does not infer semantics from arbitrary source or pixels.
4. **Static is valid.** A diagram may cover many sentences without animating.
5. **Shell is insufficient.** Captions, backgrounds, logos, rails, and headings do not count automatically.
6. **All narrated intervals matter.** Opening is one diagnostic category, not a separate policy.
7. **Compatibility is explicit.** v1 reveal-only projects warn until migrated; new scaffolds require v2 coverage.

## Authority and Artifact Contracts

### Authored authority

The author-controlled neutral sources remain:

```text
STORYBOARD.md
SCRIPT.md
video.config.json
visual_beats.json
```

`visual_beats.json` is the machine-readable semantic authority. The storyboard explains the intended treatment and coverage, but the verifier reads the JSON contract.

Framework-authored sources remain:

```text
HyperFrames: compositions/frames/*.html
Remotion:    src/scenes/*, visual binding registry
```

They bind visual targets to neutral state IDs. They do not copy resolved times.

### Generated neutral artifacts

```text
cues.json
caption_groups.json
build/build_plan.json
build/visual_timing.json
```

`build/build_plan.json` is the authoritative resolved projection used by adapters. `build/visual_timing.json` is a compact author-facing projection.

### Generated framework evidence

```text
build/visual_bindings.json
```

Each framework emits its own normalized manifest. The manifest proves what the adapter schedules and keeps visible. It is evidence, not a second authoring source.

### Canonical versus generated standards

Canonical standards:

```text
docs/standards/**
```

Generated bundled skill copies:

```text
skill/md2vid/references/standards/**
```

Project-local framework snapshots:

```text
.md2vid/standards/hyperframes.md
.md2vid/standards/remotion.md
```

Implementation changes canonical sources first. `npm run sync:skill-references` regenerates bundled copies. Existing project-local snapshots require explicit migration or refresh; they are not silently overwritten.

### Versioning decisions

| Artifact | Version decision | Reason |
|---|---|---|
| `visual_beats.json` | Introduce version `2` | Coverage role, frame-start anchors, intervals, and exemptions change the authored contract materially |
| `BuildPlan` | Remain version `1` initially if changes are additive | Existing optional beat fields can be extended without invalidating legacy consumers |
| `build/visual_timing.json` | Version `2` | Projection gains interval and exemption semantics |
| `build/visual_bindings.json` | Version `2` | Normalized evidence gains role and coverage intervals |
| Project configuration | Additive fields | `coverageMode` and `maxUncoveredGap` can coexist with current visual-sync settings |

If implementation discovers a consumer that treats current build-plan beat objects as exact closed shapes, increment `BuildPlan.version` rather than weakening validation.

## Semantic Coverage Model

### Authored v2 specification

```json
{
  "version": 2,
  "frames": {
    "reserve-flow": {
      "kind": "workflow",
      "beats": [
        {
          "id": "opening-context",
          "text": "Reserve before performing external work",
          "role": "focal",
          "cue": { "frameStart": true },
          "coverage": { "until": "next-state" },
          "sourceRefs": ["guide.md:120-132"]
        },
        {
          "id": "execute",
          "text": "Execute the external operation after reservation",
          "role": "focal",
          "cue": {
            "phrase": "execute the external operation",
            "occurrence": 1
          },
          "coverage": { "until": "next-state" },
          "workflowStep": 2,
          "sourceRefs": ["guide.md:133-140"]
        },
        {
          "id": "settle",
          "text": "Settle or release from durable evidence",
          "role": "focal",
          "cue": { "wordIndex": 47 },
          "coverage": { "until": "frame-end" },
          "workflowStep": 3,
          "sourceRefs": ["guide.md:141-151"]
        }
      ],
      "coverageExemptions": []
    }
  }
}
```

### Proposed authored types

```ts
export type VisualCueAnchor =
  | { frameStart: true }
  | { wordIndex: number }
  | { phrase: string; occurrence: number };

export type VisualCoverageEnd =
  | "next-state"
  | "voice-end"
  | "frame-end"
  | { cue: VisualCueAnchor };

export type VisualSemanticRole = "focal" | "supporting";

export interface AuthoredVisualCoverage {
  until?: VisualCoverageEnd;
}

export interface AuthoredVisualState {
  id: string;
  text: string;
  role: VisualSemanticRole;
  cue: VisualCueAnchor;
  coverage?: AuthoredVisualCoverage;
  sourceRefs?: string[];
  workflowStep?: number;
  tolerance?: Partial<VisualBeatTolerance>;
}

export interface AuthoredCoverageExemption {
  id: string;
  from: VisualCueAnchor;
  until: VisualCoverageEnd;
  reason: string;
  approvedBy: string;
}

export interface AuthoredVisualFrameV2 {
  kind?: "focal" | "workflow" | "comparison" | "sequence";
  beats: AuthoredVisualState[];
  coverageExemptions?: AuthoredCoverageExemption[];
}

export interface VisualBeatSpecV2 {
  version: 2;
  frames: Record<string, AuthoredVisualFrameV2>;
}
```

The canonical v2 property is `beats`, preserving the existing public vocabulary and making v1-to-v2 migration mechanical. Each beat is a semantic state with a visibility interval, not merely an instantaneous reveal event. The implementation must not introduce `states` as an alternate serialized field.

### Semantic roles

| Role | May satisfy coverage alone? | Use |
|---|---:|---|
| `focal` | Yes | The active explanatory visual for the narrated concept |
| `supporting` | No | Labels, legends, secondary examples, or accents that accompany a focal state |

Captions and framework shell are outside this role model and never become focal automatically.

A title card may be authored as `focal` when the title itself is the intended semantic content. A persistent section heading that merely labels a scene remains shell and is not declared as a focal state.

### Resolved neutral types

```ts
export interface ResolvedVisualState {
  id: string;
  text: string;
  role: VisualSemanticRole;
  start: number;
  end: number;
  cueWordIndex?: number;
  cueText: string;
  sourceRefs: string[];
  workflowStep?: number;
  tolerance: VisualBeatTolerance;
}

export interface ResolvedCoverageExemption {
  id: string;
  start: number;
  end: number;
  reason: string;
  approvedBy: string;
}

export interface PlanFrame {
  // Existing fields remain.
  visualKind?: AuthoredVisualFrameV2["kind"];
  visualBeats?: ResolvedVisualState[];
  visualCoverageExemptions?: ResolvedCoverageExemption[];
}
```

The existing `visualBeats` field may retain its name for serialized compatibility even though each item now has interval semantics.

### Frame-start anchor

`{ "frameStart": true }` resolves to local `0` and has no transcript word index.

Generated evidence omits `cueWordIndex` for a frame-start anchor:

```json
{
  "cueText": "<frame-start>",
  "start": 0
}
```

The neutral and mirrored Remotion types use the same optional-number representation; they must not serialize `null` for this field.

A frame-start state may begin before the first spoken word. The required coverage interval still begins at the first spoken word, so unvoiced leading silence does not create a failure.

### Default coverage semantics

For states ordered by resolved start:

```text
state[i].end = state[i + 1].start
final.end    = frame.frameDur
```

An explicit `coverage.until` overrides this default:

| Value | Resolved end |
|---|---|
| omitted | next state; final state uses frame end |
| `next-state` | next resolved state start; invalid for final state unless final falls back to frame end by documented rule |
| `voice-end` | measured `voiceDur` |
| `frame-end` | planned `frameDur` |
| cue anchor | resolved cue time |

All ends are clamped only for floating-point normalization, not to hide invalid input. A materially out-of-range or inverted interval is an error.

### Exemptions

Exemptions are exceptional authored intervals where meaningful visual coverage is intentionally absent.

They must include:

- deterministic boundaries;
- a non-empty explanation;
- explicit approval identity or reference; and
- stable ID.

They are not merged into ordinary visual coverage. Verification computes gaps first, then identifies which portions are approved. Reports list exemptions separately so an approved blank interval cannot disappear from review evidence.

New scaffold examples contain no exemption.

## Coverage Intervals and Continuity

### Required interval

For a frame with transcript words:

```ts
const requiredStart = frame.words[0].start;
const requiredEnd = frame.frameDur;
```

Using `frameDur` rather than `voiceDur` requires the final visual to remain through the held landing and any planned tail owned by the frame.

A frame with voice audio but no validated transcript words already fails existing audio/transcript preconditions and does not create a second fallback clock.

A non-narrated frame with no words is outside this feature's required interval unless future standards explicitly opt it into visual-only coverage verification.

### Observed coverage

Only observed bindings with `role: "focal"` contribute to coverage.

Each candidate interval is:

```ts
[
  max(0, binding.coverageStart),
  min(frame.frameDur, binding.coverageEnd),
]
```

Invalid, inverted, non-finite, unknown-state, or unbound intervals produce errors and do not contribute to coverage.

### Interval union

1. Sort valid intervals by start, then end.
2. Merge overlapping intervals.
3. Merge adjacent intervals when their gap is within a small arithmetic epsilon used only for numeric stability.
4. Do not use `maxUncoveredGap` during union; policy gaps remain visible for classification.
5. Subtract the merged intervals from `[requiredStart, requiredEnd]`.
6. Classify and evaluate each uncovered interval independently.

Illustrative implementation:

```ts
interface Interval {
  start: number;
  end: number;
}

function unionIntervals(intervals: Interval[], epsilon: number): Interval[] {
  const sorted = intervals
    .slice()
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: Interval[] = [];
  for (const current of sorted) {
    const previous = merged.at(-1);
    if (!previous || current.start > previous.end + epsilon) {
      merged.push({ ...current });
      continue;
    }
    previous.end = Math.max(previous.end, current.end);
  }
  return merged;
}
```

### Gap policy

Configuration:

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

A gap fails when:

```text
gap.duration > maxUncoveredGap
```

The boundary is inclusive: exactly `0.5s` passes when the configured maximum is `0.5s`.

The policy permits brief transitions but does not require a gap. Overlapping focal states are valid and preferred for crossfades.

### Gap classification

Given required interval `[Rstart, Rend]` and uncovered interval `[Gstart, Gend]`:

```text
Gstart approximately equals Rstart → opening_visual_gap
Gend approximately equals Rend     → ending_visual_gap
otherwise                           → mid_scene_visual_gap
```

A frame with no valid focal interval produces one gap spanning the complete required interval. The public contract reports it as `opening_visual_gap` with `extendsThroughFrameEnd: true`; it does not introduce a fourth public gap category.

### Static state behavior

A static focal state contributes its complete interval even when:

- reveal duration is zero;
- no animated property changes after activation;
- it remains unchanged for many seconds; or
- narration spans several sentences about the same concept.

The verifier does not require new motion, a new target, or a new state within a maximum cadence.

### Multiple bindings for one state

A semantic state may bind multiple coordinated targets.

- Every binding remains subject to cue and evidence validation.
- The state is considered bound when at least one valid focal target exists.
- Coverage uses the union of valid focal bindings for that state.
- Supporting bindings do not extend focal coverage by themselves.
- Duplicate target rules remain unchanged unless coordinated targets are explicitly represented.

### Semantic exits

Coverage evidence must reflect actual owned visibility behavior.

If a target exits before its planned default end, the framework author must use an adapter-owned semantic exit declaration/helper. The adapter then records the shortened `coverageEnd`.

Unsupported arbitrary exits are incompatible with strict coverage because the verifier cannot prove the runtime state. Framework standards must prohibit freehand semantic hiding in required mode while allowing non-semantic decorative motion.

## Planning and Serialization

### Planning flow

```text
resolve project layout
  → load neutral configuration
  → validate audio metadata and WAV authority
  → load visual_beats.json v1 or v2
  → validate frame coverage expectations
  → resolve cue anchors
  → resolve state coverage endpoints
  → resolve exemptions
  → attach resolved intervals to PlanFrame
  → serialize neutral artifacts transactionally
```

### Validation order

The planner validates in this order to produce stable, actionable diagnostics:

1. top-level version and exact fields;
2. frame slugs against neutral plan slugs;
3. state IDs, roles, text, and workflow metadata;
4. cue-anchor shape and phrase/index validity;
5. resolved start ordering;
6. coverage-end shape and resolution;
7. interval bounds and inversion;
8. exemption shape and approval metadata;
9. required narrated-frame representation based on coverage mode.

No generated artifact is promoted if any required validation fails.

### v1 handling

v1 remains reveal-only input:

```json
{
  "version": 1,
  "frames": {
    "frame-slug": {
      "beats": [
        { "id": "concept", "text": "Concept", "cue": { "wordIndex": 3 } }
      ]
    }
  }
}
```

Compatibility planning may derive provisional intervals for warnings:

```text
beat start → next beat start
final beat → frame end
```

However, v1 lacks explicit role and authored coverage intent. It cannot prove strict compliance. Under absent legacy coverage configuration, verification emits a migration warning rather than claiming required coverage success.

An explicitly migrated project uses v2 before setting `coverageMode: "required"`.

### Compact visual timing projection

`build/visual_timing.json` version 2:

```json
{
  "version": 2,
  "frames": {
    "reserve-flow": {
      "voiceDuration": 18.42,
      "frameDuration": 19.42,
      "requiredCoverage": {
        "start": 0.18,
        "end": 19.42
      },
      "beats": [
        {
          "id": "opening-context",
          "role": "focal",
          "start": 0,
          "end": 7.84
        },
        {
          "id": "execute",
          "role": "focal",
          "start": 7.84,
          "end": 14.2
        },
        {
          "id": "settle",
          "role": "focal",
          "start": 14.2,
          "end": 19.42
        }
      ],
      "coverageExemptions": []
    }
  }
}
```

This artifact helps authors inspect the resolved contract before framework authoring. It is regenerated by plan/build and never hand-edited.

### Build and regroup behavior

- `md2vid plan` resolves and writes neutral coverage artifacts only.
- `md2vid build` reuses the same planner, then asks the adapter to emit owned visibility behavior and evidence.
- `md2vid regroup` may update caption artifacts but must preserve or deterministically regenerate coverage fields.
- `md2vid verify` replans current neutral sources and compares them with current adapter evidence.
- Managed manifests are always replaced atomically; stale evidence must not survive a later build.

## Framework Visibility Evidence

### Normalized binding manifest v2

```ts
export interface VisualBindingV2 {
  frameSlug: string;
  beatId: string;
  target: string;
  role: VisualSemanticRole;

  revealStart: number;
  revealDuration: number;

  coverageStart: number;
  coverageEnd: number;

  source: "declarative" | "custom" | "static";
}

export interface VisualBindingInputDigest {
  path: string;       // project-relative, normalized POSIX path
  sha256: string;     // lowercase hexadecimal SHA-256
}

export interface VisualBindingManifestV2 {
  version: 2;
  framework: "hyperframes" | "remotion" | string;
  planSha256: string;
  authoredInputs: VisualBindingInputDigest[];
  bindings: VisualBindingV2[];
}
```

`planSha256` hashes a deterministic canonical serialization of the coverage-relevant neutral plan. `authoredInputs` is sorted by normalized path and records every authored framework input whose bytes can affect semantic visibility evidence.

- HyperFrames includes every authored frame HTML file used by the plan; embedded custom-binding declarations are covered by the containing file digest.
- Remotion includes the authored visual-binding registry and the authored `src/**/*.{ts,tsx,js,jsx}` source set, excluding generated output.

Verification recomputes the plan digest, recomputes the adapter-defined source-file set and digests, and rejects any changed, missing, or newly relevant input before trusting binding intervals.

The adapter copies semantic role and expected state identity from the neutral plan; framework-authored source cannot upgrade shell into a focal state without a corresponding neutral declaration.

### Evidence agreement

Before evaluating bindings:

- `planSha256` must match the freshly replanned canonical coverage data;
- the current adapter-defined authored-input path set must exactly match `authoredInputs`; and
- every current authored-input SHA-256 must match its recorded digest.

For each binding:

- `beatId` must resolve to a planned state in the same frame;
- `role` must equal the planned role;
- reveal timing must satisfy existing lead/lag rules;
- `coverageStart` must agree with owned activation behavior;
- `coverageEnd` must agree with owned exit/retention behavior;
- coverage must remain within frame bounds, allowing only documented frame-quantization tolerance; and
- target identity must remain stable and unique under existing binding rules.

Observed evidence, not planned intent alone, forms the interval union.

### HyperFrames declarative contract

Recommended authored forms:

```html
<article
  id="opening-context"
  data-md2vid-beat="opening-context"
  data-md2vid-enter="none"
  data-md2vid-coverage="planned"
>
  Preserve accounting history while authorizing safely.
</article>
```

```html
<article
  id="immutable-journal"
  data-md2vid-beat="immutable-journal"
  data-md2vid-enter="rise"
  data-md2vid-duration="0.48"
  data-md2vid-coverage="planned"
>
  Immutable journal
</article>
```

`data-md2vid-coverage="planned"` may be implicit for v2 beat targets if the implementation can preserve a simple contract. The important behavior is:

1. target visibility is framework-owned;
2. activation uses resolved `start`;
3. target remains semantically visible through resolved `end` unless an owned exit shortens it; and
4. emitted evidence records the actual interval.

The adapter must not mark caption composition targets, persistent shell, or unrelated decorative elements as focal coverage.

### HyperFrames custom contract

Custom motion continues using machine-readable declarations plus owned helpers. Extend declarations with coverage behavior only when it differs from the planned default:

```html
<script type="application/json" data-md2vid-custom-bindings>
{
  "bindings": [
    {
      "beat": "execute",
      "target": "#execute-step",
      "method": "from",
      "duration": 0.7,
      "coverage": "planned"
    }
  ]
}
</script>
```

Owned helper shape:

```js
const timing = window.__md2vidTiming.forFrame("reserve-flow");
const tl = gsap.timeline({ paused: true });

timing.from(
  tl,
  "execute",
  "#execute-step",
  { opacity: 0, y: 36, duration: 0.7, ease: "power3.out" },
);
```

If custom code hides `#execute-step` earlier, it must use an owned exit helper such as:

```js
timing.exit(tl, "execute", "#execute-step", { at: "coverage-end" });
```

Exact helper naming may follow existing runtime conventions. The contract is that semantic activation and exit are owned and evidenced.

### Remotion authored registry

Example v2 pure-data registry:

```json
{
  "version": 2,
  "frames": {
    "reserve-flow": [
      {
        "beat": "opening-context",
        "target": "OpeningContext",
        "enter": "none",
        "coverage": "planned"
      },
      {
        "beat": "execute",
        "target": "WorkflowStep:execute",
        "enter": "rise",
        "duration": 0.5,
        "coverage": "planned"
      }
    ]
  }
}
```

Runtime usage:

```tsx
<VisualBeatProvider frame={frame}>
  <BeatState target="OpeningContext">
    <OpeningContext />
  </BeatState>

  <BeatReveal target="WorkflowStep:execute">
    <WorkflowStep>Execute operation</WorkflowStep>
  </BeatReveal>
</VisualBeatProvider>
```

`BeatState` and `BeatReveal` both consume generated timing. They do not accept copied semantic frame numbers. The adapter quantizes boundaries to frames and emits normalized seconds in the manifest.

### Framework parity

Parity means:

```text
same neutral state IDs
same resolved semantic intervals
same gap-verification outcome
```

It does not require identical target names, animation styles, DOM/React structure, or byte-identical frames.

## Verification

### Verification inputs

```ts
export interface VisualSyncVerificationInput {
  plan: BuildPlan;
  policy: ResolvedVisualSyncPolicy;
  bindings?: VisualBindingManifestV1 | VisualBindingManifestV2;
  fps?: number;
}
```

The verifier receives replanned neutral data and the current generated framework manifest.

### Policy

```ts
export interface VisualSyncConfig {
  mode?: "off" | "warn" | "required";
  coverageMode?: "off" | "warn" | "required";
  maxLead?: number;
  maxLag?: number;
  maxUncoveredGap?: number;
  minLanding?: number;
}
```

Resolved defaults for new scaffolds:

```ts
{
  mode: "required",
  coverageMode: "required",
  maxLead: 0.25,
  maxLag: 0.75,
  maxUncoveredGap: 0.5,
  minLanding: 1,
}
```

Legacy projects with no coverage field resolve to `coverageMode: "warn"` during the compatibility window.

### Verification phases

#### Phase 1 — Structural validity

- manifest version supported;
- frame references known;
- state references known;
- role agrees with neutral plan;
- timing values finite;
- intervals ordered and in bounds;
- required v2 evidence present when coverage is required.

#### Phase 2 — Existing reveal checks

Preserve:

- missing planned bindings;
- unknown bindings;
- lead/lag tolerance;
- workflow order;
- duplicate target rules;
- reveal landing timing; and
- duration agreement.

#### Phase 3 — Required interval construction

For every frame with transcript words:

```ts
const required: Interval = {
  start: frame.words[0].start,
  end: frame.frameDur,
};
```

If coverage is required and the frame has no authored v2 state, report a missing-frame coverage error before interval evaluation.

#### Phase 4 — Observed interval collection

Collect valid focal bindings for the frame. Clip only arithmetic epsilon at boundaries; material out-of-range evidence remains an error.

Supporting bindings and invalid bindings do not contribute.

#### Phase 5 — Union and subtraction

```ts
const covered = unionIntervals(observedFocalIntervals, epsilon);
const gaps = subtractIntervals(required, covered, epsilon);
```

Apply exemptions after gap calculation:

```ts
const evaluation = classifyGapAgainstExemptions(gap, exemptions);
```

A partially exempt gap is split into approved and unapproved portions. Only the unapproved portion is subject to failure, but the approved portion remains in the report.

#### Phase 6 — Policy evaluation

```ts
if (unapprovedGap.duration > policy.maxUncoveredGap) {
  findings.push(toCoverageFinding(...));
}
```

Exactly-equal gaps pass.

#### Phase 7 — Classification

```ts
function classifyGap(gap: Interval, required: Interval): GapKind {
  if (approximatelyEqual(gap.start, required.start)) {
    return "opening_visual_gap";
  }
  if (approximatelyEqual(gap.end, required.end)) {
    return "ending_visual_gap";
  }
  return "mid_scene_visual_gap";
}
```

If one gap spans the whole required interval, emit one `opening_visual_gap` finding with `extendsThroughFrameEnd: true`. This avoids duplicate opening and ending errors while preserving the three-category public contract.

### Diagnostic examples

Opening:

```text
ERROR [opening_visual_gap] frame "ledger-truth":
narration begins at 0.070s, but first bound focal coverage begins at 18.260s.
uncovered interval: 0.070s-18.260s (18.190s)
maximum allowed: 0.500s

Add a frame-start focal state, introduce an earlier cue-bound state, or declare
an approved intentional audio-only interval.
```

Middle:

```text
ERROR [mid_scene_visual_gap] frame "reserve-flow":
no bound focal state covers 8.200s-13.900s (5.700s).
maximum allowed: 0.500s
previous state: "reserve"
next state: "settle"

Extend the previous state's coverage, add an intermediate semantic state, or
correct the framework visibility evidence.
```

Ending:

```text
ERROR [ending_visual_gap] frame "recap":
final focal coverage ends at 21.400s, but the frame landing ends at 24.400s.
uncovered interval: 21.400s-24.400s (3.000s)
maximum allowed: 0.500s

Keep the final focal state visible through frame end or declare an owned exit
and replacement state.
```

Complete-frame gap:

```text
ERROR [opening_visual_gap] frame "overview":
extendsThroughFrameEnd: true
no valid bound focal state covers the narrated frame interval
0.120s-16.900s (16.780s).

Shell, captions, backgrounds, logos, and unbound targets do not count as
semantic visual coverage.
```

Exemption:

```text
WARN [visual_coverage_exemption] frame "quote-pause":
approved uncovered interval 7.200s-8.400s (1.200s)
reason: "intentional audio-only pause before the reveal"
approved by: "storyboard-review:42"
```

### Manual review boundary

The verifier proves:

- a state was authored as focal;
- a framework target binds to it;
- owned visibility covers the declared interval; and
- the timeline has no unapproved long gaps.

It cannot prove that the visual actually explains the narration. Manual review must still reject dishonest declarations such as marking a decorative header as focal coverage for an unrelated explanation.

The standards and skill review checklist make this boundary explicit rather than treating it as a reason to omit objective continuity checks.

### Optional rendered diagnostic

A render-level region freeze detector may be retained as a warning-only diagnostic for investigation. It must not be the source of semantic truth because:

- captions may move while content is absent;
- decoration may animate while content is absent; and
- valid explanatory content may remain static.

Semantic verification remains plan-and-binding based.

## Standards and Skill Contract

### Canonical standards

#### `docs/standards/video-generation.md`

Add the normative continuous-coverage rule:

> Every narrated frame maintains meaningful visual coverage continuously from its first spoken word through its held landing. Coverage may be static, but it must express the current narrated concept. Captions, backgrounds, logos, decorative elements, and persistent frame chrome do not satisfy this requirement by themselves. No unapproved uncovered interval may exceed the configured maximum.

Update the verification checklist to include:

- every narrated frame represented;
- opening coverage;
- mid-frame continuity;
- ending and landing coverage;
- exemptions reviewed; and
- framework evidence generated.

#### `docs/standards/design/frame.md`

Clarify:

- the initial focal anchor is a semantic state;
- static focal states are valid;
- focal coverage persists until the next state or owned exit;
- shell and caption bands are not focal coverage; and
- transitions preserve coverage or stay within the configured gap.

#### `docs/standards/design/knowledge-expression.md`

Extend the expression triad from reveal points to intervals:

```text
At every narrated timestamp:
active focal state = narration concept = caption concept
```

Long static holds are valid while the narration remains on the same concept. A concept change requires a new state or an explicit declaration that the existing state continues to represent it.

#### `docs/standards/design/frame-content.md`

Require semantic activations and exits to use framework-owned binding paths so generated evidence matches runtime behavior.

#### Framework standards

Document framework-specific static states, cue-bound states, coverage persistence, owned exits, manifest evidence, and shell exclusions.

### `skill/md2vid/SKILL.md`

Update the workflow:

```text
source inventory
  → storyboard coverage map
  → script
  → narration/transcription
  → visual_beats v2
  → md2vid plan
  → inspect resolved coverage intervals
  → author framework targets and owned visibility
  → build
  → verify continuous coverage
  → preview/manual semantic review
  → render
```

The storyboard contract for every narrated frame must record:

- opening focal state;
- body semantic states;
- state-to-narration coverage intent;
- final held state; and
- any intentional exemption.

The skill must state that a visible title, animated captions, or background alone is insufficient unless the title is explicitly the active semantic focal.

### Generated references

Run:

```bash
npm run sync:skill-references
npm run check:skill-references
```

Do not hand-edit `skill/md2vid/references/standards/**`.

## Error Handling

### Planning errors

| Failure | Result |
|---|---|
| Unsupported visual specification version | Fail with supported versions |
| Unknown frame slug | Fail with valid frame slugs |
| Narrated frame omitted in required v2 mode | Fail before generated writes |
| Duplicate state ID | Fail with both paths |
| Missing/empty semantic text | Fail with state path |
| Invalid semantic role | Fail with accepted roles |
| Missing or malformed cue | Fail with state path |
| Missing/ambiguous phrase | Fail with transcript candidates |
| Invalid frame-start anchor shape | Fail with expected exact form |
| Invalid coverage endpoint | Fail with accepted endpoint forms |
| Coverage end before start | Fail with resolved times |
| Coverage outside frame | Fail with frame duration |
| Invalid exemption boundaries | Fail with resolved times |
| Exemption lacks reason or approval | Fail in required mode |

Planning remains transactional.

### Framework errors

| Failure | Result |
|---|---|
| Binding references unknown state | Build/verify error |
| Planned focal state has no target | Verify error in required mode |
| Manifest v2 missing in required v2 mode | Verify error |
| Binding role differs from neutral state | Verify error |
| Coverage values non-finite or inverted | Verify error |
| Static state not actually framework-owned | Build/verify contract error |
| Unsupported freehand semantic exit | Strict-mode error or migration warning |
| Runtime helper receives copied timestamp | API/type rejection where enforceable |

### Coverage findings

Coverage findings obey `coverageMode`:

| Mode | Finding behavior |
|---|---|
| `off` | Skip interval evaluation |
| `warn` | Produce warnings; command remains successful unless another error exists |
| `required` | Produce errors and fail verification |

Approved exemptions always appear as warnings or informational audit records, even when the command otherwise passes.

### Stale evidence

`md2vid verify` replans current neutral sources, computes the canonical `planSha256`, and asks the selected adapter to enumerate and hash its current authored semantic-visibility inputs. It compares the plan digest, exact normalized source-path set, and every SHA-256 with manifest v2 before evaluating coverage.

Any changed, missing, or newly relevant authored input makes the manifest stale. Required mode fails with the changed paths and rebuild command; warn mode reports the same mismatch but must not use stale intervals to claim coverage success.

This catches post-build mutations such as changing a HyperFrames frame target, editing a custom binding declaration, changing a Remotion registry entry, or adding freehand visibility behavior in a Remotion scene.

## Compatibility and Migration

### Compatibility matrix

| Project state | Default behavior |
|---|---|
| New scaffold | v2 visual states, `mode=required`, `coverageMode=required` |
| Existing v1, no `coverageMode` | Current reveal checks plus coverage migration warnings |
| Existing v1, `coverageMode=required` | Configuration error instructing migration to v2, or strict derived behavior only if explicitly designed and documented |
| Existing v2, `coverageMode=warn` | Full interval verification as warnings |
| Existing v2, `coverageMode=required` | Full interval verification as errors |
| `mode=off` and `coverageMode=off` | Existing complete opt-out |

Prefer requiring v2 for strict coverage. Inferring strict semantics from v1 would let legacy point beats claim coverage without explicit author intent.

### Migration steps

```text
1. Refresh or read the new project standard.
2. Convert visual_beats.json to version 2.
3. Add a focal frame-start or early cue state to every narrated frame.
4. Confirm body state coverage and final frame-end coverage.
5. Register static and cue-bound framework targets.
6. Replace freehand semantic exits with owned exits.
7. Run md2vid plan and inspect visual_timing.json.
8. Build to regenerate binding manifest v2.
9. Run verification in warn mode.
10. Resolve all unapproved gaps.
11. Switch coverageMode to required.
```

### Project-local standards

Existing `.md2vid/standards/<framework>.md` files are snapshots. Introduce one of:

1. a safe `md2vid upgrade-project-standards` operation that previews and applies standard-only changes; or
2. a documented manual refresh with version detection.

The operation must not overwrite authored compositions, scenes, configuration, scripts, or custom project guidance.

If no refresh command is introduced in the first release, verification should detect a pre-coverage standard marker and print the exact canonical migration instruction.

### Multi-framework projects

The v2 visual specification belongs in `shared/`. HyperFrames and Remotion each emit output-local binding manifests from the same resolved states.

Migration is complete only when every requested framework passes the same neutral coverage policy.

## Implementation Shape

### Neutral engine

| File | Responsibility |
|---|---|
| `engine/types.ts` | v2 authored state, role, coverage, exemption, resolved interval, config, and manifest types |
| `engine/config.ts` | Validate `coverageMode`, `maxUncoveredGap`, and compatibility defaults |
| `engine/visual_beats.ts` | Load v1/v2, validate exact shapes, resolve starts/ends/exemptions, require narrated-frame representation |
| `engine/plan.ts` | Attach resolved coverage to plan frames and resolve policy defaults |
| `engine/visual_sync.ts` | Evidence agreement, interval union/subtraction, classification, exemptions, diagnostics |
| `engine/audio_meta.ts` | Retain validated transcript timing authority; no new clock |

### Planning and CLI

| File | Responsibility |
|---|---|
| `scripts/plan_project.ts` | Serialize v2 coverage projection transactionally |
| `scripts/plan.ts` | Expose plan-only coverage results |
| `scripts/build.ts` | Reuse planning, emit framework visibility, replace v2 manifest |
| `scripts/regroup.ts` | Preserve/recompute coverage while updating captions |
| `scripts/verify.ts` | Replan, load v1/v2 manifest, invoke neutral verifier |
| `scripts/scaffold_project.ts` | New coverage defaults and v2 example |
| `scripts/project_layout.ts` | Preserve flat/canonical neutral-root behavior |
| `bin/md2vid.ts` | Keep command help accurate if migration commands are added |

### HyperFrames

| File | Responsibility |
|---|---|
| `frameworks/hyperframes/visual_timing.ts` | Static/cue-bound activation, planned retention, owned exits, manifest v2 |
| `frameworks/hyperframes/emit.ts` | Inject generated timing and atomically write evidence |
| `frameworks/hyperframes/verify.ts` | Load structural/runtime evidence and neutral coverage findings |
| `frameworks/hyperframes/templates/frame-template.html` | Machine-readable opening focal, body state, and held final example |
| HyperFrames runtime/helper module | Deterministic coverage ownership and seek safety |

### Remotion

| File | Responsibility |
|---|---|
| `frameworks/remotion/visual_bindings.ts` | Validate v2 registry and emit quantized coverage evidence |
| `frameworks/remotion/emit.ts` | Embed normalized state timing and manifest v2 |
| `frameworks/remotion/verify.ts` | Invoke neutral coverage verification with frame quantization context |
| `frameworks/remotion/templates/src/VisualBeats.tsx` | `BeatState`, `BeatReveal`, and owned retention/exit behavior |
| `frameworks/remotion/templates/src/Video.tsx` | Register default title card only when it is a declared semantic focal |
| `frameworks/remotion/templates/src/types.ts` | Mirror generated resolved coverage types |

### Standards, skill, and propagation

| File | Responsibility |
|---|---|
| `docs/standards/video-generation.md` | Normative continuous coverage invariant and verification checklist |
| `docs/standards/design/frame.md` | Static focal validity, shell exclusion, transitions, landing |
| `docs/standards/design/knowledge-expression.md` | Interval expression triad and concept continuity |
| `docs/standards/design/frame-content.md` | Owned semantic activation/exit evidence |
| `docs/standards/frameworks/hyperframes.md` | HyperFrames authoring/runtime contract |
| `docs/standards/frameworks/remotion.md` | Remotion authoring/runtime contract |
| `skill/md2vid/SKILL.md` | Coverage-first storyboard/plan/build/verify workflow |
| `scripts/skill_references.ts` | Retain canonical-to-bundled mapping |
| `skill/md2vid/references/standards/**` | Regenerated copies only |
| `README.md` | Public coverage model, configuration, examples, migration |

### Generated versus authored boundary

```text
Authored neutral:
  STORYBOARD.md
  SCRIPT.md
  visual_beats.json v2
  video.config.json

Authored framework:
  HyperFrames frame HTML
  Remotion scenes and pure binding registry

Generated neutral:
  build/build_plan.json
  build/visual_timing.json v2
  cues.json
  caption_groups.json

Generated framework:
  build/visual_bindings.json v2
  emitted index/runtime/plan files
```

Build may replace only generated artifacts.

## Testing and Evidence

### Neutral configuration tests

`engine/__tests__/config.test.ts`:

- valid `coverageMode` values;
- default compatibility behavior;
- new scaffold required behavior;
- zero and exact boundary `maxUncoveredGap`;
- negative, `NaN`, and infinite rejection;
- interaction with existing `mode`; and
- existing `minLanding` floor.

### Visual specification tests

`engine/__tests__/visual_beats.test.ts`:

- v2 exact field validation;
- frame-start cue resolves to zero;
- phrase and word-index resolution remain deterministic;
- non-final default end is next state;
- final default end is frame end;
- explicit voice/frame/cue end resolution;
- role validation;
- inverted/out-of-frame end rejection;
- narrated frame omission in required mode;
- exemption validation and resolution;
- v1 compatibility parsing; and
- source-reference and workflow metadata preservation.

### Planning tests

`engine/__tests__/plan.test.ts` and CLI plan tests:

- required interval uses first word and frame duration;
- unvoiced leading silence is excluded;
- resolved intervals serialize exactly;
- v2 projection uses version 2;
- unchanged plan/build output and canonical plan digest are stable;
- changing coverage-relevant neutral input invalidates the recorded plan digest;
- flat and canonical shared roots produce equivalent neutral timing; and
- invalid input produces no partial writes.

### Neutral verifier tests

`engine/__tests__/visual_sync.test.ts` must include:

| Scenario | Expected |
|---|---|
| Required interval fully covered by one static focal state | Pass |
| First speech `0.07`, first observed coverage `18.26` | `opening_visual_gap` |
| Valid focal states separated by 6 seconds | `mid_scene_visual_gap` |
| Final focal ends 3 seconds before frame end | `ending_visual_gap` |
| No valid focal binding for complete frame | `opening_visual_gap` with `extendsThroughFrameEnd: true` |
| Only supporting bindings exist | Same complete-frame opening-gap finding |
| Only captions/shell exist outside manifest | Same complete-frame opening-gap finding |
| Gap exactly equals `0.5` | Pass at default |
| Gap exceeds `0.5` by representable epsilon | Fail |
| Overlapping focal intervals | Pass |
| Adjacent intervals within arithmetic epsilon | Pass |
| One state bound to multiple targets | Union behaves correctly |
| Invalid binding interval | Evidence error and no false coverage |
| Partially exempt gap | Approved portion reported; unapproved portion evaluated |
| Fully exempt gap | Exemption warning, no coverage error |
| Exemption does not cover unrelated gap | Unrelated gap fails |
| First speech and first visual both at `2.95` after silence | Pass |
| Warn mode | Findings are warnings |
| Off mode | Coverage evaluation skipped |
| Existing reveal lead/lag violation | Existing failure preserved |
| Existing workflow-order violation | Existing failure preserved |

### HyperFrames tests

- static `data-md2vid-beat` state visible at direct seek and sequential playback;
- cue-bound state activates at resolved start;
- state remains visible through planned end;
- owned exit shortens coverage evidence and runtime visibility consistently;
- arbitrary shell/caption target is not automatically added;
- declarative and custom bindings emit manifest v2;
- manifest evidence matches the generated timeline;
- changing authored frame HTML after build invalidates its recorded digest;
- adding or removing a relevant authored frame input after build invalidates the recorded source set;
- v1 legacy path remains supported in compatibility mode;
- snapshot at opening, middle, boundary, ending, and landing times; and
- seek backward and forward across every activation/exit boundary.

Primary files:

- `frameworks/hyperframes/__tests__/visual_timing.test.ts`
- `frameworks/hyperframes/__tests__/emit.test.ts`
- `frameworks/hyperframes/__tests__/verify.test.ts`

### Remotion tests

- frame-start static state begins at frame zero;
- transcript cue converts to the correct frame;
- coverage end quantizes without an excessive gap;
- `BeatState` remains visible through planned end;
- `BeatReveal` preserves existing entrance behavior and adds interval evidence;
- owned exit matches manifest evidence;
- supporting-only state does not satisfy coverage;
- changing the authored registry after build invalidates its digest;
- changing, adding, or removing relevant authored scene source after build invalidates the recorded source set or digest;
- v1 registry remains supported in warn mode; and
- HyperFrames and Remotion manifests produce identical neutral coverage findings.

Primary files:

- `frameworks/remotion/__tests__/visual_beats.test.ts`
- `frameworks/remotion/__tests__/emit.test.ts`
- `frameworks/remotion/__tests__/verify.test.ts`
- `frameworks/remotion/__tests__/scaffold.test.ts`

### Scaffold and skill tests

Update:

- `test/cli/scaffold-project.test.ts`;
- `test/cli/scaffold-decoupled.test.ts`;
- `test/scaffold.test.ts`;
- `test/cli/skill-references.test.ts`;
- `test/cli/skill-commands.test.ts`; and
- `test/docs-boundary.test.ts`.

Assert:

- v2 example present;
- required coverage defaults present;
- opening static focal, later state, and final landing documented;
- cue-first plan workflow present;
- canonical and bundled standards byte-equal;
- generated project remains decoupled from repository paths; and
- framework standards remain under their current boundary.

### Synthetic regression fixture

Create a focused fixture independent of the ledger project:

```text
first spoken word:       0.070s
first declared state:   18.260s
frame end:              23.080s
```

Fixture variants:

1. no early focal state → fail opening coverage;
2. frame-start static focal through `18.260s` → pass opening coverage;
3. early focal exits at `6s`, next begins at `18.260s` → fail middle coverage;
4. final state ends before frame end → fail ending coverage.

Retain the existing golden case where speech and first state both begin at `2.95s` after unvoiced silence. It proves the algorithm is speech-relative rather than frame-zero-relative.

### Golden and release evidence

Update as required:

- `test/golden/fixtures/visual-timing-sync/**`;
- `test/golden/golden.test.ts`;
- `test/visual/composed-visual-integrity.test.ts`;
- `test/release/harness.ts`;
- `test/release/manifest.ts`;
- `public-snapshot.json` only for intended public changes;
- `test/ci/public-snapshot.test.ts`; and
- package tests proving runtime helpers and standards ship.

Superpowers documents remain internal and must not enter packed/public artifacts.

### Verification commands

Use the repository's actual scripts at implementation time. Expected final gates include:

```bash
corepack npm run typecheck
corepack npm test
corepack npm run check:skill-references
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Run focused tests first during implementation, then the full gates before completion.

## Rollout

### Phase 1 — Standards and neutral contract

- Add the continuous-coverage invariant to canonical standards.
- Add v2 authored/resolved types and configuration.
- Implement v1/v2 validation and compatibility defaults.
- Add state and exemption resolution tests.

### Phase 2 — Neutral verification

- Implement required intervals, observed interval union, subtraction, classification, and exemptions.
- Preserve existing visual-sync checks.
- Add the synthetic opening/middle/ending regression matrix.

### Phase 3 — HyperFrames evidence and runtime

- Add static semantic states, planned retention, owned exits, and manifest v2.
- Update template and framework standard.
- Add deterministic seek and snapshot evidence.

### Phase 4 — Remotion parity

- Add v2 registry, state/reveal components, planned retention, owned exits, and manifest v2.
- Prove equivalent neutral verification outcomes.

### Phase 5 — Scaffold, skill, and documentation propagation

- Enable v2 required coverage in new scaffolds.
- Update `skill/md2vid/SKILL.md` and public README.
- Regenerate bundled standards.
- Add migration guidance and project-standard refresh behavior.

### Phase 6 — Compatibility adoption

- Existing v1 projects receive warnings.
- Projects migrate to v2 and verify in warn mode.
- Projects switch to required coverage after resolving findings.
- Evaluate removal or tightening of legacy warnings only in a separately approved compatibility change.

### Final state

```text
Narration words ───────────────┐
Storyboard semantic states ────┼──→ visual_beats v2
Frame timing ──────────────────┘            ↓
                                      neutral intervals
                                             ↓
                          ┌──────────────────┴──────────────────┐
                          ↓                                     ↓
                  HyperFrames evidence                  Remotion evidence
                          └──────────────────┬──────────────────┘
                                             ↓
                                  continuous verifier
                         ┌───────────┬───────────┬───────────┐
                         ↓           ↓           ↓           ↓
                      opening      middle      ending    exemptions
                       checks      checks      checks       report
                                             ↓
                               manual semantic review
                                             ↓
                                    preview and render
```

The result is a whole-video guarantee: narration never continues through an unapproved semantic visual vacuum, while deliberate static explanatory visuals remain fully valid.
