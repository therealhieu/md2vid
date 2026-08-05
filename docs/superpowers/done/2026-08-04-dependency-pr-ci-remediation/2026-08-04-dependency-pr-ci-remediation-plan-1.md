# Dependency PR CI Remediation Implementation Plan — Part 1: Dynamic Snapshot Authority

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the repository-root tracked snapshot mirror while preserving and strengthening committed-tree report validation, generated-manifest integrity, isolated repository construction, package validation, and release smoke.

**Architecture:** `publicSnapshotReport()` becomes the current committed-tree authority. Generated snapshots retain their internal `public-snapshot.json`, which is self-validated before materialization and after parsing; `checkPublicSnapshot()` no longer compares against a second tracked mirror.

**Tech Stack:** TypeScript, Node.js test runner, Git committed-tree objects, SHA-256, npm 11.15.0, public snapshot tooling.

---

### Task 1: Define dynamic authority and report-integrity contracts [Tester: yes] `[Group: dynamic-snapshot]`

**Files:**
- Modify: `test/ci/public-snapshot-check.test.ts:1-138`
- Modify: `test/ci/public-snapshot.test.ts:1-276,662-737,755-784`
- Modify: `test/cli/package-meta.test.ts:1-25,378-394`
- Test: `scripts/public_snapshot.ts`
- Test: `scripts/check_public_snapshot.ts`

- [ ] **Step 1: Create the Unit A worktree and verify the baseline**

```bash
PRIMARY=/Users/hieunguyen/git/hieu/projects/md2vid-public
git -C "$PRIMARY" check-ignore -q .worktrees
git -C "$PRIMARY" fetch origin main
git -C "$PRIMARY" worktree add \
  .worktrees/dynamic-public-snapshot \
  -b fix/dynamic-public-snapshot \
  origin/main
cd "$PRIMARY/.worktrees/dynamic-public-snapshot"

git status --short
git rev-parse HEAD
corepack npm ci
corepack npm run public:snapshot:test
corepack npm run check
```

Expected:

- `git status --short` is empty.
- `HEAD` equals the current `origin/main` commit.
- Focused snapshot tests pass.
- Full check passes with at least the recorded 1,274-test baseline and zero failures.
- Stop before editing if the baseline is red.

- [ ] **Step 2: Replace repository-root manifest readers with the committed dynamic report**

In `test/ci/public-snapshot-check.test.ts`, replace the imports of `assertTrackedPublicSnapshotManifest` and `writePublicSnapshotManifest` with:

```ts
import {
  buildPublicSnapshot,
  publicSnapshotReport,
  type PublicSnapshotReport,
} from "../../scripts/public_snapshot.ts";
```

Add once after `ROOT`:

```ts
const currentReport = publicSnapshotReport(ROOT);
```

Replace the two tracked delivery tests with:

```ts
test("committed public report records visual timing delivery files", () => {
  for (const path of [
    "engine/visual_beats.ts",
    "engine/visual_sync.ts",
    "frameworks/hyperframes/visual_timing.ts",
    "frameworks/remotion/visual_bindings.ts",
    "frameworks/remotion/templates/src/VisualBeats.tsx",
    "scripts/plan.ts",
    "scripts/plan_project.ts",
  ]) {
    assert.ok(
      currentReport.paths.some((entry) => entry.path === path),
      `missing ${path}`,
    );
  }
});

test("committed public report records narration delivery files", () => {
  for (const required of narrationDeliveryPaths) {
    assert.ok(
      currentReport.paths.some((entry) => entry.path === required),
      `missing ${required}`,
    );
  }
});
```

Delete the test named `tracked manifest rejects every stale report field from committed HEAD`.

- [ ] **Step 3: Add committed dependency/workflow authority coverage**

Add to `test/ci/public-snapshot-check.test.ts`:

```ts
test("committed dependency and workflow changes update dynamic authority without a root mirror", (t) => {
  const source = createCommittedPublicSource(t);
  mkdirSync(join(source, ".github", "workflows"), { recursive: true });
  writeFileSync(join(source, "package-lock.json"), '{"lockfileVersion":3}\n');
  writeFileSync(
    join(source, ".github", "workflows", "ci.yml"),
    "name: CI\n",
  );
  git(source, ["add", "--all"]);
  git(source, ["commit", "-m", "add dependency and workflow inputs"]);

  const first = publicSnapshotReport(source);
  assert.equal(existsSync(join(source, "public-snapshot.json")), false);

  writeFileSync(
    join(source, "package-lock.json"),
    '{"lockfileVersion":3,"packages":{}}\n',
  );
  writeFileSync(
    join(source, ".github", "workflows", "ci.yml"),
    "name: CI\npermissions: {}\n",
  );
  git(source, ["add", "--all"]);
  git(source, ["commit", "-m", "update dependency and workflow inputs"]);

  const second = publicSnapshotReport(source);
  assert.notEqual(second.hash, first.hash);
  assert.equal(second.count, first.count);
  assert.equal(existsSync(join(source, "public-snapshot.json")), false);
});
```

Add `existsSync` to the existing `node:fs` import.

- [ ] **Step 4: Add report self-consistency tests**

In `test/ci/public-snapshot.test.ts`, add `createHash` from `node:crypto` if it is not already imported, import `PublicSnapshotReport`, and add:

```ts
function aggregateReportHash(
  paths: PublicSnapshotReport["paths"],
): string {
  const aggregate = createHash("sha256");
  for (const entry of paths) {
    aggregate.update(entry.path);
    aggregate.update("\0");
    aggregate.update(entry.mode);
    aggregate.update("\0");
    aggregate.update(String(entry.bytes));
    aggregate.update("\0");
    aggregate.update(entry.sha256);
    aggregate.update("\n");
  }
  return `sha256:${aggregate.digest("hex")}`;
}

test("report validation rejects count, ordering, path, and aggregate corruption", async () => {
  const module = await import("../../scripts/public_snapshot.ts") as
    typeof import("../../scripts/public_snapshot.ts") &
    Record<string, unknown>;

  assert.equal(typeof module.validatePublicSnapshotReport, "function");
  const validate = module.validatePublicSnapshotReport as
    (report: PublicSnapshotReport) => void;

  const content = Buffer.from("verified\n");
  const path = {
    path: "README.md",
    mode: "100644" as const,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
  const valid: PublicSnapshotReport = {
    formatVersion: 1,
    count: 1,
    paths: [path],
    hash: aggregateReportHash([path]),
    contentScan: { scope: "test", exclusions: [] },
  };

  assert.doesNotThrow(() => validate(valid));

  for (const [label, mutate] of [
    ["count", (report: PublicSnapshotReport) => { report.count += 1; }],
    ["aggregate", (report: PublicSnapshotReport) => {
      report.hash = `sha256:${"0".repeat(64)}`;
    }],
    ["duplicate", (report: PublicSnapshotReport) => {
      report.paths.push({ ...report.paths[0] });
      report.count = report.paths.length;
      report.hash = aggregateReportHash(report.paths);
    }],
    ["unsafe path", (report: PublicSnapshotReport) => {
      report.paths[0].path = "../private";
      report.hash = aggregateReportHash(report.paths);
    }],
    ["invalid mode", (report: PublicSnapshotReport) => {
      (report.paths[0] as { mode: string }).mode = "120000";
      report.hash = aggregateReportHash(report.paths);
    }],
    ["invalid bytes", (report: PublicSnapshotReport) => {
      report.paths[0].bytes = -1;
      report.hash = aggregateReportHash(report.paths);
    }],
    ["invalid sha", (report: PublicSnapshotReport) => {
      report.paths[0].sha256 = "stale";
      report.hash = aggregateReportHash(report.paths);
    }],
  ] as const) {
    const corrupted = structuredClone(valid);
    mutate(corrupted);
    assert.throws(
      () => validate(corrupted),
      /report|count|hash|path|mode|bytes|sha|order|duplicate|public/i,
      label,
    );
  }
});
```

Update the existing passing `verifyMaterializedSnapshot()` fixture so its report is self-consistent:

```ts
const paths: PublicSnapshotReport["paths"] = [{
  path: "README.md",
  mode: "100644",
  bytes: content.byteLength,
  sha256: createHash("sha256").update(content).digest("hex"),
}];

const report: PublicSnapshotReport = {
  formatVersion: 1,
  count: paths.length,
  hash: aggregateReportHash(paths),
  paths,
  contentScan: { scope: "test", exclusions: [] },
};
```

Replace the previous all-zero aggregate hash. Keep the fixture’s staged-file assertions unchanged.

