import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { readPackageMetadata } from "../../scripts/package_root.ts";
import { isNpmVersionNotFound } from "../../scripts/release_preflight.ts";
import { isStrictSha512Integrity } from "../../scripts/release_contract.ts";
import {
  FORBIDDEN_PACKED_FILES,
  FORBIDDEN_PACKED_PREFIXES,
  REQUIRED_PACKED_FILES,
} from "./manifest.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..", "..");
const PACKAGE_METADATA = readPackageMetadata(import.meta.url);

export function requiredHyperframesVersion(
  packageFile = join(REPO_ROOT, "package.json"),
): string {
  const parsed = JSON.parse(readFileSync(packageFile, "utf8")) as {
    dependencies?: { hyperframes?: unknown };
  };
  const version = parsed.dependencies?.hyperframes;
  if (typeof version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error("package.json must declare an exact stable HyperFrames dependency");
  }
  return version;
}

const REQUIRED_HYPERFRAMES_VERSION = requiredHyperframesVersion();
export const FIXTURES = join(REPO_ROOT, "test", "cli", "fixtures", "smoke");
export const PACK_LOCK_PATH = join(REPO_ROOT, ".md2vid-release-pack.lock");

interface DiagnosticsOwnership {
  target: string;
  staging: string;
  marker: string;
}

export interface ReleaseContext {
  root: string;
  artifacts: string;
  diagnostics: string;
  diagnosticsDirectory?: string;
  diagnosticsOwnership?: DiagnosticsOwnership;
  sensitivePaths: string[];
  commandRunner?: CommandRunner;
  npmInvocations: string[][];
  prefix: string;
  work: string;
  currentStage?: string;
  tarball?: string;
  packedFiles: string[];
  md2vidBin?: string;
}

const DIAGNOSTICS_MARKER_NAME = ".md2vid-diagnostics-owner";
const DIAGNOSTICS_MARKER_PREFIX = "md2vid-release-diagnostics:v1:";
const SAFE_DIAGNOSTIC_FILE = /^(?:summary\.json|[A-Za-z0-9_.-]+\.log|\.md2vid-diagnostics-owner)$/;

function canonicalPath(path: string): string {
  let current = path;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return resolve(path);
    current = parent;
  }
  const existing = realpathSync(current);
  return resolve(existing, relative(current, path));
}

function isSameOrAncestor(ancestor: string, candidate: string): boolean {
  const remainder = relative(ancestor, candidate);
  return remainder === "" || (!remainder.startsWith("..") && !remainder.includes(".." + "/") && !remainder.includes(".." + "\\") && !isAbsolute(remainder));
}

export function validateDiagnosticsDirectory(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("unsafe diagnostics path: empty");
  const target = resolve(trimmed);
  const canonicalTarget = canonicalPath(target);
  if (dirname(canonicalTarget) === canonicalTarget) {
    throw new Error(`unsafe diagnostics path: filesystem root ${target}`);
  }

  const protectedPaths = [
    REPO_ROOT,
    homedir(),
    env.HOME,
    env.USERPROFILE,
  ].filter((path): path is string => Boolean(path)).map(canonicalPath);
  if (protectedPaths.some((protectedPath) => isSameOrAncestor(canonicalTarget, protectedPath))) {
    throw new Error(`unsafe diagnostics path: ${target} is protected or an ancestor`);
  }

  if (existsSync(target)) {
    const stats = lstatSync(target);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(`unsafe diagnostics path: ${target} is not a regular directory`);
    }
  }
  return target;
}

function markerValue(token: string): string {
  return `${DIAGNOSTICS_MARKER_PREFIX}${token}`;
}

function readMarker(directory: string): string {
  const markerPath = join(directory, DIAGNOSTICS_MARKER_NAME);
  if (!existsSync(markerPath) || !lstatSync(markerPath).isFile()) {
    throw new Error(`diagnostics directory is not invocation-owned: ${directory}`);
  }
  const marker = readFileSync(markerPath, "utf8").trim();
  if (!marker.startsWith(DIAGNOSTICS_MARKER_PREFIX)) {
    throw new Error(`diagnostics directory is not invocation-owned: ${directory}`);
  }
  return marker;
}

function removeOwnedDiagnosticsDirectory(directory: string, expectedMarker?: string): void {
  if (!existsSync(directory)) return;
  const stats = lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`refusing to remove unowned diagnostics path: ${directory}`);
  }
  const marker = readMarker(directory);
  if (expectedMarker !== undefined && marker !== expectedMarker) {
    throw new Error(`diagnostics ownership marker changed: ${directory}`);
  }
  const entries = readdirSync(directory);
  for (const name of entries) {
    const path = join(directory, name);
    if (!SAFE_DIAGNOSTIC_FILE.test(name) || !lstatSync(path).isFile()) {
      throw new Error(`refusing to remove unowned diagnostics entry: ${path}`);
    }
  }
  for (const name of entries) unlinkSync(join(directory, name));
  rmdirSync(directory);
}

