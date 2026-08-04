#!/usr/bin/env node

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseCommand } from "./cli_args.ts";
import { isMainModule } from "./main-guard.ts";
import {
  createProjectPlan,
  promoteNeutralPlan,
  type NeutralPlanPromotionDependencies,
} from "./plan_project.ts";

const USAGE = "Usage: md2vid plan <video-dir>";

export interface PlanDependencies extends NeutralPlanPromotionDependencies {}

function reportCleanupWarnings(cleanupErrors: readonly Error[]): void {
  if (!cleanupErrors.length) return;
  console.error(
    `WARN: neutral plan promotion committed but cleanup failed: ${cleanupErrors.map((error) => error.message).join("; ")}`,
  );
}

export function run(argv: string[], dependencies: PlanDependencies = {}): number {
  const parsed = parseCommand({
    command: "plan",
    usage: USAGE,
    minPositionals: 1,
    maxPositionals: 1,
  }, argv);
  if (parsed.kind === "help") {
    console.log(USAGE);
    return 0;
  }
  if (parsed.kind === "error") {
    console.error(parsed.message);
    console.error(parsed.usage);
    return 2;
  }

  try {
    const outputDir = resolve(parsed.positionals[0]);
    if (!existsSync(outputDir) || !statSync(outputDir).isDirectory()) {
      throw new Error(`not a directory: ${outputDir}`);
    }
    const planning = createProjectPlan(outputDir);
    const result = promoteNeutralPlan(planning, dependencies);
    for (const warning of planning.warnings) console.warn(`WARN [plan] ${warning}`);
    console.log(`PASS [plan] wrote neutral timing artifacts to ${planning.layout.sharedDir}`);
    reportCleanupWarnings(result.cleanupErrors);
    return 0;
  } catch (error) {
    console.error(`FAIL [plan] ${(error as Error).message}`);
    return 1;
  }
}

if (isMainModule(import.meta.url)) process.exit(run(process.argv.slice(2)));
