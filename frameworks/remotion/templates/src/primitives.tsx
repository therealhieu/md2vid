// primitives.tsx — seek-safe presentation helpers. Callers pass motion values from interpolate().
import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { THEME } from "./theme";

export const secToFrames = (s: number, fps: number) => Math.round(s * fps);

/** Triangle opacity: fade in first xfadeFrames, fade out last xfadeFrames. */
export const sceneOpacity = (f: number, durationInFrames: number, xfadeFrames: number): number => {
  const xf = Math.max(1, xfadeFrames);
  const fadeIn = interpolate(f, [0, xf], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(f, [Math.max(0, durationInFrames - xf), durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return Math.min(fadeIn, fadeOut);
};

/** Entrance reveal: opacity 0→1 and y offset→0 starting at `at` seconds. */
export const reveal = (
  f: number,
  fps: number,
  at: number,
  dur = 0.45,
  yFrom = 18,
): { opacity: number; y: number } => {
  const a = secToFrames(at, fps);
  const b = secToFrames(at + dur, fps);
  const t = Math.max(a + 1, b);
  const opacity = interpolate(f, [a, t], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const y = interpolate(f, [a, t], [yFrom, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return { opacity, y };
};

/** Progress 0→1 over [at, at+dur] seconds. */
export const progressAt = (f: number, fps: number, at: number, dur: number): number => {
  const a = secToFrames(at, fps);
  const b = secToFrames(at + dur, fps);
  return interpolate(f, [a, Math.max(a + 1, b)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
};

/** Active index for sequential cues (last cue whose time ≤ t). */
export const activeCueIndex = (tSec: number, cues: number[]): number => {
  let idx = -1;
  for (let i = 0; i < cues.length; i++) if (tSec >= cues[i]) idx = i;
  return idx;
};

export const Background: React.FC<{ opacity?: number; children?: React.ReactNode }> = ({
  opacity = 1,
  children,
}) => (
  <AbsoluteFill style={{ backgroundColor: THEME.cream, opacity }}>{children}</AbsoluteFill>
);

export const Kicker: React.FC<{ text: string; opacity?: number; y?: number }> = ({
  text,
  opacity = 1,
  y = 0,
}) => (
  <div
    style={{
      fontFamily: THEME.monoFont,
      fontSize: 26,
      fontWeight: 500,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: THEME.ink,
      marginBottom: 14,
      display: "flex",
      alignItems: "center",
      opacity,
      transform: `translateY(${y}px)`,
    }}
  >
    <span style={{ color: THEME.coral, marginRight: 12, fontSize: 28, lineHeight: 1 }}>✦</span>
    {text}
  </div>
);

export const Headline: React.FC<{
  children: React.ReactNode;
  opacity?: number;
  y?: number;
  fontSize?: number;
}> = ({ children, opacity = 1, y = 0, fontSize = 96 }) => (
  <div
    style={{
      fontFamily: THEME.displayFont,
      fontWeight: 400,
      fontSize,
      lineHeight: 1.04,
      letterSpacing: "-0.02em",
      color: THEME.ink,
      opacity,
      transform: `translateY(${y}px)`,
    }}
  >
    {children}
  </div>
);

export const Coral: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ color: THEME.coral }}>{children}</span>
);

export const Sub: React.FC<{
  children: React.ReactNode;
  opacity?: number;
  y?: number;
  maxWidth?: number;
  fontSize?: number;
}> = ({ children, opacity = 1, y = 0, maxWidth = 1200, fontSize = 46 }) => (
  <div
    style={{
      fontFamily: THEME.displayFont,
      fontWeight: 400,
      fontSize,
      lineHeight: 1.3,
      color: THEME.muted,
      marginTop: 26,
      maxWidth,
      opacity,
      transform: `translateY(${y}px)`,
    }}
  >
    {children}
  </div>
);

export const Card: React.FC<{
  children: React.ReactNode;
  opacity?: number;
  y?: number;
  x?: number;
  scale?: number;
  borderColor?: string;
  backgroundColor?: string;
  style?: React.CSSProperties;
}> = ({
  children,
  opacity = 1,
  y = 0,
  x = 0,
  scale = 1,
  borderColor = THEME.border,
  backgroundColor = THEME.tile,
  style,
}) => (
  <div
    style={{
      backgroundColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 12,
      boxShadow: "0 1px 3px rgba(20,20,19,0.08), 0 4px 16px rgba(20,20,19,0.04)",
      opacity,
      transform: `translate(${x}px, ${y}px) scale(${scale})`,
      ...style,
    }}
  >
    {children}
  </div>
);

/** Horizontal connector: progress 0→1 draws the line left→right. */
export const StrokeLine: React.FC<{
  progress: number;
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}> = ({ progress, width = 200, height = 40, color = THEME.coral, strokeWidth = 3 }) => {
  const pathLen = 192; // path M4 20 L196 20
  const offset = pathLen * (1 - Math.max(0, Math.min(1, progress)));
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ flex: "1 1 auto" }}>
      <path
        d={`M4 ${height / 2} L${width - 4} ${height / 2}`}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={pathLen}
        strokeDashoffset={offset}
      />
    </svg>
  );
};

/** Vertical down-arrow: progress draws shaft; head fades with progress. */
export const DownArrow: React.FC<{ progress: number; headOpacity: number }> = ({
  progress,
  headOpacity,
}) => {
  const shaftLen = 96;
  const offset = shaftLen * (1 - Math.max(0, Math.min(1, progress)));
  return (
    <svg width={80} height={120} viewBox="0 0 80 120" fill="none">
      <path
        d="M40 4 L40 100"
        stroke={THEME.coral}
        strokeWidth={4}
        strokeDasharray={shaftLen}
        strokeDashoffset={offset}
      />
      <path
        d="M28 88 L40 108 L52 88"
        stroke={THEME.coral}
        strokeWidth={4}
        fill="none"
        opacity={headOpacity}
      />
    </svg>
  );
};
