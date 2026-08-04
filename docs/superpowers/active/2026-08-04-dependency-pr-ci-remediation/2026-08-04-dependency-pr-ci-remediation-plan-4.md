# Dependency PR CI Remediation Implementation Plan — Part 4: TypeScript 6 Successor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace incompatible PR #49 with a human-owned TypeScript 6.0.3 update that preserves root-to-scaffold version authority and passes the complete generated Remotion bundle/render path.

**Architecture:** Keep one TypeScript authority in `package.json`. Update only manifest/lockfile, use the existing dependency-authority and release-smoke contracts as compatibility gates, and reject shims, version decoupling, weakened compiler options, or reduced release coverage.

**Tech Stack:** TypeScript 6.0.3, npm 11.15.0, Node.js test runner, Remotion bundler/renderer, GitHub CLI.

---

### Task 11: Upgrade to TypeScript 6.0.3 [Tester: yes] `[Group: typescript-6-successor]`

**Files:**
- Modify: `package.json:89-95`
- Modify: `package-lock.json:22-28,2632-2644`
- Exercise: `scripts/dependency_versions.ts:55-87`
- Exercise: `frameworks/remotion/scaffold.ts:37-50`
- Test: `test/cli/dependency-versions.test.ts:62-85,140-153,190-206`
- Test: `test/release/harness.ts:2533-2652,2885-2938`

- [ ] **Step 1: Create the Unit E worktree after #48 merges**

```bash
test "$(gh pr view 48 \
  --repo therealhieu/md2vid \
  --json state \
  --jq .state)" = "MERGED"

PRIMARY=/Users/hieunguyen/git/hieu/projects/md2vid-public
git -C "$PRIMARY" check-ignore -q .worktrees
git -C "$PRIMARY" fetch origin main
git -C "$PRIMARY" worktree add \
  .worktrees/typescript-6 \
  -b build/typescript-6 \
  origin/main
cd "$PRIMARY/.worktrees/typescript-6"

git status --short
corepack npm ci
corepack npm run typecheck
corepack npm run typecheck:remotion
node --test test/cli/dependency-versions.test.ts
```

Expected: clean status and green baseline.

- [ ] **Step 2: Verify the official release and npm integrity**

```bash
gh release view v6.0.3 \
  --repo microsoft/TypeScript \
  --json tagName,isDraft,isPrerelease,publishedAt,url

corepack npm view typescript@6.0.3 \
  version dist.integrity dist.tarball engines \
  --json
```

Expected:

- tag `v6.0.3` is neither draft nor prerelease;
- npm version is `6.0.3`;
- integrity is exactly:

```text
sha512-y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw==
```

Stop if official metadata differs; update the design rather than guessing another version.

- [ ] **Step 3: Create the lockfile-consistency red state**

Change only `package.json`:

```json
"typescript": "^6.0.3"
```

Run:

```bash
corepack npm ci
```

Expected: FAIL because `package.json` requests TypeScript 6 while the committed lockfile still resolves the old range/version.

- [ ] **Step 4: Regenerate only the lockfile and restore a clean install**

```bash
corepack npm install --package-lock-only --ignore-scripts
corepack npm ci
```

Expected: both manifest and lockfile agree; install succeeds and postinstall remains green.

- [ ] **Step 5: Assert exact root and lockfile authority**

```bash
node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const resolved = lock.packages["node_modules/typescript"];

assert.equal(pkg.devDependencies.typescript, "^6.0.3");
assert.equal(lock.packages[""].devDependencies.typescript, "^6.0.3");
assert.equal(resolved.version, "6.0.3");
assert.equal(
  resolved.integrity,
  "sha512-y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw==",
);
assert.equal(Object.hasOwn(pkg, "overrides"), false);
NODE
```

- [ ] **Step 6: Run the complete compatibility gate**

