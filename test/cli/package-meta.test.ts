import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isAuthenticPublicSnapshotCheckout } from "../../scripts/public_snapshot_checkout.ts";
import { HYPERFRAMES_VERSION } from "../../scripts/dependency_versions.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(REPO_ROOT, "package-lock.json"), "utf8"));
const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
const hyperframesStandard = readFileSync(
  join(REPO_ROOT, "docs", "standards", "frameworks", "hyperframes.md"),
  "utf8",
);
const releaseRunbook = readFileSync(join(REPO_ROOT, "docs", "release.md"), "utf8");
const releaseWorkflow = readFileSync(join(REPO_ROOT, ".github", "workflows", "release.yml"), "utf8");
const gitignore = readFileSync(join(REPO_ROOT, ".gitignore"), "utf8");
const publicSnapshot = JSON.parse(
  readFileSync(join(REPO_ROOT, "public-snapshot.json"), "utf8"),
) as { paths: Array<{ path: string }> };
const finalGateChecklistPath = join(
  REPO_ROOT,
  "docs",
  "superpowers",
  "done",
  "2026-07-24-md-to-video-e2e",
  "2026-07-24-md-to-video-e2e-final-gate-checklist.md",
);
const finalGateChecklist = existsSync(finalGateChecklistPath)
  ? readFileSync(finalGateChecklistPath, "utf8")
  : undefined;
const isIntentionalPublicSnapshot = finalGateChecklist === undefined
  && isAuthenticPublicSnapshotCheckout(REPO_ROOT);

function sourceFinalGateChecklist(): string | undefined {
  if (finalGateChecklist !== undefined) return finalGateChecklist;
  assert.equal(
    isIntentionalPublicSnapshot,
    true,
    `source checkout is missing required final-gate checklist: ${finalGateChecklistPath}`,
  );
  return undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function incrementPatchVersion(version: string): string {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function historicalDeprecationPattern(deprecatedVersion: string): RegExp {
  const replacementVersion = incrementPatchVersion(deprecatedVersion);
  return new RegExp(
    `npm deprecate md2vid@${escapeRegex(deprecatedVersion)} "Contains HyperFrames audio staging and Remotion scaffold defects; use md2vid@${escapeRegex(replacementVersion)} or later\\."`,
  );
}

function temporaryDirectory(t: TestContext, prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

const MIT_LICENSE = `MIT License

Copyright (c) 2026 therealhieu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

test("public README documents supported install, usage, rendering, and release flows", () => {
  assert.equal(readme.trim().length > 0, true);
  assert.doesNotMatch(readme, /npx --no md2vid/);
  for (const text of [
    "Node.js >=22.18",
    "npm install -g md2vid",
    "md2vid install-skill",
    "md2vid upgrade",
    "npm install --global md2vid@latest",
    "/md2vid",
    "npx --yes=false md2vid",
    "md2vid verify",
    "npm run build",
    "npm run check",
    "npm run dev",
    "npm run still",
    "npm run studio",
    "npm run render",
    "npm version X.Y.Z --no-git-tag-version --ignore-scripts",
    "npm run release:check",
    "git tag -a vX.Y.Z",
    "git push origin vX.Y.Z",
    "docs/release.md",
    "md2vid --version",
    "md2vid hyperframes --version",
    "npm uninstall -g md2vid",
    "Supported operating systems: macOS and Linux",
    "EBADPLATFORM",
    "unsupported-platform error",
    "Windows-style absolute paths",
    "UNC paths",
    "do not imply Windows runtime support",
  ]) {
    assert.match(
      readme,
      new RegExp(escapeRegex(text), "i"),
    );
  }
  assert.doesNotMatch(
    readme,
    /```powershell|Remove-Item|\$env:CLAUDE_CONFIG_DIR/i,
  );
  for (const pattern of [
    /protected annotated tag/i,
    /automatic/i,
    /workflow_dispatch/i,
    historicalDeprecationPattern("0.1.1"),
  ]) {
    assert.match(readme, pattern);
  }
  assert.doesNotMatch(readme, /Actual publication and tagging require explicit maintainer approval/);
  assert.doesNotMatch(readme, /git push origin main v\d+\.\d+\.\d+/);
  assert.doesNotMatch(readme, /npm install -g md2vid@\d+\.\d+\.\d+/);
});

