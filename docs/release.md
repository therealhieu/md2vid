# Release runbook

This document separates repository implementation from post-merge maintainer operations. Implementation agents maintain and test the workflows and documentation; they must not create tags, push, publish, change rulesets, configure npm trusted publishing, rotate tokens, or dispatch hosted workflows while implementing this runbook. The GitHub and npm steps below are performed later by authorized maintainers.

## Release boundary

A protected annotated `vX.Y.Z` tag is the release boundary:

```text
protected annotated vX.Y.Z tag → automatic exact-artifact release
```

The protected annotated tag is the sole human release authorization. A reviewed version pull request only prepares package metadata; merging it does not release anything.

GitHub Actions validates the tagged commit, builds one tarball, verifies that same file on Linux and macOS, publishes the same file to npm through trusted publishing, verifies the public installation, and then creates the GitHub Release.

## One-time GitHub configuration

Authorized repository maintainers configure these controls after the workflows are merged and validated:

- Protect `main` and require the repository's CI checks before merge.
- Configure `v*` tag creation, update, and deletion restrictions.
- Restrict creation bypass to the smallest release-maintainer group. Do not grant the GitHub Actions App a ruleset bypass; the workflow consumes a maintainer-created tag and does not create or mutate tags.
- If GitHub's ruleset UI cannot scope creation bypass separately from update and deletion bypass, use separate creation and immutability rulesets. Release maintainers may then bypass only the creation ruleset and cannot bypass the update/deletion ruleset.
- Require squash merges and Conventional Commit pull request titles.

The rulesets block tag creation, update, or deletion for actors without the applicable bypass. They do not provide absolute technical immutability for bypass actors, so release maintainers must separately treat every release tag as immutable after creation.

This design does not claim signed-tag enforcement. If signed tags are adopted later, document and validate that policy separately rather than implying the current ruleset enforces it.

## One-time npm configuration

An authorized npm package owner configures trusted publishing for:

| Setting | Value |
|---|---|
| Package | `md2vid` |
| Publisher | GitHub Actions |
| Repository | `therealhieu/md2vid` |
| Workflow | `release.yml` |
| Operation | `npm publish` |
| Environment | None |

Do not add an npm token to GitHub. After the first successful OIDC release, require 2FA for the package, disallow token publication, and revoke obsolete automation tokens.

## Prepare a version

Prepare the version metadata in a normal reviewed pull request:

```bash
npm version X.Y.Z --no-git-tag-version --ignore-scripts
npm run check
```

Review and merge the resulting `package.json` and `package-lock.json` changes through the normal `main` branch controls. This pull request does not release the version.

## Authorize a tag release

After the version pull request merges, a release maintainer uses a clean checkout synchronized to `origin/main`:

```bash
git switch main
git pull --ff-only origin main
npm ci
npm run release:check
git tag -a vX.Y.Z -m "md2vid vX.Y.Z"
git push origin vX.Y.Z
```

The final push creates the protected annotated tag and starts `.github/workflows/release.yml` automatically. Do not push `main` as part of the tag command, publish locally, or create a lightweight tag.

## Interrupted release recovery

Implementation agents must not dispatch hosted workflows. The `release.yml` manual entry point is only for separately authorized recovery of an existing protected release tag; it is not an implementation or rollout dry run.

Recover only the existing protected tag through the manual `workflow_dispatch` input:

```bash
gh workflow run release.yml -f tag=vX.Y.Z
```

Recovery distinguishes the registry state:

| npm version state | Recovery action |
|---|---|
| npm version absent | Safely rebuild and verify the artifact from the existing protected tag, then publish once. |
| npm version present | Use the retained original artifact and prove its SRI equals the exact registry SRI; skip publication and only complete the matching GitHub Release. Missing or expired artifacts or an integrity mismatch fail closed. |

Never rebuild as a substitute for a published version, move the tag, or republish an existing version.

## Rollout sequence

Maintainers roll out the system in this order after implementation review:

1. Merge the validation, CI, nightly, and release workflows while npm trusted publishing remains unconfigured.
2. Verify hosted pull request, `main`, nightly, and manual validation, plus the non-publishing release-contract and actionlint checks. Do not dispatch `release.yml` for rollout validation: it has no dry-run mode and is publication-capable.
3. Configure the `v*` GitHub ruleset and npm trusted publisher.
4. Optionally create a historical v0.1.2 GitHub Release without changing or republishing npm content.
5. Create and push the first new protected annotated tag.
6. Verify the npm package integrity, public installation, and GitHub Release for that tag.
7. Require package 2FA, disallow token publication, and revoke obsolete automation tokens.

These are post-merge maintainer operations, not commands for implementation agents to execute during repository changes.

## Incident handling

| Condition | Required response |
|---|---|
| npm registry unavailable | Stop and retry the same workflow/tag later. Do not publish through another credential path. |
| Non-monotonic absent version | Stop. Investigate version history and prepare a new valid version through a reviewed pull request; do not force publication. |
| Published version missing its original artifact | Stop recovery. Do not rebuild or republish the existing version. |
| Registry integrity mismatch | Treat as a release-integrity incident. Do not publish, move the tag, or create/edit the GitHub Release. |
| Conflicting GitHub Release | Stop. Preserve the existing release for investigation; do not overwrite or retarget it automatically. |
| Deterministic source or test failure | Fix the source in a new reviewed change and use a new version/tag. Never mutate the failed tag. |

## Workflow permissions

| Operation | Required permissions |
|---|---|
| Validation, artifact handling, registry verification | `contents: read` or `{}` |
| Recovery artifact lookup | `actions: read`, `contents: read` |
| npm publication | `contents: read`, `id-token: write` |
| GitHub Release | `contents: write`; no OIDC |

No job combines npm OIDC publication authority with GitHub Release write authority.

## Deliberate exclusions

There is no Release Please, Changesets, or Semantic Release; no release PR, second approval Environment, npm token, automatic unpublish, automatic deprecation, or tag mutation.
