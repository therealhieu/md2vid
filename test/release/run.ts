#!/usr/bin/env node
import { basename, dirname, resolve } from "node:path";
import { isMainModule } from "../../scripts/main-guard.ts";
import { readPackageManagerMetadata } from "../../scripts/package_root.ts";
import { isStrictSha512Integrity, npmVersionFromPackageManager } from "../../scripts/release_contract.ts";
import {
  addDiagnosticSensitivePaths,
  assertInstalledCli,
  assertInstalledSkill,
  assertPackedFiles,
  createReleaseContext,
  defaultCommandRunner,
  finishReleaseContext,
  installArtifact,
  packArtifact,
  runFrameworkSmoke,
  runStage,
  useSuppliedArtifact,
  validateDiagnosticsDirectory,
  verifyRegistryArtifact,
  type CommandRunner,
  type ReleaseContext,
} from "./harness.ts";
import {
  createArtifactMetadata,
  readArtifactMetadata,
  verifyArtifactFiles,
  verifyArtifactIdentity,
  writeArtifactMetadata,
} from "./artifact.ts";

const PACKAGE_METADATA = readPackageManagerMetadata(import.meta.url);
const REQUIRED_NPM_VERSION = npmVersionFromPackageManager(PACKAGE_METADATA.packageManager);

export const USAGE = [
  "pack --output <directory>",
  "verify [--tarball <path> [--metadata <path>] [--expected-version <version> --expected-tag <tag> --expected-commit <sha>] [--metadata-only]] [--diagnostics <directory>]",
  "registry --version <version> --integrity <sha512-sri> [--diagnostics <directory>]",
  "all [--diagnostics <directory>]",
].join("\n");

export type ReleaseArguments =
  | { mode: "pack"; output: string }
  | {
      mode: "verify";
      tarball: string;
      metadata?: string;
      expectedVersion?: string;
      expectedTag?: string;
      expectedCommit?: string;
      metadataOnly: boolean;
      diagnostics?: string;
    }
  | { mode: "registry"; version: string; integrity: string; diagnostics?: string }
  | { mode: "all"; diagnostics?: string };

function parseError(message: string): Error {
  return new Error(`${message}\nUsage:\n${USAGE}`);
}

const OPTION_VALUE = new Set([
  "output", "tarball", "metadata", "expected-version", "expected-tag", "expected-commit",
  "diagnostics", "version", "integrity",
]);

export function resolveDiagnosticsDirectory(
  explicit: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (explicit !== undefined && !explicit.trim()) throw parseError("unsafe diagnostics path: empty");
  if (Object.hasOwn(env, "MD2VID_DIAGNOSTICS_DIR") && !env.MD2VID_DIAGNOSTICS_DIR?.trim()) {
    throw parseError("unsafe diagnostics path: empty");
  }
  const environment = env.MD2VID_DIAGNOSTICS_DIR?.trim() || undefined;
  const cli = explicit?.trim() || undefined;
  if (cli && environment && resolve(cli) !== resolve(environment)) {
    throw parseError("diagnostics path conflict between --diagnostics and MD2VID_DIAGNOSTICS_DIR");
  }
  const selected = cli ?? environment;
  return selected === undefined ? undefined : validateDiagnosticsDirectory(selected, env);
}

