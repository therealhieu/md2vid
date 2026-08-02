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

## Cue-bound visual timing and render policy

Semantic timing is a required workflow gate, not an animation afterthought:

```text
transcription
  → visual_beats.json
  → npm run plan
  → cue-bound visual authoring
  → npm run build + npm run check
  → review
  → render
```

- After narration has word timings, author `visual_beats.json` with stable beat IDs, transcript anchors, source references, and ordered workflow steps where applicable.
- Run `npm run plan` before authoring framework visuals. It resolves the beat anchors against the transcript and writes the neutral timing authority; authors bind targets to beat IDs rather than copying numeric semantic offsets.
- `npm run check` is the semantic gate: it verifies planned-beat coverage, cue lead/lag, workflow order, landing time, and framework duration before review or render.
- Existing projects without visual beats remain in actionable legacy **warn** mode. New scaffolds use **required** mode and must provide binding evidence.
- For MP4/MOV delivery, the final profile defaults to 30 FPS and rejects an effective rate below 24 FPS. Use `--profile draft` or `--profile gif` for intentionally low-rate work, or pass `--allow-low-fps` only as an explicit final-delivery override. `--quality` remains independent from the md2vid profile.
- Review still judges source interpretation, treatment, hierarchy, and polish. Machine checks judge the declared timing contract; manual review does not waive it.

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

Every generated scaffold includes `audio_request.json.example` as an onboarding example. Materialize and review the versioned request before narration synthesis:

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

- English defaults apply only when the user has not selected another supported provider or voice. Persist each effective value in `audio_request.json`.
- For non-English narration, supply a compatible explicit voice; do not use am_michael.
- Target 6–14 lexical words per spoken sentence; more than 18 lexical words fails `md2vid narration-check` unless the user approves that exact sentence.
- Split one conceptual idea into each spoken sentence. A comma does not count as a strong sentence boundary; commas, dashes, colons, semicolons, and parentheses do not reset the hard count.
- The `/md2vid` skill is the sole synthesis orchestrator. There is no `md2vid audio` command.
- Never fall back to `say`, provider auto-selection, or a cloud provider silently.
- Run `md2vid narration-check` before synthesis. After explicit Kokoro `am_michael` synthesis through `/media-use`, run `md2vid transcribe` before authoring visual beats.
- A versioned request requires fresh matching `narration_evidence.json` before plan, build, regroup, or verify. If narration changes, re-synthesize and transcribe before regenerating cues, captions, bindings, and render evidence.

Use this complete order:

```text
source coverage
  → storyboard
  → spoken narration script
  → md2vid narration-check
  → explicit Kokoro am_michael synthesis through /media-use
  → md2vid transcribe
  → visual_beats.json
  → npm run plan
  → cue-bound visual authoring
  → npm run build + npm run check
  → listening + visual review
  → render
```

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
- The WAV sample extent is authoritative: `sampleFrames = dataBytes / blockAlign`, and `duration_s` must exactly equal `floor(sampleFrames / sampleRate, 6 decimal places)`. Never round this value upward or trust a provider/JSON duration over the WAV.
- `words` contains word-level `text`, `start`, and `end` timings.

### Word-timing integrity

