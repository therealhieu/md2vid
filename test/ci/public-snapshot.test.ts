import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import {
  buildPublicSnapshot,
  writePublicSnapshotManifest,
  parsePublicSnapshotArgs,
  PUBLIC_SNAPSHOT_MANIFEST,
  type PublicSnapshotReport,
} from "../../scripts/public_snapshot.ts";
import { isolatedGitEnvironment } from "../../scripts/git_environment.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SNAPSHOT_CLI = join(ROOT, "scripts", "public_snapshot.ts");
const NOREPLY_EMAIL = "1+snapshot-tests@users.noreply.github.com";
const historicalMarkers = [
  ["07", "ch7", "finetuning"].join("-"),
  ["chapter", "7", "finetuning"].join("-"),
  ["topic", "3", "cnn"].join("-"),
  ["database", "indexing", "guide"].join("-"),
];
const vendoredGsapPath = ["engine", "vendor", ["gsap", "min", "js"].join(".")].join("/");

function temporaryDirectory(t: TestContext, prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function git(
  cwd: string,
  args: string[],
  options: { input?: string; env?: NodeJS.ProcessEnv } = {},
): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    input: options.input,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Snapshot Tests",
      GIT_AUTHOR_EMAIL: NOREPLY_EMAIL,
      GIT_COMMITTER_NAME: "Snapshot Tests",
      GIT_COMMITTER_EMAIL: NOREPLY_EMAIL,
      ...options.env,
    },
  }).trim();
}

function writeRepositoryFile(root: string, path: string, content: string | Buffer, executable = false): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  if (executable) chmodSync(target, 0o755);
}

function createRepository(
  t: TestContext,
  files: Record<string, string | Buffer | { content: string | Buffer; executable: true }>,
): string {
  const root = temporaryDirectory(t, "md2vid-public-source-");
  git(root, ["init", "--initial-branch=main"]);
  git(root, ["config", "user.name", "Snapshot Tests"]);
  git(root, ["config", "user.email", NOREPLY_EMAIL]);
  const executablePaths: string[] = [];
  for (const [path, value] of Object.entries(files)) {
    if (typeof value === "object" && !Buffer.isBuffer(value) && "executable" in value) {
      writeRepositoryFile(root, path, value.content, true);
      executablePaths.push(path);
    } else {
      writeRepositoryFile(root, path, value as string | Buffer);
    }
  }
  git(root, ["add", "--all"]);
  for (const path of executablePaths) git(root, ["update-index", "--chmod=+x", path]);
  git(root, ["commit", "-m", "fixture"]);
  return root;
}

function absentOutput(t: TestContext): string {
  return join(temporaryDirectory(t, "md2vid-public-output-parent-"), "snapshot");
}

function snapshotPaths(output: string): string[] {
  const paths: string[] = [];
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, name.name);
      const relative = absolute.slice(output.length + 1).replaceAll("\\", "/");
      if (name.isDirectory()) visit(absolute);
      else paths.push(relative);
    }
  };
  visit(output);
  return paths.sort();
}

function expectBuildFailure(repo: string, t: TestContext, path: string, content: string, pattern: RegExp): void {
  writeRepositoryFile(repo, path, content);
  git(repo, ["add", "--all"]);
  git(repo, ["commit", "-m", `add ${path}`]);
  assert.throws(() => buildPublicSnapshot({ repo, output: absentOutput(t) }), pattern);
}

test("public snapshot has no Windows native execution path", () => {
  const source = readFileSync(
    resolve(ROOT, "scripts", "public_snapshot.ts"),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /WindowsAcl|secureWindowsStagingDirectory|resolveWindowsNativeCommands|icacls|powershell|whoami\.exe|process\.platform/,
  );

  assert.equal(
    source.includes(String.raw`\b[A-Za-z]:\\Users\\`),
    true,
    "Windows developer-path leak scanning must remain",
  );
});

test("Git isolation always disables global config through POSIX null", () => {
  assert.deepEqual(
    isolatedGitEnvironment(
      {
        GIT_AUTHOR_NAME: "Snapshot",
        GIT_CONFIG_NOSYSTEM: "0",
        GIT_CONFIG_GLOBAL: "/attacker/global.gitconfig",
      },
      { PATH: "/usr/bin", GIT_DIR: "/attacker", Git_Work_Tree: "/attacker-tree" },
    ),
    {
      PATH: "/usr/bin",
      GIT_AUTHOR_NAME: "Snapshot",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
    },
  );
});

