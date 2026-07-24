// skill-commands.test.ts — Task 3.1: the bundled skill drives the CLI.
//
// The shipped skill (skill/md2vid/SKILL.md) must: carry frontmatter `name: md2vid`
// (invocation /md2vid), contain ZERO raw `node scripts/*.ts` commands (every
// mechanical step goes through `md2vid <cmd>`), and reference the bundled
// references/standards/ tree (skill-root-relative, not `../../`). A dev shim under
// .claude/skills/md2vid resolves /md2vid in-repo during development.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPublicSnapshotRepositoryCheckout } from "../../scripts/public_snapshot_checkout.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SKILL_ROOT = join(REPO_ROOT, "skill", "md2vid");
const SKILL = join(SKILL_ROOT, "SKILL.md");

function readMarkdownTree(root: string): Array<{ path: string; body: string }> {
  const files: Array<{ path: string; body: string }> = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) files.push(...readMarkdownTree(path));
    else if (path.endsWith(".md")) files.push({ path, body: readFileSync(path, "utf8") });
  }
  return files;
}

function executableNpxHyperframesLines(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(?:\$\s*)?npx\s+hyperframes\b/.test(line));
}

function assertOrder(body: string, fragments: string[]): void {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = body.indexOf(fragment, cursor + 1);
    assert.ok(next > cursor, `expected ${JSON.stringify(fragment)} after offset ${cursor}`);
    cursor = next;
  }
}

test("skill lives at skill/md2vid/SKILL.md", () => {
  assert.ok(existsSync(SKILL), "skill/md2vid/SKILL.md must exist");
});

test("frontmatter name is md2vid (invocation /md2vid)", () => {
  const body = readFileSync(SKILL, "utf8");
  assert.match(body, /^name:\s*md2vid\s*$/m, "frontmatter must set name: md2vid");
});

test("installed skill tree contains only portable guidance", () => {
  const markdown = readMarkdownTree(SKILL_ROOT);
  const allText = markdown.map((file) => file.body).join("\n");

  assert.doesNotMatch(allText, /(?:\.\.\/)*scripts\/\S+\.(?:ts|mjs)/);
  assert.doesNotMatch(allText, /\.\.\/\.\.\/scripts/);
  assert.doesNotMatch(allText, /@\.\.\/\.\.\/docs/);
  assert.doesNotMatch(allText, /docs\/standards\//);
  assert.doesNotMatch(allText, /outputs\/hash-table-example\//);
  assert.doesNotMatch(allText, /frameworks\/[^/\s]+\/templates(?:\/\S+)?/);
  assert.match(readFileSync(join(SKILL_ROOT, "SKILL.md"), "utf8"), /compatibility:.*Node\.js >=22\.18/s);
});

test("install-skill documents the configured Claude destination", () => {
  const body = readFileSync(SKILL, "utf8");
  assert.match(body, /\$\{CLAUDE_CONFIG_DIR:-\$HOME\/\.claude\}\/skills\/md2vid/);
  assert.doesNotMatch(body, /Copy this skill into `~\/\.claude\/skills\/md2vid`/);
});

test("manual local CLI guidance refuses registry installation", () => {
  const body = readFileSync(SKILL, "utf8");
  assert.match(body, /npx --yes=false md2vid/);
  assert.doesNotMatch(body, /npx --no md2vid/);
});

test("mechanical steps invoke the md2vid CLI", () => {
  const body = readFileSync(SKILL, "utf8");
  for (const cmd of [/md2vid new /, /md2vid build /, /md2vid regroup /, /md2vid verify /]) {
    assert.match(body, cmd, `skill must drive the CLI: ${cmd}`);
  }
});

test("skill documents the shipped narration and generated-project workflow", () => {
  const body = readFileSync(SKILL, "utf8");
  assert.doesNotMatch(body, /\bmd2vid audio\b/);
  assert.match(body, /audio_request\.json\.example/);
  assert.match(body, /voice IDs.*meaningful/i);
  assert.match(body, /array order/i);
  assertOrder(body, ["npm run build", "npm run check", "preview"]);
});

test("installed operational guidance never executes npx hyperframes", () => {
  const markdown = readMarkdownTree(SKILL_ROOT);
  const hits = markdown.flatMap((file) =>
    executableNpxHyperframesLines(file.body).map((line) => `${file.path}: ${line}`),
  );
  assert.deepEqual(hits, []);
});

test("authoritative HyperFrames standard uses the md2vid proxy", () => {
  const source = readFileSync(
    join(REPO_ROOT, "docs", "standards", "frameworks", "hyperframes.md"),
    "utf8",
  );
  assert.deepEqual(executableNpxHyperframesLines(source), []);
  for (const command of [
    "md2vid hyperframes lint --verbose",
    "md2vid hyperframes lint --json",
    "md2vid hyperframes docs <topic>",
  ]) assert.match(source, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("@import guidance points at the copied-in standard, never docs/standards/frameworks", () => {
  const body = readFileSync(SKILL, "utf8");
  // An @import is a filesystem path — it cannot reach into an installed node
  // package, so the skill must never tell an agent to @import docs/standards/frameworks/.
  assert.doesNotMatch(
    body,
    /@import[^\n]*docs\/standards\/frameworks|`@[^`]*docs\/standards\/frameworks/,
    "project @import guidance must use the copied-in .md2vid/standards/<fw>.md, not docs/standards/frameworks/",
  );
});

test("dev shim resolves /md2vid in the private source tree or is intentionally absent from a public snapshot", () => {
  const shim = join(REPO_ROOT, ".claude", "skills", "md2vid");
  if (!existsSync(shim)) {
    assert.equal(
      isPublicSnapshotRepositoryCheckout(REPO_ROOT),
      true,
      ".claude/skills/md2vid may be absent only from an authentic generated public snapshot checkout",
    );
    return;
  }
  // The shim points at skill/md2vid (symlink) or is a copy carrying the same SKILL.md.
  const shimSkill = join(shim, "SKILL.md");
  assert.ok(existsSync(shimSkill), "shim must expose SKILL.md");
  assert.match(readFileSync(shimSkill, "utf8"), /^name:\s*md2vid\s*$/m, "shim SKILL.md is the md2vid skill");
});

test("old generate-video skill dir is gone", () => {
  const old = join(REPO_ROOT, ".claude", "skills", "generate-video");
  // If it still exists it must not be a stale copy of the renamed skill.
  if (existsSync(old) && !statSync(old).isSymbolicLink()) {
    assert.fail(".claude/skills/generate-video still exists — skill was renamed to md2vid");
  }
});
