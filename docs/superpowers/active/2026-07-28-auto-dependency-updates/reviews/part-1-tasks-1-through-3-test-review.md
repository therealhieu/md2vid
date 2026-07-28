# Canonical Review Artifact

- Review scope: Part 1, Tasks 1-3
- Reviewer role: tester
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl`
- Scope mode: `clean-head`
- Scope origin: `266ea8ee4ac9d51ceb1389f64f123f045f635dac`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-scope.LEdV3R/task-scope.patch`
- Created: 2026-07-28
- Tester dispatched: yes

---

# Tester Report — Part 1, Tasks 1–3 (`dependency-contracts`)

## Scope

Reviewed the complete goal, design, research, index plan, Part 1 plan, scoped patch, implementation, and affected tests.

**Scope origin:** `266ea8ee4ac9d51ceb1389f64f123f045f635dac`

**Commits reviewed:**

```text
ff9f661 test(deps): define package version authority
fe3c493 chore(deps): derive operational dependency versions
4bba15c test(ci): generalize immutable action pins
```

**Primary files:**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/scripts/dependency_versions.ts`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/frameworks/hyperframes/scaffold.ts`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/frameworks/hyperframes/emit.ts`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/scripts/copy_dist_assets.ts`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/frameworks/remotion/scaffold.ts`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/cli/dependency-versions.test.ts`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/test/ci/workflows.test.ts`

---

## Findings

### TEST-001 — Must fix — Root Remotion family mismatch is silently ignored

**Evidence**

`REMOTION_VERSION` reads only `optionalDependencies.remotion`, then generates every `@remotion/*` scaffold dependency from that value:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/scripts/dependency_versions.ts:39`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/scripts/dependency_versions.ts:57-66`

The module does not validate the existing root entries:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/package.json:81-85`

A temporary-copy mutation changed only:

```json
"@remotion/media": "4.0.487"
```

The authority module still imported successfully and produced:

```json
{
  "rootMedia": "4.0.487",
  "authority": "4.0.486",
  "generatedMedia": "4.0.486"
}
```

Thus:

```text
root package installs @remotion/media@4.0.487
                         ↓
dependency authority ignores it
                         ↓
generated project uses @remotion/media@4.0.486
```

This violates the package-authority and synchronized-family contracts. A grouped Dependabot update can modify a root `@remotion/*` package while the generated manifest silently retains another version.

**Guidance**

Validate every root `optionalDependencies` entry whose name is `remotion` or starts with `@remotion/` against the exact `REMOTION_VERSION`. The dependency-authority test must compare the current root family directly, not only compare generated constants derived from `REMOTION_VERSION`.

At minimum, cover the currently shipped entries:

```text
remotion
@remotion/google-fonts
@remotion/media
```

**Success checklist**

- [ ] Importing `scripts/dependency_versions.ts` rejects a root `@remotion/media` mismatch.
- [ ] Importing it rejects a root `@remotion/google-fonts` mismatch.
- [ ] `test/cli/dependency-versions.test.ts` compares every current root Remotion-family value with `REMOTION_VERSION`.
- [ ] Generated Remotion manifests remain synchronized with the validated root family.
- [ ] The normal generated Remotion project retains all expected dependency entries.
- [ ] Targeted dependency, scaffold, full-suite, and release-smoke checks pass.

---

### TEST-002 — Must fix — “Exact stable” validation accepts noncanonical leading-zero versions

**Evidence**

Package dependency validation uses:

```ts
/^\d+\.\d+\.\d+$/
```

at:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/scripts/dependency_versions.ts:28-34`

The historical GSAP CDN validator uses the same permissive numeric shape:

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/frameworks/hyperframes/scaffold.ts:19-20`
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.worktrees/auto-dependency-updates-impl/frameworks/hyperframes/scaffold.ts:64-72`

Temporary-copy mutations produced:

```text
dependencies.hyperframes = 01.2.3
RESULT: accepted

optionalDependencies.remotion = 04.0.486
RESULT: accepted
```

Direct GSAP validation produced:

```json
{
  "value": "https://cdn.jsdelivr.net/npm/gsap@03.14.1/dist/gsap.min.js",
  "result": "ACCEPTED"
}
```

These are not canonical stable semantic-version triplets. This is also inconsistent with the existing release harness, which explicitly treats `01.2.3` as invalid.

Ranges, prereleases, and family mismatches correctly failed:

```text
^0.7.26              → rejected
3.14.2-beta.1        → rejected
react/react-dom drift → rejected
React types drift     → rejected
```

**Guidance**

Use one shared canonical stable-version predicate for package authority and canonical GSAP URLs. Each component should be either zero or a non-zero digit followed by digits:

```regex
^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$
```

Use the equivalent triplet inside the GSAP CDN URL matcher. Continue rejecting ranges, prereleases, build metadata, query strings, alternate hosts, and protocol-relative URLs.

**Success checklist**

- [ ] `01.2.3` is rejected for HyperFrames.
- [ ] `04.0.486` is rejected for Remotion.
- [ ] `03.14.2` is rejected for GSAP package metadata.
- [ ] `gsap@03.14.1/dist/gsap.min.js` is rejected as a historical canonical URL.
- [ ] Valid values such as `0.7.26`, `4.0.486`, and `3.14.1` remain accepted.
- [ ] Existing exact historical URL `gsap@3.14.1/dist/gsap.min.js` remains accepted.
- [ ] Release-harness and dependency-authority definitions of “exact stable” agree.

## Verification Commands and Results

### Targeted test suites

```bash
node --test test/cli/dependency-versions.test.ts
```

```text
5 passed, 0 failed
```

```bash
node --test frameworks/hyperframes/__tests__/emit.test.ts
```

```text
32 passed, 0 failed
```

```bash
node --test frameworks/hyperframes/__tests__/patch-studio.test.ts
```

```text
7 passed, 0 failed
```

```bash
node --test test/cli/hyperframes-cli.test.ts
```

```text
13 passed, 0 failed
```

```bash
node --test test/cli/scaffold-decoupled.test.ts test/cli/scaffold-project.test.ts
```

```text
32 passed, 0 failed
```

```bash
node --test test/ci/workflows.test.ts
```

```text
50 passed, 0 failed
```

### Full verification

```bash
corepack npm --version
```

```text
11.15.0
```

```bash
corepack npm run check
```

```text
TypeScript checks passed
Remotion TypeScript checks passed
837 tests passed, 0 failed
```

The full run also completed packaged release execution:

```text
OK [pack]
OK [install]
OK [cli]
OK [skill:config]
OK [skill:home]
OK [smoke:hyperframes]: generated build/check + browser execution + short render
OK [smoke:remotion]: generated build/check/still
OK [all]
```

```bash
corepack npm run check:skill-references
```

```text
exit 0
```

```bash
corepack npm run public:snapshot:check
```

```text
public snapshot check passed at d3725963bb4c1f8115849bffe15d23dcbba89156
```

```bash
git diff --check 266ea8ee4ac9d51ceb1389f64f123f045f635dac...HEAD
```

```text
exit 0; no output
```

```bash
git status --short
```

```text
clean; no output
```

### Source and built template behavior

```bash
corepack npm run build:dist
```

```text
exit 0
```

Inspection of all three templates:

| Template | Source token | Source version literal | Dist token | Dist current GSAP URL |
|---|---:|---:|---:|---:|
| `caption-skin.html` | 1 | 0 | 0 | 1 |
| `frame-shell.html` | 1 | 0 | 0 | 1 |
| `frame-template.html` | 1 | 0 | 0 | 1 |

### Packed exclusions

```bash
corepack npm pack --dry-run --json --ignore-scripts
```

```text
134 packed files
source frameworks/hyperframes/templates/* entries: 0
dist HyperFrames templates: present
```

Published materialized templates included:

```text
dist/frameworks/hyperframes/templates/caption-skin.html
dist/frameworks/hyperframes/templates/frame-shell.html
dist/frameworks/hyperframes/templates/frame-template.html
dist/frameworks/hyperframes/templates/themes/claude.css
dist/frameworks/hyperframes/templates/themes/cobalt.css
```

### Command-generated projects

```bash
node bin/md2vid.ts new hf-project --framework hyperframes
node bin/md2vid.ts new remotion-project --framework remotion
```

Both commands exited `0` in an isolated temporary directory.

Generated HyperFrames project:

```text
output.config.json GSAP URL:
https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js

.hyperframes/caption-skin.html:
unresolved tokens = 0
materialized GSAP URLs = 1
```

Generated Remotion manifest contained synchronized current values:

```json
{
  "@remotion/bundler": "4.0.486",
  "@remotion/cli": "4.0.486",
  "@remotion/google-fonts": "4.0.486",
  "@remotion/media": "4.0.486",
  "@remotion/renderer": "4.0.486",
  "remotion": "4.0.486",
  "react": "19.0.0",
  "react-dom": "19.0.0"
}
```

Development entries were:

```json
{
  "@types/react": "^19.0.0",
  "@types/react-dom": "^19.0.0",
  "typescript": "^5.7.0"
}
```

### GSAP compatibility and rejection matrix

Direct `validateGsapSrc()` and materialization checks:

| Input | Result |
|---|---|
| `assets/gsap/gsap.min.js` with an existing regular file | Accepted and preserved |
| `https://cdn.jsdelivr.net/npm/gsap@3.14.1/dist/gsap.min.js` | Accepted and preserved |
| Other HTTPS host | Rejected |
| Canonical URL with query string | Rejected |
| `../gsap.js` | Rejected |
| `https://cdn.jsdelivr.net/npm/gsap@03.14.1/dist/gsap.min.js` | Incorrectly accepted; TEST-002 |

### HyperFrames patch-anchor rejection

```bash
node frameworks/hyperframes/patch-studio.ts /tmp/.../index-test.js
```

The temporary bundle contained anchor 1 but omitted anchor 2.

```text
exit 1
FAIL [patch-studio]: hyperframes@0.7.26 anchor-2 matched 0 time(s), expected 1.
Bundle shape changed — patch needs review.
```

Patch-anchor behavior remains fail-closed and identifies the exact bundle path.

### Immutable Action pin mutation coverage

A temporary repository copy was mutated and `node --test test/ci/workflows.test.ts` rerun for each case.

| Mutation | Result |
|---|---|
| Full SHA → `@v4` tag | Exit 1; full-SHA assertion failed |
| Full SHA → `@deadbeef` | Exit 1; full-SHA assertion failed |
| Remove version comment | Exit 1; version-comment assertion failed |
| Replace comment with `# current` | Exit 1; version-comment assertion failed |
| Change one `actions/setup-node` use to a different valid 40-character SHA | Exit 1; cross-workflow consistency assertion failed |

Representative diagnostics:

```text
third-party action must use a full SHA and version comment
actions/setup-node must use one immutable SHA and version comment
```

## Consolidated Remediation Checklist

- [ ] **TEST-001:** Validate root `remotion` and every root `@remotion/*` optional dependency as one synchronized family.
- [ ] **TEST-001:** Add root-manifest mismatch mutations for `@remotion/media` and `@remotion/google-fonts`.
- [ ] **TEST-002:** Replace permissive digit-triplet checks with canonical stable semantic-version checks.
- [ ] **TEST-002:** Apply the same canonical predicate to historical GSAP CDN URLs.
- [ ] Rerun all six targeted commands.
- [ ] Rerun temporary malformed-version and Remotion-family mutations.
- [ ] Rerun source/dist token inspection and package dry-run inspection.
- [ ] Rerun generated HyperFrames and Remotion project checks.
- [ ] Rerun immutable Action mutation checks.
- [ ] Rerun `corepack npm run check`.
- [ ] Rerun packaged HyperFrames and Remotion smoke verification.
- [ ] Confirm both diff checks and `git status --short` remain clean.

## Canonical Residual Risk

- Actual future Dependabot grouping is not part of Tasks 1–3 and was not exercised in this review.
- No remote registry version was substituted for the current dependencies; mutation testing used isolated local package copies.
- Release smoke covered the current package versions and generated projects, not an unpublished future HyperFrames or Remotion patch.
- HyperFrames compatibility remains dependent on upstream Studio bundle anchors. The current failure gate correctly rejects changed anchors, but each future HyperFrames patch still requires the planned anchor review.
- Historical GSAP compatibility was tested with `3.14.1`; broader historical versions are governed by the same URL predicate rather than downloaded and executed individually.
- Repository source remained unmodified. Generated `dist/`, temporary projects, bundles, package copies, and workflow mutations were used only for read-only verification.
