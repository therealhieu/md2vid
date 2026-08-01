# Resolve Open Pull Requests — Part 2: Runtime and Package Updates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the coupled React update, fresh runtime patch, GSAP validation retry, and stale Node-types update, then prove all original PRs are closed safely.

**Architecture:** Handle React as one atomic manifest/lockfile family. Diagnose #25 and retain its bot-owned guarded-merge contract. Handle #27’s observed external install failure separately from package compatibility, then replace individual package updates through conventional human PRs because they cannot use the grouped-patch auto-merge route.

**Tech Stack:** Node.js 22.18+, npm 11.15.0, TypeScript, Node test runner, Dependabot, GitHub Actions, GitHub CLI.

---

## Group: `react-pair`

### Task 5: Replace #26 and #28 with one atomic React runtime pair [Tester: yes] `[Group: react-pair] [S]`

**Files:**
- Modify: `package.json:83-87`
- Modify: `package-lock.json`
- Modify: `test/cli/dependency-versions.test.ts:62-69`
- Regenerate if required: `public-snapshot.json`

- [ ] **Step 1: Add a failing split-family regression case**

Extend the package-authority test with this exact case after the existing React equality assertion:

```ts
test("React and React DOM reject a split exact version", async () => {
  const manifest = structuredClone(pkg);
  manifest.optionalDependencies.react = "19.2.8";
  manifest.optionalDependencies["react-dom"] = "19.0.0";

  await assert.rejects(
    () => importAuthority(manifest),
    /react and react-dom must use the same exact version/,
  );
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
node --test test/cli/dependency-versions.test.ts
```

Expected: PASS. The new test proves the repository rejects the same split family that made #26 and #28 unmergeable.

- [ ] **Step 3: Apply the atomic manifest update**

Change both optional dependencies together:

```json
"react": "19.2.8",
"react-dom": "19.2.8"
```

No other optional dependency changes belong in this task.

- [ ] **Step 4: Regenerate only the lockfile**

Run:

```bash
corepack npm install --package-lock-only --ignore-scripts
corepack npm ci
```

Expected: both commands exit `0`; the lockfile resolves React and React DOM at `19.2.8` with no unrelated manifest edits.

- [ ] **Step 5: Run dependency and release validation**

Run:

```bash
node --test test/cli/dependency-versions.test.ts
node --test test/cli/scaffold-project.test.ts
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected: all commands exit `0`. If the snapshot check identifies changed tracked hashes, regenerate with the project snapshot command, inspect the diff, and rerun the check.

- [ ] **Step 6: Commit and merge the conventional replacement**

```bash
git add package.json package-lock.json test/cli/dependency-versions.test.ts public-snapshot.json
git commit -m "chore(deps): update React runtime pair"
```

Stage `public-snapshot.json` only when it changed. Open a human-owned PR with the same conventional title and save its number as `REACT_SUCCESSOR_PR`. After all five required checks succeed, merge it through the protected branch, then close #26 and #28 with its resolved URL:

```bash
REACT_SUCCESSOR_URL=$(gh pr view "$REACT_SUCCESSOR_PR" --repo therealhieu/md2vid --json url --jq .url)
gh pr close 26 --repo therealhieu/md2vid --comment "Superseded by $REACT_SUCCESSOR_URL, which updates react and react-dom atomically to 19.2.8."
gh pr close 28 --repo therealhieu/md2vid --comment "Superseded by $REACT_SUCCESSOR_URL, which updates react and react-dom atomically to 19.2.8."
```

**Group review and verification checklist:**

1. Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel on the full React-pair diff.
2. Resume the same implementer for Mode B remediation.
3. Rerun Task 5 Step 5.
4. Nested verifier confirms both manifest and lockfile use React `19.2.8` / React DOM `19.2.8`, no family member was upgraded separately, and #26/#28 close only after the replacement merges.

### Task 6: Diagnose and refresh the grouped runtime patch [Tester: yes] `[S after Task 5]`

**Files:**
- Modify: `docs/superpowers/active/2026-08-01-resolve-open-prs/evidence/pr-inventory.md`
- Test if a project defect reproduces: `test/ci/public-snapshot.test.ts`
- Test if a project defect reproduces: `test/ci/public-snapshot-check.test.ts`
- Test if a project defect reproduces: `test/ci/public-snapshot-checkout.test.ts`
- Reference: `.github/dependabot.yml`
- Reference: `.github/workflows/dependabot-auto-merge.yml`
- Reference: `test/ci/workflows.test.ts`

- [ ] **Step 1: Extract the exact #25 failure**

Run:

```bash
gh run view 30387899259 --repo therealhieu/md2vid --job 91154094246 --log-failed \
  > docs/superpowers/active/2026-08-01-resolve-open-prs/evidence/pr-25-snapshot-failure.log
