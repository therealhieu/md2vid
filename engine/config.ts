// config.mjs — load + merge the neutral video.config.json with the output-local
// output.config.json. NEUTRAL: this module has no HTML/framework knowledge; it
// only knows the shape of the config files.
//
// The neutral shared/video.config.json carries timing/canvas/slugs and NEVER
// gsapSrc or framework — those are framework-local and live in the output dir's
// output.config.json. We merge (local wins) so downstream consumers see one object.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { VideoConfig } from "./types.ts";

// Load and merge config. `sharedDir` holds the neutral video.config.json;
// `outputDir` (optional) holds the framework-local output.config.json (gsapSrc,
// framework). Throws on a missing neutral config — the caller maps it to a CLI fail.
export function loadConfig(sharedDir: string, outputDir?: string): VideoConfig {
  const configPath = join(sharedDir, "video.config.json");
  if (!existsSync(configPath)) throw new Error(`missing video.config.json — ${configPath}`);
  const neutral = JSON.parse(readFileSync(configPath, "utf8"));

  let local = {};
  if (outputDir) {
    const outConfigPath = join(outputDir, "output.config.json");
    if (existsSync(outConfigPath)) local = JSON.parse(readFileSync(outConfigPath, "utf8"));
  }
  return { ...neutral, ...local };
}
