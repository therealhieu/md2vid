import React from "react";
import { Composition } from "remotion";
import type { CalculateMetadataFunction } from "remotion";
import { Video } from "./Video";
import type { BuildPlan } from "./types";

export const FPS = 30;

type Props = { plan: BuildPlan };

// Data-driven metadata: read the plan (passed as inputProps) and set duration/canvas
// from the neutral IR so nothing is hardcoded (design B3).
const calculateMetadata: CalculateMetadataFunction<Props> = ({ props }) => {
  const { plan } = props;
  return {
    durationInFrames: Math.max(1, Math.ceil(plan.totalDuration * FPS)),
    width: plan.canvas.width,
    height: plan.canvas.height,
    fps: FPS,
  };
};

export const RemotionRoot: React.FC = () => {
  // defaultProps.plan is a placeholder; the real plan arrives as inputProps at render.
  const empty: BuildPlan = {
    version: 1, canvas: { width: 1920, height: 1080 },
    timing: { tail: 0.5, xfade: 0.5, gap: 0.5 }, totalDuration: 1, frames: [], captionGroups: [],
  };
  return (
    <Composition
      id="video"
      component={Video}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={FPS}
      defaultProps={{ plan: empty }}
      calculateMetadata={calculateMetadata}
    />
  );
};
