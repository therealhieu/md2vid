# Research: Dependabot Patch Auto-Merge

## Question

What is the safest current design for weekly grouped Dependabot patch updates that merge without human intervention across npm runtime, optional, development, and GitHub Actions dependencies after repository checks pass?

## TL;DR

Use Dependabot groups plus a narrowly scoped GitHub Actions workflow that verifies the PR author and `dependabot/fetch-metadata` update type, then enables GitHub native auto-merge. Keep CI and dependency review as required checks, use least-privilege job permissions, pin every action to a full commit SHA, and never execute pull-request code in a privileged `pull_request_target` workflow.

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
  → normal pull_request CI with read-only access
  → dependency review + full validation
  → guarded metadata job verifies actor/repository/update type
  → enable native auto-merge
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