function prepareDiagnosticsOwnership(target: string): DiagnosticsOwnership {
  const parent = dirname(target);
  mkdirSync(parent, { recursive: true });
  if (existsSync(target)) {
    const marker = readMarker(target);
    removeOwnedDiagnosticsDirectory(target, marker);
  }
  mkdirSync(target);
  const token = randomUUID();
  const marker = markerValue(token);
  writeFileSync(join(target, DIAGNOSTICS_MARKER_NAME), marker + "\n");
  const staging = mkdtempSync(join(parent, `.${basename(target)}.md2vid-stage-`));
  writeFileSync(join(staging, DIAGNOSTICS_MARKER_NAME), marker + "\n");
  return { target, staging, marker };
}

export function createReleaseContext(
  options: { diagnosticsDirectory?: string; commandRunner?: CommandRunner } = {},
): ReleaseContext {
  const root = mkdtempSync(join(tmpdir(), "md2vid-release-"));
  try {
    const diagnosticsDirectory = options.diagnosticsDirectory === undefined
      ? undefined
      : validateDiagnosticsDirectory(options.diagnosticsDirectory);
    const ownership = diagnosticsDirectory === undefined
      ? undefined
      : prepareDiagnosticsOwnership(diagnosticsDirectory);
    const context = {
      root,
      artifacts: join(root, "artifacts"),
      diagnostics: join(root, "diagnostics"),
      diagnosticsDirectory,
      diagnosticsOwnership: ownership,
      sensitivePaths: [],
      commandRunner: options.commandRunner,
      npmInvocations: [],
      prefix: join(root, "prefix"),
      work: join(root, "work"),
      packedFiles: [],
    } satisfies ReleaseContext;
    mkdirSync(context.artifacts, { recursive: true });
    mkdirSync(context.diagnostics, { recursive: true });
    mkdirSync(context.prefix, { recursive: true });
    mkdirSync(context.work, { recursive: true });
    return context;
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function diagnosticName(label: string): string {
  return `${label.replace(/[^A-Za-z0-9_.-]/g, "_")}.log`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function addDiagnosticSensitivePaths(
  context: ReleaseContext,
  paths: Array<string | undefined>,
): void {
  for (const path of paths) {
    if (!path) continue;
    const absolute = resolve(path);
    if (!context.sensitivePaths.includes(absolute)) context.sensitivePaths.push(absolute);
  }
}

function sanitizeDiagnostic(context: ReleaseContext, value: string): string {
  let sanitized = value;
  const sensitiveKey = "(?:credential|NODE_AUTH_TOKEN|NPM_TOKEN|npm_config_[A-Za-z0-9_.-]+|_authToken|password|secret|token|authorization)";
  sanitized = sanitized.replace(
    /(?:"authorization"|authorization)\s*(?:=|:)\s*"?(?:Bearer|Basic)\s+[^"\s,}\]]+"?/gi,
    "[REDACTED]",
  );
  const sensitiveAssignment = new RegExp(
    `(?:"${sensitiveKey}"|${sensitiveKey})\\s*(?:=|:)\\s*(?:"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\\[[^\\]]*\\]|\\{[^}]*\\}|[^,\\s}\\]]+)`,
    "gi",
  );
  sanitized = sanitized.replace(sensitiveAssignment, "[REDACTED]");
  sanitized = sanitized.replace(
    /\/\/[^\s=]+:_authToken\s*=\s*[^\s]+/gi,
    "[REDACTED]",
  );
  sanitized = sanitized.replace(
    /\bAuthorization\s+(?:Bearer|Basic)\s+[^\s]+/gi,
    "[REDACTED]",
  );
  sanitized = sanitized.replace(
    /\bhttps?:\/\/[^\s/@:]+:[^\s/@]+@[^\s]+/gi,
    "[REDACTED_URL]",
  );

  const protectedPaths = [
    context.prefix,
    context.work,
    context.artifacts,
    context.root,
    context.diagnosticsDirectory,
    context.diagnosticsOwnership?.staging,
    homedir(),
    process.env.HOME,
    process.env.USERPROFILE,
    ...context.sensitivePaths,
  ].filter((path): path is string => Boolean(path))
    .map((path) => resolve(path))
    .sort((left, right) => right.length - left.length);
  for (const path of protectedPaths) {
    sanitized = sanitized.replace(new RegExp(escapeRegExp(path), "gi"), "[REDACTED_PATH]");
  }
  sanitized = sanitized.replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\r\n"'<>]+/g, "[REDACTED_PATH]");
  sanitized = sanitized.replace(/(?<![A-Za-z0-9:])\/(?:[^\s"'<>]+)/g, "[REDACTED_PATH]");
  sanitized = sanitized.replace(/\S*\.npmrc\b/gi, "[REDACTED_PATH]");
  return sanitized;
}

function appendDiagnostic(context: ReleaseContext, label: string, value: string): void {
  appendFileSync(
    join(context.diagnostics, diagnosticName(label)),
    `${sanitizeDiagnostic(context, value).trimEnd()}\n`,
  );
}

export async function runStage<T>(
  label: string,
  operation: () => Promise<T> | T,
  context?: ReleaseContext,
): Promise<T> {
  const previousStage = context?.currentStage;
  if (context) context.currentStage = label;
  try {
    return await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (context) appendDiagnostic(context, label, `FAIL [${label}]: ${message}`);
    throw new Error(`FAIL [${label}]: ${message}`);
  } finally {
    if (context) context.currentStage = previousStage;
  }
}

function copyDiagnosticsToStaging(context: ReleaseContext): void {
  const ownership = context.diagnosticsOwnership;
  if (!ownership) return;
  for (const name of readdirSync(context.diagnostics)) {
    if (!SAFE_DIAGNOSTIC_FILE.test(name)) {
      throw new Error(`refusing to retain unsafe diagnostics entry: ${name}`);
    }
    cpSync(join(context.diagnostics, name), join(ownership.staging, name), { recursive: false });
  }
  writeFileSync(
    join(ownership.staging, "summary.json"),
    `${JSON.stringify({ status: "failed" }, null, 2)}\n`,
  );
}

export function finishReleaseContext(context: ReleaseContext, succeeded: boolean): void {
  const ownership = context.diagnosticsOwnership;
  if (!ownership) {
    if (succeeded) rmSync(context.root, { recursive: true, force: true });
    else console.error(`FAIL [release]: retained diagnostics at ${context.root}`);
    return;
  }

  if (succeeded) {
    removeOwnedDiagnosticsDirectory(ownership.target, ownership.marker);
    removeOwnedDiagnosticsDirectory(ownership.staging, ownership.marker);
    rmSync(context.root, { recursive: true, force: true });
    return;
  }

  copyDiagnosticsToStaging(context);
  removeOwnedDiagnosticsDirectory(ownership.target, ownership.marker);
  renameSync(ownership.staging, ownership.target);
  rmSync(context.root, { recursive: true, force: true });
  console.error(`FAIL [release]: retained diagnostics at ${ownership.target}`);
}

export function mergeEnvironment(
  base: NodeJS.ProcessEnv,
  overrides: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const overriddenNames = new Set(Object.keys(overrides).map((name) => name.toUpperCase()));
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(base)) {
    if (!overriddenNames.has(name.toUpperCase())) env[name] = value;
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (value !== undefined) env[name] = value;
  }
  return env;
}

export interface CommandRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: CommandRunOptions,
) => string;

export const defaultCommandRunner: CommandRunner = (command, args, options = {}) => {
  const env = mergeEnvironment(process.env, options.env ?? {});
  return execFileSync(command, args, {
    cwd: options.cwd,
    env,
    encoding: "utf8",
    stdio: "pipe",
  });
};

function run(
  command: string,
  args: string[],
  options: CommandRunOptions = {},
  context?: ReleaseContext,
  runner: CommandRunner = context?.commandRunner ?? defaultCommandRunner,
): string {
  try {
    const output = runner(command, args, options);
    if (context?.currentStage && output) appendDiagnostic(context, context.currentStage, output);
    return output;
  } catch (error) {
    if (context?.currentStage) {
      const commandError = error as Error & { stdout?: string | Buffer; stderr?: string | Buffer };
      const captured = [commandError.stdout, commandError.stderr]
        .filter((value) => value !== undefined)
        .map(String)
        .join("\n");
      if (captured) appendDiagnostic(context, context.currentStage, captured);
    }
    throw error;
  }
}

export interface CommandInvocation {
  command: string;
  args: string[];
}

function recordNpmInvocation(context: ReleaseContext, args: string[]): void {
  context.npmInvocations.push([...args]);
}

function npmCommand(args: string[], context?: ReleaseContext): CommandInvocation {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) throw new Error("npm_execpath is unavailable; run release checks through npm");
  if (context) recordNpmInvocation(context, args);
  return { command: process.execPath, args: [npmExecPath, ...args] };
}

