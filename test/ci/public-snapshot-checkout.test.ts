import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { pathToFileURL } from "node:url";
import { buildPublicSnapshot } from "../../scripts/public_snapshot.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const PUBLIC_NAME = "md2vid Public Snapshot";
const PUBLIC_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";

function temporaryDirectory(t: TestContext, prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Fixture Author",
      GIT_AUTHOR_EMAIL: "1+fixture@users.noreply.github.com",
      GIT_COMMITTER_NAME: "Fixture Author",
      GIT_COMMITTER_EMAIL: "1+fixture@users.noreply.github.com",
      ...env,
    },
  }).trim();
}

function shallowClone(t: TestContext, source: string, prefix: string): string {
  const parent = temporaryDirectory(t, prefix);
  const checkout = join(parent, "checkout");
  execFileSync("git", ["clone", "--depth=1", "--no-tags", pathToFileURL(source).href, checkout], {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return checkout;
}

function createSourceRepository(t: TestContext): string {
  const root = temporaryDirectory(t, "md2vid-snapshot-auth-source-");
  git(root, ["init", "--initial-branch=main"]);
  writeFileSync(join(root, "README.md"), "# Public\n");
  mkdirSync(join(root, "engine"));
  writeFileSync(join(root, "engine", "index.ts"), "export {};\n");
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin", "tool.js"), "#!/usr/bin/env node\n");
  git(root, ["add", "--all"]);
  git(root, ["update-index", "--chmod=+x", "--", "bin/tool.js"]);
  git(root, ["commit", "-m", "source"]);
  return root;
}

async function validator(): Promise<(root: string) => boolean> {
  const module = await import("../../scripts/public_snapshot_checkout.ts");
  return module.isAuthenticPublicSnapshotCheckout;
}

async function repositoryValidator(): Promise<(root: string) => boolean> {
  const module = await import("../../scripts/public_snapshot_checkout.ts") as typeof import("../../scripts/public_snapshot_checkout.ts") & Record<string, any>;
  return module.isPublicSnapshotRepositoryCheckout;
}

test("authentic generated one-commit public snapshot checkout is recognized", async (t) => {
  const source = createSourceRepository(t);
  const parent = temporaryDirectory(t, "md2vid-snapshot-auth-output-");
  const snapshot = join(parent, "snapshot");
  buildPublicSnapshot({ repo: source, output: snapshot });
  chmodSync(join(snapshot, "bin", "tool.js"), 0o644);
  const template = join(parent, "empty-template");
  mkdirSync(template);
  const checker = await import("../../scripts/check_public_snapshot.ts");
  checker.initializePublicSnapshotRepository(snapshot, template);

  assert.match(git(snapshot, ["ls-tree", "HEAD", "--", "bin/tool.js"]), /^100755 blob /);
  assert.equal((await validator())(snapshot), true);
  assert.equal((await repositoryValidator())(snapshot), true);
});

test("public snapshot descendants retain an authenticated root", async (t) => {
  const source = createSourceRepository(t);
  const parent = temporaryDirectory(t, "md2vid-snapshot-descendant-");
  const snapshot = join(parent, "snapshot");
  const template = join(parent, "empty-template");
  mkdirSync(template);
  buildPublicSnapshot({ repo: source, output: snapshot });
  const checker = await import("../../scripts/check_public_snapshot.ts");
  checker.initializePublicSnapshotRepository(snapshot, template);
  writeFileSync(join(snapshot, "README.md"), "# Public descendant\n");
  git(snapshot, ["add", "README.md"]);
  git(snapshot, ["commit", "-m", "docs: update public readme"]);

  assert.equal((await validator())(snapshot), false);
  assert.equal((await repositoryValidator())(snapshot), true);
});

test("shallow public descendants fail closed without the authenticated root", async (t) => {
  const source = createSourceRepository(t);
  const parent = temporaryDirectory(t, "md2vid-snapshot-shallow-source-");
  const snapshot = join(parent, "snapshot");
  const template = join(parent, "empty-template");
  mkdirSync(template);
  buildPublicSnapshot({ repo: source, output: snapshot });
  const checker = await import("../../scripts/check_public_snapshot.ts");
  checker.initializePublicSnapshotRepository(snapshot, template);
  writeFileSync(join(snapshot, "README.md"), "# Public descendant\n");
  git(snapshot, ["add", "README.md"]);
  git(snapshot, ["commit", "-m", "docs: update public readme"]);
  const shallow = shallowClone(t, snapshot, "md2vid-snapshot-shallow-checkout-");

  assert.equal((await repositoryValidator())(shallow), false);
});

test("shallow boundary commits cannot impersonate the authenticated root", async (t) => {
  const source = createSourceRepository(t);
  const parent = temporaryDirectory(t, "md2vid-snapshot-shallow-spoof-");
  const snapshot = join(parent, "snapshot");
  const template = join(parent, "empty-template");
  mkdirSync(template);
  buildPublicSnapshot({ repo: source, output: snapshot });
  const checker = await import("../../scripts/check_public_snapshot.ts");
  checker.initializePublicSnapshotRepository(snapshot, template);
  git(snapshot, ["commit", "--allow-empty", "-m", "spoof public root"], {
    GIT_AUTHOR_NAME: PUBLIC_NAME,
    GIT_AUTHOR_EMAIL: PUBLIC_EMAIL,
    GIT_COMMITTER_NAME: PUBLIC_NAME,
    GIT_COMMITTER_EMAIL: PUBLIC_EMAIL,
  });
  const shallow = shallowClone(t, snapshot, "md2vid-snapshot-shallow-spoof-checkout-");

  assert.equal((await repositoryValidator())(shallow), false);
});

test("private-tree tests require the shared public repository validator", () => {
  for (const path of ["test/cli/skill-commands.test.ts", "test/docs-boundary.test.ts"]) {
    const source = readFileSync(join(ROOT, path), "utf8");
    assert.match(source, /isPublicSnapshotRepositoryCheckout/);
    assert.doesNotMatch(source, /existsSync\(PUBLIC_SNAPSHOT_MANIFEST\)/);
  }
});

test("bogus manifest in an ordinary repository is not an authentic public snapshot", async (t) => {
  const repo = temporaryDirectory(t, "md2vid-bogus-snapshot-");
  git(repo, ["init", "--initial-branch=main"]);
  writeFileSync(join(repo, "README.md"), "# Private\n");
  writeFileSync(join(repo, "public-snapshot.json"), JSON.stringify({ formatVersion: 1, count: 0, hash: "sha256:" + "0".repeat(64), paths: [] }));
  git(repo, ["add", "--all"]);
  git(repo, ["commit", "-m", "bogus"], {
    GIT_AUTHOR_NAME: PUBLIC_NAME,
    GIT_AUTHOR_EMAIL: PUBLIC_EMAIL,
    GIT_COMMITTER_NAME: PUBLIC_NAME,
    GIT_COMMITTER_EMAIL: PUBLIC_EMAIL,
  });

  assert.equal((await validator())(repo), false);
  assert.equal((await repositoryValidator())(repo), false);
});
