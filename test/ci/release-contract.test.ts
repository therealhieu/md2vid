import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parseDocument } from "yaml";

const ROOT = resolve(import.meta.dirname, "..", "..");
const packageJson = readFileSync(join(ROOT, "package.json"), "utf8");
const pkg = JSON.parse(packageJson);
const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const runbook = readFileSync(join(ROOT, "docs", "release.md"), "utf8");
const release = readFileSync(join(ROOT, ".github", "workflows", "release.yml"), "utf8");

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsActiveVersionLiteral(body: string, version: string): boolean {
  const rawLiteral = escape(version);
  const regexEscapedLiteral = escape(escape(version));
  return new RegExp(
    `(?<!\\d)(?:${rawLiteral}|${regexEscapedLiteral})(?!\\d)`,
  ).test(body);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  assert.equal(
    typeof value === "object" && value !== null && !Array.isArray(value),
    true,
    `${label} must be a mapping`,
  );
  return value as Record<string, unknown>;
}

const WINDOWS_VERIFICATION_CLAIM = /(?:\bverif(?:y|ies|ied|ying|ication)\b[^.!?\n]*\bWindows\b|\bWindows\b[^.!?\n]*\bverif(?:y|ies|ied|ying|ication)\b)/i;
const FORBIDDEN_VERSION_LITERAL = /(?<!\d)0\.1\.3(?!\d)/;

