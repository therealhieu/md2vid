import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isolatedGitEnvironment } from "./git_environment.ts";

export const PUBLIC_SNAPSHOT_MANIFEST = "public-snapshot.json";

const PUBLIC_ROOT_FILES = new Set([
  ".gitignore",
  ".ignore",
  "AGENTS.md",
  "LICENSE",
  "README.md",
  "package.json",
  "package-lock.json",
  "postinstall.mjs",
  "tsconfig.json",
  "tsconfig.dist.json",
]);

const PUBLIC_PREFIXES = [
  ".github/",
  "bin/",
  "docs/standards/",
  "engine/",
  "frameworks/",
  "scripts/",
  "security/",
  "skill/",
  "test/",
] as const;

const PUBLIC_EXACT_PATHS = new Set(["docs/release.md"]);

const HISTORICAL_MARKERS = [
  ["07", "ch7", "finetuning"].join("-"),
  ["chapter", "7", "finetuning"].join("-"),
  ["topic", "3", "cnn"].join("-"),
  ["database", "indexing", "guide"].join("-"),
] as const;

interface CredentialRule {
  name: string;
  pattern: RegExp;
  valueGroup?: number;
}

const CREDENTIAL_RULES: readonly CredentialRule[] = [
  { name: "GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/g },
  { name: "GitHub fine-grained token", pattern: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/g },
  { name: "npm access token", pattern: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { name: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  {
    name: "AWS secret access key",
    pattern: /(?:^|[^A-Za-z0-9_])(?:"aws_secret_access_key"|'aws_secret_access_key'|aws_secret_access_key)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
    valueGroup: 1,
  },
  {
    name: "private key",
    pattern: /-----BEGIN (?:(?:(?:RSA|DSA|EC|OPENSSH|ENCRYPTED) )?PRIVATE KEY|PGP PRIVATE KEY BLOCK|SSH2 ENCRYPTED PRIVATE KEY)-----/g,
  },
  {
    name: "npm auth token",
    pattern: /(?:^|[^A-Za-z0-9_])(?:"_authToken"|'_authToken'|_authToken)\s*[:=]\s*["']?([A-Za-z0-9._~+/=-]+)["']?/gi,
    valueGroup: 1,
  },
  {
    name: "npm legacy auth",
    pattern: /(?:^|[^A-Za-z0-9_])(?:"_auth"|'_auth'|_auth)\s*[:=]\s*["']?([A-Za-z0-9+/]+={0,2})["']?/gi,
    valueGroup: 1,
  },
];

interface ContentException {
  path: string;
  rule: string;
  value: string;
  reason: string;
}

const CONTENT_EXCEPTIONS: readonly ContentException[] = [
  {
    path: "test/release/harness.test.ts",
    rule: "npm auth token",
    value: "registry-token-value",
    reason: "Exact fake registry credential used to verify diagnostic redaction.",
  },
  {
    path: "test/release/harness.test.ts",
    rule: "npm auth token",
    value: "auth-token-value",
    reason: "Exact fake authentication credential used to verify diagnostic redaction.",
  },
  {
    path: "test/release/harness.test.ts",
    rule: "npm auth token",
    value: "json-auth-secret",
    reason: "Exact fake JSON authentication credential used to verify diagnostic redaction.",
  },
  {
    path: "test/release/harness.test.ts",
    rule: "npm auth token",
    value: "yaml-auth-secret",
    reason: "Exact fake YAML authentication credential used to verify diagnostic redaction.",
  },
];

interface GitTreeEntry {
  mode: "100644" | "100755";
  object: string;
  path: string;
  content: Buffer;
}

interface ParsedTree {
  commit: string;
  entries: GitTreeEntry[];
}

interface CreatedOutput {
  path: string;
  device: number;
  inode: number;
}

interface OutputPlan {
  finalPath: string;
  parentPath: string;
  parentDevice: number;
  parentInode: number;
  staging: CreatedOutput;
}

export interface PublicSnapshotPath {
  path: string;
  mode: "100644" | "100755";
  bytes: number;
  sha256: string;
}

export interface PublicSnapshotReport {
  formatVersion: 1;
  count: number;
  hash: string;
  paths: PublicSnapshotPath[];
  contentScan: {
    scope: string;
    exclusions: Array<{
      path: string;
      rule: string;
      matchedValueSha256: string;
      reason: string;
    }>;
  };
}

export interface BuildPublicSnapshotOptions {
  repo?: string;
  output: string;
  ref?: string;
}

export interface PublicSnapshotCliOptions {
  output: string;
  ref: string;
}

function fail(message: string): never {
  throw new Error(`public snapshot: ${message}`);
}

function git(repo: string, args: string[], encoding: "utf8"): string;
function git(repo: string, args: string[], encoding?: undefined): Buffer;
function git(repo: string, args: string[], encoding?: "utf8"): string | Buffer {
  try {
    return execFileSync("git", args, {
      cwd: repo,
      encoding,
      maxBuffer: 64 * 1024 * 1024,
      env: isolatedGitEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return fail(`git command failed: ${detail}`);
  }
}

function isPathInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function resolveGitRoot(repo: string): string {
  const requested = realpathSync(resolve(repo));
  const topLevel = git(requested, ["rev-parse", "--show-toplevel"], "utf8").trim();
  return realpathSync(topLevel);
}

function existingLstat(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function assertTrustedParent(path: string, expectedDevice?: number, expectedInode?: number): Stats {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("output parent must be a real directory, not a symlink");
  if (expectedDevice !== undefined && (stat.dev !== expectedDevice || stat.ino !== expectedInode)) {
    fail("output parent changed during snapshot creation");
  }
  const writableByOthers = (stat.mode & 0o022) !== 0;
  const sticky = (stat.mode & 0o1000) !== 0;
  if (writableByOthers && !sticky) {
    fail("output parent has unsafe group/world-writable permissions without sticky protection");
  }
  const currentUid = process.getuid?.();
  if (!sticky && currentUid !== undefined && stat.uid !== currentUid) {
    fail("output parent must be owned by the current user or protected by sticky permissions");
  }
  return stat;
}

function prepareOutput(gitRoot: string, output: string): OutputPlan {
  const resolvedOutput = resolve(output);
  if (resolvedOutput === parse(resolvedOutput).root) fail("filesystem root is an unsafe output target");

  const requestedParent = dirname(resolvedOutput);
  const parentStat = existingLstat(requestedParent);
  if (!parentStat) fail("output parent must already exist as a real directory");
  assertTrustedParent(requestedParent);
  const realParent = realpathSync(requestedParent);
  const canonicalOutput = join(realParent, basename(resolvedOutput));
  if (isPathInside(gitRoot, canonicalOutput)) fail("output must not be inside the source repository");
  if (isPathInside(canonicalOutput, gitRoot)) fail("output must not contain the source repository");
  if (existingLstat(canonicalOutput)) fail("output target must not already exist; publication is exclusive");

  // The private 0700 staging directory and trusted-parent policy prevent a
  // different UID from replacing materialized paths. A malicious same-UID
  // process has equivalent authority to this process and is explicitly out of scope.
  const stagingPath = mkdtempSync(join(realParent, `.${basename(canonicalOutput)}.staging-`));
  const stagingStat = lstatSync(stagingPath);
  const staging = { path: stagingPath, device: stagingStat.dev, inode: stagingStat.ino };
  try {
    chmodSync(stagingPath, 0o700);
    return {
      finalPath: canonicalOutput,
      parentPath: realParent,
      parentDevice: parentStat.dev,
      parentInode: parentStat.ino,
      staging,
    };
  } catch (error) {
    cleanupCreatedOutput(staging);
    throw error;
  }
}

function publishOutput(plan: OutputPlan): void {
  assertTrustedParent(plan.parentPath, plan.parentDevice, plan.parentInode);
  assertOutputIdentity(plan.staging);
  if (existingLstat(plan.finalPath)) fail("output target appeared before publication; refusing to overwrite it");
  // rename is atomic. The trusted or sticky parent prevents a different UID
  // from replacing the destination between the recheck and rename.
  renameSync(plan.staging.path, plan.finalPath);
}

function cleanupCreatedOutput(output: CreatedOutput): void {
  const stat = existingLstat(output.path);
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) return;
  if (stat.dev !== output.device || stat.ino !== output.inode) return;
  rmSync(output.path, { recursive: true, force: true });
}

function isPublicPath(path: string): boolean {
  return PUBLIC_ROOT_FILES.has(path)
    || PUBLIC_EXACT_PATHS.has(path)
    || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function parseTree(repo: string, ref: string): ParsedTree {
  if (!ref || ref.startsWith("-")) fail("ref must name a Git commit");
  const commit = git(repo, ["rev-parse", "--verify", `${ref}^{commit}`], "utf8").trim();
  if (!/^[a-f0-9]{40,64}$/.test(commit)) fail("ref did not resolve to a commit");

  const raw = git(repo, ["ls-tree", "-r", "-z", "--full-tree", commit]);
  const records = raw.toString("utf8").split("\0").filter(Boolean);
  const selected: GitTreeEntry[] = [];
  for (const record of records) {
    const match = record.match(/^([0-9]{6}) ([^ ]+) ([a-f0-9]+)\t([\s\S]+)$/);
    if (!match) fail("received malformed git tree output");
    const [, mode, type, object, path] = match;
    if (!isPublicPath(path)) continue;
    if ((mode !== "100644" && mode !== "100755") || type !== "blob") {
      fail(`selected path ${path} has unsupported mode ${mode} and type ${type}; symlinks, submodules, and special entries are forbidden`);
    }
    selected.push({
      mode,
      object,
      path,
      content: git(repo, ["cat-file", "blob", object]),
    });
  }
  return {
    commit,
    entries: selected.sort((left, right) => left.path.localeCompare(right.path, "en")),
  };
}

function commitGmailLocalParts(repo: string, commit: string): string[] {
  const identities = git(repo, ["show", "-s", "--format=%ae%x00%ce", commit], "utf8")
    .trimEnd()
    .split("\0");
  const localParts = new Set<string>();
  for (const email of identities) {
    const match = email.match(/^([^@\s]+)@gmail\.com$/i);
    if (match?.[1] && match[1].length >= 4) localParts.add(match[1].toLowerCase());
  }
  return [...localParts];
}

function isVendoredGsapPath(path: string): boolean {
  const segments = path.toLowerCase().split("/");
  const file = segments.at(-1) ?? "";
  if (file === ["gsap", "js"].join(".") || file === ["gsap", "min", "js"].join(".")) return true;
  const gsapIndex = segments.findIndex((segment) => segment === "gsap" || segment.startsWith("gsap."));
  return gsapIndex > 0 && segments.slice(0, gsapIndex).some((segment) => /^(?:vendor|vendors|vendored)$/.test(segment));
}

function containsVendoredGsapReference(bytes: string): boolean {
  return /\b(?:vendor|vendors|vendored)[\\/][^\s"'`<>]*gsap(?:\.min)?\.js\b/i.test(bytes);
}

function isExactException(path: string, rule: string, value: string): boolean {
  return CONTENT_EXCEPTIONS.some(
    (exception) => exception.path === path && exception.rule === rule && exception.value === value,
  );
}

function scanSelectedContent(repo: string, commit: string, entries: GitTreeEntry[]): ContentException[] {
  const gmailLocalParts = commitGmailLocalParts(repo, commit);
  const appliedExceptions = new Map<string, ContentException>();

  for (const entry of entries) {
    if (isVendoredGsapPath(entry.path)) fail(`vendored GSAP path is forbidden: ${entry.path}`);
    const bytes = entry.content.toString("latin1");
    const lower = bytes.toLowerCase();
    for (const marker of HISTORICAL_MARKERS) {
      if (lower.includes(marker)) fail(`historical marker is forbidden in ${entry.path}`);
    }
    if (containsVendoredGsapReference(bytes)) fail(`vendored GSAP reference is forbidden in ${entry.path}`);
    if (/\bfile:\/\/\/(?:(?:Users|home)\/[A-Za-z0-9._-]+(?:\/|(?=$|[^A-Za-z0-9._-]))|[A-Za-z]:\/Users\/[A-Za-z0-9._-]+(?:\/|(?=$|[^A-Za-z0-9._-])))/i.test(bytes)
      || /(?:^|[^A-Za-z0-9._\/\\-])\/(?:Users|home)\/[A-Za-z0-9._-]+(?:\/|(?=$|[^A-Za-z0-9._-]))/.test(bytes)
      || /\b[A-Za-z]:\\Users\\[A-Za-z0-9._-]+(?:\\|(?=$|[^A-Za-z0-9._-]))/i.test(bytes)) {
      fail(`developer absolute path is forbidden in ${entry.path}`);
    }
    if (/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com\b/i.test(bytes)) {
      fail(`personal Gmail address is forbidden in ${entry.path}`);
    }
    for (const localPart of gmailLocalParts) {
      if (lower.includes(localPart)) fail(`personal Gmail local-part is forbidden in ${entry.path}`);
    }
    for (const rule of CREDENTIAL_RULES) {
      rule.pattern.lastIndex = 0;
      for (const match of bytes.matchAll(rule.pattern)) {
        const value = match[rule.valueGroup ?? 0] ?? match[0];
        if (!isExactException(entry.path, rule.name, value)) {
          fail(`${rule.name} credential pattern is forbidden in ${entry.path}`);
        }
        const exception = CONTENT_EXCEPTIONS.find(
          (candidate) => candidate.path === entry.path && candidate.rule === rule.name && candidate.value === value,
        )!;
        appliedExceptions.set(`${exception.path}\0${exception.rule}\0${exception.value}`, exception);
      }
    }
  }
  return [...appliedExceptions.values()];
}

function createReport(entries: GitTreeEntry[], appliedExceptions: readonly ContentException[]): PublicSnapshotReport {
  const paths = entries.map((entry): PublicSnapshotPath => ({
    path: entry.path,
    mode: entry.mode,
    bytes: entry.content.byteLength,
    sha256: createHash("sha256").update(entry.content).digest("hex"),
  }));
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
  return {
    formatVersion: 1,
    count: paths.length,
    hash: `sha256:${aggregate.digest("hex")}`,
    paths,
    contentScan: {
      scope: "Every selected blob is scanned with byte-oriented ASCII security rules; no blob is skipped for NUL bytes or invalid UTF-8.",
      exclusions: appliedExceptions.map((entry) => ({
        path: entry.path,
        rule: entry.rule,
        matchedValueSha256: createHash("sha256").update(entry.value).digest("hex"),
        reason: entry.reason,
      })),
    },
  };
}

function ensureRealDirectory(root: string, relativeDirectory: string): void {
  if (!relativeDirectory || relativeDirectory === ".") return;
  let current = root;
  for (const segment of relativeDirectory.split(/[\\/]/)) {
    if (!segment || segment === "." || segment === "..") fail(`unsafe output directory segment: ${relativeDirectory}`);
    current = join(current, segment);
    const existing = existingLstat(current);
    if (existing) {
      if (existing.isSymbolicLink() || !existing.isDirectory()) {
        fail(`output directory path is not a real directory: ${relativeDirectory}`);
      }
      continue;
    }
    try {
      mkdirSync(current, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const raced = lstatSync(current);
      if (raced.isSymbolicLink() || !raced.isDirectory()) {
        fail(`output directory path became unsafe: ${relativeDirectory}`);
      }
    }
  }
}

function assertOutputIdentity(output: CreatedOutput): void {
  const stat = existingLstat(output.path);
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()
    || stat.dev !== output.device || stat.ino !== output.inode) {
    fail("output destination changed after exclusive creation");
  }
}

function writeExclusiveFile(path: string, content: string | Buffer, mode: number): void {
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, mode);
    writeFileSync(descriptor, content);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(path, mode);
}

function materialize(output: CreatedOutput, entries: GitTreeEntry[], report: PublicSnapshotReport): void {
  for (const entry of entries) {
    assertOutputIdentity(output);
    const target = resolve(output.path, entry.path);
    if (!isPathInside(output.path, target)) fail(`unsafe selected path: ${entry.path}`);
    ensureRealDirectory(output.path, dirname(entry.path));
    writeExclusiveFile(target, entry.content, entry.mode === "100755" ? 0o755 : 0o644);
  }
  assertOutputIdentity(output);
  writeExclusiveFile(
    resolve(output.path, PUBLIC_SNAPSHOT_MANIFEST),
    `${JSON.stringify(report, null, 2)}\n`,
    0o644,
  );
}

function stagedFilePaths(root: string, directory = root): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isSymbolicLink()) fail(`staged snapshot contains a symlink: ${relative(root, absolute)}`);
    if (entry.isDirectory()) paths.push(...stagedFilePaths(root, absolute));
    else if (entry.isFile()) paths.push(relative(root, absolute).replaceAll("\\", "/"));
    else fail(`staged snapshot contains a special entry: ${relative(root, absolute)}`);
  }
  return paths;
}

export function verifyMaterializedSnapshot(root: string, report: PublicSnapshotReport): void {
  const expectedPaths = [...report.paths.map((entry) => entry.path), PUBLIC_SNAPSHOT_MANIFEST].sort();
  const actualPaths = stagedFilePaths(root).sort();
  if (actualPaths.length !== expectedPaths.length
    || actualPaths.some((path, index) => path !== expectedPaths[index])) {
    fail("staged snapshot file set does not match the manifest");
  }
  for (const entry of report.paths) {
    const target = resolve(root, entry.path);
    if (!isPathInside(root, target)) fail(`unsafe staged manifest path: ${entry.path}`);
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) fail(`staged manifest path is not a regular file: ${entry.path}`);
    const content = readFileSync(target);
    if (content.byteLength !== entry.bytes) fail(`staged file size differs from manifest: ${entry.path}`);
    if (createHash("sha256").update(content).digest("hex") !== entry.sha256) {
      fail(`staged file hash differs from manifest: ${entry.path}`);
    }
    const expectedMode = entry.mode === "100755" ? 0o755 : 0o644;
    if ((stat.mode & 0o777) !== expectedMode) fail(`staged file mode differs from manifest: ${entry.path}`);
  }
  const expectedManifest = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  if (!readFileSync(resolve(root, PUBLIC_SNAPSHOT_MANIFEST)).equals(expectedManifest)) {
    fail("staged public snapshot manifest differs from the generated report");
  }
}

export function buildPublicSnapshot(options: BuildPublicSnapshotOptions): PublicSnapshotReport {
  const gitRoot = resolveGitRoot(options.repo ?? process.cwd());
  const output = prepareOutput(gitRoot, options.output);
  let published = false;
  try {
    const { commit, entries } = parseTree(gitRoot, options.ref ?? "HEAD");
    const appliedExceptions = scanSelectedContent(gitRoot, commit, entries);
    const report = createReport(entries, appliedExceptions);
    materialize(output.staging, entries, report);
    verifyMaterializedSnapshot(output.staging.path, report);
    publishOutput(output);
    published = true;
    return report;
  } finally {
    if (!published) cleanupCreatedOutput(output.staging);
  }
}

export function parsePublicSnapshotArgs(args: string[]): PublicSnapshotCliOptions {
  let output: string | undefined;
  let ref = "HEAD";
  let sawRef = false;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option !== "--output" && option !== "--ref") fail(`unknown option: ${option}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) fail(`option ${option} requires a value`);
    index += 1;
    if (option === "--output") {
      if (output !== undefined) fail("duplicate --output option");
      output = value;
    } else {
      if (sawRef) fail("duplicate --ref option");
      sawRef = true;
      ref = value;
    }
  }
  if (output === undefined) fail("--output is required");
  return { output, ref };
}

function main(): void {
  try {
    const options = parsePublicSnapshotArgs(process.argv.slice(2));
    const report = buildPublicSnapshot({ output: options.output, ref: options.ref });
    process.stdout.write(`${report.count} files ${report.hash}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
