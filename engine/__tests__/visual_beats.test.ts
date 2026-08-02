import assert from "node:assert/strict";
import test from "node:test";
import type { PlanFrame, ResolvedVisualSyncPolicy, VisualBeatSpec } from "../types.ts";
import { resolveVisualBeats, validateVisualBeatSpec } from "../visual_beats.ts";

const FRAME: PlanFrame = {
  id: "voice-1",
  frameNum: 1,
  slug: "reserve-flow",
  voicePath: "assets/voice/voice-1.wav",
  voiceDur: 18,
  frameDur: 18,
  start: 0,
  words: [
    { text: "First", start: 2.95, end: 3.2 },
    { text: "reserve", start: 3.21, end: 3.6 },
    { text: "execute", start: 11.06, end: 11.5 },
    { text: "Finally", start: 14.35, end: 14.8 },
  ],
};

const POLICY: ResolvedVisualSyncPolicy = {
  mode: "required",
  maxLead: 0.25,
  maxLag: 0.75,
  minLanding: 1,
};

test("resolves word index and phrase occurrence to original word timing", () => {
  const spec: VisualBeatSpec = {
    version: 1,
    frames: {
      "reserve-flow": {
        kind: "workflow",
        beats: [
          { id: "reserve", text: "Reserve", cue: { phrase: "first reserve", occurrence: 1 }, workflowStep: 1 },
          { id: "execute", text: "Execute", cue: { wordIndex: 2 }, workflowStep: 2 },
          { id: "settle", text: "Settle", cue: { phrase: "finally", occurrence: 1 }, workflowStep: 3 },
        ],
      },
    },
  };

  const resolved = resolveVisualBeats(spec, [FRAME], POLICY, "visual_beats.json");
  assert.deepEqual(resolved.get("reserve-flow")?.visualBeats.map((beat) => [beat.id, beat.start]), [
    ["reserve", 2.95],
    ["execute", 11.06],
    ["settle", 14.35],
  ]);
});

test("retains prototype-like frame slugs during validation", () => {
  const frame: PlanFrame = { ...FRAME, slug: "__proto__" };
  const spec: VisualBeatSpec = {
    version: 1,
    frames: {
      ["__proto__"]: { beats: [{ id: "beat", text: "Beat", cue: { wordIndex: 0 } }] },
    },
  };

  assert.equal(resolveVisualBeats(spec, [frame], POLICY).get("__proto__")?.visualBeats[0].id, "beat");
});

test("normalizes NFKC punctuation while preserving original cue word index", () => {
  const frame: PlanFrame = {
    ...FRAME,
    words: [
      { text: "Settle—once", start: 4, end: 4.5 },
      { text: "safely.", start: 4.6, end: 5 },
    ],
  };
  const spec = validateVisualBeatSpec({
    version: 1,
    frames: {
      "reserve-flow": {
        beats: [{ id: "settle", text: "Settle", cue: { phrase: "settle once safely", occurrence: 1 } }],
      },
    },
  }, "visual_beats.json");

  const [beat] = resolveVisualBeats(spec, [frame], POLICY).get("reserve-flow")!.visualBeats;
  assert.equal(beat.cueWordIndex, 0);
  assert.equal(beat.cueText, "Settle—once safely.");
});

test("uses locale-independent lowercasing for Unicode phrase occurrences", () => {
  const frame: PlanFrame = {
    ...FRAME,
    words: [
      { text: "I", start: 1, end: 1.2 },
      { text: "İ", start: 2, end: 2.2 },
      { text: "ı", start: 3, end: 3.2 },
    ],
  };
  const spec = validateVisualBeatSpec({
    version: 1,
    frames: {
      "reserve-flow": {
        beats: [
          { id: "latin-first", text: "Latin first", cue: { phrase: "i", occurrence: 1 } },
          { id: "latin-second", text: "Latin second", cue: { phrase: "i", occurrence: 2 } },
          { id: "dotless", text: "Dotless", cue: { phrase: "ı", occurrence: 1 } },
        ],
      },
    },
  }, "visual_beats.json");

  const beats = resolveVisualBeats(spec, [frame], POLICY).get("reserve-flow")!.visualBeats;
  assert.deepEqual(beats.map((beat) => [beat.id, beat.cueWordIndex]), [
    ["latin-first", 0],
    ["latin-second", 1],
    ["dotless", 2],
  ]);
});

test("merges only supplied beat tolerance keys over the policy", () => {
  const spec = validateVisualBeatSpec({
    version: 1,
    frames: {
      "reserve-flow": {
        beats: [{
          id: "reserve",
          text: "Reserve",
          cue: { wordIndex: 0 },
          tolerance: { maxLag: 1.25 },
        }],
      },
    },
  }, "visual_beats.json");

  const [beat] = resolveVisualBeats(spec, [FRAME], POLICY).get("reserve-flow")!.visualBeats;
  assert.deepEqual(beat.tolerance, { maxLead: 0.25, maxLag: 1.25 });
});

test("rejects malformed visual beat specification structure", () => {
  const cases: Array<[unknown, RegExp]> = [
    [null, /visual_beats\.json.*expected an object/],
    [{ version: 2, frames: {} }, /visual_beats\.json\.version.*expected 1/],
    [{ version: 1, frames: [] }, /visual_beats\.json\.frames.*expected an object/],
    [{ version: 1, frames: { "reserve-flow": { beats: [] } } }, /beats.*non-empty array/],
    [{ version: 1, frames: { "reserve-flow": { kind: "grid", beats: [] } } }, /kind/],
  ];

  for (const [value, expected] of cases) {
    assert.throws(() => validateVisualBeatSpec(value, "visual_beats.json"), expected);
  }
});