const STABLE_REGISTRY_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REGISTRY_RETRY_DELAYS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;

export function assertRegistryIntegrity(stdout: string, expected: string): void {
  if (!isStrictSha512Integrity(expected)) {
    throw new Error("invalid expected registry integrity value");
  }
  let actual: unknown;
  try {
    actual = JSON.parse(stdout);
  } catch {
    throw new Error("invalid registry integrity JSON");
  }
  if (!isStrictSha512Integrity(actual)) {
    throw new Error("invalid registry integrity value");
  }
  if (actual !== expected) throw new Error("registry integrity mismatch");
}

export function registryInstallArguments(version: string, prefix: string): string[] {
  if (!STABLE_REGISTRY_VERSION.test(version)) {
    throw new Error(`invalid registry version: ${version}`);
  }
  return [
    "install",
    "--dry-run=false",
    "--prefix",
    prefix,
    "--foreground-scripts",
    "--registry=https://registry.npmjs.org",
    `md2vid@${version}`,
  ];
}

export interface RegistryPollOptions {
  context?: ReleaseContext;
  lookup?: (version: string) => Promise<string> | string;
  sleep?: (delay: number) => Promise<void>;
}

function isRegistryPropagation404(error: unknown, version: string): boolean {
  const commandError = error as Error & {
    code?: string;
    status?: number | null;
    stdout?: string | Buffer;
    stderr?: string | Buffer;
  };
  if (commandError.status === undefined || commandError.status === null) return false;
  if (typeof commandError.code === "string") return false;
  return isNpmVersionNotFound({
    status: commandError.status,
    stdout: commandError.stdout === undefined ? "" : String(commandError.stdout),
    stderr: commandError.stderr === undefined ? "" : String(commandError.stderr),
  }, "md2vid", version);
}

