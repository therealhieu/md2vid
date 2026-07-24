import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig, validateVideoConfig } from "../config.ts";

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