test("package docs and release workflow declare macOS and Linux only", () => {
  assert.deepEqual(pkg.os, ["darwin", "linux"]);
  assert.equal(Object.hasOwn(pkg, "cpu"), false);

  const document = parseDocument(release, {
    prettyErrors: true,
    stringKeys: true,
    uniqueKeys: true,
  });
  assert.deepEqual(
    [...document.errors, ...document.warnings],
    [],
    "release workflow must parse without diagnostics",
  );
  const workflow = asRecord(document.toJS({ maxAliasCount: 100 }), "release workflow");
  const jobs = asRecord(workflow.jobs, "release jobs");
  const verifyArtifact = asRecord(jobs["verify-artifact"], "verify-artifact job");
  assert.deepEqual(
    verifyArtifact.strategy,
    {
      "fail-fast": false,
      matrix: { runner: ["ubuntu-latest", "macos-latest"] },
    },
    "release verification must use only the exact supported runner matrix",
  );

  const effectiveRunners = new Set<string>();
  for (const [name, value] of Object.entries(jobs)) {
    const job = asRecord(value, `${name} job`);
    assert.equal(typeof job["runs-on"], "string", `${name} runs-on must be a string`);
    if (job["runs-on"] === "${{ matrix.runner }}") {
      const strategy = asRecord(job.strategy, `${name} strategy`);
      const matrix = asRecord(strategy.matrix, `${name} matrix`);
      assert.equal(Array.isArray(matrix.runner), true, `${name} runner matrix must be an array`);
      for (const runner of matrix.runner as unknown[]) {
        assert.equal(typeof runner, "string", `${name} matrix runner must be a string`);
        effectiveRunners.add(runner as string);
      }
    } else {
      effectiveRunners.add(job["runs-on"] as string);
    }
  }
  assert.deepEqual(
    [...effectiveRunners].sort(),
    ["macos-latest", "ubuntu-latest"],
    "release workflow must have no effective unsupported runner",
  );

  assert.match(
    "The release verifies one artifact on Linux, macOS, and Windows.",
    WINDOWS_VERIFICATION_CLAIM,
  );
  assert.match(
    "Windows verification is part of the release gate.",
    WINDOWS_VERIFICATION_CLAIM,
  );
  assert.doesNotMatch(
    "Windows-style absolute paths remain rejected. Release verification runs on Linux and macOS.",
    WINDOWS_VERIFICATION_CLAIM,
  );
  assert.match("release 0.1.3", FORBIDDEN_VERSION_LITERAL);
  assert.doesNotMatch("release 0.1.30", FORBIDDEN_VERSION_LITERAL);
  assert.doesNotMatch("release 10.1.3", FORBIDDEN_VERSION_LITERAL);

  for (const [label, body] of [["README", readme], ["release runbook", runbook]] as const) {
    assert.match(body, /verifies that same file on Linux and macOS/i, `${label} must describe supported-host verification`);
    assert.doesNotMatch(body, WINDOWS_VERIFICATION_CLAIM, `${label} must not claim Windows verification`);
    assert.doesNotMatch(body, FORBIDDEN_VERSION_LITERAL, `${label} must not mention 0.1.3`);
  }

  assert.match(readme, /Supported operating systems: macOS and Linux/i);
  assert.match(readme, /EBADPLATFORM/);
  assert.match(readme, /Windows-style absolute paths[\s\S]*do not imply Windows runtime support/i);
  assert.doesNotMatch(readme, /```powershell|Remove-Item|\$env:CLAUDE_CONFIG_DIR/i);

  assert.match(runbook, /gh workflow run release\.yml -f tag=vX\.Y\.Z/);
  assert.match(runbook, /Implementation agents must not dispatch hosted workflows\./);
  assert.match(
    runbook,
    /manual (?:`release\.yml` )?entry point is only for separately authorized recovery of an existing protected release tag; it is not an implementation or rollout dry run\./i,
  );
});

test("one package version drives tag artifact and registry commands", () => {
  assert.equal(pkg.version, "0.1.8");
  assert.deepEqual(pkg.os, ["darwin", "linux"]);
  assert.equal(Object.hasOwn(pkg, "cpu"), false);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.deepEqual(lock.packages[""].os, pkg.os);
  assert.equal(Object.hasOwn(lock.packages[""], "cpu"), false);
  assert.equal(pkg.packageManager, "npm@11.15.0");
  assert.match(release, /release:pack/);
  assert.match(release, /release:verify-artifact/);
  assert.match(release, /release:verify-registry/);
  assert.match(release, /npm publish "release-artifact\/\$TARBALL" --access public --tag latest/);
  assert.match(readme, /git tag -a vX\.Y\.Z/);
  assert.match(runbook, /gh workflow run release\.yml -f tag=vX\.Y\.Z/);
});

test("release authority has no second credential or approval path", () => {
  const executable = `${release}\n${packageJson}`;
  const combined = `${release}\n${readme}\n${runbook}`;

  assert.doesNotMatch(release, /NPM_TOKEN|\benvironment\s*:|pull_request_target/i);
  assert.doesNotMatch(executable, /Release Please|Changesets|Semantic Release|audit-ci/i);
  assert.match(combined, /protected annotated tag is the sole human release authorization/i);
  assert.match(
    runbook,
    /There is no Release Please, Changesets, or Semantic Release; no release PR, second approval Environment, npm token, automatic unpublish, automatic deprecation, or tag mutation\./i,
  );
});

test("active version detector matches exact raw and regex-escaped numeric tokens", () => {
  assert.equal(containsActiveVersionLiteral(`version ${pkg.version}`, pkg.version), true);
  assert.equal(
    containsActiveVersionLiteral(`version ${escape(pkg.version)}`, pkg.version),
    true,
  );
});

test("active version detector ignores longer raw and regex-escaped versions", () => {
  assert.equal(containsActiveVersionLiteral(`version 1${pkg.version}0`, pkg.version), false);
  assert.equal(
    containsActiveVersionLiteral(`version ${escape(pkg.version)}0`, pkg.version),
    false,
  );
});

test("active release code derives the current package version", () => {
  for (const path of [
    "test/release/harness.ts",
    "test/release/run.ts",
    "test/cli/package-meta.test.ts",
  ]) {
    const body = readFileSync(join(ROOT, path), "utf8");
    assert.equal(
      containsActiveVersionLiteral(body, pkg.version),
      false,
      `${path} embeds active package version ${pkg.version}`,
    );
  }
});
