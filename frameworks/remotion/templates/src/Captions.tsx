import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { BuildPlan, CaptionGroup } from "./types";
import { THEME } from "./theme";

// The active caption group at time t (seconds): the last group whose window contains t.
const activeGroup = (groups: CaptionGroup[], t: number): CaptionGroup | null => {
  let hit: CaptionGroup | null = null;
  for (const g of groups) if (g.start <= t && t <= g.end) hit = g;
  return hit;
};

export const Captions: React.FC<{ plan: BuildPlan }> = ({ plan }) => {
  const { fps } = useVideoConfig();
  const t = useCurrentFrame() / fps; // GLOBAL seconds — caption times are global (plan offsets by frame.start)
  const group = activeGroup(plan.captionGroups, t);
  if (!group) return null;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", pointerEvents: "none" }}>
      <div style={{
        maxWidth: "80%", textAlign: "center", paddingBottom: 64,
        fontFamily: THEME.displayFont, fontSize: 40, lineHeight: 1.3,
        textShadow: `0 1px 2px ${THEME.cream}`, // faint cream halo for legibility over content
      }}>
        {group.words.map((w, i) => {
          const spoken = t >= w.end;
          const active = t >= w.start && t < w.end;
          return (
            <span key={w.id ?? i} style={{
              color: spoken || active ? THEME.ink : `${THEME.ink}66`, // 40% ink for upcoming
              borderBottom: active ? `2px solid ${THEME.coral}` : "2px solid transparent",
              display: "inline-block",
              transform: active ? "scale(1.04)" : "scale(1)",
              margin: "0 6px",
            }}>
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
