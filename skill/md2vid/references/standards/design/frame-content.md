# HyperFrames Frame Content Contract

Content frames are paired with `compositions/shared/frame-shell.html` by the parent `index.html`.

## Required rules

- Use a transparent root. The shell owns the outer background.
- Keep load-bearing visuals inside the safe area:
  - `--frame-safe-left`
  - `--frame-safe-right`
  - `--frame-safe-top`
  - `--frame-safe-bottom` — must reserve the caption band (~14% of canvas / ~150px @1080) so no load-bearing focal, card, or diagram overlaps a subtitle line.
- No page labels, hairlines, grid, border, persistent QR/glitch, or shell chrome in content frames.
- IDs are prefixed with the frame ID, for example `f01-title`, `f02-token-map`, `f03-flow`.
- Content uses content tracks `0-9`.
- Transition/helper tracks use `10-19`.
- The reusable shell uses track `20`.
- Captions use track `30`.
- Each content frame registers exactly one paused timeline under its own `data-composition-id`. One registered parent timeline may compose generated and authored child timelines; child scheduling must remain deterministic and seek-safe under that parent.
- Semantic focal states use framework-owned binding paths so generated evidence matches runtime behavior: declarative beat bindings or owned helpers for owned semantic activation, and owned semantic exit helpers when coverage intentionally ends before the planned endpoint.
- Do not hide a semantic focal with freehand CSS, GSAP, or React state outside those owned paths in required coverage mode; the verifier can only trust the emitted evidence.
- Keep frame `<style>` and `<script>` elements inside the matching `data-composition-id` root. During embedding, md2vid removes only the exact configured external GSAP script, then relocates any authored top-level sibling `<style>` and `<script>` elements into that root while preserving pre-root → existing-root → post-root order. Unrelated external scripts are retained; arbitrary sibling text, comments, and elements are not transported.

## Allowed content

Content frames may define local visuals, cards, charts, diagrams, and motion. They may use theme tokens exposed by the shell contract for color harmony, but they must not duplicate shell furniture.
