// main-guard.ts — detect whether a script module is the process entry point.
//
// Lets each script keep a legacy `node scripts/x.ts` entry (runs run(argv) and
// exits) while being importable by bin/md2vid.ts + tests without executing.
// import.meta.main is Node ≥24 only; engines floor is 22.18, so compare argv[1].

import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

export function isMainModule(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath(metaUrl);
  try {
    return realpathSync(self) === realpathSync(entry);
  } catch {
    return self === entry;
  }
}
