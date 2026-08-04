import { readFileSync } from "node:fs";
import type {
  AuthoredCoverageExemption,
  AuthoredVisualBeatV1,
  AuthoredVisualBeatV2,
  AuthoredVisualFrameV1,
  AuthoredVisualFrameV2,
  PlanFrame,
  ResolvedCoverageExemption,
  ResolvedVisualBeat,
  ResolvedVisualStateV2,
  ResolvedVisualSyncPolicy,
  VisualBeatSpec,
  VisualBeatSpecV1,
  VisualBeatSpecV2,
  VisualCoverageEnd,
  VisualCueAnchorV1,
  VisualCueAnchorV2,
} from "./types.ts";

type JsonRecord = Record<string, unknown>;

interface NormalizedToken {
  token: string;
  wordIndex: number;
}

interface PhraseMatch {
  firstWordIndex: number;
  lastWordIndex: number;
}

const VISUAL_KINDS = new Set(["focal", "workflow", "comparison", "sequence"]);
const V1_FRAME_FIELDS = new Set(["kind", "beats"]);
const V1_BEAT_FIELDS = new Set(["id", "text", "cue", "sourceRefs", "workflowStep", "tolerance"]);
const V2_FRAME_FIELDS = new Set(["kind", "beats", "coverageExemptions"]);
const V2_BEAT_FIELDS = new Set([
  "id",
  "text",
  "role",
  "cue",
  "coverage",
  "sourceRefs",
  "workflowStep",
  "tolerance",
]);
const V2_COVERAGE_FIELDS = new Set(["until"]);
const V2_EXEMPTION_FIELDS = new Set([
  "id",
  "from",
  "until",
  "reason",
  "approvedBy",
]);
const TOLERANCE_FIELDS = new Set(["maxLead", "maxLag"]);
const DIAGNOSTIC_TRANSCRIPT_WORD_LIMIT = 12;
const DIAGNOSTIC_CANDIDATE_LIMIT = 8;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function ensureOnlyFields(value: JsonRecord, allowed: ReadonlySet<string>, path: string): void {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) fail(`${path}.${field}`, "is not supported");
  }
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(path, "must be a non-empty string");
  }
  return value;
}

function validateCueV1(value: unknown, path: string): VisualCueAnchorV1 {
  if (!isRecord(value)) fail(path, "must be an object");

  const hasWordIndex = Object.hasOwn(value, "wordIndex");
  const hasPhrase = Object.hasOwn(value, "phrase");
  const hasOccurrence = Object.hasOwn(value, "occurrence");
  const isWordIndexCue = hasWordIndex && !hasPhrase && !hasOccurrence && Object.keys(value).length === 1;
  const isPhraseCue = !hasWordIndex && hasPhrase && hasOccurrence && Object.keys(value).length === 2;

  if (!isWordIndexCue && !isPhraseCue) {
    fail(path, "must contain exactly one cue branch: wordIndex or phrase with occurrence");
  }

  if (isWordIndexCue) {
    if (!Number.isInteger(value.wordIndex) || (value.wordIndex as number) < 0) {
      fail(`${path}.wordIndex`, "must be a non-negative integer");
    }
    return { wordIndex: value.wordIndex as number };
  }

  const phrase = requireNonEmptyString(value.phrase, `${path}.phrase`);
  if (!Number.isInteger(value.occurrence) || (value.occurrence as number) <= 0) {
    fail(`${path}.occurrence`, "must be a positive integer");
  }
  return { phrase, occurrence: value.occurrence as number };
}

function validateCueV2(value: unknown, path: string): VisualCueAnchorV2 {
  if (!isRecord(value)) fail(path, "must be an object");
  if (Object.hasOwn(value, "frameStart")) {
    if (Object.keys(value).length !== 1) {
      fail(path, "must contain exactly one cue branch");
    }
    if (value.frameStart !== true) {
      fail(`${path}.frameStart`, "must be true");
    }
    return { frameStart: true };
  }
  return validateCueV1(value, path);
}

