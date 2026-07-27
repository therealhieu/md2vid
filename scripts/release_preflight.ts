#!/usr/bin/env node

import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isMainModule } from "./main-guard.ts";
import { readPackageManagerMetadata } from "./package_root.ts";
import {
  isStrictSha512Integrity,
  npmVersionFromPackageManager,
  validateReleaseArtifactMetadata,
} from "./release_contract.ts";

const REQUIRED_NPM_VERSION = npmVersionFromPackageManager(
  readPackageManagerMetadata(import.meta.url).packageManager,
);

export type GitHubReleaseState = "absent" | "matching" | "conflicting";

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[]) => CommandResult;

export interface ReleaseMetadata {
  packageJson: Record<string, unknown>;
  lockJson: Record<string, unknown>;
}

export interface PreflightOutput {
  tag: string;
  version: string;
  commit: string;
  node_version: string;
  registry_state: "absent" | "existing";
  registry_integrity: string;
  github_release_state: GitHubReleaseState;
  artifact_name: string;
  artifact_id: string;
  artifact_run_id: string;
}

export function parseReleaseTag(tag: string): { tag: string; version: string } {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
    throw new Error(`release tag must use strict vX.Y.Z: ${tag}`);
  }
  return { tag, version: tag.slice(1) };
}

function parseVersion(version: string): [string, string, string] {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) throw new Error(`version must contain three non-negative integer components: ${version}`);
  return [match[1], match[2], match[3]];
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index].length !== b[index].length) return a[index].length < b[index].length ? -1 : 1;
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function validateSha512Integrity(integrity: string): string {
  if (!isStrictSha512Integrity(integrity)) {
    throw new Error("invalid value: expected valid SHA-512 SRI");
  }
  return integrity;
}

function hasTerminalNpmDiagnostic(diagnostic: string): boolean {
  for (const match of diagnostic.matchAll(/npm (?:error|ERR!) code ([A-Z0-9_]+)/gi)) {
    if (match[1].toUpperCase() !== "E404") return true;
  }
  const contextualHttpStatus = [
    /npm (?:error|ERR!) (?!404\b)[45]\d\d\b/i,
    /\bHTTP(?:\/\d(?:\.\d)?)?\s+(?!404\b)[45]\d\d\b/i,
    /\bstatus(?: code)?\s*[:=]?\s*(?!404\b)[45]\d\d\b/i,
    /\bresponse status\s*[:=]?\s*(?!404\b)[45]\d\d\b/i,
    /\b(?:400 Bad Request|401 Unauthorized|403 Forbidden|405 Method Not Allowed|408 Request Timeout|409 Conflict|410 Gone|418 I'm a teapot|429 Too Many Requests|500 Internal Server Error|502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout)\b/i,
  ];
  if (contextualHttpStatus.some((pattern) => pattern.test(diagnostic))) return true;
  return /\b(?:ECONN[A-Z0-9_]*|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|EHOST[A-Z0-9_]*|EPIPE|EPROTO|UND_ERR_[A-Z0-9_]+|CERT_[A-Z0-9_]+|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE)\b|TLS|socket|network/i.test(diagnostic);
}

function canonicalNpmE404Stderr(stderr: string): boolean {
  const trimmed = stderr.trim();
  if (!trimmed) return true;
  if (trimmed === "E404 Not Found") return true;
  let sawE404 = false;
  for (const line of trimmed.split(/\r?\n/)) {
    if (hasTerminalNpmDiagnostic(line)) return false;
    if (/^npm (?:error|ERR!) code E404$/i.test(line)) {
      sawE404 = true;
      continue;
    }
    if (/^npm (?:error|ERR!) 404(?:\s.*)?$/i.test(line)
      || /^npm (?:error|ERR!) A complete log of this run can be found in: .+$/i.test(line)) {
      if (/^npm (?:error|ERR!) 404/i.test(line)) sawE404 = true;
      continue;
    }
    return false;
  }
  return sawE404;
}

function npmNotFound(result: CommandResult): boolean {
  if (result.status === null || result.status === 0) return false;
  const diagnostic = `${result.stderr}\n${result.stdout}`.trim();
  if (hasTerminalNpmDiagnostic(diagnostic)) return false;

  const stdout = result.stdout.trim();
  if (stdout) {
    try {
      const parsed = JSON.parse(stdout) as { error?: { code?: unknown } };
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
        || !parsed.error || typeof parsed.error !== "object" || parsed.error.code !== "E404") {
        return false;
      }
      return canonicalNpmE404Stderr(result.stderr);
    } catch {
      return false;
    }
  }

  return canonicalNpmE404Stderr(result.stderr);
}

