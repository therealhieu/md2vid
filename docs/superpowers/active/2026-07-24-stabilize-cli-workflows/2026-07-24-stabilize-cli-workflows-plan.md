# Stabilize md2vid CLI Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a freshly installed `md2vid` package reliably scaffold, build, regroup, verify, preview, and render flat or canonical HyperFrames and Remotion projects without undocumented identifiers, ignored arguments, partial updates, or subject-specific defaults.

**Architecture:** Introduce small shared modules for strict argument parsing, project-layout resolution, and managed file transactions. Preserve stable voice IDs while deriving frame order from array position, require valid configuration during verification, and make generated scaffolds expose a complete narration-to-check workflow. Keep framework adapters responsible for their own generated caption artifacts and preserve the hash-table Remotion implementation as an opt-in example.

**Tech Stack:** Node.js 22.18+, TypeScript with Node strip-types, `node:util.parseArgs`, `node:test`, HyperFrames 0.7.26, Remotion 4.0.486, npm package/release harness.

---

## Plan parts

1. [`2026-07-24-stabilize-cli-workflows-plan-1.md`](./2026-07-24-stabilize-cli-workflows-plan-1.md) — strict CLI parsing, shared project layout, stable voice identity, strict verification.
2. [`2026-07-24-stabilize-cli-workflows-plan-2.md`](./2026-07-24-stabilize-cli-workflows-plan-2.md) — failure-atomic regroup transaction and adapter-owned caption validation.
3. [`2026-07-24-stabilize-cli-workflows-plan-3.md`](./2026-07-24-stabilize-cli-workflows-plan-3.md) — truthful scaffolds, narration onboarding, neutral Remotion defaults, opt-in hash-table example.
4. [`2026-07-24-stabilize-cli-workflows-plan-4.md`](./2026-07-24-stabilize-cli-workflows-plan-4.md) — end-to-end workflow matrix, packed artifact smoke, documentation synchronization, final release gates.

## Cross-part dependencies

```text
Part 1
  Task 1 strict CLI parser
       ↓
  Task 2 shared project layout
       ├──────────────┐
       ↓              ↓
  Task 3 voice IDs   Task 4 strict verify
       └──────┬───────┘
              ↓
Part 2
  Task 5 failure-atomic regroup
              ↓
Part 3
  Task 6 truthful scaffolds
       ↓
  Task 7 neutral Remotion + opt-in example
              ↓
Part 4
  Task 8 source + packed workflow matrix
       ↓
  Task 9 docs synchronization + completion gates
```

- Tasks 3 and 4 may run in parallel after Task 2 because they modify separate engine/verification files. If either fails, keep the passing task's commit and repair the failing task independently.
- Task 5 is sequential after Tasks 2 and 4 because it consumes the shared layout contract, strict config behavior, and adapter interfaces.
- Tasks 6 and 7 are sequential: Task 7 changes the framework defaults that Task 6's generated script and next-step tests assert.
- Task 8 requires every code-facing task to be complete.
- Task 9 is last because authoritative docs and synchronized skill copies must describe the final behavior, not an intermediate state.

## Shared interfaces locked by this plan

```ts
// scripts/project_layout.ts
export interface ProjectLayout {
  outputDir: string;
  sharedDir: string;
  flat: boolean;
}

export function resolveProjectLayout(outputDir: string): ProjectLayout;
```

```ts
// scripts/cli_args.ts
export interface CommandSpec {
  command: string;
  usage: string;
  options?: ParseArgsConfig["options"];
  minPositionals: number;
  maxPositionals: number;
}

export type CommandParseResult =
  | { kind: "help" }
  | { kind: "ok"; values: Record<string, string | boolean | undefined>; positionals: string[] }
  | { kind: "error"; message: string; usage: string };

export function parseCommand(spec: CommandSpec, argv: string[]): CommandParseResult;
```

```ts
// engine planning invariant
frame.id       = original voice.id;
frame.frameNum = voices array index + 1;
frame.slug     = config.slugs[voice.id];
```

```ts
// scripts/managed_file_transaction.ts
export interface ManagedFile {
  target: string; // project-relative, normalized path
  staged: string; // absolute path inside invocation-owned staging
}

export function promoteManagedFiles(
  root: string,
  files: ManagedFile[],
  deps?: ManagedFileTransactionDependencies,
): void;
```

## Commit sequence

1. `refactor(cli): add strict command parsing`
2. `refactor(cli): centralize project layout resolution`
3. `fix(engine): separate voice identity from frame order`
4. `fix(cli): require valid configuration during verify`
5. `fix(captions): make regroup failure-atomic`
6. `feat(scaffold): add verified narration workflow`
7. `fix(remotion): make default scaffold content-neutral`
8. `test: cover installed first-run workflows`
9. `docs: document stable CLI workflows`

Do not combine these commits. Each commit must leave its focused test command passing.
