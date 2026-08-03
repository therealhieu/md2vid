// Tests for the HyperFrames adapter's verify(): HF layout assertions + the
// JSON<->baked-HTML GROUPS sync check moved out of neutral verify (Task 1.4/2.2).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_GSAP_SRC } from "../scaffold.ts";
import { getAdapter } from "../../index.ts";
import { resolveVerificationFps, verify, verifyFrameShell, verifyHyperframesCaptionArtifact } from "../verify.ts";
import type {
  AdapterVerifyContext,
  BuildPlan,
  VisualBindingManifest,
  VisualBindingManifestV1,
} from "../../../engine/types.ts";

const errs = (findings: Array<{ level: string; msg: string }>) =>
  findings.filter((f) => f.level === "error").map((f) => f.msg);

// Build a minimal reshaped HF video dir: outputs/<x>/{shared,hyperframes}. Returns
// the hyperframes (output) dir. `opts` toggles what to write so tests can omit pieces.
function makeVideo({
  index,
  captionsHtml,
  groups,
  claude,
  gsapSrc = DEFAULT_GSAP_SRC,
  frameHtml,
  videoConfig,
  visualContract,
  outputConfigText,
}: any = {}) {
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
  if (videoConfig !== undefined) {
    writeFileSync(join(shared, "video.config.json"), `${JSON.stringify(videoConfig, null, 2)}\n`);
  }
  if (claude !== null) writeFileSync(join(output, "CLAUDE.md"), claude ?? "@../../../docs/standards/frameworks/hyperframes.md\n");
  writeFileSync(join(output, "AGENTS.md"), "@../../../docs/standards/frameworks/hyperframes.md\n");
  writeFileSync(
    join(output, "output.config.json"),
    outputConfigText ?? `${JSON.stringify({ framework: "hyperframes", gsapSrc, ...(visualContract ? { visualContract } : {}) }, null, 2)}\n`,
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

const visualFrame = ({
  theme,
  ground,
}: {
  theme?: "light" | "dark";
  ground: string;
}) => `<template>
<div id="frame-01-frame" data-composition-id="01-frame"${theme ? ` data-frame-theme="${theme}"` : ""}>
  <style>
    #frame-01-frame { position: absolute; inset: 0; color: #141413; }
    #frame-01-frame .ground { position: absolute; inset: 0; background: ${ground}; }
  </style>
  <div class="clip ground" data-track-index="0"></div>
</div>
</template>`;

const warns = (findings: Array<{ level: string; msg: string }>) =>
  findings.filter((finding) => finding.level === "warn").map((finding) => finding.msg);

function semanticPlan(): BuildPlan {
  return {
    version: 1,
    canvas: { width: 1920, height: 1080 },
    timing: { tail: 0.5, xfade: 0.5, gap: 0 },
    totalDuration: 2.5,
    frames: [{
      id: "reserve-flow",
      frameNum: 1,
      slug: "reserve-flow",
      voicePath: "assets/voice/reserve-flow.wav",
      voiceDur: 2,
      frameDur: 2.5,
      start: 0,
      words: [],
      visualBeats: [{
        version: 1,
        id: "execute",
        text: "Execute",
        start: 1,
        cueWordIndex: 0,
        cueText: "Execute",
        sourceRefs: [],
        tolerance: { maxLead: 0.25, maxLag: 0.75 },
      }],
    }],
    captionGroups: [],
  };
}

function semanticIndex(fps: number, hostDuration = 2.5): string {
  return `<script src="${DEFAULT_GSAP_SRC}"></script>
<div data-composition-id="main" data-fps="${fps}">
  <div id="el-reserve-flow" data-composition-id="reserve-flow" data-duration="${hostDuration}"></div>
</div>
<script>window.__timelines["main"] = 1;</script>
${embeddedCaptions(DEFAULT_GROUPS)}`;
}

function semanticManifest(
  overrides: Partial<VisualBindingManifestV1> = {},
): VisualBindingManifestV1 {
  return {
    version: 1,
    framework: "hyperframes",
    bindings: [{
      frameSlug: "reserve-flow",
      beatId: "execute",
      target: "#execute",
      revealStart: 1,
      revealDuration: 0.25,
      source: "declarative",
      authoredDuration: 2,
      outerDuration: 2.5,
    }],
    ...overrides,
  };
}

function semanticContext(output: string, fps: number, bindings?: VisualBindingManifest): AdapterVerifyContext {
  return {
    plan: semanticPlan(),
    videoDir: output,
    sharedDir: join(output, "..", "shared"),
    config: { framework: "hyperframes" },
    policy: {
      mode: "required",
      coverageMode: "warn",
      maxLead: 0.25,
      maxLag: 0.75,
      maxUncoveredGap: 0.5,
      minLanding: 0.5,
    },
    fps,
    bindings,
  };
}

test("passes a well-formed HF video", () => {
  const { root, output } = makeVideo();
  try {
    assert.deepEqual(errs(verify(output)), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verifies semantic binding manifests against the current plan", () => {
  const { root, output } = makeVideo({ index: semanticIndex(30) });
  try {
    assert.deepEqual(errs(verify(semanticContext(output, 30, semanticManifest()))), []);

    const missing = errs(verify(semanticContext(output, 30)));
    assert.ok(missing.some((message) => message.includes("visual binding manifest is missing")), JSON.stringify(missing));

    const early = errs(verify(semanticContext(output, 30, semanticManifest({
      bindings: [{ ...semanticManifest().bindings[0], revealStart: 0.2 }],
    }))));
    assert.ok(early.some((message) => message.includes("lead is 0.800s")), JSON.stringify(early));

    const unknown = errs(verify(semanticContext(output, 30, semanticManifest({
      bindings: [{ ...semanticManifest().bindings[0], beatId: "stale" }],
    }))));
    assert.ok(unknown.some((message) => message.includes("unknown beat \"stale\"")), JSON.stringify(unknown));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("registered HyperFrames adapter preserves semantic verification context", () => {
  const { root, output } = makeVideo({ index: semanticIndex(30) });
  try {
    const findings = getAdapter("hyperframes").verify(semanticContext(output, 30));
    assert.ok(errs(findings).some((message) => message.includes("visual binding manifest is missing")), JSON.stringify(findings));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reads emitted host duration for planned frames without visual bindings", () => {
  const { root, output } = makeVideo({ index: semanticIndex(30, 2.4) });
  try {
    const bindings = semanticManifest({
      bindings: [],
      frames: [{ frameSlug: "reserve-flow", authoredDuration: 1.9 }],
    });
    const messages = errs(verify(semanticContext(output, 30, bindings)));
    assert.ok(messages.some((message) => message.includes("has no visual binding")), JSON.stringify(messages));
    assert.ok(messages.some((message) => message.includes("authored duration")), JSON.stringify(messages));
    assert.ok(messages.some((message) => message.includes("outer duration")), JSON.stringify(messages));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uses main-root FPS even when captions advertise a conflicting FPS", () => {
  const index = semanticIndex(24).replace(
    'data-composition-id="captions"',
    'data-composition-id="captions" data-fps="60"',
  );
  const { root, output } = makeVideo({ index });
  try {
    assert.equal(resolveVerificationFps({}, output), 24);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uses main-root FPS and frame quantization when checking binding durations", () => {
  const { root, output } = makeVideo({ index: semanticIndex(24) });
  try {
    assert.equal(resolveVerificationFps({}, output), 24);
    const nonAligned = semanticManifest({
      bindings: [{ ...semanticManifest().bindings[0], authoredDuration: 2.019 }],
    });
    assert.deepEqual(errs(verify(semanticContext(output, 24, nonAligned))), []);
    const atSixty = errs(verify(semanticContext(output, 60, nonAligned)));
    assert.ok(atSixty.some((message) => message.includes("authored duration") && message.includes("at 60 FPS")), JSON.stringify(atSixty));

    writeFileSync(join(output, "index.html"), semanticIndex(60));
    assert.equal(resolveVerificationFps({}, output), 60);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verifies explicit light authored-frame theme and caption contrast", () => {
  const { root, output } = makeVideo({
    frameHtml: visualFrame({ theme: "light", ground: "#FAF9F5" }),
    videoConfig: { captions: { tokens: { "--cap-ink": "#141413" } } },
  });
  try {
    const findings = verify(output, join(root, "shared"));
    assert.deepEqual(errs(findings), []);
    assert.equal(
      findings.some((finding) => finding.msg.includes("frame_theme_") || finding.msg.includes("caption_contrast_")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a declared light frame with a near-black full-canvas ground", () => {
  const { root, output } = makeVideo({
    frameHtml: visualFrame({ theme: "light", ground: "#1b1a18" }),
    videoConfig: { captions: { tokens: { "--cap-ink": "#141413" } } },
  });
  try {
    const messages = errs(verify(output, join(root, "shared")));
    assert.ok(
      messages.some((message) =>
        message.includes("frame_theme_mismatch") &&
        message.includes("frame=01-frame") &&
        message.includes("declared=light") &&
        message.includes("ground=#1b1a18") &&
        message.includes("detected=dark")
      ),
      JSON.stringify(messages),
    );
    assert.ok(
      messages.some((message) =>
        message.includes("caption_contrast_insufficient") &&
        message.includes("foreground=#141413") &&
        message.includes("background=#1b1a18") &&
        message.includes("threshold=4.50")
      ),
      JSON.stringify(messages),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing visual-contract config fails missing frame-theme metadata by default", () => {
  const { root, output } = makeVideo({
    frameHtml: visualFrame({ ground: "#FAF9F5" }),
  });
  try {
    const findings = verify(output, join(root, "shared"));
    assert.ok(
      errs(findings).some((message) =>
        message.includes("frame_theme_missing") &&
        message.includes("frame=01-frame") &&
        message.includes("compatibility=strict")
      ),
      JSON.stringify(findings),
    );
    assert.deepEqual(warns(findings).filter((message) => message.includes("frame_theme_missing")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validated legacy inference config downgrades missing frame-theme metadata", () => {
  const { root, output } = makeVideo({
    frameHtml: visualFrame({ ground: "#FAF9F5" }),
    visualContract: {
      version: 1,
      projectTheme: "light",
      allowMixedThemes: false,
      allowLegacyThemeInference: true,
    },
  });
  try {
    const findings = verify(output, join(root, "shared"));
    assert.deepEqual(errs(findings), []);
    assert.ok(
      warns(findings).some((message) =>
        message.includes("frame_theme_missing") &&
        message.includes("frame=01-frame") &&
        message.includes("compatibility=legacy-warning")
      ),
      JSON.stringify(findings),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("versioned visual-contract config requires explicit frame-theme metadata", () => {
  const { root, output } = makeVideo({
    frameHtml: visualFrame({ ground: "#FAF9F5" }),
    visualContract: { version: 1, projectTheme: "light", allowMixedThemes: false, allowLegacyThemeInference: false },
  });
  try {
    const messages = errs(verify(output, join(root, "shared")));
    assert.ok(
      messages.some((message) =>
        message.includes("frame_theme_missing") &&
        message.includes("frame=01-frame") &&
        message.includes("compatibility=strict")
      ),
      JSON.stringify(messages),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("direct verify rejects a present unsupported visual-contract version", () => {
  const { root, output } = makeVideo({
    frameHtml: visualFrame({ ground: "#FAF9F5" }),
    visualContract: { version: 2, projectTheme: "light", allowMixedThemes: false, allowLegacyThemeInference: false },
  });
  try {
    const findings = verify(output, join(root, "shared"));
    assert.ok(
      errs(findings).some((message) =>
        message.includes("invalid configuration") &&
        message.includes("output.config.json") &&
        message.includes("visualContract.version")
      ),
      JSON.stringify(findings),
    );
    assert.equal(findings.some((finding) => finding.msg.includes("frame_theme_missing")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("direct verify rejects malformed output configuration without legacy downgrade", () => {
  const { root, output } = makeVideo({
    frameHtml: visualFrame({ ground: "#FAF9F5" }),
    outputConfigText: "{bad json\n",
  });
  try {
    const findings = verify(output, join(root, "shared"));
    assert.ok(
      errs(findings).some((message) =>
        message.includes("invalid configuration at") && message.includes("output.config.json")
      ),
      JSON.stringify(findings),
    );
    assert.equal(findings.some((finding) => finding.msg.includes("frame_theme_missing")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("versioned visual-contract config supports an explicit dark project", () => {
  const { root, output } = makeVideo({
    frameHtml: visualFrame({ theme: "dark", ground: "#1b1a18" }),
    videoConfig: { captions: { tokens: { "--cap-ink": "#FAF9F5" } } },
    visualContract: { version: 1, projectTheme: "dark", allowMixedThemes: false, allowLegacyThemeInference: false },
  });
  try {
    assert.deepEqual(errs(verify(output, join(root, "shared"))), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("versioned visual-contract config safely enables declared mixed themes", () => {
  const { root, output } = makeVideo({
    frameHtml: visualFrame({ theme: "dark", ground: "#1b1a18" }),
    videoConfig: { captions: { tokens: { "--cap-ink": "#FAF9F5" } } },
    visualContract: { version: 1, projectTheme: "light", allowMixedThemes: true, allowLegacyThemeInference: false },
  });
  try {
    assert.deepEqual(errs(verify(output, join(root, "shared"))), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uses the current captions token config when checking authored-frame contrast", () => {
  const { root, output } = makeVideo({
    frameHtml: visualFrame({ theme: "dark", ground: "#1b1a18" }),
    videoConfig: { captions: { tokens: { "--cap-ink": "#FAF9F5" } } },
  });
  try {
    const messages = errs(verify(output, join(root, "shared")));
    assert.ok(messages.some((message) =>
      message.includes("frame_theme_mismatch") && message.includes("project=light")
    ));
    assert.equal(messages.some((message) => message.includes("caption_contrast_insufficient")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("warns when a dynamic full-canvas ground requires browser visual validation", () => {
  const { root, output } = makeVideo({
    frameHtml: visualFrame({ theme: "light", ground: "var(--frame-bg)" }),
  });
  try {
    const findings = verify(output, join(root, "shared"));
    assert.deepEqual(errs(findings), []);
    assert.ok(
      warns(findings).some((message) =>
        message.includes("visual_contract_browser_required") &&
        message.includes("frame=01-frame") &&
        message.includes("literal-full-canvas-ground-not-found")
      ),
      JSON.stringify(findings),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing composition roots use the configured frame filename in diagnostics", () => {
  const { root, output } = makeVideo({
    frameHtml: "<template><div>missing composition metadata</div></template>",
  });
  try {
    const messages = errs(verify(output, join(root, "shared")));
    assert.ok(
      messages.some((message) =>
        message.includes("frame_theme_missing") && message.includes("frame=01-frame")
      ),
      JSON.stringify(messages),
    );
    assert.equal(messages.some((message) => message.includes("frame=unknown")), false);
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
  const frameHtml = `${visualFrame({ theme: "light", ground: "#FAF9F5" })}\n<script src="assets/gsap/gsap.min.js"></script>\n<script>gsap.timeline();</script>\n`;
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