async function defaultRegistryLookup(version: string, context?: ReleaseContext): Promise<string> {
  const npm = npmCommand([
    "view",
    `md2vid@${version}`,
    "dist.integrity",
    "--json",
    "--registry=https://registry.npmjs.org",
  ], context);
  return run(npm.command, npm.args, {}, context);
}

export async function pollRegistryIntegrity(
  version: string,
  expected: string,
  options: RegistryPollOptions = {},
): Promise<string> {
  registryInstallArguments(version, "registry-version-validation");
  if (!isStrictSha512Integrity(expected)) {
    throw new Error("invalid expected registry integrity value");
  }
  const lookup = options.lookup ?? ((registryVersion) => defaultRegistryLookup(registryVersion, options.context));
  const sleep = options.sleep ?? ((delay) => new Promise((resolveWait) => setTimeout(resolveWait, delay)));
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const stdout = await lookup(version);
      assertRegistryIntegrity(stdout, expected);
      return expected;
    } catch (error) {
      if (!isRegistryPropagation404(error, version)) throw error;
      if (attempt === 5) {
        throw new Error("registry propagation timeout after 6 attempts");
      }
      await sleep(REGISTRY_RETRY_DELAYS[attempt]);
    }
  }
  throw new Error("registry propagation timeout after 6 attempts");
}

function runProjectNpm(
  context: ReleaseContext,
  project: string,
  args: string[],
): string {
  const command = npmCommand(args, context);
  return run(command.command, command.args, {
    cwd: project,
    env: installedCommandEnvironment(context),
  }, context);
}

export function installedCommandEnvironment(
  context: ReleaseContext,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const inherited = Object.entries(base)
    .find(([name]) => name.toUpperCase() === "PATH")?.[1] ?? "";
  const installedBin = join(context.prefix, "node_modules", ".bin");
  return mergeEnvironment(base, {
    PATH: inherited ? `${installedBin}${delimiter}${inherited}` : installedBin,
    npm_config_dry_run: "false",
  });
}

export function installedBinInvocation(
  context: ReleaseContext,
  args: string[],
): CommandInvocation {
  return {
    command: join(context.prefix, "node_modules", ".bin", "md2vid"),
    args,
  };
}

export function parseVoiceUrls(indexHtml: string): string[] {
  return [...indexHtml.matchAll(/<audio\b[^>]*\bsrc="([^"]+)"/g)]
    .map((match) => match[1]);
}

interface ProcessLifecycle {
  readonly pid?: number;
  readonly exitCode: number | null;
  readonly signalCode: NodeJS.Signals | null;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  off(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
}

interface TreeLifecycle {
  signal(signal: "SIGTERM" | "SIGKILL"): void;
  wait(timeoutMs?: number): Promise<boolean>;
}

function hasProcessExited(
  child: Pick<ProcessLifecycle, "exitCode" | "signalCode">,
): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

export function waitForExit(
  child: ProcessLifecycle,
  timeoutMs?: number,
): Promise<boolean> {
  if (hasProcessExited(child)) return Promise.resolve(true);
  return new Promise<boolean>((resolveExit) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const onExit = () => finish(true);
    const finish = (exited: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child.off("exit", onExit);
      resolveExit(exited);
    };
    child.once("exit", onExit);
    if (hasProcessExited(child)) finish(true);
    if (!settled && timeoutMs !== undefined) {
      timer = setTimeout(() => finish(false), timeoutMs);
    }
  });
}

export async function terminateProcessTree(
  lifecycle: TreeLifecycle,
  graceMs = 5_000,
): Promise<void> {
  lifecycle.signal("SIGTERM");
  if (await lifecycle.wait(graceMs)) return;
  lifecycle.signal("SIGKILL");
  await lifecycle.wait();
}

async function waitForPosixProcessGroup(
  pid: number,
  timeoutMs?: number,
): Promise<boolean> {
  const deadline = timeoutMs === undefined ? undefined : Date.now() + timeoutMs;
  for (;;) {
    try {
      process.kill(-pid, 0);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ESRCH") return true;
      if (code !== "EPERM") throw error;
      // macOS can report a transient permission error while a terminating
      // process group is being reaped; keep polling until it disappears.
    }
    if (deadline !== undefined && Date.now() >= deadline) return false;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
}

function signalPosixProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

export async function stopProcessTree(
  child: ProcessLifecycle,
  graceMs = 5_000,
): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) {
    if (hasProcessExited(child)) return;
    throw new Error("cannot stop Studio process tree without a child pid");
  }

  await terminateProcessTree({
    signal(signal) {
      signalPosixProcessGroup(pid, signal);
    },
    wait(timeoutMs) {
      return waitForPosixProcessGroup(pid, timeoutMs);
    },
  }, graceMs);

  await waitForExit(child);
}

