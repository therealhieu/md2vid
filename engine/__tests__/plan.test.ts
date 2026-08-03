// Unit tests for the neutral plan() — timeline layout, cues, caption globalization.

import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, resolveVisualSyncPolicy } from "../plan.ts";

// Minimal audio meta: two voices, each with two words (local, 0-based times).
function meta(voices: any) {
  return { voices };
}
const V = (id: any, dur: any, words: any) => ({ id, path: `assets/voice/${id}.wav`, duration_s: dur, words });

const CFG = (over: any = {}) => ({
  timing: { tail: 0.5, xfade: 0.5, gap: 0, ...(over.timing || {}) },
  canvas: { width: 1920, height: 1080, ...(over.canvas || {}) },
  slugs: over.slugs ?? { "01": "01-a", "02": "02-b" },
});

test("keeps meaningful IDs while deriving frame order", () => {
  const p = plan(
    meta([
      V("intro", 5, [{ text: "Intro", start: 0, end: 1 }]),
      V("details", 6, [{ text: "Details", start: 0, end: 1 }]),
      V("recap", 7, [{ text: "Recap", start: 0, end: 1 }]),
    ]),
    CFG({ slugs: { intro: "01-intro", details: "02-details", recap: "03-recap" } })
  );

  assert.deepEqual(p.frames.map(({ id, frameNum, slug }) => ({ id, frameNum, slug })), [
    { id: "intro", frameNum: 1, slug: "01-intro" },
    { id: "details", frameNum: 2, slug: "02-details" },
    { id: "recap", frameNum: 3, slug: "03-recap" },
  ]);
  assert.deepEqual(p.captionGroups.map((group) => group.frame), [1, 2, 3]);
});

test("legacy frames omit optional visual timing fields", () => {
  const result = plan(
    meta([V("intro", 5, [{ text: "Intro", start: 0, end: 1 }])]),
    CFG({ slugs: { intro: "01-intro" } }),
  );
  assert.equal(Object.hasOwn(result.frames[0], "visualKind"), false);
  assert.equal(Object.hasOwn(result.frames[0], "visualBeats"), false);
});

test("serializes a legacy plan without visual timing keys", () => {
  const result = plan(
    meta([V("intro", 5, [{ text: "Intro", start: 1, end: 1.5 }])]),
    CFG({ slugs: { intro: "01-intro" } }),
  );
  const serialized = JSON.parse(JSON.stringify(result));

  assert.deepEqual(serialized.frames[0], {
    id: "intro",
    frameNum: 1,
    slug: "01-intro",
    voicePath: "assets/voice/intro.wav",
    voiceDur: 5,
    frameDur: 5,
    start: 0,
    words: [{ text: "Intro", start: 1, end: 1.5 }],
  });
  assert.equal(Object.hasOwn(serialized.frames[0], "visualKind"), false);
  assert.equal(Object.hasOwn(serialized.frames[0], "visualBeats"), false);
});

test("plan attaches resolved visual beats by frame slug", () => {
  const metadata = meta([V("intro", 5, [{ text: "First", start: 1, end: 1.5 }])]);
  const result = plan(metadata, CFG({ slugs: { intro: "intro" } }), {
    version: 1,
    frames: {
      intro: {
        kind: "workflow",
        beats: [{ id: "first", text: "First", cue: { wordIndex: 0 }, workflowStep: 1 }],
      },
    },
  });

  assert.equal(result.frames[0].visualKind, "workflow");
  assert.equal(result.frames[0].visualBeats?.[0].id, "first");
  assert.equal(result.frames[0].visualBeats?.[0].start, metadata.voices[0].words[0].start);
});

