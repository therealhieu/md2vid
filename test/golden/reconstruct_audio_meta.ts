// Reconstruct audio_meta.json from committed cues.json + index.html + video.config.json.
// cues.json preserves each frame's words verbatim ({text,start,end}) and voiceDur (=duration_s);
// index.html carries the <audio src> voice path; video.config maps id->slug.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const cues = JSON.parse(readFileSync(join(dir, "cues.json"), "utf8"));
const index = readFileSync(join(dir, "index.html"), "utf8");
const config = JSON.parse(readFileSync(join(dir, "video.config.json"), "utf8"));

// slug -> id (invert config.slugs)
const slugToId: Record<string, string> = {};
for (const [id, slug] of Object.entries(config.slugs)) slugToId[slug as string] = id;

// slug -> voice path from index.html
const voiceSrc: Record<string, string> = {};
for (const m of index.matchAll(/id="el-([^"]+)-voice"[\s\S]*?src="([^"]+)"/g)) voiceSrc[m[1]] = m[2];

const voices = cues.map((c: any) => {
  const id = slugToId[c.slug];
  if (!id) throw new Error(`no id for slug ${c.slug}`);
  const path = voiceSrc[c.slug];
  if (!path) throw new Error(`no voice src for slug ${c.slug}`);
  return { id, path, duration_s: c.voiceDur, words: c.words.map((w: any) => ({ text: w.text, start: w.start, end: w.end })) };
});

writeFileSync(join(dir, "audio_meta.json"), JSON.stringify({ voices }, null, 2) + "\n");
console.log(`reconstructed ${dir}/audio_meta.json  voices=${voices.length}`);
