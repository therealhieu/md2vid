# HyperFrames Composition Project

<!-- md2vid-continuous-visual-coverage: 2 -->

## Skills — USE THESE FIRST

**Always invoke the relevant skill before writing or modifying compositions.** Skills encode framework-specific patterns (e.g., `window.__timelines` registration, `data-*` attribute semantics, shader-compatible CSS rules) that are NOT in generic web docs. Skipping them produces broken compositions.

**Doing anything with HyperFrames?** Start at `/hyperframes` — it tells you what HyperFrames can do and which skill or workflow handles your intent (make a video, TTS / BGM, prep footage, author / animate, render, install blocks), and routes every "make me a video" request to the right workflow. Read it first, especially when there's no project context to orient you. The video workflows it routes to:

- `/product-launch-video` — a **product** URL or brief / script → 60-90s product launch / SaaS / promo video.
- `/website-to-video` — a **general** website / URL → a video _of_ the site (tour / showcase / social clip from captured visuals); a product **launch / promo** is `/product-launch-video`.
- `/faceless-explainer` — arbitrary text (topic / article / notes), **no URL, no website capture** → 60-90s faceless explainer.
- `/embedded-captions` — an existing talking-head video (MP4) → the same footage with captions / subtitles added (rail + embed, or pure-cinematic embed); the footage itself is untouched.
- `/talking-head-recut` — an existing talking-head / interview / podcast video (MP4) → the same footage **packaged with designed graphic overlays** (kinetic titles, lower-thirds, data callouts, pull-quotes, side panels, pip) synced to the transcript; the clip plays unchanged underneath. (Plain captions/subtitles → `/embedded-captions`.)
- `/pr-to-video` — a GitHub PR (URL / `owner/repo#N` / "this PR") → 30-90s code-change explainer (changelog / feature reveal / fix / refactor).
- `/motion-graphics` — a short (typically under 10s) design-led **motion graphic**, motion-is-the-message, no narration: kinetic type, a stat / number count-up, a chart, a logo sting, a lower-third / overlay, or an animated tweet / headline / captured-page highlight; rendered to MP4 or a transparent overlay. Longer / narrated / custom → `/general-video`.
- `/general-video` — fallback for any other video (title card, longer brand / sizzle reel, multi-scene montage, static loop, custom composition); the original hyperframes authoring flow, any length.

**Porting an existing composition?** `/remotion-to-hyperframes` translates a Remotion (React) composition into HyperFrames HTML — a source migration, separate from the creation workflows above.

The domain skills (`/hyperframes-core`, `/hyperframes-animation`, `/hyperframes-creative`, `/hyperframes-cli`, `/hyperframes-media`, `/hyperframes-registry`) and the full capability map live inside `/hyperframes` — it is the single source of truth for which skill handles which intent.

> **Tailwind v4 projects** (`hyperframes init --tailwind`): see `/hyperframes-core` → `references/tailwind.md`.

> **Skills not available or need updating?** Run `npx skills add heygen-com/hyperframes`
> and restart the agent session so the new skills load.

## Commands

```bash
npm run build        # md2vid build . + caption regrouping
npm run check        # md2vid verify + lint + validate + inspect
npm run dev          # start preview after check (long-running; keep it alive in background)
npm run render       # render to MP4 only after review
npm run publish      # publish and get a shareable link
md2vid hyperframes lint --verbose  # include info-level findings
md2vid hyperframes lint --json     # machine-readable output for CI
md2vid hyperframes docs <topic>    # reference docs in terminal
```

The npm `postinstall` normally applies the required caption-loop patch to the pinned HyperFrames Studio bundle. npm policies such as `allowScripts` may block that lifecycle script and emit a warning; the warning is nonfatal when commands succeed. Every `md2vid hyperframes <command>` proxy invocation self-heals the caption-loop patch before running the package-owned CLI. Generated `check`, `dev`, and `render` scripts therefore recover automatically when postinstall did not run.

## First run

Both framework adapters consume the same neutral narration artifacts: `audio_request.json`, source WAVs, `audio_meta.json`, and (for versioned requests) `narration_evidence.json`. The neutral narration contract owns provider and voice policy; this framework document does not select or synthesize a voice. Matching evidence freshness is required before plan, build, regroup, or verify.

