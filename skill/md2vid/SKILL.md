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
    video.config.json             # slugs, timing, canvas, visualSync (no framework knobs)
    audio_request.json.example    # scaffolded narration-planning example
    audio_meta.json               # voices + word timings
    visual_beats.json             # authored semantic beat IDs + transcript anchors
    assets/voice/*.wav
    cues.json                     # written by plan/build
    caption_groups.json           # written by plan/build / regroup
    build/build_plan.json         # neutral IR (gitignored)
    build/visual_timing.json      # resolved author-facing beat projection
  hyperframes/                    # framework OUTPUT (default)
    output.config.json            # framework + GSAP + render-profile settings
    compositions/frames/*.html
    assets/voice/                 # real WAVs staged by full emit
    build/visual_bindings.json    # generated binding evidence
    index.html
    compositions/captions.html   # emitted by adapter
    package.json, CLAUDE.md, …
  remotion/                       # framework OUTPUT (optional)
    output.config.json            # { "framework": "remotion" }
    src/**/*.tsx                  # composition + scenes
    visual_bindings.json          # authored static target-to-beat registry
    build/visual_bindings.json    # generated normalized binding evidence
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

For normal updates of an existing global installation, run `md2vid upgrade`. The command updates the npm package and refreshes this copied skill. Use `md2vid install-skill` directly only for skill repair or recovery after a partial upgrade failure.

Do not substitute `npx` automatically: registry resolution may download a different package version. A human may use `npx --yes=false md2vid` for manual project-local CLI commands without approving an install, but the `/md2vid` skill requires the global executable in v0.1.

| Command | Role |
|---|---|
| `md2vid new <slug> [--framework hyperframes\|remotion]` | Framework-aware scaffold |
| `md2vid plan <dir>` | Resolve neutral narration and `visual_beats.json` timing without framework emission |
| `md2vid build <dir>` | Reuse the neutral plan → shared IR → `getAdapter(framework).emit()` |
| `md2vid transcribe <dir>` | Word timings into `audio_meta.json` |
| `md2vid regroup <dir> [--max-chars 54]` | Readable caption lines |
| `md2vid verify <dir>` | Neutral caption invariants + framework-specific verify |
| `md2vid hyperframes <command> [args]` | Run the exact package-owned HyperFrames CLI declared by this md2vid release |
| `md2vid install-skill` | Repair or refresh this skill in `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/md2vid` without updating the CLI package |
| `md2vid upgrade` | Update the global npm CLI to `md2vid@latest` and refresh the copied skill |

Adapters: `frameworks/hyperframes/`, `frameworks/remotion/` (`{ name, scaffoldSpec, writeScaffoldRuntime, ensureRuntime, emit, verify }`).

## Framework selection

| User intent | Framework(s) |
|---|---|
| Unspecified / default | `hyperframes` only |
| "Remotion" / "React video" | `remotion` (optionally also HF if they want both) |
| "both" / "multi-framework" | `hyperframes` **and** `remotion` from the same `shared/` |

Record choice early; do not start Remotion visual work unless requested (R1: rich Remotion scenes are hand-authored and costly).

## Narration policy

Materialize and review this exact effective English default request before synthesis unless the user explicitly overrides the corresponding field:

```json
{
  "version": 1,
  "provider": "kokoro",
  "voice": "am_michael",
  "lang": "en",
  "speed": 0.9,
  "lines": [
    { "id": "intro", "text": "Introduce the topic." },
    { "id": "recap", "text": "Recap the key idea." }
  ]
}
```

For non-English narration, supply a compatible explicit voice; do not use am_michael. Target 6–14 spoken words per sentence. Split at one conceptual idea. A comma does not count as a strong sentence boundary; more than 18 lexical words fails `md2vid narration-check` unless the user approves that exact sentence.

<!-- md2vid-narration-workflow:start -->
## Narration preflight and synthesis — GATE

After storyboard approval, author the spoken narration script in `SCRIPT.md`, materialize `audio_request.json` with the effective provider, voice, language, and speed, then run:

```bash
md2vid narration-check "$NARRATION_ROOT"
```

Run synthesis only after `md2vid narration-check` has no errors. After that check, inspect every warning before synthesis: rewrite the sentence or explicitly retain it with a stated project-specific rationale. Never describe warning-bearing output as warning-free.

The request is the persisted authority. The default English request is `provider=kokoro`, `voice=am_michael`, `lang=en`, and `speed=0.9`; a persisted user override replaces only its selected field. Do not use `say`, provider auto-selection, or a network fallback. Stop if readiness validation fails: report the failed capability, the exact preflight command, `md2vid hyperframes doctor` as the recovery command, and that no fallback was used.