export function localNpmExecInvocation(
  npmExecPath = process.env.npm_execpath,
): CommandInvocation {
  if (!npmExecPath) {
    throw new Error("npm_execpath is unavailable; run release checks through npm");
  }
  return {
    command: process.execPath,
    args: [npmExecPath, "exec", "--yes=false", "--", "md2vid", "--version"],
  };
}

export function runInstalledCli(
  context: ReleaseContext,
  args: string[],
  cwd = context.work,
  env?: NodeJS.ProcessEnv,
): string {
  assert.ok(context.md2vidBin, "installed md2vid binary is unavailable");
  return run(process.execPath, [context.md2vidBin, ...args], { cwd, env }, context);
}

function runInstalledFromPath(
  context: ReleaseContext,
  args: string[],
  cwd = context.work,
): string {
  const invocation = installedBinInvocation(context, args);
  return run(invocation.command, invocation.args, {
    cwd,
    env: installedCommandEnvironment(context),
  }, context);
}

export function assertCliVersionMatchesPackageMetadata(
  actualVersion: string,
  packageFile: string,
): void {
  const metadata = JSON.parse(readFileSync(packageFile, "utf8")) as {
    name?: string;
    version?: string;
  };
  assert.equal(metadata.name, "md2vid", `invalid package metadata at ${packageFile}`);
  assert.equal(typeof metadata.version, "string", `missing package version at ${packageFile}`);
  assert.equal(
    actualVersion.trim(),
    metadata.version,
    "CLI version must match package metadata",
  );
}

function tarField(buffer: Buffer, offset: number, length: number): string {
  const field = buffer.subarray(offset, offset + length);
  const nul = field.indexOf(0);
  return field.subarray(0, nul === -1 ? field.length : nul).toString("utf8");
}

export function listTarGzEntries(tarball: string): string[] {
  const archive = gunzipSync(readFileSync(tarball));
  const entries: string[] = [];
  let offset = 0;

  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const name = tarField(header, 0, 100);
    const prefix = tarField(header, 345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const sizeText = tarField(header, 124, 12).trim();
    const size = sizeText ? Number.parseInt(sizeText, 8) : 0;
    assert.ok(Number.isSafeInteger(size) && size >= 0, `invalid tar entry size for ${path}`);

    const type = tarField(header, 156, 1);
    if (type === "" || type === "0" || type === "5") entries.push(path);
    offset += 512 + Math.ceil(size / 512) * 512;
  }

  return entries;
}

export function withPackLock<T>(
  operation: () => T,
  lockPath = PACK_LOCK_PATH,
): T {
  let acquired = false;
  try {
    try {
      mkdirSync(lockPath);
      acquired = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(`repository pack lock is already held at ${lockPath}`);
      }
      throw error;
    }
    return operation();
  } finally {
    if (acquired) rmSync(lockPath, { recursive: true, force: true });
  }
}

export function packedFileListing(tarball: string): string[] {
  return listTarGzEntries(tarball)
    .filter((path) => path.startsWith("package/") && !path.endsWith("/"))
    .map((path) => path.slice("package/".length));
}

export function packArtifact(
  context: ReleaseContext,
  outputDirectory = context.artifacts,
  runner: CommandRunner = context.commandRunner ?? defaultCommandRunner,
): string {
  return withPackLock(() => {
    const output = resolve(outputDirectory);
    mkdirSync(output, { recursive: true });
    assert.deepEqual(readdirSync(output), [], "artifact directory must start empty");
    rmSync(join(REPO_ROOT, "dist"), { recursive: true, force: true });
    assert.equal(existsSync(join(REPO_ROOT, "dist")), false, "dist must be absent before npm pack");

    // Lifecycle scripts can write before npm's own result, so inspect the one
    // tarball created in the empty artifact directory instead of parsing stdout.
    // Override inherited dry-run state so the acceptance gate gets real bytes.
    const npm = npmCommand(["pack", "--dry-run=false", "--pack-destination", output], context);
    run(npm.command, npm.args, { cwd: REPO_ROOT }, context, runner);
    const expected = `${PACKAGE_METADATA.name}-${PACKAGE_METADATA.version}.tgz`;
    const tarballs = readdirSync(output).filter((name) => name.endsWith(".tgz"));
    assert.deepEqual(tarballs, [expected], "expected exactly the current package tarball");

    const tarball = resolve(output, expected);
    assert.ok(statSync(tarball).isFile(), `missing tarball ${tarball}`);
    assert.ok(
      existsSync(join(REPO_ROOT, "dist", "bin", "md2vid.js")),
      "prepack did not rebuild dist",
    );
    context.tarball = tarball;
    context.packedFiles = packedFileListing(tarball);
    return tarball;
  });
}