test("argument parsing rejects unknown, duplicate, missing, and positional options", () => {
  assert.deepEqual(parsePublicSnapshotArgs(["--output", "/tmp/out"]), { output: "/tmp/out", ref: "HEAD" });
  assert.deepEqual(parsePublicSnapshotArgs(["--ref", "main", "--output", "/tmp/out"]), {
    output: "/tmp/out",
    ref: "main",
  });
  for (const args of [
    [],
    ["--output"],
    ["--output", "/tmp/a", "--output", "/tmp/b"],
    ["--ref", "HEAD", "--ref", "main", "--output", "/tmp/a"],
    ["--wat", "x", "--output", "/tmp/a"],
    ["positional", "--output", "/tmp/a"],
  ]) {
    assert.throws(() => parsePublicSnapshotArgs(args), /option|output|duplicate|unknown|value/i);
  }
});

test("snapshot uses the exact public allowlist and preserves its own policy", (t) => {
  const repo = createRepository(t, {
    ".github/workflows/ci.yml": "name: CI\n",
    ".gitignore": "node_modules/\n",
    ".ignore": "dist/\n",
    "AGENTS.md": "@docs/standards\n",
    "LICENSE": "MIT\n",
    "README.md": "# Public\n",
    "bin/md2vid.ts": { content: "#!/usr/bin/env node\n", executable: true },
    "docs/release.md": "# Release\n",
    "docs/standards/public.md": "# Standard\n",
    "docs/superpowers/private.md": "internal\n",
    "engine/index.ts": "export {};\n",
    "examples/hash-table/remotion/README.md": "# Opt-in example\n",
    "examples/hash-table/remotion/src/Video.tsx": "export const Video = () => null;\n",
    "frameworks/index.ts": "export {};\n",
    "package.json": "{\"files\":[\"dist\"]}\n",
    "package-lock.json": "{}\n",
    "postinstall.mjs": "export {};\n",
    "scripts/public_snapshot.ts": "export {};\n",
    "security/audit-exceptions.json": "{}\n",
    "skill/md2vid/SKILL.md": "# Skill\n",
    "test/ci/public-snapshot.test.ts": "export {};\n",
    "test/golden/fixtures/example/expected/index.html": "<!doctype html>\n",
    "tsconfig.json": "{}\n",
    "tsconfig.dist.json": "{}\n",
    "inputs/private.md": "private\n",
    "outputs/render.mp4": "render\n",
    "node_modules/pkg/index.js": "dependency\n",
    "dist/bin.js": "built\n",
    "notes.txt": "unlisted\n",
    ".claude/settings.json": "{}\n",
  });
  const output = absentOutput(t);

  buildPublicSnapshot({ repo, output });

  const paths = snapshotPaths(output);
  for (const required of [
    ".github/workflows/ci.yml",
    "examples/hash-table/remotion/README.md",
    "examples/hash-table/remotion/src/Video.tsx",
    "scripts/public_snapshot.ts",
    "test/ci/public-snapshot.test.ts",
    "test/golden/fixtures/example/expected/index.html",
    PUBLIC_SNAPSHOT_MANIFEST,
  ]) {
    assert.ok(paths.includes(required), `missing ${required}`);
  }
  for (const forbidden of [
    ".claude/settings.json",
    "docs/superpowers/private.md",
    "inputs/private.md",
    "outputs/render.mp4",
    "node_modules/pkg/index.js",
    "dist/bin.js",
    "notes.txt",
  ]) {
    assert.equal(paths.includes(forbidden), false, `copied forbidden ${forbidden}`);
  }
  assert.equal(paths.some((path) => path === ".git" || path.startsWith(".git/")), false);
  const packageFiles = JSON.parse(readFileSync(join(output, "package.json"), "utf8")).files as string[];
  assert.equal(packageFiles.some((path) => path === "examples" || path.startsWith("examples/")), false);
});

test("manifest regeneration writes the current repository report without self-reference", (t) => {
  const repo = createRepository(t, {
    "README.md": "# Public\n",
    "engine/visual_beats.ts": "export {};\n",
    "frameworks/remotion/visual_bindings.ts": "export {};\n",
  });

  const report = writePublicSnapshotManifest(repo);
  const tracked = JSON.parse(readFileSync(join(repo, PUBLIC_SNAPSHOT_MANIFEST), "utf8")) as PublicSnapshotReport;

  assert.deepEqual(tracked, report);
  assert.equal(report.paths.some((entry) => entry.path === PUBLIC_SNAPSHOT_MANIFEST), false);
  assert.ok(report.paths.some((entry) => entry.path === "engine/visual_beats.ts"));
  assert.ok(report.paths.some((entry) => entry.path === "frameworks/remotion/visual_bindings.ts"));
});

