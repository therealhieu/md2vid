# Dependency PR CI Remediation Implementation Plan — Part 6: Final Audit and Check Lifecycle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebase all allowlisted evidence onto final `main`, verify every local, remote, provenance, security, and branch-protection outcome, create the post-implementation check, archive the package, and publish the final audit through protection.

**Architecture:** The persistent evidence branch accumulates only ignored, force-added evidence files until all implementation units merge. It then rebases onto final `main`, adds the concrete check, moves the complete artifact package from `active` to `done`, and publishes one final documentation PR.

**Tech Stack:** Git, GitHub CLI, REST APIs, `jq`, npm 11.15.0, Node.js tests, Superpowers post-implementation check.

---

### Task 20: Audit final `main`, create the check, and archive the package [Tester: yes]

**Files:**
- Create: `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence/final-audit.md`
- Create: `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/2026-08-04-dependency-pr-ci-remediation-check.md`
- Move directory: `docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/` → `docs/superpowers/done/2026-08-04-dependency-pr-ci-remediation/`

- [ ] **Step 1: Rebase the persistent evidence branch onto final `main`**

```bash
cd /Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/dependency-pr-ci-evidence
git status --short
git fetch origin main
git rebase origin/main
```

Expected: clean pre-rebase status and all evidence commits replay without loss. Stop on any conflict; inspect and preserve every evidence file rather than dropping a commit.

- [ ] **Step 2: Assert all original PR dispositions**

```bash
PR_STATES=$(for PR in 47 48 49 51; do
  gh pr view "$PR" \
    --repo therealhieu/md2vid \
    --json number,state,url,headRefOid,mergedAt,mergeCommit
done | jq -s 'sort_by(.number)')

printf '%s' "$PR_STATES" | jq -e '
  .[0].number == 47 and .[0].state == "MERGED" and .[0].mergeCommit.oid != null
  and .[1].number == 48 and .[1].state == "MERGED" and .[1].mergeCommit.oid != null
  and .[2].number == 49 and .[2].state == "CLOSED" and .[2].mergedAt == null
  and .[3].number == 51 and .[3].state == "CLOSED" and .[3].mergedAt == null
' >/dev/null
```

Expected: #47/#48 merged; #49/#51 closed without merge.

- [ ] **Step 3: Assert strict branch protection and exact required contexts**

```bash
PROTECTION=$(gh api \
  repos/therealhieu/md2vid/branches/main/protection)
printf '%s' "$PROTECTION" | jq -e '
  .required_status_checks.strict == true
  and ([.required_status_checks.checks[].context] | sort) == ([
    "dependency-review",
    "pr-latest / validate",
    "pr-minimum / validate",
    "pr-title",
    "public-snapshot / validate"
  ] | sort)
  and .enforce_admins.enabled == true
  and .required_conversation_resolution.enabled == true
  and .allow_force_pushes.enabled == false
  and .allow_deletions.enabled == false
' >/dev/null
```

Expected: the exact five contexts and every inherited protection flag remain unchanged. Do not mutate repository settings.

- [ ] **Step 4: Run the complete final local verification**

```bash
corepack npm ci
node --test test/ci/public-snapshot-check.test.ts
node --test frameworks/hyperframes/__tests__/patch-studio.test.ts
node --test test/cli/hyperframes-self-heal.test.ts
node --test test/cli/dependency-versions.test.ts
node --test test/ci/workflows.test.ts

BEFORE=$(git status --short)
corepack npm run public:snapshot
AFTER=$(git status --short)
test "$AFTER" = "$BEFORE"
test ! -e public-snapshot.json

corepack npm run public:snapshot:check
corepack npm run check
corepack npm run release:check
git diff --check
```

Expected:

- every command exits `0`;
- `public:snapshot` prints a deterministic count/hash and does not change status;
- no repository-root manifest exists;
- generated snapshots still contain and verify their internal manifest;
- all security, package, generated-project, and release boundaries execute.

- [ ] **Step 5: Verify every required evidence file exists and is non-sensitive**

```bash
EVIDENCE_DIR=docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation/evidence
for FILE in \
  unit-b-hyperframes-0.7.87.md \
  pr-47-recovery.md \
  pr-48-recovery.md \
  typescript-6-successor.md \
  pr-49-disposition.md \
  action-v3-local-verification.md \
  pr-51-action-v3-rollout.md; do
  test -s "$EVIDENCE_DIR/$FILE"
done

rg -n \
  'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|gh[pousr]_[A-Za-z0-9_]+|DEPENDABOT_REFRESH_APP_PRIVATE_KEY=' \
  "$EVIDENCE_DIR" \
  && exit 1 || true
```

