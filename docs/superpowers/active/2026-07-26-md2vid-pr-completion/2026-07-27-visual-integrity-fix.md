# Visual Integrity Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Use strict TDD for every product-source behavior change.

**Goal:** Reject and correct visually inconsistent frames, unreadable captions, and decorative elements that occlude text before an md2vid video can be accepted or rendered.

**Architecture:** Apply defense in depth. Correct the two authored DNS frames first, then add md2vid-owned structural and browser validation so the same defects fail automatically. Treat the installed HyperFrames `elementFromPoint()` behavior as an upstream framework defect: mitigate it locally by making the emitted outer caption host non-intercepting, preserve a minimal upstream reproduction, and do not patch generated `node_modules` files as the product fix.

**Tech Stack:** Node.js ESM, TypeScript, Node test runner, md2vid HyperFrames emitter/verifier, HyperFrames `0.7.26`, Puppeteer/Chromium browser checks, HTML/CSS, GSAP, WCAG contrast calculations.

---

## Status and decision

The rendered DNS candidate is **FAIL** for visual integrity. Do not push or synchronize PR #12 from the current render.

Confirmed failures:

| ID | Failure | Evidence |
| --- | --- | --- |
| VIS-1 | Frame 03 switches from the declared parchment system to an undeclared near-black full-canvas dashboard | `STORYBOARD.md:15-16`; `compositions/frames/03-latency.html:8-26` |
| VIS-2 | Frame 03 active/spoken captions use `#141413` over `#1b1a18` (~1.06:1 contrast) and become effectively invisible | `compositions/captions.html:15-27,89-105`; frame 03 ground at `03-latency.html:9` |
| VIS-3 | Frame 05 coral rail markers paint over the words “caches”, “authority”, and “controls” | `compositions/frames/05-recap.html:12-24,36-39` |
| VIS-4 | Browser caption assertions verify class/timing identity but not legibility | `/tmp/verify-dns-browser.mjs:136-139,206-215` |
| VIS-5 | HyperFrames text occlusion examines only `document.elementFromPoint()`; the transparent full-canvas caption host masks the real marker below it | installed `layout-audit.browser.js:656-668` |
| VIS-6 | The earlier manual visual review incorrectly approved the midpoint and transition sheets | `evidence/pr12-20260726T132024Z/07-browser/visual-review.md` |

The rendered MP4 may be retained as failure evidence, but it must not be described as an accepted artifact.

## Root-cause map

```text
Authored frame 03 chooses dark full-canvas ground
                 │
                 ├── contradicts storyboard + frame standard
                 │
                 └── global transparent captions retain dark ink
                                     │
                                     └── active/spoken words disappear

Authored frame 05 places rail + markers inside card title zone
                 │
                 └── later DOM order paints markers over title glyphs
                                     │
                                     └── HyperFrames audit probes top hit only
                                                        │
                                                        └── transparent caption host masks marker
```

## Required outcome

```text
parchment frame system
        +
readable captions at every sampled word state
        +
no opaque decoration over load-bearing text
        +
automated failure before render
        ↓
new packed artifact → fresh isolated DNS build → reviewed preview → approved render
```

## File map

### Product source

| File | Responsibility |
| --- | --- |
| `frameworks/hyperframes/emit.ts` | Emit the main scene hosts and global caption host; make the outer caption host non-intercepting and expose explicit frame-theme metadata if adopted |
| `frameworks/hyperframes/__tests__/emit.test.ts` | Lock caption-host emission and transport behavior |
| `frameworks/hyperframes/verify.ts` | Add md2vid-owned authored-frame/theme checks and invoke visual-contract validation |
| `frameworks/hyperframes/__tests__/verify.test.ts` | TDD coverage for undeclared dark full-canvas grounds and caption/theme conflicts |
| `engine/config.ts` | Validate documented caption-token vocabulary and parseable token values |
| `engine/__tests__/config.test.ts` | TDD coverage for unknown/malformed caption tokens |
| `frameworks/hyperframes/visual_contract.ts` | New focused module for color parsing, luminance, contrast, frame-theme extraction, and deterministic diagnostics |
| `frameworks/hyperframes/__tests__/visual_contract.test.ts` | Unit tests for contrast and theme decisions |
| `test/cli/package-meta.test.ts` | Final-gate contract requiring browser visual assertions in acceptance evidence |
| `test/release/harness.test.ts` | Packed-artifact regression for caption-host behavior if the emitted scaffold is covered here |

