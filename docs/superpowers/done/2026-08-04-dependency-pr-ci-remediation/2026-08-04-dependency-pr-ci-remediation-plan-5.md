# Dependency PR CI Remediation Implementation Plan — Part 5: App Token v3 Replacement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PR #51 with a human-owned, exact-SHA `actions/create-github-app-token v3.2.0` update that preserves every privileged boundary, then prove the runtime through a guaranteed no-candidate dispatch before closing #51.

**Architecture:** Change only the immutable action pin in the workflow, synchronize exact structural and mutation policy, retain `app-id`, repository scope, explicit permissions, checkout-free execution, proxy absence, and default token revocation, and keep the first v3 run non-mutating.

**Tech Stack:** GitHub Actions, YAML, Node.js workflow-policy tests, Actionlint, GitHub CLI, REST APIs, native action post-step revocation.

---

### Task 15: Define exact v3 workflow policy [Tester: yes] `[Group: app-token-v3]`

**Files:**
- Modify: `test/ci/workflows.test.ts:2078-2149,3044-3091`
- Test: `.github/workflows/dependabot-branch-refresh.yml:27-37`

- [ ] **Step 1: Create the Unit F worktree after #47/#48 recovery**

```bash
test "$(gh pr view 47 --repo therealhieu/md2vid --json state --jq .state)" = "MERGED"
test "$(gh pr view 48 --repo therealhieu/md2vid --json state --jq .state)" = "MERGED"

PRIMARY=/Users/hieunguyen/git/hieu/projects/md2vid-public
git -C "$PRIMARY" check-ignore -q .worktrees
git -C "$PRIMARY" fetch origin main
git -C "$PRIMARY" worktree add \
  .worktrees/create-app-token-v3 \
  -b ci/create-app-token-v3 \
  origin/main
cd "$PRIMARY/.worktrees/create-app-token-v3"

git status --short
corepack npm ci
node --test test/ci/workflows.test.ts
```

Expected: clean baseline with the deployed v2.2.2 workflow policy green.

- [ ] **Step 2: Change the positive policy to the exact v3.2.0 pin**

In the branch-refresh assertion helper, require:

```ts
const token = steps[1];
exactKeys(token, ["name", "id", "uses", "with"]);
assert.equal(token.id, "app-token");
assert.equal(
  String(token.uses),
  "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1",
);
assert.match(
  yaml,
  /uses:\s+actions\/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1\s+# v3\.2\.0/,
);
```

Update the exact action inventory to:

```ts
assert.deepEqual(uses, [
  "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0",
]);
```

- [ ] **Step 3: Add explicit revocation and proxy absence assertions**

After parsing `token.with`, add:

```ts
const tokenWith = asRecord(token.with, "App token inputs");
assert.equal(Object.hasOwn(tokenWith, "skip-token-revoke"), false);

const prohibitedProxyNames = [
  "NODE_USE_ENV_PROXY",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
];

for (const [scopeName, scope] of [
  ["refresh-one job", job],
  ["App token step", token],
] as const) {
  const env = Object.hasOwn(scope, "env")
    ? asRecord(scope.env, `${scopeName} env`)
    : {};
  for (const name of prohibitedProxyNames) {
    assert.equal(
      Object.hasOwn(env, name),
      false,
      `${scopeName} must not declare ${name}`,
    );
  }
}
```

Keep the exact owner, repository, App variable/secret, and three permission-input assertions unchanged.

- [ ] **Step 4: Add non-no-op security mutations**

Replace the existing v2 SHA/comment source-literal mutations rather than appending alternatives; otherwise they become no-ops after Task 16. Extend the branch-refresh mutations with these exact v3 source strings:

```ts
yaml.replace(
  "          permission-metadata: read\n",
  "          permission-metadata: read\n          skip-token-revoke: true\n",
),
yaml.replace(
  "    permissions: {}\n    steps:",
  "    permissions: {}\n    env:\n      NODE_USE_ENV_PROXY: \"1\"\n    steps:",
),
yaml.replace(
  "        with:\n",
  "        env:\n          HTTPS_PROXY: https://proxy.invalid\n        with:\n",
),
yaml.replace(
  "bcd2ba49218906704ab6c1aa796996da409d3eb1",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
),
yaml.replace(" # v3.2.0", " # v2.2.2"),
```