- [ ] **Step 5: Replace both tracked-writer contracts**

Replace the existing `manifest regeneration writes the committed report without self-reference` unit test with:

```ts
test("report generation does not create a repository-root manifest", (t) => {
  const repo = createRepository(t, {
    "README.md": "# Public\n",
    "engine/visual_beats.ts": "export {};\n",
  });

  const first = publicSnapshotReport(repo);
  const second = publicSnapshotReport(repo);

  assert.deepEqual(second, first);
  assert.equal(existsSync(join(repo, PUBLIC_SNAPSHOT_MANIFEST)), false);
});
```

Replace the separate mutating no-argument CLI test with:

```ts
test("no-argument snapshot CLI reports committed HEAD without mutating files", (t) => {
  const repo = createRepository(t, {
    "README.md": "# Public\n",
    "engine/visual_beats.ts": "export {};\n",
  });
  const manifestPath = join(repo, PUBLIC_SNAPSHOT_MANIFEST);
  const sentinel = '{"advisory":"must remain untouched"}\n';
  writeFileSync(manifestPath, sentinel);

  const report = publicSnapshotReport(repo);
  const beforeStatus = git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const result = spawnSync(process.execPath, [SNAPSHOT_CLI], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
  });
  const afterStatus = git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(manifestPath, "utf8"), sentinel);
  assert.equal(afterStatus, beforeStatus);
  assert.match(result.stdout, new RegExp(`${report.count} files ${report.hash}`));
});
```

Replace the `test/ci/public-snapshot.test.ts` snapshot import block with:

```ts
import {
  buildPublicSnapshot,
  publicSnapshotReport,
  parsePublicSnapshotArgs,
  PUBLIC_SNAPSHOT_MANIFEST,
  type PublicSnapshotReport,
} from "../../scripts/public_snapshot.ts";
```

This removes `writePublicSnapshotManifest` and supplies the dynamic report API used by both replacement tests.

- [ ] **Step 6: Change package metadata coverage to use the dynamic report**

In `test/cli/package-meta.test.ts`, add:

```ts
import { publicSnapshotReport } from "../../scripts/public_snapshot.ts";
```

Replace:

```ts
const publicSnapshot = JSON.parse(
  readFileSync(join(REPO_ROOT, "public-snapshot.json"), "utf8"),
) as { paths: Array<{ path: string }> };
```

with:

```ts
const publicSnapshot = publicSnapshotReport(REPO_ROOT);
```

- [ ] **Step 7: Run the focused tests and verify red**

```bash
node --test \
  test/ci/public-snapshot.test.ts \
  test/ci/public-snapshot-check.test.ts \
  test/cli/package-meta.test.ts
```

Expected: FAIL because `validatePublicSnapshotReport` does not exist and the no-argument CLI still overwrites the root manifest.

- [ ] **Step 8: Commit the failing contract**

```bash
git add \
  test/ci/public-snapshot.test.ts \
  test/ci/public-snapshot-check.test.ts \
  test/cli/package-meta.test.ts
git commit -m "test(snapshot): define dynamic public authority"
```

### Task 2: Implement dynamic committed-tree validation [Tester: yes] `[Group: dynamic-snapshot]`

**Files:**
- Modify: `scripts/public_snapshot.ts:1-23,152-183,401-616`
- Modify: `scripts/check_public_snapshot.ts:3-15,55-82,131-148,222-240`
- Delete: `public-snapshot.json`

- [ ] **Step 1: Add report self-validation**

Add after the public report interfaces in `scripts/public_snapshot.ts`:

```ts
export function validatePublicSnapshotReport(
  report: PublicSnapshotReport,
): void {
  if (report.formatVersion !== 1 || !Array.isArray(report.paths)) {
    fail("report format is invalid");
  }
  if (!Number.isSafeInteger(report.count) || report.count < 0) {
    fail("report count must be a non-negative safe integer");
  }
  if (report.count !== report.paths.length) {
    fail(
      `report count ${report.count} does not match paths length ${report.paths.length}`,
    );
  }

  const aggregate = createHash("sha256");
  let previousPath: string | undefined;
  for (const entry of report.paths) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      entry.path.length === 0 ||
      entry.path.includes("\0") ||
      entry.path.includes("\\") ||
      entry.path.split("/").some(
        (segment) => segment.length === 0 || segment === "." || segment === "..",
      ) ||
      !isPublicPath(entry.path)
    ) {
      fail("report contains an invalid or non-public path");
    }
    if (
      previousPath !== undefined &&
      previousPath.localeCompare(entry.path, "en") >= 0
    ) {
      fail("report paths must be unique and strictly ordered");
    }
    if (entry.mode !== "100644" && entry.mode !== "100755") {
      fail(`report path ${entry.path} has invalid mode`);
    }
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
      fail(`report path ${entry.path} has invalid byte length`);
    }
    if (!/^[a-f0-9]{64}$/.test(entry.sha256)) {
      fail(`report path ${entry.path} has invalid SHA-256`);
    }

    aggregate.update(entry.path);
    aggregate.update("\0");
    aggregate.update(entry.mode);
    aggregate.update("\0");
    aggregate.update(String(entry.bytes));
    aggregate.update("\0");
    aggregate.update(entry.sha256);
    aggregate.update("\n");
    previousPath = entry.path;
  }

  const expectedHash = `sha256:${aggregate.digest("hex")}`;
  if (report.hash !== expectedHash) {
    fail(`report aggregate hash differs: expected ${expectedHash}, got ${report.hash}`);
  }
}
```

- [ ] **Step 2: Validate every generated or parsed report before use**

Change `publicSnapshotReport()` to:

```ts
export function publicSnapshotReport(
  repo = process.cwd(),
  ref = "HEAD",
): PublicSnapshotReport {
  const gitRoot = resolveGitRoot(repo);
  const { commit, entries } = parseTree(gitRoot, ref);
  const report = createReport(
    entries,
    scanSelectedContent(gitRoot, commit, entries),
  );
  validatePublicSnapshotReport(report);
  return report;
}
```

In `buildPublicSnapshot()`, insert before `materialize(...)`:

```ts
validatePublicSnapshotReport(report);
```

Start `verifyMaterializedSnapshot()` with:

```ts
validatePublicSnapshotReport(report);
```

- [ ] **Step 3: Make the no-argument CLI non-mutating and remove the root writer API**

Delete `writePublicSnapshotManifest()`.

Change the no-argument branch in `main()` from:

```ts
? writePublicSnapshotManifest()
```

into:

```ts
? publicSnapshotReport()
```

Keep `--output <path> [--ref <commit>]` behavior unchanged.

- [ ] **Step 4: Remove tracked-mirror equality from the checker**

In `scripts/check_public_snapshot.ts`:

- remove `isDeepStrictEqual`;
- remove `publicSnapshotReport` from imports;
- delete `assertTrackedPublicSnapshotManifest()`;
- delete its invocation from `checkPublicSnapshot()`;
- import `validatePublicSnapshotReport`.

After parsing the generated internal manifest in `applyManifestModes()`, add:

```ts
validatePublicSnapshotReport(report);
```

Keep source-commit resolution, package metadata validation, isolated repository initialization, source-history isolation, authentication checks, npm commands, release smoke, and final cleanliness unchanged.

- [ ] **Step 5: Delete the repository-root mirror**

```bash
git rm public-snapshot.json
```

- [ ] **Step 6: Run the focused green verification**

```bash
node --test \
  test/ci/public-snapshot.test.ts \
  test/ci/public-snapshot-check.test.ts \
  test/ci/public-snapshot-checkout.test.ts \
  test/cli/package-meta.test.ts
```

Expected: PASS. Generated snapshots still contain their internal manifest; the repository root no longer requires one.

- [ ] **Step 7: Commit the implementation**

```bash
git add \
  scripts/public_snapshot.ts \
  scripts/check_public_snapshot.ts \
  test/ci/public-snapshot.test.ts \
  test/ci/public-snapshot-check.test.ts \
  test/cli/package-meta.test.ts
git add -u public-snapshot.json
git commit -m "fix(snapshot): validate committed public source dynamically"
```

### Task 3: Supersede tracked-mirror instructions and verify Unit A [Tester: yes] `[Group: dynamic-snapshot]`