export function parseReleaseArguments(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): ReleaseArguments {
  const mode = argv[0];
  if (!mode || !["pack", "verify", "registry", "all"].includes(mode)) {
    throw parseError(`unknown or missing release mode: ${mode ?? "<missing>"}`);
  }
  const values = new Map<string, string | true>();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) throw parseError(`trailing argument: ${token ?? "<missing>"}`);
    const name = token.slice(2);
    if (values.has(name)) throw parseError(`duplicate option --${name}`);
    const allowed = mode === "pack"
      ? ["output"]
      : mode === "verify"
        ? ["tarball", "metadata", "expected-version", "expected-tag", "expected-commit", "metadata-only", "diagnostics"]
        : mode === "registry"
          ? ["version", "integrity", "diagnostics"]
          : ["diagnostics"];
    if (!allowed.includes(name)) throw parseError(`unknown option --${name}`);
    if (name === "metadata-only") {
      values.set(name, true);
      continue;
    }
    if (!OPTION_VALUE.has(name)) throw parseError(`unknown option --${name}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw parseError(`missing value for --${name}`);
    values.set(name, value);
  }
  const value = (name: string): string | undefined => {
    const candidate = values.get(name);
    return typeof candidate === "string" ? candidate : undefined;
  };
  if (mode === "pack") {
    const output = value("output");
    if (!output) throw parseError("missing --output");
    return { mode, output };
  }
  const diagnostics = resolveDiagnosticsDirectory(value("diagnostics"), env);
  if (mode === "verify") {
    const tarball = value("tarball");
    const artifactOptions = [
      "metadata",
      "expected-version",
      "expected-tag",
      "expected-commit",
      "metadata-only",
    ].filter((name) => values.has(name));
    if (!tarball) {
      if (artifactOptions.length > 0) {
        throw parseError("--tarball is required when artifact options are provided");
      }
      return { mode: "all", diagnostics };
    }
    const expected = [value("expected-version"), value("expected-tag"), value("expected-commit")];
    if (expected.some((candidate) => candidate !== undefined) && expected.some((candidate) => candidate === undefined)) {
      throw parseError("expected identity options are all-or-none");
    }
    return {
      mode,
      tarball,
      metadata: value("metadata"),
      expectedVersion: expected[0],
      expectedTag: expected[1],
      expectedCommit: expected[2],
      metadataOnly: values.get("metadata-only") === true,
      diagnostics,
    };
  }
  if (mode === "registry") {
    const version = value("version");
    const integrity = value("integrity");
    if (!version) throw parseError("missing --version");
    if (!integrity) throw parseError("missing --integrity");
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
      throw parseError(`invalid registry version: ${version}`);
    }
    if (!isStrictSha512Integrity(integrity)) {
      throw parseError("registry integrity must be canonical SHA-512 SRI");
    }
    return { mode, version, integrity, diagnostics };
  }
  return { mode: "all", diagnostics };
}

export function currentNpmVersion(
  env: NodeJS.ProcessEnv = process.env,
  runner: CommandRunner = defaultCommandRunner,
): string {
  const npmExecPath = env.npm_execpath;
  if (!npmExecPath) throw new Error("npm_execpath is unavailable; run release checks through npm");
  const output = runner(process.execPath, [npmExecPath, "--version"]);
  const version = output.trim();
  if (version !== REQUIRED_NPM_VERSION) {
    throw new Error(`npm version must be exactly ${REQUIRED_NPM_VERSION}, got ${version}`);
  }
  return version;
}

export function gitHead(runner: CommandRunner = defaultCommandRunner): string {
  const commit = runner("git", ["rev-parse", "HEAD"]).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("git HEAD must be a 40-character lowercase commit");
  return commit;
}

type FrameworkSmoke = (
  context: ReleaseContext,
  framework: "hyperframes" | "remotion",
) => Promise<void> | void;

interface ReleaseRunDependencies {
  createContext?: (options: { diagnosticsDirectory?: string; commandRunner?: CommandRunner }) => ReleaseContext;
  packArtifact?: (context: ReleaseContext, outputDirectory?: string) => string;
  verifySuppliedArtifact?: (context: ReleaseContext, metadataOnly: boolean) => Promise<void> | void;
  frameworkSmoke?: FrameworkSmoke;
  registryVerification?: typeof verifyRegistryArtifact;
  commandRunner?: CommandRunner;
  currentNpmVersion?: () => string;
  gitHead?: () => string;
}

async function defaultVerifySuppliedArtifact(
  context: ReleaseContext,
  metadataOnly: boolean,
  frameworkSmoke: FrameworkSmoke = runFrameworkSmoke,
): Promise<void> {
  if (metadataOnly) return;
  await runStage("install", () => installArtifact(context), context);
  console.log(`OK [install]: reused ${context.tarball}`);
  await runStage("cli", () => assertInstalledCli(context), context);
  console.log("OK [cli]: installed package commands");
  await runStage("skill:config", () => assertInstalledSkill(context, "config"), context);
  console.log("OK [skill:config]: isolated CLAUDE_CONFIG_DIR");
  await runStage("skill:home", () => assertInstalledSkill(context, "home"), context);
  console.log("OK [skill:home]: isolated HOME");
  await runStage("smoke:hyperframes", () => frameworkSmoke(context, "hyperframes"), context);
  console.log(`OK [smoke:hyperframes]: generated build/check + browser execution + short render via ${context.tarball}`);
  await runStage("smoke:remotion", () => frameworkSmoke(context, "remotion"), context);
  console.log(`OK [smoke:remotion]: generated build/check/still via ${context.tarball}`);
}

function artifactForTarball(
  tarball: string,
  metadataPath: string | undefined,
  expectedVersion: string | undefined,
  expectedTag: string | undefined,
  expectedCommit: string | undefined,
): void {
  const metadata = readArtifactMetadata(metadataPath ?? resolve(dirname(tarball), "artifact.json"));
  if (basename(tarball) !== metadata.tarball) throw new Error("artifact filename mismatch");
  if (expectedVersion !== undefined) {
    verifyArtifactIdentity(metadata, {
      version: expectedVersion,
      tag: expectedTag!,
      commit: expectedCommit!,
    });
  }
  verifyArtifactFiles(dirname(tarball), metadata);
}

export async function runRelease(
  args: ReleaseArguments,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: ReleaseRunDependencies = {},
): Promise<void> {
  const context = (dependencies.createContext ?? createReleaseContext)({
    diagnosticsDirectory: args.mode === "pack" ? undefined : args.diagnostics,
    commandRunner: dependencies.commandRunner,
  });
  addDiagnosticSensitivePaths(context, [
    env.HOME,
    env.USERPROFILE,
    ...(args.mode === "verify"
      ? [args.tarball, args.metadata]
      : args.mode === "pack"
        ? [args.output]
        : []),
  ]);
  const pack = dependencies.packArtifact ?? packArtifact;
  const verifySupplied = dependencies.verifySuppliedArtifact
    ?? ((releaseContext, metadataOnly) => defaultVerifySuppliedArtifact(
      releaseContext,
      metadataOnly,
      dependencies.frameworkSmoke,
    ));
  let succeeded = false;
  try {
    if (args.mode === "registry") {
      await runStage("registry", async () => {
        (dependencies.currentNpmVersion
          ?? (() => currentNpmVersion(env, context.commandRunner)))();
        await (dependencies.registryVerification ?? verifyRegistryArtifact)(
          context,
          args.version,
          args.integrity,
        );
      }, context);
      console.log(`OK [registry]: verified md2vid@${args.version} at ${args.integrity}`);
      succeeded = true;
      return;
    }
    if (args.mode === "pack" || args.mode === "all") {
      const output = args.mode === "pack" ? resolve(args.output) : context.artifacts;
      const tarball = await runStage("pack", () => {
        const packed = pack(context, output);
        assertPackedFiles(context);
        const artifact = createArtifactMetadata({
          tarball: packed,
          packageName: "md2vid",
          version: PACKAGE_METADATA.version,
          tag: env.MD2VID_RELEASE_TAG ?? `v${PACKAGE_METADATA.version}`,
          commit: env.MD2VID_RELEASE_COMMIT
            ?? (dependencies.gitHead ?? (() => gitHead(context.commandRunner)))(),
          nodeVersion: process.version,
          npmVersion: (dependencies.currentNpmVersion
            ?? (() => currentNpmVersion(env, context.commandRunner)))(),
        });
        writeArtifactMetadata(dirname(packed), artifact);
        const validated = readArtifactMetadata(resolve(dirname(packed), "artifact.json"));
        verifyArtifactFiles(dirname(packed), validated);
        return packed;
      }, context);
      console.log(`OK [pack]: ${tarball}`);
      if (args.mode === "pack") {
        succeeded = true;
        return;
      }
    } else {
      const tarball = resolve(args.tarball);
      await runStage("verify", () => {
        artifactForTarball(
          tarball,
          args.metadata,
          args.expectedVersion,
          args.expectedTag,
          args.expectedCommit,
        );
        useSuppliedArtifact(context, tarball);
        assertPackedFiles(context);
      }, context);
      console.log(`OK [verify]: reused ${tarball}`);
      if (args.metadataOnly) {
        succeeded = true;
        return;
      }
      await verifySupplied(context, false);
    }

    if (args.mode === "all") {
      const tarball = context.tarball!;
      await runStage("verify", () => {
        const metadata = readArtifactMetadata(resolve(dirname(tarball), "artifact.json"));
        verifyArtifactFiles(dirname(tarball), metadata);
        useSuppliedArtifact(context, tarball);
        assertPackedFiles(context);
      }, context);
      await verifySupplied(context, false);
      console.log(`OK [all]: reused ${tarball}`);
    }
    succeeded = true;
  } finally {
    finishReleaseContext(context, succeeded);
  }
}

if (isMainModule(import.meta.url)) {
  const main = async (): Promise<void> => {
    const args = parseReleaseArguments(process.argv.slice(2));
    await runRelease(args);
  };
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