Retain the existing precondition:

```ts
assert.notEqual(mutated, yaml, `refresh mutation ${index} must modify workflow`);
```

Update the rejection matcher to include:

```text
v3.2.0|skip-token-revoke|proxy|NODE_USE_ENV_PROXY|HTTPS_PROXY
```

- [ ] **Step 5: Run the focused test and verify red**

```bash
node --test test/ci/workflows.test.ts
```

Expected: FAIL because the workflow still pins v2.2.2 and the new exact-v3 policy rejects it.

- [ ] **Step 6: Commit the failing contract**

```bash
git add test/ci/workflows.test.ts
git commit -m "test(ci): define App token v3 policy"
```

### Task 16: Upgrade only the immutable workflow pin [Tester: yes] `[Group: app-token-v3]`

**Files:**
- Modify: `.github/workflows/dependabot-branch-refresh.yml:27-37`

- [ ] **Step 1: Verify the official v3.2.0 tag and commit**

```bash
TAG_RECORD=$(gh api \
  repos/actions/create-github-app-token/git/ref/tags/v3.2.0)
printf '%s' "$TAG_RECORD" | jq -e '
  .ref == "refs/tags/v3.2.0"
  and .object.sha == "bcd2ba49218906704ab6c1aa796996da409d3eb1"
' >/dev/null

COMMIT_RECORD=$(gh api \
  repos/actions/create-github-app-token/commits/bcd2ba49218906704ab6c1aa796996da409d3eb1)
printf '%s' "$COMMIT_RECORD" | jq -e '
  .sha == "bcd2ba49218906704ab6c1aa796996da409d3eb1"
  and .commit.verification.verified == true
' >/dev/null
```

Stop if the tag or verified commit differs.

- [ ] **Step 2: Change exactly one workflow line**

Replace the current pin with:

```yaml
uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0
```

Do not change:

- `app-id`;
- private-key secret;
- owner or repository;
- explicit permission inputs;
- token-output use;
- default revocation;
- proxy environment;
- triggers or runner;
- checkout-free behavior;
- candidate selection or branch mutation code.

- [ ] **Step 3: Run focused green verification**

```bash
node --test test/ci/workflows.test.ts
```

Expected: PASS with exact v3 pin, revocation, proxy, scope, permission, structure, queue, provenance, and mutation contracts.

- [ ] **Step 4: Commit the workflow upgrade**

```bash
git add \
  .github/workflows/dependabot-branch-refresh.yml \
  test/ci/workflows.test.ts
git commit -m "ci(deps): upgrade App token action to v3"
```

### Task 17: Supersede v2 authority and run the local security gate [Tester: yes] `[Group: app-token-v3]`

**Files:**
- Modify: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-requirements.md`
- Modify: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-design.md`
- Modify: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-goal.md`
- Modify: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-plan.md`
- Modify: `docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-plan-3.md`
- Create: `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/action-v3-local-verification.md`
- Do not modify: the open PR #52 check or existing canary-evidence files.

- [ ] **Step 1: Add explicit v3 supersession to future-facing active authority**

Use this callout:

```markdown
> **App-token pin supersession:** Dependency PR CI remediation Unit F replaces
> the originally deployed v2.2.2 pin with the human-reviewed
> `actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1
> # v3.2.0`. Repository scope, explicit installation permissions,
> checkout-free execution, default token revocation, and every branch-refresh
> policy guard remain unchanged. Earlier v2 task bodies remain historical
> execution evidence and are not instructions for new deployments.
```

Update fixed-value/future-deployment sections to name v3.2.0. Do not rewrite completed history or the original v2 implementation steps as if they never occurred.

- [ ] **Step 2: Create allowlisted local verification evidence**

Create `evidence/action-v3-local-verification.md` with:

- official tag and verified commit result;
- exact workflow pin;
- exact repository/permission inputs;
- `skip-token-revoke` absence;
- proxy environment absence;
- checkout/project-execution absence;
- focused workflow tests;
- Actionlint result;
- dynamic snapshot, full, release, and diff results.

Do not include the App ID value, secret name output beyond the approved name, token values, raw workflow content, or arbitrary environment variables.

- [ ] **Step 3: Run the complete local security gate**

```bash
node --test test/ci/workflows.test.ts

