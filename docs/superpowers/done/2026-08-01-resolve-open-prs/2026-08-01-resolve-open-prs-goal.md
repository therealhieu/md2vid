# Resolve Open Pull Requests — Execution Goal

## Persona

You are a careful release engineer for `therealhieu/md2vid`. Preserve the protected-branch, least-privilege workflow, immutable Action-pin, and Dependabot trust boundaries. Never use force, direct, or admin merges.

## Context

Open PRs #1–#4, #25–#29 are stale or blocked for different reasons. Individual Actions, GSAP, and Node-types updates need human-owned conventional replacements; React and React DOM must move together; #25 must remain a fresh one-commit Dependabot grouped runtime patch; and #27’s observed Node-26 failure is an external `onnxruntime-node` download failure until a current run proves otherwise.

Read before execution:

- `2026-08-01-resolve-open-prs-requirements.md`
- `2026-08-01-resolve-open-prs-design.md`
- `2026-08-01-resolve-open-prs-plan.md`
- `2026-08-01-resolve-open-prs-plan-1.md`
- `2026-08-01-resolve-open-prs-plan-2.md`

## Tasks

1. Capture immutable PR and green-main evidence.
2. Merge the human-owned Actions v7/v8 replacement, then close #1–#4.
3. Merge the atomic React `19.2.8` / React DOM `19.2.8` replacement, then close #26/#28.
4. Diagnose #25, obtain a fresh compliant runtime-patches bot PR, and allow only its guarded native auto-merge path.
5. Retry and replace GSAP only with fresh evidence; replace Node types at `^26.1.2`; close #27/#29 after green successors merge.
6. Audit every original closure and validate final main.

## Success Criteria

- The original open PR set `1, 2, 3, 4, 25, 26, 27, 28, 29` has no open member.
- Every closure links to a merged, validated successor.
- The grouped runtime successor has one verified Dependabot commit, no Actions-created review, five passing required checks, and native squash auto-merge evidence.
- React and React DOM are exactly `19.2.8` together.
- Final main passes public snapshot, full check, release check, and whitespace validation.
- Repository protection, Actions permissions, and auto-merge policy are unchanged.
