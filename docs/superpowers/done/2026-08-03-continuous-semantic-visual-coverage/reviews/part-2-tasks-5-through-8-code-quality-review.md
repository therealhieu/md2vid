# Canonical Review Artifact

- Review scope: Part 2, Tasks 5-8
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `f68de8253a2877cfb568a6fd87d8055e0d7e65d0`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines/continuous-visual-coverage/part-2-tasks-5-through-8`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.part2.zLxvN1/task-scope.patch`
- Created: 2026-08-03
- Tester dispatched: yes

---

# Code Quality Review — Part 2 Tasks 5–8

## Must fix

### CQ-001 — Required v2 coverage accepts a v1 manifest without evaluating coverage

**Evidence**

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_sync.ts:211-220` evaluates continuous coverage only when the manifest is v2:

```ts
if (coverageEnabled && manifest.version === 2) {
  appendCoverageFindings(/* … */);
}
```

A present v1 manifest bypasses the missing-manifest branch at `:49-55`, then skips coverage evaluation entirely. Therefore:

```text
v2 plan + coverageMode=required + mode=off + v1 manifest
→ no reveal checks
→ no coverage checks
→ verification succeeds
```

This violates the strict-v2 coverage contract: v1 reveal evidence cannot prove focal interval coverage.

**Guidance**

When a plan has narrated `visualSpecVersion: 2` frames and coverage is enabled:

- require manifest v2 before accepting any coverage result;
- emit a coverage-level finding when v1 evidence is supplied;
- do not let v1 bindings contribute to or suppress interval findings;
- preserve v1 compatibility only for v1 plans / compatibility coverage mode.

**Success checklist**

- [ ] A v2 narrated plan with `coverageMode: "required"` and an empty v1 manifest fails, including when `mode: "off"`.
- [ ] The same case under `coverageMode: "warn"` emits a warning and cannot claim verified coverage.
- [ ] Existing v1 reveal-only verification remains compatible.

---

### CQ-002 — Remotion captions-only can recreate an unbound runtime plan while retaining semantic evidence

**Evidence**

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/emit.ts:79-85` writes a fresh neutral plan when the previous output plan is absent:

```ts
const captionsOnlyPlan: EmittedRemotionPlan = existingOutputPlan === undefined
  ? { ...plan, captionGroups: groups }
  : { ...existingOutputPlan, captionGroups: groups };
writeFileSync(join(outputDir, "build_plan.json"), /* … */);
```

The fallback has no generated `visualBindings`. Meanwhile, captions-only promotion deliberately preserves `build/visual_bindings.json` in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/build.ts:164-210`.

A stale-but-digest-matching v2 manifest can therefore remain after `build_plan.json` is deleted, then captions-only rebuild recreates a plan with no emitted semantic runtime bindings:

```text
full build → manifest exists
          → output build_plan.json deleted
captions-only → new plan without visualBindings
              → old manifest preserved
verify → digest freshness can pass despite missing runtime scheduling
```

This conflicts with the lifecycle rule that captions-only operations cannot create or bless semantic evidence.

**Guidance**

For Remotion captions-only emission:

- require an existing full-build `build_plan.json` that contains the retained semantic runtime payload before writing a captions-only replacement; or
- fail captions-only with an explicit full-build recovery command when semantic evidence exists but its runtime plan is absent/incomplete.

Also make strict verification reject a manifest whose required generated runtime binding payload is absent.

**Success checklist**

- [ ] Deleting Remotion `build_plan.json` after a full semantic build causes `--captions-only` to fail or leaves no verifiable semantic state.
- [ ] Captions-only preserves existing `visualBindings` byte-for-byte when the full output plan exists.
- [ ] Verification cannot pass required coverage from a preserved manifest when the emitted runtime plan lacks its semantic bindings.

---

### CQ-003 — Half-frame epsilon suppresses real gaps for valid low thresholds

**Evidence**

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_sync.ts:78` uses half a frame as arithmetic epsilon:

```ts
const coverageEpsilon = 0.5 / input.fps;
```

`subtractCoverage()` then removes every gap no larger than that epsilon:

```ts
return gaps.filter((gap) => gap.end > gap.start + epsilon);
```

At 30 FPS, epsilon is about `0.016667s`. A configured `maxUncoveredGap: 0` or `0.010` allows an actual `0.010–0.016667s` gap because it is deleted before policy evaluation, despite the policy requiring every gap longer than the configured maximum to fail.

A half-frame is a quantization tolerance, not merely floating-point arithmetic noise.

**Guidance**

Use a scale-aware floating-point epsilon only to normalize numerically equivalent endpoints. Do not discard a measurable uncovered interval before comparing it with `maxUncoveredGap`.

If framework quantization needs a bounded tolerance, represent that as an explicit, documented policy adjustment rather than silently widening every configured threshold.

**Success checklist**

- [ ] At 30 FPS, a `0.001s` gap fails when `maxUncoveredGap` is `0`.
- [ ] A `0.015s` gap fails when `maxUncoveredGap` is `0.010`.
- [ ] Numerically equivalent boundaries, such as `0.1 + 0.2` and `0.3`, still merge without a false gap.
- [ ] The existing exact-`maxUncoveredGap` boundary remains inclusive.

