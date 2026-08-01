# Resolve Open Pull Requests — Part 1: Baseline and Actions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a green current-main baseline, then replace blocked #1–#4 with one validated human-owned Actions-major update.

**Architecture:** Store live PR evidence before any external write. Use a conventional human PR for Actions v7/v8 because the existing Dependabot title/guard policy intentionally admits grouped patch PRs rather than these individual major upgrades. Preserve full immutable SHAs and make workflow tests accept an upstream major version comment without freezing routine Action versions.

**Tech Stack:** Node.js, npm 11.15.0, Node test runner, GitHub Actions YAML, Actionlint when installed, GitHub CLI.

---

## Group: `baseline`

### Task 1: Record current PR evidence [Tester: no] `[S]`

**Files:**
- Create: `docs/superpowers/active/2026-08-01-resolve-open-prs/evidence/pr-inventory.md`

- [ ] **Step 1: Write the evidence table before external writes**

Create `evidence/pr-inventory.md` with this exact initial inventory:

```md
| Original PR | Initial classification | Required successor |
|---|---|---|
| #1–#4 | Individual Actions major updates rejected by historical bot-title policy | One human-owned Actions v7/v8 PR |
| #25 | Grouped runtime patch; snapshot rerun failure needs diagnosis | Fresh single-commit Dependabot runtime-patches PR after diagnosis |
| #26 + #28 | Split React/React DOM `19.2.8` update | One atomic human-owned React pair PR |
| #27 | Node 26 install-time `onnxruntime-node` network failure | Retry before creating a successor |
| #29 | Green checks but stale branch | Human-owned Node-types PR from current main |
```

- [ ] **Step 2: Capture immutable remote state**

Run:

```bash
for pr in 1 2 3 4 25 26 27 28 29; do
  gh pr view "$pr" --repo therealhieu/md2vid \
    --json number,url,state,headRefName,headRefOid,mergeStateStatus,statusCheckRollup \
    > "docs/superpowers/active/2026-08-01-resolve-open-prs/evidence/pr-${pr}.json"
done
```

Expected: nine JSON files exist and no PR state changes.

- [ ] **Step 3: Add exact failure evidence to the inventory**

Append the verified causes:

```md
- #1–#4: historical `pr-title` reaches the fallback `exit 1` for individual Dependabot action-update titles.
- #25: `public-snapshot / validate` job `91154094246` failed on 2026-07-31 after an earlier pass on 2026-07-28.
- #26: `react-dom@19.2.8` peer-requires `react@^19.2.8` while the PR retains `react@19.0.0`.
- #27: Node 26 `npm ci` fails before tests while downloading `onnxruntime-node` with `ETIMEDOUT` / `ENETUNREACH`.
- #28: `scripts/dependency_versions.ts` rejects unequal React and React DOM exact versions.
- #29: all recorded checks pass; the branch is only behind main.
```

- [ ] **Step 4: Verify no GitHub mutation occurred**

Run:

```bash
gh pr list --repo therealhieu/md2vid --state open --limit 100 --json number \
  --jq 'map(.number) | sort'
```

Expected: `[1,2,3,4,25,26,27,28,29]`.

- [ ] **Step 5: Commit the local evidence**

```bash
git add docs/superpowers/active/2026-08-01-resolve-open-prs/evidence
git commit -m "docs(prs): record open dependency blockers"
```

### Task 2: Verify the current-main replacement baseline [Tester: yes] `[S after Task 1]`

**Files:**
- Test: `test/ci/workflows.test.ts`
- Test: `test/cli/dependency-versions.test.ts`
- Test: `test/ci/public-snapshot.test.ts`
- Test: `test/ci/public-snapshot-check.test.ts`
- Test: `test/ci/public-snapshot-checkout.test.ts`

- [ ] **Step 1: Record the remote main SHA**

Run:

```bash
gh api repos/therealhieu/md2vid/git/ref/heads/main --jq .object.sha
```

Expected: one 40-character commit SHA. Record it in `evidence/pr-inventory.md`.

- [ ] **Step 2: Install the exact package-manager dependency graph**

Run:

```bash
corepack npm ci
```

Expected: exit `0`. If it fails, stop this plan and create a separate baseline-fix design; do not resolve any PR against a broken main baseline.

- [ ] **Step 3: Run the baseline test gate**

Run:

```bash
node --test test/ci/workflows.test.ts
node --test test/cli/dependency-versions.test.ts
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected: every command exits `0`; `git diff --check` prints nothing.

- [ ] **Step 4: Capture green baseline evidence**

Append the SHA and command results to `evidence/pr-inventory.md` under `## Baseline`.

- [ ] **Step 5: Commit the updated evidence**

```bash
git add docs/superpowers/active/2026-08-01-resolve-open-prs/evidence/pr-inventory.md
git commit -m "test(prs): verify dependency resolution baseline"
```

## Group: `actions-major`

### Task 3: Generalize Action-major comment contracts [Tester: yes] `[Group: actions-major] [S after Task 2]`

**Files:**
- Modify: `test/ci/workflows.test.ts:763-766,1545-1557`

