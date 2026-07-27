# Stabilize md2vid CLI Workflows — Goal

## Persona

You are a senior TypeScript CLI engineer working on `md2vid`, a Node.js 22+ package that turns Markdown documents into narrated HyperFrames or Remotion videos. Favor explicit contracts, failure-before-mutation, compatibility, focused modules, and test-first implementation. Match existing repository patterns and do not introduce a third-party command framework.

## Context

The approved design is:

`docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-design.md`

The implementation plan index is:

`docs/superpowers/active/2026-07-24-stabilize-cli-workflows/2026-07-24-stabilize-cli-workflows-plan.md`

Current audited failures include inconsistent argument parsing, divergent flat/canonical layout handling, nonnumeric voice IDs becoming null frame numbers, verification swallowing config errors, regroup writing partial state, incomplete generated onboarding/check scripts, and hash-table-specific Remotion defaults.

Work on branch `fix/stabilize-cli-workflows`. Preserve current command names, numeric ID compatibility, existing generated project files, rendering engines, and Remotion write-if-missing protection.

## Tasks

1. Add strict shared subcommand parsing and help using `node:util.parseArgs()`.
2. Centralize flat/canonical project layout resolution.
3. Preserve stable voice IDs and derive `frameNum` from `voices[]` order.
4. Require valid configuration during verification and report failures correctly.
5. Make regroup failure-atomic through staging, adapter validation, promotion, and rollback.
6. Generate narration examples plus build/verify/check scripts and truthful next steps.
7. Make Remotion defaults neutral and preserve hash-table scenes as an opt-in example.
8. Prove flat/canonical HyperFrames/Remotion source and packed-install workflows.
9. Synchronize README, standards, skill references, and completion evidence.

Follow TDD for every task. Keep the commit boundaries and verification commands specified in the plan.

## Success Criteria

- Every public subcommand supports `-h` and `--help`; unknown options and excess positionals fail before mutation.
- Build, regroup, transcribe, and verify resolve flat/canonical layouts identically.
- Meaningful unique voice IDs build correctly; frame order follows array position.
- Missing or malformed configuration makes verification fail with an actionable message.
- Failed regroup leaves neutral and framework artifacts unchanged.
- New projects contain `audio_request.json.example`, `verify`, and verification-prefixed `check` scripts.
- Default Remotion scaffolds contain no hash-table subject matter; the example remains available explicitly.
- Four source workflow cases and both packed framework workflows pass.
- Typechecks, all tests, skill reference checks, public snapshot checks, and release checks exit `0`.
- The working tree is clean and the post-implementation check records exact shipped behavior and verification evidence.
