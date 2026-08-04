# Canonical Review Artifact

- Review scope: Part 4, Tasks 12-14
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `ef92f635111a38827fa24dc2a0dcd548dcdfdafb; baseline /var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines.CAUhja/part-4-tasks-12-through-14`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.UauX4k/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

# Canonical CQ Report — Part 4, Tasks 12–14

## Must fix

### CQ-MF-001 — Captions-only builds stage, but never promote, refreshed binding evidence

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/emit.ts:75-98` resolves the current output-local registry against the newly planned beats and writes a staged `build/visual_bindings.json`.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/build.ts:164-205` promotes only `build_plan.json` during `--captions-only`.
- The equivalent full-build branch promotes the manifest at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/build.ts:263-268`.

**Why**

A captions-only rebuild can update resolved cue timestamps while preserving the same authored registry. It promotes the new `build_plan.json` but leaves the prior manifest in the output directory.

```text
captions-only plan → staged build_plan.json          → promoted
                   → staged visual_bindings.json    → discarded
```

Subsequent `md2vid verify` reads the new neutral plan and the stale manifest, producing false timing/duration findings or validating obsolete evidence.

**Guidance**

Promote `adapter.bindingManifestPath` in the captions-only transaction whenever the adapter declares one. Treat it as a managed emitted artifact alongside the caption artifact.

**Checklist**

- [ ] Add the staged binding-manifest path to the captions-only `managedFiles`.
- [ ] Regression-test a captions-only rebuild whose resolved beat time changes; assert both output `build_plan.json` and `build/visual_bindings.json` reflect the new plan.
- [ ] Preserve the existing no-runtime/no-voice-change captions-only guarantees.

---

### CQ-MF-002 — Prototype-like frame slugs silently lose bindings

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/visual_bindings.ts:60,67` initializes `frames` as `{}` and assigns external JSON keys with `frames[frameSlug] = …`.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/visual_bindings.ts:85,94` repeats the pattern for emitted `runtimeBindings`.
- The neutral implementation deliberately supports prototype-like keys with a null-prototype record at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_beats.ts:192`, with coverage at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/__tests__/visual_beats.test.ts:75-85`.

A `__proto__` frame slug reproduces as:

```json
{"own":false,"protoIsArray":true,"encoded":"{}"}
```

**Why**

`frames["__proto__"] = bindings` invokes the inherited prototype setter instead of creating an own property. The parsed registry then loses that frame during enumeration; the emitted runtime registry serializes as `{}`. This breaks a slug category the neutral plan already supports and bypasses expected unknown-frame/coverage behavior.

**Guidance**

Use null-prototype dictionaries for every JSON-keyed output map:

```ts
const frames = Object.create(null) as RemotionBindingSpec["frames"];
const runtimeBindings = Object.create(null) as RemotionBindingSpec["frames"];
```

Retain own-property-based access where maps are inspected.

**Checklist**

- [ ] Replace externally keyed `{}` maps in `visual_bindings.ts` with null-prototype maps.
- [ ] Add parser, resolver, and serialization coverage for `"__proto__"` and `"constructor"` frame slugs.
- [ ] Assert the returned registry has an own `__proto__` property and survives `JSON.stringify`.

---

### CQ-MF-003 — Manifest evidence records unquantized timing, not the runtime reveal timing

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/templates/src/primitives.tsx:6` rounds seconds with `Math.round(seconds * fps)`.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/templates/src/VisualBeats.tsx:64-69,89-97` uses those rounded frames and expands a zero-frame duration to one rendered frame.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/visual_bindings.ts:103-112` writes the unrounded `beat.start` and authored `duration` into the manifest.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_sync.ts:68-80` evaluates timing tolerance and landing against those raw manifest values.

**Why**

The verifier can report perfect timing while the rendered reveal violates a configured zero/narrow tolerance or landing interval.

```text
manifest: start = 9.999s, duration = 0.001s
runtime at 30 FPS:
  startFrame = round(9.999 × 30) = 300  → 10.000s
  durationFrames = max(1, round(.001 × 30)) = 1 → .033s