test("attaches beats only to frames named by the visual specification", () => {
  const metadata = meta([
    V("intro", 5, [{ text: "First", start: 1, end: 1.5 }]),
    V("outro", 6, [{ text: "Last", start: 2, end: 2.5 }]),
  ]);
  const config = CFG({ slugs: { intro: "intro", outro: "outro" } });
  const legacy = plan(metadata, config);
  const result = plan(metadata, config, {
    version: 1,
    frames: {
      intro: {
        kind: "focal",
        beats: [{ id: "first", text: "First", cue: { wordIndex: 0 } }],
      },
    },
  });
  const serialized = JSON.parse(JSON.stringify(result));

  assert.equal(result.frames[0].visualKind, "focal");
  assert.equal(result.frames[0].visualBeats?.[0].id, "first");
  assert.equal(Object.hasOwn(result.frames[1], "visualKind"), false);
  assert.equal(Object.hasOwn(result.frames[1], "visualBeats"), false);
  assert.equal(Object.hasOwn(serialized.frames[1], "visualKind"), false);
  assert.equal(Object.hasOwn(serialized.frames[1], "visualBeats"), false);
  assert.deepEqual(result.frames[1], legacy.frames[1]);
  assert.deepEqual(result.captionGroups, legacy.captionGroups);
});

test("plan mode off ignores supplied beat data and omits visual fields", () => {
  const result = plan(
    meta([V("intro", 5, [{ text: "First", start: 1, end: 1.5 }])]),
    { ...CFG({ slugs: { intro: "intro" } }), visualSync: { mode: "off" } },
    {
      version: 1,
      frames: {
        intro: { beats: [{ id: "ignored", text: "Ignored", cue: { wordIndex: 0 } }] },
      },
    },
  );

  assert.equal(Object.hasOwn(result.frames[0], "visualBeats"), false);
});

test("legacy visual coverage defaults to warn", () => {
  assert.deepEqual(resolveVisualSyncPolicy({}), {
    mode: "warn",
    coverageMode: "warn",
    maxLead: 0.25,
    maxLag: 0.75,
    maxUncoveredGap: 0.5,
    minLanding: 1,
  });
});

test("coverage planning remains enabled when reveal timing is off", () => {
  const policy = resolveVisualSyncPolicy({
    visualSync: { mode: "off", coverageMode: "required" },
  });
  assert.equal(policy.mode, "off");
  assert.equal(policy.coverageMode, "required");
});

test("resolves supplied visual sync policy keys over legacy defaults", () => {
  assert.deepEqual(resolveVisualSyncPolicy({ visualSync: { mode: "off" } }), {
    mode: "off",
    coverageMode: "warn",
    maxLead: 0.25,
    maxLag: 0.75,
    maxUncoveredGap: 0.5,
    minLanding: 1,
  });
  assert.deepEqual(resolveVisualSyncPolicy({ visualSync: { maxLead: 0 } }), {
    mode: "warn",
    coverageMode: "warn",
    maxLead: 0,
    maxLag: 0.75,
    maxUncoveredGap: 0.5,
    minLanding: 1,
  });
  assert.deepEqual(resolveVisualSyncPolicy({ visualSync: { maxLag: 1.5 } }), {
    mode: "warn",
    coverageMode: "warn",
    maxLead: 0.25,
    maxLag: 1.5,
    maxUncoveredGap: 0.5,
    minLanding: 1,
  });
  assert.deepEqual(resolveVisualSyncPolicy({ visualSync: { minLanding: 0.5 } }), {
    mode: "warn",
    coverageMode: "warn",
    maxLead: 0.25,
    maxLag: 0.75,
    maxUncoveredGap: 0.5,
    minLanding: 0.5,
  });
});

test("rejects duplicate voice IDs", () => {
  assert.throws(
    () => plan(
      meta([
        V("intro", 5, [{ text: "One", start: 0, end: 1 }]),
        V("intro", 5, [{ text: "Two", start: 0, end: 1 }]),
      ]),
      CFG({ slugs: { intro: "01-intro" } })
    ),
    /duplicate voice id "intro"/
  );
});

test("rejects empty voice IDs and missing slug mappings", () => {
  assert.throws(
    () => plan(meta([V(" ", 5, [{ text: "One", start: 0, end: 1 }])]), CFG({ slugs: {} })),
    /non-empty string/
  );
  assert.throws(
    () => plan(meta([V("intro", 5, [{ text: "One", start: 0, end: 1 }])]), CFG({ slugs: {} })),
    /missing slug mapping for voice id "intro"/
  );
});

test("direct plan callers reject unsafe slug mappings", () => {
  for (const slug of ["../outside", "nested/frame", 'x" data-start="999']) {
    assert.throws(
      () =>
        plan(
          meta([V("intro", 5, [{ text: "Intro", start: 0, end: 1 }])]),
          CFG({ slugs: { intro: slug } }),
        ),
      /field "slugs\.intro".*safe single path segment/i,
      slug,
    );
  }
});

