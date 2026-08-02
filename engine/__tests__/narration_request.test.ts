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