### Authored acceptance input

Do **not** rewrite the historical 2026-07-24 FAIL evidence. Prepare a new reviewed input copy for the rerun, preserving provenance and hashes, then modify only these authored frames in that new copy:

| File | Correction |
| --- | --- |
| `compositions/frames/03-latency.html` | Convert the dark dashboard to the shared parchment/ink/tile/coral system |
| `compositions/frames/05-recap.html` | Move the rail/markers out of title text or place them behind non-overlapping card geometry |
| `STORYBOARD.md` | Keep “warm editorial on parchment” as the binding theme; declare all five frames light |

### Browser acceptance tooling

Move the reusable parts of `/tmp/verify-dns-browser.mjs` into a durable repository test/helper rather than relying on an untracked temporary script. The durable check must sample the composed player and emit machine-readable evidence for contrast, theme consistency, and text occlusion.

---

## Task 1: Record the failed render and invalidate the earlier visual approval [Tester: no]

**Files:**
- Modify: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/pr12-20260726T132024Z/07-browser/visual-review.md`
- Create: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/evidence/pr12-20260726T132024Z/09-media-inspection/visual-inspection.md`
- Modify: `docs/superpowers/active/2026-07-26-md2vid-pr-completion/2026-07-26-md2vid-pr-completion-checkpoint.md`

- [x] **Step 1: Replace the preview visual decision with an explicit FAIL addendum**

Record VIS-1, VIS-2, and VIS-3. Preserve the original approval text as historical chronology; do not silently rewrite it as if the error was never made.

- [x] **Step 2: Preserve the rendered MP4 identity as failed evidence**

Record the render path, SHA-256, size, duration, and the exact screenshots showing the two failures. Label the artifact `FAIL — do not publish`.

- [x] **Step 3: Update the active checkpoint**

State that the goal was stopped, the existing render is rejected, PR synchronization is blocked, and a full repack/rerun is required after source changes.

- [x] **Step 4: Run the evidence credential scan**

Use the existing completion-plan credential pattern and require an empty result before preserving the evidence manifest.

- [x] **Step 5: Commit only if separately authorized**

This task changes completion documentation only. Do not infer commit authorization from this plan.

---

## Task 2: Correct Frame 03 to the declared parchment visual system [Tester: yes] `[Group: authored-visuals]`

**Files:**
- Modify in the new reviewed acceptance-input copy: `compositions/frames/03-latency.html`
- Verify against: `STORYBOARD.md:15-16,36-43`
- Verify against: `docs/standards/design/frame.md:97-119,139-147`

- [x] **Step 1: Capture the failing visual baseline**

Save a settled frame-03 screenshot at global `39.259999s` and measure:

```text
full-canvas background: #1b1a18
active/spoken caption foreground: #141413
contrast: approximately 1.06:1
expected result: FAIL
```

- [x] **Step 2: Define the light-frame palette mapping**

Use the existing project colors already present in frames 01, 02, 04, and 05:

```text
ground:       #f6f0e5 or #faf7f0
ink:          #171613
secondary:    #6c675f / #777067
hairline:     #d0c5b4
bar track:    #e9e0d2
bar fill:     #aaa297 or a warm ink/tile step
accent:       #cc785c (one current value only)
```

Do not add a new hue, gradient, glow, pure white, or pure black.

- [x] **Step 3: Implement only the palette correction**

Keep the latency values, geometry, timing, cue alignment, and one-coral-handoff behavior unchanged. Change the full-canvas ground, inherited text, row rules, bar tracks/fills, note, badge, and GSAP color handoffs to light-theme equivalents.

- [x] **Step 4: Run standalone and composed parity checks**

At minimum sample local times:

```text
0.09
4.25
8.69
13.19
17.90
```

Require matching opacity, transform, active value color, bar scale, and final state between standalone and composed forms.