- [ ] **Step 1: Write the failing v7 Action-comment contract**

Add this test beside the existing validation workflow tests:

```ts
test("workflow contracts accept immutable Action major-version comments", () => {
  const validate = workflow("validate.yml").replace(
    "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4",
    "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0",
  );
  assert.doesNotThrow(() => assertValidationNpmOrdering(validate));
});
```

- [ ] **Step 2: Run the focused test to verify red state**

Run:

```bash
node --test test/ci/workflows.test.ts
```

Expected: FAIL because `assertValidationNpmOrdering()` still requires `# v4` for `actions/setup-node`.

- [ ] **Step 3: Generalize the version-comment contract**

Replace each fixed major matcher in `assertValidationNpmOrdering()`, `assertNightlyPolicy()`, and the reusable-validation policy tests with its major-version form:

```ts
// Before
/actions\/setup-node@[a-f0-9]{40}\s+# v4(?:\.\d+)*/

// After
/actions\/setup-node@[a-f0-9]{40}\s+# v\d+(?:\.\d+)*/
```

Apply the same `v\d+` form to `actions/checkout`, `actions/upload-artifact`, and `actions/download-artifact`. Keep `assertPinnedUses()` unchanged: it already requires a full SHA and numeric version comment.

- [ ] **Step 4: Add a negative mutation for a non-version Action comment**

Add this mutation alongside existing pinned-action mutation coverage:

```ts
const nonVersionComment = workflow("validate.yml").replace(
  "# v4",
  "# latest",
);
assert.throws(() => assertPinnedUses(nonVersionComment));
```

- [ ] **Step 5: Run the test to verify the contract and mutation**

Run:

```bash
node --test test/ci/workflows.test.ts
```

Expected: PASS; a `# latest` comment is rejected while `# v7.0.0` and `# v8.0.1` remain valid.

- [ ] **Step 6: Commit the contract update**

```bash
git add test/ci/workflows.test.ts
git commit -m "test(ci): accept immutable action major pins"
```

### Task 4: Apply the authenticated Actions v7/v8 pins [Tester: yes] `[Group: actions-major] [S after Task 3]`

**Files:**
- Modify: `.github/workflows/ci.yml:23`
- Modify: `.github/workflows/nightly.yml:24`
- Modify: `.github/workflows/release.yml:41,47,121,127,175,202,256,302,307,312,360,405,410,423,514,544,590,594`
- Modify: `.github/workflows/validate.yml:28,33,69`
- Regenerate if required: `public-snapshot.json`

- [ ] **Step 1: Verify the intended four pin pairs from the original Dependabot diffs**

Use exactly these authenticated update pairs:

```text
actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
```

- [ ] **Step 2: Replace every active occurrence in the workflow set**

Apply these exact substitutions only in `.github/workflows/ci.yml`, `.github/workflows/nightly.yml`, `.github/workflows/release.yml`, and `.github/workflows/validate.yml`:

```text
49933ea5288caeca8642d1e84afbd3f7d6820020 # v4 → 820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
11d5960a326750d5838078e36cf38b85af677262 # v4 → 3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4 → 3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
ea165f8d65b6e75b540449e92b4886f43607fa02 # v4 → 043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
```

Do not alter workflow triggers, permissions, `persist-credentials`, or merge-policy files.

- [ ] **Step 3: Run local workflow and project validation**

Run:

```bash
node --test test/ci/workflows.test.ts
if command -v actionlint >/dev/null 2>&1; then actionlint -config-file .github/actionlint.yaml; fi
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected: every command exits `0`; regenerate `public-snapshot.json` only if the snapshot check reports the workflow hashes are stale, then rerun the check.

- [ ] **Step 4: Commit the workflow update**

```bash
git add .github/workflows test/ci/workflows.test.ts public-snapshot.json
git commit -m "ci(deps): update GitHub Actions major versions"
```

Stage `public-snapshot.json` only when it changed.

- [ ] **Step 5: Open, validate, merge, and close the superseded PRs**

Open a human-owned conventional PR titled:

```text
ci(deps): update GitHub Actions major versions
```

Save the human-owned replacement number as `ACTIONS_SUCCESSOR_PR`. After `pr-title`, `dependency-review`, `public-snapshot / validate`, `pr-minimum / validate`, and `pr-latest / validate` all succeed, merge normally through the protected branch. Then close #1, #2, #3, and #4 with the resolved successor URL:

```bash
ACTIONS_SUCCESSOR_URL=$(gh pr view "$ACTIONS_SUCCESSOR_PR" --repo therealhieu/md2vid --json url --jq .url)
for pr in 1 2 3 4; do
  gh pr close "$pr" --repo therealhieu/md2vid \
    --comment "Superseded by $ACTIONS_SUCCESSOR_URL, which applies and validates all four related major Action updates together."
done
```

**Group review and verification checklist:**

1. Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel on the full `actions-major` diff.
2. Resume the same implementer for Mode B remediation.
3. Rerun Task 4 Step 3.
4. Nested verifier confirms all Action occurrences use exactly the four listed full SHA/version pairs, workflow policy remains least-privilege, and #1–#4 close only after the human replacement merges.
