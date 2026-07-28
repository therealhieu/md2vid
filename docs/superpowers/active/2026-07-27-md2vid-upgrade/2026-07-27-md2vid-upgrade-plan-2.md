# `md2vid upgrade` Implementation Plan — Part 2: Integration and Guidance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the tested workflow through the published CLI, require it in the npm artifact, and align README and installed-skill guidance.

**Architecture:** The router imports only `run()` from `scripts/upgrade.ts`. Release manifest coverage proves TypeScript emission includes the module. Separate test-only and documentation-only commits keep the public guidance contract TDD-driven and compliant with `docs/standards/git.md`.

**Tech Stack:** TypeScript CLI router, Node.js test runner, release manifest assertions, Markdown documentation.

---

## Group: `upgrade-integration`

Tasks 6–8 are one public-contract scope. Preserve all three commits, then run one combined review/remediation/verifier cycle.

### Task 6: Register and package the upgrade command [Tester: yes] `[Group: upgrade-integration]`

**Files:**
- Modify: `bin/md2vid.ts:10-55`
- Modify: `test/cli/router.test.ts:193-285`
- Modify: `test/release/manifest.ts:1-14`
- Modify: `test/cli/pack.test.ts:9-23`

- [ ] **Step 1: Add `upgrade` to root-help coverage**

In `test/cli/router.test.ts`, extend the command array at the root-help test:

```ts
for (const command of [
  "new",
  "build",
  "regroup",
  "transcribe",
  "verify",
  "hyperframes",
  "patch-studio",
  "install-skill",
  "upgrade",
]) {
  assert.match(result.stdout, new RegExp(`\\b${command}\\b`));
}
```

Add:

```ts
test("root help describes synchronized upgrade", () => {
  const result = runBin(["--help"]);
  assert.equal(result.code, 0);
  assert.match(
    result.stdout,
    /upgrade\s+update the global CLI and refresh the skill/,
  );
});
```

- [ ] **Step 2: Add `upgrade` to mutation-free argument coverage**

Add `"upgrade"` to the existing command arrays at:

- subcommand `-h`/`--help` coverage;
- typo-option rejection;
- excess-positional rejection.

The existing `invalidCommandCase()` fallback provides isolated environment paths; parsing must reject before npm validation.

- [ ] **Step 3: Add packed-module coverage**

In `test/cli/pack.test.ts`, extend the helper list:

```ts
for (const helper of [
  "dist/scripts/cli_args.js",
  "dist/scripts/project_layout.js",
  "dist/scripts/managed_file_transaction.js",
  "dist/scripts/upgrade.js",
]) {
  assert.ok(
    REQUIRED_PACKED_FILES.some((path) => path === helper),
    `missing compiled helper ${helper}`,
  );
}
```

- [ ] **Step 4: Run integration tests and verify red state**

Run:

```bash
node --test test/cli/router.test.ts test/cli/pack.test.ts
```

Expected: FAIL because the router and release manifest do not include `upgrade`.

- [ ] **Step 5: Register `upgrade` in the dispatch-only router**

Modify `bin/md2vid.ts`:

```ts
import { run as installSkillRun } from "../scripts/install_skill.ts";
import { run as upgradeRun } from "../scripts/upgrade.ts";
```

```ts
const COMMANDS: Record<string, Run> = {
  new: newRun,
  build: buildRun,
  regroup: regroupRun,
  transcribe: transcribeRun,
  verify: verifyRun,
  hyperframes: (args) => runHyperframes(args),
  "patch-studio": patchRun,
  "install-skill": installSkillRun,
  upgrade: upgradeRun,
};
```

Add the exact help row:

```ts
"  upgrade                                          update the global CLI and refresh the skill",
```

Do not add npm, path, or skill-copy logic to `bin/md2vid.ts`.

- [ ] **Step 6: Require the compiled upgrade module**

In `test/release/manifest.ts`, add:

```ts
"dist/scripts/install_skill.js",
"dist/scripts/upgrade.js",
"dist/scripts/package_root.js",
```

No `package.json` `files` change is required because `dist` is published, and `tsconfig.dist.json` includes `scripts/**/*.ts`.

- [ ] **Step 7: Run source and compiled checks**

Run:

```bash
node --test test/cli/router.test.ts test/cli/pack.test.ts
corepack npm run build:dist
node dist/bin/md2vid.js upgrade --help
corepack npm run typecheck
```

Expected:

- Tests pass.
- `dist/scripts/upgrade.js` exists after the build.
- Compiled help prints `Usage: md2vid upgrade` and starts no npm process.
- Typecheck passes.

- [ ] **Step 8: Commit router and package integration**

```bash
git add bin/md2vid.ts test/cli/router.test.ts test/release/manifest.ts test/cli/pack.test.ts
git commit -m "feat(cli): expose upgrade command"
```

Do not stage generated `dist/` files.

### Task 7: Define synchronized update guidance contracts [Tester: yes] `[Group: upgrade-integration]`

**Files:**
- Modify: `test/cli/package-meta.test.ts:94-145`
- Modify: `test/cli/skill-commands.test.ts:84-101`

- [ ] **Step 1: Add README required-string assertions**

In the public README string array in `test/cli/package-meta.test.ts`, add:

```ts
"md2vid upgrade",
"npm install --global md2vid@latest",
```

- [ ] **Step 2: Add the README normal-update and recovery test**

Append:

```ts
test("public README uses synchronized upgrade with manual recovery", () => {
  assert.match(readme, /## Update\s+```bash\s+md2vid upgrade\s+```/);
  assert.match(
    readme,
    /manual recovery[\s\S]*npm install --global md2vid@latest[\s\S]*md2vid install-skill/i,
  );
  assert.doesNotMatch(
    readme,
    /Rerun `md2vid install-skill` after every `npm update -g md2vid`/,
  );
});
```

