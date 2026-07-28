# Automatic Dependency Updates Implementation Plan — Part 2: Automation and Rollout

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create patch-only Dependabot groups, add a checkout-free guarded native auto-merge workflow with no review side effect, then preserve repository protections and prove one real Dependabot canary.

**Architecture:** Dependabot determines which grouped patch PRs are created. A no-write `pull_request` observer emits only a completion signal. A privileged `workflow_run` stage whose definition comes from the default branch re-queries exactly one associated live Dependabot PR, validates repository, actor, author, base, head repository/ref/SHA, every commit's provenance, semantic update type, group branch, and dependency-name policy, revalidates the exact live head immediately before its only side effect, then requests native squash auto-merge with `--match-head-commit`. GitHub branch protection and its strict five required checks decide when or whether the merge occurs; no review or approval is submitted.

**Tech Stack:** Dependabot v2 configuration, GitHub Actions, trusted inline Node.js metadata/policy validation, GitHub CLI, GitHub REST API.

---

## Approved Mode B architecture revision — 2026-07-28

The original Task 5 workflow sketch used privileged `pull_request` execution. Post-Mode-A review and authoritative GitHub documentation established that `pull_request` uses workflow content from the PR-associated merge ref. A Dependabot Actions PR could therefore execute its proposed workflow or metadata-action revision before merge. The approved replacement is:

```text
Dependabot pull_request
  → Dependabot auto-merge observer
     - permissions: {}
     - completion signal only
     - no checkout, artifacts, caches, installs, builds, or repository execution
  → workflow_run completed
  → trusted default-branch Dependabot auto-merge workflow
     - exact repository/event/workflow/conclusion/actor guard
     - API correlation to exactly one associated PR
     - live PR + every commit revalidation
     - exact patch/group/dependency policy
     - no review or approval side effect
     - live-head recheck
     - gh pr merge --auto --squash --match-head-commit
```

`dependabot/fetch-metadata@v2.5.0` is removed from the revised workflow. Its pinned implementation requires `context.payload.pull_request` and validates only the first listed commit, so it cannot directly and completely enforce this `workflow_run` trust model. The privileged stage instead uses checkout-free trusted GitHub API queries and inline parsing. This section supersedes the original single-workflow code sketch below; Mode B replaces that sketch and records the final exact contracts in tests.

## Approved Task 5.2 no-review deviation — 2026-07-28

The user explicitly decided: `if green auto merge => don't need approval`. Requiring one approval deadlocked ordinary pull requests because `therealhieu` is the repository's only collaborator and GitHub forbids self-approval. The coordinator has already changed live `main` protection from one required approval to zero while preserving strict enforcement of the same five required checks, admin enforcement, conversation resolution, and the bans on force pushes and deletion. The trusted workflow is merge-request-only: it must not create a review or approval API call.

Task 5.2 changes the trusted workflow from approval-plus-merge side effects to merge-request-only. It removes the commit-bound APPROVE review step and approval-specific API call, environment, and guards. It preserves the unprivileged observer, trusted default-branch `workflow_run` origin, `actions: read` observer queries, exact observer/live PR/commit provenance, event and live-head binding, the immediate live-head recheck, and exact `gh pr merge --auto --squash --match-head-commit`. The trusted job may keep only permissions required by those remaining commands; `actions: read` and `contents: write` remain required, while the `pull-requests` grant must be decided from the actual GET/merge endpoints and contracted exactly in tests. `default_workflow_permissions` remains `read`. After this remediation merges, disable `can_approve_pull_request_reviews: true → false`, verify read-back, and rerun the real canary.

## Group: `dependabot-automation`

Tasks 4–5 form one policy scope. Preserve both commits, then run one combined review/remediation/verifier cycle.

### Task 4: Define Dependabot and auto-merge contracts [Tester: yes] `[Group: dependabot-automation]`

**Files:**
- Modify: `test/ci/workflows.test.ts:7-46,192-222,349-455`
- Test future file: `.github/workflows/dependabot-auto-merge.yml`

- [x] **Step 1: Register the future workflow in test inventory**

Update the checker and runner maps:

```ts
const WORKFLOW_POLICY_CHECKERS: Record<string, WorkflowPolicyChecker> = {
  "ci.yml": assertSafeWorkflowPolicy,
  "dependabot-auto-merge.yml": assertDependabotAutoMergePolicy,
  "nightly.yml": assertNightlyPolicy,
  "release.yml": assertReleasePolicy,
  "validate.yml": assertSafeWorkflowPolicy,
};
```

```ts
"dependabot-auto-merge.yml": {
  "request-auto-merge": "ubuntu-latest",
},
```

Do not pass this workflow through the read-only checker; it needs a specialized least-privilege policy.

- [x] **Step 2: Parse package metadata for group coverage assertions**

Add near the existing path constants:

```ts
const packageJson = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as {
  dependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
```

- [x] **Step 3: Replace the minimal Dependabot test with structural policy coverage**

Use:

