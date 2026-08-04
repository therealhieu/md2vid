import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { FrameworkScaffoldSpec } from "../engine/types.ts";
import {
  DEFAULT_NARRATION_POLICY,
  analyzeNarrationRequest,
  validateVersionedNarrationRequest,
} from "../engine/narration_request.ts";
import { validateGsapSrc } from "../frameworks/hyperframes/scaffold.ts";
import { resolvePackageRoot } from "./package_root.ts";

const AUDIO_REQUEST_LINES = Object.freeze([
  Object.freeze({ id: "intro", text: "Introduce the topic." } as const),
  Object.freeze({ id: "recap", text: "Recap the key idea." } as const),
] as const);

export const AUDIO_REQUEST_EXAMPLE = Object.freeze({
  version: 1,
  ...DEFAULT_NARRATION_POLICY,
  lines: AUDIO_REQUEST_LINES,
} as const);

const REQUIRED_VISUAL_SYNC = {
  mode: "required",
  coverageMode: "required",
  maxLead: 0.25,
  maxLag: 0.75,
  maxUncoveredGap: 0.5,
  minLanding: 1,
} as const;

const NEUTRAL_CONFIG = {
  $comment:
    "Map every audio_meta voices[].id to its frame slug. Voice IDs may be meaningful strings; frame order follows the voices[] array. gap=0 is back-to-back; gap>0 adds a held landing.",
  timing: { tail: 0.5, xfade: 0.5, gap: 0.5 },
  canvas: { width: 1920, height: 1080 },
  slugs: {},
  visualSync: REQUIRED_VISUAL_SYNC,
};

const VISUAL_BEATS_EXAMPLE = {
  version: 2,
  frames: {
    "frame-slug": {
      kind: "focal",
      beats: [
        {
          id: "opening-context",
          text: "Opening context",
          role: "focal",
          cue: { frameStart: true },
          coverage: { until: "next-state" },
        },
        {
          id: "body-detail",
          text: "Body detail",
          role: "focal",
          cue: { phrase: "body detail", occurrence: 1 },
          coverage: { until: "next-state" },
        },
        {
          id: "final-landing",
          text: "Final landing",
          role: "focal",
          cue: { phrase: "final landing", occurrence: 1 },
          coverage: { until: "frame-end" },
        },
      ],
      coverageExemptions: [],
    },
  },
};

function sortedRecord(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));
}

export function mergePackageManifest(slug: string, spec: FrameworkScaffoldSpec): Record<string, unknown> {
  const commonScripts = {
    build: "md2vid build . && md2vid regroup . --max-chars 54",
    plan: "md2vid plan .",
    transcribe: "md2vid transcribe .",
    verify: "md2vid verify .",
    check: `md2vid verify . && ${spec.frameworkCheck}`,
  };
  for (const name of Object.keys(commonScripts)) {
    if (Object.hasOwn(spec.packageScripts, name)) {
      throw new Error(`adapter conflicts with common package script "${name}"`);
    }
  }

  const manifest: Record<string, unknown> = {
    name: slug,
    private: true,
    type: "module",
    scripts: { ...commonScripts, ...sortedRecord(spec.packageScripts) },
  };
  if (spec.dependencies) manifest.dependencies = sortedRecord(spec.dependencies);
  if (spec.devDependencies) manifest.devDependencies = sortedRecord(spec.devDependencies);
  return manifest;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeCommonScaffold(
  stageDir: string,
  slug: string,
  framework: string,
  spec: FrameworkScaffoldSpec,
): void {
  mkdirSync(stageDir, { recursive: true });
  writeJson(join(stageDir, "meta.json"), {
    id: slug,
    name: slug,
    createdAt: new Date().toISOString(),
  });
  writeJson(join(stageDir, "video.config.json"), NEUTRAL_CONFIG);
  writeJson(join(stageDir, "audio_request.json.example"), AUDIO_REQUEST_EXAMPLE);
  writeJson(join(stageDir, "visual_beats.json.example"), VISUAL_BEATS_EXAMPLE);
  writeJson(join(stageDir, "output.config.json"), spec.outputConfig);
  writeJson(join(stageDir, "package.json"), mergePackageManifest(slug, spec));

  const packageRoot = resolvePackageRoot(import.meta.url);
  const standardSource = join(packageRoot, "docs", "standards", "frameworks", `${framework}.md`);
  if (!existsSync(standardSource)) {
    throw new Error(`missing framework standard ${framework}.md — expected at ${standardSource}`);
  }
  const standardsDir = join(stageDir, ".md2vid", "standards");
  mkdirSync(standardsDir, { recursive: true });
  copyFileSync(standardSource, join(standardsDir, `${framework}.md`));

  const importLine = `@.md2vid/standards/${framework}.md\n`;
  writeFileSync(join(stageDir, "CLAUDE.md"), importLine);
  writeFileSync(join(stageDir, "AGENTS.md"), importLine);
}

function requireFile(path: string): void {
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`missing required scaffold file ${path}`);
}

