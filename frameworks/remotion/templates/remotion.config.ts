// remotion.config.ts — Studio/CLI config. The SSR render path (render.ts) sets its
// own options via renderMedia and does NOT read this file; it is here for `npm run studio`.
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
