// render.ts — the SSR render driver. Reads build_plan.json as inputProps, bundles the
// composition, selects it (calculateMetadata sets duration/canvas), and renders MP4.
// `--still` renders a single frame (the render smoke check) instead of the full video.
//
// Run: node render.ts        (full MP4 → out/video.mp4)
//      node render.ts --still (single frame → out/still.jpeg)
// (Node ≥22.18 runs .ts natively — no flag; matches the repo pipeline.)

import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia, renderStill } from "@remotion/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const still = process.argv.includes("--still");
const root = import.meta.dirname;
const publicDir = join(root, "public");
const plan = JSON.parse(readFileSync(join(root, "build_plan.json"), "utf8"));
const inputProps = { plan };

// publicDir is passed explicitly: the entry lives under src/, so Remotion's bundler
// won't auto-detect the project-root public/ where emit() stages the voice wavs.
const serveUrl = await bundle({ entryPoint: join(root, "src", "index.ts"), publicDir });
const composition = await selectComposition({ serveUrl, id: "video", inputProps });

if (still) {
  await renderStill({
    composition, serveUrl, inputProps,
    frame: Math.floor(composition.durationInFrames / 2),
    output: join(root, "out", "still.jpeg"),
  });
  console.log(`OK still: out/still.jpeg (frame ${Math.floor(composition.durationInFrames / 2)})`);
} else {
  await renderMedia({
    composition, serveUrl, inputProps,
    codec: "h264",
    outputLocation: join(root, "out", "video.mp4"),
  });
  console.log("OK render: out/video.mp4");
}