export function useSuppliedArtifact(context: ReleaseContext, tarball: string): string {
  const supplied = resolve(tarball);
  let regular = false;
  try {
    regular = statSync(supplied).isFile();
  } catch {
    regular = false;
  }
  assert.equal(regular, true, `supplied artifact must be a regular file: ${supplied}`);
  context.tarball = supplied;
  context.packedFiles = packedFileListing(supplied);
  return supplied;
}

export function assertPackedFiles(context: ReleaseContext): void {
  const testFiles = context.packedFiles.filter(
    (path) => /(?:^|\/)__tests__\//.test(path) || path.endsWith(".test.ts"),
  );
  assert.deepEqual(testFiles, [], `tarball must exclude test file(s): ${testFiles.join(", ")}`);

  for (const path of REQUIRED_PACKED_FILES) {
    assert.ok(context.packedFiles.includes(path), `tarball must ship ${path}`);
  }
  for (const prefix of FORBIDDEN_PACKED_PREFIXES) {
    assert.equal(
      context.packedFiles.some((path) => path.startsWith(prefix)),
      false,
      `tarball must exclude ${prefix}`,
    );
  }
  for (const path of FORBIDDEN_PACKED_FILES) {
    assert.equal(context.packedFiles.includes(path), false, `tarball must exclude ${path}`);
  }
}

function assertPostinstallOutput(output: string): void {
  assert.match(output, /patch|already applied|applied caption-loop/i);
}

function installedPackageRoot(context: ReleaseContext): string {
  return join(context.prefix, "node_modules", "md2vid");
}

function setInstalledMd2vidBin(context: ReleaseContext): void {
  context.md2vidBin = join(installedPackageRoot(context), "dist", "bin", "md2vid.js");
  assert.ok(existsSync(context.md2vidBin));
}

export function installArtifact(context: ReleaseContext): string {
  assert.ok(context.tarball, "packArtifact must run first");
  const npm = npmCommand([
    "install",
    "--dry-run=false",
    "--prefix",
    context.prefix,
    "--foreground-scripts",
    context.tarball,
  ], context);
  const output = run(npm.command, npm.args, {}, context);
  assertPostinstallOutput(output);
  const hyperframes = JSON.parse(
    readFileSync(join(context.prefix, "node_modules", "hyperframes", "package.json"), "utf8"),
  ) as { version: string };
  assert.equal(hyperframes.version, REQUIRED_HYPERFRAMES_VERSION);
  setInstalledMd2vidBin(context);
  return output;
}

export function installRegistryArtifact(context: ReleaseContext, version: string): string {
  const npm = npmCommand(registryInstallArguments(version, context.prefix), context);
  const output = run(npm.command, npm.args, {}, context);
  assertPostinstallOutput(output);
  setInstalledMd2vidBin(context);
  return output;
}

export interface RegistryVerificationOptions {
  poll?: typeof pollRegistryIntegrity;
  sleep?: (delay: number) => Promise<void>;
}

export async function verifyRegistryArtifact(
  context: ReleaseContext,
  version: string,
  expectedIntegrity: string,
  options: RegistryVerificationOptions = {},
): Promise<void> {
  const poll = options.poll ?? pollRegistryIntegrity;
  await poll(version, expectedIntegrity, { context, sleep: options.sleep });
  installRegistryArtifact(context, version);

  const installed = JSON.parse(
    readFileSync(join(installedPackageRoot(context), "package.json"), "utf8"),
  ) as { version?: unknown };
  assert.equal(installed.version, version, "installed package version mismatch");

  const hyperframes = JSON.parse(
    readFileSync(join(context.prefix, "node_modules", "hyperframes", "package.json"), "utf8"),
  ) as { version?: unknown };
  assert.equal(
    hyperframes.version,
    REQUIRED_HYPERFRAMES_VERSION,
    "HyperFrames package version mismatch",
  );

  assertInstalledCli(context);
  assertInstalledSkill(context, "config", false);
  assertInstalledSkill(context, "home", false);
}

export function assertInstalledCli(context: ReleaseContext): void {
  const packageFile = join(context.prefix, "node_modules", "md2vid", "package.json");
  assertCliVersionMatchesPackageMetadata(
    runInstalledCli(context, ["--version"]),
    packageFile,
  );
  const localCommand = localNpmExecInvocation();
  recordNpmInvocation(context, localCommand.args.slice(1));
  const localVersion = run(localCommand.command, localCommand.args, {
    cwd: context.prefix,
    env: {
      npm_config_cache: join(context.root, "npm-cache"),
      npm_config_offline: "true",
    },
  }, context);
  assertCliVersionMatchesPackageMetadata(localVersion, packageFile);

  const help = runInstalledCli(context, ["--help"]);
  assert.match(help, /npm install -g md2vid/);
  assert.match(help, /npx --yes=false md2vid/);
  assert.doesNotMatch(help, /npx --no md2vid/);
  assert.match(help, /Node\.js >=22\.18/);
}