if command -v actionlint >/dev/null 2>&1; then
  actionlint -config-file .github/actionlint.yaml
else
  printf '%s\n' "actionlint unavailable; no installation attempted"
fi

corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected: every available command exits `0`; absence of Actionlint is recorded without installing it.

- [ ] **Step 4: Commit authority and evidence**

```bash
git add \
  docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-requirements.md \
  docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-design.md \
  docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-goal.md \
  docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-plan.md \
  docs/superpowers/active/2026-08-04-dependabot-automerge-reliability/2026-08-04-dependabot-automerge-reliability-plan-3.md
git add -f \
  docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/action-v3-local-verification.md
git commit -m "docs(ci): supersede App token v2 authority"
```

- [ ] **Step 5: Run the canonical group lifecycle**

Run `spec-reviewer`, `code-quality-reviewer`, `tester`, and a read-only security reviewer in parallel. Resume the same implementer for accepted remediation, rerun all focused/full commands, and require one nested read-only verifier before Task 18.

### Task 18: Publish and merge the human Action v3 replacement [Tester: yes]

**Files:** none; this is a protected publication boundary.

- [ ] **Step 1: Verify branch scope and commit order**

```bash
git status --short
git diff --name-only origin/main...HEAD
git log --reverse --format='%s' origin/main..HEAD
git diff --check origin/main...HEAD
```

Expected: only the branch-refresh workflow, workflow tests, non-#52 active authority, and local v3 evidence changed. The planned Task 15–17 subjects occur in order; any additional commit is a focused post-review remediation commit after the affected planned subject.

- [ ] **Step 2: Obtain authorization for push and PR creation**

Stop and request explicit authorization for pushing `ci/create-app-token-v3` and opening the human replacement PR. State that #51 remains untouched.

- [ ] **Step 3: Push and create the replacement after authorization**

```bash
git push -u origin ci/create-app-token-v3

F_PR_URL=$(gh pr create \
  --repo therealhieu/md2vid \
  --base main \
  --head ci/create-app-token-v3 \
  --title "ci(deps): upgrade App token action to v3" \
  --body "$(printf '%s\n' \
    '## Summary' \
    '- replace PR #51 with a human-reviewed exact-SHA v3 update' \
    '- preserve checkout-free execution, repository scope, explicit permissions, and default token revocation' \
    '- keep proxy environment absent and every queue/provenance/mutation guard unchanged' \
    '' \
    '## Rollout' \
    '- merge only after all required checks and security review pass' \
    '- first post-merge dispatch will run only with zero exact patch-group candidates')")

F_PR=$(gh pr view "$F_PR_URL" \
  --repo therealhieu/md2vid \
  --json number \
  --jq .number)
```

- [ ] **Step 4: Require all checks and the security review**

```bash
gh pr checks "$F_PR" \
  --repo therealhieu/md2vid \
  --required \
  --watch

gh pr checks "$F_PR" \
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

Confirm the dedicated security review has no unresolved Major finding.

- [ ] **Step 5: Obtain merge authorization and land the replacement**

Stop and request explicit authorization. After authorization:

```bash
gh pr merge "$F_PR" \
  --repo therealhieu/md2vid \
  --squash \
  --delete-branch
