# `md2vid upgrade` Design

## Goal

Provide one synchronous command that updates a global npm installation of `md2vid` to the `latest` dist-tag and refreshes the copied Claude skill, leaving both components synchronized.

## Scope

In scope:

- A new `md2vid upgrade` command.
- Global npm installations on the platforms already supported by the package.
- A foreground npm update followed by a fresh-process skill installation.
- Deterministic failure reporting and recovery guidance.
- CLI, unit, packed-artifact, README, and skill documentation coverage.

Out of scope:

- Homebrew, pnpm, Yarn, standalone binaries, or OS package managers.
- Updating a local dependency or an `npx` cache entry.
- Background update checks, automatic updates, release channels, downgrade, or rollback commands.
- Retrying failed global installation with `sudo`.

## Architecture

**Purpose** — Add one public command that leaves the global CLI and Claude skill synchronized without duplicating the existing skill installer.

**Current state**

```text
bin/md2vid.ts
   ├─ command routing
   └─ install-skill → scripts/install_skill.ts

User separately runs:
   npm update -g md2vid
   md2vid install-skill
```

**Expected state**

```text
bin/md2vid.ts
   └─ upgrade → scripts/upgrade.ts
                    │
                    ├─ verify running package is global npm install
                    ├─ spawn npm install --global md2vid@latest
                    ├─ resolve the newly installed CLI by absolute path
                    ├─ spawn fresh CLI with install-skill
                    └─ report old version → new version

Fresh CLI process
   └─ install-skill → existing atomic installer
```

The command router remains dispatch-only. `scripts/upgrade.ts` owns upgrade orchestration and reuses:

- `readPackageMetadata()` and package-root discovery from `scripts/package_root.ts`.
- The repository's `spawnSync` + inherited stdio + `shell: false` child-process pattern.
- The existing `md2vid install-skill` command and its staged validation, backup, promotion, and rollback behavior from `scripts/install_skill.ts`.

The upgrade module must not copy skill files itself.

## Installation Validation

**Purpose** — Prevent `md2vid upgrade` from creating or mutating an unrelated global installation when launched from a checkout, local dependency, or `npx` cache.

**Current state**

```text
running package root
   └─ no relationship check against npm global root
```

**Expected state**

```text
npm root --global
   └─ <global-root>/md2vid ── realpath equality ── running package root
                                  │
                         mismatch ┴ match
                            │       │
                         fail       continue
```

Before mutation, the command will:

1. Capture the running package name, version, and real package root.
2. Run `npm root --global` using inherited environment, `shell: false`, and captured output.
3. Resolve `<global-root>/md2vid` and compare its real path with the running package root.
4. Fail with `FAIL [upgrade]` and manual guidance if npm cannot be started, the root cannot be resolved, or the paths differ.

The guidance will state that self-upgrade supports a global npm installation and show:

```bash
npm install --global md2vid@latest
md2vid install-skill
```

No npm installation or skill mutation occurs before this validation passes.

## Upgrade Data Flow

**Purpose** — Update the package first, then guarantee that skill installation executes code and reads skill files from the newly installed package.

**Current state**

```text
npm update -g md2vid
        │
        └─ user later runs md2vid install-skill
```

**Expected state**

```text
md2vid upgrade
   │
   ├─ capture old version + global package path
   │
   ├─ npm install --global md2vid@latest
   │       └─ wait for completion with inherited stdio
   │
   ├─ read new package metadata from global package path
   │
   └─ node <global-package>/dist/bin/md2vid.js install-skill
           └─ wait for completion with inherited stdio
```

The npm command is always executed, including when the running version is already current. This makes `upgrade` a repair operation for the npm package and always refreshes the copied skill.

The skill handoff uses `process.execPath` plus the absolute new `dist/bin/md2vid.js` path. It does not:

- Depend on shell command lookup after npm changes the global shim.
- Call the old process's loaded `installSkill` implementation.
- Read skill files from the pre-upgrade package state.

After both child commands succeed, the command prints an explicit synchronized result containing the old and new package versions.

## CLI Contract

**Purpose** — Keep argument handling and output consistent with existing commands.

**Current state**

```text
md2vid <existing-command>
md2vid upgrade → unknown command, exit 2
```

**Expected state**

```text
md2vid upgrade          → perform upgrade, exit 0 or 1
md2vid upgrade --help   → print usage, exit 0
md2vid upgrade <arg>    → print parse error + usage, exit 2
```

The usage string is:

```text
Usage: md2vid upgrade
```

The root help lists:

```text
upgrade                                          update the global CLI and refresh the skill
```

Exit codes:

| Code | Meaning |
|---|---|
| `0` | npm package and Claude skill both completed successfully |
| `1` | validation, npm execution, package verification, or skill refresh failed |
| `2` | invalid command arguments |

## Error Handling and Recovery

