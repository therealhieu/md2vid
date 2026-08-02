# Canonical Review Artifact

- Review scope: Part 4, Tasks 9-10
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `e7eb238b509146b3d92c45a4b0797045377902a0`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baseline.oTADBX/part-4-tasks-9-through-10`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.H2uQsQ/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

# Code-quality review — Part 4, Tasks 9–10

Scope reviewed: commits `7b09a05` and `d33d2b5` against baseline `e7eb238b509146b3d92c45a4b0797045377902a0`.

| Severity | Findings |
|---|---:|
| Must fix | CQ-001, CQ-003 |
| Nice to have | CQ-002, CQ-004 |

## Must fix

### CQ-001 — The normative workflow markers are not asserted unique

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/skill-references.test.ts:111-116` finds only the first start marker and first subsequent end marker with `indexOf`.
- The current skill has one marker pair at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/skill/md2vid/SKILL.md:164` and `:276`, but the test would still pass if a conflicting second marked workflow were appended.
- A read-only mutation probe confirmed that the existing extraction accepts injected duplicate marker pairs.

**Why it matters**

The test claims one normative narration workflow, but it permits multiple independently marked “normative” workflows. A later contradictory block could cause documentation-policy drift while all ordering checks remain green.

**Guidance**

Count each marker before extracting the block, require exactly one of each, then preserve the current ordering checks.

```ts
const count = (text: string, fragment: string) => text.split(fragment).length - 1;

assert.equal(count(skill, startMarker), 1, "expected exactly one workflow start marker");
assert.equal(count(skill, endMarker), 1, "expected exactly one workflow end marker");
```

**Success checklist**

- [ ] Exactly one `md2vid-narration-workflow:start` marker is required.
- [ ] Exactly one matching end marker is required.
- [ ] The start marker precedes the end marker.
- [ ] A duplicate start/end pair causes `test/cli/skill-references.test.ts` to fail.
- [ ] Existing workflow-order and enclosed media-contract checks remain intact.

---

### CQ-003 — Task 10’s prescribed `release:pack` command cannot run

**Evidence**

- The authoritative Part 4 plan instructs a bare command at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-02-kokoro-michael-spoken-punctuation-defaults/2026-08-02-kokoro-michael-spoken-punctuation-defaults-plan-4.md:274-280`:

  ```bash
  corepack npm run release:pack
  ```

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/run.ts:35-40` documents `pack --output <directory>`.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/run.ts:118-121` rejects `pack` without `--output`.
- A direct read-only invocation returned `missing --output` and usage text.

**Guidance**

This is correctly a command/documentation-only correction: do not change `package.json`, production release code, or the Task 10 manifest scope. Record the deviation in the Part 4 execution evidence and replace the executable verification form with:

```bash
artifact_dir="$(mktemp -d /tmp/md2vid-pack.XXXXXX)"
corepack npm run release:pack -- --output "$artifact_dir"
```

**Success checklist**

- [ ] The Part 4 acceptance record states that `release:pack` requires a caller-owned empty output directory.
- [ ] The executable command passes `-- --output "$artifact_dir"` through npm.
- [ ] The command exits `0` and writes both the tarball and `artifact.json`.
- [ ] No package-script or production-code change is introduced solely for this documentation correction.

## Nice to have

### CQ-002 — Negative packaging checks miss dependency aliases and some compiled runner variants

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/package-meta.test.ts:580-585` checks only dependency **keys**. An npm alias such as `"tts": "npm:media-use@..."` would pass.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/pack.test.ts:108-112` rejects only three exact runner paths. For example, `dist/scripts/audio.mjs` is not rejected.
- The current production boundary is sound: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/boundaries.test.ts:65-85` passed and confirms no production media-use locator, runner, or audio route exists. This is a regression-test hardening gap, not a current package violation.

**Guidance**

Inspect dependency names **and specs** for media-use aliases. Keep tarball rejection narrow to executable production paths so documentation references to the allowed skill-owned media command do not become false positives.

```ts
const entries = Object.entries({
  ...(pkg.dependencies ?? {}),
  ...(pkg.optionalDependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
});

assert.equal(
  entries.some(([name, spec]) => /media-use/i.test(`${name}\0${String(spec)}`)),
  false,
);
```

For the extracted tarball, reject `dist/scripts/audio` with executable JS-family extensions, rather than a broad `/audio/` match.

**Success checklist**

- [ ] A direct `media-use` dependency fails.
- [ ] An npm alias whose package spec references `media-use` fails.
- [ ] `dist/scripts/audio.js`, `.mjs`, and `.cjs` fail tarball validation.
- [ ] Allowed `/media-use` documentation in `skill/md2vid/SKILL.md` remains packageable.
- [ ] The test continues to inspect the actual extracted tarball, not only repository source paths.

---

### CQ-004 — Cross-surface policy tests establish token presence, not the complete contract

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/skill-references.test.ts:92-108` independently checks required terms in canonical standards and the skill.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/package-meta.test.ts:552-577` applies the same presence-and-order style to the README.
- The current documents agree, and generated references are byte-identical to canonical standards. However, a future contradictory default or exception could be added elsewhere in a section while the required terms still remain and tests pass.

**Guidance**

Parse the JSON request fence in each public surface and compare its object to the exact FR-1 request. Keep the framework documents deliberately exempt from provider/voice assertions, since their intended responsibility is neutral-artifact consumption only.

**Success checklist**

- [ ] README, canonical standard, and skill each contain one parseable default-request example.
- [ ] Every parsed example deep-equals the FR-1 request, including lines and ordering.
- [ ] One focused assertion covers the exact long-sentence approval rule and non-English voice rule on each policy-owning surface.
- [ ] Framework standards continue to contain no provider, voice, language, or speed defaults.

## Consolidated remediation checklist

```text
CQ-001  Enforce exactly one marked normative workflow.
CQ-003  Correct the Task 10 release-pack invocation in execution evidence only.
CQ-002  Harden media-use alias and production-runner tarball rejection.
CQ-004  Parse and compare duplicated public default-request contracts.
```

Suggested order:

```text
CQ-001 → CQ-004
CQ-003 independent
CQ-002 independent
```

## Verification performed

| Check | Result |
|---|---|
| `corepack npm run check:skill-references` | Pass |
| Focused docs/skill/package tests | 70 passed |
| `test/cli/pack.test.ts` + `test/cli/package-meta.test.ts` | 32 passed |
| `test/boundaries.test.ts` | 8 passed |
| `test/release/harness.test.ts` | 69 passed |
| `git diff --check` against supplied baseline | Pass |

The extracted-package test proved the six required narration paths are present and the current exact forbidden-runner list is absent. It does not eliminate the CQ-002 alias/extension coverage gap.

## Residual risks

- Task 11’s retained-fixture release proof is outside this Tasks 9–10 review scope; its full `release:check` integration was not used as acceptance evidence here.
- The worktree retains the pre-existing untracked review directory:

  `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/docs/superpowers/active/2026-08-02-kokoro-michael-spoken-punctuation-defaults/reviews/`

- No source, test, documentation, commit, or configuration files were modified during this review.