test("rejects malformed beat fields and cue union branches", () => {
  const cases: Array<[unknown, RegExp]> = [
    [{ id: "", text: "Beat", cue: { wordIndex: 0 } }, /id.*non-empty string/],
    [{ id: "beat", text: "", cue: { wordIndex: 0 } }, /text.*non-empty string/],
    [{ id: "beat", text: "Beat", cue: {} }, /cue.*exactly one/],
    [{ id: "beat", text: "Beat", cue: { wordIndex: 0, phrase: "beat", occurrence: 1 } }, /cue.*exactly one/],
    [{ id: "beat", text: "Beat", cue: { wordIndex: 1.5 } }, /wordIndex.*non-negative integer/],
    [{ id: "beat", text: "Beat", cue: { phrase: " ", occurrence: 1 } }, /phrase.*non-empty string/],
    [{ id: "beat", text: "Beat", cue: { phrase: "beat", occurrence: 0 } }, /occurrence.*positive integer/],
    [{ id: "beat", text: "Beat", cue: { wordIndex: 0 }, sourceRefs: ["source.md:1", ""] }, /sourceRefs\[1\].*non-empty string/],
    [{ id: "beat", text: "Beat", cue: { wordIndex: 0 }, sourceRefs: "source.md:1" }, /sourceRefs.*array/],
    [{ id: "beat", text: "Beat", cue: { wordIndex: 0 }, tolerance: { maxLead: -0.01 } }, /tolerance\.maxLead.*non-negative/],
  ];

  for (const [beat, expected] of cases) {
    assert.throws(
      () => validateVisualBeatSpec({ version: 1, frames: { "reserve-flow": { beats: [beat] } } }, "visual_beats.json"),
      expected,
    );
  }
});

test("rejects duplicate beat IDs and invalid workflow step sequences", () => {
  const cases: Array<[unknown[], RegExp]> = [
    [
      [
        { id: "repeat", text: "First", cue: { wordIndex: 0 } },
        { id: "repeat", text: "Second", cue: { wordIndex: 1 } },
      ],
      /duplicate beat id "repeat"/,
    ],
    [
      [
        { id: "first", text: "First", cue: { wordIndex: 0 }, workflowStep: 1 },
        { id: "third", text: "Third", cue: { wordIndex: 1 }, workflowStep: 3 },
      ],
      /workflow steps.*1, 2/,
    ],
    [
      [
        { id: "first", text: "First", cue: { wordIndex: 0 }, workflowStep: 1 },
        { id: "duplicate", text: "Duplicate", cue: { wordIndex: 1 }, workflowStep: 1 },
      ],
      /duplicate workflow step 1/,
    ],
    [
      [
        { id: "first", text: "First", cue: { wordIndex: 0 }, workflowStep: 1 },
        { id: "missing", text: "Missing", cue: { wordIndex: 1 } },
      ],
      /workflowStep.*required for every beat/,
    ],
  ];

  for (const [beats, expected] of cases) {
    assert.throws(
      () => validateVisualBeatSpec({ version: 1, frames: { "reserve-flow": { beats } } }, "visual_beats.json"),
      expected,
    );
  }
});

test("rejects unknown slugs and invalid resolved cue anchors", () => {
  const cases: Array<[VisualBeatSpec, readonly PlanFrame[], RegExp]> = [
    [
      { version: 1, frames: { unknown: { beats: [{ id: "beat", text: "Beat", cue: { wordIndex: 0 } }] } } },
      [FRAME],
      /frames\.unknown.*unknown frame slug/,
    ],
    [
      { version: 1, frames: { "reserve-flow": { beats: [{ id: "beat", text: "Beat", cue: { wordIndex: 4 } }] } } },
      [FRAME],
      /wordIndex.*out of range/,
    ],
    [
      { version: 1, frames: { "reserve-flow": { beats: [{ id: "beat", text: "Beat", cue: { phrase: "missing", occurrence: 1 } }] } } },
      [FRAME],
      /cue phrase.*not found/,
    ],
    [
      { version: 1, frames: { "reserve-flow": { beats: [{ id: "beat", text: "Beat", cue: { phrase: "reserve", occurrence: 2 } }] } } },
      [FRAME],
      /occurrence 2.*only 1 match/,
    ],
  ];

  for (const [spec, frames, expected] of cases) {
    assert.throws(() => resolveVisualBeats(spec, frames, POLICY, "visual_beats.json"), expected);
  }
});

test("rejects workflow cue times that are not monotonic", () => {
  const spec: VisualBeatSpec = {
    version: 1,
    frames: {
      "reserve-flow": {
        beats: [
          { id: "first", text: "First", cue: { wordIndex: 2 }, workflowStep: 1 },
          { id: "second", text: "Second", cue: { wordIndex: 0 }, workflowStep: 2 },
        ],
      },
    },
  };

  assert.throws(
    () => resolveVisualBeats(spec, [FRAME], POLICY, "visual_beats.json"),
    /workflow cue times.*step 2.*step 1/,
  );
});
