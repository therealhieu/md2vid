import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test, type TestContext } from "node:test";
import {
  buildPublicSnapshot,
  publicSnapshotReport,
  type PublicSnapshotReport,
} from "../../scripts/public_snapshot.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const currentReport = publicSnapshotReport(ROOT);
const CHECKER = join(ROOT, "scripts", "check_public_snapshot.ts");
const narrationDeliveryPaths = [
  "engine/narration_request.ts",
  "engine/narration_evidence.ts",
  "scripts/narration_check.ts",
  "bin/md2vid.ts",
  "test/cli/narration-check.test.ts",
  "README.md",
  "docs/standards/video-generation.md",
  "docs/standards/frameworks/hyperframes.md",
  "docs/standards/frameworks/remotion.md",
  "skill/md2vid/SKILL.md",
  "skill/md2vid/references/standards/video-generation.md",
  "skill/md2vid/references/standards/frameworks/hyperframes.md",
  "skill/md2vid/references/standards/frameworks/remotion.md",
  "test/release/manifest.ts",
  "test/cli/pack.test.ts",
  "test/cli/package-meta.test.ts",
  "test/release/harness.ts",
  "test/release/harness.test.ts",
  "test/release/run.ts",
  "test/release/fixtures/kokoro-am-michael/audio_request.json",
  "test/release/fixtures/kokoro-am-michael/audio_meta.json",
  "test/release/fixtures/kokoro-am-michael/expected_words.json",
  "test/release/fixtures/kokoro-am-michael/fixture.json",
  "test/release/fixtures/kokoro-am-michael/assets/voice/intro.wav",
  "test/release/fixtures/kokoro-am-michael/assets/voice/followup.wav",
] as const;

function temporaryDirectory(t: TestContext, prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Fixture",
      GIT_AUTHOR_EMAIL: "1+fixture@users.noreply.github.com",
      GIT_COMMITTER_NAME: "Fixture",
      GIT_COMMITTER_EMAIL: "1+fixture@users.noreply.github.com",
    },
  }).trim();
}

function createCommittedPublicSource(t: TestContext): string {
  const source = temporaryDirectory(t, "md2vid-checker-source-");
  git(source, ["init", "--initial-branch=main"]);
  mkdirSync(join(source, "engine"));
  writeFileSync(join(source, "README.md"), "# Public\n");
  writeFileSync(join(source, "engine", "timing.ts"), "export const timing = 1;\n");
  git(source, ["add", "--all"]);
  git(source, ["commit", "-m", "source"]);
  return source;
}

async function createAuthenticSnapshot(t: TestContext): Promise<string> {
  const root = temporaryDirectory(t, "md2vid-checker-authentic-");
  const source = join(root, "source");
  const snapshot = join(root, "snapshot");
  const template = join(root, "empty-template");
  mkdirSync(source);
  mkdirSync(template);
  git(source, ["init", "--initial-branch=main"]);
  writeFileSync(join(source, "README.md"), "# Public\n");
  git(source, ["add", "--all"]);
  git(source, ["commit", "-m", "source"]);
  buildPublicSnapshot({ repo: source, output: snapshot });
  const checker = await import("../../scripts/check_public_snapshot.ts");
  checker.initializePublicSnapshotRepository(snapshot, template);
  return snapshot;
}

test("committed public report records visual timing delivery files", () => {
  for (const path of [
    "engine/visual_beats.ts",
    "engine/visual_sync.ts",
    "frameworks/hyperframes/visual_timing.ts",
    "frameworks/remotion/visual_bindings.ts",
    "frameworks/remotion/templates/src/VisualBeats.tsx",
    "scripts/plan.ts",
    "scripts/plan_project.ts",
  ]) {
    assert.ok(
      currentReport.paths.some((entry) => entry.path === path),
      `missing ${path}`,
    );
  }
});

test("committed public report records narration delivery files", () => {
  for (const required of narrationDeliveryPaths) {
    assert.ok(
      currentReport.paths.some((entry) => entry.path === required),
      `missing ${required}`,
    );
  }
});

