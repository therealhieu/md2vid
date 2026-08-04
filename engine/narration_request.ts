import { createHash } from "node:crypto";

export type NarrationProvider = "kokoro" | "heygen" | "elevenlabs";

export const DEFAULT_NARRATION_POLICY = Object.freeze({
  provider: "kokoro",
  voice: "am_michael",
  lang: "en",
  speed: 0.9,
} as const);

export interface NarrationLine {
  id: string;
  text: string;
}

export interface NarrationRequest {
  version?: 1;
  provider?: NarrationProvider;
  voice?: string;
  lang?: string;
  speed?: number;
  lines: NarrationLine[];
  bgm?: Record<string, unknown>;
  [extension: string]: unknown;
}

export interface VersionedNarrationRequest extends NarrationRequest {
  version: 1;
  provider: NarrationProvider;
  voice: string;
  lang: string;
  speed: number;
}

export interface NarrationSentenceApproval {
  lineId: string;
  sentenceIndex: number;
}

export type NarrationFindingCode =
  | "missing-terminal-punctuation"
  | "sentence-too-long"
  | "sentence-above-target"
  | "comma-chain"
  | "conjunction-chain";

export interface NarrationFinding {
  severity: "error" | "warning";
  code: NarrationFindingCode;
  lineId: string;
  sentenceIndex: number;
  wordCount: number;
  startOffset: number;
  endOffset: number;
  excerpt: string;
  guidance: string;
}

export interface NarrationAnalysis {
  lineCount: number;
  sentenceCount: number;
  findings: NarrationFinding[];
  appliedApprovals: NarrationSentenceApproval[];
}

type JsonRecord = Record<string, unknown>;

interface Span {
  start: number;
  end: number;
}

interface Sentence {
  text: string;
  scanText: string;
  startOffset: number;
  endOffset: number;
  terminated: boolean;
}

interface NormalizedScanView {
  source: string;
  text: string;
  originalOffsetAt: number[];
}