```ts
test("Dependabot defines exact weekly patch groups", () => {
  const body = readFileSync(dependabotPath, "utf8");
  const { value } = parseWorkflow(body);
  assert.equal(value.version, 2);
  assert.equal(Array.isArray(value.updates), true);

  const updates = value.updates as WorkflowRecord[];
  assert.equal(updates.length, 2);
  const npm = updates.find(
    (entry) => entry["package-ecosystem"] === "npm",
  );
  const actions = updates.find(
    (entry) => entry["package-ecosystem"] === "github-actions",
  );
  assert.ok(npm);
  assert.ok(actions);

  assert.deepEqual(npm.schedule, {
    interval: "weekly",
    day: "monday",
    time: "04:17",
  });
  assert.deepEqual(actions.schedule, {
    interval: "weekly",
    day: "monday",
    time: "04:23",
  });
  assert.equal(npm["open-pull-requests-limit"], 5);
  assert.equal(actions["open-pull-requests-limit"], 5);
  assert.deepEqual(npm["commit-message"], { prefix: "chore(deps)" });
  assert.deepEqual(actions["commit-message"], { prefix: "chore(deps)" });

  const npmGroups = asRecord(npm.groups, "npm groups");
  const actionGroups = asRecord(actions.groups, "actions groups");
  assert.deepEqual(
    Object.keys(npmGroups).sort(),
    ["dev-patches", "runtime-patches"],
  );
  assert.deepEqual(Object.keys(actionGroups), ["actions-patches"]);

  const runtime = asRecord(npmGroups["runtime-patches"], "runtime-patches");
  const development = asRecord(npmGroups["dev-patches"], "dev-patches");
  const actionPatches = asRecord(
    actionGroups["actions-patches"],
    "actions-patches",
  );

  const expectedRuntime = [
    ...Object.keys(packageJson.dependencies),
    ...Object.keys(packageJson.optionalDependencies),
  ].sort();
  assert.deepEqual(
    [...runtime.patterns as string[]].sort(),
    expectedRuntime,
  );
  assert.deepEqual(runtime["update-types"], ["patch"]);
  assert.equal(development["dependency-type"], "development");
  assert.deepEqual(development["update-types"], ["patch"]);
  assert.deepEqual(actionPatches.patterns, ["*"]);
  assert.deepEqual(actionPatches["update-types"], ["patch"]);

  assert.equal(Object.hasOwn(npm, "ignore"), false);
  assert.equal(Object.hasOwn(actions, "ignore"), false);
  assert.doesNotMatch(body, /update-types:[\s\S]{0,80}-\s+"?(?:minor|major)"?/);
});
```

This test deliberately proves that all current dependencies, including GSAP, remain covered and no patch exclusion contradicts the design.

- [x] **Step 4: Add the specialized privileged-workflow checker**

Add:

```ts
function assertDependabotAutoMergePolicy(yaml: string): void {
  assertPinnedUses(yaml);
  const { value } = parseWorkflow(yaml);
  assert.equal(value.name, "Dependabot auto-merge");
  assert.deepEqual(value.on, { pull_request: null });
  assert.deepEqual(value.permissions, {});

  const job = parsedJob(value, "request-auto-merge");
  assert.equal(job["runs-on"], "ubuntu-latest");
  assert.deepEqual(job.permissions, {
    contents: "write",
    "pull-requests": "write",
  });

  const condition = String(job.if).replace(/\s+/g, " ").trim();
  assert.equal(
    condition,
    [
      "github.actor == 'dependabot[bot]'",
      "github.repository == 'therealhieu/md2vid'",
      "github.event.pull_request.user.login == 'dependabot[bot]'",
      "github.event.pull_request.base.ref == 'main'",
    ].join(" && "),
  );
  assert.doesNotMatch(condition, /\|\|/);

  const steps = parsedSteps(job, "request-auto-merge");
  const metadata = steps.find(
    (step) => step.name === "Fetch Dependabot metadata",
  );
  const policy = steps.find(
    (step) => step.name === "Validate patch group policy",
  );
  const approve = steps.find(
    (step) => step.name === "Approve eligible update",
  );
  const merge = steps.find(
    (step) => step.name === "Request native squash auto-merge",
  );
  assert.ok(metadata);
  assert.ok(policy);
  assert.ok(approve);
  assert.ok(merge);

  assert.equal(metadata.id, "metadata");
  assert.match(
    String(metadata.uses),
    /^dependabot\/fetch-metadata@[a-f0-9]{40}$/,
  );
  assert.equal(approve.if, "steps.policy.outputs.eligible == 'true'");
  assert.equal(merge.if, "steps.policy.outputs.eligible == 'true'");
  assert.match(String(approve.run), /gh pr review "\$PR_URL" --approve/);
  assert.match(String(merge.run), /gh pr merge "\$PR_URL" --auto --squash/);
  assert.doesNotMatch(String(merge.run), /--admin|--merge|--rebase/);

  assert.doesNotMatch(yaml, /pull_request_target/);
  assert.doesNotMatch(yaml, /actions\/checkout@/);
  assert.doesNotMatch(
    yaml,
    /\bnpm\s+(?:ci|install|run)|\bcorepack\b|node_modules|dist\/bin|scripts\/[A-Za-z0-9_.-]+\.ts/,
  );
}
```

- [x] **Step 5: Execute the policy decision table and mutate every authority boundary**

Extend imports at the top of `test/ci/workflows.test.ts`:

```ts
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
```

Add helpers:

```ts
function dependabotPolicyScript(yaml: string): string {
  const body = stepBody(yaml, "Validate patch group policy");
  const match = body.match(
    /node --input-type=module <<'NODE'\n([\s\S]*?)\n\s*NODE\s*$/,
  );
  assert.ok(match, "missing trusted inline policy script");
  return match[1];
}

function runDependabotPolicy(
  yaml: string,
  input: {
    head: string;
    updateType: string;
    names: string;
  },
): { status: number | null; eligible: string | undefined } {
  const dir = mkdtempSync(join(tmpdir(), "md2vid-dependabot-policy-"));
  const output = join(dir, "output");
  try {
    const result = spawnSync(
      process.execPath,
      ["--input-type=module"],
      {
        input: dependabotPolicyScript(yaml),
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_OUTPUT: output,
          HEAD_REF: input.head,
          UPDATE_TYPE: input.updateType,
          DEPENDENCY_NAMES: input.names,
        },
      },
    );
    const values = existsSync(output)
      ? Object.fromEntries(
          readFileSync(output, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => line.split("=", 2)),
        )
      : {};
    return { status: result.status, eligible: values.eligible };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
```