1. Review the generated `audio_request.json.example`, author the spoken narration script, and materialize `audio_request.json` through the neutral narration workflow.
2. Run `md2vid narration-check .` before synthesis.
3. Complete the neutral narration workflow to prepare fresh WAVs and `audio_meta.json`, then run `npm run transcribe` unconditionally. Use meaningful, unique voice IDs; their `voices[]` array order controls frame sequence, and map each ID to a visual slug in `video.config.json.slugs`.
4. Author `visual_beats.json` against the transcribed WAV words.
5. Run `npm run plan` to resolve those anchors before visual authoring.
6. Author beat-bound `compositions/frames/*.html` for those slugs; bind every narrated target to its beat ID rather than copying resolved seconds.
7. Run `npm run build`.
8. Run `npm run check` before preview or render.
9. Run `npm run dev` for listening and visual review; render only after review.

The generated scripts are:

```json
{
  "build": "md2vid build . && md2vid regroup . --max-chars 54",
  "transcribe": "md2vid transcribe .",
  "plan": "md2vid plan .",
  "verify": "md2vid verify .",
  "check": "md2vid verify . && md2vid hyperframes lint && md2vid hyperframes validate && md2vid hyperframes inspect",
  "dev": "md2vid hyperframes preview --no-open",
  "render": "md2vid hyperframes render",
  "publish": "md2vid hyperframes publish"
}
```

### Existing generated projects

md2vid does not auto-rewrite existing generated `package.json` files. Replace old operational HyperFrames scripts with the package-owned proxy manually:

```json
{
  "scripts": {
    "build": "md2vid build . && md2vid regroup . --max-chars 54",
    "transcribe": "md2vid transcribe .",
    "verify": "md2vid verify .",
    "check": "md2vid verify . && md2vid hyperframes lint && md2vid hyperframes validate && md2vid hyperframes inspect",
    "dev": "md2vid hyperframes preview --no-open",
    "render": "md2vid hyperframes render",
    "publish": "md2vid hyperframes publish"
  }
}
```

> **`npm run dev` is a long-running server, not a one-shot command.** It blocks until stopped.
> In Claude Code, always run it with `run_in_background: true`. Never run it as a foreground
> command — it will time out and the server will die, breaking the browser preview.

## Cue-bound visual timing

Plan narration cues before authoring visual motion:

```text
prepare/transcribe audio → author visual_beats.json v2 → npm run plan
  → inspect resolved coverage intervals → bind cue-bound visuals → npm run build
  → continuous verify → review → render
```

`visual_beats.json` is neutral input. `npm run plan` resolves its phrase, word-index, or frame-start anchors before HTML authoring. Every narrated node, row, card, code line, workflow station, opening state, and final landing binds to a beat ID; authored frames never copy the resolved seconds. Continuous coverage requires a focal semantic state from the first spoken word through `frameDur`. Long static focal states are valid; captions, shell, background, logos, and headings are not focal coverage by themselves.

The v2 binding manifest records raw authored frame-source digests for every planned `compositions/frames/<slug>.html` plus the canonical neutral plan digest. Verification rejects stale evidence after authored HTML or coverage-relevant plan changes, so run a full build after semantic edits. HyperFrames authored semantic duration remains `voiceDur`; host retention through `frameDur` is what keeps the final focal visible during the held landing.

### Declarative bindings

Use a supported declarative target for the standard path:

```html
<div data-md2vid-beat="opening-context" data-md2vid-enter="none" data-md2vid-coverage="planned">
  Opening context
</div>
<li id="reserve-step" data-md2vid-beat="reserve" data-md2vid-enter="rise" data-md2vid-duration="0.48" data-md2vid-coverage="planned">
  Reserve value
</li>
```

Supported entrance tokens are `fade`, `rise`, `slide-left`, `scale`, and `none`. md2vid owns the generated paused, seek-safe scheduling timeline and writes each observed reveal plus `coverageStart`/`coverageEnd` to `build/visual_bindings.json`. `data-md2vid-coverage="planned"` means the target remains semantically visible until the resolved state end unless an owned semantic exit shortens it.

### Custom bindings

A custom motion path declares inert JSON and uses the owned helper that schedules at the resolved beat:

```html
<script type="application/json" data-md2vid-custom-bindings>
{"bindings":[{"beat":"execute","target":"#execute-step","method":"from","duration":0.7}]}
</script>
<script>
  const timing = window.__md2vidTiming.forFrame("reserve-flow");
  timing.from(tl, "execute", "#execute-step", { opacity: 0, y: 36, duration: 0.7 });
</script>
```

The `data-md2vid-custom-bindings` script is inert machine-readable declaration, not executable scheduling code. The owned helper validates its declared beat/target/method, owns the actual timeline position, and records the same `build/visual_bindings.json` evidence. It must not return numeric semantic timestamps for authors to reuse freely. If semantic visibility should end before the planned interval, use the framework-owned semantic exit helper so runtime visibility and manifest evidence agree.

