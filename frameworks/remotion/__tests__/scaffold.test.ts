import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureRuntime } from "../scaffold.ts";

test("remotion ensureRuntime writes missing project runtime into an existing dir", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-scaffold-"));
  try {
    ensureRuntime(tmp, "remotion");
    for (const rel of [
      "remotion.config.ts", "tsconfig.json", "render.ts", ".gitignore",
      join("src", "index.ts"), join("src", "Root.tsx"),
      join("src", "Video.tsx"), join("src", "Captions.tsx"), join("src", "types.ts"),
      join("src", "theme.ts"), join("src", "fonts.ts"), join("src", "primitives.tsx"),
      join("src", "scenes", "CoverScene.tsx"),
      join("src", "scenes", "CoreIdeaScene.tsx"),
      join("src", "scenes", "LookupFlowScene.tsx"),
      join("src", "scenes", "CollisionsScene.tsx"),
      join("src", "scenes", "LoadFactorScene.tsx"),
      join("src", "scenes", "WhyMattersScene.tsx"),
      join("src", "scenes", "RecapScene.tsx"),
    ]) {
      assert.ok(existsSync(join(tmp, rel)), `scaffold wrote ${rel}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
