import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createArtifactMetadata,
  readArtifactMetadata,
  verifyArtifactFiles,
  verifyArtifactIdentity,
  writeArtifactMetadata,
  type ReleaseArtifact,
} from "./artifact.ts";
import { isExactNodeVersion } from "../../scripts/release_contract.ts";

function withRoot(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "md2vid-artifact-test-"));
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function validArtifact(root: string): ReleaseArtifact {
  const tarball = join(root, "md2vid-1.2.3.tgz");
  writeFileSync(tarball, "artifact bytes");
  return createArtifactMetadata({
    tarball,
    packageName: "md2vid",
    version: "1.2.3",
    tag: "v1.2.3",
    commit: "a".repeat(40),
    nodeVersion: "v22.18.0",
    npmVersion: "11.15.0",
  });
}

test("artifact metadata records stable identity and both checksums", () => withRoot((root) => {
  const metadata = validArtifact(root);
  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.packageName, "md2vid");
  assert.equal(metadata.tarball, "md2vid-1.2.3.tgz");
  assert.match(metadata.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  assert.match(metadata.tag, /^v1\.2\.3$/);
  assert.match(metadata.commit, /^[a-f0-9]{40}$/);
  assert.match(metadata.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
  assert.match(metadata.sha256, /^[a-f0-9]{64}$/);
  writeArtifactMetadata(root, metadata);
  assert.equal(readFileSync(join(root, "artifact.json"), "utf8").endsWith("\n"), true);
  assert.deepEqual(readArtifactMetadata(join(root, "artifact.json")), metadata);
  assert.doesNotThrow(() => verifyArtifactIdentity(metadata, {
    version: "1.2.3", tag: "v1.2.3", commit: "a".repeat(40),
  }));
  assert.doesNotThrow(() => verifyArtifactFiles(root, metadata));
}));

test("identity mismatch is rejected before artifact use", () => withRoot((root) => {
  const metadata = validArtifact(root);
  assert.throws(() => verifyArtifactIdentity(metadata, {
    version: "1.2.4", tag: "v1.2.4", commit: "d".repeat(40),
  }), /artifact identity mismatch/);
}));

test("checksum mismatch reports SHA-256 before SRI", () => withRoot((root) => {
  const metadata = validArtifact(root);
  writeFileSync(join(root, metadata.tarball), "changed bytes");
  assert.throws(() => verifyArtifactFiles(root, metadata), /SHA-256 mismatch/);
  const sriMismatch = { ...metadata, sha256: createArtifactMetadata({
    tarball: join(root, metadata.tarball), packageName: "md2vid", version: metadata.version,
    tag: metadata.tag, commit: metadata.commit, nodeVersion: metadata.nodeVersion,
    npmVersion: metadata.npmVersion,
  }).sha256, integrity: "sha512-" + "A".repeat(86) + "==" } as ReleaseArtifact;
  assert.throws(() => verifyArtifactFiles(root, sriMismatch), /SRI mismatch/);
}));

test("metadata rejects missing fields, schema, identity, version, and tool shapes", () => withRoot((root) => {
  const metadata = validArtifact(root);
  const cases: Array<[string, Partial<ReleaseArtifact>, RegExp]> = [
    ["schema", { schemaVersion: 2 as 1 }, /schemaVersion/],
    ["name", { packageName: "other" as "md2vid" }, /packageName/],
    ["version", { version: "1.2" }, /version/],
    ["tag", { tag: "release-1.2.3" }, /tag/],
    ["tag mismatch", { tag: "v1.2.4" }, /tag/],
    ["commit", { commit: "A".repeat(40) }, /commit/],
    ["node", { nodeVersion: "22.18.0" }, /nodeVersion/],
    ["node empty", { nodeVersion: "v" }, /nodeVersion/],
    ["npm", { npmVersion: "10.9.0" }, /npmVersion/],
    ["checksum", { sha256: "0".repeat(63) }, /sha256/],
    ["integrity", { integrity: "sha512-not-sri" }, /integrity/],
  ];
  for (const [name, override, message] of cases) {
    writeFileSync(join(root, "artifact.json"), JSON.stringify({ ...metadata, ...override }));
    assert.throws(() => readArtifactMetadata(join(root, "artifact.json")), message, name);
  }
  const missing = { ...metadata } as Record<string, unknown>;
  delete missing.sha256;
  writeFileSync(join(root, "artifact.json"), JSON.stringify(missing));
  assert.throws(() => readArtifactMetadata(join(root, "artifact.json")), /sha256/);
}));

test("artifact and preflight share the exact Node version contract", () => withRoot((root) => {
  const metadata = validArtifact(root);
  for (const valid of ["v22.18.0", "v0.0.0", "v001.02.3"]) {
    assert.equal(isExactNodeVersion(valid), true);
    writeFileSync(join(root, "artifact.json"), JSON.stringify({ ...metadata, nodeVersion: valid }));
    assert.doesNotThrow(() => readArtifactMetadata(join(root, "artifact.json")));
  }
  for (const invalid of ["v22", "v22.18", "22.18.0", "v22.18.0-rc.1", "v22.18.0.1", "v"] ) {
    assert.equal(isExactNodeVersion(invalid), false);
    writeFileSync(join(root, "artifact.json"), JSON.stringify({ ...metadata, nodeVersion: invalid }));
    assert.throws(() => readArtifactMetadata(join(root, "artifact.json")), /nodeVersion/);
  }
}));

test("metadata rejects traversal, directories, and filename/version mismatch", () => withRoot((root) => {
  const metadata = validArtifact(root);
  for (const tarball of ["../outside.tgz", "/tmp/outside.tgz", "md2vid-1.2.4.tgz", "nested/md2vid-1.2.3.tgz"]) {
    writeFileSync(join(root, "artifact.json"), JSON.stringify({ ...metadata, tarball }));
    assert.throws(() => readArtifactMetadata(join(root, "artifact.json")), /tarball/);
  }
}));
