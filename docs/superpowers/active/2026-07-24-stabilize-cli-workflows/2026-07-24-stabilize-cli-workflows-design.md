# Stabilize md2vid CLI Workflows — Design

**Date:** 2026-07-24  
**Status:** Approved  
**Branch:** `fix/stabilize-cli-workflows`

## Goal

A user should be able to install `md2vid`, scaffold either framework, follow the printed instructions, and reach a verified preview without knowing internal file formats or recovering from partial command failures.

## Scope

This design addresses the confirmed usability audit findings:

1. Flat scaffolds fail during generated `npm run build` because `regroup` requires a sibling `shared/` directory.
2. Narration setup lacks a bootstrappable public contract.
3. Meaningful voice IDs become invalid numeric frame IDs.
4. Argument parsing and subcommand help are inconsistent.
5. Verification suppresses configuration errors and is omitted from generated check scripts.
6. Regrouping can leave neutral and framework caption artifacts inconsistent.
7. The default Remotion scaffold injects hash-table-specific scenes.
8. Tests do not prove the packed artifact's first-run workflows.

Out of scope:

- A new public `md2vid audio` command.
- Replacing the current command router with a third-party CLI framework.
- Rewriting existing generated projects.
- True crash-atomic transactions across multiple files.
- Changing framework rendering engines.

## 1. Shared command and project contracts

**Purpose** — Make every command interpret arguments and project layout consistently.

**Current state**

```text
Each command
  ├─ custom argument parser
  ├─ custom flat/shared resolution
  └─ command-specific validation order

build      → shared-or-flat
regroup    → sibling shared only
transcribe → shared-or-flat
verify     → separate resolver + fallback framework
```

**Expected state**

```text
argv
  ↓
parseCommand(schema, argv)
  ├─ strict options
  ├─ positional arity
  ├─ help detection
  └─ normalized usage errors
  ↓
resolveProjectLayout(outputDir)
  ├─ outputDir
  ├─ sharedDir
  └─ flat: boolean
  ↓
command-specific operation
```

### CLI parser

Add `scripts/cli_args.ts`, built on Node's `util.parseArgs()` under the existing Node `>=22.18` requirement.

The helper will:

- Enable strict option handling.
- Permit only the positional count declared by each command.
- Support `-h` and `--help` for every subcommand with exit code `0`.
- Detect missing string option values.
- Normalize Node parser errors into concise command-specific messages.
- Preserve the original option spelling when available for actionable errors.

Each command retains its own usage text and option schema, but not its own parser implementation.

### Project layout resolver

Add `scripts/project_layout.ts` with a pure resolver:

```ts
interface ProjectLayout {
  outputDir: string;
  sharedDir: string;
  flat: boolean;
}
```

Resolution rule:

```text
<output>/../shared exists and is a directory
  → canonical: sharedDir=<output>/../shared
otherwise
  → flat: sharedDir=<output>
```

`build`, `regroup`, `transcribe`, and `verify` must consume this helper. The helper performs layout selection only; commands remain responsible for their required files.

## 2. Audio identity and first-run onboarding

**Purpose** — Let users use meaningful voice IDs and understand how narration artifacts are created.

**Current state**

```text
Voice.id: string
   ↓
Number(id)
   ↓
frameNum

"intro" → NaN → JSON null → verifier failure

new project
  → no audio request/example
  → build and transcribe both require audio_meta.json
```

**Expected state**

```text
voices[] order ─────────→ frameNum = index + 1
voice.id ───────────────→ stable identity / slug lookup

new project
  ├─ audio_request.json.example
  ├─ documented audio_meta.json shape
  ├─ meaningful ID examples
  └─ complete printed workflow
```

### Planning model

`engine.plan()` will:

- Preserve `Voice.id` as the stable join key.
- Derive `frameNum` from `voices[]` position, starting at 1.
- Require every voice ID to be non-empty and unique.
- Require exactly one slug mapping for each voice ID.
- Reject duplicate or missing mappings before writing build artifacts.

Numeric and zero-padded IDs remain valid stable IDs, but no longer control frame order.

### Scaffolded onboarding

Every framework scaffold will include `audio_request.json.example` with two short meaningful IDs, such as `intro` and `recap`. It is an example, not an automatically executed request.

The README and copied framework standards will document:

- The minimal `audio_meta.json` schema.
- Relative WAV paths under `assets/voice/`.
- Meaningful voice IDs and their slug mappings.
- The skill-driven audio generation step.
- The command sequence from audio through verified preview.

No `md2vid audio` command will be added. Audio remains owned by the `/md2vid` skill and shared HyperFrames media engine, avoiding duplicated provider logic.

### Actionable missing-audio error

Build and transcribe errors will state both the missing path and the next action. Example:

```text
FAIL: missing audio_meta.json at <path>
Create narration with the /md2vid audio step or follow README.md#narration.
```

## 3. Verification as a required gate

**Purpose** — Ensure invalid project configuration cannot pass and rendered output always follows the md2vid contract.

**Current state**

```text
verify
  → loadConfig failure
  → silently select HyperFrames
  → adapter may pass existing emitted files

npm run check
  → framework checks only
```

**Expected state**

```text
verify
  → resolve layout
  → require and parse valid config
  → select configured adapter
  → neutral checks
  → framework checks

npm run check
  → md2vid verify .
  → framework checks
```

`verify` will report configuration loading failures as problems. It will not infer HyperFrames after malformed or missing configuration.

Legacy HyperFrames defaulting is allowed only when valid configuration loads and the framework field is absent under an explicitly supported legacy contract.

Generated scripts:

```json
{
  "verify": "md2vid verify .",
  "check": "md2vid verify . && <framework-specific checks>"
}
```

HyperFrames `check` continues with lint, validate, and inspect after md2vid verification. Remotion receives an equivalent `check` chain before still/render workflows.

Printed next steps and README examples must use `npm run check` before preview, still, or render.

## 4. Failure-atomic caption regrouping

**Purpose** — Prevent a failed regroup command from leaving JSON and framework caption output out of sync.

**Current state**

```text
calculate groups
  → overwrite caption_groups.json
  → load config
  → adapter emit
       └─ failure leaves mixed old/new artifacts
```

**Expected state**

```text
validate all inputs
  → calculate groups in memory
  → stage neutral JSON
  → stage framework caption output
  → validate staged artifacts
  → promote with rollback
       ├─ success: remove backups/staging
       └─ failure: restore originals
```

### Transaction boundary

The transaction covers:

- `shared/caption_groups.json`
- The framework caption artifact produced by captions-only emission:
  - HyperFrames: `compositions/captions.html`
  - Remotion: the adapter's captions-only generated output, if any

The implementation will stage work under an invocation-owned temporary directory inside the project boundary. It will snapshot existing managed targets, emit against staging paths, and promote only after all validation succeeds.

If any promotion fails, originals are restored and staging is removed. This is **failure atomicity** for command errors; the design does not claim crash atomicity across two files.

The transaction helper must reject unsafe paths and must never remove files it did not stage or snapshot.

## 5. Neutral Remotion scaffold and opt-in example

**Purpose** — Ensure newly scaffolded Remotion projects contain no unrelated subject matter while preserving the rich hash-table reference.

**Current state**

```text
new Remotion project
  ├─ generic project shell
  └─ common slugs map to hash-table scenes
```

**Expected state**

```text
new Remotion project
  ├─ generic TitleCard fallback
  ├─ empty SCENES registry
  └─ neutral project structure

examples/hash-table/remotion/
  ├─ existing scenes
  ├─ example config
  └─ explicit opt-in instructions
```

The default `SCENES` registry will be empty. Unregistered slugs use the existing humanized title card.

The existing hash-table scene implementation will move to an explicit example/fixture rather than being deleted. Tests will verify both:

- A default scaffold has no hash-table content.
- The opt-in example retains its complete scene routing.

Existing generated projects are not rewritten. Current write-if-missing behavior continues to protect hand-authored `src/` files.

## 6. Error behavior

**Purpose** — Make command failures predictable for both humans and scripts.

**Current state**

```text
unknown flags → sometimes ignored
subcommand --help → sometimes usage error
missing project input → mixed exit-code conventions
```

**Expected state**

```text
help request               → stdout, exit 0
usage/argument error       → stderr, exit 2
project/runtime failure    → stderr, exit 1
successful command         → stdout, exit 0
```

Required behavior:

- Unknown flags fail before filesystem mutation.
- Extra positional arguments fail before filesystem mutation.
- Missing option values fail before filesystem mutation.
- `-h`/`--help` works for every command and ignores otherwise incomplete required arguments.
- Error text includes command usage for argument failures.
- Project failures identify the relevant path or field.