```

Never use `--admin`. Confirm merge before Task 19.

### Task 19: Run a guaranteed no-candidate dispatch and close #51 [Tester: yes]

**Files:**
- Create in evidence worktree: `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/pr-51-action-v3-rollout.md`

- [ ] **Step 1: Prove the replacement merged and there are zero exact patch-group candidates**

```bash
F_LOOKUP=$(gh pr list \
  --repo therealhieu/md2vid \
  --state merged \
  --head ci/create-app-token-v3 \
  --limit 10 \
  --json number,url,headRefName)
printf '%s' "$F_LOOKUP" | jq -e '
  length == 1
  and .[0].headRefName == "ci/create-app-token-v3"
' >/dev/null
F_PR=$(printf '%s' "$F_LOOKUP" | jq -er '.[0].number')
F_PR_URL=$(printf '%s' "$F_LOOKUP" | jq -er '.[0].url')

F_STATE=$(gh pr view "$F_PR" \
  --repo therealhieu/md2vid \
  --json state,mergedAt,mergeCommit,url,headRefName)
printf '%s' "$F_STATE" | jq -e --arg url "$F_PR_URL" '
  .state == "MERGED"
  and .mergedAt != null
  and .mergeCommit.oid != null
  and .headRefName == "ci/create-app-token-v3"
  and .url == $url
' >/dev/null

F_CHECKS=$(gh pr checks "$F_PR" \
  --repo therealhieu/md2vid \
  --required \
  --json name,state,link)
printf '%s' "$F_CHECKS" | jq -e '
  length == 5
  and ([.[].name] | sort) == ([
    "dependency-review",
    "pr-latest / validate",
    "pr-minimum / validate",
    "pr-title",
    "public-snapshot / validate"
  ] | sort)
  and all(.[]; .state == "SUCCESS" and .link != null)
' >/dev/null

OPEN_PATCHES=$(gh pr list \
  --repo therealhieu/md2vid \
  --state open \
  --limit 100 \
  --json number,headRefName,mergeStateStatus,createdAt \
  --jq '[.[]
    | select(
        (.headRefName | test(
          "^dependabot/(npm_and_yarn/(runtime|dev)-patches|github_actions/actions-patches)(-[a-z0-9]+)?$"
        ))
      )]')
printf '%s' "$OPEN_PATCHES" | jq -e 'length == 0' >/dev/null
```

If any exact candidate exists, wait. Do not use the first v3 run on a live branch.

- [ ] **Step 2: Obtain explicit dispatch authorization**

Tell the user that the workflow is proven to have zero mutation targets and that the next action dispatches one no-candidate validation run. Obtain authorization immediately before Step 3.

- [ ] **Step 3: Dispatch and correlate exactly one v3 run**

```bash
REPOSITORY=therealhieu/md2vid
RUNS_API="repos/$REPOSITORY/actions/workflows/dependabot-branch-refresh.yml/runs?event=workflow_dispatch&branch=main&per_page=100"
DISPATCH_ACTOR=$(gh api user --jq .login)
BASELINE_RUN_IDS=$(gh api "$RUNS_API" --jq '[.workflow_runs[].id]')
DISPATCHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

gh workflow run dependabot-branch-refresh.yml \
  --repo "$REPOSITORY" \
  --ref main

