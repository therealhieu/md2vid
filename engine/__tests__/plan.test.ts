// Unit tests for the neutral plan() — timeline layout, cues, caption globalization.

import { test } from "node:test";
import assert from "node:assert/strict";
import { plan } from "../plan.ts";

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
    /missing an entry for voice id/
  );
});

test("wordless voices hard-fail", () => {
  assert.throws(() => plan(meta([V("01", 5, [])]), CFG()), /voices with no words/);
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

test("whisper clamp keeps a padded final word inside [0, voiceDur]", () => {
  // last word ends at 12 but voiceDur is 10 → must clamp to frame.start+10, not spill.
  const p = plan(
    meta([
      V("01", 10, [
        { text: "one", start: 0, end: 1 },
        { text: "pad", start: 9, end: 12 },
      ]),
      V("02", 8, [{ text: "next", start: 0, end: 1 }]),
    ]),
    CFG({ timing: { gap: 0, xfade: 0.5 } })
  );
  const g1 = p.captionGroups[0];
  assert.equal(g1.words[1].end, 10); // clamped to voiceDur, not 12
  // second frame starts at 10, so its first word (10) is not before g1's clamped end (10)
  assert.ok(p.captionGroups[1].words[0].start >= g1.words[1].end);
});
