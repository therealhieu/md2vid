// index.ts — assembles the Remotion adapter lifecycle from its implemented methods.
//
// scaffoldSpec declares the project contract; writeScaffoldRuntime and ensureRuntime
// install runtime templates only when files are missing, preserving authored sources.
// emit serializes build plans and stages narration through the adapter; verify checks
// the resulting Remotion inputs without entering the heavy render path.

import { emit, preflight } from "./emit.ts";
import { ensureRuntime, scaffoldSpec, writeScaffoldRuntime } from "./scaffold.ts";
import { verify, verifyRemotionCaptionArtifact } from "./verify.ts";
import type { FrameworkAdapter } from "../../engine/types.ts";

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
  resolveVerificationFps() {
    return 30;
  },
  verify(context, sharedDir, options) {
    if (typeof context === "string") return verify(context, sharedDir, options);
    return verify(context.videoDir, context.sharedDir, {
      voiceSnapshots: context.voiceSnapshots,
    });
  },
};
export default adapter;
