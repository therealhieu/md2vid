import {
  existsSync,
  lstatSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export interface ManagedFile {
  target: string;
  staged: string;
}

export interface ManagedFileTransactionDependencies {
  exists?: typeof existsSync;
  lstat?: typeof lstatSync;
  mkdir?: typeof mkdirSync;
  rename?: typeof renameSync;
  remove?: typeof rmSync;
}

export interface ManagedFilePromotionResult {
  retainedBackups: string[];
  cleanupErrors: Error[];
}

type FileStatus = {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
};

type Operation = {
  target: string;
  staged: string;
  backup: string;
  hadOriginal: boolean;
};

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function lstatIfPresent(path: string, lstat: typeof lstatSync): FileStatus | undefined {
  try {
    return lstat(path);
  } catch (error) {
    if (isEnoent(error)) return undefined;
    throw error;
  }
}

function pathEscapes(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

function isStrictlyBeneath(root: string, path: string): boolean {
  return path !== root && !pathEscapes(root, path);
}

function managedTarget(root: string, target: string): string {
  if (isAbsolute(target) || target.includes("\\")) {
    throw new Error(`unsafe managed target: ${target}`);
  }
  const parts = target.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`unsafe managed target: ${target}`);
  }
  const absolute = resolve(root, target);
  if (pathEscapes(root, absolute)) {
    throw new Error(`managed target escapes project root: ${target}`);
  }
  return absolute;
}

function stagedSource(stagingRoot: string, staged: string): string {
  const absolute = resolve(staged);
  if (!isStrictlyBeneath(stagingRoot, absolute)) {
    throw new Error(`staged source escapes staging root: ${staged}`);
  }
  return absolute;
}

function assertNoSymlinkPath(
  root: string,
  path: string,
  kind: "managed target" | "staged source" | "staging root",
  lstat: typeof lstatSync,
): void {
  const rel = relative(root, path);
  const segments = rel === "" ? [] : rel.split(sep);
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    const status = lstatIfPresent(current, lstat);
    if (status?.isSymbolicLink()) {
      throw new Error(`${kind} path contains a symbolic link: ${current}`);
    }
  }
}

function assertDistinctManagedPaths(operations: Operation[]): void {
  const owners = new Map<string, string>();
  for (const [index, operation] of operations.entries()) {
    for (const [path, label] of [
      [operation.target, `target ${index}`],
      [operation.backup, `backup ${index}`],
      [operation.staged, `staged ${index}`],
    ] as const) {
      const prior = owners.get(path);
      if (prior) {
        throw new Error(
          `managed target, backup, and staged paths must be distinct: ` +
            `${path} aliases ${prior} and ${label}`,
        );
      }
      owners.set(path, label);
    }
  }
}

function assertManagedPathsOutsideStagingRoot(
  stagingRoot: string,
  operations: Operation[],
): void {
  for (const operation of operations) {
    for (const path of [operation.target, operation.backup]) {
      if (path === stagingRoot || isStrictlyBeneath(stagingRoot, path)) {
        throw new Error(`managed targets and backups must be outside staging root: ${path}`);
      }
    }
  }
}