- [ ] **Step 5: Run visual checks**

Require:

```text
frame ground matches declared light theme
active/spoken captions >= 4.5:1
upcoming captions >= 4.5:1 or documented large-text threshold
one coral focal at a time
no content in the reserved caption band
```

- [x] **Step 6: Run the isolated project check**

```bash
npm run build
npm run check
```

Expected: exit `0`, with no visual-contract failure.

---

## Task 3: Correct Frame 05 marker/title occlusion [Tester: yes] `[Group: authored-visuals]` `[S after Task 2]`

**Files:**
- Modify in the new reviewed acceptance-input copy: `compositions/frames/05-recap.html`
- Verify against: `STORYBOARD.md:54-61`

- [x] **Step 1: Capture the failing geometry**

At a settled recap time, record rectangles for:

```text
.f05-station-title
#f05-marker-1
#f05-marker-2
#f05-marker-3
```

Expected failing baseline: each marker intersects its corresponding title rectangle and paints above it.

- [x] **Step 2: Choose one non-overlapping rail composition**

Preferred correction:

```text
cards remain above
rail moves below cards
markers sit on the rail below cards
copy/bridge moves only as needed to preserve the caption-safe band
```

Do not keep the rail running through text-bearing cards. Do not solve this only with `z-index` if the circles remain geometrically behind the text; the final silhouettes must not intersect load-bearing glyphs.

- [x] **Step 3: Implement geometry-only changes**

Keep recap copy, station order, animation cue times, coral handoff, and final callout behavior unchanged.

- [x] **Step 4: Add a deterministic rectangle assertion**

For every visible marker/title pair, require zero intersection area:

```js
function intersectionArea(a, b) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

assert.equal(intersectionArea(markerRect, titleRect), 0);
```

- [x] **Step 5: Check all recap phases**

Sample local times:

```text
1.91
4.19
7.42
13.27
13.66
15.90
```

Require no marker/title collision, one coral focal, no text overflow, and no caption-band collision.

- [x] **Step 6: Run the isolated project check**

```bash
npm run build
npm run check
```

Expected: exit `0` and the browser rectangle assertion passes.

---

## Task 4: Make the emitted outer caption host non-intercepting [Tester: yes]

**Files:**
- Modify: `frameworks/hyperframes/emit.ts:183-215`
- Modify: `frameworks/hyperframes/__tests__/emit.test.ts`
- Modify if expected packed output changes: `test/golden/fixtures/hash-table-example/expected/index.html`
- Test: `test/release/harness.test.ts`

- [x] **Step 1: Write the failing emitter test**

Assert that the generated outer captions scene—not only its mounted inner root—has non-intercepting pointer behavior:

```ts
assert.match(
  html,
  /id="el-captions"[^>]*(?:style="[^"]*pointer-events:\s*none|class="[^"]*caption-host)/,
);
```

Also assert that normal visual frame hosts remain interactive/default and are not globally changed.

- [x] **Step 2: Run the focused test and confirm RED**

Run the repository's focused HyperFrames emitter test command. Expected: failure because `#el-captions.scene` currently has no host-level pointer rule.

- [x] **Step 3: Implement the minimal host rule**

Prefer a dedicated class over an inline style:

```html
<style>
  .scene { position:absolute; inset:0; width:100%; height:100%; }
  .caption-host { pointer-events:none; }
</style>

<div id="el-captions" class="scene caption-host" ...></div>
```

Do not apply `pointer-events:none` to all scenes.

- [x] **Step 4: Run emitter and packed-artifact tests**

Require generated and packed `index.html` to contain the host rule exactly once and preserve caption rendering/timeline mounting.

- [x] **Step 5: Browser-check Studio and render behavior**

Verify:

```text
captions still paint
caption timeline still seeks
caption words retain active/spoken state
caption host is absent from elementFromPoint() hits
visual scene beneath is exposed to hit testing
```

---

## Task 5: Add a visual-contract module for frame theme and caption contrast [Tester: yes]

