# Stabilize md2vid CLI Workflows — Plan Part 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish strict shared CLI and project contracts before changing mutation-heavy workflows.

**Architecture:** A dependency-free parser built on `node:util.parseArgs()` handles help, option types, and positional arity. A pure layout resolver gives every project command the same flat/canonical paths. Planning preserves voice identity while deriving sequence order, and verification requires valid configuration instead of silently selecting a framework.

**Tech Stack:** Node.js `util.parseArgs`, TypeScript, `node:test`.

---

## Task 1: Shared strict command parser [Tester: yes] `[Group: cli-foundation]`

**Tester:** `yes` — this changes argument behavior across every public command.

**Files:**
- Create: `scripts/cli_args.ts`
- Create: `test/cli/cli-args.test.ts`
- Modify: `scripts/new_video.ts:14-27,69-82`
- Modify: `scripts/build.ts:28-36`
- Modify: `scripts/regroup.ts:22-43`
- Modify: `scripts/transcribe.ts:17-30`
- Modify: `scripts/verify.ts:28-50`
- Modify: `scripts/install_skill.ts`
- Modify: `frameworks/hyperframes/patch-studio.ts`
- Modify: `test/cli/router.test.ts`
- Modify: `test/cli/run-exports.test.ts`
- Test: `frameworks/hyperframes/__tests__/patch-studio.test.ts`

- [ ] **Step 1: Write parser unit tests**

Create `test/cli/cli-args.test.ts` with explicit behavior:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseCommand } from "../../scripts/cli_args.ts";

const SPEC = {
  command: "build",
  usage: "Usage: md2vid build <output-dir> [--captions-only]",
  options: {
    "captions-only": { type: "boolean" as const },
  },
  minPositionals: 1,
  maxPositionals: 1,
};

test("parses declared options and one positional", () => {
  assert.deepEqual(parseCommand(SPEC, ["demo", "--captions-only"]), {
    kind: "ok",
    values: { "captions-only": true },
    positionals: ["demo"],
  });
});

test("help wins over missing required positionals", () => {
  assert.deepEqual(parseCommand(SPEC, ["--help"]), { kind: "help" });
  assert.deepEqual(parseCommand(SPEC, ["-h"]), { kind: "help" });
});

test("rejects an unknown option using its original spelling", () => {
  const result = parseCommand(SPEC, ["demo", "--captions-onyl"]);
  assert.equal(result.kind, "error");
  if (result.kind !== "error") return;
  assert.match(result.message, /--captions-onyl/);
  assert.equal(result.usage, SPEC.usage);
});

test("rejects excess positionals", () => {
  const result = parseCommand(SPEC, ["one", "two"]);
  assert.equal(result.kind, "error");
  if (result.kind !== "error") return;
  assert.match(result.message, /expected exactly 1 positional argument/);
});

test("rejects missing string option values", () => {
  const result = parseCommand({
    command: "new",
    usage: "Usage: md2vid new <slug> [--framework <name>]",
    options: { framework: { type: "string" as const } },
    minPositionals: 1,
    maxPositionals: 1,
  }, ["demo", "--framework"]);
  assert.equal(result.kind, "error");
  if (result.kind !== "error") return;
  assert.match(result.message, /--framework/);
});
```

- [ ] **Step 2: Run the parser test and verify RED**

Run:

```bash
node --test test/cli/cli-args.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/cli_args.ts`.

- [ ] **Step 3: Implement `scripts/cli_args.ts`**

Implement the complete helper:

```ts
import { parseArgs, type ParseArgsConfig } from "node:util";

export interface CommandSpec {
  command: string;
  usage: string;
  options?: ParseArgsConfig["options"];
  minPositionals: number;
  maxPositionals: number;
}

export type CommandParseResult =
  | { kind: "help" }
  | {
      kind: "ok";
      values: Record<string, string | boolean | undefined>;
      positionals: string[];
    }
  | { kind: "error"; message: string; usage: string };

