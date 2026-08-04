import assert from "node:assert/strict";
import type { SpawnSyncReturns } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  preflightHyperframesRender,
  runHyperframes,
} from "../../scripts/hyperframes_cli.ts";
import { HYPERFRAMES_VERSION } from "../../scripts/dependency_versions.ts";

function writeProject(options: {
  outputConfig?: unknown;
  mainFps?: string;
} = {}): string {
  const project = realpathSync(mkdtempSync(join(tmpdir(), "md2vid-render-policy-")));
  const mainFps = options.mainFps === undefined ? "30" : options.mainFps;
  writeFileSync(
    join(project, "index.html"),
    `<div data-composition-id="captions" data-fps="1"></div>\n` +
      `<div data-composition-id="main" data-fps="${mainFps}"></div>\n`,
  );
  if (options.outputConfig !== undefined) {
    writeFileSync(join(project, "output.config.json"), `${JSON.stringify(options.outputConfig, null, 2)}\n`);
  }
  return project;
}

function fakeInstallation(): { root: string; metaUrl: string; cliEntry: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "md2vid-render-policy-package-")));
  const modulePath = join(root, "scripts", "hyperframes_cli.ts");
  const packageRoot = join(root, "node_modules", "hyperframes");
  const cliEntry = join(packageRoot, "dist", "cli.js");
  const studio = join(packageRoot, "dist", "studio", "assets", "index-test.js");
  mkdirSync(dirname(modulePath), { recursive: true });
  mkdirSync(dirname(studio), { recursive: true });
  writeFileSync(modulePath, "// package resolution anchor\n");
  writeFileSync(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "hyperframes", version: HYPERFRAMES_VERSION, bin: { hyperframes: "dist/cli.js" } }),
  );
  writeFileSync(
    cliEntry,
    'const subCompositionHosts = trackedCompositionHosts.filter((host) => host.hasAttribute("data-composition-src"));\n',
  );
  writeFileSync(
    studio,
    "let l=!1;const c=()=>{if(Qn.getState().isEditMode||l)return;\nif(!g)return;l=!0;const A=g;fetch(\n",
  );
  return { root, metaUrl: pathToFileURL(modulePath).href, cliEntry };
}

