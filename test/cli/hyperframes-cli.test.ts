import assert from "node:assert/strict";
import type { SpawnSyncReturns } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  resolveHyperframesInstallation,
  runHyperframes,
} from "../../scripts/hyperframes_cli.ts";

interface FakePackageOptions {
  depth?: "source" | "compiled";
  version?: string;
  bin?: unknown;
}

function fakePackage({
  depth = "compiled",
  version = "0.7.26",
  bin = { hyperframes: "dist/cli.js" },
}: FakePackageOptions = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "md2vid-hf-owned-")));
  const md2vidModule = depth === "source"
    ? join(root, "scripts", "hyperframes_cli.ts")
    : join(root, "dist", "scripts", "hyperframes_cli.js");
  const packageRoot = join(root, "node_modules", "hyperframes");
  mkdirSync(dirname(md2vidModule), { recursive: true });
  mkdirSync(join(packageRoot, "dist"), { recursive: true });
  writeFileSync(md2vidModule, "// resolver anchor\n");
  writeFileSync(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "hyperframes", version, bin }),
  );
  writeFileSync(join(packageRoot, "dist", "cli.js"), "process.exit(0);\n");
  return { root, md2vidModule, packageRoot };
}

function spawnResult(
  overrides: Partial<SpawnSyncReturns<Buffer>> = {},
): SpawnSyncReturns<Buffer> {
  return {
    pid: 1,
    output: [null, Buffer.alloc(0), Buffer.alloc(0)],
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
    status: 0,
    signal: null,
    ...overrides,
  };
}

function captureErrors(run: () => number): { status: number; errors: string[] } {
  const original = console.error;
  const errors: string[] = [];
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
  try {
    return { status: run(), errors };
  } finally {
    console.error = original;
  }
}

for (const depth of ["source", "compiled"] as const) {
  test(`resolves HyperFrames relative to md2vid at ${depth} depth from unrelated cwd`, () => {
    const fixture = fakePackage({ depth });
    const unrelatedCwd = mkdtempSync(join(tmpdir(), "md2vid-hf-cwd-"));
    const previous = process.cwd();
    try {
      process.chdir(unrelatedCwd);
      const found = resolveHyperframesInstallation(
        pathToFileURL(fixture.md2vidModule).href,
      );
      assert.deepEqual(found, {
        version: "0.7.26",
        packageRoot: fixture.packageRoot,
        packageJsonPath: join(fixture.packageRoot, "package.json"),
        cliEntry: join(fixture.packageRoot, "dist", "cli.js"),
      });
    } finally {
      process.chdir(previous);
      rmSync(fixture.root, { recursive: true, force: true });
      rmSync(unrelatedCwd, { recursive: true, force: true });
    }
  });
}

