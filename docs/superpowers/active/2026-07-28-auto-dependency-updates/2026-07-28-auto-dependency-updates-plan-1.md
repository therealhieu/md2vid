# Automatic Dependency Updates Implementation Plan — Part 1: Dependency Authority

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make routine HyperFrames, Remotion, React, TypeScript, and GSAP patch updates source-synchronized, then replace brittle Action SHA assertions with immutable-pin invariants.

**Architecture:** A focused package-version module reads exact operational versions from root `package.json`. Runtime code, generated manifests, templates, fixtures, and release checks consume those values; source HyperFrames templates use a stable GSAP token that is materialized at scaffold, emit, and distribution boundaries.

**Tech Stack:** TypeScript ESM, Node.js filesystem APIs, Node test runner, HTML template materialization, YAML workflow contract tests.

---

## Group: `dependency-contracts`

Tasks 1–3 share package metadata, generated assets, and CI policy tests. Preserve all three commits, then perform one combined review/remediation/verifier cycle.

### Task 1: Define package-version authority [Tester: yes] `[Group: dependency-contracts]`

**Files:**
- Create: `test/cli/dependency-versions.test.ts`
- Test: `package.json:76-93`
- Test: `frameworks/hyperframes/scaffold.ts:13-70,119-139`
- Test: `frameworks/hyperframes/templates/caption-skin.html`
- Test: `frameworks/hyperframes/templates/frame-shell.html`
- Test: `frameworks/hyperframes/templates/frame-template.html`
- Test: `frameworks/remotion/scaffold.ts:33-58`

- [x] **Step 1: Create the failing dependency-authority test**

Create `test/cli/dependency-versions.test.ts`:

```ts
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
```

- [x] **Step 2: Run the new test and verify red state**

Run:

```bash
node --test test/cli/dependency-versions.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/dependency_versions.ts` or missing exports from `frameworks/hyperframes/scaffold.ts`.

- [x] **Step 3: Commit the red contract**

```bash
git add test/cli/dependency-versions.test.ts
git commit -m "test(deps): define package version authority"
```

### Task 2: Derive operational dependency versions [Tester: yes] `[Group: dependency-contracts]`

**Files:**
- Create: `scripts/dependency_versions.ts`
- Modify: `frameworks/hyperframes/patches.ts`
- Modify: `frameworks/hyperframes/patch-studio.ts`
- Modify: `frameworks/hyperframes/scaffold.ts`
- Modify: `frameworks/hyperframes/emit.ts`
- Modify: `frameworks/hyperframes/templates/caption-skin.html`
- Modify: `frameworks/hyperframes/templates/frame-shell.html`
- Modify: `frameworks/hyperframes/templates/frame-template.html`
- Modify: `frameworks/remotion/scaffold.ts`
- Modify: `scripts/hyperframes_cli.ts`
- Modify: `scripts/copy_dist_assets.ts`
- Modify: `bin/md2vid.ts`
- Modify: `package.json:32-46`
- Modify: `test/release/manifest.ts:38-51`
- Modify: `test/cli/pack.test.ts:9-30`
- Modify: active tests, fixtures, release harness, README, and HyperFrames standard files that contain operational version literals
- Regenerate: `skill/md2vid/references/standards/frameworks/hyperframes.md`
- Regenerate: `public-snapshot.json`

- [x] **Step 1: Add the package-derived version module**

