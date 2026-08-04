# Dependabot Auto-Merge Reliability Implementation Plan — Part 1: Title and No-Op Policy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept exact generated Dependabot title families and make trusted non-policy Dependabot PRs successful ineligible no-ops.

**Architecture:** The title job retains its existing human grammar and adds a bot-only generated-title path. The trusted policy completes repository, event, PR, head, commit-count, author, and signature validation before it checks the exact patch-group policy; absent policy returns validated no-op outputs before grouped metadata parsing.

**Tech Stack:** Bash title validation, inline Node.js ESM policy, Node test runner.

---

## Group: `title-policy`

### Task 1: Define generated-title and no-op contracts [Tester: yes] `[Group: title-policy]`

**Files:**
- Modify: `test/ci/workflows.test.ts`
- Test: `.github/workflows/ci.yml`
- Test: `.github/workflows/dependabot-auto-merge.yml`

- [ ] **Step 1: Add one helper that changes every synchronized fixture ref**

Add after `makePolicyFixture`:

```ts
function setPolicyHead(fixture: PolicyFixture, head: string): PolicyFixture {
  (fixture.event.head as WorkflowRecord).ref = head;
  fixture.run.head_branch = head;
  (((fixture.run.pull_requests as WorkflowRecord[])[0].head) as WorkflowRecord).ref =
    head;
  (fixture.pr.head as WorkflowRecord).ref = head;
  return fixture;
}
```

Use this helper wherever a test needs to change the event, run-associated PR, and live PR head together.

- [ ] **Step 2: Replace grouped-title rejection cases with exact positive families**

Use `assertPrTitleAccepted` with these cases:

```ts
const bot = "dependabot[bot]";
const valid: PrTitleInput[] = [
  {
    title: "chore(deps): bump the runtime-patches group with 4 updates",
    actor: bot,
    author: bot,
    headRef: "dependabot/npm_and_yarn/runtime-patches-abc123",
  },
  {
    title:
      "chore(deps): bump the dev-patches group across 1 directory with 1 update",
    actor: bot,
    author: bot,
    headRef: "dependabot/npm_and_yarn/dev-patches-abc123",
  },
  {
    title:
      "chore(deps): bump the actions-patches group across 2 directories with 3 updates",
    actor: bot,
    author: bot,
    headRef: "dependabot/github_actions/actions-patches-abc123",
  },
  {
    title: "chore(deps): bump the react-family group with 2 updates",
    actor: bot,
    author: bot,
    headRef: "dependabot/npm_and_yarn/react-family-abc123",
  },
  {
    title:
      "chore(deps): bump the react-types-family group across 1 directory with 2 updates",
    actor: bot,
    author: bot,
    headRef: "dependabot/npm_and_yarn/react-types-family-abc123",
  },
  {
    title: "chore(deps): bump the remotion-family group with 3 updates",
    actor: bot,
    author: bot,
    headRef: "dependabot/npm_and_yarn/remotion-family-abc123",
  },
  {
    title: "chore(deps): bump typescript from 5.7.3 to 7.0.2",
    actor: bot,
    author: bot,
    headRef: "dependabot/npm_and_yarn/typescript-7.0.2",
  },
  {
    title: "chore(deps): bump @types/node from 26.1.1 to 26.1.2",
    actor: bot,
    author: bot,
    headRef: "dependabot/npm_and_yarn/types/node-26.1.2",
  },
  {
    title: "chore(deps): bump actions/setup-node from 6.0.0 to 7.0.0",
    actor: bot,
    author: bot,
    headRef: "dependabot/github_actions/actions/setup-node-7.0.0",
  },
  {
    title: "chore(deps): bump typescript from 5.8.0-beta.1 to 5.8.0-rc.1",
    actor: bot,
    author: bot,
    headRef: "dependabot/npm_and_yarn/typescript-5.8.0-rc.1",
  },
];

for (const input of valid) assertPrTitleAccepted(yaml, input);
```

Keep the existing accepted/rejected human-title cases unchanged.

- [ ] **Step 3: Add exact negative title mutations**