function positionalMessage(spec: CommandSpec, actual: number): string {
  if (spec.minPositionals === spec.maxPositionals) {
    return `${spec.command}: expected exactly ${spec.minPositionals} positional argument(s), got ${actual}`;
  }
  return `${spec.command}: expected ${spec.minPositionals}-${spec.maxPositionals} positional arguments, got ${actual}`;
}

export function parseCommand(spec: CommandSpec, argv: string[]): CommandParseResult {
  if (argv.includes("--help") || argv.includes("-h")) return { kind: "help" };

  try {
    const parsed = parseArgs({
      args: argv,
      options: spec.options ?? {},
      strict: true,
      allowPositionals: true,
      tokens: true,
    });
    if (
      parsed.positionals.length < spec.minPositionals
      || parsed.positionals.length > spec.maxPositionals
    ) {
      return {
        kind: "error",
        message: positionalMessage(spec, parsed.positionals.length),
        usage: spec.usage,
      };
    }
    return {
      kind: "ok",
      values: parsed.values as Record<string, string | boolean | undefined>,
      positionals: parsed.positionals,
    };
  } catch (error: unknown) {
    return {
      kind: "error",
      message: (error as Error).message,
      usage: spec.usage,
    };
  }
}
```

Keep help pre-detection before `parseArgs()`, so an incomplete string option followed by `--help` still displays help rather than an option-value error.

- [ ] **Step 4: Run parser tests and verify GREEN**

Run:

```bash
node --test test/cli/cli-args.test.ts
```

Expected: all parser tests PASS.

- [ ] **Step 5: Migrate `new`, `build`, `regroup`, `transcribe`, and `verify`**

For each command:

1. Declare a constant usage string.
2. Call `parseCommand()` before resolving paths or touching files.
3. On `{ kind: "help" }`, print command-specific help to stdout and return `0`.
4. On `{ kind: "error" }`, print the normalized message and usage to stderr and return `2`.
5. On success, read typed values and exact positionals.

Example for `scripts/build.ts`:

```ts
const USAGE = "Usage: md2vid build <output-dir> [--captions-only]";

function parseBuildArgs(argv: string[]) {
  return parseCommand({
    command: "build",
    usage: USAGE,
    options: { "captions-only": { type: "boolean" } },
    minPositionals: 1,
    maxPositionals: 1,
  }, argv);
}

export function run(argv: string[]): number {
  const parsed = parseBuildArgs(argv);
  if (parsed.kind === "help") {
    console.log(USAGE);
    return 0;
  }
  if (parsed.kind === "error") {
    console.error(parsed.message);
    console.error(parsed.usage);
    return 2;
  }
  const OUTPUT = resolve(parsed.positionals[0]);
  const captionsOnly = parsed.values["captions-only"] === true;
  // existing command body follows
}
```

Use schemas:

```ts
new:        options { framework: string }, positionals 1..1
build:      options { "captions-only": boolean }, positionals 1..1
regroup:    options { "max-chars": string, "dry-run": boolean }, positionals 1..1
transcribe: options {}, positionals 1..1
verify:     options { "max-chars": string }, positionals 1..1
```

After parsing, retain existing semantic validation such as kebab-case slugs and numeric `--max-chars`, but classify invalid CLI values as exit `2` and print usage.

- [ ] **Step 6: Migrate `install-skill` and `patch-studio`**

Use the same contract. `patch-studio` may accept its existing hidden bundle-path positional seam, but must reject a second positional. `hyperframes` remains an untouched passthrough because its arguments belong to the package-owned HyperFrames CLI.

- [ ] **Step 7: Add router behavior tests**

Extend `test/cli/router.test.ts` with a table-driven subprocess test:

```ts
for (const command of ["new", "build", "regroup", "transcribe", "verify", "patch-studio", "install-skill"]) {
  test(`${command} supports subcommand help`, () => {
    for (const flag of ["-h", "--help"]) {
      const result = runCli([command, flag]);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /Usage:/);
      assert.equal(result.stderr, "");
    }
  });
}
```

Add command-specific typo and excess positional cases. For mutating commands, snapshot the temporary directory tree before and after and assert deep equality.

- [ ] **Step 8: Run focused command tests**

Run:

```bash
node --test \
  test/cli/cli-args.test.ts \
  test/cli/router.test.ts \
  test/cli/run-exports.test.ts \
  frameworks/hyperframes/__tests__/patch-studio.test.ts
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add \
  scripts/cli_args.ts \
  scripts/new_video.ts \
  scripts/build.ts \
  scripts/regroup.ts \
  scripts/transcribe.ts \
  scripts/verify.ts \
  scripts/install_skill.ts \
  frameworks/hyperframes/patch-studio.ts \
  test/cli/cli-args.test.ts \
  test/cli/router.test.ts \
  test/cli/run-exports.test.ts \
  frameworks/hyperframes/__tests__/patch-studio.test.ts
