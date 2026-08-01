# Research: Dependabot Patch Auto-Merge

## Question

What is the safest current design for weekly grouped Dependabot patch updates that merge without human intervention across npm runtime, optional, development, and GitHub Actions dependencies after repository checks pass?

## TL;DR

Use Dependabot groups plus a two-stage GitHub Actions design: an unprivileged `pull_request` observer emits only a completion signal, then a trusted default-branch `workflow_run` stage independently re-queries and validates the live PR before commit-bound approval and native squash auto-merge. Keep CI and dependency review as required checks, use least-privilege job permissions, and never execute pull-request code or consume PR-controlled artifacts in the privileged stage.

## Findings

### Decision matrix

| Option | Required-check enforcement | Permission surface | Auditability | Repository fit |
|---|---:|---:|---:|---:|
| Native auto-merge enabled by a guarded workflow | Strong: waits for branch protections | Narrow: merge job only | High | Best |
| Workflow immediately runs a merge command after checking statuses | Custom and easier to misconfigure | Narrow to moderate | Medium | Avoid |
| External auto-merge app | Depends on app configuration | Third-party installation access | Medium | Unnecessary |

### Recommended control flow

```text
Dependabot weekly scan
  → grouped patch PR
  → unprivileged pull_request observer
  → successful completion signal only
  → trusted default-branch workflow_run
  → API re-query: run, exactly one PR, live head, every commit
  → inline trusted metadata + group policy
  → commit-bound approval
  → live-head recheck + --auto --squash --match-head-commit
  → GitHub merges only after required checks and rules pass
```

### Configuration findings

- Dependabot supports `groups`, wildcard dependency patterns, and group-level `update-types: [patch]` for version updates.
- npm and GitHub Actions need separate ecosystem entries and therefore separate patch groups.
- Unmatched minor and major updates remain individual PRs unless explicitly ignored. This is useful: they stay visible for manual review.
- `commit-message.prefix` affects commit messages and PR titles, but grouped PR titles are also driven by the group identifier. The configuration and title-policy tests must be validated together.
- GitHub currently applies a default three-day cooldown to version updates; security updates are exempt.

### Auto-merge findings

- GitHub's official Dependabot automation uses an exact `dependabot[bot]` actor condition, `dependabot/fetch-metadata`, explicit permissions, and `gh pr merge --auto`.
- Native auto-merge does not bypass branch protection. It waits for required reviews, checks, and other applicable merge rules.
- Fully unattended merging may require repository settings that allow GitHub Actions to create or approve pull requests, depending on the branch's approval requirements.
- If a merge queue is required, the built-in `GITHUB_TOKEN` cannot enqueue the PR; a GitHub App or personal access token would be needed. No project evidence currently requires a merge queue, so adding one is out of scope.

### Security findings

- Dependabot-triggered workflows receive a read-only `GITHUB_TOKEN` by default and no ordinary Actions secrets. Dependabot secrets are separate.
- `pull_request_target` does not automatically remove Dependabot restrictions and is dangerous if it checks out or executes untrusted PR code with elevated access.
- Grant `contents: write` and `pull-requests: write` only to the small auto-merge job. CI should remain read-only.
- Full commit SHA pins are the only immutable action references supported by GitHub. The repository already follows this practice.
- Dependency review must be a required check to block newly introduced vulnerable dependencies. The repository already runs it at high severity; branch/ruleset enforcement must be confirmed during implementation setup.
- A grouped patch PR has a larger blast radius than one-dependency PRs. Separate npm and Actions groups, retain full validation, and preserve exact synchronized families such as Remotion packages.

### Repository-specific implications

- Current Dependabot coverage already includes npm and GitHub Actions on a weekly schedule.
- The PR-title workflow accepts conventional prefixes, while Dependabot has no explicit commit-message prefix today.
- Several tests assert exact dependency versions or GitHub Action SHAs. Routine update PRs can fail until those tests are changed to verify the intended invariant instead of the current version.
- `hyperframes`, Remotion packages, React packages, and npm's pinned tool version have coordinated-version constraints. Grouping must not split synchronized families.
- Existing full CI, nightly validation, SHA pinning, and dependency review provide a strong base for guarded patch auto-merge.

## Approved architecture follow-up — 2026-07-28

Post-implementation review identified a trust-origin boundary not captured in the initial research. Current GitHub documentation states that each workflow run uses the workflow version at the event-associated SHA or ref, and a `pull_request` event uses `refs/pull/<number>/merge`. Therefore a PR that updates the privileged workflow or its `dependabot/fetch-metadata` pin can execute the proposed revision before merge.

The initial single-stage workflow is operationally possible: Dependabot workflows receive read-only tokens by default, GitHub documents increasing their access with explicit `permissions`, and GitHub's official Dependabot automation examples use `pull_request` with write scopes. The blocker is not token availability; it is that the privileged workflow definition is supplied by the PR merge ref.

GitHub documents that a `workflow_run` handler must exist on the default branch and can receive write-capable authority after an unprivileged workflow. The approved architecture therefore separates:

```text
unprivileged pull_request observer
  → completion signal only
  → trusted default-branch workflow_run policy
```

The pinned `dependabot/fetch-metadata@v2.5.0` implementation was inspected at `21025c705c08248db411dc16f3619e6b5f9ea21a`. Its `getMessage` and branch/body helpers require `context.payload.pull_request`; it cannot consume a `workflow_run` payload directly. The trusted stage will instead re-query the observer run, associated PR, live PR, and all commits through GitHub APIs, then parse only API-returned metadata inline. This also permits validation of every commit rather than the metadata action's first-commit-only verification path.

Additional primary sources:

- [Workflows](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows) — event-associated workflow version.
- [`pull_request` event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request) — merge-ref context.
- [`workflow_run` event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run) — default-branch requirement and privileged follow-up behavior.
- [Troubleshooting Dependabot on GitHub Actions](https://docs.github.com/en/code-security/reference/supply-chain-security/troubleshoot-dependabot/dependabot-on-actions) — Dependabot token defaults and explicit permission elevation.
- [`dependabot/fetch-metadata` v2.5.0 source](https://github.com/dependabot/fetch-metadata/tree/21025c705c08248db411dc16f3619e6b5f9ea21a) — event and commit-verification implementation.

## Sources

1. [Automating Dependabot with GitHub Actions](https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/automate-dependabot-with-actions) — GitHub Docs, official primary source.
2. [Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference) — GitHub Docs, official primary source.
3. [Dependabot on GitHub Actions](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-on-actions) — GitHub Docs, official primary source.
4. [Automatically merging a pull request](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request) — GitHub Docs, official primary source.
5. [Secure use reference for GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use) — GitHub Docs, official primary source.
6. [Dependency review](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review) — GitHub Docs, official primary source.
7. [Managing GitHub Actions settings for a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository) — GitHub Docs, official primary source.
8. [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) — GitHub Docs, official primary source.

## Confidence

High. The recommendation is based primarily on current GitHub documentation and matches the repository's existing CI, dependency review, SHA-pinning, and weekly Dependabot setup. The only material unknown is the repository's remote branch-protection and auto-merge settings, which must be checked before implementation.

## Open Questions

- Are CI and dependency review enforced as required checks on `main`, or merely executed?
- Does the repository require approving reviews, and is GitHub Actions allowed to approve pull requests?
- Is native repository auto-merge currently enabled?
