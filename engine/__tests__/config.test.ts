import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  loadConfig,
  validateSlugMappings,
  validateVideoConfig,
} from "../config.ts";

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
