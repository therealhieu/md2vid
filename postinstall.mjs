#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = process.env.MD2VID_POSTINSTALL_ROOT || dirname(fileURLToPath(import.meta.url));
const compiled = join(packageRoot, "dist", "bin", "md2vid.js");
const source = join(packageRoot, "frameworks", "hyperframes", "patch-studio.ts");
const bundle = process.env.MD2VID_PATCH_STUDIO_BUNDLE;
const args = existsSync(compiled)
  ? [compiled, "patch-studio", ...(bundle ? [bundle] : [])]
  : [source, ...(bundle ? [bundle] : [])];

const result = spawnSync(process.execPath, args, { stdio: "inherit" });
if (result.error) {
  console.error(`FAIL [postinstall]: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) {
  console.error(`FAIL [postinstall]: patch process terminated by ${result.signal}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
