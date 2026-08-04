# Part 2 — Shared Planning Workflow and `md2vid plan`

Depends on: Part 1. Complete this part before `2026-08-02-visual-timing-sync-plan-3.md`.

- [x] **Task 4: Extract shared project planning and neutral serialization** `[Group: planning-workflow]` `[Tester: yes]`

**Files:**
- Create: `scripts/plan_project.ts`
- Modify: `scripts/build.ts:126-345`
- Modify: `scripts/project_layout.ts` to export the existing resolved layout type for shared planning
- Create: `test/cli/plan-project.test.ts`

- [x] **Step 1: Write failing serializer and no-adapter tests**

Create `test/cli/plan-project.test.ts` with a fixture that includes `visual_beats.json` and assert deterministic artifact strings:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { serializeNeutralArtifacts } from "../../scripts/plan_project.ts";

const artifacts = serializeNeutralArtifacts(PLAN_WITH_BEATS);

assert.match(artifacts.cues, /"visualBeats"/);
assert.match(artifacts.visualTiming, /"version": 1/);
assert.deepEqual(JSON.parse(artifacts.visualTiming).frames["reserve-flow"].beats, [
  { id: "reserve", start: 2.95, workflowStep: 1 },
  { id: "execute", start: 11.06, workflowStep: 2 },
]);
assert.deepEqual(JSON.parse(artifacts.buildPlan), PLAN_WITH_BEATS);
```

Add a legacy assertion that `cues.json` does not gain `visualBeats: []`, while `build/visual_timing.json` is always the stable empty projection:

```ts
assert.deepEqual(JSON.parse(legacy.visualTiming), { version: 1, frames: {} });
assert.equal(legacy.cues.includes("visualBeats"), false);
```

- [x] **Step 2: Run and confirm module failure**

Run:

```bash
node --test test/cli/plan-project.test.ts
```

Expected: FAIL because `scripts/plan_project.ts` does not exist.

- [x] **Step 3: Implement shared load/plan result and serializers**

Create `scripts/plan_project.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readAudioMeta } from "../engine/audio_meta.ts";
import { loadConfigFiles } from "../engine/config.ts";
import { plan } from "../engine/plan.ts";
import { readVisualBeatSpec } from "../engine/visual_beats.ts";
import type { BuildPlan, VideoConfig, VoiceAssetSnapshot } from "../engine/types.ts";
import { resolveProjectLayout, type ProjectLayout } from "./project_layout.ts";

export interface ProjectPlanResult {
  layout: ProjectLayout;
  neutralConfig: VideoConfig;
  adapterConfig: VideoConfig;
  plan: BuildPlan;
  voiceSnapshots: VoiceAssetSnapshot[];
  warnings: string[];
}

export interface SerializedNeutralArtifacts {
  cues: string;
  captionGroups: string;
  buildPlan: string;
  visualTiming: string;
}
```

Use the existing secure WAV snapshot helpers currently called by `scripts/build.ts`. `createProjectPlan(outputDir, dependencies)` must:

1. resolve flat/canonical layout;
2. read and validate audio/WAV snapshots;
3. call `loadConfigFiles(shared, output)`;
4. resolve policy from `loaded.neutral` before touching `visual_beats.json`;
5. skip visual-beat file existence checks, reads, parsing, and warnings entirely when policy mode is `off`;
6. when mode is `warn` or `required`, load `visual_beats.json` from the neutral root when present;
7. error when absent and mode is `required`;
8. return exactly one actionable warning when absent in implicit/explicit warn mode;
9. pass `loaded.neutral`, not the shallow merged output-local config, to `plan()`;
10. return the merged config only as `adapterConfig`.

Use this gate:

```ts
const policy = resolveVisualSyncPolicy(loaded.neutral);
const visualBeatsPath = join(layout.sharedDir, "visual_beats.json");
const visualSpec = policy.mode === "off" || !existsSync(visualBeatsPath)
  ? undefined
  : readVisualBeatSpec(visualBeatsPath);
if (policy.mode === "required" && visualSpec === undefined) {
  throw new Error(`${visualBeatsPath}: required by visualSync.mode=required`);
}
const warnings = policy.mode === "warn" && visualSpec === undefined
  ? [`${visualBeatsPath}: no visual beat specification; semantic checks are skipped`]
  : [];