git commit -m "refactor(cli): add strict command parsing"
```

## Task 2: Shared flat/canonical layout resolver [Tester: yes] `[Group: cli-foundation]` `[S after Task 1]`

**Tester:** `yes` — this changes path selection for four public commands.

**Files:**
- Create: `scripts/project_layout.ts`
- Create: `test/cli/project-layout.test.ts`
- Modify: `scripts/build.ts:43-56`
- Modify: `scripts/regroup.ts:45-57`
- Modify: `scripts/transcribe.ts:23-30`
- Modify: `scripts/verify.ts:52-69`
- Modify: `test/cli/run-exports.test.ts`

- [ ] **Step 1: Write failing layout tests**

Create `test/cli/project-layout.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { resolveProjectLayout } from "../../scripts/project_layout.ts";

function root() {
  return mkdtempSync(join(tmpdir(), "md2vid-layout-"));
}

test("uses sibling shared directory for canonical layout", () => {
  const dir = root();
  const output = join(dir, "hyperframes");
  mkdirSync(output);
  mkdirSync(join(dir, "shared"));
  assert.deepEqual(resolveProjectLayout(output), {
    outputDir: resolve(output),
    sharedDir: resolve(dir, "shared"),
    flat: false,
  });
});

test("falls back to output directory for flat layout", () => {
  const dir = root();
  const output = join(dir, "demo");
  mkdirSync(output);
  assert.deepEqual(resolveProjectLayout(output), {
    outputDir: resolve(output),
    sharedDir: resolve(output),
    flat: true,
  });
});

