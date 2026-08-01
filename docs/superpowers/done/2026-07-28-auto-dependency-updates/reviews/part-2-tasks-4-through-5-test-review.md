# Canonical Review Artifact

- Review scope: Part 2, Tasks 4-5
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `dirty-baseline`
- Scope origin: `6825cfe19f5da332216427bb898c13ead11703e5`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines/part-2-tasks-4-through-5`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.uCCjee/task-scope.patch`
- Created: 2026-07-28
- Tester dispatched: yes

---

# Canonical Review Artifact

- Review scope: Part 2, Tasks 4–5
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `dirty-baseline`
- Scope origin: `6825cfe19f5da332216427bb898c13ead11703e5`
- Immutable baseline: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines/part-2-tasks-4-through-5`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.uCCjee/task-scope.patch`
- Created: 2026-07-28
- Tester dispatched: yes

---

# Tester Report — Part 2, Tasks 4–5 (`dependabot-automation`)

## Scope

Reviewed the complete goal, design, research, index plan, both part plans, reconstructed scope patch, changed workflows, Dependabot configuration, public snapshot, and workflow contract tests.

**Commits reviewed:**

```text
c42f616 test(ci): define Dependabot patch policy
bc5f865 ci(deps): enable guarded patch auto-merge
```

**Primary files:**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/dependabot.yml`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/public-snapshot.json`

The following pre-existing Part 1 artifacts were excluded from the review scope:

```text
docs/superpowers/done/2026-07-28-auto-dependency-updates/reviews/part-1-tasks-1-through-3-code-quality-review.md
docs/superpowers/done/2026-07-28-auto-dependency-updates/reviews/part-1-tasks-1-through-3-spec-review.md
docs/superpowers/done/2026-07-28-auto-dependency-updates/reviews/part-1-tasks-1-through-3-test-review.md
```

---

## Findings

### TEST-001 — Must fix — The privileged `pull_request` workflow can execute its proposed workflow/action changes

**Evidence**

The workflow runs in the pull request’s event context while requesting write authority:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml:3-4`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml:16-18`

It executes the `dependabot/fetch-metadata` action from the workflow definition associated with that pull-request run:

```yaml
uses: dependabot/fetch-metadata@21025c705c08248db411dc16f3619e6b5f9ea21a # v2.5.0
```

at:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml:20-24`

The GitHub Actions group matches every action patch:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/dependabot.yml:37-42`

Therefore a future Dependabot patch PR updating `dependabot/fetch-metadata` modifies this privileged workflow’s executable action reference. A standard `pull_request` run resolves its workflow from the event-associated PR merge ref, so the proposed action revision can execute before that revision is merged.

```text
Actions patch PR changes fetch-metadata SHA
                    ↓
pull_request run uses PR merge-ref workflow
                    ↓
proposed action code executes with requested write scopes
                    ↓
action can access PR/repository authority before review or merge
```

No checkout is required for this path: a referenced action is executable code itself.

The current pin is valid:

```bash
gh api repos/dependabot/fetch-metadata/git/ref/tags/v2.5.0 \
  --jq '{ref,sha:.object.sha,type:.object.type}'
```

```json
{
  "ref": "refs/tags/v2.5.0",
  "sha": "21025c705c08248db411dc16f3619e6b5f9ea21a",
  "type": "commit"
}
```

However, isolated mutations replacing the reviewed SHA or its release comment both passed the contract suite:

```text
fetch-sha       MISSED  status=0
fetch-comment   MISSED  status=0
```

**Guidance**

Revise the architecture so write-side execution always uses a workflow definition from trusted default-branch content.

Given the existing prohibition on PATs, GitHub Apps, and PR-code execution, the preferred shape is:

```text
Unprivileged pull_request observation
                  ↓
Privileged workflow_run from default branch
                  ↓
Re-query live PR through GitHub API
                  ↓
Revalidate actor, author, repository, base, head, group, metadata
                  ↓
Approve + request head-bound auto-merge
```

A checkout-free `pull_request_target` workflow is another technically viable trusted-definition context, but it conflicts with the approved design and plan. Do not switch triggers without revising those source artifacts.

Regardless of the selected architecture:

- Do not execute a workflow/action revision supplied by the PR receiving approval.
- Treat the `dependabot/fetch-metadata` revision as a privileged trust anchor.
- If that action remains, assert its exact reviewed SHA and matching release annotation.
- Do not permit its own update to execute with write authority before the update is merged.
- Keep checkout, local actions, repository scripts, installs, builds, and PR-controlled artifacts out of the privileged stage.

**Success checklist**

- [ ] Privileged execution uses the workflow definition committed to the trusted default branch.
- [ ] A PR changing `dependabot-auto-merge.yml` cannot cause its proposed steps or action pins to execute with write authority.
- [ ] A Dependabot update to `dependabot/fetch-metadata` does not execute the new revision in the privileged stage before merge.
- [ ] The exact reviewed metadata-action SHA and version annotation are contract-tested together, or the third-party action is removed.
- [ ] Temporary mutations of the action SHA and version annotation both fail the workflow contract suite.
- [ ] The privileged stage remains checkout-free and executes no PR-controlled repository file or artifact.
- [ ] The goal, design, research, and Part 2 plan are updated if the required trusted-context architecture differs from `pull_request`.

---

### TEST-002 — Must fix — Approval and auto-merge are not bound to the evaluated head commit

**Evidence**

The inline policy receives only the branch name:

```yaml
HEAD_REF: ${{ github.event.pull_request.head.ref }}
```

at:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml:26-32`

It does not capture or validate:

```text
github.event.pull_request.head.sha
github.event.pull_request.head.repo.full_name
live PR head SHA
commit count or current commit identity
```

Both side effects target only the mutable PR URL:

```yaml
run: gh pr review "$PR_URL" --approve
run: gh pr merge "$PR_URL" --auto --squash
```

at:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml:93-107`

The trust-reference probe found no SHA or commit binding:

```bash
rtk rg -n \
  "head\\.(sha|repo)|commits|commit_id|expectedHeadOid|PR_URL|gh pr (review|merge)" \
  .github/workflows/dependabot-auto-merge.yml
```

```text
98:          PR_URL: ${{ github.event.pull_request.html_url }}
99:        run: gh pr review "$PR_URL" --approve
106:          PR_URL: ${{ github.event.pull_request.html_url }}
107:        run: gh pr merge "$PR_URL" --auto --squash
```

A head rotation can therefore occur after metadata evaluation but before either side effect:

```text
Dependabot event at head A
        ↓
metadata and branch policy validate A
        ↓
PR head changes to B
        ↓
review/auto-merge commands address current PR state, not explicitly A
```

Task 6 intends to enable stale-approval dismissal, which protects pushes occurring after an approval. It does not replace binding this run’s policy decision and side effects to one expected head SHA.

The installed GitHub CLI supports the required merge guard:

```bash
gh pr merge --help | rtk rg -n -- \
  '--match-head-commit|--auto|--squash'
```

```text
--auto
--match-head-commit SHA
--squash
```

**Guidance**

Capture the event head SHA and expected head repository. Before every side effect:

1. Fetch the live PR.
2. Verify live actor/author, repository, base, head ref, head repository, and head SHA.
3. Fail unless the live SHA equals the event SHA.
4. Create the approval against that exact commit.
5. Bind the auto-merge request to the same SHA.

Expected merge form:

```bash
gh pr merge "$PR_URL" \
  --auto \
  --squash \
  --match-head-commit "$EXPECTED_HEAD_SHA"
```

For approval, use the pull-request reviews API with `commit_id` set to the expected SHA rather than an unbound `gh pr review` command. Recheck the live head after approval and before enabling auto-merge.

Keep Task 6’s `dismiss_stale_reviews: true`; SHA binding and stale-review dismissal address different race windows.

**Success checklist**

- [ ] The workflow captures `github.event.pull_request.head.sha`.
- [ ] The expected head repository is verified as `therealhieu/md2vid`.
- [ ] Live PR identity and head SHA are re-fetched immediately before approval.
- [ ] The approval is created with `commit_id` equal to the expected head SHA.
- [ ] Live head SHA is revalidated before requesting auto-merge.
- [ ] `gh pr merge` includes `--match-head-commit "$EXPECTED_HEAD_SHA"`.
- [ ] A simulated head rotation causes failure before either side effect.
- [ ] A multi-commit PR remains eligible only when its current head is exactly the evaluated head and all other policy conditions hold.
- [ ] A push after approval invalidates the approval through the planned stale-review protection.