Create `scripts/dependency_versions.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePackageRoot } from "./package_root.ts";

type DependencySection =
  | "dependencies"
  | "optionalDependencies"
  | "devDependencies";

interface PackageManifest {
  dependencies?: Record<string, unknown>;
  optionalDependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}

const root = resolvePackageRoot(import.meta.url);
const packageFile = join(root, "package.json");
const pkg = JSON.parse(readFileSync(packageFile, "utf8")) as PackageManifest;

function dependencyValue(section: DependencySection, name: string): string {
  const value = pkg[section]?.[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`invalid md2vid dependency ${section}.${name} at ${packageFile}`);
  }
  return value;
}

function exactVersion(section: DependencySection, name: string): string {
  const value = dependencyValue(section, name);
  if (!/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error(
      `md2vid ${section}.${name} must be an exact stable version at ${packageFile}`,
    );
  }
  return value;
}

export const HYPERFRAMES_VERSION = exactVersion("dependencies", "hyperframes");
export const REMOTION_VERSION = exactVersion("optionalDependencies", "remotion");
export const REACT_VERSION = exactVersion("optionalDependencies", "react");
export const GSAP_VERSION = exactVersion("devDependencies", "gsap");
export const REACT_TYPES_VERSION = dependencyValue("devDependencies", "@types/react");
export const TYPESCRIPT_VERSION = dependencyValue("devDependencies", "typescript");

if (dependencyValue("optionalDependencies", "react-dom") !== REACT_VERSION) {
  throw new Error("react and react-dom must use the same exact version");
}
if (
  dependencyValue("devDependencies", "@types/react-dom") !== REACT_TYPES_VERSION
) {
  throw new Error("@types/react and @types/react-dom must use the same range");
}

export const DEFAULT_GSAP_SRC =
  `https://cdn.jsdelivr.net/npm/gsap@${GSAP_VERSION}/dist/gsap.min.js`;

export const REMOTION_SCAFFOLD_DEPENDENCIES = {
  "@remotion/bundler": REMOTION_VERSION,
  "@remotion/cli": REMOTION_VERSION,
  "@remotion/google-fonts": REMOTION_VERSION,
  "@remotion/media": REMOTION_VERSION,
  "@remotion/renderer": REMOTION_VERSION,
  remotion: REMOTION_VERSION,
  react: REACT_VERSION,
  "react-dom": REACT_VERSION,
} as const;

export const REMOTION_SCAFFOLD_DEV_DEPENDENCIES = {
  "@types/react": REACT_TYPES_VERSION,
  "@types/react-dom": REACT_TYPES_VERSION,
  typescript: TYPESCRIPT_VERSION,
} as const;
```

- [x] **Step 2: Make HyperFrames version consumers package-derived**

Use these imports and aliases:

```ts
// frameworks/hyperframes/patches.ts
import { HYPERFRAMES_VERSION } from "../../scripts/dependency_versions.ts";
export const PINNED_HYPERFRAMES_VERSION = HYPERFRAMES_VERSION;
```

```ts
// frameworks/hyperframes/patch-studio.ts
import { HYPERFRAMES_VERSION } from "../../scripts/dependency_versions.ts";
```

```ts
// scripts/hyperframes_cli.ts
import { HYPERFRAMES_VERSION } from "./dependency_versions.ts";
```

```ts
// bin/md2vid.ts
import { HYPERFRAMES_VERSION } from "../scripts/dependency_versions.ts";
```

Delete independent `"0.7.26"` constants. Keep `ensurePinnedHyperframesPatches()` exact-version and anchor-count checks unchanged. Render CLI help with:

```ts
`  hyperframes <command> [args]                       run package-owned hyperframes@${HYPERFRAMES_VERSION}`,
```

- [x] **Step 3: Add GSAP token materialization and backward-compatible validation**

In `frameworks/hyperframes/scaffold.ts`, replace the local URL literal and raw copy helper with:

```ts
import { readFileSync } from "node:fs";
import { DEFAULT_GSAP_SRC, GSAP_VERSION } from "../../scripts/dependency_versions.ts";

export { DEFAULT_GSAP_SRC, GSAP_VERSION };
export const GSAP_SRC_TOKEN = "__MD2VID_GSAP_SRC__";
const CANONICAL_GSAP_CDN =
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@(\d+\.\d+\.\d+)\/dist\/gsap\.min\.js$/;

export function materializeGsapTemplate(
  template: string,
  gsapSrc: string = DEFAULT_GSAP_SRC,
): string {
  const count = template.split(GSAP_SRC_TOKEN).length - 1;
  if (count !== 1) {
    throw new Error(`expected exactly one ${GSAP_SRC_TOKEN}, found ${count}`);
  }
  return template.replace(GSAP_SRC_TOKEN, escapeHtmlAttribute(gsapSrc));
}