test("public README documents semantic timing and final-render policy", () => {
  for (const term of [
    "md2vid plan <dir>",
    "visual_beats.json",
    "legacy warn vs scaffold required",
    "--profile final|draft|gif",
    "--allow-low-fps",
    "30 FPS final default / 24 FPS minimum",
    "<output>.md2vid-render.json",
  ]) assert.match(readme, new RegExp(escapeRegex(term)), term);
});

test("public README uses synchronized upgrade with manual recovery", () => {
  assert.match(readme, /## Update\s+```bash\s+md2vid upgrade\s+```/);
  assert.match(
    readme,
    /manual recovery[\s\S]*npm install --global md2vid@latest[\s\S]*md2vid install-skill/i,
  );
  assert.doesNotMatch(
    readme,
    /Rerun `md2vid install-skill` after every `npm update -g md2vid`/,
  );
});

test("historical deprecation guidance stays fixed after the active version advances", () => {
  const deprecatedVersion = "0.1.1";
  const plannedActiveVersion = "0.2.0";
  assert.notEqual(incrementPatchVersion(deprecatedVersion), plannedActiveVersion);
  assert.match(readme, historicalDeprecationPattern(deprecatedVersion));
});

test("public HyperFrames guidance documents canonical project-root-relative local GSAP", () => {
  for (const body of [readme, hyperframesStandard]) {
    assert.match(body, /https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@<version>\/dist\/gsap\.min\.js/);
    assert.match(body, /offline/i);
    assert.match(body, /gsapSrc/);
    assert.match(body, /network access[^.]*preview[^.]*render/i);
    assert.match(body, /assets\/gsap\/gsap\.min\.js/);
    assert.match(body, /exact unchanged|string.*unchanged/i);
    assert.match(body, /project root/i);
    assert.doesNotMatch(body, /\.\.\/\.\.\/runtime\/custom-gsap\.js/);
  }
});

test("public HyperFrames install guidance documents proxy self-healing under allowScripts", () => {
  for (const body of [readme, hyperframesStandard]) {
    assert.match(body, /postinstall[^.]*normally[^.]*patch/i);
    assert.match(body, /allowScripts/i);
    assert.match(body, /md2vid hyperframes[^.]*self-heal/i);
    assert.match(body, /caption-loop/i);
    assert.doesNotMatch(body, /embedded-template preference patch/i);
    assert.match(body, /warning[^.]*nonfatal[^.]*commands succeed/i);
    assert.match(body, /embedded templates[^.]*omit[^.]*data-composition-src/i);
    assert.match(body, /standalone authored files[\s\S]{0,180}remain/i);
  }
});

test("release runbook binds recovery to the publication-capable workflow contract", () => {
  assert.equal(releaseRunbook.trim().length > 0, true);
  assert.match(releaseRunbook, /gh workflow run release\.yml -f tag=vX\.Y\.Z/);
  assert.match(releaseWorkflow, /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+tag:\s*\n\s+description:[^\n]+\n\s+required:\s*true/);
  assert.match(releaseRunbook, /npm version absent[\s\S]*rebuild[\s\S]*publish once/i);
  assert.match(releaseRunbook, /npm version (?:already )?(?:present|exists)[\s\S]*retained original artifact[\s\S]*exact registry SRI[\s\S]*skip publication/i);
  assert.match(releaseRunbook, /implementation agents[\s\S]*must not[\s\S]*dispatch hosted workflows/i);
});

test("final gate matrix begins with the pinned npm version preflight", () => {
  const checklist = sourceFinalGateChecklist();
  if (checklist === undefined) return;
  assert.match(
    checklist,
    /corepack npm --version\ncorepack npm run typecheck\ncorepack npm run typecheck:remotion\ncorepack npm test\ncorepack npm run check:skill-references\ncorepack npm run public:snapshot:check\ncorepack npm run release:check\ngit diff --check main\.\.\.HEAD\ngit diff --check\n/,
  );
  assert.match(checklist, /npm version:\s*11\.15\.0/);
  assert.match(checklist, /`corepack npm --version`[^\n]*exactly `11\.15\.0`/i);
});

test("final gate preview records DNS-derived local-time and runtime uniqueness evidence", () => {
  const checklist = sourceFinalGateChecklist();
  if (checklist === undefined) return;
  const freshDnsGate = checklist.slice(
    checklist.indexOf("## 6. Create a fresh DNS Markdown-to-video project"),
    checklist.indexOf("## 10. Render the final MP4"),
  );
  for (const pattern of [
    /local = clamp\(global - hostStart, 0, frameDuration\)/,
    /derive global sample times from each DNS host[^\n]*actual `data-start`/i,
    /standalone\/composed parity/i,
    /late → early → late[^\n]*restoration/i,
    /exactly one scoped controller\/timeline[^\n]*per frame/i,
    /exactly one captions timeline/i,
    /zero `__hf2` mounts/i,
    /zero duplicate IDs/i,
    /zero `const tl` redeclaration collisions/i,
  ]) {
    assert.match(freshDnsGate, pattern);
  }
  assert.doesNotMatch(freshDnsGate, /(?:3\.6|5\.9|6\.4)/);
  assert.match(
    freshDnsGate,
    /DNS-derived local-time conversion, standalone\/composed mismatch, nonmonotonic restoration failure, controller\/timeline count mismatch, `__hf2` mount, duplicate ID, or `const tl` redeclaration collision[\s\S]*→ FAIL/,
  );
});

test("final gate requires machine-readable browser visual-integrity evidence", () => {
  const checklist = sourceFinalGateChecklist();
  if (checklist === undefined) return;
  const previewGate = checklist.slice(
    checklist.indexOf("## 9. Preview and verify composed caption synchronization"),
    checklist.indexOf("## 10. Render the final MP4"),
  );

  for (const pattern of [
    /caption-contrast\.json/,
    /text-occlusion\.json/,
    /frame-theme\.json/,
    /test\/visual\/composed-visual-integrity\.mjs/,
    /--url "\$PREVIEW_URL"/,
    /--project "\$PROJECT_ROOT"/,
    /--evidence "\$BROWSER_EVIDENCE_DIR"/,
    /--browser-path "\$CHROME_PATH"/,
    /elementsFromPoint\(\)/,
    /active and spoken captions[^\n]*normal text[^\n]*4\.5:1/i,
    /large text[^\n]*3\.0:1[^\n]*computed size and weight/i,
    /opaque foreign element[^\n]*victim[^\n]*occluder/i,
    /declared `data-frame-theme`[^\n]*computed full-canvas ground/i,
  ]) {
    assert.match(previewGate, pattern);
  }
  assert.match(
    previewGate,
    /caption contrast, text occlusion, or frame-theme assertion[^\n]*→ FAIL/i,
  );
});

test("archived final gate records complete artifact identity and evidence integrity", () => {
  const checklist = sourceFinalGateChecklist();
  if (checklist === undefined) return;
  for (const pattern of [
    /Validation tree SHA:/,
    /Artifact package name: md2vid/,
    /Artifact package version: 0\.1\.2/,
    /Artifact tag: v0\.1\.2/,
    /Artifact metadata commit:/,
    /Artifact node version:/,
    /Artifact npm version: 11\.15\.0/,
    /Artifact tarball filename:/,
    /Tarball SHA-256:/,
    /Tarball SRI:/,
    /`manifest\.json`/,
    /`SHA256SUMS`/,
    /hash every preserved evidence file/i,
    /manifest hash[^\n]*`SHA256SUMS`/i,
    /credential scan result:/i,
    /evidence confinement result:/i,
    /evidence paths are ignored by Git/i,
  ]) {
    assert.match(checklist, pattern);
  }
});

test("final gate protects the complete ordered repository matrix and result fields", () => {
  const checklist = sourceFinalGateChecklist();
  if (checklist === undefined) return;
  const matrixSection = checklist.slice(
    checklist.indexOf("## 2. Run the exact repository gate matrix"),
    checklist.indexOf("## 3. Create a clean temporary validation commit"),
  );
  const commandBlock = matrixSection.match(/```bash\n([\s\S]*?)```/)?.[1]
    .trim()
    .split("\n");
  assert.deepEqual(commandBlock, [
    "corepack npm --version",
    "corepack npm run typecheck",
    "corepack npm run typecheck:remotion",
    "corepack npm test",
    "corepack npm run check:skill-references",
    "corepack npm run public:snapshot:check",
    "corepack npm run release:check",
    "git diff --check main...HEAD",
    "git diff --check",
  ]);
  assert.match(matrixSection, /npm version: 11\.15\.0/);
  assert.match(matrixSection, /test count:/);
  assert.match(matrixSection, /unexpected skips: 0/);
  assert.match(matrixSection, /Record the exact test count/);
  assert.match(matrixSection, /Record the exact unexpected skip count and require `0`/);
});

test("completion evidence stays ignored and excluded from public and package payloads", () => {
  assert.match(gitignore, /^\/docs\/superpowers\/\*\*\/evidence\/$/m);
  for (const entry of publicSnapshot.paths) {
    assert.equal(
      entry.path.includes("evidence/"),
      false,
      `public snapshot must exclude evidence path ${entry.path}`,
    );
  }
  for (const entry of pkg.files ?? []) {
    assert.equal(
      String(entry).includes("evidence"),
      false,
      `package allowlist must exclude evidence entry ${entry}`,
    );
  }
});

test("final gate checks committed and working-tree whitespace", () => {
  const checklist = sourceFinalGateChecklist();
  if (checklist === undefined) return;
  assert.match(
    checklist,
    /corepack npm run release:check\ngit diff --check main\.\.\.HEAD\ngit diff --check\n/,
  );
  assert.match(
    checklist,
    /`git diff --check main\.\.\.HEAD` exits `0`\./,
  );
  assert.match(
    checklist,
    /`git diff --check` exits `0`\./,
  );
});

test("LICENSE is the exact MIT license approved for v0.1", () => {
  assert.equal(readFileSync(join(REPO_ROOT, "LICENSE"), "utf8"), MIT_LICENSE);
});

test("bin exposes md2vid → dist/bin/md2vid.js", () => {
  assert.equal(pkg.bin?.md2vid, "dist/bin/md2vid.js");
});

test("files[] is the exact public package allowlist", () => {
  assert.deepEqual(pkg.files, [
    "dist",
    "engine",
    "frameworks",
    "docs/standards",
    "skill",
    "bin",
    "scripts/dependency_versions.ts",
    "scripts/package_root.ts",
    "postinstall.mjs",
    "README.md",
    "LICENSE",
    "!engine/**/__tests__/**",
    "!engine/**/*.test.ts",
    "!frameworks/**/__tests__/**",
    "!frameworks/**/*.test.ts",
    "!frameworks/hyperframes/templates/**",
  ]);
});

test("package and lockfile release identities stay synchronized", () => {
  assert.equal(pkg.name, "md2vid");
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages?.[""]?.name, pkg.name);
  assert.equal(lock.packages?.[""]?.version, pkg.version);
  assert.deepEqual(lock.packages?.[""]?.os, ["darwin", "linux"]);
  assert.equal(Object.hasOwn(lock.packages?.[""] ?? {}, "cpu"), false);
});