Add the executable decision table:

```ts
test("Dependabot auto-merge policy fails closed", () => {
  const yaml = workflow("dependabot-auto-merge.yml");
  const patch = "version-update:semver-patch";
  const runtimeNames = [
    ...Object.keys(packageJson.dependencies),
    ...Object.keys(packageJson.optionalDependencies),
  ];
  const devNames = Object.keys(packageJson.devDependencies);

  const valid = [
    {
      head: "dependabot/npm_and_yarn/runtime-patches-abc123",
      updateType: patch,
      names: runtimeNames.join(","),
    },
    {
      head: "dependabot/npm_and_yarn/dev-patches-abc123",
      updateType: patch,
      names: devNames.join(","),
    },
    {
      head: "dependabot/github_actions/actions-patches-abc123",
      updateType: patch,
      names: "actions/checkout,actions/setup-node",
    },
  ];
  for (const input of valid) {
    assert.deepEqual(runDependabotPolicy(yaml, input), {
      status: 0,
      eligible: "true",
    });
  }

  const invalid = [
    { ...valid[0], updateType: "version-update:semver-minor" },
    { ...valid[0], updateType: "version-update:semver-major" },
    { ...valid[0], head: "dependabot/npm_and_yarn/unknown-patches-abc123" },
    { ...valid[0], names: `${runtimeNames.join(",")},unknown-runtime` },
    { ...valid[1], names: `${devNames.join(",")},unknown-development` },
  ];
  for (const input of invalid) {
    assert.deepEqual(runDependabotPolicy(yaml, input), {
      status: 0,
      eligible: "false",
    });
  }

  const empty = runDependabotPolicy(yaml, {
    head: valid[0].head,
    updateType: patch,
    names: "",
  });
  assert.notEqual(empty.status, 0);
  assert.equal(empty.eligible, undefined);
});
```

Add broadened-authority mutations:

```ts
test("Dependabot auto-merge rejects broadened authority", () => {
  const yaml = workflow("dependabot-auto-merge.yml");
  const mutations = [
    yaml.replace("github.actor == 'dependabot[bot]'", "github.actor != ''"),
    yaml.replace(
      "github.event.pull_request.base.ref == 'main'",
      "github.event.pull_request.base.ref != ''",
    ),
    yaml.replace(
      "github.event.pull_request.base.ref == 'main'",
      "github.event.pull_request.base.ref == 'main' || github.actor == 'other-bot'",
    ),
    yaml.replace(
      "pull-requests: write",
      "actions: write\n      pull-requests: write",
    ),
    yaml.replace(
      "      - name: Fetch Dependabot metadata",
      "      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # v4\n      - name: Fetch Dependabot metadata",
    ),
    yaml.replace(
      'gh pr merge "$PR_URL" --auto --squash',
      'gh pr merge "$PR_URL" --admin --squash',
    ),
  ];

  for (const mutated of mutations) {
    assert.throws(() => assertDependabotAutoMergePolicy(mutated));
  }

  const forcedTrue = yaml.replace(
    "const eligible =",
    "const eligible = true ||",
  );
  assert.throws(() => {
    assert.equal(
      runDependabotPolicy(forcedTrue, {
        head: "dependabot/npm_and_yarn/runtime-patches-abc123",
        updateType: "version-update:semver-major",
        names: Object.keys(packageJson.dependencies).join(","),
      }).eligible,
      "false",
    );
  });
});
```

- [x] **Step 6: Run the contract tests and verify red state**

```bash
node --test test/ci/workflows.test.ts
```

Expected: FAIL because the auto-merge workflow and Dependabot groups do not exist and workflow inventory has changed.

- [x] **Step 7: Commit the red policy tests**

```bash
git add test/ci/workflows.test.ts
git commit -m "test(ci): define Dependabot patch policy"
```

### Task 5: Add grouped updates and guarded auto-merge [Tester: yes] `[Group: dependabot-automation]`

**Files:**
- Modify: `.github/dependabot.yml:1-16`
- Create: `.github/workflows/dependabot-auto-merge-observer.yml`
- Create: `.github/workflows/dependabot-auto-merge.yml`
- Regenerate: `public-snapshot.json`

- [x] **Step 1: Replace the Dependabot configuration**

Use:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "04:17"
    open-pull-requests-limit: 5
    commit-message:
      prefix: "chore(deps)"
    groups:
      runtime-patches:
        patterns:
          - "hyperframes"
          - "@remotion/google-fonts"
          - "@remotion/media"
          - "react"
          - "react-dom"
          - "remotion"
        update-types:
          - "patch"
      dev-patches:
        dependency-type: "development"
        update-types:
          - "patch"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "04:23"
    open-pull-requests-limit: 5
    commit-message:
      prefix: "chore(deps)"
    groups:
      actions-patches:
        patterns:
          - "*"
        update-types:
          - "patch"
```

Do not add ignore rules. Minor and major updates remain unmatched and therefore appear as individual manual-review PRs.

- [x] **Step 2: Add the guarded auto-merge workflow**

Create `.github/workflows/dependabot-auto-merge.yml`:

```yaml
name: Dependabot auto-merge

"on":
  pull_request:

permissions: {}

