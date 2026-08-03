// index.ts — assembles the Remotion adapter lifecycle from its implemented methods.
//
// scaffoldSpec declares the project contract; writeScaffoldRuntime and ensureRuntime
// install runtime templates only when files are missing, preserving authored sources.
// emit serializes build plans and stages narration through the adapter; verify checks
// the resulting Remotion inputs without entering the heavy render path.

import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { emit, preflight } from "./emit.ts";
import { ensureRuntime, scaffoldSpec, writeScaffoldRuntime } from "./scaffold.ts";
import { resolveVerificationFps, verify, verifyRemotionCaptionArtifact } from "./verify.ts";
import type { FrameworkAdapter } from "../../engine/types.ts";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const EXCLUDED_SOURCE_DIRS = new Set(["node_modules", "build", "dist"]);

function assertRegularAuthoredInput(videoDir: string, path: string): boolean {
  const absolutePath = join(videoDir, ...path.split("/"));
  if (!existsSync(absolutePath)) return false;
  const stat = lstatSync(absolutePath);
  if (stat.isSymbolicLink()) {
    throw new Error(
      `authored visual input ${path} contains a symlink; replace it with a regular project file and run md2vid build`,
    );
  }
  return stat.isFile();
}

function collectRemotionSourcePaths(videoDir: string, relative = "src"): string[] {
  const directory = join(videoDir, ...relative.split("/"));
  if (!existsSync(directory)) return [];
  const paths: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = `${relative}/${entry.name}`;
    const absolutePath = join(videoDir, ...path.split("/"));
    const stat = lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `authored visual input ${path} contains a symlink; replace it with a regular project file and run md2vid build`,
      );
    }
    if (stat.isDirectory()) {
      if (relative === "src" && EXCLUDED_SOURCE_DIRS.has(entry.name)) continue;
      paths.push(...collectRemotionSourcePaths(videoDir, path));
    } else if (stat.isFile() && SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      paths.push(path);
    }
  }
  return paths;
}

function collectRemotionVisualBindingInputs(videoDir: string) {
  return ["visual_bindings.json", ...collectRemotionSourcePaths(videoDir)]
    .filter((path) => assertRegularAuthoredInput(videoDir, path))
    .sort()
    .map((path) => ({
      path,
      bytes: readFileSync(join(videoDir, ...path.split("/"))),
    }));
}

const adapter: FrameworkAdapter = {
  name: "remotion",
  scaffoldSpec,
  writeScaffoldRuntime,
  ensureRuntime,
  preflight,
  emit,
  captionArtifactPath: "build_plan.json",
  managedVoiceArtifactPath: "public/assets/voice",
  verifyCaptionArtifact: verifyRemotionCaptionArtifact,
  bindingManifestPath: "build/visual_bindings.json",
  collectVisualBindingInputs: ({ videoDir }) => collectRemotionVisualBindingInputs(videoDir),
  resolveVerificationFps,
  verify(context, sharedDir, options) {
    if (typeof context === "string") return verify(context, sharedDir, options);
    return verify(context);
  },
};
export default adapter;