test("public package metadata declares the supported runtime and project identity", () => {
  assert.equal(pkg.engines?.node, ">=22.18");
  assert.deepEqual(pkg.os, ["darwin", "linux"]);
  assert.equal(Object.hasOwn(pkg, "cpu"), false);
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.author, "therealhieu");
  assert.deepEqual(pkg.repository, {
    type: "git",
    url: "git+https://github.com/therealhieu/md2vid.git",
  });
  assert.equal(pkg.homepage, "https://github.com/therealhieu/md2vid#readme");
  assert.deepEqual(pkg.bugs, { url: "https://github.com/therealhieu/md2vid/issues" });
  assert.ok(pkg.keywords.includes("video"));
  assert.ok(pkg.keywords.includes("hyperframes"));
  assert.ok(pkg.keywords.includes("remotion"));
  assert.match(pkg.description, /HyperFrames/i);
  assert.match(pkg.description, /Remotion/i);
});

test("release toolchain and scripts expose exact artifact workflows", () => {
  assert.equal(pkg.engines?.node, ">=22.18");
  assert.equal(pkg.packageManager, "npm@11.15.0");
  assert.equal(pkg.scripts.prepack, "npm run check:skill-references && npm run build:dist");
  assert.equal(pkg.scripts["security:audit"], "node scripts/check_audit_policy.ts");
  assert.equal(pkg.scripts["public:snapshot"], "node scripts/public_snapshot.ts");
  assert.equal(
    pkg.scripts["public:snapshot:test"],
    "node --test test/ci/public-snapshot.test.ts test/ci/public-snapshot-check.test.ts test/ci/public-snapshot-checkout.test.ts",
  );
  assert.equal(pkg.scripts["public:snapshot:check"], "node scripts/check_public_snapshot.ts");
  assert.equal(pkg.scripts["release:pack"], "node test/release/run.ts pack");
  assert.equal(pkg.scripts["release:verify-artifact"], "node test/release/run.ts verify");
  assert.equal(pkg.scripts["release:verify-registry"], "node test/release/run.ts registry");
  assert.equal(pkg.scripts["release:check"], "npm run check && node test/release/run.ts all");
  assert.doesNotMatch(pkg.scripts.check, /public:snapshot:check/);
  assert.doesNotMatch(pkg.scripts["release:check"], /public:snapshot:check/);
  assert.equal(pkg.scripts["release:check-name"], "node dist/scripts/check_release_name.js");
  assert.equal(pkg.scripts.prepublishOnly, "node scripts/run_current_npm.ts");
  assert.equal(pkg.scripts.postinstall, "node postinstall.mjs");
});