jobs:
  request-auto-merge:
    if: >-
      github.actor == 'dependabot[bot]' &&
      github.repository == 'therealhieu/md2vid' &&
      github.event.pull_request.user.login == 'dependabot[bot]' &&
      github.event.pull_request.base.ref == 'main'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Fetch Dependabot metadata
        id: metadata
        uses: dependabot/fetch-metadata@21025c705c08248db411dc16f3619e6b5f9ea21a # v2.5.0
        with:
          github-token: ${{ github.token }}

      - name: Validate patch group policy
        id: policy
        shell: bash
        env:
          HEAD_REF: ${{ github.event.pull_request.head.ref }}
          UPDATE_TYPE: ${{ steps.metadata.outputs.update-type }}
          DEPENDENCY_NAMES: ${{ steps.metadata.outputs.dependency-names }}
        run: |
          node --input-type=module <<'NODE'
          import { appendFileSync } from "node:fs";

          const output = process.env.GITHUB_OUTPUT;
          const head = process.env.HEAD_REF ?? "";
          const updateType = process.env.UPDATE_TYPE ?? "";
          const names = (process.env.DEPENDENCY_NAMES ?? "")
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean);

          if (!output) throw new Error("GITHUB_OUTPUT is unavailable");
          if (names.length === 0) {
            throw new Error("Dependabot metadata returned no dependency names");
          }

          const policies = [
            {
              group: "runtime-patches",
              branch: /^dependabot\/npm_and_yarn\/runtime-patches(?:-|$)/,
              allowed: new Set([
                "hyperframes",
                "@remotion/google-fonts",
                "@remotion/media",
                "react",
                "react-dom",
                "remotion",
              ]),
            },
            {
              group: "dev-patches",
              branch: /^dependabot\/npm_and_yarn\/dev-patches(?:-|$)/,
              allowed: new Set([
                "@types/node",
                "@types/react",
                "@types/react-dom",
                "gsap",
                "typescript",
                "yaml",
              ]),
            },
            {
              group: "actions-patches",
              branch: /^dependabot\/github_actions\/actions-patches(?:-|$)/,
              allowed: null,
            },
          ];

          const policy = policies.find(({ branch }) => branch.test(head));
          const eligible =
            updateType === "version-update:semver-patch" &&
            policy !== undefined &&
            (policy.allowed === null ||
              names.every((name) => policy.allowed.has(name)));

          appendFileSync(output, `eligible=${eligible}\n`);
          appendFileSync(output, `group=${policy?.group ?? "none"}\n`);
          NODE

      - name: Approve eligible update
        if: steps.policy.outputs.eligible == 'true'
        shell: bash
        env:
          GH_TOKEN: ${{ github.token }}
          PR_URL: ${{ github.event.pull_request.html_url }}
        run: gh pr review "$PR_URL" --approve

      - name: Request native squash auto-merge
        if: steps.policy.outputs.eligible == 'true'
        shell: bash
        env:
          GH_TOKEN: ${{ github.token }}
          PR_URL: ${{ github.event.pull_request.html_url }}
        run: gh pr merge "$PR_URL" --auto --squash
```

The original single-stage snippet above is superseded by the approved `pull_request` observer plus default-branch `workflow_run` implementation. The pinned `dependabot/fetch-metadata@v2.5.0` evidence remains recorded for the architecture decision, but it is not executed in the revised trusted stage because its implementation requires a `pull_request` payload and validates only the first commit. The revised workflow must use trusted API/inline metadata parsing instead.

- [x] **Step 3: Run focused policy tests**

```bash
node --test test/ci/workflows.test.ts
```

Expected: PASS.

- [x] **Step 4: Run workflow lint when available**

```bash
if command -v actionlint >/dev/null 2>&1; then
  actionlint -config-file .github/actionlint.yaml
fi
```

Expected: exit `0`. Do not install an unplanned linter globally.

- [x] **Step 5: Regenerate and validate the public snapshot**

```bash
corepack npm run public:snapshot
corepack npm run public:snapshot:check
git diff --check
```

Expected: all commands exit `0`; `git diff --check` prints nothing.

- [x] **Step 6: Run full local validation**

```bash
corepack npm run check
corepack npm run release:check
```

Expected: both commands exit `0`.

- [x] **Step 7: Commit automation files**

```bash
git add \
  .github/dependabot.yml \
  .github/workflows/dependabot-auto-merge.yml \
  public-snapshot.json
git commit -m "ci(deps): enable guarded patch auto-merge"
```

Execution evidence retained on 2026-07-28:

- Original Task 4 red commit `c42f616`: `52` tests, `48` passed, `4` failed because the groups and workflow did not exist.
- Original Task 5 green commit `bc5f865`: `52/52` workflow tests passed.
- Canonical spec, code-quality, and tester artifacts identified TEST-001, SPEC-3, CQ-1/CQ-2, and TEST-002–004.
- The user approved the documented observer → `workflow_run` architecture before Mode B implementation.
- Mode B red contracts: `55` tests, `49` passed, `6` failed because the observer and trusted stage did not yet satisfy the revised contracts.
- Mode B green contracts: `55/55` workflow tests passed; Actionlint produced no diagnostics.
- `public:snapshot:check`, `corepack npm run check`, and `corepack npm run release:check` each passed with `846` tests, `846` passed, `0` failed. The final public snapshot contains `282` files with hash `sha256:cafc61a845a824f88436a2e296f1d3fdf89371a5de31618a80e5d5c52da1e514`.
- The post-implementation check artifact remains intentionally deferred until Tasks 1–6 are complete.

## Group Review and Verification Checklist

After Tasks 4–5 Mode A:

1. [x] Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel against the complete `dependabot-automation` diff.
2. [x] Resume the same implementer for accepted findings.
3. [x] Rerun:

```bash
node --test test/ci/workflows.test.ts
node --test test/cli/dependency-versions.test.ts
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

