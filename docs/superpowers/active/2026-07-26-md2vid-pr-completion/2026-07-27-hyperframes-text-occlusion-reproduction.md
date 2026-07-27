# HyperFrames 0.7.26 Text-Occlusion Reproduction

## Status

Local upstream reproduction preserved on 2026-07-27. It has not been published or submitted externally.

- Package: `hyperframes@0.7.26`
- Installed implementation: `/tmp/md2vid-pr12-install.jErkeL/node_modules/hyperframes/dist/commands/layout-audit.browser.js:656-668`
- Affected diagnostic: `text_occluded`
- Current primitive: `document.elementFromPoint()`
- Required primitive: `document.elementsFromPoint()`

## Failure

A transparent full-canvas overlay is the first hit at a covered text point. `occluderAt()` rejects that transparent element and returns `null` without inspecting the opaque marker painted immediately below it. The marker therefore covers the title while the audit reports no occlusion.

```text
paint stack at sampled title point

transparent full-canvas overlay  ← elementFromPoint() stops here
opaque marker                    ← actual occluder is never examined
title text                       ← victim
background
```

## Minimal reproduction

Save the following as `repro.html` and open it in a browser:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>HyperFrames transparent overlay occlusion reproduction</title>
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
      }

      .stage {
        position: relative;
        width: 640px;
        height: 360px;
        background: #f6f0e5;
      }

      #victim {
        position: absolute;
        left: 180px;
        top: 130px;
        margin: 0;
        color: #171613;
        font: 700 52px/1 sans-serif;
      }

      #marker {
        position: absolute;
        left: 290px;
        top: 120px;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: #cc785c;
      }

      #transparent-overlay {
        position: absolute;
        inset: 0;
        background: transparent;
      }
    </style>
  </head>
  <body>
    <main class="stage">
      <h1 id="victim">Covered title</h1>
      <div id="marker" aria-hidden="true"></div>
      <div id="transparent-overlay" aria-hidden="true"></div>
    </main>
    <script>
      const victim = document.querySelector("#victim");
      const rect = victim.getBoundingClientRect();
      const x = rect.left + rect.width * 0.55;
      const y = rect.top + rect.height * 0.5;

      console.log("top hit", document.elementFromPoint(x, y)?.id);
      console.log(
        "paint stack",
        document.elementsFromPoint(x, y).map((element) => element.id || element.tagName),
      );
    </script>
  </body>
</html>
```

Expected browser evidence:

```text
top hit: transparent-overlay
paint stack: transparent-overlay, marker, victim, ...
```

Expected HyperFrames 0.7.26 result: no `text_occluded` diagnostic because the transparent first hit is rejected and the scan stops.

Correct result: `text_occluded`, with `#victim` as the victim and `#marker` as the occluder.

## Required algorithm

```js
function occluderAt(element, x, y) {
  if (typeof document.elementsFromPoint !== "function") return null;

  for (const hit of document.elementsFromPoint(x, y)) {
    if (!isForeignElement(element, hit)) break;
    if (sharedPreserve3d(element, hit)) continue;
    if (!isOpaqueOccluder(hit)) continue;
    if (isCrossSceneTransitionOverlap(element, hit)) continue;
    return hit;
  }

  return null;
}
```

The victim or its descendant terminates the search. Transparent and otherwise non-painting foreign layers are skipped rather than treated as proof that no deeper occluder exists.

## Upstream regression assertions

| Case | Paint stack above victim | Expected result |
| --- | --- | --- |
| Transparent overlay only | transparent overlay | No occlusion |
| Opaque overlay | opaque overlay | `text_occluded`; overlay identified |
| Transparent overlay plus opaque marker | transparent overlay → marker | `text_occluded`; marker identified |
| Victim descendant | descendant of victim | No foreign occlusion |
| `pointer-events:none` overlay plus marker | marker | `text_occluded`; marker identified |

## md2vid mitigation

Keep the md2vid outer caption host at `pointer-events:none` even after HyperFrames adopts the paint-stack traversal. This removes a non-interactive transparent scene from hit testing and provides defense in depth; it does not replace the upstream correction.
