import {
  spawnSync,
  type SpawnSyncOptions,
  type SpawnSyncReturns,
} from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { validateVideoConfig } from "../engine/config.ts";
import { htmlAttribute, scanHtmlTags } from "../frameworks/hyperframes/html.ts";
import type { RenderProfile } from "../engine/types.ts";
import { ensurePinnedHyperframesPatches } from "../frameworks/hyperframes/patches.ts";
import { HYPERFRAMES_VERSION } from "./dependency_versions.ts";

export { HYPERFRAMES_VERSION };

export interface HyperframesInstallation {
  packageRoot: string;
  packageJsonPath: string;
  cliEntry: string;
  version: string;
}

interface HyperframesPackageJson {
  version?: string;
  bin?: string | Record<string, unknown>;
}

function escapesRoot(root: string, candidate: string): boolean {
  const relativeEntry = relative(root, candidate);
  return relativeEntry === ".." ||
    relativeEntry.startsWith(`..${sep}`) ||
    isAbsolute(relativeEntry);
}

export function resolveHyperframesInstallation(
  metaUrl = import.meta.url,
): HyperframesInstallation {
  const require = createRequire(metaUrl);
  let packageJsonPath: string;
  try {
    packageJsonPath = require.resolve("hyperframes/package.json");
  } catch {
    throw new Error(
      "FAIL [hyperframes-cli]: cannot resolve package-owned hyperframes",
    );
  }

  const pkg = JSON.parse(
    readFileSync(packageJsonPath, "utf8"),
  ) as HyperframesPackageJson;
  if (pkg.version !== HYPERFRAMES_VERSION) {
    throw new Error(
      `FAIL [hyperframes-cli]: expected hyperframes@${HYPERFRAMES_VERSION}, found ${pkg.version ?? "unknown"}`,
    );
  }

  const declared = typeof pkg.bin === "string"
    ? pkg.bin
    : pkg.bin?.hyperframes;
  if (typeof declared !== "string" || declared.length === 0) {
    throw new Error(
      "FAIL [hyperframes-cli]: package metadata is missing bin.hyperframes",
    );
  }

  const declaredPackageRoot = dirname(packageJsonPath);
  const declaredCliEntry = resolve(declaredPackageRoot, declared);
  if (escapesRoot(declaredPackageRoot, declaredCliEntry)) {
    throw new Error(
      "FAIL [hyperframes-cli]: bin.hyperframes escapes the package root",
    );
  }

  let packageRoot: string;
  let cliEntry: string;
  try {
    packageRoot = realpathSync(declaredPackageRoot);
  } catch (error) {
    throw new Error(
      `FAIL [hyperframes-cli]: package root is missing or unreadable: ${errorMessage(error)}`,
    );
  }
  try {
    cliEntry = realpathSync(declaredCliEntry);
  } catch (error) {
    throw new Error(
      `FAIL [hyperframes-cli]: bin.hyperframes is missing or unreadable: ${errorMessage(error)}`,
    );
  }

  if (escapesRoot(packageRoot, cliEntry)) {
    throw new Error(
      "FAIL [hyperframes-cli]: bin.hyperframes escapes the package root",
    );
  }

  return {
    packageRoot,
    packageJsonPath,
    cliEntry,
    version: pkg.version,
  };
}

type HyperframesSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptions,
) => SpawnSyncReturns<Buffer>;

export interface RunHyperframesOptions {
  cwd?: string;
  metaUrl?: string;
  spawn?: HyperframesSpawn;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface EffectiveRenderPolicy {
  profile: "final" | "draft" | "gif";
  fps: number;
  minimumFinalFps: number;
  lowFpsOverride: boolean;
  outputPath?: string;
}

interface RenderPreflight {
  forwardedArgs: string[];
  policy: EffectiveRenderPolicy;
}

const RENDER_PROFILES = new Set<RenderProfile>(["final", "draft", "gif"]);
const FINAL_FPS_FLOOR = 24;

function parsePositiveFps(value: string, source: string): number {
  const rational = /^(\d+)\/(\d+)$/.exec(value);
  const fps = rational
    ? Number(rational[1]) / Number(rational[2])
    : /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`${source} must be a finite positive integer, decimal, or rational FPS (got ${JSON.stringify(value)})`);
  }
  return fps;
}

