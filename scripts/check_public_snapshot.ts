#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isolatedGitEnvironment } from "./git_environment.ts";
import {
  buildPublicSnapshot,
  validatePublicSnapshotReport,
  PUBLIC_SNAPSHOT_MANIFEST,
  type PublicSnapshotReport,
} from "./public_snapshot.ts";
import {
  isAuthenticPublicSnapshotCheckout,
  isPublicSnapshotRepositoryCheckout,
  PUBLIC_SNAPSHOT_AUTHOR_EMAIL,
  PUBLIC_SNAPSHOT_AUTHOR_NAME,
  PUBLIC_SNAPSHOT_COMMIT_DATE,
} from "./public_snapshot_checkout.ts";

const EXPECTED_NPM = "11.15.0";

function fail(message: string): never {
  throw new Error(`public snapshot check: ${message}`);
}

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: isolatedGitEnvironment(env),
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function npm(snapshot: string, npmExecPath: string, args: string[]): void {
  const childEnvironment = isolatedGitEnvironment({ npm_execpath: npmExecPath });
  delete childEnvironment.MD2VID_PUBLIC_SNAPSHOT_REF;
  const result = spawnSync(process.execPath, [npmExecPath, ...args], {
    cwd: snapshot,
    env: childEnvironment,
    stdio: "inherit",
  });
  if (result.error) fail(`failed to run npm ${args.join(" ")}: ${result.error.message}`);
  if (result.status !== 0) fail(`npm ${args.join(" ")} exited with status ${result.status ?? "unknown"}`);
}

function assertEqual(actual: string | number, expected: string | number, message: string): void {
  if (actual !== expected) fail(`${message}: expected ${expected}, got ${actual}`);
}

export interface SnapshotPackageMetadata {
  version?: unknown;
  packageManager?: unknown;
  repository?: { url?: unknown };
  os?: unknown;
  cpu?: unknown;
}

export function validateSnapshotPackageMetadata(
  packageMetadata: SnapshotPackageMetadata,
): void {
  assertEqual(
    typeof packageMetadata.version === "string" ? packageMetadata.version : "",
    "0.1.12",
    "package version",
  );
  assertEqual(
    typeof packageMetadata.packageManager === "string" ? packageMetadata.packageManager : "",
    `npm@${EXPECTED_NPM}`,
    "packageManager",
  );
  assertEqual(
    typeof packageMetadata.repository?.url === "string" ? packageMetadata.repository.url : "",
    "git+https://github.com/therealhieu/md2vid.git",
    "repository URL",
  );

  if (
    !Array.isArray(packageMetadata.os) ||
    packageMetadata.os.length !== 2 ||
    packageMetadata.os[0] !== "darwin" ||
    packageMetadata.os[1] !== "linux"
  ) {
    fail("package os must be exactly darwin and linux");
  }

  if (Object.hasOwn(packageMetadata, "cpu")) {
    fail("package must not declare a cpu restriction");
  }
}

function requireAuthenticSnapshot(snapshot: string, stage: string): void {
  if (!isAuthenticPublicSnapshotCheckout(snapshot)) {
    fail(`fresh repository is not an authentic public snapshot ${stage}`);
  }
}

function applyManifestModes(snapshot: string): void {
  const report = JSON.parse(
    readFileSync(join(snapshot, PUBLIC_SNAPSHOT_MANIFEST), "utf8"),
  ) as PublicSnapshotReport;
  validatePublicSnapshotReport(report);
  if (!Array.isArray(report.paths)) fail("public snapshot manifest paths are missing before commit");
  for (const entry of report.paths) {
    if (!entry || typeof entry.path !== "string" || (entry.mode !== "100644" && entry.mode !== "100755")) {
      fail("public snapshot manifest contains an invalid path mode before commit");
    }
    git(snapshot, [
      "update-index",
      entry.mode === "100755" ? "--chmod=+x" : "--chmod=-x",
      "--",
      entry.path,
    ]);
  }
  git(snapshot, ["update-index", "--chmod=-x", "--", PUBLIC_SNAPSHOT_MANIFEST]);
}

export interface SnapshotValidationDependencies {
  runNpm?: (snapshot: string, npmExecPath: string, args: string[]) => void;
  authenticate?: (snapshot: string) => boolean;
}

export function runAuthenticatedSnapshotValidation(
  snapshot: string,
  npmExecPath: string,
  dependencies: SnapshotValidationDependencies = {},
): void {
  const authenticate = dependencies.authenticate ?? isAuthenticPublicSnapshotCheckout;
  const requireAuthenticated = (stage: string): void => {
    if (!authenticate(snapshot)) fail(`fresh repository is not an authentic public snapshot ${stage}`);
  };
  const run = dependencies.runNpm ?? npm;
  requireAuthenticated("before validation");
  for (const step of [
    { args: ["ci"], stage: "after npm ci" },
    { args: ["run", "check"], stage: "after npm run check" },
    { args: ["run", "release:check"], stage: "after npm run release:check" },
  ]) {
    run(snapshot, npmExecPath, step.args);
    requireAuthenticated(step.stage);
  }
}