export function isNpmVersionNotFound(
  result: CommandResult,
  packageName: string,
  version: string,
): boolean {
  if (!npmNotFound(result)) return false;
  const stdout = result.stdout.trim();
  if (!stdout) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const error = (parsed as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return false;
  const record = error as { code?: unknown; summary?: unknown; detail?: unknown };
  const expectedSummary = `No match found for version ${version}`;
  const packageVersion = `${packageName}@${version}`;
  const legacyDetail = `'${packageVersion}' is not in this registry.`;
  const currentDetailPrefix = `The requested resource '${packageVersion}' could not be found or you do not have permission to access it.`;
  const detail = typeof record.detail === "string" ? record.detail : "";
  if (record.code !== "E404"
    || record.summary !== expectedSummary
    || (detail !== legacyDetail && !detail.startsWith(currentDetailPrefix))) {
    return false;
  }
  const stderr = result.stderr;
  return stderr.includes(`npm error 404 ${expectedSummary}`)
    && (stderr.includes(`npm error 404  ${legacyDetail}`)
      || stderr.includes(`npm error 404  ${currentDetailPrefix}`));
}

export function classifyNpmLookup(
  result: CommandResult,
  packageName: string,
  version: string,
):
  | { kind: "absent" }
  | { kind: "existing"; integrity: string } {
  if (result.status === 0) {
    let integrity: unknown;
    try {
      integrity = JSON.parse(result.stdout);
    } catch {
      throw new Error("registry lookup returned invalid dist.integrity");
    }
    if (typeof integrity !== "string") throw new Error("registry lookup returned invalid dist.integrity");
    try {
      return { kind: "existing", integrity: validateSha512Integrity(integrity) };
    } catch {
      throw new Error("registry lookup returned invalid dist.integrity");
    }
  }
  if (isNpmVersionNotFound(result, packageName, version)) return { kind: "absent" };
  const diagnostic = `${result.stderr}\n${result.stdout}`;
  throw new Error(`registry lookup failed: ${diagnostic.trim()}`);
}

interface ReleaseMetadataInput {
  tag: string;
  packageJson: unknown;
  lockJson: unknown;
  repository: string;
}

export function validateReleaseMetadata(input: ReleaseMetadataInput): void {
  const { version } = parseReleaseTag(input.tag);
  const packageJson = input.packageJson as {
    name?: unknown;
    version?: unknown;
    repository?: { url?: unknown };
  };
  const lockJson = input.lockJson as {
    name?: unknown;
    version?: unknown;
    packages?: { ""?: { name?: unknown; version?: unknown } };
  };

  if (packageJson.name !== "md2vid") throw new Error("package name must be md2vid");
  if (packageJson.version !== version) throw new Error("tag must match package version");
  if (lockJson.name !== "md2vid") throw new Error("lockfile name must be md2vid");
  if (lockJson.version !== version) throw new Error("lockfile version must match package version");
  if (lockJson.packages?.[""]?.name !== "md2vid") throw new Error("lockfile root package name must be md2vid");
  if (lockJson.packages?.[""]?.version !== version) throw new Error("lockfile root package version must match package version");
  const expectedRepository = `git+https://github.com/${input.repository}.git`;
  if (packageJson.repository?.url !== expectedRepository) {
    throw new Error(`package repository URL must be ${expectedRepository}`);
  }
}

export function assertFirstPublication(input: {
  candidate: string;
  latest: string | null;
  githubRelease: GitHubReleaseState;
}): void {
  if (input.githubRelease !== "absent") throw new Error("first publication requires no GitHub Release");
  if (input.latest !== null && compareVersions(input.candidate, input.latest) <= 0) {
    throw new Error(`candidate ${input.candidate} must be greater than npm latest ${input.latest}`);
  }
}

export function assertRecoveryPublication(input: {
  registryIntegrity: string;
  artifactIntegrity: string;
  githubRelease: GitHubReleaseState;
}): void {
  if (input.githubRelease === "conflicting") throw new Error("conflicting GitHub Release");
  if (input.registryIntegrity !== input.artifactIntegrity) {
    throw new Error("registry/artifact integrity mismatch");
  }
}

interface RetainedArtifact {
  id?: unknown;
  name?: unknown;
  expired?: unknown;
  created_at?: unknown;
  workflow_run?: {
    id?: unknown;
    head_sha?: unknown;
    path?: unknown;
  };
}

export function selectRetainedArtifact(
  artifacts: RetainedArtifact[],
  expectedName: string,
  expectedCommit: string,
): { artifactId: number; runId: number } {
  const valid = artifacts.filter((artifact): artifact is RetainedArtifact & {
    id: number;
    created_at: string;
    workflow_run: { id: number; head_sha: string; path: string };
  } => artifact.name === expectedName
    && artifact.expired === false
    && typeof artifact.id === "number"
    && typeof artifact.created_at === "string"
    && typeof artifact.workflow_run?.id === "number"
    && artifact.workflow_run.head_sha === expectedCommit
    && artifact.workflow_run.path === ".github/workflows/release.yml");

  valid.sort((left, right) => {
    const created = left.created_at.localeCompare(right.created_at);
    return created === 0 ? left.id - right.id : created;
  });
  const selected = valid.at(-1);
  if (!selected) throw new Error("no valid retained release artifact found");
  return { artifactId: selected.id, runId: selected.workflow_run.id };
}

export function readReleaseMetadataAtCommit(commit: string, runner: CommandRunner = defaultRunner): ReleaseMetadata {
  const packageResult = requireCommand(runner("git", ["show", `${commit}:package.json`]), "git show package.json");
  const lockResult = requireCommand(runner("git", ["show", `${commit}:package-lock.json`]), "git show package-lock.json");
  try {
    return {
      packageJson: JSON.parse(packageResult.stdout) as Record<string, unknown>,
      lockJson: JSON.parse(lockResult.stdout) as Record<string, unknown>,
    };
  } catch {
    throw new Error(`invalid release metadata at commit ${commit}`);
  }
}

function defaultRunner(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.error ? `${result.stderr ?? ""}${result.error.message}` : result.stderr ?? "",
  };
}

