import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import type { FrameworkScaffoldSpec } from "../../engine/types.ts";
import {
  DEFAULT_GSAP_SRC,
  GSAP_VERSION,
  isCanonicalStableVersion,
} from "../../scripts/dependency_versions.ts";

export { DEFAULT_GSAP_SRC, GSAP_VERSION };
export const GSAP_SRC_TOKEN = "__MD2VID_GSAP_SRC__";
const CANONICAL_GSAP_CDN =
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@([^/]+)\/dist\/gsap\.min\.js$/;

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_TEMPLATES = join(MODULE_DIR, "templates");
const PACKED_DIST_TEMPLATES = join(
  MODULE_DIR,
  "..",
  "..",
  "dist",
  "frameworks",
  "hyperframes",
  "templates",
);
const TEMPLATES = existsSync(SOURCE_TEMPLATES)
  ? SOURCE_TEMPLATES
  : PACKED_DIST_TEMPLATES;
const CAPTION_SKIN_TEMPLATE = join(TEMPLATES, "caption-skin.html");
const FRAME_TEMPLATE = join(TEMPLATES, "frame-template.html");

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "&#96;");
}

export function materializeGsapTemplate(
  template: string,
  gsapSrc: string = DEFAULT_GSAP_SRC,
): string {
  const tokenCount = template.split(GSAP_SRC_TOKEN).length - 1;
  const defaultCount = template.split(DEFAULT_GSAP_SRC).length - 1;
  const count = tokenCount + defaultCount;
  if (count !== 1) {
    throw new Error(`expected exactly one GSAP source placeholder, found ${count}`);
  }
  const placeholder = tokenCount === 1 ? GSAP_SRC_TOKEN : DEFAULT_GSAP_SRC;
  return template.replace(placeholder, escapeHtmlAttribute(gsapSrc));
}

export function gsapSrcForDocument(gsapSrc: string, _documentPath: string): string {
  return gsapSrc;
}

export function gsapScriptSrcAttribute(gsapSrc: string, documentPath: string): string {
  return escapeHtmlAttribute(gsapSrcForDocument(gsapSrc, documentPath));
}

function assertContained(root: string, candidate: string, gsapSrc: string): void {
  const rel = relative(root, candidate);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`invalid gsapSrc: path escapes project root (${gsapSrc})`);
  }
}

export function validateGsapSrc(videoDir: string, input: unknown): string {
  const gsapSrc = input === undefined ? DEFAULT_GSAP_SRC : input;
  if (gsapSrc === DEFAULT_GSAP_SRC) return gsapSrc;
  if (typeof gsapSrc !== "string" || gsapSrc.trim().length === 0) {
    throw new Error(
      "invalid gsapSrc: expected an exact canonical GSAP CDN URL or a non-empty project-relative file",
    );
  }
  const canonicalCdn = gsapSrc.match(CANONICAL_GSAP_CDN);
  if (canonicalCdn?.[1] && isCanonicalStableVersion(canonicalCdn[1])) {
    return gsapSrc;
  }
  if (isAbsolute(gsapSrc) || win32.isAbsolute(gsapSrc) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(gsapSrc)) {
    throw new Error(`invalid gsapSrc: expected a project-relative file (${gsapSrc})`);
  }

  const parts = gsapSrc.split("/");
  if (
    gsapSrc.includes("\\") ||
    parts.some((part) => part === "" || part === "." || part === ".." || !/^[A-Za-z0-9._-]+$/.test(part)) ||
    !/\.js$/i.test(gsapSrc)
  ) {
    throw new Error(`invalid gsapSrc: expected safe forward-slash-separated path to a JavaScript file (${gsapSrc})`);
  }

  const root = realpathSync(videoDir);
  const candidate = resolve(root, gsapSrc);
  assertContained(root, candidate, gsapSrc);
  if (!existsSync(candidate)) throw new Error(`missing gsapSrc file: ${gsapSrc}`);
  if (!lstatSync(candidate).isFile()) {
    throw new Error(`gsapSrc must reference a regular file: ${gsapSrc}`);
  }
  assertContained(root, realpathSync(candidate), gsapSrc);
  return gsapSrc;
}

function assertTemplates(): void {
  for (const [label, path] of [
    ["caption-skin.html", CAPTION_SKIN_TEMPLATE],
    ["frame-template.html", FRAME_TEMPLATE],
  ]) {
    if (!existsSync(path)) throw new Error(`missing template ${label} — expected at ${path}`);
  }
}

export function scaffoldSpec(_slug: string): FrameworkScaffoldSpec {
  assertTemplates();
  return {
    outputConfig: {
      framework: "hyperframes",
      gsapSrc: DEFAULT_GSAP_SRC,
      visualContract: {
        version: 1,
        projectTheme: "light",
        allowMixedThemes: false,
        allowLegacyThemeInference: false,
      },
      render: { profile: "final", fps: 30, minimumFinalFps: 24 },
    },
    frameworkCheck: "md2vid hyperframes lint && md2vid hyperframes validate && md2vid hyperframes inspect",
    packageScripts: {
      dev: "md2vid hyperframes preview --no-open",
      render: "md2vid hyperframes render",
      publish: "md2vid hyperframes publish",
    },
    nextSteps: [
      "review audio_request.json.example and author the spoken script",
      "materialize audio_request.json with explicit effective narration settings",
      "run md2vid narration-check .",
      "verify Kokoro readiness and generate fresh WAVs through /media-use",
      "run npm run transcribe",
      "fill video.config.json voice-id -> frame-slug mappings",
      "transcribe → author visual-beats v2 → plan → inspect coverage intervals → bind semantic targets → build → verify continuous coverage → review → render",
      "author visual_beats.json v2 with a static opening focal, body states, and a final frame-end landing",
      "run npm run plan and inspect build/visual_timing.json coverage intervals",
      "bind semantic targets in compositions/frames/ with data-md2vid-coverage=\"planned\" or owned helpers",
      "run npm run build",
      "run npm run check before preview or render",
      "run npm run dev for listening and visual review",
      "run npm run render after review",
    ],
  };
}

function writeIfMissing(path: string, content: string): void {
  if (!existsSync(path)) writeFileSync(path, content);
}

function writeMaterializedIfMissing(source: string, destination: string): void {
  if (existsSync(destination)) return;
  const template = readFileSync(source, "utf8");
  writeFileSync(destination, materializeGsapTemplate(template));
}

export function ensureRuntime(videoDir: string, _slug: string): void {
  assertTemplates();
  mkdirSync(join(videoDir, "compositions", "frames"), { recursive: true });
  mkdirSync(join(videoDir, "assets"), { recursive: true });
  mkdirSync(join(videoDir, ".hyperframes"), { recursive: true });

  writeIfMissing(
    join(videoDir, "hyperframes.json"),
    `${JSON.stringify({
      $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
      registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
      paths: {
        blocks: "compositions",
        components: "compositions/components",
        assets: "assets",
      },
    }, null, 2)}\n`,
  );
  writeIfMissing(join(videoDir, "caption-overrides.json"), "[]\n");
  writeMaterializedIfMissing(
    CAPTION_SKIN_TEMPLATE,
    join(videoDir, ".hyperframes", "caption-skin.html"),
  );
  writeMaterializedIfMissing(
    FRAME_TEMPLATE,
    join(videoDir, ".hyperframes", "frame-template.html"),
  );
}

export function writeScaffoldRuntime(stageDir: string, slug: string): void {
  ensureRuntime(stageDir, slug);
}
