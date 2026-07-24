// types.ts — the neutral IR + adapter contracts. Single source of truth for the
// serialized shape of build_plan.json (consumed by every framework adapter's emit())
// and the adapter interface the registry maps names to. Type-only module: erases
// entirely under Node strip-types; the tsc --noEmit gate is what enforces it.

// ── Audio input (shape of shared/audio_meta.json, filled by transcribe) ──────
export interface Word { id?: string; text: string; start: number; end: number; }
export interface Voice { id: string; path: string; duration_s: number; words: Word[]; }
export interface AudioMeta { voices: Voice[]; }

// ── Neutral IR — the serialized build_plan.json contract ─────────────────────
export interface PlanFrame {
  id: string; frameNum: number; slug: string;
  voicePath: string; voiceDur: number; frameDur: number;
  start: number; words: Word[];
}

export interface CaptionGroup {
  id: string; frame: number; start: number; end: number;
  text: string; words: Word[];
}

export interface BuildPlan {
  version: 1;
  canvas: { width: number; height: number };
  timing: { tail: number; xfade: number; gap: number };
  totalDuration: number;
  frames: PlanFrame[];
  captionGroups: CaptionGroup[];
}

// ── Config (merged neutral video.config.json + local output.config.json) ─────
export interface VideoConfig {
  framework?: string;
  timing?: Partial<{ tail: number; xfade: number; gap: number }>;
  canvas?: Partial<{ width: number; height: number }>;
  slugs?: Record<string, string>;
  gsapSrc?: string;
  captions?: { tokens?: Record<string, string> };
}

// ── Verification finding (const union, never a TS enum — erasable-only) ──────
export type Level = "error" | "warn";
export interface Finding { level: Level; msg: string; }

// ── Scaffold and adapter contracts ──────────────────────────────────────────
export interface FrameworkScaffoldSpec {
  outputConfig: Record<string, unknown>;
  packageScripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  nextSteps: string[];
}

export interface FrameworkAdapter {
  name: string;
  scaffoldSpec(slug: string): FrameworkScaffoldSpec;
  writeScaffoldRuntime(stageDir: string, slug: string): void;
  ensureRuntime(videoDir: string, slug: string): void;
  emit(
    plan: BuildPlan, sharedDir: string, outputDir: string,
    config: VideoConfig, opts?: { captionsOnly?: boolean }
  ): void;
  verify(videoDir: string, sharedDir?: string): Finding[];
}
