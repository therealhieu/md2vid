// router.test.ts — Task 0.2: bin/md2vid.ts dispatches each subcommand to the
// same run() body the legacy scripts/*.ts entry uses, from any cwd, with args
// forwarded verbatim. Unknown/missing subcommands print usage and exit 2.
//
// We drive the real bin via `node bin/md2vid.ts <cmd> <args>` (execFileSync) so
// the test exercises the shipped entry point end-to-end, and compare its exit
// code + effect to calling run() directly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { main } from "../../bin/md2vid.ts";
import {
  assertSupportedPlatform,
  SUPPORTED_PLATFORMS,
} from "../../scripts/platform_support.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const BIN = join(REPO_ROOT, "bin", "md2vid.ts");
const PACKAGE_ROOT_HELPER = join(REPO_ROOT, "scripts", "package_root.ts");
const PACKAGE_VERSION = (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { version: string }).version;
const FIXTURES = join(REPO_ROOT, "test", "golden", "fixtures", "hash-table-example", "inputs");

// Run the bin from an arbitrary cwd; return { code, stdout, stderr }.
function runBin(args: string[], cwd = REPO_ROOT): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [BIN, ...args], { cwd, encoding: "utf8", stdio: "pipe" });
    return { code: 0, stdout, stderr: "" };
  } catch (e: any) {
    return { code: e.status ?? 1, stdout: e.stdout?.toString() ?? "", stderr: e.stderr?.toString() ?? "" };
  }
}

async function withStaticServer(root: string, operation: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const candidate = resolve(root, `.${pathname}`);
    const rel = relative(root, candidate);
    if (rel === ".." || rel.startsWith("../") || rel.startsWith("..\\")) {
      response.writeHead(403).end();
      return;
    }
    try {
      response.writeHead(200, { "content-type": "application/javascript" });
      response.end(readFileSync(candidate));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await operation(`http://127.0.0.1:${address.port}/`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => error ? reject(error) : resolveClose());
    });
  }
}

function seedVideo() {
  const tmp = mkdtempSync(join(tmpdir(), "router-"));
  const shared = join(tmp, "shared");
  const output = join(tmp, "hyperframes");
  mkdirSync(join(shared, "assets", "voice"), { recursive: true });
  mkdirSync(join(output, "compositions", "frames"), { recursive: true });
  for (const id of ["01", "02", "03", "04", "05", "06", "07"]) {
    writeFileSync(join(shared, "assets", "voice", `${id}.wav`), `VOICE${id}`);
  }
  copyFileSync(join(FIXTURES, "audio_meta.json"), join(shared, "audio_meta.json"));
  copyFileSync(join(FIXTURES, "video.config.json"), join(shared, "video.config.json"));
  copyFileSync(join(FIXTURES, "output.config.json"), join(output, "output.config.json"));
  for (const slug of [
    "01-cover",
    "02-core-idea",
    "03-lookup-flow",
    "04-collisions",
    "05-load-factor",
    "06-why-matters",
    "07-recap",
  ]) {
    writeFileSync(join(output, "compositions", "frames", `${slug}.html`), "<html></html>\n");
  }
  return { tmp, output };
}

test("platform guard accepts only macOS and Linux", () => {
  assert.deepEqual(SUPPORTED_PLATFORMS, ["darwin", "linux"]);
  assert.doesNotThrow(() => assertSupportedPlatform("darwin"));
  assert.doesNotThrow(() => assertSupportedPlatform("linux"));

  for (const platform of ["win32", "aix", "freebsd"] as NodeJS.Platform[]) {
    assert.throws(
      () => assertSupportedPlatform(platform),
      new RegExp(`Unsupported platform "${platform}".*macOS and Linux only`, "i"),
    );
  }
});

test("router rejects unsupported platforms before help or version dispatch", async () => {
  await assert.rejects(
    () => main(["--version"], "win32"),
    /Unsupported platform "win32".*macOS and Linux only/i,
  );
});

