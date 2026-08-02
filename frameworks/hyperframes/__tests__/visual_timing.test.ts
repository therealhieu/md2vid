import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import type { PlanFrame } from "../../../engine/types.ts";
import {
  buildHyperframesTimingRuntime,
  prepareFrameVisualTiming,
} from "../visual_timing.ts";

const FRAME_WITH_EXECUTE_BEAT: PlanFrame = {
  id: "reserve-flow",
  frameNum: 1,
  slug: "reserve-flow",
  voicePath: "assets/voice/reserve-flow.wav",
  voiceDur: 18,
  frameDur: 18.5,
  start: 0,
  words: [],
  visualBeats: [{
    id: "execute",
    text: "Execute",
    start: 11.06,
    cueWordIndex: 0,
    cueText: "Execute",
    sourceRefs: [],
    tolerance: { maxLead: 0.25, maxLag: 0.75 },
  }],
};

const DOCUMENT_PATH = "compositions/frames/01-reserve-flow.html";

function frameHtml(inner: string, duration = 18): string {
  return `<template data-composition-id="reserve-flow">
  <div id="reserve-flow-root" data-composition-id="reserve-flow" data-duration="${duration}">
    ${inner}
  </div>
</template>`;
}

test("declarative rise binding schedules at the resolved beat", () => {
  const prepared = prepareFrameVisualTiming({
    frame: FRAME_WITH_EXECUTE_BEAT,
    authoredHtml: frameHtml('<div id="execute" data-md2vid-beat="execute" data-md2vid-enter="rise" data-md2vid-duration="0.7"></div>'),
    documentPath: DOCUMENT_PATH,
    mode: "required",
  });

  assert.match(prepared.html, /__md2vidTiming/);
  assert.match(prepared.html, /power3\.out/);
  assert.match(prepared.html, /11\.06/);
  assert.deepEqual(prepared.bindings, [{
    frameSlug: "reserve-flow",
    beatId: "execute",
    target: "#execute",
    revealStart: 11.06,
    revealDuration: 0.7,
    source: "declarative",
    authoredDuration: FRAME_WITH_EXECUTE_BEAT.voiceDur,
  }]);
});

test("retains authored duration evidence for active-FPS verification", () => {
  const prepared = prepareFrameVisualTiming({
    frame: FRAME_WITH_EXECUTE_BEAT,
    authoredHtml: frameHtml('<div id="execute" data-md2vid-beat="execute"></div>', 17.981),
    documentPath: DOCUMENT_PATH,
    mode: "required",
  });
  assert.equal(prepared.bindings[0].authoredDuration, 17.981);
});

