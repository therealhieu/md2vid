import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { isolatedGitEnvironment } from "./git_environment.ts";
import { PUBLIC_SNAPSHOT_MANIFEST, type PublicSnapshotPath, type PublicSnapshotReport } from "./public_snapshot.ts";

export const PUBLIC_SNAPSHOT_AUTHOR_NAME = "md2vid Public Snapshot";
export const PUBLIC_SNAPSHOT_AUTHOR_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";
export const PUBLIC_SNAPSHOT_COMMIT_DATE = "2000-01-01T00:00:00Z";

interface TreeEntry {
  mode: string;
  type: string;
  object: string;
  path: string;
}

function git(root: string, args: string[], encoding: "utf8"): string;
function git(root: string, args: string[], encoding?: undefined): Buffer;
function git(root: string, args: string[], encoding?: "utf8"): string | Buffer {
  return execFileSync("git", args, {
    cwd: root,
    encoding,
    env: isolatedGitEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function tree(root: string, ref = "HEAD"): TreeEntry[] {
  const records = git(root, ["ls-tree", "-r", "-z", "--full-tree", ref])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  return records.map((record) => {
    const match = record.match(/^([0-9]{6}) ([^ ]+) ([a-f0-9]+)\t([\s\S]+)$/);
    if (!match) throw new Error("malformed Git tree");
    return { mode: match[1]!, type: match[2]!, object: match[3]!, path: match[4]! };
  });
}

function isManifest(value: unknown): value is PublicSnapshotReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<PublicSnapshotReport>;
  return report.formatVersion === 1
    && typeof report.count === "number"
    && Number.isSafeInteger(report.count)
    && typeof report.hash === "string"
    && /^sha256:[a-f0-9]{64}$/.test(report.hash)
    && Array.isArray(report.paths)
    && !!report.contentScan
    && typeof report.contentScan.scope === "string"
    && Array.isArray(report.contentScan.exclusions)
    && report.contentScan.exclusions.every((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const exclusion = entry as Record<string, unknown>;
      return typeof exclusion.path === "string"
        && typeof exclusion.rule === "string"
        && typeof exclusion.matchedValueSha256 === "string"
        && /^[a-f0-9]{64}$/.test(exclusion.matchedValueSha256)
        && typeof exclusion.reason === "string";
    });
}

function validManifestPath(path: unknown): path is PublicSnapshotPath {
  if (!path || typeof path !== "object") return false;
  const entry = path as Partial<PublicSnapshotPath>;
  return typeof entry.path === "string"
    && entry.path.length > 0
    && (entry.mode === "100644" || entry.mode === "100755")
    && typeof entry.bytes === "number"
    && Number.isSafeInteger(entry.bytes)
    && entry.bytes >= 0
    && typeof entry.sha256 === "string"
    && /^[a-f0-9]{64}$/.test(entry.sha256);
}

function aggregateHash(paths: readonly PublicSnapshotPath[]): string {
  const aggregate = createHash("sha256");
  for (const entry of paths) {
    aggregate.update(entry.path);
    aggregate.update("\0");
    aggregate.update(entry.mode);
    aggregate.update("\0");
    aggregate.update(String(entry.bytes));
    aggregate.update("\0");
    aggregate.update(entry.sha256);
    aggregate.update("\n");
  }
  return `sha256:${aggregate.digest("hex")}`;
}

function isAuthenticPublicSnapshotCommit(root: string, ref: string): boolean {
  const commitHeaders = git(root, ["cat-file", "-p", ref], "utf8").split("\n\n", 1)[0]!;
  if (/^parent [a-f0-9]+$/m.test(commitHeaders)) return false;
  const identity = git(root, ["show", "-s", "--format=%an%x00%ae%x00%cn%x00%ce", ref], "utf8").trim();
  if (identity !== [
    PUBLIC_SNAPSHOT_AUTHOR_NAME,
    PUBLIC_SNAPSHOT_AUTHOR_EMAIL,
    PUBLIC_SNAPSHOT_AUTHOR_NAME,
    PUBLIC_SNAPSHOT_AUTHOR_EMAIL,
  ].join("\0")) return false;

  const entries = tree(root, ref);
  const manifestEntry = entries.find((entry) => entry.path === PUBLIC_SNAPSHOT_MANIFEST);
  if (!manifestEntry || manifestEntry.mode !== "100644" || manifestEntry.type !== "blob") return false;
  const committedManifest = git(root, ["cat-file", "blob", manifestEntry.object]);
  const manifestValue: unknown = JSON.parse(committedManifest.toString("utf8"));
  if (!isManifest(manifestValue)) return false;
  if (!manifestValue.paths.every(validManifestPath)) return false;
  if (manifestValue.count !== manifestValue.paths.length) return false;
  if (manifestValue.hash !== aggregateHash(manifestValue.paths)) return false;

  const manifestPaths = new Map(manifestValue.paths.map((entry) => [entry.path, entry]));
  if (manifestPaths.size !== manifestValue.paths.length) return false;
  if (entries.length !== manifestPaths.size + 1) return false;
  for (const entry of entries) {
    if (entry.path === PUBLIC_SNAPSHOT_MANIFEST) continue;
    if (entry.type !== "blob") return false;
    const expected = manifestPaths.get(entry.path);
    if (!expected || expected.mode !== entry.mode) return false;
    const content = git(root, ["cat-file", "blob", entry.object]);
    if (expected.bytes !== content.byteLength) return false;
    if (expected.sha256 !== createHash("sha256").update(content).digest("hex")) return false;
  }
  return true;
}

function canonicalRepositoryRoot(root: string): string | undefined {
  const canonicalRoot = realpathSync(resolve(root));
  if (realpathSync(git(canonicalRoot, ["rev-parse", "--show-toplevel"], "utf8").trim()) !== canonicalRoot) {
    return undefined;
  }
  return canonicalRoot;
}

export function isAuthenticPublicSnapshotCheckout(root: string): boolean {
  try {
    const canonicalRoot = canonicalRepositoryRoot(root);
    if (!canonicalRoot) return false;
    if (git(canonicalRoot, ["branch", "--show-current"], "utf8").trim() !== "main") return false;
    if (git(canonicalRoot, ["rev-list", "--count", "HEAD"], "utf8").trim() !== "1") return false;
    if (git(canonicalRoot, ["rev-list", "--max-parents=0", "--count", "HEAD"], "utf8").trim() !== "1") return false;
    if (git(canonicalRoot, ["tag", "--list"], "utf8").trim() !== "") return false;
    if (git(canonicalRoot, ["for-each-ref", "--format=%(refname:short)", "refs/heads"], "utf8").trim() !== "main") return false;
    if (!isAuthenticPublicSnapshotCommit(canonicalRoot, "HEAD")) return false;
    const committedManifest = git(canonicalRoot, ["show", `HEAD:${PUBLIC_SNAPSHOT_MANIFEST}`]);
    return readFileSync(join(canonicalRoot, PUBLIC_SNAPSHOT_MANIFEST)).equals(committedManifest);
  } catch {
    return false;
  }
}

export function isPublicSnapshotRepositoryCheckout(root: string): boolean {
  try {
    const canonicalRoot = canonicalRepositoryRoot(root);
    if (!canonicalRoot) return false;
    const roots = git(canonicalRoot, ["rev-list", "--max-parents=0", "HEAD"], "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    return roots.length === 1 && isAuthenticPublicSnapshotCommit(canonicalRoot, roots[0]!);
  } catch {
    return false;
  }
}