<!-- md2vid-media-contract:start -->
```bash
set -e
MEDIA_USE_ROOT="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/media-use"
NARRATION_ROOT="${NARRATION_ROOT:?set NARRATION_ROOT to the flat project or canonical shared root}"

TTS_PROVIDER=$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.provider)' "$NARRATION_ROOT/audio_request.json")
TTS_VOICE=$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.voice)' "$NARRATION_ROOT/audio_request.json")
TTS_LANG=$(node -e 'const r=require(process.argv[1]); process.stdout.write(r.lang)' "$NARRATION_ROOT/audio_request.json")
TTS_SPEED=$(node -e 'const r=require(process.argv[1]); process.stdout.write(String(r.speed))' "$NARRATION_ROOT/audio_request.json")

READINESS_LABEL="Narration readiness failed"
if [ "$TTS_PROVIDER" = kokoro ]; then READINESS_LABEL="Kokoro readiness failed"; fi
fail_readiness() {
  printf '%s\n' "$READINESS_LABEL: $1" >&2
  printf '%s\n' "Preflight command: md2vid hyperframes doctor --json" >&2
  printf '%s\n' "Next step: md2vid hyperframes doctor" >&2
  printf '%s\n' "No system, cloud, or automatic fallback was used." >&2
  exit 1
}

MEDIA_AUDIO_DIR="$MEDIA_USE_ROOT/audio/scripts"
MEDIA_RUNNER="$MEDIA_AUDIO_DIR/audio.mjs"
if [ ! -f "$MEDIA_RUNNER" ] || [ ! -r "$MEDIA_RUNNER" ]; then
  fail_readiness "media-use audio runner"
fi
if ! DOCTOR_JSON=$(md2vid hyperframes doctor --json); then
  fail_readiness "md2vid hyperframes doctor --json"
fi
VOICES_JSON='[]'
if [ "$TTS_PROVIDER" = kokoro ]; then
  if ! VOICES_JSON=$(md2vid hyperframes tts --list --json); then
    fail_readiness "md2vid hyperframes tts --list --json"
  fi
fi
if ! READINESS_FAILURE=$(node - "$DOCTOR_JSON" "$VOICES_JSON" "$TTS_PROVIDER" "$TTS_VOICE" <<'NODE'
const [doctorJson, voicesJson, provider, voice] = process.argv.slice(2);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
try {
  const doctor = JSON.parse(doctorJson);
  if (!record(doctor) || !Array.isArray(doctor.checks) || !doctor.checks.every(
    (check) => record(check) && typeof check.name === "string" && typeof check.ok === "boolean",
  )) {
    process.stdout.write("doctor response");
  } else {
    const check = (name) => doctor.checks.find((candidate) => candidate.name === name);
    const missing = ["FFmpeg", "FFprobe"].find((name) => !check(name)?.ok);
    if (missing !== undefined) {
      process.stdout.write(missing);
    } else if (provider === "kokoro") {
      let voices;
      try {
        voices = JSON.parse(voicesJson);
      } catch {
        process.stdout.write("Kokoro voice catalog");
        process.exit(0);
      }
      if (!Array.isArray(voices) || !voices.every((candidate) => record(candidate) && typeof candidate.id === "string")) {
        process.stdout.write("Kokoro voice catalog");
      } else if (!check("TTS (Kokoro)")?.ok) {
        process.stdout.write("TTS (Kokoro)");
      } else if (!voices.some((candidate) => candidate.id === voice)) {
        process.stdout.write(`voice ${voice}`);
      }
    }
  }
} catch {
  process.stdout.write("doctor response");
}
NODE
); then
  fail_readiness "readiness validation"
fi
if [ -n "$READINESS_FAILURE" ]; then fail_readiness "$READINESS_FAILURE"; fi

node "$MEDIA_USE_ROOT/audio/scripts/audio.mjs" \
  --request "$NARRATION_ROOT/audio_request.json" \
  --hyperframes "$NARRATION_ROOT" \
  --out "$NARRATION_ROOT/audio_meta.json" \
  --only tts \
  --provider "$TTS_PROVIDER" \
  --voice "$TTS_VOICE" \
  --lang "$TTS_LANG" \
  --speed "$TTS_SPEED"
```
<!-- md2vid-media-contract:end -->

Run `md2vid transcribe` immediately after successful synthesis (normally through `npm run transcribe`). It is unconditional: Kokoro output needs waveform-derived word timings and exact WAV duration before visual planning. Any request change invalidates generated audio, transcript timings, captions, cues, bindings, and render evidence; re-synthesize and transcribe before authoring or rebuilding downstream visuals.

