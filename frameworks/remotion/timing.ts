export interface QuantizedVisualTiming {
  startFrame: number;
  durationFrames: number;
  revealStart: number;
  revealDuration: number;
}

export function quantizeBoundary(seconds: number, fps: number): {
  frame: number;
  seconds: number;
} {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`visual coverage boundary must be a finite non-negative number (got ${seconds})`);
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`visual timing FPS must be a finite positive number (got ${fps})`);
  }
  const frame = Math.round(seconds * fps);
  return { frame, seconds: frame / fps };
}

export function quantizeDuration(
  duration: number,
  fps: number,
  { allowZero = false }: { allowZero?: boolean } = {},
): { frames: number; seconds: number } {
  if (!Number.isFinite(duration) || duration < 0) {
    throw new Error(`visual reveal duration must be a finite non-negative number (got ${duration})`);
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`visual timing FPS must be a finite positive number (got ${fps})`);
  }
  const rounded = Math.round(duration * fps);
  const frames = allowZero ? Math.max(0, rounded) : Math.max(1, rounded);
  return { frames, seconds: frames / fps };
}

export function quantizeVisualTiming(
  start: number,
  duration: number,
  fps: number,
): QuantizedVisualTiming {
  const startBoundary = quantizeBoundary(start, fps);
  const revealDuration = quantizeDuration(duration, fps);
  return {
    startFrame: startBoundary.frame,
    durationFrames: revealDuration.frames,
    revealStart: startBoundary.seconds,
    revealDuration: revealDuration.seconds,
  };
}
