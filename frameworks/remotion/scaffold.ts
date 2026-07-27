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
    dependencies: {
      "@remotion/bundler": "4.0.486",
      "@remotion/cli": "4.0.486",
      "@remotion/google-fonts": "4.0.486",
      "@remotion/media": "4.0.486",
      "@remotion/renderer": "4.0.486",
      remotion: "4.0.486",
      react: "19.0.0",
      "react-dom": "19.0.0",
    },
    devDependencies: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      typescript: "^5.7.0",
    },
    nextSteps: [
      "npm install",
      "review audio_request.json.example and generate narration",
      "author and register src/scenes/*.tsx",
      "fill video.config.json voice-id -> frame-slug mappings",
      "npm run build",
      "npm run check",
      "npm run still or npm run studio",
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