Complete the normative narration workflow in this order:

1. Author the spoken narration script, then materialize and review the effective request.
2. Run `md2vid narration-check` and resolve every error; inspect and explicitly account for every warning before synthesis.
3. Verify readiness, then synthesize with the explicit Kokoro request through the marked `/media-use` contract above. Do not use `say`, automatic provider selection, or a cloud fallback.
4. Run `md2vid transcribe` immediately after synthesis.
5. Author `visual_beats.json` from the measured transcript, then run `npm run plan` before framework visual authoring.
6. Run `npm run build`, then `npm run check`. Fresh `narration_evidence.json` is required before plan, build, regroup, or verify for a versioned request.
7. Perform listening and visual review at sentence transitions; render only after review and the requested approval.

<!-- md2vid-narration-workflow:end -->

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
   - Use the narration media contract above to generate `<slug>/audio_meta.json` and `<slug>/assets/voice/*.wav`.
   - Fill `<slug>/video.config.json` `slugs`, timing, and `visualSync`. Voice IDs may be meaningful but must be unique; frame sequence follows `voices[]` array order. New scaffolds are `required`; legacy projects without beats remain actionable `warn` mode until migration.

3. Resolve semantic timing before visual authoring:

   ```bash
   cd <slug>
   npm run transcribe
   # author <slug>/visual_beats.json with beat IDs, transcript anchors, and source refs
   npm run plan
   ```

   `npm run plan` writes the shared resolved timing authority without framework emission. Do not start framework motion until the plan resolves; it is the source of beat IDs and cue times.

4. **Author framework visuals** in the same flat project against resolved beat IDs:

   - HyperFrames: `<slug>/compositions/frames/NN-*.html`; filenames match `video.config.json.slugs` exactly. Use declarative `data-md2vid-beat` + `data-md2vid-enter`, or inert `data-md2vid-custom-bindings` JSON with `window.__md2vidTiming`'s owned helper. Do not copy numeric cue offsets.
   - Remotion: `<slug>/src/scenes/*Scene.tsx`; import and register every custom scene in `Video.tsx`. Create `<slug>/visual_bindings.json` as the static registry whose targets are consumed by `VisualBeatProvider` and `BeatReveal`. Run `npm install` once before Remotion checks.

5. Build, check, review, then render from the flat project root:

   ```bash
   npm run build
   npm run check
   npm run dev          # HyperFrames review
   npm run still        # Remotion smoke
   npm run studio       # Remotion review
   npm run render       # only after review and explicit request
   ```

`npm run build` reuses the same plan, emits framework artifacts, and regroups captions. `npm run check` starts with `md2vid verify .` and then runs framework checks. Direct diagnosis stays flat too: `md2vid transcribe <slug>`, `md2vid plan <slug>`, `md2vid build <slug>`, and `md2vid verify <slug>`.

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
   - Set `NARRATION_ROOT=outputs/<slug>/shared`, then run the marked narration media contract above to generate `outputs/<slug>/shared/audio_meta.json` and `outputs/<slug>/shared/assets/voice/*.wav`.
   - Fill `outputs/<slug>/shared/video.config.json`; every meaningful voice ID maps to a visual slug, `voices[]` array order controls sequence, and new scaffolds set `visualSync.mode` to `required`.

4. Resolve the shared narration once, then author the shared beat specification before either framework visual:

   ```bash
   cd outputs/<slug>/hyperframes
   npm run transcribe
   # author outputs/<slug>/shared/visual_beats.json with beat IDs, anchors, and source refs
   npm run plan
   ```

   The sibling output resolves the same neutral plan. Legacy projects may migrate from actionable `warn` mode; scaffolded projects remain `required` and need binding evidence.

5. **Author framework visuals** only in their output directories against those resolved IDs:

   - `outputs/<slug>/hyperframes/compositions/frames/NN-*.html` use declarative `data-md2vid-beat` + `data-md2vid-enter`, or inert `data-md2vid-custom-bindings` JSON through the owned timing helper.
   - `outputs/<slug>/remotion/src/scenes/*Scene.tsx` are imported and explicitly registered in `Video.tsx`; `outputs/<slug>/remotion/visual_bindings.json` is the static registry consumed by `VisualBeatProvider` and `BeatReveal`. Run `npm install` once in the Remotion directory.

   HyperFrames follows `references/standards/design/frame-content.md` and the generated `.md2vid/standards/hyperframes.md`. Never copy resolved cue seconds into either framework source.

