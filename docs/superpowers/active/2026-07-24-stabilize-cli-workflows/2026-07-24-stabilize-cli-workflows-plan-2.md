# Stabilize md2vid CLI Workflows — Plan Part 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make caption regrouping failure-atomic across neutral and framework-owned artifacts.

**Architecture:** Validate and calculate entirely in memory, emit captions into mirrored staging directories, validate staged artifacts through framework-owned hooks, then promote managed files with rollback. The transaction helper owns only safe project-relative files and never claims multi-file crash atomicity.

**Tech Stack:** Node.js filesystem APIs, TypeScript dependency injection, framework adapter interfaces, `node:test`.

---

## Task 5: Failure-atomic caption regroup transaction [Tester: yes]

**Tester:** `yes` — this changes a mutation-heavy shared command and both adapter contracts.

**Files:**
- Create: `scripts/managed_file_transaction.ts`
- Create: `test/cli/managed-file-transaction.test.ts`
- Modify: `engine/types.ts:50-70`
- Modify: `scripts/regroup.ts:45-92`
- Modify: `frameworks/hyperframes/index.ts`
- Modify: `frameworks/hyperframes/emit.ts`
- Modify: `frameworks/hyperframes/verify.ts`
- Modify: `frameworks/remotion/index.ts`
- Modify: `frameworks/remotion/emit.ts`
- Modify: `frameworks/remotion/verify.ts`
- Modify: `test/cli/workflows.test.ts`
- Modify: `frameworks/hyperframes/__tests__/emit.test.ts`
- Modify: `frameworks/remotion/__tests__/emit.test.ts`
- Modify: `frameworks/hyperframes/__tests__/verify.test.ts`
- Modify: `frameworks/remotion/__tests__/verify.test.ts`
- Test: `test/golden/golden.test.ts`

- [ ] **Step 1: Write managed-file transaction tests**

Create `test/cli/managed-file-transaction.test.ts`. Use injected filesystem operations so promotion and restoration failures are deterministic.

Required test setup:

```ts
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  promoteManagedFiles,
  type ManagedFileTransactionDependencies,
} from "../../scripts/managed_file_transaction.ts";

function root() {
  return mkdtempSync(join(tmpdir(), "md2vid-transaction-"));
}
```

Add exact cases:

```ts
test("promotes all staged files", () => {
  const dir = root();
  mkdirSync(join(dir, "stage"));
  writeFileSync(join(dir, "a.json"), "old-a");
  writeFileSync(join(dir, "b.html"), "old-b");
  writeFileSync(join(dir, "stage", "a.json"), "new-a");
  writeFileSync(join(dir, "stage", "b.html"), "new-b");

  promoteManagedFiles(dir, [
    { target: "a.json", staged: join(dir, "stage", "a.json") },
    { target: "b.html", staged: join(dir, "stage", "b.html") },
  ]);

  assert.equal(readFileSync(join(dir, "a.json"), "utf8"), "new-a");
  assert.equal(readFileSync(join(dir, "b.html"), "utf8"), "new-b");
});

test("restores all originals if the second promotion fails", () => {
  const dir = root();
  // create originals and staged replacements as above
  let promotions = 0;
  const deps: ManagedFileTransactionDependencies = {
    rename(source, destination) {
      if (source.includes("stage") && ++promotions === 2) throw new Error("injected promote failure");
      renameSync(source, destination);
    },
  };
  assert.throws(() => promoteManagedFiles(dir, files, deps), /injected promote failure/);
  assert.equal(readFileSync(join(dir, "a.json"), "utf8"), "old-a");
  assert.equal(readFileSync(join(dir, "b.html"), "utf8"), "old-b");
});
```

Also test:

- absolute target rejection;
- `../` traversal rejection;
- duplicate normalized target rejection;
- symlink target rejection;
- symlink parent rejection;
- missing staged file rejection before backups are made;
- rollback removes a newly created target that had no original;
- unrelated sentinel files remain unchanged;
- invocation-owned backup files are removed after success;
- staging files are removed after success/failure;
- restoration failure throws `AggregateError` and retains the recoverable backup path in the message.

- [ ] **Step 2: Run transaction tests and verify RED**

