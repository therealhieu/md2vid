// theme.ts — warm-editorial palette (docs/standards/design/product.md + frame.md).
import { FONT_BODY, FONT_DISPLAY, FONT_MONO } from "./fonts";

export const THEME = {
  ink: "#141413",
  cream: "#FAF9F5",
  tile: "#EFE9DE",
  tileStrong: "#F3ECE0",
  coral: "#CC785C",
  muted: "#55514A",
  stone: "#8A857C",
  teal: "#5DB8A6",
  navy: "#181715",
  border: "rgba(20,20,19,0.12)",
  displayFont: `"${FONT_DISPLAY}", Georgia, serif`,
  bodyFont: `"${FONT_BODY}", system-ui, sans-serif`,
  monoFont: `"${FONT_MONO}", ui-monospace, monospace`,
  capBandHeight: 200, // px — reserved caption band (bottom ~14% @1080)
} as const;
