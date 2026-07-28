# `md2vid upgrade` Implementation Plan — Part 1: Upgrade Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and fully unit-test npm-global validation and foreground upgrade orchestration in `scripts/upgrade.ts`.

**Architecture:** Inject synchronous process and filesystem operations so tests never contact npm or user directories. Resolve npm's global root, prove the running package is that exact installation, install `md2vid@latest`, validate the replaced package, then run the new absolute CLI with `install-skill`.

**Tech Stack:** TypeScript ESM, Node.js `spawnSync`, filesystem realpaths, `pathToFileURL`, existing `parseCommand()` and `readPackageMetadata()`, `node:test`.

---

## Group: `upgrade-core`

Tasks 1–5 are one coherent scope over `scripts/upgrade.ts` and `test/cli/upgrade.test.ts`. Preserve every task commit, then run one combined review/remediation/verifier cycle.

## Shared target API

The completed module exposes:

```ts
export type UpgradeSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptions,
) => SpawnSyncReturns<Buffer>;

export interface GlobalInstallation {
  globalRoot: string;
  packageRoot: string;
  cliEntry: string;
}

export interface UpgradeRunDependencies {
  env?: NodeJS.ProcessEnv;
  metaUrl?: string;
  spawn?: UpgradeSpawn;
  realpath?: (path: string) => string;
  exists?: (path: string) => boolean;
  npmCommand?: string;
  nodeCommand?: string;
  log?: (line: string) => void;
  error?: (line: string) => void;
}

export function resolveGlobalInstallation(
  metadata: PackageMetadata,
  env: NodeJS.ProcessEnv,
  operations?: GlobalInstallationOperations,
): GlobalInstallation;

export function run(argv: string[], dependencies?: UpgradeRunDependencies): number;
```

### Task 1: Resolve a verified global npm installation [Tester: yes] `[Group: upgrade-core]`

**Tester:** `yes` because path equality is the mutation authorization boundary.

**Files:**
- Create: `scripts/upgrade.ts`
- Create: `test/cli/upgrade.test.ts`
- Reuse: `scripts/package_root.ts:5-40`
- Reference: `scripts/hyperframes_cli.ts:105-169`

- [ ] **Step 1: Add deterministic package and child-result fixtures**

Create `test/cli/upgrade.test.ts`:

```ts
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
```

- [ ] **Step 2: Write the global-install success test**

Append:

```ts
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
```

- [ ] **Step 3: Run the success test and verify red state**

Run:

```bash
node --test --test-name-pattern="global validation resolves" test/cli/upgrade.test.ts
```

Expected: FAIL because `scripts/upgrade.ts` is absent.

- [ ] **Step 4: Implement the minimal resolver success path**

Create `scripts/upgrade.ts`:

```ts
#!/usr/bin/env node

import {
  spawnSync,
  type SpawnSyncOptions,
  type SpawnSyncReturns,
} from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import type { PackageMetadata } from "./package_root.ts";

export type UpgradeSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptions,
) => SpawnSyncReturns<Buffer>;

export interface GlobalInstallation {
  globalRoot: string;
  packageRoot: string;
  cliEntry: string;
}

export interface GlobalInstallationOperations {
  spawn?: UpgradeSpawn;
  realpath?: (path: string) => string;
  npmCommand?: string;
}

export function resolveGlobalInstallation(
  metadata: PackageMetadata,
  env: NodeJS.ProcessEnv,
  operations: GlobalInstallationOperations = {},
): GlobalInstallation {
  const spawn = operations.spawn ?? spawnSync;
  const realpath = operations.realpath ?? realpathSync;
  const npmCommand = operations.npmCommand ?? "npm";
  const child = spawn(npmCommand, ["root", "--global"], {
    env,
    shell: false,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const globalRoot = realpath(child.stdout.toString("utf8").trim());
  const packageRoot = realpath(join(globalRoot, metadata.name));
  const runningRoot = realpath(metadata.root);
  if (packageRoot !== runningRoot) throw new Error("global package mismatch");
  return {
    globalRoot,
    packageRoot,
    cliEntry: join(packageRoot, "dist", "bin", "md2vid.js"),
  };
}
```

- [ ] **Step 5: Run the success test and verify green state**

Run:

```bash
node --test --test-name-pattern="global validation resolves" test/cli/upgrade.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write the local/npx mismatch test**

Append:

```ts
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
```

- [ ] **Step 7: Run the mismatch test and verify red state**

Run:

```bash
node --test --test-name-pattern="local or npx" test/cli/upgrade.test.ts
```

Expected: FAIL because the implementation throws `global package mismatch`.

- [ ] **Step 8: Add the shared supported-installation guidance**

Add to `scripts/upgrade.ts`:

```ts
const MANUAL_RECOVERY = [
  "self-upgrade requires a global npm installation",
  "manual recovery: npm install --global md2vid@latest && md2vid install-skill",
].join("; ");

