# Stabilize md2vid CLI Workflows — Plan Part 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated projects truthful, self-guiding, verification-gated, and content-neutral.

**Architecture:** Common scaffolding owns framework-neutral scripts and narration examples. Framework scaffold specs append their validation commands and exact next steps. Remotion's default scene registry becomes empty while its current rich hash-table implementation moves to a public opt-in example.

**Tech Stack:** TypeScript scaffold generators, JSON templates, HyperFrames, Remotion/React, `node:test`.

---

## Task 6: Truthful narration-to-preview scaffolds [Tester: yes] `[Group: scaffolds]`

**Tester:** `yes` — generated package scripts and onboarding files are public API.

**Files:**
- Modify: `scripts/scaffold_project.ts:14-81,93-120`
- Modify: `frameworks/hyperframes/scaffold.ts:82-99`
- Modify: `frameworks/remotion/scaffold.ts:33-66`
- Modify: `scripts/build.ts`
- Modify: `scripts/transcribe.ts`
- Modify: `test/cli/scaffold-project.test.ts`
- Modify: `test/cli/scaffold-decoupled.test.ts`
- Modify: `test/scaffold.test.ts`

- [ ] **Step 1: Add failing common scaffold assertions**

In `test/cli/scaffold-project.test.ts`, assert the merged package and generated files exactly:

```ts
test("common scaffold exposes a verified workflow", () => {
  const project = scaffold("demo", hyperframesAdapter);
  const pkg = readJson(join(project, "package.json"));
  assert.equal(pkg.scripts.build, "md2vid build . && md2vid regroup . --max-chars 54");
  assert.equal(pkg.scripts.verify, "md2vid verify .");
  assert.equal(
    pkg.scripts.check,
    "md2vid verify . && md2vid hyperframes lint && md2vid hyperframes validate && md2vid hyperframes inspect",
  );

  const request = readJson(join(project, "audio_request.json.example"));
  assert.deepEqual(request, {
    lines: [
      { id: "intro", text: "Introduce the topic." },
      { id: "recap", text: "Recap the key idea." },
    ],
  });
  assert.equal(existsSync(join(project, "audio_meta.json")), false);
});
```

Add a common scaffold validation test that deletes `audio_request.json.example` and expects `validateCommonScaffold()` to fail with its exact path.

- [ ] **Step 2: Add failing framework script and next-step tests**

HyperFrames expected scripts:

```json
{
  "build": "md2vid build . && md2vid regroup . --max-chars 54",
  "transcribe": "md2vid transcribe .",
  "verify": "md2vid verify .",
  "check": "md2vid verify . && md2vid hyperframes lint && md2vid hyperframes validate && md2vid hyperframes inspect",
  "dev": "md2vid hyperframes preview --no-open",
  "publish": "md2vid hyperframes publish",
  "render": "md2vid hyperframes render"
}
```

Remotion expected scripts:

```json
{
  "build": "md2vid build . && md2vid regroup . --max-chars 54",
  "transcribe": "md2vid transcribe .",
  "verify": "md2vid verify .",
  "check": "md2vid verify . && tsc --noEmit -p tsconfig.json",
  "typecheck": "tsc --noEmit -p tsconfig.json",
  "still": "node render.ts --still",
  "render": "node render.ts",
  "studio": "remotion studio src/index.ts"
}
```

Assert exact next steps:

```ts
const HYPERFRAMES_STEPS = [
  "review audio_request.json.example and generate narration",
  "author frames in compositions/frames/",
  "fill video.config.json voice-id -> frame-slug mappings",
  "npm run build",
  "npm run check",
  "npm run dev",
];

const REMOTION_STEPS = [
  "npm install",
  "review audio_request.json.example and generate narration",
  "author and register src/scenes/*.tsx",
  "fill video.config.json voice-id -> frame-slug mappings",
  "npm run build",
  "npm run check",
  "npm run still or npm run studio",
];
```

Use these strings in both scaffold spec tests and CLI output tests to prevent drift.

- [ ] **Step 3: Run scaffold tests and verify RED**

```bash
node --test \
  test/cli/scaffold-project.test.ts \
  test/cli/scaffold-decoupled.test.ts \
  test/scaffold.test.ts
```

Expected: missing example/verify/check assertions fail.

- [ ] **Step 4: Generate the narration example centrally**

In `scripts/scaffold_project.ts`, add:

```ts
const AUDIO_REQUEST_EXAMPLE = {
  lines: [
    { id: "intro", text: "Introduce the topic." },
    { id: "recap", text: "Recap the key idea." },
  ],
};
```

Write it in `writeCommonScaffold()`:

```ts
writeJson(join(stageDir, "audio_request.json.example"), AUDIO_REQUEST_EXAMPLE);
```

Add it to `validateCommonScaffold()`'s required files.

Update the neutral config comment so it describes stable IDs, not numeric frame IDs:

```ts
$comment:
  "Map every audio_meta voices[].id to its frame slug. Voice IDs may be meaningful strings; frame order follows the voices[] array. gap=0 is back-to-back; gap>0 adds a held landing.",
```

- [ ] **Step 5: Compose generated checks centrally**

Change `FrameworkScaffoldSpec` so an adapter supplies `frameworkCheck` rather than a complete conflicting `check` script. In `mergePackageManifest()`:

```ts
const commonScripts = {
  build: "md2vid build . && md2vid regroup . --max-chars 54",
  transcribe: "md2vid transcribe .",
  verify: "md2vid verify .",
  check: `md2vid verify . && ${spec.frameworkCheck}`,
};
```

Reject adapter scripts named `build`, `transcribe`, `verify`, or `check` to keep ownership clear.

Adapter values:

```ts
// HyperFrames
frameworkCheck: "md2vid hyperframes lint && md2vid hyperframes validate && md2vid hyperframes inspect"

// Remotion
frameworkCheck: "tsc --noEmit -p tsconfig.json"
```

Retain Remotion's `typecheck` script as a direct convenience alias.

- [ ] **Step 6: Update framework next steps**

Replace each `nextSteps` array with the exact strings asserted in Step 2. Do not mention nonexistent commands. Do not render automatically.

- [ ] **Step 7: Improve missing-audio errors**

Create a shared message helper near the layout/error utilities or duplicate only the constant string if introducing a helper would be less clear:

```ts
function missingAudioMeta(path: string): string {
  return `missing audio_meta.json at ${path}\nCreate narration with the /md2vid audio step or follow README.md#narration.`;
}
```

Use it in `scripts/build.ts` and `scripts/transcribe.ts`. Preserve exit `1` because the project is incomplete, not because CLI usage is invalid.

Add tests asserting both lines and the resolved flat/canonical path.

- [ ] **Step 8: Run scaffold and command tests**

```bash
node --test \
  test/cli/scaffold-project.test.ts \
  test/cli/scaffold-decoupled.test.ts \
  test/scaffold.test.ts \
  test/cli/run-exports.test.ts \
  test/cli/router.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add \
  scripts/scaffold_project.ts \
  scripts/build.ts \
  scripts/transcribe.ts \
  frameworks/hyperframes/scaffold.ts \
  frameworks/remotion/scaffold.ts \
  test/cli/scaffold-project.test.ts \
  test/cli/scaffold-decoupled.test.ts \
  test/scaffold.test.ts \
  test/cli/run-exports.test.ts \
  test/cli/router.test.ts