function requireDirectory(path: string): void {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`missing required scaffold directory ${path}`);
  }
}

export function validateCommonScaffold(stageDir: string, slug: string): void {
  for (const name of [
    "meta.json",
    "video.config.json",
    "audio_request.json.example",
    "visual_beats.json.example",
    "output.config.json",
    "package.json",
    "CLAUDE.md",
    "AGENTS.md",
  ]) {
    requireFile(join(stageDir, name));
  }

  const meta = JSON.parse(readFileSync(join(stageDir, "meta.json"), "utf8")) as {
    id?: unknown;
    name?: unknown;
  };
  if (meta.id !== slug || meta.name !== slug) {
    throw new Error(`meta.json slug mismatch — expected id/name ${slug}`);
  }

  const neutral = JSON.parse(readFileSync(join(stageDir, "video.config.json"), "utf8")) as Record<string, unknown>;
  for (const key of ["framework", "gsapSrc", "visualContract"]) {
    if (Object.hasOwn(neutral, key)) throw new Error(`video.config.json contains framework-local key "${key}"`);
  }
  if (JSON.stringify(neutral.visualSync) !== JSON.stringify(REQUIRED_VISUAL_SYNC)) {
    throw new Error("video.config.json visualSync must equal the required scaffold policy");
  }

  const audioRequestPath = join(stageDir, "audio_request.json.example");
  const audioRequest = JSON.parse(readFileSync(audioRequestPath, "utf8"));
  if (JSON.stringify(audioRequest) !== JSON.stringify(AUDIO_REQUEST_EXAMPLE)) {
    throw new Error(`${audioRequestPath} does not match the canonical narration example`);
  }
  const validatedRequest = validateVersionedNarrationRequest(audioRequest, audioRequestPath);
  const analysis = analyzeNarrationRequest(validatedRequest);
  const errors = analysis.findings.filter((finding) => finding.severity === "error");
  if (errors.length > 0) {
    throw new Error(`${audioRequestPath} violates narration policy: ${errors.map((finding) => finding.code).join(", ")}`);
  }

  const visualBeats = JSON.parse(readFileSync(join(stageDir, "visual_beats.json.example"), "utf8"));
  if (JSON.stringify(visualBeats) !== JSON.stringify(VISUAL_BEATS_EXAMPLE)) {
    throw new Error("visual_beats.json.example must equal the required scaffold example");
  }

  const local = JSON.parse(readFileSync(join(stageDir, "output.config.json"), "utf8")) as {
    framework?: unknown;
  };
  if (typeof local.framework !== "string" || local.framework.length === 0) {
    throw new Error("output.config.json must declare framework");
  }
  requireFile(join(stageDir, ".md2vid", "standards", `${local.framework}.md`));
}

export function validateFrameworkRuntime(stageDir: string, framework: string): void {
  if (framework === "hyperframes") {
    for (const rel of [
      "hyperframes.json",
      "caption-overrides.json",
      join(".hyperframes", "caption-skin.html"),
      join(".hyperframes", "frame-template.html"),
    ]) {
      requireFile(join(stageDir, rel));
    }
    requireDirectory(join(stageDir, "compositions", "frames"));
    const outputConfigPath = join(stageDir, "output.config.json");
    requireFile(outputConfigPath);
    const outputConfig = JSON.parse(readFileSync(outputConfigPath, "utf8")) as { gsapSrc?: unknown };
    validateGsapSrc(stageDir, outputConfig.gsapSrc);
    return;
  }

  if (framework === "remotion") {
    for (const rel of [
      "render.ts",
      "remotion.config.ts",
      "tsconfig.json",
      ".gitignore",
      join("src", "index.ts"),
      join("src", "Root.tsx"),
      join("src", "Video.tsx"),
      join("src", "VisualBeats.tsx"),
      join("src", "types.ts"),
    ]) {
      requireFile(join(stageDir, rel));
    }
    return;
  }

  throw new Error(`unknown framework "${framework}"`);
}
