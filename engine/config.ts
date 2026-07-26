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
      if (typeof token !== "string") invalid(path, `captions.tokens.${name}`, "must be a string");
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
