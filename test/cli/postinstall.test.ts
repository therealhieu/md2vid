import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { HYPERFRAMES_VERSION } from "../../scripts/dependency_versions.ts";

const LAUNCHER = resolve(import.meta.dirname, "..", "..", "postinstall.mjs");

function fakeRoot(): string {
  return mkdtempSync(join(tmpdir(), "md2vid-postinstall-"));
}

test("source checkout uses source patch only when compiled dist is absent", () => {
  const root = fakeRoot();
  const marker = join(root, "source-called");
  try {
    const source = join(root, "frameworks", "hyperframes", "patch-studio.ts");
    mkdirSync(join(root, "frameworks", "hyperframes"), { recursive: true });
    writeFileSync(source, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "yes");`);
    const result = spawnSync(process.execPath, [LAUNCHER], {
      env: { ...process.env, MD2VID_POSTINSTALL_ROOT: root },
      encoding: "utf8",
    });
    assert.equal(result.status, 0);
    assert.ok(existsSync(marker));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("patch process signal termination reports the signal", () => {
  const root = fakeRoot();
  try {
    mkdirSync(join(root, "dist", "bin"), { recursive: true });
    writeFileSync(
      join(root, "dist", "bin", "md2vid.js"),
      `process.kill(process.pid, "SIGTERM");`,
    );
    const result = spawnSync(process.execPath, [LAUNCHER], {
      env: { ...process.env, MD2VID_POSTINSTALL_ROOT: root },
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /FAIL \[postinstall\]: patch process terminated by SIGTERM/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("compiled patch failure is preserved and never retries the source path", () => {
  const root = fakeRoot();
  const sourceMarker = join(root, "source-called");
  try {
    mkdirSync(join(root, "dist", "bin"), { recursive: true });
    mkdirSync(join(root, "frameworks", "hyperframes"), { recursive: true });
    writeFileSync(
      join(root, "dist", "bin", "md2vid.js"),
      `console.error("FAIL [patch-studio]: hyperframes@${HYPERFRAMES_VERSION} anchor-2 matched 0"); process.exit(1);`,
    );
    writeFileSync(
      join(root, "frameworks", "hyperframes", "patch-studio.ts"),
      `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(sourceMarker)}, "bad fallback");`,
    );
    const result = spawnSync(process.execPath, [LAUNCHER], {
      env: { ...process.env, MD2VID_POSTINSTALL_ROOT: root },
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /FAIL \[patch-studio\].*anchor-2 matched 0/);
    assert.equal(existsSync(sourceMarker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