function validateSourceRefs(value: unknown, path: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value.map((sourceRef, index) => requireNonEmptyString(sourceRef, `${path}[${index}]`));
}

function validateTolerance(value: unknown, path: string): AuthoredVisualBeatV1["tolerance"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) fail(path, "must be an object");
  ensureOnlyFields(value, TOLERANCE_FIELDS, path);

  const tolerance: AuthoredVisualBeatV1["tolerance"] = {};
  for (const field of ["maxLead", "maxLag"] as const) {
    const setting = value[field];
    if (setting === undefined) continue;
    if (typeof setting !== "number" || !Number.isFinite(setting) || setting < 0) {
      fail(`${path}.${field}`, "must be a finite non-negative number");
    }
    tolerance[field] = setting;
  }
  return tolerance;
}

function validateBeatV1(value: unknown, path: string): AuthoredVisualBeatV1 {
  if (!isRecord(value)) fail(path, "must be an object");
  ensureOnlyFields(value, V1_BEAT_FIELDS, path);

  const id = requireNonEmptyString(value.id, `${path}.id`);
  const text = requireNonEmptyString(value.text, `${path}.text`);
  const cue = validateCueV1(value.cue, `${path}.cue`);
  const sourceRefs = validateSourceRefs(value.sourceRefs, `${path}.sourceRefs`);
  const tolerance = validateTolerance(value.tolerance, `${path}.tolerance`);

  let workflowStep: number | undefined;
  if (value.workflowStep !== undefined) {
    if (!Number.isInteger(value.workflowStep) || (value.workflowStep as number) <= 0) {
      fail(`${path}.workflowStep`, "must be a positive integer");
    }
    workflowStep = value.workflowStep as number;
  }

  return {
    id,
    text,
    cue,
    ...(sourceRefs === undefined ? {} : { sourceRefs }),
    ...(workflowStep === undefined ? {} : { workflowStep }),
    ...(tolerance === undefined ? {} : { tolerance }),
  };
}

function validateCoverageEnd(value: unknown, path: string): VisualCoverageEnd {
  if (value === "next-state" || value === "voice-end" || value === "frame-end") {
    return value;
  }
  if (!isRecord(value)) fail(path, "must be a coverage endpoint");
  ensureOnlyFields(value, new Set(["cue"]), path);
  if (!Object.hasOwn(value, "cue")) fail(`${path}.cue`, "is required");
  return { cue: validateCueV2(value.cue, `${path}.cue`) };
}

function validateCoverage(
  value: unknown,
  path: string,
): AuthoredVisualBeatV2["coverage"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) fail(path, "must be an object");
  ensureOnlyFields(value, V2_COVERAGE_FIELDS, path);
  if (value.until === undefined) return {};
  return { until: validateCoverageEnd(value.until, `${path}.until`) };
}

function validateBeatV2(value: unknown, path: string): AuthoredVisualBeatV2 {
  if (!isRecord(value)) fail(path, "must be an object");
  ensureOnlyFields(value, V2_BEAT_FIELDS, path);

  const id = requireNonEmptyString(value.id, `${path}.id`);
  const text = requireNonEmptyString(value.text, `${path}.text`);
  if (value.role !== "focal" && value.role !== "supporting") {
    fail(`${path}.role`, 'must be one of "focal" or "supporting"');
  }
  const cue = validateCueV2(value.cue, `${path}.cue`);
  const coverage = validateCoverage(value.coverage, `${path}.coverage`);
  const sourceRefs = validateSourceRefs(value.sourceRefs, `${path}.sourceRefs`);
  const tolerance = validateTolerance(value.tolerance, `${path}.tolerance`);

  let workflowStep: number | undefined;
  if (value.workflowStep !== undefined) {
    if (!Number.isInteger(value.workflowStep) || (value.workflowStep as number) <= 0) {
      fail(`${path}.workflowStep`, "must be a positive integer");
    }
    workflowStep = value.workflowStep as number;
  }

  return {
    id,
    text,
    role: value.role,
    cue,
    ...(coverage === undefined ? {} : { coverage }),
    ...(sourceRefs === undefined ? {} : { sourceRefs }),
    ...(workflowStep === undefined ? {} : { workflowStep }),
    ...(tolerance === undefined ? {} : { tolerance }),
  };
}

