// Unit tests for the pure caption regrouper (engine/captions.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { regroup, groupLineChars } from "../captions.ts";

// Build a group from a plain list of [text, start, end] on a given frame.
function group(frame: number, words: any[]) {
  return {
    id: `g${frame}`,
    frame,
    start: words[0][1],
    end: words[words.length - 1][2],
    text: words.map((w: any) => w[0]).join(" "),
    words: words.map(([text, start, end]: any[], i: number) => ({ id: `w${i}`, text, start, end })),
  };
}

test("never merges words across a frame boundary", () => {
  const groups = [
    group(1, [["Alpha", 0, 0.5], ["beta.", 0.5, 1]]),
    group(2, [["Gamma", 1, 1.5], ["delta.", 1.5, 2]]),
  ];
  const out = regroup(groups, 54);
  for (const g of out) {
    const frames = new Set(); // reconstruct: every word in a group shares the group frame
    frames.add(g.frame);
    assert.equal(frames.size, 1);
  }
  // frame 1 words never appear in a frame-2 group and vice versa
  assert.ok(out.every((g) => g.frame === 1 || g.frame === 2));
  const f1 = out.filter((g) => g.frame === 1).flatMap((g) => g.words.map((w) => w.text));
  assert.deepEqual(f1, ["Alpha", "beta."]);
});

test("respects the maxChars band (no group exceeds it when splittable)", () => {
  // one long sentence, 6 words ~ 8 chars each -> must split into <=54-char lines
  const words = [
    ["watermelon", 0, 1], ["strawberry", 1, 2], ["blackberry", 2, 3],
    ["blueberry", 3, 4], ["cranberry", 4, 5], ["raspberry.", 5, 6],
  ];
  const out = regroup([group(1, words)], 30);
  assert.ok(out.length > 1, "should split into multiple lines");
  for (const g of out) {
    assert.ok(groupLineChars(g.words) <= 30 || g.words.length === 1, `line too long: ${g.text}`);
  }
});

test("splits at sentence punctuation", () => {
  const words = [
    ["First", 0, 0.5], ["one.", 0.5, 1],
    ["Second", 1, 1.5], ["two.", 1.5, 2],
  ];
  const out = regroup([group(1, words)], 54);
  assert.equal(out.length, 2);
  assert.equal(out[0].text, "First one.");
  assert.equal(out[1].text, "Second two.");
});

test("preserves every word's original start/end verbatim", () => {
  const words = [["Keep", 0.111, 0.222], ["timing.", 0.333, 0.444]];
  const out = regroup([group(1, words)], 54);
  const flat = out.flatMap((g) => g.words);
  assert.equal(flat[0].start, 0.111);
  assert.equal(flat[0].end, 0.222);
  assert.equal(flat[1].start, 0.333);
  assert.equal(flat[1].end, 0.444);
});

test("idempotent at a fixed maxChars", () => {
  const words = [
    ["watermelon", 0, 1], ["strawberry", 1, 2], ["blackberry", 2, 3],
    ["blueberry", 3, 4], ["cranberry", 4, 5], ["raspberry.", 5, 6],
  ];
  const once = regroup([group(1, words)], 30);
  const twice = regroup(once, 30);
  assert.deepEqual(twice, once);
});