**Files:**
- Create: `frameworks/hyperframes/visual_contract.ts`
- Create: `frameworks/hyperframes/__tests__/visual_contract.test.ts`
- Modify: `frameworks/hyperframes/verify.ts:41-60`
- Modify: `frameworks/hyperframes/__tests__/verify.test.ts`

- [x] **Step 1: Define deterministic diagnostics**

Use stable error codes:

```text
frame_theme_missing
frame_theme_mismatch
caption_contrast_insufficient
caption_token_unknown
caption_token_invalid_color
```

Each diagnostic must include the frame slug and concrete values; contrast diagnostics also include foreground, background, ratio, and threshold.

- [x] **Step 2: Write failing color and contrast unit tests**

Required cases:

```ts
assert.equal(contrastRatio("#141413", "#FAF9F5") >= 4.5, true);
assert.equal(contrastRatio("#141413", "#1b1a18") >= 4.5, false);
assert.throws(() => parseCssColor("not-a-color"), /invalid color/i);
```

Support the literal hex forms emitted by md2vid. Do not attempt a full CSS parser in this task.

- [x] **Step 3: Write failing frame-theme tests**

Adopt explicit authored metadata:

```html
<div data-composition-id="03-latency" data-frame-theme="light">
```

Test:

```text
light + parchment ground → PASS
light + near-black ground → FAIL frame_theme_mismatch
dark + light caption ink → PASS when mixed themes are explicitly enabled
dark without declared mixed-theme support → FAIL
missing data-frame-theme → FAIL for newly generated projects
```

Backward compatibility must be explicit: legacy projects may warn rather than fail only if a versioned config flag says legacy theme inference is allowed. Do not silently infer all missing declarations forever.

- [x] **Step 4: Implement luminance and contrast calculation**

Use WCAG relative luminance:

```ts
const channel = (value: number) => {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
};

const ratio = (lighter + 0.05) / (darker + 0.05);
```

- [x] **Step 5: Integrate static authored-frame checks into `verify()`**

Enumerate configured `compositions/frames/*.html`, require the explicit theme declaration, extract a supported literal full-canvas ground, and compare it with the project theme contract.

Static parsing is a fast first gate. If the ground is dynamic, image-backed, transparent, or not a supported literal, emit a deterministic message requiring browser visual validation instead of guessing.

- [x] **Step 6: Run focused and full verification tests**

Require all prior verify behavior and direct-verify caption fallback tests to remain green.

---

## Task 6: Tighten caption token configuration [Tester: yes]

**Files:**
- Modify: `engine/config.ts:128-134`
- Modify: `engine/__tests__/config.test.ts`
- Modify: `frameworks/hyperframes/emit.ts:50-63,84-106`
- Modify: `frameworks/hyperframes/__tests__/emit.test.ts`

- [x] **Step 1: Write failing configuration tests**

Allow only the documented token vocabulary:

```text
--cap-ink
--cap-canvas
--cap-accent
--cap-accent-2
--cap-band-top
--cap-band-height
--font-display
--font-body
--ink
--cream
--tile
--tile-strong
--coral
```

Test rejection of:

```json
{"captions":{"tokens":{"--cap-unknown":"red"}}}
```

and malformed color-bearing values:

```json
{"captions":{"tokens":{"--cap-ink":"not-a-color"}}}
```

- [x] **Step 2: Run focused tests and confirm RED**

Expected: current `Record<string,string>` validation accepts both invalid configurations.

- [x] **Step 3: Implement vocabulary and value validation**

Validate color tokens as supported CSS color literals and dimensional tokens as safe CSS lengths. Font tokens remain strings but must reject control characters and markup delimiters.

- [x] **Step 4: Add emission-time baseline contrast assertion**

Before writing `captions.html`, require `--cap-ink` versus `--cap-canvas` to meet the normal-text threshold. This does not replace per-frame browser contrast; it prevents internally invalid skins.

- [x] **Step 5: Run configuration, emitter, golden, and package tests**

Require existing valid overrides and default generated projects to remain unchanged except for intended validation diagnostics.

---

## Task 7: Add composed-browser visual assertions [Tester: yes] `[S after Tasks 4-6]`

