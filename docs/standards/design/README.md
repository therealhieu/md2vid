# Design Standards

The design standard for videos generated in this repo. Everything here is **normative reference you read** — the copyable artifacts (shell + theme CSS) live in `templates/hyperframes/`.

## Which doc governs what

| Doc | Scale | Governs |
|---|---|---|
| [`product.md`](./product.md) | Product / web | The Claude web design system — palette, typography, components at page scale. The origin of the visual identity. |
| [`frame.md`](./frame.md) | Frame (1920×1080) | The video **visual contract** — cream/ink/coral atoms + the 11 treatments (what a frame looks like). |
| [`knowledge-expression.md`](./knowledge-expression.md) | Frame | The **decision logic** — which treatment a piece of source knowledge earns, the redraw discipline, the expression triad. |
| [`frame-content.md`](./frame-content.md) | Frame | The **shell/content contract** — transparent roots, safe area, track allocation for content frames paired with the shell. |

## Reading order

Authoring a video? Read in this order:

```
video-generation.md   (../video-generation.md — the end-to-end rules)
  → frame.md              what a frame looks like  (atoms + treatments)
  → knowledge-expression  which treatment to pick  (source knowledge → treatment)
  → frame-content.md       how a content frame wires to the shell
```

`product.md` is the upstream identity — read it for palette rationale, not for frame authoring.

## Token source of truth

Token **values** live in the theme CSS, not in prose. When a doc names a hex, it is quoting the canonical source below — never redefining it.

| Layer | Canonical source | Accent |
|---|---|---|
| Frame (video) | [`frame.md`](./frame.md) `colors:` block + `templates/hyperframes/themes/*.css` | coral `#CC785C` |
| Product (web) | [`product.md`](./product.md) | terracotta `#c96442` |

**The two accents are intentional, not a typo.** Frame-scale video uses coral `#CC785C`; product-web uses terracotta `#c96442`. They are different scales of the same warm-editorial identity.