- [ ] **Step 3: Add the installed-skill guidance test**

Append to `test/cli/skill-commands.test.ts`:

```ts
test("skill documents synchronized upgrades and install-skill recovery", () => {
  const body = readFileSync(SKILL, "utf8");
  assert.match(body, /`md2vid upgrade`/);
  assert.match(body, /normal update/i);
  assert.match(body, /repair|recovery/i);
  assert.match(body, /`md2vid install-skill`/);
  assert.doesNotMatch(body, /re-run after `npm update`/);
});
```

Extend the mechanical command loop:

```ts
for (const cmd of [
  /md2vid new /,
  /md2vid build /,
  /md2vid regroup /,
  /md2vid verify /,
  /md2vid upgrade/,
]) {
  assert.match(body, cmd, `skill must drive the CLI: ${cmd}`);
}
```

- [ ] **Step 4: Run contract tests and verify red state**

Run:

```bash
node --test test/cli/package-meta.test.ts test/cli/skill-commands.test.ts
```

Expected: FAIL because README and skill content still use the old update contract.

- [ ] **Step 5: Commit the failing contract tests**

```bash
git add test/cli/package-meta.test.ts test/cli/skill-commands.test.ts
git commit -m "test(cli): define synchronized upgrade guidance"
```

This test-only commit intentionally records the red contract before Task 8 supplies documentation.

### Task 8: Publish synchronized update guidance [Tester: yes] `[Group: upgrade-integration]`

**Files:**
- Modify: `README.md:15-22,78-94,165-170`
- Modify: `skill/md2vid/SKILL.md:94-123`
- Potentially regenerate: `public-snapshot.json`

- [ ] **Step 1: Update the README install note and CLI list**

Replace the old rerun sentence with:

```md
Use `md2vid upgrade` for future updates. Use `md2vid install-skill` directly only to repair or refresh the copied skill without changing the CLI package.
```

Add to the CLI command block:

```text
md2vid install-skill
md2vid upgrade
```

Keep first-install commands unchanged.

- [ ] **Step 2: Replace the README Update section**

Use this exact content:

````md
## Update

```bash
md2vid upgrade
```

The command supports global npm installations. It installs `md2vid@latest`, then launches the newly installed CLI to refresh the Claude skill. It also refreshes the skill when the CLI is already current.

If the CLI was launched from a local dependency, an `npx` cache, or another unsupported installation source, use manual recovery:

```bash
npm install --global md2vid@latest
md2vid install-skill
```
````

- [ ] **Step 3: Update the shipped skill preflight guidance**

Keep the unavailable-CLI first-install code block unchanged. Immediately after it, add:

```md
For normal updates of an existing global installation, run `md2vid upgrade`. The command updates the npm package and refreshes this copied skill. Use `md2vid install-skill` directly only for skill repair or recovery after a partial upgrade failure.
```

- [ ] **Step 4: Update the shipped skill command table**

Replace the `install-skill` row and add `upgrade`:

```md
| `md2vid install-skill` | Repair or refresh this skill in `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/md2vid` without updating the CLI package |
| `md2vid upgrade` | Update the global npm CLI to `md2vid@latest` and refresh the copied skill |
```

Do not change standards references or add repository-relative paths.

- [ ] **Step 5: Run documentation and skill checks**

Run:

```bash
node --test test/cli/package-meta.test.ts test/cli/skill-commands.test.ts
corepack npm run check:skill-references
```

Expected: both test files and the skill-reference check pass.

- [ ] **Step 6: Regenerate and verify the public snapshot**

Run:

```bash
corepack npm run public:snapshot
corepack npm run public:snapshot:check
git diff --check
```

Expected: all commands exit `0`; the diff check prints nothing. Stage `public-snapshot.json` only if the generation command changes it.

- [ ] **Step 7: Commit documentation-only changes**

Inspect `git status --short`, then run one of:

```bash
git add README.md skill/md2vid/SKILL.md
git commit -m "docs(cli): document synchronized upgrades"
```

or, only when snapshot generation changed the tracked manifest:

```bash
git add README.md skill/md2vid/SKILL.md public-snapshot.json
git commit -m "docs(cli): document synchronized upgrades"
```

The commit contains documentation and its generated documentation snapshot only; executable tests remain in the preceding `test(cli)` commit.

## Group Review and Verification Checklist

After Tasks 6–8 Mode A:

1. Run `spec-reviewer`, `code-quality-reviewer`, and `tester` in parallel against the full `upgrade-integration` diff.
2. Resume the same implementer for accepted findings.
3. Rerun:

```bash
node --test test/cli/upgrade.test.ts
node --test test/cli/router.test.ts test/cli/pack.test.ts
node --test test/cli/package-meta.test.ts test/cli/skill-commands.test.ts
corepack npm run check:skill-references
corepack npm run public:snapshot:check
corepack npm run check
git diff --check
```

4. The same implementer spawns one read-only verifier to confirm:
   - root and compiled help list `upgrade`; `upgrade --help` is mutation-free;
   - the packed manifest requires `dist/scripts/upgrade.js`;
   - normal README and skill updates use `md2vid upgrade`;
   - manual recovery preserves `npm install --global md2vid@latest` plus `md2vid install-skill`;
   - first-install guidance remains correct;
   - no generated `dist/` content is committed;
   - the test-only and docs-only commits comply with `docs/standards/git.md`.
5. Run the index plan's full Final Verification sequence before completion.