test("no-argument snapshot CLI regenerates the root manifest", (t) => {
  const repo = createRepository(t, {
    "README.md": "# Public\n",
    "engine/visual_beats.ts": "export {};\n",
  });
  const manifestPath = join(repo, PUBLIC_SNAPSHOT_MANIFEST);
  writeFileSync(manifestPath, "{}\n");

  const result = spawnSync(process.execPath, [SNAPSHOT_CLI], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(readFileSync(manifestPath, "utf8")) as PublicSnapshotReport;
  assert.equal(report.paths.some((entry) => entry.path === PUBLIC_SNAPSHOT_MANIFEST), false);
  assert.match(result.stdout, new RegExp(`${report.count} files ${report.hash}`));
  assert.deepEqual(report, writePublicSnapshotManifest(repo));
});

test("snapshot rejects symlinks, submodules, and non-blob selected entries", (t) => {
  const symlinkRepo = createRepository(t, { "README.md": "# Public\n", "engine/target.ts": "export {};\n" });
  symlinkSync("target.ts", join(symlinkRepo, "engine", "link.ts"));
  git(symlinkRepo, ["add", "engine/link.ts"]);
  git(symlinkRepo, ["commit", "-m", "add symlink"]);
  assert.throws(
    () => buildPublicSnapshot({ repo: symlinkRepo, output: absentOutput(t) }),
    /mode|symlink|120000/i,
  );

  const submoduleRepo = createRepository(t, { "README.md": "# Public\n" });
  const commit = git(submoduleRepo, ["rev-parse", "HEAD"]);
  git(submoduleRepo, ["update-index", "--add", "--cacheinfo", `160000,${commit},engine/submodule`]);
  git(submoduleRepo, ["commit", "-m", "add gitlink"]);
  assert.throws(
    () => buildPublicSnapshot({ repo: submoduleRepo, output: absentOutput(t) }),
    /mode|submodule|160000/i,
  );
});

test("content scanner rejects historical markers, developer paths, vendored GSAP, Gmail addresses, and credentials", (t) => {
  for (const marker of historicalMarkers) {
    const repo = createRepository(t, { "README.md": "# Public\n" });
    expectBuildFailure(repo, t, "engine/leak.txt", marker, /historical|forbidden|marker/i);
  }

  for (const developerPath of [
    ["", "Users", "example", "project"].join("/"),
    ["", "home", "example", "project"].join("/"),
    ["C:", "Users", "example", "project"].join("\\"),
  ]) {
    const repo = createRepository(t, { "README.md": "# Public\n" });
    expectBuildFailure(repo, t, "README.md", `path=${developerPath}\n`, /absolute|developer|path/i);
  }

  const gsapRepo = createRepository(t, { "README.md": "# Public\n" });
  expectBuildFailure(gsapRepo, t, vendoredGsapPath, "vendored runtime\n", /GSAP|vendor/i);

  const gsapReferenceRepo = createRepository(t, { "README.md": "# Public\n" });
  expectBuildFailure(gsapReferenceRepo, t, "README.md", `${vendoredGsapPath}\n`, /GSAP|vendor/i);

  const gmailRepo = createRepository(t, { "README.md": "# Public\n" });
  const gmailAddress = `${["snapshot", "private", "identity"].join(".")}@${["gmail", "com"].join(".")}`;
  expectBuildFailure(gmailRepo, t, "README.md", `author=${gmailAddress}\n`, /gmail|email|identity/i);

  for (const credential of [
    ["ghp", "A".repeat(36)].join("_"),
    ["_auth", "ZmFrZTpzZWNyZXQ="].join("="),
  ]) {
    const repo = createRepository(t, { "README.md": "# Public\n" });
    expectBuildFailure(repo, t, "README.md", `${credential}\n`, /credential|secret|token|auth/i);
  }
});

test("content scanner rejects terminal home paths and additional credential variants", (t) => {
  const terminalPaths = [
    ["", "Users", "alice"].join("/"),
    ["", "home", "alice"].join("/"),
    ["C:", "Users", "alice"].join("\\"),
  ];
  for (const developerPath of terminalPaths) {
    const repo = createRepository(t, { "README.md": "# Public\n" });
    expectBuildFailure(repo, t, "README.md", `path=${developerPath}\n`, /absolute|developer|path/i);
  }

  for (const prefix of ["gho", "ghu", "ghs", "ghr"]) {
    const repo = createRepository(t, { "README.md": "# Public\n" });
    const token = [prefix, "V".repeat(36)].join("_");
    expectBuildFailure(repo, t, "README.md", `token=${token}\n`, /github|credential|token/i);
  }

  const awsRepo = createRepository(t, { "README.md": "# Public\n" });
  const awsSecret = "S".repeat(40);
  expectBuildFailure(
    awsRepo,
    t,
    "README.md",
    `${["aws", "secret", "access", "key"].join("_")}=${awsSecret}\n`,
    /aws|credential|secret/i,
  );

  for (const header of [
    ["-----BEGIN", "ENCRYPTED PRIVATE KEY-----"].join(" "),
    ["-----BEGIN", "DSA PRIVATE KEY-----"].join(" "),
    ["-----BEGIN", "PGP PRIVATE KEY BLOCK-----"].join(" "),
  ]) {
    const repo = createRepository(t, { "README.md": "# Public\n" });
    expectBuildFailure(repo, t, "README.md", `${header}\n`, /private key|credential/i);
  }

  for (const assignment of [
    `${["_authToken", "quoted-token-value"].join("=").replace("=", "=\"")}\"`,
    `${["_auth", "ZmFrZTpzZWNyZXQ="].join("=").replace("=", "='")}'`,
  ]) {
    const repo = createRepository(t, { "README.md": "# Public\n" });
    expectBuildFailure(repo, t, "README.md", `${assignment}\n`, /npm|auth|credential|token/i);
  }
});

test("quoted credential fixture exceptions remain exact-value-specific", (t) => {
  const allowed = ["_authToken", "registry-token-value"].join("=\"") + "\"";
  const allowedRepo = createRepository(t, {
    "README.md": "# Public\n",
    "test/release/harness.test.ts": `${allowed}\n`,
  });
  assert.doesNotThrow(() => buildPublicSnapshot({ repo: allowedRepo, output: absentOutput(t) }));

  const different = ["_authToken", "different-quoted-value"].join("=\"") + "\"";
  const differentRepo = createRepository(t, {
    "README.md": "# Public\n",
    "test/release/harness.test.ts": `${different}\n`,
  });
  assert.throws(
    () => buildPublicSnapshot({ repo: differentRepo, output: absentOutput(t) }),
    /npm|auth|credential|token/i,
  );
});

test("content scanner rejects quoted JSON and TOML credential keys in arbitrary bytes", (t) => {
  const awsSecret = "Q".repeat(40);
  const assignments = [
    `${JSON.stringify("aws_secret_access_key")}: ${JSON.stringify(awsSecret)}`,
    `'aws_secret_access_key' = '${awsSecret}'`,
    `${JSON.stringify("_authToken")}: ${JSON.stringify("quoted-json-token")}`,
    `'${"_auth"}' = '${"ZmFrZTpzZWNyZXQ="}'`,
  ];
  for (const [index, assignment] of assignments.entries()) {
    const prefix = index % 2 === 0 ? Buffer.from([0xff, 0x00]) : Buffer.from("prefix\0");
    const repo = createRepository(t, {
      "README.md": "# Public\n",
      [`engine/quoted-${index}.bin`]: Buffer.concat([prefix, Buffer.from(assignment)]),
    });
    assert.throws(
      () => buildPublicSnapshot({ repo, output: absentOutput(t) }),
      /aws|npm|auth|credential|secret|token/i,
    );
  }
});

test("quoted credential key exceptions remain exact-value-specific", (t) => {
  const allowed = `${JSON.stringify("_authToken")}: ${JSON.stringify("registry-token-value")}`;
  const allowedRepo = createRepository(t, {
    "README.md": "# Public\n",
    "test/release/harness.test.ts": `${allowed}\n`,
  });
  assert.doesNotThrow(() => buildPublicSnapshot({ repo: allowedRepo, output: absentOutput(t) }));

  const different = `${JSON.stringify("_authToken")}: ${JSON.stringify("different-json-value")}`;
  const differentRepo = createRepository(t, {
    "README.md": "# Public\n",
    "test/release/harness.test.ts": `${different}\n`,
  });
  assert.throws(
    () => buildPublicSnapshot({ repo: differentRepo, output: absentOutput(t) }),
    /npm|auth|credential|token/i,
  );
});

test("content scanner rejects file URL developer home paths without rejecting HTTP URL segments", (t) => {
  const fileUrls = [
    ["file:", "", "", "Users", "alice"].join("/"),
    ["file:", "", "", "Users", "alice", "project"].join("/"),
    ["file:", "", "", "home", "alice"].join("/"),
    ["file:", "", "", "home", "alice", "project"].join("/"),
    ["file:", "", "", "C:", "Users", "alice"].join("/"),
    ["file:", "", "", "C:", "Users", "alice", "project"].join("/"),
  ];
  for (const fileUrl of fileUrls) {
    const repo = createRepository(t, { "README.md": "# Public\n" });
    expectBuildFailure(repo, t, "README.md", `url=${fileUrl}\n`, /absolute|developer|file|path/i);
  }

  const httpRepo = createRepository(t, {
    "README.md": [
      "https://example.test/home/alice",
      "https://example.test/Users/alice/project",
    ].join("\n"),
  });
  assert.doesNotThrow(() => buildPublicSnapshot({ repo: httpRepo, output: absentOutput(t) }));
});

test("content scanner checks NUL-containing and invalid-UTF-8 blobs byte-for-byte", (t) => {
  const hiddenValues = [
    Buffer.concat([Buffer.from("prefix\0"), Buffer.from(["ghp", "B".repeat(36)].join("_"))]),
    Buffer.concat([Buffer.from([0xff, 0xfe, 0]), Buffer.from(["", "home", "example", "project"].join("/"))]),
    Buffer.concat([Buffer.from("prefix\0"), Buffer.from(historicalMarkers[0]!)]),
  ];

  for (const [index, content] of hiddenValues.entries()) {
    const repo = createRepository(t, { "README.md": "# Public\n", [`engine/hidden-${index}.bin`]: content });
    assert.throws(
      () => buildPublicSnapshot({ repo, output: absentOutput(t) }),
      /credential|token|absolute|developer|path|historical|marker|forbidden/i,
    );
  }
});

test("Gmail local-parts come from the selected commit, not mutable repository config", (t) => {
  const repo = createRepository(t, { "README.md": "# Public\n" });
  const configuredLocalPart = ["mutable", "config", "identity"].join(".");
  git(repo, ["config", "user.email", `${configuredLocalPart}@${["gmail", "com"].join(".")}`]);
  writeRepositoryFile(repo, "README.md", `author=${configuredLocalPart}\n`);
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "content from noreply commit"]);

  const first = buildPublicSnapshot({ repo, output: absentOutput(t) });
  git(repo, ["config", "user.email", `different.${configuredLocalPart}@${["gmail", "com"].join(".")}`]);
  const second = buildPublicSnapshot({ repo, output: absentOutput(t) });
  assert.deepEqual(first, second);
});

