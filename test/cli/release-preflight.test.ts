import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  assertFirstPublication,
  assertRecoveryPublication,
  classifyNpmLookup,
  compareVersions,
  isNpmVersionNotFound,
  parseReleaseTag,
  readReleaseMetadataAtCommit,
  run,
  selectRetainedArtifact,
  validateReleaseMetadata,
  validateSha512Integrity,
  type CommandResult,
  type CommandRunner,
} from "../../scripts/release_preflight.ts";
import { readArtifactMetadata } from "../release/artifact.ts";

const validPackageJson = {
  name: "md2vid",
  version: "1.2.3",
  repository: { url: "git+https://github.com/therealhieu/md2vid.git" },
};

const validLockJson = {
  name: "md2vid",
  version: "1.2.3",
  packages: { "": { name: "md2vid", version: "1.2.3" } },
};

const VALID_SRI = "sha512-AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ==";
const VALID_COMMIT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const VALID_SHA256 = "b".repeat(64);

function validArtifact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    packageName: "md2vid",
    version: "1.2.3",
    tag: "v1.2.3",
    commit: VALID_COMMIT,
    nodeVersion: "v22.18.0",
    npmVersion: "11.15.0",
    tarball: "md2vid-1.2.3.tgz",
    integrity: VALID_SRI,
    sha256: VALID_SHA256,
    ...overrides,
  };
}

function temporaryDirectory(t: TestContext, prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("release tags are strict stable SemVer", () => {
  assert.deepEqual(parseReleaseTag("v1.2.3"), { tag: "v1.2.3", version: "1.2.3" });
  assert.deepEqual(parseReleaseTag("v0.0.0"), { tag: "v0.0.0", version: "0.0.0" });

  for (const tag of [
    "1.2.3",
    "v1.2",
    "v1.2.3-beta.1",
    "v01.2.3",
    "v1.02.3",
    "v1.2.03",
    "v1.2.3+build",
    "v-1.2.3",
  ]) {
    assert.throws(() => parseReleaseTag(tag), /strict vX\.Y\.Z/);
  }
});

test("version comparison handles three non-negative integer components", () => {
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("1.2.4", "1.2.3"), 1);
  assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareVersions("0.9.9", "1.0.0"), -1);
  assert.equal(compareVersions("9007199254740993.0.0", "9007199254740992.0.0"), 1);
  assert.throws(() => compareVersions("1.2", "1.2.0"), /three non-negative integer components/);
  assert.throws(() => compareVersions("1.2.-1", "1.2.0"), /three non-negative integer components/);
});

test("package lock tag and repository identity must match", () => {
  assert.doesNotThrow(() => validateReleaseMetadata({
    tag: "v1.2.3",
    packageJson: validPackageJson,
    lockJson: validLockJson,
    repository: "therealhieu/md2vid",
  }));

  const invalidCases: Array<[string, unknown, unknown, RegExp]> = [
    ["v1.2.4", validPackageJson, validLockJson, /tag.*package version/],
    ["v1.2.3", { ...validPackageJson, name: "other" }, validLockJson, /package name/],
    ["v1.2.3", validPackageJson, { ...validLockJson, name: "other" }, /lockfile name/],
    ["v1.2.3", validPackageJson, { ...validLockJson, version: "1.2.2" }, /lockfile version/],
    ["v1.2.3", validPackageJson, { ...validLockJson, packages: { "": { name: "other", version: "1.2.3" } } }, /lockfile root package name/],
    ["v1.2.3", validPackageJson, { ...validLockJson, packages: { "": { name: "md2vid", version: "1.2.2" } } }, /lockfile root package version/],
    ["v1.2.3", { ...validPackageJson, repository: { url: "https://github.com/therealhieu/md2vid" } }, validLockJson, /repository URL/],
  ];

  for (const [tag, packageJson, lockJson, expected] of invalidCases) {
    assert.throws(() => validateReleaseMetadata({
      tag,
      packageJson,
      lockJson,
      repository: "therealhieu/md2vid",
    }), expected);
  }
});

test("strict SHA-512 SRI validation requires one canonical 64-byte digest", () => {
  assert.equal(validateSha512Integrity(VALID_SRI), VALID_SRI);
  for (const integrity of [
    "sha512-",
    "sha512-abc",
    `sha512-${Buffer.alloc(63).toString("base64")}`,
    `sha512-${Buffer.alloc(65).toString("base64")}`,
    `sha256-${Buffer.alloc(64).toString("base64")}`,
    `${VALID_SRI} ${VALID_SRI}`,
    `${VALID_SRI}\n`,
    "sha512-!!!!",
  ]) {
    assert.throws(() => validateSha512Integrity(integrity), /valid SHA-512 SRI/);
  }
});

test("npm lookup accepts only exact package/version structured absence", () => {
  const version = "9.9.9";
  const stdout = JSON.stringify({
    error: {
      code: "E404",
      summary: `No match found for version ${version}`,
      detail: `'md2vid@${version}' is not in this registry.`,
    },
  });
  const stderr = [
    "npm error code E404",
    `npm error 404 No match found for version ${version}`,
    "npm error 404",
    `npm error 404  'md2vid@${version}' is not in this registry.`,
  ].join("\n");
  assert.deepEqual(classifyNpmLookup({ status: 1, stdout, stderr }, "md2vid", version), { kind: "absent" });
  assert.deepEqual(
    classifyNpmLookup({ status: 0, stdout: `${JSON.stringify(VALID_SRI)}\n`, stderr: "" }, "md2vid", version),
    { kind: "existing", integrity: VALID_SRI },
  );
});