Keep one paused registered parent timeline per composition. Its authored and generated child timelines must seek to the same state whether playback is sequential, directly sought, or sought backward then forward. The semantic composition duration must match `voiceDur`; the emitted host duration must match `frameDur`. The outer host provides owned host retention through `frameDur`; do not freehand-hide the final focal during the held landing.

### Render profiles

`md2vid hyperframes render` consumes md2vid policy flags before spawning HyperFrames:

```text
--profile final|draft|gif
--allow-low-fps
```

The final profile defaults to 30 FPS and enforces a minimum of 24 FPS for MP4/MOV unless `--allow-low-fps` is explicit. Draft and GIF profiles permit intentional low rates. `--quality` is a HyperFrames encoding setting and does not select the md2vid profile. Successful known-output renders write `<output>.md2vid-render.json` beside the artifact.

## GSAP source

New projects use the exact GSAP version pinned by md2vid, materialized as `https://cdn.jsdelivr.net/npm/gsap@<version>/dist/gsap.min.js` in `output.config.json` → `gsapSrc`. This default requires network access during preview and render. md2vid does not copy GSAP runtime bytes. For offline use, supply your own local GSAP file and set `gsapSrc` to a canonical project-root-relative path such as `assets/gsap/gsap.min.js`. Use that exact unchanged string in every standalone authored frame and in standalone `compositions/captions.html`; HyperFrames resolves it from the project root, so never rewrite it as `../` or `../../` traversal.

Authored frame and source files remain untouched during a full build, while the generated standalone `compositions/captions.html` is regenerated for direct preview. The composed `index.html` loads the configured GSAP source exactly once. The emitter embeds a sanitized template for every authored frame and for generated captions, removes only that exact configured external GSAP script from each embedded copy, then relocates transport-required top-level sibling `<style>` and `<script>` elements into the matching composition root in pre-root → existing-root → post-root order. Unrelated external scripts remain executable inside the root; arbitrary sibling text, comments, and elements are not moved. This keeps authored CSS and timeline registration available when HyperFrames mounts only the root. Hosts backed by embedded templates omit `data-composition-src` so HyperFrames mounts exactly one copy. Standalone authored files under `compositions/frames/` and standalone captions remain byte-unchanged and available for direct preview and inspection. Legacy or manually authored indexes without embedded templates may continue to use `data-composition-src`. Neutral JSON, generated `index.html` and captions, and managed voice assets are staged on the project filesystem, caption-verified, and promoted together with rollback on failure. Caption styles, content, and initialization must all remain inside the `data-composition-id="captions"` root so nested loading cannot discard the runtime setup. Caption regrouping atomically updates `caption_groups.json`, standalone `compositions/captions.html`, and the embedded `captions-template` in `index.html`; verification rejects drift between any of them. Direct `md2vid build <dir> --captions-only` validates the source index before writing and atomically promotes the standalone and embedded caption HTML together.

## Documentation

**For quick reference**, use the local CLI docs command (no network required):

```bash
md2vid hyperframes docs <topic>
```

Topics: `data-attributes`, `gsap`, `compositions`, `rendering`, `examples`, `troubleshooting`

**For full documentation**, discover pages via the machine-readable index — do NOT guess URLs:

```
https://hyperframes.heygen.com/llms.txt
```

## Project Structure

- `index.html` — main composition (root timeline)
- `compositions/` — standalone authored and generated sub-compositions; full md2vid builds embed them in `index.html`, while legacy/manual indexes may reference them via `data-composition-src`
- `meta.json` — project metadata (id, name)
- `transcript.json` — whisper word-level transcript (if generated)

## Linting — ALWAYS RUN AFTER CHANGES

After creating or editing any `.html` composition, **always** run the full check before considering the task complete:

```bash
npm run check
```

Fix all errors before presenting the result. Inspect warnings should be reviewed before rendering.

## Key Rules

1. Every timed element needs `data-start`, `data-duration`, and `data-track-index`
2. Elements with timing **MUST** have `class="clip"` — the framework uses this for visibility control
3. Timelines must be paused and registered on `window.__timelines`:
   ```js
   window.__timelines = window.__timelines || {};
   window.__timelines["composition-id"] = gsap.timeline({ paused: true });
   ```
4. Videos use `muted` with a separate `<audio>` element for the audio track
5. Standalone or legacy sub-compositions may use `data-composition-src="compositions/file.html"`; generated md2vid indexes omit it when the matching embedded template is present
6. Only deterministic logic — no `Date.now()`, no `Math.random()`, no network fetches
