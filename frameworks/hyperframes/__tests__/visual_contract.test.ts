import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkAuthoredFrameVisualContract,
  contrastRatio,
  extractFrameTheme,
  parseCssColor,
  relativeLuminance,
} from "../visual_contract.ts";

function authoredFrame({
  slug = "03-latency",
  theme,
  ground = "#faf9f5",
}: {
  slug?: string;
  theme?: "light" | "dark";
  ground?: string;
} = {}): string {
  const themeAttribute = theme ? ` data-frame-theme="${theme}"` : "";
  return `<template>
  <div id="frame-${slug}" data-composition-id="${slug}"${themeAttribute}>
    <style>
      #frame-${slug} { position: absolute; inset: 0; color: #141413; }
      #frame-${slug} .ground { position: absolute; inset: 0; background: ${ground}; }
    </style>
    <div class="clip ground" data-track-index="0"></div>
  </div>
</template>`;
}

const messages = (html: string, options: Parameters<typeof checkAuthoredFrameVisualContract>[1]) =>
  checkAuthoredFrameVisualContract(html, options).map((diagnostic) => diagnostic.message);

test("parseCssColor supports md2vid literal hex colors", () => {
  assert.deepEqual(parseCssColor("#141413"), { red: 20, green: 20, blue: 19, alpha: 1 });
  assert.deepEqual(parseCssColor("#FAF9F5"), { red: 250, green: 249, blue: 245, alpha: 1 });
  assert.deepEqual(parseCssColor("#fff"), { red: 255, green: 255, blue: 255, alpha: 1 });
  assert.deepEqual(parseCssColor("#000f"), { red: 0, green: 0, blue: 0, alpha: 1 });
  assert.throws(() => parseCssColor("not-a-color"), /invalid color/i);
  assert.throws(() => parseCssColor("rgb(20, 20, 19)"), /invalid color/i);
});

test("relativeLuminance and contrastRatio follow WCAG calculations", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#ffffff"), 1);
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("#141413", "#FAF9F5") >= 4.5, true);
  assert.equal(contrastRatio("#141413", "#1b1a18") >= 4.5, false);
});

test("extractFrameTheme reads explicit composition metadata", () => {
  assert.deepEqual(extractFrameTheme(authoredFrame({ theme: "light" })), {
    frameSlug: "03-latency",
    theme: "light",
  });
});

test("light parchment frames satisfy the theme and caption contrast contract", () => {
  assert.deepEqual(
    checkAuthoredFrameVisualContract(authoredFrame({ theme: "light" }), {
      projectTheme: "light",
      captionForeground: "#141413",
      allowLegacyThemeInference: false,
    }),
    [],
  );
});

test("light metadata over a near-black ground emits deterministic diagnostics", () => {
  const diagnostics = checkAuthoredFrameVisualContract(
    authoredFrame({ theme: "light", ground: "#1b1a18" }),
    {
      projectTheme: "light",
      captionForeground: "#141413",
      allowLegacyThemeInference: false,
    },
  );

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "frame_theme_mismatch",
    "caption_contrast_insufficient",
  ]);
  assert.match(
    diagnostics[0].message,
    /frame_theme_mismatch frame=03-latency declared=light ground=#1b1a18 detected=dark/,
  );
  assert.match(
    diagnostics[1].message,
    /caption_contrast_insufficient frame=03-latency foreground=#141413 background=#1b1a18 ratio=1\.\d{2} threshold=4\.50/,
  );
});

test("explicit mixed-theme support accepts a dark frame with light caption ink", () => {
  assert.deepEqual(
    checkAuthoredFrameVisualContract(authoredFrame({ theme: "dark", ground: "#1b1a18" }), {
      projectTheme: "light",
      allowMixedThemes: true,
      captionForeground: "#FAF9F5",
      allowLegacyThemeInference: false,
    }),
    [],
  );
});

