// index.mjs — assembles the HyperFrames adapter object from its parts.
//
// An adapter is { name, emit, scaffold, verify }. The registry (frameworks/index.mjs)
// maps a framework name to one of these; scripts dispatch off config.framework.
//
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emit, preflight } from "./emit.ts";
import { resolveVerificationFps, verify, verifyHyperframesCaptionArtifact } from "./verify.ts";
import { ensureRuntime, scaffoldSpec, writeScaffoldRuntime } from "./scaffold.ts";
import type { FrameworkAdapter } from "../../engine/types.ts";

const adapter: FrameworkAdapter = {
  name: "hyperframes",
  scaffoldSpec,
  writeScaffoldRuntime,
  ensureRuntime,
  preflight,
  emit,
  captionArtifactPath: "compositions/captions.html",
  captionIndexArtifactPath: "index.html",
  managedVoiceArtifactPath: "assets/voice",
  verifyCaptionArtifact: verifyHyperframesCaptionArtifact,
  bindingManifestPath: "build/visual_bindings.json",
  collectVisualBindingInputs: ({ plan, videoDir }) => plan.frames.map((frame) => ({
    path: `compositions/frames/${frame.slug}.html`,
    bytes: readFileSync(join(videoDir, "compositions", "frames", `${frame.slug}.html`)),
  })),
  resolveVerificationFps,
  verify(context, sharedDir, options) {
    if (typeof context === "string") return verify(context, sharedDir, options);
    return verify(context);
  },
};
export default adapter;