---

### CQ-004 — Remotion freshness collection silently omits symlinked source and includes excluded source subtrees

**Evidence**

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/index.ts:17-39` recurses only directories and collects only regular files:

```ts
if (entry.isDirectory()) {
  paths.push(...collectRemotionSourcePaths(videoDir, path));
} else if (entry.isFile() && SOURCE_EXTENSIONS.has(/* … */)) {
  paths.push(path);
}
```

A symlinked `.ts`/`.tsx` file beneath `src/` is neither a directory nor a regular file according to `Dirent`; it is silently omitted. Runtime imports can still resolve that source, so changing its target after build does not alter `authoredInputs` and does not invalidate evidence.

The same walker also includes `src/node_modules`, `src/build`, and `src/dist` if present, contrary to the defined source set excluding dependencies and generated output. Those files can create false stale-evidence failures.

`visual_bindings.json` is read directly at `:33-38`, so a symlink at that path is followed rather than rejected or explicitly contained.

**Guidance**

Make authored-input enumeration boundary-safe and exact:

```text
src/
  ├─ authored *.ts|*.tsx|*.js|*.jsx → hash
  ├─ node_modules/, build/, dist/    → exclude
  └─ symlink                          → reject with an actionable error
```

Use `lstat` for the registry and every walked entry. Reject symbolic links rather than silently skipping or following them, unless a separately designed, root-contained symlink policy is introduced.

**Success checklist**

- [ ] A symlinked `src/*.tsx` source causes build/verify to fail with a symlink-boundary diagnostic.
- [ ] A symlinked `visual_bindings.json` is rejected.
- [ ] `src/node_modules`, `src/build`, and `src/dist` do not enter `authoredInputs`.
- [ ] Adding, removing, or changing an eligible regular source file changes the exact source set deterministically.

## Nice to have

### CQ-005 — Manifest validation is not exact for duration records and accepts inherited fields

**Evidence**

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_evidence.ts:203-217` validates known duration properties but never calls `ensureOnlyFields()`. A v2 manifest therefore accepts unsupported fields inside `frames[]`.

Also, `isRecord()` at `:43-45` accepts any non-array object, and validators access required properties directly. A caller can supply inherited `version`, digest, or binding properties through a custom prototype. This does not arise from normal `JSON.parse`, but `validateVisualBindingManifest()` is exported and advertised as the structural boundary.

`MANIFEST_V1_FIELDS` at `:19` is declared but unused.

**Guidance**

For v2 manifest records:

- require every required property to be an own property;
- reject inherited fields and non-plain objects;
- apply exact-field validation to `frames[]` records as well as bindings and input digests;
- keep v1 unknown-field compatibility only if that is intentional and documented; otherwise remove the unused v1 field-set constant or apply it deliberately.

**Success checklist**

- [ ] A v2 duration record with an unknown key is rejected.
- [ ] A custom-prototype manifest or binding cannot satisfy required fields through inheritance.
- [ ] JSON-parsed valid v1 and v2 manifests retain their intended compatibility behavior.

---

### CQ-006 — Remotion atomic-promotion tests do not cover the final managed voice-directory promotion

**Evidence**

`/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/workflows.test.ts:1318-1333` tests six Remotion promotion failure positions:

```ts
const promotionCount = framework === "hyperframes" ? 8 : 6;
```

A full Remotion build manages:

```text
4 neutral artifacts
→ build_plan.json
→ build/visual_bindings.json
→ public/assets/voice directory
```

The final voice-directory promotion is not injected as a failure. The Remotion fixture also does not seed or assert old manifest bytes at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/cli/workflows.test.ts:1022-1025`.

**Guidance**

Seed a prior Remotion manifest, include it in managed-output assertions, and exercise every promotion position, including failure after manifest promotion and during voice-directory promotion.

**Success checklist**

- [ ] Remotion rollback is tested for all managed promotion positions.
- [ ] A failure after manifest promotion restores the prior manifest and every neutral/output artifact.
- [ ] A successful full build proves replacement of the prior Remotion manifest.

## Consolidated checklist

- [ ] CQ-001: Reject v1 manifests for v2 required-coverage verification.
- [ ] CQ-002: Prevent captions-only Remotion output from pairing preserved evidence with missing semantic runtime bindings.
- [ ] CQ-003: Keep policy comparison independent from half-frame epsilon suppression.
- [ ] CQ-004: Reject symlinked Remotion visibility inputs and exclude generated/dependency subtrees from the source set.
- [ ] CQ-005: Tighten v2 manifest object-shape and own-property validation.
- [ ] CQ-006: Complete Remotion transactional-promotion regression coverage.

## Residual risks

- Semantic coverage remains a declared-contract check; it cannot establish that a focal state genuinely explains the narration. The required manual semantic review remains necessary.
- Framework adapters currently need their later v2 emission work to use the same hardened source-set rules; otherwise the freshness API added here can be bypassed by adapter-specific enumeration differences.
- The reported Mode A gate and typechecks were not independently rerun during this read-only review.
