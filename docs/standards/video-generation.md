# Video Generation Standards

These rules apply to every video generated from an input document in this repository.

## Source fidelity

- Preserve the important information from the input document.
- Do not omit major sections, examples, diagrams, tables, images, or caveats unless explicitly approved.
- Reorder, merge, or split content for teaching clarity, but do not change the meaning.
- If content is omitted, list it with a reason before storyboard approval.

## Duration

- Do not force a fixed 30–90 second duration.
- Video duration should scale with the source length, information density, and number of visuals.
- Prefer complete explanation over arbitrary brevity.
- Short summaries are allowed only when the user explicitly asks for a short video.

## Video structure

- **Frame 1 is the introduction.** State what the video is about and show the agenda — the sections/beats ahead. Treatment: Cover → Enumerate. This is a gate, not optional.
- **The final frame is a recap.** Restate the key takeaways (mirror the agenda), then the callback close. Treatment: Enumerate → Closing.
- **A small stop between frames.** Every frame ends on a held landing of >= 0.5s (no reveal in the final beat) so the viewer gets a breath before the next frame begins.

## Diagrams, images, and tables

- Every input diagram, Mermaid chart, image, or table must be represented in the video.
- Each visual must be explained with narration, captions, or on-screen callouts.
- If a diagram or table is too dense for one scene, split it across multiple frames instead of dropping it.
- Mermaid charts may be redrawn or animated, but their meaning and structure must be preserved.
- External images from the source should be shown, adapted, or clearly replaced with an equivalent visual if direct use is not practical.
- **Redraw, never paste.** Diagrams, charts, and tables are rebuilt from the theme's atoms (hairline node cards, tokens, redrawn grid rows) — never pasted as a raster screenshot or an unstyled Mermaid render. See the redraw discipline in `design/knowledge-expression.md`.

## Knowledge expression

How a piece of source knowledge becomes a frame is a standard, not a per-video improvisation. Two design documents govern it:

- **`design/frame.md`** — the visual contract: the cream/ink/coral atoms and the treatment catalog (Cover, Statement, Code Surface, Number/Impact, Pull-quote, Closing/CTA + the expository set: Structure, Flow, Contrast, Enumerate, Matrix).
- **`design/knowledge-expression.md`** — the decision logic: the knowledge-type → treatment map, the redraw discipline, and the expression triad.

Rules:

- Every frame declares its **knowledge type** and the **treatment** it maps to (see the map in the knowledge contract). Use the mapped treatment unless you can name why the content needs another — if you invent a treatment, add it to the catalog.
- **One focal, one coral moment per frame.** Content builds ink/tile first; exactly one coral element carries the "read this" motion, handed off between items rather than lit twice.
- **Reveal on the narration cue.** Diagram nodes, table rows, list items, and code lines appear as the narration reaches them — never dumped cold at t=0.
- **Vary framing between consecutive same-type frames** so two lists (or two flows) never read as the same slide.
- **Allocate breather frames on purpose** — against dense neighbors, hold some frames calm (a single line, a two-card pair) for rhythm.

## Storyboard requirements

- The storyboard must include a source coverage map from document sections to video frames.
- Each frame should state which source section, diagram, image, table, or example it covers.
- The storyboard must call out any uncovered source material before user approval.
- For long documents, use multiple chapters or sections instead of compressing everything into a short explainer.

## Narration and subtitles

- Narrated videos must include subtitles/captions unless the user explicitly disables them.
- Narration should explain the visual currently on screen.
- Avoid reading the document verbatim unless the user asks for a verbatim script.
- Use concise spoken language, but keep the substance of the source.

### Narration input contract

Every generated scaffold includes `audio_request.json.example` as an onboarding example. Review it, then use `/md2vid` with `/hyperframes-media` to prepare WAV files and `audio_meta.json`; there is no `md2vid audio` command.

Voice WAV files live under `assets/voice/`. Their `path` values are relative to the flat project root or, in canonical multi-framework layout, the sibling `shared/` root. The minimal metadata fields are:

```json
{
  "voices": [
    {
      "id": "intro",
      "path": "assets/voice/intro.wav",
      "duration_s": 3.2,
      "words": [
        { "text": "Welcome", "start": 0.1, "end": 0.5 }
      ]
    }
  ]
}
```

- Voice `id` values may be meaningful strings and must be non-empty and unique.
- Frame order follows the `voices[]` array order; IDs do not encode sequence.
- `video.config.json.slugs` maps every voice ID to its framework visual slug.
- `duration_s` is the voice duration in seconds; `words` contains word-level `text`, `start`, and `end` timings.

## Captions

Captions are a designed layer, not raw transcript output. The default word-level grouping produces lines that are too short (~2 words) to read comfortably.

- **Target ~50–56 characters (~6–7 words) per caption line.** One readable phrase, not a single word and not a full paragraph.
- **Split only at sentence or clause boundaries.** Never break mid-clause or orphan a 1–2 word tail onto its own line. Balance long sentences into even lines.
- **Never merge across frame boundaries.** A caption line belongs to exactly one frame.
- **Preserve every word's original timing.** Regrouping changes only which words share a line — never the timestamps.
- **Keep the two caption files in sync.** `caption_groups.json` (the sidecar) and the baked `var GROUPS` array in `compositions/captions.html` must match — the renderer reads the HTML, not the JSON. Rebuild both with `md2vid regroup <dir> --max-chars 54`.