test("--help exits 0 and documents global and manual-local execution", () => {
  const cwd = mkdtempSync(join(tmpdir(), "md2vid-help-cwd-"));
  try {
    const result = spawnSync(process.execPath, [BIN, "--help"], {
      cwd,
      encoding: "utf8",
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /npm install -g md2vid/);
    assert.match(result.stdout, /md2vid install-skill/);
    assert.match(result.stdout, /npx --yes=false md2vid/);
    assert.doesNotMatch(result.stdout, /npx --no md2vid/);
    assert.match(result.stdout, /Node\.js >=22\.18/);
    for (const command of ["new", "build", "regroup", "transcribe", "verify", "hyperframes", "patch-studio", "install-skill"]) {
      assert.match(result.stdout, new RegExp(`\\b${command}\\b`));
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("--help lists the package-owned HyperFrames proxy", () => {
  const result = runBin(["--help"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /hyperframes <command> \[args\]/);
});

test("hyperframes forwards arguments to the package-owned 0.7.26 CLI", () => {
  const result = runBin(["hyperframes", "--version"], tmpdir());
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), "0.7.26");
});

test("package-owned preview help documents the allocated-port option", () => {
  const result = runBin(["hyperframes", "preview", "--help"], tmpdir());
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /--port\b/);
});

test("--version resolves package metadata from an unrelated cwd", () => {
  const cwd = mkdtempSync(join(tmpdir(), "md2vid-version-cwd-"));
  try {
    const result = spawnSync(process.execPath, [BIN, "--version"], { cwd, encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), PACKAGE_VERSION);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("package metadata resolves from compiled depth in a temporary package tree", () => {
  const packageRoot = mkdtempSync(join(tmpdir(), "md2vid-compiled-package-"));
  const cwd = mkdtempSync(join(tmpdir(), "md2vid-compiled-cwd-"));
  const compiledBin = join(packageRoot, "dist", "bin", "md2vid.js");
  const expectedVersion = "9.8.7-test";
  try {
    mkdirSync(dirname(compiledBin), { recursive: true });
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "md2vid", version: expectedVersion }));
    writeFileSync(compiledBin, "// compiled entry placeholder\n");
    const script = [
      `import { readPackageMetadata } from ${JSON.stringify(pathToFileURL(PACKAGE_ROOT_HELPER).href)};`,
      `console.log(readPackageMetadata(${JSON.stringify(pathToFileURL(compiledBin).href)}).version);`,
    ].join("\n");
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expectedVersion);
  } finally {
    rmSync(packageRoot, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("build dispatches and works from an unrelated cwd", () => {
  const { tmp, output } = seedVideo();
  try {
    const r = runBin(["build", output], tmpdir());
    assert.equal(r.code, 0, r.stderr);
    assert.ok(existsSync(join(tmp, "shared", "cues.json")), "build emitted cues.json");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("local gsapSrc resolves to one served file from index captions and frames", async () => {
  const { tmp, output } = seedVideo();
  try {
    const gsapSrc = "runtime/custom-gsap.js";
    mkdirSync(join(output, "runtime"), { recursive: true });
    writeFileSync(join(output, gsapSrc), "CUSTOM GSAP\n");
    writeFileSync(
      join(output, "output.config.json"),
      `${JSON.stringify({ framework: "hyperframes", gsapSrc }, null, 2)}\n`,
    );

    const result = runBin(["build", output], tmpdir());
    assert.equal(result.code, 0, result.stderr);
    const framePath = join(output, "compositions", "frames", "01-local-runtime.html");
    writeFileSync(
      framePath,
      '<script src="../../runtime/custom-gsap.js"></script><script>gsap.timeline();</script>\n',
    );

    const documents = [
      { path: "index.html", body: readFileSync(join(output, "index.html"), "utf8") },
      {
        path: "compositions/captions.html",
        body: readFileSync(join(output, "compositions", "captions.html"), "utf8"),
      },
      {
        path: "compositions/frames/01-local-runtime.html",
        body: readFileSync(framePath, "utf8"),
      },
    ];

    await withStaticServer(output, async (baseUrl) => {
      for (const document of documents) {
        const match = document.body.match(/<script\s+src="([^"]*custom-gsap\.js)"/);
        assert.ok(match, `${document.path} must reference custom GSAP`);
        const response = await fetch(new URL(match[1], new URL(document.path, baseUrl)));
        assert.equal(response.status, 200, document.path);
        assert.equal(await response.text(), "CUSTOM GSAP\n", document.path);
      }
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("regroup forwards --max-chars", () => {
  const { tmp, output } = seedVideo();
  try {
    assert.equal(runBin(["build", output]).code, 0);
    const r = runBin(["regroup", output, "--max-chars", "54"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /max-chars 54/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("build forwards --captions-only", () => {
  const { tmp, output } = seedVideo();
  try {
    assert.equal(runBin(["build", output]).code, 0);
    const r = runBin(["build", output, "--captions-only"]);
    assert.equal(r.code, 0, r.stderr);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("new forwards --framework into a temp outputs root", () => {
  const root = mkdtempSync(join(tmpdir(), "router-new-"));
  try {
    const r = execFileSync("node", [BIN, "new", "router-demo", "--framework", "hyperframes"], {
      cwd: REPO_ROOT,
      env: { ...process.env, MD2VID_OUTPUTS_ROOT: root },
      encoding: "utf8",
      stdio: "pipe",
    });
    assert.match(r, /OK scaffolded/);
    const neutral = JSON.parse(readFileSync(join(root, "router-demo", "video.config.json"), "utf8"));
    const local = JSON.parse(readFileSync(join(root, "router-demo", "output.config.json"), "utf8"));
    assert.equal(neutral.framework, undefined);
    assert.equal(neutral.gsapSrc, undefined);
    assert.deepEqual(local, {
      framework: "hyperframes",
      gsapSrc: "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js",
    });
    assert.equal(existsSync(join(root, "router-demo", "assets", "gsap.min.js")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verify and transcribe dispatch", () => {
  const { tmp, output } = seedVideo();
  try {
    runBin(["build", output]);
    runBin(["regroup", output, "--max-chars", "54"]);
    assert.equal(runBin(["verify", output]).code, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  // transcribe on a bare dir fails cleanly (missing audio_meta.json)
  const bare = mkdtempSync(join(tmpdir(), "router-"));
  try {
    mkdirSync(join(bare, "hyperframes"), { recursive: true });
    assert.notEqual(runBin(["transcribe", join(bare, "hyperframes")]).code, 0);
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
});

test("patch-studio dispatches (idempotent, exit 0)", () => {
  assert.equal(runBin(["patch-studio"]).code, 0);
});

test("unknown subcommand prints usage to stderr and exits 2", () => {
  const r = runBin(["frobnicate"]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /Usage|usage/);
  assert.equal(r.stdout, "");
});

test("missing subcommand prints usage to stderr and exits 2", () => {
  const r = runBin([]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /Usage|usage/);
  assert.equal(r.stdout, "");
});

// A prototype member name (toString, constructor, …) must not dispatch —
// the dispatch table is guarded with Object.hasOwn, not the `in` operator.
test("a prototype member name exits 2, not dispatch", () => {
  const r = runBin(["toString"]);
  assert.equal(r.code, 2);
  assert.match(r.stderr + r.stdout, /Usage|usage/);
});

// An unknown --framework must surface a non-zero code, not hard-exit the
// process mid-dispatch (getAdapter throws; run() catches and returns 1).
test("unknown --framework returns non-zero, does not crash the router", () => {
  const root = mkdtempSync(join(tmpdir(), "router-new-"));
  try {
    const r = execFileSync("node", [BIN, "new", "bad-fw-demo", "--framework", "no-such-fw"], {
      cwd: REPO_ROOT,
      env: { ...process.env, MD2VID_OUTPUTS_ROOT: root },
      encoding: "utf8",
      stdio: "pipe",
    });
    assert.fail(`expected non-zero exit, got success: ${r}`);
  } catch (e: any) {
    assert.notEqual(e.status, 0);
    assert.notEqual(e.status, null, "process should exit with a code, not a signal");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install-skill dispatches through the router", () => {
  const home = mkdtempSync(join(tmpdir(), "router-home-"));
  try {
    const env = { ...process.env, CLAUDE_CONFIG_DIR: "", HOME: home, USERPROFILE: home };
    const output = execFileSync("node", [BIN, "install-skill"], {
      cwd: tmpdir(),
      env,
      encoding: "utf8",
      stdio: "pipe",
    });
    assert.match(output, /OK installed md2vid skill/);
    assert.ok(existsSync(join(home, ".claude", "skills", "md2vid", "SKILL.md")));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
