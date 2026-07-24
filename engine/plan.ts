// plan.mjs — the neutral build plan every framework emitter consumes.
//
// plan(meta, config) is a PURE function: no fs, no HTML, no framework knowledge.
// It computes the framework-neutral timeline (each frame's start/duration), the
// per-frame cue words, and the globalized caption groups with the whisper clamp,
// and returns a versioned build-plan object.
//
// IR is deliberately framework-neutral: it carries frames/captionGroups/timing/
// canvas/totalDuration only. It does NOT carry trackIndex or crossfade transitions
// — those are HyperFrames layering artifacts the HF emitter derives from
// frames+timing itself (a Remotion emitter would ignore them entirely).

import type { AudioMeta, BuildPlan, PlanFrame, CaptionGroup, VideoConfig, Word } from "./types.ts";

// Compute the neutral build plan from audio meta (voices + word timings) and the
// resolved config (timing/canvas/slugs). Throws on a missing slug or wordless
// voices — the caller maps the throw to a CLI failure.
export function plan(meta: AudioMeta, config: VideoConfig): BuildPlan {
  const voices = meta.voices;
  if (!voices || !voices.length || voices.some((v) => !v.words || !v.words.length)) {
    throw new Error("audio_meta.json has voices with no words — re-run the audio engine / md2vid transcribe.");
  }

  const rawSlugs: unknown = config.slugs;
  if (
    rawSlugs !== undefined
    && (rawSlugs === null || typeof rawSlugs !== "object" || Array.isArray(rawSlugs))
  ) {
    throw new Error('video.config.json "slugs" must be a non-null, non-array object');
  }
  const SLUGS = (rawSlugs ?? {}) as Record<string, string>;
  const TAIL = config.timing?.tail ?? 0.5; // held-landing tail after the voice ends
  const XFADE = config.timing?.xfade ?? 0.5; // crossfade duration between frames
  const GAP = config.timing?.gap ?? 0; // silent stop between frames (0 => back-to-back)
  const WIDTH = config.canvas?.width ?? 1920;
  const HEIGHT = config.canvas?.height ?? 1080;

  // Voice identity is stable metadata; sequence order comes from array position.
  // Validate the complete identity-to-slug contract before constructing the timeline.
  const seen = new Set<string>();
  for (const [index, voice] of voices.entries()) {
    if (typeof voice.id !== "string" || voice.id.trim().length === 0) {
      throw new Error(`voice at index ${index} has invalid id — expected a non-empty string`);
    }
    if (seen.has(voice.id)) throw new Error(`duplicate voice id "${voice.id}"`);
    seen.add(voice.id);
    if (
      !Object.hasOwn(SLUGS, voice.id)
      || typeof SLUGS[voice.id] !== "string"
      || SLUGS[voice.id].trim() === ""
    ) {
      throw new Error(`missing slug mapping for voice id "${voice.id}"`);
    }
  }

  // ── Timeline layout: each frame's start/duration ───────────────────────────
  //   - each frame's VOICE plays from its start for voiceDur, then the frame HOLDS
  //     silently for GAP, and only then does the next frame's voice begin.
  //   - each mount lasts voiceDur + GAP + XFADE so the held landing persists through
  //     the gap and overlaps the next frame's fade-in by XFADE.
  //   - the LAST frame gets no gap/tail, so nothing runs past its voice.
  let cursor = 0;
  const frames: PlanFrame[] = voices.map((v, i) => {
    const id = v.id;
    const slug = SLUGS[id];
    const isLast = i === voices.length - 1;
    const start = cursor;
    const frameDur = isLast ? v.duration_s : v.duration_s + GAP + XFADE;
    cursor += isLast ? v.duration_s : v.duration_s + GAP;
    return {
      id,
      frameNum: i + 1,
      slug,
      voicePath: v.path,
      voiceDur: v.duration_s,
      frameDur,
      start,
      words: v.words,
    };
  });
  const totalDuration = cursor;

  // ── Caption groups — one group per line, GLOBAL times ──────────────────────
  // The captions comp spans the whole video, so word times are offset by frame.start.
  const captionGroups: CaptionGroup[] = [];
  let gi = 0;
  for (const f of frames) {
    // Clamp each word's LOCAL time into [0, voiceDur]. Whisper occasionally pads a
    // final word past the wav's true length; globalizing that unclamped would push
    // it past f.start+voiceDur into the next frame's window and make the global
    // caption timeline non-monotonic (verifier: "timeline goes backwards").
    const clamp = (t: number) => Math.max(0, Math.min(t, f.voiceDur));
    const words = f.words.map((w, i) => ({
      id: `caption-word-${gi}-${i}`,
      text: w.text,
      start: +(f.start + clamp(w.start)).toFixed(3),
      end: +(f.start + clamp(w.end)).toFixed(3),
    }));
    captionGroups.push({
      id: `caption-group-${gi}`,
      frame: f.frameNum,
      start: words[0].start,
      end: words[words.length - 1].end,
      text: words.map((w) => w.text).join(" "),
      words,
    });
    gi++;
  }

  return {
    version: 1,
    canvas: { width: WIDTH, height: HEIGHT },
    timing: { tail: TAIL, xfade: XFADE, gap: GAP },
    totalDuration,
    frames,
    captionGroups,
  };
}
