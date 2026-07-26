import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export interface ManagedFile {
  target: string;
  staged: string;
  kind?: "file" | "directory";
}

export interface ManagedFileTransactionDependencies {
  exists?: typeof existsSync;
  lstat?: typeof lstatSync;
  mkdir?: typeof mkdirSync;
  rename?: typeof renameSync;
  remove?: typeof rmSync;
  rmdir?: typeof rmdirSync;
}

export interface ManagedFilePromotionResult {
  retainedBackups: string[];
  uncertainBackups: string[];
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
  kind: "file" | "directory";
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

function assertDirectoryTreeHasNoSymlinks(
  root: string,
  lstat: typeof lstatSync,
): void {
  for (const name of readdirSync(root)) {
    const path = resolve(root, name);
    const status = lstat(path);
    if (status.isSymbolicLink()) {
      throw new Error(`staged source directory contains a symbolic link: ${path}`);
    }
    if (status.isDirectory()) assertDirectoryTreeHasNoSymlinks(path, lstat);
    else if (!status.isFile()) {
      throw new Error(`staged source directory contains a non-regular entry: ${path}`);
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

function assertNoManagedDirectoryOverlaps(operations: Operation[]): void {
  for (const [index, operation] of operations.entries()) {
    if (operation.kind !== "directory") continue;
    for (const [otherIndex, other] of operations.entries()) {
      if (index === otherIndex) continue;
      if (isStrictlyBeneath(operation.target, other.target)) {
        throw new Error(
          `managed directory target overlaps another managed target: ${operation.target} contains ${other.target}`,
        );
      }
      if (isStrictlyBeneath(operation.staged, other.staged)) {
        throw new Error(
          `staged managed directory overlaps another staged source: ${operation.staged} contains ${other.staged}`,
        );
      }
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

    const kind = file.kind ?? "file";
    const staged = stagedSource(stagingRoot, file.staged);
    assertNoSymlinkPath(stagingRoot, staged, "staged source", lstat);
    const stagedStatus = lstatIfPresent(staged, lstat);
    if (kind === "file" ? !stagedStatus?.isFile() : !stagedStatus?.isDirectory()) {
      throw new Error(
        kind === "file"
          ? `staged source must be a regular file: ${file.staged}`
          : `staged source must be a directory: ${file.staged}`,
      );
    }
    if (kind === "directory") assertDirectoryTreeHasNoSymlinks(staged, lstat);

    assertNoSymlinkPath(root, target, "managed target", lstat);
    const targetStatus = lstatIfPresent(target, lstat);
    if (targetStatus && (kind === "file" ? !targetStatus.isFile() : !targetStatus.isDirectory())) {
      throw new Error(
        kind === "file"
          ? `managed target must be a regular file: ${file.target}`
          : `managed target must be a directory: ${file.target}`,
      );
    }

    return {
      target,
      staged,
      backup: `${target}.md2vid-backup-${index}`,
      kind,
      hadOriginal: targetStatus !== undefined,
    };
  });

  assertDistinctManagedPaths(operations);
  assertNoManagedDirectoryOverlaps(operations);
  assertManagedPathsOutsideStagingRoot(stagingRoot, operations);
  for (const operation of operations) {
    const backupStatus = lstatIfPresent(operation.backup, lstat);
    if (backupStatus?.isSymbolicLink()) {
      throw new Error(`managed backup path is a symbolic link: ${operation.backup}`);
    }
    if (backupStatus) throw new Error(`managed backup path already exists: ${operation.backup}`);
  }
  return operations;
}

function parentDirectoriesCreatedByTransaction(
  root: string,
  operations: Operation[],
  lstat: typeof lstatSync,
): string[] {
  const missing = new Set<string>();
  for (const operation of operations) {
    let current = dirname(operation.target);
    while (current !== root) {
      if (lstatIfPresent(current, lstat)) break;
      missing.add(current);
      current = dirname(current);
    }
  }
  return [...missing].sort((left, right) => left.length - right.length);
}

function createTargetParents(
  root: string,
  operations: Operation[],
  deps: ManagedFileTransactionDependencies,
): string[] {
  const lstat = deps.lstat ?? lstatSync;
  const mkdir = deps.mkdir ?? mkdirSync;
  const rmdir = deps.rmdir ?? rmdirSync;
  const created = parentDirectoriesCreatedByTransaction(root, operations, lstat);
  try {
    for (const operation of operations) mkdir(dirname(operation.target), { recursive: true });
    return created;
  } catch (cause) {
    const cleanupErrors: Error[] = [];
    for (const path of [...created].reverse()) {
      try {
        if (lstatIfPresent(path, lstat)?.isDirectory()) rmdir(path);
      } catch (error) {
        cleanupErrors.push(asError(error));
      }
    }
    if (cleanupErrors.length) {
      throw new AggregateError(
        [asError(cause), ...cleanupErrors],
        "managed file promotion failed while creating target parents and cleanup was incomplete",
      );
    }
    throw cause;
  }
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
  const createdParents = createTargetParents(root, operations, deps);
  const rmdir = deps.rmdir ?? rmdirSync;
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
        remove(operation.target, { recursive: true, force: true });
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
        remove(operation.staged, { recursive: true, force: true });
      } catch (error) {
        restoreErrors.push(asError(error));
      }
    }
    for (const path of [...createdParents].reverse()) {
      try {
        if (lstatIfPresent(path, lstat)?.isDirectory()) rmdir(path);
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
      remove(operation.backup, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(asError(error));
    }
  }
  const retainedBackups: string[] = [];
  const uncertainBackups: string[] = [];
  for (const operation of backedUp) {
    try {
      if (lstatIfPresent(operation.backup, lstat)) retainedBackups.push(operation.backup);
    } catch (error) {
      cleanupErrors.push(asError(error));
      uncertainBackups.push(operation.backup);
    }
  }
  return { retainedBackups, uncertainBackups, cleanupErrors };
}
