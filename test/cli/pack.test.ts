import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORBIDDEN_PACKED_FILES,
  FORBIDDEN_PACKED_PREFIXES,
  REQUIRED_PACKED_FILES,
} from "../release/manifest.ts";

test("release package manifest covers executable, assets, postinstall, and all references", () => {
  assert.ok(REQUIRED_PACKED_FILES.includes("dist/bin/md2vid.js"));
  assert.ok(REQUIRED_PACKED_FILES.includes("postinstall.mjs"));
  assert.ok(REQUIRED_PACKED_FILES.includes("dist/scripts/check_release_name.js"));
  assert.ok(REQUIRED_PACKED_FILES.includes("README.md"));
  assert.ok(REQUIRED_PACKED_FILES.includes("LICENSE"));
  assert.equal(REQUIRED_PACKED_FILES.filter((path) => path.startsWith("skill/md2vid/references/standards/")).length, 7);
  assert.deepEqual(FORBIDDEN_PACKED_PREFIXES, ["outputs/", "test/", "node_modules/", "docs/superpowers/"]);
  const removedGsapVendorFile = ["vendor", ["gsap", "min", "js"].join(".")].join("/");
  assert.deepEqual(FORBIDDEN_PACKED_FILES, [
    `frameworks/hyperframes/templates/${removedGsapVendorFile}`,
    `dist/frameworks/hyperframes/templates/${removedGsapVendorFile}`,
  ]);
});
