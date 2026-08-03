# Continuous Semantic Visual Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make md2vid reject every unapproved semantic visual vacuum across narrated frames—from the first spoken word through the held landing—while allowing long static explanatory visuals and preserving framework-neutral timing authority.

**Architecture:** Extend `visual_beats.json` to a versioned v2 interval contract while retaining v1 compatibility, resolve focal-state coverage in the neutral plan, and verify the union of observed framework visibility intervals against each frame's required interval. HyperFrames and Remotion keep framework-owned seek-safe visibility, emit normalized manifest-v2 evidence with plan/source digests, and share one neutral verifier. New scaffolds require coverage; legacy projects warn until migrated.

**Tech Stack:** TypeScript, Node.js built-in test runner, deterministic JSON artifacts, SHA-256 input snapshots, transactional filesystem promotion, HyperFrames/GSAP, React/Remotion, npm package/snapshot/release tooling.

---

## Source Artifacts

- Requirements: `docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-requirements.md`
- Design: `docs/superpowers/active/2026-08-03-continuous-semantic-visual-coverage/2026-08-03-continuous-semantic-visual-coverage-design.md`
- Canonical standards:
  - `docs/standards/video-generation.md`
  - `docs/standards/design/frame.md`
  - `docs/standards/design/knowledge-expression.md`
  - `docs/standards/design/frame-content.md`
  - `docs/standards/frameworks/hyperframes.md`
  - `docs/standards/frameworks/remotion.md`
  - `docs/standards/git.md`

## Confirmed Implementation Decisions

- The serialized v2 frame property remains **`beats`**. Do not add `states` as an alias.
- v1 and v2 authored/resolved types remain explicit unions. v1 beats are not silently promoted to `role: "focal"`.
- `PlanFrame.visualSpecVersion` preserves authored v1/v2 provenance even when a v2 frame has no focal bindings; verification never infers version from a non-empty beat list.
- `{ frameStart: true }` resolves to local `0`; frame-start output omits `cueWordIndex` rather than serializing `null`.
- The required interval is `[first transcript word start, frame.frameDur]`.
- Only observed bindings whose planned role is `focal` contribute to coverage.
- `maxUncoveredGap` applies to opening, middle, and ending gaps. A complete-frame gap uses `opening_visual_gap` with `details.extendsThroughFrameEnd = true`.
- `Finding` gains optional `code` and `details` fields while retaining existing `level` and `msg` consumers.
- Reveal `mode` and `coverageMode` are independent. Planning is enabled when either is not `off`; complete opt-out requires both to be `off`.
- Strict continuous coverage requires v2. v1 projects remain reveal-verifiable and receive migration warnings under compatibility defaults.
- Canonical plan digests exclude captions and include only coverage-relevant frame/word/state/exemption data in deterministic key order.
- `FrameworkAdapter` gains one shared authored-input enumeration API used by both build and verify.
- HyperFrames freshness inputs are exactly the raw planned `compositions/frames/<slug>.html` files.
- Remotion freshness inputs are `visual_bindings.json` plus sorted authored `src/**/*.{ts,tsx,js,jsx}`, excluding generated output and dependencies.
- Captions-only build and regroup do **not** bless changed semantic inputs. They preserve the prior binding manifest; a later verify reports staleness until a full build regenerates semantic evidence.
- HyperFrames authored semantic duration remains `voiceDur`; the outer host remains `frameDur`. Final focal coverage through `frameDur` is evidence of owned host retention, not a generated inner-timeline hide at frame end.
- Remotion quantizes a shared state boundary once and reuses it as the prior end and next start, avoiding artificial frame gaps.
- Project-local framework standards gain a stable continuous-coverage contract marker. Missing/old markers produce an exact manual refresh instruction; no automatic overwrite command is introduced in this scope.
- Rendered pixel/freeze analysis remains warning-only evidence. Semantic truth comes from neutral plan plus manifest-v2 bindings.
- Do not modify the retained prepaid-ledger project.

## Part Plans

| Part | File | Scope | Depends on |
|---:|---|---|---|
| 1 | `2026-08-03-continuous-semantic-visual-coverage-plan-1.md` | Neutral policy/types, v2 parser/resolver, planning, and serialized coverage projection | None |
| 2 | `2026-08-03-continuous-semantic-visual-coverage-plan-2.md` | Interval verifier, manifest-v2 validation, canonical digests, freshness, and build/regroup lifecycle | Part 1 |
| 3 | `2026-08-03-continuous-semantic-visual-coverage-plan-3.md` | HyperFrames owned visibility, manifest-v2 evidence, freshness, and seek verification | Parts 1–2 |
| 4 | `2026-08-03-continuous-semantic-visual-coverage-plan-4.md` | Remotion registry/runtime parity, quantized intervals, manifest freshness, and verification | Parts 1–3 |
| 5 | `2026-08-03-continuous-semantic-visual-coverage-plan-5.md` | Scaffolds, standards, skill/README, golden/integration/browser/package/snapshot/release propagation | Parts 1–4 |

## Cross-Part Contracts

```text
visual_beats.json v2
       ↓ Part 1
resolved focal/supporting intervals + exemptions on PlanFrame
       ↓ Part 2
interval verifier + manifest-v2 parser + canonical plan/source freshness
       ↓ Part 3
HyperFrames owned visibility + raw authored HTML evidence
       ↓ Part 4
Remotion owned visibility + registry/source-tree evidence
       ↓ Part 5
new-scaffold enforcement + standards/skill/docs + shipped evidence
```

The following public names are fixed across parts:

```ts
VisualSyncMode
VisualCoverageMode
VisualSemanticRole
VisualCueAnchorV1
VisualCueAnchorV2
VisualCoverageEnd
VisualBeatSpecV1
VisualBeatSpecV2
ResolvedVisualBeatV1
ResolvedVisualStateV2
ResolvedCoverageExemption
ResolvedVisualSyncPolicy
VisualBindingV1
VisualBindingV2
VisualBindingManifestV1
VisualBindingManifestV2
VisualBindingInputDigest
VisualBindingEvidenceContext
```

The following generated paths are fixed:

```text
<shared>/build/build_plan.json
<shared>/build/visual_timing.json
<output>/build/visual_bindings.json
```

Manifest-v2 freshness fields are fixed:

```ts
planSha256: string;
authoredInputs: Array<{ path: string; sha256: string }>;
```

Framework adapters must enumerate the same normalized authored-input path set during build and verify.

## Plan-Level Sequencing

- Execute Parts 1–5 and Tasks 1–18 strictly in numeric order.
- Never run implementation writers concurrently.
- Coherent groups are marked in part plans. For each group: complete Mode A implementation, run one parallel read-only `spec-reviewer` + `code-quality-reviewer` + `tester` pass, resume the same implementer for Mode B remediation, then run one read-only verifier before the next scope.
- Preserve one focused conventional commit per task using the listed commit message.
- Run each task's focused red/green commands before committing.
- Do not begin framework work until the neutral manifest/digest contracts in Part 2 pass.
- Do not regenerate `public-snapshot.json` from a dirty implementation tree. The snapshot tool reads committed Git state; regenerate it only after the intended public changes are committed on the execution branch.
- Do not create the post-implementation check file until implementation and verification complete.

## Part Completion Gates

| Part | Required focused gate |
|---:|---|
| 1 | Config, v1/v2 parsing, interval resolution, plan serialization, plan CLI, and rollback tests pass |
| 2 | Whole-interval verifier, digest determinism, manifest parser, stale-evidence, build/regroup transaction, and workflow tests pass |
| 3 | HyperFrames declarative/custom/static visibility, manifest-v2, mutation freshness, direct/reverse seek, and adapter verification tests pass |
| 4 | Remotion registry v2, `BeatState`/`BeatReveal`, shared boundary quantization, source freshness, adapter verification, and template typecheck pass |
| 5 | Scaffold, standards/skill synchronization, README, golden, browser, pack, public snapshot, and release gates pass |

## Requirements Traceability

| Requirement | Implemented and proved by |
|---|---|
| FR-1 continuous frame coverage invariant | Tasks 3, 5, 9, 12 |
| FR-2 meaningful semantic visual state | Tasks 2, 3, 5, 9, 12, 16 |
| FR-3 versioned authored coverage contract | Tasks 1–3, 15 |
| FR-4 frame-start anchor | Tasks 2–3, 9, 12, 15 |
| FR-5 coverage resolution | Tasks 3–4 |
| FR-6 every narrated frame represented | Tasks 3–5, 15 |
| FR-7 normalized framework visibility evidence and freshness | Tasks 6–7, 9–10, 12, 14 |
| FR-8 HyperFrames coverage bindings | Tasks 9–11 |
| FR-9 Remotion coverage bindings | Tasks 12–14 |
| FR-10 whole-interval semantic verification | Task 5, reinforced by Tasks 10 and 14 |
| FR-11 gap classification and diagnostics | Task 5 |
| FR-12 configuration | Tasks 1, 15 |
| FR-13 explicit exemptions | Tasks 2–5, 16 |
| FR-14 manual-review boundary | Tasks 16–17 |
| FR-15 standards and skill propagation | Task 16 |
| FR-16 scaffold contract | Task 15 |
| FR-17 compatibility and migration | Tasks 1–8, 15–16 |
| FR-18 determinism and seeking | Tasks 9–14, 17 |
| FR-19 transactional behavior | Tasks 4, 7–8, 10, 14 |
| FR-20 regression and release evidence | Tasks 5, 8, 11, 14, 17–18 |

## Final Verification

Run after every task and review lifecycle is complete:

```bash
corepack npm run typecheck
corepack npm run typecheck:remotion
corepack npm test
corepack npm run check:skill-references
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected result: every command exits `0`; no stale manifest, skill-reference drift, scaffold mismatch, public-snapshot mismatch, packed-file omission, browser seek failure, or release-smoke failure remains.

## Completion Criteria

- Every requirement FR-1 through FR-20 has a completed task and passing evidence.
- A synthetic frame with speech at `0.070s`, first focal coverage at `18.260s`, and frame end at `23.080s` fails with `opening_visual_gap`.
- Six-second middle gaps and three-second ending gaps fail quantitatively.
- A static focal diagram may cover fifteen seconds without new motion and passes.
- Captions, shell, background, logo, and supporting-only targets never satisfy focal coverage automatically.
- HyperFrames and Remotion produce equivalent neutral coverage outcomes from the same v2 plan.
- Direct, reverse, and sequential seeks produce equivalent semantic visibility at activation and exit boundaries.
- Changed neutral plan inputs, changed framework source bytes, missing files, and newly relevant files invalidate manifest-v2 evidence.
- Captions-only operations never mark changed semantic evidence fresh.
- Existing v1 projects remain buildable in compatibility warning mode; new scaffolds require v2 coverage.
- Project-local standard marker diagnostics provide exact manual refresh instructions without overwriting user files.
- Canonical standards, bundled skill references, README, package contents, public snapshot, browser evidence, and release smoke match shipped behavior.
- No rendered-pixel heuristic becomes semantic truth, no transcript/audio clock changes, no automatic storyboard generation, and no ledger-specific implementation is added.
