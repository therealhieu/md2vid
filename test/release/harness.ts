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
import puppeteer from "puppeteer-core";
import { readPackageMetadata } from "../../scripts/package_root.ts";
import {
  DEFAULT_GSAP_SRC,
  GSAP_VERSION,
  isCanonicalStableVersion,
} from "../../scripts/dependency_versions.ts";
import { readPinnedHyperframesPatchState } from "../../frameworks/hyperframes/patches.ts";
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
  if (typeof version !== "string" || !isCanonicalStableVersion(version)) {
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

export function runWithHyperframesReadinessRetry<T>(
  operation: () => T,
  cleanup: () => void = () => undefined,
): T {
  try {
    return operation();
  } catch (error) {
    const commandError = error as Error & { stdout?: string | Buffer; stderr?: string | Buffer };
    const diagnostic = [commandError.message, commandError.stdout, commandError.stderr]
      .filter((value) => value !== undefined)
      .map(String)
      .join("\n");
    if (!diagnostic.includes("[FrameCapture] Composition has zero duration.")) throw error;
    cleanup();
    return operation();
  }
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

export function parseGsapUrls(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*\bsrc="([^"]*gsap[^"]*)"/gi)]
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
    "--ignore-scripts",
    context.tarball,
  ], context);
  const output = run(npm.command, npm.args, {}, context);
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
  config.slugs = { intro: "01-smoke", followup: "02-smoke" };
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

interface SmokeCaptionGroup {
  start: number;
  end: number;
  words: Array<{ start: number; end: number }>;
}

interface SmokeFrameState {
  localTime: number;
  futureOpacity: number;
  lateColor: string;
}

interface SmokeFrameProbe {
  compositionId: "01-smoke" | "02-smoke";
  futureId: "s01-future" | "s02-future";
  lateId: "s01-late" | "s02-late";
}

const SMOKE_FRAME_PROBES: SmokeFrameProbe[] = [
  { compositionId: "01-smoke", futureId: "s01-future", lateId: "s01-late" },
  { compositionId: "02-smoke", futureId: "s02-future", lateId: "s02-late" },
];
function smokeSeekPoints(frame2HostStart: number): number[] {
  return [
    0.5,
    frame2HostStart - 0.1,
    frame2HostStart,
    frame2HostStart + 2.4,
    2.4,
    frame2HostStart + 0.1,
    frame2HostStart + 2.9,
    0.2,
  ];
}

function derivedLocalPoints(
  globalPoints: readonly number[],
  hostStart: number,
  duration: number,
): number[] {
  return globalPoints.map((globalTime) => Math.max(0, Math.min(globalTime - hostStart, duration)));
}

function captionBrowserExpectations(
  groups: SmokeCaptionGroup[],
  duration: number,
  seekPoints: number[],
) {
  return seekPoints.map((time) => {
    const visibleGroups: number[] = [];
    const classes: string[] = [];
    groups.forEach((group, groupIndex) => {
      const nextGroup = groups[groupIndex + 1];
      const end = groupIndex === groups.length - 1
        ? duration
        : Math.min(nextGroup.start, group.end + 0.3);
      if (time >= group.start && time < end) visibleGroups.push(groupIndex);
      group.words.forEach((word, wordIndex) => {
        const nextWord = group.words[wordIndex + 1];
        let className = "caption-word";
        if (time >= group.start) {
          if (nextWord && time >= nextWord.start) className = "caption-word is-spoken";
          else if (!nextWord && time >= Math.min(end, word.end + 0.1)) className = "caption-word is-spoken";
          else if (time >= word.start) className = "caption-word is-active";
        }
        classes.push(className);
      });
    });
    return { time, visibleGroups, classes };
  });
}