test("npm lookup rejects generic, mismatched, and permission-shaped E404 output", () => {
  const version = "9.9.9";
  const cases = [
    { error: { code: "E404" }, stderr: "npm error code E404\nnpm error 404 Not Found" },
    {
      error: { code: "E404", summary: `No match found for version ${version}`, detail: "'other@9.9.9' is not in this registry." },
      stderr: `npm error code E404\nnpm error 404 No match found for version ${version}\nnpm error 404  'other@9.9.9' is not in this registry.`,
    },
    {
      error: { code: "E404", summary: "No match found for version 8.8.8", detail: "'md2vid@8.8.8' is not in this registry." },
      stderr: "npm error code E404\nnpm error 404 No match found for version 8.8.8\nnpm error 404  'md2vid@8.8.8' is not in this registry.",
    },
    {
      error: { code: "E404", detail: `The requested resource 'md2vid@${version}' could not be found or you do not have permission to access it.` },
      stderr: "npm error code E404\nnpm error 404 Not Found",
    },
  ];
  for (const { error, stderr } of cases) {
    assert.throws(
      () => classifyNpmLookup({ status: 1, stdout: JSON.stringify({ error }), stderr }, "md2vid", version),
      /registry lookup failed/,
    );
  }
});

test("npm lookup accepts pinned npm 11.15.0 structured E404 output", () => {
  const stdout = JSON.stringify({
    error: {
      code: "E404",
      summary: "No match found for version 9.9.9",
      detail: "'md2vid@9.9.9' is not in this registry.",
    },
  });
  const stderr = [
    "npm error code E404",
    "npm error 404 No match found for version 9.9.9",
    "npm error 404",
    "npm error 404  'md2vid@9.9.9' is not in this registry.",
    "npm error 404",
    "npm error 404 Note that you can also install from a tarball, folder, http url, or git url.",
  ].join("\n");
  assert.deepEqual(classifyNpmLookup({ status: 1, stdout, stderr }, "md2vid", "9.9.9"), { kind: "absent" });
});

test("version-specific npm lookup accepts current pinned npm 11.15.0 missing detail", () => {
  const version = "9.9.9";
  const stdout = JSON.stringify({
    error: {
      code: "E404",
      summary: `No match found for version ${version}`,
      detail: `The requested resource 'md2vid@${version}' could not be found or you do not have permission to access it.\n\nNote that you can also install from a\ntarball, folder, http url, or git url.`,
    },
  });
  const stderr = [
    "npm error code E404",
    `npm error 404 No match found for version ${version}`,
    "npm error 404",
    `npm error 404  The requested resource 'md2vid@${version}' could not be found or you do not have permission to access it.`,
    "npm error 404",
    "npm error 404 Note that you can also install from a",
    "npm error 404 tarball, folder, http url, or git url.",
    "npm error A complete log of this run can be found in: /tmp/npm-debug.log",
  ].join("\n");
  assert.equal(isNpmVersionNotFound({ status: 1, stdout, stderr }, "md2vid", version), true);
});

test("version-specific npm lookup does not mistake SemVer components for HTTP status", () => {
  for (const version of ["401.0.0", "1.500.0"]) {
    const stdout = JSON.stringify({
      error: {
        code: "E404",
        summary: `No match found for version ${version}`,
        detail: `'md2vid@${version}' is not in this registry.`,
      },
    });
    const stderr = [
      "npm error code E404",
      `npm error 404 No match found for version ${version}`,
      "npm error 404",
      `npm error 404  'md2vid@${version}' is not in this registry.`,
    ].join("\n");
    assert.equal(isNpmVersionNotFound({ status: 1, stdout, stderr }, "md2vid", version), true);
  }
});

test("npm lookup fails closed for malformed success and non-404 failures", () => {
  for (const result of [
    { status: 0, stdout: '"sha256-abc"', stderr: "" },
    { status: 0, stdout: "not-json", stderr: "" },
    { status: 0, stdout: "null", stderr: "" },
  ]) {
    assert.throws(() => classifyNpmLookup(result, "md2vid", "9.9.9"), /invalid dist\.integrity/);
  }

  for (const result of [
    { status: 1, stdout: "", stderr: "ECONNRESET" },
    { status: 1, stdout: "", stderr: "403 Forbidden" },
    { status: null, stdout: JSON.stringify({ error: { code: "E404" } }), stderr: "npm error code E404\nnpm error 404 Not Found" },
    { status: 1, stdout: JSON.stringify({ error: { code: "E401" } }), stderr: "npm error code E404\nnpm error 404 Not Found" },
    { status: 1, stdout: JSON.stringify({ error: { code: "E404" } }), stderr: "500 Internal Server Error" },
    ...["ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"].map((transport) => ({
      status: 1,
      stdout: JSON.stringify({ error: { code: "E404" } }),
      stderr: `npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/md2vid\nnpm error ${transport}`,
    })),
    { status: 1, stdout: JSON.stringify({ error: { code: "E404" } }), stderr: "npm error code ECONNRESET\nnpm error 404 Not Found" },
    { status: 1, stdout: JSON.stringify({ message: "body mentions E404 and 404 Not Found" }), stderr: "" },
    { status: 1, stdout: "404-ish response", stderr: "" },
    { status: 1, stdout: "", stderr: "401 Unauthorized; upstream said npm error code E404 and 404 Not Found" },
    { status: 1, stdout: "", stderr: "403 Forbidden; upstream said npm error code E404 and 404 Not Found" },
    { status: 1, stdout: "", stderr: "429 Too Many Requests; upstream said npm error code E404 and 404 Not Found" },
    { status: 1, stdout: "", stderr: "500 Internal Server Error; upstream said npm error code E404 and 404 Not Found" },
  ]) {
    assert.throws(() => classifyNpmLookup(result, "md2vid", "9.9.9"), /registry lookup failed/);
  }
});

test("first publication is monotonic and requires no GitHub Release", () => {
  assert.doesNotThrow(() => assertFirstPublication({ candidate: "1.2.3", latest: "1.2.2", githubRelease: "absent" }));
  assert.doesNotThrow(() => assertFirstPublication({ candidate: "0.0.1", latest: null, githubRelease: "absent" }));
  assert.throws(
    () => assertFirstPublication({ candidate: "1.2.2", latest: "1.2.2", githubRelease: "absent" }),
    /greater than npm latest/,
  );
  assert.throws(
    () => assertFirstPublication({ candidate: "1.2.1", latest: "1.2.2", githubRelease: "absent" }),
    /greater than npm latest/,
  );
  assert.throws(
    () => assertFirstPublication({ candidate: "1.2.3", latest: "1.2.2", githubRelease: "matching" }),
    /first publication requires no GitHub Release/,
  );
});