test("direct plan callers reject duplicate slug ownership", () => {
  assert.throws(
    () =>
      plan(
        meta([
          V("intro", 5, [{ text: "Intro", start: 0, end: 1 }]),
          V("recap", 5, [{ text: "Recap", start: 0, end: 1 }]),
        ]),
        CFG({
          slugs: {
            intro: "01-intro",
            recap: "01-intro",
          },
        }),
      ),
    /field "slugs\.recap".*unique.*voice id "intro"/i,
  );
});

test("direct plan callers reject unknown slug mappings", () => {
  assert.throws(
    () =>
      plan(
        meta([V("intro", 5, [{ text: "Intro", start: 0, end: 1 }])]),
        CFG({
          slugs: {
            intro: "01-intro",
            extra: "02-extra",
          },
        }),
      ),
    /unknown slug mapping for voice id "extra"/,
  );
});

function assertMalformedSlugs(slugs: unknown) {
  const malformedConfig = CFG();
  malformedConfig.slugs = slugs;
  assert.throws(
    () => plan(meta([V("0", 5, [{ text: "One", start: 0, end: 1 }])]), malformedConfig),
    /"slugs" must be a non-null, non-array object/
  );
}

test("rejects string slug mappings", () => {
  assertMalformedSlugs("mapped");
});

test("rejects array slug mappings", () => {
  assertMalformedSlugs(["mapped"]);
});

test("rejects null slug mappings", () => {
  assertMalformedSlugs(null);
});

test("supports prototype-like IDs through own-property lookup", () => {
  const slugs = Object.create(null) as Record<string, string>;
  slugs["constructor"] = "01-constructor";
  const p = plan(
    meta([V("constructor", 5, [{ text: "One", start: 0, end: 1 }])]),
    CFG({ slugs })
  );
  assert.equal(p.frames[0].slug, "01-constructor");
});

test("rejects inherited slug mappings", () => {
  assert.throws(
    () => plan(
      meta([V("constructor", 5, [{ text: "One", start: 0, end: 1 }])]),
      CFG({ slugs: {} })
    ),
    /missing slug mapping for voice id "constructor"/
  );
});

test("back-to-back layout (gap=0): frame N starts where N-1's voice ends", () => {
  const p = plan(
    meta([
      V("01", 10, [{ text: "hi", start: 0, end: 1 }]),
      V("02", 8, [{ text: "yo", start: 0, end: 1 }]),
    ]),
    CFG({ timing: { gap: 0, xfade: 0.5 } })
  );
  assert.equal(p.frames[0].start, 0);
  assert.equal(p.frames[1].start, 10); // 10 (voice) + 0 (gap)
  // non-last frame mount = voiceDur + gap + xfade
  assert.equal(p.frames[0].frameDur, 10.5);
  // last frame gets no tail/gap/xfade
  assert.equal(p.frames[1].frameDur, 8);
  assert.equal(p.totalDuration, 18);
});

test("gap>0 held-landing: next voice waits gap after prev voice", () => {
  const p = plan(
    meta([
      V("01", 10, [{ text: "hi", start: 0, end: 1 }]),
      V("02", 8, [{ text: "yo", start: 0, end: 1 }]),
    ]),
    CFG({ timing: { gap: 0.6, xfade: 0.5 } })
  );
  assert.equal(p.frames[1].start, 10.6); // 10 + gap 0.6
  assert.equal(p.frames[0].frameDur, 11.1); // 10 + 0.6 + 0.5
  assert.equal(p.totalDuration, 18.6); // 10 + 0.6 + 8
});

test("last frame has no tail (nothing runs past its voice)", () => {
  const p = plan(
    meta([
      V("01", 5, [{ text: "a", start: 0, end: 1 }]),
      V("02", 7, [{ text: "b", start: 0, end: 1 }]),
    ]),
    CFG({ timing: { gap: 0.6, xfade: 0.5 } })
  );
  const last = p.frames[p.frames.length - 1];
  assert.equal(last.frameDur, 7); // exactly its voice duration
  assert.equal(last.start + last.frameDur, p.totalDuration);
});