async function captureStandaloneFrameStates(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>,
  baseUrl: string,
  probe: SmokeFrameProbe,
  localTimes: number[],
): Promise<SmokeFrameState[]> {
  const sourceUrl = new URL(`compositions/frames/${probe.compositionId}.html`, baseUrl);
  const response = await fetch(sourceUrl);
  assert.equal(response.status, 200, `Studio must serve standalone ${probe.compositionId}`);
  const source = await response.text();
  const template = source.match(/<template\b[^>]*>([\s\S]*)<\/template>/i)?.[1];
  assert.ok(template, `standalone ${probe.compositionId} must contain a transport template`);
  const page = await browser.newPage();
  try {
    await page.setContent(
      `<!doctype html><html><head><base href="${baseUrl}"></head><body>${template}</body></html>`,
      { waitUntil: "load", timeout: 30_000 },
    );
    return await page.evaluate(({ frameProbe, times }) => {
      interface Timeline {
        seek(time: number): Timeline;
        time(): number;
      }
      const runtime = globalThis as unknown as {
        __timelines?: Record<string, Timeline>;
      };
      const timeline = runtime.__timelines?.[frameProbe.compositionId];
      const standaloneDocument = (globalThis as any).document;
      const standaloneGetComputedStyle = (globalThis as any).getComputedStyle;
      const future = standaloneDocument.getElementById(frameProbe.futureId);
      const late = standaloneDocument.getElementById(frameProbe.lateId);
      if (!timeline || !future || !late) {
        throw new Error(`standalone frame state probe is missing ${frameProbe.compositionId} runtime state`);
      }
      return times.map((localTime) => {
        timeline.seek(localTime);
        return {
          localTime: timeline.time(),
          futureOpacity: Number.parseFloat(standaloneGetComputedStyle(future).opacity),
          lateColor: standaloneGetComputedStyle(late).color,
        };
      });
    }, { frameProbe: probe, times: localTimes });
  } finally {
    await page.close();
  }
}

