import React from "react";
import { AbsoluteFill, Sequence, staticFile, useVideoConfig, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import type { BuildPlan, PlanFrame } from "./types";
import { THEME } from "./theme";
import { Captions } from "./Captions";
import { sceneOpacity, secToFrames } from "./primitives";
// Ensure fonts load for the whole composition tree.
import "./fonts";

import { CoverScene } from "./scenes/CoverScene";
import { CoreIdeaScene } from "./scenes/CoreIdeaScene";
import { LookupFlowScene } from "./scenes/LookupFlowScene";
import { CollisionsScene } from "./scenes/CollisionsScene";
import { LoadFactorScene } from "./scenes/LoadFactorScene";
import { WhyMattersScene } from "./scenes/WhyMattersScene";
import { RecapScene } from "./scenes/RecapScene";

const humanize = (slug: string) =>
  slug.replace(/^\d+[-_]?/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

type SceneProps = { opacity: number };

const TitleCard: React.FC<SceneProps & { frame: PlanFrame }> = ({ opacity, frame }) => (
  <AbsoluteFill style={{ backgroundColor: THEME.cream, opacity }}>
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 120 }}>
      <div
        style={{
          fontFamily: THEME.displayFont,
          color: THEME.ink,
          fontSize: 96,
          fontWeight: 600,
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        {humanize(frame.slug)}
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);

const SCENES: Record<string, React.FC<SceneProps>> = {
  "01-cover": CoverScene,
  "02-core-idea": CoreIdeaScene,
  "03-lookup-flow": LookupFlowScene,
  "04-collisions": CollisionsScene,
  "05-load-factor": LoadFactorScene,
  "06-why-matters": WhyMattersScene,
  "07-recap": RecapScene,
};

// durationInFrames must be passed in — useVideoConfig().durationInFrames is the
// full composition length, not the Sequence length.
const SceneRouter: React.FC<{ frame: PlanFrame; xfade: number; durationInFrames: number }> = ({
  frame,
  xfade,
  durationInFrames,
}) => {
  const { fps } = useVideoConfig();
  const f = useCurrentFrame(); // frame-local inside Sequence
  const xf = Math.max(1, secToFrames(xfade, fps));
  const opacity = sceneOpacity(f, durationInFrames, xf);
  const Comp = SCENES[frame.slug];
  if (Comp) return <Comp opacity={opacity} />;
  return <TitleCard opacity={opacity} frame={frame} />;
};

export const Video: React.FC<{ plan: BuildPlan }> = ({ plan }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: THEME.cream }}>
      {plan.frames.map((frame) => {
        const dur = secToFrames(frame.frameDur, fps);
        return (
          <Sequence key={frame.id} from={secToFrames(frame.start, fps)} durationInFrames={dur} name={frame.slug}>
            <SceneRouter frame={frame} xfade={plan.timing.xfade} durationInFrames={dur} />
            <Audio src={staticFile(frame.voicePath)} />
          </Sequence>
        );
      })}
      <Captions plan={plan} />
    </AbsoluteFill>
  );
};
