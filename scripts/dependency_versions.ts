import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePackageRoot } from "./package_root.ts";

type DependencySection =
  | "dependencies"
  | "optionalDependencies"
  | "devDependencies";

interface PackageManifest {
  dependencies?: Record<string, unknown>;
  optionalDependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}

const root = resolvePackageRoot(import.meta.url);
const packageFile = join(root, "package.json");
const pkg = JSON.parse(readFileSync(packageFile, "utf8")) as PackageManifest;

const CANONICAL_STABLE_VERSION =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

export function isCanonicalStableVersion(value: string): boolean {
  return CANONICAL_STABLE_VERSION.test(value);
}

function dependencyValue(section: DependencySection, name: string): string {
  const value = pkg[section]?.[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`invalid md2vid dependency ${section}.${name} at ${packageFile}`);
  }
  return value;
}

function exactVersion(section: DependencySection, name: string): string {
  const value = dependencyValue(section, name);
  if (!isCanonicalStableVersion(value)) {
    throw new Error(
      `md2vid ${section}.${name} must be an exact stable version at ${packageFile}`,
    );
  }
  return value;
}

export const HYPERFRAMES_VERSION = exactVersion("dependencies", "hyperframes");
export const REMOTION_VERSION = exactVersion("optionalDependencies", "remotion");

for (const name of Object.keys(pkg.optionalDependencies ?? {})) {
  if (name !== "remotion" && !name.startsWith("@remotion/")) continue;
  if (dependencyValue("optionalDependencies", name) !== REMOTION_VERSION) {
    throw new Error(`${name} must match remotion@${REMOTION_VERSION}`);
  }
}

export const REACT_VERSION = exactVersion("optionalDependencies", "react");
export const GSAP_VERSION = exactVersion("devDependencies", "gsap");
export const REACT_TYPES_VERSION = dependencyValue("devDependencies", "@types/react");
export const TYPESCRIPT_VERSION = dependencyValue("devDependencies", "typescript");

if (dependencyValue("devDependencies", "@types/node") !== "^26.1.2") {
  throw new Error("@types/node must use the selected update range");
}
if (dependencyValue("optionalDependencies", "react-dom") !== REACT_VERSION) {
  throw new Error("react and react-dom must use the same exact version");
}
if (
  dependencyValue("devDependencies", "@types/react-dom") !== REACT_TYPES_VERSION
) {
  throw new Error("@types/react and @types/react-dom must use the same range");
}

export const DEFAULT_GSAP_SRC =
  `https://cdn.jsdelivr.net/npm/gsap@${GSAP_VERSION}/dist/gsap.min.js`;

export const REMOTION_SCAFFOLD_DEPENDENCIES = {
  "@remotion/bundler": REMOTION_VERSION,
  "@remotion/cli": REMOTION_VERSION,
  "@remotion/google-fonts": REMOTION_VERSION,
  "@remotion/media": REMOTION_VERSION,
  "@remotion/renderer": REMOTION_VERSION,
  remotion: REMOTION_VERSION,
  react: REACT_VERSION,
  "react-dom": REACT_VERSION,
} as const;

export const REMOTION_SCAFFOLD_DEV_DEPENDENCIES = {
  "@types/react": REACT_TYPES_VERSION,
  "@types/react-dom": REACT_TYPES_VERSION,
  typescript: TYPESCRIPT_VERSION,
} as const;