function validateCoverageExemption(
  value: unknown,
  path: string,
): AuthoredCoverageExemption {
  if (!isRecord(value)) fail(path, "must be an object");
  ensureOnlyFields(value, V2_EXEMPTION_FIELDS, path);
  return {
    id: requireNonEmptyString(value.id, `${path}.id`),
    from: validateCueV2(value.from, `${path}.from`),
    until: validateCoverageEnd(value.until, `${path}.until`),
    reason: requireNonEmptyString(value.reason, `${path}.reason`),
    approvedBy: requireNonEmptyString(value.approvedBy, `${path}.approvedBy`),
  };
}

function validateWorkflowSteps(
  beats: readonly (AuthoredVisualBeatV1 | AuthoredVisualBeatV2)[],
  path: string,
  kind?: AuthoredVisualFrameV1["kind"],
): void {
  const workflowBeats = beats.filter((beat) => beat.workflowStep !== undefined);
  if (workflowBeats.length === 0) {
    if (kind === "workflow") fail(`${path}.beats`, "workflowStep is required for every beat in a workflow frame");
    return;
  }
  if (workflowBeats.length !== beats.length) {
    fail(`${path}.beats`, "workflowStep is required for every beat when any workflow step is set");
  }

  const steps = workflowBeats.map((beat) => beat.workflowStep!);
  const seen = new Set<number>();
  for (const step of steps) {
    if (seen.has(step)) fail(`${path}.beats`, `duplicate workflow step ${step}`);
    seen.add(step);
  }

  const sorted = [...steps].sort((left, right) => left - right);
  const expected = sorted.map((_, index) => index + 1);
  if (sorted.some((step, index) => step !== expected[index])) {
    fail(
      `${path}.beats`,
      `workflow steps must be consecutive starting at 1; expected ${expected.join(", ")} but received ${sorted.join(", ")}`,
    );
  }
}

function validateFrameV1(value: unknown, path: string): AuthoredVisualFrameV1 {
  if (!isRecord(value)) fail(path, "must be an object");
  ensureOnlyFields(value, V1_FRAME_FIELDS, path);

  let kind: AuthoredVisualFrameV1["kind"];
  if (value.kind !== undefined) {
    if (typeof value.kind !== "string" || !VISUAL_KINDS.has(value.kind)) {
      fail(`${path}.kind`, 'must be one of "focal", "workflow", "comparison", or "sequence"');
    }
    kind = value.kind as AuthoredVisualFrameV1["kind"];
  }

  if (!Array.isArray(value.beats) || value.beats.length === 0) {
    fail(`${path}.beats`, "must be a non-empty array");
  }
  const beats = value.beats.map((beat, index) => validateBeatV1(beat, `${path}.beats[${index}]`));

  const idPaths = new Map<string, string>();
  for (const [index, beat] of beats.entries()) {
    const idPath = `${path}.beats[${index}].id`;
    const firstPath = idPaths.get(beat.id);
    if (firstPath !== undefined) {
      fail(idPath, `duplicate beat id "${beat.id}"; first declared at ${firstPath}`);
    }
    idPaths.set(beat.id, idPath);
  }
  validateWorkflowSteps(beats, path, kind);

  return { ...(kind === undefined ? {} : { kind }), beats };
}

