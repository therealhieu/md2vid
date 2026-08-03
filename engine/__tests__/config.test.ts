import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  loadConfig,
  loadConfigFiles,
  validateSlugMappings,
  validateVideoConfig,
} from "../config.ts";

const VALID_SYNC = {
  mode: "required",
  coverageMode: "required",
  maxLead: 0.25,
  maxLag: 0.75,
  maxUncoveredGap: 0.5,
  minLanding: 1,
} as const;

test("visualSync accepts required reveal and coverage policy", () => {
  const config = validateVideoConfig({ visualSync: VALID_SYNC }, "video.config.json");
  assert.deepEqual(config.visualSync, VALID_SYNC);
});

for (const coverageMode of ["off", "warn", "required"] as const) {
  test(`visualSync accepts coverageMode=${coverageMode}`, () => {
    const config = validateVideoConfig(
      { visualSync: { coverageMode } },
      "video.config.json",
    );
    assert.equal(config.visualSync?.coverageMode, coverageMode);
  });
}

for (const value of [-0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`visualSync rejects maxUncoveredGap=${String(value)}`, () => {
    assert.throws(
      () => validateVideoConfig(
        { visualSync: { maxUncoveredGap: value } },
        "video.config.json",
      ),
      /visualSync\.maxUncoveredGap.*finite non-negative/,
    );
  });
}

test("visualSync accepts a zero uncovered-gap threshold", () => {
  const config = validateVideoConfig(
    { visualSync: { maxUncoveredGap: 0 } },
    "video.config.json",
  );
  assert.equal(config.visualSync?.maxUncoveredGap, 0);
});

for (const [field, value] of [
  ["maxLead", -0.01],
  ["maxLag", Number.NaN],
  ["minLanding", Number.POSITIVE_INFINITY],
] as const) {
  test(`visualSync rejects ${field}=${String(value)}`, () => {
    assert.throws(
      () => validateVideoConfig({ visualSync: { ...VALID_SYNC, [field]: value } }, "video.config.json"),
      new RegExp(`visualSync\\.${field}`),
    );
  });
}

for (const minLanding of [0, 0.49]) {
  test(`visualSync rejects minLanding=${minLanding} below the standards floor`, () => {
    assert.throws(
      () => validateVideoConfig({ visualSync: { ...VALID_SYNC, minLanding } }, "video.config.json"),
      /visualSync\.minLanding.*>= 0\.5/,
    );
  });
}

test("render policy accepts explicit final defaults", () => {
  const config = validateVideoConfig({
    render: { profile: "final", fps: 30, minimumFinalFps: 24 },
  }, "output.config.json");
  assert.deepEqual(config.render, { profile: "final", fps: 30, minimumFinalFps: 24 });
});

for (const minimumFinalFps of [1, 23]) {
  test(`render policy rejects minimumFinalFps=${minimumFinalFps} below 24`, () => {
    assert.throws(
      () => validateVideoConfig({ render: { minimumFinalFps } }, "output.config.json"),
      /render\.minimumFinalFps.*>= 24/,
    );
  });
}

test("render policy accepts a stricter 30 fps minimum", () => {
  const config = validateVideoConfig({ render: { minimumFinalFps: 30 } }, "output.config.json");
  assert.equal(config.render?.minimumFinalFps, 30);
});

test("accepts visual sync and render policy numeric boundaries", () => {
  assert.deepEqual(
    validateVideoConfig({
      visualSync: { mode: "off", maxLead: 0, maxLag: 0, minLanding: 0.5 },
      render: { profile: "gif", fps: 1, minimumFinalFps: 24 },
    }, "output.config.json"),
    {
      visualSync: { mode: "off", maxLead: 0, maxLag: 0, minLanding: 0.5 },
      render: { profile: "gif", fps: 1, minimumFinalFps: 24 },
    },
  );
});

