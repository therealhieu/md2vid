# Remotion

The Remotion adapter renders a neutral `build_plan.json` into a React/Remotion
composition and out to MP4 via the SSR API. It shares the adapter lifecycle
`{ name, scaffoldSpec, writeScaffoldRuntime, ensureRuntime, emit, verify }` with
HyperFrames, so the build/verify dispatch is unchanged: select it with
`"framework": "remotion"` in the output's `output.config.json`.

## Generated-project pipeline

```
md2vid new <slug> --framework remotion
  → creates the complete common md2vid contract and Remotion runtime
    (meta/config/package/docs/standard + render/config/tsconfig/src) before npm install
cd <slug> && npm install
md2vid build <output-dir>
  → engine.plan() writes the sibling shared/build/build_plan.json (neutral IR)
  → remotion.emit(): ensures missing runtime files, writes <output-dir>/build_plan.json,
    stages shared/assets/voice/** as real files under
    <output-dir>/public/assets/voice/**
cd <output-dir>
  npm run typecheck  # strict checking for the generated src/**/*.tsx
  npm run still      # single-frame render smoke (fast, CI-gating)
  npm run render     # full MP4 → out/video.mp4
  npm run studio     # interactive Remotion Studio preview
```

Run the project checks from the generated Remotion output directory. The installed
workflow does not require repository source paths.

## What maps to what

- `canvas` + `totalDuration` → `<Composition>` dimensions + `durationInFrames`
  (set data-driven via `calculateMetadata`, fps = 30).
- `frames[].start`/`frameDur` → `<Sequence>` placement; `frames[].voicePath` →
  `<Audio src={staticFile(...)}>`.
- `captionGroups` → karaoke caption band (`useCurrentFrame()`/`interpolate()`), a
  re-authoring of the HF GSAP timeline — no byte-parity with HF is expected.
- Baseline scenes are minimal IR-driven title cards; rich per-frame visuals are
  hand-authored `.tsx` (future work), not auto-generated.

## Constraints

- All `@remotion/*` packages + `remotion` must share the exact same version.
- The generated project's `src/**` subtree is compiled by Remotion's bundler and
  type-checked through its local `npm run typecheck` command. Run that command from
  `<output-dir>`; no package-template or repository-root compiler path is required.
- CSS transitions are forbidden in Remotion; crossfades use `interpolate()` opacity.
