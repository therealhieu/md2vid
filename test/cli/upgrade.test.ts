import { test } from "node:test";
import assert from "node:assert/strict";
import type { SpawnSyncOptions, SpawnSyncReturns } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  resolveGlobalInstallation,
  type UpgradeSpawn,
} from "../../scripts/upgrade.ts";

function result(
  status: number | null,
  stdout = "",
  overrides: Partial<SpawnSyncReturns<Buffer>> = {},
): SpawnSyncReturns<Buffer> {
  return {
    pid: 123,
    output: [null, Buffer.from(stdout), Buffer.alloc(0)],
    stdout: Buffer.from(stdout),
    stderr: Buffer.alloc(0),
    status,
    signal: null,
    ...overrides,
  };
}

function createPackage(root: string, version: string): string {
  const cliEntry = join(root, "dist", "bin", "md2vid.js");
  mkdirSync(dirname(cliEntry), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "md2vid", version }, null, 2)}\n`,
  );
  writeFileSync(cliEntry, "// fixture CLI\n");
  return cliEntry;
}

interface RecordedCall {
  command: string;
  args: readonly string[];
  options: SpawnSyncOptions;
}

test("global validation resolves npm paths with the required child options", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-upgrade-global-"));
  try {
    const globalRoot = join(root, "lib", "node_modules");
    const packageRoot = join(globalRoot, "md2vid");
    createPackage(packageRoot, "0.1.11");
    const env = { ...process.env, NPM_CONFIG_USERCONFIG: join(root, "npmrc") };
    const calls: RecordedCall[] = [];
    const spawn: UpgradeSpawn = (command, args, options) => {
      calls.push({ command, args, options });
      return result(0, `${globalRoot}\n`);
    };

    const installation = resolveGlobalInstallation(
      { name: "md2vid", version: "0.1.11", root: packageRoot },
      env,
      { spawn, realpath: realpathSync },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "npm");
    assert.deepEqual(calls[0].args, ["root", "--global"]);
    assert.equal(calls[0].options.env, env);
    assert.equal(calls[0].options.shell, false);
    assert.deepEqual(calls[0].options.stdio, ["ignore", "pipe", "inherit"]);
    assert.equal(installation.globalRoot, realpathSync(globalRoot));
    assert.equal(installation.packageRoot, realpathSync(packageRoot));
    assert.equal(
      installation.cliEntry,
      join(realpathSync(packageRoot), "dist", "bin", "md2vid.js"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("global validation rejects a local or npx package", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-upgrade-local-"));
  try {
    const runningRoot = join(root, "checkout");
    const globalRoot = join(root, "lib", "node_modules");
    createPackage(runningRoot, "0.1.11");
    createPackage(join(globalRoot, "md2vid"), "0.1.10");
    const spawn: UpgradeSpawn = () => result(0, `${globalRoot}\n`);
    assert.throws(
      () => resolveGlobalInstallation(
        { name: "md2vid", version: "0.1.11", root: runningRoot },
        process.env,
        { spawn, realpath: realpathSync },
      ),
      /self-upgrade requires a global npm installation/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
