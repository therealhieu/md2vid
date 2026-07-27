import { statSync } from "node:fs";
import { resolve } from "node:path";

export interface ProjectLayout {
  outputDir: string;
  sharedDir: string;
  flat: boolean;
}

interface ProjectLayoutDependencies {
  statSync?: (path: string) => { isDirectory(): boolean };
}

function isDirectory(path: string, stat: NonNullable<ProjectLayoutDependencies["statSync"]>): boolean {
  try {
    return stat(path).isDirectory();
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function resolveProjectLayout(
  outputDir: string,
  deps: ProjectLayoutDependencies = {},
): ProjectLayout {
  const output = resolve(outputDir);
  const siblingShared = resolve(output, "..", "shared");
  if (isDirectory(siblingShared, deps.statSync ?? statSync)) {
    return { outputDir: output, sharedDir: siblingShared, flat: false };
  }
  return { outputDir: output, sharedDir: output, flat: true };
}
