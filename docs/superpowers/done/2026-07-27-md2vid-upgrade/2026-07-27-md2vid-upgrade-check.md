# 2026-07-27-md2vid-upgrade — Post-Implementation Check

## Artifacts

- [x] Design: `2026-07-27-md2vid-upgrade-design.md`
- [x] Plan: `2026-07-27-md2vid-upgrade-plan.md`, `2026-07-27-md2vid-upgrade-plan-1.md`, and `2026-07-27-md2vid-upgrade-plan-2.md`
- [x] Goal: `2026-07-27-md2vid-upgrade-goal.md`
- [x] Implementation: branch `feat-md2vid-upgrade`; core commits `c435950`, `5bf3b02`, `60b3d92`, `f81cdb5`, `4d24229`; core remediation `b1fff1a`; integration commits `ef72cd5`, `5b8d48f`, `4a128b7`; snapshot remediation `ed96ad6`
- [x] Canonical reviews: `reviews/part-1-tasks-1-through-5-*.md` and `reviews/part-2-tasks-6-through-8-*.md`
- [x] Verification: npm `11.15.0`; 27 upgrade tests; 49 router/pack tests; 41 documentation/skill tests; 830 full tests; skill-reference, public-snapshot, release, and whitespace checks

## Scope

- [x] Goal delivered: `md2vid upgrade` safely updates a verified global npm installation to `md2vid@latest`, launches the newly installed absolute CLI to refresh the Claude skill, and reports synchronized or recoverable partial state.
- [x] Tasks completed: 8/8
- [x] Group lifecycles completed: `upgrade-core` and `upgrade-integration` each completed Mode A, parallel spec/code-quality/tester review, Mode B remediation, and one nested read-only verifier.
- [x] Deviations: rejected globally linked package entries before mutation and re-resolved the global package after npm replacement; added focused remediation commits instead of rewriting planned commits; invoked public snapshot generation with its required `--output` argument because the plan's bare command fails closed.

## Review

- [x] Implementation matches the design and plan.
- [x] No planned tasks are missing.
- [x] The router remains dispatch-only; `scripts/install_skill.ts` remains the sole skill-copy implementation.
- [x] No unsupported package manager, privilege escalation, rollback, release-channel, background-update, or user-controlled package-spec scope was added.
- [x] Tests and isolated manual checks passed without executing a real global upgrade.
- [x] No generated `dist/` content is tracked.
- [x] No placeholders or unfinished work remain.

## Decisions

- [x] Reject a symlinked `<global-root>/md2vid` entry before mutation because it can expose a local development checkout through `npm link`, which is outside the supported published global npm distribution.
- [x] Preserve the lexical global package entry and resolve it again after npm installation so metadata and `install-skill` run from the newly installed package rather than a stale pre-upgrade realpath.
- [x] Cover both thrown spawn failures and `spawnSync` results containing `child.error` for root lookup, npm installation, and skill refresh.
- [x] Preserve the eight required commit subjects and ordering; append focused remediation commits rather than amend or rebase repository-authored history.
- [x] Regenerate `public-snapshot.json` through `corepack npm run public:snapshot -- --output <exclusive /private/tmp directory> --ref HEAD`, then verify a second candidate is byte-identical.

## Risks / Follow-ups

- [x] A real registry-backed global upgrade was intentionally not executed because it would mutate the active global npm installation and Claude skill; injected orchestration tests and isolated packed-artifact checks are authoritative.
- [x] Package replacement behavior is simulated in temporary fixtures rather than exercised against the user's live npm prefix.
- [x] Release verification reported existing dependency audit warnings; this feature did not add or change dependencies.
- [x] No feature follow-up is required for the approved scope.

## Final Verification

- [x] `corepack npm --version` → `11.15.0`
- [x] `node --test test/cli/upgrade.test.ts` → 27 passed, 0 failed
- [x] `node --test test/cli/router.test.ts test/cli/pack.test.ts` → 49 passed, 0 failed
- [x] `node --test test/cli/package-meta.test.ts test/cli/skill-commands.test.ts` → 41 passed, 0 failed
- [x] `corepack npm run check:skill-references` → exit 0
- [x] `corepack npm run public:snapshot:check` → exit 0
- [x] `corepack npm run check` → 830 passed, 0 failed
- [x] `corepack npm run release:check` → exit 0
- [x] `git diff --check main...HEAD` → no output
- [x] `git diff --check` → no output
