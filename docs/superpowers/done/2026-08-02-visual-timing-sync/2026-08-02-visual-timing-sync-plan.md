# Visual Timing Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give md2vid one transcript-resolved semantic timing authority for narration, captions, and framework visuals, while preventing accidental low-FPS final renders.

**Architecture:** Add an optional neutral `visual_beats.json`, resolve cue anchors into additive `PlanFrame.visualBeats`, and share one transactional planner across `plan`, `build`, `regroup`, and `verify`. HyperFrames uses declarative or helper-owned scheduling; Remotion uses an output-local static binding registry and helper-owned components. Both emit normalized binding manifests for a framework-neutral semantic verifier. The HyperFrames proxy separately enforces an explicit final/draft/GIF render profile with a 30 FPS final default.

**Tech Stack:** TypeScript, Node.js built-in test runner, filesystem transactions, HyperFrames/GSAP, React/Remotion, JSON neutral artifacts, npm package/release tooling.

---

## Source Artifacts

- Requirements: `docs/superpowers/active/2026-08-02-visual-timing-sync/2026-08-02-visual-timing-sync-requirements.md`
- Design: `docs/superpowers/active/2026-08-02-visual-timing-sync/2026-08-02-visual-timing-sync-design.md`
- Canonical standards:
  - `docs/standards/video-generation.md`
  - `docs/standards/design/frame.md`
  - `docs/standards/design/knowledge-expression.md`
  - `docs/standards/design/frame-content.md`
  - `docs/standards/frameworks/hyperframes.md`
  - `docs/standards/frameworks/remotion.md`
  - `docs/standards/git.md`

## Confirmed Implementation Decisions

- Custom animation verification uses **framework-owned scheduling**. Supported helpers schedule the reveal and record the same timing atomically; they do not return freehand semantic timestamps.
- Remotion uses an authored output-local **static `visual_bindings.json` registry**. Build validates and normalizes it without parsing or executing arbitrary TSX.
- FPS policy selection uses md2vid `--profile final|draft|gif`; HyperFrames `--quality` remains independent.
- Final renders default to **30 FPS**; final MP4/MOV below 24 FPS requires `--allow-low-fps`.
- Authored semantic duration is checked against `voiceDur`; outer hosts/sequences are checked against `frameDur`.
- Landing time ends at `voiceDur`; outgoing crossfade overlap does not count as a stable landing.
- Neutral planning uses neutral `video.config.json`; output-local config cannot alter shared timing, slugs, canvas, or `visualSync`.

## Part Plans

| Part | File | Scope | Depends on |
|---:|---|---|---|
| 1 | `2026-08-02-visual-timing-sync-plan-1.md` | Neutral types, configuration, beat parsing, cue resolution, and additive plan fields | None |
| 2 | `2026-08-02-visual-timing-sync-plan-2.md` | Shared planning transaction, `md2vid plan`, build/regroup integration, and current-input verification planning | Part 1 |
| 3 | `2026-08-02-visual-timing-sync-plan-3.md` | Common semantic verifier plus HyperFrames binding runtime, manifest, and seek-safe checks | Parts 1–2 |
| 4 | `2026-08-02-visual-timing-sync-plan-4.md` | Remotion static registry, owned reveal helpers, adapter verification, and example migration | Parts 1–3 |
| 5 | `2026-08-02-visual-timing-sync-plan-5.md` | FPS policy, scaffolds, standards/skill synchronization, packaging, snapshots, and release gates | Parts 1–4 |

## Cross-Part Contracts

```text
visual_beats.json
      ↓ Part 1
ResolvedVisualBeat[] on PlanFrame
      ↓ Part 2
one shared planner + neutral artifacts
      ↓ Part 3
VisualBindingManifest + HyperFrames owned scheduling
      ↓ Part 4
Remotion static registry + owned scheduling
      ↓ Part 5
30 FPS final-render guard + scaffold/docs/release propagation
```

The following names are fixed across parts:

```ts
VisualCueAnchor
AuthoredVisualBeat
AuthoredVisualFrame
VisualBeatSpec
VisualBeatTolerance
ResolvedVisualBeat
ResolvedVisualSyncPolicy
VisualBinding
VisualBindingManifest
AdapterVerifyContext
```

Generated paths are fixed:

```text
<shared>/build/build_plan.json
<shared>/build/visual_timing.json
<output>/build/visual_bindings.json
<render-output>.md2vid-render.json
```

## Plan-Level Sequencing

- Execute all tasks sequentially in numeric order.
- Never run implementation writers in parallel.
- Coherent task groups are marked in part plans. A group receives one implementation scope, then one parallel read-only review pass with `spec-reviewer`, `code-quality-reviewer`, and `tester`, followed by remediation by the same implementer and one read-only verifier.
- Do not begin a later part until the prior part's focused tests and review lifecycle pass.
- Preserve one commit per task using the commit message in that task.
- Do not modify `.tmp/prepaid-ledger` or any generated user video.

## Part Completion Gates

| Part | Required focused gate |
|---:|---|
| 1 | Neutral type/config/beat/plan tests pass; legacy plan serialization remains additive |
| 2 | Plan CLI, transaction, build/regroup, router, workflow, and boundary tests pass |
| 3 | Common semantic verifier, HyperFrames emit/verify, and visual seek tests pass |
| 4 | Remotion adapter/template/example tests and `typecheck:remotion` pass |
| 5 | Render-policy, scaffold, standards/skill, package, snapshot, full check, and release gates pass |

## Requirements Traceability

| Requirement | Implemented and proved by |
|---|---|
| FR-1 authored beat specification | Tasks 1–2, 16 |
| FR-2 deterministic cue resolution | Task 2 |
| FR-3 plan-only workflow | Tasks 4–5, 7 |
| FR-4 resolved neutral beat data | Tasks 1, 3–4 |
| FR-5 framework bindings | Tasks 9–10, 12–14 |
| FR-6 semantic verification | Tasks 8, 10–11, 13 |
| FR-7 legacy behavior | Tasks 1, 3–4, 6, 8, 10, 13, 16 |
| FR-8 final-render FPS policy | Tasks 15–16, 18 |
| FR-9 documentation/scaffold contract | Tasks 16–18 |
| FR-10 determinism and seeking | Tasks 9–14 |

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

Expected result: every command exits `0`; no stale skill-reference copy, public-snapshot mismatch, package omission, or release-smoke failure remains.

## Completion Criteria

- Every requirement FR-1 through FR-10 has a completed task and passing test.
- Narration/caption behavior remains unchanged and continues using transcript word timing.
- A workflow fixture with cues near 3s, 11s, and 14s passes when bound correctly and fails when reveals are front-loaded at 1.5s, 3.7s, and 5.9s.
- HyperFrames and Remotion both verify known/covered/order-correct beat bindings without parsing arbitrary authored animation source.
- Existing projects without visual beats remain buildable in legacy warn mode.
- New scaffolds use required mode, include `npm run plan`, and teach cue-first authoring.
- Final 12 FPS MP4/MOV rendering is rejected before capture unless explicit low-FPS intent is supplied.
- Final rendering defaults to 30 FPS.
- Canonical standards, skill-bundled references, README, package contents, public snapshot, and release smoke all match shipped behavior.
- No caption virtualization, `timing.tail` change, source Markdown parser, or prepaid-ledger-specific refactor is added.