function validateFrameV2(value: unknown, path: string): AuthoredVisualFrameV2 {
  if (!isRecord(value)) fail(path, "must be an object");
  ensureOnlyFields(value, V2_FRAME_FIELDS, path);

  let kind: AuthoredVisualFrameV2["kind"];
  if (value.kind !== undefined) {
    if (typeof value.kind !== "string" || !VISUAL_KINDS.has(value.kind)) {
      fail(`${path}.kind`, 'must be one of "focal", "workflow", "comparison", or "sequence"');
    }
    kind = value.kind as AuthoredVisualFrameV2["kind"];
  }

  if (!Array.isArray(value.beats)) {
    fail(`${path}.beats`, "must be an array");
  }
  const beats = value.beats.map((beat, index) => validateBeatV2(beat, `${path}.beats[${index}]`));
  const idPaths = new Map<string, string>();
  for (const [index, beat] of beats.entries()) {
    const idPath = `${path}.beats[${index}].id`;
    const firstPath = idPaths.get(beat.id);
    if (firstPath !== undefined) {
      fail(idPath, `duplicate beat id "${beat.id}"; first declared at ${firstPath}`);
    }
    idPaths.set(beat.id, idPath);
  }
  validateWorkflowSteps(beats, path, kind);

  let coverageExemptions: AuthoredCoverageExemption[] | undefined;
  if (value.coverageExemptions !== undefined) {
    if (!Array.isArray(value.coverageExemptions)) {
      fail(`${path}.coverageExemptions`, "must be an array");
    }
    const exemptionIdPaths = new Map<string, string>();
    coverageExemptions = value.coverageExemptions.map((exemption, index) => {
      const exemptionPath = `${path}.coverageExemptions[${index}]`;
      const parsed = validateCoverageExemption(exemption, exemptionPath);
      const idPath = `${exemptionPath}.id`;
      const firstPath = exemptionIdPaths.get(parsed.id);
      if (firstPath !== undefined) {
        fail(idPath, `duplicate coverage exemption id "${parsed.id}"; first declared at ${firstPath}`);
      }
      exemptionIdPaths.set(parsed.id, idPath);
      return parsed;
    });
  }

  return {
    ...(kind === undefined ? {} : { kind }),
    beats,
    ...(coverageExemptions === undefined ? {} : { coverageExemptions }),
  };
}

function validateV1Spec(value: JsonRecord, path: string): VisualBeatSpecV1 {
  if (!isRecord(value.frames)) fail(`${path}.frames`, "expected an object");
  const frames: Record<string, AuthoredVisualFrameV1> = Object.create(null);
  for (const [slug, frameValue] of Object.entries(value.frames)) {
    frames[slug] = validateFrameV1(frameValue, `${path}.frames.${slug}`);
  }
  return { version: 1, frames };
}

function validateV2Spec(value: JsonRecord, path: string): VisualBeatSpecV2 {
  if (!isRecord(value.frames)) fail(`${path}.frames`, "expected an object");
  const frames: Record<string, AuthoredVisualFrameV2> = Object.create(null);
  for (const [slug, frameValue] of Object.entries(value.frames)) {
    frames[slug] = validateFrameV2(frameValue, `${path}.frames.${slug}`);
  }
  return { version: 2, frames };
}

export function validateVisualBeatSpec(value: unknown, path: string): VisualBeatSpec {
  if (!isRecord(value)) fail(path, "expected an object");
  ensureOnlyFields(value, new Set(["version", "frames"]), path);
  if (value.version === 1) return validateV1Spec(value, path);
  if (value.version === 2) return validateV2Spec(value, path);
  fail(`${path}.version`, "must be 1 or 2");
}

