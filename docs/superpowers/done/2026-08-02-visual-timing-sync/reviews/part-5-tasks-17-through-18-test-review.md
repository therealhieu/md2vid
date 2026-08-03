# Canonical Review Artifact

- Review scope: Part 5, Tasks 17-18
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `7c0855a8393a1f6d18453bd14af2b778b600c651; baseline /var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines.7eIxOv/part-5-tasks-17-through-18`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.avI1H8/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Suites run

All passed.

| Check | Result |
|---|---|
| Documentation contracts: `skill-references`, `skill-commands`, `package-meta`, `docs-boundary` | 61/61 passing |
| Package/release: golden, pack, artifact, harness, public-snapshot, checkout, release-contract | 129/129 passing |
| `corepack npm run typecheck` | passed |
| `corepack npm run typecheck:remotion` | passed |
| `corepack npm run check:skill-references` | passed |
| `corepack npm run public:snapshot:check` | passed |
| `corepack npm run release:check` | passed; 1,006 suite tests passed; packed HyperFrames and Remotion smoke flows completed |
| `git diff --check 7c0855a… 40af4d7…` | passed |

## Findings

### Nice to have

#### TEST-001 — Stale snapshot rejection lacks a direct regression fixture

**Evidence**

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/ci/public-snapshot-check.test.ts:51-64` confirms the tracked manifest lists the new visual-timing paths, and the command-level snapshot check passed.

However, there is no test that deliberately makes the tracked `public-snapshot.json` stale relative to a selected public source file and then asserts `scripts/check_public_snapshot.ts` exits nonzero. The closest CLI test exercises invalid options and explicit output generation:

```733:749:/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/ci/public-snapshot.test.ts
test("CLI rejects invalid options and builds a valid snapshot", (t) => {
  // --unknown rejects; --output ... --ref HEAD builds a snapshot
});
```

**Guidance**

Add a temporary-repository test that changes a public-selected file after producing a manifest, invokes the checker, and asserts a nonzero status with a stale/hash-drift diagnostic.

**Checklist**

- [ ] Generate a valid manifest in a temporary repository.
- [ ] Modify a selected public file without regenerating the manifest.
- [ ] Execute `check_public_snapshot.ts`.
- [ ] Assert failure and an actionable stale-manifest diagnostic.

#### TEST-002 — HyperFrames controller/finalizer ordering test checks emitted text, not runtime behavior

**Evidence**

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/__tests__/emit.test.ts:101-124` verifies substring offsets:

```114:120:/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/__tests__/emit.test.ts
const template = preflight(plan, shared, output, {}).embeddedFrameTemplates![0];
const helper = template.indexOf("window.__md2vidTiming");
const controller = template.indexOf('window.__timelines["01-a"] = gsap.timeline');
const finalizer = template.lastIndexOf('const timeline = window.__timelines["01-a"]');

assert.ok(helper >= 0 && helper < controller);
assert.ok(controller < finalizer);
```

This proves serialized placement, but not that the generated finalizer successfully composes with the transported authored controller or remains seek-safe at runtime.

**Guidance**

Execute an emitted fixture in the existing browser/runtime harness. Assert that both the authored controller motion and the declarative beat reveal are attached to the composed timeline and produce correct states after forward and backward seeks.

**Checklist**

- [ ] Emit a frame containing both an authored controller and `data-md2vid-beat`.
- [ ] Execute it with real GSAP in the browser harness.
- [ ] Seek before cue → cue → after cue → backward.
- [ ] Assert authored and generated target states are deterministic and the composed timeline is unique.

## Consolidated checklist

- [x] Canonical standards and bundled references are byte-identical.
- [x] Skill workflow places visual planning before framework authoring.
- [x] README documents beats, migration mode, profiles, FPS floor, and render evidence.
- [x] Required package payload includes visual-timing modules, planning scripts, and `VisualBeats.tsx`.
- [x] Packed adapters execute from an unrelated working directory.
- [x] Release smoke supplies required-mode beat/binding inputs.
- [x] Packed HyperFrames render consumes draft profile and records policy evidence.
- [x] Public snapshot contains required visual-timing sources.
- [x] Checkout-based snapshot validation retains required paths.
- [x] Captions-only behavior conditionally preserves/promotes binding manifests in existing behavioral tests.
- [x] Type checks, reference synchronization check, snapshot check, release check, and diff whitespace check pass.
- [ ] Add direct stale-snapshot rejection coverage. `TEST-001`
- [ ] Add behavioral controller/finalizer composition coverage. `TEST-002`

## Coverage gaps and residual risk

- The no-argument snapshot path is covered indirectly through `writePublicSnapshotManifest()` at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/ci/public-snapshot.test.ts:240-254`, but not by invoking the CLI entrypoint with zero arguments. Residual risk is confined to future entrypoint argument-routing changes.
- The following tests intentionally inspect source text rather than behavior:
  - Documentation/skill contract tests in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/skill-references.test.ts`, `/test/cli/skill-commands.test.ts`, `/test/cli/package-meta.test.ts`, and `/test/docs-boundary.test.ts`; this is appropriate for documentation contracts.
  - Release-harness structural assertions at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/release/harness.test.ts:100-190`; runtime release smoke subsequently exercises the packed artifact, but those individual assertions do not.
  - `TEST-002` is the only new ordering-specific assertion that remains text-only without an equivalent focused runtime assertion.
- Command-generated mutations: no implementation or tracked workspace files changed. The pre-existing untracked review-artifact directory remained the only `git status` entry. `public:snapshot:check` and release checks created temporary `/private/var/folders/.../md2vid-*` installation/snapshot/release directories; release tests intentionally retain some failing-fixture diagnostics directories.