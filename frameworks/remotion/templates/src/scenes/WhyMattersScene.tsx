import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Background, Headline, Kicker, activeCueIndex, reveal } from "../primitives";
import { THEME } from "../theme";

const CARDS = [
  { num: "01", label: "Dictionaries", at: 6.1 },
  { num: "02", label: "Database indexes", at: 8.2 },
  { num: "03", label: "In-memory caches", at: 10.0 },
  { num: "04", label: "Deduplication", at: 11.2 },
] as const;

export const WhyMattersScene: React.FC<{ opacity: number }> = ({ opacity }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const header = reveal(f, fps, 0, 0.5, 20);
  // Clamp last cues into plan frameDur (~11.88s)
  const cues = CARDS.map((c, i) => Math.min(c.at, 6.1 + i * 1.3));
  const live = activeCueIndex(f / fps, cues);

  return (
    <Background opacity={opacity}>
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 84,
          opacity: header.opacity,
          transform: `translateY(${header.y}px)`,
        }}
      >
        <Kicker text="WHY IT MATTERS" />
        <Headline>Constant-time access</Headline>
      </div>

      <div
        style={{
          position: "absolute",
          left: 150,
          top: 360,
          width: 1620,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 28,
        }}
      >
        {CARDS.map((card, i) => {
          const r = reveal(f, fps, cues[i], 0.45, 24);
          const numColor = live === i ? THEME.coral : live > i ? THEME.stone : THEME.coral;
          return (
            <div
              key={card.num}
              style={{
                background: THEME.tile,
                border: `1px solid ${THEME.border}`,
                borderRadius: 12,
                padding: "36px 40px",
                display: "flex",
                alignItems: "center",
                gap: 28,
                opacity: r.opacity,
                transform: `translateY(${r.y}px)`,
              }}
            >
              <span
                style={{
                  fontFamily: THEME.monoFont,
                  fontSize: 28,
                  fontWeight: 500,
                  color: f / fps >= cues[i] ? numColor : THEME.coral,
                  letterSpacing: "0.06em",
                }}
              >
                {card.num}
              </span>
              <span style={{ fontFamily: THEME.displayFont, fontSize: 44, color: THEME.ink }}>
                {card.label}
              </span>
            </div>
          );
        })}
      </div>
    </Background>
  );
};