function requireCommand(result: CommandResult, operation: string): CommandResult {
  if (result.status !== 0) {
    throw new Error(`${operation} failed: ${`${result.stderr}\n${result.stdout}`.trim()}`);
  }
  return result;
}

function parseJson(stdout: string, operation: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`${operation} returned invalid JSON`);
  }
}

const COMMAND_OPTIONS: Record<string, readonly string[]> = {
  preflight: ["tag", "repository", "event"],
  "publish-check": ["tag", "version", "commit", "repository", "artifact"],
  "release-check": ["tag", "repository", "commit"],
};

function parseOptions(command: string, argv: string[]): Record<string, string> {
  const allowed = COMMAND_OPTIONS[command];
  if (!allowed) throw new Error(`unknown command: ${command}`);
  const options: Record<string, string> = {};
  for (let index = 1; index < argv.length; index += 2) {
    const token = argv[index];
    if (!token?.startsWith("--")) throw new Error(`unexpected trailing token: ${token ?? "<end>"}`);
    const name = token.slice(2);
    if (!allowed.includes(name)) throw new Error(`unknown option --${name} for ${command}`);
    if (name in options) throw new Error(`duplicate option --${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for --${name}`);
    options[name] = value;
  }
  for (const name of allowed) {
    if (!(name in options)) throw new Error(`missing --${name}`);
  }
  return options;
}