test("rejects malformed visual sync and render policy values", () => {
  const cases: Array<[string, unknown, string, RegExp]> = [
    ["visualSync mode", { visualSync: { mode: "strict" } }, "video.config.json", /visualSync\.mode/],
    ["visualSync maxLead negative", { visualSync: { maxLead: -0.01 } }, "video.config.json", /visualSync\.maxLead/],
    ["visualSync maxLead non-finite", { visualSync: { maxLead: Number.NaN } }, "video.config.json", /visualSync\.maxLead/],
    ["visualSync maxLead wrong type", { visualSync: { maxLead: "0" } }, "video.config.json", /visualSync\.maxLead/],
    ["visualSync maxLag negative", { visualSync: { maxLag: -0.01 } }, "video.config.json", /visualSync\.maxLag/],
    ["visualSync maxLag non-finite", { visualSync: { maxLag: Number.POSITIVE_INFINITY } }, "video.config.json", /visualSync\.maxLag/],
    ["visualSync maxLag wrong type", { visualSync: { maxLag: "0" } }, "video.config.json", /visualSync\.maxLag/],
    ["visualSync minLanding below floor", { visualSync: { minLanding: 0.49 } }, "video.config.json", /visualSync\.minLanding/],
    ["visualSync minLanding non-finite", { visualSync: { minLanding: Number.NaN } }, "video.config.json", /visualSync\.minLanding/],
    ["visualSync minLanding wrong type", { visualSync: { minLanding: "1" } }, "video.config.json", /visualSync\.minLanding/],
    ["render profile", { render: { profile: "preview" } }, "output.config.json", /render\.profile/],
    ["render fps zero", { render: { fps: 0 } }, "output.config.json", /render\.fps/],
    ["render fps negative", { render: { fps: -1 } }, "output.config.json", /render\.fps/],
    ["render fps non-finite", { render: { fps: Number.POSITIVE_INFINITY } }, "output.config.json", /render\.fps/],
    ["render fps wrong type", { render: { fps: "30" } }, "output.config.json", /render\.fps/],
    ["render minimumFinalFps below floor", { render: { minimumFinalFps: 23 } }, "output.config.json", /render\.minimumFinalFps/],
    ["render minimumFinalFps non-finite", { render: { minimumFinalFps: Number.NaN } }, "output.config.json", /render\.minimumFinalFps/],
    ["render minimumFinalFps wrong type", { render: { minimumFinalFps: "24" } }, "output.config.json", /render\.minimumFinalFps/],
  ];

  for (const [name, config, path, expected] of cases) {
    assert.throws(() => validateVideoConfig(config, path), expected, name);
  }
});

test("accepts optional defaults and null-prototype config records", () => {
  const slugs = Object.create(null) as Record<string, string>;
  slugs.intro = "01-intro";
  const config = Object.assign(Object.create(null), {
    slugs,
    timing: Object.assign(Object.create(null), { gap: 0 }),
    canvas: Object.assign(Object.create(null), { width: 1920, height: 1080 }),
    framework: "hyperframes",
  });

  assert.equal(validateVideoConfig(config, "video.config.json"), config);
  assert.deepEqual(validateVideoConfig({}, "video.config.json"), {});
});

test("accepts the exact caption token vocabulary and versioned visual contract", () => {
  const config = {
    captions: {
      tokens: {
        "--cap-ink": "#141413",
        "--cap-canvas": "#FAF9F5",
        "--cap-accent": "#CC785C",
        "--cap-accent-2": "#abc",
        "--cap-band-top": "14%",
        "--cap-band-height": "200px",
        "--font-display": '"EB Garamond", Georgia, serif',
        "--font-body": "Inter, sans-serif",
        "--ink": "#141413",
        "--cream": "#FAF9F5",
        "--tile": "#EFE9DE",
        "--tile-strong": "#ECE3D4",
        "--coral": "#CC785C",
      },
    },
    visualContract: {
      version: 1,
      projectTheme: "light",
      allowMixedThemes: false,
      allowLegacyThemeInference: false,
    },
  };

  assert.equal(validateVideoConfig(config, "output.config.json"), config);
});

test("rejects unknown caption tokens with a stable diagnostic", () => {
  assert.throws(
    () => validateVideoConfig(
      { captions: { tokens: { "--cap-unknown": "red" } } },
      "video.config.json",
    ),
    /--cap-unknown.*caption_token_unknown/,
  );
});

test("rejects malformed values by caption token category", () => {
  for (const [name, value, expected] of [
    ["--cap-ink", "not-a-color", /--cap-ink.*caption_token_invalid_color/],
    ["--cream", "rgb(250, 249, 245)", /--cream.*caption_token_invalid_color/],
    ["--coral", "#12", /--coral.*caption_token_invalid_color/],
    ["--cap-band-top", "auto", /captions\.tokens\.--cap-band-top.*safe CSS length/],
    ["--cap-band-height", "calc(100% - 20px)", /captions\.tokens\.--cap-band-height.*safe CSS length/],
    ["--cap-band-height", "200px; color: red", /captions\.tokens\.--cap-band-height.*safe CSS length/],
    ["--font-display", "Inter; color: red", /captions\.tokens\.--font-display.*safe font family/],
    ["--font-body", "Inter\nbody", /captions\.tokens\.--font-body.*safe font family/],
    ["--font-body", "</style>", /captions\.tokens\.--font-body.*safe font family/],
  ] as const) {
    assert.throws(
      () => validateVideoConfig({ captions: { tokens: { [name]: value } } }, "video.config.json"),
      expected,
      `${name}=${JSON.stringify(value)}`,
    );
  }
});

test("rejects malformed versioned visual-contract configuration", () => {
  for (const [visualContract, expected] of [
    [null, /visualContract/],
    [{}, /visualContract\.version/],
    [{ version: 2, projectTheme: "light", allowMixedThemes: false, allowLegacyThemeInference: false }, /visualContract\.version/],
    [{ version: 1, projectTheme: "sepia", allowMixedThemes: false, allowLegacyThemeInference: false }, /visualContract\.projectTheme/],
    [{ version: 1, projectTheme: "light", allowMixedThemes: "no", allowLegacyThemeInference: false }, /visualContract\.allowMixedThemes/],
    [{ version: 1, projectTheme: "light", allowMixedThemes: false }, /visualContract\.allowLegacyThemeInference/],
    [{ version: 1, projectTheme: "light", allowMixedThemes: false, allowLegacyThemeInference: "yes" }, /visualContract\.allowLegacyThemeInference/],
  ] as const) {
    assert.throws(
      () => validateVideoConfig({ visualContract }, "output.config.json"),
      expected,
      JSON.stringify(visualContract),
    );
  }
});