async function assertHyperframesBrowserExecution(
  executablePath: string,
  baseUrl: string,
  expectedGroups: SmokeCaptionGroup[],
  duration: number,
  expectedFrames: Array<{ slug: string; start: number; frameDur: number }>,
): Promise<void> {
  const expectedFrameBySlug = new Map(expectedFrames.map((frame) => [frame.slug, frame]));
  const frame1 = expectedFrameBySlug.get("01-smoke");
  const frame2 = expectedFrameBySlug.get("02-smoke");
  assert.ok(frame1 && frame2, "packed smoke plan must contain both frame timings");
  const frame2HostStart = frame2.start;
  assert.ok(frame2HostStart > 0, "second smoke frame must start at a nonzero global time");
  const globalSeekPoints = smokeSeekPoints(frame2HostStart);
  const browserExpectations = captionBrowserExpectations(expectedGroups, duration, globalSeekPoints);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const resourceErrors: string[] = [];
  try {
    const standaloneFrameStates: Record<string, SmokeFrameState[]> = {};
    for (const probe of SMOKE_FRAME_PROBES) {
      const expectedFrame = expectedFrameBySlug.get(probe.compositionId)!;
      const localPoints = derivedLocalPoints(
        globalSeekPoints,
        expectedFrame.start,
        expectedFrame.frameDur,
      );
      standaloneFrameStates[probe.compositionId] = await captureStandaloneFrameStates(
        browser,
        baseUrl,
        probe,
        localPoints,
      );
    }
    const page = await browser.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error instanceof Error ? error.message : String(error)));
    page.on("requestfailed", (request) => {
      const errorText = request.failure()?.errorText ?? "request failed";
      if (errorText === "net::ERR_ABORTED" && /\.wav(?:$|[?#])/.test(request.url())) return;
      resourceErrors.push(`${request.url()}: ${errorText}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400) resourceErrors.push(`${response.status()} ${response.url()}`);
    });

    await page.goto(baseUrl.replace(/\/$/, ""), { waitUntil: "networkidle0", timeout: 30_000 });
    const deadline = Date.now() + 15_000;
    let execution: {
      gsapVersion: string;
      frameTimelineIds: [string, string];
      samples: Array<{
        time: number;
        playerTime: number;
        mainTime: number;
        captionTime: number;
        frame1LocalTime: number;
        frame2LocalTime: number;
        frame1FutureOpacity: number;
        frame1LateColor: string;
        frame2FutureOpacity: number;
        frame2LateColor: string;
        visibleGroups: number;
        classes: string[];
      }>;
      wallClockElapsed: number;
      playerDrift: number;
      mainDrift: number;
      captionDrift: number;
      frame1Drift: number;
      frame2Drift: number;
    } | undefined;
    while (!execution && Date.now() < deadline) {
      for (const frame of page.frames()) {
        try {
          const candidate = await frame.evaluate(async (input) => {
            const expectations = input.captionExpectations;
            const standaloneStates = input.standaloneFrameStates;
            const frameTimings = input.frameTimings;
            interface Timeline {
              pause(): Timeline;
              seek(time: number): Timeline;
              time(): number;
              duration(): number;
              paused(): boolean;
            }
            const runtime = globalThis as unknown as {
              gsap?: { version?: string };
              __timelines?: Record<string, Timeline>;
              __player?: {
                pause(): void;
                seek(time: number): void;
                getTime(): number;
                isPlaying(): boolean;
              };
            };
            const pageDocument = (globalThis as any).document;
            const captionHost = pageDocument.getElementById("el-captions");
            const timelines = runtime.__timelines;
            const player = runtime.__player;
            if (!runtime.gsap?.version || !timelines || !player || !captionHost) return undefined;
            const timelineFor = (compositionId: string): { id: string; timeline: Timeline } => {
              const matches = Object.keys(timelines).filter((key) =>
                key === compositionId || key.startsWith(`${compositionId}__hf`)
              );
              if (matches.length !== 1) {
                throw new Error(
                  `expected exactly one timeline for ${compositionId}, found ${JSON.stringify(matches)} in ${JSON.stringify(Object.keys(timelines))}`,
                );
              }
              return { id: matches[0], timeline: timelines[matches[0]] };
            };
            const normalizedTimelineIds = Object.keys(timelines).map((key) =>
              key.replace(/__hf\d+$/, "")
            );
            if (new Set(normalizedTimelineIds).size !== normalizedTimelineIds.length) {
              throw new Error(`duplicate composition timelines: ${JSON.stringify(Object.keys(timelines))}`);
            }
            const frame1Host = pageDocument.getElementById("el-01-smoke");
            const frame2Host = pageDocument.getElementById("el-02-smoke");
            const mountedFrame1Roots = frame1Host?.querySelectorAll('[data-hf-inner-root="true"]') ?? [];
            const mountedFrame2Roots = frame2Host?.querySelectorAll('[data-hf-inner-root="true"]') ?? [];
            if (mountedFrame1Roots.length !== 1) {
              throw new Error(`expected exactly one mounted 01-smoke root, found ${mountedFrame1Roots.length}`);
            }
            if (mountedFrame2Roots.length !== 1) {
              throw new Error(`expected exactly one mounted 02-smoke root, found ${mountedFrame2Roots.length}`);
            }
            const mountedFrameRoot = mountedFrame1Roots[0] as any;
            const mountedFrame2Root = mountedFrame2Roots[0] as any;
            const smokeTitle = pageDocument.getElementById("s01-title") as any;
            const smoke2Title = pageDocument.getElementById("s02-title") as any;
            if (!smokeTitle || !mountedFrameRoot.contains(smokeTitle)) {
              throw new Error("mounted 01-smoke frame is missing #s01-title");
            }
            if (!smoke2Title || !mountedFrame2Root.contains(smoke2Title)) {
              throw new Error("mounted 02-smoke frame is missing #s02-title");
            }
            const pageGetComputedStyle = (globalThis as any).getComputedStyle;
            const captionHostStyle = pageGetComputedStyle(captionHost);
            if (captionHostStyle.pointerEvents !== "none") {
              throw new Error(`caption host must not intercept hit testing: ${captionHostStyle.pointerEvents}`);
            }
            const rootStyle = pageGetComputedStyle(mountedFrameRoot);
            const titleStyle = pageGetComputedStyle(smokeTitle);
            const hostRect = frame1Host.getBoundingClientRect();
            const rootRect = mountedFrameRoot.getBoundingClientRect();
            const titleRect = smokeTitle.getBoundingClientRect();
            const titleLeft = titleRect.left - rootRect.left;
            const titleTop = titleRect.top - rootRect.top;
            const viewportWidth = (globalThis as any).innerWidth;
            const viewportHeight = (globalThis as any).innerHeight;
            const intersectionWidth = Math.max(
              0,
              Math.min(rootRect.right, viewportWidth) - Math.max(rootRect.left, 0),
            );
            const intersectionHeight = Math.max(
              0,
              Math.min(rootRect.bottom, viewportHeight) - Math.max(rootRect.top, 0),
            );
            const titleIntersectsViewport =
              titleRect.right > 0 &&
              titleRect.bottom > 0 &&
              titleRect.left < viewportWidth &&
              titleRect.top < viewportHeight;
            const dimensionTolerance = 0.5;
            if (
              rootStyle.position !== "absolute" ||
              rootStyle.backgroundColor !== "rgb(250, 249, 245)" ||
              titleStyle.position !== "absolute" ||
              titleStyle.fontSize !== "96px" ||
              titleStyle.left !== "150px" ||
              titleStyle.top !== "480px" ||
              Math.abs(titleLeft - 150) > 0.01 ||
              Math.abs(titleTop - 480) > 0.01 ||
              Math.abs(hostRect.width - 1920) > dimensionTolerance ||
              Math.abs(hostRect.height - 1080) > dimensionTolerance ||
              Math.abs(rootRect.width - 1920) > dimensionTolerance ||
              Math.abs(rootRect.height - 1080) > dimensionTolerance ||
              Math.abs(hostRect.width - rootRect.width) > dimensionTolerance ||
              Math.abs(hostRect.height - rootRect.height) > dimensionTolerance ||
              intersectionWidth < Math.min(rootRect.width, viewportWidth) * 0.5 ||
              intersectionHeight < Math.min(rootRect.height, viewportHeight) * 0.5 ||
              !titleIntersectsViewport
            ) {
              throw new Error(`mounted frame styles or geometry were not applied: ${JSON.stringify({
                rootPosition: rootStyle.position,
                backgroundColor: rootStyle.backgroundColor,
                titlePosition: titleStyle.position,
                fontSize: titleStyle.fontSize,
                left: titleStyle.left,
                top: titleStyle.top,
                titleLeft,
                titleTop,
                hostWidth: hostRect.width,
                hostHeight: hostRect.height,
                rootWidth: rootRect.width,
                rootHeight: rootRect.height,
                intersectionWidth,
                intersectionHeight,
                titleIntersectsViewport,
              })}`);
            }
            const { timeline: main } = timelineFor("main");
            const { timeline: captions } = timelineFor("captions");
            const frame1TimelineMatch = timelineFor("01-smoke");
            const frame2TimelineMatch = timelineFor("02-smoke");
            const frame1Timeline = frame1TimelineMatch.timeline;
            const frame2Timeline = frame2TimelineMatch.timeline;
            for (const forbidden of ["01-smoke__hf2", "02-smoke__hf2"]) {
              if (Object.keys(timelines).includes(forbidden)) {
                throw new Error(`unexpected duplicate frame timeline ${forbidden} in ${JSON.stringify(Object.keys(timelines))}`);
              }
            }
            if (!/^01-smoke(?:__hf1)?$/.test(frame1TimelineMatch.id)) {
              throw new Error(`unexpected scoped frame timeline id ${frame1TimelineMatch.id}`);
            }
            if (!/^02-smoke(?:__hf1)?$/.test(frame2TimelineMatch.id)) {
              throw new Error(`unexpected scoped frame timeline id ${frame2TimelineMatch.id}`);
            }
            const frame1HostStart = Number.parseFloat(frame1Host.getAttribute("data-start") ?? "0");
            const frame2HostStart = Number.parseFloat(frame2Host.getAttribute("data-start") ?? "0");
            if (
              Math.abs(frame1HostStart - frameTimings["01-smoke"].start) >= 0.001 ||
              Math.abs(frame2HostStart - frameTimings["02-smoke"].start) >= 0.001 ||
              frame2HostStart <= 0
            ) {
              throw new Error(`unexpected frame host starts: ${frame1HostStart}, ${frame2HostStart}`);
            }
            const frame1Future = pageDocument.getElementById("s01-future") as any;
            const frame1Late = pageDocument.getElementById("s01-late") as any;
            const frame2Future = pageDocument.getElementById("s02-future") as any;
            const frame2Late = pageDocument.getElementById("s02-late") as any;
            if (!frame1Future || !frame1Late || !frame2Future || !frame2Late) {
              throw new Error("composed frame state probe is missing visual elements");
            }
            player.pause();
            player.seek(expectations[0]?.time ?? 0);
            const hitStack = pageDocument.elementsFromPoint(viewportWidth / 2, viewportHeight / 2);
            if (hitStack.includes(captionHost)) {
              throw new Error("caption host must be absent from elementFromPoint hits");
            }
            const visualSceneExposed = hitStack.some((element: any) =>
              element === frame1Host ||
              element === frame2Host ||
              frame1Host.contains(element) ||
              frame2Host.contains(element)
            );
            if (!visualSceneExposed) {
              throw new Error("visual scene beneath caption host must remain exposed to hit testing");
            }

            const samples = expectations.map(({ time, visibleGroups: expectedVisibleGroups, classes }, sampleIndex) => {
              player.seek(time);
              const expectedFrame1LocalTime = Math.max(
                0,
                Math.min(time - frame1HostStart, frame1Timeline.duration()),
              );
              const expectedFrame2LocalTime = Math.max(
                0,
                Math.min(time - frame2HostStart, frame2Timeline.duration()),
              );
              const frame1LocalTime = frame1Timeline.time();
              const frame2LocalTime = frame2Timeline.time();
              if (
                Math.abs(frame1LocalTime - expectedFrame1LocalTime) >= 0.001 ||
                Math.abs(frame2LocalTime - expectedFrame2LocalTime) >= 0.001
              ) {
                throw new Error(`frame local times at global ${time}: ${JSON.stringify({
                  frame1: { start: frame1HostStart, expected: expectedFrame1LocalTime, actual: frame1LocalTime },
                  frame2: { start: frame2HostStart, expected: expectedFrame2LocalTime, actual: frame2LocalTime },
                })}`);
              }
              const standaloneFrame1 = standaloneStates["01-smoke"][sampleIndex];
              const standaloneFrame2 = standaloneStates["02-smoke"][sampleIndex];
              const frame1FutureOpacity = Number.parseFloat(pageGetComputedStyle(frame1Future).opacity);
              const frame1LateColor = pageGetComputedStyle(frame1Late).color;
              const frame2FutureOpacity = Number.parseFloat(pageGetComputedStyle(frame2Future).opacity);
              const frame2LateColor = pageGetComputedStyle(frame2Late).color;
              if (
                Math.abs(frame1FutureOpacity - standaloneFrame1.futureOpacity) >= 0.001 ||
                frame1LateColor !== standaloneFrame1.lateColor ||
                Math.abs(frame1LocalTime - standaloneFrame1.localTime) >= 0.001 ||
                Math.abs(frame2FutureOpacity - standaloneFrame2.futureOpacity) >= 0.001 ||
                frame2LateColor !== standaloneFrame2.lateColor ||
                Math.abs(frame2LocalTime - standaloneFrame2.localTime) >= 0.001
              ) {
                throw new Error(`standalone frame state mismatch at ${time}: ${JSON.stringify({
                  composed: {
                    frame1: { frame1LocalTime, frame1FutureOpacity, frame1LateColor },
                    frame2: { frame2LocalTime, frame2FutureOpacity, frame2LateColor },
                  },
                  standalone: { frame1: standaloneFrame1, frame2: standaloneFrame2 },
                })}`);
              }
              const actualClasses = Array.from(captionHost.querySelectorAll(".caption-word") as any[])
                .map((element: any) => String(element.className));
              const captionBoundaryIsExact = Math.abs(time - frame2HostStart) < 0.001;
              if (!captionBoundaryIsExact && JSON.stringify(actualClasses) !== JSON.stringify(classes)) {
                throw new Error(
                  `caption classes at ${time} (player=${player.getTime()}, main=${main.time()}/${main.duration()} paused=${main.paused()}, captions=${captions.time()}/${captions.duration()} paused=${captions.paused()}): ${JSON.stringify(actualClasses)}`,
                );
              }
              const visibleGroupIndexes = Array.from(captionHost.querySelectorAll(".caption-group") as any[])
                .map((element: any, index: number) => ({
                  index,
                  visible: Number.parseFloat(pageGetComputedStyle(element).opacity) > 0.5,
                }))
                .filter((entry) => entry.visible)
                .map((entry) => entry.index);
              if (
                !captionBoundaryIsExact &&
                JSON.stringify(visibleGroupIndexes) !== JSON.stringify(expectedVisibleGroups)
              ) {
                throw new Error(`visible caption groups at ${time}: ${JSON.stringify(visibleGroupIndexes)}`);
              }
              const visibleGroups = visibleGroupIndexes.length;
              return {
                time,
                playerTime: player.getTime(),
                mainTime: main.time(),
                captionTime: captions.time(),
                frame1LocalTime,
                frame2LocalTime,
                frame1FutureOpacity,
                frame1LateColor,
                frame2FutureOpacity,
                frame2LateColor,
                visibleGroups,
                classes: actualClasses,
              };
            });

            player.seek(frameTimings["02-smoke"].start + 0.1);
            const playerBefore = player.getTime();
            const mainBefore = main.time();
            const captionBefore = captions.time();
            const frame1Before = frame1Timeline.time();
            const frame2Before = frame2Timeline.time();
            const wallStart = performance.now();
            await new Promise((resolveWait) => setTimeout(resolveWait, 275));
            const wallClockElapsed = performance.now() - wallStart;
            return {
              gsapVersion: runtime.gsap.version,
              frameTimelineIds: [frame1TimelineMatch.id, frame2TimelineMatch.id] as [string, string],
              samples,
              wallClockElapsed,
              playerDrift: Math.abs(player.getTime() - playerBefore),
              mainDrift: Math.abs(main.time() - mainBefore),
              captionDrift: Math.abs(captions.time() - captionBefore),
              frame1Drift: Math.abs(frame1Timeline.time() - frame1Before),
              frame2Drift: Math.abs(frame2Timeline.time() - frame2Before),
            };
          }, {
            captionExpectations: browserExpectations,
            standaloneFrameStates,
            frameTimings: {
              "01-smoke": { start: frame1.start, frameDur: frame1.frameDur },
              "02-smoke": { start: frame2.start, frameDur: frame2.frameDur },
            },
          });
          if (candidate) {
            execution = candidate;
            break;
          }
        } catch (error) {
          if (!String(error).includes("Execution context was destroyed")) throw error;
        }
      }
      if (!execution) await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }

    assert.ok(execution, "timed out waiting for main and captions timelines");
    assert.equal(execution.gsapVersion, GSAP_VERSION, "browser must execute real pinned GSAP");
    assert.match(execution.frameTimelineIds[0], /^01-smoke(?:__hf1)?$/);
    assert.match(execution.frameTimelineIds[1], /^02-smoke(?:__hf1)?$/);
    const sampleAt = (time: number) => {
      const sample = execution!.samples.find((candidate) => candidate.time === time);
      assert.ok(sample, `missing frame sample at ${time}`);
      return sample;
    };
    const beforeFrame2 = frame2HostStart - 0.1;
    const afterFrame2 = frame2HostStart + 0.1;
    const frame2RevealGlobal = frame2HostStart + 2.4;
    const frame2HandoffGlobal = frame2HostStart + 2.9;
    assert.ok(sampleAt(0.5).frame1FutureOpacity < 0.01, "frame 1 future element must start hidden");
    assert.ok(sampleAt(2.4).frame1FutureOpacity > 0.99, "frame 1 future element must reveal on its cue");
    assert.equal(sampleAt(2.4).frame1LateColor, "rgb(20, 20, 19)", "frame 1 late handoff must remain neutral");
    assert.equal(sampleAt(frame2HostStart).frame1LateColor, "rgb(204, 120, 92)", "frame 1 late handoff must become coral");

    assert.equal(sampleAt(beforeFrame2).frame2LocalTime, 0, "frame 2 local time must clamp before host start");
    assert.equal(sampleAt(frame2HostStart).frame2LocalTime, 0, "frame 2 local time must be zero at host start");
    assert.ok(Math.abs(sampleAt(afterFrame2).frame2LocalTime - 0.1) < 0.001, "frame 2 local time must offset after host start");
    assert.ok(sampleAt(frame2RevealGlobal).frame2FutureOpacity > 0.99, "frame 2 future element must reveal at local 2.4");
    assert.equal(sampleAt(frame2RevealGlobal).frame2LateColor, "rgb(31, 41, 55)", "frame 2 must remain neutral at local 2.4");
    assert.equal(sampleAt(frame2HandoffGlobal).frame2LateColor, "rgb(93, 184, 114)", "frame 2 must hand off at local 2.9");
    for (const sample of execution.samples) {
      assert.ok(Math.abs(sample.playerTime - sample.time) < 0.001, `player time mismatch at ${sample.time}`);
      assert.ok(Math.abs(sample.mainTime - sample.time) < 0.001, `main timeline mismatch at ${sample.time}`);
      assert.ok(Math.abs(sample.captionTime - sample.time) < 0.001, `caption timeline mismatch at ${sample.time}`);
      if (Math.abs(sample.time - frame2HostStart) >= 0.001) {
        assert.equal(
          sample.visibleGroups,
          Math.abs(sample.time - beforeFrame2) < 0.001 ? 0 : 1,
          `caption group visibility at ${sample.time}`,
        );
      }
    }
    assert.ok(execution.wallClockElapsed >= 250, "wall-clock drift probe must span at least 250ms");
    assert.ok(execution.playerDrift < 0.001, `paused player drifted ${execution.playerDrift}s`);
    assert.ok(execution.mainDrift < 0.001, `paused main timeline drifted ${execution.mainDrift}s`);
    assert.ok(execution.captionDrift < 0.001, `paused caption timeline drifted ${execution.captionDrift}s`);
    assert.ok(execution.frame1Drift < 0.001, `paused frame 1 timeline drifted ${execution.frame1Drift}s`);
    assert.ok(execution.frame2Drift < 0.001, `paused frame 2 timeline drifted ${execution.frame2Drift}s`);
    assert.deepEqual(consoleErrors, [], `browser console errors: ${consoleErrors.join("\n")}`);
    assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join("\n")}`);
    assert.deepEqual(resourceErrors, [], `browser resource errors: ${resourceErrors.join("\n")}`);
  } finally {
    await browser.close();
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
  if (framework === "hyperframes") {
    const packageRoot = join(context.prefix, "node_modules", "hyperframes");
    const installation = {
      packageRoot,
      cliEntry: join(packageRoot, "dist", "cli.js"),
      version: REQUIRED_HYPERFRAMES_VERSION,
    };
    const cliBeforeProxy = readFileSync(installation.cliEntry);
    const beforeProxy = readPinnedHyperframesPatchState(installation);
    assert.deepEqual(
      { captionLoopApplied: beforeProxy.captionLoopApplied },
      { captionLoopApplied: false },
      "blocked postinstall must leave the packed-install HyperFrames bundle pristine",
    );
    assert.equal(
      runInstalledFromPath(context, ["hyperframes", "--version"]).trim(),
      REQUIRED_HYPERFRAMES_VERSION,
    );
    assert.deepEqual(
      readFileSync(installation.cliEntry),
      cliBeforeProxy,
      "proxy self-healing must not patch the HyperFrames CLI bundle",
    );
    const afterProxy = readPinnedHyperframesPatchState(installation);
    assert.deepEqual(
      { captionLoopApplied: afterProxy.captionLoopApplied },
      { captionLoopApplied: true },
      "the first HyperFrames proxy invocation must apply the required pinned patch",
    );
  } else {
    assert.equal(
      runInstalledFromPath(context, ["hyperframes", "--version"]).trim(),
      REQUIRED_HYPERFRAMES_VERSION,
    );
  }

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
    const gsapSrc = "assets/gsap/gsap.min.js";
    mkdirSync(join(project, "assets", "gsap"), { recursive: true });
    cpSync(
      join(REPO_ROOT, "node_modules", "gsap", "dist", "gsap.min.js"),
      join(project, gsapSrc),
    );
    writeFileSync(
      join(project, "output.config.json"),
      `${JSON.stringify({ framework: "hyperframes", gsapSrc }, null, 2)}\n`,
    );
    for (const frameSlug of ["01-smoke", "02-smoke"]) {
      const framePath = join(project, "compositions", "frames", `${frameSlug}.html`);
      cpSync(join(FIXTURES, `${frameSlug}.html`), framePath);
      writeFileSync(
        framePath,
        readFileSync(framePath, "utf8").replace(
          "__MD2VID_DEFAULT_GSAP_SRC__",
          gsapSrc,
        ),
      );
    }
    const previewHelp = runInstalledFromPath(
      context,
      ["hyperframes", "preview", "--help"],
      project,
    );
    assert.match(previewHelp, /--port\b/, "HyperFrames preview must support --port");
    runProjectNpm(context, project, ["run", "build"]);
    runProjectNpm(context, project, ["run", "check"]);

    const generatedGsapDocuments = [
      join(project, "index.html"),
      join(project, "compositions", "captions.html"),
      join(project, "compositions", "frames", "01-smoke.html"),
      join(project, "compositions", "frames", "02-smoke.html"),
    ];
    for (const document of generatedGsapDocuments) {
      const sources = parseGsapUrls(readFileSync(document, "utf8"));
      assert.deepEqual(sources, [gsapSrc], `local GSAP source in ${relative(project, document)}`);
    }
    const generatedIndex = readFileSync(join(project, "index.html"), "utf8");
    assert.equal(
      generatedIndex.match(/\.caption-host\s*\{\s*pointer-events:\s*none;\s*\}/g)?.length,
      1,
      "packed build must emit the caption host pointer rule exactly once",
    );
    const captionHostTag = generatedIndex.match(/<div(?=[^>]*\bid="el-captions")[^>]*>/)?.[0] ?? "";
    assert.match(captionHostTag, /class="scene caption-host"/);

    for (const voiceName of ["intro.wav", "followup.wav"]) {
      const staged = join(project, "assets", "voice", voiceName);
      assert.ok(statSync(staged).isFile(), `HyperFrames staged ${voiceName} must be a regular file`);
      assert.equal(lstatSync(staged).isSymbolicLink(), false);
      assert.ok(statSync(staged).size > 44, `HyperFrames staged ${voiceName} must be nonempty`);
    }

    const verify = runInstalledCli(context, ["verify", "."], project);
    assert.match(verify, /OK: video contract satisfied/);
    const browserPath = runInstalledFromPath(
      context,
      ["hyperframes", "browser", "path"],
      project,
    ).trim();
    assert.ok(browserPath, "HyperFrames browser path must be available");
    const captionArtifact = JSON.parse(
      readFileSync(join(project, "caption_groups.json"), "utf8"),
    ) as { groups: SmokeCaptionGroup[] };
    const buildArtifact = JSON.parse(
      readFileSync(join(project, "build", "build_plan.json"), "utf8"),
    ) as {
      totalDuration: number;
      frames: Array<{ slug: string; start: number; frameDur: number }>;
    };
    assert.ok(captionArtifact.groups.length > 1, "smoke regroup must materially split captions");

    // Render before starting the long-running Studio preview. On macOS, a just-
    // terminated Studio Chrome tree can transiently leave the next headless
    // capture without a ready runtime even after the process group is reaped.
    const smokeRender = join(project, "renders", "smoke.mp4");
    runWithHyperframesReadinessRetry(
      () => runProjectNpm(context, project, [
        "run", "render", "--",
        "--output", smokeRender,
        "--fps", "1",
        "--quality", "draft",
        "--workers", "1",
        "--quiet",
      ]),
      () => rmSync(smokeRender, { force: true }),
    );
    assert.ok(statSync(smokeRender).size > 0, "HyperFrames smoke render must be nonempty");

    await withHyperframesStudio(context, project, async (baseUrl) => {
      const index = readFileSync(join(project, "index.html"), "utf8");
      const voiceUrls = parseVoiceUrls(index);
      assert.ok(voiceUrls.length > 0, "expected at least one emitted voice URL");
      for (const voiceUrl of voiceUrls) {
        const response = await fetch(new URL(voiceUrl, baseUrl));
        assert.equal(response.status, 200, `Studio must serve ${voiceUrl}`);
        await response.body?.cancel();
      }
      const gsapResponse = await fetch(new URL(gsapSrc, baseUrl));
      assert.equal(gsapResponse.status, 200, `Studio must serve ${gsapSrc}`);
      assert.match(
        await gsapResponse.text(),
        new RegExp(GSAP_VERSION.replaceAll(".", "\\.")),
      );
      await assertHyperframesBrowserExecution(
        browserPath,
        baseUrl,
        captionArtifact.groups,
        buildArtifact.totalDuration,
        buildArtifact.frames,
      );
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
