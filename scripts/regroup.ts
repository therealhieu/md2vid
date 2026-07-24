#!/usr/bin/env node
// regroup.mjs — thin caption-regroup dispatch.
//
// Usage: node scripts/regroup.mjs <output-dir> [--max-chars 54] [--dry-run]
//
// Regroups the neutral shared/caption_groups.json into balanced ~max-chars lines
// (engine/captions.regroup — pure), writes the JSON back, then asks the framework
// adapter to re-emit its caption output from the regrouped JSON (adapter.emit with
// captionsOnly). The neutral layer never touches framework files; the adapter owns
// all HTML/TSX. Default framework is hyperframes.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "../engine/config.ts";
import { plan as buildPlan } from "../engine/plan.ts";
import { regroup, groupLineChars } from "../engine/captions.ts";
import { getAdapter } from "../frameworks/index.ts";
import { parseCommand } from "./cli_args.ts";
import { isMainModule } from "./main-guard.ts";

class RegroupError extends Error {}

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

export function run(argv: string[]): number {
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

  const MAX_CHARS = Number(parsed.values["max-chars"] ?? 54);
  if (!Number.isFinite(MAX_CHARS) || MAX_CHARS < 10) {
    console.error(`--max-chars must be a number >= 10 (got ${MAX_CHARS})`);
    console.error(USAGE);
    return 2;
  }
  const dryRun = parsed.values["dry-run"] === true;
  const OUTPUT = resolve(parsed.positionals[0]);

  try {
    // Neutral caption IR lives in the sibling shared/ dir; the emitted output is in OUTPUT.
    const SHARED = resolve(OUTPUT, "..", "shared");
    const SRC = join(SHARED, "caption_groups.json");
    if (!existsSync(SRC)) throw new RegroupError(`Not found: ${SRC}`);

    const data = JSON.parse(readFileSync(SRC, "utf8"));

    // Pure engine regroup.
    const newGroups = regroup(data.groups, MAX_CHARS);

    // report
    const wc = newGroups.map((g) => g.words.length);
    const cc = newGroups.map((g) => groupLineChars(g.words));
    const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
    console.log(`max-chars ${MAX_CHARS}${dryRun ? "  (dry run — no files written)" : ""}`);
    console.log(`groups ${data.groups.length} -> ${newGroups.length}`);
    console.log(
      `avg words/group ${avg(wc)}  max ${Math.max(...wc)}  1-word ${wc.filter((n) => n === 1).length}  2-word ${wc.filter((n) => n === 2).length}`
    );
    console.log(`avg chars/group ${avg(cc)}  max ${Math.max(...cc)}`);

    if (dryRun) return 0;

    // Write the regrouped neutral JSON.
    writeFileSync(SRC, JSON.stringify({ ...data, groups: newGroups }, null, 2) + "\n");
    console.log(`wrote ${SRC}`);

    // Ask the framework adapter to re-emit its caption output from the regrouped JSON.
    // The adapter owns HTML — regroup never writes it (closes Issue 4).
    const metaPath = join(SHARED, "audio_meta.json");
    if (!existsSync(metaPath)) throw new RegroupError(`missing audio_meta.json — ${metaPath}`);
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    const config = loadConfig(SHARED, OUTPUT);
    const PLAN = buildPlan(meta, config);
    getAdapter(config.framework).emit(PLAN, SHARED, OUTPUT, config, { captionsOnly: true });
    console.log(`re-emitted captions for framework: ${config.framework ?? "hyperframes"}`);
    return 0;
  } catch (e: unknown) {
    console.error(`FAIL: ${(e as Error).message}`);
    return 1;
  }
}

if (isMainModule(import.meta.url)) process.exit(run(process.argv.slice(2)));
