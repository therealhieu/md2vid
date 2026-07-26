// index.mjs — assembles the HyperFrames adapter object from its parts.
//
// An adapter is { name, emit, scaffold, verify }. The registry (frameworks/index.mjs)
// maps a framework name to one of these; scripts dispatch off config.framework.
//
import { emit, preflight } from "./emit.ts";
import { verify, verifyHyperframesCaptionArtifact } from "./verify.ts";
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
  verify,
};
export default adapter;