test("ignores a sibling regular file named shared", () => {
  const dir = root();
  const output = join(dir, "demo");
  mkdirSync(output);
  writeFileSync(join(dir, "shared"), "not a directory");
  assert.equal(resolveProjectLayout(output).flat, true);
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
node --test test/cli/project-layout.test.ts
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement `scripts/project_layout.ts`**

```ts
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

export interface ProjectLayout {
  outputDir: string;
  sharedDir: string;
  flat: boolean;
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

export function resolveProjectLayout(outputDir: string): ProjectLayout {
  const output = resolve(outputDir);
  const siblingShared = resolve(output, "..", "shared");
  if (isDirectory(siblingShared)) {
    return { outputDir: output, sharedDir: siblingShared, flat: false };
  }
  return { outputDir: output, sharedDir: output, flat: true };
}
```

- [ ] **Step 4: Replace all local layout logic**

In `build`, `regroup`, `transcribe`, and `verify`, resolve once:

```ts
const { outputDir: OUTPUT, sharedDir: SHARED, flat } = resolveProjectLayout(parsed.positionals[0]);
```

Do not add secondary file-based fallback rules. A canonical sibling `shared/` directory is authoritative; missing files inside it must produce errors under that directory.

For `transcribe`, add injectable dependencies so tests can verify the selected base without invoking Whisper:

```ts
interface TranscribeDependencies {
  transcribeVoices?: typeof transcribeVoices;
}

export function run(argv: string[], deps: TranscribeDependencies = {}): number {
  const transcribe = deps.transcribeVoices ?? transcribeVoices;
  // ...
  const { ok, total } = transcribe(meta, SHARED);
}
```

- [ ] **Step 5: Add command-level path consistency tests**

In `test/cli/run-exports.test.ts`, create a canonical output and a flat output missing `audio_meta.json`; invoke build/transcribe and assert every error names the same expected `sharedDir`. For regroup and verify, assert their missing neutral artifact diagnostics also use that directory.

- [ ] **Step 6: Run focused tests**

```bash
node --test \
  test/cli/project-layout.test.ts \
  test/cli/run-exports.test.ts \
  test/cli/router.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add \
  scripts/project_layout.ts \
  scripts/build.ts \
  scripts/regroup.ts \
  scripts/transcribe.ts \
  scripts/verify.ts \
  test/cli/project-layout.test.ts \
  test/cli/run-exports.test.ts
git commit -m "refactor(cli): centralize project layout resolution"
```

## Task 3: Stable voice identity and numeric sequence order [Tester: yes] `[Group: project-contract]` `[S after Task 2]`

**Tester:** `yes` — this changes neutral planning semantics used by both adapters.

**Files:**
- Modify: `engine/plan.ts:20-99`
- Modify: `engine/__tests__/plan.test.ts`
- Modify: `test/cli/run-exports.test.ts`
- Test: `test/golden/golden.test.ts`

- [ ] **Step 1: Add failing planner tests**

Extend `engine/__tests__/plan.test.ts`:

```ts
test("keeps meaningful IDs while deriving frame order", () => {
  const result = plan({ voices: [
    voice("intro", "Intro"),
    voice("details", "Details"),
    voice("recap", "Recap"),
  ] }, config({ intro: "01-intro", details: "02-details", recap: "03-recap" }));

  assert.deepEqual(result.frames.map(({ id, frameNum, slug }) => ({ id, frameNum, slug })), [
    { id: "intro", frameNum: 1, slug: "01-intro" },
    { id: "details", frameNum: 2, slug: "02-details" },
    { id: "recap", frameNum: 3, slug: "03-recap" },
  ]);
  assert.deepEqual(result.captionGroups.map((group) => group.frame), [1, 2, 3]);
});

test("rejects duplicate voice IDs", () => {
  assert.throws(
    () => plan({ voices: [voice("intro", "One"), voice("intro", "Two")] }, config({ intro: "01-intro" })),
    /duplicate voice id "intro"/,
  );
});

test("rejects empty voice IDs and missing slug mappings", () => {
  assert.throws(() => plan({ voices: [voice(" ", "One")] }, config({})), /non-empty string/);
  assert.throws(() => plan({ voices: [voice("intro", "One")] }, config({})), /missing slug mapping for voice id "intro"/);
});

test("supports prototype-like IDs through own-property lookup", () => {
  const slugs = Object.create(null) as Record<string, string>;
  slugs.constructor = "01-constructor";
  const result = plan({ voices: [voice("constructor", "One")] }, config(slugs));
  assert.equal(result.frames[0].slug, "01-constructor");
});
```

Retain existing numeric fixtures to prove compatibility.

- [ ] **Step 2: Run planner tests and verify RED**

```bash
node --test engine/__tests__/plan.test.ts
```

Expected: meaningful-ID test fails because `frameNum` is `NaN`; validation tests fail because duplicate/empty IDs are accepted.

- [ ] **Step 3: Implement preflight identity validation**

Before timeline construction in `engine/plan.ts`:

```ts
const seen = new Set<string>();
for (const [index, voice] of voices.entries()) {
  if (typeof voice.id !== "string" || voice.id.trim().length === 0) {
    throw new Error(`voice at index ${index} has invalid id — expected a non-empty string`);
  }
  if (seen.has(voice.id)) throw new Error(`duplicate voice id "${voice.id}"`);
  seen.add(voice.id);
  if (!Object.hasOwn(SLUGS, voice.id) || typeof SLUGS[voice.id] !== "string" || SLUGS[voice.id].trim() === "") {
    throw new Error(`missing slug mapping for voice id "${voice.id}"`);
  }
}
```

Then construct frames with:

```ts
frameNum: i + 1,
```

Keep `id`, `slug`, and all timing behavior unchanged.

- [ ] **Step 4: Add build non-mutation regressions**

In `test/cli/run-exports.test.ts`, create sentinel contents for neutral and framework outputs, run build with duplicate IDs and missing mappings, then assert each sentinel remains byte-for-byte unchanged. This proves planner validation occurs before `scripts/build.ts` writes IR or calls the adapter.

- [ ] **Step 5: Run planner, golden, and command tests**

```bash
node --test \
  engine/__tests__/plan.test.ts \
  test/golden/golden.test.ts \
  test/cli/run-exports.test.ts
```

Expected: PASS; numeric golden output remains unchanged.

- [ ] **Step 6: Commit**

```bash
git add engine/plan.ts engine/__tests__/plan.test.ts test/cli/run-exports.test.ts
git commit -m "fix(engine): separate voice identity from frame order"
```

## Task 4: Strict configuration-driven verification [Tester: yes] `[Group: project-contract]` `[S after Task 2]`

**Tester:** `yes` — verifier behavior is a release gate for both frameworks.

**Files:**
- Modify: `scripts/verify.ts:52-112`
- Create or modify: `test/cli/workflows.test.ts`
- Test: `engine/__tests__/verify.test.ts`
- Test: `frameworks/hyperframes/__tests__/verify.test.ts`
- Test: `frameworks/remotion/__tests__/verify.test.ts`

- [ ] **Step 1: Write failing strict-config workflow tests**

Add cases to `test/cli/workflows.test.ts` using temporary projects:

```ts
test("verify fails when neutral config is missing even if emitted files exist", () => {
  const project = validHyperframesProject();
  rmSync(join(project.shared, "video.config.json"));
  const result = captureConsole(() => verifyRun([project.output]));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /video\.config\.json/);
  assert.doesNotMatch(result.stdout, /video contract satisfied/);
});

test("verify reports malformed output config instead of assuming HyperFrames", () => {
  const project = validRemotionProject();
  writeFileSync(join(project.output, "output.config.json"), "{bad json");
  const result = captureConsole(() => verifyRun([project.output]));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /output\.config\.json/);
});
```

Add cases for unknown framework, malformed neutral config, missing output directory, valid canonical config, and the explicit valid flat legacy HyperFrames case.

- [ ] **Step 2: Run workflow tests and verify RED**

```bash
node --test test/cli/workflows.test.ts
```

Expected: missing/malformed config cases currently pass or report irrelevant HyperFrames findings.

- [ ] **Step 3: Remove blanket framework fallback**

Refactor `scripts/verify.ts` so `run()` performs:

```ts
const layout = resolveProjectLayout(parsed.positionals[0]);
if (!isDir(layout.outputDir)) throw new VerifyError(`not a directory: ${layout.outputDir}`);
const config = loadConfig(layout.sharedDir, layout.outputDir);
const adapter = getAdapter(config.framework);
```

Delete `frameworkFor()` and its `catch`.

If a valid legacy flat config can omit framework, implement that default inside `loadConfig()` or a narrowly named helper that only runs after valid JSON is loaded. Do not default after parse/read errors.

Wrap project work in `try/catch`:

```ts
} catch (error: unknown) {
  console.error(`FAIL: ${(error as Error).message}`);
  return 1;
}
```

Argument errors remain handled before this block with exit `2`. Print problem lines and the failure summary to stderr; keep warnings/success on stdout.

- [ ] **Step 4: Run focused verifier tests**

```bash
node --test \
  test/cli/workflows.test.ts \
  engine/__tests__/verify.test.ts \
  frameworks/hyperframes/__tests__/verify.test.ts \
  frameworks/remotion/__tests__/verify.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify.ts test/cli/workflows.test.ts
git commit -m "fix(cli): require valid configuration during verify"
```