function profileFrom(value: string, source: string): EffectiveRenderPolicy["profile"] {
  if (!RENDER_PROFILES.has(value as RenderProfile)) {
    throw new Error(`${source} must be one of "final", "draft", or "gif"`);
  }
  return value as EffectiveRenderPolicy["profile"];
}

function readOutputRenderConfig(cwd: string): {
  profile?: EffectiveRenderPolicy["profile"];
  fps?: number;
  minimumFinalFps?: number;
} {
  const path = join(cwd, "output.config.json");
  if (!existsSync(path)) return {};
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`invalid configuration at ${path}: ${errorMessage(error)}`);
  }
  const config = validateVideoConfig(value, path);
  const render = config.render;
  return {
    profile: render?.profile,
    fps: render?.fps,
    minimumFinalFps: render?.minimumFinalFps,
  };
}

function mainCompositionFps(cwd: string): number | undefined {
  const indexPath = join(cwd, "index.html");
  if (!existsSync(indexPath)) return undefined;
  const roots = scanHtmlTags(readFileSync(indexPath, "utf8"))
    .filter((tag) => !tag.closing && htmlAttribute(tag, "data-composition-id") === "main");
  if (roots.length === 0) return undefined;
  if (roots.length !== 1) {
    throw new Error(`index.html must contain exactly one main composition root for render FPS; found ${roots.length}`);
  }
  const rawFps = htmlAttribute(roots[0], "data-fps");
  return rawFps === undefined ? undefined : parsePositiveFps(rawFps, "index.html main composition data-fps");
}

function outputPathFrom(args: readonly string[], cwd: string): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    let output: string | undefined;
    if (arg === "--output" || arg === "-o") {
      const candidate = args[index + 1];
      if (candidate !== undefined && !candidate.startsWith("-")) output = candidate;
    } else if (arg.startsWith("--output=")) {
      output = arg.slice("--output=".length);
    } else if (arg.startsWith("-o=")) {
      output = arg.slice("-o=".length);
    }
    if (output) return resolve(cwd, output);
  }
  return undefined;
}

function isFinalVideoFormat(format: string): boolean {
  return format === "mp4" || format === "mov";
}

function assertFinalFps(policy: EffectiveRenderPolicy, format: string): void {
  if (
    policy.profile === "final" &&
    isFinalVideoFormat(format) &&
    policy.fps < policy.minimumFinalFps &&
    !policy.lowFpsOverride
  ) {
    throw new Error(
      `effective final-render FPS is ${policy.fps}; minimum is ${policy.minimumFinalFps}. ` +
        "Use 30 FPS, select --profile draft, or pass --allow-low-fps intentionally.",
    );
  }
}

