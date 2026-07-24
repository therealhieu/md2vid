// Tests for the HyperFrames adapter's verify(): HF layout assertions + the
// JSON<->baked-HTML GROUPS sync check moved out of neutral verify (Task 1.4/2.2).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_GSAP_SRC } from "../scaffold.ts";
import { verify, verifyFrameShell, verifyHyperframesCaptionArtifact } from "../verify.ts";

const errs = (findings: Array<{ level: string; msg: string }>) =>
  findings.filter((f) => f.level === "error").map((f) => f.msg);

// Build a minimal reshaped HF video dir: outputs/<x>/{shared,hyperframes}. Returns
// the hyperframes (output) dir. `opts` toggles what to write so tests can omit pieces.
function makeVideo({ index, captionsHtml, groups, claude, gsapSrc = DEFAULT_GSAP_SRC, frameHtml }: any = {}) {
  const root = mkdtempSync(join(tmpdir(), "hfverify-"));
  const shared = join(root, "shared");
  const output = join(root, "hyperframes");
  mkdirSync(shared, { recursive: true });
  mkdirSync(join(output, "compositions", "frames"), { recursive: true });

  if (index !== null) writeFileSync(join(output, "index.html"), index ?? DEFAULT_INDEX);
  if (captionsHtml !== null)
    writeFileSync(join(output, "compositions", "captions.html"), captionsHtml ?? bakeCaptions(groups ?? DEFAULT_GROUPS));
  if (groups !== null)
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: groups ?? DEFAULT_GROUPS }));
  if (claude !== null) writeFileSync(join(output, "CLAUDE.md"), claude ?? "@../../../docs/standards/frameworks/hyperframes.md\n");
  writeFileSync(join(output, "AGENTS.md"), "@../../../docs/standards/frameworks/hyperframes.md\n");
  writeFileSync(
    join(output, "output.config.json"),
    `${JSON.stringify({ framework: "hyperframes", gsapSrc }, null, 2)}\n`,
  );
  if (frameHtml !== undefined) {
    writeFileSync(join(output, "compositions", "frames", "01-frame.html"), frameHtml);
  }
  return { root, output };
}

const DEFAULT_GROUPS = [{ id: "caption-group-0", frame: 1, start: 0, end: 1, text: "hi", words: [{ id: "w", text: "hi", start: 0, end: 1 }] }];
const DEFAULT_INDEX = `<div data-composition-id="main"></div>
<script>window.__timelines["main"] = 1;</script>`;
const bakeCaptions = (groups: any) => `  var GROUPS = ${JSON.stringify(groups)};\n  var DURATION = 1;`;

