// config.mjs — load + merge the neutral video.config.json with the output-local
// output.config.json. NEUTRAL: this module has no HTML/framework knowledge; it
// only knows the shape of the config files.
//
// The neutral shared/video.config.json carries timing/canvas/slugs and NEVER
// gsapSrc or framework — those are framework-local and live in the output dir's
// output.config.json. We merge (local wins) so downstream consumers see one object.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { VideoConfig } from "./types.ts";

type ConfigRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ConfigRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalid(path: string, field: string, expectation: string): never {
  throw new Error(`invalid configuration at ${path}: field "${field}" ${expectation}`);
}

const SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LITERAL_HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const SAFE_CSS_LENGTH = /^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|%|em|rem|vh|vw|vmin|vmax|cqw|cqh|cqmin|cqmax|ch|ex|lh|rlh|cm|mm|q|in|pt|pc))$/i;
const UNSAFE_FONT_FAMILY = /[;{}<>\x00-\x1f\x7f]|\/\*|\*\//;

const CAPTION_COLOR_TOKENS = new Set([
  "--cap-ink",
  "--cap-canvas",
  "--cap-accent",
  "--cap-accent-2",
  "--ink",
  "--cream",
  "--tile",
  "--tile-strong",
  "--coral",
]);
const CAPTION_LENGTH_TOKENS = new Set(["--cap-band-top", "--cap-band-height"]);
const CAPTION_FONT_TOKENS = new Set(["--font-display", "--font-body"]);
const CAPTION_TOKENS = new Set([
  ...CAPTION_COLOR_TOKENS,
  ...CAPTION_LENGTH_TOKENS,
  ...CAPTION_FONT_TOKENS,
]);

export function validateSlugMappings(
  value: unknown,
  path: string,
  voiceIds?: readonly string[],
): Record<string, string> {
  if (!isRecord(value)) {
    invalid(path, "slugs", "must be a non-null, non-array object");
  }

  const owners = new Map<string, string>();

  for (const [id, slug] of Object.entries(value)) {
    if (typeof slug !== "string" || !SAFE_SLUG.test(slug)) {
      invalid(
        path,
        `slugs.${id}`,
        "must be a safe single path segment matching ^[A-Za-z0-9][A-Za-z0-9._-]*$",
      );
    }

    const previousOwner = owners.get(slug);
    if (previousOwner !== undefined) {
      invalid(
        path,
        `slugs.${id}`,
        `must be unique; already mapped by voice id "${previousOwner}"`,
      );
    }

    owners.set(slug, id);
  }

  if (voiceIds !== undefined) {
    const expectedVoiceIds = new Set(voiceIds);

    for (const voiceId of voiceIds) {
      if (!Object.hasOwn(value, voiceId)) {
        throw new Error(
          `invalid configuration at ${path}: missing slug mapping for voice id "${voiceId}"`,
        );
      }
    }

    for (const voiceId of Object.keys(value)) {
      if (!expectedVoiceIds.has(voiceId)) {
        throw new Error(
          `invalid configuration at ${path}: unknown slug mapping for voice id "${voiceId}"`,
        );
      }
    }
  }

  return value as Record<string, string>;
}

function optionalRecord(config: ConfigRecord, field: string, path: string): ConfigRecord | undefined {
  const value = config[field];
  if (value === undefined) return undefined;
  if (!isRecord(value)) invalid(path, field, "must be a non-null, non-array object");
  return value;
}

function optionalNonEmptyString(config: ConfigRecord, field: string, path: string): void {
  const value = config[field];
  if (value === undefined) return;
  if (typeof value !== "string" || value.trim().length === 0) {
    invalid(path, field, "must be a non-empty string");
  }
}