test("recovery ignores latest ordering and requires original integrity", () => {
  const otherIntegrity = `sha512-${Buffer.alloc(64, 2).toString("base64")}`;
  assert.doesNotThrow(() => assertRecoveryPublication({ registryIntegrity: VALID_SRI, artifactIntegrity: VALID_SRI, githubRelease: "absent" }));
  assert.doesNotThrow(() => assertRecoveryPublication({ registryIntegrity: VALID_SRI, artifactIntegrity: VALID_SRI, githubRelease: "matching" }));
  assert.throws(
    () => assertRecoveryPublication({ registryIntegrity: VALID_SRI, artifactIntegrity: otherIntegrity, githubRelease: "absent" }),
    /integrity mismatch/,
  );
  assert.throws(
    () => assertRecoveryPublication({ registryIntegrity: VALID_SRI, artifactIntegrity: VALID_SRI, githubRelease: "conflicting" }),
    /conflicting GitHub Release/,
  );
});

test("retained artifact selection is exact, workflow-bound, and deterministic", () => {
  const artifacts = [
    {
      id: 11,
      name: "md2vid-v1.2.3-abc",
      expired: false,
      created_at: "2026-07-21T00:00:00Z",
      workflow_run: { id: 101, head_sha: "abc", path: ".github/workflows/release.yml" },
    },
    {
      id: 12,
      name: "md2vid-v1.2.3-abc",
      expired: false,
      created_at: "2026-07-22T00:00:00Z",
      workflow_run: { id: 102, head_sha: "abc", path: ".github/workflows/release.yml", conclusion: "failure" },
    },
    {
      id: 13,
      name: "md2vid-v1.2.3-abc",
      expired: false,
      created_at: "2026-07-22T00:00:00Z",
      workflow_run: { id: 103, head_sha: "abc", path: ".github/workflows/release.yml" },
    },
  ];

  assert.deepEqual(selectRetainedArtifact(artifacts, "md2vid-v1.2.3-abc", "abc"), {
    artifactId: 13,
    runId: 103,
  });
});

test("retained artifact selection fails when every candidate is invalid", () => {
  const base = {
    name: "md2vid-v1.2.3-abc",
    created_at: "2026-07-22T00:00:00Z",
  };
  const artifacts = [
    { ...base, id: 1, expired: true, workflow_run: { id: 1, head_sha: "abc", path: ".github/workflows/release.yml" } },
    { ...base, id: 2, expired: false, name: `${base.name}-extra`, workflow_run: { id: 2, head_sha: "abc", path: ".github/workflows/release.yml" } },
    { ...base, id: 3, expired: false, workflow_run: { id: 3, head_sha: "wrong", path: ".github/workflows/release.yml" } },
    { ...base, id: 4, expired: false, workflow_run: { id: 4, head_sha: "abc", path: ".github/workflows/ci.yml" } },
  ];

  assert.throws(
    () => selectRetainedArtifact(artifacts, "md2vid-v1.2.3-abc", "abc"),
    /no valid retained release artifact/,
  );
});

function result(stdout = "", stderr = "", status = 0): CommandResult {
  return { status, stdout, stderr };
}

function npmAbsent(version: string): CommandResult {
  const packageVersion = `md2vid@${version}`;
  return result(
    JSON.stringify({
      error: {
        code: "E404",
        summary: `No match found for version ${version}`,
        detail: `'${packageVersion}' is not in this registry.`,
      },
    }),
    [
      "npm error code E404",
      `npm error 404 No match found for version ${version}`,
      "npm error 404",
      `npm error 404  '${packageVersion}' is not in this registry.`,
    ].join("\n"),
    1,
  );
}

function fixtureRunner(
  responses: Record<string, CommandResult>,
): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    runner(command, args) {
      calls.push([command, ...args]);
      const key = [command, ...args].join(" ");
      return responses[key] ?? result("", `unexpected command: ${key}`, 1);
    },
  };
}

function githubReleaseResponses(
  release: CommandResult,
  repository = "therealhieu/md2vid",
): Record<string, CommandResult> {
  return {
    [`gh api repos/${repository}`]: result(JSON.stringify({ full_name: repository })),
    [`gh api repos/${repository}/releases/tags/v1.2.3`]: release,
  };
}

function baseGitResponses(): Record<string, CommandResult> {
  return {
    "git cat-file -t refs/tags/v1.2.3": result("tag\n"),
    "git rev-parse refs/tags/v1.2.3^{commit}": result("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n"),
    "git merge-base --is-ancestor aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa origin/main": result(),
    "git show aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:package.json": result(JSON.stringify(validPackageJson)),
    "git show aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:package-lock.json": result(JSON.stringify(validLockJson)),
    "gh api repos/therealhieu/md2vid": result(JSON.stringify({ full_name: "therealhieu/md2vid" })),
  };
}

function runEnv(outputPath?: string): NodeJS.ProcessEnv {
  return { GH_TOKEN: "unit-test-token", ...(outputPath ? { GITHUB_OUTPUT: outputPath } : {}) };
}