### Caption visual style

The default subtitle look is a **plain bottom subtitle**, not a lifted card. The canonical skin lives at `.hyperframes/caption-skin.html` in each generated HyperFrames project (see `/md2vid` Step 8).

- **No card.** Transparent background — no fill, no border, no shadow, no radius.
- **Karaoke highlight, retained.** Three word states track the voice: upcoming words sit in faint ink (`--cap-ink` @40%), the word being spoken reads in full ink under a 2px coral underline (`--cap-accent`), and spoken words settle to full ink with the underline cleared. The active word also gets a subtle scale pop. A faint cream halo (`text-shadow`) keeps the text legible over frame content.
- **Smaller and bottom-anchored.** `clamp(28px, 3vw, 40px)`, band pinned to the bottom of the canvas (`.caption-stage { bottom: 0 }`), not a mid-lower third.
- **Reserve the caption band.** The subtitle occupies a reserved zone: the bottom ~14% of the canvas (~150px @1080). Content frames must keep every load-bearing focal, card, and diagram above it — no visual ever sits under a subtitle line. Enforced via `--frame-safe-bottom` (see `design/frame-content.md`).

Keep the plain-text framing (no card) and the karaoke highlight together — the coral underline is the only accent; do not reintroduce the cream pill.

- **Reserve the caption band.** The subtitle occupies a reserved zone: the bottom ~14% of the canvas (~150px @1080). Content frames must keep every load-bearing focal, card, and diagram above it — no visual ever sits under a subtitle line. Enforced via `--frame-safe-bottom` (see `design/frame-content.md`).

## The expression triad

At any moment, the **visual focal, the narration, and the caption carry the same beat.**

- The on-screen focal is what the voice is describing right now; the caption line is the phrase being spoken.
- Reveals are timed so the visual beat, the spoken sentence, and the caption change together.
- This is the load-bearing sync rule: a correct caption over the wrong visual, or a focal that leads the narration, breaks the triad even when each layer is individually fine.

## Default visual theme

- Use `design/frame.md` as the default design system for generated videos unless the user specifies another theme.
- Preserve the theme's warm editorial direction: parchment backgrounds, warm neutrals, terracotta accents, serif-led hierarchy, rounded cards, ring shadows, and organic conceptual visuals.
- Do not use cool blue-gray palettes, generic futuristic AI gradients, sharp tech-dashboard styling, or saturated colors outside the theme.
- If a HyperFrames preset is needed, pick or adapt the preset that best matches `design/frame.md`; do not choose a conflicting visual style just because it is available.

## HyperFrames project structure

Each input-derived video gets its own HyperFrames project folder:

```text
inputs/<source>.md
  → outputs/<project-slug>/
  → outputs/<project-slug>/renders/video.mp4
```

Keep source documents in `inputs/`. Keep generated video projects in `outputs/<project-slug>/`.

Every video project's `CLAUDE.md` and `AGENTS.md` must be a **single `@import`** of the shared HyperFrames boilerplate — not a pasted copy:

```text
@.md2vid/standards/hyperframes.md
```

This keeps the framework conventions (skill routing, `npm run` commands, timeline rules) in one source of truth. `hyperframes init` drops a full boilerplate copy into a new project — replace it with the one-line import. `md2vid verify <dir>` fails the video if either file pastes boilerplate instead of importing.

## Generated-project review gate

Run the generated workflow in this order:

```text
npm run build
npm run check
preview / still / studio review
render only after review
```

`npm run build` creates the neutral plan, stages narration, and regroups captions. `npm run check` includes `md2vid verify` plus framework checks and is required before preview, still, studio, or render. `md2vid verify <dir>` remains available directly for targeted diagnosis.

## Verification checklist

Before rendering, verify:

- [ ] All source headings are covered or intentionally omitted with approval.
- [ ] All diagrams, Mermaid charts, images, and tables are shown or adapted.
- [ ] Each source diagram/table/chart is **redrawn** from theme atoms, not pasted.
- [ ] Every frame declares one knowledge type → treatment (per `design/knowledge-expression.md`).
- [ ] Every frame has one focal and at most one coral moment.
- [ ] Every visual is explained by narration, captions, or callouts.
- [ ] Captions are enabled for narrated videos, ~50–56 chars/line, split on clause boundaries, timing preserved.
- [ ] `caption_groups.json` and the baked `var GROUPS` in `captions.html` are in sync.
- [ ] Captions use the plain bottom-subtitle style (transparent, one flat ink color, smaller, bottom-anchored) — no cream card / coral karaoke unless the user asked for it.
- [ ] No content sits under the reserved caption band (bottom ~14% / ~150px @1080).
- [ ] Frame 1 is an intro with an agenda; the final frame is a recap.
- [ ] Each frame ends on a >= 0.5s held landing.
- [ ] The visual focal, narration, and caption carry the same beat (the expression triad).
- [ ] The final duration matches the content needs, not a preset.
- [ ] `CLAUDE.md` and `AGENTS.md` each @import `.md2vid/standards/hyperframes.md` (no pasted boilerplate).
- [ ] The rendered video passes HyperFrames lint, validate, and inspect checks.
- [ ] `md2vid verify <dir>` passes.