export function readVisualBeatSpec(path: string): VisualBeatSpec {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path}: invalid JSON: ${(error as Error).message}`);
  }
  return validateVisualBeatSpec(value, path);
}

function normalizedTextTokens(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizedTokens(words: readonly PlanFrame["words"][number][]): NormalizedToken[] {
  return words.flatMap((word, wordIndex) =>
    normalizedTextTokens(word.text).map((token) => ({ token, wordIndex })),
  );
}

function matchingPhraseLocations(tokens: readonly NormalizedToken[], phraseTokens: readonly string[]): PhraseMatch[] {
  const matches: PhraseMatch[] = [];
  for (let index = 0; index <= tokens.length - phraseTokens.length; index++) {
    if (!phraseTokens.every((token, offset) => tokens[index + offset].token === token)) continue;
    matches.push({
      firstWordIndex: tokens[index].wordIndex,
      lastWordIndex: tokens[index + phraseTokens.length - 1].wordIndex,
    });
  }
  return matches;
}

function boundedTranscriptContext(frame: PlanFrame): string {
  const transcript = frame.words
    .slice(0, DIAGNOSTIC_TRANSCRIPT_WORD_LIMIT)
    .map((word, wordIndex) => `${wordIndex}:${JSON.stringify(word.text)}`)
    .join(" ");
  const suffix = frame.words.length > DIAGNOSTIC_TRANSCRIPT_WORD_LIMIT ? " …" : "";
  return `[${transcript}${suffix}]`;
}

function phraseRecoveryContext(frame: PlanFrame, matches: readonly PhraseMatch[]): string {
  const candidates = matches
    .slice(0, DIAGNOSTIC_CANDIDATE_LIMIT)
    .map((match, index) => {
      const text = frame.words
        .slice(match.firstWordIndex, match.lastWordIndex + 1)
        .map((word) => word.text)
        .join(" ");
      return `#${index + 1} words ${match.firstWordIndex}-${match.lastWordIndex} ${JSON.stringify(text)}`;
    });
  const suffix = matches.length > DIAGNOSTIC_CANDIDATE_LIMIT ? " …" : "";
  return `transcript: ${boundedTranscriptContext(frame)}; candidates: ${candidates.length === 0 ? "none" : `${candidates.join(", ")}${suffix}`}`;
}

function resolvedStart(frame: PlanFrame, wordIndex: number, path: string): number {
  const word = frame.words[wordIndex];
  if (word === undefined || typeof word.start !== "number" || !Number.isFinite(word.start) || word.start < 0 || word.start > frame.voiceDur) {
    fail(path, "references a word with an invalid frame-local start time");
  }
  return word.start;
}

interface ResolvedCue {
  start: number;
  cueWordIndex?: number;
  cueText: string;
}

function resolveTranscriptCue(
  cue: VisualCueAnchorV1,
  frame: PlanFrame,
  path: string,
): ResolvedCue {
  let firstWordIndex: number;
  let lastWordIndex: number;

  if ("wordIndex" in cue) {
    firstWordIndex = cue.wordIndex;
    lastWordIndex = firstWordIndex;
    if (firstWordIndex >= frame.words.length) {
      fail(`${path}.wordIndex`, `is out of range for frame "${frame.slug}"`);
    }
  } else {
    const phraseTokens = normalizedTextTokens(cue.phrase);
    if (phraseTokens.length === 0) fail(`${path}.phrase`, "has no normalized tokens");
    const matches = matchingPhraseLocations(normalizedTokens(frame.words), phraseTokens);
    const recoveryContext = phraseRecoveryContext(frame, matches);
    if (matches.length === 0) {
      fail(`${path}.phrase`, `cue phrase "${cue.phrase}" was not found; ${recoveryContext}`);
    }
    if (cue.occurrence > matches.length) {
      const matchLabel = matches.length === 1 ? "match" : "matches";
      fail(
        `${path}.occurrence`,
        `occurrence ${cue.occurrence} is invalid; only ${matches.length} ${matchLabel}; ${recoveryContext}`,
      );
    }
    ({ firstWordIndex, lastWordIndex } = matches[cue.occurrence - 1]);
  }

  return {
    start: resolvedStart(frame, firstWordIndex, path),
    cueWordIndex: firstWordIndex,
    cueText: frame.words.slice(firstWordIndex, lastWordIndex + 1).map((word) => word.text).join(" "),
  };
}

