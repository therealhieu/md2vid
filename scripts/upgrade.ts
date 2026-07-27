#!/usr/bin/env node

import {
  spawnSync,
  type SpawnSyncOptions,
  type SpawnSyncReturns,
} from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseCommand } from "./cli_args.ts";
import { readPackageMetadata, type PackageMetadata } from "./package_root.ts";

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

export interface UpgradeRunDependencies {
  env?: NodeJS.ProcessEnv;
  metaUrl?: string;
  spawn?: UpgradeSpawn;
  realpath?: (path: string) => string;
  exists?: (path: string) => boolean;
  npmCommand?: string;
  nodeCommand?: string;
  log?: (line: string) => void;
  error?: (line: string) => void;
}

const USAGE = "Usage: md2vid upgrade";

function runInheritedChild(
  label: string,
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  spawn: UpgradeSpawn,
): void {
  let child: SpawnSyncReturns<Buffer>;
  try {
    child = spawn(command, args, { env, shell: false, stdio: "inherit" });
  } catch (error) {
    throw fail(`failed to start ${label}: ${errorMessage(error)}`);
  }
  const problem = childFailure(label, child);
  if (problem) throw fail(problem);
}

export function run(
  argv: string[],
  dependencies: UpgradeRunDependencies = {},
): number {
  const log = dependencies.log ?? console.log;
  const reportError = dependencies.error ?? console.error;
  const parsed = parseCommand({
    command: "upgrade",
    usage: USAGE,
    options: {},
    minPositionals: 0,
    maxPositionals: 0,
  }, argv);
  if (parsed.kind === "help") {
    log(USAGE);
    return 0;
  }
  if (parsed.kind === "error") {
    reportError(parsed.message);
    reportError(parsed.usage);
    return 2;
  }
  const env = dependencies.env ?? process.env;
  const spawn = dependencies.spawn ?? spawnSync;
  const realpath = dependencies.realpath ?? realpathSync;
  const exists = dependencies.exists ?? existsSync;
  const npmCommand = dependencies.npmCommand ?? "npm";
  const nodeCommand = dependencies.nodeCommand ?? process.execPath;
  try {
    const before = readPackageMetadata(dependencies.metaUrl ?? import.meta.url);
    const installation = resolveGlobalInstallation(before, env, {
      spawn,
      realpath,
      npmCommand,
    });
    runInheritedChild(
      "npm install --global md2vid@latest",
      npmCommand,
      ["install", "--global", `${before.name}@latest`],
      env,
      spawn,
    );
    if (!exists(installation.cliEntry)) {
      throw fail(`invalid updated package: missing CLI at ${installation.cliEntry}`);
    }
    let after: PackageMetadata;
    try {
      after = readPackageMetadata(pathToFileURL(installation.cliEntry).href);
    } catch (error) {
      throw fail(`invalid updated package: ${errorMessage(error)}`);
    }
    runInheritedChild(
      "md2vid install-skill",
      nodeCommand,
      [installation.cliEntry, "install-skill"],
      env,
      spawn,
    );
    log(`OK upgraded md2vid ${before.version} → ${after.version}`);
    log("OK refreshed Claude skill");
    return 0;
  } catch (error) {
    const detail = errorMessage(error);
    reportError(detail.startsWith("FAIL [upgrade]:") ? detail : `FAIL [upgrade]: ${detail}`);
    return 1;
  }
}
