# Visual Timing Synchronization — Design

## Table of Contents

- [Context and Direction](#context-and-direction)
- [Architecture](#architecture)
- [Artifact and Type Contracts](#artifact-and-type-contracts)
- [Cue Resolution](#cue-resolution)
- [Planning and Build Flow](#planning-and-build-flow)
- [Framework Binding Contracts](#framework-binding-contracts)
- [Verification](#verification)
- [Render FPS Policy](#render-fps-policy)
- [Error Handling](#error-handling)
- [Compatibility and Migration](#compatibility-and-migration)
- [Implementation Shape](#implementation-shape)
- [Testing and Evidence](#testing-and-evidence)
- [Rollout](#rollout)

## Context and Direction

**Problem** — md2vid synchronizes narration and captions from transcript words but leaves semantic visual timing inside unconstrained framework code. A workflow frame can reveal every step before narration reaches later steps, and current verification cannot detect it.

**Confirmed output behavior** — the inspected video used fixed visual reveals at `1.5`, `3.7`, and `5.9` seconds for every frame, while some corresponding narration cues occurred 7–11 seconds later. Its final MP4 was also explicitly rendered at 12 FPS, which explains visibly stepped motion.

**Selected direction** — add a neutral authored visual-beat specification, resolve its cue anchors against transcript words during planning, expose resolved beats through the shared build plan, bind framework visuals to stable beat IDs, and verify the resulting contract before rendering.

**Non-direction** — do not repair generated prepaid-ledger files, parse arbitrary animation source, or redesign caption rendering without profiling evidence.

## Architecture

### Current state

```text
SCRIPT + audio
      ↓
audio_meta.json
      ↓
engine.plan()
      ├──→ frame timing
      ├──→ cues.json
      ├──→ caption_groups.json
      └──→ build_plan.json
                 ↓
            adapter.emit()
                 ├──→ audio mounts
                 ├──→ caption mounts
                 └──→ authored visual frame unchanged
                            ↓
                    arbitrary animation offsets
```

The neutral plan does not know which visual represents which narrated concept.

### Expected state

```text
SCRIPT + audio + visual_beats.json
                ↓
          engine.plan()
                ├── resolve phrase/index anchors against transcript words
                ├── validate workflow order and beat uniqueness
                └── emit PlanFrame.visualBeats[]
                              ↓
                     adapter.prepare/emit
                       ├── HyperFrames beat runtime + binding manifest
                       └── Remotion beat helpers + binding manifest
                              ↓
                         verify()
                       ├── cue coverage
                       ├── reveal tolerance
                       ├── workflow order
                       ├── landing interval
                       └── duration agreement
                              ↓
                    final-render FPS preflight
```

### Responsibility boundaries

| Layer | Owns | Does not own |
|---|---|---|
| Author/agent | Source coverage, beat IDs, semantic cue anchors, visual treatment | Numeric reveal timestamps |
| Neutral engine | Anchor resolution, resolved beat timing, workflow order validation | Framework animation implementation |
| Framework adapter | Beat access, standard reveal tokens, binding evidence | Independent transcript matching |
| Verifier | Contract completeness and objective timing checks | Subjective creative quality |
| Render wrapper | Effective FPS policy and render evidence | Animation semantics |

## Artifact and Type Contracts

### Authored `visual_beats.json`

The file lives beside `video.config.json` and `audio_meta.json` in the neutral root.

```json
{
  "version": 1,
  "frames": {
    "reserve-flow": {
      "kind": "workflow",
      "beats": [
        {
          "id": "reserve",
          "text": "Reserve value before external work",
          "cue": { "phrase": "First reserve the value", "occurrence": 1 },
          "sourceRefs": ["01-prepaid-ledger-and-reservations.md:322-326"],
          "workflowStep": 1
        },
        {
          "id": "execute",
          "text": "Execute the external operation",
          "cue": { "phrase": "execute the operation", "occurrence": 1 },
          "sourceRefs": ["01-prepaid-ledger-and-reservations.md:327-331"],
          "workflowStep": 2
        },
        {
          "id": "settle",
          "text": "Settle or release from evidence",
          "cue": { "wordIndex": 43 },
          "sourceRefs": ["01-prepaid-ledger-and-reservations.md:332-339"],
          "workflowStep": 3
        }
      ]
    }
  }
}
```

Frame keys use the existing neutral frame slug. Beat IDs must be unique within a frame; the generated globally stable identity is `<frame-slug>:<beat-id>`.

### Authored types

Add neutral input types without coupling them to either framework:

```ts
export type VisualCueAnchor =
  | { wordIndex: number }
  | { phrase: string; occurrence: number };

export interface AuthoredVisualBeat {
  id: string;
  text: string;
  cue: VisualCueAnchor;
  sourceRefs?: string[];
  workflowStep?: number;
  tolerance?: Partial<VisualBeatTolerance>;
}

export interface AuthoredVisualFrame {
  kind?: "focal" | "workflow" | "comparison" | "sequence";
  beats: AuthoredVisualBeat[];
}

export interface VisualBeatSpec {
  version: 1;
  frames: Record<string, AuthoredVisualFrame>;
}
```

### Resolved plan types

Extend `PlanFrame` additively so old plans and adapters remain valid:

```ts
export interface VisualBeatTolerance {
  maxLead: number;
  maxLag: number;
}

export interface ResolvedVisualBeat {
  id: string;
  text: string;
  start: number;            // frame-local seconds
  end?: number;             // optional semantic interval
  cueWordIndex: number;
  cueText: string;
  sourceRefs: string[];
  workflowStep?: number;
  tolerance: VisualBeatTolerance;
}

export interface PlanFrame {
  id: string;
  frameNum: number;
  slug: string;
  voicePath: string;
  voiceDur: number;
  frameDur: number;
  start: number;
  words: Word[];
  visualKind?: AuthoredVisualFrame["kind"];
  visualBeats?: ResolvedVisualBeat[];
}
```

`BuildPlan.version` remains `1` for this additive release. A future incompatible change may introduce version `2`; optional fields alone do not require it.

### Generated artifacts

`md2vid plan` and `md2vid build` write:

- `cues.json` — existing word-oriented cue artifact, extended with visual beat references where useful;
- `build/build_plan.json` — authoritative resolved plan;
- `build/visual_timing.json` — compact author-facing projection of frame-local beats;
- framework-specific generated timing/binding artifacts during emit.

Example `build/visual_timing.json`:

```json
{
  "version": 1,
  "frames": {
    "reserve-flow": {
      "duration": 18.42,
      "beats": [
        { "id": "reserve", "start": 2.95, "workflowStep": 1 },
        { "id": "execute", "start": 11.06, "workflowStep": 2 },
        { "id": "settle", "start": 14.35, "workflowStep": 3 }
      ]
    }
  }
}
```

This projection is generated evidence, not a second timing authority.

## Cue Resolution

### Normalization

Phrase matching uses deterministic transcript normalization:

1. Unicode normalize to NFKC.
2. Lowercase with locale-independent behavior.
3. Convert typographic apostrophes and dashes to canonical forms.
4. Remove punctuation that does not affect token identity.
5. Collapse whitespace.
6. Compare token sequences, not raw string offsets.

The planner retains original transcript text in diagnostics and generated output.

### Word-index anchors

`wordIndex` is zero-based within the frame's `words[]` array. Resolution fails if:

- the index is not an integer;
- it is outside `0..words.length - 1`; or
- the referenced word has invalid timing.

The beat start equals the referenced word's local `start`.

### Phrase anchors

The planner finds every normalized token-sequence match in the frame transcript. `occurrence` is one-based.

```text
0 matches       → error: cue phrase not found
1 match         → occurrence must be 1
N matches       → occurrence selects 1..N; missing/out-of-range is an error
```

The beat start equals the first word's local `start`. Generated output records the first word index and the original matched text.

### Validation

Within each frame:

- beat IDs are unique;
- resolved starts are finite and within voice duration;
- workflow steps are positive consecutive integers beginning at 1;
- workflow starts are monotonic by step;
- source references are retained but not interpreted by the timing engine.

A workflow may intentionally group source steps into one visual beat, but the authored spec must represent that grouping explicitly through shared source references rather than silently dropping steps.

## Planning and Build Flow

### New command

Add:

```text
Usage: md2vid plan <video-dir>
```

`md2vid plan` performs neutral work only:

```text
resolve project layout
  → load video.config.json
  → load + validate audio_meta.json/WAV metadata
  → optionally load visual_beats.json
  → engine.plan()
  → write neutral plan artifacts transactionally
  → stop
```

It must not:

- call a framework emitter;
- copy voice assets;
- modify authored frames/scenes;
- write emitted `index.html`, caption HTML, or Remotion runtime files.

### Build reuse

`md2vid build` calls the same planner function and then emits framework output:

```ts
const planResult = await createPlan(inputs);
await writeNeutralPlan(planResult);
await adapter.emit(planResult.plan, ...);
```

There must be one cue resolver and one plan serializer, not parallel implementations for `plan` and `build`.

If neutral inputs have not changed, `md2vid plan` and `md2vid build` produce byte-equivalent resolved beat data.

Planning uses the neutral `video.config.json` only. Output-local configuration may supply framework and render settings, but it must not override timing, canvas, slugs, `visualSync`, or other neutral planning inputs. This prevents HyperFrames and Remotion builds from producing different plans for one canonical shared directory.

`md2vid regroup` must preserve the same visual-aware plan. It may call the shared planner or update caption groups on the validated existing neutral plan, but it must not recompute a legacy two-argument plan that strips `visualKind` or `visualBeats` from Remotion output.

### Updated authoring flow

```text
1. Scaffold
2. Storyboard + script
3. Generate narration and word timings
4. Author visual_beats.json
5. Run npm run plan
6. Author visuals against resolved beat IDs
7. Run npm run build
8. Run npm run check
9. Preview
10. Render
```

New scaffolds add:

```json
{
  "scripts": {
    "plan": "md2vid plan ."
  }
}
```

## Framework Binding Contracts

### Shared binding evidence

Verification must not parse arbitrary GSAP or React code. Each adapter produces a binding manifest with observed reveal timing:

```ts
export interface VisualBinding {
  frameSlug: string;
  beatId: string;
  target: string;
  revealStart: number;
  revealDuration: number;
  source: "declarative" | "custom";
}

export interface VisualBindingManifest {
  version: 1;
  framework: string;
  bindings: VisualBinding[];
}
```

Each adapter writes its normalized manifest to the output-local `build/visual_bindings.json`, and verification compares it with `PlanFrame.visualBeats`. Full builds must list this path as an always-replaced managed generated artifact; it must not rely on the existing "copy only when missing" runtime-file promotion path, which would leave stale binding evidence after later builds.

### HyperFrames declarative path

The recommended path uses beat IDs and animation tokens:

```html
<li
  id="reserve-step"
  data-md2vid-beat="reserve"
  data-md2vid-enter="rise"
  data-md2vid-duration="0.48"
>
  Reserve value
</li>
```

Supported initial tokens should remain small and deterministic:

| Token | Behavior |
|---|---|
| `fade` | opacity `0 → 1` |
| `rise` | opacity `0 → 1`, positive Y `→ 0` |
| `slide-left` | opacity `0 → 1`, positive X `→ 0` |
| `scale` | opacity `0 → 1`, scale below `1 → 1` |
| `none` | visibility switches at the cue without tweening |

During preparation/emission, the adapter:

1. reads resolved beats for the frame;
2. finds declarative targets in the authored template;
3. generates a paused, seek-safe GSAP timeline using resolved times;
4. composes it with the frame's custom registered timeline; and
5. records each generated binding in the manifest.

Declarative timing remains generated. Authored HTML contains no copied timestamp.

### HyperFrames custom path

Custom motion uses a machine-readable declaration plus an injected helper that **owns scheduling**. The declaration lets build/verify produce evidence without executing arbitrary authored JavaScript:

```html
<script type="application/json" data-md2vid-custom-bindings>
{
  "bindings": [
    { "beat": "execute", "target": "#execute-step", "method": "from", "duration": 0.7 }
  ]
}
</script>
```

Authored code consumes that declared binding through the owned helper:

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

Preflight validates the declaration against planned beats and emits normalized binding evidence. At runtime, `timing.from()` requires the matching declared beat/target/method, schedules the tween at its frame-local start, and checks that the runtime duration matches the declaration. Equivalent owned helpers may cover `fromTo`, `set`, or adapter-approved custom factories, but no supported custom path returns a numeric semantic timestamp for freehand reuse.

The helper throws for unknown or duplicate beat bindings in strict mode. Helper data must be embedded during emission; authored compositions must not fetch timing JSON at runtime. Cue-bound custom motion is reviewed through the composed project after build; authored source remains unchanged and directly inspectable, but does not receive a separate output-local timing bootstrap from `md2vid plan`.

### Timeline composition

HyperFrames retains one paused registered timeline per composition. The adapter may use one of two safe shapes:

```text
framework timeline ─┐
custom timeline ─────┴─→ parent paused timeline → window.__timelines[slug]
```

or inject generated cue tweens into an existing registered timeline through an adapter-owned preparation hook. The chosen implementation must preserve current single-timeline seek semantics and avoid duplicate registration.

### Remotion path

Generated plan data already reaches Remotion output. Remotion uses a **static binding registry** so `md2vid verify` can validate bindings without compiling or executing arbitrary scene JSX.

Each Remotion output authors a pure-data `visual_bindings.json` that md2vid can read without compiling scene code:

```json
{
  "version": 1,
  "frames": {
    "reserve-flow": [
      { "beat": "reserve", "target": "WorkflowStep:reserve", "enter": "rise", "duration": 0.5 },
      { "beat": "execute", "target": "WorkflowStep:execute", "enter": "rise", "duration": 0.5 },
      { "beat": "settle", "target": "WorkflowStep:settle", "enter": "rise", "duration": 0.5 }
    ]
  }
}
```

The adapter validates this registry, writes normalized binding evidence, and embeds the normalized bindings into the output-local generated plan consumed by the Remotion template. The scene and standard component consume that same generated data:

```tsx
<VisualBeatProvider frame={frame}>
  <BeatReveal target="WorkflowStep:execute">
    <WorkflowStep>Execute operation</WorkflowStep>
  </BeatReveal>
</VisualBeatProvider>
```

`BeatReveal` resolves the target's registered beat, converts seconds to frames using the active composition FPS, owns the standard reveal interpolation, and rejects unknown targets. Custom interpolation must use an owned helper that consumes a registry entry and applies the interpolation from its resolved start frame; it must not accept an independently copied numeric semantic offset.

The adapter does not parse arbitrary TypeScript or require Chromium during normal `md2vid verify`.

The exact React names may follow existing template conventions, but the static registry, neutral beat IDs, owned scheduling, and pre-render verifiability are required.

## Verification

### Verification input

Change adapter verification from file-layout-only context to include the neutral plan and optional binding manifest:

```ts
export interface AdapterVerifyContext {
  plan: BuildPlan;
  videoDir: string;
  sharedDir: string;
  bindings?: VisualBindingManifest;
  voiceSnapshots?: VoiceAssetSnapshot[];
}
```

Existing layout checks remain intact.

### Semantic checks

For each frame with `visualBeats`:

1. **Known beats** — every binding references a planned beat.
2. **Coverage** — every planned beat has at least one binding.
3. **Uniqueness** — duplicate bindings are allowed only when explicitly configured for coordinated targets.
4. **Timing tolerance** — compare `binding.revealStart` with `beat.start`.
5. **Workflow order** — minimum reveal time for step `N+1` is not earlier than step `N`.
6. **Front-loading** — later steps cannot all reveal before their cue windows.
7. **Landing** — the latest reveal completion leaves the configured minimum interval before local `voiceDur`. Silent gap and outgoing crossfade time do not excuse a reveal that runs through narration completion.
8. **Duration agreement** — authored HyperFrames root duration and Remotion semantic scene duration match `voiceDur` within frame quantization tolerance; emitted outer host/sequence duration independently matches `frameDur`.

### Default timing policy

Add configuration under `video.config.json`:

```json
{
  "visualSync": {
    "mode": "required",
    "maxLead": 0.25,
    "maxLag": 0.75,
    "minLanding": 1.0
  }
}
```

Modes:

| Mode | Behavior |
|---|---|
| `off` | Do not load or verify visual beats |
| `warn` | Resolve and report semantic findings as warnings |
| `required` | Missing specification/bindings and timing violations are errors |

New scaffolds use `required`. Existing projects with no setting behave as `warn` for compatibility.

Per-beat tolerances may narrow or widen defaults when narration structure requires it. Overrides remain visible in the authored neutral spec and generated plan.

### Diagnostics

A timing failure is quantitative:

```text
ERROR [visual-sync] frame "reserve-flow", beat "execute", target "#execute-step":
reveal starts at 3.700s; narration cue starts at 11.060s;
lead is 7.360s, exceeding maxLead 0.250s.
```

A coverage failure identifies the missing contract:

```text
ERROR [visual-sync] frame "reserve-flow", beat "settle":
planned narration beat has no visual binding.
Add data-md2vid-beat="settle" or bind it through the framework helper.
```

### Manual review boundary

Machine verification can enforce timing and coverage. It still cannot decide whether:

- the visual treatment explains the concept well;
- the composition has a strong focal hierarchy;
- grouped source steps preserve enough detail; or
- typography and motion feel polished.

The standards keep those as review requirements without using them as a reason to omit objective timing checks.

## Render FPS Policy

### Configuration

Add render policy to framework output configuration:

```json
{
  "render": {
    "profile": "final",
    "fps": 30,
    "minimumFinalFps": 24
  }
}
```

Profiles:

| Profile | Default FPS | Minimum policy |
|---|---:|---:|
| `final` | 30 | 24 |
| `draft` | 15 | none |
| `gif` | adapter-defined | none |

### Preflight

The md2vid HyperFrames proxy determines the policy profile in this order:

```text
explicit --profile final|draft|gif
  → output.config.json render.profile
  → final
```

`--profile` is an md2vid policy flag and is consumed before forwarding. HyperFrames `--quality` remains an independent encoding-quality option and does not select the FPS profile.

Effective FPS resolves independently:

```text
explicit --fps
  → output.config.json render.fps
  → composition data-fps
  → 30
```

Thirty FPS is the default for every final render. For final MP4/MOV, values below `minimumFinalFps` fail before browser capture unless `--allow-low-fps` is present. Draft and GIF profiles allow intentionally lower frame rates.

`--allow-low-fps` is consumed by md2vid and is not forwarded to HyperFrames.

### Evidence

Write a render manifest beside the output when the proxy can determine the output path:

```json
{
  "version": 1,
  "profile": "final",
  "fps": 30,
  "minimumFps": 24,
  "lowFpsOverride": false
}
```

A post-render probe may be added when the existing runtime exposes ffprobe reliably, but preflight enforcement is the required first implementation. The design must not add a new system dependency solely for this check.

## Error Handling

### Planning errors

Planning is transactional. Invalid visual beats produce no partially updated neutral artifacts.

| Failure | Result |
|---|---|
| Missing `visual_beats.json` in legacy/warn mode | Continue with one warning |
| Missing file in required mode | Fail before write |
| Unknown frame slug | Fail with valid slugs |
| Duplicate beat ID | Fail with both locations |
| Missing/ambiguous cue | Fail with transcript context and candidate matches |
| Invalid workflow steps | Fail with observed step sequence |
| Beat outside voice duration | Fail with resolved time and duration |

### Framework errors

| Failure | Result |
|---|---|
| Unknown `data-md2vid-beat` | Build/verify error |
| Planned beat has no target | Verify error in required mode |
| Helper called before timing injection | Clear framework contract error |
| Duplicate custom binding | Error unless coordinated targets are explicitly allowed |
| Binding manifest missing | Error in required mode; warning in warn mode |

### Render errors

A low-FPS failure must not start capture:

```text
FAIL [render-fps] effective final-render FPS is 12; minimum is 24.
Use 30 FPS, select the draft profile, or pass --allow-low-fps intentionally.
```

## Compatibility and Migration

### Legacy projects

Projects without visual beat metadata retain current output behavior:

```text
no visual_beats.json
  + no visualSync.mode
      ↓
legacy warn mode
      ↓
current build and authored timelines remain valid
```

No existing frame source is rewritten. No semantic binding manifest is required until the project opts in.

### New projects

New scaffolds include:

- `visual_beats.json.example`;
- `npm run plan`;
- `visualSync.mode: "required"`;
- one HyperFrames declarative example;
- one framework-specific custom example or reference;
- render profile defaults at 30 FPS.

### Migration path

```text
1. Generate/author visual_beats.json
2. Run npm run plan
3. Replace numeric reveal offsets with beat bindings
4. Run npm run check in warn mode
5. Resolve findings
6. Switch visualSync.mode to required
```

### Multi-framework projects

`visual_beats.json` belongs in the shared neutral directory. Each adapter emits its own binding manifest and verifies against the same resolved beats.

The visual target names may differ by framework; beat IDs and cue times must not.

## Implementation Shape

### Expected file areas

| Area | Expected responsibility |
|---|---|
| `engine/types.ts` | Authored/resolved visual beat types and additive `PlanFrame` fields |
| `engine/visual_beats.ts` | Load, validate, normalize, and resolve cue anchors |
| `engine/plan.ts` | Attach resolved beats to frames |
| `engine/config.ts` or current config loader | `visualSync` defaults and validation |
| `scripts/plan.ts` | Plan-only orchestration and transactional writes |
| `scripts/plan_project.ts` | Shared project planning, neutral serialization, and transactional promotion used by plan/build/regroup/verify |
| `scripts/build.ts` | Reuse shared planning orchestration before adapter emit and always promote generated binding manifests |
| `scripts/regroup.ts` | Preserve visual beat fields while updating caption groups and output-local plans |
| `scripts/verify.ts` | Re-plan current neutral inputs and pass plan-aware context to adapters |
| `bin/md2vid.ts` | Route and document `plan` command |
| `frameworks/types.ts` or adapter contract | Plan-aware verification and binding-manifest types |
| `frameworks/hyperframes/*` | Timing injection, declarative bindings, helper, manifest, verifier |
| Remotion adapter/runtime files | Beat helper/component and manifest/test integration |
| `scripts/hyperframes_cli.ts` | Effective FPS preflight and override handling |
| `scripts/scaffold_project.ts` | Add the common `plan` script, neutral visual-sync defaults, and visual-beat example artifact |
| `frameworks/hyperframes/scaffold.ts` | Add final-render defaults and cue-first HyperFrames next steps |
| `frameworks/remotion/scaffold.ts` | Add cue-first Remotion next steps and framework render defaults where applicable |
| `skill/md2vid/SKILL.md` | Cue-first authoring order, semantic binding workflow, render policy, and updated hard gates |
| `README.md` | Public `md2vid plan`, visual beat, migration, and FPS policy documentation |
| `examples/hash-table/remotion/` | Replace hardcoded semantic cue arrays with the static Remotion binding registry and document the example |
| `test/golden/fixtures/visual-timing-sync/` | Add a dedicated 3s/11s/14s semantic timing fixture without rewriting legacy golden expectations |
| `test/release/harness.ts` | Exercise required-mode scaffolds, cue bindings, plan flow, and explicit low-FPS smoke-render intent |
| Canonical and bundled standards listed below | Semantic timing, framework bindings, workflow-step requirements, and synchronized skill copies |

Exact module names for new engine/runtime code may follow existing boundaries, but every existing standards, skill, scaffold, synchronization, and test file in the matrix below is an explicit implementation target.

### Standards, skill, and scaffold file matrix

The canonical standards under `docs/standards/` are the source of truth. `scripts/skill_references.ts:24-32` maps those files into `skill/md2vid/references/standards/`, and `scripts/scaffold_project.ts:78-85` copies the selected canonical framework standard into each generated project's `.md2vid/standards/<framework>.md`.

#### Canonical standards and bundled skill copies

| Canonical source to edit | Required change | Bundled skill copy regenerated by `npm run sync:skill-references` |
|---|---|---|
| `docs/standards/video-generation.md` | Replace prose-only cue guidance with the required `visual_beats.json → md2vid plan → cue-bound authoring` sequence; add semantic verification and final-render FPS gates | `skill/md2vid/references/standards/video-generation.md` |
| `docs/standards/design/frame.md` | Require every narrated node, row, card, code line, and workflow station to bind to a planned beat ID; prohibit copied numeric semantic offsets and front-loaded workflow reveals | `skill/md2vid/references/standards/design/frame.md` |
| `docs/standards/design/knowledge-expression.md` | Define ordered beat coverage for Flow, Enumerate, Matrix, and other multi-item treatments; require explicit grouping when multiple source steps share one visual beat | `skill/md2vid/references/standards/design/knowledge-expression.md` |
| `docs/standards/frameworks/hyperframes.md` | Document `data-md2vid-beat`, supported entrance tokens, the custom timing helper, binding-manifest behavior, seek safety, duration checks, and low-FPS render policy | `skill/md2vid/references/standards/frameworks/hyperframes.md` |
| `docs/standards/frameworks/remotion.md` | Document neutral beat access, `BeatReveal`/custom binding behavior, seconds-to-frames conversion, duration checks, and render FPS expectations | `skill/md2vid/references/standards/frameworks/remotion.md` |

The following synchronized standards are not expected to need semantic changes for this fix:

| Canonical source retained | Bundled copy still checked for equality |
|---|---|
| `docs/standards/git.md` | `skill/md2vid/references/standards/git.md` |
| `docs/standards/design/frame-content.md` | `skill/md2vid/references/standards/design/frame-content.md` |

`npm run sync:skill-references` rewrites the complete bundled references tree, including unchanged pairs. `npm run check:skill-references` or the current equivalent must prove byte equality before completion.

#### Skill workflow

| File | Exact instruction changes |
|---|---|
| `skill/md2vid/SKILL.md` | Add `visual_beats.json` to neutral authoring artifacts; move `npm run transcribe` before semantic timing authoring; require `npm run plan` before framework visuals; document declarative/custom beat bindings; redefine the expression-triad gate as machine-verified timing plus manual treatment review; document final versus draft FPS policy |

The skill must stop saying that machine checks cannot judge focal timing without qualification. Machine checks will enforce declared beat coverage, reveal timing, order, landing, and duration; manual review remains responsible for source interpretation, treatment quality, hierarchy, and polish.

#### Scaffold and generated-project propagation

| Source file | Exact generated-project effect |
|---|---|
| `scripts/scaffold_project.ts` | Add `plan: "md2vid plan ."` to common package scripts; add neutral `visualSync` defaults; write `visual_beats.json.example`; continue copying `docs/standards/frameworks/<framework>.md` into `.md2vid/standards/<framework>.md` |
| `frameworks/hyperframes/scaffold.ts` | Add `render.profile: "final"`, `render.fps: 30`, and `render.minimumFinalFps: 24` to HyperFrames output config; change next steps to transcription → beat plan → visual authoring → build/check |
| `frameworks/remotion/scaffold.ts` | Add corresponding render defaults if Remotion output config owns them; change next steps to transcription → beat plan → visual authoring → build/check |
| `docs/standards/frameworks/hyperframes.md` | Becomes generated `.md2vid/standards/hyperframes.md` through `scripts/scaffold_project.ts`; no separate generated template may drift from it |
| `docs/standards/frameworks/remotion.md` | Becomes generated `.md2vid/standards/remotion.md` through `scripts/scaffold_project.ts`; no separate generated template may drift from it |

#### Synchronization and regression tests

| File | Required coverage/update |
|---|---|
| `scripts/skill_references.ts` | Keep the canonical-to-bundled mapping authoritative; change only if a new standard file is introduced rather than editing an existing mapped file |
| `test/cli/skill-references.test.ts` | Assert updated timing and framework guidance exists in both canonical sources and bundled copies, and that copies remain equal |
| `test/cli/skill-commands.test.ts` | Assert installed-skill guidance uses `.md2vid/standards/<framework>.md` and includes the cue-first workflow without repository-only paths |
| `test/cli/scaffold-project.test.ts` | Assert the plan script, visual-sync defaults, beat example, and copied framework standard are present in generated projects |
| `test/cli/scaffold-decoupled.test.ts` | Assert generated projects remain runnable without repository source paths after the new plan/binding artifacts are added |
| `test/scaffold.test.ts` | Assert framework scaffold next steps and generated standard imports remain correct |
| `test/docs-boundary.test.ts` | Preserve the canonical framework-doc boundary under `docs/standards/frameworks/` |
| `scripts/public_snapshot.ts` and the tracked public snapshot artifact | Include intended new public files or content changes and reject accidental additions |
| `test/ci/public-snapshot.test.ts` | Verify the updated public source inventory and generated snapshot behavior |
| `test/cli/pack.test.ts` and `test/release/manifest.ts` | Confirm all canonical standards, bundled references, examples, and runtime helpers required by consumers ship in the package |

### Generated versus authored files

```text
Authored:
  STORYBOARD.md
  SCRIPT.md
  visual_beats.json
  compositions/frames/*.html or Remotion scenes

Generated:
  cues.json
  caption_groups.json
  build/build_plan.json
  build/visual_timing.json
  framework binding manifest
  emitted index/runtime files
```

Build may regenerate only the generated set.

## Testing and Evidence

### Engine unit tests

Add tests for:

- exact word-index resolution;
- phrase normalization;
- multiple phrase occurrences;
- missing and ambiguous phrases;
- duplicate beat IDs;
- unknown frame slugs;
- workflow sequence validation;
- default and per-beat tolerances;
- additive plan serialization with and without beats;
- byte-stable plan/build resolution for unchanged inputs.

### CLI tests

Cover:

```text
md2vid plan <dir>
md2vid plan --help
md2vid plan <dir> <extra>        → usage error
```

Verify that plan-only mode does not call adapter emission or modify authored files.

### HyperFrames tests

- Declarative target produces a GSAP reveal at the resolved cue.
- Custom helper returns the resolved timestamp and records binding evidence.
- Unknown beat binding fails.
- Direct seek and sequential playback match before, during, and after every reveal.
- Existing non-beat frame emission remains unchanged in legacy mode.
- Root duration mismatch is reported.

### Remotion tests

- Beat helper converts seconds to frames using composition FPS.
- Standard reveal component begins at the resolved frame.
- Custom binding uses the same neutral beat.
- Legacy scenes remain buildable.

### Semantic verifier fixtures

Create a fixture with narration cues at approximately `3s`, `11s`, and `14s`:

| Fixture | Expected result |
|---|---|
| Reveals at cue times | Pass |
| Reveals at `1.5/3.7/5.9` | Fail with lead deltas |
| Missing final step | Fail coverage |
| Reversed steps | Fail workflow order |
| Unknown beat target | Fail reference check |
| Final reveal at frame end | Fail landing interval |

### FPS tests

- Final default resolves to 30 FPS.
- Explicit final `--fps 12` fails before invoking HyperFrames.
- `--fps 12 --allow-low-fps` proceeds and records the override.
- Draft 12 FPS proceeds without the final-profile error.
- Explicit 24, 30, and 60 FPS proceed.

### Regression gates

Run the repository's existing focused and full gates, including:

```bash
corepack npm run typecheck
corepack npm test
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Use the actual script names available at implementation time if they differ. Update the public snapshot only when the intended public artifact set changes.

### Performance evidence boundary

Do not claim caption virtualization or general animation optimization as part of this fix. If Studio remains slow at 30 FPS with semantic timing corrected, capture:

- Chrome Performance traces for seek and playback;
- caption request counts;
- scripting/layout/paint totals; and
- embedded versus external composition startup measurements.

That evidence should drive a separate caption/runtime performance design.

## Rollout

### Phase 1 — Neutral contract and plan-only flow

- Add authored/resolved beat types.
- Implement deterministic cue resolution.
- Add `md2vid plan`.
- Extend plan artifacts additively.
- Update neutral tests.

### Phase 2 — HyperFrames bindings and verification

- Add timing injection and declarative tokens.
- Add custom binding helper and manifest.
- Make verifier plan-aware.
- Add semantic and seek-determinism fixtures.

### Phase 3 — Remotion parity

- Add beat access/component helpers.
- Add binding evidence and parity tests.

### Phase 4 — Render policy and scaffolds

- Add FPS preflight and explicit override.
- Update output configuration, scaffolds, skill, and standards.
- Add migration documentation.

### Phase 5 — Adoption

- Existing projects default to warning mode.
- New projects default to required mode.
- After one compatibility window, evaluate whether projects that contain `visual_beats.json` should implicitly require complete bindings.

### Final state

```text
Narration words ─┬──→ captions
                 └──→ resolved semantic beats
                            ├──→ HyperFrames targets
                            └──→ Remotion targets
                                      ↓
                              semantic verifier
                                      ↓
                           final FPS preflight
                                      ↓
                              smooth, synchronized render
```