```bash
node --test test/cli/managed-file-transaction.test.ts
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement safe target resolution**

Create `scripts/managed_file_transaction.ts` with these public types:

```ts
import {
  existsSync,
  lstatSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export interface ManagedFile {
  target: string;
  staged: string;
}

export interface ManagedFileTransactionDependencies {
  exists?: typeof existsSync;
  lstat?: typeof lstatSync;
  mkdir?: typeof mkdirSync;
  rename?: typeof renameSync;
  remove?: typeof rmSync;
}
```

Implement a resolver that rejects absolute paths, empty segments, `.`, `..`, backslashes, and paths escaping `root`:

```ts
function managedTarget(root: string, target: string): string {
  if (isAbsolute(target) || target.includes("\\")) {
    throw new Error(`unsafe managed target: ${target}`);
  }
  const parts = target.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`unsafe managed target: ${target}`);
  }
  const absolute = resolve(root, target);
  const rel = relative(root, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`managed target escapes project root: ${target}`);
  }
  return absolute;
}
```

Walk each existing parent from `root` to the target and reject symbolic links with `lstatSync().isSymbolicLink()`. Reject a symlink target itself.

- [ ] **Step 4: Implement backup, promotion, and rollback**

Use invocation-owned sibling backup names derived from a fixed transaction suffix and an incrementing index; do not use randomness or timestamps in tests. The implementation sequence must be:

```text
1. Resolve and deduplicate every target.
2. Confirm every staged source is a regular file.
3. Confirm targets and existing parents are not symlinks.
4. Rename each existing target to its backup.
5. Rename each staged file to its target.
6. Remove backups after all promotions succeed.
7. On failure, remove promoted new targets and restore backups in reverse order.
```

Core structure:

```ts
export function promoteManagedFiles(
  rootInput: string,
  files: ManagedFile[],
  deps: ManagedFileTransactionDependencies = {},
): void {
  const root = resolve(rootInput);
  const rename = deps.rename ?? renameSync;
  const remove = deps.remove ?? rmSync;
  const operations = prepareOperations(root, files, deps);
  const backedUp: Operation[] = [];
  const promoted: Operation[] = [];

  try {
    for (const operation of operations) {
      if (!operation.hadOriginal) continue;
      rename(operation.target, operation.backup);
      backedUp.push(operation);
    }
    for (const operation of operations) {
      rename(operation.staged, operation.target);
      promoted.push(operation);
    }
    for (const operation of backedUp) remove(operation.backup, { force: true });
  } catch (cause) {
    const restoreErrors: Error[] = [];
    for (const operation of [...promoted].reverse()) {
      try { remove(operation.target, { force: true }); } catch (error) { restoreErrors.push(error as Error); }
    }
    for (const operation of [...backedUp].reverse()) {
      try { rename(operation.backup, operation.target); } catch (error) { restoreErrors.push(error as Error); }
    }
    if (restoreErrors.length) {
      throw new AggregateError([cause as Error, ...restoreErrors], "managed file promotion failed and rollback was incomplete");
    }
    throw cause;
  }
}
```

Do not remove backup files when restoration fails; they are the recovery path.

- [ ] **Step 5: Run transaction tests and verify GREEN**

```bash
node --test test/cli/managed-file-transaction.test.ts
```

Expected: PASS.

- [ ] **Step 6: Extend the framework adapter caption contract**

Update `engine/types.ts` so each adapter declares the managed artifact produced by captions-only emission and can validate staged output:

```ts
export interface EmitOptions {
  captionsOnly?: boolean;
  runtimeSourceDir?: string;
}

export interface CaptionArtifactContext {
  sharedDir: string;
  outputDir: string;
  captionGroupsPath: string;
}

