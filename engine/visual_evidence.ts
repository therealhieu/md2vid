import { createHash } from "node:crypto";
import type {
  AuthoredVisualInput,
  BuildPlan,
  ResolvedVisualBeat,
  VisualBindingEvidenceFreshness,
  VisualBindingInputDigest,
  VisualBindingManifest,
  VisualBindingManifestV1,
  VisualBindingManifestV2,
  VisualBindingV1,
  VisualBindingV2,
  VisualFrameDuration,
} from "./types.ts";

type JsonRecord = Record<string, unknown>;

const SHA256 = /^[a-f0-9]{64}$/;
const MANIFEST_V2_FIELDS = new Set([
  "version",
  "framework",
  "planSha256",
  "authoredInputs",
  "bindings",
  "frames",
]);
const V2_BINDING_FIELDS = new Set([
  "frameSlug",
  "beatId",
  "target",
  "role",
  "revealStart",
  "revealDuration",
  "coverageStart",
  "coverageEnd",
  "source",
  "authoredDuration",
  "outerDuration",
]);
const INPUT_DIGEST_FIELDS = new Set(["path", "sha256"]);
const FRAME_DURATION_FIELDS = new Set(["frameSlug", "authoredDuration", "outerDuration"]);

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is JsonRecord {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireOwn(value: JsonRecord, key: string, path: string): unknown {
  if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "must be an own property");
  return value[key];
}

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeProjectRelativePath(path: string, source: string, allowBackslashes: boolean): string {
  if (typeof path !== "string" || path.length === 0) {
    fail(source, "must be a non-empty project-relative POSIX path");
  }
  if (!allowBackslashes && path.includes("\\")) {
    fail(source, "must be a normalized project-relative POSIX path");
  }
  const normalized = allowBackslashes ? path.replaceAll("\\", "/") : path;
  if (
    normalized.startsWith("/")
    || /^[A-Za-z]:\//.test(normalized)
    || normalized.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    fail(source, "must be a normalized project-relative POSIX path");
  }
  return normalized;
}

function canonicalizeBeat(beat: ResolvedVisualBeat): Record<string, unknown> {
  const common = {
    version: beat.version,
    id: beat.id,
    text: beat.text,
    start: beat.start,
    ...(beat.end === undefined ? {} : { end: beat.end }),
    ...(beat.cueWordIndex === undefined ? {} : { cueWordIndex: beat.cueWordIndex }),
    cueText: beat.cueText,
    sourceRefs: beat.sourceRefs,
    ...(beat.workflowStep === undefined ? {} : { workflowStep: beat.workflowStep }),
    tolerance: {
      maxLead: beat.tolerance.maxLead,
      maxLag: beat.tolerance.maxLag,
    },
  };
  return beat.version === 2 ? { ...common, role: beat.role } : common;
}

export function canonicalizeCoveragePlan(plan: BuildPlan): string {
  const projection = {
    version: plan.version,
    frames: plan.frames.map((frame) => ({
      slug: frame.slug,
      voiceDur: frame.voiceDur,
      frameDur: frame.frameDur,
      firstWordStart: frame.words[0]?.start,
      words: frame.words.map((word) => ({
        text: word.text,
        start: word.start,
        end: word.end,
      })),
      ...(frame.visualSpecVersion === undefined
        ? {}
        : { visualSpecVersion: frame.visualSpecVersion }),
      ...(frame.visualKind === undefined ? {} : { visualKind: frame.visualKind }),
      visualBeats: (frame.visualBeats ?? []).map(canonicalizeBeat),
      visualCoverageExemptions: (frame.visualCoverageExemptions ?? []).map((exemption) => ({
        id: exemption.id,
        start: exemption.start,
        end: exemption.end,
        reason: exemption.reason,
        approvedBy: exemption.approvedBy,
      })),
    })),
  };
  return `${JSON.stringify(projection)}\n`;
}

export function hashCoveragePlan(plan: BuildPlan): string {
  return sha256(canonicalizeCoveragePlan(plan));
}

export function digestAuthoredInputs(
  inputs: readonly AuthoredVisualInput[],
): VisualBindingInputDigest[] {
  const digests = inputs.map((input, index) => ({
    path: normalizeProjectRelativePath(input.path, `authored visual input ${index}.path`, true),
    sha256: sha256(input.bytes),
  })).sort((left, right) => comparePaths(left.path, right.path));
  for (let index = 1; index < digests.length; index += 1) {
    if (digests[index - 1].path === digests[index].path) {
      throw new Error(`duplicate authored visual input: ${digests[index].path}`);
    }
  }
  return digests;
}

