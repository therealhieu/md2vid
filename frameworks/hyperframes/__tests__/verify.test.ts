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

  if (index !== null) writeFileSync(join(output, "index.html"), index ?? defaultIndex(gsapSrc));
  if (captionsHtml !== null)
    writeFileSync(join(output, "compositions", "captions.html"), captionsHtml ?? bakeCaptions(groups ?? DEFAULT_GROUPS, gsapSrc));
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
const embeddedCaptions = (groups: any) => `<template id="captions-template" data-composition-id="captions"><div data-composition-id="captions"><script>
  var GROUPS = ${JSON.stringify(groups)};
window.__timelines["captions"] = gsap.timeline({ paused: true });</script></div></template>`;
const defaultIndex = (gsapSrc = DEFAULT_GSAP_SRC, groups: any = DEFAULT_GROUPS) => `<div data-composition-id="main"></div>
<script src="${gsapSrc}"></script>
<script>window.__timelines["main"] = 1;</script>
${embeddedCaptions(groups)}`;
const bakeCaptions = (groups: any, gsapSrc = DEFAULT_GSAP_SRC) => `<template id="captions-template" data-composition-id="captions">
<div data-composition-id="captions">
<script src="${gsapSrc}"></script>
<style>.caption-word { opacity: 1; }</style>
<div id="caption-stage"></div>
<script>
  var GROUPS = ${JSON.stringify(groups)};
  var DURATION = 1;
  window.__timelines = window.__timelines || {};
  window.__timelines["captions"] = gsap.timeline({ paused: true });</script>
</div>
</template>`;

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