test("rejects unsafe slug grammar without echoing the unsafe value", () => {
  const unsafeSlugs = [
    "../outside",
    "nested/frame",
    String.raw`nested\frame`,
    "two words",
    'x" data-start="999',
    ".",
    "..",
    String.fromCharCode(0) + "intro",
    "intro&tag",
  ];

  for (const slug of unsafeSlugs) {
    assert.throws(
      () =>
        validateVideoConfig(
          { slugs: { intro: slug } },
          "video.config.json",
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(
          error.message,
          'invalid configuration at video.config.json: field "slugs.intro" must be a safe single path segment matching ^[A-Za-z0-9][A-Za-z0-9._-]*$',
        );
        return true;
      },
      slug,
    );
  }
});

test("rejects duplicate slug values and identifies the second mapping", () => {
  assert.throws(
    () =>
      validateVideoConfig(
        {
          slugs: {
            intro: "01-intro",
            recap: "01-intro",
          },
        },
        "video.config.json",
      ),
    /invalid configuration at video\.config\.json: field "slugs\.recap" must be unique; already mapped by voice id "intro"/,
  );
});

test("preserves valid existing slug forms", () => {
  const config = {
    slugs: {
      intro: "01-intro",
      loadFactor: "05-load-factor",
      revision: "intro.v2_main",
    },
  };

  assert.equal(validateVideoConfig(config, "video.config.json"), config);
});

test("requires one slug mapping for every supplied voice ID", () => {
  assert.throws(
    () =>
      validateSlugMappings(
        { intro: "01-intro" },
        "video.config.json",
        ["intro", "recap"],
      ),
    /missing slug mapping for voice id "recap"/,
  );

  assert.throws(
    () =>
      validateSlugMappings(
        {
          intro: "01-intro",
          extra: "02-extra",
        },
        "video.config.json",
        ["intro"],
      ),
    /unknown slug mapping for voice id "extra"/,
  );
});

test("rejects malformed nested and framework-local config fields", () => {
  const cases: Array<[unknown, RegExp]> = [
    [{ slugs: "intro" }, /video\.config\.json.*slugs/],
    [{ slugs: { intro: " " } }, /video\.config\.json.*slugs\.intro/],
    [{ timing: [] }, /video\.config\.json.*timing/],
    [{ timing: { tail: -1 } }, /video\.config\.json.*timing\.tail/],
    [{ timing: { xfade: "0.5" } }, /video\.config\.json.*timing\.xfade/],
    [{ timing: { gap: Number.POSITIVE_INFINITY } }, /video\.config\.json.*timing\.gap/],
    [{ canvas: null }, /video\.config\.json.*canvas/],
    [{ canvas: { width: 0 } }, /video\.config\.json.*canvas\.width/],
    [{ canvas: { height: "1080" } }, /video\.config\.json.*canvas\.height/],
    [{ framework: 42 }, /output\.config\.json.*framework/],
    [{ framework: " " }, /output\.config\.json.*framework/],
    [{ gsapSrc: false }, /output\.config\.json.*gsapSrc/],
    [{ gsapSrc: " " }, /output\.config\.json.*gsapSrc/],
  ];

  for (const [config, expected] of cases) {
    const path = Object.hasOwn(config as object, "framework") || Object.hasOwn(config as object, "gsapSrc")
      ? "output.config.json"
      : "video.config.json";
    assert.throws(() => validateVideoConfig(config, path), expected);
  }
});

test("rejects neutral-only configuration keys in output config", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-config-local-neutral-"));
  const output = join(root, "hyperframes");
  try {
    writeFileSync(join(root, "video.config.json"), JSON.stringify({ slugs: { intro: "01-intro" } }));
    for (const field of ["slugs", "timing", "canvas", "visualSync"] as const) {
      mkdirSync(output, { recursive: true });
      writeFileSync(join(output, "output.config.json"), JSON.stringify({
        framework: "hyperframes",
        [field]: field === "slugs" ? { intro: "local" } : {},
      }));
      assert.throws(
        () => loadConfigFiles(root, output),
        new RegExp(`output\\.config\\.json\\.${field} is neutral-only; move it to video\\.config\\.json`),
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadConfig reports the exact path and invalid nested field", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-config-"));
  const configPath = join(root, "video.config.json");
  try {
    writeFileSync(configPath, JSON.stringify({ timing: [] }));
    assert.throws(
      () => loadConfig(root),
      (error: Error) => error.message.includes(configPath) && error.message.includes("timing"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