export type VisualEvidenceFreshnessChange =
  | { kind: "planSha256"; expected: string; actual: string }
  | { kind: "added"; path: string; actual: string }
  | { kind: "removed"; path: string; expected: string }
  | { kind: "changed"; path: string; expected: string; actual: string };

export function compareVisualEvidenceFreshness(
  manifest: VisualBindingManifestV2,
  current: VisualBindingEvidenceFreshness,
): VisualEvidenceFreshnessChange[] {
  const changes: VisualEvidenceFreshnessChange[] = [];
  if (manifest.planSha256 !== current.planSha256) {
    changes.push({
      kind: "planSha256",
      expected: manifest.planSha256,
      actual: current.planSha256,
    });
  }
  const expected = new Map(manifest.authoredInputs.map((input) => [input.path, input.sha256]));
  const actual = new Map(current.authoredInputs.map((input) => [input.path, input.sha256]));
  const paths = [...new Set([...expected.keys(), ...actual.keys()])].sort(comparePaths);
  for (const path of paths) {
    const expectedDigest = expected.get(path);
    const actualDigest = actual.get(path);
    if (expectedDigest === undefined && actualDigest !== undefined) {
      changes.push({ kind: "added", path, actual: actualDigest });
    } else if (expectedDigest !== undefined && actualDigest === undefined) {
      changes.push({ kind: "removed", path, expected: expectedDigest });
    } else if (expectedDigest !== actualDigest) {
      changes.push({
        kind: "changed",
        path,
        expected: expectedDigest!,
        actual: actualDigest!,
      });
    }
  }
  return changes;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) fail(path, "must be a non-empty string");
  return value;
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "must be a finite number");
  return value;
}

function validateOptionalDuration(
  value: unknown,
  path: string,
): number | undefined {
  if (value === undefined) return undefined;
  return requireFiniteNumber(value, path);
}

function validateFrameDurations(
  value: unknown,
  path: string,
  exact: boolean,
): VisualFrameDuration[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value.map((raw, index) => {
    const itemPath = `${path}[${index}]`;
    if (!(exact ? isPlainRecord(raw) : isRecord(raw))) fail(itemPath, "must be a plain object");
    if (exact) ensureOnlyFields(raw, FRAME_DURATION_FIELDS, itemPath);
    const frameSlug = requireString(exact ? requireOwn(raw, "frameSlug", itemPath) : raw.frameSlug, `${itemPath}.frameSlug`);
    const authoredDuration = validateOptionalDuration(
      exact && !Object.hasOwn(raw, "authoredDuration") ? undefined : raw.authoredDuration,
      `${itemPath}.authoredDuration`,
    );
    const outerDuration = validateOptionalDuration(
      exact && !Object.hasOwn(raw, "outerDuration") ? undefined : raw.outerDuration,
      `${itemPath}.outerDuration`,
    );
    return {
      frameSlug,
      ...(authoredDuration === undefined ? {} : { authoredDuration }),
      ...(outerDuration === undefined ? {} : { outerDuration }),
    };
  });
}

function validateV1Binding(value: unknown, path: string): VisualBindingV1 {
  if (!isRecord(value)) fail(path, "must be an object");
  const source = value.source;
  if (source !== "declarative" && source !== "custom") fail(`${path}.source`, "must be declarative or custom");
  const authoredDuration = validateOptionalDuration(value.authoredDuration, `${path}.authoredDuration`);
  const outerDuration = validateOptionalDuration(value.outerDuration, `${path}.outerDuration`);
  return {
    frameSlug: requireString(value.frameSlug, `${path}.frameSlug`),
    beatId: requireString(value.beatId, `${path}.beatId`),
    target: requireString(value.target, `${path}.target`),
    revealStart: requireFiniteNumber(value.revealStart, `${path}.revealStart`),
    revealDuration: requireFiniteNumber(value.revealDuration, `${path}.revealDuration`),
    source,
    ...(authoredDuration === undefined ? {} : { authoredDuration }),
    ...(outerDuration === undefined ? {} : { outerDuration }),
  };
}

function ensureOnlyFields(value: JsonRecord, fields: ReadonlySet<string>, path: string): void {
  for (const field of Object.keys(value)) {
    if (!fields.has(field)) fail(`${path}.${field}`, "is not supported");
  }
}

