#!/usr/bin/env node
// regroup.ts — failure-atomic caption-regroup dispatch.
//
// Usage: node scripts/regroup.ts <output-dir> [--max-chars 54] [--dry-run]
//
// Regroups the neutral caption groups in memory, stages both neutral and framework-
// owned caption artifacts, validates the staged pair, then promotes both managed files
// with rollback. The adapter remains the only owner of framework output bytes.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { regroup, groupLineChars } from "../engine/captions.ts";
import { getAdapter } from "../frameworks/index.ts";
import { parseCommand } from "./cli_args.ts";
import {
  promoteManagedFiles,
  type ManagedFileTransactionDependencies,
} from "./managed_file_transaction.ts";
import { isMainModule } from "./main-guard.ts";
import { resolveProjectLayout } from "./project_layout.ts";
import { createProjectPlan } from "./plan_project.ts";

class RegroupError extends Error {}

export interface RegroupDependencies {
  createProjectPlan?: typeof createProjectPlan;
  getAdapter?: typeof getAdapter;
  transactionDependencies?: ManagedFileTransactionDependencies;
}

const USAGE = "Usage: md2vid regroup <output-dir> [--max-chars 54] [--dry-run]";

function parseRegroupArgs(argv: string[]) {
  return parseCommand({
    command: "regroup",
    usage: USAGE,
    options: {
      "max-chars": { type: "string" },
      "dry-run": { type: "boolean" },
    },
    minPositionals: 1,
    maxPositionals: 1,
  }, argv);
}

export function run(argv: string[], dependencies: RegroupDependencies = {}): number {
  const parsed = parseRegroupArgs(argv);
  if (parsed.kind === "help") {
    console.log(USAGE);
    return 0;
  }
  if (parsed.kind === "error") {
    console.error(parsed.message);
    console.error(parsed.usage);
    return 2;
  }

  const maxChars = Number(parsed.values["max-chars"] ?? 54);
  if (!Number.isFinite(maxChars) || maxChars < 10) {
    console.error(`--max-chars must be a number >= 10 (got ${maxChars})`);
    console.error(USAGE);
    return 2;
  }
  const dryRun = parsed.values["dry-run"] === true;
  let stagingRoot: string | undefined;

  try {
    const layout = resolveProjectLayout(parsed.positionals[0]);
    const captionGroupsPath = join(layout.sharedDir, "caption_groups.json");
    if (!existsSync(captionGroupsPath)) throw new RegroupError(`Not found: ${captionGroupsPath}`);
    const data = JSON.parse(readFileSync(captionGroupsPath, "utf8"));

    const planning = (dependencies.createProjectPlan ?? createProjectPlan)(layout.outputDir);
    const adapter = (dependencies.getAdapter ?? getAdapter)(planning.adapterConfig.framework);
    const plan = planning.plan;
    const newGroups = regroup(data.groups, maxChars);

    const wordCounts = newGroups.map((group) => group.words.length);
    const charCounts = newGroups.map((group) => groupLineChars(group.words));
    const average = (values: number[]) => (
      values.reduce((sum, value) => sum + value, 0) / values.length
    ).toFixed(2);
    console.log(`max-chars ${maxChars}${dryRun ? "  (dry run — no files written)" : ""}`);
    console.log(`groups ${data.groups.length} -> ${newGroups.length}`);
    console.log(
      `avg words/group ${average(wordCounts)}  max ${Math.max(...wordCounts)}  ` +
        `1-word ${wordCounts.filter((count) => count === 1).length}  ` +
        `2-word ${wordCounts.filter((count) => count === 2).length}`,
    );
    console.log(`avg chars/group ${average(charCounts)}  max ${Math.max(...charCounts)}`);

    if (dryRun) return 0;

    const projectRoot = layout.flat ? layout.outputDir : dirname(layout.outputDir);
    stagingRoot = mkdtempSync(join(projectRoot, ".md2vid-regroup-"));
    const stagedSharedDir = join(stagingRoot, "shared");
    const stagedOutputDir = join(stagingRoot, "output");
    const stagedCaptionGroupsPath = join(stagedSharedDir, "caption_groups.json");
    const stagedFrameworkPath = join(stagedOutputDir, adapter.captionArtifactPath);
    const stagedIndexPath = adapter.captionIndexArtifactPath
      ? join(stagedOutputDir, adapter.captionIndexArtifactPath)
      : undefined;
    mkdirSync(stagedSharedDir, { recursive: true });
    mkdirSync(dirname(stagedFrameworkPath), { recursive: true });
    if (stagedIndexPath) mkdirSync(dirname(stagedIndexPath), { recursive: true });

    writeFileSync(
      stagedCaptionGroupsPath,
      `${JSON.stringify({ ...data, groups: newGroups }, null, 2)}\n`,
    );
    const regroupedPlan = { ...plan, captionGroups: newGroups };
    adapter.emit(regroupedPlan, stagedSharedDir, stagedOutputDir, planning.adapterConfig, {
      captionsOnly: true,
      runtimeSourceDir: layout.outputDir,
      assetSourceDir: layout.sharedDir,
      voiceSnapshots: planning.voiceSnapshots,
    });

    const findings = adapter.verifyCaptionArtifact({
      sharedDir: stagedSharedDir,
      outputDir: stagedOutputDir,
      captionGroupsPath: stagedCaptionGroupsPath,
    });
    const errors = findings.filter((finding) => finding.level === "error");
    if (errors.length) {
      throw new RegroupError(
        `staged caption verification failed: ${errors.map((finding) => finding.msg).join("; ")}`,
      );
    }

    const frameworkPath = join(layout.outputDir, adapter.captionArtifactPath);
    const managedFiles = [
      { target: relative(projectRoot, captionGroupsPath), staged: stagedCaptionGroupsPath },
      { target: relative(projectRoot, frameworkPath), staged: stagedFrameworkPath },
    ];
    if (adapter.captionIndexArtifactPath && stagedIndexPath) {
      managedFiles.push({
        target: relative(projectRoot, join(layout.outputDir, adapter.captionIndexArtifactPath)),
        staged: stagedIndexPath,
      });
    }
    const promotion = promoteManagedFiles(
      projectRoot,
      stagingRoot,
      managedFiles,
      dependencies.transactionDependencies,
    );
    if (promotion.cleanupErrors.length) {
      const retained = promotion.retainedBackups.length
        ? `; retained backups: ${promotion.retainedBackups.join(", ")}`
        : "";
      const uncertain = promotion.uncertainBackups.length
        ? `; uncertain backups: ${promotion.uncertainBackups.join(", ")}`
        : "";
      console.error(
        `WARN: managed file promotion committed but backup cleanup failed${retained}${uncertain}: ` +
          promotion.cleanupErrors.map((error) => error.message).join("; "),
      );
    }

    console.log(`wrote ${captionGroupsPath}`);
    console.log(`re-emitted captions for framework: ${adapter.name}`);
    return 0;
  } catch (error: unknown) {
    console.error(`FAIL: ${(error as Error).message}`);
    return 1;
  } finally {
    if (stagingRoot) rmSync(stagingRoot, { recursive: true, force: true });
  }
}

if (isMainModule(import.meta.url)) process.exit(run(process.argv.slice(2)));
