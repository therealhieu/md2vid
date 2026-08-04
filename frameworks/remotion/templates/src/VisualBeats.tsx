import React, { createContext, useContext } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { PlanFrame, ResolvedVisualBeat, RuntimeVisualBinding } from "./types";
import { secToFrames } from "./primitives";

type VisualBeatContextValue = {
  frame: PlanFrame;
  bindings: readonly RuntimeVisualBinding[];
};

const VisualBeatContext = createContext<VisualBeatContextValue | null>(null);

const entrances = ["fade", "rise", "slide-left", "scale", "none"] as const;
type Entrance = (typeof entrances)[number];

const isEntrance = (value: unknown): value is Entrance =>
  typeof value === "string" && (entrances as readonly string[]).includes(value);

const isV2Binding = (binding: RuntimeVisualBinding): binding is Extract<RuntimeVisualBinding, { beatId: string }> =>
  "beatId" in binding;

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

export interface VisualBeatBindingResolution {
  beat: ResolvedVisualBeat;
  binding: RuntimeVisualBinding;
  startFrame: number;
  endFrame: number;
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
  bindings: readonly RuntimeVisualBinding[];
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

  if (isV2Binding(binding)) {
    const startFrame = requireNonNegativeInteger(binding.startFrame, `visual binding startFrame for ${target}`);
    const endFrame = requireNonNegativeInteger(binding.endFrame, `visual binding endFrame for ${target}`);
    const durationFrames = requireNonNegativeInteger(binding.durationFrames, `visual binding durationFrames for ${target}`);
    if (endFrame < startFrame) {
      throw new Error(`visual binding endFrame must be after startFrame for ${target}`);
    }
    if (binding.role !== "focal" && binding.role !== "supporting") {
      throw new Error(`visual binding role must be focal or supporting for ${target}`);
    }
    const beat = frame.visualBeats?.find((candidate) => candidate.id === binding.beatId);
    if (!beat) {
      throw new Error(`unknown visual beat ${binding.beatId} for ${target}`);
    }
    return { beat, binding, startFrame, endFrame, durationFrames };
  }

  if (!Number.isFinite(binding.duration) || binding.duration < 0) {
    throw new Error(`visual binding duration must be a non-negative finite duration for ${target}`);
  }
  const beat = frame.visualBeats?.find((candidate) => candidate.id === binding.beat);
  if (!beat) {
    throw new Error(`unknown visual beat ${binding.beat} for ${target}`);
  }
  const startFrame = secToFrames(beat.start, fps);
  return {
    beat,
    binding,
    startFrame,
    endFrame: beat.version === 2 ? secToFrames(beat.end, fps) : Number.POSITIVE_INFINITY,
    durationFrames: Math.max(1, secToFrames(binding.duration, fps)),
  };
}

export function isVisualBeatActive(
  currentFrame: number,
  target: Pick<VisualBeatBindingResolution, "startFrame" | "endFrame">,
): boolean {
  return currentFrame >= target.startFrame && currentFrame < target.endFrame;
}

export function resolveVisualBeatProgress(
  currentFrame: number,
  startFrame: number,
  durationFrames: number,
): number {
  if (currentFrame < startFrame) return 0;
  return interpolate(
    currentFrame + 1,
    [startFrame, startFrame + Math.max(1, durationFrames)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
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
  return resolveVisualBeatProgress(current, startFrame, durationFrames);
}

export function resolveVisualBeatStyle(enter: Entrance, progress: number, visible: boolean): React.CSSProperties {
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

export const BeatState: React.FC<{ target: string; children: React.ReactNode }> = ({ target, children }) => {
  const resolved = useVisualBeatBinding(target);
  const current = useCurrentFrame();
  if (!isVisualBeatActive(current, resolved)) return null;
  return <>{children}</>;
};

export const BeatReveal: React.FC<{ target: string; children: React.ReactNode }> = ({ target, children }) => {
  const resolved = useVisualBeatBinding(target);
  const current = useCurrentFrame();
  if (!isVisualBeatActive(current, resolved)) return null;
  const progress = resolveVisualBeatProgress(current, resolved.startFrame, resolved.durationFrames);
  return <div style={resolveVisualBeatStyle(resolved.binding.enter, progress, true)}>{children}</div>;
};