function fail(message: string): Error {
  return new Error(`FAIL [upgrade]: ${message}`);
}

function validationFail(cause: string): Error {
  return fail(`${cause}; ${MANUAL_RECOVERY}`);
}
```

Replace the mismatch throw with:

```ts
if (packageRoot !== runningRoot) {
  throw validationFail("running package does not match npm's global md2vid package");
}
```

- [ ] **Step 9: Run Task 1 tests and commit**

Run:

```bash
node --test --test-name-pattern="global validation resolves|local or npx" test/cli/upgrade.test.ts
corepack npm run typecheck
git add scripts/upgrade.ts test/cli/upgrade.test.ts
git commit -m "feat(cli): resolve global npm installation"
```

Expected: tests and typecheck pass; commit succeeds with the repository identity.

### Task 2: Report every validation failure with recovery [Tester: yes] `[Group: upgrade-core]`

**Files:**
- Modify: `scripts/upgrade.ts`
- Modify: `test/cli/upgrade.test.ts`

- [ ] **Step 1: Write table-driven npm-root failure tests**

Append:

```ts
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
```

- [ ] **Step 2: Run npm-root failure tests and verify red state**

Run:

```bash
node --test --test-name-pattern="global validation reports" test/cli/upgrade.test.ts
```

Expected: FAIL because child result failures and thrown spawn errors are not normalized.

- [ ] **Step 3: Add a pure child-failure classifier**

Add:

```ts
function childFailure(
  label: string,
  child: SpawnSyncReturns<Buffer>,
): string | undefined {
  if (child.error) return `failed to start ${label}: ${child.error.message}`;
  if (child.signal) return `${label} terminated by ${child.signal}`;
  if (child.status === null) return `${label} exited without a status`;
  if (child.status !== 0) return `${label} exited with status ${child.status}`;
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
```

Wrap the root spawn and classify its result:

```ts
let child: SpawnSyncReturns<Buffer>;
try {
  child = spawn(npmCommand, ["root", "--global"], {
    env,
    shell: false,
    stdio: ["ignore", "pipe", "inherit"],
  });
} catch (error) {
  throw validationFail(`failed to start npm root --global: ${errorMessage(error)}`);
}
const childProblem = childFailure("npm root --global", child);
if (childProblem) throw validationFail(childProblem);
const reportedRoot = child.stdout.toString("utf8").trim();
if (!reportedRoot) throw validationFail("npm root --global returned an empty path");
```

- [ ] **Step 4: Run npm-root failure tests and verify green state**

Run:

```bash
node --test --test-name-pattern="global validation reports" test/cli/upgrade.test.ts
```

Expected: PASS; every message includes the technical cause and both recovery commands.

- [ ] **Step 5: Write the unresolvable-root failure test**

Append:

```ts
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
```

- [ ] **Step 6: Run the realpath test and verify red state**

Run:

```bash
node --test --test-name-pattern="realpath failure" test/cli/upgrade.test.ts
```

Expected: FAIL because realpath errors are not wrapped with recovery.

- [ ] **Step 7: Wrap all global-root realpath failures**

Replace direct realpath assignments with:

```ts
let globalRoot: string;
let packageRoot: string;
let runningRoot: string;
try {
  globalRoot = realpath(reportedRoot);
  packageRoot = realpath(join(globalRoot, metadata.name));
  runningRoot = realpath(metadata.root);
} catch (error) {
  throw validationFail(
    `could not resolve global npm installation: ${errorMessage(error)}`,
  );
}
```

- [ ] **Step 8: Run Task 2 tests and commit**

Run:

```bash
node --test test/cli/upgrade.test.ts
corepack npm run typecheck
git add scripts/upgrade.ts test/cli/upgrade.test.ts
git commit -m "feat(cli): report upgrade validation failures"
```

Expected: all validation tests and typecheck pass.

### Task 3: Run a successful synchronized upgrade [Tester: yes] `[Group: upgrade-core]`

**Files:**
- Modify: `scripts/upgrade.ts`
- Modify: `test/cli/upgrade.test.ts`
- Reuse: `scripts/cli_args.ts:27-62`
- Reuse: `scripts/package_root.ts:30-40`

- [ ] **Step 1: Write help and invalid-argument tests**

Extend the import with `run`, then append:

```ts
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
```

- [ ] **Step 2: Run parser tests and verify red state**

Run:

```bash
node --test --test-name-pattern="help and invalid" test/cli/upgrade.test.ts
```

Expected: FAIL because `run()` is absent.

- [ ] **Step 3: Implement parser-only `run()` behavior**

Add imports:

```ts
import { parseCommand } from "./cli_args.ts";
import { readPackageMetadata } from "./package_root.ts";
```

Add:

```ts
export interface UpgradeRunDependencies {
  env?: NodeJS.ProcessEnv;
  metaUrl?: string;
  spawn?: UpgradeSpawn;
  realpath?: (path: string) => string;
  exists?: (path: string) => boolean;
  npmCommand?: string;
  nodeCommand?: string;
  log?: (line: string) => void;
  error?: (line: string) => void;
}

const USAGE = "Usage: md2vid upgrade";

export function run(
  argv: string[],
  dependencies: UpgradeRunDependencies = {},
): number {
  const log = dependencies.log ?? console.log;
  const reportError = dependencies.error ?? console.error;
  const parsed = parseCommand({
    command: "upgrade",
    usage: USAGE,
    options: {},
    minPositionals: 0,
    maxPositionals: 0,
  }, argv);
  if (parsed.kind === "help") {
    log(USAGE);
    return 0;
  }
  if (parsed.kind === "error") {
    reportError(parsed.message);
    reportError(parsed.usage);
    return 2;
  }
  reportError("FAIL [upgrade]: orchestration not reached");
  return 1;
}
```

- [ ] **Step 4: Run parser tests and verify green state**

Run:

```bash
node --test --test-name-pattern="help and invalid" test/cli/upgrade.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the complete success and already-current tests**

Append a success test that records all options and rewrites the fixture version during npm install:

```ts
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
```

- [ ] **Step 6: Run success tests and verify red state**

Run:

```bash
node --test --test-name-pattern="installs latest|already-current" test/cli/upgrade.test.ts
```

Expected: FAIL because `run()` stops before orchestration.

- [ ] **Step 7: Implement successful foreground orchestration**

Add imports:

```ts
import { existsSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
```

Add:

```ts
function runInheritedChild(
  label: string,
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  spawn: UpgradeSpawn,
): void {
  let child: SpawnSyncReturns<Buffer>;
  try {
    child = spawn(command, args, { env, shell: false, stdio: "inherit" });
  } catch (error) {
    throw fail(`failed to start ${label}: ${errorMessage(error)}`);
  }
  if (child.status !== 0) throw fail(`${label} failed`);
}
```

Replace the parser's temporary final two lines with:

```ts
const env = dependencies.env ?? process.env;
const spawn = dependencies.spawn ?? spawnSync;
const realpath = dependencies.realpath ?? realpathSync;
const exists = dependencies.exists ?? existsSync;
const npmCommand = dependencies.npmCommand ?? "npm";
const nodeCommand = dependencies.nodeCommand ?? process.execPath;
try {
  const before = readPackageMetadata(dependencies.metaUrl ?? import.meta.url);
  const installation = resolveGlobalInstallation(before, env, {
    spawn,
    realpath,
    npmCommand,
  });
  runInheritedChild(
    "npm install --global md2vid@latest",
    npmCommand,
    ["install", "--global", `${before.name}@latest`],
    env,
    spawn,
  );
  if (!exists(installation.cliEntry)) {
    throw fail(`invalid updated package: missing CLI at ${installation.cliEntry}`);
  }
  const after = readPackageMetadata(pathToFileURL(installation.cliEntry).href);
  runInheritedChild(
    "md2vid install-skill",
    nodeCommand,
    [installation.cliEntry, "install-skill"],
    env,
    spawn,
  );
  log(`OK upgraded md2vid ${before.version} → ${after.version}`);
  log("OK refreshed Claude skill");
  return 0;
} catch (error) {
  const detail = errorMessage(error);
  reportError(detail.startsWith("FAIL [upgrade]:") ? detail : `FAIL [upgrade]: ${detail}`);
  return 1;
}
```

- [ ] **Step 8: Run Task 3 tests and commit**

Run:

```bash
node --test --test-name-pattern="help and invalid|installs latest|already-current" test/cli/upgrade.test.ts
corepack npm run typecheck
git add scripts/upgrade.ts test/cli/upgrade.test.ts
git commit -m "feat(cli): run synchronized upgrade"
```

Expected: selected tests and typecheck pass.

### Task 4: Stop on npm or updated-package failure [Tester: yes] `[Group: upgrade-core]`

**Files:**
- Modify: `scripts/upgrade.ts`
- Modify: `test/cli/upgrade.test.ts`

- [ ] **Step 1: Write complete npm-install failure tests**

Append:

```ts
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
```

- [ ] **Step 2: Run npm failure tests and verify red state**

Run:

```bash
node --test --test-name-pattern="npm install failure" test/cli/upgrade.test.ts
```

Expected: FAIL for signal, missing-status, and nonzero cases because Task 3 reports only `npm install --global md2vid@latest failed`.

- [ ] **Step 3: Classify every mutating-child failure and short-circuit**

Replace the final line of `runInheritedChild()`:

```ts
const problem = childFailure(label, child);
if (problem) throw fail(problem);
```

The existing catch remains responsible for thrown start failures. `run()` already returns immediately through its outer catch, so the fresh CLI is never spawned.

- [ ] **Step 4: Run npm failure tests and verify green state**

Run:

```bash
node --test --test-name-pattern="npm install failure" test/cli/upgrade.test.ts
```

Expected: PASS for all four named cases.

- [ ] **Step 5: Write complete invalid updated-package tests**

Append:

```ts
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
```

- [ ] **Step 6: Run invalid-package tests and verify red state**

Run:

```bash
node --test --test-name-pattern="invalid updated package" test/cli/upgrade.test.ts
```

Expected: missing-CLI passes; malformed-metadata fails because the error lacks `invalid updated package`.

- [ ] **Step 7: Normalize post-update metadata failures**

Replace the direct metadata read with:

```ts
let after: PackageMetadata;
try {
  after = readPackageMetadata(pathToFileURL(installation.cliEntry).href);
} catch (error) {
  throw fail(`invalid updated package: ${errorMessage(error)}`);
}
```

Update the `package_root.ts` import to include `type PackageMetadata`.

- [ ] **Step 8: Run Task 4 tests and commit**

Run:

```bash
node --test --test-name-pattern="npm install failure|invalid updated package" test/cli/upgrade.test.ts
corepack npm run typecheck
git add scripts/upgrade.ts test/cli/upgrade.test.ts
git commit -m "feat(cli): stop failed package upgrades"
```

Expected: all named tests and typecheck pass.

### Task 5: Report every skill-refresh failure as partial state [Tester: yes] `[Group: upgrade-core]`

**Files:**
- Modify: `scripts/upgrade.ts`
- Modify: `test/cli/upgrade.test.ts`
- Reuse: `scripts/main-guard.ts`

- [ ] **Step 1: Write all fresh-CLI failure-shape tests**

Append the complete table-driven test:

```ts
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
```

- [ ] **Step 2: Run skill failure tests and verify red state**

Run:

```bash
node --test --test-name-pattern="skill refresh failure" test/cli/upgrade.test.ts
```

Expected: FAIL because current errors do not identify partial completion and recovery.

- [ ] **Step 3: Normalize the inner failure prefix before wrapping**

Wrap only the skill child call:

```ts
try {
  runInheritedChild(
    "md2vid install-skill",
    nodeCommand,
    [installation.cliEntry, "install-skill"],
    env,
    spawn,
  );
} catch (error) {
  const cause = errorMessage(error).replace(/^FAIL \[upgrade\]:\s*/, "");
  throw fail(
    `CLI upgrade completed, but skill refresh failed: ${cause}; recovery: md2vid install-skill`,
  );
}
```

This must produce exactly one `FAIL [upgrade]:` prefix.

- [ ] **Step 4: Run skill failure tests and verify green state**

Run:

```bash
node --test --test-name-pattern="skill refresh failure" test/cli/upgrade.test.ts
```

Expected: PASS for all four failure shapes.

- [ ] **Step 5: Add the direct-script main guard**

Import:

```ts
import { isMainModule } from "./main-guard.ts";
```

Append:

```ts
if (isMainModule(import.meta.url)) process.exit(run(process.argv.slice(2)));
```

- [ ] **Step 6: Run the complete core suite and commit**

Run:

```bash
node --test test/cli/upgrade.test.ts
corepack npm run typecheck
git diff --check
git add scripts/upgrade.ts test/cli/upgrade.test.ts
git commit -m "feat(cli): report skill refresh recovery"
```

Expected: all upgrade tests and typecheck pass; diff check prints nothing.

## Group Review and Verification Checklist

After Tasks 1–5 Mode A:

1. Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel against the entire `upgrade-core` group.
2. Resume the same implementer for every accepted finding.
3. Rerun:

```bash
node --test test/cli/upgrade.test.ts
corepack npm run typecheck
git diff --check
```

4. The same implementer spawns one read-only verifier to confirm:
   - every validation failure includes the technical cause and both manual commands;
   - root lookup uses the injected environment, `shell: false`, piped stdout, and inherited stderr;
   - both mutating children use the injected environment, `shell: false`, and inherited stdio;
   - npm failure skips skill refresh;
   - all four skill-child failure shapes report partial state, one prefix, and recovery;
   - no test contacts the registry or writes outside temporary directories.
5. Do not begin Part 2 until this checklist passes.
