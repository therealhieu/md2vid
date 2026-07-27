import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Background, Coral, Headline, Kicker, Sub, reveal } from "../primitives";
import { THEME } from "../theme";

const AGENDA = [
  { num: "01", label: "Core idea", at: 9.8 },
  { num: "02", label: "Lookup", at: 12.1 },
  { num: "03", label: "Collisions", at: 14.6 },
  { num: "04", label: "Load factor", at: 16.9 },
] as const;

export const CoverScene: React.FC<{ opacity: number }> = ({ opacity }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const kicker = reveal(f, fps, 0, 0.4, 0);
  const title = reveal(f, fps, 0, 0.5, 24);
  const sub = reveal(f, fps, 3.9, 0.5, 16);

  return (
    <Background opacity={opacity}>
      <AbsoluteFill style={{ left: 150, top: 300, right: 150, bottom: THEME.capBandHeight + 40 }}>
        <div style={{ opacity: kicker.opacity, transform: `translateY(${kicker.y}px)` }}>
          <Kicker text="DATA STRUCTURES" />
        </div>
        <div style={{ opacity: title.opacity, transform: `translateY(${title.y}px)` }}>
          <Headline fontSize={150}>
            <Coral>Hash</Coral> table
          </Headline>
        </div>
        <Sub opacity={sub.opacity} y={sub.y}>
          Maps keys to values for fast lookup — the structure behind dictionaries, database indexes, and caches.
        </Sub>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 150, top: 660, display: "flex", gap: 20 }}>
        {AGENDA.map((item, i) => {
          // Clamp late cues into shorter plan frameDur (~13.8s) so chips still land.
          const at = Math.min(item.at, 11.5 + i * 0.45);
          const r = reveal(f, fps, at, 0.4, 16);
          return (
            <div
              key={item.num}
              style={{
                fontFamily: THEME.monoFont,
                fontSize: 24,
                fontWeight: 500,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: THEME.ink,
                padding: "18px 26px",
                background: THEME.tile,
                border: `1px solid ${THEME.border}`,
                borderRadius: 8,
                opacity: r.opacity,
                transform: `translateY(${r.y}px)`,
              }}
            >
              <span style={{ color: THEME.stone, marginRight: 12 }}>{item.num}</span>
              {item.label}
            </div>
          );
        })}
      </div>
    </Background>
  );
};