Expected: every required evidence file is non-empty and no credential/token/private-key pattern is present. Manually inspect for raw workflow logs or unallowlisted PR bodies before continuing.

- [ ] **Step 6: Create final audit evidence**

Create `evidence/final-audit.md` containing:

- Unit A PR URL/head/merge commit and dynamic snapshot outcomes;
- Unit B PR URL/head/merge commit and exact published-package verification;
- #47/#48 old/new heads, five checks, provenance, authorization, and merge commits;
- TypeScript 6 successor URL/head/merge commit and #49 closure;
- Action v3 replacement URL/head/merge commit, no-candidate dispatch, revocation post-step, and #51 closure;
- exact final branch-protection contexts and strictness;
- final command results and test count;
- deviations or `none`;
- remaining risks or `none`.

Use links and allowlisted fields from existing evidence. Do not duplicate raw logs or credentials.

- [ ] **Step 7: Create the post-implementation check with concrete values**

Create `2026-08-04-dependency-pr-ci-remediation-check.md` with the standard headings `Artifacts`, `Scope`, `Review`, `Decisions`, and `Risks / Follow-ups`. The check itself—not only `evidence/final-audit.md`—must directly contain:

- requirements, design, plan index, Parts 1–6, and goal paths;
- Unit A, B, E, and F PR URLs, head SHAs, and merge commits;
- #47 and #48 original/new head SHAs, refresh-run URLs, the five named check conclusions, fresh auto-merge identity/method, and merge commits;
- #49 and #51 original URLs/heads, replacement URLs/merge commits, closure URLs/timestamps, and explicit `not merged` status;
- v3 no-candidate dispatch URL, the exact six-line summary, token-creation result, and post/revocation result;
- the complete final command list, exit status for every command, and final test count;
- implementation and rollout tasks completed `19/19`, Task 20 final-audit completion, and Task 21 publication remaining;
- exact deviations or the literal `none`;
- exact remaining risks with owner/condition or the literal `none`;
- direct confirmations for Unit A, Unit B, TypeScript 6, Action v3, exact five branch-protection contexts, and absence of unfinished work.

Use checked boxes only when the concrete value appears on the same bullet or immediately nested beneath it. Link `evidence/final-audit.md` as supporting detail, not as a substitute for these values. Do not leave placeholders.

- [ ] **Step 8: Move the complete package to `done`**

```bash
git mv \
  docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation \
  docs/superpowers/done/2026-08-04-dependency-pr-ci-remediation
```

The force-added tracked evidence files move with the directory.

- [ ] **Step 9: Verify the archived package**

```bash
DONE=docs/superpowers/done/2026-08-04-dependency-pr-ci-remediation
test ! -e docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation
for FILE in \
  2026-08-04-dependency-pr-ci-remediation-requirements.md \
  2026-08-04-dependency-pr-ci-remediation-design.md \
  2026-08-04-dependency-pr-ci-remediation-plan.md \
  2026-08-04-dependency-pr-ci-remediation-plan-1.md \
  2026-08-04-dependency-pr-ci-remediation-plan-2.md \
  2026-08-04-dependency-pr-ci-remediation-plan-3.md \
  2026-08-04-dependency-pr-ci-remediation-plan-4.md \
  2026-08-04-dependency-pr-ci-remediation-plan-5.md \
  2026-08-04-dependency-pr-ci-remediation-plan-6.md \
  2026-08-04-dependency-pr-ci-remediation-goal.md \
  2026-08-04-dependency-pr-ci-remediation-check.md; do
  test -s "$DONE/$FILE"
done

rg -n '\b(TBD|TODO)\b|fill in|implement later|\[placeholder\]' \
  "$DONE/2026-08-04-dependency-pr-ci-remediation-check.md" \
  "$DONE/evidence" \
  && exit 1 || true

git diff --check
```

Expected: every artifact exists only under `done`, no placeholders remain, and diff formatting is clean.

- [ ] **Step 10: Commit the final audit and archive move**

```bash
DONE=docs/superpowers/done/2026-08-04-dependency-pr-ci-remediation
git add -A
git add -f "$DONE/evidence/final-audit.md"
git ls-files --error-unmatch "$DONE/evidence/final-audit.md" >/dev/null
git commit -m "docs(superpowers): archive dependency PR CI remediation"
```

