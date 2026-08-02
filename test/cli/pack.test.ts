import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  FORBIDDEN_PACKED_FILES,
  FORBIDDEN_PACKED_PREFIXES,
  NARRATION_PACKED_FILES,
  REQUIRED_PACKED_FILES,
} from "../release/manifest.ts";

function packedFiles(root: string, relativeRoot = ""): Set<string> {
  const paths = new Set<string>();
  const directory = join(root, relativeRoot);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = join(relativeRoot, entry.name);
    if (entry.isDirectory()) {
      for (const nested of packedFiles(root, relativePath)) paths.add(nested);
    } else {
      paths.add(relativePath);
    }
  }
  return paths;
}

const PRODUCTION_AUDIO_RUNNERS = [
  "dist/scripts/audio.js",
  "dist/scripts/audio.mjs",
  "dist/scripts/audio.cjs",
] as const;

function assertNoProductionAudioRunners(paths: ReadonlySet<string>): void {
  for (const path of PRODUCTION_AUDIO_RUNNERS) {
    assert.equal(paths.has(path), false, `forbidden packed production audio runner ${path}`);
  }
}

test("release package manifest covers executable, assets, postinstall, and all references", () => {
  assert.ok(REQUIRED_PACKED_FILES.includes("dist/bin/md2vid.js"));
  assert.ok(REQUIRED_PACKED_FILES.includes("postinstall.mjs"));
  assert.ok(REQUIRED_PACKED_FILES.includes("dist/scripts/check_release_name.js"));
  for (const helper of [
    "dist/scripts/cli_args.js",
    "dist/scripts/project_layout.js",
    "dist/scripts/managed_file_transaction.js",
    "dist/scripts/upgrade.js",
    "dist/scripts/plan.js",
    "dist/scripts/plan_project.js",
    "dist/engine/visual_beats.js",
    "dist/engine/visual_sync.js",
    "dist/frameworks/hyperframes/visual_timing.js",
    "dist/frameworks/remotion/visual_bindings.js",
    "dist/frameworks/remotion/templates/src/VisualBeats.tsx",
    "scripts/dependency_versions.ts",
    "scripts/package_root.ts",
  ]) {
    assert.ok(REQUIRED_PACKED_FILES.some((path) => path === helper), `missing packaged helper ${helper}`);
  }
  for (const path of NARRATION_PACKED_FILES) {
    assert.ok(REQUIRED_PACKED_FILES.includes(path), `missing packaged narration artifact ${path}`);
  }
  assert.ok(REQUIRED_PACKED_FILES.includes("README.md"));
  assert.ok(REQUIRED_PACKED_FILES.includes("LICENSE"));
  assert.equal(REQUIRED_PACKED_FILES.filter((path) => path.startsWith("skill/md2vid/references/standards/")).length, 7);
  assert.deepEqual(FORBIDDEN_PACKED_PREFIXES, [
    "outputs/",
    "test/",
    "node_modules/",
    "docs/superpowers/",
    "examples/",
    "frameworks/hyperframes/templates/",
  ]);
  const removedGsapVendorFile = ["vendor", ["gsap", "min", "js"].join(".")].join("/");
  assert.deepEqual(FORBIDDEN_PACKED_FILES, [
    `frameworks/hyperframes/templates/${removedGsapVendorFile}`,
    `dist/frameworks/hyperframes/templates/${removedGsapVendorFile}`,
  ]);
});

test("production audio runner variants are rejected from packed output", () => {
  for (const path of PRODUCTION_AUDIO_RUNNERS) {
    assert.throws(() => assertNoProductionAudioRunners(new Set([path])), /forbidden packed production audio runner/);
  }
  assert.doesNotThrow(() => assertNoProductionAudioRunners(new Set(["skill/md2vid/SKILL.md"])));
});

test("packed source scaffold adapters import and execute from an unrelated cwd", () => {
  const root = resolve(import.meta.dirname, "..", "..");
  const temporary = mkdtempSync(join(tmpdir(), "md2vid-packed-source-adapters-"));
  const isolatedRoot = join(temporary, "repository");
  const packed = join(temporary, "packed");
  mkdirSync(packed);
  try {
    cpSync(root, isolatedRoot, {
      recursive: true,
      filter(source) {
        const path = relative(root, source);
        const top = path.split(/[\\/]/, 1)[0];
        return ![".git", ".claude", ".worktrees", "dist", "node_modules"].includes(top);
      },
    });
    symlinkSync(join(root, "node_modules"), join(isolatedRoot, "node_modules"), "dir");
    execFileSync(
      "corepack",
      ["npm", "pack", "--pack-destination", temporary],
      { cwd: isolatedRoot, encoding: "utf8", stdio: "pipe" },
    );
    const tarballs = readdirSync(temporary).filter((name) => name.endsWith(".tgz"));
    assert.equal(tarballs.length, 1, "npm pack must produce one tarball");
    execFileSync("tar", ["-xzf", join(temporary, tarballs[0]), "-C", temporary]);
    const packageRoot = join(temporary, "package");
    const paths = packedFiles(packageRoot);
    for (const required of NARRATION_PACKED_FILES) {
      assert.equal(paths.has(required), true, `missing packed narration artifact ${required}`);
    }
    assertNoProductionAudioRunners(paths);
    assert.match(readFileSync(join(packageRoot, "skill", "md2vid", "SKILL.md"), "utf8"), /\/media-use/);

    assert.equal(
      existsSync(join(packageRoot, "frameworks", "hyperframes", "templates")),
      false,
      "source HyperFrames templates must remain excluded",
    );
    for (const name of [
      "caption-skin.html",
      "frame-shell.html",
      "frame-template.html",
    ]) {
      const body = readFileSync(
        join(packageRoot, "dist", "frameworks", "hyperframes", "templates", name),
        "utf8",
      );
      assert.equal(body.includes("__MD2VID_GSAP_SRC__"), false, name);
    }

    const result = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { pathToFileURL } from "node:url";
         import { join } from "node:path";
         const root = process.argv[1];
         const [hyperframes, remotion] = await Promise.all([
           import(pathToFileURL(join(root, "frameworks/hyperframes/scaffold.ts")).href),
           import(pathToFileURL(join(root, "frameworks/remotion/scaffold.ts")).href),
         ]);
         const hf = hyperframes.scaffoldSpec("test");
         const rem = remotion.scaffoldSpec("test");
         process.stdout.write(JSON.stringify({
           gsapSrc: hf.outputConfig.gsapSrc,
           remotion: rem.dependencies.remotion,
         }));`,
        packageRoot,
      ],
      { cwd: packed, encoding: "utf8", stdio: "pipe" },
    );
    const executed = JSON.parse(result) as { gsapSrc?: unknown; remotion?: unknown };
    assert.equal(typeof executed.gsapSrc, "string");
    assert.equal(typeof executed.remotion, "string");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