```

Expected: the log identifies the exact command and error that caused the later public-snapshot failure.

- [ ] **Step 2: Classify the failure against current main**

Run the command named by the extracted log on the current main worktree. For public snapshot validation, run:

```bash
corepack npm ci
corepack npm run public:snapshot:check
```

Expected: if both commands pass, classify the prior result as non-reproducible. If either fails, create a separate targeted fix PR with a failing regression test in the relevant `test/ci/public-snapshot*.test.ts` file before changing behavior.

- [ ] **Step 3: Record the classification**

Append the observed command and full error to the #25 evidence section. Use one of these outcome formats without omitting the actual failure data:

```md
- Reproduced: current-main snapshot validation fails; the preceding evidence block contains the complete command and error. A targeted fix PR is required before refresh.
```

or

```md
- Non-reproducible: `corepack npm ci` and `corepack npm run public:snapshot:check` pass on current main; request a fresh Dependabot runtime-patches PR.
```

- [ ] **Step 4: Obtain a compliant fresh runtime-patches PR**

Use Dependabot’s repository UI to check for updates or wait for its schedule. Do not run `gh pr update-branch`, push a commit to #25, or edit its files. Select only a fresh PR whose branch matches:

```text
dependabot/npm_and_yarn/runtime-patches
```

with an optional hyphenated lowercase-alphanumeric suffix, one verified Dependabot commit, a `chore(deps): bump the runtime-patches group ...` title, and patch-only metadata.

- [ ] **Step 5: Verify the guarded merge request**

For the fresh PR number stored in `FRESH_PR`, run:

```bash
gh pr view "$FRESH_PR" --repo therealhieu/md2vid \
  --json author,baseRefName,headRefName,autoMergeRequest,mergeStateStatus

gh api "repos/therealhieu/md2vid/pulls/$FRESH_PR/reviews" \
  --jq 'all(.[]?; .user.login != "github-actions[bot]")'
```

Expected: author is `dependabot[bot]`; base is `main`; head matches the group branch; `autoMergeRequest.mergeMethod` is `SQUASH`; and the reviews query prints `true`. All five required checks must be successful before the PR merges.

- [ ] **Step 6: Close #25 after the successor merges**

After the successor’s native auto-merge completes, save its number as `FRESH_PR`, resolve its URL, and close #25:

```bash
SUCCESSOR_URL=$(gh pr view "$FRESH_PR" --repo therealhieu/md2vid --json url --jq .url)
gh pr close 25 --repo therealhieu/md2vid --comment "Superseded by $SUCCESSOR_URL, which completed the guarded Dependabot squash auto-merge path."
```

Commit the diagnosis/evidence:

```bash
git add docs/superpowers/active/2026-08-01-resolve-open-prs/evidence
git commit -m "docs(prs): record runtime patch replacement"
```

**Validation (tester):**
- A reproducible snapshot failure has a focused regression test and separate fix PR before any fresh runtime successor.
- A non-reproducible failure is not treated as a dependency compatibility defect.
- The successor has one verified bot commit, no Actions-created review, five passing required checks, and only a native squash auto-merge request.

## Group: `closeout`

### Task 7: Resolve the GSAP update from fresh Node-26 evidence [Tester: yes] `[Group: closeout] [S after Task 6]`

**Files:**
- Modify if a conventional successor is required: `package.json:89-95`
- Modify if a conventional successor is required: `package-lock.json`
- Test if a project defect reproduces: `test/cli/dependency-versions.test.ts`
- Test if a project defect reproduces: `frameworks/hyperframes/__tests__/emit.test.ts`
- Regenerate if required: `public-snapshot.json`

- [ ] **Step 1: Confirm the observed failure is external before altering GSAP**

Capture #27’s failing job evidence:

```bash
gh run view 30341897375 --repo therealhieu/md2vid --job 90219210160 --log-failed \
  > docs/superpowers/active/2026-08-01-resolve-open-prs/evidence/pr-27-node-26-install.log
```

Expected: the log ends before project tests while `onnxruntime-node` installation reports `ETIMEDOUT` or `ENETUNREACH`.

- [ ] **Step 2: Create the conventional GSAP successor from current main**

In the GSAP worktree, update exactly this manifest value:

```json
"gsap": "3.15.0"
```

Then run:

```bash
corepack npm install --package-lock-only --ignore-scripts
corepack npm ci
```

Expected: current dependency installation succeeds. If it fails only in the same external `onnxruntime-node` download phase, retry the CI lane; do not alter GSAP code or add a project regression test.

- [ ] **Step 3: Add a regression test only for a reproducible project failure**

If installation succeeds but a project test fails because the GSAP source is wrong, add a targeted assertion using the package authority:

```ts
assert.equal(
  DEFAULT_GSAP_SRC,
  "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js",
);
```

Place it in `test/cli/dependency-versions.test.ts` only when the existing manifest-derived assertion does not cover the observed failure. Do not add this test for an external network timeout.

- [ ] **Step 4: Run the full successor gate**

Run:

```bash
node --test test/cli/dependency-versions.test.ts
node --test frameworks/hyperframes/__tests__/emit.test.ts
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit, merge, and close #27**