- Word timings must be finite, ordered, non-overlapping, and satisfy `0 <= start <= end <= duration_s` for every voice.
- On supported Darwin/Linux hosts, md2vid opens the final source path with `O_NOFOLLOW | O_NONBLOCK`, immediately rejects nonregular files, and reads only after `fstat`. Final-component symlinks are kernel-rejected; static intermediate symlinks are rejected by component checks.
- md2vid records component and file identities before open and checks them after open and after reading. This detects ordinary cooperative replacements or changes on a best-effort basis, but it is not race-free confinement against an adversarial swap-and-restore writer: Node core exposes no descriptor-relative `openat`/`openat2` traversal on these hosts. Keep the project tree quiescent, or modify it cooperatively, while md2vid snapshots inputs. No native addon or system helper is required.
- After a snapshot succeeds, its downstream bytes are immutable: the snapshot drives duration validation, transcription input, build staging, and SHA-256 comparison with emitted framework assets. `md2vid transcribe` snapshots every WAV before provider calls, runs providers against a private temporary snapshot tree, replaces stale JSON durations with the safely floored WAV duration, and writes all voice updates together only after every transcription succeeds. The snapshot tree is removed on success or failure.
- `md2vid verify` requires each emitted HyperFrames `assets/voice/...` or Remotion `public/assets/voice/...` WAV to be a regular no-follow file with the same safe duration and exact bytes as its validated source snapshot.
- At the transcription boundary only, a provider final-word overrun is bounded to the safe WAV duration: an end past the WAV is clamped, and a final word that starts past the WAV is shifted back into the remaining valid interval. This does not extend `duration_s` or the WAV duration.
- Negative, non-finite, inverted, overlapping, empty, out-of-duration, or WAV-duration-mismatched metadata is malformed. `md2vid build` and `md2vid verify` fail before emitting output, identifying the `audio_meta.json` path, voice ID, expected safe WAV duration, and actual metadata duration; word failures also identify the word ID or index.

## Captions

Captions are a designed layer, not raw transcript output. The default word-level grouping produces lines that are too short (~2 words) to read comfortably.

- **Target ~50–56 characters (~6–7 words) per caption line.** One readable phrase, not a single word and not a full paragraph.
- **Split only at sentence or clause boundaries.** Never break mid-clause or orphan a 1–2 word tail onto its own line. Balance long sentences into even lines.
- **Never merge across frame boundaries.** A caption line belongs to exactly one frame.
- **Preserve every word's original timing.** Regrouping changes only which words share a line — never the timestamps.
- **Keep all caption artifacts in sync.** `caption_groups.json`, the baked `var GROUPS` in standalone `compositions/captions.html`, and the embedded `captions-template` in `index.html` must match. The composed renderer uses the embedded template. `md2vid regroup <dir> --max-chars 54` stages, verifies, and atomically promotes all three.

### Caption visual style

The default subtitle look is a **plain bottom subtitle**, not a lifted card. The canonical skin lives at `.hyperframes/caption-skin.html` in each generated HyperFrames project (see `/md2vid` Step 8).

- **No card.** Transparent background — no fill, no border, no shadow, no radius.
- **Karaoke highlight, retained.** Three word states track the voice: upcoming words use a readable ink/canvas mix (`--cap-ink` @61%, meeting the 4.5:1 default contrast gate across the supported parchment grounds), the word being spoken reads in full ink under a 2px coral underline (`--cap-accent`), and spoken words settle to full ink with the underline cleared. The active word also gets a subtle scale pop. A faint cream halo (`text-shadow`) keeps the text legible over frame content.
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

HyperFrames projects declare the static theme gate in `output.config.json`:

```json
{
  "visualContract": {
    "version": 1,
    "projectTheme": "light",
    "allowMixedThemes": false,
    "allowLegacyThemeInference": false
  }
}
```

Every authored frame must declare `data-frame-theme="light"` or `"dark"`. Missing metadata fails by default. `allowLegacyThemeInference: true` is an explicit migration-only compatibility setting that downgrades missing declarations to warnings; an absent or malformed `visualContract` does not enable legacy inference.

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
- [ ] `caption_groups.json`, standalone `compositions/captions.html`, and the embedded `captions-template` in `index.html` have identical `GROUPS`.
- [ ] Captions use the plain bottom-subtitle style (transparent, one flat ink color, smaller, bottom-anchored) — no cream card / coral karaoke unless the user asked for it.
- [ ] No content sits under the reserved caption band (bottom ~14% / ~150px @1080).
- [ ] Frame 1 is an intro with an agenda; the final frame is a recap.
- [ ] Each frame ends on a >= 0.5s held landing.
- [ ] The visual focal, narration, and caption carry the same beat (the expression triad).
- [ ] The final duration matches the content needs, not a preset.
- [ ] `CLAUDE.md` and `AGENTS.md` each @import `.md2vid/standards/hyperframes.md` (no pasted boilerplate).
- [ ] The rendered video passes HyperFrames lint, validate, and inspect checks.
- [ ] `md2vid verify <dir>` passes.
