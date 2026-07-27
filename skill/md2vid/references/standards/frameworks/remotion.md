# Remotion

The Remotion adapter renders a neutral `build_plan.json` into a React/Remotion
composition and out to MP4 via the SSR API. It shares the adapter lifecycle
`{ name, scaffoldSpec, writeScaffoldRuntime, ensureRuntime, emit, verify }` with
HyperFrames, so the build/verify dispatch is unchanged: select it with
`"framework": "remotion"` in the output's `output.config.json`.

## Generated-project pipeline

```text
md2vid new <slug> --framework remotion
cd <slug>
npm install
# Review audio_request.json.example; prepare audio_meta.json + assets/voice/*.wav.
# Author and explicitly register any custom src/scenes/*.tsx.
npm run build
npm run check
npm run still      # fast render smoke
npm run studio     # interactive review
npm run render     # full MP4 only after review → out/video.mp4
```

The scaffold creates the complete common md2vid contract and Remotion runtime before `npm install`. `npm run build` runs `md2vid build .` and caption regrouping: `engine.plan()` writes `shared/build/build_plan.json` in canonical layout, while `remotion.emit()` writes the output-local `build_plan.json` and stages shared WAV files under `public/assets/voice/`. `npm run check` runs `md2vid verify .` before strict TypeScript checking and is required before still, studio, or render. `md2vid verify .` remains available directly.

Run all generated-project commands from the Remotion output directory. The installed workflow does not require repository source paths.

## Default and opt-in scenes

The default `src/Video.tsx` is a content-neutral title card driven only by each plan frame's slug. It contains no example subject matter.

Rich visuals are opt-in and hand-authored. Add scene components under `src/scenes/`, import them into `src/Video.tsx`, and explicitly register each slug in the `SCENES` map. A public hash-table example is available at `examples/hash-table/remotion/` in the repository, but it is not shipped in the npm package and must be copied and adapted deliberately.

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
