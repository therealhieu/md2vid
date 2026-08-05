# Dependency PR CI Remediation Implementation Plan — Part 2: HyperFrames 0.7.87 Compatibility

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one reviewed exact `rr/p/v` Studio bundle variant for HyperFrames 0.7.87, prove idempotent self-healing against synthetic and published-package evidence, and land it without changing the project dependency version.

**Architecture:** Extend only `STUDIO_PATCH_VARIANTS`. Preserve exact occurrence counts, one-variant selection, one-bundle resolution, staged promotion, lock behavior, and postinstall failure propagation.

**Tech Stack:** TypeScript, Node.js test runner, npm package tarballs, exact minified-string patching, HyperFrames CLI proxy.

---

### Task 5: Define exact `rr/p/v` compatibility [Tester: yes] `[Group: hyperframes-0-7-87]`

**Files:**
- Modify: `frameworks/hyperframes/__tests__/patch-studio.test.ts:1-169`
- Modify: `test/cli/hyperframes-self-heal.test.ts:21-80,169-233,278-337`
- Test: `frameworks/hyperframes/patches.ts:19-145`

- [ ] **Step 1: Create the Unit B worktree after Unit A merges**

```bash
PRIMARY=/Users/hieunguyen/git/hieu/projects/md2vid-public
git -C "$PRIMARY" check-ignore -q .worktrees
git -C "$PRIMARY" fetch origin main
git -C "$PRIMARY" worktree add \
  .worktrees/hyperframes-0-7-87 \
  -b fix/hyperframes-0-7-87 \
  origin/main
cd "$PRIMARY/.worktrees/hyperframes-0-7-87"

git status --short
corepack npm ci
node --test frameworks/hyperframes/__tests__/patch-studio.test.ts
node --test test/cli/hyperframes-self-heal.test.ts
```

Expected: clean status and all existing legacy/current patch tests pass. Stop if Unit A is not present on `origin/main` or the baseline is red.

- [ ] **Step 2: Add exact 0.7.87 constants and a positive idempotence test**

In `frameworks/hyperframes/__tests__/patch-studio.test.ts`, add:

```ts
const V087_ANCHOR_1 =
  "let l=!1;const c=()=>{if(rr.getState().isEditMode||l)return;";
const V087_ANCHOR_2 = "if(!p)return;l=!0;const v=p;fetch(";
const V087_PATCH_1 =
  "let l=!1,hfLast=null;const c=()=>{if(rr.getState().isEditMode||l)return;";
const V087_PATCH_2 =
  "if(!p)return;if(hfLast===p)return;hfLast=p;l=!0;const v=p;fetch(";
```

Add:

```ts
test("valid 0.7.87 bundle patches exactly once and remains idempotent", () => {
  const root = mkdtempSync(join(tmpdir(), "patch-studio-0-7-87-"));
  const bundle = join(root, "index-test.js");
  try {
    writeFileSync(bundle, `${V087_ANCHOR_1}\n${V087_ANCHOR_2}\n`);
    assert.equal(run([bundle]), 0);

    const once = readFileSync(bundle, "utf8");
    assert.equal(once.includes(V087_ANCHOR_1), false);
    assert.equal(once.includes(V087_ANCHOR_2), false);
    assert.equal(once.split(V087_PATCH_1).length - 1, 1);
    assert.equal(once.split(V087_PATCH_2).length - 1, 1);

    assert.equal(run([bundle]), 0);
    assert.equal(readFileSync(bundle, "utf8"), once);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Add missing, duplicate, and mixed-layout failures**

Add these complete tests:

```ts
test("0.7.87 bundle with a missing second anchor fails without writing", () => {
  const root = mkdtempSync(join(tmpdir(), "patch-studio-0-7-87-missing-"));
  const bundle = join(root, "index-test.js");
  const source = `${V087_ANCHOR_1}\n`;
  const errors: string[] = [];
  const original = console.error;
  try {
    writeFileSync(bundle, source);
    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    assert.equal(run([bundle]), 1);
    assert.match(errors.join("\n"), /anchor-2.*matched 0/);
    assert.equal(readFileSync(bundle, "utf8"), source);
  } finally {
    console.error = original;
    rmSync(root, { recursive: true, force: true });
  }
});