function resolveCueV2(
  cue: VisualCueAnchorV2,
  frame: PlanFrame,
  path: string,
): ResolvedCue {
  if ("frameStart" in cue) {
    return { start: 0, cueText: "<frame-start>" };
  }
  return resolveTranscriptCue(cue, frame, path);
}

function resolveBeat(
  beat: AuthoredVisualBeatV1,
  frame: PlanFrame,
  defaults: ResolvedVisualSyncPolicy,
  path: string,
): ResolvedVisualBeat {
  const resolved = resolveTranscriptCue(beat.cue, frame, `${path}.cue`);
  return {
    version: 1,
    id: beat.id,
    text: beat.text,
    start: resolved.start,
    cueWordIndex: resolved.cueWordIndex!,
    cueText: resolved.cueText,
    sourceRefs: [...(beat.sourceRefs ?? [])],
    ...(beat.workflowStep === undefined ? {} : { workflowStep: beat.workflowStep }),
    tolerance: {
      maxLead: beat.tolerance?.maxLead ?? defaults.maxLead,
      maxLag: beat.tolerance?.maxLag ?? defaults.maxLag,
    },
  };
}

function resolveCoverageEnd(
  until: VisualCoverageEnd | undefined,
  defaultEnd: number,
  frame: PlanFrame,
  path: string,
): number {
  if (until === undefined || until === "next-state") return defaultEnd;
  if (until === "voice-end") return frame.voiceDur;
  if (until === "frame-end") return frame.frameDur;
  return resolveCueV2(until.cue, frame, `${path}.cue`).start;
}

function resolveV2Beats(
  beats: readonly AuthoredVisualBeatV2[],
  frame: PlanFrame,
  defaults: ResolvedVisualSyncPolicy,
  path: string,
): ResolvedVisualStateV2[] {
  const starts = beats.map((beat, index) => ({
    beat,
    resolved: resolveCueV2(beat.cue, frame, `${path}.beats[${index}].cue`),
    index,
  })).sort((left, right) => left.resolved.start - right.resolved.start || left.index - right.index);

  return starts.map(({ beat, resolved, index: sourceIndex }, index) => {
    const defaultEnd = starts[index + 1]?.resolved.start ?? frame.frameDur;
    const end = resolveCoverageEnd(
      beat.coverage?.until,
      defaultEnd,
      frame,
      `${path}.beats[${sourceIndex}].coverage.until`,
    );
    if (!Number.isFinite(end) || end < resolved.start || end > frame.frameDur) {
      fail(
        `${path}.beats[${sourceIndex}]`,
        `resolves to invalid interval ${resolved.start.toFixed(3)}s-${end.toFixed(3)}s within frame ${frame.frameDur.toFixed(3)}s`,
      );
    }
    return {
      version: 2,
      id: beat.id,
      text: beat.text,
      role: beat.role,
      start: resolved.start,
      end,
      ...(resolved.cueWordIndex === undefined ? {} : { cueWordIndex: resolved.cueWordIndex }),
      cueText: resolved.cueText,
      sourceRefs: [...(beat.sourceRefs ?? [])],
      ...(beat.workflowStep === undefined ? {} : { workflowStep: beat.workflowStep }),
      tolerance: {
        maxLead: beat.tolerance?.maxLead ?? defaults.maxLead,
        maxLag: beat.tolerance?.maxLag ?? defaults.maxLag,
      },
    };
  });
}