```

Add a test with `visualSync.mode: "off"` plus malformed `visual_beats.json`; planning must succeed and omit visual fields because off mode never reads the file.

Implement deterministic serializers:

```ts
export function serializeNeutralArtifacts(plan: BuildPlan): SerializedNeutralArtifacts {
  const cues = plan.frames.map((frame) => ({
    id: frame.id,
    frameNum: frame.frameNum,
    slug: frame.slug,
    start: frame.start,
    voiceDur: frame.voiceDur,
    frameDur: frame.frameDur,
    words: frame.words,
    ...(frame.visualKind === undefined ? {} : { visualKind: frame.visualKind }),
    ...(frame.visualBeats === undefined ? {} : { visualBeats: frame.visualBeats }),
  }));
  const visualFrames = Object.fromEntries(
    plan.frames.flatMap((frame) => frame.visualBeats === undefined ? [] : [[frame.slug, {
      duration: frame.voiceDur,
      ...(frame.visualKind === undefined ? {} : { kind: frame.visualKind }),
      beats: frame.visualBeats.map(({ id, start, workflowStep }) => ({
        id,
        start,
        ...(workflowStep === undefined ? {} : { workflowStep }),
      })),
    }]]),
  );
  return {
    cues: `${JSON.stringify(cues, null, 2)}\n`,
    captionGroups: `${JSON.stringify({ totalDuration: plan.totalDuration, canvas: plan.canvas, groups: plan.captionGroups }, null, 2)}\n`,
    buildPlan: `${JSON.stringify(plan, null, 2)}\n`,
    visualTiming: `${JSON.stringify({ version: 1, frames: visualFrames }, null, 2)}\n`,
  };
}
```

- [x] **Step 4: Add a shared neutral staging helper**

Export a helper that writes the four strings under a caller-supplied staging root and returns explicit `ManagedFile[]` entries for:

```text
cues.json
caption_groups.json
build/build_plan.json
build/visual_timing.json
```

Use `managed_file_transaction.ts` for promotion; do not create a second transaction implementation.

- [x] **Step 5: Refactor build to consume the shared result**

Replace build's inline load/plan/serialization path with:

```ts
const planning = createProjectPlan(OUTPUT, planningDependencies);
for (const warning of planning.warnings) console.warn(`WARN [build] ${warning}`);
const PLAN = planning.plan;
const config = planning.adapterConfig;
const neutralArtifacts = stageNeutralArtifacts(PLAN, stagedShared);
```

Add a build test proving an implicit/warn legacy project with no `visual_beats.json` succeeds and emits exactly one actionable `WARN [build]` line. Adapter preflight and emission must not emit the same warning again during build.

Retain existing adapter preflight, caption verification, voice staging, rollback, backup, and cleanup semantics. Do not change emitted output in the legacy fixture.

- [x] **Step 6: Run focused tests**

Run:

```bash
node --test test/cli/plan-project.test.ts test/cli/workflows.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add scripts/plan_project.ts scripts/build.ts test/cli/plan-project.test.ts test/cli/workflows.test.ts
git commit -m "refactor(build): share neutral planning transaction"
```

---

- [x] **Task 5: Add the plan-only CLI command** `[Group: planning-workflow]` `[Tester: yes]`

**Files:**
- Create: `scripts/plan.ts`
- Modify: `bin/md2vid.ts:10-59`
- Create: `test/cli/plan.test.ts`
- Modify: `test/cli/router.test.ts`
- Modify: `test/cli/run-exports.test.ts`
- Modify: `test/boundaries.test.ts`

- [x] **Step 1: Write failing CLI behavior tests**

Create cases for flat and canonical layouts:

```ts
test("plan writes only neutral artifacts in a flat project", () => {
  const beforeFrame = readFileSync(join(project, "compositions/frames/01-intro.html"));
  assert.equal(run([project]), 0);
  for (const path of [
    "cues.json",
    "caption_groups.json",
    "build/build_plan.json",
    "build/visual_timing.json",
  ]) assert.equal(existsSync(join(project, path)), true);
  assert.deepEqual(readFileSync(join(project, "compositions/frames/01-intro.html")), beforeFrame);
  assert.equal(existsSync(join(project, "index.html")), false);
});