export function initializePublicSnapshotRepository(snapshot: string, emptyTemplate: string): void {
  const templateStat = lstatSync(emptyTemplate);
  if (templateStat.isSymbolicLink() || !templateStat.isDirectory() || readdirSync(emptyTemplate).length !== 0) {
    fail("Git template must be an explicitly empty real directory");
  }
  git(snapshot, ["init", "--initial-branch=main", `--template=${emptyTemplate}`]);
  git(snapshot, ["add", "--all"]);
  applyManifestModes(snapshot);
  const identityEnvironment = {
    GIT_AUTHOR_NAME: PUBLIC_SNAPSHOT_AUTHOR_NAME,
    GIT_AUTHOR_EMAIL: PUBLIC_SNAPSHOT_AUTHOR_EMAIL,
    GIT_AUTHOR_DATE: PUBLIC_SNAPSHOT_COMMIT_DATE,
    GIT_COMMITTER_NAME: PUBLIC_SNAPSHOT_AUTHOR_NAME,
    GIT_COMMITTER_EMAIL: PUBLIC_SNAPSHOT_AUTHOR_EMAIL,
    GIT_COMMITTER_DATE: PUBLIC_SNAPSHOT_COMMIT_DATE,
  };
  git(snapshot, [
    "-c",
    `core.hooksPath=${join(emptyTemplate, "hooks-disabled")}`,
    "commit",
    "--no-verify",
    "-m",
    "chore: initialize public snapshot",
  ], identityEnvironment);
  requireAuthenticSnapshot(snapshot, "immediately after initialization");
}

export function assertSourceCommitBoundary(
  sourceRoot: string,
  sourceCommit: string,
  snapshot: string,
): void {
  const snapshotCommit = git(snapshot, ["rev-parse", "HEAD"]);
  if (
    snapshotCommit === sourceCommit &&
    isPublicSnapshotRepositoryCheckout(sourceRoot)
  ) return;

  const sourceObject = spawnSync("git", ["cat-file", "-e", `${sourceCommit}^{commit}`], {
    cwd: snapshot,
    env: isolatedGitEnvironment(),
    stdio: "ignore",
  });
  if (sourceObject.status === 0) fail("private source commit is reachable in the fresh repository");
}

export function checkPublicSnapshot(repo = process.cwd(), npmExecPath = process.env.npm_execpath): void {
  if (!npmExecPath) fail("npm_execpath is required; invoke this check through the package's pinned npm CLI");
  const gitRoot = git(resolve(repo), ["rev-parse", "--show-toplevel"]);
  const sourceRef = process.env.MD2VID_PUBLIC_SNAPSHOT_REF ?? "HEAD";
  if (!sourceRef || sourceRef.startsWith("-")) fail("source ref must name a Git commit");
  const sourceCommit = git(gitRoot, ["rev-parse", "--verify", `${sourceRef}^{commit}`]);
  const npmVersion = execFileSync(process.execPath, [npmExecPath, "--version"], {
    encoding: "utf8",
    env: isolatedGitEnvironment({ npm_execpath: npmExecPath }),
  }).trim();
  assertEqual(npmVersion, EXPECTED_NPM, "npm version");

  const temporaryRoot = mkdtempSync(join(tmpdir(), "md2vid-public-check-"));
  const snapshot = join(temporaryRoot, "snapshot");
  const emptyGitTemplate = join(temporaryRoot, "empty-git-template");
  mkdirSync(emptyGitTemplate, { mode: 0o700 });
  try {
    buildPublicSnapshot({ repo: gitRoot, output: snapshot, ref: sourceCommit });

    const packageMetadata = JSON.parse(
      readFileSync(join(snapshot, "package.json"), "utf8"),
    ) as SnapshotPackageMetadata;
    validateSnapshotPackageMetadata(packageMetadata);

    initializePublicSnapshotRepository(snapshot, emptyGitTemplate);

    assertEqual(git(snapshot, ["branch", "--show-current"]), "main", "current branch");
    assertEqual(git(snapshot, ["rev-list", "--count", "HEAD"]), "1", "commit count");
    assertEqual(git(snapshot, ["rev-list", "--max-parents=0", "--count", "HEAD"]), "1", "root commit count");
    assertEqual(git(snapshot, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]), "main", "branch set");
    assertEqual(git(snapshot, ["tag", "--list"]), "", "tag set");
    assertEqual(
      git(snapshot, ["show", "-s", "--format=%an%x00%ae%x00%cn%x00%ce", "HEAD"]),
      [
        PUBLIC_SNAPSHOT_AUTHOR_NAME,
        PUBLIC_SNAPSHOT_AUTHOR_EMAIL,
        PUBLIC_SNAPSHOT_AUTHOR_NAME,
        PUBLIC_SNAPSHOT_AUTHOR_EMAIL,
      ].join("\0"),
      "public commit identity",
    );
    assertSourceCommitBoundary(gitRoot, sourceCommit, snapshot);

    runAuthenticatedSnapshotValidation(snapshot, npmExecPath);

    assertEqual(git(snapshot, ["status", "--porcelain=v1", "--untracked-files=all"]), "", "fresh tree cleanliness");
    process.stdout.write(`public snapshot check passed at ${git(snapshot, ["rev-parse", "HEAD"])}\n`);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function main(): void {
  try {
    checkPublicSnapshot();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