test("prepublish wrapper runs release:check through the parent npm_execpath", (t) => {
  const directory = temporaryDirectory(t, "md2vid-current-npm-");
  const fakeNpm = join(directory, "fake npm cli.js");
  const logPath = join(directory, "args.json");
  writeFileSync(fakeNpm, [
    'import { writeFileSync } from "node:fs";',
    'writeFileSync(process.env.FAKE_NPM_LOG, JSON.stringify(process.argv.slice(2)));',
  ].join("\n"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name.toLowerCase() !== "path"),
  );
  const result = spawnSync(process.execPath, [join(REPO_ROOT, "scripts", "run_current_npm.ts")], {
    encoding: "utf8",
    env: {
      ...env,
      PATH: join(directory, "poisoned-path"),
      npm_execpath: fakeNpm,
      FAKE_NPM_LOG: logPath,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(logPath, "utf8")), ["run", "release:check"]);
});

test("prepublish wrapper fails closed without npm_execpath and forwards child failure status", (t) => {
  const wrapper = join(REPO_ROOT, "scripts", "run_current_npm.ts");
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name.toLowerCase() !== "npm_execpath"),
  );
  const missing = spawnSync(process.execPath, [wrapper], { encoding: "utf8", env });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /npm_execpath/);

  const directory = temporaryDirectory(t, "md2vid-current-npm-failure-");
  const failingNpm = join(directory, "failing npm cli.js");
  writeFileSync(failingNpm, "process.exitCode = 7;\n");
  const failed = spawnSync(process.execPath, [wrapper], {
    encoding: "utf8",
    env: { ...env, npm_execpath: failingNpm },
  });
  assert.equal(failed.status, 7);
});