test("selected Gmail commit identity rejects its bare local-part without copying the email", (t) => {
  const repo = createRepository(t, { "README.md": "# Public\n" });
  const localPart = ["selected", "commit", "identity"].join(".");
  const email = `${localPart}@${["gmail", "com"].join(".")}`;
  writeRepositoryFile(repo, "README.md", `author=${localPart}\n`);
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "gmail identity"], {
    env: {
      GIT_AUTHOR_NAME: "Private Fixture",
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: "Private Fixture",
      GIT_COMMITTER_EMAIL: email,
    },
  });

  assert.throws(
    () => buildPublicSnapshot({ repo, output: absentOutput(t) }),
    /personal|gmail|identity|local-part/i,
  );
});

test("credential fixture exceptions are path-, rule-, and exact-value-specific", (t) => {
  const allowedValues = ["registry-token-value", "auth-token-value"];
  const allowedBody = allowedValues.map((value) => `//registry.example.test/:_authToken=${value}`).join("\n");
  const repo = createRepository(t, {
    "README.md": "# Public\n",
    "test/release/harness.test.ts": `${allowedBody}\n`,
  });
  const output = absentOutput(t);
  const report = buildPublicSnapshot({ repo, output });

  assert.match(report.contentScan.scope, /every selected blob|all selected blobs/i);
  assert.match(report.contentScan.scope, /byte|ASCII/i);
  assert.ok(report.contentScan.exclusions.every((entry) => entry.path === "test/release/harness.test.ts"));
  assert.ok(report.contentScan.exclusions.every((entry) => "rule" in entry && "matchedValueSha256" in entry));
  assert.equal(existsSync(join(output, "test", "release", "harness.test.ts")), true);

  const differentAuth = ["_authToken", "different-token-value"].join("=");
  const differentAuthRepo = createRepository(t, {
    "README.md": "# Public\n",
    "test/release/harness.test.ts": `${differentAuth}\n`,
  });
  assert.throws(
    () => buildPublicSnapshot({ repo: differentAuthRepo, output: absentOutput(t) }),
    /credential|token|auth/i,
  );

  const githubTokenRepo = createRepository(t, {
    "README.md": "# Public\n",
    "test/release/harness.test.ts": `token=${["ghp", "C".repeat(36)].join("_")}\n`,
  });
  assert.throws(
    () => buildPublicSnapshot({ repo: githubTokenRepo, output: absentOutput(t) }),
    /credential|token|github/i,
  );
});