function validateV2Binding(value: unknown, path: string): VisualBindingV2 {
  if (!isPlainRecord(value)) fail(path, "must be a plain object");
  ensureOnlyFields(value, V2_BINDING_FIELDS, path);
  const role = requireOwn(value, "role", path);
  const source = requireOwn(value, "source", path);
  if (role !== "focal" && role !== "supporting") {
    fail(`${path}.role`, 'must be "focal" or "supporting"');
  }
  if (source !== "declarative" && source !== "custom" && source !== "static") {
    fail(`${path}.source`, 'must be "declarative", "custom", or "static"');
  }
  const coverageStart = requireFiniteNumber(requireOwn(value, "coverageStart", path), `${path}.coverageStart`);
  const coverageEnd = requireFiniteNumber(requireOwn(value, "coverageEnd", path), `${path}.coverageEnd`);
  if (coverageEnd < coverageStart) {
    fail(`${path}.coverageStart`, "must be less than or equal to coverageEnd");
  }
  const authoredDuration = validateOptionalDuration(
    Object.hasOwn(value, "authoredDuration") ? value.authoredDuration : undefined,
    `${path}.authoredDuration`,
  );
  const outerDuration = validateOptionalDuration(
    Object.hasOwn(value, "outerDuration") ? value.outerDuration : undefined,
    `${path}.outerDuration`,
  );
  return {
    frameSlug: requireString(requireOwn(value, "frameSlug", path), `${path}.frameSlug`),
    beatId: requireString(requireOwn(value, "beatId", path), `${path}.beatId`),
    target: requireString(requireOwn(value, "target", path), `${path}.target`),
    role,
    revealStart: requireFiniteNumber(requireOwn(value, "revealStart", path), `${path}.revealStart`),
    revealDuration: requireFiniteNumber(requireOwn(value, "revealDuration", path), `${path}.revealDuration`),
    coverageStart,
    coverageEnd,
    source,
    ...(authoredDuration === undefined ? {} : { authoredDuration }),
    ...(outerDuration === undefined ? {} : { outerDuration }),
  };
}

function validateInputDigests(value: unknown, path: string): VisualBindingInputDigest[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  const inputs = value.map((raw, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isPlainRecord(raw)) fail(itemPath, "must be a plain object");
    ensureOnlyFields(raw, INPUT_DIGEST_FIELDS, itemPath);
    const normalizedPath = normalizeProjectRelativePath(
      requireString(requireOwn(raw, "path", itemPath), `${itemPath}.path`),
      `${itemPath}.path`,
      false,
    );
    const digest = requireString(requireOwn(raw, "sha256", itemPath), `${itemPath}.sha256`);
    if (!SHA256.test(digest)) fail(`${itemPath}.sha256`, "must be a lowercase SHA-256 digest");
    return { path: normalizedPath, sha256: digest };
  });
  for (let index = 1; index < inputs.length; index += 1) {
    const previous = inputs[index - 1];
    const current = inputs[index];
    if (previous.path === current.path) {
      fail(`${path}[${index}].path`, "duplicates an earlier authoredInputs path");
    }
    if (comparePaths(previous.path, current.path) > 0) {
      fail(path, "must be sorted by normalized path");
    }
  }
  return inputs;
}

function validateV1Manifest(value: JsonRecord, path: string): VisualBindingManifestV1 {
  const bindings = value.bindings;
  if (!Array.isArray(bindings)) fail(`${path}.bindings`, "must be an array");
  const frames = validateFrameDurations(value.frames, `${path}.frames`, false);
  return {
    version: 1,
    framework: requireString(value.framework, `${path}.framework`),
    bindings: bindings.map((binding, index) => validateV1Binding(binding, `${path}.bindings[${index}]`)),
    ...(frames === undefined ? {} : { frames }),
  };
}

function validateV2Manifest(value: JsonRecord, path: string): VisualBindingManifestV2 {
  if (!isPlainRecord(value)) fail(path, "must be a plain object");
  ensureOnlyFields(value, MANIFEST_V2_FIELDS, path);
  const planSha256 = requireString(requireOwn(value, "planSha256", path), `${path}.planSha256`);
  if (!SHA256.test(planSha256)) fail(`${path}.planSha256`, "must be a lowercase SHA-256 digest");
  const bindings = requireOwn(value, "bindings", path);
  if (!Array.isArray(bindings)) fail(`${path}.bindings`, "must be an array");
  const frames = validateFrameDurations(value.frames, `${path}.frames`, true);
  return {
    version: 2,
    framework: requireString(requireOwn(value, "framework", path), `${path}.framework`),
    planSha256,
    authoredInputs: validateInputDigests(requireOwn(value, "authoredInputs", path), `${path}.authoredInputs`),
    bindings: bindings.map((binding, index) => validateV2Binding(binding, `${path}.bindings[${index}]`)),
    ...(frames === undefined ? {} : { frames }),
  };
}

export function validateVisualBindingManifest(
  value: unknown,
  path: string,
): VisualBindingManifest {
  if (!isRecord(value)) fail(path, "expected an object");
  const version = requireOwn(value, "version", path);
  if (version === 1) return validateV1Manifest(value, path);
  if (version === 2) return validateV2Manifest(value, path);
  fail(`${path}.version`, "must be 1 or 2");
}