test("committed dependency and workflow changes update dynamic authority without a root mirror", (t) => {
  const source = createCommittedPublicSource(t);
  mkdirSync(join(source, ".github", "workflows"), { recursive: true });
  writeFileSync(join(source, "package-lock.json"), '{"lockfileVersion":3}\n');
  writeFileSync(
    join(source, ".github", "workflows", "ci.yml"),
    "name: CI\n",
  );
  git(source, ["add", "--all"]);
  git(source, ["commit", "-m", "add dependency and workflow inputs"]);

  const first = publicSnapshotReport(source);
  assert.equal(existsSync(join(source, "public-snapshot.json")), false);

  writeFileSync(
    join(source, "package-lock.json"),
    '{"lockfileVersion":3,"packages":{}}\n',
  );
  writeFileSync(
    join(source, ".github", "workflows", "ci.yml"),
    "name: CI\npermissions: {}\n",
  );
  git(source, ["add", "--all"]);
  git(source, ["commit", "-m", "update dependency and workflow inputs"]);

  const second = publicSnapshotReport(source);
  assert.notEqual(second.hash, first.hash);
  assert.equal(second.count, first.count);
  assert.equal(existsSync(join(source, "public-snapshot.json")), false);
});

test("source boundary accepts deterministic regeneration of an authentic public snapshot", async (t) => {
  const source = await createAuthenticSnapshot(t);
  const root = temporaryDirectory(t, "md2vid-checker-idempotent-");
  const regenerated = join(root, "regenerated");
  const template = join(root, "empty-template");
  mkdirSync(template);
  buildPublicSnapshot({ repo: source, output: regenerated });
  const checker = await import("../../scripts/check_public_snapshot.ts") as typeof import("../../scripts/check_public_snapshot.ts") & Record<string, any>;
  checker.initializePublicSnapshotRepository(regenerated, template);
  const sourceCommit = git(source, ["rev-parse", "HEAD"]);
  git(source, ["branch", "work"]);

  assert.equal(git(regenerated, ["rev-parse", "HEAD"]), sourceCommit);
  assert.doesNotThrow(() => checker.assertSourceCommitBoundary(source, sourceCommit, regenerated));
});

test("source boundary rejects imported private source history", async (t) => {
  const root = temporaryDirectory(t, "md2vid-checker-private-history-");
  const source = join(root, "source");
  const snapshot = join(root, "snapshot");
  const template = join(root, "empty-template");
  mkdirSync(source);
  mkdirSync(template);
  git(source, ["init", "--initial-branch=main"]);
  writeFileSync(join(source, "README.md"), "# Private\n");
  git(source, ["add", "--all"]);
  git(source, ["commit", "-m", "private source"]);
  buildPublicSnapshot({ repo: source, output: snapshot });
  const checker = await import("../../scripts/check_public_snapshot.ts") as typeof import("../../scripts/check_public_snapshot.ts") & Record<string, any>;
  checker.initializePublicSnapshotRepository(snapshot, template);
  const sourceCommit = git(source, ["rev-parse", "HEAD"]);
  git(snapshot, ["fetch", "--no-tags", source, sourceCommit]);

  assert.throws(
    () => checker.assertSourceCommitBoundary(source, sourceCommit, snapshot),
    /private source commit is reachable/i,
  );
});

