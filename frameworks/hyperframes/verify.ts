// verify.mjs — the HyperFrames adapter's verifier. HF-ONLY layout assertions: a
// Remotion video must NOT be run through this. Returns findings ({level,msg}); the
// caller decides the exit code (mirrors engine/verify's verifyNeutral shape).
//
// These assert HF-specific facts the neutral verifier deliberately does not:
//   - index.html mounts compositions/frames/* that exist on disk
//   - window.__timelines registration
//   - CLAUDE.md/AGENTS.md @import of the shared HF authoring doc
//   - JSON<->baked-HTML GROUPS sync (moved out of neutral verify in Task 1.4 —
//     it references HTML, so it is HF-specific, not neutral)
//
// verifyFrameShell() asserts the reusable frame-shell template + themes + design docs
// (no demo video required; repo retains hash-table-example only).

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CaptionArtifactContext, Finding, VerifyOptions } from "../../engine/types.ts";
import { verifyEmittedVoiceSnapshots } from "../../engine/voice_assets.ts";
import {
  extractTemplateById,
  findElementRangeByAttribute,
  scriptSources,
} from "./html.ts";
import { DEFAULT_GSAP_SRC, gsapSrcForDocument, validateGsapSrc } from "./scaffold.ts";

const FW_HYPERFRAMES = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(FW_HYPERFRAMES, "..", "..");

const isFile = (p: string) => existsSync(p) && statSync(p).isFile();
const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

// The HF authoring doc every video's CLAUDE.md/AGENTS.md must @import. Two valid
// forms: the repo-relative source (`…/docs/standards/frameworks/hyperframes.md`,
// legacy in-repo videos) and the copied-in packaged standard the scaffolder now
// writes (`.md2vid/standards/hyperframes.md`) — an @import can't reach into an
// installed node package, so a published tool copies the doc into the project.
const PROJECT_DOC_BASENAME = "hyperframes.md";
const SHARED_PROJECT_DOC = `frameworks/${PROJECT_DOC_BASENAME}`;

// Per-video HF layout verification. `videoDir` is the framework OUTPUT dir
// (holds index.html + compositions/). The neutral caption IR lives in the sibling
// shared/ dir when reshaped, else beside index.html (flat layout-reference videos).
// Reads caption groups off disk itself — takes no plan (mirrors verifyNeutral's shape
// but the HF checks are all file-layout assertions).
export function verify(videoDir: string, sharedDir?: string, options: VerifyOptions = {}): Finding[] {
  const findings: Finding[] = [];
  const problem = (msg: string) => findings.push({ level: "error", msg });
  const warn = (msg: string) => findings.push({ level: "warn", msg });

  requireGsapSource(videoDir, problem);
  requireCaptionRuntimeInsideRoot(videoDir, problem);
  requireIndexMountsFrames(videoDir, problem, warn);
  requireProjectDocImport(videoDir, problem, warn);
  requireBakedGroupsMatchJson(videoDir, problem, sharedDir);
  if (options.voiceSnapshots) {
    findings.push(...verifyEmittedVoiceSnapshots(videoDir, options.voiceSnapshots));
  }

  return findings;
}

