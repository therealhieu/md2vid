import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface PackageMetadata {
  name: string;
  version: string;
  root: string;
}

export interface PackageManagerMetadata extends PackageMetadata {
  packageManager: string;
}

export function resolvePackageRoot(metaUrl: string): string {
  let current = dirname(fileURLToPath(metaUrl));
  while (true) {
    const packageFile = join(current, "package.json");
    if (existsSync(packageFile)) {
      const parsed = JSON.parse(readFileSync(packageFile, "utf8")) as { name?: string };
      if (parsed.name === "md2vid") return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`could not locate md2vid package.json from ${metaUrl}`);
}

export function readPackageMetadata(metaUrl: string): PackageMetadata {
  const root = resolvePackageRoot(metaUrl);
  const parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    name?: string;
    version?: string;
  };
  if (parsed.name !== "md2vid" || typeof parsed.version !== "string") {
    throw new Error(`invalid md2vid package metadata at ${join(root, "package.json")}`);
  }
  return { name: parsed.name, version: parsed.version, root };
}

export function readPackageManagerMetadata(metaUrl: string): PackageManagerMetadata {
  const metadata = readPackageMetadata(metaUrl);
  const parsed = JSON.parse(readFileSync(join(metadata.root, "package.json"), "utf8")) as {
    packageManager?: string;
  };
  if (typeof parsed.packageManager !== "string") {
    throw new Error(`invalid md2vid packageManager at ${join(metadata.root, "package.json")}`);
  }
  return { ...metadata, packageManager: parsed.packageManager };
}
