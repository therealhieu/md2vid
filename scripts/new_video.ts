#!/usr/bin/env node

import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { FrameworkAdapter } from "../engine/types.ts";
import { getAdapter } from "../frameworks/index.ts";
import { parseCommand } from "./cli_args.ts";
import { isMainModule } from "./main-guard.ts";
import {
  validateCommonScaffold,
  validateFrameworkRuntime,
  writeCommonScaffold,
} from "./scaffold_project.ts";

const USAGE = "Usage: md2vid new <slug> [--framework <name>]";

function parseNewArgs(argv: string[]) {
  return parseCommand({
    command: "new",
    usage: USAGE,
    options: { framework: { type: "string" } },
    minPositionals: 1,
    maxPositionals: 1,
  }, argv);
}

export interface CreateProjectDependencies {
  writeRuntime?: (stageDir: string, slug: string, adapter: FrameworkAdapter) => void;
}

export function createProject(
  destination: string,
  slug: string,
  adapter: FrameworkAdapter,
  deps: CreateProjectDependencies = {},
): string[] {
  if (existsSync(destination)) {
    throw new Error(`${destination} already exists — pick a new slug or remove it first.`);
  }

  const spec = adapter.scaffoldSpec(slug);
  const parent = dirname(destination);
  mkdirSync(parent, { recursive: true });
  const stageDir = mkdtempSync(join(parent, `.${slug}.md2vid-stage-`));
  let promoted = false;

  try {
    writeCommonScaffold(stageDir, slug, adapter.name, spec);
    const writeRuntime = deps.writeRuntime
      ?? ((dir: string, projectSlug: string, selectedAdapter: FrameworkAdapter) =>
        selectedAdapter.writeScaffoldRuntime(dir, projectSlug));
    writeRuntime(stageDir, slug, adapter);
    validateCommonScaffold(stageDir, slug);
    validateFrameworkRuntime(stageDir, adapter.name);

    if (existsSync(destination)) {
      throw new Error(`${destination} already exists — refusing to replace it.`);
    }
    renameSync(stageDir, destination);
    promoted = true;
    return [...spec.nextSteps];
  } finally {
    if (!promoted) rmSync(stageDir, { recursive: true, force: true });
  }
}

export function run(argv: string[]): number {
  const parsed = parseNewArgs(argv);
  if (parsed.kind === "help") {
    console.log(USAGE);
    return 0;
  }
  if (parsed.kind === "error") {
    console.error(parsed.message);
    console.error(parsed.usage);
    return 2;
  }

  const slug = parsed.positionals[0];
  const framework = typeof parsed.values.framework === "string" ? parsed.values.framework : "hyperframes";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error(`FAIL: slug must be kebab-case (got "${slug}")`);
    console.error(USAGE);
    return 2;
  }

  let adapter: FrameworkAdapter;
  try {
    adapter = getAdapter(framework);
  } catch (error) {
    console.error(`FAIL: ${(error as Error).message}`);
    console.error(USAGE);
    return 2;
  }

  const outputsRoot = process.env.MD2VID_OUTPUTS_ROOT ?? process.cwd();
  const destination = resolve(outputsRoot, slug);

  try {
    const nextSteps = createProject(destination, slug, adapter);
    console.log(`OK scaffolded ${destination}`);
    console.log("Next:");
    nextSteps.forEach((step, index) => console.log(`  ${index + 1}. ${step}`));
    return 0;
  } catch (error) {
    console.error(`FAIL: ${(error as Error).message}`);
    return 1;
  }
}

if (isMainModule(import.meta.url)) process.exit(run(process.argv.slice(2)));
