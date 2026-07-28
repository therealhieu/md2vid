#!/usr/bin/env node
// Patches an upstream HyperFrames Studio bug (present 0.7.26 → 0.7.78):
//
// The Studio effect ACe auto-targets any composition whose id/src contains
// "caption", fetches its file, and calls xCe()->yCe() to build an editable
// caption model. yCe only parses `var TRANSCRIPT=[…]` / `var script=[…]`, but
// our build engine emits `var GROUPS`. So the model never builds, xCe returns
// null, and the `.then` bails BEFORE setEditMode(true). Because isEditMode
// never latches, the top guard `if(isEditMode||l)return` never engages, so the
// preview's per-tick `state`/`timeline` postMessages re-fire the fetch forever
// — hundreds of GET /files/…captions.html per second until the tab OOMs.
//
// Fix: a per-active-comp fetch latch (hfLast) so each caption path is fetched
// at most once per effect lifetime, regardless of whether the model builds.
// Behaviorally invisible: preview plays normally; the effect re-runs (and the
// latch resets) whenever the active comp path changes. Does not regress caption
// editing — that path already failed to build a model for our GROUPS format.
//
// Idempotent: re-running detects the patch is already applied and exits 0.
// Asserts each anchor matches exactly once, so it fails loudly if a future
// bundle changes shape (rather than silently corrupting or no-op'ing).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseCommand } from "../../scripts/cli_args.ts";
import { HYPERFRAMES_VERSION } from "../../scripts/dependency_versions.ts";
import { resolveHyperframesInstallation } from "../../scripts/hyperframes_cli.ts";
import { isMainModule } from "../../scripts/main-guard.ts";
import { ensurePinnedHyperframesPatches, patchPinnedStudioBundleSource } from "./patches.ts";

const fail = (message: string, bundlePath?: string): number => {
  console.error(`FAIL [patch-studio]: hyperframes@${HYPERFRAMES_VERSION} ${message}`);
  if (bundlePath) console.error(`FAIL [patch-studio]: bundle ${bundlePath}`);
  return 1;
};

export function resolveStudioAssetsDir(cliPath: string): string {
  return join(dirname(cliPath), "studio", "assets");
}

const USAGE = "Usage: md2vid patch-studio [bundle-path]";

export function run(argv: string[]): number {
  const parsed = parseCommand({
    command: "patch-studio",
    usage: USAGE,
    options: {},
    minPositionals: 0,
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

  if (!parsed.positionals[0]) {
    try {
      const result = ensurePinnedHyperframesPatches(resolveHyperframesInstallation());
      console.log(
        `[patch] ${result.captionLoopChanged ? "applied" : "already applied"} caption-loop fix: ${result.studioBundle}`,
      );
      return 0;
    } catch (e: unknown) {
      return fail((e as Error).message);
    }
  }

  const bundlePath = parsed.positionals[0];

  let src: string;
  try {
    src = readFileSync(bundlePath, "utf8");
  } catch (e: unknown) {
    return fail(`could not read bundle: ${(e as Error).message}`, bundlePath);
  }

  let patched: string;
  try {
    patched = patchPinnedStudioBundleSource(src);
  } catch (e: unknown) {
    return fail(`${(e as Error).message}. Bundle shape changed — patch needs review.`, bundlePath);
  }

  if (patched === src) {
    console.log(`[patch] already applied: ${bundlePath}`);
    return 0;
  }

  try {
    writeFileSync(bundlePath, patched);
  } catch (e: unknown) {
    return fail(`could not write patched bundle: ${(e as Error).message}`, bundlePath);
  }
  console.log(`[patch] applied caption-loop fix: ${bundlePath}`);
  return 0;
}

if (isMainModule(import.meta.url)) process.exit(run(process.argv.slice(2)));