export interface FrameworkAdapter {
  name: string;
  emit(
    plan: BuildPlan,
    sharedDir: string,
    outputDir: string,
    config: VideoConfig,
    options?: EmitOptions,
  ): void;
  captionArtifactPath: string;
  verifyCaptionArtifact(context: CaptionArtifactContext): VerifyFinding[];
  // retain existing scaffold and full verify members
}
```

Use exact repo type names for `BuildPlan`, `VideoConfig`, and `VerifyFinding`; if current names differ, import and reuse them rather than creating duplicate types.

- [ ] **Step 7: Implement HyperFrames staged caption support**

In the HyperFrames adapter:

```ts
captionArtifactPath: "compositions/captions.html",
verifyCaptionArtifact: verifyHyperframesCaptionArtifact,
```

Extract the current caption JSON-versus-baked-`GROUPS` comparison from `frameworks/hyperframes/verify.ts` into a focused exported function accepting explicit paths. The function must report:

- missing staged caption HTML;
- missing or malformed baked `var GROUPS`;
- byte/structure mismatch between staged neutral groups and baked groups.

When `emit()` is writing to staging and `config.gsapSrc` is a local project path, validate/read that runtime source from `options.runtimeSourceDir ?? outputDir`; write generated files into `outputDir`. This avoids falsely requiring staged output to already contain the project's local GSAP source.

Add tests to `frameworks/hyperframes/__tests__/emit.test.ts` for captions-only emission into staging with both CDN and local GSAP configurations.

- [ ] **Step 8: Implement Remotion staged caption support**

Use:

```ts
captionArtifactPath: "build_plan.json",
verifyCaptionArtifact: verifyRemotionCaptionArtifact,
```

The focused verifier reads staged `build_plan.json`, compares its serialized `captionGroups` to staged `caption_groups.json`, and reports missing/malformed/mismatched artifacts. Do not typecheck or render during regroup; full framework checks remain in `npm run check`.

Add focused tests to `frameworks/remotion/__tests__/emit.test.ts` and `frameworks/remotion/__tests__/verify.test.ts`.

- [ ] **Step 9: Write failing regroup rollback tests**

In `test/cli/workflows.test.ts`, create helpers that seed:

```text
shared/caption_groups.json = ORIGINAL_JSON
output/compositions/captions.html = ORIGINAL_HTML
```

or for Remotion:

```text
shared/caption_groups.json = ORIGINAL_JSON
output/build_plan.json = ORIGINAL_PLAN
```

Inject or fixture failures at:

- config load;
- planning;
- adapter captions-only emit;
- staged caption verification;
- first promotion;
- second promotion.

After each failure:

```ts
assert.equal(readFileSync(neutralPath, "utf8"), ORIGINAL_JSON);
assert.equal(readFileSync(frameworkPath, "utf8"), ORIGINAL_FRAMEWORK);
assert.deepEqual(findTransactionResidue(projectRoot), []);
```

- [ ] **Step 10: Rewrite `scripts/regroup.ts` around staging**

Required order:

```ts
const layout = resolveProjectLayout(parsed.positionals[0]);
const data = readCaptionGroups(layout.sharedDir);
const meta = readAudioMeta(layout.sharedDir);
const config = loadConfig(layout.sharedDir, layout.outputDir);
const adapter = getAdapter(config.framework);
const plan = buildPlan(meta, config);
const newGroups = regroup(data.groups, maxChars);
```

For `--dry-run`, report stats and return before creating staging.

For a real update:

1. Create an invocation-owned staging root using `mkdtempSync()` inside the flat project root or canonical project parent.
2. Mirror `shared/` and framework output subdirectories under staging.
3. Write staged `caption_groups.json` with `newGroups`.
4. Build a staged plan whose `captionGroups` equals `newGroups`; do not re-run grouping from the original plan.
5. Call adapter `emit(..., { captionsOnly: true, runtimeSourceDir: layout.outputDir })` against staged paths.
6. Call `adapter.verifyCaptionArtifact()` against staged paths.
7. If findings contain errors, throw before promotion.
8. Promote the neutral and adapter-declared framework artifact with `promoteManagedFiles()`.
9. Remove the staging root in `finally`.
10. Print `wrote` and `re-emitted` only after promotion succeeds.

Use a helper to replace the plan groups without mutating the original plan:

```ts
const regroupedPlan = { ...plan, captionGroups: newGroups };
```

Preserve `total_duration_s`, width, and height from the existing neutral JSON.

- [ ] **Step 11: Run all caption and adapter tests**

```bash
node --test \
  test/cli/managed-file-transaction.test.ts \
  test/cli/workflows.test.ts \
  frameworks/hyperframes/__tests__/emit.test.ts \
  frameworks/remotion/__tests__/emit.test.ts \
  frameworks/hyperframes/__tests__/verify.test.ts \
  frameworks/remotion/__tests__/verify.test.ts \
  test/golden/golden.test.ts
```

Expected: PASS. Golden canonical HyperFrames output remains byte-identical.

- [ ] **Step 12: Run typechecks**

```bash
npm run typecheck
npm run typecheck:remotion
```

Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add \
  scripts/managed_file_transaction.ts \
  scripts/regroup.ts \
  engine/types.ts \
  frameworks/hyperframes/index.ts \
  frameworks/hyperframes/emit.ts \
  frameworks/hyperframes/verify.ts \
  frameworks/remotion/index.ts \
  frameworks/remotion/emit.ts \
  frameworks/remotion/verify.ts \
  test/cli/managed-file-transaction.test.ts \
  test/cli/workflows.test.ts \
  frameworks/hyperframes/__tests__/emit.test.ts \
  frameworks/remotion/__tests__/emit.test.ts \
  frameworks/hyperframes/__tests__/verify.test.ts \
  frameworks/remotion/__tests__/verify.test.ts
git commit -m "fix(captions): make regroup failure-atomic"
```