function writeMaterializedIfMissing(source: string, destination: string): void {
  if (existsSync(destination)) return;
  const template = readFileSync(source, "utf8");
  writeFileSync(destination, materializeGsapTemplate(template));
}
```

In `validateGsapSrc()`, accept an exact canonical historical URL before rejecting absolute URLs:

```ts
if (gsapSrc === DEFAULT_GSAP_SRC) return gsapSrc;
if (typeof gsapSrc !== "string" || gsapSrc.trim().length === 0) {
  throw new Error(
    "invalid gsapSrc: expected an exact canonical GSAP CDN URL or a non-empty project-relative file",
  );
}
if (CANONICAL_GSAP_CDN.test(gsapSrc)) return gsapSrc;
```

Replace the caption-skin copy in `ensureRuntime()` with:

```ts
writeMaterializedIfMissing(
  CAPTION_SKIN_TEMPLATE,
  join(videoDir, ".hyperframes", "caption-skin.html"),
);
```

- [x] **Step 4: Tokenize and materialize HyperFrames templates**

In each file below, replace the versioned GSAP URL with exactly `__MD2VID_GSAP_SRC__`:

```text
frameworks/hyperframes/templates/caption-skin.html
frameworks/hyperframes/templates/frame-shell.html
frameworks/hyperframes/templates/frame-template.html
```

In `frameworks/hyperframes/emit.ts`, import `materializeGsapTemplate`, delete the now-unneeded `gsapAttribute` local, and replace the old `replaceAll(DEFAULT_GSAP_SRC, gsapAttribute)` step with the raw configured source so escaping occurs exactly once:

```ts
skin = materializeGsapTemplate(skin, gsapSrc);
```

Keep custom local-file and canonical historical CDN behavior unchanged after materialization.

- [x] **Step 5: Materialize copied distribution templates**

In `scripts/copy_dist_assets.ts`, import `readFileSync` and `writeFileSync`, then add:

```ts
import {
  DEFAULT_GSAP_SRC,
  GSAP_SRC_TOKEN,
  materializeGsapTemplate,
} from "../frameworks/hyperframes/scaffold.ts";

