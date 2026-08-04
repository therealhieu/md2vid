import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureRuntime, scaffoldSpec } from "../scaffold.ts";

function createScaffold(): string {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-scaffold-"));
  ensureRuntime(tmp, "remotion");
  return tmp;
}

function readTextTree(dir: string): string {
  if (!existsSync(dir)) return "";
  return readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? readTextTree(path) : readFileSync(path, "utf8");
    })
    .join("\n");
}

test("remotion ensureRuntime writes missing project runtime into an existing dir", () => {
  const tmp = createScaffold();
  try {
    for (const rel of [
      "remotion.config.ts", "tsconfig.json", "render.ts", ".gitignore",
      join("src", "index.ts"), join("src", "Root.tsx"),
      join("src", "Video.tsx"), join("src", "Captions.tsx"), join("src", "types.ts"),
      join("src", "VisualBeats.tsx"), join("src", "theme.ts"), join("src", "fonts.ts"), join("src", "primitives.tsx"),
    ]) {
      assert.ok(existsSync(join(tmp, rel)), `scaffold wrote ${rel}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("default Remotion scaffold is content-neutral", () => {
  const dir = createScaffold();
  try {
    const video = readFileSync(join(dir, "src", "Video.tsx"), "utf8");
    assert.match(video, /const SCENES: Record<string, React\.FC<SceneProps>> = \{\};/);
    assert.match(video, /TitleCard opacity/);

    const tree = readTextTree(join(dir, "src"));
    for (const forbidden of [
      "Hash table",
      "DATA STRUCTURES",
      "LookupFlowScene",
      "CollisionsScene",
      "LoadFactorScene",
    ]) {
      assert.doesNotMatch(tree, new RegExp(forbidden, "i"));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("remotion ensureRuntime preserves authored Video.tsx and scenes", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-authored-"));
  try {
    const video = join(tmp, "src", "Video.tsx");
    const scene = join(tmp, "src", "scenes", "CustomScene.tsx");
    mkdirSync(join(tmp, "src", "scenes"), { recursive: true });
    writeFileSync(video, "// authored video\n");
    writeFileSync(scene, "// authored scene\n");

    ensureRuntime(tmp, "remotion");
    ensureRuntime(tmp, "remotion");

    assert.equal(readFileSync(video, "utf8"), "// authored video\n");
    assert.equal(readFileSync(scene, "utf8"), "// authored scene\n");
    assert.ok(existsSync(join(tmp, "src", "Root.tsx")));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("Remotion scaffold ships local beat helpers and cue-first next steps", () => {
  const tmp = createScaffold();
  try {
    const visualBeats = readFileSync(join(tmp, "src", "VisualBeats.tsx"), "utf8");
    const types = readFileSync(join(tmp, "src", "types.ts"), "utf8");
    const video = readFileSync(join(tmp, "src", "Video.tsx"), "utf8");
    const root = readFileSync(join(tmp, "src", "Root.tsx"), "utf8");
    const spec = scaffoldSpec("remotion");
    const nextSteps = spec.nextSteps.join("\n");

    assert.deepEqual(spec.outputConfig, { framework: "remotion" }, "do not add unused Remotion render config");
    assert.deepEqual(spec.nextSteps, [
      "npm install",
      "review audio_request.json.example and author the spoken script",
      "materialize audio_request.json with explicit effective narration settings",
      "run md2vid narration-check .",
      "verify Kokoro readiness and generate fresh WAVs through /media-use",
      "run npm run transcribe",
      "fill video.config.json voice-id -> frame-slug mappings",
      "transcribe → author visual-beats v2 → plan → inspect coverage intervals → bind semantic targets → build → verify continuous coverage → review → render",
      "author visual_beats.json v2 with a static opening focal, body states, and a final frame-end landing",
      "run npm run plan and inspect build/visual_timing.json coverage intervals",
      "bind semantic targets through visual_bindings.json plus BeatState/BeatReveal scenes",
      "run npm run build",
      "run npm run check before still, studio, preview, or render",
      "run npm run still or npm run studio for review",
      "run npm run render after review",
    ]);
    assert.match(root, /export const FPS = 30;/);
    assert.match(root, /fps=\{FPS\}/);
    assert.match(visualBeats, /VisualBeatProvider/);
    assert.match(visualBeats, /BeatState/);
    assert.match(visualBeats, /BeatReveal/);
    assert.match(types, /ResolvedVisualStateV2/);
    assert.match(types, /RuntimeVisualBindingV2/);
    assert.match(types, /ResolvedCoverageExemption/);
    assert.match(types, /visualCoverageExemptions\?: ResolvedCoverageExemption\[\]/);
    assert.match(types, /cueWordIndex\?: number/);
    assert.match(types, /startFrame: number/);
    assert.match(types, /endFrame: number/);
    assert.match(types, /visualBeats\?: ResolvedVisualBeat\[\]/);
    assert.match(types, /visualBindings\?: Record<string, RuntimeVisualBinding\[\]>/);
    assert.match(video, /VisualBeatProvider/);
    assert.match(nextSteps, /visual_beats\.json v2/);
    assert.match(nextSteps, /npm run plan and inspect build\/visual_timing\.json/);
    assert.match(nextSteps, /BeatState\/BeatReveal/);
    assert.ok(nextSteps.indexOf("visual_beats.json v2") < nextSteps.indexOf("BeatState/BeatReveal"));
    assert.doesNotMatch(readTextTree(join(tmp, "src")), /md2vid-public|frameworks\/remotion/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