6. Build, check, review, then render each framework from its own output directory:

   ```bash
   npm run build
   npm run check
   npm run dev          # HyperFrames review
   npm run render       # only after review and explicit request

   cd outputs/<slug>/remotion
   npm run build
   npm run check
   npm run still        # smoke
   npm run studio       # Remotion review
   npm run render       # only after review and explicit request
   ```

The canonical direct commands target framework outputs, never `shared/`: `md2vid transcribe outputs/<slug>/hyperframes`, `md2vid plan outputs/<slug>/hyperframes`, `md2vid build outputs/<slug>/hyperframes`, `md2vid build outputs/<slug>/remotion`, `md2vid verify outputs/<slug>/hyperframes`, and `md2vid verify outputs/<slug>/remotion`.

## What plan and build do

1. `md2vid plan` resolves `visual_beats.json` against transcript words and writes neutral IR (`cues.json`, `caption_groups.json`, `build/build_plan.json`, `build/visual_timing.json`) beside neutral inputs: the flat project root for Branch A or `shared/` for Branch B. It does not emit framework output or mutate authored frames/scenes.
2. `md2vid build` reuses that same planner, then adapter `emit()` writes framework files and stages real WAVs transactionally (HyperFrames: `index.html`, `compositions/captions.html`, `assets/voice/**`, `build/visual_bindings.json`; Remotion: `build_plan.json`, `public/assets/voice/**`, `build/visual_bindings.json`) without clobbering authored frames or `src/**`.
3. HyperFrames binds through declarative `data-md2vid-beat` attributes or inert `data-md2vid-custom-bindings` declarations plus its owned helper. Remotion binds through static `visual_bindings.json`, `VisualBeatProvider`, and `BeatReveal`; neither path copies semantic seconds.
4. Caption regrouping targets ~50–56 characters and re-bakes HyperFrames `var GROUPS` so JSON and HTML stay synchronized.

Do not hand-write emitted `index.html`, `compositions/captions.html`, or `build/visual_bindings.json`. Fix every failed check. Machine checks enforce declared beat coverage, reveal timing, order, landing, and duration. Manual review judges source interpretation, treatment quality, hierarchy, and polish; it cannot waive the objective timing contract.

## The four hard gates

- **Coverage** — every source heading/diagram/table/image is covered or omitted-with-approval **before** authoring.
- **Cue plan** — `visual_beats.json` resolves through `npm run plan` before framework visual authoring; every narrated target binds to a stable beat ID.
- **Expression triad** — at every timestamp the focal, narration, and caption carry the same beat (per framework visual).
- **Verifier** — `md2vid verify` passes coverage, timing, order, landing, duration, and framework checks before render.

## Render profiles

For both flat and canonical HyperFrames workflows, profile selection is explicit and md2vid-owned:

```text
--profile final|draft|gif
--allow-low-fps
```

Final is the default: 30 FPS, with a 24 FPS floor for MP4/MOV unless `--allow-low-fps` is intentional. Draft and GIF profiles allow low rates. `--quality` remains independent of the profile. A successful known-output HyperFrames render writes `<output>.md2vid-render.json` with its effective profile and FPS.

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
| Cold-dumping a full table/list/diagram at t=0 | Author a beat ID, run `npm run plan`, then bind the row/node/item to its VO cue; pre-place dim structure only. |
| Copying numeric visual offsets into GSAP or TSX | Use `data-md2vid-beat` or the framework-owned helper/registry; beat IDs are the timing authority. |
| Treating manual review as a timing substitute | Machine checks prove coverage/timing/order/landing/duration; review treatment, hierarchy, and polish after they pass. |
| Low-FPS final render | Final defaults to 30 FPS and needs 24+ FPS; use `--profile draft`, `--profile gif`, or explicit `--allow-low-fps` only when intended. |
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
# write STORYBOARD.md, SCRIPT.md, narration/config under my-slug/
cd my-slug
npm run transcribe                       # only if word timings are missing
# author visual_beats.json, then plan before framework visual authoring
npm run plan
npm run build
npm run check
npm run dev                              # HyperFrames review
npm run still && npm run studio          # Remotion smoke + review
npm run render                           # final is 30 FPS; draft/GIF need explicit profile intent
```

### Canonical multi-framework

```bash
md2vid new my-slug-hyperframes
md2vid new my-slug-remotion --framework remotion
# arrange outputs/my-slug/shared + hyperframes + remotion as Branch B specifies
cd outputs/my-slug/hyperframes
npm run transcribe                       # shared narration, once
# author shared/visual_beats.json, then resolve it before either framework visual
npm run plan
npm run build && npm run check
npm run dev                              # review
cd ../remotion
npm run build && npm run check
npm run still && npm run studio          # smoke + review
npm run render                           # final is 30 FPS; draft/GIF need explicit profile intent
```
