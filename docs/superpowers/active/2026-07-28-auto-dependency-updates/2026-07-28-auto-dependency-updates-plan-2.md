# Automatic Dependency Updates Implementation Plan — Part 2: Automation and Rollout

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create patch-only Dependabot groups, add a checkout-free guarded approval and native auto-merge workflow, then activate repository protections and prove one real Dependabot canary.

**Architecture:** Dependabot determines which grouped patch PRs are created. A no-write `pull_request` observer emits only a completion signal. A privileged `workflow_run` stage whose definition comes from the default branch re-queries exactly one associated live Dependabot PR, validates repository, actor, author, base, head repository/ref/SHA, every commit's provenance, semantic update type, group branch, and dependency-name policy, then performs its only side effects: commit-bound approval and a head-bound native squash auto-merge request. GitHub branch protection decides when or whether the merge occurs.

**Tech Stack:** Dependabot v2 configuration, GitHub Actions, full-SHA-pinned `dependabot/fetch-metadata`, trusted inline Node.js policy validation, GitHub CLI, GitHub REST API.

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
     - review POST with commit_id
     - live-head recheck
     - gh pr merge --auto --squash --match-head-commit
```

`dependabot/fetch-metadata@v2.5.0` is removed from the revised workflow. Its pinned implementation requires `context.payload.pull_request` and validates only the first listed commit, so it cannot directly and completely enforce this `workflow_run` trust model. The privileged stage instead uses checkout-free trusted GitHub API queries and inline parsing. This section supersedes the original single-workflow code sketch below; Mode B replaces that sketch and records the final exact contracts in tests.

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
  "approve-and-enable-auto-merge": "ubuntu-latest",
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

  const job = parsedJob(value, "approve-and-enable-auto-merge");
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

  const steps = parsedSteps(job, "approve-and-enable-auto-merge");
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
  approve-and-enable-auto-merge:
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

4. [ ] The verifier confirms:
   - all three group IDs match the workflow policy;
   - every group is patch-only and every current dependency is covered;
   - no dependency patch ignore rule exists;
   - runtime and development dependency-name allowlists match root package metadata;
   - the workflow checks both actor and PR author;
   - no `pull_request_target`, checkout, install, build, or repository script execution exists;
   - metadata, approval, and merge failures are not suppressed;
   - the merge command uses exactly `--auto --squash`, without `--admin`;
   - minor, major, unknown-group, and unknown-dependency PRs cannot reach side-effect steps.

---

### Task 6: Configure protections and prove one canary [Tester: yes]

**Tester:** This is a remote policy task. API read-back and a real Dependabot PR are the verification mechanism. Do not simulate eligibility with an ordinary pull request.

**Files:**
- Remote repository settings only; no local file modification
- Repository: `therealhieu/md2vid`
- Branch: `main`

**Prerequisites:**

- Tasks 1–5 have merged into `main`.
- Their implementation PR passed all existing CI checks.
- The user has seen the live current → proposed settings diff and explicitly approved remote writes.

- [ ] **Step 1: Read current remote state without changing it**

```bash
gh api repos/therealhieu/md2vid \
  --jq '{allow_auto_merge,allow_squash_merge,default_branch}'

gh api repos/therealhieu/md2vid/actions/permissions/workflow

gh api repos/therealhieu/md2vid/branches/main \
  --jq '{name,protected,protection}'

gh api repos/therealhieu/md2vid/rulesets
```

Expected planning baseline:

```text
allow_auto_merge: false
can_approve_pull_request_reviews: false
main protected: false
rulesets: []
```

If live state differs, stop. Do not overwrite existing policy.

- [ ] **Step 2: Verify stable check names from the merged implementation PR**

```bash
RUN_ID=$(gh run list \
  --repo therealhieu/md2vid \
  --workflow CI \
  --event pull_request \
  --limit 20 \
  --json databaseId,headBranch \
  --jq 'map(select(.headBranch == "auto-dependency-updates-impl"))[0].databaseId')

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
allow_auto_merge: false → true
can_approve_pull_request_reviews: false → true
default_workflow_permissions: preserve read
main protection:
  require strict status checks: five verified names
  require pull request: yes
  required approvals: 1
  dismiss stale approvals: yes
  enforce admins: yes
  require conversation resolution: yes
  allow force pushes: no
  allow deletion: no
```

Proceed only after explicit confirmation.

- [ ] **Step 4: Protect `main` before enabling merge authority**

```bash
gh api \
  --method PUT \
  repos/therealhieu/md2vid/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "pr-title",
      "dependency-review",
      "public-snapshot / validate",
      "pr-minimum / validate",
      "pr-latest / validate"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
```

Expected: HTTP success with protection details. At this point auto-merge and Actions approval remain disabled.

- [ ] **Step 5: Verify branch protection before granting merge authority**

```bash
gh api repos/therealhieu/md2vid/branches/main/protection \
  --jq '{
    strict: .required_status_checks.strict,
    checks: [.required_status_checks.contexts[]],
    approvals: .required_pull_request_reviews.required_approving_review_count,
    dismiss_stale: .required_pull_request_reviews.dismiss_stale_reviews,
    enforce_admins: .enforce_admins.enabled,
    force_pushes: .allow_force_pushes.enabled,
    deletions: .allow_deletions.enabled,
    conversation_resolution: .required_conversation_resolution.enabled
  }'
