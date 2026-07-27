import assert from "node:assert/strict";
import { spawn, type SpawnSyncReturns } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { runHyperframes, resolveHyperframesInstallation } from "../../scripts/hyperframes_cli.ts";
import { ensurePinnedHyperframesPatches } from "../../frameworks/hyperframes/patches.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const HYPERFRAMES_CLI = join(REPO_ROOT, "scripts", "hyperframes_cli.ts");

const STUDIO_ANCHOR_1 = "let l=!1;const c=()=>{if(Qn.getState().isEditMode||l)return;";
const STUDIO_ANCHOR_2 = "if(!g)return;l=!0;const A=g;fetch(";
const STUDIO_MARKER = "let l=!1,hfLast=null;const c=()=>{if(Qn.getState().isEditMode||l)return;";
const CLI_ANCHOR = 'const subCompositionHosts = trackedCompositionHosts.filter((host) => host.hasAttribute("data-composition-src"));';
const CLI_MARKER = 'host.removeAttribute("data-composition-src")';

interface FakeInstallation {
  root: string;
  metaUrl: string;
  packageRoot: string;
  cli: string;
  studio: string;
}

function fakeInstallation(options: { malformedStudio?: boolean } = {}): FakeInstallation {
  const root = mkdtempSync(join(tmpdir(), "md2vid-hyperframes-self-heal-"));
  const packageRoot = join(root, "node_modules", "hyperframes");
  const cli = join(packageRoot, "dist", "cli.js");
  const studio = join(packageRoot, "dist", "studio", "assets", "index-test.js");
  const meta = join(root, "runner.mjs");
  mkdirSync(dirname(studio), { recursive: true });
  writeFileSync(meta, "// package resolution anchor\n");
  writeFileSync(join(packageRoot, "package.json"), JSON.stringify({
    name: "hyperframes",
    version: "0.7.26",
    bin: { hyperframes: "dist/cli.js" },
  }));
  writeFileSync(
    cli,
    `function packageCliFixture(trackedCompositionHosts) {\n  ${CLI_ANCHOR}\n  return subCompositionHosts;\n}\nconsole.log(process.argv.slice(2).join("|"));\n`,
  );
  writeFileSync(studio, options.malformedStudio
    ? `${STUDIO_ANCHOR_1}\n`
    : `${STUDIO_ANCHOR_1}\n${STUDIO_ANCHOR_2}\n`);
  return { root, metaUrl: pathToFileURL(meta).href, packageRoot, cli, studio };
}

function successResult(): SpawnSyncReturns<Buffer> {
  return {
    pid: 1,
    output: [null, null, null],
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
    status: 0,
    signal: null,
  };
}

function runChild(script: string, cwd: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolveChild, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", script], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => resolveChild({ code, output }));
  });
}

