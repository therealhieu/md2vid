// scaffold.test.mjs — the framework-aware scaffolder (Task 4.2).
//
// new_video.mjs is now framework-parametric: it parses --framework (default
// hyperframes) and delegates the skeleton to that adapter's scaffold(). These tests
// drive a throwaway slug into a temp outputs root and assert the generated project:
//   - carries "framework" in video.config.json (records the choice),
//   - imports its ONE framework doc via docs/standards/frameworks/<fw>.md,
//   - pins GSAP to the default CDN without writing local runtime bytes, and validates config.
// An unknown --framework must hard-fail (registry has no adapter).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const NEW_VIDEO = join(REPO_ROOT, "scripts", "new_video.ts");

// Run new_video.mjs against a temp outputs root so the real tree is never touched.
// The scaffolder writes under <outputsRoot>/<slug>; we point it there via env.
function scaffold(slug: string, extraArgs: string[], outputsRoot: string) {
  return execFileSync("node", [NEW_VIDEO, slug, ...extraArgs], {
    cwd: REPO_ROOT,
    env: { ...process.env, MD2VID_OUTPUTS_ROOT: outputsRoot },
    encoding: "utf8",
    stdio: "pipe",
  });
}

test("default scaffold creates an HF project with pinned CDN config and no local GSAP", () => {
  const root = mkdtempSync(join(tmpdir(), "scaffold-"));
  try {
    scaffold("demo-default", [], root);
    const dir = join(root, "demo-default");

    const neutral = JSON.parse(readFileSync(join(dir, "video.config.json"), "utf8"));
    const local = JSON.parse(readFileSync(join(dir, "output.config.json"), "utf8"));
    assert.equal(neutral.framework, undefined, "neutral config excludes framework choice");
    assert.equal(neutral.gsapSrc, undefined, "neutral config excludes framework assets");
    assert.deepEqual(local, {
      framework: "hyperframes",
      gsapSrc: "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js",
    });

    const claude = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    assert.ok(
      claude.includes(".md2vid/standards/hyperframes.md"),
      "CLAUDE.md imports the copied-in framework doc"
    );

    assert.ok(existsSync(join(dir, "assets")), "assets directory remains available for voice files");
    assert.equal(existsSync(join(dir, "assets", "gsap.min.js")), false, "GSAP is not copied locally");
    assert.ok(existsSync(join(dir, ".hyperframes", "caption-skin.html")), "caption skin copied");
    assert.ok(existsSync(join(dir, "compositions", "frames")), "frames dir scaffolded");

    // Every file the scaffolder promises must land, so a dropped write fails CI.
    for (const rel of ["meta.json", "package.json", "hyperframes.json", "AGENTS.md", "caption-overrides.json"]) {
      assert.ok(existsSync(join(dir, rel)), `scaffolder wrote ${rel}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit --framework hyperframes is accepted", () => {
  const root = mkdtempSync(join(tmpdir(), "scaffold-"));
  try {
    scaffold("demo-explicit", ["--framework", "hyperframes"], root);
    const neutral = JSON.parse(readFileSync(join(root, "demo-explicit", "video.config.json"), "utf8"));
    const local = JSON.parse(readFileSync(join(root, "demo-explicit", "output.config.json"), "utf8"));
    assert.equal(neutral.framework, undefined);
    assert.equal(local.framework, "hyperframes");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the generated config validates via engine/config.mjs", async () => {
  const root = mkdtempSync(join(tmpdir(), "scaffold-"));
  try {
    scaffold("demo-valid", [], root);
    const { loadConfig } = await import("../engine/config.ts");
    const config = loadConfig(join(root, "demo-valid"), join(root, "demo-valid"));
    assert.equal(config.framework, "hyperframes");
    assert.ok(config.timing && config.canvas, "config carries timing + canvas");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unknown --framework hard-fails", () => {
  const root = mkdtempSync(join(tmpdir(), "scaffold-"));
  try {
    assert.throws(() => scaffold("demo-bad", ["--framework", "no-such-fw"], root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
