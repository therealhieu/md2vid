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
- Each content frame registers exactly one paused timeline under its own `data-composition-id`.
- Styles and scripts for sub-compositions stay inside the `<template>` so HyperFrames transports them.

## Allowed content

Content frames may define local visuals, cards, charts, diagrams, and motion. They may use theme tokens exposed by the shell contract for color harmony, but they must not duplicate shell furniture.
