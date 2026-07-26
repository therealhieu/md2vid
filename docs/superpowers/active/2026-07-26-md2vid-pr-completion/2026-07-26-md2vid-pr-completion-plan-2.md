# Finish md2vid PR #12 — Plan Part 2: Reviews, Repository Gates, and Artifact Isolation

> **Dependency:** Start only after Part 1 focused tests pass and the active working tree contains no unexplained changes.
>
> **Identity rule:** Any source change after Task 6 records the candidate tree invalidates all later review, matrix, artifact, and E2E evidence. Recompute the candidate and restart from Task 6.

## Task 6: Freeze one candidate and pass three independent reviews [Tester: no]

**Purpose:** Give the spec, quality, and test reviewers one immutable tree identity and close Task #115 only when all Must fix findings are gone.

**Files:**
- Create ignored evidence under: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/$RUN_ID/00-candidate/`
- Create ignored evidence under: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/$RUN_ID/01-independent-reviews/`
- Later modify after PASS only: `docs/superpowers/active/2026-07-24-md-to-video-e2e/2026-07-24-md-to-video-e2e-checkpoint.md`

- [ ] **Step 1: Record the starting repository and toolchain state**

Run from the repository root:

```bash
export REPO=/Users/hieunguyen/git/hieu/projects/md2vid-public
cd "$REPO"

export RUN_ID="pr12-$(date -u +%Y%m%dT%H%M%SZ)"
export RUN_EVIDENCE="$REPO/docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/$RUN_ID"
mkdir -p \
  "$RUN_EVIDENCE/00-candidate" \
  "$RUN_EVIDENCE/01-independent-reviews"

git branch --show-current | tee "$RUN_EVIDENCE/00-candidate/branch.txt"
git rev-parse HEAD | tee "$RUN_EVIDENCE/00-candidate/active-head.txt"
git status --short | tee "$RUN_EVIDENCE/00-candidate/active-status.txt"
git diff --stat | tee "$RUN_EVIDENCE/00-candidate/active-diff-stat.txt"
git diff --check
corepack npm --version | tee "$RUN_EVIDENCE/00-candidate/npm-version.txt"
node --version | tee "$RUN_EVIDENCE/00-candidate/node-version.txt"
ffmpeg -version > "$RUN_EVIDENCE/00-candidate/ffmpeg-version.txt"
ffprobe -version > "$RUN_EVIDENCE/00-candidate/ffprobe-version.txt"
```

Expected:

- branch is `fix/stabilize-cli-workflows`;
- active HEAD is still based on `77e36e12f90519df54b06e926dbb9ab86907393c`;
- npm is exactly `11.15.0`;
- all working-tree changes are explained by Part 1 and the new completion artifacts;
- `git diff --check` exits `0`.

If `git status --short` shows an unknown file, stop. Do not add it automatically.

- [ ] **Step 2: Record the intentional untracked allowlist**

Run:

```bash
git ls-files --others --exclude-standard \
  | tee "$RUN_EVIDENCE/00-candidate/intentional-untracked.txt"
```

Expected untracked content is limited to Markdown artifacts under:

```text
docs/superpowers/active/2026-07-26-md2vid-pr-completion/
```

Ignored `evidence/` content must not appear in the list.

- [ ] **Step 3: Build a virtual candidate tree without changing the active index**

Run:

```bash
export SNAPSHOT_ROOT="$(mktemp -d /tmp/md2vid-pr12-candidate.XXXXXX)"
export SNAPSHOT_INDEX="$SNAPSHOT_ROOT/index"

GIT_INDEX_FILE="$SNAPSHOT_INDEX" git read-tree HEAD
GIT_INDEX_FILE="$SNAPSHOT_INDEX" git add -u
GIT_INDEX_FILE="$SNAPSHOT_INDEX" git add -- \
  docs/superpowers/active/2026-07-26-md2vid-pr-completion/*.md

export CANDIDATE_TREE="$(GIT_INDEX_FILE="$SNAPSHOT_INDEX" git write-tree)"
printf '%s\n' "$CANDIDATE_TREE" \
  | tee "$RUN_EVIDENCE/00-candidate/candidate-tree.txt"

git diff --binary HEAD \
  | shasum -a 256 \
  | tee "$RUN_EVIDENCE/00-candidate/tracked-diff.sha256"
```

Expected: `CANDIDATE_TREE` is a full Git tree SHA; the active branch, active index, and working tree remain unchanged.