git commit -m "feat(scaffold): add verified narration workflow"
```

## Task 7: Neutral Remotion default with opt-in hash-table example [Tester: yes] `[Group: scaffolds]` `[S after Task 6]`

**Tester:** `yes` — this changes every newly generated Remotion project's visual source tree.

**Files:**
- Modify: `frameworks/remotion/templates/src/Video.tsx:1-67`
- Delete from default template:
  - `frameworks/remotion/templates/src/scenes/CoverScene.tsx`
  - `frameworks/remotion/templates/src/scenes/CoreIdeaScene.tsx`
  - `frameworks/remotion/templates/src/scenes/LookupFlowScene.tsx`
  - `frameworks/remotion/templates/src/scenes/CollisionsScene.tsx`
  - `frameworks/remotion/templates/src/scenes/LoadFactorScene.tsx`
  - `frameworks/remotion/templates/src/scenes/WhyMattersScene.tsx`
  - `frameworks/remotion/templates/src/scenes/RecapScene.tsx`
- Create: `examples/hash-table/remotion/README.md`
- Create: `examples/hash-table/remotion/video.config.json`
- Create: `examples/hash-table/remotion/output.config.json`
- Create: `examples/hash-table/remotion/src/Video.tsx`
- Create: `examples/hash-table/remotion/src/scenes/*.tsx` (the seven moved scenes)
- Modify: `frameworks/remotion/__tests__/scaffold.test.ts`
- Modify: `test/cli/scaffold-decoupled.test.ts`
- Create: `test/examples/hash-table-remotion.test.ts`
- Test: `frameworks/remotion/templates/tsconfig.json`

- [ ] **Step 1: Write failing neutral scaffold tests**

Update `frameworks/remotion/__tests__/scaffold.test.ts`:

```ts
test("default Remotion scaffold is content-neutral", () => {
  const dir = createScaffold();
  const video = readFileSync(join(dir, "src", "Video.tsx"), "utf8");
  assert.match(video, /const SCENES: Record<string, React\.FC<SceneProps>> = \{\};/);
  assert.match(video, /return <TitleCard/);

  const tree = readTextTree(join(dir, "src"));
  for (const forbidden of [
    "Hash table",
    "DATA STRUCTURES",
    "LookupFlowScene",
    "CollisionsScene",
    "LoadFactorScene",
  ]) {
    assert.doesNotMatch(tree, new RegExp(forbidden, "i"));
  }
});
```

Retain and strengthen the existing sentinel test proving `ensureRuntime()` does not overwrite an authored `src/Video.tsx` or scene.

- [ ] **Step 2: Write failing opt-in example tests**

Create `test/examples/hash-table-remotion.test.ts`:

```ts
const EXPECTED_SCENES = [
  "CoverScene",
  "CoreIdeaScene",
  "LookupFlowScene",
  "CollisionsScene",
  "LoadFactorScene",
  "WhyMattersScene",
  "RecapScene",
];

test("hash-table Remotion example retains all scene routes", () => {
  const video = readFileSync("examples/hash-table/remotion/src/Video.tsx", "utf8");
  for (const scene of EXPECTED_SCENES) {
    assert.match(video, new RegExp(scene));
    assert.equal(existsSync(join("examples/hash-table/remotion/src/scenes", `${scene}.tsx`)), true);
  }
  for (const slug of ["01-cover", "02-core-idea", "03-lookup-flow", "04-collisions", "05-load-factor", "06-why-matters", "07-recap"]) {
    assert.match(video, new RegExp(JSON.stringify(slug)));
  }
});
```

Add an overlay test:

1. Scaffold a temporary neutral Remotion project.
2. Copy example `src/Video.tsx` and `src/scenes/` into it using the README procedure.
3. Place an unrelated sentinel in `src/custom.tsx`.
4. Assert every example file exists and the sentinel remains unchanged.

- [ ] **Step 3: Run Remotion scaffold tests and verify RED**

```bash
node --test \
  frameworks/remotion/__tests__/scaffold.test.ts \
  test/cli/scaffold-decoupled.test.ts \
  test/examples/hash-table-remotion.test.ts
```

Expected: default still contains hash-table routes and example path is missing.

- [ ] **Step 4: Make the default registry empty**

In `frameworks/remotion/templates/src/Video.tsx`:

- Remove all seven scene imports.
- Keep `humanize`, `TitleCard`, `SceneRouter`, `Audio` inside each `Sequence`, root `Captions`, and current transition calculation.
- Replace the registry with:

```ts
const SCENES: Record<string, React.FC<SceneProps>> = {};
```

Remove the now-empty default `src/scenes/` files. The scaffold's runtime copier may still create `src/`; it does not need to create an empty scenes directory unless existing conventions require it.

- [ ] **Step 5: Move the current hash-table implementation into `examples/`**

Copy the current pre-change `Video.tsx` and seven scene components verbatim into `examples/hash-table/remotion/src/`. Adjust imports only when their paths differ from the default template.

The example config must use the seven matching mappings:

```json
{
  "timing": { "tail": 0.5, "xfade": 0.5, "gap": 0.5 },
  "canvas": { "width": 1920, "height": 1080 },
  "slugs": {
    "cover": "01-cover",
    "core": "02-core-idea",
    "lookup": "03-lookup-flow",
    "collisions": "04-collisions",
    "load-factor": "05-load-factor",
    "why": "06-why-matters",
    "recap": "07-recap"
  }
}
```

`output.config.json`:

```json
{ "framework": "remotion" }
```

The example README must give exact steps:

```text
1. md2vid new hash-table --framework remotion
2. npm install
3. copy this example's src/Video.tsx and src/scenes/ into the project
4. copy/merge video.config.json mappings
5. generate narration matching the example IDs
6. npm run build
7. npm run check
8. npm run still or npm run studio
```

State that copying example source is opt-in and existing authored files must be reviewed before replacement.

- [ ] **Step 6: Run example and type tests**

```bash
node --test \
  frameworks/remotion/__tests__/scaffold.test.ts \
  test/cli/scaffold-decoupled.test.ts \
  test/examples/hash-table-remotion.test.ts
npm run typecheck:remotion
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add \
  frameworks/remotion/templates/src/Video.tsx \
  frameworks/remotion/templates/src/scenes \
  examples/hash-table/remotion \
  frameworks/remotion/__tests__/scaffold.test.ts \
  test/cli/scaffold-decoupled.test.ts \
  test/examples/hash-table-remotion.test.ts
git commit -m "fix(remotion): make default scaffold content-neutral"
```