export function preflightHyperframesRender(
  args: readonly string[],
  cwd: string,
): RenderPreflight {
  if (args[0] !== "render") {
    return {
      forwardedArgs: [...args],
      policy: {
        profile: "final",
        fps: 30,
        minimumFinalFps: FINAL_FPS_FLOOR,
        lowFpsOverride: false,
      },
    };
  }

  let cliProfile: EffectiveRenderPolicy["profile"] | undefined;
  let cliFps: number | undefined;
  let renderFormat = "mp4";
  let lowFpsOverride = false;
  const forwardedArgs: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--profile") {
      const value = args[++index];
      if (value === undefined) throw new Error("--profile requires final, draft, or gif");
      cliProfile = profileFrom(value, "--profile");
      continue;
    }
    if (arg.startsWith("--profile=")) {
      cliProfile = profileFrom(arg.slice("--profile=".length), "--profile");
      continue;
    }
    if (arg === "--allow-low-fps") {
      lowFpsOverride = true;
      continue;
    }
    if (arg === "--fps" || arg === "-f") {
      const value = args[index + 1];
      if (value === undefined) throw new Error(`${arg} requires a finite positive FPS`);
      cliFps = parsePositiveFps(value, arg);
      forwardedArgs.push(arg, value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--fps=") || arg.startsWith("-f=")) {
      const source = arg.startsWith("--fps=") ? "--fps" : "-f";
      const value = arg.slice(source.length + 1);
      cliFps = parsePositiveFps(value, source);
    }
    if (arg === "--format") {
      const value = args[index + 1];
      if (value !== undefined && !value.startsWith("-")) renderFormat = value.toLowerCase();
    } else if (arg.startsWith("--format=")) {
      renderFormat = arg.slice("--format=".length).toLowerCase();
    }
    forwardedArgs.push(arg);
  }

  const configured = readOutputRenderConfig(cwd);
  const policy: EffectiveRenderPolicy = {
    profile: cliProfile ?? configured.profile ?? "final",
    fps: cliFps ?? configured.fps ?? mainCompositionFps(cwd) ?? 30,
    minimumFinalFps: configured.minimumFinalFps ?? FINAL_FPS_FLOOR,
    lowFpsOverride,
    outputPath: outputPathFrom(args, cwd),
  };
  assertFinalFps(policy, renderFormat);
  return { forwardedArgs, policy };
}

function writeRenderManifest(outputPath: string, policy: EffectiveRenderPolicy): void {
  const manifestPath = `${outputPath}.md2vid-render.json`;
  const parent = dirname(manifestPath);
  mkdirSync(parent, { recursive: true });
  const stageDir = mkdtempSync(join(parent, `.${basename(manifestPath)}.stage-`));
  const stagedManifest = join(stageDir, "render.json");
  try {
    writeFileSync(stagedManifest, `${JSON.stringify({
      version: 1,
      profile: policy.profile,
      fps: policy.fps,
      minimumFps: policy.minimumFinalFps,
      lowFpsOverride: policy.lowFpsOverride,
    }, null, 2)}\n`);
    renameSync(stagedManifest, manifestPath);
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }
}

export function runHyperframes(
  args: string[],
  {
    cwd = process.cwd(),
    metaUrl = import.meta.url,
    spawn = spawnSync,
  }: RunHyperframesOptions = {},
): number {
  let preflight: RenderPreflight;
  try {
    preflight = preflightHyperframesRender(args, cwd);
  } catch (error) {
    console.error(`FAIL [render-fps]: ${errorMessage(error)}`);
    return 1;
  }

  const installation = resolveHyperframesInstallation(metaUrl);
  try {
    ensurePinnedHyperframesPatches(installation);
  } catch (error) {
    console.error(
      `FAIL [hyperframes-cli]: hyperframes@${HYPERFRAMES_VERSION} patch preflight failed: ${errorMessage(error)}`,
    );
    return 1;
  }

  let result: SpawnSyncReturns<Buffer>;
  try {
    result = spawn(process.execPath, [installation.cliEntry, ...preflight.forwardedArgs], {
      cwd,
      stdio: "inherit",
      shell: false,
    });
  } catch (error) {
    console.error(
      `FAIL [hyperframes-cli]: failed to start child: ${errorMessage(error)}`,
    );
    return 1;
  }

  if (result.error) {
    console.error(
      `FAIL [hyperframes-cli]: failed to start child: ${result.error.message}`,
    );
    return 1;
  }
  if (result.signal) {
    console.error(
      `FAIL [hyperframes-cli]: child terminated by ${result.signal}`,
    );
    return 1;
  }
  if (result.status === null) {
    console.error("FAIL [hyperframes-cli]: child exited without a status");
    return 1;
  }
  if (result.status === 0 && preflight.policy.outputPath) {
    try {
      writeRenderManifest(preflight.policy.outputPath, preflight.policy);
    } catch (error) {
      console.error(`FAIL [render-fps]: failed to write render manifest: ${errorMessage(error)}`);
      return 1;
    }
  }
  return result.status;
}