- [ ] **Step 4: Capture the pre-sync PR state**

Run:

```bash
gh pr view 12 --repo therealhieu/md2vid \
  --json number,title,state,isDraft,headRefOid,baseRefName,url,statusCheckRollup,reviewDecision,mergeStateStatus \
  > "$RUN_EVIDENCE/00-candidate/pr-before.json"
```

Expected: remote head remains the older PR commit until post-PASS authorization.

- [ ] **Step 5: Dispatch the three read-only reviews in parallel**

Dispatch one `spec-reviewer`, one `code-quality-reviewer`, and one `tester`. Every prompt must include:

```text
Read-only review. Do not edit, commit, push, or delegate.
Candidate tree: $CANDIDATE_TREE
Approved design: docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-design.md
Review all Part 1 fixes plus Task #115 style/script transport, exact GSAP removal, two-frame global-to-local conversion, standalone/composed parity, nonmonotonic seeks, timeline/controller uniqueness, and evidence confinement.
Return verified Must fix and Nice-to-have findings with file:line evidence and explicit PASS or FAIL.
```

The tester must run at least:

```bash
node --test \
  engine/__tests__/config.test.ts \
  engine/__tests__/plan.test.ts \
  test/cli/workflows.test.ts \
  test/cli/run-exports.test.ts \
  frameworks/remotion/__tests__/verify.test.ts \
  test/cli/package-meta.test.ts

node --test \
  frameworks/hyperframes/__tests__/emit.test.ts \
  frameworks/hyperframes/__tests__/verify.test.ts \
  test/release/harness.test.ts
```

- [ ] **Step 6: Preserve the three review reports**

Write the exact final reports to:

```text
$RUN_EVIDENCE/01-independent-reviews/spec-review.md
$RUN_EVIDENCE/01-independent-reviews/code-quality-review.md
$RUN_EVIDENCE/01-independent-reviews/tester-review.md
```

Each report must state the same `CANDIDATE_TREE`.

- [ ] **Step 7: Create the finding disposition**

Create `disposition.md` with this concrete table structure:

```md
# Independent Review Disposition

Candidate tree: `$CANDIDATE_TREE`

| Review | Finding | Severity | Disposition | Evidence |
|---|---|---|---|---|
| spec | none | none | no action | `spec-review.md`: PASS |
| quality | none | none | no action | `code-quality-review.md`: PASS |
| tester | none | none | no action | `tester-review.md`: PASS |

Final review gate: PASS
```

If a report contains a finding, replace that review's `none` row with one row per actual finding and its verified disposition. Do not retain a PASS row for a reviewer that reported an unresolved Must fix.

- [ ] **Step 8: Enforce the review stop condition**

If any Must fix finding remains:

```text
stop
→ preserve reports
→ fix with RED/GREEN tests
→ recompute CANDIDATE_TREE
→ rerun all three reviews
```

Do not close Task #115 or continue to Task 7 until all three reports pass with zero unresolved Must fix finding.

## Task 7: Run the uninterrupted repository matrix [Tester: no] `[S after Task 6]`

**Purpose:** Prove source, type, tests, generated references, public snapshot, packed release smoke, and both whitespace scopes pass on the reviewed candidate.

**Files:**
- Create ignored evidence under: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/$RUN_ID/02-repository-matrix/`

- [ ] **Step 1: Confirm the tree did not change after review**

Run:

```bash
export CURRENT_TREE="$(GIT_INDEX_FILE="$SNAPSHOT_INDEX" git write-tree)"
test "$CURRENT_TREE" = "$CANDIDATE_TREE"
git diff --check
```

Expected: both commands exit `0`. A mismatch invalidates Task 6 reviews.

- [ ] **Step 2: Create the matrix evidence directory**

Run:

```bash
mkdir -p "$RUN_EVIDENCE/02-repository-matrix"
```

- [ ] **Step 3: Run npm-version preflight**

Run:

```bash
set -o pipefail
corepack npm --version \
  2>&1 | tee "$RUN_EVIDENCE/02-repository-matrix/00-npm-version.log"
printf '%s\n' "$?" \
  > "$RUN_EVIDENCE/02-repository-matrix/00-npm-version.exit-code"
```

Expected: log contains `11.15.0`; exit code file contains `0`.

- [ ] **Step 4: Run typecheck**

Run:

```bash
set -o pipefail
corepack npm run typecheck \
  2>&1 | tee "$RUN_EVIDENCE/02-repository-matrix/01-typecheck.log"
