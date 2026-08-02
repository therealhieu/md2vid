# Part 5 — Public Snapshot Regeneration and Final Verification

Depends on: `2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-4.md`. Parts 1–4 and their Task 1–11 commits must exist before this part begins.

- [ ] **Task 12: Require narration delivery files in generated and authentic public snapshots** `[Group: narration-public-snapshot]` `[Tester: yes]`

**Files:**
- Modify: `test/ci/public-snapshot.test.ts:786-826`
- Modify: `test/ci/public-snapshot-check.test.ts:63-76`
- Modify: `test/ci/public-snapshot-checkout.test.ts:47-103`

- [ ] **Step 1: Confirm all pre-snapshot implementation is committed**

```bash
set -e
test -z "$(git diff --name-only)"
test -z "$(git diff --cached --name-only)"
UNTRACKED_IMPLEMENTATION=$(git ls-files --others --exclude-standard | grep -Ev '^docs/superpowers/' || true)
test -z "$UNTRACKED_IMPLEMENTATION"
for path in \
  engine/narration_request.ts \
  engine/narration_evidence.ts \
  scripts/narration_check.ts \
  test/release/fixtures/kokoro-am-michael/assets/voice/intro.wav \
  test/release/fixtures/kokoro-am-michael/assets/voice/followup.wav; do
  git cat-file -e "HEAD:$path"
done
```

Expected: exit `0`. Untracked Superpowers planning/review artifacts are allowed; no implementation file may remain uncommitted.

- [ ] **Step 2: Add committed-HEAD snapshot assertions**

Extend the `required` array in `actual repository HEAD snapshot contains required public code and excludes private/generated roots` with:

```ts
const narrationDeliveryPaths = [
  "engine/narration_request.ts",
  "engine/narration_evidence.ts",
  "scripts/narration_check.ts",
  "bin/md2vid.ts",
  "test/cli/narration-check.test.ts",
  "README.md",
  "docs/standards/video-generation.md",
  "docs/standards/frameworks/hyperframes.md",
  "docs/standards/frameworks/remotion.md",
  "skill/md2vid/SKILL.md",
  "skill/md2vid/references/standards/video-generation.md",
  "skill/md2vid/references/standards/frameworks/hyperframes.md",
  "skill/md2vid/references/standards/frameworks/remotion.md",
  "test/release/manifest.ts",
  "test/cli/pack.test.ts",
  "test/cli/package-meta.test.ts",
  "test/release/harness.ts",
  "test/release/harness.test.ts",
  "test/release/run.ts",
  "test/release/fixtures/kokoro-am-michael/audio_request.json",
  "test/release/fixtures/kokoro-am-michael/audio_meta.json",
  "test/release/fixtures/kokoro-am-michael/expected_words.json",
  "test/release/fixtures/kokoro-am-michael/fixture.json",
  "test/release/fixtures/kokoro-am-michael/assets/voice/intro.wav",
  "test/release/fixtures/kokoro-am-michael/assets/voice/followup.wav",
] as const;
```

Use the same loop style as the existing visual-timing entries:

```ts
for (const required of narrationDeliveryPaths) {
  assert.ok(paths.includes(required), `missing actual HEAD narration content: ${required}`);
}
```

Do not add `dist/**`; generated dist is intentionally excluded and is proved by Task 10 package tests.

- [ ] **Step 3: Add tracked-manifest narration assertions**

In `test/ci/public-snapshot-check.test.ts`, add:

```ts
test("tracked public snapshot records narration delivery files", () => {
  const tracked = JSON.parse(readFileSync(join(ROOT, "public-snapshot.json"), "utf8")) as {
    paths: Array<{ path: string }>;
  };
  for (const path of narrationDeliveryPaths) {
    assert.ok(tracked.paths.some((entry) => entry.path === path), `missing ${path}`);
  }
});
```

Define the same explicit `narrationDeliveryPaths` constant in that test file. Do not import it from production or another test; the manifest contract should remain visible at the assertion site.

- [ ] **Step 4: Add authentic checkout retention coverage**

Extend `createSourceRepository()` in `test/ci/public-snapshot-checkout.test.ts` with representative narration files:

```ts
for (const path of [
  "engine/narration_request.ts",
  "engine/narration_evidence.ts",
  "scripts/narration_check.ts",
  "skill/md2vid/SKILL.md",
  "skill/md2vid/references/standards/video-generation.md",
  "test/release/harness.ts",
  "test/release/fixtures/kokoro-am-michael/fixture.json",
]) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), path.endsWith(".json") ? "{}\n" : "export {};\n");
}
mkdirSync(join(root, "test/release/fixtures/kokoro-am-michael/assets/voice"), { recursive: true });
writeFileSync(
  join(root, "test/release/fixtures/kokoro-am-michael/assets/voice/intro.wav"),
  Buffer.from("524946460400000057415645", "hex"),
);
```

Add a sibling to the visual-timing checkout test:

```ts
test("checkout snapshots retain narration public sources", async (t) => {
  const source = createSourceRepository(t);
  const parent = temporaryDirectory(t, "md2vid-snapshot-narration-");
  const snapshot = join(parent, "snapshot");
  const template = join(parent, "empty-template");
  mkdirSync(template);
  buildPublicSnapshot({ repo: source, output: snapshot });
  const checker = await import("../../scripts/check_public_snapshot.ts");
  checker.initializePublicSnapshotRepository(snapshot, template);

  const paths = git(snapshot, ["ls-tree", "-r", "--name-only", "HEAD"]).split("\n");
  for (const path of [
    "engine/narration_request.ts",
    "engine/narration_evidence.ts",
    "scripts/narration_check.ts",
    "skill/md2vid/SKILL.md",
    "skill/md2vid/references/standards/video-generation.md",
    "test/release/harness.ts",
    "test/release/fixtures/kokoro-am-michael/fixture.json",
    "test/release/fixtures/kokoro-am-michael/assets/voice/intro.wav",
  ]) assert.ok(paths.includes(path), `missing ${path}`);
});
```

