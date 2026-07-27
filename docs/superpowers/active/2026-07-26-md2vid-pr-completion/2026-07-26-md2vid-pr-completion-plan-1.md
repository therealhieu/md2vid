# Finish md2vid PR #12 — Plan Part 1: Correctness and Review Fixes

> **Dependency:** Start after the approved design. Complete every task in this part before Part 2.
>
> **Commit exception:** The approved release constraint overrides the usual per-task commit rule. Do not commit or push the active branch in this part. Keep the reviewed candidate in the working tree; Part 2 creates a throwaway validation commit without moving the active branch.

## Task 1: Add the safe, unique slug validator [Tester: yes] `[Group: slug-contract]`

**Purpose:** Reject unsafe paths, HTML-breaking identifiers, duplicate slug ownership, and incomplete mappings at the configuration boundary.

**Files:**
- Modify: `engine/config.ts:1-127`
- Test: `engine/__tests__/config.test.ts`

- [x] **Step 1: Extend the config test import and add unsafe-slug tests**

Update the import from `../config.ts`:

```ts
import {
  loadConfig,
  validateSlugMappings,
  validateVideoConfig,
} from "../config.ts";
```

Add:

```ts
test("rejects unsafe slug grammar without echoing the unsafe value", () => {
  const unsafeSlugs = [
    "../outside",
    "nested/frame",
    String.raw`nested\frame`,
    "two words",
    'x" data-start="999',
    ".",
    "..",
    String.fromCharCode(0) + "intro",
    "intro&tag",
  ];

  for (const slug of unsafeSlugs) {
    assert.throws(
      () =>
        validateVideoConfig(
          { slugs: { intro: slug } },
          "video.config.json",
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(
          error.message,
          /invalid configuration at video\.config\.json: field "slugs\.intro" must be a safe single path segment matching \^\[A-Za-z0-9\]\[A-Za-z0-9\._-\]\*\$/,
        );
        assert.equal(error.message.includes(slug), false);
        return true;
      },
      slug,
    );
  }
});

test("rejects duplicate slug values and identifies the second mapping", () => {
  assert.throws(
    () =>
      validateVideoConfig(
        {
          slugs: {
            intro: "01-intro",
            recap: "01-intro",
          },
        },
        "video.config.json",
      ),
    /invalid configuration at video\.config\.json: field "slugs\.recap" must be unique; already mapped by voice id "intro"/,
  );
});

test("preserves valid existing slug forms", () => {
  const config = {
    slugs: {
      intro: "01-intro",
      loadFactor: "05-load-factor",
      revision: "intro.v2_main",
    },
  };

  assert.equal(validateVideoConfig(config, "video.config.json"), config);
});

test("requires one slug mapping for every supplied voice ID", () => {
  assert.throws(
    () =>
      validateSlugMappings(
        { intro: "01-intro" },
        "video.config.json",
        ["intro", "recap"],
      ),
    /missing slug mapping for voice id "recap"/,
  );

  assert.throws(
    () =>
      validateSlugMappings(
        {
          intro: "01-intro",
          extra: "02-extra",
        },
        "video.config.json",
        ["intro"],
      ),
    /unknown slug mapping for voice id "extra"/,
  );
});
```

- [x] **Step 2: Run the config tests and verify RED**

Run:

```bash
node --test engine/__tests__/config.test.ts
```

Expected: non-zero exit because `validateSlugMappings` is not exported yet, or because unsafe and duplicate values do not throw. The failure must be feature-missing, not a syntax or fixture error.

- [x] **Step 3: Add the shared slug validator**

In `engine/config.ts`, near the existing record/string validation helpers, add:

```ts
const SAFE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function validateSlugMappings(
  value: unknown,
  path: string,
  voiceIds?: readonly string[],
): Record<string, string> {
  if (!isRecord(value)) {
    invalid(path, "slugs", "must be a non-null, non-array object");
  }

  const owners = new Map<string, string>();

  for (const [id, slug] of Object.entries(value)) {
    if (typeof slug !== "string" || !SAFE_SLUG.test(slug)) {
      invalid(
        path,
        `slugs.${id}`,
        "must be a safe single path segment matching ^[A-Za-z0-9][A-Za-z0-9._-]*$",
      );
    }

    const previousOwner = owners.get(slug);
    if (previousOwner !== undefined) {
      invalid(
        path,
        `slugs.${id}`,
        `must be unique; already mapped by voice id "${previousOwner}"`,
      );
    }

    owners.set(slug, id);
  }

  if (voiceIds !== undefined) {
    const expectedVoiceIds = new Set(voiceIds);

    for (const voiceId of voiceIds) {
      if (!Object.hasOwn(value, voiceId)) {
        throw new Error(
          `invalid configuration at ${path}: missing slug mapping for voice id "${voiceId}"`,
        );
      }
    }

    for (const voiceId of Object.keys(value)) {
      if (!expectedVoiceIds.has(voiceId)) {
        throw new Error(
          `invalid configuration at ${path}: unknown slug mapping for voice id "${voiceId}"`,
        );
      }
    }
  }

  return value as Record<string, string>;
}
```

In `validateVideoConfig()`, replace the existing `slugs` object/non-empty-string loop with:

```ts
const slugs = value.slugs;
if (slugs !== undefined) {
  validateSlugMappings(slugs, path);
}
```

Do not change `VideoConfig`; runtime validation is required even though `slugs` is statically typed as `Record<string, string>`.

- [x] **Step 4: Run the config tests and verify GREEN**

Run:

```bash
node --test engine/__tests__/config.test.ts
```

Expected: exit `0`; unsafe values, duplicate values, missing mappings, and unknown mappings are rejected while `01-intro`, `05-load-factor`, and `intro.v2_main` remain accepted.

- [x] **Step 5: Checkpoint without committing**

Run:

```bash
git status --short
git diff --check
```

Expected: only intentional candidate files are modified/untracked; whitespace check exits `0`. Do not commit.

## Task 2: Protect direct planning and full builds [Tester: yes] `[Group: slug-contract]` `[S after Task 1]`

**Purpose:** Ensure callers that bypass `loadConfig()` still receive the complete slug contract, and prove invalid mappings cannot mutate generated outputs.

**Files:**
- Modify: `engine/plan.ts:1-90`
- Test: `engine/__tests__/plan.test.ts`
- Test: `test/cli/workflows.test.ts`

- [x] **Step 1: Add direct planner regression tests**

Add to `engine/__tests__/plan.test.ts`:

```ts
test("direct plan callers reject unsafe slug mappings", () => {
  for (const slug of ["../outside", "nested/frame", 'x" data-start="999']) {
    assert.throws(
      () =>
        plan(
          meta([V("intro", 5, [{ text: "Intro", start: 0, end: 1 }])]),
          CFG({ slugs: { intro: slug } }),
        ),
      /field "slugs\.intro".*safe single path segment/i,
      slug,
    );
  }
});

test("direct plan callers reject duplicate slug ownership", () => {
  assert.throws(
    () =>
      plan(
        meta([
          V("intro", 5, [{ text: "Intro", start: 0, end: 1 }]),
          V("recap", 5, [{ text: "Recap", start: 0, end: 1 }]),
        ]),
        CFG({
          slugs: {
            intro: "01-intro",
            recap: "01-intro",
          },
        }),
      ),
    /field "slugs\.recap".*unique.*voice id "intro"/i,
  );
});

test("direct plan callers reject unknown slug mappings", () => {
  assert.throws(
    () =>
      plan(
        meta([V("intro", 5, [{ text: "Intro", start: 0, end: 1 }])]),
        CFG({
          slugs: {
            intro: "01-intro",
            extra: "02-extra",
          },
        }),
      ),
    /unknown slug mapping for voice id "extra"/,
  );
});
```

- [x] **Step 2: Add full-build pre-mutation regressions for both frameworks**

Near the existing `fullBuildProject()` and `assertFullBuildOriginals()` tests in `test/cli/workflows.test.ts`, add:

```ts
const invalidSlugCases = [
  {
    name: "path traversal",
    slugs: {
      intro: "../outside",
      details: "02-details",
      recap: "03-recap",
    },
    expected: /field "slugs\.intro".*safe single path segment/i,
  },
  {
    name: "duplicate ownership",
    slugs: {
      intro: "01-intro",
      details: "01-intro",
      recap: "03-recap",
    },
    expected: /field "slugs\.details".*unique.*voice id "intro"/i,
  },
] as const;

for (const framework of ["hyperframes", "remotion"] as const) {
  for (const { name, slugs, expected } of invalidSlugCases) {
    test(`full ${framework} build rejects ${name} before managed output mutation`, () => {
      const project = fullBuildProject(framework);

      try {
        const configPath = join(project.sharedDir, "video.config.json");
        const config = JSON.parse(readFileSync(configPath, "utf8")) as {
          slugs: Record<string, string>;
        };
        config.slugs = slugs;
        writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

        const result = captureConsole(() => buildRun([project.outputDir]));

        assert.equal(result.code, 1, result.stderr);
        assert.match(result.stderr, expected);
        assertFullBuildOriginals(project);
      } finally {
        rmSync(project.root, { recursive: true, force: true });
      }
    });
  }
}
```

`assertFullBuildOriginals()` must continue to prove neutral files, framework files, voice files, authored source, and staging residue are unchanged.

- [x] **Step 3: Run planner and workflow tests and verify RED**

Run:

```bash
node --test engine/__tests__/plan.test.ts
node --test test/cli/workflows.test.ts
```

Expected: non-zero exits because direct planning and full builds currently accept at least the unsafe and duplicate mappings.

- [x] **Step 4: Call the shared validator before timeline construction**

In `engine/plan.ts`, add:

```ts
import { validateSlugMappings } from "./config.ts";
```

After audio metadata validation and before timeline/caption construction, validate voice identities and slugs:

```ts
const seen = new Set<string>();
const voiceIds: string[] = [];

for (const [index, voice] of voices.entries()) {
  if (typeof voice.id !== "string" || voice.id.trim().length === 0) {
    throw new Error(
      `voice at index ${index} has invalid id — expected a non-empty string`,
    );
  }

  if (seen.has(voice.id)) {
    throw new Error(`duplicate voice id "${voice.id}"`);
  }

  seen.add(voice.id);
  voiceIds.push(voice.id);
}

const SLUGS = validateSlugMappings(
  config.slugs === undefined ? {} : config.slugs,
  "video.config.json",
  voiceIds,
);
```

Remove the old raw-slug shape check and per-frame missing-mapping branch. Keep frame construction simple:

```ts
const frames: PlanFrame[] = voices.map((v, i) => {
  const id = v.id;
  const slug = SLUGS[id];
  const isLast = i === voices.length - 1;
  const start = cursor;
  const frameDur = isLast ? v.duration_s : v.duration_s + GAP + XFADE;
  cursor += isLast ? v.duration_s : v.duration_s + GAP;

  return {
    id,
    frameNum: i + 1,
    slug,
    voicePath: v.path,
    voiceDur: v.duration_s,
    frameDur,
    start,
    words: v.words,
  };
});
```

Required ordering:

```text
validate audio metadata
→ validate voice IDs
→ validate complete/safe/unique slug ownership
→ compute timeline
→ compute captions
```

- [x] **Step 5: Run planner and workflow tests and verify GREEN**

Run:

```bash
node --test engine/__tests__/plan.test.ts
node --test test/cli/workflows.test.ts
corepack npm run typecheck
```

Expected: exit `0` for all commands. Existing timing, caption globalization, prototype-like ID, flat/canonical, and atomic full-build tests remain green.

- [x] **Step 6: Checkpoint without committing**

Run:

```bash
git status --short
git diff --check
```

Expected: only intentional candidate files are changed. Do not commit.

## Task 3: Reject regular-file build projects [Tester: yes]

**Purpose:** Report `not a directory` before layout or metadata lookup when the build argument is a regular file.

**Files:**
- Modify: `scripts/build.ts:19-27,142-160`
- Test: `test/cli/run-exports.test.ts:91-110`

- [x] **Step 1: Add the regular-file regression test**

Add after the existing build valid/missing-directory tests:

```ts
test("build rejects a regular-file project path before layout lookup", async () => {
  const run = await runOf("build.ts");
  const root = mkdtempSync(join(tmpdir(), "run-exports-build-file-"));
  const projectFile = join(root, "project.md");

  try {
    writeFileSync(
      projectFile,
      "# This is a file, not a project directory\n",
    );

    const result = await captureRun(run, [projectFile]);

    assert.equal(result.code, 1);
    assert.equal(
      result.stderr,
      `FAIL: not a directory: ${resolve(projectFile)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

The current test imports already provide `resolve`, `mkdtempSync`, `writeFileSync`, and `rmSync`; do not duplicate imports.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test \
  --test-name-pattern='build rejects a regular-file project path before layout lookup' \
  test/cli/run-exports.test.ts
```

Expected: assertion failure because stderr reports missing `audio_meta.json` under the regular-file path.

- [x] **Step 3: Validate the resolved project before layout resolution**

In `scripts/build.ts`, add `statSync` to the `node:fs` import and `resolve` to the `node:path` import while retaining `lstatSync`.

At the beginning of the build `try` block, before `resolveProjectLayout()`:

```ts
const requestedOutput = resolve(parsed.positionals[0]);
if (
  !existsSync(requestedOutput) ||
  !statSync(requestedOutput).isDirectory()
) {
  throw new BuildError(`not a directory: ${requestedOutput}`);
}

const layout = resolveProjectLayout(requestedOutput);
const { outputDir: OUTPUT, sharedDir: SHARED } = layout;
```

Then continue with:

```ts
const metaPath = join(SHARED, "audio_meta.json");
if (!existsSync(metaPath)) {
  throw new BuildError(missingAudioMeta(metaPath));
}
```

This intentionally accepts a symlink resolving to a directory, matching `scripts/verify.ts`.

- [x] **Step 4: Run focused and build-related tests and verify GREEN**

Run:

```bash
node --test \
  --test-name-pattern='build rejects a regular-file project path before layout lookup' \
  test/cli/run-exports.test.ts
node --test --test-name-pattern='build:' test/cli/run-exports.test.ts
corepack npm run typecheck
```

Expected: exit `0`; missing directories and regular files report `not a directory`, while valid builds and atomic-output cases remain green.

- [x] **Step 5: Checkpoint without committing**

Run:

```bash
git status --short
git diff --check
```

Expected: intentional changes only. Do not commit.

## Task 4: Restore direct Remotion caption verification [Tester: yes]

**Purpose:** Make `verify(videoDir)` inspect `videoDir/caption_groups.json` when no explicit shared directory is supplied.

**Files:**
- Modify: `frameworks/remotion/verify.ts:52-100`
- Test: `frameworks/remotion/__tests__/verify.test.ts`

- [x] **Step 1: Add an omitted-sharedDir mismatch test**

Add:

```ts
test("verify uses videoDir for caption verification when sharedDir is omitted", () => {
  const dir = goodProject();

  try {
    writeFileSync(
      join(dir, "caption_groups.json"),
      JSON.stringify({
        groups: [
          {
            id: "mismatch",
            frame: 1,
            start: 0,
            end: 1,
            text: "different",
            words: [],
          },
        ],
      }),
    );

    const errors = verify(dir).filter(
      (finding) => finding.level === "error",
    );
    const messages = errors.map((finding) => finding.msg);

    assert.ok(
      messages.some((message) =>
        message.includes(
          "caption_groups.json and staged build_plan.json captionGroups differ in content",
        ),
      ),
      JSON.stringify(messages),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test \
  --test-name-pattern='verify uses videoDir for caption verification when sharedDir is omitted' \
  frameworks/remotion/__tests__/verify.test.ts
```

Expected: assertion failure with an empty error list because the current implementation skips caption verification without `sharedDir`.

- [x] **Step 3: Resolve one effective shared directory**

Replace the conditional `if (sharedDir)` block in `frameworks/remotion/verify.ts` with:

```ts
const effectiveSharedDir = sharedDir ?? videoDir;
const captionGroupsPath = join(
  effectiveSharedDir,
  "caption_groups.json",
);

if (existsSync(captionGroupsPath)) {
  findings.push(
    ...verifyRemotionCaptionArtifact({
      sharedDir: effectiveSharedDir,
      outputDir: videoDir,
      captionGroupsPath,
    }),
  );
}
```

Keep the public signature unchanged:

```ts
export function verify(
  videoDir: string,
  sharedDir?: string,
  options: VerifyOptions = {},
): Finding[]
```

Do not add sibling-directory detection and do not modify Remotion emission.

- [x] **Step 4: Run focused and full verifier tests and verify GREEN**

Run:

```bash
node --test \
  --test-name-pattern='verify uses videoDir for caption verification when sharedDir is omitted' \
  frameworks/remotion/__tests__/verify.test.ts
node --test frameworks/remotion/__tests__/verify.test.ts
corepack npm run typecheck
```

Expected: exit `0`; explicit `sharedDir` behavior and all existing verifier cases remain unchanged.

- [x] **Step 5: Checkpoint without committing**

Run:

```bash
git status --short
git diff --check
```

Expected: intentional changes only. Do not commit.

## Task 5: Correct plan headings and the final whitespace gate [Tester: yes]

**Purpose:** Remove the existing Markdown hierarchy warnings and ensure the final runbook checks both committed branch changes and working-tree changes.

**Files:**
- Modify: `docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-plan-1.md`
- Modify: `docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-plan-2.md`
- Modify: `docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-plan-3.md`
- Modify: `docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-plan-4.md`
- Modify: `docs/superpowers/active/2026-07-24-md-to-video-e2e/2026-07-24-md-to-video-e2e-final-gate-checklist.md:50-90`
- Test: `test/cli/package-meta.test.ts`

- [x] **Step 1: Add the final-gate document loader**

Near the existing document constants in `test/cli/package-meta.test.ts`, add:

```ts
const finalGateChecklist = readFileSync(
  join(
    REPO_ROOT,
    "docs",
    "superpowers",
    "active",
    "2026-07-24-md-to-video-e2e",
    "2026-07-24-md-to-video-e2e-final-gate-checklist.md",
  ),
  "utf8",
);
```

- [x] **Step 2: Add the whitespace-gate contract test**

Add:

```ts
test("final gate checks committed and working-tree whitespace", () => {
  assert.match(
    finalGateChecklist,
    /corepack npm run release:check\ngit diff --check main\.\.\.HEAD\ngit diff --check\n/,
  );
  assert.match(
    finalGateChecklist,
    /`git diff --check main\.\.\.HEAD` exits `0`\./,
  );
  assert.match(
    finalGateChecklist,
    /`git diff --check` exits `0`\./,
  );
});
```

- [x] **Step 3: Run the focused contract test and verify RED**

Run:

```bash
node --test \
  --test-name-pattern='final gate checks committed and working-tree whitespace' \
  test/cli/package-meta.test.ts
```

Expected: non-zero exit because the checklist currently has only bare `git diff --check`.

- [x] **Step 4: Update the final-gate matrix and record fields**

In `2026-07-24-md-to-video-e2e-final-gate-checklist.md`, make the matrix end with:

```bash
corepack npm run release:check
git diff --check main...HEAD
git diff --check
```

Replace the single assertion with:

```md
- [ ] `git diff --check main...HEAD` exits `0`.
- [ ] `git diff --check` exits `0`.
```

Replace:

```text
diff check:
```

with:

```text
committed diff check:
working-tree diff check:
```

- [x] **Step 5: Correct all nine task headings**

Change only these task heading prefixes from `###` to `##`:

```text
plan-1.md: Tasks 1, 2, 3, 4
plan-2.md: Task 5
plan-3.md: Tasks 6, 7
plan-4.md: Tasks 8, 9
```

Resulting form:

```md
# Stabilize md2vid CLI Workflows — Plan Part N

## Task N: ...
```

Do not alter shell comments inside fenced code blocks.

- [x] **Step 6: Verify the document fixes**

Run:

```bash
node --test \
  --test-name-pattern='final gate checks committed and working-tree whitespace' \
  test/cli/package-meta.test.ts
node --test test/cli/package-meta.test.ts

if grep -n '^### Task' \
  docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-plan-{1,2,3,4}.md; then
  exit 1
fi

grep -n '^## Task' \
  docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-plan-{1,2,3,4}.md
```

Expected:

- both Node test commands exit `0`;
- the H3 check produces no matches;
- the H2 command prints nine task headings.

- [x] **Step 7: Run the combined focused suite**

Run:

```bash
node --test \
  engine/__tests__/config.test.ts \
  engine/__tests__/plan.test.ts \
  test/cli/workflows.test.ts \
  test/cli/run-exports.test.ts \
  frameworks/remotion/__tests__/verify.test.ts \
  test/cli/package-meta.test.ts
corepack npm run typecheck
corepack npm run typecheck:remotion
git diff --check main...HEAD
git diff --check
```

Expected: every command exits `0`.

- [x] **Step 8: Freeze Part 1 without committing**

Run:

```bash
git status --short
git diff --stat
git diff --check
```

Expected: all changes correspond to the approved design and this plan. Do not commit or push. Continue to Part 2.
