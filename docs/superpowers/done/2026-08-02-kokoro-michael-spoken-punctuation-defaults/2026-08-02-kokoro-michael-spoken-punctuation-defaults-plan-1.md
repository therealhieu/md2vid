# Part 1 — Narration Contract, Evidence Model, and Check CLI

Depends on: the external prerequisite gate in `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan.md`. Complete this part before `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-2.md`.

- [ ] **Task 1: Add versioned narration request parsing, spoken-sentence analysis, and canonical hashing** `[Group: narration-contract]` `[Tester: yes]`

**Files:**
- Create: `engine/narration_request.ts`
- Create: `engine/__tests__/narration_request.test.ts`

- [ ] **Step 1: Write failing request and sentence-policy tests**

Create `engine/__tests__/narration_request.test.ts` with exact defaults and representative hard cases:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_NARRATION_POLICY,
  analyzeNarrationRequest,
  canonicalizeNarrationRequest,
  narrationRequestSha256,
  validateNarrationRequest,
  validateVersionedNarrationRequest,
} from "../narration_request.ts";

const REQUEST = {
  version: 1,
  provider: "kokoro",
  voice: "am_michael",
  lang: "en",
  speed: 0.9,
  lines: [
    { id: "intro", text: "Introduce the topic." },
    { id: "recap", text: "Recap the key idea." },
  ],
} as const;

test("exports the frozen md2vid English narration defaults", () => {
  assert.deepEqual(DEFAULT_NARRATION_POLICY, {
    provider: "kokoro",
    voice: "am_michael",
    lang: "en",
    speed: 0.9,
  });
  assert.equal(Object.isFrozen(DEFAULT_NARRATION_POLICY), true);
});

test("accepts the exact versioned default request", () => {
  assert.deepEqual(
    validateVersionedNarrationRequest(REQUEST, "audio_request.json"),
    REQUEST,
  );
});

test("legacy parsing preserves an unversioned lines-only request", () => {
  const value = { lines: [{ id: "intro", text: "Hello." }] };
  assert.deepEqual(validateNarrationRequest(value, "audio_request.json"), value);
  assert.throws(
    () => validateVersionedNarrationRequest(value, "audio_request.json"),
    /audio_request\.json\.version.*expected 1/,
  );
});

test("reports 15-18 words as warnings and 19 words as an error", () => {
  const warningText = "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen.";
  const errorText = "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen.";
  const analyzed = analyzeNarrationRequest({
    ...REQUEST,
    lines: [
      { id: "warning", text: warningText },
      { id: "error", text: errorText },
    ],
  });
  assert.deepEqual(
    analyzed.findings.map(({ lineId, severity, code, wordCount }) => ({ lineId, severity, code, wordCount })),
    [
      { lineId: "warning", severity: "warning", code: "sentence-above-target", wordCount: 15 },
      { lineId: "error", severity: "error", code: "sentence-too-long", wordCount: 19 },
    ],
  );
});

test("commas do not reset the hard sentence count", () => {
  const analysis = analyzeNarrationRequest({
    ...REQUEST,
    lines: [{
      id: "flow",
      text: "Lock the wallet, select grants, append postings, update projections, and commit the reservation safely now.",
    }],
  });
  assert.ok(analysis.findings.some((finding) => finding.code === "comma-chain"));
  assert.equal(analysis.sentenceCount, 1);
});

for (const [name, separator] of [["LF", "\n\n"], ["CRLF", "\r\n\r\n"]] as const) {
  test(`${name} paragraphs form strong boundaries`, () => {
    const analysis = analyzeNarrationRequest({
      ...REQUEST,
      lines: [{ id: "flow", text: `Lock the wallet.${separator}Select eligible grants.` }],
    });
    assert.equal(analysis.sentenceCount, 2);
    assert.deepEqual(analysis.findings, []);
  });
}

test("an exact approval suppresses only sentence-too-long", () => {
  const request = {
    ...REQUEST,
    lines: [{
      id: "approved:line",
      text: "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen.",
    }],
  };
  const analysis = analyzeNarrationRequest(request, [{ lineId: "approved:line", sentenceIndex: 0 }]);
  assert.equal(analysis.findings.some((finding) => finding.code === "sentence-too-long"), false);
  assert.deepEqual(analysis.appliedApprovals, [{ lineId: "approved:line", sentenceIndex: 0 }]);
});