function requireOption(options: Record<string, string>, name: string): string {
  const value = options[name];
  if (!value) throw new Error(`missing --${name}`);
  return value;
}

function validateRepository(repository: string): void {
  const match = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(repository);
  if (!match || repository.includes("..")) throw new Error(`invalid repository: ${repository}`);
}

function githubApiPath(repository: string, suffix = ""): string {
  return `repos/${repository}${suffix}`;
}

function requireGitHubToken(env: NodeJS.ProcessEnv): void {
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN is required for GitHub API access");
}

function verifyRepositoryAccess(repository: string, env: NodeJS.ProcessEnv, runner: CommandRunner): void {
  requireGitHubToken(env);
  const response = requireCommand(runner("gh", ["api", githubApiPath(repository)]), "GitHub repository access");
  const metadata = parseJson(response.stdout, "GitHub repository access") as { full_name?: unknown };
  if (!metadata || typeof metadata !== "object" || metadata.full_name !== repository) {
    throw new Error("GitHub repository access returned unexpected repository metadata");
  }
}

function isCanonicalGitHubReleaseNotFound(result: CommandResult): boolean {
  if (result.status === null || result.stderr.trim() !== "gh: Not Found (HTTP 404)") return false;
  const body = result.stdout.trim();
  if (!body) return true;
  try {
    const value = JSON.parse(body) as Record<string, unknown>;
    return value !== null
      && typeof value === "object"
      && !Array.isArray(value)
      && Object.keys(value).sort().join(",") === "documentation_url,message,status"
      && value.message === "Not Found"
      && value.documentation_url === "https://docs.github.com/rest/releases/releases#get-a-release-by-tag-name"
      && value.status === "404";
  } catch {
    return false;
  }
}

function lookupGitHubRelease(
  tag: string,
  repository: string,
  commit: string,
  env: NodeJS.ProcessEnv,
  runner: CommandRunner,
): GitHubReleaseState {
  verifyRepositoryAccess(repository, env, runner);
  const result = runner("gh", ["api", githubApiPath(repository, `/releases/tags/${tag}`)]);
  if (result.status !== 0) {
    const diagnostic = `${result.stderr}\n${result.stdout}`.trim();
    if (isCanonicalGitHubReleaseNotFound(result)) return "absent";
    throw new Error(`GitHub release lookup failed: ${diagnostic}`);
  }
  const release = parseJson(result.stdout, "GitHub release lookup") as {
    tag_name?: unknown;
    target_commitish?: unknown;
  };
  if (!release || typeof release !== "object") throw new Error("GitHub release lookup returned invalid JSON");
  if (release.tag_name === tag && release.target_commitish === commit) return "matching";
  return "conflicting";
}

function lookupLatest(versionResult: CommandResult): string | null {
  if (versionResult.status !== 0) {
    const diagnostic = `${versionResult.stderr}\n${versionResult.stdout}`;
    if (npmNotFound(versionResult)) return null;
    throw new Error(`registry latest lookup failed: ${diagnostic.trim()}`);
  }
  const latest = parseJson(versionResult.stdout, "registry latest lookup");
  if (latest === null) return null;
  if (typeof latest !== "string") throw new Error("registry latest lookup returned invalid version");
  parseVersion(latest);
  return latest;
}

