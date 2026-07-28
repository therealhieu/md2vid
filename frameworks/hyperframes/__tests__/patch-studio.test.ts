import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveStudioAssetsDir, run } from "../patch-studio.ts";
import { HYPERFRAMES_VERSION } from "../../../scripts/dependency_versions.ts";

const LEGACY_ANCHOR_1 = "let l=!1;const c=()=>{if(Qn.getState().isEditMode||l)return;";
const LEGACY_ANCHOR_2 = "if(!g)return;l=!0;const A=g;fetch(";
const CURRENT_ANCHOR_1 = "let l=!1;const c=()=>{if(tr.getState().isEditMode||l)return;";
const CURRENT_ANCHOR_2 = "if(!p)return;l=!0;const A=p;fetch(";

test("Studio asset resolution has no injected Windows path API", () => {
  const source = readFileSync(
    join(import.meta.dirname, "..", "patch-studio.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /interface PathApi|pathApi/);
});

test("automatic Studio asset resolution uses host POSIX path semantics", () => {
  assert.equal(
    resolveStudioAssetsDir("/pkg/node_modules/hyperframes/dist/cli.js"),
    "/pkg/node_modules/hyperframes/dist/studio/assets",
  );
});

test("malformed bundle failure names stage, version, anchor count, and path", () => {
  const root = mkdtempSync(join(tmpdir(), "patch-studio-bad-"));
  const bundle = join(root, "index-test.js");
  const errors: string[] = [];
  const original = console.error;
  try {
    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    writeFileSync(bundle, `${LEGACY_ANCHOR_1}\n`);
    assert.equal(run([bundle]), 1);
    const body = errors.join("\n");
    assert.match(body, /FAIL \[patch-studio\]/);
    assert.match(
      body,
      new RegExp(`hyperframes@${HYPERFRAMES_VERSION.replaceAll(".", "\\.")}`),
    );
    assert.match(body, /anchor-2.*matched 0/);
    assert.match(body, new RegExp(bundle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    console.error = original;
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing explicit bundle reports a normalized read failure", () => {
  const root = mkdtempSync(join(tmpdir(), "patch-studio-missing-"));
  const bundle = join(root, "missing.js");
  const errors: string[] = [];
  const original = console.error;
  try {
    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    assert.equal(run([bundle]), 1);
    const body = errors.join("\n");
    assert.match(
      body,
      new RegExp(
        `FAIL \\[patch-studio\\]: hyperframes@${HYPERFRAMES_VERSION.replaceAll(".", "\\.")}`,
      ),
    );
    assert.match(body, /read bundle/);
    assert.match(body, new RegExp(bundle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    console.error = original;
    rmSync(root, { recursive: true, force: true });
  }
});

test("unreadable explicit bundle reports a normalized read failure", () => {
  const root = mkdtempSync(join(tmpdir(), "patch-studio-unreadable-"));
  const bundle = join(root, "bundle-dir");
  const errors: string[] = [];
  const original = console.error;
  try {
    mkdirSync(bundle);
    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    assert.equal(run([bundle]), 1);
    const body = errors.join("\n");
    assert.match(
      body,
      new RegExp(
        `FAIL \\[patch-studio\\]: hyperframes@${HYPERFRAMES_VERSION.replaceAll(".", "\\.")}`,
      ),
    );
    assert.match(body, /read bundle/);
    assert.match(body, new RegExp(bundle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    console.error = original;
    rmSync(root, { recursive: true, force: true });
  }
});

test("bundle write failure reports a normalized diagnostic", () => {
  const root = mkdtempSync(join(tmpdir(), "patch-studio-write-"));
  const bundle = join(root, "index-test.js");
  const errors: string[] = [];
  const original = console.error;
  try {
    writeFileSync(bundle, `${LEGACY_ANCHOR_1}\n${LEGACY_ANCHOR_2}\n`);
    chmodSync(bundle, 0o444);
    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    assert.equal(run([bundle]), 1);
    const body = errors.join("\n");
    assert.match(
      body,
      new RegExp(
        `FAIL \\[patch-studio\\]: hyperframes@${HYPERFRAMES_VERSION.replaceAll(".", "\\.")}`,
      ),
    );
    assert.match(body, /write patched bundle/);
    assert.match(body, new RegExp(bundle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    console.error = original;
    rmSync(root, { recursive: true, force: true });
  }
});

test("valid legacy-anchor bundle patches once and remains idempotent", () => {
  const root = mkdtempSync(join(tmpdir(), "patch-studio-good-"));
  const bundle = join(root, "index-test.js");
  try {
    writeFileSync(bundle, `${LEGACY_ANCHOR_1}\n${LEGACY_ANCHOR_2}\n`);
    assert.equal(run([bundle]), 0);
    const once = readFileSync(bundle, "utf8");
    assert.match(once, /hfLast/);
    assert.equal(run([bundle]), 0);
    assert.equal(readFileSync(bundle, "utf8"), once);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("valid current-anchor bundle patches once and remains idempotent", () => {
  const root = mkdtempSync(join(tmpdir(), "patch-studio-current-"));
  const bundle = join(root, "index-test.js");
  try {
    writeFileSync(bundle, `${CURRENT_ANCHOR_1}\n${CURRENT_ANCHOR_2}\n`);
    assert.equal(run([bundle]), 0);
    const once = readFileSync(bundle, "utf8");
    assert.match(once, /hfLast/);
    assert.equal(run([bundle]), 0);
    assert.equal(readFileSync(bundle, "utf8"), once);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bundle with multiple known anchor variants fails closed", () => {
  const root = mkdtempSync(join(tmpdir(), "patch-studio-multiple-anchors-"));
  const bundle = join(root, "index-test.js");
  const errors: string[] = [];
  const original = console.error;
  try {
    writeFileSync(bundle, `${LEGACY_ANCHOR_1}\n${LEGACY_ANCHOR_2}\n${CURRENT_ANCHOR_1}\n${CURRENT_ANCHOR_2}\n`);
    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    assert.equal(run([bundle]), 1);
    assert.match(errors.join("\n"), /anchor variant matched 2 variant\(s\), expected 1/);
    assert.equal(readFileSync(bundle, "utf8"), `${LEGACY_ANCHOR_1}\n${LEGACY_ANCHOR_2}\n${CURRENT_ANCHOR_1}\n${CURRENT_ANCHOR_2}\n`);
  } finally {
    console.error = original;
    rmSync(root, { recursive: true, force: true });
  }
});