---

### TEST-003 — Must fix — Contract tests permit extra privileged execution and side effects

**Evidence**

The specialized checker finds four expected steps by name, but does not require that they are the complete step list:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:292-308`

The merge assertion uses a substring match rather than an exact command contract:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:315-319`

The repository-code prohibition covers selected command forms but not arbitrary workspace-relative execution:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts:329-334`

Isolated temporary-copy mutations produced:

| Mutation | Result |
|---|---|
| Broaden actor | Detected |
| Broaden repository | Detected |
| Broaden author | Detected |
| Broaden base | Detected |
| Add permission | Detected |
| Change trigger | Detected |
| Add checkout | Detected |
| Force policy true | Detected |
| Add `continue-on-error` to approval | Detected |
| Add `|| true` to merge | Detected |
| Add `--delete-branch` to merge command | **Missed** |
| Add privileged `gh api -X DELETE ...` step | **Missed** |
| Add `node ./evil.mjs` repository-file step | **Missed** |

Representative missed mutations exited successfully:

```text
merge-extra-flag          MISSED  status=0
extra-privileged-step     MISSED  status=0
repository-file-execution MISSED  status=0
```

This violates the component contract that approval and native squash-auto-merge are the workflow’s only side effects.

**Guidance**

Require the full privileged authority surface, not expected fragments:

- Exactly one job.
- Exactly four intended steps, or the revised SHA-bound step sequence.
- Exact step order.
- Exact allowed keys for each step.
- Exact external action identity, pin, inputs, and shell.
- Exact approval operation.
- Exact merge operation and flags.
- No additional `run`, `uses`, reusable-workflow, local-action, or composite-action execution.
- No workspace-relative executables or repository paths.
- No extra `gh`, `git`, `curl`, package-manager, Node-file, shell-file, or API side effects.

If live head validation adds commands, enumerate those exact read-only API operations and reject every unrecognized operation.

**Success checklist**

- [ ] The checker asserts the exact job count and job ID.
- [ ] The checker asserts the exact step count and order.
- [ ] Every step’s allowed keys and values are checked.
- [ ] Adding any extra `run` or `uses` step fails.
- [ ] `node ./evil.mjs`, `bash ./script.sh`, local actions, and reusable repository workflows fail.
- [ ] Adding any merge flag beyond the approved set fails.
- [ ] Adding a second approval, merge, repository-write, or API command fails.
- [ ] Approval and merge failure suppression mutations still fail.
- [ ] Checkout, install, build, and repository-script mutations still fail.

---

### TEST-004 — Must fix — Tests do not freeze the exact branch and dependency eligibility boundaries

**Evidence**

The runtime and development policy constants are hardcoded in the privileged workflow:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/dependabot-auto-merge.yml:50-74`

The current executable decision table correctly handles the intended cases:

| Case | Status | Eligibility |
|---|---:|---|
| Valid runtime patch | 0 | `true` |
| Valid development patch | 0 | `true` |
| Valid Actions patch | 0 | `true` |
| Minor update | 0 | `false` |
| Major update | 0 | `false` |
| Security-shaped update type | 0 | `false` |
| Unknown group | 0 | `false` |
| Near-prefix group | 0 | `false` |
| Unknown runtime dependency | 0 | `false` |
| Unknown development dependency | 0 | `false` |
| Empty metadata | 1 | no output |

However, these example cases do not prove that the policy constants have no extra authority.

Two isolated mutations passed the complete workflow suite:

```text
group-regex     MISSED  status=0
allowlist-extra MISSED  status=0
```

The branch mutation retained the expected branch while adding another accepted prefix. The allowlist mutation added an additional runtime dependency name. Neither altered the existing selected negative examples, so both passed.

This means CI cannot currently enforce the verifier requirements that:

```text
group branch regexes are exact
AND
runtime/dev allowlists exactly match root package metadata
```