test("dark frames fail when the light project does not allow mixed themes", () => {
  const result = messages(authoredFrame({ theme: "dark", ground: "#1b1a18" }), {
    projectTheme: "light",
    captionForeground: "#FAF9F5",
    allowLegacyThemeInference: false,
  });
  assert.equal(result.length, 1);
  assert.match(
    result[0],
    /frame_theme_mismatch frame=03-latency declared=dark ground=#1b1a18 project=light mixed=false/,
  );
});

test("strict callers reject a missing data-frame-theme declaration", () => {
  const diagnostics = checkAuthoredFrameVisualContract(authoredFrame(), {
    projectTheme: "light",
    captionForeground: "#141413",
    allowLegacyThemeInference: false,
  });
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, "error");
  assert.match(
    diagnostics[0].message,
    /frame_theme_missing frame=03-latency data-frame-theme=missing compatibility=strict/,
  );
});

test("legacy callers get a deterministic warning for missing metadata", () => {
  const diagnostics = checkAuthoredFrameVisualContract(authoredFrame(), {
    projectTheme: "light",
    captionForeground: "#141413",
    allowLegacyThemeInference: true,
  });
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, "warn");
  assert.match(
    diagnostics[0].message,
    /frame_theme_missing frame=03-latency data-frame-theme=missing compatibility=legacy-warning/,
  );
});