test("passes a well-formed HF video", () => {
  const { root, output } = makeVideo();
  try {
    assert.deepEqual(errs(verify(output)), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("flags a missing index.html", () => {
  const { root, output } = makeVideo({ index: null });
  try {
    assert.ok(errs(verify(output)).some((m: string) => m.includes("missing index.html")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("flags index mounting a frame not on disk", () => {
  const idx = `<div data-composition-src="compositions/frames/99-ghost.html"></div>
<script>window.__timelines["main"] = 1;</script>`;
  const { root, output } = makeVideo({ index: idx });
  try {
    assert.ok(errs(verify(output)).some((m: string) => m.includes("frames not on disk")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("flags a CLAUDE.md missing the HF @import", () => {
  const { root, output } = makeVideo({ claude: "# no import here\n" });
  try {
    assert.ok(errs(verify(output)).some((m: string) => m.includes("does not @import")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts the configured local GSAP target resolved from an authored frame", () => {
  const gsapSrc = "runtime/custom-gsap.js";
  const frameHtml = `<script src="../../runtime/custom-gsap.js"></script>\n<script>gsap.timeline();</script>\n`;
  const { root, output } = makeVideo({ gsapSrc, frameHtml });
  try {
    mkdirSync(join(output, "runtime"), { recursive: true });
    writeFileSync(join(output, gsapSrc), "CUSTOM GSAP\n");
    assert.deepEqual(errs(verify(output)), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("requires exactly the configured GSAP source in authored frames", () => {
  const cases = [
    {
      name: "default CDN to another CDN",
      gsapSrc: DEFAULT_GSAP_SRC,
      frameHtml: '<script src="https://cdn.example.test/gsap.min.js"></script><script>gsap.timeline();</script>',
    },
    {
      name: "unquoted HTTPS source",
      gsapSrc: DEFAULT_GSAP_SRC,
      frameHtml: '<script src=https://cdn.example.test/gsap.min.js></script><script>gsap.timeline();</script>',
    },
    {
      name: "protocol-relative source",
      gsapSrc: DEFAULT_GSAP_SRC,
      frameHtml: '<script src=//cdn.example.test/gsap.min.js></script><script>gsap.timeline();</script>',
    },
    {
      name: "local override to different local file",
      gsapSrc: "runtime/custom-gsap.js",
      frameHtml: '<script src="../../runtime/other-gsap.js"></script><script>gsap.timeline();</script>',
    },
    {
      name: "data-src decoy",
      gsapSrc: DEFAULT_GSAP_SRC,
      frameHtml: `<script data-src="${DEFAULT_GSAP_SRC}"></script><script>gsap.timeline();</script>`,
    },
    {
      name: "prefixed src decoy",
      gsapSrc: DEFAULT_GSAP_SRC,
      frameHtml: `<script x-src="${DEFAULT_GSAP_SRC}"></script><script>gsap.timeline();</script>`,
    },
    {
      name: "bound src decoy",
      gsapSrc: DEFAULT_GSAP_SRC,
      frameHtml: `<script :src="${DEFAULT_GSAP_SRC}"></script><script>gsap.timeline();</script>`,
    },
    {
      name: "attribute value decoy",
      gsapSrc: DEFAULT_GSAP_SRC,
      frameHtml: `<script nonce="x src='${DEFAULT_GSAP_SRC}'"></script><script>gsap.timeline();</script>`,
    },
    {
      name: "commented script decoy",
      gsapSrc: DEFAULT_GSAP_SRC,
      frameHtml: `<!-- <script src="${DEFAULT_GSAP_SRC}"></script> --><script>gsap.timeline();</script>`,
    },
    {
      name: "missing configured source",
      gsapSrc: DEFAULT_GSAP_SRC,
      frameHtml: '<script>gsap.timeline();</script>',
    },
    {
      name: "duplicate configured source",
      gsapSrc: DEFAULT_GSAP_SRC,
      frameHtml: `<script src="${DEFAULT_GSAP_SRC}"></script><script src='${DEFAULT_GSAP_SRC}'></script><script>gsap.timeline();</script>`,
    },
    {
      name: "configured source plus conflicting CDN",
      gsapSrc: DEFAULT_GSAP_SRC,
      frameHtml: `<script src="${DEFAULT_GSAP_SRC}"></script><script src="https://cdn.example.test/gsap.min.js"></script><script>gsap.timeline();</script>`,
    },
  ];

  for (const entry of cases) {
    const { root, output } = makeVideo({ gsapSrc: entry.gsapSrc, frameHtml: entry.frameHtml });
    const frame = join(output, "compositions", "frames", "01-frame.html");
    try {
      if (entry.gsapSrc !== DEFAULT_GSAP_SRC) {
        mkdirSync(join(output, "runtime"), { recursive: true });
        writeFileSync(join(output, entry.gsapSrc), "CUSTOM GSAP\n");
        writeFileSync(join(output, "runtime", "other-gsap.js"), "OTHER GSAP\n");
      }
      const before = readFileSync(frame, "utf8");
      const messages = errs(verify(output));
      assert.ok(
        messages.some((message) => message.includes("configured GSAP source")),
        `${entry.name}: ${JSON.stringify(messages)}`,
      );
      assert.equal(readFileSync(frame, "utf8"), before, "verification must not overwrite authored frames");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("flags invalid local gsapSrc configuration", () => {
  for (const gsapSrc of [
    null,
    "",
    "runtime/missing.js",
    "../escape.js",
    "/absolute/gsap.js",
    "https://cdn.example.test/gsap.min.js",
    "runtime\\custom-gsap.js",
    "runtime/custom gsap.js",
    "runtime/custom-gsap.js?debug=1",
    "runtime/custom-gsap.js#fragment",
    "runtime/custom%2dgsap.js",
    "runtime/custom-gsap.css",
    "runtime/custom\"gsap.js",
    "runtime/<custom-gsap>.js",
    "runtime/`custom-gsap`.js",
  ]) {
    const { root, output } = makeVideo({ gsapSrc });
    try {
      const expected = gsapSrc === "runtime/missing.js" ? "missing gsapSrc file" : "invalid gsapSrc";
      assert.ok(errs(verify(output)).some((message) => message.includes(expected)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("flags a JSON<->baked-HTML GROUPS count mismatch", () => {
  const groups = DEFAULT_GROUPS;
  const staleHtml = bakeCaptions([...groups, { id: "extra", frame: 1, start: 1, end: 2, text: "x", words: [] }]);
  const { root, output } = makeVideo({ groups, captionsHtml: staleHtml });
  try {
    assert.ok(errs(verify(output)).some((m: string) => m.includes("out of sync")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("flags baked GROUPS whose content differs from the JSON", () => {
  const groups = DEFAULT_GROUPS;
  const drifted = JSON.parse(JSON.stringify(groups));
  drifted[0].text = "changed";
  const { root, output } = makeVideo({ groups, captionsHtml: bakeCaptions(drifted) });
  try {
    assert.ok(errs(verify(output)).some((m: string) => m.includes("differ in content")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("focused caption verification reports missing and malformed staged HTML", () => {
  const root = mkdtempSync(join(tmpdir(), "hf-caption-verify-"));
  try {
    const sharedDir = join(root, "shared");
    const outputDir = join(root, "hyperframes");
    mkdirSync(sharedDir, { recursive: true });
    mkdirSync(join(outputDir, "compositions"), { recursive: true });
    const captionGroupsPath = join(sharedDir, "caption_groups.json");
    writeFileSync(captionGroupsPath, JSON.stringify({ groups: DEFAULT_GROUPS }));

    let messages = errs(verifyHyperframesCaptionArtifact({ sharedDir, outputDir, captionGroupsPath }));
    assert.ok(messages.some((message) => message.includes("missing staged caption HTML")), JSON.stringify(messages));

    writeFileSync(join(outputDir, "compositions", "captions.html"), "no baked groups\n");
    messages = errs(verifyHyperframesCaptionArtifact({ sharedDir, outputDir, captionGroupsPath }));
    assert.ok(messages.some((message) => message.includes("no `var GROUPS")), JSON.stringify(messages));

    writeFileSync(join(outputDir, "compositions", "captions.html"), "var GROUPS = [bad];\n");
    messages = errs(verifyHyperframesCaptionArtifact({ sharedDir, outputDir, captionGroupsPath }));
    assert.ok(messages.some((message) => message.includes("not valid JSON")), JSON.stringify(messages));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("focused caption verification compares explicit staged paths", () => {
  const root = mkdtempSync(join(tmpdir(), "hf-caption-verify-match-"));
  try {
    const sharedDir = join(root, "shared");
    const outputDir = join(root, "hyperframes");
    mkdirSync(sharedDir, { recursive: true });
    mkdirSync(join(outputDir, "compositions"), { recursive: true });
    const captionGroupsPath = join(sharedDir, "custom-caption-groups.json");
    writeFileSync(captionGroupsPath, JSON.stringify({ groups: DEFAULT_GROUPS }));
    writeFileSync(join(outputDir, "compositions", "captions.html"), bakeCaptions(DEFAULT_GROUPS));

    assert.deepEqual(
      errs(verifyHyperframesCaptionArtifact({ sharedDir, outputDir, captionGroupsPath })),
      [],
    );

    const drifted = [{ ...DEFAULT_GROUPS[0], text: "different" }];
    writeFileSync(join(outputDir, "compositions", "captions.html"), bakeCaptions(drifted));
    const messages = errs(verifyHyperframesCaptionArtifact({ sharedDir, outputDir, captionGroupsPath }));
    assert.ok(messages.some((message) => message.includes("differ in content")), JSON.stringify(messages));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Frame-shell contract asserts templates + design docs only (no demo video required).
test("verifyFrameShell: templates and design docs satisfy the contract", () => {
  assert.deepEqual(errs(verifyFrameShell()), []);
});
