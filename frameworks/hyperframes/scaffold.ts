import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import type { FrameworkScaffoldSpec } from "../../engine/types.ts";

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), "templates");
const CAPTION_SKIN_TEMPLATE = join(TEMPLATES, "caption-skin.html");

export const DEFAULT_GSAP_SRC = "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js";

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "&#96;");
}

export function gsapSrcForDocument(gsapSrc: string, documentPath: string): string {
  if (gsapSrc === DEFAULT_GSAP_SRC) return gsapSrc;
  return posix.relative(posix.dirname(documentPath), gsapSrc);
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
    throw new Error("invalid gsapSrc: expected the pinned CDN URL or a non-empty project-relative file");
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
  ]) {
    if (!existsSync(path)) throw new Error(`missing template ${label} — expected at ${path}`);
  }
}

export function scaffoldSpec(_slug: string): FrameworkScaffoldSpec {
  assertTemplates();
  return {
    outputConfig: { framework: "hyperframes", gsapSrc: DEFAULT_GSAP_SRC },
    packageScripts: {
      dev: "md2vid hyperframes preview --no-open",
      check: "md2vid hyperframes lint && md2vid hyperframes validate && md2vid hyperframes inspect",
      render: "md2vid hyperframes render",
      publish: "md2vid hyperframes publish",
    },
    nextSteps: [
      "author frames in compositions/frames/",
      "fill video.config.json and add narration",
      "npm run build",
      "npm run check",
      "npm run dev",
    ],
  };
}

function writeIfMissing(path: string, content: string): void {
  if (!existsSync(path)) writeFileSync(path, content);
}

function copyIfMissing(source: string, destination: string): void {
  if (!existsSync(destination)) copyFileSync(source, destination);
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
  copyIfMissing(CAPTION_SKIN_TEMPLATE, join(videoDir, ".hyperframes", "caption-skin.html"));
}

export function writeScaffoldRuntime(stageDir: string, slug: string): void {
  ensureRuntime(stageDir, slug);
}
