// verify.mjs — neutral caption invariants. NEUTRAL: no fs, no HTML-layout knowledge.
//
// verifyNeutral(groups, opts) returns an array of findings ({level,msg}); the caller
// decides the exit code. Input is the REGROUPED caption groups (from
// caption_groups.json), NOT the pre-regroup plan.captionGroups — the single-word and
// line-length checks exist to catch UNDER-grouping, so they must see the post-regroup
// data (which may contain many regrouped entries), else they validate the wrong data and false-pass.
//
// The JSON<->baked-HTML sync check is intentionally NOT here — it references HTML, so
// it is HF-specific and lives in frameworks/hyperframes/verify.mjs (Task 2.2).

import { groupLineChars } from "./captions.ts";
import type { CaptionGroup, Finding } from "./types.ts";

// Line-length target from docs/standards/video-generation.md (Captions). Advisory band
// — a hard ceiling only kicks in well past the readable target so a legitimately long
// single-clause line is not a failure.
const TARGET_MAX_CHARS_DEFAULT = 56;
const HARD_MAX_CHARS_DEFAULT = 72;
// Objective failure: too many groups collapse to a single word (the default grouping
// disease). A few one-word beats are fine (emphatic single words).
const MAX_SINGLE_WORD_FRACTION = 0.15;

export function verifyNeutral(
  groups: CaptionGroup[],
  { targetMaxChars = TARGET_MAX_CHARS_DEFAULT, hardMaxChars = HARD_MAX_CHARS_DEFAULT }:
    { targetMaxChars?: number; hardMaxChars?: number } = {}
): Finding[] {
  const findings: Finding[] = [];
  const problem = (msg: string) => findings.push({ level: "error", msg });
  const warn = (msg: string) => findings.push({ level: "warn", msg });

  if (!groups || !groups.length) {
    problem("caption_groups.json has no groups");
    return findings;
  }

  // 1. Per-group integrity: timing monotonic, spans match, one frame each, line length.
  let singleWord = 0;
  groups.forEach((g, i) => {
    const words = g.words ?? [];
    const gid = g.id ?? i;
    if (!words.length) {
      problem(`group ${gid} has no words`);
      return;
    }
    if (words.length === 1) singleWord++;

    if (g.frame == null) problem(`group ${gid} has no frame`);

    for (let k = 0; k < words.length - 1; k++) {
      if (words[k + 1].start < words[k].start - 1e-6) {
        problem(`group ${gid} word timing goes backwards`);
        break;
      }
    }

    if (Math.abs(g.start - words[0].start) > 1e-6) problem(`group ${gid} start != first word start`);
    if (Math.abs(g.end - words[words.length - 1].end) > 1e-6)
      problem(`group ${gid} end != last word end`);

    const n = groupLineChars(words);
    if (n > hardMaxChars) problem(`group ${gid} is ${n} chars (> hard max ${hardMaxChars})`);
    else if (n > targetMaxChars) warn(`group ${gid} is ${n} chars (> target ${targetMaxChars})`);
  });

  // 2. groups sorted by time and frame monotonic across the film
  const frameSeq = groups.filter((g) => g.frame != null).map((g) => g.frame);
  const sortedSeq = [...frameSeq].sort((a, b) => a - b);
  if (JSON.stringify(frameSeq) !== JSON.stringify(sortedSeq)) {
    problem("caption groups are not in frame order");
  }

  // 3. too many single-word groups = under-grouped (the default disease)
  const frac = singleWord / groups.length;
  if (frac > MAX_SINGLE_WORD_FRACTION) {
    problem(
      `${singleWord}/${groups.length} (${Math.round(frac * 100)}%) caption groups are single words ` +
        `(> ${Math.round(MAX_SINGLE_WORD_FRACTION * 100)}%) — captions look under-grouped; ` +
        `rebuild with md2vid regroup <dir>`
    );
  }

  // 4. global caption word timeline is non-decreasing (seek-safety)
  const flat = groups.flatMap((g) => g.words ?? []);
  for (let k = 0; k < flat.length - 1; k++) {
    if (flat[k + 1].start < flat[k].start - 1e-6) {
      problem("global caption word timeline goes backwards between groups");
      break;
    }
  }

  return findings;
}
