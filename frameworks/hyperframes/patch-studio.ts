#!/usr/bin/env node
// Patches an upstream HyperFrames Studio bug (present 0.7.26 → 0.7.37):
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

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { parseCommand } from "../../scripts/cli_args.ts";
import { resolveHyperframesInstallation } from "../../scripts/hyperframes_cli.ts";
import { isMainModule } from "../../scripts/main-guard.ts";
import { ensurePinnedHyperframesPatches } from "./patches.ts";

const require = createRequire(import.meta.url);

const HYPERFRAMES_VERSION = "0.7.26";
const fail = (message: string, bundlePath?: string): number => {
  console.error(`FAIL [patch-studio]: hyperframes@${HYPERFRAMES_VERSION} ${message}`);
  if (bundlePath) console.error(`FAIL [patch-studio]: bundle ${bundlePath}`);
  return 1;
};

const ANCHOR_1 = "let l=!1;const c=()=>{if(Qn.getState().isEditMode||l)return;";
const PATCH_1 = "let l=!1,hfLast=null;const c=()=>{if(Qn.getState().isEditMode||l)return;";

const ANCHOR_2 = "if(!g)return;l=!0;const A=g;fetch(";
const PATCH_2 = "if(!g)return;if(hfLast===g)return;hfLast=g;l=!0;const A=g;fetch(";

export function resolveStudioAssetsDir(cliPath: string): string {
  return join(dirname(cliPath), "studio", "assets");
}

// Locate the Studio SPA bundle. The filename carries a content hash
// (index-<hash>.js) that changes across builds, so we scan the assets dir for
// the one file that contains our anchor rather than hardcoding the hash.
function resolveBundle() {
  const cliPath = require.resolve("hyperframes/dist/cli.js");
  const assetsDir = resolveStudioAssetsDir(cliPath);
  const candidates = readdirSync(assetsDir)
    .filter((f) => f.startsWith("index-") && f.endsWith(".js"))
    .map((f) => join(assetsDir, f));
  const hits = candidates.filter((p) => {
    const s = readFileSync(p, "utf8");
    return s.includes(ANCHOR_1) || s.includes(PATCH_1);
  });
  if (hits.length !== 1) {
    throw new Error(
      `expected 1 Studio bundle containing the caption effect, found ${hits.length} in ${assetsDir}. Bundle layout changed — patch needs review.`,
    );
  }
  return hits[0];
}

function countOccurrences(haystack: string, needle: string) {
  let n = 0, i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
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

  let bundlePath: string;
  try {
    bundlePath = parsed.positionals[0] || resolveBundle();
  } catch (e: unknown) {
    return fail((e as Error).message);
  }

  let src: string;
  try {
    src = readFileSync(bundlePath, "utf8");
  } catch (e: unknown) {
    return fail(`could not read bundle: ${(e as Error).message}`, bundlePath);
  }

  if (src.includes(PATCH_1) && src.includes(PATCH_2)) {
    console.log(`[patch] already applied: ${bundlePath}`);
    return 0;
  }

  for (const [label, anchor] of [["anchor-1", ANCHOR_1], ["anchor-2", ANCHOR_2]]) {
    const c = countOccurrences(src, anchor);
    if (c !== 1) {
      return fail(`${label} matched ${c} time(s), expected 1. Bundle shape changed — patch needs review.`, bundlePath);
    }
  }

  const patched = src.replace(ANCHOR_1, PATCH_1).replace(ANCHOR_2, PATCH_2);

  if (patched === src || !patched.includes(PATCH_1) || !patched.includes(PATCH_2)) {
    return fail("replacement did not take effect", bundlePath);
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
