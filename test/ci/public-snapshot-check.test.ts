import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test, type TestContext } from "node:test";
import { buildPublicSnapshot } from "../../scripts/public_snapshot.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const CHECKER = join(ROOT, "scripts", "check_public_snapshot.ts");

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
    version: "0.1.2",
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
