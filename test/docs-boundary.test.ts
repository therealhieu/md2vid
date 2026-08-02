// docs-boundary.test.mjs — the framework-doc inheritance boundary (Phase 4).
//
// The refactor's goal: a video inherits NEUTRAL standards globally (via the root
// AGENTS.md) plus EXACTLY ONE framework's mechanics (via that video's own scaffolded
// @import). If a framework doc were globally inherited, every agent in every project
// would see every framework's mechanics — the opposite of the goal.
//
// Two invariants enforce that:
//   1. Framework authoring docs live under docs/standards/frameworks/<fw>.md.
//   2. The root AGENTS.md import list is NEUTRAL-ONLY — it must NOT pull
//      docs/standards/frameworks/ in (that dir is reached only per-video).
// Plus: every video's @import of a framework doc must resolve to a real file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPublicSnapshotRepositoryCheckout } from "../scripts/public_snapshot_checkout.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const FRAMEWORK_DOCS = join(REPO_ROOT, "docs", "standards", "frameworks");

// The @import lines of a memory doc: leading '@', first whitespace-delimited token.
function importsOf(file: string): string[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("@"))
    .map((l) => l.slice(1).split(/\s/)[0]);
}

test("the hyperframes framework doc lives under docs/standards/frameworks/", () => {
  assert.ok(
    existsSync(join(FRAMEWORK_DOCS, "hyperframes.md")),
    "expected docs/standards/frameworks/hyperframes.md"
  );
});

test("root AGENTS.md does NOT globally inherit framework docs", () => {
  for (const spec of importsOf(join(REPO_ROOT, "AGENTS.md"))) {
    assert.ok(
      !spec.includes("frameworks"),
      `root AGENTS.md imports "${spec}" — framework docs must not be globally inherited`
    );
  }
});

test("canonical framework and frame-content docs preserve the cue-binding boundary", () => {
  const hyperframes = readFileSync(join(FRAMEWORK_DOCS, "hyperframes.md"), "utf8");
  const remotion = readFileSync(join(FRAMEWORK_DOCS, "remotion.md"), "utf8");
  const frameContent = readFileSync(join(REPO_ROOT, "docs", "standards", "design", "frame-content.md"), "utf8");

  assert.match(hyperframes, /data-md2vid-beat/);
  assert.match(hyperframes, /data-md2vid-custom-bindings/);
  assert.match(remotion, /static.*visual_bindings\.json/is);
  assert.match(frameContent, /one registered parent timeline may compose generated and authored child timelines/i);
});

// Every video's CLAUDE.md/AGENTS.md that imports a framework doc must resolve it to a
// real file (a video reaches its one framework's mechanics ONLY through this import).
test("every private-tree video framework-doc @import resolves, while public snapshots may omit outputs", () => {
  const outputs = join(REPO_ROOT, "outputs");
  if (!existsSync(outputs)) {
    assert.equal(
      isPublicSnapshotRepositoryCheckout(REPO_ROOT),
      true,
      "root outputs/ may be absent only from an authentic generated public snapshot checkout",
    );
    return;
  }
  const videoDocs: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) {
        if (name !== "node_modules" && name !== "assets" && name !== "compositions") walk(p);
      } else if (name === "CLAUDE.md" || name === "AGENTS.md") {
        videoDocs.push(p);
      }
    }
  };
  walk(outputs);

  let checked = 0;
  for (const doc of videoDocs) {
    for (const spec of importsOf(doc)) {
      if (!spec.includes(join("docs", "standards", "frameworks"))) continue;
      const target = resolve(dirname(doc), spec);
      assert.ok(existsSync(target), `${doc} imports "${spec}" → missing ${target}`);
      assert.ok(
        target.includes(join("docs", "standards", "frameworks")),
        `${doc} imports "${spec}" — framework docs should live under docs/standards/frameworks/`
      );
      checked++;
    }
  }
  assert.ok(checked > 0, "expected at least one video to import a framework doc");
});