test("canonical hashing ignores JSON formatting and media-only extensions", () => {
  const left = validateVersionedNarrationRequest({ ...REQUEST, bgm: { mode: "none" } }, "left.json");
  const right = validateVersionedNarrationRequest({ sfx: [], lines: REQUEST.lines, speed: 0.9, lang: "en", voice: "am_michael", provider: "kokoro", version: 1 }, "right.json");
  assert.equal(canonicalizeNarrationRequest(left), canonicalizeNarrationRequest(right));
  assert.equal(narrationRequestSha256(left), narrationRequestSha256(right));
});

test("canonical hashing changes for exact spoken text and line order", () => {
  const base = validateVersionedNarrationRequest(REQUEST, "base.json");
  const changedText = validateVersionedNarrationRequest({
    ...REQUEST,
    lines: [{ id: "intro", text: "Introduce this topic." }, REQUEST.lines[1]],
  }, "text.json");
  const changedOrder = validateVersionedNarrationRequest({ ...REQUEST, lines: [...REQUEST.lines].reverse() }, "order.json");
  assert.notEqual(narrationRequestSha256(base), narrationRequestSha256(changedText));
  assert.notEqual(narrationRequestSha256(base), narrationRequestSha256(changedOrder));
});
```

Add table-driven cases for:

```ts
const malformed = [
  [{ ...REQUEST, version: 2 }, /version.*expected 1/],
  [{ ...REQUEST, provider: "auto" }, /provider.*kokoro.*heygen.*elevenlabs/],
  [{ ...REQUEST, voice: "" }, /voice.*non-empty/],
  [{ ...REQUEST, lang: "" }, /lang.*non-empty/],
  [{ ...REQUEST, speed: 0.69 }, /speed.*0\.7.*1\.2/],
  [{ ...REQUEST, speed: 1.21 }, /speed.*0\.7.*1\.2/],
  [{ ...REQUEST, lines: [{ id: "", text: "Hello." }] }, /lines\[0\]\.id/],
  [{ ...REQUEST, lines: [{ id: "x", text: "Hello." }, { id: "x", text: "Again." }] }, /duplicate line id "x"/],
  [{ ...REQUEST, lines: [{ id: "x", text: "" }] }, /lines\[0\]\.text/],
] as const;

for (const [value, expected] of malformed) {
  test(`rejects malformed request matching ${expected}`, () => {
    assert.throws(() => validateVersionedNarrationRequest(value, "audio_request.json"), expected);
  });
}
```

Add these scanner and compatibility cases; protected values count as one lexical token and sentence-final punctuation after a URL remains a boundary:

```ts
test("masks protected lexical values as one word each", () => {
  const analysis = analyzeNarrationRequest({
    ...REQUEST,
    lines: [{
      id: "protected",
      text: "Use PostgreSQL 18.1, then retry api.example.com after checking https://example.com/v1.2 with `safe mode now` before deployment completes today.",
    }],
  });
  assert.deepEqual(
    analysis.findings.map(({ code, wordCount }) => ({ code, wordCount })),
    [{ code: "sentence-above-target", wordCount: 15 }],
  );
});

test("keeps URL punctuation, abbreviations, quotes, and brackets deterministic", () => {
  const analysis = analyzeNarrationRequest({
    ...REQUEST,
    lines: [{
      id: "boundaries",
      text: "Review https://example.com/v1.2. Then retry, e.g. after `commit.now`, and confirm (it works).",
    }],
  });
  assert.equal(analysis.sentenceCount, 2);
  assert.equal(analysis.findings.some((finding) => finding.code === "missing-terminal-punctuation"), false);
});

test("normalizes punctuation before segmentation while retaining original offsets", () => {
  const terminated = "Ｕｓｅ the operator's fail-safe path．";
  const valid = analyzeNarrationRequest({ ...REQUEST, lines: [{ id: "unicode", text: terminated }] });
  assert.equal(valid.findings.some((finding) => finding.code === "missing-terminal-punctuation"), false);

  const unterminated = "Use the ﬁnal fail-safe path without terminal punctuation";
  const invalid = analyzeNarrationRequest({ ...REQUEST, lines: [{ id: "offsets", text: unterminated }] });
  const finding = invalid.findings.find((candidate) => candidate.code === "missing-terminal-punctuation");
  assert.ok(finding);
  assert.equal(finding.startOffset, 0);
  assert.equal(finding.endOffset, unterminated.length);
  assert.equal(finding.excerpt, unterminated);

  const multiSentence = "The ﬁrst sentence ends． Second ﬁnal sentence lacks punctuation";
  const ranged = analyzeNarrationRequest({ ...REQUEST, lines: [{ id: "range", text: multiSentence }] });
  const second = ranged.findings.find((candidate) => candidate.code === "missing-terminal-punctuation");
  const expectedStart = multiSentence.indexOf("Second");
  assert.ok(second);
  assert.equal(second.startOffset, expectedStart);
  assert.equal(second.endOffset, multiSentence.length);
  assert.equal(second.excerpt, multiSentence.slice(expectedStart));
});

