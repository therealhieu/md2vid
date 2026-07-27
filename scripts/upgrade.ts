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

function childFailure(
  label: string,
  child: SpawnSyncReturns<Buffer>,
): string | undefined {
  if (child.error) return `failed to start ${label}: ${child.error.message}`;
  if (child.signal) return `${label} terminated by ${child.signal}`;
  if (child.status === null) return `${label} exited without a status`;
  if (child.status !== 0) return `${label} exited with status ${child.status}`;
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function resolveGlobalInstallation(
  metadata: PackageMetadata,
  env: NodeJS.ProcessEnv,
  operations: GlobalInstallationOperations = {},
): GlobalInstallation {
  const spawn = operations.spawn ?? spawnSync;
  const realpath = operations.realpath ?? realpathSync;
  const npmCommand = operations.npmCommand ?? "npm";
  let child: SpawnSyncReturns<Buffer>;
  try {
    child = spawn(npmCommand, ["root", "--global"], {
      env,
      shell: false,
      stdio: ["ignore", "pipe", "inherit"],
    });
  } catch (error) {
    throw validationFail(`failed to start npm root --global: ${errorMessage(error)}`);
  }
  const childProblem = childFailure("npm root --global", child);
  if (childProblem) throw validationFail(childProblem);
  const reportedRoot = child.stdout.toString("utf8").trim();
  if (!reportedRoot) throw validationFail("npm root --global returned an empty path");
  let globalRoot: string;
  let packageRoot: string;
  let runningRoot: string;
  try {
    globalRoot = realpath(reportedRoot);
    packageRoot = realpath(join(globalRoot, metadata.name));
    runningRoot = realpath(metadata.root);
  } catch (error) {
    throw validationFail(
      `could not resolve global npm installation: ${errorMessage(error)}`,
    );
  }
  if (packageRoot !== runningRoot) {
    throw validationFail("running package does not match npm's global md2vid package");
  }
  return {
    globalRoot,
    packageRoot,
    cliEntry: join(packageRoot, "dist", "bin", "md2vid.js"),
  };
}