```bash
corepack npm run typecheck
corepack npm run typecheck:remotion
node --test test/cli/dependency-versions.test.ts
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected:

- root and Remotion template typechecks pass;
- dependency authority still copies the root version into generated Remotion scaffolds;
- `release:check` reaches generated Remotion install, build, check, still render, bundler, and runtime/browser probes;
- no TypeScript 7 shim, unstable compiler entry, scaffold-only pin, compiler-option relaxation, or release-smoke reduction is introduced.

If a real TypeScript 6 incompatibility appears, stop and defer the upgrade.

- [ ] **Step 7: Commit the dependency update**

```bash
git add package.json package-lock.json
git commit -m "build(deps): upgrade TypeScript to 6.0.3"
```

### Task 12: Record complete TypeScript 6 verification [Tester: yes] `[Group: typescript-6-successor]`

**Files:**
- Create: `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/typescript-6-successor.md`

- [ ] **Step 1: Create allowlisted verification evidence**

Record:

- TypeScript release URL and npm integrity;
- root range `^6.0.3`;
- resolved version `6.0.3`;
- `TYPESCRIPT_VERSION` and generated Remotion dev-dependency results;
- root and Remotion template typechecks;
- focused dependency-authority test;
- dynamic public snapshot check;
- full check and exact test count;
- generated Remotion build/render/runtime probe;
- explicit statement that no TypeScript 7 shim, unstable internal entry, or version decoupling was added.

Do not include npm credentials, registry tokens, raw environment output, or unrelated package metadata.

- [ ] **Step 2: Re-run the evidence commands from the committed dependency state**

```bash
corepack npm ci
corepack npm run typecheck
corepack npm run typecheck:remotion
node --test test/cli/dependency-versions.test.ts
corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected: all commands exit `0` from the commit created by Task 11.

- [ ] **Step 3: Force-add and commit the ignored evidence**

```bash
git add -f \
  docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/typescript-6-successor.md
git commit -m "docs(deps): record TypeScript 6 verification"
```

- [ ] **Step 4: Run the canonical group lifecycle**

Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel over Tasks 11–12. Resume the same implementer for accepted remediation, rerun the complete compatibility gate, and require one nested read-only verifier before Task 13.

### Task 13: Publish, validate, and merge the TypeScript 6 successor [Tester: yes]

**Files:** none; this is a protected publication boundary.

- [ ] **Step 1: Verify branch scope and commit order**

```bash
git status --short
git diff --name-only origin/main...HEAD
git log --reverse --format='%s' origin/main..HEAD
git diff --check origin/main...HEAD
```

Expected:

- only `package.json`, `package-lock.json`, and the one TypeScript evidence file changed;
- the planned Task 11–12 subjects occur in order; any additional commit is a focused post-review remediation commit after the affected planned subject;
- clean status and no whitespace errors.

- [ ] **Step 2: Obtain authorization for push and PR creation**

Stop and request explicit authorization for pushing `build/typescript-6` and opening the human successor PR.

- [ ] **Step 3: Push and create the successor after authorization**

```bash
git push -u origin build/typescript-6

E_PR_URL=$(gh pr create \
  --repo therealhieu/md2vid \
  --base main \
  --head build/typescript-6 \
  --title "build(deps): upgrade TypeScript to 6.0.3" \
  --body "$(printf '%s\n' \
    '## Summary' \
    '- replace the incompatible TypeScript 7 proposal with TypeScript 6.0.3' \
    '- preserve root-to-Remotion-scaffold version authority' \
    '- retain the complete generated Remotion build/render smoke' \
    '' \
    '## Verification' \
    '- corepack npm run typecheck' \
    '- corepack npm run typecheck:remotion' \
    '- node --test test/cli/dependency-versions.test.ts' \
    '- corepack npm run public:snapshot:check' \
    '- corepack npm run check' \
    '- corepack npm run release:check')")

E_PR=$(gh pr view "$E_PR_URL" \
  --repo therealhieu/md2vid \
  --json number \
  --jq .number)
```

- [ ] **Step 4: Require all five checks**