**Files:**
- Create a durable browser helper under the repository test structure, following existing CLI/release test conventions
- Modify: `test/cli/package-meta.test.ts`
- Modify acceptance evidence generation to call the durable helper instead of `/tmp/verify-dns-browser.mjs`

- [x] **Step 1: Preserve three failing browser fixtures**

Fixtures must reproduce:

```text
1. dark active caption over dark frame
2. opaque circle covering title through a transparent full-canvas overlay
3. undeclared dark frame in a light project
```

- [x] **Step 2: Write failing assertions for actual composed output**

At representative caption times, collect:

```js
{
  frameSlug,
  globalTime,
  wordId,
  state,
  color,
  sampledBackground,
  contrastRatio,
  rect,
  occluder
}
```

Use `document.elementsFromPoint()` for paint-stack inspection. Skip transparent/non-painting layers; stop at the victim subtree or first opaque foreign painter.

- [x] **Step 3: Enforce contrast thresholds**

Require active and spoken captions to meet `4.5:1`. Treat the captions as normal text unless the computed size/weight independently qualifies for the large-text threshold.

- [x] **Step 4: Enforce text occlusion**

Probe multiple points across each load-bearing text rectangle. Fail if an opaque foreign element covers a material fraction of the glyph-bearing rectangle. Report both victim and occluder selectors.

- [x] **Step 5: Enforce frame-theme consistency**

Compare each mounted frame's declared theme with its computed full-canvas ground at midpoint and transition samples. Fail the light DNS project if any frame resolves to a near-black ground.

- [ ] **Step 6: Verify RED fixtures and GREEN corrected DNS input**

All three bad fixtures must fail for the intended reason. The corrected five-frame DNS project must pass every visual assertion.

- [x] **Step 7: Add final-gate evidence requirements**

`test/cli/package-meta.test.ts` must require machine-readable artifacts such as:

```text
caption-contrast.json
text-occlusion.json
frame-theme.json
```

A summary that checks only timeline identity and class names is insufficient.

---

## Task 8: Preserve an upstream HyperFrames occlusion reproduction [Tester: no]

**Files:**
- Create a minimal reproduction document/fixture in the appropriate external issue or upstream HyperFrames repository; do not patch `node_modules/hyperframes/dist/**` in md2vid
- Reference installed behavior: `hyperframes@0.7.26`, `layout-audit.browser.js:656-668`

- [x] **Step 1: Reduce the failure to three layers**

```html
<div class="transparent-full-canvas-overlay"></div>
<div class="opaque-marker"></div>
<h1>Covered title</h1>
```

Expected current result: `text_occluded` is missed when the transparent overlay is the first `elementFromPoint()` hit.

- [x] **Step 2: Specify the upstream algorithm change**

Use `document.elementsFromPoint()` and continue past transparent/non-painting foreign elements.

- [x] **Step 3: Specify upstream regression assertions**

Require the marker to be identified as the occluder, and include controls for:

```text
transparent overlay only → no occlusion
opaque overlay → occlusion
victim descendant → no foreign occlusion
pointer-events:none overlay → marker still detected
```

- [x] **Step 4: Keep md2vid mitigation even after upstream resolution**

Host-level `pointer-events:none` is valid defense in depth and avoids transparent UI layers interfering with hit testing.

---

## Task 9: Rebuild the candidate and rerun the complete installed-artifact gate [Tester: yes] `[S after Tasks 1-8]`

**Files:**
- Update the existing PR-completion plans/checkpoint with actual rerun results
- Create a new evidence run ID; do not overwrite `pr12-20260726T132024Z`

- [x] **Step 1: Run focused tests for every changed subsystem**

Run config, visual-contract, emitter, verifier, CLI package-meta, release harness, and browser fixture tests. Record exact counts and exit codes.

- [x] **Step 2: Run the complete repository matrix**

Use the existing nine-command matrix. Require every command to exit `0`, with no skipped required tests.

- [x] **Step 3: Freeze a new candidate tree**

The previous tree `be6dd03759bb609408dd5cbfe74bee5c1fda24bd` and tarball SHA-256 `38317cf8e5a8c5d4cee00d71fd9b6f7e530f597d4aa328ebcfb0d1b61aff9106` become historical failed-run identities. Record new tree, validation commit, tarball SHA-256, and SRI.