test("repeated ground selectors use the final source-order override", () => {
  const html = `<template>
  <div id="frame-03-latency" data-composition-id="03-latency" data-frame-theme="light">
    <style>
      .ground { position: absolute; inset: 0; background: #FAF9F5; }
      .ground { background: #1b1a18; }
    </style>
    <div class="clip ground" data-track-index="0"></div>
  </div>
</template>`;
  const diagnostics = checkAuthoredFrameVisualContract(html, {
    projectTheme: "light",
    captionForeground: "#141413",
    allowLegacyThemeInference: false,
  });
  assert.deepEqual(diagnostics.map((item) => item.code), [
    "frame_theme_mismatch",
    "caption_contrast_insufficient",
  ]);
  assert.match(diagnostics[0].message, /ground=#1b1a18 detected=dark/);
});

test("earlier ID selector beats a later class selector", () => {
  const html = `<template>
  <div data-composition-id="03-latency" data-frame-theme="light">
    <style>
      #ground { position: absolute; inset: 0; background: #1b1a18; }
      .ground { background: #FAF9F5; }
    </style>
    <div id="ground" class="clip ground" data-track-index="0"></div>
  </div>
</template>`;
  const diagnostics = checkAuthoredFrameVisualContract(html, {
    projectTheme: "light",
    captionForeground: "#141413",
    allowLegacyThemeInference: false,
  });
  assert.deepEqual(diagnostics.map((item) => item.code), [
    "frame_theme_mismatch",
    "caption_contrast_insufficient",
  ]);
  assert.match(diagnostics[0].message, /ground=#1b1a18 detected=dark/);
});

test("selector declarations require their simple descendant ancestors", () => {
  const html = `<template>
  <div data-composition-id="03-latency" data-frame-theme="light">
    <style>
      .ground { position: absolute; inset: 0; background: #FAF9F5; }
      .dark-mode .ground { background: #1b1a18; }
    </style>
    <div class="clip ground" data-track-index="0"></div>
  </div>
</template>`;
  assert.deepEqual(
    checkAuthoredFrameVisualContract(html, {
      projectTheme: "light",
      captionForeground: "#141413",
      allowLegacyThemeInference: false,
    }),
    [],
  );
});

test("earlier important declaration beats a later ordinary declaration", () => {
  const html = `<template>
  <div data-composition-id="03-latency" data-frame-theme="light">
    <style>
      .ground { position: absolute; inset: 0; background: #1b1a18 !important; }
      .ground { background: #FAF9F5; }
    </style>
    <div class="clip ground" data-track-index="0"></div>
  </div>
</template>`;
  const diagnostics = checkAuthoredFrameVisualContract(html, {
    projectTheme: "light",
    captionForeground: "#141413",
    allowLegacyThemeInference: false,
  });
  assert.deepEqual(diagnostics.map((item) => item.code), [
    "frame_theme_mismatch",
    "caption_contrast_insufficient",
  ]);
  assert.match(diagnostics[0].message, /ground=#1b1a18 detected=dark/);
});

test("later background shorthand resets an earlier background-color", () => {
  const html = `<template>
  <div id="frame-03-latency" data-composition-id="03-latency" data-frame-theme="light">
    <style>
      #frame-03-latency { position: absolute; inset: 0; background-color: #FAF9F5; }
      #frame-03-latency { background: #1b1a18; }
    </style>
  </div>
</template>`;
  const diagnostics = checkAuthoredFrameVisualContract(html, {
    projectTheme: "light",
    captionForeground: "#141413",
    allowLegacyThemeInference: false,
  });
  assert.deepEqual(diagnostics.map((item) => item.code), [
    "frame_theme_mismatch",
    "caption_contrast_insufficient",
  ]);
  assert.match(diagnostics[0].message, /ground=#1b1a18 detected=dark/);
});

test("descendant overlay selectors do not target the composition root", () => {
  const html = `<template>
  <div id="frame-03-latency" data-composition-id="03-latency" data-frame-theme="light">
    <style>
      #frame-03-latency .overlay { position: absolute; inset: 0; background: #1b1a18; }
      #frame-03-latency { position: absolute; inset: 0; background: #FAF9F5; }
    </style>
    <div class="overlay"></div>
  </div>
</template>`;
  assert.deepEqual(
    checkAuthoredFrameVisualContract(html, {
      projectTheme: "light",
      captionForeground: "#141413",
      allowLegacyThemeInference: false,
    }),
    [],
  );
});

test("matching unsupported attribute selectors require browser validation", () => {
  const html = `<template>
  <div data-composition-id="03-latency" data-frame-theme="light">
    <style>
      .ground { position: absolute; inset: 0; background: #FAF9F5; }
      [data-track-index="0"] { background: #1b1a18; }
    </style>
    <div class="clip ground" data-track-index="0"></div>
  </div>
</template>`;
  const diagnostics = checkAuthoredFrameVisualContract(html, {
    projectTheme: "light",
    captionForeground: "#141413",
    allowLegacyThemeInference: false,
  });
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "visual_contract_browser_required");
  assert.match(diagnostics[0].message, /literal-full-canvas-ground-not-found/);
});

test("unsupported track-zero ground does not fall back to a literal root", () => {
  const html = `<template>
  <div id="frame-03-latency" data-composition-id="03-latency" data-frame-theme="light">
    <style>
      #frame-03-latency { position: absolute; inset: 0; background: #FAF9F5; }
      .ground { position: absolute; inset: 0; background: var(--frame-bg); }
    </style>
    <div class="clip ground" data-track-index="0"></div>
  </div>
</template>`;
  const diagnostics = checkAuthoredFrameVisualContract(html, {
    projectTheme: "light",
    captionForeground: "#141413",
    allowLegacyThemeInference: false,
  });
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "visual_contract_browser_required");
  assert.match(diagnostics[0].message, /literal-full-canvas-ground-not-found/);
});

test("dynamic grounds require browser validation instead of CSS inference", () => {
  const diagnostics = checkAuthoredFrameVisualContract(
    authoredFrame({ theme: "light", ground: "var(--frame-bg)" }),
    {
      projectTheme: "light",
      captionForeground: "#141413",
      allowLegacyThemeInference: false,
    },
  );
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].severity, "warn");
  assert.match(
    diagnostics[0].message,
    /visual_contract_browser_required frame=03-latency ground=dynamic-or-unsupported reason=literal-full-canvas-ground-not-found/,
  );
});