- [ ] **Step 11: Run the final review lifecycle**

Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel over:

- all evidence files;
- the post-implementation check;
- the active-to-done move;
- the PR-disposition assertions;
- final command results.

Resume the same implementer for accepted remediation. If remediation changes files, force-add any ignored evidence file, stage affected files, and commit `docs(superpowers): correct dependency PR CI audit` after the planned archive commit; do not amend or rewrite prior commits. Re-run Step 2’s PR-disposition assertion, Step 3’s full protection assertion, Step 4’s complete local command set, Step 5’s evidence scan using the `done/**/evidence` path, and Step 9’s archived-package assertions; do not run `git mv` again. Require one read-only verifier before Task 21.

### Task 21: Publish and merge the final audit package [Tester: yes]

**Files:** none; this is a protected publication and post-merge confirmation boundary.

- [ ] **Step 1: Verify branch scope and commit history**

```bash
git status --short
git log --reverse --format='%h %s' origin/main..HEAD
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
```

Expected:

- clean status;
- the planned evidence subjects from Tasks 9, 10, 14, and 19 occur in order before the final archive subject; any additional commit is a focused post-review remediation commit after the affected planned subject;
- no product/source changes on the evidence branch;
- no whitespace errors.

- [ ] **Step 2: Obtain authorization for push and PR creation**

Stop and request explicit authorization for:

1. pushing `docs/dependency-pr-ci-evidence`;
2. opening the final audit PR.

- [ ] **Step 3: Push and create the final audit PR after authorization**

```bash
git push -u origin docs/dependency-pr-ci-evidence

FINAL_PR_URL=$(gh pr create \
  --repo therealhieu/md2vid \
  --base main \
  --head docs/dependency-pr-ci-evidence \
  --title "docs(superpowers): archive dependency PR CI remediation" \
  --body "$(printf '%s\n' \
    '## Summary' \
    '- archive the completed dependency PR CI remediation package' \
    '- record allowlisted recovery, successor, workflow rollout, and final audit evidence' \
    '- preserve the concrete post-implementation check' \
    '' \
    '## Verification' \
    '- final focused, snapshot, full, release, and diff checks passed' \
    '- #47/#48 merged; #49/#51 closed unmerged' \
    '- strict branch protection still requires the exact five contexts')")

FINAL_PR=$(gh pr view "$FINAL_PR_URL" \
  --repo therealhieu/md2vid \
  --json number \
  --jq .number)
```

- [ ] **Step 4: Require all five checks and obtain merge authorization**

```bash
gh pr checks "$FINAL_PR" \
  --repo therealhieu/md2vid \
  --required \
  --watch

gh pr checks "$FINAL_PR" \
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

Stop and request explicit merge authorization. After authorization:

```bash
gh pr merge "$FINAL_PR" \
  --repo therealhieu/md2vid \
  --squash \
  --delete-branch
```

Never use `--admin`.

- [ ] **Step 5: Perform final read-only confirmation**

```bash
git fetch origin main
ACTIVE=docs/superpowers/active/2026-08-04-dependency-pr-ci-remediation
DONE=docs/superpowers/done/2026-08-04-dependency-pr-ci-remediation

test -z "$(git ls-tree -r --name-only origin/main -- "$ACTIVE")"
git cat-file -e "origin/main:$DONE/2026-08-04-dependency-pr-ci-remediation-check.md"
git cat-file -e "origin/main:$DONE/evidence/final-audit.md"

FINAL_PR_STATES=$(for PR in 47 48 49 51; do
  gh pr view "$PR" \
    --repo therealhieu/md2vid \
    --json number,state,mergedAt,mergeCommit
done | jq -s 'sort_by(.number)')
printf '%s' "$FINAL_PR_STATES" | jq -e '
  .[0].number == 47 and .[0].state == "MERGED" and .[0].mergeCommit.oid != null
  and .[1].number == 48 and .[1].state == "MERGED" and .[1].mergeCommit.oid != null
  and .[2].number == 49 and .[2].state == "CLOSED" and .[2].mergedAt == null
  and .[3].number == 51 and .[3].state == "CLOSED" and .[3].mergedAt == null
' >/dev/null
```

Expected:

- remediation artifacts exist only under `done` on `origin/main`;
- #47/#48 are merged;
- #49/#51 are closed without merge;
- no outward action remains.