- [ ] **Step 5: Run generated-snapshot tests and confirm the intended split result**

```bash
node --test test/ci/public-snapshot.test.ts test/ci/public-snapshot-checkout.test.ts
```

Expected: PASS because both tests generate from the already committed Task 1–11 `HEAD`.

Then run the tracked-manifest assertion:

```bash
node --test --test-name-pattern='tracked public snapshot records narration delivery files' test/ci/public-snapshot-check.test.ts
```

Expected: FAIL with `missing engine/narration_request.ts` or the first absent narration path. This is the intended RED state: the generated `public-snapshot.json` must not be hand-edited and cannot include the new test files until this task is committed.

- [ ] **Step 6: Commit the public-snapshot contract before regeneration**

```bash
git add test/ci/public-snapshot.test.ts test/ci/public-snapshot-check.test.ts test/ci/public-snapshot-checkout.test.ts
git commit -m "test(ci): require narration public snapshot coverage"
```

This intermediate commit intentionally carries one stale-manifest failure. Task 13 is in the same coherent group and immediately regenerates the only generated file that can satisfy it.

---

- [ ] **Task 13: Regenerate the committed-HEAD public snapshot and run final repository gates** `[Group: narration-public-snapshot]` `[Tester: yes]`

**Files:**
- Regenerate: `public-snapshot.json`

- [ ] **Step 1: Prove the snapshot source commit contains Task 12**

```bash
set -e
test -z "$(git diff --name-only)"
test -z "$(git diff --cached --name-only)"
UNTRACKED_IMPLEMENTATION=$(git ls-files --others --exclude-standard | grep -Ev '^docs/superpowers/' || true)
test -z "$UNTRACKED_IMPLEMENTATION"
git cat-file -e HEAD:test/ci/public-snapshot.test.ts
git cat-file -e HEAD:test/ci/public-snapshot-check.test.ts
git cat-file -e HEAD:test/ci/public-snapshot-checkout.test.ts
git show HEAD:test/ci/public-snapshot-check.test.ts | grep -q 'tracked public snapshot records narration delivery files'
```

Expected: exit `0`.

- [ ] **Step 2: Regenerate from committed `HEAD` only**

```bash
corepack npm run public:snapshot
```

Expected: exit `0` and `public-snapshot.json` is the only implementation file changed. Do not hand-edit `count`, `hash`, path entries, modes, sizes, or per-path hashes.

- [ ] **Step 3: Inspect generated scope and narration entries**

```bash
set -e
git diff --name-only -- public-snapshot.json
test "$(git diff --name-only | grep -v '^public-snapshot.json$' | wc -l | tr -d ' ')" = 0
node - <<'NODE'
const { readFileSync } = require("node:fs");
const report = JSON.parse(readFileSync("public-snapshot.json", "utf8"));
for (const path of [
  "engine/narration_request.ts",
  "engine/narration_evidence.ts",
  "scripts/narration_check.ts",
  "test/release/fixtures/kokoro-am-michael/assets/voice/intro.wav",
  "test/ci/public-snapshot-check.test.ts",
]) {
  if (!report.paths.some((entry) => entry.path === path)) throw new Error(`generated snapshot missing ${path}`);
}
if (report.paths.some((entry) => entry.path.startsWith("dist/"))) throw new Error("generated snapshot must exclude dist/");
console.log(`PASS: ${report.count} public paths include narration delivery evidence`);
NODE
```

Expected: one changed file and the PASS line.

- [ ] **Step 4: Run snapshot tests and checker**

```bash
corepack npm run public:snapshot:test
corepack npm run public:snapshot:check
```

Expected: PASS. The tracked narration assertion is now green, stale-field protection remains green, and the authentic checkout retains narration sources and retained WAV fixtures.

- [ ] **Step 5: Commit the generated manifest**

```bash
git add public-snapshot.json
git commit -m "chore(public): refresh narration snapshot"
```

- [ ] **Step 6: Run the complete final verification matrix**

```bash
corepack npm run check:skill-references
corepack npm run typecheck
corepack npm run typecheck:remotion
corepack npm test
corepack npm run build:dist
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
git status --short
UNEXPECTED_STATUS=$(git status --porcelain=v1 | grep -Ev '^\?\? docs/superpowers/' || true)
test -z "$UNEXPECTED_STATUS"
```

Expected:

```text
all commands exit 0
skill references are synchronized
narration-check is present in the packed CLI
fixture-backed Kokoro am_michael evidence passes without claiming fresh synthesis
the tracked public snapshot matches committed HEAD
no implementation changes remain
```

`git status --short` may list only intentionally untracked Superpowers requirements, design, plan, goal, check, or canonical review artifacts. Any code, test, fixture, documentation standard, skill, reference, package, release, dist, or snapshot residue is a failure.

## Part 5 and Plan Completion Gate

```bash
corepack npm run check:skill-references && \
corepack npm run check && \
corepack npm run public:snapshot:check && \
corepack npm run release:check && \
git diff --check
```

Expected: PASS from the final Task 13 commit.