```ts
const invalid: PrTitleInput[] = [
  { ...valid[0], actor: "therealhieu" },
  { ...valid[0], author: "therealhieu" },
  { ...valid[0], headRef: "dependabot/pip/runtime-patches-abc123" },
  {
    ...valid[0],
    title: "chore(deps): bump the runtime-patches-extra group with 4 updates",
  },
  {
    ...valid[0],
    title: "chore(deps): bump the runtime-patches group with 0 updates",
  },
  {
    ...valid[0],
    title: "chore(deps): bump the runtime-patches group with 01 update",
  },
  {
    ...valid[0],
    title: "chore(deps): bump the runtime-patches group with +1 update",
  },
  {
    ...valid[0],
    title: "chore(deps): bump the runtime-patches group with 1 updates",
  },
  {
    ...valid[0],
    title:
      "chore(deps): bump the runtime-patches group across 1 directories with 4 updates",
  },
  {
    ...valid[0],
    title:
      "chore(deps): bump the runtime-patches group across 2 directory with 4 updates",
  },
  {
    ...valid[0],
    title: "chore(deps): bump the runtime-patches group with 4 updates.",
  },
  {
    ...valid[0],
    title: "chore(deps): bump the dev-patches group with 4 updates",
  },
  { ...valid[6], headRef: "dependabot/pip/typescript-7.0.2" },
  {
    ...valid[6],
    title: "chore(deps): bump typescript from 5.7.3 to 7.0.2.",
  },
  {
    ...valid[6],
    title: "chore(deps): bump typescript from 5.7.3\nto 7.0.2",
  },
];

for (const input of invalid) assertPrTitleRejected(yaml, input);
```

- [ ] **Step 4: Add trusted non-policy no-op tests**

Use this exact expected result:

```ts
const expectedNoOp = {
  status: 0,
  values: {
    eligible: "false",
    group: "none",
    pr_number: "123",
    expected_head_sha: "a".repeat(40),
  },
};
```

Test supported but non-policy refs with commit metadata that lacks `dependency-group`:

```ts
const nonPolicyHeads = [
  "dependabot/npm_and_yarn/typescript-7.0.2",
  "dependabot/npm_and_yarn/types/node-26.1.2",
  "dependabot/github_actions/actions/setup-node-7.0.0",
  "dependabot/npm_and_yarn/react-family-abc123",
  "dependabot/npm_and_yarn/runtime-patchesevil",
];

for (const head of nonPolicyHeads) {
  const fixture = setPolicyHead(
    makePolicyFixture("runtime-patches", ["hyperframes"]),
    head,
  );
  (fixture.commits[0].commit as WorkflowRecord).message =
    "chore(deps): generated Dependabot update";
  assert.deepEqual(runDependabotPolicy(yaml, fixture), expectedNoOp);
}
```

Reject unsupported or empty namespaces before any outputs:

```ts
for (const head of [
  "dependabot/pip/requests-3.0.0",
  "dependabot/npm_and_yarn/",
  "feature/typescript-7.0.2",
]) {
  const fixture = setPolicyHead(
    makePolicyFixture("runtime-patches", ["hyperframes"]),
    head,
  );
  const result = runDependabotPolicy(yaml, fixture);
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.values, {});
}
```

Retain actor, repository, base, live-head, maintainer-change, commit-count, commit-author, and verification mutations as failures.

- [ ] **Step 5: Verify the red state**

```bash
node --test test/ci/workflows.test.ts
```

Expected: FAIL in generated-title and trusted non-policy no-op tests. Current title validation rejects current grouped and individual forms; current trusted policy either rejects dotted/slashed refs or attempts grouped metadata parsing.

- [ ] **Step 6: Commit the red contract**

```bash
git add test/ci/workflows.test.ts
git commit -m "test(ci): define Dependabot title and no-op policy"
```

### Task 2: Implement exact generated titles and early no-op [Tester: yes] `[Group: title-policy]`

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/dependabot-auto-merge.yml`

- [ ] **Step 1: Preserve the existing human title path**

Do not change the conventional-title expression, punctuation rule, non-Dependabot identity requirement, or 72-character limit.

- [ ] **Step 2: Replace the Dependabot fallback with exact title-family logic**

After the human path, require exact bot identity and a supported namespace:

```bash
test "$PR_ACTOR" = "dependabot[bot]"
test "$PR_AUTHOR" = "dependabot[bot]"
[[ "$PR_HEAD_REF" =~ ^dependabot/(npm_and_yarn|github_actions)/[^[:space:]]+$ ]]

valid_count_word() {
  local count="$1"
  local word="$2"
  local singular="$3"
  local plural="$4"
  [[ "$count" =~ ^[1-9][0-9]*$ ]]
  if [[ "$count" = "1" ]]; then
    test "$word" = "$singular"
  else
    test "$word" = "$plural"
  fi
}

