import {
  spawnSync,
  type SpawnSyncOptions,
  type SpawnSyncReturns,
} from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  ensurePinnedHyperframesPatches,
  PINNED_HYPERFRAMES_VERSION,
} from "../frameworks/hyperframes/patches.ts";

export const HYPERFRAMES_VERSION = PINNED_HYPERFRAMES_VERSION;

export interface HyperframesInstallation {
  packageRoot: string;
  packageJsonPath: string;
  cliEntry: string;
  version: string;
}

interface HyperframesPackageJson {
  version?: string;
  bin?: string | Record<string, unknown>;
}

function escapesRoot(root: string, candidate: string): boolean {
  const relativeEntry = relative(root, candidate);
  return relativeEntry === ".." ||
    relativeEntry.startsWith(`..${sep}`) ||
    isAbsolute(relativeEntry);
}

export function resolveHyperframesInstallation(
  metaUrl = import.meta.url,
): HyperframesInstallation {
  const require = createRequire(metaUrl);
  let packageJsonPath: string;
  try {
    packageJsonPath = require.resolve("hyperframes/package.json");
  } catch {
    throw new Error(
      "FAIL [hyperframes-cli]: cannot resolve package-owned hyperframes",
    );
  }

  const pkg = JSON.parse(
    readFileSync(packageJsonPath, "utf8"),
  ) as HyperframesPackageJson;
  if (pkg.version !== HYPERFRAMES_VERSION) {
    throw new Error(
      `FAIL [hyperframes-cli]: expected hyperframes@${HYPERFRAMES_VERSION}, found ${pkg.version ?? "unknown"}`,
    );
  }

  const declared = typeof pkg.bin === "string"
    ? pkg.bin
    : pkg.bin?.hyperframes;
  if (typeof declared !== "string" || declared.length === 0) {
    throw new Error(
      "FAIL [hyperframes-cli]: package metadata is missing bin.hyperframes",
    );
  }

  const declaredPackageRoot = dirname(packageJsonPath);
  const declaredCliEntry = resolve(declaredPackageRoot, declared);
  if (escapesRoot(declaredPackageRoot, declaredCliEntry)) {
    throw new Error(
      "FAIL [hyperframes-cli]: bin.hyperframes escapes the package root",
    );
  }

  let packageRoot: string;
  let cliEntry: string;
  try {
    packageRoot = realpathSync(declaredPackageRoot);
  } catch (error) {
    throw new Error(
      `FAIL [hyperframes-cli]: package root is missing or unreadable: ${errorMessage(error)}`,
    );
  }
  try {
    cliEntry = realpathSync(declaredCliEntry);
  } catch (error) {
    throw new Error(
      `FAIL [hyperframes-cli]: bin.hyperframes is missing or unreadable: ${errorMessage(error)}`,
    );
  }

  if (escapesRoot(packageRoot, cliEntry)) {
    throw new Error(
      "FAIL [hyperframes-cli]: bin.hyperframes escapes the package root",
    );
  }

  return {
    packageRoot,
    packageJsonPath,
    cliEntry,
    version: pkg.version,
  };
}

type HyperframesSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptions,
) => SpawnSyncReturns<Buffer>;

export interface RunHyperframesOptions {
  cwd?: string;
  metaUrl?: string;
  spawn?: HyperframesSpawn;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function runHyperframes(
  args: string[],
  {
    cwd = process.cwd(),
    metaUrl = import.meta.url,
    spawn = spawnSync,
  }: RunHyperframesOptions = {},
): number {
  const installation = resolveHyperframesInstallation(metaUrl);
  try {
    ensurePinnedHyperframesPatches(installation);
  } catch (error) {
    console.error(
      `FAIL [hyperframes-cli]: hyperframes@${HYPERFRAMES_VERSION} patch preflight failed: ${errorMessage(error)}`,
    );
    return 1;
  }

  let result: SpawnSyncReturns<Buffer>;
  try {
    result = spawn(process.execPath, [installation.cliEntry, ...args], {
      cwd,
      stdio: "inherit",
      shell: false,
    });
  } catch (error) {
    console.error(
      `FAIL [hyperframes-cli]: failed to start child: ${errorMessage(error)}`,
    );
    return 1;
  }

  if (result.error) {
    console.error(
      `FAIL [hyperframes-cli]: failed to start child: ${result.error.message}`,
    );
    return 1;
  }
  if (result.signal) {
    console.error(
      `FAIL [hyperframes-cli]: child terminated by ${result.signal}`,
    );
    return 1;
  }
  if (result.status === null) {
    console.error("FAIL [hyperframes-cli]: child exited without a status");
    return 1;
  }
  return result.status;
}
