import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import {
  GSAP_SRC_TOKEN,
  materializeGsapTemplate,
  scaffoldSpec as hyperframesScaffoldSpec,
} from "../../frameworks/hyperframes/scaffold.ts";
import { scaffoldSpec as remotionScaffoldSpec } from "../../frameworks/remotion/scaffold.ts";
import {
  DEFAULT_GSAP_SRC,
  GSAP_VERSION,
  HYPERFRAMES_VERSION,
  isCanonicalStableVersion,
  REACT_TYPES_VERSION,
  REACT_VERSION,
  REMOTION_SCAFFOLD_DEPENDENCIES,
  REMOTION_SCAFFOLD_DEV_DEPENDENCIES,
  REMOTION_VERSION,
  TYPESCRIPT_VERSION,
} from "../../scripts/dependency_versions.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

const hyperframesTemplates = [
  "caption-skin.html",
  "frame-shell.html",
  "frame-template.html",
];

type RootManifest = typeof pkg;

async function importAuthority(manifest: RootManifest): Promise<Record<string, unknown>> {
  const root = mkdtempSync(join(tmpdir(), "md2vid-dependency-authority-"));
  const scripts = join(root, "scripts");
  mkdirSync(scripts, { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "md2vid", ...manifest }, null, 2)}\n`,
  );
  for (const name of ["dependency_versions.ts", "package_root.ts"]) {
    writeFileSync(
      join(scripts, name),
      readFileSync(join(ROOT, "scripts", name), "utf8"),
    );
  }
  try {
    return await import(pathToFileURL(join(scripts, "dependency_versions.ts")).href);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("operational dependency versions come from root package.json", () => {
  assert.equal(HYPERFRAMES_VERSION, pkg.dependencies.hyperframes);
  assert.equal(REMOTION_VERSION, pkg.optionalDependencies.remotion);
  assert.equal(REACT_VERSION, pkg.optionalDependencies.react);
  assert.equal(pkg.optionalDependencies["react-dom"], REACT_VERSION);
  assert.equal(REACT_TYPES_VERSION, pkg.devDependencies["@types/react"]);
  assert.equal(pkg.devDependencies["@types/react-dom"], REACT_TYPES_VERSION);
  assert.equal(TYPESCRIPT_VERSION, pkg.devDependencies.typescript);
  assert.equal(GSAP_VERSION, pkg.devDependencies.gsap);

  for (const value of [
    HYPERFRAMES_VERSION,
    REMOTION_VERSION,
    REACT_VERSION,
    GSAP_VERSION,
  ]) {
    assert.equal(isCanonicalStableVersion(value), true, value);
  }

  assert.equal(
    DEFAULT_GSAP_SRC,
    `https://cdn.jsdelivr.net/npm/gsap@${GSAP_VERSION}/dist/gsap.min.js`,
  );
});

test("React and React DOM reject a split exact version", async () => {
  const manifest = structuredClone(pkg);
  manifest.optionalDependencies.react = "19.2.8";
  manifest.optionalDependencies["react-dom"] = "19.0.0";

  await assert.rejects(
    () => importAuthority(manifest),
    /react and react-dom must use the same exact version/,
  );
});

test("canonical stable versions reject leading-zero package pins", async () => {
  for (const valid of ["0.7.26", "4.0.486", "3.14.1"]) {
    assert.equal(isCanonicalStableVersion(valid), true, valid);
  }
  for (const invalid of ["01.2.3", "04.0.486", "03.14.2"]) {
    assert.equal(isCanonicalStableVersion(invalid), false, invalid);
  }

  for (const [section, name, value] of [
    ["dependencies", "hyperframes", "01.2.3"],
    ["optionalDependencies", "remotion", "04.0.486"],
    ["devDependencies", "gsap", "03.14.2"],
  ] as const) {
    const manifest = structuredClone(pkg);
    manifest[section][name] = value;
    await assert.rejects(
      () => importAuthority(manifest),
      new RegExp(`${section}\\.${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} must be an exact stable version`),
    );
  }
});

test("root Remotion dependency family is synchronized and mutation-checked", async () => {
  for (const [name, value] of Object.entries(pkg.optionalDependencies)) {
    if (name === "remotion" || name.startsWith("@remotion/")) {
      assert.equal(value, REMOTION_VERSION, `${name} must match remotion`);
    }
  }
  for (const name of ["@remotion/media", "@remotion/google-fonts"]) {
    const manifest = structuredClone(pkg);
    manifest.optionalDependencies[name] = "999.999.999";
    await assert.rejects(
      () => importAuthority(manifest),
      new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} must match remotion`),
    );
  }
});

test("generated framework manifests use synchronized package versions", () => {
  assert.equal(
    hyperframesScaffoldSpec("ignored").outputConfig.gsapSrc,
    DEFAULT_GSAP_SRC,
  );

  const remotion = remotionScaffoldSpec("ignored");
  assert.deepEqual(remotion.dependencies, {
    ...REMOTION_SCAFFOLD_DEPENDENCIES,
  });
  assert.deepEqual(remotion.devDependencies, {
    ...REMOTION_SCAFFOLD_DEV_DEPENDENCIES,
  });
});

test("source HyperFrames templates are version-independent", () => {
  for (const name of hyperframesTemplates) {
    const body = readFileSync(
      join(ROOT, "frameworks", "hyperframes", "templates", name),
      "utf8",
    );
    assert.equal(
      body.split(GSAP_SRC_TOKEN).length - 1,
      1,
      `${name} must contain one GSAP token`,
    );
    assert.doesNotMatch(body, /cdn\.jsdelivr\.net\/npm\/gsap@\d+\.\d+\.\d+/);

    const materialized = materializeGsapTemplate(body, DEFAULT_GSAP_SRC);
    assert.equal(materialized.includes(GSAP_SRC_TOKEN), false);
    assert.equal(
      materialized.split(DEFAULT_GSAP_SRC).length - 1,
      1,
      `${name} must materialize one GSAP source`,
    );
  }
});

test("materialized distribution templates accept one configured GSAP source", () => {
  const built = `<script src="${DEFAULT_GSAP_SRC}"></script>`;
  assert.equal(
    materializeGsapTemplate(built, "assets/gsap/gsap.min.js"),
    '<script src="assets/gsap/gsap.min.js"></script>',
  );
  assert.throws(
    () => materializeGsapTemplate("<script></script>"),
    /expected exactly one GSAP source placeholder/,
  );
});

test("Remotion and React package families stay synchronized", () => {
  for (const [name, value] of Object.entries(REMOTION_SCAFFOLD_DEPENDENCIES)) {
    if (name.startsWith("@remotion/") || name === "remotion") {
      assert.equal(value, REMOTION_VERSION, `${name} must match remotion`);
    }
  }
  assert.equal(REMOTION_SCAFFOLD_DEPENDENCIES.react, REACT_VERSION);
  assert.equal(REMOTION_SCAFFOLD_DEPENDENCIES["react-dom"], REACT_VERSION);
  assert.equal(
    REMOTION_SCAFFOLD_DEV_DEPENDENCIES["@types/react"],
    REACT_TYPES_VERSION,
  );
  assert.equal(
    REMOTION_SCAFFOLD_DEV_DEPENDENCIES["@types/react-dom"],
    REACT_TYPES_VERSION,
  );
});