function materializeHyperframesTemplates(): void {
  const root = join(DIST, "frameworks", "hyperframes", "templates");
  for (const name of [
    "caption-skin.html",
    "frame-shell.html",
    "frame-template.html",
  ]) {
    const path = join(root, name);
    const body = readFileSync(path, "utf8");
    if (!body.includes(GSAP_SRC_TOKEN)) {
      throw new Error(`copy_dist_assets: missing GSAP token in ${path}`);
    }
    writeFileSync(path, materializeGsapTemplate(body, DEFAULT_GSAP_SRC));
  }
}
```

Call `materializeHyperframesTemplates()` after the copy loop and before the final success log.

Prevent unresolved source-template tokens from entering the npm tarball. Add this entry after the existing framework test exclusions in `package.json.files`:

```json
"!frameworks/hyperframes/templates/**"
```

Add the prefix to `FORBIDDEN_PACKED_PREFIXES` in `test/release/manifest.ts`:

```ts
"frameworks/hyperframes/templates/",
```

Update `test/cli/pack.test.ts` to include it in the expected array:

```ts
assert.deepEqual(FORBIDDEN_PACKED_PREFIXES, [
  "outputs/",
  "test/",
  "node_modules/",
  "docs/superpowers/",
  "examples/",
  "frameworks/hyperframes/templates/",
]);
```

The materialized `dist/frameworks/hyperframes/templates/` tree remains required and published.

- [x] **Step 6: Derive the Remotion scaffold manifest**

In `frameworks/remotion/scaffold.ts`, import:

```ts
import {
  REMOTION_SCAFFOLD_DEPENDENCIES,
  REMOTION_SCAFFOLD_DEV_DEPENDENCIES,
} from "../../scripts/dependency_versions.ts";
```

Replace literal maps with:

```ts
dependencies: { ...REMOTION_SCAFFOLD_DEPENDENCIES },
devDependencies: { ...REMOTION_SCAFFOLD_DEV_DEPENDENCIES },
```

- [x] **Step 7: Replace active version literals with derived contracts**

Use these exact replacements wherever the active tests currently freeze operational values:

```ts
import {
  DEFAULT_GSAP_SRC,
  GSAP_VERSION,
  HYPERFRAMES_VERSION,
  REMOTION_SCAFFOLD_DEPENDENCIES,
  REMOTION_SCAFFOLD_DEV_DEPENDENCIES,
} from "../../scripts/dependency_versions.ts";
```

Apply the applicable relative import in:

```text
frameworks/hyperframes/__tests__/emit.test.ts
test/scaffold.test.ts
test/boundaries.test.ts
test/cli/router.test.ts
test/cli/run-exports.test.ts
test/cli/scaffold-project.test.ts
test/cli/scaffold-decoupled.test.ts
test/golden/golden.test.ts
test/release/harness.ts
test/cli/package-meta.test.ts
test/cli/hyperframes-cli.test.ts
frameworks/hyperframes/__tests__/patch-studio.test.ts
test/cli/postinstall.test.ts
test/release/harness.test.ts
```

Required assertion forms:

```ts
assert.equal(execution.gsapVersion, GSAP_VERSION);
assert.equal(config.gsapSrc, DEFAULT_GSAP_SRC);
assert.deepEqual(scaffold.dependencies, { ...REMOTION_SCAFFOLD_DEPENDENCIES });
assert.deepEqual(scaffold.devDependencies, { ...REMOTION_SCAFFOLD_DEV_DEPENDENCIES });
```

For mismatch fixtures, use `"999.999.999"` rather than another plausible current patch. For static fixture input, replace the frozen URL with `__MD2VID_DEFAULT_GSAP_SRC__` and materialize it in test setup using:

```ts
body.replaceAll("__MD2VID_DEFAULT_GSAP_SRC__", DEFAULT_GSAP_SRC)
```

Add a regression test that `validateGsapSrc()` accepts:

```ts
"https://cdn.jsdelivr.net/npm/gsap@3.14.1/dist/gsap.min.js"
```

and still rejects unversioned, query-string, other-host, and protocol-relative URLs.

- [x] **Step 8: Make public guidance version-neutral**

Replace active exact-version prose in `README.md` and `docs/standards/frameworks/hyperframes.md` with:

```md
New projects use the exact GSAP version pinned by md2vid, materialized as `https://cdn.jsdelivr.net/npm/gsap@<version>/dist/gsap.min.js` in `output.config.json`.
```

Use:

```md
`md2vid hyperframes --version` prints the exact package-owned HyperFrames version declared by this md2vid release.
```

Then synchronize the shipped reference:

```bash
corepack npm run sync:skill-references
```

Do not rewrite historical planning archives.

- [x] **Step 9: Run targeted tests**

```bash
node --test test/cli/dependency-versions.test.ts
node --test frameworks/hyperframes/__tests__/emit.test.ts
node --test frameworks/hyperframes/__tests__/patch-studio.test.ts
node --test test/cli/hyperframes-cli.test.ts
node --test test/cli/scaffold-decoupled.test.ts test/cli/scaffold-project.test.ts
node --test test/golden/golden.test.ts
corepack npm run typecheck
```

Expected: all commands exit `0`.

- [x] **Step 10: Verify built and packed assets**

```bash
corepack npm run build:dist
rg -n "__MD2VID_GSAP_SRC__" dist/frameworks/hyperframes/templates && exit 1 || true
corepack npm run check:skill-references
corepack npm run public:snapshot
corepack npm run public:snapshot:check
corepack npm run release:check
git diff --check
```

Execution note (2026-07-28): `corepack npm run public:snapshot` exits `1` because the current snapshot CLI requires `--output`. The candidate snapshot was generated with `corepack npm run public:snapshot -- --output <exclusive temporary directory> --ref <implementation commit>`, and the final exact `corepack npm run public:snapshot:check` completed successfully.

Expected:

- `build:dist`, snapshot checks, and release checks exit `0`.
- `rg` finds no unresolved GSAP token under `dist`.
- Packed release browser verification reports `GSAP_VERSION`.
- `git diff --check` prints nothing.

- [x] **Step 11: Commit the synchronization mechanism**

```bash
git add \
  package.json \
  scripts/dependency_versions.ts \
  frameworks/hyperframes \
  frameworks/remotion/scaffold.ts \
  scripts/hyperframes_cli.ts \
  scripts/copy_dist_assets.ts \
  bin/md2vid.ts \
  test \
  README.md \
  docs/standards/frameworks/hyperframes.md \
  skill/md2vid/references/standards/frameworks/hyperframes.md \
  public-snapshot.json
