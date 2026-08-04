# Canonical Review Artifact

- Review scope: Part 3, Tasks 8-11
- Reviewer role: code-quality-reviewer
- Working directory: `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync`
- Scope mode: `dirty-baseline`
- Scope origin: `09f6efdee9ca7a4067bd641491d0ecc6ff49759b`; baseline `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-baselines.wb96rv/part-3-tasks-8-through-11`
- Task-scope patch: `/var/folders/g6/8qxn2g4x7md0kvdv4k5l7h340000gn/T//superpowers-current.LlQjbX/task-scope.patch`
- Created: 2026-08-02
- Tester dispatched: yes

---

## Findings

### CQ-001 — Must fix — Adapter context is discarded, so CLI verification skips semantic checks

- **Evidence:**
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/scripts/verify.ts:181-192` passes a complete `AdapterVerifyContext`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/index.ts:24-29` downcasts that object to the legacy string overload:
    ```ts
    verify(context, sharedDir, options) {
      if (typeof context === "string") return verify(context, sharedDir, options);
      return verify(context.videoDir, context.sharedDir, {
        voiceSnapshots: context.voiceSnapshots,
      });
    }
    ```
  - The plan-aware branch in `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/verify.ts:88-99` only runs when the object context reaches it.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/__tests__/verify.test.ts:172-188` calls the exported verifier directly, bypassing adapter dispatch.
- **Why it is wrong:**
  - `md2vid verify` can succeed despite a missing manifest, unknown beat, early/front-loaded reveal, missing beat coverage, or duration mismatch.
  - The release-path CLI does not run the common semantic verifier even though direct verifier tests pass.
- **Guidance:**
  - Preserve object contexts:
    ```ts
    verify(context, sharedDir, options) {
      if (typeof context === "string") return verify(context, sharedDir, options);
      return verify(context);
    }
    ```
  - Apply the same context-preserving rule to every adapter implementation.
  - Test the CLI → adapter → verifier path, not only direct verifier calls.
- **Success checklist:**
  - [ ] CLI verification reaches `verifyVisualSync()` when planned beats exist.
  - [ ] Missing, early, unknown, and duration-mismatched HyperFrames manifests fail through `scripts/verify.run()`.
  - [ ] Legacy string-overload behavior remains unchanged.
  - [ ] Tests cover adapter dispatch rather than only direct verifier calls.
  - [ ] Adapter dispatch preserves plan, policy, FPS, bindings, and voice snapshots.

### CQ-002 — Must fix — Generated timing scripts are vulnerable to `</script>` injection

- **Evidence:**
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/engine/visual_beats.ts:100-105` permits any non-empty beat ID.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:325-343` embeds values with raw `JSON.stringify()` inside executable script content:
    ```ts
    var FRAME_BEATS = ${JSON.stringify({ [frame.slug]: beats })};
    var FRAME_BINDINGS = ${JSON.stringify({ [frame.slug]: declarations })};
    ```
  - The same file uses raw `JSON.stringify()` for generated selectors and frame slugs at `:34-54` and `:393-395`.
  - Declarative element IDs are only checked for non-emptiness at `:194-196`; unlike custom targets, they are not restricted to a safe ID-selector grammar.
  - `JSON.stringify()` does not HTML-escape `<`, so a beat or declarative ID containing `</script><script>...</script>` terminates the generated script and creates a new executable block.
- **Why it is wrong:**
  - Authored HTML and beat metadata are project inputs. A crafted or malformed ID can alter emitted execution and run arbitrary script when the composition is opened or rendered.
  - Generated JSON/script boundaries are unsafe even if the JSON value itself is valid.
- **Guidance:**
  - Use a script-context serializer for every generated JSON and JavaScript string:
    ```ts
    function serializeScriptData(value: unknown): string {
      return JSON.stringify(value)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026")
        .replace(/ /g, "\\u2028")
        .replace(/ /g, "\\u2029");
    }
    ```
  - Use it for `FRAME_BEATS`, `FRAME_BINDINGS`, generated target selectors, and frame IDs.
  - Restrict declarative IDs to the same safe grammar as custom target IDs, or reject IDs that cannot safely form an ID selector.
- **Success checklist:**
  - [ ] A beat ID containing `</script><script>...` cannot terminate a generated timing script.
  - [ ] Unsafe declarative element IDs are rejected.
  - [ ] All generated JSON embedded in executable scripts uses the safe serializer.
  - [ ] Browser parsing produces exactly the intended generated scripts and no injected executable payload.
  - [ ] Ordinary Unicode, quotes, backslashes, and ampersands continue to round-trip correctly.

### CQ-003 — Must fix — Custom binding duration evidence can disagree with runtime behavior

- **Evidence:**
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:283-289` records declaration duration as manifest evidence:
    ```ts
    revealDuration: declaration.duration,
    ```
  - The `set` helper at `:379-383` does not consume that duration:
    ```ts
    set: function (timeline, beatId, target, vars) {
      var beat = requireBeat(slug, beatId);
      requireBinding(slug, beatId, target, "set");
      timeline.set(target, vars, beat.start);
      return timeline;
    }
    ```
  - The `from` and `fromTo` helpers at `:366-367` and `:374-375` validate with `Number(vars.duration || 0)`, coercing omitted, `NaN`, or other falsey values to zero.
