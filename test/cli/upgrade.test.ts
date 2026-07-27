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

for (const testCase of [
  {
    name: "start failure",
    invoke: (): SpawnSyncReturns<Buffer> => {
      throw new Error("spawn npm ENOENT");
    },
    cause: /failed to start npm root --global: spawn npm ENOENT/,
  },
  {
    name: "signal termination",
    invoke: () => result(null, "", { signal: "SIGTERM" }),
    cause: /npm root --global terminated by SIGTERM/,
  },
  {
    name: "missing status",
    invoke: () => result(null),
    cause: /npm root --global exited without a status/,
  },
  {
    name: "nonzero status",
    invoke: () => result(7),
    cause: /npm root --global exited with status 7/,
  },
  {
    name: "empty root",
    invoke: () => result(0, "\n"),
    cause: /npm root --global returned an empty path/,
  },
]) {
  test(`global validation reports ${testCase.name} with recovery`, () => {
    const spawn: UpgradeSpawn = () => testCase.invoke();
    assert.throws(
      () => resolveGlobalInstallation(
        { name: "md2vid", version: "0.1.11", root: "/tmp/md2vid" },
        process.env,
        { spawn, realpath: realpathSync },
      ),
      (error: unknown) => {
        const message = String((error as Error).message);
        assert.match(message, testCase.cause);
        assert.match(message, /npm install --global md2vid@latest/);
        assert.match(message, /md2vid install-skill/);
        return true;
      },
    );
  });
}

test("global validation reports realpath failure with recovery", () => {
  const spawn: UpgradeSpawn = () => result(0, "/missing/global/root\n");
  assert.throws(
    () => resolveGlobalInstallation(
      { name: "md2vid", version: "0.1.11", root: "/tmp/md2vid" },
      process.env,
      { spawn, realpath: () => { throw new Error("ENOENT fixture"); } },
    ),
    (error: unknown) => {
      const message = String((error as Error).message);
      assert.match(message, /could not resolve global npm installation: ENOENT fixture/);
      assert.match(message, /npm install --global md2vid@latest/);
      assert.match(message, /md2vid install-skill/);
      return true;
    },
  );
});
