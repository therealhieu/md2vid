import React from "react";
import {
  Background,
  Headline,
  Kicker,
  StrokeLine,
} from "../primitives";
import { THEME } from "../theme";
import { useVisualBeatProgress } from "../VisualBeats";

const STATIONS = [
  { step: "01 · key", term: '"apple"', sub: null as string | null },
  { step: "02 · hash", term: "hash(k)", sub: "→ a number" },
  { step: "03 · index", term: "mod size", sub: "→ bucket" },
  { step: "04 · value", term: "read it", sub: null },
] as const;

export const LookupFlowScene: React.FC<{ opacity: number }> = ({ opacity }) => {
  const probe = useVisualBeatProgress("LookupFlow:probe");
  const match = useVisualBeatProgress("LookupFlow:match");
  const returnValue = useVisualBeatProgress("LookupFlow:return");
  const stationProgress = [probe, probe, match, returnValue];
  const live = returnValue > 0 ? 3 : match > 0 ? 2 : probe > 0 ? 0 : -1;

  return (
    <Background opacity={opacity}>
      <div
        style={{
          position: "absolute",
          left: 150,
          top: 84,
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
        {STATIONS.map((station, index) => {
          const progress = stationProgress[index];
          const isLive = live === index;
          return (
            <React.Fragment key={station.step}>
              {index > 0 && (
                <div style={{ flex: "1 1 auto", height: 40, display: "flex", alignItems: "center" }}>
                  <StrokeLine progress={stationProgress[index]} width={120} />
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
                  opacity: progress,
                  transform: `translateY(${(1 - progress) * 18}px)`,
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
                  {station.step}
                </div>
                <div style={{ fontFamily: THEME.monoFont, fontSize: 30, color: THEME.ink }}>{station.term}</div>
                {station.sub && (
                  <div style={{ fontFamily: THEME.bodyFont, fontSize: 20, color: THEME.muted, marginTop: 10 }}>
                    {station.sub}
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
