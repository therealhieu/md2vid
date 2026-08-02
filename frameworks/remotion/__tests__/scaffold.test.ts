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
      "review audio_request.json.example and generate narration",
      "run transcription when needed",
      "fill video.config.json voice-id -> frame-slug mappings",
      "author visual_beats.json",
      "npm run plan",
      "author and register cue-bound src/scenes/*.tsx",
      "npm run build",
      "npm run check",
      "npm run still or npm run studio",
      "npm run render after review",
    ]);
    assert.match(root, /export const FPS = 30;/);
    assert.match(root, /fps=\{FPS\}/);
    assert.match(visualBeats, /VisualBeatProvider/);
    assert.match(visualBeats, /BeatReveal/);
    assert.match(types, /visualBeats\?: ResolvedVisualBeat\[\]/);
    assert.match(types, /visualBindings\?: Record<string, RemotionVisualBinding\[\]>/);
    assert.match(video, /VisualBeatProvider/);
    assert.match(nextSteps, /visual_beats\.json/);
    assert.match(nextSteps, /npm run plan/);
    assert.ok(nextSteps.indexOf("visual_beats.json") < nextSteps.indexOf("src/scenes"));
    assert.doesNotMatch(readTextTree(join(tmp, "src")), /md2vid-public|frameworks\/remotion/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
