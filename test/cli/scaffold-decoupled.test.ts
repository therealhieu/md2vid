// scaffold-decoupled.test.ts — Tasks 1.1 + 1.2: a scaffolded project must carry
// ZERO repo-relative paths, so it builds from any cwd once md2vid is installed.
//
// HyperFrames (1.1): generated package.json scripts call `md2vid <cmd>` (not
// `node ../../scripts/*.ts`); CLAUDE.md/AGENTS.md @import a standard COPIED INTO
// the project (`.md2vid/standards/<fw>.md`), not `@../../docs/...`; the copied
// standard is byte-identical to the packaged source.
// Remotion (1.2): pins the "already decoupled" invariant — no repo-relative paths
// in any generated file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const NEW_VIDEO = join(REPO_ROOT, "scripts", "new_video.ts");
const DOCS_STANDARDS = join(REPO_ROOT, "docs", "standards", "frameworks");

const REPO_RELATIVE = /\.\.\/\.\.\/scripts|@\.\.\/\.\.\/docs/;

const HYPERFRAMES_NEXT_STEPS = [
  "review audio_request.json.example and generate narration",
  "author frames in compositions/frames/",
  "fill video.config.json voice-id -> frame-slug mappings",
  "npm run build",
  "npm run check",
  "npm run dev",
];

const REMOTION_NEXT_STEPS = [
  "npm install",
  "review audio_request.json.example and generate narration",
  "author and register src/scenes/*.tsx",
  "fill video.config.json voice-id -> frame-slug mappings",
  "npm run build",
  "npm run check",
  "npm run still or npm run studio",
];

function scaffold(slug: string, extraArgs: string[], outputsRoot: string) {
  return execFileSync("node", [NEW_VIDEO, slug, ...extraArgs], {
    cwd: REPO_ROOT,
    env: { ...process.env, MD2VID_OUTPUTS_ROOT: outputsRoot },
    encoding: "utf8",
    stdio: "pipe",
  });
}

// Read every generated file's body (recursively) so a grep for repo-relative
// paths covers the whole tree, not just the files we name.
function readTree(dir: string): { path: string; body: string }[] {
  const out: { path: string; body: string }[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...readTree(p));
    else out.push({ path: p, body: readFileSync(p, "utf8") });
  }
  return out;
}

