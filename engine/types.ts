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
export type VisualCoverageMode = "off" | "warn" | "required";
export type VisualSemanticRole = "focal" | "supporting";
export type RenderProfile = "final" | "draft" | "gif";

export interface VisualBeatTolerance {
  maxLead: number;
  maxLag: number;
}

export type VisualCueAnchorV1 =
  | { wordIndex: number }
  | { phrase: string; occurrence: number };

export type VisualCueAnchorV2 =
  | { frameStart: true }
  | VisualCueAnchorV1;

export type VisualCoverageEnd =
  | "next-state"
  | "voice-end"
  | "frame-end"
  | { cue: VisualCueAnchorV2 };

export interface AuthoredVisualBeatV1 {
  id: string;
  text: string;
  cue: VisualCueAnchorV1;
  sourceRefs?: string[];
  workflowStep?: number;
  tolerance?: Partial<VisualBeatTolerance>;
}

export interface AuthoredVisualBeatV2 {
  id: string;
  text: string;
  role: VisualSemanticRole;
  cue: VisualCueAnchorV2;
  coverage?: { until?: VisualCoverageEnd };
  sourceRefs?: string[];
  workflowStep?: number;
  tolerance?: Partial<VisualBeatTolerance>;
}

export interface AuthoredCoverageExemption {
  id: string;
  from: VisualCueAnchorV2;
  until: VisualCoverageEnd;
  reason: string;
  approvedBy: string;
}

export interface AuthoredVisualFrameV1 {
  kind?: "focal" | "workflow" | "comparison" | "sequence";
  beats: AuthoredVisualBeatV1[];
}

export interface AuthoredVisualFrameV2 {
  kind?: AuthoredVisualFrameV1["kind"];
  beats: AuthoredVisualBeatV2[];
  coverageExemptions?: AuthoredCoverageExemption[];
}

export interface VisualBeatSpecV1 {
  version: 1;
  frames: Record<string, AuthoredVisualFrameV1>;
}

export interface VisualBeatSpecV2 {
  version: 2;
  frames: Record<string, AuthoredVisualFrameV2>;
}

export type VisualBeatSpec = VisualBeatSpecV1 | VisualBeatSpecV2;
export type VisualCueAnchor = VisualCueAnchorV1 | VisualCueAnchorV2;

/** @deprecated Use the versioned authored beat types. */
export type AuthoredVisualBeat = AuthoredVisualBeatV1;
/** @deprecated Use the versioned authored frame types. */
export type AuthoredVisualFrame = AuthoredVisualFrameV1;

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
  tolerance: VisualBeatTolerance;
}

export interface ResolvedVisualStateV2 {
  version: 2;
  id: string;
  text: string;
  role: VisualSemanticRole;
  start: number;
  end: number;
  cueWordIndex?: number;
  cueText: string;
  sourceRefs: string[];
  workflowStep?: number;
  tolerance: VisualBeatTolerance;
}

export interface ResolvedCoverageExemption {
  id: string;
  start: number;
  end: number;
  reason: string;
  approvedBy: string;
}

export type ResolvedVisualBeat =
  | ResolvedVisualBeatV1
  | ResolvedVisualStateV2;

export interface VisualSyncConfig {
  mode?: VisualSyncMode;
  coverageMode?: VisualCoverageMode;
  maxLead?: number;
  maxLag?: number;
  maxUncoveredGap?: number;
  minLanding?: number;
}

export interface ResolvedVisualSyncPolicy {
  mode: VisualSyncMode;
  coverageMode: VisualCoverageMode;
  maxLead: number;
  maxLag: number;
  maxUncoveredGap: number;
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
  visualSpecVersion?: 1 | 2;
  visualKind?: AuthoredVisualFrameV1["kind"];
  visualBeats?: ResolvedVisualBeat[];
  visualCoverageExemptions?: ResolvedCoverageExemption[];
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

export interface VisualBindingV1 {
  frameSlug: string;
  beatId: string;
  target: string;
  revealStart: number;
  revealDuration: number;
  source: "declarative" | "custom";
  authoredDuration?: number;
  outerDuration?: number;
}

export interface VisualBindingV2 extends Omit<VisualBindingV1, "source"> {
  role: VisualSemanticRole;
  coverageStart: number;
  coverageEnd: number;
  source: "declarative" | "custom" | "static";
}

/** @deprecated Use the versioned binding types from a versioned manifest. */
export type VisualBinding = VisualBindingV1 | VisualBindingV2;

export interface VisualFrameDuration {
  frameSlug: string;
  authoredDuration?: number;
  outerDuration?: number;
}

export interface VisualBindingInputDigest {
  path: string;
  sha256: string;
}

export interface VisualBindingManifestV1 {
  version: 1;
  framework: string;
  bindings: VisualBindingV1[];
  frames?: VisualFrameDuration[];
}

export interface VisualBindingManifestV2 {
  version: 2;
  framework: string;
  planSha256: string;
  authoredInputs: VisualBindingInputDigest[];
  bindings: VisualBindingV2[];
  frames?: VisualFrameDuration[];
}

export type VisualBindingManifest =
  | VisualBindingManifestV1
  | VisualBindingManifestV2;

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
export interface Finding {
  level: Level;
  msg: string;
  code?: string;
  details?: Record<string, unknown>;
}

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

export interface VisualBindingEvidenceContext {
  plan: BuildPlan;
  videoDir: string;
  sharedDir: string;
  config: VideoConfig;
}

export interface AuthoredVisualInput {
  path: string;
  bytes: Buffer;
}

export interface VisualBindingEvidenceFreshness {
  planSha256: string;
  authoredInputs: VisualBindingInputDigest[];
}

export interface AdapterVerifyContext {
  plan: BuildPlan;
  videoDir: string;
  sharedDir: string;
  config: VideoConfig;
  policy: ResolvedVisualSyncPolicy;
  fps: number;
  bindings?: VisualBindingManifest;
  freshness?: VisualBindingEvidenceFreshness;
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
  collectVisualBindingInputs?: (
    context: VisualBindingEvidenceContext,
  ) => AuthoredVisualInput[];
  managedVoiceArtifactPath: string;
  verifyCaptionArtifact(context: CaptionArtifactContext): Finding[];
  resolveVerificationFps(config: VideoConfig, videoDir: string): number;
  verify(context: AdapterVerifyContext | string, sharedDir?: string, options?: VerifyOptions): Finding[];
}
