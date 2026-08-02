import React, { createContext, useContext } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { PlanFrame, RemotionVisualBinding } from "./types";
import { secToFrames } from "./primitives";

type VisualBeatContextValue = {
  frame: PlanFrame;
  bindings: readonly RemotionVisualBinding[];
};

const VisualBeatContext = createContext<VisualBeatContextValue | null>(null);

const entrances = ["fade", "rise", "slide-left", "scale", "none"] as const;
type Entrance = (typeof entrances)[number];

const isEntrance = (value: unknown): value is Entrance =>
  typeof value === "string" && (entrances as readonly string[]).includes(value);

export interface VisualBeatBindingResolution {
  beat: NonNullable<PlanFrame["visualBeats"]>[number];
  binding: RemotionVisualBinding;
  startFrame: number;
  durationFrames: number;
}

export function resolveVisualBeatBinding({
  frame,
  bindings,
  target,
  fps,
  registryFrameSlug,
}: {
  frame: PlanFrame;
  bindings: readonly RemotionVisualBinding[];
  target: string;
  fps: number;
  registryFrameSlug?: string;
}): VisualBeatBindingResolution {
  if (registryFrameSlug !== undefined && registryFrameSlug !== frame.slug) {
    throw new Error(`registry frame ${registryFrameSlug} does not match ${frame.slug}`);
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`visual beat FPS must be a finite positive number (got ${fps})`);
  }

  const matches = bindings.filter((binding) => binding.target === target);
  if (matches.length !== 1) {
    throw new Error(`expected one visual binding for ${target}, found ${matches.length}`);
  }

  const binding = matches[0];
  if (!isEntrance(binding.enter)) {
    throw new Error(`unsupported visual entrance ${String(binding.enter)}`);
  }
  if (!Number.isFinite(binding.duration) || binding.duration < 0) {
    throw new Error(`visual binding duration must be a non-negative finite duration for ${target}`);
  }

  const beat = frame.visualBeats?.find((candidate) => candidate.id === binding.beat);
  if (!beat) {
    throw new Error(`unknown visual beat ${binding.beat} for ${target}`);
  }

  return {
    beat,
    binding,
    startFrame: secToFrames(beat.start, fps),
    durationFrames: secToFrames(binding.duration, fps),
  };
}

export const VisualBeatProvider: React.FC<VisualBeatContextValue & { children: React.ReactNode }> = ({
  frame,
  bindings,
  children,
}) => (
  <VisualBeatContext.Provider value={{ frame, bindings }}>
    {children}
  </VisualBeatContext.Provider>
);

export function useVisualBeatBinding(target: string): VisualBeatBindingResolution {
  const value = useContext(VisualBeatContext);
  const { fps } = useVideoConfig();
  if (!value) throw new Error("VisualBeatProvider is missing");
  return resolveVisualBeatBinding({ ...value, target, fps });
}

export function useVisualBeatProgress(target: string): number {
  const current = useCurrentFrame();
  const { startFrame, durationFrames } = useVisualBeatBinding(target);
  return interpolate(
    current,
    [startFrame, startFrame + Math.max(1, durationFrames)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
}

function getRevealStyle(enter: Entrance, progress: number, visible: boolean): React.CSSProperties {
  switch (enter) {
    case "rise":
      return { opacity: progress, transform: `translateY(${(1 - progress) * 18}px)` };
    case "slide-left":
      return { opacity: progress, transform: `translateX(${(1 - progress) * 24}px)` };
    case "scale":
      return { opacity: progress, transform: `scale(${0.92 + progress * 0.08})` };
    case "none":
      return { opacity: visible ? 1 : 0 };
    case "fade":
      return { opacity: progress };
  }
}

export const BeatReveal: React.FC<{ target: string; children: React.ReactNode }> = ({ target, children }) => {
  const { binding, startFrame } = useVisualBeatBinding(target);
  const current = useCurrentFrame();
  const progress = useVisualBeatProgress(target);
  return <div style={getRevealStyle(binding.enter, progress, current >= startFrame)}>{children}</div>;
};