test("missing slug hard-fails", () => {
  assert.throws(
    () =>
      plan(
        meta([V("01", 5, [{ text: "a", start: 0, end: 1 }]), V("99", 5, [{ text: "b", start: 0, end: 1 }])]),
        CFG({ slugs: { "01": "01-a" } })
      ),
    /missing slug mapping for voice id "99"/
  );
});

test("wordless voices hard-fail with voice identity", () => {
  assert.throws(
    () => plan(meta([V("01", 5, [])]), CFG()),
    /voice "01".*words.*non-empty/i,
  );
});

test("rejects non-portable voice asset paths before planning", () => {
  for (const path of [
    "/tmp/voice.wav",
    "../assets/voice/intro.wav",
    "assets/voice/../intro.wav",
    "assets\\voice\\intro.wav",
    "assets/voice/intro.mp3",
  ]) {
    assert.throws(
      () => plan(
        meta([{ ...V("01", 1, [{ text: "one", start: 0, end: 1 }]), path }]),
        CFG({ slugs: { "01": "01-a" } }),
      ),
      /voice "01".*path.*portable.*\.wav/i,
      path,
    );
  }
});

test("rejects invalid word timings before planning", () => {
  const cases: Array<[string, any[], RegExp]> = [
    ["final end overrun", [{ id: "w0", text: "one", start: 0, end: 1.1 }], /voice "01".*word "w0".*duration/i],
    [
      "final start overrun",
      [
        { id: "w0", text: "one", start: 0, end: 0.5 },
        { id: "w1", text: "two", start: 1.1, end: 1.3 },
      ],
      /voice "01".*word "w1".*duration/i,
    ],
    [
      "middle end overrun",
      [
        { id: "w0", text: "one", start: 0, end: 1.1 },
        { id: "w1", text: "two", start: 1.1, end: 1.2 },
      ],
      /voice "01".*word "w0".*duration/i,
    ],
    [
      "non-monotonic",
      [
        { id: "w0", text: "one", start: 0, end: 0.6 },
        { id: "w1", text: "two", start: 0.5, end: 0.8 },
      ],
      /voice "01".*word "w1".*previous.*w0/i,
    ],
    ["negative", [{ id: "w0", text: "one", start: -0.1, end: 0.5 }], /voice "01".*word "w0".*start/i],
    ["NaN", [{ id: "w0", text: "one", start: Number.NaN, end: 0.5 }], /voice "01".*word "w0".*finite/i],
    ["Infinity", [{ id: "w0", text: "one", start: 0, end: Number.POSITIVE_INFINITY }], /voice "01".*word "w0".*finite/i],
  ];

  for (const [name, words, expected] of cases) {
    assert.throws(
      () => plan(meta([V("01", 1, words)]), CFG()),
      expected,
      name,
    );
  }
});

test("caption globalization offsets words by frame.start and stays monotonic", () => {
  const p = plan(
    meta([
      V("01", 10, [
        { text: "one", start: 0, end: 1 },
        { text: "two", start: 1, end: 2 },
      ]),
      V("02", 8, [
        { text: "three", start: 0, end: 1 },
        { text: "four", start: 1, end: 2 },
      ]),
    ]),
    CFG({ timing: { gap: 0, xfade: 0.5 } })
  );
  // frame 2 words offset by its start (10)
  const g2 = p.captionGroups[1];
  assert.equal(g2.words[0].start, 10);
  assert.equal(g2.words[1].start, 11);
  // global timeline monotonic across group boundary
  const flat = p.captionGroups.flatMap((g) => g.words);
  for (let i = 1; i < flat.length; i++) assert.ok(flat[i].start >= flat[i - 1].start);
});

test("valid normalized timings pass through planning unchanged", () => {
  const p = plan(
    meta([
      V("01", 10, [
        { text: "one", start: 0, end: 1 },
        { text: "pad", start: 9, end: 10 },
      ]),
      V("02", 8, [{ text: "next", start: 0, end: 1 }]),
    ]),
    CFG({ timing: { gap: 0, xfade: 0.5 } })
  );
  const g1 = p.captionGroups[0];
  assert.equal(g1.words[1].end, 10);
  assert.ok(p.captionGroups[1].words[0].start >= g1.words[1].end);
});