test("hyperframes is a hard-pinned runtime dependency", () => {
  assert.equal(pkg.dependencies?.hyperframes, HYPERFRAMES_VERSION);
});

test("remotion + react + @remotion/* are optionalDependencies, not deps", () => {
  const opt = pkg.optionalDependencies ?? {};
  for (const name of ["remotion", "react", "react-dom", "@remotion/google-fonts", "@remotion/media"]) {
    assert.ok(name in opt, `${name} must be in optionalDependencies`);
    assert.ok(!(name in (pkg.dependencies ?? {})), `${name} must not be a hard dependency`);
  }
});

test("typescript + @types/* are devDependencies", () => {
  const dev = pkg.devDependencies ?? {};
  for (const name of ["typescript", "@types/node", "@types/react", "@types/react-dom"]) {
    assert.ok(name in dev, `${name} must be a devDependency`);
  }
  assert.ok(!("typescript" in (pkg.dependencies ?? {})), "typescript must not be a runtime dependency");
});

test("private:true is dropped for publish", () => {
  assert.ok(!("private" in pkg), "package.json must not set private for publish");
});

test("build:dist compiles and copies distribution assets", () => {
  assert.match(pkg.scripts?.["build:dist"] ?? "", /tsconfig\.dist\.json/);
  assert.match(pkg.scripts?.["build:dist"] ?? "", /copy_dist_assets/);
});
