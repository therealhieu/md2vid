# HyperFrames Composition Project

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

1. Review the generated `audio_request.json.example`, then prepare `audio_meta.json` and `assets/voice/*.wav` through `/md2vid` and `/hyperframes-media` or an external TTS provider.
2. Use meaningful, unique voice IDs. Their `voices[]` array order controls frame sequence; map each ID to a visual slug in `video.config.json.slugs`.
3. Author `compositions/frames/*.html` for those slugs.
4. Run `npm run build`.
5. Run `npm run check` before preview or render.
6. Run `npm run dev` for review; render only after review.

The generated scripts are:

```json
{
  "build": "md2vid build . && md2vid regroup . --max-chars 54",
  "transcribe": "md2vid transcribe .",
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

## GSAP source

New generated projects use `https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js` through `output.config.json` → `gsapSrc`. This default requires network access during preview and render. md2vid does not copy GSAP runtime bytes. For offline use, supply your own local GSAP file and set `gsapSrc` to a canonical project-root-relative path such as `assets/gsap/gsap.min.js`. Use that exact unchanged string in every standalone authored frame and in standalone `compositions/captions.html`; HyperFrames resolves it from the project root, so never rewrite it as `../` or `../../` traversal.

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