test("HyperFrames proxy applies only the required caption-loop patch before spawn", () => {
  const fixture = fakeInstallation();
  const pristineCli = readFileSync(fixture.cli);
  let spawned = false;
  try {
    const code = runHyperframes(["lint"], {
      metaUrl: fixture.metaUrl,
      spawn() {
        spawned = true;
        assert.match(readFileSync(fixture.studio, "utf8"), /hfLast/);
        assert.deepEqual(readFileSync(fixture.cli), pristineCli);
        return successResult();
      },
    });
    assert.equal(code, 0);
    assert.equal(spawned, true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("HyperFrames proxy patching is byte-idempotent", () => {
  const fixture = fakeInstallation();
  try {
    assert.equal(runHyperframes(["validate"], { metaUrl: fixture.metaUrl, spawn: successResult }), 0);
    const once = {
      studio: readFileSync(fixture.studio),
      cli: readFileSync(fixture.cli),
    };
    assert.match(once.studio.toString("utf8"), /hfLast/);
    assert.equal(once.cli.toString("utf8").includes(CLI_MARKER), false);
    assert.equal(runHyperframes(["inspect"], { metaUrl: fixture.metaUrl, spawn: successResult }), 0);
    assert.deepEqual(readFileSync(fixture.studio), once.studio);
    assert.deepEqual(readFileSync(fixture.cli), once.cli);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("concurrent HyperFrames proxy calls serialize patching and both execute", async () => {
  const fixture = fakeInstallation();
  try {
    const script = [
      `import { runHyperframes } from ${JSON.stringify(pathToFileURL(HYPERFRAMES_CLI).href)};`,
      `process.exitCode = runHyperframes(["--version"], { metaUrl: ${JSON.stringify(fixture.metaUrl)} });`,
    ].join("\n");
    const [first, second] = await Promise.all([
      runChild(script, fixture.root),
      runChild(script, fixture.root),
    ]);
    assert.equal(first.code, 0, first.output);
    assert.equal(second.code, 0, second.output);
    assert.match(readFileSync(fixture.studio, "utf8"), /hfLast/);
    assert.equal(readFileSync(fixture.cli, "utf8").includes(CLI_MARKER), false);
    assert.equal(
      readdirSync(fixture.packageRoot).some((name) => name.includes("md2vid-patch")),
      false,
      "patch locks and staging directories must be cleaned",
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("anchor mismatch fails before spawn and leaves every bundle unchanged", () => {
  const fixture = fakeInstallation({ malformedStudio: true });
  const before = {
    studio: readFileSync(fixture.studio),
    cli: readFileSync(fixture.cli),
  };
  let spawned = false;
  const errors: string[] = [];
  const originalError = console.error;
  try {
    console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
    const code = runHyperframes(["render"], {
      metaUrl: fixture.metaUrl,
      spawn() {
        spawned = true;
        return successResult();
      },
    });
    assert.equal(code, 1);
    assert.equal(spawned, false);
    assert.match(errors.join("\n"), /FAIL \[hyperframes-cli\].*hyperframes@0\.7\.26.*caption-loop anchor-2.*anchor matched 0.*expected 1/is);
    assert.deepEqual(readFileSync(fixture.studio), before.studio);
    assert.deepEqual(readFileSync(fixture.cli), before.cli);
  } finally {
    console.error = originalError;
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("mixed patched and pristine anchors fail closed before spawn", () => {
  const fixture = fakeInstallation();
  let spawned = false;
  const errors: string[] = [];
  const originalError = console.error;
  try {
    assert.equal(runHyperframes(["lint"], { metaUrl: fixture.metaUrl, spawn: successResult }), 0);
    const partiallyDuplicated = `${readFileSync(fixture.studio, "utf8")}\n${STUDIO_ANCHOR_1}\n`;
    writeFileSync(fixture.studio, partiallyDuplicated);
    console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
    assert.equal(runHyperframes(["snapshot"], {
      metaUrl: fixture.metaUrl,
      spawn() {
        spawned = true;
        return successResult();
      },
    }), 1);
    assert.equal(spawned, false);
    assert.match(errors.join("\n"), /caption-loop anchor-1.*anchor matched 1.*expected 0/i);
    assert.equal(readFileSync(fixture.studio, "utf8"), partiallyDuplicated);
  } finally {
    console.error = originalError;
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("staging write failure reports the cause and leaves both bundles pristine", () => {
  const fixture = fakeInstallation();
  const installation = resolveHyperframesInstallation(fixture.metaUrl);
  const before = {
    studio: readFileSync(fixture.studio),
    cli: readFileSync(fixture.cli),
  };
  let writes = 0;
  try {
    assert.throws(
      () => ensurePinnedHyperframesPatches(installation, {
        writeStagedFile(path, body) {
          writes += 1;
          if (writes === 1) throw new Error("injected staging write failure");
          writeFileSync(path, body);
        },
      }),
      /injected staging write failure/,
    );
    assert.deepEqual(readFileSync(fixture.studio), before.studio);
    assert.deepEqual(readFileSync(fixture.cli), before.cli);
    assert.equal(
      readdirSync(fixture.packageRoot).some((name) => name.includes("md2vid-patch")),
      false,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("promotion failure restores the Studio bundle without partial patch bytes", () => {
  const fixture = fakeInstallation();
  const installation = resolveHyperframesInstallation(fixture.metaUrl);
  const before = {
    studio: readFileSync(fixture.studio),
    cli: readFileSync(fixture.cli),
  };
  let promotions = 0;
  try {
    assert.throws(
      () => ensurePinnedHyperframesPatches(installation, {
        promotion: {
          rename(source, destination) {
            if (String(source).includes(".md2vid-patch-stage-") && ++promotions === 1) {
              throw new Error("injected patch promotion failure");
            }
            renameSync(source, destination);
          },
        },
      }),
      /injected patch promotion failure/,
    );
    assert.deepEqual(readFileSync(fixture.studio), before.studio);
    assert.deepEqual(readFileSync(fixture.cli), before.cli);
    assert.equal(
      readdirSync(fixture.packageRoot, { recursive: true })
        .some((name) => String(name).includes("md2vid-patch") || String(name).includes("md2vid-backup")),
      false,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("non-HyperFrames md2vid commands do not invoke the patcher", () => {
  const source = readFileSync(join(REPO_ROOT, "bin", "md2vid.ts"), "utf8");
  assert.match(source, /hyperframes:\s*\(args\)\s*=>\s*runHyperframes\(args\)/);
  for (const command of ["new", "build", "regroup", "transcribe", "verify", "install-skill"]) {
    assert.doesNotMatch(source, new RegExp(`${command}:.*runHyperframes`));
  }
  assert.equal(source.match(/runHyperframes\(/g)?.length, 1);
  assert.doesNotMatch(STUDIO_MARKER + CLI_MARKER, /querySelector\('template'\)/);
});
