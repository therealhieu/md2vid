export interface ComposedVisualIntegrityOptions {
  baseUrl: string;
  projectDir: string;
  outputDir: string;
  executablePath?: string;
}

export interface ComposedVisualIntegritySummary {
  result: "PASS" | "FAIL";
  artifacts: Record<string, string>;
  checks: Record<string, "PASS" | "FAIL">;
}

export const USAGE: string;
export function validatePlan(plan: unknown): {
  canvas: { width: number; height: number };
  timing: { xfade: number };
  totalDuration: number;
  frames: Array<{ frameNum: number; slug: string; start: number; frameDur: number }>;
};
export function runComposedVisualIntegrity(
  options: ComposedVisualIntegrityOptions,
): Promise<ComposedVisualIntegritySummary>;