function prepareOperations(
  root: string,
  stagingRoot: string,
  files: ManagedFile[],
  deps: ManagedFileTransactionDependencies,
): Operation[] {
  const lstat = deps.lstat ?? lstatSync;
  const mkdir = deps.mkdir ?? mkdirSync;

  const rootStatus = lstatIfPresent(root, lstat);
  if (!rootStatus) throw new Error(`transaction root does not exist: ${root}`);
  if (rootStatus.isSymbolicLink()) {
    throw new Error(`transaction root must not be a symbolic link: ${root}`);
  }
  if (!rootStatus.isDirectory()) throw new Error(`transaction root must be a directory: ${root}`);

  if (!isStrictlyBeneath(root, stagingRoot)) {
    throw new Error(`staging root must be beneath transaction root: ${stagingRoot}`);
  }
  assertNoSymlinkPath(root, stagingRoot, "staging root", lstat);
  const stagingStatus = lstatIfPresent(stagingRoot, lstat);
  if (!stagingStatus) throw new Error(`staging root does not exist: ${stagingRoot}`);
  if (!stagingStatus.isDirectory()) throw new Error(`staging root must be a directory: ${stagingRoot}`);

  const seenTargets = new Set<string>();
  const operations = files.map((file, index) => {
    const target = managedTarget(root, file.target);
    if (seenTargets.has(target)) throw new Error(`duplicate managed target: ${file.target}`);
    seenTargets.add(target);

    const staged = stagedSource(stagingRoot, file.staged);
    assertNoSymlinkPath(stagingRoot, staged, "staged source", lstat);
    const stagedStatus = lstatIfPresent(staged, lstat);
    if (!stagedStatus?.isFile()) {
      throw new Error(`staged source must be a regular file: ${file.staged}`);
    }

    assertNoSymlinkPath(root, target, "managed target", lstat);
    const targetStatus = lstatIfPresent(target, lstat);
    if (targetStatus && !targetStatus.isFile()) {
      throw new Error(`managed target must be a regular file: ${file.target}`);
    }

    return {
      target,
      staged,
      backup: `${target}.md2vid-backup-${index}`,
      hadOriginal: targetStatus !== undefined,
    };
  });

  assertDistinctManagedPaths(operations);
  assertManagedPathsOutsideStagingRoot(stagingRoot, operations);
  for (const operation of operations) {
    const backupStatus = lstatIfPresent(operation.backup, lstat);
    if (backupStatus?.isSymbolicLink()) {
      throw new Error(`managed backup path is a symbolic link: ${operation.backup}`);
    }
    if (backupStatus) throw new Error(`managed backup path already exists: ${operation.backup}`);
  }
  for (const operation of operations) mkdir(dirname(operation.target), { recursive: true });
  return operations;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function promoteManagedFiles(
  rootInput: string,
  stagingRootInput: string,
  files: ManagedFile[],
  deps: ManagedFileTransactionDependencies = {},
): ManagedFilePromotionResult {
  const root = resolve(rootInput);
  const stagingRoot = resolve(stagingRootInput);
  const rename = deps.rename ?? renameSync;
  const remove = deps.remove ?? rmSync;
  const lstat = deps.lstat ?? lstatSync;
  const operations = prepareOperations(root, stagingRoot, files, deps);
  const backedUp: Operation[] = [];
  const promoted: Operation[] = [];

  try {
    for (const operation of operations) {
      if (!operation.hadOriginal) continue;
      rename(operation.target, operation.backup);
      backedUp.push(operation);
    }
    for (const operation of operations) {
      rename(operation.staged, operation.target);
      promoted.push(operation);
    }
  } catch (cause) {
    const restoreErrors: Error[] = [];
    for (const operation of [...promoted].reverse()) {
      try {
        remove(operation.target, { force: true });
      } catch (error) {
        restoreErrors.push(asError(error));
      }
    }
    for (const operation of [...backedUp].reverse()) {
      try {
        rename(operation.backup, operation.target);
      } catch (error) {
        restoreErrors.push(asError(error));
      }
    }
    for (const operation of operations) {
      try {
        remove(operation.staged, { force: true });
      } catch (error) {
        restoreErrors.push(asError(error));
      }
    }
    if (restoreErrors.length) {
      const recoverable = backedUp
        .map((operation) => operation.backup)
        .filter((backup) => lstatIfPresent(backup, lstat) !== undefined);
      const recovery = recoverable.length ? `; recoverable backups: ${recoverable.join(", ")}` : "";
      throw new AggregateError(
        [asError(cause), ...restoreErrors],
        `managed file promotion failed and rollback was incomplete${recovery}`,
      );
    }
    throw cause;
  }

  // All targets now contain the staged bytes. This is the commit boundary: backup
  // cleanup is irreversible and must never trigger rollback or a failed transaction result.
  const cleanupErrors: Error[] = [];
  for (const operation of backedUp) {
    try {
      remove(operation.backup, { force: true });
    } catch (error) {
      cleanupErrors.push(asError(error));
    }
  }
  const retainedBackups = backedUp
    .map((operation) => operation.backup)
    .filter((backup) => lstatIfPresent(backup, lstat) !== undefined);
  return { retainedBackups, cleanupErrors };
}