git commit -m "chore(deps): derive operational dependency versions"
```

Do not stage generated `dist/` files.

### Task 3: Generalize immutable Action pin contracts [Tester: yes] `[Group: dependency-contracts]`

**Files:**
- Modify: `test/ci/workflows.test.ts:109-127,299-346,919-938,1102-1250`

- [x] **Step 1: Add Action-pin collection helpers**

Add after `assertPinnedUses()`:

```ts
function actionPins(yaml: string, action: string): string[] {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...yaml.matchAll(
    new RegExp(
      `uses:\\s+${escaped}@([a-f0-9]{40})\\s+#\\s+(v\\d+(?:\\.\\d+)*)\\s*$`,
      "gm",
    ),
  )].map((match) => `${match[1]} ${match[2]}`);
}

function assertConsistentActionPin(
  workflowNames: string[],
  action: string,
): void {
  const pins = workflowNames.flatMap((name) => actionPins(workflow(name), action));
  assert.ok(pins.length > 0, `missing ${action}`);
  assert.equal(
    new Set(pins).size,
    1,
    `${action} must use one immutable SHA and version comment`,
  );
}
```

- [x] **Step 2: Replace routine exact SHA assertions**

Replace current literal SHA comparisons for `actions/setup-node`, `actions/checkout`, `actions/upload-artifact`, and `actions/download-artifact` with upstream/full-SHA/version-comment assertions:

```ts
assert.match(
  body,
  /actions\/setup-node@[a-f0-9]{40}\s+# v4(?:\.\d+)*/,
);
```

Retain exact literals only in deliberately malformed mutation fixtures where the exact value is part of the test input rather than the expected current dependency.

- [x] **Step 3: Add cross-workflow consistency coverage**

```ts
test("shared external actions use one immutable pin across workflows", () => {
  const active = ["ci.yml", "nightly.yml", "release.yml", "validate.yml"];
  assertConsistentActionPin(active, "actions/setup-node");
  assertConsistentActionPin(active, "actions/checkout");
  assertConsistentActionPin(active, "actions/upload-artifact");
  assertConsistentActionPin(active, "actions/download-artifact");
});
```

- [x] **Step 4: Run workflow tests**

```bash
node --test test/ci/workflows.test.ts
```

Expected: PASS. Existing mutation coverage must still reject tags, branches, short SHAs, missing comments, and stale non-version comments.

- [x] **Step 5: Commit the test-policy cleanup**

```bash
git add test/ci/workflows.test.ts
git commit -m "test(ci): generalize immutable action pins"
```

## Group Review and Verification Checklist

After Tasks 1–3 Mode A:

1. Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel against the complete `dependency-contracts` diff.
2. Resume the same implementer for accepted findings.
3. Rerun:

```bash
node --test test/cli/dependency-versions.test.ts
node --test frameworks/hyperframes/__tests__/emit.test.ts
node --test frameworks/hyperframes/__tests__/patch-studio.test.ts
node --test test/cli/hyperframes-cli.test.ts
node --test test/cli/scaffold-decoupled.test.ts test/cli/scaffold-project.test.ts
node --test test/ci/workflows.test.ts
corepack npm run check:skill-references
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

4. The verifier confirms:
   - package.json is the operational source for HyperFrames, Remotion, React, TypeScript, and GSAP values;
   - HyperFrames patch-anchor checks remain fail-closed;
   - source templates contain one stable token and built templates contain none;
   - new projects use the current package GSAP pin while prior canonical exact GSAP URLs remain valid;
   - Remotion and React families stay synchronized;
   - no build step mutates tracked source merely to make CI pass;
   - Action tests enforce immutable upstream pins without freezing routine SHA values.