- **Why it is wrong:**
  - A `set` declaration with `duration: 0.7` reports a 0.7-second reveal even though the runtime operation is instantaneous.
  - A zero-duration `from` or `fromTo` declaration can accept a call with no verified numeric duration while passing the original unverified variables to the timeline.
  - Landing and duration checks can therefore operate on evidence that differs from actual scheduling.
- **Guidance:**
  - For `from` and `fromTo`, require an explicit finite numeric duration and compare it before scheduling.
  - Do not use `|| 0` when validating duration.
  - For `set`, require exactly `duration: 0` and emit `revealDuration: 0`.
  - Preserve the validated duration in the object passed to the timeline.
- **Success checklist:**
  - [ ] `from` rejects missing, non-numeric, and non-finite durations.
  - [ ] `fromTo` applies the same validation to `toVars.duration`.
  - [ ] `set` rejects nonzero declaration duration or normalizes it to zero by contract.
  - [ ] Manifest `revealDuration` matches actual runtime scheduling.
  - [ ] Landing and duration diagnostics use corrected evidence.
  - [ ] Runtime duration checks remain exact at 24, 30, and 60 FPS.

### CQ-004 — Must fix — Duplicate DOM IDs are not rejected despite the unique-ID contract

- **Evidence:**
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:80-87` stores IDs in a `Map`, overwriting an earlier element with the same ID:
    ```ts
    if (id !== undefined && id.length > 0) ids.set(id, tag);
    ```
  - Declarative validation at `:194-196` checks only that an ID is present:
    ```ts
    if (id === undefined || id.length === 0 || !ids.has(id)) {
      return fail(..., "requires a unique non-empty id");
    }
    ```
  - Custom declarations use the same presence-only validation at `:159-161`.
  - Binding-level duplicate detection at `:226-237` catches repeated manifest targets, not multiple DOM elements sharing a target ID.
- **Why it is wrong:**
  - Two elements with the same ID can pass preparation and produce one manifest binding.
  - The generated `#id` selector is ambiguous and can animate the wrong element or multiple elements.
  - This violates the declared unique-target contract and weakens deterministic seek behavior.
- **Guidance:**
  - Track an ID count or all tag locations instead of retaining only the last map entry.
  - Require exactly one matching DOM ID for both declarative and custom bindings.
  - Keep duplicate-DOM-ID validation separate from duplicate-binding-target validation.
- **Success checklist:**
  - [ ] Required mode rejects duplicate IDs.
  - [ ] Warn mode leaves source untouched and reports the problem as a warning.
  - [ ] Declarative and custom targets both require exactly one matching element.
  - [ ] Duplicate target-binding checks remain independent of duplicate DOM-ID checks.
  - [ ] Regression coverage proves that duplicate DOM IDs cannot produce a manifest.

### CQ-005 — Must fix — Custom declarations are counted as bindings without proving helper invocation

