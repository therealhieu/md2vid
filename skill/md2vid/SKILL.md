---
name: md2vid
description: >
  Use when turning an input document (a Markdown article, guide, chapter, or
  notes) into a narrated explainer video for one or more frameworks (HyperFrames
  default, Remotion optional), driven by the `md2vid` CLI. Triggers on "generate
  a video from", "make a video of this doc", "turn X.md into a video", or any
  request to produce a video from source material. Not for editing an existing
  render, captions on external footage, or a product/PR/website video.
compatibility: Requires Claude Code, a globally installed md2vid CLI, and Node.js >=22.18.
---

# md2vid

## Overview

Turn a source document into a narrated explainer that satisfies **every** repo standard: full source coverage, knowledge-type→treatment mapping, the expression triad, warm-editorial theme, and the passing verifier.

This skill is the **orchestrator**. It walks the pipeline in order and routes each step to the authoritative standard doc and framework-specific authoring. It does not restate the palette or treatment catalog; those live in `references/standards/` and are the bundled authoritative references.

**Core principle:** classify each unit of source knowledge, map it to a treatment, reveal it beat-by-beat on the narration cue. Coverage and the triad are gates, not suggestions.

**Multi-framework:** neutral work (storyboard, script, audio, timing, caption IR) is authored **once** under `shared/`. Each framework gets its own output dir and visual authoring. Default framework is **HyperFrames**. Remotion is opt-in via `--framework remotion` or an explicit user request. **Do not** assume visual parity across frameworks unless the user asks for it.

## When to use

- A doc in `inputs/` needs to become a video.
- The user says "generate/make a video from <doc>".
- The user wants HyperFrames, Remotion, or both from the same input.

## When NOT to use

- Editing an already-rendered video (edit the frames/scenes directly).
- Captions on existing footage → `/embedded-captions`.
- Product launch / website / GitHub-PR video → those specialized skills.

## Layout (multi-framework)

```
outputs/<slug>/
  shared/                         # NEUTRAL — one per input
    SCRIPT.md
    STORYBOARD.md
    video.config.json             # slugs, timing, canvas (no framework knobs)
    audio_meta.json               # voices + word timings
    assets/voice/*.wav
    cues.json                     # written by build
    caption_groups.json           # written by build / regroup
    build/build_plan.json         # neutral IR (gitignored)
  hyperframes/                    # framework OUTPUT (default)
    output.config.json            # { "framework": "hyperframes", "gsapSrc": "..." }
    compositions/frames/*.html
    assets/voice/                 # real WAVs staged by full emit
    index.html / captions.html    # emitted by adapter
    package.json, CLAUDE.md, …
  remotion/                       # framework OUTPUT (optional)
    output.config.json            # { "framework": "remotion" }
    src/**/*.tsx                  # composition + scenes
    build_plan.json               # emit inputProps
    public/assets/voice/          # staged by emit
    package.json, render.ts, …
```

**Rules:**

- Storyboard, script, audio, and slug map live in **`shared/`** only — never duplicated per framework.
- Build/verify/render targets are always a **framework output dir** (`…/hyperframes` or `…/remotion`), never `shared/` alone.
- `md2vid build` resolves neutral inputs from the sibling `shared/` when present; otherwise flat (legacy/scaffold-only).
- A full HyperFrames build stages `shared/assets/voice/**` as real files under `hyperframes/assets/voice/**`.
- A full Remotion build stages the same files as real files under `remotion/public/assets/voice/**`.

## Read first (authoritative standards — do not duplicate, obey)

| Doc | Governs |
|---|---|
| `references/standards/video-generation.md` | End-to-end rules: source fidelity, duration, storyboard, captions, triad, structure, verification checklist. |
| `references/standards/design/frame.md` | Visual contract — cream/ink/coral atoms + the 11 treatments. |
| `references/standards/design/knowledge-expression.md` | Knowledge-type → treatment map, redraw discipline. |
| `references/standards/design/frame-content.md` | Shell/content contract (HyperFrames HTML frames). |
| `references/standards/frameworks/hyperframes.md` | HF project conventions, skills, lint/render. |
| `references/standards/frameworks/remotion.md` | Remotion adapter usage, baseline scenes, constraints. |
| `references/standards/git.md` | Worktree + Conventional Commit rules if you branch/commit. |