test("plan targets sibling shared in canonical layout", () => {
  assert.equal(run([hyperframesOutput]), 0);
  assert.equal(existsSync(join(sharedDir, "build/visual_timing.json")), true);
  assert.equal(existsSync(join(hyperframesOutput, "build/visual_timing.json")), false);
});
```

Add parser tests for `--help`, missing directory, extra positional arguments, unknown options, rollback after promotion failure, and zero output mutation on invalid beat specs.

- [x] **Step 2: Run tests and confirm failure**

Run:

```bash
node --test test/cli/plan.test.ts test/cli/router.test.ts test/cli/run-exports.test.ts test/boundaries.test.ts
```

Expected: FAIL because the command and export do not exist.

- [x] **Step 3: Implement `scripts/plan.ts`**

Follow existing command modules and `parseCommand()`:

```ts
import { parseCommand } from "./cli_args.ts";
import { createProjectPlan, promoteNeutralPlan } from "./plan_project.ts";

const USAGE = "Usage: md2vid plan <video-dir>";

export function run(argv: string[], dependencies: PlanDependencies = {}): number {
  try {
    const parsed = parseCommand(argv, { usage: USAGE, minPositionals: 1, maxPositionals: 1 });
    if (parsed.help) {
      console.log(USAGE);
      return 0;
    }
    const planning = createProjectPlan(parsed.positionals[0], dependencies.planning);
    const result = promoteNeutralPlan(planning, dependencies.transaction);
    for (const warning of planning.warnings) console.warn(`WARN [plan] ${warning}`);
    console.log(`PASS [plan] wrote neutral timing artifacts to ${planning.layout.sharedDir}`);
    reportCleanupWarnings(result.cleanupErrors);
    return 0;
  } catch (error) {
    console.error(`FAIL [plan] ${(error as Error).message}`);
    return 1;
  }
}
```

Use the repository's actual `parseCommand` option shape and cleanup-reporting helper names; preserve existing exit-code conventions (`0` success/help, `1` runtime failure, `2` parse failure if the parser distinguishes it).

- [x] **Step 4: Route and document the command**

In `bin/md2vid.ts`:

```ts
import { run as planRun } from "../scripts/plan.ts";

// Add this entry to the existing command router object.
plan: planRun,
```

Add root help text:

```text
plan <dir>                                      resolve and write neutral timing artifacts only
```

Update export/boundary tests to require `scripts/plan.ts` and `scripts/plan_project.ts` through the intended public/internal boundaries.

- [x] **Step 5: Run focused tests**

Run:

```bash
node --test \
  test/cli/plan.test.ts \
  test/cli/router.test.ts \
  test/cli/run-exports.test.ts \
  test/boundaries.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add scripts/plan.ts bin/md2vid.ts test/cli/plan.test.ts test/cli/router.test.ts test/cli/run-exports.test.ts test/boundaries.test.ts