- **Evidence:**
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/frameworks/hyperframes/visual_timing.ts:283-291` converts every custom declaration into manifest evidence before confirming that the helper schedules it.
  - The runtime validates declarations only if authored code calls the helper at `:351-369`.
  - Finalization at `:301-304` only receives declarative statements, and `buildTimelineFinalizer()` returns no script when there are no declarative statements at `:390-391`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/visual/fixtures/visual-timing-sync/authored.html:5-9` declares custom `execute` and `settle` bindings, but the authored code at `:11-48` never calls `window.__md2vidTiming.forFrame(...).from(...)`.
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/visual/composed-visual-integrity.test.ts:510-516` derives a passing manifest from those declarations.
- **Why it is wrong:**
  - A custom-only declaration can pass semantic coverage while no custom reveal is ever scheduled.
  - The current seek fixture can pass with custom targets permanently hidden because it compares seek-path equivalence rather than expected visibility at beat boundaries.
  - Manifest evidence is declarative, not observed/consumed runtime evidence.
- **Guidance:**
  - Track declaration usage in the generated runtime.
  - Mark a declaration used only after matching validation and successful timeline scheduling.
  - Always inject a post-authored finalizer when custom declarations exist.
  - Fail when any declared custom binding is unused.
  - Update the fixture so every custom declaration is consumed through the owned helper.
- **Success checklist:**
  - [ ] Custom-only declarations receive a post-authored usage assertion.
  - [ ] Wrong beat, target, method, or duration helper calls fail.
  - [ ] An unused declaration fails before the build is accepted.
  - [ ] The manifest contains only validated, consumed custom bindings.
  - [ ] The seek fixture visibly reveals all planned targets.
  - [ ] Direct, sequential, and reverse seeks are compared after actual helper scheduling.

### CQ-006 — Nice to have — Seek determinism coverage uses a mock timeline instead of GSAP

- **Evidence:**
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/visual/fixtures/visual-timing-sync/authored.html:14-33` implements a mock timeline whose `seek()` manually toggles `dataset.state`.
  - The fixture replaces GSAP at `:35`:
    ```ts
    window.gsap = { timeline() { return timeline; } };
    ```
  - `/Users/hieunguyen/git/hieu/projects/md2vid-public/.claude/worktrees/fix-visual-timing-sync/test/visual/composed-visual-integrity.test.ts:529-549` checks the mock timeline, and `:551-577` drives the mock player.
- **Why it is wrong:**
  - The test proves deterministic behavior of the mock state machine, not real GSAP behavior.
  - It does not exercise actual paused GSAP initialization, `from()` immediate rendering, `set()`, reverse seeks, or real timeline registration.
- **Guidance:**
  - Retain the fast mock test, but add a browser integration path with the pinned local GSAP runtime and real HyperFrames timeline/player setup.
- **Success checklist:**
  - [ ] Real pinned GSAP loads without a network dependency.
  - [ ] The actual registered GSAP timeline is paused.
  - [ ] Declarative and custom bindings schedule on the real timeline.
  - [ ] Direct, sequential, and reverse seeks match at 24, 30, and 60 FPS.
  - [ ] The test detects initialization and `from()` immediate-render regressions.

## Consolidated post-implementation checklist

- [ ] Preserve full `AdapterVerifyContext` through adapter dispatch.
- [ ] Exercise semantic verification through the CLI path, not only direct verifier calls.
- [ ] Escape all JSON and strings embedded in generated executable scripts.
- [ ] Reject unsafe declarative IDs and duplicate DOM IDs.
- [ ] Align custom `from`, `fromTo`, and `set` declaration duration, runtime behavior, and manifest evidence.
- [ ] Detect declared custom bindings that the owned helper never consumes.
- [ ] Ensure the seek fixture schedules and reveals every declared target.
- [ ] Add real-GSAP browser coverage alongside the deterministic mock coverage.

## Verification gaps and residual risk

- The current custom-binding fixture proves neither that custom helper calls occur nor that declared custom targets become visible at their beats.
- The current browser determinism test uses a mock GSAP/player implementation, so real GSAP initialization and seek behavior remain unverified.
- Even after usage tracking, arbitrary authored GSAP code can still animate a target outside the declared binding contract. The design intentionally avoids parsing arbitrary authored JavaScript; composed visual review remains necessary.
- Always-replaced manifest promotion prevents stale build outputs, but an output-local manifest can still be manually altered after emission unless verification also establishes artifact provenance or rebuilds it before verification.
