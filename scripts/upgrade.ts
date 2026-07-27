#!/usr/bin/env node

import {
  spawnSync,
  type SpawnSyncOptions,
  type SpawnSyncReturns,
} from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import type { PackageMetadata } from "./package_root.ts";

export type UpgradeSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptions,
) => SpawnSyncReturns<Buffer>;

export interface GlobalInstallation {
  globalRoot: string;
  packageRoot: string;
  cliEntry: string;
}

export interface GlobalInstallationOperations {
  spawn?: UpgradeSpawn;
  realpath?: (path: string) => string;
  npmCommand?: string;
}

const MANUAL_RECOVERY = [
  "self-upgrade requires a global npm installation",
  "manual recovery: npm install --global md2vid@latest && md2vid install-skill",
].join("; ");

function fail(message: string): Error {
  return new Error(`FAIL [upgrade]: ${message}`);
}

function validationFail(cause: string): Error {
  return fail(`${cause}; ${MANUAL_RECOVERY}`);
}

export function resolveGlobalInstallation(
  metadata: PackageMetadata,
  env: NodeJS.ProcessEnv,
  operations: GlobalInstallationOperations = {},
): GlobalInstallation {
  const spawn = operations.spawn ?? spawnSync;
  const realpath = operations.realpath ?? realpathSync;
  const npmCommand = operations.npmCommand ?? "npm";
  const child = spawn(npmCommand, ["root", "--global"], {
    env,
    shell: false,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const globalRoot = realpath(child.stdout.toString("utf8").trim());
  const packageRoot = realpath(join(globalRoot, metadata.name));
  const runningRoot = realpath(metadata.root);
  if (packageRoot !== runningRoot) {
    throw validationFail("running package does not match npm's global md2vid package");
  }
  return {
    globalRoot,
    packageRoot,
    cliEntry: join(packageRoot, "dist", "bin", "md2vid.js"),
  };
}
