// verifyNeutral unit tests — each neutral invariant flagged; a clean plan passes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyNeutral } from "../verify.ts";

const errs = (findings: any) => findings.filter((f: any) => f.level === "error").map((f: any) => f.msg);

// A small, clean set of well-grouped multi-word caption groups in frame order.
function cleanGroups() {
  return [
    {
      id: "caption-group-0",
      frame: 1,
      start: 0,
      end: 1.2,
      text: "hello there friend",
      words: [
        { id: "w0", text: "hello", start: 0, end: 0.4 },
        { id: "w1", text: "there", start: 0.4, end: 0.8 },
        { id: "w2", text: "friend", start: 0.8, end: 1.2 },
      ],
    },
    {
      id: "caption-group-1",
      frame: 2,
      start: 2,
      end: 3.0,
      text: "good to see you",
      words: [
        { id: "w0", text: "good", start: 2.0, end: 2.3 },
        { id: "w1", text: "to", start: 2.3, end: 2.5 },
        { id: "w2", text: "see", start: 2.5, end: 2.8 },
        { id: "w3", text: "you", start: 2.8, end: 3.0 },
      ],
    },
  ];
}

test("clean groups produce no errors", () => {
  assert.deepEqual(errs(verifyNeutral(cleanGroups())), []);
});

test("empty groups is an error", () => {
  assert.ok(errs(verifyNeutral([])).some((m: string) => /no groups/.test(m)));
});

test("flags a non-monotonic global timeline", () => {
  const g = cleanGroups();
  // make the 2nd group start before the 1st group's last word
  g[1].words[0].start = 0.5;
  g[1].start = 0.5;
  assert.ok(
    errs(verifyNeutral(g)).some((m: string) => /backwards/.test(m)),
    "expected a backwards-timeline error"
  );
});

test("flags groups out of frame order", () => {
  const g = cleanGroups();
  g[0].frame = 5; // now [5, 2] — not sorted
  assert.ok(errs(verifyNeutral(g)).some((m: string) => /frame order/.test(m)));
});

test("flags too many single-word groups (under-grouping)", () => {
  // 3 groups, 2 single-word => 66% > 15%
  const g = [
    { id: "g0", frame: 1, start: 0, end: 0.3, text: "one", words: [{ text: "one", start: 0, end: 0.3 }] },
    { id: "g1", frame: 1, start: 0.3, end: 0.6, text: "two", words: [{ text: "two", start: 0.3, end: 0.6 }] },
    {
      id: "g2",
      frame: 1,
      start: 0.6,
      end: 1.2,
      text: "three four",
      words: [
        { text: "three", start: 0.6, end: 0.9 },
        { text: "four", start: 0.9, end: 1.2 },
      ],
    },
  ];
  assert.ok(errs(verifyNeutral(g)).some((m: string) => /single words/.test(m)));
});

test("flags a line past the hard-max char ceiling", () => {
  const long = "supercalifragilisticexpialidocious antidisestablishmentarianism pneumonoultramicroscopic";
  const words = long.split(" ").map((t, i) => ({ text: t, start: i * 0.5, end: i * 0.5 + 0.4 }));
  const g = [
    {
      id: "g0",
      frame: 1,
      start: words[0].start,
      end: words[words.length - 1].end,
      text: long,
      words,
    },
  ];
  assert.ok(errs(verifyNeutral(g)).some((m: string) => /hard max/.test(m)));
});

test("flags group start/end that do not bound its words", () => {
  const g = cleanGroups();
  g[0].start = 99; // no longer equals first word start
  assert.ok(errs(verifyNeutral(g)).some((m: string) => /start != first word start/.test(m)));
});