valid_group_branch() {
  local group="$1"
  case "$group" in
    runtime-patches|dev-patches|react-family|react-types-family|remotion-family)
      [[ "$PR_HEAD_REF" =~ ^dependabot/npm_and_yarn/${group}(-[a-z0-9]+)?$ ]]
      ;;
    actions-patches)
      [[ "$PR_HEAD_REF" =~ ^dependabot/github_actions/actions-patches(-[a-z0-9]+)?$ ]]
      ;;
    *)
      return 1
      ;;
  esac
}
```

Accept the current grouped form:

```bash
if [[ "$PR_TITLE" =~ ^chore\(deps\):\ bump\ the\ (runtime-patches|dev-patches|actions-patches|react-family|react-types-family|remotion-family)\ group\ with\ ([1-9][0-9]*)\ (update|updates)$ ]]; then
  group="${BASH_REMATCH[1]}"
  updates="${BASH_REMATCH[2]}"
  update_word="${BASH_REMATCH[3]}"
  valid_count_word "$updates" "$update_word" update updates
  valid_group_branch "$group"
  exit 0
fi
```

Accept the legacy/multi-directory form:

```bash
if [[ "$PR_TITLE" =~ ^chore\(deps\):\ bump\ the\ (runtime-patches|dev-patches|actions-patches|react-family|react-types-family|remotion-family)\ group\ across\ ([1-9][0-9]*)\ (directory|directories)\ with\ ([1-9][0-9]*)\ (update|updates)$ ]]; then
  group="${BASH_REMATCH[1]}"
  directories="${BASH_REMATCH[2]}"
  directory_word="${BASH_REMATCH[3]}"
  updates="${BASH_REMATCH[4]}"
  update_word="${BASH_REMATCH[5]}"
  valid_count_word "$directories" "$directory_word" directory directories
  valid_count_word "$updates" "$update_word" update updates
  valid_group_branch "$group"
  exit 0
fi
```

Accept individual titles only after the identity and namespace checks:

```bash
if [[ "$PR_TITLE" =~ ^chore\(deps\):\ bump\ ([^[:space:]]+)\ from\ ([^[:space:]]+)\ to\ ([^[:space:]]+)$ ]]; then
  exit 0
fi

exit 1
```

- [ ] **Step 3: Broaden only the trusted generic namespace check**

In `.github/workflows/dependabot-auto-merge.yml`, replace the current event head-ref restriction with:

```js
!/^dependabot\/(?:npm_and_yarn|github_actions)\/[^\s]+$/.test(eventHeadRef)
```

Do not broaden any exact patch-group regex in `policies`.

- [ ] **Step 4: Return before grouped metadata parsing when no policy exists**

Immediately after full provenance validation and `policies.find`:

```js
const policy = policies.find(({ branch }) => branch.test(pr.head.ref));

if (policy === undefined) {
  appendFileSync(output, "eligible=false\n");
  appendFileSync(output, "group=none\n");
  appendFileSync(output, `pr_number=${pr.number}\n`);
  appendFileSync(output, `expected_head_sha=${expectedHeadSha}\n`);
  process.exit(0);
}

const entries = parseDependencies(commit.commit.message);
const names = entries.map((entry) => entry["dependency-name"]);
if (new Set(names).size !== names.length) {
  fail("dependency metadata contains duplicates");
}
const eligible =
  entries.every((entry) => entry["dependency-group"] === policy.group) &&
  entries.every((entry) => entry["update-type"] === patchUpdateType) &&
  (policy.allowed === null ||
    names.every((name) => policy.allowed.has(name)));

appendFileSync(output, `eligible=${eligible}\n`);
appendFileSync(output, `group=${policy.group}\n`);
appendFileSync(output, `pr_number=${pr.number}\n`);
appendFileSync(output, `expected_head_sha=${expectedHeadSha}\n`);
```

Leave both write steps guarded by:

```yaml
if: steps.policy.outputs.eligible == 'true'
```

- [ ] **Step 5: Run focused verification**

```bash
node --test test/ci/workflows.test.ts
```

Expected: PASS. Exact patch groups remain eligible; individual, manual-family, unknown, and near-prefix supported refs return the four no-op outputs; unsupported namespaces and provenance mutations fail.

- [ ] **Step 6: Commit the implementation**

```bash
git add .github/workflows/ci.yml .github/workflows/dependabot-auto-merge.yml
git commit -m "ci(deps): accept generated Dependabot PRs"
```

## Group Verification

```bash
node --test test/ci/workflows.test.ts
git diff --check HEAD~2..HEAD
```

The verifier must confirm title acceptance does not imply merge eligibility, human behavior is unchanged, metadata parsing is skipped only after full trusted identity/provenance validation, and every write remains eligible-gated.