git commit -m "feat(cli): add neutral plan command"
```

---

- [x] **Task 6: Preserve visual timing through build and regroup** `[Group: planning-workflow]` `[Tester: yes]`

**Files:**
- Modify: `scripts/build.ts`
- Modify: `scripts/regroup.ts:76-127`
- Modify: `frameworks/remotion/emit.ts:28-76` to serialize the full regrouped plan with additive visual fields
- Modify: `test/cli/workflows.test.ts`
- Modify: `test/cli/run-exports.test.ts`

- [x] **Step 1: Write the failing regroup regression**

Create a canonical Remotion fixture with visual beats, run build and regroup, then compare fields:

```ts
test("regroup preserves resolved visual beats in Remotion output", () => {
  assert.equal(buildRun([remotionOutput]), 0);
  const before = JSON.parse(readFileSync(join(remotionOutput, "build_plan.json"), "utf8"));
  assert.equal(regroupRun([remotionOutput, "--max-chars", "54"]), 0);
  const after = JSON.parse(readFileSync(join(remotionOutput, "build_plan.json"), "utf8"));
  assert.deepEqual(after.frames.map((frame: any) => frame.visualBeats), before.frames.map((frame: any) => frame.visualBeats));
});
```

Add a canonical multi-framework test proving differing output-local config cannot alter the shared plan:

```ts
assert.deepEqual(hyperframesPlan.frames, remotionPlan.frames);
assert.equal(sharedPlan.frames[0].start, expectedNeutralStart);
```

- [x] **Step 2: Run and confirm the regression fails**

Run:

```bash
node --test test/cli/workflows.test.ts test/cli/run-exports.test.ts
```

Expected: FAIL because regroup currently recomputes the legacy plan without visual beats.

- [x] **Step 3: Make regroup use the shared planning result**

Replace direct audio/config/`plan(meta, config)` reconstruction with `createProjectPlan(outputDir, ...)`. Preserve regroup's caption-only behavior:

```ts
const planning = createProjectPlan(OUTPUT, planningDependencies);
const regroupedPlan = {
  ...planning.plan,
  captionGroups: regroupCaptions(planning.plan.captionGroups, maxChars),
};
adapter.emit(regroupedPlan, stagedShared, stagedOutput, planning.adapterConfig, {
  captionsOnly: true,
  runtimeSourceDir: OUTPUT,
  assetSourceDir: SHARED,
  voiceSnapshots: planning.voiceSnapshots,
});
```

Ensure Remotion `build_plan.json` receives the full `regroupedPlan`, including `visualKind` and `visualBeats`.

- [x] **Step 4: Enforce neutral planning ownership**

In `createProjectPlan`, call:

```ts
const loaded = loadConfigFiles(sharedDir, outputDir);
const neutralPlan = plan(meta, loaded.neutral, visualSpec);
```

Add validation or explicit ignore behavior so `output.config.json` cannot alter neutral-only keys. Prefer rejecting these keys with a path-qualified error:

```text
output.config.json.visualSync is neutral-only; move it to video.config.json
```

Framework/render keys remain output-local.

- [x] **Step 5: Run focused tests**

Run:

```bash
node --test test/cli/workflows.test.ts test/cli/run-exports.test.ts engine/__tests__/config.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add scripts/build.ts scripts/regroup.ts frameworks/remotion/emit.ts test/cli/workflows.test.ts test/cli/run-exports.test.ts engine/__tests__/config.test.ts
git commit -m "fix(build): preserve visual timing during regroup"
```

---

- [x] **Task 7: Add transactional and golden planning coverage** `[Group: planning-workflow]` `[Tester: yes]`

**Files:**
- Create: `test/golden/fixtures/visual-timing-sync/` fixture files
- Modify: `test/golden/golden.test.ts:37-113`
- Modify: `test/cli/plan.test.ts`
- Modify: `test/cli/workflows.test.ts`

- [x] **Step 1: Add a dedicated semantic timing fixture**

Create a minimal project with one workflow frame whose transcript contains cues at `2.95`, `11.06`, and `14.35` seconds and authored beats resolving to those words. Keep the existing legacy fixture unchanged.

Expected neutral projection:

```json
{
  "version": 1,
  "frames": {
    "reserve-flow": {
      "duration": 18,
      "kind": "workflow",
      "beats": [
        { "id": "reserve", "start": 2.95, "workflowStep": 1 },
        { "id": "execute", "start": 11.06, "workflowStep": 2 },
        { "id": "settle", "start": 14.35, "workflowStep": 3 }
      ]
    }
  }
}
```

- [x] **Step 2: Add failing golden and rollback assertions**

Assert:

- `plan` and `build` produce byte-identical `build/build_plan.json` and `build/visual_timing.json` for unchanged inputs;
- legacy `cues.json` bytes remain unchanged;
- a staged-write or promotion failure leaves all four previous neutral artifacts intact;
- invalid visual beats produce no partial files.

- [x] **Step 3: Run and inspect the expected failures**

Run:

```bash
node --test test/golden/golden.test.ts test/cli/plan.test.ts test/cli/workflows.test.ts
```

Expected: FAIL until the fixture expectations and transaction managed-file set include `build/visual_timing.json`.

- [x] **Step 4: Complete managed-file coverage**

Ensure plan/build promotion treats the four neutral artifacts as one transaction. Any rollback restores all four; cleanup warnings follow existing transaction semantics.

- [x] **Step 5: Run Part 2 focused tests**

Run:

```bash
node --test \
  test/cli/plan-project.test.ts \
  test/cli/plan.test.ts \
  test/cli/router.test.ts \
  test/cli/run-exports.test.ts \
  test/cli/workflows.test.ts \
  test/boundaries.test.ts \
  test/golden/golden.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add test/golden test/cli/plan.test.ts test/cli/workflows.test.ts scripts/plan_project.ts scripts/build.ts
git commit -m "test(planning): cover visual timing transactions"
```

## Part 2 Verification

```bash
node --test \
  test/cli/plan-project.test.ts \
  test/cli/plan.test.ts \
  test/cli/router.test.ts \
  test/cli/run-exports.test.ts \
  test/cli/workflows.test.ts \
  test/boundaries.test.ts \
  test/golden/golden.test.ts
corepack npm run typecheck
git diff --check
```

Expected: all commands exit `0`; `md2vid plan` writes neutral artifacts only, and build/regroup preserve identical resolved visual timing.