4. [x] The verifier confirms:
   - all three group IDs match the workflow policy;
   - every group is patch-only and every current dependency is covered;
   - no dependency patch ignore rule exists;
   - runtime and development dependency-name allowlists match root package metadata;
   - the observer checks the Dependabot actor and PR author with no write authority;
   - the privileged default-branch `workflow_run` stage checks the completed observer actor and independently revalidates the live PR author;
   - no `pull_request_target`, checkout, artifact/cache handoff, install, build, or repository script execution exists;
   - observer-run correlation, live head, every current commit, metadata, and merge failures are not suppressed;
   - no approval/review step or reviews API side effect exists, and merge uses exactly `--auto --squash --match-head-commit` without `--admin` after an immediate live-head recheck;
   - minor, major, security-shaped, unknown-group, unknown-dependency, maintainer-change, multi-commit, unverified, and head-rotation cases cannot reach the merge-request side effect;
   - a PR changing either workflow cannot execute proposed privileged content.

Verifier evidence retained on 2026-07-28: the single read-only verifier returned `PASS` after confirming all canonical Must-fix checklists and the approved architecture checklist. It independently ran `55/55` workflow tests, Actionlint, `public:snapshot:check`, the full and release checks with `846/846` tests, both diff checks, the tracked-`dist` check, and the six-artifact dirty-baseline status check. SPEC-5 remains an explicitly deferred Nice item until Tasks 1–6 complete.

---

### Task 5.2: Remove redundant approval side effect [Mode A standalone]

**Files:**
- Modify: `test/ci/workflows.test.ts`
- Modify: `.github/workflows/dependabot-auto-merge.yml`
- Regenerate: `public-snapshot.json`

- [x] **Step 1: Record the approved deviation before code changes**

  The no-review decision and self-approval deadlock are recorded above and reconciled in the goal, design, plan index, and this Part 2 acceptance criteria. No remote setting write is part of Task 5.2.

- [x] **Step 2: RED — replace the exact trusted-workflow contract first**

  In `test/ci/workflows.test.ts`, require the exact ordered step inventory:

  ```text
  Fetch trusted observer and PR state
  Validate Dependabot patch group policy
  Revalidate live head
  Request native squash auto-merge
  ```

  Reject every approval/review step, `gh pr review`, reviews API POST, `event=APPROVE`, approval-specific environment or guard, and any extra side-effect step. Preserve mutation coverage for authority, provenance, head rotation, and multi-commit boundaries. Contract `actions: read` and `contents: write`; determine whether `pull-requests: write` remains necessary from the remaining `gh api` GET and `gh pr merge --auto --squash --match-head-commit` commands, and assert the exact resulting map rather than guessing.

  Run the focused workflow tests and capture the expected RED against the current approval-producing workflow.

- [x] **Step 3: GREEN — make the minimal workflow change**

  Remove only the approval step and approval-specific API call, environment values, and guards. Keep all validation, the exact live-head recheck immediately before merge, and the exact `gh pr merge --auto --squash --match-head-commit` command. Do not add checkout, artifacts, installs, builds, project execution, or PR-controlled content.

- [x] **Step 4: Strengthen mutation coverage**

  Prove that reintroducing any review API side effect or extra side-effect step fails the structural contract, while retaining the existing authority, trust-origin, complete-commit-provenance, multi-commit, and head-rotation mutation cases.

- [x] **Step 5: Run Task 5.2 verification**

  Run at least `55` focused workflow tests, Actionlint when available, the pinned public-snapshot check, the full check, `release:check`, and both scoped and working-tree diff checks. Regenerate `public-snapshot.json` before the snapshot check. Do not create canonical review artifacts.

- [x] **Step 6: Commit the remediation**

  ```bash
  git add docs/superpowers/active/2026-07-28-auto-dependency-updates \\
    test/ci/workflows.test.ts .github/workflows/dependabot-auto-merge.yml public-snapshot.json
  git commit -m "ci(deps): remove redundant auto-merge approval"
  ```

  Use the configured git identity and do not push or change remote settings.

### Task 5.3: Correlate trusted runs from supported workflow-run metadata [Mode A standalone]

#### Confirmed canary failure — 2026-07-28

The real grouped Dependabot canary PR #25 confirmed a workflow-run/PR correlation defect in the trusted default-branch stage, not a repository permission issue.

Evidence:

- Observer run `30341879923`, rerun attempt `2`, succeeded for the real grouped Dependabot PR #25.
- Trusted run `30355942906` had effective `GITHUB_TOKEN` permissions `actions: read`, `contents: write`, and `pull-requests: write`.
- `GET repos/therealhieu/md2vid/actions/runs/30341879923` succeeds under those permissions, and the workflow-run JSON includes the documented `pull_requests` field.
- The next command, `GET repos/therealhieu/md2vid/actions/runs/30341879923/pull_requests`, returns `HTTP 404` with both the workflow token and a user token because that subendpoint is unsupported.
- Official GitHub workflow-run REST documentation exposes associated pull requests on the workflow-run object itself via `pull_requests`; Context7 quota was unavailable when this was verified, and the official docs search confirmed the run-object field.

Remediation:

- Keep the no-review architecture, remote policy, unprivileged observer, trusted default-branch `workflow_run` origin, run metadata validation, event/live PR/head/repository cross-checks, complete commit provenance validation, live-head recheck, and exact `gh pr merge --auto --squash --match-head-commit` side effect.
- Remove the unsupported associated-pull-requests subendpoint call and its `ASSOCIATED_FILE` handoff.
- Correlate exactly one numeric PR from the trusted observer `RUN_FILE` object's `.pull_requests` array.
- Fail closed when `.pull_requests` is missing, empty, multiple, or malformed, then continue to re-query the live PR and commits before any merge request.
- Preserve current workflow permissions exactly: `actions: read`, `contents: write`, and `pull-requests: write`; do not add checkout, artifacts, installs, builds, caches, project execution, or any review/approval side effect.

**Files:**
- Modify: `test/ci/workflows.test.ts`
- Modify: `.github/workflows/dependabot-auto-merge.yml`
- Regenerate if required: `public-snapshot.json`

- [x] **Step 1: Record the confirmed failure before code changes**

  This section records the canary run IDs, effective permissions, supported run-object `pull_requests` field, unsupported subendpoint, and remediation while preserving the no-review architecture and remote policy.

- [x] **Step 2: RED — contract supported run-object correlation**

  In `test/ci/workflows.test.ts`, require exactly one Actions run GET, forbid `/actions/runs/$RUN_ID/pull_requests`, require trusted `RUN_FILE` `.pull_requests` correlation, require exactly one associated pull request with a numeric `number`, and retain event/live cross-checks. Run the focused workflow test and capture RED against the current workflow.

- [x] **Step 3: GREEN — remove the unsupported subendpoint**

  In `.github/workflows/dependabot-auto-merge.yml`, remove `ASSOCIATED_FILE` and the second API call. Derive `PR_NUMBER` from `RUN_FILE` `.pull_requests`, pass only needed files and outputs, and fail closed on missing, multiple, or malformed PR entries. Preserve live PR and commits re-query, run metadata validation, event PR/head/repository cross-checks, exact provenance/head checks, no-review exact merge command, no checkout/artifacts/project execution, and current permissions.

- [x] **Step 4: Strengthen mutations**

  Add or update mutation coverage for reintroduced unsupported endpoint usage, absent/multiple/malformed run `pull_requests`, and correlation mismatches without weakening existing authority, trust-origin, commit-provenance, multi-commit, and head-rotation coverage.

- [x] **Step 5: Verify and commit**

  Regenerate the public snapshot if required. Run focused workflow tests, Actionlint, pinned snapshot check, full check, `release:check`, scoped diff checks, and working-tree diff checks. Commit conventionally with the configured identity. Do not push or change remote settings.

### Task 6: Preserve protections and prove the no-review canary [Tester: yes]

#### Live canary deviation — 2026-07-28

The real grouped Dependabot canary PR #25 first exposed a concrete least-privilege omission after the approved remote policy was applied. Observer run `30341879923` succeeded, but trusted `workflow_run` run `30341888573` failed consistently in `Fetch trusted observer and PR state`: `gh api --method GET repos/therealhieu/md2vid/actions/runs/30341879923` returned `gh: Not Found (HTTP 404)`. That first failure was caused by the trusted job granting only `contents: write` and `pull-requests: write`; the workflow-run GET requires `actions: read`.

The `actions: read` remediation merged and is preserved. A later canary/rollout review exposed the approval deadlock described in Task 5.2. A subsequent rerun with effective `actions: read`, `contents: write`, and `pull-requests: write` proved that `GET repos/therealhieu/md2vid/actions/runs/30341879923` succeeds and includes the supported run-object `.pull_requests` field, while the separate `GET repos/therealhieu/md2vid/actions/runs/30341879923/pull_requests` subendpoint returns `HTTP 404` because it is unsupported. Task 5.3 fixes correlation by using the supported workflow-run object `.pull_requests` source and forbidding the unsupported subendpoint.

Task 6 now resumes only after Task 5.2 and Task 5.3 merge: preserve the exact five strict required checks and every other live protection, disable only Actions pull-request approval permission while keeping read-only workflow defaults, and rerun the real Dependabot canary without any workflow-created review.

**Tester:** This is a remote policy task. API read-back and a real Dependabot PR are the verification mechanism. Do not simulate eligibility with an ordinary pull request.

**Files:**
- Remote repository settings only; no local file modification
- Repository: `therealhieu/md2vid`
- Branch: `main`

**Prerequisites:**

- Tasks 1–5, Task 5.2, and Task 5.3 have merged into `main`.
- Their implementation PRs passed all existing CI checks.
- Live `main` protection already has zero required approvals and the strict five required checks; the coordinator made that user-approved change while preserving every other protection.
- Before changing Actions approval permission, read current state, show `can_approve_pull_request_reviews: true → false` with `default_workflow_permissions: read` unchanged, and obtain explicit confirmation.

- [ ] **Step 1: Read current remote state without changing it**

```bash
gh api repos/therealhieu/md2vid \
  --jq '{allow_auto_merge,allow_squash_merge,default_branch}'

gh api repos/therealhieu/md2vid/actions/permissions/workflow

gh api repos/therealhieu/md2vid/branches/main \
  --jq '{name,protected,protection}'

gh api repos/therealhieu/md2vid/rulesets
```

Expected current remediation baseline:

```text
allow_auto_merge: true
allow_squash_merge: true
default_workflow_permissions: read
can_approve_pull_request_reviews: true
main protected: true
required approvals: 0
strict required checks: five exact names
rulesets: preserve current state
```

If live state differs, stop and show the exact difference. Do not overwrite any unrelated policy.

- [ ] **Step 2: Verify stable check names from the merged implementation PR**

