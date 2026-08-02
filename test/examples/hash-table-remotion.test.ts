import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { ensureRuntime } from "../../frameworks/remotion/scaffold.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXAMPLE = join(REPO_ROOT, "examples", "hash-table", "remotion");
const EXPECTED_SCENES = [
  "CoverScene",
  "CoreIdeaScene",
  "LookupFlowScene",
  "CollisionsScene",
  "LoadFactorScene",
  "WhyMattersScene",
  "RecapScene",
];
const COPY_VIDEO = "cp ../examples/hash-table/remotion/src/Video.tsx src/Video.tsx";
const COPY_SCENES = "cp -R ../examples/hash-table/remotion/src/scenes src/";
const COPY_BINDINGS = "cp ../examples/hash-table/remotion/visual_bindings.json .";
const EXPECTED_STEPS = [
  "1. `md2vid new hash-table --framework remotion`",
  "2. `cd hash-table`",
  "3. `npm install`",
  `4. \`${COPY_VIDEO}\``,
  `5. \`${COPY_SCENES}\``,
  `6. \`${COPY_BINDINGS}\``,
  "7. Review `../examples/hash-table/remotion/video.config.json` and merge its mappings into `video.config.json`; do not overwrite the project config.",
  "8. Generate narration matching the example IDs.",
  "9. After narration and transcription, author or merge compatible neutral `visual_beats.json` entries before `npm run plan`.",
  "10. `npm run build`",
  "11. `npm run check`",
  "12. `npm run still` or `npm run studio`",
].join("\n");

test("hash-table Remotion example retains all scene routes", () => {
  const video = readFileSync(join(EXAMPLE, "src", "Video.tsx"), "utf8");
  for (const scene of EXPECTED_SCENES) {
    assert.match(video, new RegExp(scene));
    assert.equal(existsSync(join(EXAMPLE, "src", "scenes", `${scene}.tsx`)), true);
  }
  for (const slug of [
    "01-cover",
    "02-core-idea",
    "03-lookup-flow",
    "04-collisions",
    "05-load-factor",
    "06-why-matters",
    "07-recap",
  ]) {
    assert.match(video, new RegExp(JSON.stringify(slug)));
  }
});

test("hash-table Remotion lookup flow uses unique static beat bindings", () => {
  const scene = readFileSync(join(EXAMPLE, "src", "scenes", "LookupFlowScene.tsx"), "utf8");
  assert.doesNotMatch(scene, /const CUES\s*=\s*\[/);
  for (const target of ["LookupFlow:probe", "LookupFlow:match", "LookupFlow:return"]) {
    assert.match(scene, new RegExp(`useVisualBeatProgress\\(${JSON.stringify(target)}\\)`));
  }

  const registryPath = join(EXAMPLE, "visual_bindings.json");
  assert.equal(existsSync(registryPath), true);
  const registry = JSON.parse(readFileSync(registryPath, "utf8")) as {
    frames: Record<string, Array<{ beat: string; target: string }>>;
  };
  const bindings = registry.frames["03-lookup-flow"];
  assert.deepEqual(bindings.map((binding) => binding.beat), ["lookup-probe", "lookup-match", "lookup-return"]);
  assert.deepEqual(bindings.map((binding) => binding.target), ["LookupFlow:probe", "LookupFlow:match", "LookupFlow:return"]);
  assert.equal(new Set(bindings.map((binding) => binding.target)).size, bindings.length);

  const readme = readFileSync(join(EXAMPLE, "README.md"), "utf8");
  assert.match(readme, /cp .*visual_bindings\.json \./);
  assert.match(readme, /visual_beats\.json/);
  assert.match(readme, /after narration.*transcript|after transcription/i);
  for (const beat of bindings.map((binding) => binding.beat)) {
    assert.match(readme, new RegExp(`id.*${beat}`));
  }
});

test("hash-table Remotion example stays public but excluded from the npm package", () => {
  const packageFiles = (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
    files: string[];
  }).files;
  assert.equal(packageFiles.some((path) => path === "examples" || path.startsWith("examples/")), false);
});

test("hash-table Remotion example ships exact configs and safe overlay instructions", () => {
  assert.deepEqual(JSON.parse(readFileSync(join(EXAMPLE, "video.config.json"), "utf8")), {
    timing: { tail: 0.5, xfade: 0.5, gap: 0.5 },
    visualSync: { mode: "required" },
    canvas: { width: 1920, height: 1080 },
    slugs: {
      cover: "01-cover",
      core: "02-core-idea",
      lookup: "03-lookup-flow",
      collisions: "04-collisions",
      "load-factor": "05-load-factor",
      why: "06-why-matters",
      recap: "07-recap",
    },
  });
  assert.deepEqual(JSON.parse(readFileSync(join(EXAMPLE, "output.config.json"), "utf8")), {
    framework: "remotion",
  });

  const readme = readFileSync(join(EXAMPLE, "README.md"), "utf8");
  assert.match(readme, new RegExp(EXPECTED_STEPS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(readme, /opt-in/i);
  assert.match(readme, /available from a clone of the public md2vid repository/i);
  assert.match(readme, /not included in the npm package/i);
  assert.match(readme, /existing authored files must be reviewed before replacement/i);
});

test("README copy commands overlay a repo-root scaffold without touching unrelated files or config", () => {
  const checkout = mkdtempSync(join(tmpdir(), "hash-table-overlay-"));
  const project = join(checkout, "hash-table");
  try {
    cpSync(EXAMPLE, join(checkout, "examples", "hash-table", "remotion"), { recursive: true });
    ensureRuntime(project, "hash-table");
    const sentinel = join(project, "src", "custom.tsx");
    const config = join(project, "video.config.json");
    mkdirSync(dirname(sentinel), { recursive: true });
    writeFileSync(sentinel, "// unrelated authored file\n");
    writeFileSync(config, "{\"custom\":true}\n");

    execFileSync("sh", ["-c", COPY_VIDEO], { cwd: project });
    execFileSync("sh", ["-c", COPY_SCENES], { cwd: project });
    execFileSync("sh", ["-c", COPY_BINDINGS], { cwd: project });

    assert.equal(readFileSync(sentinel, "utf8"), "// unrelated authored file\n");
    assert.equal(readFileSync(config, "utf8"), "{\"custom\":true}\n");
    assert.equal(
      readFileSync(join(project, "src", "Video.tsx"), "utf8"),
      readFileSync(join(EXAMPLE, "src", "Video.tsx"), "utf8"),
    );
    assert.equal(
      readFileSync(join(project, "visual_bindings.json"), "utf8"),
      readFileSync(join(EXAMPLE, "visual_bindings.json"), "utf8"),
    );
    for (const scene of EXPECTED_SCENES) {
      assert.equal(existsSync(join(project, "src", "scenes", `${scene}.tsx`)), true);
    }
  } finally {
    rmSync(checkout, { recursive: true, force: true });
  }
});