printf '%s\n' "$?" \
  > "$RUN_EVIDENCE/02-repository-matrix/01-typecheck.exit-code"
```

Expected: exit `0`.

- [ ] **Step 5: Run Remotion typecheck**

Run:

```bash
set -o pipefail
corepack npm run typecheck:remotion \
  2>&1 | tee "$RUN_EVIDENCE/02-repository-matrix/02-typecheck-remotion.log"
printf '%s\n' "$?" \
  > "$RUN_EVIDENCE/02-repository-matrix/02-typecheck-remotion.exit-code"
```

Expected: exit `0`.

- [ ] **Step 6: Run the full test suite**

Run:

```bash
set -o pipefail
corepack npm test \
  2>&1 | tee "$RUN_EVIDENCE/02-repository-matrix/03-test.log"
printf '%s\n' "$?" \
  > "$RUN_EVIDENCE/02-repository-matrix/03-test.exit-code"
```

Expected: exit `0`, zero failures, zero unexpected skips. Record the actual test count; do not hardcode `704`.

- [ ] **Step 7: Run skill-reference verification**

Run:

```bash
set -o pipefail
corepack npm run check:skill-references \
  2>&1 | tee "$RUN_EVIDENCE/02-repository-matrix/04-skill-references.log"
printf '%s\n' "$?" \
  > "$RUN_EVIDENCE/02-repository-matrix/04-skill-references.exit-code"
```

Expected: exit `0`.

- [ ] **Step 8: Run public-snapshot verification**

Run:

```bash
set -o pipefail
corepack npm run public:snapshot:check \
  2>&1 | tee "$RUN_EVIDENCE/02-repository-matrix/05-public-snapshot.log"
printf '%s\n' "$?" \
  > "$RUN_EVIDENCE/02-repository-matrix/05-public-snapshot.exit-code"
```

Expected: exit `0`; record audit/install warnings separately.

- [ ] **Step 9: Run packed release verification**

Run:

```bash
set -o pipefail
corepack npm run release:check \
  2>&1 | tee "$RUN_EVIDENCE/02-repository-matrix/06-release-check.log"
printf '%s\n' "$?" \
  > "$RUN_EVIDENCE/02-repository-matrix/06-release-check.exit-code"
```

Expected: exit `0`; packed HyperFrames build/check/browser/short-render and packed Remotion build/check/still smoke pass.

- [ ] **Step 10: Check committed branch whitespace**

Run:

```bash
set -o pipefail
git diff --check main...HEAD \
  2>&1 | tee "$RUN_EVIDENCE/02-repository-matrix/07-committed-range-diff-check.log"
printf '%s\n' "$?" \
  > "$RUN_EVIDENCE/02-repository-matrix/07-committed-range-diff-check.exit-code"
```

Expected: exit `0` and no output.

- [ ] **Step 11: Check working-tree whitespace**

Run:

```bash
set -o pipefail
git diff --check \
  2>&1 | tee "$RUN_EVIDENCE/02-repository-matrix/08-working-tree-diff-check.log"
printf '%s\n' "$?" \
  > "$RUN_EVIDENCE/02-repository-matrix/08-working-tree-diff-check.exit-code"
```

Expected: exit `0` and no output.

- [ ] **Step 12: Record the matrix summary**

Derive the actual test and skip counts, then write `summary.json`:

```bash
export TEST_COUNT="$(python3 - "$RUN_EVIDENCE/02-repository-matrix/03-test.log" <<'PY'
from pathlib import Path
import re
import sys
text = Path(sys.argv[1]).read_text()
match = re.search(r"^# tests (\d+)$", text, re.MULTILINE)
if not match:
    raise SystemExit("test count not found")
print(match.group(1))
PY
)"

export UNEXPECTED_SKIPS="$(python3 - "$RUN_EVIDENCE/02-repository-matrix/03-test.log" <<'PY'
from pathlib import Path
import re
import sys
text = Path(sys.argv[1]).read_text()
match = re.search(r"^# skipped (\d+)$", text, re.MULTILINE)
print(match.group(1) if match else "0")
PY
)"

