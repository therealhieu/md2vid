// index.mjs — the framework registry. The extension point: adding a framework is
// one import + one entry here, with no change to engine/ or the dispatch scripts.
//
// Each value is an adapter { name, emit, scaffold, verify }. Scripts resolve an
// adapter via getAdapter(config.framework) and call emit/scaffold/verify on it.

import hyperframes from "./hyperframes/index.ts";
import remotion from "./remotion/index.ts";
import type { FrameworkAdapter } from "../engine/types.ts";

export const FRAMEWORKS: Record<string, FrameworkAdapter> = { hyperframes, remotion };

// Resolve an adapter by name (default hyperframes so existing videos with no
// `framework` field are unchanged). Throws on an unknown framework so the
// calling run() can catch it and return an exit code — never exits the process
// itself (that would kill the router/test host mid-dispatch).
export function getAdapter(name = "hyperframes"): FrameworkAdapter {
  const a = FRAMEWORKS[name];
  if (!a) throw new Error(`unknown framework "${name}"`);
  return a;
}