function resolveCoverageExemptions(
  exemptions: readonly AuthoredCoverageExemption[] | undefined,
  frame: PlanFrame,
  path: string,
): ResolvedCoverageExemption[] {
  return (exemptions ?? []).map((exemption, index) => {
    const start = resolveCueV2(
      exemption.from,
      frame,
      `${path}.coverageExemptions[${index}].from`,
    ).start;
    const end = resolveCoverageEnd(
      exemption.until,
      frame.frameDur,
      frame,
      `${path}.coverageExemptions[${index}].until`,
    );
    if (!Number.isFinite(end) || end < start || end > frame.frameDur) {
      fail(
        `${path}.coverageExemptions[${index}]`,
        `resolves to invalid interval ${start.toFixed(3)}s-${end.toFixed(3)}s within frame ${frame.frameDur.toFixed(3)}s`,
      );
    }
    return {
      id: exemption.id,
      start,
      end,
      reason: exemption.reason,
      approvedBy: exemption.approvedBy,
    };
  });
}

function validateWorkflowOrder(beats: readonly ResolvedVisualBeat[], path: string): void {
  const workflowBeats = beats.filter((beat) => beat.workflowStep !== undefined)
    .sort((left, right) => left.workflowStep! - right.workflowStep!);
  for (let index = 1; index < workflowBeats.length; index++) {
    const previous = workflowBeats[index - 1];
    const current = workflowBeats[index];
    if (current.start < previous.start) {
      fail(
        path,
        `workflow cue times are not monotonic: step ${current.workflowStep} starts before step ${previous.workflowStep}`,
      );
    }
  }
}

interface ResolvedVisualFrame {
  visualSpecVersion: 1 | 2;
  visualKind?: AuthoredVisualFrameV1["kind"];
  visualBeats: ResolvedVisualBeat[];
  visualCoverageExemptions?: ResolvedCoverageExemption[];
}

export function resolveVisualBeats(
  spec: VisualBeatSpec,
  frames: readonly PlanFrame[],
  defaults: ResolvedVisualSyncPolicy,
  path = "visual_beats.json",
): Map<string, ResolvedVisualFrame> {
  const validatedSpec = validateVisualBeatSpec(spec, path);
  const bySlug = new Map(frames.map((frame) => [frame.slug, frame]));
  const resolved = new Map<string, ResolvedVisualFrame>();

  for (const [slug, authored] of Object.entries(validatedSpec.frames)) {
    const frame = bySlug.get(slug);
    if (frame === undefined) {
      const availableSlugs = [...bySlug.keys()].sort().map((availableSlug) => JSON.stringify(availableSlug));
      fail(
        `${path}.frames.${slug}`,
        `unknown frame slug ${JSON.stringify(slug)}; available frame slugs: ${availableSlugs.join(", ") || "none"}`,
      );
    }

    if (validatedSpec.version === 1) {
      const v1Authored = authored as AuthoredVisualFrameV1;
      const visualBeats = v1Authored.beats.map((beat, index) =>
        resolveBeat(beat, frame, defaults, `${path}.frames.${slug}.beats[${index}]`),
      );
      validateWorkflowOrder(visualBeats, `${path}.frames.${slug}`);
      resolved.set(slug, {
        visualSpecVersion: 1,
        ...(v1Authored.kind === undefined ? {} : { visualKind: v1Authored.kind }),
        visualBeats,
      });
      continue;
    }

    const v2Authored = authored as AuthoredVisualFrameV2;
    const visualBeats = resolveV2Beats(
      v2Authored.beats,
      frame,
      defaults,
      `${path}.frames.${slug}`,
    );
    validateWorkflowOrder(visualBeats, `${path}.frames.${slug}`);
    const visualCoverageExemptions = resolveCoverageExemptions(
      v2Authored.coverageExemptions,
      frame,
      `${path}.frames.${slug}`,
    );
    resolved.set(slug, {
      visualSpecVersion: 2,
      ...(v2Authored.kind === undefined ? {} : { visualKind: v2Authored.kind }),
      visualBeats,
      ...(visualCoverageExemptions.length === 0 ? {} : { visualCoverageExemptions }),
    });
  }

  return resolved;
}