```bash
RUN_ID=$(gh run list \
  --repo therealhieu/md2vid \
  --workflow CI \
  --event pull_request \
  --limit 20 \
  --json databaseId,headBranch \
  --jq 'map(select(.headBranch == "fix/dependabot-auto-merge-no-review"))[0].databaseId')

test -n "$RUN_ID"

gh run view "$RUN_ID" \
  --repo therealhieu/md2vid \
  --json jobs \
  --jq '.jobs[] | {name,conclusion}'

gh api repos/therealhieu/md2vid/contents/.github/dependabot.yml \
  -f ref=main --jq '.sha'

gh api repos/therealhieu/md2vid/contents/.github/workflows/dependabot-auto-merge.yml \
  -f ref=main --jq '.sha'
```

Select the concrete run ID from the first command. Required check names must be exactly:

```text
pr-title
dependency-review
public-snapshot / validate
pr-minimum / validate
pr-latest / validate
```

Do not require `main-full`; it is push-only. Do not require `resolve-latest-node` separately because `pr-latest / validate` depends on it. Stop if names differ.

- [ ] **Step 3: Present and confirm the remote write set**

Show the user this exact proposed change before executing it:

```text
allow_auto_merge: preserve current true
default_workflow_permissions: preserve read
can_approve_pull_request_reviews: true → false
main protection: preserve current values
  require strict status checks: five verified names
  require pull request: yes
  required approvals: 0
  dismiss stale approvals: preserve current value
  enforce admins: yes
  require conversation resolution: yes
  allow force pushes: no
  allow deletion: no
```

Proceed only after explicit confirmation.

- [ ] **Step 4: Verify every protected-branch invariant before the Actions change**

```bash
gh api repos/therealhieu/md2vid/branches/main/protection \
  --jq '{
    strict: .required_status_checks.strict,
    checks: [.required_status_checks.contexts[]],
    approvals: .required_pull_request_reviews.required_approving_review_count,
    enforce_admins: .enforce_admins.enabled,
    force_pushes: .allow_force_pushes.enabled,
    deletions: .allow_deletions.enabled,
    conversation_resolution: .required_conversation_resolution.enabled
  }'
```

Expected: strict is `true`; checks are exactly the five verified names; approvals is `0`; admin enforcement and conversation resolution are `true`; force pushes and deletion are `false`. Do not write branch protection in this remediation.

- [ ] **Step 5: Disable Actions approval while preserving read defaults**

```bash
gh api \
  --method PUT \
  repos/therealhieu/md2vid/actions/permissions/workflow \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=false

gh api repos/therealhieu/md2vid/actions/permissions/workflow
```

Expected:

```json
{
  "default_workflow_permissions": "read",
  "can_approve_pull_request_reviews": false
}
```

- [ ] **Step 6: Verify native auto-merge and branch protection remain unchanged**

```bash
gh api repos/therealhieu/md2vid \
  --jq '{allow_auto_merge,allow_squash_merge}'

gh api repos/therealhieu/md2vid/branches/main/protection \
  --jq '{
    strict: .required_status_checks.strict,
    checks: [.required_status_checks.contexts[]],
    approvals: .required_pull_request_reviews.required_approving_review_count,
    enforce_admins: .enforce_admins.enabled,
    force_pushes: .allow_force_pushes.enabled,
    deletions: .allow_deletions.enabled,
    conversation_resolution: .required_conversation_resolution.enabled
  }'
```

Expected: native auto-merge and squash merge remain enabled, approvals remain `0`, and every other protected-branch field matches Step 4. Stop if any value differs.

- [ ] **Step 7: Confirm merged configuration and Task 5.3 implementation exist on `main`**

```bash
gh api repos/therealhieu/md2vid/contents/.github/dependabot.yml \
  -f ref=main --jq '.sha'

WORKFLOW_CONTENT=$(gh api repos/therealhieu/md2vid/contents/.github/workflows/dependabot-auto-merge.yml \
  -f ref=main --jq '.content' \
  | python3 -c 'import base64, sys; print(base64.b64decode(sys.stdin.read()).decode(), end="")')

printf '%s' "$WORKFLOW_CONTENT" | grep -F '.pull_requests as $prs'
printf '%s' "$WORKFLOW_CONTENT" | grep -F 'run.pull_requests'
! printf '%s' "$WORKFLOW_CONTENT" | grep -F 'actions/runs/$RUN_ID/pull_requests'
```

Expected: the Dependabot file command returns a nonempty 40-character blob SHA, and the workflow content checks prove the Task 5.3 run-object `.pull_requests` correlation and unsupported subendpoint removal rather than only file existence.

- [ ] **Step 8: Obtain a real Dependabot patch canary**

Use GitHub's Dependabot UI **Check for updates** action or wait for the scheduled Monday scan. Do not create a fake Dependabot PR.

```bash
gh pr list \
  --repo therealhieu/md2vid \
  --author app/dependabot \
  --base main \
  --state open \
  --json number,title,headRefName,author,url
```

Select a patch-group PR whose branch matches one of:

```text
^dependabot/npm_and_yarn/runtime-patches(?:-|$)
^dependabot/npm_and_yarn/dev-patches(?:-|$)
^dependabot/github_actions/actions-patches(?:-|$)
```

- [ ] **Step 9: Capture no-review auto-merge evidence**