function readTextTree(root: string): Array<{ path: string; body: string }> {
  const files: Array<{ path: string; body: string }> = [];
  for (const name of readdirSync(root)) {
    if (name === "node_modules") continue;
    const path = join(root, name);
    if (statSync(path).isDirectory()) files.push(...readTextTree(path));
    else {
      try {
        files.push({ path, body: readFileSync(path, "utf8") });
      } catch {
        // Binary asset.
      }
    }
  }
  return files;
}

export function assertNoRepoRelativePaths(project: string): void {
  const stale = /node\s+(?:\.\.\/)*scripts\/\S+\.(?:ts|mjs)|\.\.\/\.\.\/scripts|@\.\.\/\.\.\/docs/;
  const hits = readTextTree(project).filter((file) => stale.test(file.body));
  assert.deepEqual(
    hits.map((file) => file.path),
    [],
    `repo-relative path in ${hits.map((file) => file.path).join(", ")}`,
  );
}

function fileTree(root: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const visit = (directory: string) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) visit(path);
      else files.set(relative(root, path), readFileSync(path));
    }
  };
  visit(root);
  return files;
}

function assertTreesEqual(expectedRoot: string, actualRoot: string): void {
  const expected = fileTree(expectedRoot);
  const actual = fileTree(actualRoot);
  assert.deepEqual(
    [...actual.keys()].sort(),
    [...expected.keys()].sort(),
    "installed skill file set differs",
  );
  for (const [path, body] of expected) {
    assert.deepEqual(actual.get(path), body, `installed skill content differs: ${path}`);
  }
}

export interface SkillInstallTarget {
  env: NodeJS.ProcessEnv;
  destination: string;
}

export function skillInstallTarget(
  context: ReleaseContext,
  mode: "config" | "home",
): SkillInstallTarget {
  const root = join(context.root, `claude-${mode}`);
  const isolatedHome = mode === "home" ? root : join(context.root, "unused-home");
  return {
    env: {
      CLAUDE_CONFIG_DIR: mode === "config" ? root : undefined,
      HOME: isolatedHome,
      USERPROFILE: isolatedHome,
      HOMEDRIVE: undefined,
      HOMEPATH: undefined,
    },
    destination: mode === "config"
      ? join(root, "skills", "md2vid")
      : join(root, ".claude", "skills", "md2vid"),
  };
}

export function assertInstalledSkill(
  context: ReleaseContext,
  mode: "config" | "home",
  verifyReplacement = true,
): void {
  const { destination, env } = skillInstallTarget(context, mode);
  mkdirSync(dirname(destination), { recursive: true });

  runInstalledCli(context, ["install-skill"], context.work, env);
  const packaged = join(context.prefix, "node_modules", "md2vid", "skill", "md2vid");
  assertTreesEqual(packaged, destination);

  if (verifyReplacement) {
    writeFileSync(join(destination, "stale.txt"), "stale\n");
    runInstalledCli(context, ["install-skill"], context.work, env);
    assert.equal(existsSync(join(destination, "stale.txt")), false);
    assertTreesEqual(packaged, destination);
  }
}