test("checker module import has no CLI side effects", (t) => {
  const cwd = temporaryDirectory(t, "md2vid-checker-import-");
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", `await import(${JSON.stringify(pathToFileURL(CHECKER).href)});`],
    {
      cwd,
      encoding: "utf8",
      env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "npm_execpath")),
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("fresh snapshot package metadata pins supported hosts and implementation version", async () => {
  const checker = await import("../../scripts/check_public_snapshot.ts");
  const validMetadata = {
    version: "0.1.12",
    packageManager: "npm@11.15.0",
    repository: {
      url: "git+https://github.com/therealhieu/md2vid.git",
    },
    os: ["darwin", "linux"],
  };

  assert.doesNotThrow(() => checker.validateSnapshotPackageMetadata(validMetadata));

  assert.throws(
    () => checker.validateSnapshotPackageMetadata({ ...validMetadata, cpu: undefined }),
    /cpu restriction/i,
  );

  assert.throws(
    () => checker.validateSnapshotPackageMetadata({ ...validMetadata, os: ["win32"] }),
    /package os/i,
  );

  assert.throws(
    () => checker.validateSnapshotPackageMetadata({ ...validMetadata, version: "0.2.0" }),
    /package version/i,
  );

  for (const [label, metadata] of [
    ["incorrect packageManager", { ...validMetadata, packageManager: "npm@10.9.0" }],
    ["missing packageManager", {
      version: validMetadata.version,
      repository: validMetadata.repository,
      os: validMetadata.os,
    }],
    ["non-string packageManager", { ...validMetadata, packageManager: 11 }],
  ] as const) {
    assert.throws(
      () => checker.validateSnapshotPackageMetadata(metadata),
      /packageManager/i,
      label,
    );
  }

  for (const [label, metadata] of [
    ["incorrect repository URL", {
      ...validMetadata,
      repository: { url: "git+https://github.com/example/md2vid.git" },
    }],
    ["missing repository URL", { ...validMetadata, repository: {} }],
    ["non-string repository URL", { ...validMetadata, repository: { url: 42 } }],
  ] as const) {
    assert.throws(
      () => checker.validateSnapshotPackageMetadata(metadata),
      /repository URL/i,
      label,
    );
  }
});

test("fresh repository initialization ignores inherited Git hooks and configuration", (t) => {
  const root = temporaryDirectory(t, "md2vid-checker-git-isolation-");
  const source = join(root, "source");
  const snapshot = join(root, "snapshot");
  const template = join(root, "empty-template");
  const hooks = join(root, "external-hooks");
  const marker = join(root, "hook-ran");
  mkdirSync(source);
  mkdirSync(template);
  mkdirSync(hooks);
  git(source, ["init", "--initial-branch=main"]);
  writeFileSync(join(source, "README.md"), "# Public\n");
  git(source, ["add", "--all"]);
  git(source, ["commit", "-m", "source"]);
  buildPublicSnapshot({ repo: source, output: snapshot });
  const hook = join(hooks, "pre-commit");
  writeFileSync(hook, `#!/bin/sh\nprintf hook > ${JSON.stringify(marker)}\nexit 91\n`);
  chmodSync(hook, 0o755);

  const invocation = [
    `import { initializePublicSnapshotRepository } from ${JSON.stringify(pathToFileURL(CHECKER).href)};`,
    `initializePublicSnapshotRepository(${JSON.stringify(snapshot)}, ${JSON.stringify(template)});`,
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", invocation], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.hooksPath",
      GIT_CONFIG_VALUE_0: hooks,
      GIT_DIR: join(root, "attacker-git-dir"),
      GIT_WORK_TREE: join(root, "attacker-work-tree"),
      GIT_TEMPLATE_DIR: hooks,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(marker), false, "inherited pre-commit hook must not execute");
  assert.equal(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: snapshot, encoding: "utf8" }).trim(), "1");
  assert.equal(execFileSync("git", ["branch", "--show-current"], { cwd: snapshot, encoding: "utf8" }).trim(), "main");
});

test("authenticated validation rejects a tag created by an injected command runner", async (t) => {
  const snapshot = await createAuthenticSnapshot(t);
  const checker = await import("../../scripts/check_public_snapshot.ts") as typeof import("../../scripts/check_public_snapshot.ts") & Record<string, any>;
  assert.equal(typeof checker.runAuthenticatedSnapshotValidation, "function");

  assert.throws(
    () => checker.runAuthenticatedSnapshotValidation(snapshot, "fake-npm", {
      runNpm(_snapshot: string, _npmExecPath: string, args: string[]): void {
        if (args[0] === "ci") git(snapshot, ["tag", "injected-tag"]);
      },
    }),
    /authentic|tag|branch|repository/i,
  );
});

test("authenticated validation rejects a branch created by an injected command runner", async (t) => {
  const snapshot = await createAuthenticSnapshot(t);
  const checker = await import("../../scripts/check_public_snapshot.ts") as typeof import("../../scripts/check_public_snapshot.ts") & Record<string, any>;
  assert.equal(typeof checker.runAuthenticatedSnapshotValidation, "function");

  assert.throws(
    () => checker.runAuthenticatedSnapshotValidation(snapshot, "fake-npm", {
      runNpm(_snapshot: string, _npmExecPath: string, args: string[]): void {
        if (args[0] === "ci") git(snapshot, ["branch", "injected-branch"]);
      },
    }),
    /authentic|tag|branch|repository/i,
  );
});
