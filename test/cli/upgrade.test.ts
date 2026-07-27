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
  run,
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
  return realpathSync(cliEntry);
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

function captureLines() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    log: (line: string) => stdout.push(line),
    error: (line: string) => stderr.push(line),
  };
}

test("upgrade help and invalid arguments never start npm", () => {
  for (const testCase of [
    { argv: ["--help"], code: 0 },
    { argv: ["extra"], code: 2 },
    { argv: ["--force"], code: 2 },
  ]) {
    const output = captureLines();
    let calls = 0;
    const code = run(testCase.argv, {
      spawn: () => {
        calls += 1;
        return result(0);
      },
      log: output.log,
      error: output.error,
    });
    assert.equal(code, testCase.code);
    assert.equal(calls, 0);
    assert.match(
      [...output.stdout, ...output.stderr].join("\n"),
      /Usage: md2vid upgrade/,
    );
  }
});

test("upgrade installs latest then refreshes skill with the fresh absolute CLI", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-upgrade-success-"));
  try {
    const globalRoot = join(root, "lib", "node_modules");
    const packageRoot = join(globalRoot, "md2vid");
    const cliEntry = createPackage(packageRoot, "0.1.11");
    const env = { ...process.env, CLAUDE_CONFIG_DIR: join(root, "claude") };
    const calls: RecordedCall[] = [];
    const spawn: UpgradeSpawn = (command, args, options) => {
      calls.push({ command, args, options });
      if (calls.length === 1) return result(0, `${globalRoot}\n`);
      if (calls.length === 2) {
        writeFileSync(
          join(packageRoot, "package.json"),
          `${JSON.stringify({ name: "md2vid", version: "0.1.12" }, null, 2)}\n`,
        );
      }
      return result(0);
    };
    const output = captureLines();
    assert.equal(run([], {
      env,
      metaUrl: pathToFileURL(cliEntry).href,
      spawn,
      log: output.log,
      error: output.error,
    }), 0);
    assert.deepEqual(calls.map(({ command, args }) => ({ command, args })), [
      { command: "npm", args: ["root", "--global"] },
      { command: "npm", args: ["install", "--global", "md2vid@latest"] },
      { command: process.execPath, args: [cliEntry, "install-skill"] },
    ]);
    assert.equal(calls[0].options.env, env);
    assert.equal(calls[0].options.shell, false);
    assert.deepEqual(calls[0].options.stdio, ["ignore", "pipe", "inherit"]);
    for (const call of calls.slice(1)) {
      assert.equal(call.options.env, env);
      assert.equal(call.options.shell, false);
      assert.equal(call.options.stdio, "inherit");
    }
    assert.deepEqual(output.stderr, []);
    assert.deepEqual(output.stdout, [
      "OK upgraded md2vid 0.1.11 → 0.1.12",
      "OK refreshed Claude skill",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("already-current upgrade still runs npm install and skill refresh", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-upgrade-current-"));
  try {
    const globalRoot = join(root, "lib", "node_modules");
    const packageRoot = join(globalRoot, "md2vid");
    const cliEntry = createPackage(packageRoot, "0.1.11");
    const calls: string[] = [];
    const spawn: UpgradeSpawn = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      return calls.length === 1 ? result(0, `${globalRoot}\n`) : result(0);
    };
    assert.equal(run([], { metaUrl: pathToFileURL(cliEntry).href, spawn }), 0);
    assert.deepEqual(calls, [
      "npm root --global",
      "npm install --global md2vid@latest",
      `${process.execPath} ${cliEntry} install-skill`,
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const npmFailures = [
  {
    name: "start",
    invoke: (): SpawnSyncReturns<Buffer> => {
      throw new Error("spawn npm EACCES");
    },
    expected: /failed to start npm install --global md2vid@latest: spawn npm EACCES/,
  },
  {
    name: "signal",
    invoke: () => result(null, "", { signal: "SIGTERM" }),
    expected: /npm install --global md2vid@latest terminated by SIGTERM/,
  },
  {
    name: "status missing",
    invoke: () => result(null),
    expected: /npm install --global md2vid@latest exited without a status/,
  },
  {
    name: "nonzero",
    invoke: () => result(1),
    expected: /npm install --global md2vid@latest exited with status 1/,
  },
];

for (const testCase of npmFailures) {
  test(`npm install failure: ${testCase.name} stops before skill refresh`, () => {
    const root = mkdtempSync(join(tmpdir(), "md2vid-upgrade-npm-fail-"));
    try {
      const globalRoot = join(root, "lib", "node_modules");
      const packageRoot = join(globalRoot, "md2vid");
      const cliEntry = createPackage(packageRoot, "0.1.11");
      let calls = 0;
      const spawn: UpgradeSpawn = () => {
        calls += 1;
        if (calls === 1) return result(0, `${globalRoot}\n`);
        return testCase.invoke();
      };
      const output = captureLines();
      const code = run([], {
        metaUrl: pathToFileURL(cliEntry).href,
        spawn,
        log: output.log,
        error: output.error,
      });
      assert.equal(code, 1);
      assert.equal(calls, 2, "skill refresh must not start");
      assert.match(output.stderr.join("\n"), testCase.expected);
      assert.doesNotMatch(output.stderr.join("\n"), /CLI upgrade completed/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("invalid updated package: missing fresh CLI stops before skill refresh", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-upgrade-missing-cli-"));
  try {
    const globalRoot = join(root, "lib", "node_modules");
    const packageRoot = join(globalRoot, "md2vid");
    const cliEntry = createPackage(packageRoot, "0.1.11");
    let calls = 0;
    const spawn: UpgradeSpawn = () => {
      calls += 1;
      if (calls === 1) return result(0, `${globalRoot}\n`);
      rmSync(cliEntry, { force: true });
      return result(0);
    };
    const output = captureLines();
    assert.equal(run([], {
      metaUrl: pathToFileURL(cliEntry).href,
      spawn,
      log: output.log,
      error: output.error,
    }), 1);
    assert.equal(calls, 2);
    assert.match(output.stderr.join("\n"), /invalid updated package: missing CLI/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("invalid updated package: malformed metadata stops before skill refresh", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-upgrade-bad-metadata-"));
  try {
    const globalRoot = join(root, "lib", "node_modules");
    const packageRoot = join(globalRoot, "md2vid");
    const cliEntry = createPackage(packageRoot, "0.1.11");
    let calls = 0;
    const spawn: UpgradeSpawn = () => {
      calls += 1;
      if (calls === 1) return result(0, `${globalRoot}\n`);
      writeFileSync(
        join(packageRoot, "package.json"),
        `${JSON.stringify({ name: "wrong", version: "0.1.12" })}\n`,
      );
      return result(0);
    };
    const output = captureLines();
    assert.equal(run([], {
      metaUrl: pathToFileURL(cliEntry).href,
      spawn,
      log: output.log,
      error: output.error,
    }), 1);
    assert.equal(calls, 2);
    assert.match(output.stderr.join("\n"), /FAIL \[upgrade\]: invalid updated package/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const skillFailures = [
  {
    name: "start",
    invoke: (): SpawnSyncReturns<Buffer> => {
      throw new Error("spawn node EACCES");
    },
    cause: /failed to start md2vid install-skill: spawn node EACCES/,
  },
  {
    name: "signal",
    invoke: () => result(null, "", { signal: "SIGTERM" }),
    cause: /md2vid install-skill terminated by SIGTERM/,
  },
  {
    name: "status missing",
    invoke: () => result(null),
    cause: /md2vid install-skill exited without a status/,
  },
  {
    name: "nonzero",
    invoke: () => result(9),
    cause: /md2vid install-skill exited with status 9/,
  },
];

for (const testCase of skillFailures) {
  test(`skill refresh failure: ${testCase.name} reports partial state`, () => {
    const root = mkdtempSync(join(tmpdir(), "md2vid-upgrade-skill-fail-"));
    try {
      const globalRoot = join(root, "lib", "node_modules");
      const packageRoot = join(globalRoot, "md2vid");
      const cliEntry = createPackage(packageRoot, "0.1.11");
      let calls = 0;
      const spawn: UpgradeSpawn = () => {
        calls += 1;
        if (calls === 1) return result(0, `${globalRoot}\n`);
        if (calls === 2) return result(0);
        return testCase.invoke();
      };
      const output = captureLines();
      const code = run([], {
        metaUrl: pathToFileURL(cliEntry).href,
        spawn,
        log: output.log,
        error: output.error,
      });
      assert.equal(code, 1);
      assert.equal(calls, 3);
      const message = output.stderr.join("\n");
      assert.match(message, /CLI upgrade completed, but skill refresh failed/);
      assert.match(message, testCase.cause);
      assert.match(message, /recovery: md2vid install-skill/);
      assert.equal((message.match(/FAIL \[upgrade\]:/g) ?? []).length, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
