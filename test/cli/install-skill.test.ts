import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  installSkillFromSource,
  resolveClaudeConfigRoot,
  run,
} from "../../scripts/install_skill.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const SOURCE = join(REPO_ROOT, "skill", "md2vid");
const PACKAGE_VERSION = (JSON.parse(
  readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
) as { version: string }).version;
const METADATA = { name: "md2vid", version: PACKAGE_VERSION, root: REPO_ROOT };

function installArtifacts(skillsRoot: string): string[] {
  return readdirSync(skillsRoot).filter(
    (name) => name.startsWith(".md2vid-stage-") || name.startsWith(".md2vid-backup"),
  );
}

test("CLAUDE_CONFIG_DIR replaces the default user config root", () => {
  assert.equal(
    resolveClaudeConfigRoot({ CLAUDE_CONFIG_DIR: "/tmp/custom-claude" }, "/tmp/home"),
    "/tmp/custom-claude",
  );
  assert.equal(resolveClaudeConfigRoot({}, "/tmp/home"), "/tmp/home/.claude");
  assert.equal(resolveClaudeConfigRoot({ CLAUDE_CONFIG_DIR: "  " }, "/tmp/home"), "/tmp/home/.claude");
});

test("successful reinstall removes stale files and installs complete references", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-install-skill-"));
  const skillsRoot = join(root, "skills");
  const destination = join(skillsRoot, "md2vid");
  try {
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, "stale.txt"), "stale\n");

    installSkillFromSource(SOURCE, destination, METADATA);

    assert.equal(existsSync(join(destination, "stale.txt")), false);
    assert.ok(existsSync(join(destination, "SKILL.md")));
    assert.ok(existsSync(join(destination, "references", "standards", "design", "frame.md")));
    assert.deepEqual(installArtifacts(skillsRoot), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("invalid staged source preserves the previous installation", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-install-skill-fail-"));
  const source = join(root, "bad-source");
  const skillsRoot = join(root, "skills");
  const destination = join(skillsRoot, "md2vid");
  try {
    cpSync(SOURCE, source, { recursive: true });
    rmSync(join(source, "references", "standards", "design", "frame.md"));
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, "sentinel.txt"), "keep\n");

    assert.throws(
      () => installSkillFromSource(source, destination, METADATA),
      /FAIL \[install-skill\].*missing references\/standards\/design\/frame\.md/,
    );

    assert.equal(readFileSync(join(destination, "sentinel.txt"), "utf8"), "keep\n");
    assert.deepEqual(installArtifacts(skillsRoot), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("promotion failure rolls the previous installation back and cleans temporary trees", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-install-skill-rollback-"));
  const skillsRoot = join(root, "skills");
  const destination = join(skillsRoot, "md2vid");
  let renameCalls = 0;
  try {
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, "sentinel.txt"), "keep\n");

    assert.throws(
      () => installSkillFromSource(SOURCE, destination, METADATA, {
        rename(source, target) {
          renameCalls += 1;
          if (renameCalls === 2) throw new Error("simulated promotion failure");
          renameSync(source, target);
        },
      }),
      /FAIL \[install-skill\]: simulated promotion failure/,
    );

    assert.equal(renameCalls, 3, "destination move, failed promotion, then rollback");
    assert.equal(readFileSync(join(destination, "sentinel.txt"), "utf8"), "keep\n");
    assert.deepEqual(installArtifacts(skillsRoot), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("run reports package version, source, destination, and invocation", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-install-skill-run-"));
  const output: string[] = [];
  const errors: string[] = [];
  try {
    const code = run([], {
      env: { CLAUDE_CONFIG_DIR: root },
      home: join(root, "unused-home"),
      log: (line) => output.push(line),
      error: (line) => errors.push(line),
    });

    assert.equal(code, 0);
    assert.deepEqual(errors, []);
    const body = output.join("\n");
    assert.match(body, new RegExp(`OK installed md2vid skill ${PACKAGE_VERSION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(body, new RegExp(`source: ${SOURCE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(body, new RegExp(`destination: ${join(root, "skills", "md2vid").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(body, /invocation: \/md2vid/);
    assert.ok(existsSync(join(root, "skills", "md2vid", "SKILL.md")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