```bash
set -euo pipefail

PR=$(gh pr list \
  --repo therealhieu/md2vid \
  --author app/dependabot \
  --base main \
  --state open \
  --json number,headRefName \
  --jq '[.[] | select(.headRefName | test("^dependabot/(npm_and_yarn/(runtime|dev)-patches|github_actions/actions-patches)(-|$)"))][0].number')

test -n "$PR"
printf '%s\n' "$PR" > /tmp/md2vid-dependabot-canary-pr

gh pr view "$PR" \
  --repo therealhieu/md2vid \
  --json state,author,baseRefName,headRefName,autoMergeRequest,mergeStateStatus \
  | jq -e '
      .state == "OPEN"
      and .author.login == "dependabot[bot]"
      and .baseRefName == "main"
      and (.headRefName | test("^dependabot/(npm_and_yarn/(runtime|dev)-patches|github_actions/actions-patches)(-|$)"))
      and .autoMergeRequest.mergeMethod == "SQUASH"
    ' >/dev/null

gh api "repos/therealhieu/md2vid/pulls/$PR/reviews" \
  --jq 'all(.[]?; .user.login != "github-actions[bot]")' \
  | grep -qx true

CHECKS=$(gh pr checks "$PR" --repo therealhieu/md2vid --required --json name,state,completedAt 2>/dev/null || true)
if printf '%s' "$CHECKS" | jq -e 'any(.[]; .state == "PENDING")' >/dev/null; then
  test "$(gh pr view "$PR" --repo therealhieu/md2vid --json state --jq .state)" = OPEN
else
  echo "All required checks completed before observation; use timestamp proof in Step 10."
fi
```

When the pending state is observed, the PR must remain `OPEN`, target `main`, have a `SQUASH` auto-merge request, and have no review from `github-actions[bot]`. Missing the transient pending state is not a failure; Step 10 proves ordering from timestamps.

- [ ] **Step 10: Watch checks and verify ordered no-review squash merge**

```bash
set -euo pipefail

PR=$(tr -d '[:space:]' < /tmp/md2vid-dependabot-canary-pr)
[[ "$PR" =~ ^[0-9]+$ ]]

gh pr checks "$PR" \
  --repo therealhieu/md2vid \
  --required \
  --watch

PR_JSON=$(gh pr view "$PR" \
  --repo therealhieu/md2vid \
  --json state,mergedAt,mergeCommit)

printf '%s' "$PR_JSON" | jq -e '
  .state == "MERGED"
  and .mergedAt != null
  and .mergeCommit.oid != null
' >/dev/null

MERGED_AT=$(printf '%s' "$PR_JSON" | jq -r .mergedAt)
MERGE_SHA=$(printf '%s' "$PR_JSON" | jq -r .mergeCommit.oid)

gh pr checks "$PR" --repo therealhieu/md2vid --required \
  --json name,state,completedAt \
  | jq -e --arg merged "$MERGED_AT" '
      length == 5
      and all(.[];
        .state == "SUCCESS"
        and .completedAt != null
        and .completedAt <= $merged
      )
    ' >/dev/null

gh api "repos/therealhieu/md2vid/pulls/$PR/reviews" \
  --jq 'all(.[]?; .user.login != "github-actions[bot]")' \
  | grep -qx true

test "$(
  gh api "repos/therealhieu/md2vid/issues/$PR/timeline" \
    --jq '[.[] |
      select(.event == "auto_merge_enabled") |
      select(.actor.login == "github-actions[bot]")
    ] | length'
)" -ge 1

gh api "repos/therealhieu/md2vid/commits/$MERGE_SHA" \
  --jq 'select(
    (.parents | length) == 1
    and (.commit.message | startswith("chore(deps)"))
  ) | .sha' \
  | grep -Eq '^[a-f0-9]{40}$'

rm -f /tmp/md2vid-dependabot-canary-pr
```

Expected:

- all required checks are `SUCCESS` and each `completedAt` is at or before `mergedAt`;
- the timeline contains at least one `auto_merge_enabled` event by `github-actions[bot]`;
- no `github-actions[bot]` review exists;
- state is `MERGED` through the native auto-merge request, not a human review or manual merge command;
- `parent_count` is `1` and the message begins with `chore(deps)`.

- [ ] **Step 11: Observe a negative case when one already exists**

```bash
NEGATIVE_PR=$(gh pr list \
  --repo therealhieu/md2vid \
  --author app/dependabot \
  --base main \
  --state open \
  --json number,headRefName \
  --jq '[.[] | select(.headRefName | test("^dependabot/(npm_and_yarn/(runtime|dev)-patches|github_actions/actions-patches)(-|$)") | not)][0].number // empty')

if test -n "$NEGATIVE_PR"; then
  test "$(gh api repos/therealhieu/md2vid/branches/main/protection --jq .required_pull_request_reviews.required_approving_review_count)" = 0

  gh pr view "$NEGATIVE_PR" --repo therealhieu/md2vid \
    --json headRefName,autoMergeRequest,state \
    | jq -e '
      .state == "OPEN"
      and .autoMergeRequest == null
    ' >/dev/null

  gh api "repos/therealhieu/md2vid/pulls/$NEGATIVE_PR/reviews" \
    --jq 'all(.[]?; .user.login != "github-actions[bot]")' \
    | grep -qx true
else
  echo "No unmatched Dependabot PR exists; local decision-table coverage is the blocking negative proof."
fi
```

When a negative PR exists, `main` must still require zero approvals, and the PR must have no Actions approval/review, no auto-merge request, and remain `OPEN` for manual review. Its absence does not block completion.

## Remote Rollback

If the canary exposes unsafe behavior, disable unattended actions first:

```bash
gh api --method PATCH repos/therealhieu/md2vid -F allow_auto_merge=false

gh api --method PUT \
  repos/therealhieu/md2vid/actions/permissions/workflow \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=false
```

Keep branch protection enabled. Removing or weakening protection requires a separate explicit user decision.
