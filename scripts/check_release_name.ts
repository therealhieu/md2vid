#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { isMainModule } from "./main-guard.ts";

export interface RegistryLookup {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function classifyPackageName(
  lookup: RegistryLookup,
  username: string,
): "available" | "owned" {
  if (lookup.status !== 0) {
    const diagnostic = `${lookup.stderr}\n${lookup.stdout}`.trim();
    if (/E404|404 Not Found/i.test(diagnostic)) return "available";
    throw new Error(`FAIL [release-name]: registry lookup failed: ${diagnostic}`);
  }

  const parsed = JSON.parse(lookup.stdout) as
    | Array<string | { name?: string }>
    | string
    | { name?: string };
  const items = Array.isArray(parsed) ? parsed : [parsed];
  const owners = items
    .map((item) => {
      if (typeof item === "string") return item.split(/\s|</, 1)[0];
      return item.name ?? "";
    })
    .filter(Boolean);

  if (!owners.includes(username)) {
    throw new Error(
      `FAIL [release-name]: md2vid is owned by [${owners.join(", ")}], current npm user is ${username}`,
    );
  }
  return "owned";
}

export function run(): number {
  try {
    const username = execFileSync("npm", ["whoami"], { encoding: "utf8" }).trim();
    const lookup = spawnSync("npm", ["view", "md2vid", "maintainers", "--json"], {
      encoding: "utf8",
    });
    const result = classifyPackageName(
      { status: lookup.status, stdout: lookup.stdout, stderr: lookup.stderr },
      username,
    );
    console.log(`OK [release-name]: md2vid is ${result} for npm user ${username}`);
    return 0;
  } catch (error) {
    const message = (error as Error).message;
    console.error(
      message.startsWith("FAIL [release-name]") ? message : `FAIL [release-name]: ${message}`,
    );
    return 1;
  }
}

if (isMainModule(import.meta.url)) process.exit(run());