function lookupArtifacts(
  repository: string,
  artifactName: string,
  commit: string,
  env: NodeJS.ProcessEnv,
  runner: CommandRunner,
): { artifactId: number; runId: number } {
  requireGitHubToken(env);
  const artifactQuery = `${githubApiPath(repository, "/actions/artifacts")}?name=${encodeURIComponent(artifactName)}&per_page=100`;
  const result = requireCommand(
    runner("gh", ["api", "--paginate", "--slurp", artifactQuery]),
    "GitHub artifact lookup",
  );
  const pages = parseJson(result.stdout, "GitHub artifact lookup");
  const pageList = Array.isArray(pages) ? pages : [pages];
  const artifacts = pageList.flatMap((page) => {
    if (!page || typeof page !== "object" || !Array.isArray((page as { artifacts?: unknown }).artifacts)) {
      throw new Error("GitHub artifact lookup returned invalid JSON");
    }
    return (page as { artifacts: RetainedArtifact[] }).artifacts;
  });

  const enriched: RetainedArtifact[] = [];
  for (const artifact of artifacts) {
    if (artifact.name !== artifactName || artifact.expired !== false || typeof artifact.workflow_run?.id !== "number") continue;
    const run = requireCommand(
      runner("gh", ["api", githubApiPath(repository, `/actions/runs/${artifact.workflow_run.id}`)]),
      "GitHub workflow run lookup",
    );
    const runJson = parseJson(run.stdout, "GitHub workflow run lookup") as { path?: unknown; head_sha?: unknown };
    enriched.push({
      ...artifact,
      workflow_run: {
        id: artifact.workflow_run.id,
        path: runJson.path,
        head_sha: runJson.head_sha,
      },
    });
  }
  return selectRetainedArtifact(enriched, artifactName, commit);
}

function validateArtifactMetadata(
  artifactPath: string,
  tag: string,
  version: string,
  commit: string,
): { integrity: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(artifactPath, "utf8"));
  } catch {
    throw new Error("artifact metadata is invalid JSON");
  }
  const artifact = validateReleaseArtifactMetadata(parsed, REQUIRED_NPM_VERSION);
  if (artifact.version !== version || artifact.tag !== tag || artifact.commit !== commit) {
    throw new Error("artifact metadata does not match release arguments");
  }
  return { integrity: artifact.integrity };
}

function writeOutputs(output: PreflightOutput, path: string | undefined): void {
  if (!path) return;
  const lines = Object.entries(output).map(([key, value]) => `${key}=${value}`);
  appendFileSync(path, `${lines.join("\n")}\n`);
}

export interface RunDependencies {
  runner?: CommandRunner;
  writeOutput?: (json: string) => void;
  nodeVersion?: string;
}

