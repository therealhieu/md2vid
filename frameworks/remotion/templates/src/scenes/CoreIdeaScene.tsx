import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Background, Coral, DownArrow, Headline, Kicker, reveal, secToFrames } from "../primitives";
import { THEME } from "../theme";

export const CoreIdeaScene: React.FC<{ opacity: number }> = ({ opacity }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const header = reveal(f, fps, 0, 0.5, 20);
  const list = reveal(f, fps, 0, 0.5, 0);
  const hash = reveal(f, fps, 2.8, 0.45, 18);
  const arrowProgress = interpolate(f, [secToFrames(7.9, fps), secToFrames(8.6, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const headOpacity = interpolate(f, [secToFrames(8.5, fps), secToFrames(8.8, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bucketOp = interpolate(f, [secToFrames(8.7, fps), secToFrames(9.15, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.56, 0.64, 1),
  });
  const bucketScale = interpolate(f, [secToFrames(8.7, fps), secToFrames(9.15, fps)], [0.96, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.56, 0.64, 1),
  });
  const note = reveal(f, fps, 10.9, 0.5, 16);
  const arrowVisible = f >= secToFrames(7.9, fps) ? 1 : 0;

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
        <Kicker text="THE CORE IDEA" />
        <Headline>Jump, don't scan</Headline>
      </div>

      <div style={{ position: "absolute", left: 200, top: 360, width: 360, opacity: list.opacity }}>
        <div
          style={{
            fontFamily: THEME.monoFont,
            fontSize: 22,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: THEME.stone,
            marginBottom: 18,
          }}
        >
          Scan · slow
        </div>
        {["item 0", "item 1", "item 2", "item 3"].map((label) => (
          <div
            key={label}
            style={{
              height: 66,
              display: "flex",
              alignItems: "center",
              padding: "0 22px",
              fontFamily: THEME.monoFont,
              fontSize: 26,
              color: THEME.muted,
              background: THEME.tile,
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              marginBottom: 10,
            }}
          >
            {label}
          </div>
        ))}
      </div>

      <div style={{ position: "absolute", left: 760, top: 400, width: 900 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "22px 34px",
            fontFamily: THEME.monoFont,
            fontSize: 34,
            color: THEME.cream,
            background: THEME.navy,
            borderRadius: 8,
            opacity: hash.opacity,
            transform: `translateY(${hash.y}px)`,
          }}
        >
          <span style={{ color: THEME.teal }}>hash</span>(key)&nbsp;→&nbsp;index
        </div>
        <div style={{ marginTop: 8, marginLeft: 60, opacity: arrowVisible }}>
          <DownArrow progress={arrowProgress} headOpacity={headOpacity} />
        </div>
        <div
          style={{
            marginTop: 8,
            display: "inline-flex",
            alignItems: "center",
            padding: "26px 40px",
            fontFamily: THEME.monoFont,
            fontSize: 30,
            color: THEME.ink,
            background: THEME.tile,
            border: `2px solid ${THEME.coral}`,
            borderRadius: 8,
            opacity: bucketOp,
            transform: `scale(${bucketScale})`,
          }}
        >
          value • found
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 200,
          top: 860,
          width: 1500,
          fontFamily: THEME.displayFont,
          fontSize: 40,
          color: THEME.muted,
          opacity: note.opacity,
          transform: `translateY(${note.y}px)`,
        }}
      >
        Look up, insert, delete — <Coral>roughly constant time</Coral> on average.
      </div>
    </Background>
  );
};
