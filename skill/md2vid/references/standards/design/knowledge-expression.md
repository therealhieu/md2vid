# HyperFrames Frame Knowledge Contract

How a piece of **source knowledge becomes a frame**. `frame.md` owns the visual atoms and the
treatment catalog (what a frame *looks like*); this contract owns the decision *which* treatment a
concept earns and *how* its diagrams, tables, and images are expressed. Read `frame.md` first.

The rule of thumb: **classify the knowledge, then pick the mapped treatment.** Strong defaults with
an escape hatch — use the mapped treatment unless you can name why the content needs another; if you
invent a treatment, add it to `frame.md` so the catalog grows instead of drifting.

## 1. Knowledge → treatment decision map

Classify each unit of source content by *what kind of knowledge it is*, then author the mapped
treatment from `frame.md`.

| Source knowledge | Knowledge type | Treatment | Focal recipe |
|---|---|---|---|
| Title, thesis, big idea | Definition / Thesis | **Cover** | Oversized EB Garamond hero line; one word coral; a metaphor may animate behind it. Never a bullet. |
| A single mechanic or relationship | Concept / Explanation | **Structure** (or a calm **Enumerate**) | A literal small diagram or physical demo (tokens + arrow + target). Not prose. |
| A code snippet, query, or command | Code / Query | **Code Surface** | Warm-navy card, mono, syntax coral/teal/amber; code writes on line-by-line; the one coral moment lands *outside* the syntax (a tag/link/highlight). |
| A diagram, tree, schema, mind-map | Structure / Diagram | **Structure** | Redraw from theme atoms (hairline node cards / tokens / hub); assemble ink first, then one coral trace animates the traversal. |
| A comparison or trade-off | Comparison / Trade-off | **Contrast** | Two mirrored panels / two paths / verdict rows; fill in matched pairs on cue; coral marks one side at a time; a coral stamp/rule resolves. |
| A table or matrix | Table / Matrix | **Matrix** | Redraw rows dim, spotlight one on each spoken cue with a traveling coral bar/wash/arrow; verdict lands last. |
| A multi-step process or pipeline | Process / Sequence | **Flow** | An oversized world a single camera pans/steps across; station cards + drawn connectors reveal on cue; decision points are coral diamonds. |
| A list, checklist, or set of items | List / Checklist | **Enumerate** | Cards/rows accumulate one-per-cue into a grid or rail; one coral item live at a time, handed down the list. |
| A stat, metric, count, or delta | Metric / Impact | **Number/Impact** | EB Garamond figure + mono unit over a 1px rule. Figure serif, unit always mono. |
| A pull-quote, takeaway, payoff line | Quote / Takeaway | **Pull-quote** (or **Closing**) | Hero serif line, coral on the single operative word; held still. |
| The sign-off / CTA / credits | Closer | **Closing/CTA** | Short serif sign-off + the one coral-callout; optional contributor row. |

When one unit carries two kinds of knowledge (e.g. a query *and* the checklist for reading its
plan), pair a **primary treatment** with a supporting rail — Code Surface at ~60% + an Enumerate
rail at ~40% is the proven pairing.

## 2. Diagram, table & image expression rules (load-bearing)

1. **Redraw, never paste.** Every source diagram, Mermaid chart, tree, sequence, mind-map, table,
   or image is rebuilt from theme atoms (hairline node cards, tokens, hub nodes, grid rows). No raster
   images, no pasted Mermaid, no screenshots, no browser chrome in a content frame. If a source image
   can't be redrawn, replace it with an equivalent themed illustration.
2. **Cream for structure, navy only for data payloads.** Diagram scaffolding (nodes, edges, panels)
   sits on cream/tile with hairline borders. The warm-navy surface is reserved for actual code or
   data content (SQL, leaf pointers, inverted-index rows, tuple ledgers). Syntax uses the fixed
   decoration palette (coral keyword / teal `#5DB8A6` string / amber `#E8A55A` number) — never the
   brand trinity.
3. **One focal; assemble before the coral trace.** Build the whole structure in ink/tile first (the
   full tree, the empty slots, the dim rows), *then* exactly one coral element animates the "read
   this" motion — a descent trace, a bypass arc, a slash, a branch pulse, a spotlight. Coral never
   sets the whole diagram; it is the single moving pointer.
4. **Mono for everything indexical.** Node labels, column headers, step numbers, tuple values,
   doc-ids, filenames, kickers — all JetBrains Mono. Serif (EB Garamond) is reserved for the headline
   and any pull-quote/verdict line. No serif labels, no sans headlines.
5. **Tables are spotlight-revealed, never dumped.** Rows are pre-placed but dim, arrive staggered,
   then light one at a time on the spoken cue. A cold dump at t=0 reads as a slideshow — a banned
   failure mode. Green/red verdicts are permitted as fixed decoration alongside the single traveling
   coral spotlight.
6. **Connectors are measured stroke-draws.** Every arrow, edge, link hairline, tick, and bounding
   box is a real `getTotalLength()` dash-offset draw-on, firing on the cue that introduces the
   relationship — not up front.

## 3. The expression triad (visual · narration · caption)

Every frame carries the **same beat across all three channels at the same timestamp**:

- The **focal** on screen is what the narration is describing *right now*.
- Each diagram node, table row, list card, and code line reveals on its **VO cue** — one spoken
  sentence, one visual reveal.
- The **caption** shows the words being spoken, chunked into readable lines (see the caption standard
  in `../video-generation.md`) so the reader's eye tracks the voice, not a lagging or racing
  subtitle.

The 3-scene spine is universal: anchor the headline + focal by t≤0.5s (Scene 1), reveal beat-by-beat
on VO cues (Scene 2), land and hold (Scene 3).

## 4. Escape hatch

If a unit of knowledge genuinely fits no row in §1, do not force it into the nearest treatment.
Name the new knowledge type and the treatment it needs, author it against the atoms in `frame.md`,
and add both the row here and the treatment there. The map is meant to grow with the work — an
unmapped concept is a gap in the standard, not a reason to break the visual language.
