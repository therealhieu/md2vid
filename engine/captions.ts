// captions.mjs — pure caption regrouping. NEUTRAL: no fs, no HTML.
//
// regroup(groups, maxChars) transforms an array of caption groups into a new array
// of balanced ~maxChars lines that break only at sentence boundaries and never
// across frame boundaries, preserving every word's original start/end timing.
//
// This is the framework-neutral core; the thin scripts/regroup.mjs wrapper handles fs
// (read/write caption_groups.json) and delegates the HF captions.html re-fill to emit.

import type { CaptionGroup, Word } from "./types.ts";

const isSentenceEnd = (t: string) => /[.?!]["')\]]?$/.test(t);
const lineChars = (words: Word[]) => (words.length ? words.reduce((n, w) => n + w.text.length, 0) + (words.length - 1) : 0);

// Balance-split one sentence's words into roughly-equal lines of <= maxChars.
function splitSentence(words: Word[], maxChars: number): Word[][] {
  const total = lineChars(words);
  if (total <= maxChars) return [words];
  const nLines = Math.ceil(total / maxChars);
  const target = total / nLines;
  const lines = [];
  let cur = [];
  let remainingLines = nLines;
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i]);
    const wordsLeft = words.length - (i + 1);
    // close this line if adding another word would overshoot the per-line target
    // and we still have enough words to fill the remaining lines
    const curLen = lineChars(cur);
    const nextLen = i + 1 < words.length ? curLen + 1 + words[i + 1].text.length : curLen;
    const linesLeftAfter = remainingLines - 1;
    if (
      remainingLines > 1 &&
      wordsLeft >= linesLeftAfter &&
      (curLen >= target || nextLen > maxChars) &&
      cur.length >= 2
    ) {
      lines.push(cur);
      cur = [];
      remainingLines--;
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

// Regroup caption groups into balanced ~maxChars lines. Pure: returns a new array,
// mutates nothing. Word text/timing is preserved verbatim; only grouping changes.
export function regroup(groups: CaptionGroup[], maxChars = 54): CaptionGroup[] {
  // 1. Flatten to a word stream, remembering which frame each word belongs to.
  const stream: { text: string; start: number; end: number; frame: number }[] = [];
  for (const g of groups) {
    for (const w of g.words) {
      stream.push({ text: String(w.text), start: w.start, end: w.end, frame: g.frame });
    }
  }

  // 2. Walk the stream: break at frame boundaries and sentence ends, then balance-split.
  const newGroups = [];
  let gi = 0;
  let f = 0;
  while (f < stream.length) {
    const frame = stream[f].frame;
    const frameWords = [];
    while (f < stream.length && stream[f].frame === frame) frameWords.push(stream[f++]);
    // segment into sentences
    let sent = [];
    const sentences = [];
    for (const w of frameWords) {
      sent.push(w);
      if (isSentenceEnd(w.text)) {
        sentences.push(sent);
        sent = [];
      }
    }
    if (sent.length) sentences.push(sent);
    // split + emit
    for (const s of sentences) {
      for (const lineWords of splitSentence(s, maxChars)) {
        const words = lineWords.map((w, i) => ({
          id: `caption-word-${gi}-${i}`,
          text: w.text,
          start: w.start,
          end: w.end,
        }));
        newGroups.push({
          id: `caption-group-${gi}`,
          frame,
          start: words[0].start,
          end: words[words.length - 1].end,
          text: words.map((w) => w.text).join(" "),
          words,
        });
        gi++;
      }
    }
  }
  return newGroups;
}

// Char count of a group's words including inter-word spaces — exported so callers
// (report lines, verify) share one definition.
export function groupLineChars(words: Word[]): number {
  return lineChars(words);
}