CANDIDATE_TREE="$CANDIDATE_TREE" \
TEST_COUNT="$TEST_COUNT" \
UNEXPECTED_SKIPS="$UNEXPECTED_SKIPS" \
python3 - "$RUN_EVIDENCE/02-repository-matrix/summary.json" <<'PY'
from pathlib import Path
import json
import os
import sys
summary = {
    "candidateTree": os.environ["CANDIDATE_TREE"],
    "npm": "11.15.0",
    "testCount": int(os.environ["TEST_COUNT"]),
    "unexpectedSkips": int(os.environ["UNEXPECTED_SKIPS"]),
    "gates": {
        "typecheck": 0,
        "typecheckRemotion": 0,
        "test": 0,
        "skillReferences": 0,
        "publicSnapshot": 0,
        "releaseCheck": 0,
        "committedDiffCheck": 0,
        "workingTreeDiffCheck": 0,
    },
    "result": "PASS",
}
Path(sys.argv[1]).write_text(json.dumps(summary, indent=2) + "\n")
PY
```

Expected: `testCount` matches the test log and `unexpectedSkips` is `0`.

- [ ] **Step 13: Enforce the matrix stop condition**

Any non-zero exit means:

```text
preserve failing log
→ record FAIL
→ do not pack/install/render
→ fix source
→ rerun affected reviews
→ restart Task 7 from npm version
```

## Task 8: Create and verify the exact packed candidate [Tester: no] `[S after Task 7]`

**Purpose:** Create a clean detached validation commit for the reviewed tree, verify its tarball, and prove a separate manual install resolves only package-owned code.

**Files:**
- Create ignored evidence under: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/$RUN_ID/03-validation-artifact/`
- Create ignored evidence under: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/$RUN_ID/04-isolated-install/`

- [ ] **Step 1: Reconfirm the candidate tree**

Run:

```bash
mkdir -p \
  "$RUN_EVIDENCE/03-validation-artifact" \
  "$RUN_EVIDENCE/04-isolated-install"

export VALIDATION_TREE="$(GIT_INDEX_FILE="$SNAPSHOT_INDEX" git write-tree)"
test "$VALIDATION_TREE" = "$CANDIDATE_TREE"
```

Expected: exit `0`.

- [ ] **Step 2: Create a throwaway commit without moving the active branch**

Run:

```bash
export VALIDATION_COMMIT="$({
  printf '%s\n' 'chore: temporary md2vid PR 12 validation candidate'
} | git \
  -c user.name='md2vid validation' \
  -c user.email='validation@invalid.local' \
  commit-tree "$VALIDATION_TREE" -p HEAD)"

printf '%s\n' "$VALIDATION_COMMIT" \
  | tee "$RUN_EVIDENCE/03-validation-artifact/validation-commit.txt"
printf '%s\n' "$VALIDATION_TREE" \
  | tee "$RUN_EVIDENCE/03-validation-artifact/validation-tree.txt"
```

Expected: a commit SHA and tree SHA are recorded; `git branch --show-current` and `git rev-parse HEAD` in the active checkout are unchanged.

- [ ] **Step 3: Create the detached validation checkout**

Run:

```bash
export VALIDATION_ROOT="$(mktemp -d /tmp/md2vid-pr12-validation.XXXXXX)"
export VALIDATION_CHECKOUT="$VALIDATION_ROOT/checkout"

git worktree add --detach "$VALIDATION_CHECKOUT" "$VALIDATION_COMMIT"
git -C "$VALIDATION_CHECKOUT" status --porcelain \
  | tee "$RUN_EVIDENCE/03-validation-artifact/validation-checkout-status.txt"
git -C "$VALIDATION_CHECKOUT" rev-parse HEAD
git -C "$VALIDATION_CHECKOUT" rev-parse 'HEAD^{tree}'
```

Expected:

- detached checkout;
- empty status output;
- HEAD equals `VALIDATION_COMMIT`;
- tree equals `CANDIDATE_TREE`.

- [ ] **Step 4: Install validation-checkout dependencies**

Run:

```bash
cd "$VALIDATION_CHECKOUT"
set -o pipefail
corepack npm ci \
  2>&1 | tee "$RUN_EVIDENCE/03-validation-artifact/npm-ci.log"
corepack npm --version
```

Expected: exit `0`; npm is `11.15.0`.

- [ ] **Step 5: Pack a retained artifact**

Run:

```bash
export ARTIFACT_DIR="$VALIDATION_ROOT/artifact"
mkdir "$ARTIFACT_DIR"

set -o pipefail
corepack npm run release:pack -- --output "$ARTIFACT_DIR" \
  2>&1 | tee "$RUN_EVIDENCE/03-validation-artifact/pack.log"