Shared machinery — the `md2vid` CLI (installed globally; runs from any cwd):

## CLI preflight — GATE

Before reading or writing project files, run:

```bash
md2vid --version
```

If the command is unavailable or exits non-zero, stop and tell the user to run:

```bash
npm install -g md2vid
md2vid install-skill
```

Do not substitute `npx` automatically: registry resolution may download a different package version. A human may use `npx --yes=false md2vid` for manual project-local CLI commands without approving an install, but the `/md2vid` skill requires the global executable in v0.1.

| Command | Role |
|---|---|
| `md2vid new <slug> [--framework hyperframes\|remotion]` | Framework-aware scaffold |
| `md2vid build <dir>` | Neutral plan → shared IR → `getAdapter(framework).emit()` |
| `md2vid transcribe <dir>` | Word timings into `audio_meta.json` |
| `md2vid regroup <dir> [--max-chars 54]` | Readable caption lines |
| `md2vid verify <dir>` | Neutral caption invariants + framework-specific verify |
| `md2vid hyperframes <command> [args]` | Run the package-owned HyperFrames CLI (pinned to `0.7.26`) |
| `md2vid install-skill` | Copy this skill into `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/md2vid` (re-run after `npm update`) |

Adapters: `frameworks/hyperframes/`, `frameworks/remotion/` (`{ name, scaffoldSpec, writeScaffoldRuntime, ensureRuntime, emit, verify }`).

## Framework selection

| User intent | Framework(s) |
|---|---|
| Unspecified / default | `hyperframes` only |
| "Remotion" / "React video" | `remotion` (optionally also HF if they want both) |
| "both" / "multi-framework" | `hyperframes` **and** `remotion` from the same `shared/` |

Record choice early; do not start Remotion visual work unless requested (R1: rich Remotion scenes are hand-authored and costly).

## Pipeline

Do these in order. Each step names its gate.

### 1. Ingest

Read the input doc in full. Inventory every heading, diagram, Mermaid chart, table, image, code block, and worked example. Nothing is skipped silently.

### 2. Coverage map + omissions — GATE (user approval)

Build a source-section → frame(s) table at the top of `STORYBOARD.md`. List any material you propose to omit **with a reason**. Do not proceed to authoring until the user approves coverage and omissions. Duration follows content density — never force 30–90s (per `video-generation.md` § Duration).

### 3. Storyboard → `outputs/<slug>/shared/STORYBOARD.md`

For each frame declare: source section, **knowledge type → treatment**, the one focal, the one coral moment, and the 3-scene spine (anchor ≤0.5s → VO-paced reveals → held landing ≥0.5s). **Frame 1 is an intro with the agenda** (Cover → Enumerate); **the final frame is a recap** mirroring the agenda (Enumerate → Closing). Vary framing between consecutive same-type frames; allocate deliberate breather frames.

Create `outputs/<slug>/shared/` if missing. Storyboard is framework-neutral.

### 4. Script → `outputs/<slug>/shared/SCRIPT.md`

One narration block per frame, timed. Concise spoken language that explains the on-screen focal — not the doc read verbatim (unless asked).

### 5. Scaffold framework output(s)

From any cwd (the `md2vid` CLI resolves `<dir>` to absolute):

```bash
# Default HyperFrames
md2vid new <slug>
# or explicit
md2vid new <slug> --framework hyperframes
md2vid new <slug> --framework remotion
```

**Layout note:** `md2vid new <slug>` scaffolds a flat project into **`./<slug>`** under the current working directory (an installed CLI writes where you run it, not into the package). Build/verify then target that dir directly: `md2vid build ./<slug>`. For multi-framework work, promote the flat tree into the canonical `<slug>/shared/` + `<slug>/<framework>/` layout shown above and target each framework dir. If you keep the flat tree, reshape once:

- Move/copy neutral files into `shared/` (`video.config.json` without framework-only knobs, meta, storyboard, script, audio).
- Keep framework files under `hyperframes/` or `remotion/` with `output.config.json` (`{ "framework": "…" }`).
- Prefer the canonical `shared/` + per-framework layout above for any new multi-framework project.

**Do not hand-copy a previous video's build scripts** — adapters own emission.

Then fill **`shared/video.config.json`** `slugs` (one entry per voice id → frame slug) and pick `timing.gap` (`0` = back-to-back; `>0` = held stop between frames). Framework-local knobs stay in `<framework>/output.config.json`.

### 6. Audio (shared)

Write `audio_request.json` (one line per frame's narration, plus optional `sfx`/`bgm`) against the shared project, then use `/hyperframes-media` to generate the shared audio artifacts. Emit into **`shared/`**: `audio_meta.json` + `assets/voice/*.wav`.

Default voice/theme: warm, measured, editorial. If word-timings are empty:

```bash
md2vid transcribe outputs/<slug>/hyperframes
# or any framework output dir — transcribe resolves sibling shared/
```

### 7. Author visuals (framework-specific)

#### 7a. HyperFrames → `hyperframes/compositions/frames/NN-*.html`

- Create each frame under the generated project's `compositions/frames/` directory, following `references/standards/design/frame-content.md`.
- Filename **must exactly match** `shared/video.config.json` slugs.
- Skills: start at `/hyperframes`, then `/faceless-explainer` and domain skills (`/hyperframes-core`, `/hyperframes-animation`, `/hyperframes-creative`).
- Obey `frame-content.md`: transparent root, content tracks `0-9`, shell track `20`, captions track `30`, IDs prefixed, one paused timeline per `data-composition-id`.
- **Redraw every diagram/table from theme atoms — never paste a raster, screenshot, or Mermaid render.**
- Project docs: `CLAUDE.md` / `AGENTS.md` single `@import` of the scaffolder's copied-in standard (`.md2vid/standards/hyperframes.md`).

#### 7b. Remotion → `remotion/src/scenes/*Scene.tsx`

- Composition entry is scaffolded under `remotion/src/` (do not clobber existing hand-authored `src/` on re-emit).
- Wire scenes through `Video.tsx` `SceneRouter` (slug → component); keep **Captions at composition root** (global clock); **Audio inside each Sequence**.
- Motion: `useCurrentFrame` + `interpolate` / spring only — **no CSS transitions**.
- Crossfade: triangle opacity over plan `timing.xfade` (fade in + fade out).
- Reuse the generated project's `src/theme.ts`, `src/primitives.tsx`, and `src/fonts.ts`; keep new scenes under `src/scenes/`.
- Rich per-frame visuals are **hand-authored** (not auto-generated from IR). Title-card fallback is acceptable only if the user accepted baseline R1 scope.
- Project docs / standards: `references/standards/frameworks/remotion.md`.
- Install once: `cd outputs/<slug>/remotion && npm install` (pin all `@remotion/*` to the same version as the template).

### 8. Build (IR + framework emit) & regroup

From any cwd (each `<dir>` resolves to absolute inside the CLI):

```bash
# HyperFrames
md2vid build outputs/<slug>/hyperframes
md2vid regroup outputs/<slug>/hyperframes --max-chars 54

# Remotion
md2vid build outputs/<slug>/remotion
md2vid regroup outputs/<slug>/remotion --max-chars 54
```

What this does:

1. `engine.plan()` → writes neutral IR into `shared/` (`cues.json`, `caption_groups.json`, `build/build_plan.json`).
2. Adapter `emit()` → framework files and transactional real-WAV staging (HF: `index.html` + baked captions + `assets/voice/**`; Remotion: `build_plan.json` + `public/assets/voice/**`); missing runtime files are added without clobbering authored frames or `src/**`.
3. `regroup` merges caption lines to ~50–56 chars; HF emit re-bakes `var GROUPS` so JSON ↔ HTML match.

You do **not** hand-write `index.html` / `captions.html`. The generated HyperFrames project's caption skin is `.hyperframes/caption-skin.html`. Remotion karaoke is `src/Captions.tsx` (re-authoring, not GSAP byte-parity).

### 9. Verify — GATE (must pass)

```bash
# Neutral + framework checks (any cwd)
md2vid verify outputs/<slug>/hyperframes
md2vid verify outputs/<slug>/remotion   # if present

# HyperFrames tooling
cd outputs/<slug>/hyperframes && npm run check   # lint + validate + inspect

# Remotion smoke (CI-cheap)
cd outputs/<slug>/remotion && npm run still
```

Fix every FAIL. Walk `video-generation.md` § Verification checklist by hand — scripts cover machine invariants; treatment/focal/triad are yours.

### 10. Render — only on explicit request

```bash
# HyperFrames
cd outputs/<slug>/hyperframes && npm run render
# prefer default renders/ or an ignored out/ path

# Remotion
cd outputs/<slug>/remotion && npm run render   # → out/video.mp4 (gitignored)
```

Deliver preview otherwise. MP4s under `outputs/**/out/` and `outputs/**/renders/` are gitignored.

## The three hard gates

- **Coverage** — every source heading/diagram/table/image is covered or omitted-with-approval **before** authoring.
- **Expression triad** — at every timestamp the focal, narration, and caption carry the same beat (per framework visual).
- **Verifier** — `md2vid verify` passes and framework checks are clean before render.

## Multi-framework rules of thumb

| Do | Don't |
|---|---|
| Author script/audio/timing once in `shared/` | Re-transcribe per framework |
| Pick frameworks from user intent | Port HF→Remotion visuals by default |
| Hand-author Remotion scenes when quality matters | Expect IR to invent diagrams |
| Accept different caption implementations (HF GSAP vs Remotion karaoke) | Require byte-identical MP4s across frameworks |
| Use the canonical `shared/` + per-framework layout above | Copy repository example projects |

## Common mistakes

| Mistake | Fix |
|---|---|
| Cold-dumping a full table/list/diagram at t=0 | Reveal row/node/item on its VO cue; pre-place dim, spotlight on cue. |
| Pasting a Mermaid/screenshot diagram | Redraw from theme atoms (hairline node cards, tokens). |
| Two coral moments in a frame | One focal, one coral; hand coral off between items. |
| Under-grouped captions (~2 words/line) | Regroup to ~50–56 chars; keep HF JSON ↔ baked `var GROUPS` in sync. |
| Content under the subtitle line | Reserve caption band (bottom ~14% / ~150–200px @1080). |
| No intro/recap; frames end on a live reveal | Frame 1 = agenda intro, final = recap; ≥0.5s held landing. |
| Pasting boilerplate into `CLAUDE.md`/`AGENTS.md` | Single `@import` of the scaffolder's copied-in standard (`.md2vid/standards/<fw>.md`). |
| Hand-editing emitted `index.html` / `captions.html` | Rebuild via `md2vid build` + `md2vid regroup`. |
| Building `shared/` as if it were a framework output | Build `…/hyperframes` or `…/remotion`. |
| Remotion CSS transitions / captions inside Sequence | `interpolate` only; captions at composition root. |
| Nesting Remotion Audio at root with wrong offsets | Keep `<Audio>` inside each frame `<Sequence>`. |
| Cool blue-gray / AI-gradient styling | Warm cream/ink/coral only (`frame.md` § Trinity). |
| Forcing a 30–90s length | Duration scales with content; prefer complete explanation. |
| Raw source-script invocations | Use the `md2vid` CLI (`new`, `build`, `transcribe`, `regroup`, `verify`) — runs from any cwd. |

## Quick command cheat sheet

```bash
# Scaffold
md2vid new my-slug
md2vid new my-slug --framework remotion

# Build + regroup (per framework output)
md2vid build outputs/my-slug/hyperframes
md2vid regroup outputs/my-slug/hyperframes --max-chars 54
md2vid build outputs/my-slug/remotion
md2vid regroup outputs/my-slug/remotion --max-chars 54

# Verify
md2vid verify outputs/my-slug/hyperframes
md2vid verify outputs/my-slug/remotion

# Render (explicit request only)
cd outputs/my-slug/hyperframes && npm run render
cd outputs/my-slug/remotion && npm run still && npm run render
```
