import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { readPackageManagerMetadata } from "../../scripts/package_root.ts";
import {
  npmVersionFromPackageManager,
  validateReleaseArtifactMetadata,
  type ReleaseArtifactContract,
} from "../../scripts/release_contract.ts";

export interface ReleaseIdentity {
  packageName: "md2vid";
  version: string;
  tag: string;
  commit: string;
}

export type ReleaseArtifact = ReleaseArtifactContract;

const REQUIRED_NPM_VERSION = npmVersionFromPackageManager(
  readPackageManagerMetadata(import.meta.url).packageManager,
);

function validateArtifact(value: unknown): ReleaseArtifact {
  return validateReleaseArtifactMetadata(value, REQUIRED_NPM_VERSION);
}

export function createArtifactMetadata(
  input: Omit<ReleaseArtifact, "schemaVersion" | "tarball" | "integrity" | "sha256"> & { tarball: string },
): ReleaseArtifact {
  const bytes = readFileSync(input.tarball);
  return validateArtifact({
    schemaVersion: 1,
    packageName: input.packageName,
    version: input.version,
    tag: input.tag,
    commit: input.commit,
    nodeVersion: input.nodeVersion,
    npmVersion: input.npmVersion,
    tarball: basename(input.tarball),
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

export function writeArtifactMetadata(directory: string, metadata: ReleaseArtifact): void {
  const validated = validateArtifact(metadata);
  writeFileSync(join(directory, "artifact.json"), `${JSON.stringify(validated, null, 2)}\n`);
}

export function readArtifactMetadata(path: string): ReleaseArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`invalid artifact metadata JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateArtifact(parsed);
}

export function verifyArtifactIdentity(
  metadata: ReleaseArtifact,
  expected: Pick<ReleaseIdentity, "version" | "tag" | "commit">,
): void {
  if (metadata.version !== expected.version
    || metadata.tag !== expected.tag
    || metadata.commit !== expected.commit) {
    throw new Error("artifact identity mismatch");
  }
}

export function verifyArtifactFiles(directory: string, metadata: ReleaseArtifact): void {
  const bytes = readFileSync(join(directory, metadata.tarball));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== metadata.sha256) throw new Error("artifact SHA-256 mismatch");
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  if (integrity !== metadata.integrity) throw new Error("artifact SRI mismatch");
}
