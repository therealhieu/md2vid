import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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

const exact = /^\d+\.\d+\.\d+$/;
const hyperframesTemplates = [
  "caption-skin.html",
  "frame-shell.html",
  "frame-template.html",
];

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
    assert.match(value, exact);
  }

  assert.equal(
    DEFAULT_GSAP_SRC,
    `https://cdn.jsdelivr.net/npm/gsap@${GSAP_VERSION}/dist/gsap.min.js`,
  );
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