```bash
gh pr checks "$E_PR" \
  --repo therealhieu/md2vid \
  --required \
  --watch

gh pr checks "$E_PR" \
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

- [ ] **Step 5: Obtain merge authorization and land the successor**

Stop and request explicit authorization. After authorization:

```bash
gh pr merge "$E_PR" \
  --repo therealhieu/md2vid \
  --squash \
  --delete-branch
```

Never use `--admin`. Confirm the replacement is merged before Task 14.

### Task 14: Close #49 and record its disposition [Tester: yes]

**Files:**
- Create in evidence worktree: `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/pr-49-disposition.md`

- [ ] **Step 1: Verify the successor merged and #49 did not**

```bash
E_LOOKUP=$(gh pr list \
  --repo therealhieu/md2vid \
  --state merged \
  --head build/typescript-6 \
  --limit 10 \
  --json number,url,headRefName)
printf '%s' "$E_LOOKUP" | jq -e '
  length == 1
  and .[0].headRefName == "build/typescript-6"
' >/dev/null
E_PR=$(printf '%s' "$E_LOOKUP" | jq -er '.[0].number')
E_PR_URL=$(printf '%s' "$E_LOOKUP" | jq -er '.[0].url')

E_STATE=$(gh pr view "$E_PR" \
  --repo therealhieu/md2vid \
  --json state,mergedAt,mergeCommit,url,headRefName)
printf '%s' "$E_STATE" | jq -e --arg url "$E_PR_URL" '
  .state == "MERGED"
  and .mergedAt != null
  and .mergeCommit.oid != null
  and .headRefName == "build/typescript-6"
  and .url == $url
' >/dev/null

E_CHECKS=$(gh pr checks "$E_PR" \
  --repo therealhieu/md2vid \
  --required \
  --json name,state,link)
printf '%s' "$E_CHECKS" | jq -e '
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

gh pr view 49 \
  --repo therealhieu/md2vid \
  --json number,state,mergedAt,url,headRefOid \
  | jq -e '.number == 49 and .state == "OPEN" and .mergedAt == null' \
  >/dev/null
```

- [ ] **Step 2: Prepare the exact closure comment**

```bash
CLOSURE_BODY=$(cat <<EOF
Superseded by [the merged human-owned TypeScript 6.0.3 successor]($E_PR_URL).

TypeScript 7.0.2 is incompatible with the JavaScript compiler API currently
required by @remotion/bundler (\`readConfigFile\` and
\`typescript.sys.readFile\`). The successor preserved the root-to-scaffold
version authority and passed root typecheck, Remotion template typecheck,
dynamic public-snapshot validation, full checks, and the generated Remotion
bundle/render smoke. No compatibility shim or unstable TypeScript 7 internal
entry point was added.
EOF
)
```

- [ ] **Step 3: Obtain explicit authorization before commenting and closing**

Tell the user that the next command posts the prepared public comment and closes #49. Do not infer authorization from the successor merge.

- [ ] **Step 4: Close #49 after authorization**

```bash
gh pr close 49 \
  --repo therealhieu/md2vid \
  --comment "$CLOSURE_BODY"
```

- [ ] **Step 5: Record and commit #49 disposition in the persistent evidence branch**

In `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependency-pr-ci-evidence`, create `evidence/pr-49-disposition.md` with:

- original #49 URL/head and release-smoke root cause;
- successor URL/head/merge commit;
- TypeScript 6 version and integrity;
- local results and each `E_CHECKS` entry’s exact name, URL, and `SUCCESS` conclusion;
- exact closure reason and closure timestamp;
- statement that #49 was not merged.

```bash
cd /Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependency-pr-ci-evidence
git add -f \
  docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/pr-49-disposition.md
git commit -m "docs(deps): record PR 49 disposition"
```

Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel over the #49 disposition evidence and source PR records. Resume the same implementer for accepted remediation. If remediation changes files, force-add the ignored evidence file, stage affected files, and commit `docs(deps): correct PR 49 disposition evidence` after the planned evidence commit; do not amend or rewrite prior commits. Re-query the successor/#49 states and re-run affected evidence assertions, then require one read-only verifier before Part 5.
