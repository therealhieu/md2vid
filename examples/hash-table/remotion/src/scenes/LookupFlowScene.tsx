import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import {
  Background,
  Headline,
  Kicker,
  StrokeLine,
  activeCueIndex,
  progressAt,
  reveal,
} from "../primitives";
import { THEME } from "../theme";

const STATIONS = [
  { step: "01 · key", term: '"apple"', sub: null as string | null },
  { step: "02 · hash", term: "hash(k)", sub: "→ a number" },
  { step: "03 · index", term: "mod size", sub: "→ bucket" },
  { step: "04 · value", term: "read it", sub: null },
] as const;
const CUES = [2.4, 4.8, 7.5, 12.1];

export const LookupFlowScene: React.FC<{ opacity: number }> = ({ opacity }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const header = reveal(f, fps, 0, 0.5, 20);
  const tSec = f / fps;
  const live = activeCueIndex(tSec, CUES);

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
        <Kicker text="HOW A LOOKUP WORKS" />
        <Headline>Four steps</Headline>
      </div>

      <div
        style={{
          position: "absolute",
          left: 150,
          top: 420,
          width: 1620,
          display: "flex",
          alignItems: "center",
        }}
      >
        {STATIONS.map((s, i) => {
          const r = reveal(f, fps, CUES[i], 0.4, 18);
          const isLive = live === i;
          const connProgress =
            i === 0 ? 0 : progressAt(f, fps, CUES[i] - 0.2, 0.4);
          return (
            <React.Fragment key={s.step}>
              {i > 0 && (
                <div style={{ flex: "1 1 auto", height: 40, display: "flex", alignItems: "center" }}>
                  <StrokeLine progress={connProgress} width={120} />
                </div>
              )}
              <div
                style={{
                  width: 320,
                  height: 180,
                  flex: "0 0 auto",
                  background: THEME.tile,
                  border: isLive ? `2px solid ${THEME.coral}` : `1px solid ${THEME.border}`,
                  borderRadius: 12,
                  boxShadow: "0 1px 3px rgba(20,20,19,0.08), 0 4px 16px rgba(20,20,19,0.04)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 20px",
                  textAlign: "center",
                  opacity: r.opacity,
                  transform: `translateY(${r.y}px)`,
                }}
              >
                <div
                  style={{
                    fontFamily: THEME.monoFont,
                    fontSize: 20,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: THEME.stone,
                    marginBottom: 14,
                  }}
                >
                  {s.step}
                </div>
                <div style={{ fontFamily: THEME.monoFont, fontSize: 30, color: THEME.ink }}>{s.term}</div>
                {s.sub && (
                  <div style={{ fontFamily: THEME.bodyFont, fontSize: 20, color: THEME.muted, marginTop: 10 }}>
                    {s.sub}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </Background>
  );
};
