// types.ts — the BuildPlan shape the composition consumes, structurally identical to
// engine/types.ts (BuildPlan/PlanFrame/CaptionGroup/Word). Kept local because the
// composition is bundled standalone by Remotion; do NOT let it drift from the engine.
export interface Word { id?: string; text: string; start: number; end: number; }
export interface ResolvedVisualBeat {
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
export interface RemotionVisualBinding {
  beat: string;
  target: string;
  enter: "fade" | "rise" | "slide-left" | "scale" | "none";
  duration: number;
}
export interface PlanFrame {
  id: string; frameNum: number; slug: string;
  voicePath: string; voiceDur: number; frameDur: number; start: number; words: Word[];
  visualKind?: "focal" | "workflow" | "comparison" | "sequence";
  visualBeats?: ResolvedVisualBeat[];
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
  visualBindings?: Record<string, RemotionVisualBinding[]>;
}