**Purpose** — Never report success unless both the CLI and skill reach the synchronized state, and give a concrete recovery command after partial failure.

**Current state**

```text
npm failure ───────────→ separate npm command reports failure
skill failure ─────────→ separate install-skill command reports failure
```

**Expected state**

```text
validation fails
   └─ no mutation; show supported installation guidance

npm install fails
   └─ stop; do not run install-skill; preserve npm output

new package invalid/missing
   └─ stop; report package verification failure

install-skill fails
   └─ report partial state:
      CLI may be upgraded, skill refresh failed
      recovery: md2vid install-skill

all steps succeed
   └─ report synchronized old version → new version
```

Every orchestration error uses the `FAIL [upgrade]:` prefix. Child stdout and stderr remain visible through inherited stdio. The command will distinguish:

- Failure to start a child.
- Signal termination.
- Missing exit status.
- Nonzero exit status.

The implementation will not retry with elevated permissions and will not claim npm rollback behavior that npm does not guarantee.

## Test Strategy

**Purpose** — Verify command ordering, boundaries, and recovery without contacting the npm registry or modifying the developer machine.

**Current state**

```text
CLI tests
   ├─ router behavior
   └─ atomic install-skill behavior

Release tests
   └─ package install and skill install are separate stages
```

**Expected state**

```text
test/cli/upgrade.test.ts
   ├─ parser and help behavior
   ├─ global-install validation
   ├─ npm command arguments and ordering
   ├─ fresh absolute CLI handoff
   ├─ already-current repair behavior
   ├─ npm failure short-circuit
   ├─ invalid post-update package handling
   ├─ skill failure partial-state guidance
   └─ success version reporting

router tests
   └─ upgrade dispatch + root help listing

release manifest/artifact tests
   └─ compiled upgrade module and command are packaged
```

`scripts/upgrade.ts` will expose injectable dependencies for process execution, filesystem path resolution, metadata reads, logging, and environment where required. Unit tests use temporary package roots and fake process results. They assert:

- Exact executable, argument arrays, stdio mode, and `shell: false`.
- The npm child completes before the fresh CLI child starts.
- Skill installation is skipped after any npm failure.
- The command returns nonzero after partial completion.
- No test writes to the real global npm root or Claude config directory.

The release harness will verify that the compiled command is present and routable. It will not run a public-registry self-update from an isolated artifact installation.

## Documentation

**Purpose** — Replace the manual two-command update contract with the new synchronized command while preserving recovery instructions.

**Current state**

```text
README update:
   npm update -g md2vid
   md2vid install-skill

skill guidance:
   rerun install-skill after npm update
```

**Expected state**

```text
README primary update:
   md2vid upgrade

README recovery/manual update:
   npm install --global md2vid@latest
   md2vid install-skill

skill guidance:
   use md2vid upgrade for normal updates
   retain install-skill as repair/recovery command
```

Update `README.md` and `skill/md2vid/SKILL.md`. Any synchronized copies or tests that enforce reference equality must continue to pass; the upgrade feature does not change standards references.

## Security and Operational Constraints

**Purpose** — Ensure the updater invokes trusted executables with fixed arguments and avoids implicit privilege escalation.

**Current state**

```text
user manually types npm commands
```

**Expected state**

```text
fixed npm executable + fixed argument array
   ├─ shell: false
   ├─ no user-controlled package spec
   ├─ no sudo retry
   └─ verified global package root before mutation
```

The command accepts no package name, tag, version, executable, or path arguments. It always targets `md2vid@latest`. Environment inheritance remains necessary for npm configuration, registry authentication, proxy settings, and `CLAUDE_CONFIG_DIR` propagation to the fresh skill installer.

## Research Basis

- [npm install](https://docs.npmjs.com/cli/install/) documents global package installation and package dist-tags.
- [npm update](https://docs.npmjs.com/cli/v11/commands/npm-update/) documents global update behavior; the design uses explicit `md2vid@latest` to make the target channel unambiguous.
- [Node.js child processes](https://nodejs.org/api/child_process.html) documents `spawn`/`spawnSync`, argument arrays, inherited stdio, and shell behavior.
- [Node.js process](https://nodejs.org/api/process.html) documents process termination concerns and the platform limits of experimental process replacement.
- [npm permission guidance](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally/) recommends correcting npm ownership/prefix configuration instead of relying on elevated retries.

## Acceptance Criteria

1. A supported global npm installation can run `md2vid upgrade` and finish with the latest npm package and a freshly installed skill.
2. An already-current installation still refreshes the skill.
3. A local, `npx`, or otherwise non-global invocation fails before mutation.
4. npm failure prevents skill refresh.
5. skill refresh failure reports partial completion and the exact recovery command.
6. success is reported only after both child operations succeed.
7. Existing `md2vid install-skill` behavior remains available and unchanged.
8. Full typecheck, CLI tests, release artifact checks, and project test suite pass.