test("accepts the configured project-root-relative GSAP source unchanged in an authored frame", () => {
  const gsapSrc = "assets/gsap/gsap.min.js";
  const frameHtml = `<script src="assets/gsap/gsap.min.js"></script>\n<script>gsap.timeline();</script>\n`;
  const { root, output } = makeVideo({ gsapSrc, frameHtml });
  try {
    mkdirSync(join(output, "assets", "gsap"), { recursive: true });
    writeFileSync(join(output, gsapSrc), "CUSTOM GSAP\n");
    assert.deepEqual(errs(verify(output)), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a stale GSAP source in generated index.html", () => {
  const gsapSrc = "assets/gsap/gsap.min.js";
  const { root, output } = makeVideo({
    gsapSrc,
    index: defaultIndex("assets/gsap/stale.js"),
  });
  try {
    mkdirSync(join(output, "assets", "gsap"), { recursive: true });
    writeFileSync(join(output, gsapSrc), "CUSTOM GSAP\n");
    const messages = errs(verify(output));
    assert.ok(messages.some((message) => message.includes("index.html") && message.includes("configured GSAP source")), JSON.stringify(messages));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects caption initialization outside the captions composition root", () => {
  const captionsHtml = `<template id="captions-template" data-composition-id="captions">
<div data-composition-id="captions"><script src="${DEFAULT_GSAP_SRC}"></script><div id="caption-stage"></div></div>
<script>
  var GROUPS = ${JSON.stringify(DEFAULT_GROUPS)};
  window.__timelines = window.__timelines || {};
  window.__timelines["captions"] = gsap.timeline({ paused: true });
</script>
</template>`;
  const { root, output } = makeVideo({ captionsHtml });
  try {
    const messages = errs(verify(output));
    assert.ok(messages.some((message) => message.includes("caption initialization") && message.includes("inside")), JSON.stringify(messages));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a stale GSAP source in generated captions.html", () => {
  const gsapSrc = "assets/gsap/gsap.min.js";
  const { root, output } = makeVideo({
    gsapSrc,
    captionsHtml: bakeCaptions(DEFAULT_GROUPS, "assets/gsap/stale.js"),
  });
  try {
    mkdirSync(join(output, "assets", "gsap"), { recursive: true });
    writeFileSync(join(output, gsapSrc), "CUSTOM GSAP\n");
    const messages = errs(verify(output));
    assert.ok(messages.some((message) => message.includes("compositions/captions.html") && message.includes("configured GSAP source")), JSON.stringify(messages));
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
      gsapSrc: "assets/gsap/gsap.min.js",
      frameHtml: '<script src="assets/gsap/other-gsap.js"></script><script>gsap.timeline();</script>',
    },
    {
      name: "local override transformed to parent traversal",
      gsapSrc: "assets/gsap/gsap.min.js",
      frameHtml: '<script src="../../assets/gsap/gsap.min.js"></script><script>gsap.timeline();</script>',
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
        mkdirSync(join(output, "assets", "gsap"), { recursive: true });
        writeFileSync(join(output, entry.gsapSrc), "CUSTOM GSAP\n");
        writeFileSync(join(output, "assets", "gsap", "other-gsap.js"), "OTHER GSAP\n");
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

test("flags embedded captions-template GROUPS that differ from staged JSON", () => {
  const embeddedGroups = [{ ...DEFAULT_GROUPS[0], text: "stale embedded" }];
  const index = defaultIndex(DEFAULT_GSAP_SRC, embeddedGroups);
  const { root, output } = makeVideo({ index });
  try {
    const findings = verifyHyperframesCaptionArtifact({
      sharedDir: join(root, "shared"),
      outputDir: output,
      captionGroupsPath: join(root, "shared", "caption_groups.json"),
    });
    assert.ok(errs(findings).some((message) => message.includes("embedded captions-template") && message.includes("out of sync")), JSON.stringify(findings));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("duplicate top-level captions templates produce an explicit ambiguity finding", () => {
  const index = `${embeddedCaptions(DEFAULT_GROUPS)}\n${embeddedCaptions(DEFAULT_GROUPS)}`;
  const { root, output } = makeVideo({ index });
  try {
    const findings = verifyHyperframesCaptionArtifact({
      sharedDir: join(root, "shared"),
      outputDir: output,
      captionGroupsPath: join(root, "shared", "caption_groups.json"),
    });
    assert.ok(
      errs(findings).some((message) => message.includes("multiple top-level") && message.includes("captions-template")),
      JSON.stringify(findings),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("nested captions-template decoys cannot hide stale top-level runtime captions", () => {
  const staleGroups = [{ ...DEFAULT_GROUPS[0], text: "stale runtime captions" }];
  const nestedDecoy = `<template id="frame-template"><div data-composition-id="frame">${embeddedCaptions(DEFAULT_GROUPS)}</div></template>`;
  const index = `${nestedDecoy}\n${embeddedCaptions(staleGroups)}`;
  const { root, output } = makeVideo({ index });
  try {
    const findings = verifyHyperframesCaptionArtifact({
      sharedDir: join(root, "shared"),
      outputDir: output,
      captionGroupsPath: join(root, "shared", "caption_groups.json"),
    });
    assert.ok(
      errs(findings).some((message) =>
        message.includes("embedded captions-template") && message.includes("out of sync")
      ),
      JSON.stringify(findings),
    );
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
    assert.ok(errs(verify(output)).some((m: string) => m.includes("captions.html is out of sync")));
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
    writeFileSync(join(outputDir, "index.html"), defaultIndex());

    assert.deepEqual(
      errs(verifyHyperframesCaptionArtifact({ sharedDir, outputDir, captionGroupsPath })),
      [],
    );

    const drifted = [{ ...DEFAULT_GROUPS[0], text: "different" }];
    writeFileSync(join(outputDir, "compositions", "captions.html"), bakeCaptions(drifted));
    const messages = errs(verifyHyperframesCaptionArtifact({ sharedDir, outputDir, captionGroupsPath }));
    assert.ok(messages.some((message) => message.includes("captions.html is out of sync")), JSON.stringify(messages));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Frame-shell contract asserts templates + design docs only (no demo video required).
test("verifyFrameShell: templates and design docs satisfy the contract", () => {
  assert.deepEqual(errs(verifyFrameShell()), []);
});