manifest landing differs from rendered landing by up to a frame
```

The configuration permits zero lead/lag tolerance, so this is externally observable rather than only theoretical.

**Guidance**

Make emitted Remotion evidence describe the effective rendered timing: quantize the reveal start to the adapter FPS and derive duration from `max(1, secToFrames(duration, fps))`. Keep the shared verifier generic by supplying it observed adapter timing, not desired pre-quantization timing. Add boundary tests for both tolerance and landing.

**Checklist**

- [ ] Centralize Remotion frame conversion so template scheduling and emitted evidence use identical rounding semantics.
- [ ] Emit effective reveal start/duration in the Remotion manifest.
- [ ] Test a sub-frame duration at an exact landing boundary.
- [ ] Test a non-frame-aligned cue under zero tolerance.

---

### CQ-MF-004 — `visualSync.mode: "off"` still loads and validates the Remotion registry

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/plan_project.ts:46-50` intentionally omits `visual_beats.json` when mode is `off`.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/emit.ts:75-86` unconditionally reads and resolves `visual_bindings.json`.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/verify.ts:120-126` correctly skips semantic verification when mode is `off`.

**Why**

An output that retains `visual_bindings.json` and switches to `off` creates a plan without visual beats, then fails emission because the still-loaded registry references “unknown beat” entries.

```text
mode off → planner omits visual beats
         → emitter loads existing registry
         → registry beat cannot resolve
         → build fails
```

This contradicts the documented `off` behavior: “Do not load or verify visual beats.”

**Guidance**

Resolve the policy before reading the registry. In `off` mode, do not load or normalize registry data; emit an empty/replaced manifest so prior evidence cannot remain stale. Keep `warn` and `required` behavior unchanged.

**Checklist**

- [ ] Gate registry reading/resolution on `policy.mode !== "off"`.
- [ ] Replace prior manifest content with an empty Remotion manifest in off mode.
- [ ] Add full and captions-only off-mode tests with a pre-existing registry.

## Nice to have

### CQ-NTH-001 — Make registry parsing strict and reject blank identifiers

**Evidence**

- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/visual_bindings.ts:20-45` accepts inherited/extra record fields and treats whitespace-only `beat` or `target` strings as non-empty.
- `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/remotion/visual_bindings.ts:57-77` does not reject unknown root or binding fields.
- The neutral visual-beat parser already uses exact field allowlists and trimmed non-empty strings at `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_beats.ts:37-47,100-108`.

**Why**

Versioned authored JSON should reject unsupported keys rather than silently discard misspelled intent. Blank target names are also unusable but currently validate.

**Guidance**

Add allowlists for the root (`version`, `frames`) and binding (`beat`, `target`, `enter`, `duration`) records, require trimmed identifiers, and use own-property checks for required fields.

**Checklist**

- [ ] Reject unknown root and binding fields.
- [ ] Reject whitespace-only frame, beat, and target identifiers.
- [ ] Add malformed-registry cases without importing or executing authored TSX.

## Consolidated checklist

- [ ] Promote the Remotion binding manifest during captions-only builds.
- [ ] Replace external-key maps with null-prototype dictionaries and test prototype-like slugs.
- [ ] Align manifest evidence with effective frame-quantized runtime timing.
- [ ] Honor `visualSync.mode: "off"` during Remotion emission.
- [ ] Tighten registry schema validation.
- [ ] Run:
  ```bash
  node --test \
    frameworks/remotion/__tests__/visual_beats.test.ts \
    frameworks/remotion/__tests__/scaffold.test.ts \
    frameworks/remotion/__tests__/emit.test.ts \
    frameworks/remotion/__tests__/verify.test.ts \
    test/examples/hash-table-remotion.test.ts
  corepack npm run typecheck:remotion
  corepack npm run typecheck
  git diff --check
  ```

## Residual risk

- Static registry validation deliberately cannot prove that every target string is actually consumed by authored scene TSX. A scene-side target typo remains a render/runtime contract failure because normal verification must not parse arbitrary TSX or invoke Chromium.
- Even after evidence quantization, visual timing has frame-level resolution; configurations narrower than the selected FPS can intentionally surface timing findings rather than represent sub-frame timing exactly.