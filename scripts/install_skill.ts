#!/usr/bin/env node
// install_skill.ts — installs the bundled skill into the user's Claude Code
// configuration root so `/md2vid` resolves as a clean, non-namespaced skill.
// The replacement is staged and validated before an existing install is moved.

import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { parseCommand } from "./cli_args.ts";
import { isMainModule } from "./main-guard.ts";
import { readPackageMetadata, type PackageMetadata } from "./package_root.ts";
import { validateSkillTree } from "./skill_references.ts";

export function resolveClaudeConfigRoot(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string {
  return env.CLAUDE_CONFIG_DIR?.trim() || join(home, ".claude");
}

function resolvePackagedSkill(metaUrl = import.meta.url): { source: string; metadata: PackageMetadata } {
  const metadata = readPackageMetadata(metaUrl);
  const source = join(metadata.root, "skill", "md2vid");
  if (!existsSync(source)) throw new Error(`FAIL [install-skill]: missing packaged skill at ${source}`);
  return { source, metadata };
}

export interface InstallSkillOperations {
  rename(source: string, destination: string): void;
}

const DEFAULT_INSTALL_OPERATIONS: InstallSkillOperations = {
  rename: renameSync,
};

function asInstallError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(message.startsWith("FAIL [install-skill]:") ? message : `FAIL [install-skill]: ${message}`);
}

export function installSkillFromSource(
  source: string,
  destination: string,
  _metadata: PackageMetadata,
  operations: InstallSkillOperations = DEFAULT_INSTALL_OPERATIONS,
): void {
  const skillsRoot = dirname(destination);
  mkdirSync(skillsRoot, { recursive: true });
  const stage = mkdtempSync(join(skillsRoot, ".md2vid-stage-"));
  const stagedSkill = join(stage, basename(destination));
  const stageId = basename(stage).slice(".md2vid-stage-".length);
  const backup = join(skillsRoot, `.md2vid-backup-${stageId}`);
  let movedOld = false;

  try {
    cpSync(source, stagedSkill, { recursive: true });
    validateSkillTree(stagedSkill);
    if (existsSync(destination)) {
      operations.rename(destination, backup);
      movedOld = true;
    }
    operations.rename(stagedSkill, destination);
    rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    let failure = error;
    if (movedOld && !existsSync(destination) && existsSync(backup)) {
      try {
        operations.rename(backup, destination);
      } catch (rollbackError) {
        const original = error instanceof Error ? error.message : String(error);
        const rollback = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        failure = new Error(`${original}; rollback failed: ${rollback}`);
      }
    }
    throw asInstallError(failure);
  } finally {
    rmSync(stage, { recursive: true, force: true });
    if (existsSync(destination)) rmSync(backup, { recursive: true, force: true });
  }
}

export interface InstallSkillRunDependencies {
  env?: NodeJS.ProcessEnv;
  home?: string;
  metaUrl?: string;
  log?: (line: string) => void;
  error?: (line: string) => void;
}

const USAGE = "Usage: md2vid install-skill";

export function run(argv: string[], dependencies: InstallSkillRunDependencies = {}): number {
  const log = dependencies.log ?? console.log;
  const reportError = dependencies.error ?? console.error;
  const parsed = parseCommand({
    command: "install-skill",
    usage: USAGE,
    options: {},
    minPositionals: 0,
    maxPositionals: 0,
  }, argv);
  if (parsed.kind === "help") {
    log(USAGE);
    return 0;
  }
  if (parsed.kind === "error") {
    reportError(parsed.message);
    reportError(parsed.usage);
    return 2;
  }

  try {
    const { source, metadata } = resolvePackagedSkill(dependencies.metaUrl);
    const configRoot = resolveClaudeConfigRoot(dependencies.env, dependencies.home);
    const destination = join(configRoot, "skills", "md2vid");
    installSkillFromSource(source, destination, metadata);
    log(`OK installed md2vid skill ${metadata.version}`);
    log(`  source: ${source}`);
    log(`  destination: ${destination}`);
    log("  invocation: /md2vid");
    return 0;
  } catch (error) {
    reportError(asInstallError(error).message);
    return 1;
  }
}

if (isMainModule(import.meta.url)) process.exit(run(process.argv.slice(2)));