test("supports a string package bin entry", () => {
  const fixture = fakePackage({ bin: "dist/cli.js" });
  try {
    const found = resolveHyperframesInstallation(
      pathToFileURL(fixture.md2vidModule).href,
    );
    assert.equal(found.cliEntry, join(fixture.packageRoot, "dist", "cli.js"));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("rejects a mismatched package-owned HyperFrames version", () => {
  const fixture = fakePackage({ version: "0.7.66" });
  try {
    assert.throws(
      () => resolveHyperframesInstallation(pathToFileURL(fixture.md2vidModule).href),
      /FAIL \[hyperframes-cli\]: expected hyperframes@0\.7\.26, found 0\.7\.66/,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("rejects missing bin.hyperframes metadata", () => {
  const fixture = fakePackage({ bin: { other: "dist/cli.js" } });
  try {
    assert.throws(
      () => resolveHyperframesInstallation(pathToFileURL(fixture.md2vidModule).href),
      /FAIL \[hyperframes-cli\]: package metadata is missing bin\.hyperframes/,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("rejects a bin.hyperframes entry that escapes the package root", () => {
  const fixture = fakePackage({ bin: { hyperframes: "../outside.js" } });
  try {
    assert.throws(
      () => resolveHyperframesInstallation(pathToFileURL(fixture.md2vidModule).href),
      /FAIL \[hyperframes-cli\]: bin\.hyperframes escapes the package root/,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("rejects a bin.hyperframes entry whose directory link escapes the package root", () => {
  const fixture = fakePackage();
  const linkedDirectory = join(fixture.packageRoot, "dist");
  const outsideDirectory = join(fixture.root, "outside-bin");
  try {
    rmSync(linkedDirectory, { recursive: true, force: true });
    mkdirSync(outsideDirectory, { recursive: true });
    writeFileSync(join(outsideDirectory, "cli.js"), "process.exit(0);\n");
    symlinkSync(
      outsideDirectory,
      linkedDirectory,
      "dir",
    );

    assert.throws(
      () => resolveHyperframesInstallation(pathToFileURL(fixture.md2vidModule).href),
      /FAIL \[hyperframes-cli\]: bin\.hyperframes escapes the package root/,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("normalizes a missing bin.hyperframes entry failure", () => {
  const fixture = fakePackage();
  try {
    rmSync(join(fixture.packageRoot, "dist", "cli.js"));
    assert.throws(
      () => resolveHyperframesInstallation(pathToFileURL(fixture.md2vidModule).href),
      /FAIL \[hyperframes-cli\]: bin\.hyperframes is missing or unreadable/,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("runs the declared CLI with process.execPath, literal arguments, and exact spawn options", () => {
  const fixture = fakePackage();
  try {
    const calls: unknown[][] = [];
    const args = ["lint", "--flag=value with spaces", "$(not-a-shell)"];
    const status = runHyperframes(args, {
      metaUrl: pathToFileURL(fixture.md2vidModule).href,
      cwd: fixture.root,
      spawn(command, childArgs, options) {
        calls.push([command, childArgs, options]);
        return spawnResult({ status: 7 });
      },
    });

    assert.equal(status, 7);
    assert.deepEqual(calls, [[
      process.execPath,
      [join(fixture.packageRoot, "dist", "cli.js"), ...args],
      { cwd: fixture.root, stdio: "inherit", shell: false },
    ]]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("returns 1 and reports a thrown launch error", () => {
  const fixture = fakePackage();
  try {
    const result = captureErrors(() => runHyperframes([], {
      metaUrl: pathToFileURL(fixture.md2vidModule).href,
      spawn() {
        throw new Error("thrown spawn failure");
      },
    }));
    assert.equal(result.status, 1);
    assert.deepEqual(result.errors, [
      "FAIL [hyperframes-cli]: failed to start child: thrown spawn failure",
    ]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("returns 1 and reports result.error", () => {
  const fixture = fakePackage();
  try {
    const result = captureErrors(() => runHyperframes([], {
      metaUrl: pathToFileURL(fixture.md2vidModule).href,
      spawn: (() => spawnResult({
        status: null,
        error: new Error("reported spawn failure"),
      })),
    }));
    assert.equal(result.status, 1);
    assert.deepEqual(result.errors, [
      "FAIL [hyperframes-cli]: failed to start child: reported spawn failure",
    ]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("returns 1 and reports signal termination", () => {
  const fixture = fakePackage();
  try {
    const result = captureErrors(() => runHyperframes([], {
      metaUrl: pathToFileURL(fixture.md2vidModule).href,
      spawn: (() => spawnResult({
        status: null,
        signal: "SIGTERM",
      })),
    }));
    assert.equal(result.status, 1);
    assert.deepEqual(result.errors, [
      "FAIL [hyperframes-cli]: child terminated by SIGTERM",
    ]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("returns 1 and reports a null child status", () => {
  const fixture = fakePackage();
  try {
    const result = captureErrors(() => runHyperframes([], {
      metaUrl: pathToFileURL(fixture.md2vidModule).href,
      spawn: (() => spawnResult({ status: null })),
    }));
    assert.equal(result.status, 1);
    assert.deepEqual(result.errors, [
      "FAIL [hyperframes-cli]: child exited without a status",
    ]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
