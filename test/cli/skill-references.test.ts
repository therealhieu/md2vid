import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  SKILL_REFERENCE_MAP,
  assertSkillMarkdownReferencesResolve,
  assertSkillReferencesEqual,
  validateSkillTree,
} from "../../scripts/skill_references.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const SKILL_ROOT = join(REPO_ROOT, "skill", "md2vid");

test("mandatory skill references are byte-identical to authoritative standards", () => {
  assert.deepEqual(
    SKILL_REFERENCE_MAP.map((entry) => entry.destination),
    [
      "references/standards/video-generation.md",
      "references/standards/git.md",
      "references/standards/design/frame.md",
      "references/standards/design/knowledge-expression.md",
      "references/standards/design/frame-content.md",
      "references/standards/frameworks/hyperframes.md",
      "references/standards/frameworks/remotion.md",
    ],
  );
  assert.doesNotThrow(() => assertSkillReferencesEqual(REPO_ROOT));
});

test("bundled Remotion standard uses the actual shared build-plan path", () => {
  const body = readFileSync(
    join(SKILL_ROOT, "references", "standards", "frameworks", "remotion.md"),
    "utf8",
  );
  assert.doesNotMatch(body, /shared\/build_plan\.json/);
  assert.match(body, /shared\/build\/build_plan\.json/);
});

test("installed skill tree validates without repository files", () => {
  const tmp = mkdtempSync(join(tmpdir(), "md2vid-skill-tree-"));
  try {
    cpSync(SKILL_ROOT, tmp, { recursive: true });
    assert.doesNotThrow(() => validateSkillTree(tmp));
    assert.doesNotThrow(() => assertSkillMarkdownReferencesResolve(tmp));
    for (const entry of SKILL_REFERENCE_MAP) {
      const body = readFileSync(join(tmp, entry.destination), "utf8");
      assert.doesNotMatch(body, /docs\/standards\//, entry.destination);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("installed skill validation rejects bare source-script guidance", () => {
  const tmp = mkdtempSync(join(tmpdir(), "md2vid-skill-stale-"));
  try {
    cpSync(SKILL_ROOT, tmp, { recursive: true });
    const skillFile = join(tmp, "SKILL.md");
    writeFileSync(skillFile, readFileSync(skillFile, "utf8") + "\nRun scripts/audio.mjs.\n");
    assert.throws(() => validateSkillTree(tmp), /stale guidance/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("installed skill validation rejects package template paths for every framework", () => {
  for (const packagePath of [
    "frameworks/hyperframes/templates/frame-template.html",
    "frameworks/remotion/templates/src/theme.ts",
  ]) {
    const tmp = mkdtempSync(join(tmpdir(), "md2vid-skill-template-"));
    try {
      cpSync(SKILL_ROOT, tmp, { recursive: true });
      const skillFile = join(tmp, "SKILL.md");
      writeFileSync(skillFile, readFileSync(skillFile, "utf8") + `\nUse ${packagePath}.\n`);
      assert.throws(() => validateSkillTree(tmp), /stale guidance/, packagePath);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});

test("installed skill validation accepts generated-project paths", () => {
  const tmp = mkdtempSync(join(tmpdir(), "md2vid-skill-generated-"));
  try {
    cpSync(SKILL_ROOT, tmp, { recursive: true });
    const skillFile = join(tmp, "SKILL.md");
    writeFileSync(
      skillFile,
      readFileSync(skillFile, "utf8") +
        "\nUse .hyperframes/caption-skin.html, compositions/frames/, src/theme.ts, and src/scenes/.\n",
    );
    assert.doesNotThrow(() => validateSkillTree(tmp));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("reference drift fails with the synchronization command", () => {
  const tmp = mkdtempSync(join(tmpdir(), "md2vid-skill-drift-"));
  try {
    cpSync(REPO_ROOT, tmp, { recursive: true, filter: (src) => !src.includes("node_modules") && !src.includes(".git") });
    const target = join(tmp, SKILL_REFERENCE_MAP[0].destinationFromRoot);
    writeFileSync(target, readFileSync(target, "utf8") + "\ndrift\n");
    assert.throws(
      () => assertSkillReferencesEqual(tmp),
      /npm run sync:skill-references/,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("SKILL.md uses only skill-root-relative mandatory standard paths", () => {
  const body = readFileSync(join(SKILL_ROOT, "SKILL.md"), "utf8");
  for (const entry of SKILL_REFERENCE_MAP) assert.match(body, new RegExp(entry.destination.replaceAll("/", "\\/")));
  assert.doesNotMatch(body, /docs\/standards\//);
  assert.doesNotMatch(body, /@\.\.\/\.\.\/docs/);
});
