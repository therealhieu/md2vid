#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) {
  process.stderr.write("npm_execpath is required to run release:check with the parent npm CLI\n");
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, [npmExecPath, "run", "release:check"], {
    stdio: "inherit",
  });
  if (result.error) {
    process.stderr.write(`failed to execute parent npm CLI: ${result.error.message}\n`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