test("every supported declarative entrance token has deterministic timing", () => {
  for (const [token, expected] of [
    ["fade", /opacity/],
    ["rise", /y: 28/],
    ["slide-left", /x: 28/],
    ["scale", /scale: 0\.96/],
    ["none", /\.set\(/],
  ] as const) {
    const prepared = prepareFrameVisualTiming({
      frame: FRAME_WITH_EXECUTE_BEAT,
      authoredHtml: frameHtml(`<div id="execute" data-md2vid-beat="execute" data-md2vid-enter="${token}"></div>`),
      documentPath: DOCUMENT_PATH,
      mode: "required",
    });
    assert.equal(prepared.bindings[0].revealStart, 11.06, token);
    assert.match(prepared.html, expected, token);
  }
});

test("custom declaration is verified and the helper owns scheduling", () => {
  const prepared = prepareFrameVisualTiming({
    frame: FRAME_WITH_EXECUTE_BEAT,
    authoredHtml: frameHtml(`
      <div id="execute"></div>
      <script type="application/json" data-md2vid-custom-bindings>{"bindings":[{"beat":"execute","target":"#execute","method":"from","duration":0.7}]}</script>
    `),
    documentPath: DOCUMENT_PATH,
    mode: "required",
  });

  assert.deepEqual(prepared.bindings[0], {
    frameSlug: "reserve-flow",
    beatId: "execute",
    target: "#execute",
    revealStart: 11.06,
    revealDuration: 0.7,
    source: "custom",
    authoredDuration: FRAME_WITH_EXECUTE_BEAT.voiceDur,
  });
  const runtime = buildHyperframesTimingRuntime(FRAME_WITH_EXECUTE_BEAT, prepared.bindings);
  assert.match(runtime, /timing\.from|from: function/);
  assert.doesNotMatch(runtime, /return beat\.start/);
  assert.doesNotMatch(runtime, /gsap\.timeline/);
});

test("custom helper rejects calls without a matching declaration and duration mismatches", () => {
  const bindings = [{
    frameSlug: "reserve-flow",
    beatId: "execute",
    target: "#execute",
    revealStart: 11.06,
    revealDuration: 0.7,
    source: "custom" as const,
    authoredDuration: 18,
  }];
  const context = { window: {} as Record<string, unknown> };
  vm.runInNewContext(buildHyperframesTimingRuntime(FRAME_WITH_EXECUTE_BEAT, bindings), context);
  const timing = (context.window.__md2vidTiming as { forFrame(slug: string): {
    from(timeline: unknown, beatId: string, target: string, vars: { duration: number }): unknown;
  } }).forFrame("reserve-flow");
  const timeline = { from() {} };

  assert.throws(
    () => timing.from(timeline, "execute", "#other", { duration: 0.7 }),
    /matching declaration/,
  );
  assert.throws(
    () => timing.from(timeline, "execute", "#execute", { duration: 0.6 }),
    /duration mismatch/,
  );
});

test("inserts generated timing before authored scripts and finalizes after them", () => {
  const prepared = prepareFrameVisualTiming({
    frame: FRAME_WITH_EXECUTE_BEAT,
    authoredHtml: frameHtml(`
      <div id="execute" data-md2vid-beat="execute"></div>
      <script data-authored>window.__timelines = window.__timelines || {}; window.__timelines["reserve-flow"] = gsap.timeline({ paused: true });</script>
    `),
    documentPath: DOCUMENT_PATH,
    mode: "required",
  });
  const prefix = prepared.html.indexOf("window.__md2vidTiming");
  const authored = prepared.html.indexOf("data-authored");
  const finalizer = prepared.html.lastIndexOf("window.__timelines[\"reserve-flow\"]");

  assert.ok(prefix >= 0 && prefix < authored);
  assert.ok(authored < finalizer);
  assert.match(prepared.html, /const timeline = window\.__timelines\["reserve-flow"\]/);
});

test("required mode rejects invalid declarative bindings", () => {
  const cases: Array<[string, RegExp]> = [
    [frameHtml('<div id="execute" data-md2vid-beat="unknown"></div>'), /unknown beat "unknown"/],
    [frameHtml('<div id="execute" data-md2vid-beat="execute" data-md2vid-enter="spin"></div>'), /unsupported entrance token/],
    [frameHtml('<div data-md2vid-beat="execute"></div>'), /unique non-empty id/],
    [frameHtml('<div id="execute" data-md2vid-beat="execute" data-md2vid-duration="-1"></div>'), /non-negative duration/],
  ];

  for (const [authoredHtml, expected] of cases) {
    assert.throws(
      () => prepareFrameVisualTiming({
        frame: FRAME_WITH_EXECUTE_BEAT,
        authoredHtml,
        documentPath: DOCUMENT_PATH,
        mode: "required",
      }),
      expected,
    );
  }
});

test("required mode rejects invalid custom declarations and duplicate targets", () => {
  const declaration = (value: string) => frameHtml(`
    <div id="execute"></div>
    <script type="application/json" data-md2vid-custom-bindings>${value}</script>
  `);
  const cases: Array<[string, RegExp]> = [
    [declaration('{"bindings":[{"beat":"unknown","target":"#execute","method":"from","duration":0.7}]}'), /unknown beat "unknown"/],
    [declaration('{"bindings":[{"beat":"execute","target":"#execute","method":"to","duration":0.7}]}'), /unsupported custom method/],
    [declaration('{"bindings":[{"beat":"execute","target":"#missing","method":"from","duration":0.7}]}'), /does not match an element id/],
    [declaration('{"bindings":[{"beat":"execute","target":"#execute","method":"from","duration":-0.7}]}'), /non-negative duration/],
    [declaration('{"bindings":[{"beat":"execute","target":"#execute","method":"from","duration":0.7},{"beat":"execute","target":"#execute","method":"from","duration":0.7}]}'), /duplicate custom declaration/],
  ];

  for (const [authoredHtml, expected] of cases) {
    assert.throws(
      () => prepareFrameVisualTiming({
        frame: FRAME_WITH_EXECUTE_BEAT,
        authoredHtml,
        documentPath: DOCUMENT_PATH,
        mode: "required",
      }),
      expected,
    );
  }
});

test("beat attributes without planned beats fail in required mode and warn mode leaves source untouched", () => {
  const frameWithoutBeats = { ...FRAME_WITH_EXECUTE_BEAT, visualBeats: undefined };
  const authoredHtml = frameHtml('<div id="execute" data-md2vid-beat="execute"></div>');

  assert.throws(
    () => prepareFrameVisualTiming({
      frame: frameWithoutBeats,
      authoredHtml,
      documentPath: DOCUMENT_PATH,
      mode: "required",
    }),
    /no planned visual beats/,
  );

  const prepared = prepareFrameVisualTiming({
    frame: frameWithoutBeats,
    authoredHtml,
    documentPath: DOCUMENT_PATH,
    mode: "warn",
  });
  assert.deepEqual(prepared.bindings, []);
  assert.equal(prepared.html, authoredHtml);
});