No fuzzy autocorrection will be added; exact rejection is safer and simpler. Tests may assert that the raw unknown option is included in the message.

## 7. Generated workflow

**Purpose** — Make the scaffold's printed instructions match the actual passing workflow.

**Current state**

```text
new → author → add narration → build → framework check → preview
       ↑ incomplete                     ↑ md2vid verify omitted
```

**Expected state**

```text
new
  → review audio_request.json.example
  → generate/add narration
  → author framework visuals
  → npm run build
  → npm run check
  → preview/studio
  → render only after review
```

HyperFrames next steps:

1. Review `audio_request.json.example` and generate narration.
2. Author frames under `compositions/frames/`.
3. Fill `video.config.json` slug mappings.
4. Run `npm run build`.
5. Run `npm run check`.
6. Run `npm run dev`.

Remotion next steps:

1. Run `npm install`.
2. Review `audio_request.json.example` and generate narration.
3. Author `src/scenes/*.tsx` and register scenes.
4. Fill `video.config.json` slug mappings.
5. Run `npm run build`.
6. Run `npm run check`.
7. Run `npm run still` or Studio.

## 8. Testing and release verification

**Purpose** — Prove source behavior, generated projects, and the packed install artifact all satisfy the same workflow.

**Current state**

```text
449 passing tests
  ├─ strong unit coverage
  └─ missing audited first-run failure cases
```

**Expected state**

```text
unit tests
  ├─ parseCommand
  ├─ resolveProjectLayout
  ├─ voice identity/order
  └─ regroup rollback

command integration
  ├─ flat HyperFrames
  ├─ canonical HyperFrames
  ├─ flat Remotion
  └─ canonical Remotion

scaffold tests
  ├─ generated examples/scripts/help
  ├─ neutral Remotion default
  └─ opt-in hash-table example

packed artifact smoke
  npm pack → isolated install → new → build → regroup → verify
```

### Required regression tests

- Every subcommand supports `-h` and `--help` with exit code `0`.
- Every subcommand rejects unknown options and extra positionals.
- Argument failures do not modify the filesystem.
- The flat scaffold's generated `npm run build` succeeds with valid inputs.
- Canonical layouts continue to build and regroup.
- Meaningful IDs build with frame numbers based on array order.
- Duplicate IDs and missing slug mappings fail before output mutation.
- Missing or malformed config makes `verify` fail.
- Failed regroup preserves managed targets byte-for-byte.
- Generated `check` scripts invoke md2vid verification.
- Default Remotion scaffolds contain no hash-table strings or routes.
- The hash-table example remains runnable as an explicit fixture.

### Completion gates

Run and pass:

```text
npm run typecheck
npm run typecheck:remotion
npm test
npm run check:skill-references
npm run public:snapshot:check
npm run release:check
```

The release check must exercise a package packed from the current checkout in an isolated temporary install. The globally installed CLI is not sufficient evidence that the checkout artifact works.

## Compatibility

- Existing command names and primary options remain unchanged.
- Numeric voice IDs remain valid.
- Meaningful string voice IDs become supported.
- Existing canonical projects remain supported.
- Existing flat projects become fully supported by regroup.
- Existing generated framework source is never rewritten automatically.
- New Remotion scaffolds change from content-specific to neutral; the old content remains as an opt-in example.

## Research basis

- Node.js v22 `util.parseArgs`: https://github.com/nodejs/node/blob/v22.17.0/doc/api/util.md
- Node.js parse-argument errors: https://github.com/nodejs/node/blob/v22.17.0/doc/api/errors.md
- Command Line Interface Guidelines: https://clig.dev#help
- POSIX `rename()`: https://pubs.opengroup.org/onlinepubs/000095399/functions/rename.html
- npm scripts: https://docs.npmjs.com/cli/v11/using-npm/scripts

## Acceptance criteria

The work is complete when:

1. A first-time user can follow generated instructions from scaffold to verified preview.
2. Flat and canonical projects behave identically across build, regroup, transcribe, and verify.
3. Meaningful voice IDs do not affect numeric frame order.
4. Invalid arguments and configurations fail before mutation with actionable messages.
5. Caption regroup failures preserve prior artifacts.
6. HyperFrames and Remotion default scaffolds are neutral and verifiable.
7. Source tests and packed-artifact smoke tests pass.
8. Documentation, generated standards, and the installed skill describe the same workflow.
