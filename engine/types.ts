// types.ts — the neutral IR + adapter contracts. Single source of truth for the
// serialized shape of build_plan.json (consumed by every framework adapter's emit())
// and the adapter interface the registry maps names to. Type-only module: erases
// entirely under Node strip-types; the tsc --noEmit gate is what enforces it.

// ── Audio input (shape of shared/audio_meta.json, filled by transcribe) ──────
export interface Word { id?: string; text: string; start: number; end: number; }
export interface Voice { id: string; path: string; duration_s: number; words: Word[]; }
export interface AudioMeta { voices: Voice[]; }
export interface VoiceAssetSnapshot {
  path: string;
  readBytes(): Buffer;
  digest: string;
  mode: number;
  duration_s: number;
}

// ── Neutral IR — the serialized build_plan.json contract ─────────────────────
export type VisualSyncMode = "off" | "warn" | "required";
export type RenderProfile = "final" | "draft" | "gif";

export interface VisualBeatTolerance {
  maxLead: number;
  maxLag: number;
}

export type VisualCueAnchor =
  | { wordIndex: number }
  | { phrase: string; occurrence: number };

export interface AuthoredVisualBeat {
  id: string;
  text: string;
  cue: VisualCueAnchor;
  sourceRefs?: string[];
  workflowStep?: number;
  tolerance?: Partial<VisualBeatTolerance>;
}

export interface AuthoredVisualFrame {
  kind?: "focal" | "workflow" | "comparison" | "sequence";
  beats: AuthoredVisualBeat[];
}

export interface VisualBeatSpec {
  version: 1;
  frames: Record<string, AuthoredVisualFrame>;
}

export interface ResolvedVisualBeat {
  id: string;
  text: string;
  start: number;
  end?: number;
  cueWordIndex: number;
  cueText: string;
  sourceRefs: string[];
  workflowStep?: number;
  tolerance: VisualBeatTolerance;
}

export interface VisualSyncConfig {
  mode?: VisualSyncMode;
  maxLead?: number;
  maxLag?: number;
  minLanding?: number;
}

export interface ResolvedVisualSyncPolicy {
  mode: VisualSyncMode;
  maxLead: number;
  maxLag: number;
  minLanding: number;
}

export interface RenderConfig {
  profile?: RenderProfile;
  fps?: number;
  minimumFinalFps?: number;
}

export interface PlanFrame {
  id: string; frameNum: number; slug: string;
  voicePath: string; voiceDur: number; frameDur: number;
  start: number; words: Word[];
  visualKind?: AuthoredVisualFrame["kind"];
  visualBeats?: ResolvedVisualBeat[];
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

export interface VisualBinding {
  frameSlug: string;
  beatId: string;
  target: string;
  revealStart: number;
  revealDuration: number;
  source: "declarative" | "custom";
  authoredDuration?: number;
  outerDuration?: number;
}

export interface VisualBindingManifest {
  version: 1;
  framework: string;
  bindings: VisualBinding[];
}

// ── Config (merged neutral video.config.json + local output.config.json) ─────
export interface VideoConfig {
  framework?: string;
  timing?: Partial<{ tail: number; xfade: number; gap: number }>;
  canvas?: Partial<{ width: number; height: number }>;
  slugs?: Record<string, string>;
  visualSync?: VisualSyncConfig;
  render?: RenderConfig;
  gsapSrc?: string;
  captions?: { tokens?: Record<string, string> };
  visualContract?: {
    version: 1;
    projectTheme: "light" | "dark";
    allowMixedThemes: boolean;
    allowLegacyThemeInference: boolean;
  };
}

// ── Verification finding (const union, never a TS enum — erasable-only) ──────
export type Level = "error" | "warn";
export interface Finding { level: Level; msg: string; }

// ── Scaffold and adapter contracts ──────────────────────────────────────────
export interface FrameworkScaffoldSpec {
  outputConfig: Record<string, unknown>;
  frameworkCheck: string;
  packageScripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  nextSteps: string[];
}

export interface FrameworkPreparation {
  embeddedFrameTemplates?: string[];
  captionsHtml?: string;
  captionIndexHtml?: string;
  bindingManifest?: VisualBindingManifest;
  voiceSnapshots?: VoiceAssetSnapshot[];
}

export interface EmitOptions {
  captionsOnly?: boolean;
  runtimeSourceDir?: string;
  assetSourceDir?: string;
  voiceSnapshots?: ReadonlyArray<VoiceAssetSnapshot>;
  prepared?: FrameworkPreparation;
}

export interface CaptionArtifactContext {
  sharedDir: string;
  outputDir: string;
  captionGroupsPath: string;
}

export interface AdapterVerifyContext {
  plan: BuildPlan;
  videoDir: string;
  sharedDir: string;
  config: VideoConfig;
  policy: ResolvedVisualSyncPolicy;
  fps: number;
  bindings?: VisualBindingManifest;
  voiceSnapshots?: ReadonlyArray<VoiceAssetSnapshot>;
}

/** @deprecated Use AdapterVerifyContext through FrameworkAdapter.verify(). */
export interface VerifyOptions {
  voiceSnapshots?: ReadonlyArray<VoiceAssetSnapshot>;
}

export interface FrameworkAdapter {
  name: string;
  scaffoldSpec(slug: string): FrameworkScaffoldSpec;
  writeScaffoldRuntime(stageDir: string, slug: string): void;
  ensureRuntime(videoDir: string, slug: string): void;
  preflight(
    plan: BuildPlan, sharedDir: string, outputDir: string,
    config: VideoConfig, opts?: EmitOptions
  ): FrameworkPreparation | void;
  emit(
    plan: BuildPlan, sharedDir: string, outputDir: string,
    config: VideoConfig, opts?: EmitOptions
  ): void;
  captionArtifactPath: string;
  captionIndexArtifactPath?: string;
  bindingManifestPath?: string;
  managedVoiceArtifactPath: string;
  verifyCaptionArtifact(context: CaptionArtifactContext): Finding[];
  resolveVerificationFps(config: VideoConfig, videoDir: string): number;
  verify(context: AdapterVerifyContext | string, sharedDir?: string, options?: VerifyOptions): Finding[];
}
