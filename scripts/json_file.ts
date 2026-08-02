import { readFileSync } from "node:fs";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function readJsonFile(path: string): unknown {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`${path}: ${message(error)}`);
  }
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`${path}: ${message(error)}`);
  }
}