export function validateVideoConfig(value: unknown, path: string): VideoConfig {
  if (!isRecord(value)) throw new Error(`invalid configuration at ${path}: expected a JSON object`);

  const slugs = value.slugs;
  if (slugs !== undefined) {
    validateSlugMappings(slugs, path);
  }

  const timing = optionalRecord(value, "timing", path);
  if (timing) {
    for (const field of ["tail", "xfade", "gap"] as const) {
      const setting = timing[field];
      if (setting !== undefined && (typeof setting !== "number" || !Number.isFinite(setting) || setting < 0)) {
        invalid(path, `timing.${field}`, "must be a finite non-negative number");
      }
    }
  }

  const canvas = optionalRecord(value, "canvas", path);
  if (canvas) {
    for (const field of ["width", "height"] as const) {
      const dimension = canvas[field];
      if (dimension !== undefined && (
        typeof dimension !== "number" || !Number.isFinite(dimension) || dimension <= 0
      )) {
        invalid(path, `canvas.${field}`, "must be a positive finite number");
      }
    }
  }

  optionalNonEmptyString(value, "framework", path);
  optionalNonEmptyString(value, "gsapSrc", path);

  const captions = optionalRecord(value, "captions", path);
  const tokens = captions ? optionalRecord(captions, "tokens", path) : undefined;
  if (tokens) {
    for (const [name, token] of Object.entries(tokens)) {
      if (!CAPTION_TOKENS.has(name)) {
        invalid(
          path,
          `captions.tokens.${name}`,
          `caption_token_unknown: must be one of ${JSON.stringify([...CAPTION_TOKENS])}`,
        );
      }
      if (typeof token !== "string") invalid(path, `captions.tokens.${name}`, "must be a string");
      const trimmed = token.trim();
      if (CAPTION_COLOR_TOKENS.has(name) && !LITERAL_HEX_COLOR.test(trimmed)) {
        invalid(
          path,
          `captions.tokens.${name}`,
          "caption_token_invalid_color: must be a literal #RGB, #RGBA, #RRGGBB, or #RRGGBBAA color",
        );
      }
      if (CAPTION_LENGTH_TOKENS.has(name) && !SAFE_CSS_LENGTH.test(trimmed)) {
        invalid(path, `captions.tokens.${name}`, "must be a safe CSS length");
      }
      if (
        CAPTION_FONT_TOKENS.has(name) &&
        (trimmed.length === 0 || UNSAFE_FONT_FAMILY.test(token))
      ) {
        invalid(path, `captions.tokens.${name}`, "must be a safe font family string");
      }
    }
  }

  const visualContract = optionalRecord(value, "visualContract", path);
  if (visualContract) {
    if (visualContract.version !== 1) {
      invalid(path, "visualContract.version", "must equal the supported version 1");
    }
    if (visualContract.projectTheme !== "light" && visualContract.projectTheme !== "dark") {
      invalid(path, "visualContract.projectTheme", 'must be either "light" or "dark"');
    }
    if (typeof visualContract.allowMixedThemes !== "boolean") {
      invalid(path, "visualContract.allowMixedThemes", "must be a boolean");
    }
    if (typeof visualContract.allowLegacyThemeInference !== "boolean") {
      invalid(path, "visualContract.allowLegacyThemeInference", "must be a boolean");
    }
  }

  return value as VideoConfig;
}

function readConfig(path: string): VideoConfig {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error: unknown) {
    throw new Error(`invalid configuration at ${path}: ${(error as Error).message}`);
  }
  return validateVideoConfig(value, path);
}

export interface LoadedVideoConfig {
  config: VideoConfig;
  neutral: VideoConfig;
  local?: VideoConfig;
  neutralPath: string;
  localPath?: string;
}

export function loadConfigFiles(sharedDir: string, outputDir?: string): LoadedVideoConfig {
  const neutralPath = join(sharedDir, "video.config.json");
  if (!existsSync(neutralPath)) throw new Error(`missing video.config.json — ${neutralPath}`);
  const neutral = readConfig(neutralPath);

  let local: VideoConfig | undefined;
  let localPath: string | undefined;
  if (outputDir) {
    localPath = join(outputDir, "output.config.json");
    if (existsSync(localPath)) local = readConfig(localPath);
  }
  return {
    config: { ...neutral, ...local },
    neutral,
    local,
    neutralPath,
    localPath,
  };
}

// Load and merge config. `sharedDir` holds the neutral video.config.json;
// `outputDir` (optional) holds the framework-local output.config.json (gsapSrc,
// framework). Throws on a missing neutral config — the caller maps it to a CLI fail.
export function loadConfig(sharedDir: string, outputDir?: string): VideoConfig {
  return loadConfigFiles(sharedDir, outputDir).config;
}