**Guidance**

Extract and compare the inline policy constants exactly:

| Policy | Required exact value |
|---|---|
| Runtime branch | `^dependabot/npm_and_yarn/runtime-patches(?:-|$)` |
| Development branch | `^dependabot/npm_and_yarn/dev-patches(?:-|$)` |
| Actions branch | `^dependabot/github_actions/actions-patches(?:-|$)` |
| Runtime allowlist | Exact keys of root `dependencies` + `optionalDependencies` |
| Development allowlist | Exact keys of root `devDependencies` |
| Actions allowlist | Explicit unrestricted marker only for the exact Actions group |

The test should prove both directions:

```text
every package metadata entry is allowed
AND
every allowed package is present in package metadata
```

Add negative probes for alternate ecosystems, alternate group prefixes, extra regex alternatives, malformed separators, empty suffixes if invalid, and added allowlist entries.

**Success checklist**

- [ ] Each branch-regex source is asserted exactly.
- [ ] Adding an alternate accepted branch prefix fails.
- [ ] Runtime allowlist equals root runtime plus optional dependency names exactly.
- [ ] Development allowlist equals root development dependency names exactly.
- [ ] Adding any extra allowlisted package fails.
- [ ] Removing any current package fails.
- [ ] Moving a package between runtime and development policy fails.
- [ ] Unknown ecosystems and near-prefix branches remain ineligible.
- [ ] Valid runtime, development, and Actions patch cases remain eligible.
- [ ] Minor, major, security-shaped, unknown-group, unknown-dependency, and empty-metadata probes retain their current fail-closed results.

---

## Verification Commands and Results

### Workflow contract suite

```bash
node --test \
  /Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts
```

```text
52 passed
0 failed
exit 0
```

### Actionlint

```bash
actionlint -version
```

```text
1.7.11
installed by building from source
built with go1.26.0 compiler for darwin/arm64
```

```bash
actionlint \
  -config-file /Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/actionlint.yaml \
  /Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/.github/workflows/*.yml
```

```text
exit 0
no diagnostics
```

### Public snapshot check

```bash
corepack npm run public:snapshot:check
```

```text
843 tests passed, 0 failed during each full check invocation
pack/install/CLI/HyperFrames smoke/Remotion smoke completed
public snapshot check passed at 48b7a9cc86a18328c8a7f46412c58543d6710ced
exit 0
```

### Policy decision table

```bash
node --input-type=module <<'NODE'
# Extract and execute the inline Dependabot policy with isolated GITHUB_OUTPUT
NODE
```

```text
valid-runtime               status=0 eligible=true
valid-dev                   status=0 eligible=true
valid-actions               status=0 eligible=true
invalid-minor               status=0 eligible=false
invalid-major               status=0 eligible=false
invalid-security            status=0 eligible=false
invalid-unknown-group       status=0 eligible=false
invalid-near-prefix         status=0 eligible=false
invalid-runtime-dependency  status=0 eligible=false
invalid-dev-dependency      status=0 eligible=false
invalid-empty-metadata      status=1 eligible=<none>
```

All per-case temporary output directories were removed by the probe.

### Authority mutation matrix

Each mutation was applied to an isolated temporary repository copy. The complete workflow contract suite was then rerun.

| Mutation | Result |
|---|---|
| Actor guard broadened | Detected |
| Repository guard broadened | Detected |
| PR author guard broadened | Detected |
| Base guard broadened | Detected |
| Extra job permission | Detected |
| Trigger changed | Detected |
| Checkout inserted | Detected |
| Metadata action SHA changed | **Missed** |
| Metadata action version comment changed | **Missed** |
| Group branch regex broadened | **Missed** |
| Allowlist expanded | **Missed** |
| Extra merge flag | **Missed** |
| Extra privileged step | **Missed** |
| Repository file execution | **Missed** |
| Policy forced to `true` | Detected |
| Approval made non-blocking | Detected |
| Merge failure suppressed | Detected |

All mutation directories were removed after each test.

### Repository state

```bash
git diff --check
```

```text
exit 0
no output
```

```bash
git status --short
```

```text
?? docs/superpowers/done/2026-07-28-auto-dependency-updates/reviews/
```