- [x] **Step 4: Install the exact new tarball outside the repository**

Use pinned Node `v26.4.0` and npm `11.15.0`. Use only the installed CLI realpath; do not import active repository source.

- [x] **Step 5: Create a fresh DNS acceptance project**

Copy the newly reviewed authored inputs only. Generate fresh narration/transcription/build outputs; do not reuse the failed run's generated media or MP4.

- [x] **Step 6: Run all structural and visual checks before render approval**

Required browser result:

```text
console PASS
page errors PASS
network PASS
identity PASS
seek PASS
parity PASS
caption timing/state PASS
caption contrast PASS
text occlusion PASS
frame theme PASS
```

- [x] **Step 7: Build caption-inclusive midpoint and transition contact sheets**

Review all five frames, every transition side, and the final frame. Explicitly inspect Frame 03 caption states and Frame 05 station titles.

- [x] **Step 8: Stop for fresh render approval**

The prior approval does not authorize the corrected candidate render.

- [x] **Step 9: Render, probe, inspect, hash, scan, and clean up**

Follow Task 11 of the PR-completion plan using the new identities and evidence root.

- [x] **Step 10: Record PASS only if no workaround remains**

A manual acknowledgement of known occlusion or unreadable text is not PASS.

---

## Acceptance criteria

- [x] All five DNS frames use the declared warm parchment system unless an explicit, validated mixed-polarity contract is introduced.
- [x] Frame 03 active, spoken, and upcoming captions meet the enforced contrast threshold.
- [x] Frame 05 markers have zero intersection with station-title rectangles at every sampled phase.
- [x] The outer caption host is non-intercepting for hit testing.
- [x] Browser occlusion checks traverse the paint stack past transparent layers.
- [x] Bad contrast, opaque decoration over text, and undeclared palette inversion each have a reproducible failing test.
- [x] The durable final gate emits contrast, occlusion, and frame-theme evidence.
- [x] A new tarball is packed and installed outside the repository.
- [x] A fresh DNS project is built from reviewed inputs without reusing failed generated outputs.
- [x] A new preview receives explicit render approval.
- [x] The new MP4 passes stream, duration, visual, audio, credential, and cleanup gates.
- [x] PR #12 is not pushed or mutated until separate authorization after the new local PASS.

## Implementation order and parallelism

```text
Task 1 (record FAIL)
        │
        ├── Task 2 → Task 3          authored DNS corrections (sequential group)
        ├── Task 4                   caption-host mitigation
        ├── Task 5 → Task 6          visual contract + token validation
        └── Task 8                   upstream reproduction
                 │
                 └── Task 7          composed-browser enforcement
                            │
                            └── Task 9 full repack + isolated rerun
```

Tasks 2/3, 4, 5/6, and 8 can proceed in parallel because they touch separate concerns. Task 7 consumes the contracts and host behavior from Tasks 4–6. Task 9 is strictly last.

## Explicit non-goals

- Do not patch generated `node_modules/hyperframes/dist/**` as the md2vid product fix.
- Do not mutate the historical 2026-07-24 FAIL record into a pass.
- Do not accept manual visual review as a substitute for contrast and occlusion assertions.
- Do not globally switch captions to light text; that would break the four parchment frames.
- Do not solve marker overlap only by hiding it behind text with `z-index`; remove the geometric collision.
- Do not reuse the failed MP4, narration, transcription, generated index, or screenshots for the fresh acceptance run.
- Do not infer render, commit, push, PR-mutation, merge, version, tag, or publish authorization from this plan.

## Self-review

- Spec coverage: VIS-1 through VIS-6 each map to at least one implementation task and acceptance criterion.
- Placeholder scan: every task contains concrete files, commands, expected outcomes, and completion conditions.
- Type/contract consistency: `data-frame-theme`, contrast thresholds, diagnostic codes, and browser evidence filenames are consistent across Tasks 5, 7, and 9.
- Scope: fixes the two authored defects and the validation gaps that let them pass; no unrelated CLI or media feature is added.
