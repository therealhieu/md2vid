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
    audio_request.json.example    # scaffolded narration-planning example
    audio_meta.json               # voices + word timings
    assets/voice/*.wav
    cues.json                     # written by build
    caption_groups.json           # written by build / regroup
    build/build_plan.json         # neutral IR (gitignored)
  hyperframes/                    # framework OUTPUT (default)
    output.config.json            # { "framework": "hyperframes", "gsapSrc": "..." }
    compositions/frames/*.html
    assets/voice/                 # real WAVs staged by full emit
    index.html
    compositions/captions.html   # emitted by adapter
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

### HyperFrames local GSAP

The pinned CDN remains the scaffold default. For an explicit offline/local opt-in, place your own runtime at a project-root-relative path such as `assets/gsap/gsap.min.js`, set that exact string as `output.config.json` → `gsapSrc`, and use the same exact unchanged string in authored frame `<script src>` tags. Standalone authored frames and the generated standalone `compositions/captions.html` each keep that dependency for direct preview; do not rewrite it as `../` or `../../`. Authored frame and source files remain untouched during a full build, while the generated standalone `compositions/captions.html` is regenerated from staged caption groups. It loads GSAP once from `index.html`, embeds sanitized frame/caption templates with only the matching external GSAP script removed, verifies caption sync, and atomically promotes neutral JSON, generated framework artifacts, and managed voice assets. Keep caption styles, content, and initialization inside the captions composition root. Caption regrouping atomically refreshes caption JSON, standalone captions, and the embedded `captions-template`; verification compares all three. Direct `build --captions-only` preflights the source index and atomically updates standalone and embedded caption HTML. md2vid validates the configured file but does not vendor or copy GSAP by default.

### Transcript normalization

Treat the WAV sample extent as authoritative: `sampleFrames = dataBytes / blockAlign`, and `duration_s` is that frame count divided by `sampleRate`, safely floored to 6 decimal places and never rounded upward. On Darwin/Linux, md2vid opens the final path with `O_NOFOLLOW | O_NONBLOCK`, rejects static intermediate symlinks and nonregular files, and checks component/file identities before and after reading. This detects ordinary cooperative changes best-effort, not an adversarial swap-and-restore race; Node core has no descriptor-relative traversal API, so keep the project tree quiescent while snapshots are captured. Once captured, immutable bytes drive timing, private-tree transcription input, build staging, and emitted-asset SHA-256 verification without a native addon or system helper. Words are finite, ordered, non-overlapping, and inside `0 <= start <= end <= duration_s`. `md2vid transcribe` replaces stale JSON durations, bounds only provider final-word overruns, and persists all voices together without extending the WAV. `md2vid build` and `md2vid verify` reject duration mismatches, out-of-WAV words, and missing/symlinked/stale emitted WAVs before managed output mutation or successful verification, with metadata path and voice/word identity. Do not hand-edit timings to bypass these gates. There is no `md2vid audio` command.

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

First complete the two neutral planning gates without choosing output paths:

1. **Ingest:** read the source in full and inventory every heading, diagram, Mermaid chart, table, image, code block, and worked example.
2. **Coverage approval — GATE:** propose the source-section → frame map and any omissions with reasons. Do not author files until the user approves it. Duration follows content density, never a forced 30–90 seconds.

Then choose exactly one complete path below. Do not start flat and silently switch to canonical paths later.

### Branch A — Single framework (flat, default)

Use this for the default HyperFrames workflow or one explicitly requested Remotion output.

1. Scaffold first into the flat project directory:

   ```bash
   md2vid new <slug>
   # or, for Remotion only:
   md2vid new <slug> --framework remotion
   ```

2. Put all neutral authoring files directly in that scaffold:

   - `<slug>/STORYBOARD.md` — coverage map, knowledge type → treatment, focal, coral moment, narration-cued reveals, and held landing per frame.
   - `<slug>/SCRIPT.md` — one timed narration block per frame.
   - Review `<slug>/audio_request.json.example`, then prepare `<slug>/audio_request.json`.
   - Use `/hyperframes-media` to generate `<slug>/audio_meta.json` and `<slug>/assets/voice/*.wav`.
   - Fill `<slug>/video.config.json` `slugs` and timing. Voice IDs may be meaningful but must be unique; frame sequence follows `voices[]` array order.

3. Author framework visuals in the same flat project:

   - HyperFrames: `<slug>/compositions/frames/NN-*.html`; filenames match `video.config.json.slugs` exactly.
   - Remotion: `<slug>/src/scenes/*Scene.tsx`; import and register every custom scene in `Video.tsx`. Run `npm install` once before Remotion checks.

4. Run the generated scripts from the flat project root:

   ```bash
   cd <slug>
   npm run transcribe   # only when audio_meta words[] timings are empty
   npm run build
   npm run check
   npm run dev          # HyperFrames review
   npm run still        # Remotion smoke
   npm run studio       # Remotion review
   npm run render       # only after review and explicit request
   ```

`npm run build` includes `md2vid build .` and caption regrouping. `npm run check` starts with `md2vid verify .` and then runs the framework checks. Direct diagnosis stays flat too: `md2vid transcribe <slug>`, `md2vid build <slug>`, and `md2vid verify <slug>`.

### Branch B — Multiple frameworks (canonical)

Use this only when the user requests both frameworks or a shared-neutral multi-framework project.

1. Scaffold both runtimes before arranging the canonical tree:

   ```bash
   md2vid new <slug>-hyperframes
   md2vid new <slug>-remotion --framework remotion
   ```

2. Promote the generated projects explicitly:

   ```text
   <slug>-hyperframes/ → outputs/<slug>/hyperframes/
   <slug>-remotion/    → outputs/<slug>/remotion/
   ```

   Create `outputs/<slug>/shared/`. Move the HyperFrames scaffold's neutral `meta.json`, `video.config.json`, and `audio_request.json.example` there, then remove the duplicate neutral copies from the Remotion directory. Keep each framework's `output.config.json`, package scripts, runtime, and copied standard in its framework directory.

3. Put shared authoring only under the canonical neutral root:

   - `outputs/<slug>/shared/STORYBOARD.md`
   - `outputs/<slug>/shared/SCRIPT.md`
   - Review the example, then prepare `outputs/<slug>/shared/audio_request.json`.
   - Generate `outputs/<slug>/shared/audio_meta.json` and `outputs/<slug>/shared/assets/voice/*.wav` with `/hyperframes-media`.
   - Fill `outputs/<slug>/shared/video.config.json`; every meaningful voice ID maps to a visual slug, and `voices[]` array order controls sequence.

4. Author framework visuals only in their output directories:

   - `outputs/<slug>/hyperframes/compositions/frames/NN-*.html`
   - `outputs/<slug>/remotion/src/scenes/*Scene.tsx`

   HyperFrames follows `references/standards/design/frame-content.md` and the generated `.md2vid/standards/hyperframes.md`. Remotion custom scenes are imported and explicitly registered in `Video.tsx`; run `npm install` once in the Remotion directory.

5. Transcribe the shared narration once, then build, check, and review each framework from its own output directory:

   ```bash
   cd outputs/<slug>/hyperframes
   npm run transcribe   # only when shared audio_meta words[] timings are empty
   npm run build
   npm run check
   npm run dev          # review
   npm run render       # only after review and explicit request

   cd outputs/<slug>/remotion
   npm run build
   npm run check
   npm run still        # smoke
   npm run studio       # review
   npm run render       # only after review and explicit request
   ```

The canonical direct commands target framework outputs, never `shared/`: `md2vid transcribe outputs/<slug>/hyperframes`, `md2vid build outputs/<slug>/hyperframes`, `md2vid build outputs/<slug>/remotion`, `md2vid verify outputs/<slug>/hyperframes`, and `md2vid verify outputs/<slug>/remotion`.

## What build does

1. `engine.plan()` writes neutral IR (`cues.json`, `caption_groups.json`, `build/build_plan.json`) beside the neutral inputs: the flat project root for Branch A or `shared/` for Branch B.
2. Adapter `emit()` writes framework files and stages real WAVs transactionally (HyperFrames: `index.html`, `compositions/captions.html`, `assets/voice/**`; Remotion: `build_plan.json`, `public/assets/voice/**`) without clobbering authored frames or `src/**`.
3. Caption regrouping targets ~50–56 characters and re-bakes HyperFrames `var GROUPS` so JSON and HTML stay synchronized.

Do not hand-write emitted `index.html` or `compositions/captions.html`. Fix every failed check, then walk `video-generation.md` § Verification checklist manually; machine checks cannot judge source coverage, treatment quality, focal timing, or the expression triad.

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
| Hand-editing emitted `index.html` / `compositions/captions.html` | Rebuild via `md2vid build` + `md2vid regroup`. |
| Building `shared/` as if it were a framework output | Build `…/hyperframes` or `…/remotion`. |
| Remotion CSS transitions / captions inside Sequence | `interpolate` only; captions at composition root. |
| Nesting Remotion Audio at root with wrong offsets | Keep `<Audio>` inside each frame `<Sequence>`. |
| Cool blue-gray / AI-gradient styling | Warm cream/ink/coral only (`frame.md` § Trinity). |
| Forcing a 30–90s length | Duration scales with content; prefer complete explanation. |
| Raw source-script invocations | Use the `md2vid` CLI (`new`, `build`, `transcribe`, `regroup`, `verify`) — runs from any cwd. |

## Quick command cheat sheet

### Flat single-framework

```bash
md2vid new my-slug                       # or add --framework remotion
# write STORYBOARD.md, SCRIPT.md, narration/config, and visuals under my-slug/
cd my-slug
npm run transcribe                       # only if word timings are missing
npm run build
npm run check
npm run dev                              # HyperFrames review
npm run still && npm run studio          # Remotion smoke + review
npm run render                           # explicit request, after review
```

### Canonical multi-framework

```bash
md2vid new my-slug-hyperframes
md2vid new my-slug-remotion --framework remotion
# arrange outputs/my-slug/shared + hyperframes + remotion as Branch B specifies
cd outputs/my-slug/hyperframes
npm run transcribe                       # shared narration, once
npm run build && npm run check
npm run dev                              # review
cd ../remotion
npm run build && npm run check
npm run still && npm run studio          # smoke + review
npm run render                           # explicit request, after review
```
