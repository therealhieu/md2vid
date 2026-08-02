import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FrameworkScaffoldSpec } from "../../engine/types.ts";
import {
  REMOTION_SCAFFOLD_DEPENDENCIES,
  REMOTION_SCAFFOLD_DEV_DEPENDENCIES,
} from "../../scripts/dependency_versions.ts";

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), "templates");
const ROOT_TEMPLATES = [
  ["remotion.config.ts", "remotion.config.ts"],
  ["tsconfig.json", "tsconfig.json"],
  ["render.ts", "render.ts"],
  ["gitignore", ".gitignore"],
] as const;

function assertTemplates(): void {
  for (const [source] of ROOT_TEMPLATES) {
    const path = join(TEMPLATES, source);
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`missing remotion template ${source} — expected at ${path}`);
    }
  }
  const src = join(TEMPLATES, "src");
  if (!existsSync(src) || !statSync(src).isDirectory()) {
    throw new Error(`missing remotion template src — expected at ${src}`);
  }
}

export function scaffoldSpec(_slug: string): FrameworkScaffoldSpec {
  assertTemplates();
  return {
    outputConfig: { framework: "remotion" },
    frameworkCheck: "tsc --noEmit -p tsconfig.json",
    packageScripts: {
      studio: "remotion studio src/index.ts",
      render: "node render.ts",
      still: "node render.ts --still",
      typecheck: "tsc --noEmit -p tsconfig.json",
    },
    dependencies: { ...REMOTION_SCAFFOLD_DEPENDENCIES },
    devDependencies: { ...REMOTION_SCAFFOLD_DEV_DEPENDENCIES },
    nextSteps: [
      "npm install",
      "review audio_request.json.example and author the spoken script",
      "materialize audio_request.json with explicit effective narration settings",
      "run md2vid narration-check .",
      "verify Kokoro readiness and generate fresh WAVs through /media-use",
      "run npm run transcribe",
      "fill video.config.json voice-id -> frame-slug mappings",
      "author visual_beats.json",
      "run npm run plan",
      "author and register cue-bound src/scenes/*.tsx",
      "run npm run build",
      "run npm run check",
      "run npm run still or npm run studio for review",
      "run npm run render after review",
    ],
  };
}

function copyTreeMissing(sourceDir: string, destinationDir: string): void {
  mkdirSync(destinationDir, { recursive: true });
  for (const name of readdirSync(sourceDir)) {
    const source = join(sourceDir, name);
    const destination = join(destinationDir, name);
    if (statSync(source).isDirectory()) copyTreeMissing(source, destination);
    else if (!existsSync(destination)) copyFileSync(source, destination);
  }
}

export function ensureRuntime(videoDir: string, _slug: string): void {
  assertTemplates();
  mkdirSync(videoDir, { recursive: true });
  for (const [sourceName, destinationName] of ROOT_TEMPLATES) {
    const destination = join(videoDir, destinationName);
    if (!existsSync(destination)) copyFileSync(join(TEMPLATES, sourceName), destination);
  }
  copyTreeMissing(join(TEMPLATES, "src"), join(videoDir, "src"));
}

export function writeScaffoldRuntime(stageDir: string, slug: string): void {
  ensureRuntime(stageDir, slug);
}
