// index.mjs — assembles the HyperFrames adapter object from its parts.
//
// An adapter is { name, emit, scaffold, verify }. The registry (frameworks/index.mjs)
// maps a framework name to one of these; scripts dispatch off config.framework.
//
import { emit } from "./emit.ts";
import { verify } from "./verify.ts";
import { ensureRuntime, scaffoldSpec, writeScaffoldRuntime } from "./scaffold.ts";
import type { FrameworkAdapter } from "../../engine/types.ts";

const adapter: FrameworkAdapter = {
  name: "hyperframes",
  scaffoldSpec,
  writeScaffoldRuntime,
  ensureRuntime,
  emit,
  verify,
};
export default adapter;