**Files:**
- Modify: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-requirements.md`
- Modify: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-design.md`
- Modify: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-goal.md`
- Modify: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-plan.md`
- Modify: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-plan-4.md`
- Do not modify: `2026-08-04-dependabot-automerge-reliability-check.md` or its existing `evidence/` files changed by open PR #52.

- [ ] **Step 1: Add the dynamic-snapshot supersession callout**

Where future execution still instructs contributors to regenerate the root mirror, add:

```markdown
> **Dynamic snapshot supersession:** The repository-root
> `public-snapshot.json` contract was removed by the dependency PR CI
> remediation design. `corepack npm run public:snapshot` is now a non-mutating
> committed-HEAD report, and `corepack npm run public:snapshot:check` performs
> the required committed-tree scan, generated-manifest verification, isolated
> repository construction, package validation, and release smoke. Do not
> regenerate or commit a repository-root snapshot mirror.
```

Replace future-facing regeneration instructions with:

```markdown
Run `corepack npm run public:snapshot` only when a deterministic count/hash
report is useful. It must not change `git status`. The required correctness gate
is `corepack npm run public:snapshot:check`.
```

Do not rewrite completed historical artifacts under `docs/superpowers/done/**`.

- [ ] **Step 2: Verify the no-argument command is non-mutating**

```bash
BEFORE=$(git status --short)
corepack npm run public:snapshot
AFTER=$(git status --short)
test "$AFTER" = "$BEFORE"
test ! -e public-snapshot.json
```

Expected: the command prints count/hash output, does not change status, and does not recreate the root mirror.

- [ ] **Step 3: Run Unit A verification**

```bash
corepack npm run public:snapshot:test
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected:

- every command exits `0`;
- all retained content scanning, generated-manifest verification, isolated repository checks, package checks, and release checks execute;
- the final test count is at least the 1,274-test baseline plus the new tests.

- [ ] **Step 4: Commit the documentation supersession**

```bash
git add \
  docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-requirements.md \
  docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-design.md \
  docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-goal.md \
  docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-plan.md \
  docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-plan-4.md
git commit -m "docs(snapshot): supersede tracked mirror instructions"
```

- [ ] **Step 5: Run the canonical group lifecycle**

Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel over Tasks 1–3. Resume the same implementer for accepted remediation, rerun all focused/full commands above, and require one nested read-only verifier before Task 4.

### Task 4: Publish and land Unit A [Tester: yes]

**Files:** none; this is a protected publication boundary.

- [ ] **Step 1: Verify the branch is ready**

```bash
git status --short
git log --reverse --format='%s' origin/main..HEAD
git diff --check origin/main...HEAD
```

Expected: clean status and these planned subjects present in order:

```text
test(snapshot): define dynamic public authority
fix(snapshot): validate committed public source dynamically
docs(snapshot): supersede tracked mirror instructions
```

Additional commits are allowed only when they are focused post-review remediation commits after the affected planned subject. Do not amend or reorder the planned commits.

- [ ] **Step 2: Obtain authorization for push and PR creation**

Stop and request explicit user authorization for:

1. `git push -u origin fix/dynamic-public-snapshot`;
2. creating the Unit A PR.

Do not proceed on authorization granted for another unit.

- [ ] **Step 3: Push and create the PR after authorization**

```bash
git push -u origin fix/dynamic-public-snapshot

A_PR_URL=$(gh pr create \
  --repo therealhieu/md2vid \
  --base main \
  --head fix/dynamic-public-snapshot \
  --title "fix(snapshot): validate committed public source dynamically" \
  --body "$(printf '%s\n' \
    '## Summary' \
    '- remove the repository-root tracked snapshot mirror' \
    '- validate the current committed tree dynamically' \
    '- preserve content scanning, generated-manifest verification, package checks, and release smoke' \
    '' \
    '## Verification' \
    '- corepack npm run public:snapshot:test' \
    '- corepack npm run public:snapshot:check' \
    '- corepack npm run check' \
    '- corepack npm run release:check' \
    '- git diff --check')")

A_PR=$(gh pr view "$A_PR_URL" \
  --repo therealhieu/md2vid \
  --json number \
  --jq .number)
```

- [ ] **Step 4: Require all five remote checks**

```bash
gh pr checks "$A_PR" \
  --repo therealhieu/md2vid \
  --required \
  --watch

gh pr checks "$A_PR" \
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

- [ ] **Step 5: Obtain merge authorization and land through protection**

Stop and request explicit authorization before merge. After authorization:

```bash
gh pr merge "$A_PR" \
  --repo therealhieu/md2vid \
  --squash \
  --delete-branch
```

Never use `--admin`. Confirm read-only that the PR is merged before Part 2.