function spawnResult(status = 0): SpawnSyncReturns<Buffer> {
  return {
    pid: 1,
    output: [null, Buffer.alloc(0), Buffer.alloc(0)],
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
    status,
    signal: null,
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

function expectedOutput(project: string, output: string): string {
  return isAbsolute(output) ? output : resolve(project, output);
}

test("final render defaults to 30 FPS and main composition FPS is the fallback", () => {
  const project = writeProject({ mainFps: "24" });
  try {
    const result = preflightHyperframesRender(["render", "--output", "renders/video.mp4"], project);
    assert.deepEqual(result.policy, {
      profile: "final",
      fps: 24,
      minimumFinalFps: 24,
      lowFpsOverride: false,
      outputPath: join(project, "renders/video.mp4"),
    });

    writeFileSync(join(project, "index.html"), '<div data-composition-id="main"></div>\n');
    const defaultResult = preflightHyperframesRender(["render", "--output", "renders/video.mp4"], project);
    assert.equal(defaultResult.policy.fps, 30);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("CLI profile and FPS take precedence over output config and main root", () => {
  const project = writeProject({
    mainFps: "24",
    outputConfig: { framework: "hyperframes", render: { profile: "gif", fps: 15, minimumFinalFps: 30 } },
  });
  try {
    const result = preflightHyperframesRender([
      "render", "--profile", "draft", "--fps=60", "--output=renders/draft.mov",
    ], project);
    assert.deepEqual(result.policy, {
      profile: "draft",
      fps: 60,
      minimumFinalFps: 30,
      lowFpsOverride: false,
      outputPath: join(project, "renders/draft.mov"),
    });
    assert.deepEqual(result.forwardedArgs, ["render", "--fps=60", "--output=renders/draft.mov"]);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("output config controls profile and FPS when flags are absent", () => {
  const project = writeProject({
    mainFps: "60",
    outputConfig: { framework: "hyperframes", render: { profile: "draft", fps: 12, minimumFinalFps: 24 } },
  });
  try {
    const result = preflightHyperframesRender(["render", "--output", "renders/draft.mp4"], project);
    assert.equal(result.policy.profile, "draft");
    assert.equal(result.policy.fps, 12);
    assert.equal(result.policy.minimumFinalFps, 24);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("preflight consumes md2vid-only flags without changing HyperFrames quality or literal arguments", () => {
  const project = writeProject();
  try {
    const result = preflightHyperframesRender([
      "render", "--profile", "draft", "--allow-low-fps", "--quality", "draft",
      "--fps", "12", "--output", "render $(literal).mp4", "--literal=$(not-a-shell)",
    ], project);
    assert.equal(result.policy.profile, "draft");
    assert.equal(result.policy.fps, 12);
    assert.equal(result.policy.lowFpsOverride, true);
    assert.deepEqual(result.forwardedArgs, [
      "render", "--quality", "draft", "--fps", "12", "--output", "render $(literal).mp4", "--literal=$(not-a-shell)",
    ]);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("preflight rejects invalid profile, FPS, and a minimum final FPS below the fixed floor", () => {
  const project = writeProject();
  try {
    assert.throws(
      () => preflightHyperframesRender(["render", "--profile", "preview"], project),
      /profile.*final.*draft.*gif/i,
    );
    assert.throws(
      () => preflightHyperframesRender(["render", "--fps", "0"], project),
      /FPS.*finite positive/i,
    );
    assert.throws(
      () => preflightHyperframesRender(["render", "--fps=Infinity"], project),
      /FPS.*finite positive/i,
    );

    writeFileSync(join(project, "output.config.json"), JSON.stringify({ render: { minimumFinalFps: 1 } }));
    assert.throws(
      () => preflightHyperframesRender(["render", "--fps", "12"], project),
      /render\.minimumFinalFps.*>= 24/,
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("invalid output render policy fails through runHyperframes before child spawn", () => {
  const project = writeProject({ outputConfig: { render: { minimumFinalFps: 1 } } });
  const installation = fakeInstallation();
  try {
    let spawned = false;
    const result = captureErrors(() => runHyperframes([
      "render", "--output", "renders/invalid-policy.mp4", "--fps", "12",
    ], {
      cwd: project,
      metaUrl: installation.metaUrl,
      spawn() {
        spawned = true;
        return spawnResult();
      },
    }));
    assert.equal(result.status, 1);
    assert.equal(spawned, false);
    assert.match(result.errors.join("\n"), /render\.minimumFinalFps.*>= 24/);
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(installation.root, { recursive: true, force: true });
  }
});

test("preflight preserves all HyperFrames FPS spellings and normalizes rational values", () => {
  const project = writeProject();
  try {
    const shortForm = preflightHyperframesRender([
      "render", "-f=30000/1001", "--output", "renders/rational.mp4",
    ], project);
    assert.equal(shortForm.policy.fps, 30000 / 1001);
    assert.deepEqual(shortForm.forwardedArgs, [
      "render", "-f=30000/1001", "--output", "renders/rational.mp4",
    ]);

    assert.throws(
      () => preflightHyperframesRender([
        "render", "--fps=24000/1001", "--output", "renders/low-rational.mp4",
      ], project),
      /effective final-render FPS is .*; minimum is 24/,
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("rational FPS success records the normalized numeric policy value", () => {
  const project = writeProject();
  const installation = fakeInstallation();
  try {
    const output = "renders/rational.mp4";
    assert.equal(runHyperframes([
      "render", "--fps=30000/1001", "--output", output,
    ], {
      cwd: project,
      metaUrl: installation.metaUrl,
      spawn: () => spawnResult(),
    }), 0);
    assert.equal(
      JSON.parse(readFileSync(`${expectedOutput(project, output)}.md2vid-render.json`, "utf8")).fps,
      30000 / 1001,
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(installation.root, { recursive: true, force: true });
  }
});

test("final MP4 and MOV reject low FPS before child spawn but draft and GIF allow it", () => {
  const project = writeProject();
  const installation = fakeInstallation();
  try {
    for (const output of ["renders/video.mp4", "renders/video.mov"]) {
      let spawned = false;
      const result = captureErrors(() => runHyperframes(
        ["render", "--output", output, "--fps", "12"],
        {
          cwd: project,
          metaUrl: installation.metaUrl,
          spawn() {
            spawned = true;
            return spawnResult();
          },
        },
      ));
      assert.equal(result.status, 1);
      assert.equal(spawned, false);
      assert.match(result.errors.join("\n"), /effective final-render FPS is 12; minimum is 24/);
    }

    for (const profile of ["draft", "gif"] as const) {
      let spawned = false;
      const status = runHyperframes(
        ["render", "--profile", profile, "--output", `renders/${profile}.mp4`, "--fps", "12"],
        {
          cwd: project,
          metaUrl: installation.metaUrl,
          spawn() {
            spawned = true;
            return spawnResult();
          },
        },
      );
      assert.equal(status, 0);
      assert.equal(spawned, true);
    }
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(installation.root, { recursive: true, force: true });
  }
});

test("short FPS flags enforce the final floor before spawn and preserve accepted literals", () => {
  const project = writeProject();
  const installation = fakeInstallation();
  try {
    let spawned = false;
    const rejected = captureErrors(() => runHyperframes([
      "render", "-f", "12", "--output", "renders/short.mp4",
    ], {
      cwd: project,
      metaUrl: installation.metaUrl,
      spawn() {
        spawned = true;
        return spawnResult();
      },
    }));
    assert.equal(rejected.status, 1);
    assert.equal(spawned, false);
    assert.match(rejected.errors.join("\n"), /effective final-render FPS is 12; minimum is 24/);

    let forwarded: readonly string[] | undefined;
    assert.equal(runHyperframes([
      "render", "-f", "24", "--output", "renders/short-ok.mp4",
    ], {
      cwd: project,
      metaUrl: installation.metaUrl,
      spawn(_command, args) {
        forwarded = args;
        return spawnResult();
      },
    }), 0);
    assert.deepEqual(forwarded, [installation.cliEntry, "render", "-f", "24", "--output", "renders/short-ok.mp4"]);
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(installation.root, { recursive: true, force: true });
  }
});

test("effective render format, not the output suffix, decides final FPS enforcement", () => {
  const project = writeProject();
  const installation = fakeInstallation();
  try {
    for (const formatArgs of [
      ["--format", "mov"],
      ["--format=mov"],
      [],
    ]) {
      let spawned = false;
      const result = captureErrors(() => runHyperframes([
        "render", ...formatArgs, "--output", "renders/misleading.gif", "--fps", "12",
      ], {
        cwd: project,
        metaUrl: installation.metaUrl,
        spawn() {
          spawned = true;
          return spawnResult();
        },
      }));
      assert.equal(result.status, 1, `format ${formatArgs.join(" ") || "mp4 default"}`);
      assert.equal(spawned, false, `format ${formatArgs.join(" ") || "mp4 default"}`);
    }

    for (const formatArgs of [
      ["--format", "gif"],
      ["--format=png-sequence"],
    ]) {
      let forwarded: readonly string[] | undefined;
      assert.equal(runHyperframes([
        "render", ...formatArgs, "--output", "renders/misleading.mp4", "--fps", "12",
      ], {
        cwd: project,
        metaUrl: installation.metaUrl,
        spawn(_command, args) {
          forwarded = args;
          return spawnResult();
        },
      }), 0);
      assert.deepEqual(forwarded, [
        installation.cliEntry, "render", ...formatArgs, "--output", "renders/misleading.mp4", "--fps", "12",
      ]);
    }
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(installation.root, { recursive: true, force: true });
  }
});

test("final FPS floor allows 24, 30, 60, stricter configured minimums, and intentional overrides", () => {
  const project = writeProject({ outputConfig: { render: { minimumFinalFps: 30 } } });
  const installation = fakeInstallation();
  try {
    for (const fps of [30, 60]) {
      let spawned = false;
      assert.equal(runHyperframes(["render", "--output", "renders/video.mp4", "--fps", String(fps)], {
        cwd: project,
        metaUrl: installation.metaUrl,
        spawn() {
          spawned = true;
          return spawnResult();
        },
      }), 0);
      assert.equal(spawned, true);
    }

    let spawned = false;
    assert.equal(runHyperframes([
      "render", "--output", "renders/override.mp4", "--fps", "12", "--allow-low-fps",
    ], {
      cwd: project,
      metaUrl: installation.metaUrl,
      spawn() {
        spawned = true;
        return spawnResult();
      },
    }), 0);
    assert.equal(spawned, true);

    const floorProject = writeProject();
    try {
      for (const fps of [24, 30, 60]) {
        assert.equal(preflightHyperframesRender(["render", "--fps", String(fps)], floorProject).policy.fps, fps);
      }
    } finally {
      rmSync(floorProject, { recursive: true, force: true });
    }
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(installation.root, { recursive: true, force: true });
  }
});

test("successful known-output renders write an atomic policy manifest and failures do not", () => {
  const project = writeProject();
  const installation = fakeInstallation();
  try {
    const failedOutput = "renders/failed.mp4";
    assert.equal(runHyperframes(["render", "--output", failedOutput], {
      cwd: project,
      metaUrl: installation.metaUrl,
      spawn: () => spawnResult(2),
    }), 2);
    assert.equal(existsSync(`${expectedOutput(project, failedOutput)}.md2vid-render.json`), false);

    const output = "renders/final.mp4";
    mkdirSync(join(project, "renders"), { recursive: true });
    assert.equal(runHyperframes(["render", "-o", output, "--fps", "30"], {
      cwd: project,
      metaUrl: installation.metaUrl,
      spawn: () => spawnResult(),
    }), 0);
    const manifestPath = `${expectedOutput(project, output)}.md2vid-render.json`;
    assert.deepEqual(JSON.parse(readFileSync(manifestPath, "utf8")), {
      version: 1,
      profile: "final",
      fps: 30,
      minimumFps: 24,
      lowFpsOverride: false,
    });
    assert.equal(
      readdirSync(join(project, "renders")).some((name) => name.includes("md2vid-render") && name !== "final.mp4.md2vid-render.json"),
      false,
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(installation.root, { recursive: true, force: true });
  }
});

test("manifest promotion failure preserves the destination and cleans its staging directory", () => {
  const project = writeProject();
  const installation = fakeInstallation();
  try {
    const output = "renders/blocked.mp4";
    const manifestPath = `${expectedOutput(project, output)}.md2vid-render.json`;
    mkdirSync(manifestPath, { recursive: true });

    const result = captureErrors(() => runHyperframes(["render", "--output", output, "--fps", "30"], {
      cwd: project,
      metaUrl: installation.metaUrl,
      spawn: () => spawnResult(),
    }));

    assert.equal(result.status, 1);
    assert.match(result.errors.join("\n"), /failed to write render manifest/);
    assert.deepEqual(readdirSync(manifestPath), []);
    assert.equal(
      readdirSync(join(project, "renders")).some((name) => name.includes(".md2vid-render.json.stage-")),
      false,
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(installation.root, { recursive: true, force: true });
  }
});

test("unknown output and non-render invocations preserve pass-through behavior without manifests", () => {
  const project = writeProject();
  const installation = fakeInstallation();
  try {
    let renderArgs: readonly string[] | undefined;
    assert.equal(runHyperframes(["render", "--fps", "30"], {
      cwd: project,
      metaUrl: installation.metaUrl,
      spawn(_command, args) {
        renderArgs = args;
        return spawnResult();
      },
    }), 0);
    assert.deepEqual(renderArgs, [installation.cliEntry, "render", "--fps", "30"]);
    assert.equal(readdirSync(project).some((name) => name.endsWith(".md2vid-render.json")), false);

    let lintArgs: readonly string[] | undefined;
    assert.equal(runHyperframes(["lint", "--profile", "draft", "--allow-low-fps", "--quality", "draft"], {
      cwd: project,
      metaUrl: installation.metaUrl,
      spawn(_command, args) {
        lintArgs = args;
        return spawnResult();
      },
    }), 0);
    assert.deepEqual(lintArgs, [
      installation.cliEntry, "lint", "--profile", "draft", "--allow-low-fps", "--quality", "draft",
    ]);
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(installation.root, { recursive: true, force: true });
  }
});