test("bounds long diagnostic excerpts", () => {
  const text = `${"word ".repeat(80).trim()}`;
  const analysis = analyzeNarrationRequest({ ...REQUEST, lines: [{ id: "bounded", text }] });
  assert.ok(analysis.findings.every((finding) => finding.excerpt.length <= 160));
});

test("flags three coordinating conjunctions in one spoken sentence", () => {
  const analysis = analyzeNarrationRequest({
    ...REQUEST,
    lines: [{ id: "conjunctions", text: "Reserve funds and append entries and update balances and publish the event." }],
  });
  assert.ok(analysis.findings.some((finding) => finding.code === "conjunction-chain"));
});

for (const [name, patch, expected] of [
  ["English Kokoro rejects an obvious Chinese voice", { provider: "kokoro", voice: "zf_xiaobei", lang: "en" }, /voice.*zf_xiaobei.*lang.*en/i],
  ["non-English Kokoro rejects Michael", { provider: "kokoro", voice: "am_michael", lang: "zh" }, /am_michael.*non-English|voice.*lang/i],
] as const) {
  test(name, () => {
    assert.throws(() => validateVersionedNarrationRequest({ ...REQUEST, ...patch }, "audio_request.json"), expected);
  });
}

test("accepts explicit compatible non-English and provider-owned cloud voices", () => {
  assert.doesNotThrow(() => validateVersionedNarrationRequest({ ...REQUEST, voice: "zf_xiaobei", lang: "zh" }, "zh.json"));
  assert.doesNotThrow(() => validateVersionedNarrationRequest({ ...REQUEST, provider: "heygen", voice: "starfish-voice-id" }, "cloud.json"));
});
```

- [ ] **Step 2: Run the request tests and confirm RED**

Run:

```bash
node --test engine/__tests__/narration_request.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `engine/narration_request.ts`.

- [ ] **Step 3: Implement request contracts and strict/legacy validators**

Create `engine/narration_request.ts` with these public types and defaults:

```ts
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
```

Use file-local validation helpers matching `engine/visual_beats.ts`:

```ts
type JsonRecord = Record<string, unknown>;
const PROVIDERS = new Set<NarrationProvider>(["kokoro", "heygen", "elevenlabs"]);

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
```

This validates only md2vid-owned obvious Kokoro prefix compatibility. Cloud-provider catalogs and unknown/custom voice IDs remain the media layer's responsibility.

Implement two validators:

```ts
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
    if (first !== undefined) fail(`${linePath}.id`, `duplicate line id ${JSON.stringify(id)}; first declared at ${first}`);
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
  return { ...request, version: 1, provider: request.provider, voice, lang, speed: request.speed };
}
```

- [ ] **Step 4: Implement deterministic sentence segmentation and findings**

Protect spans before scanning terminal punctuation:

```ts
interface Span { start: number; end: number }
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

const GRAPHEMES = new Intl.Segmenter("und", { granularity: "grapheme" });

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

const URL_PATTERN = /https?:\/\/[^\s]+/gu;
const DOMAIN_PATTERN = /\b(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?:\/[^\s]*)?/giu;
const PROTECTED_PATTERNS = [
  /`[^`\n]+`/gu,
  URL_PATTERN,
  DOMAIN_PATTERN,
  /\b\d+(?:\.\d+)+\b/gu,
  /\b(?:e\.g|i\.e|mr|mrs|ms|dr|vs|etc)\./giu,
];

function protectedSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const pattern of PROTECTED_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      let end = match.index! + match[0].length;
      if (pattern === URL_PATTERN || pattern === DOMAIN_PATTERN) {
        while (end > match.index! && /["'’”\])}]/u.test(text[end - 1])) end--;
        while (end > match.index! && /[.,!?;:]/u.test(text[end - 1])) end--;
      }
      if (end > match.index!) spans.push({ start: match.index!, end });
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

function protectedAt(spans: readonly Span[], index: number): boolean {
  return spans.some((span) => span.start <= index && index < span.end);
}
```

Segment without rewriting source text:

```ts
function paragraphBreakEnd(text: string, index: number): number | undefined {
  const match = /^(?:(?:\r\n)|\n){2,}/u.exec(text.slice(index));
  return match === null ? undefined : index + match[0].length;
}

function segmentSentences(source: string): Sentence[] {
  const view = normalizedScanView(source);
  const spans = protectedSpans(view.text);
  const sentences: Sentence[] = [];
  let start = 0;

  const push = (end: number, terminated: boolean) => {
    const raw = view.text.slice(start, end);
    const leading = raw.search(/\S/u);
    if (leading >= 0) {
      const trailing = raw.length - raw.trimEnd().length;
      const normalizedStart = start + leading;
      const normalizedEnd = end - trailing;
      const sourceStart = view.originalOffsetAt[normalizedStart];
      const sourceEnd = view.originalOffsetAt[normalizedEnd];
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
    if (!".?!".includes(view.text[index]) || protectedAt(spans, index)) continue;
    let end = index + 1;
    while (end < view.text.length && /["'’”\])}]/u.test(view.text[end])) end++;
    if (end === view.text.length || /\s/u.test(view.text[end])) {
      push(end, true);
      index = end - 1;
    }
  }
  push(view.text.length, false);
  return sentences;
}
```

Count lexical words and emit deterministic findings:

```ts
const WORD = /[\p{L}\p{N}\p{M}]+(?:['’\-][\p{L}\p{N}\p{M}]+)*/gu;
const COORDINATORS = new Set(["and", "or", "but", "then"]);

function lexicalWords(scanText: string): string[] {
  const words: string[] = [];
  let cursor = 0;
  for (const span of mergedProtectedSpans(scanText)) {
    words.push(...[...scanText.slice(cursor, span.start).matchAll(WORD)].map((match) => match[0]));
    words.push(scanText.slice(span.start, span.end));
    cursor = span.end;
  }
  words.push(...[...scanText.slice(cursor).matchAll(WORD)].map((match) => match[0]));
  return words;
}

function boundedExcerpt(text: string): string {
  const oneLine = text.replace(/\s+/gu, " ").trim();
  return oneLine.length <= 160 ? oneLine : `${oneLine.slice(0, 157)}...`;
}
```

Implement `analyzeNarrationRequest()` with finding order:

```text
line order → sentence order →
missing-terminal-punctuation → sentence-too-long/sentence-above-target → comma-chain → conjunction-chain
```

Use these exact thresholds:

```ts
const TARGET_MAX_WORDS = 14;
const HARD_MAX_WORDS = 18;
const COMMA_CHAIN_MINIMUM = 3;
const CONJUNCTION_CHAIN_MINIMUM = 3;
```

`analyzeNarrationRequest()` must count and classify punctuation from `sentence.scanText`, while diagnostics use `sentence.text`, `startOffset`, and `endOffset` from the original authored source. Never report normalized offsets or normalized excerpts.

An approval suppresses only `sentence-too-long` for the exact `{lineId, sentenceIndex}`. Reject unmatched approvals by throwing `audio_request.json: approval references unknown line or sentence`.

- [ ] **Step 5: Implement canonical serialization and SHA-256**

```ts
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
```

Do not normalize or trim spoken text before hashing.

- [ ] **Step 6: Run focused tests**

```bash
node --test engine/__tests__/narration_request.test.ts
corepack npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add engine/narration_request.ts engine/__tests__/narration_request.test.ts
git commit -m "feat(engine): add narration request policy"
```

---

- [ ] **Task 2: Add request-to-WAV narration evidence and freshness diagnostics** `[Group: narration-contract]` `[Tester: yes]`

**Files:**
- Create: `engine/narration_evidence.ts`
- Create: `engine/__tests__/narration_evidence.test.ts`
- Reuse: `engine/voice_assets.ts`

- [ ] **Step 1: Write failing evidence tests with real WAV snapshots**

Create `engine/__tests__/narration_evidence.test.ts` using the existing RIFF helper pattern from `engine/__tests__/voice_assets.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateVersionedNarrationRequest } from "../narration_request.ts";
import {
  createNarrationEvidence,
  validateNarrationEvidence,
  verifyNarrationEvidence,
} from "../narration_evidence.ts";
import { captureVoiceWavSnapshots } from "../voice_assets.ts";

function wav(sampleFrames = 48_000, sampleRate = 48_000): Buffer {
  const channels = 1;
  const bits = 16;
  const blockAlign = channels * bits / 8;
  const dataBytes = sampleFrames * blockAlign;
  const out = Buffer.alloc(44 + dataBytes);
  out.write("RIFF", 0); out.writeUInt32LE(36 + dataBytes, 4); out.write("WAVE", 8);
  out.write("fmt ", 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
  out.writeUInt16LE(channels, 22); out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * blockAlign, 28); out.writeUInt16LE(blockAlign, 32);
  out.writeUInt16LE(bits, 34); out.write("data", 36); out.writeUInt32LE(dataBytes, 40);
  return out;
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "md2vid-narration-evidence-"));
  mkdirSync(join(root, "assets/voice"), { recursive: true });
  writeFileSync(join(root, "assets/voice/intro.wav"), wav());
  const request = validateVersionedNarrationRequest({
    version: 1,
    provider: "kokoro",
    voice: "am_michael",
    lang: "en",
    speed: 0.9,
    lines: [{ id: "intro", text: "Introduce the topic." }],
  }, "audio_request.json");
  const meta = {
    tts_provider: "kokoro",
    voice_id: "am_michael",
    voices: [{
      id: "intro",
      path: "assets/voice/intro.wav",
      duration_s: 1,
      words: [{ id: "w0", text: "Introduce", start: 0.1, end: 0.4 }],
    }],
  };
  const snapshots = captureVoiceWavSnapshots(root, ["assets/voice/intro.wav"]);
  return { root, request, meta, snapshots };
}

test("creates evidence from the exact validated WAV snapshot", () => {
  const { request, meta, snapshots } = fixture();
  const evidence = createNarrationEvidence({ request, meta, snapshots, metadataPath: "audio_meta.json" });
  assert.equal(evidence.provider, "kokoro");
  assert.equal(evidence.voice, "am_michael");
  assert.equal(evidence.voices[0].duration_s, snapshots[0].duration_s);
  assert.equal(evidence.voices[0].sha256, snapshots[0].digest);
  assert.deepEqual(verifyNarrationEvidence({ request, evidence, meta, snapshots, metadataPath: "audio_meta.json" }), []);
});

test("reports digest and WAV changes with recovery guidance", () => {
  const { request, meta, snapshots } = fixture();
  const evidence = createNarrationEvidence({ request, meta, snapshots, metadataPath: "audio_meta.json" });
  const changed = validateVersionedNarrationRequest({
    ...request,
    lines: [{ id: "intro", text: "Introduce this topic." }],
  }, "audio_request.json");
  const findings = verifyNarrationEvidence({ request: changed, evidence, meta, snapshots, metadataPath: "audio_meta.json" });
  assert.match(findings[0].msg, /request digest.*Re-synthesize narration and rerun `md2vid transcribe`/);
});

test("rejects malformed evidence fields and unknown properties", () => {
  assert.throws(
    () => validateNarrationEvidence({
      version: 1,
      requestSha256: "bad",
      provider: "kokoro",
      voice: "am_michael",
      voices: [],
      transcription: { source: "md2vid transcribe" },
      extra: true,
    }, "narration_evidence.json"),
    /narration_evidence\.json\.(requestSha256|extra)/,
  );
});
```

Add cases for missing evidence, provider/voice/provenance mismatch, voice count/order/ID/path/duration/digest mismatch, duplicate IDs/paths, unsafe paths, uppercase/short hashes, BGM/SFX-only request changes, and stable diagnostic order.

- [ ] **Step 2: Run the evidence tests and confirm RED**

```bash
node --test engine/__tests__/narration_evidence.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `engine/narration_evidence.ts`.

- [ ] **Step 3: Implement strict evidence schema and creation**

Create `engine/narration_evidence.ts`:

```ts
import type { AudioMeta, Finding } from "./types.ts";
import { narrationRequestSha256, type VersionedNarrationRequest } from "./narration_request.ts";
import {
  validateAudioMetaVoiceSnapshots,
  validateVoicePath,
  type VoiceWavSnapshot,
} from "./voice_assets.ts";

export interface NarrationEvidenceVoice {
  id: string;
  path: string;
  duration_s: number;
  sha256: string;
}

export interface NarrationEvidence {
  version: 1;
  requestSha256: string;
  provider: string;
  voice: string;
  voices: NarrationEvidenceVoice[];
  transcription: { source: "md2vid transcribe" };
}

export type NarrationAudioMeta = AudioMeta & {
  tts_provider?: unknown;
  voice_id?: unknown;
};
```

Use strict owned-field allowlists and `/^[a-f0-9]{64}$/` for hashes. Validate every path with `validateVoicePath` and reject duplicate voice IDs or paths.

Create evidence without re-reading audio:

```ts
export function createNarrationEvidence(input: {
  request: VersionedNarrationRequest;
  meta: NarrationAudioMeta;
  snapshots: readonly VoiceWavSnapshot[];
  metadataPath: string;
}): NarrationEvidence {
  const validatedSnapshots = validateAudioMetaVoiceSnapshots(input.meta, input.snapshots, input.metadataPath);
  const byPath = new Map(validatedSnapshots.map((snapshot) => [snapshot.path, snapshot]));
  return {
    version: 1,
    requestSha256: narrationRequestSha256(input.request),
    provider: input.request.provider,
    voice: input.request.voice,
    voices: input.meta.voices.map((voice) => {
      const snapshot = byPath.get(voice.path)!;
      return {
        id: voice.id,
        path: voice.path,
        duration_s: snapshot.duration_s,
        sha256: snapshot.digest,
      };
    }),
    transcription: { source: "md2vid transcribe" },
  };
}
```

- [ ] **Step 4: Implement ordered freshness findings**

Use `Finding[]` and one recovery suffix:

```ts
const RECOVERY = "Re-synthesize narration and rerun `md2vid transcribe`.";

function error(message: string): Finding {
  return { level: "error", msg: `${message} ${RECOVERY}` };
}
```

`verifyNarrationEvidence()` checks in this order:

```text
missing evidence
request digest
provider
voice
audio_meta tts_provider
audio_meta voice_id
voice count/order
voice ID
voice path
safe duration
WAV SHA-256
```

Compare ordered request line IDs to ordered metadata voice IDs before per-voice evidence. Return all actionable findings rather than stopping at the first mismatch.

- [ ] **Step 5: Run focused tests**

```bash
node --test engine/__tests__/narration_request.test.ts engine/__tests__/narration_evidence.test.ts engine/__tests__/voice_assets.test.ts
corepack npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add engine/narration_evidence.ts engine/__tests__/narration_evidence.test.ts
git commit -m "feat(engine): add narration freshness evidence"
```

---

- [ ] **Task 3: Add repeatable CLI options and the check-only `narration-check` command** `[Group: narration-contract]` `[Tester: yes]`

**Files:**
- Modify: `scripts/cli_args.ts:11-62`
- Create: `scripts/narration_check.ts`
- Modify: `bin/md2vid.ts:10-62`
- Modify: `test/cli/cli-args.test.ts`
- Create: `test/cli/narration-check.test.ts`
- Modify: `test/cli/router.test.ts`
- Modify: `test/cli/run-exports.test.ts`

- [ ] **Step 1: Write failing repeatable-option and command tests**

In `test/cli/cli-args.test.ts`, add:

```ts
test("parseCommand retains repeated string options", () => {
  const parsed = parseCommand({
    command: "narration-check",
    usage: "usage",
    options: { "allow-long-sentence": { type: "string", multiple: true } },
    minPositionals: 1,
    maxPositionals: 1,
  }, ["project", "--allow-long-sentence", "intro:0", "--allow-long-sentence", "recap:1"]);
  assert.equal(parsed.kind, "ok");
  if (parsed.kind !== "ok") return;
  assert.deepEqual(parsed.values["allow-long-sentence"], ["intro:0", "recap:1"]);
});
```

Create `test/cli/narration-check.test.ts` with a console capture and tree snapshot. Add exact cases:

```ts
test("prints the stable PASS summary for the default request", () => {
  const project = fixture({
    version: 1,
    provider: "kokoro",
    voice: "am_michael",
    lang: "en",
    speed: 0.9,
    lines: [
      { id: "intro", text: "Introduce the topic." },
      { id: "recap", text: "Recap the key idea." },
    ],
  });
  const result = captureRun([project]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /PASS \[narration\] 2 lines, 2 sentences, provider=kokoro, voice=am_michael, lang=en, speed=0\.9/);
  assert.equal(result.stderr, "");
});

test("returns one for a 19-word sentence without mutating the project", () => {
  const project = fixture({
    version: 1,
    provider: "kokoro",
    voice: "am_michael",
    lang: "en",
    speed: 0.9,
    lines: [{ id: "long", text: "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen." }],
  });
  const before = snapshotTree(project);
  const result = captureRun([project]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /FAIL \[narration\] line="long" sentence=0 words=19 code=sentence-too-long/);
  assert.deepEqual(snapshotTree(project), before);
});

test("parses approval at the final colon", () => {
  const result = captureRun([fixture(longRequest("chapter:intro")), "--allow-long-sentence", "chapter:intro:0"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /approved line="chapter:intro" sentence=0/);
});
```

Add warning exit `0`, explicit request path, malformed JSON, missing request, unmatched approval, help/usage, override INFO output, unrelated cwd, and no mutation.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
node --test test/cli/cli-args.test.ts test/cli/narration-check.test.ts
```

Expected: FAIL because repeated option values are not represented and `scripts/narration_check.ts` does not exist.

- [ ] **Step 3: Extend shared CLI option typing**

In `scripts/cli_args.ts`:

```ts
export type CommandOptionValue =
  | string
  | boolean
  | string[]
  | boolean[]
  | undefined;

export interface ParsedCommand {
  kind: "ok";
  values: Record<string, CommandOptionValue>;
  positionals: string[];
}
```

Preserve all existing parser behavior and tests.

- [ ] **Step 4: Implement `scripts/narration_check.ts`**

Use this command contract:

```ts
#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  analyzeNarrationRequest,
  validateVersionedNarrationRequest,
  type NarrationSentenceApproval,
} from "../engine/narration_request.ts";
import { parseCommand } from "./cli_args.ts";
import { isMainModule } from "./main-guard.ts";

const USAGE = "Usage: md2vid narration-check <dir> [--request <path>] [--allow-long-sentence <line-id>:<sentence-index>]";
```

Parse repeated approvals at the final colon:

```ts
function approval(value: string): NarrationSentenceApproval {
  const separator = value.lastIndexOf(":");
  const lineId = value.slice(0, separator);
  const rawIndex = value.slice(separator + 1);
  if (separator <= 0 || !/^\d+$/.test(rawIndex)) throw new Error(`invalid --allow-long-sentence ${JSON.stringify(value)}; expected <line-id>:<sentence-index>`);
  return { lineId, sentenceIndex: Number(rawIndex) };
}
```

Implement `run(argv)` with exit codes `0`, `1`, `2`. Resolve an explicit `--request` from caller cwd; otherwise use `<dir>/audio_request.json`. Print override INFO lines before approvals/findings. Print warnings to stdout, errors to stderr, then the stable summary only when no errors exist.

- [ ] **Step 5: Register router help and dispatch**

In `bin/md2vid.ts`:

```ts
import { run as narrationCheckRun } from "../scripts/narration_check.ts";

const COMMANDS: Record<string, Run> = {
  new: newRun,
  "narration-check": narrationCheckRun,
  plan: planRun,
  // existing commands unchanged
};
```

Add help text:

```text
narration-check <dir> [options]                 validate narration request only; does not synthesize audio
```

Update router command inventories and give the narration-check excess-positional case two positionals so it remains a usage error.

- [ ] **Step 6: Run CLI and router tests**

```bash
node --test \
  test/cli/cli-args.test.ts \
  test/cli/narration-check.test.ts \
  test/cli/router.test.ts \
  test/cli/run-exports.test.ts
corepack npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/cli_args.ts scripts/narration_check.ts bin/md2vid.ts test/cli/cli-args.test.ts test/cli/narration-check.test.ts test/cli/router.test.ts test/cli/run-exports.test.ts
git commit -m "feat(cli): add narration request preflight"
```

## Part 1 Focused Gate

```bash
node --test \
  engine/__tests__/narration_request.test.ts \
  engine/__tests__/narration_evidence.test.ts \
  engine/__tests__/voice_assets.test.ts \
  test/cli/cli-args.test.ts \
  test/cli/narration-check.test.ts \
  test/cli/router.test.ts \
  test/cli/run-exports.test.ts
corepack npm run typecheck
```

Expected: all tests pass and no production code references media-use or synthesizes audio.
