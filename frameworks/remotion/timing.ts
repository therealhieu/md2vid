export interface QuantizedVisualTiming {
  startFrame: number;
  durationFrames: number;
  revealStart: number;
  revealDuration: number;
}

export function quantizeVisualTiming(
  start: number,
  duration: number,
  fps: number,
): QuantizedVisualTiming {
  if (!Number.isFinite(start) || start < 0) {
    throw new Error(`visual reveal start must be a finite non-negative number (got ${start})`);
  }
  if (!Number.isFinite(duration) || duration < 0) {
    throw new Error(`visual reveal duration must be a finite non-negative number (got ${duration})`);
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`visual timing FPS must be a finite positive number (got ${fps})`);
  }

  const startFrame = Math.round(start * fps);
  const durationFrames = Math.max(1, Math.round(duration * fps));
  return {
    startFrame,
    durationFrames,
    revealStart: startFrame / fps,
    revealDuration: durationFrames / fps,
  };
}