test("CLI commands reject unknown duplicate missing and trailing options before subprocesses", () => {
  const cases: Array<{ argv: string[]; expected: RegExp }> = [
    { argv: ["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "push", "--extra", "x"], expected: /unknown option --extra/ },
    { argv: ["preflight", "--tag", "v1.2.3", "--tag", "v1.2.4", "--repository", "therealhieu/md2vid", "--event", "push"], expected: /duplicate option --tag/ },
    { argv: ["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid"], expected: /missing --event/ },
    { argv: ["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "push", "trailing"], expected: /trailing token/ },
    { argv: ["publish-check", "--tag", "v1.2.3", "--version", "1.2.3", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "--repository", "therealhieu/md2vid", "--artifact", "artifact.json", "--extra", "x"], expected: /unknown option --extra/ },
    { argv: ["publish-check", "--tag", "v1.2.3", "--tag", "v1.2.3", "--version", "1.2.3", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "--repository", "therealhieu/md2vid", "--artifact", "artifact.json"], expected: /duplicate option --tag/ },
    { argv: ["publish-check", "--tag", "v1.2.3", "--version", "1.2.3", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "--repository", "therealhieu/md2vid"], expected: /missing --artifact/ },
    { argv: ["publish-check", "--tag", "v1.2.3", "--version", "1.2.3", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "--repository", "therealhieu/md2vid", "--artifact", "artifact.json", "trailing"], expected: /trailing token/ },
    { argv: ["release-check", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "--extra", "x"], expected: /unknown option --extra/ },
    { argv: ["release-check", "--tag", "v1.2.3", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], expected: /duplicate option --tag/ },
    { argv: ["release-check", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid"], expected: /missing --commit/ },
    { argv: ["release-check", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "trailing"], expected: /trailing token/ },
  ];
  const { runner, calls } = fixtureRunner({});
  for (const fixture of cases) assert.throws(() => run(fixture.argv, runEnv(), { runner }), fixture.expected);
  assert.deepEqual(calls, []);
});

test("repository arguments accept only safe owner/repository slugs", () => {
  const { runner, calls } = fixtureRunner({});
  for (const repository of [
    "owner/repo?x=1",
    "owner/repo#fragment",
    "owner/repo%2Fother",
    "owner/..",
    "owner/repo..other",
    "owner//repo",
    "owner.name/repo",
    "-owner/repo",
  ]) {
    assert.throws(
      () => run(["release-check", "--tag", "v1.2.3", "--repository", repository, "--commit", VALID_COMMIT], runEnv(), { runner }),
      /invalid repository/,
    );
  }
  assert.deepEqual(calls, []);
});

test("preflight validates the tag commit and invokes exact first-publication commands", (t) => {
  const outputPath = join(temporaryDirectory(t, "release-preflight-"), "output");
  const responses = {
    ...baseGitResponses(),
    "npm view md2vid@1.2.3 dist.integrity --json": npmAbsent("1.2.3"),
    "npm view md2vid dist-tags.latest --json": result('"1.2.2"\n'),
    "gh api repos/therealhieu/md2vid/releases/tags/v1.2.3": result("", "gh: Not Found (HTTP 404)", 1),
  };
  const { runner, calls } = fixtureRunner(responses);

  const output = run(
    ["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "push"],
    runEnv(outputPath),
    { runner, nodeVersion: "22.18.0", writeOutput: () => undefined },
  );

  assert.deepEqual(output, {
    tag: "v1.2.3",
    version: "1.2.3",
    commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    node_version: "22.18.0",
    registry_state: "absent",
    registry_integrity: "",
    github_release_state: "absent",
    artifact_name: "md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    artifact_id: "",
    artifact_run_id: "",
  });
  assert.deepEqual(calls, [
    ["git", "cat-file", "-t", "refs/tags/v1.2.3"],
    ["git", "rev-parse", "refs/tags/v1.2.3^{commit}"],
    ["git", "merge-base", "--is-ancestor", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "origin/main"],
    ["git", "show", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:package.json"],
    ["git", "show", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:package-lock.json"],
    ["npm", "view", "md2vid@1.2.3", "dist.integrity", "--json"],
    ["npm", "view", "md2vid", "dist-tags.latest", "--json"],
    ["gh", "api", "repos/therealhieu/md2vid"],
    ["gh", "api", "repos/therealhieu/md2vid/releases/tags/v1.2.3"],
  ]);
  assert.equal(readFileSync(outputPath, "utf8"), [
    "tag=v1.2.3",
    "version=1.2.3",
    "commit=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "node_version=22.18.0",
    "registry_state=absent",
    "registry_integrity=",
    "github_release_state=absent",
    "artifact_name=md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "artifact_id=",
    "artifact_run_id=",
  ].join("\n") + "\n");
});

test("preflight rejects lightweight tags before registry decisions", () => {
  const responses = { "git cat-file -t refs/tags/v1.2.3": result("commit\n") };
  const { runner, calls } = fixtureRunner(responses);
  assert.throws(
    () => run(["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "push"], runEnv(), { runner }),
    /annotated tag/,
  );
  assert.deepEqual(calls, [["git", "cat-file", "-t", "refs/tags/v1.2.3"]]);
});

test("preflight rejects commits outside origin/main before registry decisions", () => {
  const responses = {
    ...baseGitResponses(),
    "git merge-base --is-ancestor aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa origin/main": result("", "not ancestor", 1),
  };
  const { runner, calls } = fixtureRunner(responses);
  assert.throws(
    () => run(["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "push"], runEnv(), { runner }),
    /origin\/main/,
  );
  assert.equal(calls.length, 3);
});

test("recovery of an absent exact version checks latest but does not select retained artifacts", () => {
  const responses = {
    ...baseGitResponses(),
    "npm view md2vid@1.2.3 dist.integrity --json": npmAbsent("1.2.3"),
    "npm view md2vid dist-tags.latest --json": result('"1.2.2"'),
    "gh api repos/therealhieu/md2vid/releases/tags/v1.2.3": result("", "gh: Not Found (HTTP 404)", 1),
  };
  const { runner, calls } = fixtureRunner(responses);
  const output = run(
    ["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "recovery"],
    runEnv(),
    { runner },
  );
  assert.equal(output.registry_state, "absent");
  assert.ok(calls.some((call) => call.includes("dist-tags.latest")));
  assert.ok(!calls.some((call) => call.some((argument) => argument.includes("actions/artifacts"))));
});

test("existing-version recovery selects a failed partial release artifact by exact run identity", () => {
  const responses = {
    ...baseGitResponses(),
    "npm view md2vid@1.2.3 dist.integrity --json": result('"sha512-AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ=="\n'),
    "gh api repos/therealhieu/md2vid/releases/tags/v1.2.3": result(JSON.stringify({ tag_name: "v1.2.3", target_commitish: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })),
    "gh api --paginate --slurp repos/therealhieu/md2vid/actions/artifacts?name=md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&per_page=100": result(JSON.stringify([{ artifacts: [{
      id: 7,
      name: "md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      expired: false,
      created_at: "2026-07-22T00:00:00Z",
      workflow_run: { id: 70 },
    }] }])),
    "gh api repos/therealhieu/md2vid/actions/runs/70": result(JSON.stringify({ path: ".github/workflows/release.yml", head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", conclusion: "failure" })),
  };
  const { runner } = fixtureRunner(responses);
  const output = run(
    ["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "recovery"],
    runEnv(),
    { runner },
  );
  assert.equal(output.artifact_id, "7");
  assert.equal(output.artifact_run_id, "70");
});

test("GitHub release lookup accepts matching state and rejects conflicting or API failures", () => {
  const matching = {
    ...baseGitResponses(),
    "npm view md2vid@1.2.3 dist.integrity --json": npmAbsent("1.2.3"),
    "npm view md2vid dist-tags.latest --json": result('"1.2.2"'),
    "gh api repos/therealhieu/md2vid/releases/tags/v1.2.3": result(JSON.stringify({ tag_name: "v1.2.3", target_commitish: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })),
  };
  const matchingRun = fixtureRunner(matching);
  assert.throws(
    () => run(["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "push"], runEnv(), { runner: matchingRun.runner }),
    /first publication requires no GitHub Release/,
  );

  const conflicting = { ...matching, "gh api repos/therealhieu/md2vid/releases/tags/v1.2.3": result(JSON.stringify({ tag_name: "v1.2.3", target_commitish: "other" })) };
  const conflictingRun = fixtureRunner(conflicting);
  assert.throws(
    () => run(["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "recovery"], runEnv(), { runner: conflictingRun.runner }),
    /conflicting GitHub Release/,
  );

  const failed = { ...matching, "gh api repos/therealhieu/md2vid/releases/tags/v1.2.3": result("", "500 Internal Server Error", 1) };
  const failedRun = fixtureRunner(failed);
  assert.throws(
    () => run(["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "push"], runEnv(), { runner: failedRun.runner }),
    /GitHub release lookup failed/,
  );
});

test("preflight fails closed when GitHub errors merely mention 404", () => {
  for (const response of [
    { status: null, stdout: "", stderr: "gh: Not Found (HTTP 404)" },
    result("", "401 Unauthorized; upstream gh: Not Found (HTTP 404)", 1),
    result("", "403 Forbidden; upstream gh: Not Found (HTTP 404)", 1),
    result("", "429 Too Many Requests; upstream gh: Not Found (HTTP 404)", 1),
    result("", "500 Internal Server Error; upstream gh: Not Found (HTTP 404)", 1),
  ]) {
    const responses = {
      ...baseGitResponses(),
      "npm view md2vid@1.2.3 dist.integrity --json": npmAbsent("1.2.3"),
      "npm view md2vid dist-tags.latest --json": result('"1.2.2"'),
      "gh api repos/therealhieu/md2vid/releases/tags/v1.2.3": response,
    };
    const { runner } = fixtureRunner(responses);
    assert.throws(
      () => run(["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "push"], runEnv(), { runner }),
      /GitHub release lookup failed/,
    );
  }
});

test("every GitHub operation requires GH_TOKEN", () => {
  const responses = baseGitResponses();
  const { runner, calls } = fixtureRunner(responses);
  assert.throws(
    () => run(["release-check", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], {}, { runner }),
    /GH_TOKEN/,
  );
  assert.deepEqual(calls, []);
});

test("readReleaseMetadataAtCommit reads both files from the requested immutable commit", () => {
  const calls: string[][] = [];
  const runner: CommandRunner = (command, args) => {
    calls.push([command, ...args]);
    return command === "git" && args[1]?.endsWith(":package.json")
      ? result(JSON.stringify(validPackageJson))
      : result(JSON.stringify(validLockJson));
  };
  const metadata = readReleaseMetadataAtCommit("tag-commit", runner);
  assert.deepEqual(metadata, { packageJson: validPackageJson, lockJson: validLockJson });
  assert.deepEqual(calls, [
    ["git", "show", "tag-commit:package.json"],
    ["git", "show", "tag-commit:package-lock.json"],
  ]);
});

test("publish-check validates downloaded metadata and only publishes absent monotonic versions", (t) => {
  const directory = temporaryDirectory(t, "release-preflight-artifact-");
  const artifactPath = join(directory, "artifact.json");
  writeFileSync(artifactPath, JSON.stringify(validArtifact()));
  const responses = {
    "npm view md2vid@1.2.3 dist.integrity --json": npmAbsent("1.2.3"),
    "npm view md2vid dist-tags.latest --json": result('"1.2.2"'),
  };
  const { runner, calls } = fixtureRunner(responses);
  assert.deepEqual(run([
    "publish-check", "--tag", "v1.2.3", "--version", "1.2.3", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "--repository", "therealhieu/md2vid", "--artifact", artifactPath,
  ], {}, { runner }), { publish: true });
  assert.equal(calls.length, 2);
});

test("publish-check permits only equal-integrity recovery and rejects metadata mismatch", (t) => {
  const directory = temporaryDirectory(t, "release-preflight-artifact-");
  const artifactPath = join(directory, "artifact.json");
  writeFileSync(artifactPath, JSON.stringify(validArtifact()));
  const { runner } = fixtureRunner({ "npm view md2vid@1.2.3 dist.integrity --json": result('"sha512-AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ=="') });
  assert.deepEqual(run([
    "publish-check", "--tag", "v1.2.3", "--version", "1.2.3", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "--repository", "therealhieu/md2vid", "--artifact", artifactPath,
  ], {}, { runner }), { publish: false });

  writeFileSync(artifactPath, JSON.stringify(validArtifact({
    version: "2.0.0",
    tag: "v2.0.0",
    commit: "dddddddddddddddddddddddddddddddddddddddd",
    tarball: "md2vid-2.0.0.tgz",
  })));
  assert.throws(() => run([
    "publish-check", "--tag", "v1.2.3", "--version", "1.2.3", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "--repository", "therealhieu/md2vid", "--artifact", artifactPath,
  ], {}, { runner }), /artifact metadata/);
});

test("artifact and publish-check share one strict complete-object schema", (t) => {
  const directory = temporaryDirectory(t, "release-artifact-compatibility-");
  const artifactPath = join(directory, "artifact.json");
  const argv = [
    "publish-check", "--tag", "v1.2.3", "--version", "1.2.3", "--commit", VALID_COMMIT,
    "--repository", "therealhieu/md2vid", "--artifact", artifactPath,
  ];

  writeFileSync(artifactPath, JSON.stringify(validArtifact()));
  assert.doesNotThrow(() => readArtifactMetadata(artifactPath));
  const accepted = fixtureRunner({
    "npm view md2vid@1.2.3 dist.integrity --json": npmAbsent("1.2.3"),
    "npm view md2vid dist-tags.latest --json": result('"1.2.2"'),
  });
  assert.deepEqual(run(argv, {}, { runner: accepted.runner }), { publish: true });

  const invalidArtifacts = [
    { ...validArtifact(), unexpected: true },
    (() => { const value = validArtifact(); delete value.sha256; return value; })(),
    validArtifact({ schemaVersion: "1" }),
  ];
  for (const invalid of invalidArtifacts) {
    writeFileSync(artifactPath, JSON.stringify(invalid));
    assert.throws(() => readArtifactMetadata(artifactPath), /artifact metadata/);
    const rejected = fixtureRunner({});
    assert.throws(() => run(argv, {}, { runner: rejected.runner }), /artifact metadata/);
    assert.deepEqual(rejected.calls, []);
  }
});

test("publish-check validates the complete artifact contract before registry access", (t) => {
  const directory = temporaryDirectory(t, "release-preflight-artifact-");
  const artifactPath = join(directory, "artifact.json");
  const { runner, calls } = fixtureRunner({});
  const invoke = () => run([
    "publish-check", "--tag", "v1.2.3", "--version", "1.2.3", "--commit", VALID_COMMIT, "--repository", "therealhieu/md2vid", "--artifact", artifactPath,
  ], {}, { runner });

  writeFileSync(artifactPath, "{");
  assert.throws(invoke, /artifact metadata is invalid JSON/);

  for (const invalid of [null, [], "value"]) {
    writeFileSync(artifactPath, JSON.stringify(invalid));
    assert.throws(invoke, /artifact metadata must be an object/);
  }

  for (const field of Object.keys(validArtifact())) {
    const missing = validArtifact();
    delete missing[field];
    writeFileSync(artifactPath, JSON.stringify(missing));
    assert.throws(invoke, new RegExp(`artifact metadata.*${field}`));
  }

  for (const invalid of [
    validArtifact({ schemaVersion: 2 }),
    validArtifact({ packageName: "other" }),
    validArtifact({ version: "01.2.3" }),
    validArtifact({ tag: "v1.2.4" }),
    validArtifact({ commit: "ABCDEF".repeat(7) }),
    validArtifact({ nodeVersion: "22.18.0" }),
    validArtifact({ npmVersion: "11.14.0" }),
    validArtifact({ tarball: "../md2vid-1.2.3.tgz" }),
    validArtifact({ integrity: "sha512-" }),
    validArtifact({ sha256: "A".repeat(64) }),
  ]) {
    writeFileSync(artifactPath, JSON.stringify(invalid));
    assert.throws(invoke, /artifact metadata/);
  }
  assert.deepEqual(calls, []);
});

test("release-check returns only verified absent or matching GitHub states", () => {
  const absentRun = fixtureRunner(githubReleaseResponses(result("", "gh: Not Found (HTTP 404)", 1)));
  assert.deepEqual(run(["release-check", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], runEnv(), { runner: absentRun.runner }), { github_release_state: "absent" });

  const matchingRun = fixtureRunner(githubReleaseResponses(result(JSON.stringify({ tag_name: "v1.2.3", target_commitish: VALID_COMMIT }))));
  assert.deepEqual(run(["release-check", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], runEnv(), { runner: matchingRun.runner }), { github_release_state: "matching" });

  const mismatchRun = fixtureRunner(githubReleaseResponses(result(JSON.stringify({ tag_name: "v1.2.3", target_commitish: "wrong" }))));
  assert.throws(() => run(["release-check", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], runEnv(), { runner: mismatchRun.runner }), /conflicting GitHub Release/);
});

test("release lookup verifies repository access and accepts only canonical endpoint 404", () => {
  const repositoryResponse = result(JSON.stringify({ full_name: "therealhieu/md2vid" }));
  const absent = fixtureRunner({
    "gh api repos/therealhieu/md2vid": repositoryResponse,
    "gh api repos/therealhieu/md2vid/releases/tags/v1.2.3": result("", "gh: Not Found (HTTP 404)", 1),
  });
  assert.deepEqual(
    run(["release-check", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], runEnv(), { runner: absent.runner }),
    { github_release_state: "absent" },
  );

  const inaccessible = fixtureRunner({
    "gh api repos/missing/repository": result("", "gh: Not Found (HTTP 404)", 1),
  });
  assert.throws(
    () => run(["release-check", "--tag", "v1.2.3", "--repository", "missing/repository", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], runEnv(), { runner: inaccessible.runner }),
    /repository access failed/,
  );

  for (const response of [
    { status: null, stdout: "", stderr: "gh: Not Found (HTTP 404)" },
    result("", "401 Unauthorized; upstream gh: Not Found (HTTP 404)", 1),
    result("", "403 Forbidden; upstream gh: Not Found (HTTP 404)", 1),
    result("", "429 Too Many Requests; upstream gh: Not Found (HTTP 404)", 1),
    result("", "500 Internal Server Error; upstream gh: Not Found (HTTP 404)", 1),
  ]) {
    const failed = fixtureRunner({
      "gh api repos/therealhieu/md2vid": repositoryResponse,
      "gh api repos/therealhieu/md2vid/releases/tags/v1.2.3": response,
    });
    assert.throws(
      () => run(["release-check", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], runEnv(), { runner: failed.runner }),
      /GitHub release lookup failed/,
    );
  }
});

test("preflight fails closed on registry errors before GitHub lookup", () => {
  const responses = {
    ...baseGitResponses(),
    "npm view md2vid@1.2.3 dist.integrity --json": result("", "ECONNRESET", 1),
  };
  const { runner, calls } = fixtureRunner(responses);
  assert.throws(
    () => run(["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "push"], runEnv(), { runner }),
    /registry lookup failed/,
  );
  assert.ok(!calls.some((call) => call[0] === "gh"));
});

test("preflight does not treat transport auth rate-limit or server npm failures as absence", () => {
  for (const response of [
    { status: null, stdout: "", stderr: "npm error code E404\nnpm error 404 Not Found" },
    result("", "401 Unauthorized; upstream npm error code E404 and 404 Not Found", 1),
    result("", "403 Forbidden; upstream npm error code E404 and 404 Not Found", 1),
    result("", "429 Too Many Requests; upstream npm error code E404 and 404 Not Found", 1),
    result("", "500 Internal Server Error; upstream npm error code E404 and 404 Not Found", 1),
  ]) {
    const { runner, calls } = fixtureRunner({
      ...baseGitResponses(),
      "npm view md2vid@1.2.3 dist.integrity --json": response,
    });
    assert.throws(
      () => run(["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "push"], runEnv(), { runner }),
      /registry lookup failed/,
    );
    assert.ok(!calls.some((call) => call[0] === "gh"));
  }
});

test("preflight rejects structured E404 paired with transport failures", () => {
  const structuredE404 = JSON.stringify({ error: { code: "E404", summary: "Not Found" } });
  for (const transport of ["ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"]) {
    const { runner, calls } = fixtureRunner({
      ...baseGitResponses(),
      "npm view md2vid@1.2.3 dist.integrity --json": result(
        structuredE404,
        `npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/md2vid\nnpm error ${transport}`,
        1,
      ),
    });
    assert.throws(
      () => run(["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "push"], runEnv(), { runner }),
      /registry lookup failed/,
    );
    assert.ok(!calls.some((call) => call[0] === "gh"));
  }
});

test("preflight validates metadata from the tag commit even when current checkout differs", () => {
  const packageAtTag = { ...validPackageJson, version: "1.5.0" };
  const lockAtTag = {
    ...validLockJson,
    version: "1.5.0",
    packages: { "": { name: "md2vid", version: "1.5.0" } },
  };
  const responses = {
    "git cat-file -t refs/tags/v1.5.0": result("tag\n"),
    "git rev-parse refs/tags/v1.5.0^{commit}": result("cccccccccccccccccccccccccccccccccccccccc\n"),
    "git merge-base --is-ancestor cccccccccccccccccccccccccccccccccccccccc origin/main": result(),
    "git show cccccccccccccccccccccccccccccccccccccccc:package.json": result(JSON.stringify(packageAtTag)),
    "git show cccccccccccccccccccccccccccccccccccccccc:package-lock.json": result(JSON.stringify(lockAtTag)),
    "npm view md2vid@1.5.0 dist.integrity --json": npmAbsent("1.5.0"),
    "npm view md2vid dist-tags.latest --json": result('"1.4.0"'),
    "gh api repos/therealhieu/md2vid": result(JSON.stringify({ full_name: "therealhieu/md2vid" })),
    "gh api repos/therealhieu/md2vid/releases/tags/v1.5.0": result("", "gh: Not Found (HTTP 404)", 1),
  };
  const { runner, calls } = fixtureRunner(responses);
  const output = run(["preflight", "--tag", "v1.5.0", "--repository", "therealhieu/md2vid", "--event", "push"], runEnv(), { runner });
  assert.equal(output.version, "1.5.0");
  assert.ok(calls.some((call) => call.join(" ") === "git show cccccccccccccccccccccccccccccccccccccccc:package.json"));
  assert.ok(!calls.some((call) => call.join(" ") === "git show HEAD:package.json"));
});

test("existing recovery never queries npm latest", () => {
  const responses = {
    ...baseGitResponses(),
    "npm view md2vid@1.2.3 dist.integrity --json": result('"sha512-AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ=="'),
    "gh api repos/therealhieu/md2vid/releases/tags/v1.2.3": result("", "gh: Not Found (HTTP 404)", 1),
    "gh api --paginate --slurp repos/therealhieu/md2vid/actions/artifacts?name=md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&per_page=100": result(JSON.stringify([{ artifacts: [{ id: 8, name: "md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", expired: false, created_at: "2026-07-22T00:00:00Z", workflow_run: { id: 80 } }] }])),
    "gh api repos/therealhieu/md2vid/actions/runs/80": result(JSON.stringify({ path: ".github/workflows/release.yml", head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })),
  };
  const { runner, calls } = fixtureRunner(responses);
  run(["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "recovery"], runEnv(), { runner });
  assert.ok(!calls.some((call) => call.includes("dist-tags.latest")));
});

test("retained artifact lookup handles pagination and selects newest by timestamp then ID", () => {
  const responses = {
    ...baseGitResponses(),
    "npm view md2vid@1.2.3 dist.integrity --json": result('"sha512-AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ=="'),
    "gh api repos/therealhieu/md2vid/releases/tags/v1.2.3": result("", "gh: Not Found (HTTP 404)", 1),
    "gh api --paginate --slurp repos/therealhieu/md2vid/actions/artifacts?name=md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&per_page=100": result(JSON.stringify([
      { artifacts: [{ id: 10, name: "md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", expired: false, created_at: "2026-07-20T00:00:00Z", workflow_run: { id: 100 } }] },
      { artifacts: [
        { id: 20, name: "md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", expired: false, created_at: "2026-07-22T00:00:00Z", workflow_run: { id: 200 } },
        { id: 21, name: "md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", expired: false, created_at: "2026-07-22T00:00:00Z", workflow_run: { id: 210 } },
      ] },
    ])),
    "gh api repos/therealhieu/md2vid/actions/runs/100": result(JSON.stringify({ path: ".github/workflows/release.yml", head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })),
    "gh api repos/therealhieu/md2vid/actions/runs/200": result(JSON.stringify({ path: ".github/workflows/release.yml", head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })),
    "gh api repos/therealhieu/md2vid/actions/runs/210": result(JSON.stringify({ path: ".github/workflows/release.yml", head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })),
  };
  const { runner } = fixtureRunner(responses);
  const output = run(["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "recovery"], runEnv(), { runner });
  assert.equal(output.artifact_id, "21");
  assert.equal(output.artifact_run_id, "210");
});

for (const invalid of [
  { label: "no exact name", artifact: { id: 1, name: "md2vid-v1.2.3-other", expired: false, created_at: "2026-07-22T00:00:00Z", workflow_run: { id: 1 } }, run: { path: ".github/workflows/release.yml", head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } },
  { label: "expired", artifact: { id: 2, name: "md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", expired: true, created_at: "2026-07-22T00:00:00Z", workflow_run: { id: 2 } }, run: { path: ".github/workflows/release.yml", head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } },
  { label: "wrong commit", artifact: { id: 3, name: "md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", expired: false, created_at: "2026-07-22T00:00:00Z", workflow_run: { id: 3 } }, run: { path: ".github/workflows/release.yml", head_sha: "other" } },
  { label: "wrong workflow", artifact: { id: 4, name: "md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", expired: false, created_at: "2026-07-22T00:00:00Z", workflow_run: { id: 4 } }, run: { path: ".github/workflows/ci.yml", head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } },
]) {
  test(`retained artifact lookup rejects ${invalid.label}`, () => {
    const responses: Record<string, CommandResult> = {
      ...baseGitResponses(),
      "npm view md2vid@1.2.3 dist.integrity --json": result('"sha512-AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ=="'),
      "gh api repos/therealhieu/md2vid/releases/tags/v1.2.3": result("", "gh: Not Found (HTTP 404)", 1),
      "gh api --paginate --slurp repos/therealhieu/md2vid/actions/artifacts?name=md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&per_page=100": result(JSON.stringify([{ artifacts: [invalid.artifact] }])),
      [`gh api repos/therealhieu/md2vid/actions/runs/${invalid.artifact.workflow_run.id}`]: result(JSON.stringify(invalid.run)),
    };
    const { runner } = fixtureRunner(responses);
    assert.throws(
      () => run(["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "recovery"], runEnv(), { runner }),
      /no valid retained release artifact/,
    );
  });
}

test("retained artifact and workflow API errors fail closed", () => {
  const common = {
    ...baseGitResponses(),
    "npm view md2vid@1.2.3 dist.integrity --json": result('"sha512-AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ=="'),
    "gh api repos/therealhieu/md2vid/releases/tags/v1.2.3": result("", "gh: Not Found (HTTP 404)", 1),
  };
  const listFailure = fixtureRunner({
    ...common,
    "gh api --paginate --slurp repos/therealhieu/md2vid/actions/artifacts?name=md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&per_page=100": result("", "403 Forbidden", 1),
  });
  assert.throws(
    () => run(["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "recovery"], runEnv(), { runner: listFailure.runner }),
    /GitHub artifact lookup failed/,
  );

  const runFailure = fixtureRunner({
    ...common,
    "gh api --paginate --slurp repos/therealhieu/md2vid/actions/artifacts?name=md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&per_page=100": result(JSON.stringify([{ artifacts: [{ id: 5, name: "md2vid-v1.2.3-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", expired: false, created_at: "2026-07-22T00:00:00Z", workflow_run: { id: 50 } }] }])),
    "gh api repos/therealhieu/md2vid/actions/runs/50": result("", "500 Internal Server Error", 1),
  });
  assert.throws(
    () => run(["preflight", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--event", "recovery"], runEnv(), { runner: runFailure.runner }),
    /GitHub workflow run lookup failed/,
  );
});

test("publish-check rejects integrity mismatch without querying latest", (t) => {
  const directory = temporaryDirectory(t, "release-preflight-artifact-");
  const artifactPath = join(directory, "artifact.json");
  writeFileSync(artifactPath, JSON.stringify(validArtifact()));
  const { runner, calls } = fixtureRunner({ "npm view md2vid@1.2.3 dist.integrity --json": result('"sha512-AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg=="') });
  assert.throws(() => run([
    "publish-check", "--tag", "v1.2.3", "--version", "1.2.3", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "--repository", "therealhieu/md2vid", "--artifact", artifactPath,
  ], {}, { runner }), /integrity mismatch/);
  assert.ok(!calls.some((call) => call.includes("dist-tags.latest")));
});

test("publish-check and release-check append their immediate decisions to GITHUB_OUTPUT", (t) => {
  const directory = temporaryDirectory(t, "release-preflight-output-");
  const artifactPath = join(directory, "artifact.json");
  const publishOutput = join(directory, "publish-output");
  const releaseOutput = join(directory, "release-output");
  writeFileSync(artifactPath, JSON.stringify(validArtifact()));
  const publishRunner = fixtureRunner({ "npm view md2vid@1.2.3 dist.integrity --json": result('"sha512-AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ=="') });
  run(["publish-check", "--tag", "v1.2.3", "--version", "1.2.3", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "--repository", "therealhieu/md2vid", "--artifact", artifactPath], { GITHUB_OUTPUT: publishOutput }, { runner: publishRunner.runner });
  assert.equal(readFileSync(publishOutput, "utf8"), "publish=false\n");

  const releaseRunner = fixtureRunner(githubReleaseResponses(result("", "gh: Not Found (HTTP 404)", 1)));
  run(["release-check", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], { GH_TOKEN: "token", GITHUB_OUTPUT: releaseOutput }, { runner: releaseRunner.runner });
  assert.equal(readFileSync(releaseOutput, "utf8"), "github_release_state=absent\n");
});

test("release-check fails closed on malformed success JSON and non-404 errors", () => {
  for (const response of [result("not-json"), result("", "401 Unauthorized", 1), result("", "502 Bad Gateway", 1)]) {
    const { runner } = fixtureRunner(githubReleaseResponses(response));
    assert.throws(
      () => run(["release-check", "--tag", "v1.2.3", "--repository", "therealhieu/md2vid", "--commit", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], runEnv(), { runner }),
      /GitHub release lookup/,
    );
  }
});