test("HF scaffold: package.json calls md2vid, not node ../../scripts", () => {
  const root = mkdtempSync(join(tmpdir(), "decouple-"));
  try {
    scaffold("hf-decouple", [], root);
    const dir = join(root, "hf-decouple");
    const pkg = readFileSync(join(dir, "package.json"), "utf8");
    assert.match(pkg, /md2vid build \./, "build script uses `md2vid build .`");
    assert.doesNotMatch(pkg, /\.\.\/\.\.\/scripts/, "no repo-relative script paths");
    assert.match(pkg, /md2vid transcribe \./, "transcribe uses `md2vid transcribe .`");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generated HyperFrames package scripts contain no executable npx hyperframes", () => {
  const root = mkdtempSync(join(tmpdir(), "md2vid-hf-proxy-"));
  try {
    scaffold("hf-proxy", [], root);
    const pkg = JSON.parse(readFileSync(join(root, "hf-proxy", "package.json"), "utf8"));
    assert.equal(JSON.stringify(pkg.scripts).includes("npx hyperframes"), false);
    assert.equal(pkg.scripts.dev, "md2vid hyperframes preview --no-open");
    assert.equal(pkg.scripts.render, "md2vid hyperframes render");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("HF scaffold: CLAUDE.md/AGENTS.md @import the copied-in standard", () => {
  const root = mkdtempSync(join(tmpdir(), "decouple-"));
  try {
    scaffold("hf-import", [], root);
    const dir = join(root, "hf-import");
    for (const doc of ["CLAUDE.md", "AGENTS.md"]) {
      const body = readFileSync(join(dir, doc), "utf8");
      assert.match(body, /@\.md2vid\/standards\/hyperframes\.md/, `${doc} imports the copied standard`);
      assert.doesNotMatch(body, /@\.\.\/\.\.\/docs/, `${doc} has no repo-relative @import`);
    }
    // The standard travelled INTO the project and matches the packaged source byte-for-byte.
    const copied = join(dir, ".md2vid", "standards", "hyperframes.md");
    assert.ok(existsSync(copied), "standard copied into .md2vid/standards/");
    assert.equal(
      readFileSync(copied, "utf8"),
      readFileSync(join(DOCS_STANDARDS, "hyperframes.md"), "utf8"),
      "copied standard is byte-identical to the packaged source",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("HF scaffold: no file in the generated tree carries a repo-relative path", () => {
  const root = mkdtempSync(join(tmpdir(), "decouple-"));
  try {
    scaffold("hf-grep", [], root);
    const hits = readTree(join(root, "hf-grep")).filter((f) => REPO_RELATIVE.test(f.body));
    assert.equal(hits.length, 0, `repo-relative paths in: ${hits.map((h) => h.path).join(", ")}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("HF scaffold: runtime artifacts remain without local GSAP bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "decouple-"));
  try {
    scaffold("hf-artifacts", [], root);
    const dir = join(root, "hf-artifacts");
    for (const rel of [
      "meta.json",
      "hyperframes.json",
      "video.config.json",
      "caption-overrides.json",
      "assets",
      join(".hyperframes", "caption-skin.html"),
      join("compositions", "frames"),
    ]) {
      assert.ok(existsSync(join(dir, rel)), `scaffolder still writes ${rel}`);
    }
    assert.equal(existsSync(join(dir, "assets", "gsap.min.js")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The HF verifier must ACCEPT the copied-in @import form the scaffolder now emits
// (`.md2vid/standards/hyperframes.md`) — this is the load-bearing reason a scaffolded
// project passes `md2vid verify` in Phase 5. Without it, every scaffolded project
// would fail the doc-import check.
test("HF verify() accepts the copied-in @import (no doc-import finding)", async () => {
  const root = mkdtempSync(join(tmpdir(), "decouple-"));
  try {
    scaffold("hf-verify", [], root);
    const { verify } = await import("../../frameworks/hyperframes/verify.ts");
    const findings = verify(join(root, "hf-verify"));
    const docFindings = findings.filter((f) => /does not @import/.test(f.msg));
    assert.equal(docFindings.length, 0, `unexpected doc-import findings: ${JSON.stringify(docFindings)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Task 1.2 — pins the "already decoupled" invariant for Remotion so a future
// template edit can't regress it. The Remotion scaffolder copies static templates
// whose package.json runs `node render.ts` locally (no ../../scripts) and writes no
// CLAUDE.md/AGENTS.md, so nothing repo-relative is baked. If this ever fails, mirror
// Task 1.1's md2vid-call + copy-in fix in the Remotion template.
test("Remotion scaffold: no file in the generated tree carries a repo-relative path", () => {
  const root = mkdtempSync(join(tmpdir(), "decouple-"));
  try {
    scaffold("remotion-decouple", ["--framework", "remotion"], root);
    const hits = readTree(join(root, "remotion-decouple")).filter((f) => REPO_RELATIVE.test(f.body));
    assert.equal(hits.length, 0, `repo-relative paths in: ${hits.map((h) => h.path).join(", ")}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("canonical HyperFrames templates use the TS default GSAP source", async () => {
  const { DEFAULT_GSAP_SRC } = await import("../../frameworks/hyperframes/scaffold.ts");
  for (const name of ["caption-skin.html", "frame-shell.html", "frame-template.html"]) {
    const template = readFileSync(
      join(REPO_ROOT, "frameworks", "hyperframes", "templates", name),
      "utf8",
    );
    const gsapSources = [...template.matchAll(/<script\s+src="([^"]*gsap[^"]*)"/gi)]
      .map((match) => match[1]);
    assert.deepEqual(gsapSources, [DEFAULT_GSAP_SRC], `${name} GSAP source drifted`);
  }
  const emitSource = readFileSync(
    join(REPO_ROOT, "frameworks", "hyperframes", "emit.ts"),
    "utf8",
  );
  assert.equal(emitSource.includes(DEFAULT_GSAP_SRC), false, "emit must import the TS source of truth");
});

test("GSAP script helper maps project sources to document-relative escaped attributes", async () => {
  const scaffold = await import("../../frameworks/hyperframes/scaffold.ts") as Record<string, any>;
  assert.equal(typeof scaffold.gsapSrcForDocument, "function");
  assert.equal(typeof scaffold.gsapScriptSrcAttribute, "function");
  assert.equal(
    scaffold.gsapSrcForDocument(scaffold.DEFAULT_GSAP_SRC, "compositions/frames/01-frame.html"),
    scaffold.DEFAULT_GSAP_SRC,
  );
  assert.equal(scaffold.gsapSrcForDocument("runtime/custom-gsap.js", "index.html"), "runtime/custom-gsap.js");
  assert.equal(
    scaffold.gsapSrcForDocument("runtime/custom-gsap.js", "compositions/captions.html"),
    "../runtime/custom-gsap.js",
  );
  assert.equal(
    scaffold.gsapSrcForDocument("runtime/custom-gsap.js", "compositions/frames/01-frame.html"),
    "../../runtime/custom-gsap.js",
  );
  assert.equal(
    scaffold.gsapScriptSrcAttribute('runtime/a"&<>' + "'`" + ".js", "index.html"),
    "runtime/a&quot;&amp;&lt;&gt;&#39;&#96;.js",
  );
});

test("HyperFrames scaffoldSpec declares framework-local config and proxy scripts", async () => {
  const { scaffoldSpec } = await import("../../frameworks/hyperframes/scaffold.ts");
  assert.deepEqual(scaffoldSpec("ignored"), {
    outputConfig: {
      framework: "hyperframes",
      gsapSrc: "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js",
    },
    frameworkCheck: "md2vid hyperframes lint && md2vid hyperframes validate && md2vid hyperframes inspect",
    packageScripts: {
      dev: "md2vid hyperframes preview --no-open",
      render: "md2vid hyperframes render",
      publish: "md2vid hyperframes publish",
    },
    nextSteps: HYPERFRAMES_NEXT_STEPS,
  });
});

test("HyperFrames ensureRuntime preserves authored frames and existing runtime files", async () => {
  const { ensureRuntime } = await import("../../frameworks/hyperframes/scaffold.ts");
  const root = mkdtempSync(join(tmpdir(), "hyperframes-runtime-"));
  try {
    const frame = join(root, "compositions", "frames", "01-authored.html");
    const config = join(root, "hyperframes.json");
    const gsap = join(root, "assets", "gsap.min.js");
    mkdirSync(dirname(frame), { recursive: true });
    mkdirSync(dirname(gsap), { recursive: true });
    writeFileSync(frame, "authored frame\n");
    writeFileSync(config, "custom runtime\n");
    writeFileSync(gsap, "custom gsap\n");

    ensureRuntime(root, "demo");
    ensureRuntime(root, "demo");

    assert.equal(readFileSync(frame, "utf8"), "authored frame\n");
    assert.equal(readFileSync(config, "utf8"), "custom runtime\n");
    assert.equal(readFileSync(gsap, "utf8"), "custom gsap\n");
    assert.ok(existsSync(join(root, "caption-overrides.json")));
    assert.ok(existsSync(join(root, ".hyperframes", "caption-skin.html")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Remotion scaffoldSpec is the sole exact package manifest source", async () => {
  assert.equal(
    existsSync(join(REPO_ROOT, "frameworks", "remotion", "templates", "package.json")),
    false,
    "the deleted template manifest must not return",
  );
  const { scaffoldSpec } = await import("../../frameworks/remotion/scaffold.ts");
  assert.deepEqual(scaffoldSpec("ignored"), {
    outputConfig: { framework: "remotion" },
    frameworkCheck: "tsc --noEmit -p tsconfig.json",
    packageScripts: {
      studio: "remotion studio src/index.ts",
      render: "node render.ts",
      still: "node render.ts --still",
      typecheck: "tsc --noEmit -p tsconfig.json",
    },
    dependencies: {
      "@remotion/bundler": "4.0.486",
      "@remotion/cli": "4.0.486",
      "@remotion/google-fonts": "4.0.486",
      "@remotion/media": "4.0.486",
      "@remotion/renderer": "4.0.486",
      remotion: "4.0.486",
      react: "19.0.0",
      "react-dom": "19.0.0",
    },
    devDependencies: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      typescript: "^5.7.0",
    },
    nextSteps: REMOTION_NEXT_STEPS,
  });
});

test("generated framework package scripts expose verified workflows", () => {
  const expected = {
    hyperframes: {
      build: "md2vid build . && md2vid regroup . --max-chars 54",
      transcribe: "md2vid transcribe .",
      verify: "md2vid verify .",
      check: "md2vid verify . && md2vid hyperframes lint && md2vid hyperframes validate && md2vid hyperframes inspect",
      dev: "md2vid hyperframes preview --no-open",
      publish: "md2vid hyperframes publish",
      render: "md2vid hyperframes render",
    },
    remotion: {
      build: "md2vid build . && md2vid regroup . --max-chars 54",
      transcribe: "md2vid transcribe .",
      verify: "md2vid verify .",
      check: "md2vid verify . && tsc --noEmit -p tsconfig.json",
      render: "node render.ts",
      still: "node render.ts --still",
      studio: "remotion studio src/index.ts",
      typecheck: "tsc --noEmit -p tsconfig.json",
    },
  } as const;

  const root = mkdtempSync(join(tmpdir(), "verified-package-scripts-"));
  try {
    for (const framework of ["hyperframes", "remotion"] as const) {
      const slug = `verified-${framework}`;
      scaffold(slug, ["--framework", framework], root);
      const pkg = JSON.parse(readFileSync(join(root, slug, "package.json"), "utf8"));
      assert.deepEqual(pkg.scripts, expected[framework]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Remotion ensureRuntime recursively fills missing templates without overwriting authored src", async () => {
  const { ensureRuntime } = await import("../../frameworks/remotion/scaffold.ts");
  const root = mkdtempSync(join(tmpdir(), "remotion-runtime-"));
  try {
    const authored = join(root, "src", "Root.tsx");
    const customScene = join(root, "src", "scenes", "CustomScene.tsx");
    mkdirSync(dirname(customScene), { recursive: true });
    writeFileSync(authored, "// authored root\n");
    writeFileSync(customScene, "// authored scene\n");

    ensureRuntime(root, "demo");
    ensureRuntime(root, "demo");

    assert.equal(readFileSync(authored, "utf8"), "// authored root\n");
    assert.equal(readFileSync(customScene, "utf8"), "// authored scene\n");
    for (const rel of [
      "render.ts",
      "remotion.config.ts",
      "tsconfig.json",
      ".gitignore",
      join("src", "index.ts"),
      join("src", "Video.tsx"),
    ]) {
      assert.ok(existsSync(join(root, rel)), `runtime wrote missing ${rel}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const framework of ["hyperframes", "remotion"] as const) {
  test(`${framework} new project has complete neutral common and framework runtime contracts`, () => {
    const root = mkdtempSync(join(tmpdir(), `complete-${framework}-`));
    try {
      scaffold(`complete-${framework}`, ["--framework", framework], root);
      const dir = join(root, `complete-${framework}`);
      const neutral = JSON.parse(readFileSync(join(dir, "video.config.json"), "utf8"));
      const local = JSON.parse(readFileSync(join(dir, "output.config.json"), "utf8"));
      assert.deepEqual(Object.keys(neutral), ["$comment", "timing", "canvas", "slugs"]);
      assert.equal(neutral.framework, undefined);
      assert.equal(neutral.gsapSrc, undefined);
      assert.equal(local.framework, framework);
      for (const rel of [
        "meta.json",
        "package.json",
        "audio_request.json.example",
        "video.config.json",
        "output.config.json",
        "CLAUDE.md",
        "AGENTS.md",
        join(".md2vid", "standards", `${framework}.md`),
      ]) {
        assert.ok(existsSync(join(dir, rel)), `common contract includes ${rel}`);
      }
      const runtime = framework === "hyperframes"
        ? [
            "hyperframes.json",
            "caption-overrides.json",
            "assets",
            join(".hyperframes", "caption-skin.html"),
            join("compositions", "frames"),
          ]
        : [
            "render.ts",
            "remotion.config.ts",
            "tsconfig.json",
            ".gitignore",
            join("src", "index.ts"),
            join("src", "Root.tsx"),
            join("src", "Video.tsx"),
          ];
      for (const rel of runtime) assert.ok(existsSync(join(dir, rel)), `runtime contract includes ${rel}`);
      if (framework === "hyperframes") {
        assert.equal(existsSync(join(dir, "assets", "gsap.min.js")), false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

for (const [framework, nextSteps] of [
  ["hyperframes", HYPERFRAMES_NEXT_STEPS],
  ["remotion", REMOTION_NEXT_STEPS],
] as const) {
  test(`${framework} new prints adapter-owned next steps only after successful promotion`, () => {
    const root = mkdtempSync(join(tmpdir(), `truthful-next-${framework}-`));
    const slug = `truthful-${framework}`;
    try {
      const output = scaffold(slug, ["--framework", framework], root);
      const escapedDestination = join(root, slug).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(output, new RegExp(`OK scaffolded ${escapedDestination}`));
      assert.match(
        output,
        new RegExp(`Next:\\n${nextSteps.map((step, index) => `  ${index + 1}\\. ${step.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).join("\\n")}`),
      );
      assert.doesNotMatch(output, /frameworks\/(?:hyperframes|remotion)\/templates/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("new refuses existing destinations for both frameworks without touching sentinels", () => {
  const root = mkdtempSync(join(tmpdir(), "existing-destination-"));
  try {
    for (const framework of ["hyperframes", "remotion"] as const) {
      const slug = `existing-${framework}`;
      const destination = join(root, slug);
      const sentinel = join(destination, "sentinel.txt");
      mkdirSync(destination, { recursive: true });
      writeFileSync(sentinel, `${framework} sentinel\n`);
      assert.throws(() => scaffold(slug, ["--framework", framework], root));
      assert.equal(readFileSync(sentinel, "utf8"), `${framework} sentinel\n`);
      assert.deepEqual(readdirSync(destination), ["sentinel.txt"]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("createProject removes a failed sibling stage and leaves destination absent", async () => {
  const root = mkdtempSync(join(tmpdir(), "transactional-scaffold-"));
  try {
    const slug = "failed-runtime";
    const destination = join(root, slug);
    const { createProject } = await import("../../scripts/new_video.ts");
    const { getAdapter } = await import("../../frameworks/index.ts");
    assert.throws(
      () => createProject(destination, slug, getAdapter("hyperframes"), {
        writeRuntime() {
          throw new Error("injected runtime failure");
        },
      }),
      /injected runtime failure/,
    );
    assert.equal(existsSync(destination), false);
    assert.deepEqual(
      readdirSync(root).filter((name) => name.startsWith(`.${slug}.md2vid-stage-`)),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