const PROVIDERS = new Set<NarrationProvider>(["kokoro", "heygen", "elevenlabs"]);
const KOKORO_LANGUAGE_PREFIXES = new Map<string, ReadonlySet<string>>([
  ["en", new Set(["a", "b"])],
  ["es", new Set(["e"])],
  ["fr", new Set(["f"])],
  ["hi", new Set(["h"])],
  ["it", new Set(["i"])],
  ["ja", new Set(["j"])],
  ["pt", new Set(["p"])],
  ["zh", new Set(["z"])],
]);
const GRAPHEMES = new Intl.Segmenter("und", { granularity: "grapheme" });
const URL_PATTERN = /https?:\/\/[^\s]+/gu;
const DOMAIN_PATTERN = /\b(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?:\/[^\s]*)?/giu;
const PROTECTED_PATTERNS = [
  /`[^`\n]+`/gu,
  URL_PATTERN,
  DOMAIN_PATTERN,
  /\b\d+(?:\.\d+)+\b/gu,
  /\b(?:e\.g|i\.e|mr|mrs|ms|dr|vs|etc)\./giu,
];
const WORD = /[\p{L}\p{N}\p{M}]+(?:['’\-][\p{L}\p{N}\p{M}]+)*/gu;
const COORDINATORS = new Set(["and", "or", "but", "then"]);
const TARGET_MAX_WORDS = 14;
const HARD_MAX_WORDS = 18;
const COMMA_CHAIN_MINIMUM = 3;
const CONJUNCTION_CHAIN_MINIMUM = 3;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(path, "must be a non-empty string");
  }
  return value;
}

function validateOwnedProviderCompatibility(
  provider: NarrationProvider,
  voice: string,
  lang: string,
  path: string,
): void {
  if (provider !== "kokoro") return;
  const primaryLanguage = lang.toLowerCase().split(/[-_]/u, 1)[0];
  const compatiblePrefixes = KOKORO_LANGUAGE_PREFIXES.get(primaryLanguage);
  const documentedPrefix = /^([a-z])[fm]_/u.exec(voice.toLowerCase())?.[1];
  if (compatiblePrefixes !== undefined && documentedPrefix !== undefined && !compatiblePrefixes.has(documentedPrefix)) {
    fail(`${path}.voice`, `${JSON.stringify(voice)} is incompatible with lang ${JSON.stringify(lang)}`);
  }
  if (primaryLanguage !== "en" && voice.toLowerCase() === "am_michael") {
    fail(`${path}.voice`, "am_michael is an English voice and cannot be the non-English default");
  }
}

export function validateNarrationRequest(value: unknown, path: string): NarrationRequest {
  if (!isRecord(value)) fail(path, "expected an object");
  if (!Array.isArray(value.lines) || value.lines.length === 0) fail(`${path}.lines`, "must be a non-empty array");

  const seen = new Map<string, string>();
  const lines = value.lines.map((raw, index) => {
    const linePath = `${path}.lines[${index}]`;
    if (!isRecord(raw)) fail(linePath, "must be an object");
    const id = nonEmptyString(raw.id, `${linePath}.id`);
    const text = nonEmptyString(raw.text, `${linePath}.text`);
    const first = seen.get(id);
    if (first !== undefined) {
      fail(`${linePath}.id`, `duplicate line id ${JSON.stringify(id)}; first declared at ${first}`);
    }
    seen.set(id, `${linePath}.id`);
    return { ...raw, id, text } as NarrationLine;
  });

  if (value.version !== undefined && value.version !== 1) fail(`${path}.version`, "expected 1");
  if (value.provider !== undefined && (typeof value.provider !== "string" || !PROVIDERS.has(value.provider as NarrationProvider))) {
    fail(`${path}.provider`, 'must be one of "kokoro", "heygen", or "elevenlabs"');
  }
  if (value.voice !== undefined) nonEmptyString(value.voice, `${path}.voice`);
  if (value.lang !== undefined) nonEmptyString(value.lang, `${path}.lang`);
  if (value.speed !== undefined && (typeof value.speed !== "number" || !Number.isFinite(value.speed) || value.speed < 0.7 || value.speed > 1.2)) {
    fail(`${path}.speed`, "must be a finite number between 0.7 and 1.2");
  }
  return { ...value, lines } as NarrationRequest;
}

export function validateVersionedNarrationRequest(value: unknown, path: string): VersionedNarrationRequest {
  const request = validateNarrationRequest(value, path);
  if (request.version !== 1) fail(`${path}.version`, "expected 1");
  if (request.provider === undefined) fail(`${path}.provider`, "is required");
  const voice = nonEmptyString(request.voice, `${path}.voice`);
  const lang = nonEmptyString(request.lang, `${path}.lang`);
  if (request.speed === undefined) fail(`${path}.speed`, "is required");
  validateOwnedProviderCompatibility(request.provider, voice, lang, path);
  return {
    ...request,
    version: 1,
    provider: request.provider,
    voice,
    lang,
    speed: request.speed,
  };
}

function normalizedScanView(source: string): NormalizedScanView {
  let text = "";
  const originalOffsetAt = [0];
  for (const { segment, index } of GRAPHEMES.segment(source)) {
    const normalized = segment.normalize("NFKC");
    text += normalized;
    if (normalized.length === 0) {
      originalOffsetAt[originalOffsetAt.length - 1] = index + segment.length;
      continue;
    }
    for (let offset = 0; offset < normalized.length; offset++) {
      originalOffsetAt.push(offset === normalized.length - 1 ? index + segment.length : index);
    }
  }
  return { source, text, originalOffsetAt };
}

function protectedSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const pattern of PROTECTED_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const start = match.index!;
      let end = start + match[0].length;
      if (pattern === URL_PATTERN || pattern === DOMAIN_PATTERN) {
        while (end > start && /["'’”\])}]/u.test(text[end - 1])) end--;
        while (end > start && /[.,!?;:]/u.test(text[end - 1])) end--;
      }
      if (end > start) spans.push({ start, end });
    }
  }
  return spans.sort((left, right) => left.start - right.start || left.end - right.end);
}

function mergedProtectedSpans(text: string): Span[] {
  const merged: Span[] = [];
  for (const span of protectedSpans(text)) {
    const previous = merged.at(-1);
    if (previous !== undefined && span.start <= previous.end) {
      previous.end = Math.max(previous.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

function paragraphBreakEnd(text: string, index: number): number | undefined {
  const match = /^(?:(?:\r\n)|\n){2,}/u.exec(text.slice(index));
  return match === null ? undefined : index + match[0].length;
}

function segmentSentences(source: string): Sentence[] {
  const view = normalizedScanView(source);
  const spans = mergedProtectedSpans(view.text);
  const sentences: Sentence[] = [];
  let start = 0;
  let spanIndex = 0;

  const protectedAtCurrentIndex = (index: number): boolean => {
    while (spanIndex < spans.length && spans[spanIndex]!.end <= index) spanIndex++;
    const span = spans[spanIndex];
    return span !== undefined && span.start <= index;
  };

  const push = (end: number, terminated: boolean) => {
    const raw = view.text.slice(start, end);
    const leading = raw.search(/\S/u);
    if (leading >= 0) {
      const trailing = raw.length - raw.trimEnd().length;
      const normalizedStart = start + leading;
      const normalizedEnd = end - trailing;
      const sourceStart = view.originalOffsetAt[normalizedStart]!;
      const sourceEnd = view.originalOffsetAt[normalizedEnd]!;
      sentences.push({
        text: view.source.slice(sourceStart, sourceEnd),
        scanText: view.text.slice(normalizedStart, normalizedEnd),
        startOffset: sourceStart,
        endOffset: sourceEnd,
        terminated,
      });
    }
    start = end;
  };

  for (let index = 0; index < view.text.length; index++) {
    const paragraphEnd = paragraphBreakEnd(view.text, index);
    if (paragraphEnd !== undefined) {
      push(index, true);
      start = paragraphEnd;
      index = paragraphEnd - 1;
      continue;
    }
    if (!".?!".includes(view.text[index]!) || protectedAtCurrentIndex(index)) continue;
    let end = index + 1;
    while (end < view.text.length && /["'’”\])}]/u.test(view.text[end]!)) end++;
    if (end === view.text.length || /\s/u.test(view.text[end]!)) {
      push(end, true);
      index = end - 1;
    }
  }
  push(view.text.length, false);
  return sentences;
}

function lexicalWords(scanText: string): string[] {
  const words: string[] = [];
  let cursor = 0;
  for (const span of mergedProtectedSpans(scanText)) {
    WORD.lastIndex = 0;
    words.push(...[...scanText.slice(cursor, span.start).matchAll(WORD)].map((match) => match[0]));
    words.push(scanText.slice(span.start, span.end));
    cursor = span.end;
  }
  WORD.lastIndex = 0;
  words.push(...[...scanText.slice(cursor).matchAll(WORD)].map((match) => match[0]));
  return words;
}

function boundedExcerpt(text: string): string {
  const oneLine = text.replace(/\s+/gu, " ").trim();
  return oneLine.length <= 160 ? oneLine : `${oneLine.slice(0, 157)}...`;
}

function finding(
  severity: NarrationFinding["severity"],
  code: NarrationFindingCode,
  lineId: string,
  sentenceIndex: number,
  wordCount: number,
  sentence: Sentence,
): NarrationFinding {
  const guidanceByCode: Record<NarrationFindingCode, string> = {
    "missing-terminal-punctuation": "End the spoken sentence with a period, question mark, or exclamation point.",
    "sentence-too-long": "Split the sentence at a conceptual boundary; target 6–14 words, maximum 18.",
    "sentence-above-target": "Review this sentence for a stronger conceptual pause; target 6–14 words.",
    "comma-chain": "Split comma-chained operations into separate spoken sentences.",
    "conjunction-chain": "Split conjunction-chained operations into separate spoken sentences.",
  };
  return {
    severity,
    code,
    lineId,
    sentenceIndex,
    wordCount,
    startOffset: sentence.startOffset,
    endOffset: sentence.endOffset,
    excerpt: boundedExcerpt(sentence.text),
    guidance: guidanceByCode[code],
  };
}

function approvalKey(approval: NarrationSentenceApproval): string {
  return `${approval.lineId} ${approval.sentenceIndex}`;
}

export function analyzeNarrationRequest(
  request: NarrationRequest,
  approvals: readonly NarrationSentenceApproval[] = [],
): NarrationAnalysis {
  const sentencesByLine = request.lines.map((line) => ({ line, sentences: segmentSentences(line.text) }));
  const available = new Set<string>();
  for (const { line, sentences } of sentencesByLine) {
    for (const [sentenceIndex] of sentences.entries()) {
      available.add(approvalKey({ lineId: line.id, sentenceIndex }));
    }
  }

  const approvalSet = new Set<string>();
  for (const approval of approvals) {
    if (!available.has(approvalKey(approval))) {
      throw new Error("audio_request.json: approval references unknown line or sentence");
    }
    approvalSet.add(approvalKey(approval));
  }

  const findings: NarrationFinding[] = [];
  const appliedApprovals: NarrationSentenceApproval[] = [];
  for (const { line, sentences } of sentencesByLine) {
    for (const [sentenceIndex, sentence] of sentences.entries()) {
      const words = lexicalWords(sentence.scanText);
      const wordCount = words.length;
      const approved = approvalSet.has(approvalKey({ lineId: line.id, sentenceIndex }));
      if (approved) appliedApprovals.push({ lineId: line.id, sentenceIndex });

      if (!sentence.terminated) {
        findings.push(finding("error", "missing-terminal-punctuation", line.id, sentenceIndex, wordCount, sentence));
      }
      if (wordCount > HARD_MAX_WORDS && !approved) {
        findings.push(finding("error", "sentence-too-long", line.id, sentenceIndex, wordCount, sentence));
      } else if (wordCount > TARGET_MAX_WORDS) {
        findings.push(finding("warning", "sentence-above-target", line.id, sentenceIndex, wordCount, sentence));
      }
      const commaCount = [...sentence.scanText.matchAll(/,/gu)].length;
      if (commaCount >= COMMA_CHAIN_MINIMUM) {
        findings.push(finding("warning", "comma-chain", line.id, sentenceIndex, wordCount, sentence));
      }
      const conjunctionCount = words.filter((word) => COORDINATORS.has(word.normalize("NFKC").toLowerCase())).length;
      if (conjunctionCount >= CONJUNCTION_CHAIN_MINIMUM) {
        findings.push(finding("warning", "conjunction-chain", line.id, sentenceIndex, wordCount, sentence));
      }
    }
  }

  return {
    lineCount: request.lines.length,
    sentenceCount: sentencesByLine.reduce((total, entry) => total + entry.sentences.length, 0),
    findings,
    appliedApprovals,
  };
}

export function canonicalizeNarrationRequest(request: VersionedNarrationRequest): string {
  return JSON.stringify({
    version: request.version,
    provider: request.provider,
    voice: request.voice,
    lang: request.lang,
    speed: request.speed,
    lines: request.lines.map(({ id, text }) => ({ id, text })),
  });
}

export function narrationRequestSha256(request: VersionedNarrationRequest): string {
  return createHash("sha256").update(canonicalizeNarrationRequest(request), "utf8").digest("hex");
}
