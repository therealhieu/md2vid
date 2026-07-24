import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Background, Headline, Kicker, reveal, secToFrames } from "../primitives";
import { THEME } from "../theme";

export const LoadFactorScene: React.FC<{ opacity: number }> = ({ opacity }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const header = reveal(f, fps, 0, 0.5, 20);

  const ruleOp = interpolate(f, [secToFrames(0.5, fps), secToFrames(1.0, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ruleScale = interpolate(f, [secToFrames(0.5, fps), secToFrames(1.0, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const unitOp = interpolate(f, [secToFrames(3.1, fps), secToFrames(3.5, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Figure turns coral @11.5, back to ink @13.6
  const figureColor = interpolate(f, [secToFrames(11.5, fps), secToFrames(12.0, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const figureBack = interpolate(f, [secToFrames(13.6, fps), secToFrames(14.1, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const figureCss = Math.max(0, figureColor - figureBack) > 0.01 ? THEME.coral : THEME.ink;

  const cardOp = interpolate(f, [secToFrames(13.6, fps), secToFrames(14.1, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const cardX = interpolate(f, [secToFrames(13.6, fps), secToFrames(14.1, fps)], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
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
        <Kicker text="LOAD FACTOR" />
        <Headline>
          <span style={{ fontFamily: THEME.monoFont, fontSize: 72, letterSpacing: "0.02em" }}>
            entries ÷ buckets
          </span>
        </Headline>
      </div>

      <div style={{ position: "absolute", left: 200, top: 360 }}>
        <div
          style={{
            fontFamily: THEME.displayFont,
            fontSize: 300,
            lineHeight: 0.9,
            color: figureCss,
            letterSpacing: "-0.03em",
          }}
        >
          0.75
        </div>
        <div
          style={{
            width: 420,
            height: 2,
            background: THEME.ink,
            opacity: ruleOp,
            transform: `scaleX(${ruleScale})`,
            transformOrigin: "left center",
            marginTop: 8,
          }}
        />
        <div
          style={{
            fontFamily: THEME.monoFont,
            fontSize: 22,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: THEME.stone,
            marginTop: 16,
            opacity: unitOp,
          }}
        >
          Resize threshold
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 900,
          top: 480,
          width: 760,
          padding: "36px 40px",
          background: THEME.tile,
          border: `1px solid ${THEME.border}`,
          borderRadius: 12,
          opacity: cardOp,
          transform: `translateX(${cardX}px)`,
        }}
      >
        <div style={{ color: THEME.coral, fontFamily: THEME.monoFont, fontSize: 36, marginBottom: 12 }}>→</div>
        <div style={{ fontFamily: THEME.displayFont, fontSize: 40, color: THEME.ink, lineHeight: 1.2 }}>
          Allocate a bigger array, rehash every entry
        </div>
        <div style={{ fontFamily: THEME.bodyFont, fontSize: 24, color: THEME.muted, marginTop: 16, lineHeight: 1.4 }}>
          Collisions rise as the ratio climbs toward one
        </div>
      </div>
    </Background>
  );
};