export function run(
  argv: ["preflight", ...string[]],
  env?: NodeJS.ProcessEnv,
  dependencies?: RunDependencies,
): PreflightOutput;
export function run(
  argv: ["publish-check", ...string[]],
  env?: NodeJS.ProcessEnv,
  dependencies?: RunDependencies,
): { publish: boolean };
export function run(
  argv: ["release-check", ...string[]],
  env?: NodeJS.ProcessEnv,
  dependencies?: RunDependencies,
): { github_release_state: "absent" | "matching" };
export function run(
  argv: string[],
  env?: NodeJS.ProcessEnv,
  dependencies?: RunDependencies,
): PreflightOutput | { publish: boolean } | { github_release_state: "absent" | "matching" };
export function run(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  dependencies: RunDependencies = {},
): PreflightOutput | { publish: boolean } | { github_release_state: "absent" | "matching" } {
  const runner = dependencies.runner ?? defaultRunner;
  const command = argv[0];
  if (!command) throw new Error("missing command");
  const options = parseOptions(command, argv);

  if (command === "preflight") {
    const tag = requireOption(options, "tag");
    const repository = requireOption(options, "repository");
    const event = requireOption(options, "event");
    if (event !== "push" && event !== "recovery") throw new Error("event must be push or recovery");
    validateRepository(repository);
    const parsed = parseReleaseTag(tag);
    const tagRef = `refs/tags/${tag}`;
    const tagType = requireCommand(runner("git", ["cat-file", "-t", tagRef]), "git annotated tag check").stdout.trim();
    if (tagType !== "tag") throw new Error("release tag must be an annotated tag");
    const commit = requireCommand(runner("git", ["rev-parse", `${tagRef}^{commit}`]), "git tag dereference").stdout.trim();
    if (!commit) throw new Error("git tag dereference returned no commit");
    requireCommand(runner("git", ["merge-base", "--is-ancestor", commit, "origin/main"]), "origin/main ancestry check");
    const metadata = readReleaseMetadataAtCommit(commit, runner);
    validateReleaseMetadata({ tag, packageJson: metadata.packageJson, lockJson: metadata.lockJson, repository });

    const registry = classifyNpmLookup(
      runner("npm", ["view", `md2vid@${parsed.version}`, "dist.integrity", "--json"]),
      "md2vid",
      parsed.version,
    );
    const artifactName = `md2vid-${tag}-${commit}`;
    let latest: string | null = null;
    if (registry.kind === "absent") {
      latest = lookupLatest(runner("npm", ["view", "md2vid", "dist-tags.latest", "--json"]));
    }
    const githubRelease = lookupGitHubRelease(tag, repository, commit, env, runner);
    if (githubRelease === "conflicting") throw new Error("conflicting GitHub Release");
    if (registry.kind === "absent") {
      assertFirstPublication({ candidate: parsed.version, latest, githubRelease });
    } else if (event !== "recovery") {
      throw new Error("existing npm version requires recovery event");
    }

    const output: PreflightOutput = {
      tag,
      version: parsed.version,
      commit,
      node_version: dependencies.nodeVersion ?? process.versions.node,
      registry_state: registry.kind,
      registry_integrity: registry.kind === "existing" ? registry.integrity : "",
      github_release_state: githubRelease,
      artifact_name: artifactName,
      artifact_id: "",
      artifact_run_id: "",
    };
    if (registry.kind === "existing") {
      const selected = lookupArtifacts(repository, artifactName, commit, env, runner);
      output.artifact_id = String(selected.artifactId);
      output.artifact_run_id = String(selected.runId);
    }
    writeOutputs(output, env.GITHUB_OUTPUT);
    dependencies.writeOutput?.(JSON.stringify(output));
    return output;
  }

  if (command === "publish-check") {
    const tag = requireOption(options, "tag");
    const version = requireOption(options, "version");
    const commit = requireOption(options, "commit");
    const repository = requireOption(options, "repository");
    validateRepository(repository);
    const artifactPath = requireOption(options, "artifact");
    const parsed = parseReleaseTag(tag);
    if (parsed.version !== version) throw new Error("tag and version do not match");
    const artifact = validateArtifactMetadata(artifactPath, tag, version, commit);
    const registry = classifyNpmLookup(
      runner("npm", ["view", `md2vid@${version}`, "dist.integrity", "--json"]),
      "md2vid",
      version,
    );
    if (registry.kind === "existing") {
      assertRecoveryPublication({ registryIntegrity: registry.integrity, artifactIntegrity: artifact.integrity, githubRelease: "absent" });
      if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, "publish=false\n");
      dependencies.writeOutput?.(JSON.stringify({ publish: false }));
      return { publish: false };
    }
    const latest = lookupLatest(runner("npm", ["view", "md2vid", "dist-tags.latest", "--json"]));
    assertFirstPublication({ candidate: version, latest, githubRelease: "absent" });
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, "publish=true\n");
    dependencies.writeOutput?.(JSON.stringify({ publish: true }));
    return { publish: true };
  }

  if (command === "release-check") {
    const tag = requireOption(options, "tag");
    const repository = requireOption(options, "repository");
    const commit = requireOption(options, "commit");
    validateRepository(repository);
    parseReleaseTag(tag);
    const state = lookupGitHubRelease(tag, repository, commit, env, runner);
    if (state === "conflicting") throw new Error("conflicting GitHub Release");
    const output = { github_release_state: state } as { github_release_state: "absent" | "matching" };
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `github_release_state=${state}\n`);
    dependencies.writeOutput?.(JSON.stringify(output));
    return output;
  }

  throw new Error(`unknown command: ${command}`);
}

if (isMainModule(import.meta.url)) {
  try {
    const output = run(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