RUN_ID=''
for attempt in $(seq 1 30); do
  NEW_RUNS=$(gh api "$RUNS_API" \
    | jq \
      --arg actor "$DISPATCH_ACTOR" \
      --arg dispatched_at "$DISPATCHED_AT" \
      --argjson baseline "$BASELINE_RUN_IDS" '
        [.workflow_runs[]
          | .id as $id
          | select(
              .event == "workflow_dispatch"
              and .head_branch == "main"
              and .actor.login == $actor
              and .created_at >= $dispatched_at
              and (($baseline | index($id)) == null)
            )]
      ')
  COUNT=$(printf '%s' "$NEW_RUNS" | jq 'length')
  test "$COUNT" -le 1
  if test "$COUNT" -eq 1; then
    RUN_ID=$(printf '%s' "$NEW_RUNS" | jq -er '.[0].id')
    break
  fi
  sleep 2
done

test -n "$RUN_ID"
gh run watch "$RUN_ID" --repo "$REPOSITORY" --exit-status
RUN_URL=$(gh run view "$RUN_ID" \
  --repo "$REPOSITORY" \
  --json url \
  --jq .url)
test -n "$RUN_URL"
```

- [ ] **Step 4: Require exact no-candidate summary and successful token post-step**

```bash
REFRESH_SUMMARY=$(gh run view "$RUN_ID" \
  --repo "$REPOSITORY" \
  --log \
  | awk -F '\t' '$2 == "Summarize branch refresh" {
      line = $3
      sub(/^[^[:space:]]+[[:space:]]+/, "", line)
      print line
    }' \
  | rg '^(### Dependabot branch refresh|- Outcome:|- Reason:|- PR:|- Group:|- Expected head:)')
EXPECTED_SUMMARY=$(printf '%s\n' \
  '### Dependabot branch refresh' \
  '- Outcome: no-candidates' \
  '- Reason: no-candidates' \
  '- PR: none' \
  '- Group: none' \
  '- Expected head: none')
test "$REFRESH_SUMMARY" = "$EXPECTED_SUMMARY"

RUN_STEPS=$(gh api \
  "repos/$REPOSITORY/actions/runs/$RUN_ID/jobs" \
  --jq '[.jobs[].steps[] | {name,status,conclusion}]')
printf '%s' "$RUN_STEPS" | jq -e '
  any(.[]; .name == "Create repository-scoped App token"
    and .status == "completed"
    and .conclusion == "success")
  and any(.[]; .name == "Summarize branch refresh"
    and .status == "completed"
    and .conclusion == "success")
  and any(.[];
    (.name | startswith("Post Create repository-scoped App token"))
    and .status == "completed"
    and .conclusion == "success")
' >/dev/null
```

The successful post step is evidence of default token revocation. Do not retain raw logs or token material.

- [ ] **Step 5: Prepare and authorize #51 closure**

Verify #51 remains open and unmerged:

```bash
gh pr view 51 \
  --repo therealhieu/md2vid \
  --json state,mergedAt,url,headRefOid \
  | jq -e '.state == "OPEN" and .mergedAt == null' >/dev/null

CLOSURE_BODY=$(cat <<EOF
Superseded by [the merged human-owned App-token v3 replacement]($F_PR_URL).

The replacement preserved the checkout-free repository-scoped permission
boundary and passed all five required checks. Its first post-merge runtime
validation was [a guaranteed no-candidate dispatch]($RUN_URL) with the exact
fixed summary and a successful token post/revocation step.
EOF
)
```

Stop and request explicit authorization before posting this public comment and closing #51. After authorization:

```bash
gh pr close 51 \
  --repo therealhieu/md2vid \
  --comment "$CLOSURE_BODY"
```

- [ ] **Step 6: Record and commit v3 rollout evidence**

In the persistent evidence worktree, create `evidence/pr-51-action-v3-rollout.md` containing:

- original #51 URL/head/root cause;
- replacement URL/head/merge commit;
- official v3.2.0 tag/SHA verification;
- each `F_CHECKS` entry’s exact name, URL, and `SUCCESS` conclusion;
- dispatch run URL and exact no-candidate summary;
- successful token creation, summary, and post/revocation steps;
- #51 closure URL/reason and statement that it was not merged.

```bash
cd /Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependency-pr-ci-evidence
git add -f \
  docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/pr-51-action-v3-rollout.md
git commit -m "docs(ci): record App token v3 rollout"
```

Run `spec-reviewer`, `code-quality-reviewer`, `tester`, and a read-only security reviewer in parallel over the rollout evidence and source run/PR assertions. Resume the same implementer for accepted remediation. If remediation changes files, force-add the ignored evidence file, stage affected files, and commit `docs(ci): correct App token v3 rollout evidence` after the planned evidence commit; do not amend or rewrite prior commits. Re-query the replacement/#51 states and re-run affected dispatch/evidence assertions, then require one read-only verifier before Part 6.
