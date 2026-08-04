# Dependabot Auto-Merge Reliability Implementation Plan — Part 2: Synchronized Families

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create atomic manual-review minor/major PRs for React, React types, and Remotion without changing patch auto-merge eligibility.

**Architecture:** Dependabot first applies the existing patch groups. Three later exact-pattern groups catch only minor and major updates for package families that repository code requires to remain synchronized.

**Tech Stack:** Dependabot v2 YAML, YAML parser, Node test runner.

---

## Group: `dependency-families`

### Task 3: Define exact family-group contracts [Tester: yes] `[Group: dependency-families]`

**Files:**
- Modify: `test/ci/workflows.test.ts`
- Test: `.github/dependabot.yml`
- Test: `.github/workflows/dependabot-auto-merge.yml`

- [ ] **Step 1: Extend the Dependabot configuration assertion**

Require this exact npm group order:

```ts
assert.deepEqual(Object.keys(npmGroups), [
  "runtime-patches",
  "dev-patches",
  "react-family",
  "react-types-family",
  "remotion-family",
]);
```

Require exact manual family contracts:

```ts
const expectedFamilies = {
  "react-family": ["react", "react-dom"],
  "react-types-family": ["@types/react", "@types/react-dom"],
  "remotion-family": [
    "remotion",
    "@remotion/google-fonts",
    "@remotion/media",
  ],
} as const;

for (const [group, patterns] of Object.entries(expectedFamilies)) {
  const value = asRecord(npmGroups[group], group);
  assert.deepEqual(value.patterns, patterns);
  assert.deepEqual(value["update-types"], ["minor", "major"]);
  assert.deepEqual(Object.keys(value).sort(), ["patterns", "update-types"]);
}
```

Retain:

```ts
assert.deepEqual(runtime["update-types"], ["patch"]);
assert.deepEqual(development["update-types"], ["patch"]);
assert.deepEqual(actionPatches["update-types"], ["patch"]);
```

- [ ] **Step 2: Prove manual groups are absent from privileged policy**

Use only the extracted policy script, not the whole repository text:

```ts
const script = dependabotPolicyScript(
  workflow("dependabot-auto-merge.yml"),
);

for (const group of [
  "react-family",
  "react-types-family",
  "remotion-family",
]) {
  assert.equal(script.includes(`group: "${group}"`), false);
}
```

Retain exact assertions that the three patch-group regexes each occur once.

- [ ] **Step 3: Add mutation resistance**

Refactor the group assertion into `assertDependabotGroupPolicy(body)` and prove it rejects:

```ts
const mutations = [
  body.replace('          - "react-dom"', ""),
  body.replace(
    '          - "react-dom"',
    '          - "react-dom"\n          - "left-pad"',
  ),
  body.replace(
    '          - "major"',
    '          - "major"\n          - "patch"',
  ),
  body.replace(
    '          - "patch"',
    '          - "patch"\n          - "minor"',
  ),
  body.replace(
    "      react-family:",
    "      remotion-family:\n        patterns: []\n        update-types: [minor, major]\n      react-family:",
  ),
];

for (const mutated of mutations) {
  assert.notEqual(mutated, body);
  assert.throws(() => assertDependabotGroupPolicy(mutated));
}
```

Mutate the privileged `policies` array by inserting:

```js
{
  group: "react-family",
  branch: /^dependabot\/npm_and_yarn\/react-family(?:-[a-z0-9]+)?$/,
  allowed: new Set(["react", "react-dom"]),
},
```

Require `assertDependabotAutoMergePolicy` to reject that mutation.

- [ ] **Step 4: Verify the red state**

```bash
node --test test/ci/workflows.test.ts
```

Expected: FAIL because the three manual family groups do not exist.

- [ ] **Step 5: Commit the red contract**

```bash
git add test/ci/workflows.test.ts
git commit -m "test(deps): define synchronized family groups"
```

### Task 4: Add exact minor/major family groups [Tester: yes] `[Group: dependency-families]`

**Files:**
- Modify: `.github/dependabot.yml`

- [ ] **Step 1: Add groups after `dev-patches`**

Use exactly:

```yaml
      react-family:
        patterns:
          - "react"
          - "react-dom"
        update-types:
          - "minor"
          - "major"
      react-types-family:
        patterns:
          - "@types/react"
          - "@types/react-dom"
        update-types:
          - "minor"
          - "major"
      remotion-family:
        patterns:
          - "remotion"
          - "@remotion/google-fonts"
          - "@remotion/media"
        update-types:
          - "minor"
          - "major"
```

Do not change runtime, development, or Action patch groups. Do not add ignore rules.

- [ ] **Step 2: Run focused tests**

```bash
node --test test/ci/workflows.test.ts
node --test test/cli/dependency-versions.test.ts
```

Expected: PASS. Dependency-version tests continue proving React/React DOM, React types, and root Remotion packages must stay synchronized.

- [ ] **Step 3: Commit the configuration**

```bash
git add .github/dependabot.yml
git commit -m "chore(deps): group synchronized dependency families"
```

## Group Verification

```bash
node --test test/ci/workflows.test.ts
node --test test/cli/dependency-versions.test.ts
git diff --check HEAD~2..HEAD
```

The verifier must confirm exact group order, exact package membership, exact update types, patch-only existing groups, and absence of every manual family ID from privileged eligibility policy.
