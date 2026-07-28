import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  promoteManagedFiles,
  type ManagedFileTransactionDependencies,
} from "../../scripts/managed_file_transaction.ts";
import { HYPERFRAMES_VERSION } from "../../scripts/dependency_versions.ts";

export const PINNED_HYPERFRAMES_VERSION = HYPERFRAMES_VERSION;

const STUDIO_ANCHOR_1 = "let l=!1;const c=()=>{if(Qn.getState().isEditMode||l)return;";
const STUDIO_PATCH_1 = "let l=!1,hfLast=null;const c=()=>{if(Qn.getState().isEditMode||l)return;";
const STUDIO_ANCHOR_2 = "if(!g)return;l=!0;const A=g;fetch(";
const STUDIO_PATCH_2 = "if(!g)return;if(hfLast===g)return;hfLast=g;l=!0;const A=g;fetch(";

export interface PinnedHyperframesInstallation {
  packageRoot: string;
  cliEntry: string;
  version: string;
}

export interface HyperframesPatchResult {
  studioBundle: string;
  captionLoopChanged: boolean;
}

export interface HyperframesPatchDependencies {
  writeStagedFile?: typeof writeFileSync;
  promotion?: ManagedFileTransactionDependencies;
}

export interface HyperframesPatchState {
  studioBundle: string;
  captionLoopApplied: boolean;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let offset = 0;
  while ((offset = haystack.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function replaceExact(source: string, anchor: string, patch: string, label: string): {
  body: string;
  changed: boolean;
} {
  const patchCount = countOccurrences(source, patch);
  const anchorCount = countOccurrences(source, anchor);
  if (patchCount === 1) {
    if (anchorCount !== 0) {
      throw new Error(`${label} already patched but anchor matched ${anchorCount} time(s), expected 0`);
    }
    return { body: source, changed: false };
  }
  if (patchCount !== 0) {
    throw new Error(`${label} patch marker matched ${patchCount} time(s), expected 1`);
  }
  if (anchorCount !== 1) {
    throw new Error(`${label} anchor matched ${anchorCount} time(s), expected 1`);
  }
  return { body: source.replace(anchor, patch), changed: true };
}

function patchStudioSource(source: string): { body: string; changed: boolean } {
  const first = replaceExact(source, STUDIO_ANCHOR_1, STUDIO_PATCH_1, "caption-loop anchor-1");
  const second = replaceExact(first.body, STUDIO_ANCHOR_2, STUDIO_PATCH_2, "caption-loop anchor-2");
  return { body: second.body, changed: first.changed || second.changed };
}

function resolveStudioBundle(cliEntry: string): string {
  const assetsDir = join(dirname(cliEntry), "studio", "assets");
  const candidates = readdirSync(assetsDir)
    .filter((name) => name.startsWith("index-") && name.endsWith(".js"))
    .map((name) => join(assetsDir, name));
  const hits = candidates.filter((path) => {
    const source = readFileSync(path, "utf8");
    return [STUDIO_ANCHOR_1, STUDIO_PATCH_1, STUDIO_ANCHOR_2, STUDIO_PATCH_2]
      .some((needle) => source.includes(needle));
  });
  if (hits.length !== 1) {
    throw new Error(
      `caption-loop bundle matched ${hits.length} file(s), expected 1 in ${assetsDir}`,
    );
  }
  return hits[0];
}

const LOCK_WAIT_MS = 10_000;
const LOCK_STALE_MS = 30_000;
const sleepArray = new Int32Array(new SharedArrayBuffer(4));

function sleepSync(milliseconds: number): void {
  Atomics.wait(sleepArray, 0, 0, milliseconds);
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function staleLock(lockPath: string): boolean {
  try {
    const owner = JSON.parse(readFileSync(join(lockPath, "owner.json"), "utf8")) as {
      pid?: unknown;
    };
    if (typeof owner.pid === "number" && Number.isSafeInteger(owner.pid) && owner.pid > 0) {
      return !processExists(owner.pid);
    }
    return Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS;
  } catch {
    try {
      return Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS;
    } catch {
      return false;
    }
  }
}

function withPatchLock<T>(packageRoot: string, operation: () => T): T {
  const lockPath = join(packageRoot, ".md2vid-patch-lock");
  const deadline = Date.now() + LOCK_WAIT_MS;
  let acquired = false;
  try {
    for (;;) {
      try {
        mkdirSync(lockPath);
        acquired = true;
        writeFileSync(join(lockPath, "owner.json"), `${JSON.stringify({ pid: process.pid })}\n`);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (staleLock(lockPath)) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
        if (Date.now() >= deadline) {
          throw new Error(`timed out waiting for patch lock ${lockPath}`);
        }
        sleepSync(25);
      }
    }
    return operation();
  } finally {
    if (acquired) rmSync(lockPath, { recursive: true, force: true });
  }
}

export function readPinnedHyperframesPatchState(
  installation: PinnedHyperframesInstallation,
): HyperframesPatchState {
  const studioBundle = resolveStudioBundle(installation.cliEntry);
  const studioSource = readFileSync(studioBundle, "utf8");
  return {
    studioBundle,
    captionLoopApplied: studioSource.includes(STUDIO_PATCH_1) &&
      studioSource.includes(STUDIO_PATCH_2),
  };
}

export function ensurePinnedHyperframesPatches(
  installation: PinnedHyperframesInstallation,
  dependencies: HyperframesPatchDependencies = {},
): HyperframesPatchResult {
  if (installation.version !== PINNED_HYPERFRAMES_VERSION) {
    throw new Error(
      `expected hyperframes@${PINNED_HYPERFRAMES_VERSION}, found ${installation.version}`,
    );
  }

  return withPatchLock(installation.packageRoot, () => {
    const studioBundle = resolveStudioBundle(installation.cliEntry);
    const studio = patchStudioSource(readFileSync(studioBundle, "utf8"));
    const result = { studioBundle, captionLoopChanged: studio.changed };
    if (!studio.changed) return result;

    const stagingRoot = mkdtempSync(join(installation.packageRoot, ".md2vid-patch-stage-"));
    try {
      const target = relative(installation.packageRoot, studioBundle);
      const staged = join(stagingRoot, target);
      mkdirSync(dirname(staged), { recursive: true });
      (dependencies.writeStagedFile ?? writeFileSync)(staged, studio.body);
      const promoted = promoteManagedFiles(
        installation.packageRoot,
        stagingRoot,
        [{ target, staged }],
        dependencies.promotion,
      );
      if (
        promoted.retainedBackups.length > 0 ||
        promoted.uncertainBackups.length > 0 ||
        promoted.cleanupErrors.length > 0
      ) {
        throw new Error(
          `patch promotion cleanup was incomplete: ${[
            ...promoted.retainedBackups,
            ...promoted.uncertainBackups,
            ...promoted.cleanupErrors.map((error) => error.message),
          ].join(", ")}`,
        );
      }
      return result;
    } finally {
      rmSync(stagingRoot, { recursive: true, force: true });
    }
  });
}

export function patchPinnedStudioBundleSource(source: string): string {
  return patchStudioSource(source).body;
}
