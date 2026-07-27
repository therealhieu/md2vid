import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Background, Headline, Kicker, reveal, secToFrames } from "../primitives";
import { THEME } from "../theme";

const ROWS = [
  {
    name: "Chaining",
    how: "Each bucket holds a linked list of entries",
    trade: "Simple — but pointer overhead",
    at: 7.9,
  },
  {
    name: "Open addressing",
    how: "Probe the next free slot on collision",
    trade: "Cache-friendly — but it clusters",
    at: 13.4,
  },
] as const;

export const CollisionsScene: React.FC<{ opacity: number }> = ({ opacity }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const header = reveal(f, fps, 0, 0.5, 20);
  const t1 = secToFrames(7.9, fps);
  const t2 = secToFrames(13.4, fps);
  const t2end = secToFrames(13.8, fps);

  const r1Op = interpolate(f, [0, t1, t1 + 12, t2, t2end], [0.32, 0.32, 1, 1, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const r1Live = f >= t1 && f < t2;
  const r2Op = interpolate(f, [0, t2, t2end], [0.32, 0.32, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const r2Live = f >= t2;

  const rowStyle = (live: boolean, op: number): React.CSSProperties => ({
    display: "grid",
    gridTemplateColumns: "280px 1fr 1fr",
    gap: 0,
    borderRadius: 12,
    border: live ? `2px solid ${THEME.coral}` : `1px solid ${THEME.border}`,
    background: live ? THEME.tileStrong : THEME.cream,
    marginBottom: 20,
    opacity: op,
    overflow: "hidden",
  });

  const cell = (label: string | null, text: string, mono = false): React.ReactNode => (
    <div style={{ padding: "28px 32px" }}>
      {label && (
        <div
          style={{
            fontFamily: THEME.monoFont,
            fontSize: 16,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: THEME.stone,
            marginBottom: 10,
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          fontFamily: mono ? THEME.monoFont : THEME.bodyFont,
          fontSize: mono ? 28 : 26,
          color: THEME.ink,
          fontWeight: mono ? 500 : 400,
        }}
      >
        {text}
      </div>
    </div>
  );

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
        <Kicker text="COLLISIONS" />
        <Headline>Two keys, one bucket</Headline>
      </div>

      <div style={{ position: "absolute", left: 150, top: 360, width: 1620 }}>
        {ROWS.map((row, i) => {
          const live = i === 0 ? r1Live : r2Live;
          const op = i === 0 ? r1Op : r2Op;
          return (
            <div key={row.name} style={rowStyle(live, op)}>
              {cell(null, row.name, true)}
              {cell("How it works", row.how)}
              {cell("Trade-off", row.trade)}
            </div>
          );
        })}
      </div>
    </Background>
  );
};