function stageFlatAuthoredInputs(project: string): void {
  cpSync(join(FIXTURES, "audio_meta.json"), join(project, "audio_meta.json"));
  cpSync(join(FIXTURES, "assets", "voice"), join(project, "assets", "voice"), {
    recursive: true,
  });
  const configPath = join(project, "video.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.slugs = { intro: "01-smoke" };
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

function assertCompleteScaffold(
  project: string,
  framework: "hyperframes" | "remotion",
): void {
  const common = [
    "meta.json",
    "video.config.json",
    "audio_request.json.example",
    "output.config.json",
    "package.json",
    "CLAUDE.md",
    "AGENTS.md",
    `.md2vid/standards/${framework}.md`,
  ];
  const runtime = framework === "hyperframes"
    ? [
        "hyperframes.json",
        "caption-overrides.json",
        "assets",
        ".hyperframes/caption-skin.html",
        "compositions/frames",
      ]
    : [
        "render.ts",
        "remotion.config.ts",
        "tsconfig.json",
        ".gitignore",
        "src/index.ts",
        "src/Root.tsx",
        "src/Video.tsx",
      ];
  for (const path of [...common, ...runtime]) {
    assert.ok(existsSync(join(project, path)), `scaffold must provide ${path}`);
  }
  if (framework === "hyperframes") {
    assert.equal(existsSync(join(project, "assets", "gsap.min.js")), false);
  }
}

function assertGeneratedPackageScripts(
  project: string,
  framework: "hyperframes" | "remotion",
): void {
  const { scripts } = JSON.parse(readFileSync(join(project, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(scripts.build, "md2vid build . && md2vid regroup . --max-chars 54");
  assert.equal(scripts.transcribe, "md2vid transcribe .");
  assert.equal(scripts.verify, "md2vid verify .");
  assert.equal(
    scripts.check,
    framework === "hyperframes"
      ? "md2vid verify . && md2vid hyperframes lint && md2vid hyperframes validate && md2vid hyperframes inspect"
      : "md2vid verify . && tsc --noEmit -p tsconfig.json",
  );
  assert.equal(
    framework === "hyperframes" ? scripts.dev : scripts.still,
    framework === "hyperframes" ? "md2vid hyperframes preview --no-open" : "node render.ts --still",
  );
  for (const command of Object.values(scripts)) {
    assert.doesNotMatch(command, /(?:^|\s)(?:\.\.\/|\/Users\/|\/home\/)/);
  }
}

async function allocatePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveReady);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to allocate Studio port");
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
  return address.port;
}

async function withHyperframesStudio(
  context: ReleaseContext,
  project: string,
  operation: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const port = await allocatePort();
  const npm = npmCommand(["run", "dev", "--", "--port", String(port)], context);
  const child = spawn(npm.command, npm.args, {
    cwd: project,
    env: installedCommandEnvironment(context),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr?.on("data", (chunk) => { output += chunk.toString(); });
  const studioUrl = `http://127.0.0.1:${port}/`;
  const baseUrl = `${studioUrl}api/projects/${encodeURIComponent(basename(project))}/preview/`;
  try {
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (hasProcessExited(child)) {
        const reason = child.signalCode === null
          ? `status ${child.exitCode}`
          : `signal ${child.signalCode}`;
        throw new Error(`Studio exited early (${reason})\n${output}`);
      }
      try {
        const response = await fetch(studioUrl);
        ready = response.ok;
        await response.body?.cancel();
        if (ready) break;
      } catch {
        // Retry until deadline or terminal child exit.
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    if (!ready) throw new Error(`Studio readiness timeout at ${baseUrl}\n${output}`);
    await operation(baseUrl);
  } finally {
    await stopProcessTree(child);
  }
}

export async function runFrameworkSmoke(
  context: ReleaseContext,
  framework: "hyperframes" | "remotion",
): Promise<void> {
  assert.equal(
    runInstalledFromPath(context, ["--version"]).trim(),
    PACKAGE_METADATA.version,
  );
  assert.equal(
    runInstalledFromPath(context, ["hyperframes", "--version"]).trim(),
    REQUIRED_HYPERFRAMES_VERSION,
  );

  const caseRoot = join(context.work, `smoke-${framework}-case`);
  mkdirSync(caseRoot, { recursive: true });
  const scaffoldArgs = framework === "hyperframes"
    ? ["new", framework]
    : ["new", framework, "--framework", framework];
  runInstalledCli(context, scaffoldArgs, caseRoot);
  const project = join(caseRoot, framework);
  const shared = project;
  assertCompleteScaffold(project, framework);
  assertGeneratedPackageScripts(project, framework);
  assertNoRepoRelativePaths(project);
  stageFlatAuthoredInputs(project);

  if (framework === "hyperframes") {
    cpSync(
      join(FIXTURES, "01-smoke.html"),
      join(project, "compositions", "frames", "01-smoke.html"),
    );
    const previewHelp = runInstalledFromPath(
      context,
      ["hyperframes", "preview", "--help"],
      project,
    );
    assert.match(previewHelp, /--port\b/, "HyperFrames preview must support --port");
    runProjectNpm(context, project, ["run", "build"]);
    runProjectNpm(context, project, ["run", "check"]);

    const staged = join(project, "assets", "voice", "intro.wav");
    assert.ok(statSync(staged).isFile(), "HyperFrames staged WAV must be a regular file");
    assert.equal(lstatSync(staged).isSymbolicLink(), false);
    assert.ok(statSync(staged).size > 44, "HyperFrames staged WAV must be nonempty");

    const verify = runInstalledCli(context, ["verify", "."], project);
    assert.match(verify, /OK: video contract satisfied/);
    await withHyperframesStudio(context, project, async (baseUrl) => {
      const index = readFileSync(join(project, "index.html"), "utf8");
      const voiceUrls = parseVoiceUrls(index);
      assert.ok(voiceUrls.length > 0, "expected at least one emitted voice URL");
      for (const voiceUrl of voiceUrls) {
        const response = await fetch(new URL(voiceUrl, baseUrl));
        assert.equal(response.status, 200, `Studio must serve ${voiceUrl}`);
        await response.body?.cancel();
      }
    });
  } else {
    runProjectNpm(context, project, ["install"]);
    runProjectNpm(context, project, ["run", "build"]);
    runProjectNpm(context, project, ["run", "check"]);
    runProjectNpm(context, project, ["run", "still"]);

    const verify = runInstalledCli(context, ["verify", "."], project);
    assert.match(verify, /OK: video contract satisfied/);
    const still = join(project, "out", "still.jpeg");
    const sourceWav = join(shared, "assets", "voice", "intro.wav");
    const staged = join(project, "public", "assets", "voice", "intro.wav");
    assert.ok(statSync(still).size > 0, "Remotion still must be nonempty");
    assert.ok(statSync(staged).isFile(), "Remotion public WAV must be a regular file");
    assert.equal(lstatSync(staged).isSymbolicLink(), false);
    assert.ok(statSync(staged).size > 44, "Remotion public WAV must be nonempty");
    assert.deepEqual(readFileSync(staged), readFileSync(sourceWav));
  }
  assertNoRepoRelativePaths(project);
}
