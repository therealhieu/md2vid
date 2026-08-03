// types.ts — the BuildPlan shape the composition consumes, structurally identical to
// engine/types.ts (BuildPlan/PlanFrame/CaptionGroup/Word). Kept local because the
// composition is bundled standalone by Remotion; do NOT let it drift from the engine.
export interface Word { id?: string; text: string; start: number; end: number; }

export interface ResolvedVisualBeatV1 {
  version: 1;
  id: string;
  text: string;
  start: number;
  end?: number;
  cueWordIndex: number;
  cueText: string;
  sourceRefs: string[];
  workflowStep?: number;
  tolerance: { maxLead: number; maxLag: number };
}

export interface ResolvedVisualStateV2 {
  version: 2;
  id: string;
  text: string;
  role: "focal" | "supporting";
  start: number;
  end: number;
  cueWordIndex?: number;
  cueText: string;
  sourceRefs: string[];
  workflowStep?: number;
  tolerance: { maxLead: number; maxLag: number };
}

export type ResolvedVisualBeat = ResolvedVisualBeatV1 | ResolvedVisualStateV2;

export interface ResolvedCoverageExemption {
  id: string;
  start: number;
  end: number;
  reason: string;
  approvedBy: string;
}

export interface RemotionVisualBindingV1 {
  beat: string;
  target: string;
  enter: "fade" | "rise" | "slide-left" | "scale" | "none";
  duration: number;
}

export interface RuntimeVisualBindingV2 {
  beatId: string;
  target: string;
  role: "focal" | "supporting";
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  enter: "fade" | "rise" | "slide-left" | "scale" | "none";
}

export type RuntimeVisualBinding = RemotionVisualBindingV1 | RuntimeVisualBindingV2;

export interface PlanFrame {
  id: string; frameNum: number; slug: string;
  voicePath: string; voiceDur: number; frameDur: number; start: number; words: Word[];
  visualSpecVersion?: 1 | 2;
  visualKind?: "focal" | "workflow" | "comparison" | "sequence";
  visualBeats?: ResolvedVisualBeat[];
  visualCoverageExemptions?: ResolvedCoverageExemption[];
}
export interface CaptionGroup {
  id: string; frame: number; start: number; end: number; text: string; words: Word[];
}
export interface BuildPlan {
  version: 1;
  canvas: { width: number; height: number };
  timing: { tail: number; xfade: number; gap: number };
  totalDuration: number;
  frames: PlanFrame[];
  captionGroups: CaptionGroup[];
  visualBindings?: Record<string, RuntimeVisualBinding[]>;
}