```

Expected:

```json
{
  "strict": true,
  "checks": [
    "pr-title",
    "dependency-review",
    "public-snapshot / validate",
    "pr-minimum / validate",
    "pr-latest / validate"
  ],
  "approvals": 1,
  "dismiss_stale": true,
  "enforce_admins": true,
  "force_pushes": false,
  "deletions": false,
  "conversation_resolution": true
}
```

Stop if any value differs.

- [ ] **Step 6: Allow Actions approval while preserving read defaults**

```bash
gh api \
  --method PUT \
  repos/therealhieu/md2vid/actions/permissions/workflow \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=true

gh api repos/therealhieu/md2vid/actions/permissions/workflow
```

Expected:

```json
{
  "default_workflow_permissions": "read",
  "can_approve_pull_request_reviews": true
}
```

- [ ] **Step 7: Enable native repository auto-merge last**

```bash
gh api \
  --method PATCH \
  repos/therealhieu/md2vid \
  -F allow_auto_merge=true

gh api repos/therealhieu/md2vid \
  --jq '{allow_auto_merge,allow_squash_merge}'
```

Expected both values are `true`. If read-back fails, disable Actions approval immediately and stop.

- [ ] **Step 8: Confirm merged configuration exists on `main`**

```bash
gh api repos/therealhieu/md2vid/contents/.github/dependabot.yml \
  -f ref=main --jq '.sha'

gh api repos/therealhieu/md2vid/contents/.github/workflows/dependabot-auto-merge.yml \
  -f ref=main --jq '.sha'
```

Expected: both commands return nonempty 40-character blob SHAs.

- [ ] **Step 9: Obtain a real Dependabot patch canary**

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

- [ ] **Step 10: Capture approval and auto-merge evidence**

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
  --json state,author,baseRefName,headRefName,autoMergeRequest,reviews,mergeStateStatus

CHECKS=$(gh pr checks "$PR" --repo therealhieu/md2vid --required --json name,state,completedAt 2>/dev/null || true)
if printf '%s' "$CHECKS" | jq -e 'any(.[]; .state == "PENDING")' >/dev/null; then
  test "$(gh pr view "$PR" --repo therealhieu/md2vid --json state --jq .state)" = OPEN
  gh pr view "$PR" --repo therealhieu/md2vid \
    --json autoMergeRequest,reviews \
    | jq -e '
      .autoMergeRequest.mergeMethod == "SQUASH"
      and any(.reviews[]?;
        .state == "APPROVED"
        and .author.login == "github-actions[bot]"
      )
      and all(.reviews[]?;
        .state != "APPROVED"
        or .author.login == "github-actions[bot]"
      )
    ' >/dev/null
else
  echo "All required checks completed before observation; use timestamp proof in Step 11."
fi
```

When the pending state is observed, the PR must remain `OPEN`, target `main`, have a `SQUASH` auto-merge request, and contain an approved review from `github-actions[bot]`. Missing the transient pending state is not a failure; Step 11 proves ordering from timestamps.

- [ ] **Step 11: Watch checks and verify ordered squash merge**

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
  --json state,mergedAt,mergeCommit,reviews)

printf '%s' "$PR_JSON" | jq -e '
  .state == "MERGED"
  and .mergedAt != null
  and .mergeCommit.oid != null
  and any(.reviews[]?;
    .state == "APPROVED"
    and .author.login == "github-actions[bot]"
  )
  and all(.reviews[]?;
    .state != "APPROVED"
    or .author.login == "github-actions[bot]"
  )
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
- state is `MERGED` without a human review or merge command;
- `parent_count` is `1` and the message begins with `chore(deps)`.

- [ ] **Step 12: Observe a negative case when one already exists**

```bash
NEGATIVE_PR=$(gh pr list \
  --repo therealhieu/md2vid \
  --author app/dependabot \
  --base main \
  --state open \
  --json number,headRefName \
  --jq '[.[] | select(.headRefName | test("^dependabot/(npm_and_yarn/(runtime|dev)-patches|github_actions/actions-patches)(-|$)") | not)][0].number // empty')

if test -n "$NEGATIVE_PR"; then
  gh pr view "$NEGATIVE_PR" --repo therealhieu/md2vid \
    --json headRefName,autoMergeRequest,reviews,state \
    | jq -e '
      .state == "OPEN"
      and .autoMergeRequest == null
      and all(.reviews[]?;
        .state != "APPROVED"
        or .author.login != "github-actions[bot]"
      )
    ' >/dev/null
else
  echo "No unmatched Dependabot PR exists; local decision-table coverage is the blocking negative proof."
fi
```

When a negative PR exists, it must have no Actions approval, no auto-merge request, and remain `OPEN` for manual review. Its absence does not block completion.

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