test("dirty and untracked worktree files never enter a commit snapshot", (t) => {
  const repo = createRepository(t, {
    "README.md": "committed\n",
    "engine/index.ts": "export const state = 'committed';\n",
  });
  writeRepositoryFile(repo, "README.md", "dirty\n");
  writeRepositoryFile(repo, "engine/untracked.ts", "export const secret = true;\n");
  writeRepositoryFile(repo, ".git/internal", "must never copy\n");
  const output = absentOutput(t);

  buildPublicSnapshot({ repo, output, ref: "HEAD" });

  assert.equal(readFileSync(join(output, "README.md"), "utf8"), "committed\n");
  assert.equal(existsSync(join(output, "engine", "untracked.ts")), false);
  assert.equal(existsSync(join(output, ".git")), false);
});

test("snapshot source ignores conflicting inherited Git repository environment", (t) => {
  const repoA = createRepository(t, { "README.md": "from repo A\n" });
  const repoB = createRepository(t, { "README.md": "from repo B\n", "engine/repo-b.ts": "export {};\n" });
  const output = absentOutput(t);
  const previousGitDir = process.env.GIT_DIR;
  const previousGitWorkTree = process.env.GIT_WORK_TREE;
  process.env.GIT_DIR = join(repoB, ".git");
  process.env.GIT_WORK_TREE = repoB;
  try {
    buildPublicSnapshot({ repo: repoA, output });
  } finally {
    if (previousGitDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = previousGitDir;
    if (previousGitWorkTree === undefined) delete process.env.GIT_WORK_TREE;
    else process.env.GIT_WORK_TREE = previousGitWorkTree;
  }

  assert.equal(readFileSync(join(output, "README.md"), "utf8"), "from repo A\n");
  assert.equal(existsSync(join(output, "engine", "repo-b.ts")), false);
});

test("output is created exclusively under a real parent and never overwrites an existing target", (t) => {
  const repo = createRepository(t, { "README.md": "# Public\n" });

  const existingEmpty = temporaryDirectory(t, "md2vid-existing-empty-");
  assert.throws(() => buildPublicSnapshot({ repo, output: existingEmpty }), /exist|exclusive|target/i);
  assert.deepEqual(readdirSync(existingEmpty), []);

  const existingNonempty = temporaryDirectory(t, "md2vid-existing-nonempty-");
  writeFileSync(join(existingNonempty, "occupied"), "x");
  assert.throws(() => buildPublicSnapshot({ repo, output: existingNonempty }), /exist|exclusive|target/i);
  assert.equal(readFileSync(join(existingNonempty, "occupied"), "utf8"), "x");

  const file = join(temporaryDirectory(t, "md2vid-output-file-"), "file");
  writeFileSync(file, "x");
  assert.throws(() => buildPublicSnapshot({ repo, output: file }), /exist|exclusive|target/i);
  assert.equal(readFileSync(file, "utf8"), "x");

  const symlinkRoot = temporaryDirectory(t, "md2vid-output-link-");
  const realParent = join(symlinkRoot, "real-parent");
  mkdirSync(realParent);
  const linkedParent = join(symlinkRoot, "linked-parent");
  symlinkSync(realParent, linkedParent, "dir");
  const throughSymlink = join(linkedParent, "snapshot");
  assert.throws(() => buildPublicSnapshot({ repo, output: throughSymlink }), /symlink|real parent|unsafe/i);
  assert.equal(existsSync(throughSymlink), false);

  const missingParent = join(temporaryDirectory(t, "md2vid-output-missing-parent-"), "missing", "snapshot");
  assert.throws(() => buildPublicSnapshot({ repo, output: missingParent }), /parent.*exist|real parent/i);
  assert.equal(existsSync(missingParent), false);
});

test("final output appears only after complete staging", (t) => {
  const repo = createRepository(t, { "README.md": "# Public\n", "engine/index.ts": "export {};\n" });
  const output = absentOutput(t);
  let observedPartialFinal = false;
  const options = {
    repo,
    output,
    get ref(): string {
      observedPartialFinal = existsSync(output);
      return "HEAD";
    },
  };

  buildPublicSnapshot(options);

  assert.equal(observedPartialFinal, false, "the trusted final path must remain absent during staging");
  assert.equal(existsSync(join(output, PUBLIC_SNAPSHOT_MANIFEST)), true);
});

test("publish recheck never overwrites a raced symlink final target", (t) => {
  const repo = createRepository(t, { "README.md": "# Public\n" });
  const output = absentOutput(t);
  const attackerTarget = temporaryDirectory(t, "md2vid-raced-target-");
  const options = {
    repo,
    output,
    get ref(): string {
      if (!existsSync(output)) symlinkSync(attackerTarget, output, "dir");
      return "HEAD";
    },
  };

  assert.throws(() => buildPublicSnapshot(options), /exist|symlink|publish|unsafe|target/i);
  assert.equal(lstatSync(output).isSymbolicLink(), true);
  assert.deepEqual(readdirSync(attackerTarget), []);
});

test("POSIX output parents reject unsafe non-sticky write permissions", (t) => {
  const repo = createRepository(t, { "README.md": "# Public\n" });
  const parent = temporaryDirectory(t, "md2vid-unsafe-output-parent-");
  chmodSync(parent, 0o777);
  const output = join(parent, "snapshot");

  assert.throws(() => buildPublicSnapshot({ repo, output }), /permission|writable|trusted|unsafe/i);
  assert.equal(existsSync(output), false);
});

test("staged files are hash- and size-verified before atomic publication", async (t) => {
  const module = await import("../../scripts/public_snapshot.ts") as typeof import("../../scripts/public_snapshot.ts") & Record<string, any>;
  assert.equal(typeof module.verifyMaterializedSnapshot, "function");
  const staging = temporaryDirectory(t, "md2vid-staged-verify-");
  const content = Buffer.from("verified\n");
  writeFileSync(join(staging, "README.md"), content);
  const report: PublicSnapshotReport = {
    formatVersion: 1,
    count: 1,
    hash: `sha256:${"0".repeat(64)}`,
    paths: [{
      path: "README.md",
      mode: "100644",
      bytes: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex"),
    }],
    contentScan: { scope: "test", exclusions: [] },
  };
  writeFileSync(join(staging, PUBLIC_SNAPSHOT_MANIFEST), `${JSON.stringify(report, null, 2)}\n`);
  assert.doesNotThrow(() => module.verifyMaterializedSnapshot(staging, report));
  writeFileSync(join(staging, "README.md"), "tampered\n");
  assert.throws(() => module.verifyMaterializedSnapshot(staging, report), /hash|size|manifest|staged/i);

  const source = readFileSync(join(ROOT, "scripts", "public_snapshot.ts"), "utf8");
  assert.match(source, /verifyMaterializedSnapshot\(output\.staging\.path, report\);\s*publishOutput\(output\);/);
});

test("canonical Git root containment is enforced when invoked from a repository subdirectory", (t) => {
  const repo = createRepository(t, { "README.md": "# Public\n", "engine/index.ts": "export {};\n" });
  const inside = join(repo, "snapshot");
  assert.throws(
    () => buildPublicSnapshot({ repo: join(repo, "engine"), output: inside }),
    /inside|unsafe|repository/i,
  );
  assert.equal(existsSync(inside), false);
  assert.throws(() => buildPublicSnapshot({ repo, output: repo }), /contain|unsafe|repository|exist/i);
});

test("a failed build removes only the destination created by that invocation", (t) => {
  const repo = createRepository(t, {
    "README.md": `token=${["ghp", "D".repeat(36)].join("_")}\n`,
  });
  const output = absentOutput(t);
  assert.throws(() => buildPublicSnapshot({ repo, output }), /credential|token|github/i);
  assert.equal(existsSync(output), false);
  assert.equal(
    readdirSync(dirname(output)).some((name) => name.startsWith(`.${basename(output)}.staging-`)),
    false,
    "failed build must remove only its private staging directory",
  );

  const existing = temporaryDirectory(t, "md2vid-existing-user-content-");
  writeFileSync(join(existing, "keep.txt"), "keep\n");
  assert.throws(() => buildPublicSnapshot({ repo, output: existing }), /exist|exclusive|target/i);
  assert.equal(readFileSync(join(existing, "keep.txt"), "utf8"), "keep\n");
});

test("manifest and output are deterministic and omit source commit identity", (t) => {
  const repo = createRepository(t, {
    "README.md": "# Public\n",
    "engine/index.ts": "export const value = 1;\n",
  });
  const first = absentOutput(t);
  const second = absentOutput(t);
  const firstReport = buildPublicSnapshot({ repo, output: first });
  const secondReport = buildPublicSnapshot({ repo, output: second });
  const sourceCommit = git(repo, ["rev-parse", "HEAD"]);

  assert.deepEqual(firstReport, secondReport);
  assert.equal(readFileSync(join(first, PUBLIC_SNAPSHOT_MANIFEST), "utf8"), readFileSync(join(second, PUBLIC_SNAPSHOT_MANIFEST), "utf8"));
  assert.deepEqual(snapshotPaths(first), snapshotPaths(second));
  assert.equal(JSON.stringify(firstReport).includes(sourceCommit), false);
  assert.equal(JSON.stringify(firstReport).includes(NOREPLY_EMAIL), false);
  assert.match(firstReport.hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(firstReport.count, firstReport.paths.length);
});

test("manifest preserves executable modes and POSIX permissions", (t) => {
  const repo = createRepository(t, {
    "README.md": "# Public\n",
    "bin/md2vid.js": { content: "#!/usr/bin/env node\n", executable: true },
    "engine/index.ts": "export {};\n",
  });
  const output = absentOutput(t);
  const report = buildPublicSnapshot({ repo, output });

  assert.equal(report.paths.find((entry) => entry.path === "bin/md2vid.js")?.mode, "100755");
  assert.equal(report.paths.find((entry) => entry.path === "engine/index.ts")?.mode, "100644");
  assert.equal(lstatSync(output).mode & 0o777, 0o700);
  assert.equal(lstatSync(join(output, "bin", "md2vid.js")).mode & 0o777, 0o755);
  assert.equal(lstatSync(join(output, "engine", "index.ts")).mode & 0o777, 0o644);
});

test("CLI rejects invalid options and builds a valid snapshot", (t) => {
  const repo = createRepository(t, { "README.md": "# Public\n" });
  const script = join(ROOT, "scripts", "public_snapshot.ts");
  const bad = spawnSync(process.execPath, [script, "--unknown", "x"], { cwd: repo, encoding: "utf8" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /unknown|option/i);

  const output = absentOutput(t);
  const relativeOutput = relative(repo, output);
  const good = spawnSync(process.execPath, [script, "--output", relativeOutput, "--ref", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  });
  assert.equal(good.status, 0, good.stderr);
  assert.equal(existsSync(join(output, "README.md")), true);
  assert.equal(existsSync(join(output, PUBLIC_SNAPSHOT_MANIFEST)), true);
});

test("package scripts split focused snapshot tests from the fresh-repository integration gate", () => {
  const packageMetadata = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    packageManager: string;
    scripts: Record<string, string>;
  };
  assert.equal(packageMetadata.packageManager, "npm@11.15.0");
  assert.equal(
    packageMetadata.scripts["public:snapshot:test"],
    "node --test test/ci/public-snapshot.test.ts test/ci/public-snapshot-check.test.ts test/ci/public-snapshot-checkout.test.ts",
  );
  assert.equal(packageMetadata.scripts["public:snapshot:check"], "node scripts/check_public_snapshot.ts");
});

test("actual repository HEAD snapshot contains required public code and excludes private/generated roots", (t) => {
  const output = absentOutput(t);
  buildPublicSnapshot({
    repo: ROOT,
    output,
    ref: process.env.MD2VID_PUBLIC_SNAPSHOT_REF ?? "HEAD",
  });
  const paths = snapshotPaths(output);
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

  for (const required of [
    ".github/workflows/ci.yml",
    ".github/workflows/release.yml",
    "engine/config.ts",
    "examples/hash-table/remotion/README.md",
    "examples/hash-table/remotion/src/Video.tsx",
    "frameworks/hyperframes/scaffold.ts",
    "engine/visual_beats.ts",
    "engine/visual_sync.ts",
    "frameworks/hyperframes/visual_timing.ts",
    "frameworks/remotion/visual_bindings.ts",
    "frameworks/remotion/templates/src/VisualBeats.tsx",
    "scripts/plan.ts",
    "scripts/plan_project.ts",
    "test/golden/fixtures/hash-table-example/expected/index.html",
  ]) {
    assert.ok(paths.includes(required), `missing actual HEAD content: ${required}`);
  }
  for (const required of narrationDeliveryPaths) {
    assert.ok(paths.includes(required), `missing actual HEAD narration content: ${required}`);
  }
  for (const forbiddenRoot of [".git/", ".claude/", "docs/superpowers/", "inputs/", "outputs/", "node_modules/", "dist/"]) {
    assert.equal(paths.some((path) => path.startsWith(forbiddenRoot)), false, `included ${forbiddenRoot}`);
  }
  for (const marker of historicalMarkers) {
    for (const path of paths) {
      if (path === PUBLIC_SNAPSHOT_MANIFEST) continue;
      const body = readFileSync(join(output, path));
      if (!body.includes(0)) assert.equal(body.toString("utf8").includes(marker), false, `${path} contains ${marker}`);
    }
  }
  assert.equal(paths.some((path) => /(^|\/)vendor(?:ed)?\/.*gsap|(^|\/)gsap(?:\.min)?\.js$/i.test(path)), false);
  const packageFiles = JSON.parse(readFileSync(join(output, "package.json"), "utf8")).files as string[];
  assert.equal(packageFiles.some((path) => path === "examples" || path.startsWith("examples/")), false);
});
