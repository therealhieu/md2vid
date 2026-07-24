import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Background, Headline, Kicker, reveal, secToFrames } from "../primitives";
import { THEME } from "../theme";

const ROWS = [
  { num: "01", label: "HASH → BUCKET", gloss: null as string | null, at: 0.1 },
  { num: "02", label: "HANDLE COLLISIONS", gloss: "chaining / open addressing", at: 3.4 },
  { num: "03", label: "WATCH THE LOAD FACTOR", gloss: "resize keeps you fast", at: 7.1 },
] as const;

export const RecapScene: React.FC<{ opacity: number }> = ({ opacity }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const header = reveal(f, fps, 0, 0.4, -8);
  const pull = reveal(f, fps, 11.0, 0.6, 18);

  const numColor = (i: number): string => {
    const starts = [0.1, 3.4, 7.1];
    const ends = [3.4, 7.1, 11.0];
    const a = secToFrames(starts[i], fps);
    const b = secToFrames(ends[i], fps);
    if (f < a) return THEME.ink;
    if (f >= b) return THEME.ink;
    return THEME.coral;
  };

  const fastColor = interpolate(f, [secToFrames(11.0, fps), secToFrames(11.5, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
        <Kicker text="RECAP" />
        <Headline>The recap</Headline>
      </div>

      <div style={{ position: "absolute", left: 200, top: 320, width: 1400 }}>
        {ROWS.map((row, i) => {
          const r = reveal(f, fps, row.at, 0.5, 16);
          return (
            <div
              key={row.num}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 36,
                marginBottom: 36,
                opacity: r.opacity,
                transform: `translateY(${r.y}px)`,
              }}
            >
              <span
                style={{
                  fontFamily: THEME.monoFont,
                  fontSize: 36,
                  fontWeight: 500,
                  color: numColor(i),
                  minWidth: 64,
                }}
              >
                {row.num}
              </span>
              <div>
                <div
                  style={{
                    fontFamily: THEME.monoFont,
                    fontSize: 32,
                    letterSpacing: "0.08em",
                    color: THEME.ink,
                  }}
                >
                  {row.label}
                </div>
                {row.gloss && (
                  <div
                    style={{
                      fontFamily: THEME.bodyFont,
                      fontSize: 24,
                      color: THEME.muted,
                      marginTop: 8,
                    }}
                  >
                    {row.gloss}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          left: 200,
          top: 720,
          width: 1500,
          fontFamily: THEME.displayFont,
          fontSize: 48,
          color: THEME.ink,
          opacity: pull.opacity,
          transform: `translateY(${pull.y}px)`,
        }}
      >
        Stay{" "}
        <span style={{ color: fastColor > 0.5 ? THEME.coral : THEME.ink }}>fast</span>
        {" — or quietly degrade to a linear scan."}
      </div>
    </Background>
  );
};