The only reported path contains the three pre-existing Part 1 canonical artifacts explicitly excluded from this review. No implementation file was modified.

---

## Consolidated Remediation Checklist

- [ ] **TEST-001:** Move privileged execution to a trusted default-branch workflow definition.
- [ ] **TEST-001:** Prevent a PR from executing its proposed workflow/action changes with write authority.
- [ ] **TEST-001:** Protect the `dependabot/fetch-metadata` self-update path.
- [ ] **TEST-001:** Make arbitrary action-SHA and false-version-comment mutations fail.
- [ ] **TEST-001:** Update the design and plans if the trusted-context architecture changes.
- [ ] **TEST-002:** Capture and validate the expected PR head SHA and head repository.
- [ ] **TEST-002:** Bind approval to the expected commit ID.
- [ ] **TEST-002:** Add `--match-head-commit` to the native auto-merge request.
- [ ] **TEST-002:** Add head-rotation and multi-commit trust probes.
- [ ] **TEST-003:** Enforce the complete exact privileged job and step structure.
- [ ] **TEST-003:** Reject extra commands, steps, flags, local actions, and repository-file execution.
- [ ] **TEST-004:** Assert exact branch regexes.
- [ ] **TEST-004:** Assert allowlist equality in both directions against `package.json`.
- [ ] Rerun all valid and invalid decision-table cases.
- [ ] Rerun the full authority mutation matrix and require every unsafe mutation to exit nonzero.
- [ ] Rerun `node --test test/ci/workflows.test.ts`.
- [ ] Rerun Actionlint 1.7.11.
- [ ] Rerun `corepack npm run public:snapshot:check`.
- [ ] Rerun `corepack npm run check`.
- [ ] Rerun `corepack npm run release:check`.
- [ ] Confirm both diff checks have no output.
- [ ] Confirm repository status contains no new tester-created paths.
- [ ] Do not begin Task 6 remote rollout until the revised privileged architecture and tests are verified.

---

## Sources

- [GitHub Docs — Workflows](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows) — workflow runs use the workflow-file version at the event-associated commit or Git ref.
- [GitHub Docs — Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) — `pull_request` runs use the PR merge ref and merge commit.
- [GitHub Docs — Troubleshooting Dependabot on GitHub Actions](https://docs.github.com/en/code-security/reference/supply-chain-security/troubleshoot-dependabot/dependabot-on-actions) — Dependabot workflow token defaults and explicit permission expansion.
- [GitHub CLI — `gh pr merge`](https://cli.github.com/manual/gh_pr_merge) — documents `--match-head-commit`.
- [GitHub Docs — Pull request reviews API](https://docs.github.com/en/rest/pulls/reviews) — review creation supports a specific `commit_id`.
- [GitHub Docs — Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) — stale approval dismissal after new commits.
- [GitHub Security Lab — Preventing pwn requests](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/) — separation of unprivileged PR processing from trusted privileged follow-up.

## Canonical Residual Risk

- No remote repository setting was read or changed. Task 6 branch protection, Actions approval, native auto-merge, and canary behavior remain unverified.
- No live Dependabot PR was created. Group generation, generated branch naming, metadata output, review identity, and native auto-merge behavior were tested locally or assessed from documented contracts.
- Head-rotation and multi-commit behavior was assessed statically because reproducing the race safely requires a live pull request and write authority. The current absence of SHA binding is directly observable.
- The current `dependabot/fetch-metadata@v2.5.0` SHA was verified against the upstream tag, but the action was not downloaded and independently audited.
- Action-patch grouping includes every current workflow action. Any trusted-context redesign must specifically retest self-updates of actions used by the privileged automation.
- Native auto-merge still depends on the exact Task 6 branch-protection configuration, including required checks, one approval, stale-review dismissal, admin enforcement, conversation resolution, and blocked force pushes/deletion.
- The public snapshot check installs current dependencies and reported five audit findings during installation: one moderate and four high. The command nevertheless completed successfully under the repository’s existing release policy; those findings were outside this scoped workflow review.
- All policy and workflow mutations ran in isolated temporary copies and were removed. Repository implementation files were not modified.
