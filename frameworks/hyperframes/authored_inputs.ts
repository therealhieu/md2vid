import { lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AuthoredVisualInput, BuildPlan, PlanFrame } from "../../engine/types.ts";

export interface HyperframesAuthoredFrameInput extends AuthoredVisualInput {
  frame: PlanFrame;
}

interface CollectionOptions {
  missing?: "omit" | "throw";
}

function validateComponent(path: string, relativePath: string, final: boolean): void {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      throw new Error(`missing HyperFrames authored frame input ${relativePath}`);
    }
    throw error;
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`HyperFrames authored frame input ${relativePath} must not contain a symlink`);
  }
  if (final) {
    if (!stats.isFile()) {
      throw new Error(`HyperFrames authored frame input ${relativePath} must be a regular file`);
    }
    return;
  }
  if (!stats.isDirectory()) {
    throw new Error(`HyperFrames authored frame input ${relativePath} parent must be a directory`);
  }
}

export function collectHyperframesAuthoredFrameInputs(
  plan: BuildPlan,
  videoDir: string,
  options: CollectionOptions = {},
): HyperframesAuthoredFrameInput[] {
  const root = resolve(videoDir);
  const missing = options.missing ?? "omit";
  return plan.frames.flatMap((frame) => {
    const relativePath = `compositions/frames/${frame.slug}.html`;
    const parts = relativePath.split("/");
    let current = root;
    for (const [index, part] of parts.entries()) {
      current = join(current, part);
      try {
        validateComponent(current, parts.slice(0, index + 1).join("/"), index === parts.length - 1);
      } catch (error) {
        if (missing === "omit" && (error as Error).message.startsWith("missing HyperFrames authored frame input ")) {
          return [];
        }
        throw error;
      }
    }
    return [{ frame, path: relativePath, bytes: readFileSync(current) }];
  });
}