function sourceTargetsConfiguredFile(
  video: string,
  canonical: string,
  expected: string,
  source: string,
): boolean {
  if (source !== expected) return false;
  if (canonical === DEFAULT_GSAP_SRC) return source === DEFAULT_GSAP_SRC;
  if (/^(?:https?:)?\/\//i.test(source)) return false;
  return resolve(video, source) === resolve(video, canonical);
}

function requireConfiguredGsapSource(
  video: string,
  documentPath: string,
  gsapSrc: string,
  problem: (msg: string) => void,
): void {
  const path = join(video, ...documentPath.split("/"));
  if (!isFile(path)) return;
  const expected = gsapSrcForDocument(gsapSrc, documentPath);
  const sources = scriptSources(readFileSync(path, "utf8"));
  const matching = sources.filter((source) =>
    sourceTargetsConfiguredFile(video, gsapSrc, expected, source)
  );
  const gsapSources = sources.filter((source) => source === expected || /gsap/i.test(source));
  if (matching.length !== 1 || gsapSources.length !== 1) {
    problem(
      `${documentPath} must include exactly one configured GSAP source ${expected}; ` +
        `found ${JSON.stringify(gsapSources)}`,
    );
  }
}

function requireCaptionRuntimeInsideRoot(video: string, problem: (msg: string) => void): void {
  const path = join(video, "compositions", "captions.html");
  if (!isFile(path)) return;
  const html = readFileSync(path, "utf8");
  const range = findElementRangeByAttribute(
    html,
    "div",
    "data-composition-id",
    "captions",
  );
  if (!range) {
    problem("compositions/captions.html must contain a captions composition root");
    return;
  }
  const root = html.slice(range.start, range.end);
  if (!root.includes("var GROUPS =") || !/window\.__timelines\[["']captions["']\]/.test(root)) {
    problem("caption initialization script must be inside the captions composition root");
  }
}

function requireGsapSource(video: string, problem: (msg: string) => void): void {
  const outputConfigPath = join(video, "output.config.json");
  let configured: unknown;
  if (isFile(outputConfigPath)) {
    try {
      configured = (JSON.parse(readFileSync(outputConfigPath, "utf8")) as { gsapSrc?: unknown }).gsapSrc;
    } catch (error) {
      problem(`invalid output.config.json: ${(error as Error).message}`);
      return;
    }
  }

  let gsapSrc: string;
  try {
    gsapSrc = validateGsapSrc(video, configured);
  } catch (error) {
    problem((error as Error).message);
    return;
  }

  requireConfiguredGsapSource(video, "index.html", gsapSrc, problem);
  requireConfiguredGsapSource(video, "compositions/captions.html", gsapSrc, problem);

  const frameRoot = join(video, "compositions", "frames");
  if (!isDir(frameRoot)) return;
  for (const name of readdirSync(frameRoot).filter((file) => file.endsWith(".html"))) {
    const framePath = join(frameRoot, name);
    const html = readFileSync(framePath, "utf8");
    if (!/\bgsap\b/i.test(html)) continue;

    const frameDocument = `compositions/frames/${name}`;
    requireConfiguredGsapSource(video, frameDocument, gsapSrc, problem);
  }
}

// index.html exists, registers a main timeline, and mounts only frames on disk.
function requireIndexMountsFrames(video: string, problem: (msg: string) => void, warn: (msg: string) => void) {
  const index = join(video, "index.html");
  if (!isFile(index)) {
    problem(`missing index.html — ${index}`);
    return;
  }
  const text = readFileSync(index, "utf8");
  if (!text.includes('window.__timelines["main"]') && !text.includes("window.__timelines")) {
    warn("index.html does not register a main timeline on window.__timelines");
  }

  const frameRoot = join(video, "compositions", "frames");
  const mounted = [...text.matchAll(/data-composition-src="compositions\/frames\/([^"]+)"/g)].map(
    (mm) => mm[1]
  );
  if (isDir(frameRoot)) {
    const onDisk = new Set(readdirSync(frameRoot).filter((f) => f.endsWith(".html")));
    const missing = mounted.filter((f) => !onDisk.has(f));
    if (missing.length) problem(`index.html mounts frames not on disk: ${JSON.stringify(missing)}`);
  }
}

// Per-video CLAUDE.md / AGENTS.md must be a thin @import of the shared boilerplate,
// not a pasted copy — keeps every video pointed at one source of truth.
function requireProjectDocImport(video: string, problem: (msg: string) => void, warn: (msg: string) => void) {
  for (const name of ["CLAUDE.md", "AGENTS.md"]) {
    const file = join(video, name);
    if (!isFile(file)) {
      warn(`no ${name} — video should @import ${SHARED_PROJECT_DOC}`);
      continue;
    }
    const text = readFileSync(file, "utf8");
    // Accept either the repo-relative source doc or the copied-in packaged standard
    // (`.md2vid/standards/hyperframes.md`) — both point every video at one HF doc.
    const importsShared = text.split("\n").some((line) => {
      const t = line.trim();
      if (!t.startsWith("@")) return false;
      return t.includes(SHARED_PROJECT_DOC) || t.includes(`.md2vid/standards/${PROJECT_DOC_BASENAME}`);
    });
    if (!importsShared) {
      problem(
        `${name} does not @import ${SHARED_PROJECT_DOC} — ` +
          `replace pasted boilerplate with a single '@…/${SHARED_PROJECT_DOC}' line`
      );
    }
  }
}

// The renderer reads captions.html (not the JSON), so the baked `var GROUPS` must
// match the on-disk caption_groups.json group-for-group. HF-specific (references HTML).
export function verifyHyperframesCaptionArtifact(
  context: CaptionArtifactContext,
): Finding[] {
  const findings: Finding[] = [];
  const problem = (msg: string) => findings.push({ level: "error" as const, msg });
  const html = join(context.outputDir, "compositions", "captions.html");

  let groups: unknown;
  try {
    const parsed = JSON.parse(readFileSync(context.captionGroupsPath, "utf8")) as { groups?: unknown };
    groups = parsed.groups ?? [];
  } catch (error) {
    problem(`staged caption_groups.json is not valid JSON: ${(error as Error).message}`);
    return findings;
  }
  if (!Array.isArray(groups)) {
    problem("staged caption_groups.json groups must be an array");
    return findings;
  }
  if (!isFile(html)) {
    problem(`missing staged caption HTML: ${html}`);
    return findings;
  }

  const compareGroups = (label: string, source: string) => {
    const match = source.match(/^ *var GROUPS = (\[.*\]);$/m);
    if (!match) {
      problem(`${label} has no \`var GROUPS = [...]\` line to compare against`);
      return;
    }
    let baked: unknown;
    try {
      baked = JSON.parse(match[1]);
    } catch (error) {
      problem(`${label} var GROUPS is not valid JSON: ${(error as Error).message}`);
      return;
    }
    if (!Array.isArray(baked)) {
      problem(`${label} var GROUPS must be a JSON array`);
    } else if (baked.length !== groups.length) {
      problem(
        `${label} caption group count out of sync: JSON has ${groups.length}, ` +
          `HTML has ${baked.length} — rebuild with \`md2vid regroup\``,
      );
    } else if (JSON.stringify(baked) !== JSON.stringify(groups)) {
      problem(`${label} is out of sync with caption_groups.json — rebuild with \`md2vid regroup\``);
    }
  };

  compareGroups("captions.html", readFileSync(html, "utf8"));
  const indexPath = join(context.outputDir, "index.html");
  if (!isFile(indexPath)) {
    problem(`missing staged caption index: ${indexPath}`);
    return findings;
  }
  let embedded: string | undefined;
  try {
    embedded = extractTemplateById(readFileSync(indexPath, "utf8"), "captions-template");
  } catch (error) {
    problem(`index.html ${(error as Error).message}`);
    return findings;
  }
  if (embedded === undefined) {
    problem("index.html has no embedded captions-template");
  } else {
    compareGroups("embedded captions-template", embedded);
  }
  return findings;
}

function requireBakedGroupsMatchJson(
  video: string,
  problem: (msg: string) => void,
  sharedDir?: string,
): void {
  // Direct adapter callers retain legacy auto-detection. CLI callers pass the already
  // resolved shared directory so every verification layer uses one authoritative layout.
  const sharedSrc = join(video, "..", "shared", "caption_groups.json");
  const captionGroupsPath = sharedDir
    ? join(sharedDir, "caption_groups.json")
    : isFile(sharedSrc) ? sharedSrc : join(video, "caption_groups.json");
  if (!isFile(captionGroupsPath)) return; // captions disabled — neutral verify already warns.

  for (const finding of verifyHyperframesCaptionArtifact({
    sharedDir: sharedDir ?? video,
    outputDir: video,
    captionGroupsPath,
  })) {
    problem(finding.msg.replace("missing staged caption HTML: ", "missing compositions/captions.html but caption_groups.json exists — "));
  }
}

// ── Reusable frame-shell contract ──
// Asserts the reusable HF frame-shell *template* + themes + design docs only.
// Demo/reference videos under outputs/ are not required (repo keeps hash-table-example only).
export function verifyFrameShell(): Finding[] {
  const findings: Finding[] = [];
  const problem = (msg: string) => findings.push({ level: "error", msg });

  const TEMPLATE_ROOT = join(FW_HYPERFRAMES, "templates");
  const DESIGN_ROOT = join(REPO_ROOT, "docs", "standards", "design");

  const requirePath = (path: string, kind = "file") => {
    const exists = existsSync(path);
    if (kind === "file" && (!exists || !statSync(path).isFile())) problem(`missing file: ${path}`);
    if (kind === "dir" && (!exists || !statSync(path).isDirectory())) problem(`missing directory: ${path}`);
  };
  const requireContains = (path: string, needles: string[]) => {
    if (!isFile(path)) {
      problem(`missing file: ${path}`);
      return "";
    }
    const text = readFileSync(path, "utf8");
    for (const needle of needles) {
      if (!text.includes(needle)) problem(`${path} missing ${JSON.stringify(needle)}`);
    }
    return text;
  };

  requirePath(TEMPLATE_ROOT, "dir");
  requirePath(join(TEMPLATE_ROOT, "themes"), "dir");

  const frameShell = requireContains(join(TEMPLATE_ROOT, "frame-shell.html"), [
    "<template",
    'data-composition-id="frame-shell"',
    "data-composition-variables",
    "--frame-bg",
    "--frame-ink",
    "--frame-grid",
    "hf-frame-grid",
    "hf-frame-page",
    'window.__timelines["frame-shell"]',
  ]);
  if (frameShell.toLowerCase().includes("<head>")) {
    problem("frame-shell.html must keep styles/scripts inside the template, not <head>");
  }

  for (const theme of ["claude", "cobalt"]) {
    requireContains(join(TEMPLATE_ROOT, "themes", `${theme}.css`), [
      "--frame-bg",
      "--frame-ink",
      "--frame-grid",
      "--frame-edge",
      "--frame-rule",
      "--frame-label-font",
      "--frame-display-font",
    ]);
  }

  requireContains(join(DESIGN_ROOT, "frame-content.md"), [
    "transparent root",
    "safe area",
    "No page labels",
    "IDs are prefixed",
    "content tracks `0-9`",
  ]);

  // No outputs/* demo video checks — only hash-table-example is retained in this repo.
  return findings;
}
