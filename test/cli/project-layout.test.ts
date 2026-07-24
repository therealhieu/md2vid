import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { resolveProjectLayout } from "../../scripts/project_layout.ts";

function root() {
  return mkdtempSync(join(tmpdir(), "md2vid-layout-"));
}

test("uses sibling shared directory for canonical layout", () => {
  const dir = root();
  const output = join(dir, "hyperframes");
  mkdirSync(output);
  mkdirSync(join(dir, "shared"));
  assert.deepEqual(resolveProjectLayout(output), {
    outputDir: resolve(output),
    sharedDir: resolve(dir, "shared"),
    flat: false,
  });
});

test("falls back to output directory for flat layout", () => {
  const dir = root();
  const output = join(dir, "demo");
  mkdirSync(output);
  assert.deepEqual(resolveProjectLayout(output), {
    outputDir: resolve(output),
    sharedDir: resolve(output),
    flat: true,
  });
});

test("ignores a sibling regular file named shared", () => {
  const dir = root();
  const output = join(dir, "demo");
  mkdirSync(output);
  writeFileSync(join(dir, "shared"), "not a directory");
  assert.equal(resolveProjectLayout(output).flat, true);
});

test("treats ENOENT from the single stat as an absent shared directory", () => {
  const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
  const layout = resolveProjectLayout("demo", {
    statSync: () => { throw missing; },
  });
  assert.equal(layout.flat, true);
});

test("propagates non-ENOENT stat failures", () => {
  const denied = Object.assign(new Error("denied"), { code: "EACCES" });
  assert.throws(
    () => resolveProjectLayout("demo", { statSync: () => { throw denied; } }),
    denied,
  );
});