export TARBALL="$ARTIFACT_DIR/md2vid-0.1.2.tgz"
test -s "$TARBALL"
test -s "$ARTIFACT_DIR/artifact.json"
```

Expected: pack exits `0`; tarball and metadata are non-empty.

- [ ] **Step 6: Verify identity and hashes**

Run:

```bash
cp "$ARTIFACT_DIR/artifact.json" \
  "$RUN_EVIDENCE/03-validation-artifact/artifact.json"
cp "$TARBALL" \
  "$RUN_EVIDENCE/03-validation-artifact/md2vid-0.1.2.tgz"

shasum -a 256 "$TARBALL" \
  | tee "$RUN_EVIDENCE/03-validation-artifact/tarball.sha256"
shasum -a 512 "$TARBALL" \
  | tee "$RUN_EVIDENCE/03-validation-artifact/tarball.sha512"

git -C "$VALIDATION_CHECKOUT" status --porcelain
```

Expected:

- `artifact.json.commit` equals `VALIDATION_COMMIT`;
- package version/tag remain `0.1.2`/`v0.1.2`;
- validation checkout remains clean.

- [ ] **Step 7: Run package-owned artifact verification**

Run from the validation checkout:

```bash
set -o pipefail
corepack npm run release:verify-artifact -- \
  --tarball "$TARBALL" \
  --metadata "$ARTIFACT_DIR/artifact.json" \
  --expected-version 0.1.2 \
  --expected-tag v0.1.2 \
  --expected-commit "$VALIDATION_COMMIT" \
  --diagnostics "$VALIDATION_ROOT/release-verify-diagnostics" \
  2>&1 | tee "$RUN_EVIDENCE/03-validation-artifact/verify.log"
```

Expected: exit `0`, including Task #115 packed checks:

```text
global 3.6 → frame 2 local 0.1
global 5.9 → frame 2 local 2.4
global 6.4 → frame 2 local 2.9
```

- [ ] **Step 8: Install the tarball in a separate manual prefix**

Run:

```bash
export INSTALL_ROOT="$(mktemp -d /tmp/md2vid-pr12-install.XXXXXX)"
cd "$INSTALL_ROOT"

set -o pipefail
corepack npm init -y \
  2>&1 | tee "$RUN_EVIDENCE/04-isolated-install/npm-init.log"
corepack npm install "$TARBALL" \
  2>&1 | tee "$RUN_EVIDENCE/04-isolated-install/npm-install.log"

export MD2VID_BIN="$INSTALL_ROOT/node_modules/.bin/md2vid"
test -x "$MD2VID_BIN"
realpath "$MD2VID_BIN" \
  | tee "$RUN_EVIDENCE/04-isolated-install/executable-realpath.txt"
"$MD2VID_BIN" --version \
  | tee "$RUN_EVIDENCE/04-isolated-install/md2vid-version.txt"
"$MD2VID_BIN" --help \
  > "$RUN_EVIDENCE/04-isolated-install/md2vid-help.log"
corepack npm ls md2vid hyperframes --all \
  > "$RUN_EVIDENCE/04-isolated-install/npm-ls.log"
```

Expected:

- `md2vid@0.1.2`;
- HyperFrames `0.7.26`;
- executable target under `$INSTALL_ROOT/node_modules/md2vid/dist/bin/md2vid.js`;
- no path under the active repository.

- [ ] **Step 9: Create and prove the controlled PATH**

Run:

```bash
export NODE_BIN_DIR="$(dirname "$(command -v node)")"
export SAFE_PATH="$INSTALL_ROOT/node_modules/.bin:$NODE_BIN_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

PATH="$SAFE_PATH" command -v md2vid \
  | tee "$RUN_EVIDENCE/04-isolated-install/executable-path.txt"
PATH="$SAFE_PATH" realpath "$(PATH="$SAFE_PATH" command -v md2vid)" \
  | tee -a "$RUN_EVIDENCE/04-isolated-install/executable-realpath.txt"
```

Expected: both paths resolve under `$INSTALL_ROOT`; `NODE_PATH` will be unset for all Part 3 project commands.

- [ ] **Step 10: Enforce artifact/isolation stop conditions**

Stop before Part 3 if:

- tree or commit identity differs;
- checkout is dirty;
- tarball or metadata is missing;
- artifact verification fails;
- the exact two-frame browser regression fails;
- the manual executable resolves globally or into the active repository.
