const EXACT_NODE_VERSION = /^v\d+\.\d+\.\d+$/;
const NPM_PACKAGE_MANAGER = /^npm@((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*))$/;
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SHA512_SRI = /^sha512-([A-Za-z0-9+/]{86}==)$/;

export const RELEASE_ARTIFACT_FIELDS = [
  "schemaVersion",
  "packageName",
  "version",
  "tag",
  "commit",
  "nodeVersion",
  "npmVersion",
  "tarball",
  "integrity",
  "sha256",
] as const;

export interface ReleaseArtifactContract {
  schemaVersion: 1;
  packageName: "md2vid";
  version: string;
  tag: string;
  commit: string;
  nodeVersion: string;
  npmVersion: string;
  tarball: string;
  integrity: `sha512-${string}`;
  sha256: string;
}

export function isExactNodeVersion(value: unknown): value is string {
  return typeof value === "string" && EXACT_NODE_VERSION.test(value);
}

export function npmVersionFromPackageManager(packageManager: string): string {
  const match = NPM_PACKAGE_MANAGER.exec(packageManager);
  if (!match) throw new Error(`packageManager must be an exact npm version: ${packageManager}`);
  return match[1];
}

export function isStrictSha512Integrity(value: unknown): value is `sha512-${string}` {
  if (typeof value !== "string") return false;
  const match = SHA512_SRI.exec(value);
  if (!match) return false;
  const decoded = Buffer.from(match[1], "base64");
  return decoded.length === 64 && decoded.toString("base64") === match[1];
}

function invalidArtifact(message: string): never {
  throw new Error(`artifact metadata ${message}`);
}

export function validateReleaseArtifactMetadata(
  value: unknown,
  requiredNpmVersion: string,
): ReleaseArtifactContract {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidArtifact("must be an object");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [...RELEASE_ARTIFACT_FIELDS].sort();
  const missing = expected.find((field) => !(field in record));
  if (missing) invalidArtifact(`is missing ${missing}`);
  const unexpected = keys.find((field) => !expected.includes(field as typeof expected[number]));
  if (unexpected || keys.length !== expected.length) {
    invalidArtifact(`has unexpected field ${unexpected ?? "<unknown>"}`);
  }
  if (record.schemaVersion !== 1) invalidArtifact("schemaVersion must be 1");
  if (record.packageName !== "md2vid") invalidArtifact("packageName must be md2vid");
  if (typeof record.version !== "string" || !STABLE_VERSION.test(record.version)) {
    invalidArtifact("version is invalid");
  }
  if (record.tag !== `v${record.version}`) invalidArtifact("tag/version mismatch");
  if (typeof record.commit !== "string" || !COMMIT.test(record.commit)) {
    invalidArtifact("commit must be 40 lowercase hex characters");
  }
  if (!isExactNodeVersion(record.nodeVersion)) {
    invalidArtifact("nodeVersion must begin with v and be exact");
  }
  if (record.npmVersion !== requiredNpmVersion) {
    invalidArtifact(`npmVersion must be ${requiredNpmVersion}`);
  }
  if (record.tarball !== `md2vid-${record.version}.tgz`) {
    invalidArtifact("tarball is invalid");
  }
  if (!isStrictSha512Integrity(record.integrity)) {
    invalidArtifact("integrity is not a valid SHA-512 SRI");
  }
  if (typeof record.sha256 !== "string" || !SHA256.test(record.sha256)) {
    invalidArtifact("sha256 must be 64 lowercase hex characters");
  }
  return record as unknown as ReleaseArtifactContract;
}