```bash
git add package.json package-lock.json test/cli/dependency-versions.test.ts public-snapshot.json
git commit -m "chore(deps): update gsap"
```

Stage tests and `public-snapshot.json` only when changed. Save the human-owned replacement number as `GSAP_SUCCESSOR_PR`, merge it after all five required remote checks pass, then close #27 with its resolved URL:

```bash
GSAP_SUCCESSOR_URL=$(gh pr view "$GSAP_SUCCESSOR_PR" --repo therealhieu/md2vid --json url --jq .url)
gh pr close 27 --repo therealhieu/md2vid --comment "Superseded by $GSAP_SUCCESSOR_URL, validated after retrying the Node-26 install path."
```

### Task 8: Replace the stale Node-types update [Tester: yes] `[Group: closeout] [S after Task 7]`

**Files:**
- Modify: `package.json:89-95`
- Modify: `package-lock.json`
- Test: `test/cli/dependency-versions.test.ts`
- Regenerate if required: `public-snapshot.json`

- [ ] **Step 1: Add a failing package-authority fixture for the Node-types target**

Add this test after the package-authority test:

```ts
test("Node type definitions stay at the selected update range", () => {
  assert.equal(pkg.devDependencies["@types/node"], "^26.1.2");
});
```

- [ ] **Step 2: Run it against current main**

Run:

```bash
node --test test/cli/dependency-versions.test.ts
```

Expected: FAIL because current main contains `@types/node` `^22.10.0`.

- [ ] **Step 3: Apply the Node-types update and regenerate the lockfile**

Change the root manifest to:

```json
"@types/node": "^26.1.2"
```

Then run:

```bash
corepack npm install --package-lock-only --ignore-scripts
corepack npm ci
```

Expected: exit `0` for both commands.

- [ ] **Step 4: Verify types and release behavior**

Run:

```bash
node --test test/cli/dependency-versions.test.ts
corepack npm run typecheck
corepack npm run check
corepack npm run release:check
corepack npm run public:snapshot:check
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 5: Commit, merge, and close #29**

```bash
git add package.json package-lock.json test/cli/dependency-versions.test.ts public-snapshot.json
git commit -m "chore(deps): update Node type definitions"
```

Stage `public-snapshot.json` only when changed. Save the human-owned replacement number as `NODE_TYPES_SUCCESSOR_PR`, merge it after all five required checks pass, then close #29 with its resolved URL:

```bash
NODE_TYPES_SUCCESSOR_URL=$(gh pr view "$NODE_TYPES_SUCCESSOR_PR" --repo therealhieu/md2vid --json url --jq .url)
gh pr close 29 --repo therealhieu/md2vid --comment "Superseded by $NODE_TYPES_SUCCESSOR_URL, rebuilt from current main after the stale green Dependabot PR."
```

### Task 9: Audit closure and main health [Tester: yes] `[Group: closeout] [S after Task 8]`

**Files:**
- Modify: `docs/superpowers/active/2026-08-01-resolve-open-prs/evidence/pr-inventory.md`
- Reference: `.github/workflows/ci.yml`
- Reference: `.github/workflows/dependabot-auto-merge.yml`

- [ ] **Step 1: Assert no original PR remains open**

Run:

```bash
gh pr list --repo therealhieu/md2vid --state open --limit 100 --json number \
  --jq 'map(.number) | map(select(. == 1 or . == 2 or . == 3 or . == 4 or . == 25 or . == 26 or . == 27 or . == 28 or . == 29)) | length'
```

Expected: `0`.

- [ ] **Step 2: Record successor and merge evidence**

For each original PR, add one row to `evidence/pr-inventory.md` containing its successor URL, successor head SHA, five required-check conclusions, merge commit SHA, and original closure URL.

- [ ] **Step 3: Run final main validation**

Run:

```bash
corepack npm ci
node --test test/ci/workflows.test.ts
node --test test/cli/dependency-versions.test.ts
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected: every command exits `0` and the diff check prints nothing.

- [ ] **Step 4: Verify the guarded runtime merge remained review-free**

For the merged runtime successor SHA in `RUNTIME_SUCCESSOR_PR`, run:

```bash
gh api "repos/therealhieu/md2vid/pulls/$RUNTIME_SUCCESSOR_PR/reviews" \
  --jq 'all(.[]?; .user.login != "github-actions[bot]")'
```

Expected: `true`.

- [ ] **Step 5: Commit final evidence**

```bash
git add docs/superpowers/active/2026-08-01-resolve-open-prs/evidence/pr-inventory.md
git commit -m "docs(prs): record dependency resolution evidence"
```

**Group review and verification checklist:**

1. Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel for the complete closeout scope.
2. Resume the same implementer for Mode B remediation.
3. Rerun Task 9 Step 3.
4. Nested verifier confirms all nine original PRs are closed, every closure has a valid successor/merge record, no protected-branch setting changed, and the grouped runtime successor has no Actions-created review.