test("0.7.87 bundle with a duplicate second anchor fails without writing", () => {
  const root = mkdtempSync(join(tmpdir(), "patch-studio-0-7-87-duplicate-"));
  const bundle = join(root, "index-test.js");
  const source = `${V087_ANCHOR_1}\n${V087_ANCHOR_2}\n${V087_ANCHOR_2}\n`;
  const errors: string[] = [];
  const original = console.error;
  try {
    writeFileSync(bundle, source);
    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    assert.equal(run([bundle]), 1);
    assert.match(errors.join("\n"), /anchor-2.*matched 2/);
    assert.equal(readFileSync(bundle, "utf8"), source);
  } finally {
    console.error = original;
    rmSync(root, { recursive: true, force: true });
  }
});

test("current and 0.7.87 layouts together fail as ambiguous without writing", () => {
  const root = mkdtempSync(join(tmpdir(), "patch-studio-current-0-7-87-"));
  const bundle = join(root, "index-test.js");
  const source = [
    CURRENT_ANCHOR_1,
    CURRENT_ANCHOR_2,
    V087_ANCHOR_1,
    V087_ANCHOR_2,
    "",
  ].join("\n");
  const errors: string[] = [];
  const original = console.error;
  try {
    writeFileSync(bundle, source);
    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    assert.equal(run([bundle]), 1);
    assert.match(
      errors.join("\n"),
      /anchor variant matched 2 variant\(s\), expected 1/,
    );
    assert.equal(readFileSync(bundle, "utf8"), source);
  } finally {
    console.error = original;
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 4: Extend the self-healing fixture with a third explicit variant**

In `test/cli/hyperframes-self-heal.test.ts`, add reviewed 0.7.87 anchors and extend the fixture option:

```ts
anchorVariant?: "legacy" | "current" | "0.7.87";
```

Select exact anchors without a truthy/falsy fallback:

```ts
const anchors = options.anchorVariant === "current"
  ? [CURRENT_STUDIO_ANCHOR_1, CURRENT_STUDIO_ANCHOR_2]
  : options.anchorVariant === "0.7.87"
    ? [V087_STUDIO_ANCHOR_1, V087_STUDIO_ANCHOR_2]
    : [LEGACY_STUDIO_ANCHOR_1, LEGACY_STUDIO_ANCHOR_2];
```

Add:

```ts
test("HyperFrames proxy patches the reviewed 0.7.87 Studio layout", () => {
  const fixture = fakeInstallation({ anchorVariant: "0.7.87" });
  let spawned = false;
  try {
    const code = runHyperframes(["lint"], {
      metaUrl: fixture.metaUrl,
      spawn() {
        spawned = true;
        const source = readFileSync(fixture.studio, "utf8");
        assert.match(source, /hfLast/);
        assert.equal(source.includes(V087_STUDIO_ANCHOR_1), false);
        assert.equal(source.includes(V087_STUDIO_ANCHOR_2), false);
        return successResult();
      },
    });
    assert.equal(code, 0);
    assert.equal(spawned, true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 5: Run the focused tests and verify red**

```bash
node --test frameworks/hyperframes/__tests__/patch-studio.test.ts
node --test test/cli/hyperframes-self-heal.test.ts
```

Expected:

- explicit bundle test fails because no `0.7.87` variant is known;
- production resolver/self-heal test fails because zero bundles match known markers;
- existing legacy/current tests remain green.

- [ ] **Step 6: Commit the failing contract**

```bash
git add \
  frameworks/hyperframes/__tests__/patch-studio.test.ts \
  test/cli/hyperframes-self-heal.test.ts
git commit -m "test(hyperframes): define 0.7.87 Studio anchors"
```

### Task 6: Add the exact production variant [Tester: yes] `[Group: hyperframes-0-7-87]`

**Files:**
- Modify: `frameworks/hyperframes/patches.ts:19-34`
- Modify: `frameworks/hyperframes/patch-studio.ts:1-21`

- [ ] **Step 1: Add one exact reviewed variant**

Append to `STUDIO_PATCH_VARIANTS`:

```ts
{
  name: "0.7.87",
  anchor1: "let l=!1;const c=()=>{if(rr.getState().isEditMode||l)return;",
  patch1: "let l=!1,hfLast=null;const c=()=>{if(rr.getState().isEditMode||l)return;",
  anchor2: "if(!p)return;l=!0;const v=p;fetch(",
  patch2: "if(!p)return;if(hfLast===p)return;hfLast=p;l=!0;const v=p;fetch(",
},
```

Do not change `countOccurrences`, `replaceExact`, `variantMarkerCount`, `selectStudioPatchVariant`, `resolveStudioBundle`, staged promotion, lock handling, or pinned-version enforcement.

- [ ] **Step 2: Update the fail-closed version comment**

Replace the stale upper-bound comment in `frameworks/hyperframes/patch-studio.ts` with:

```ts
// HyperFrames Studio versions observed through 0.7.87 can retry the same
// failed caption-model fetch indefinitely. This patch recognizes only
// reviewed exact bundle layouts and fails closed when upstream output changes.
```

- [ ] **Step 3: Run focused green verification**

```bash
node --test frameworks/hyperframes/__tests__/patch-studio.test.ts
node --test test/cli/hyperframes-self-heal.test.ts
```

Expected: PASS for legacy, current, and 0.7.87 variants, including missing/duplicate/mixed mutation cases.

- [ ] **Step 4: Commit the implementation**

```bash
git add \
  frameworks/hyperframes/patches.ts \
  frameworks/hyperframes/patch-studio.ts
git commit -m "fix(hyperframes): support Studio 0.7.87"
```

### Task 7: Verify the published 0.7.87 package [Tester: yes] `[Group: hyperframes-0-7-87]`

**Files:**
- Create: `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/unit-b-hyperframes-0.7.87.md`

- [ ] **Step 1: Download and extract the exact published package outside the repository tree**

```bash
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

corepack npm pack hyperframes@0.7.87 --pack-destination "$TMP"
tar -xzf "$TMP/hyperframes-0.7.87.tgz" -C "$TMP"
```

Expected: one `hyperframes-0.7.87.tgz` tarball is downloaded; no root package files change.

- [ ] **Step 2: Prove one published bundle matches and patches idempotently**

```bash
PACKAGE_ROOT="$TMP/package" node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const packageRoot = process.env.PACKAGE_ROOT;
assert.ok(packageRoot);

const { patchPinnedStudioBundleSource } = await import(
  pathToFileURL(resolve("frameworks/hyperframes/patches.ts")).href
);

const anchor1 =
  "let l=!1;const c=()=>{if(rr.getState().isEditMode||l)return;";
const anchor2 = "if(!p)return;l=!0;const v=p;fetch(";
const patch1 =
  "let l=!1,hfLast=null;const c=()=>{if(rr.getState().isEditMode||l)return;";
const patch2 =
  "if(!p)return;if(hfLast===p)return;hfLast=p;l=!0;const v=p;fetch(";

const directories = [
  join(packageRoot, "dist", "studio", "assets"),
  join(packageRoot, "bin", "studio", "assets"),
];
const candidates = [];
for (const directory of directories) {
  try {
    for (const name of readdirSync(directory)) {
      if (name.startsWith("index-") && name.endsWith(".js")) {
        candidates.push(join(directory, name));
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const hits = candidates.filter((path) => {
  const source = readFileSync(path, "utf8");
  return source.includes(anchor1) || source.includes(anchor2);
});
assert.equal(hits.length, 1);

const before = readFileSync(hits[0], "utf8");
assert.equal(before.split(anchor1).length - 1, 1);
assert.equal(before.split(anchor2).length - 1, 1);

const once = patchPinnedStudioBundleSource(before);
assert.equal(once.includes(anchor1), false);
assert.equal(once.includes(anchor2), false);
assert.equal(once.split(patch1).length - 1, 1);
assert.equal(once.split(patch2).length - 1, 1);
assert.equal(patchPinnedStudioBundleSource(once), once);

process.stdout.write(JSON.stringify({
  package: "hyperframes",
  version: "0.7.87",
  candidates: candidates.length,
  matchingBundles: hits.length,
  bundle: hits[0].slice(packageRoot.length + 1),
  idempotent: true,
}) + "\n");
NODE
```

Expected: JSON reports `matchingBundles: 1` and `idempotent: true`.

- [ ] **Step 3: Record allowlisted evidence**

Create `evidence/unit-b-hyperframes-0.7.87.md` containing only:

- package and version;
- npm tarball filename;
- candidate and matching bundle counts;
- relative bundle path;
- original and patched marker counts;
- byte-idempotence result;
- focused/full command outcomes.

Do not include the minified bundle body or unrelated package content.

- [ ] **Step 4: Run Unit B verification**

```bash
corepack npm ci
node --test frameworks/hyperframes/__tests__/patch-studio.test.ts
node --test test/cli/hyperframes-self-heal.test.ts
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected: every command exits `0`; the root HyperFrames version remains unchanged because #47 owns the dependency update.

- [ ] **Step 5: Commit the evidence**

```bash
git add -f \
  docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/unit-b-hyperframes-0.7.87.md
git commit -m "docs(hyperframes): record 0.7.87 package verification"
```

- [ ] **Step 6: Run the canonical group lifecycle**

Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel over Tasks 5–7. Resume the same implementer for accepted remediation, rerun all focused/full commands, and require one nested read-only verifier before Task 8.

### Task 8: Publish and land Unit B [Tester: yes]

**Files:** none; this is a protected publication boundary.

- [ ] **Step 1: Verify separation from Unit A and #47**

```bash
git merge-base --is-ancestor origin/main HEAD
git status --short
git diff --name-only origin/main...HEAD
git log --reverse --format='%s' origin/main..HEAD
```

Expected:

- Unit A is already in `origin/main`.
- `package.json` and `package-lock.json` are absent from the Unit B diff.
- The three planned Task 5–7 subjects occur in order. Additional commits are allowed only as focused post-review remediation commits after the affected planned subject; do not amend or reorder planned commits.

- [ ] **Step 2: Obtain authorization for push and PR creation**

Stop and request explicit authorization for pushing `fix/hyperframes-0-7-87` and opening the Unit B PR.

- [ ] **Step 3: Push and create the PR after authorization**

```bash
git push -u origin fix/hyperframes-0-7-87

B_PR_URL=$(gh pr create \
  --repo therealhieu/md2vid \
  --base main \
  --head fix/hyperframes-0-7-87 \
  --title "fix(hyperframes): support Studio 0.7.87" \
  --body "$(printf '%s\n' \
    '## Summary' \
    '- add one exact reviewed rr/p/v Studio layout' \
    '- retain one-variant and one-bundle fail-closed behavior' \
    '- leave package.json unchanged because PR #47 owns the dependency update' \
    '' \
    '## Verification' \
    '- focused patch and self-heal tests' \
    '- published hyperframes@0.7.87 tarball inspection' \
    '- public snapshot, full, and release checks')")

B_PR=$(gh pr view "$B_PR_URL" \
  --repo therealhieu/md2vid \
  --json number \
  --jq .number)
```

- [ ] **Step 4: Require checks and obtain merge authorization**

```bash
gh pr checks "$B_PR" \
  --repo therealhieu/md2vid \
  --required \
  --watch

gh pr checks "$B_PR" \
  --repo therealhieu/md2vid \
  --required \
  --json name,state \
  | jq -e '
      length == 5
      and ([.[].name] | sort) == ([
        "dependency-review",
        "pr-latest / validate",
        "pr-minimum / validate",
        "pr-title",
        "public-snapshot / validate"
      ] | sort)
      and all(.[]; .state == "SUCCESS")
    ' >/dev/null
```

Stop for merge authorization. After authorization:

```bash
gh pr merge "$B_PR" \
  --repo therealhieu/md2vid \
  --squash \
  --delete-branch
```

Never use `--admin`. Confirm Unit B is merged before Part 3.
