// crucial: the oracle for the whole refactor — bytes, not semantics.
//
// Copies PINNED inputs into a temp dir laid out as shared/ + hyperframes/, runs
// the FULL build chain (build_video → regroup_captions --max-chars 54, matching
// each video's package.json), and diffs the four artifacts against committed
// expected/ fixtures.
//
// Why pinned inputs: the live build outputs are NOT a reliable oracle —
// audio_meta.json + caption_groups.json + captions.html are all gitignored, and
// audio_meta.json is produced by a non-deterministic Whisper chain. So the
// expected outputs are only reproducible from a clean checkout if we freeze each
// video's audio_meta.json + video.config.json + output.config.json (including the
// pinned GSAP CDN source) as committed read-only inputs
// and commit the four expected outputs as fixtures.
//
// Why the FULL chain, not build alone: the committed caption_groups.json /
// captions.html are POST-regroup (hash-table-example ships 41 groups), while build alone
// emits one group per frame (7). Running build in isolation reproduces
// index.html + cues.json but NEVER the committed captions — the oracle must run
// the same `build` chain each package.json defines.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SCRIPTS = join(REPO_ROOT, "scripts");
const FIXTURES = join(HERE, "fixtures");

const SLUGS = ["hash-table-example"];

// The four blessed artifacts and where each lands after the build chain, relative
// to the temp video root (shared/ neutral IR + hyperframes/ framework output).
const ARTIFACTS = [
  { fixture: "cues.json", built: join("shared", "cues.json") },
  { fixture: "caption_groups.json", built: join("shared", "caption_groups.json") },
  { fixture: "index.html", built: join("hyperframes", "index.html") },
  { fixture: "captions.html", built: join("hyperframes", "compositions", "captions.html") },
];

function readExpected(slug: string, name: string) {
  return readFileSync(join(FIXTURES, slug, "expected", name), "utf8");
}

// Seed a temp dir from fixtures/<slug>/inputs/, run build + regroup (the exact
// commands each video's package.json runs), return the temp video root.
function buildChainIntoTemp(slug: string) {
  const tmp = mkdtempSync(join(tmpdir(), `golden-${slug}-`));
  const shared = join(tmp, "shared");
  const output = join(tmp, "hyperframes");
  mkdirSync(join(shared, "assets", "voice"), { recursive: true });
  mkdirSync(join(output, "compositions"), { recursive: true });
  for (const id of ["01", "02", "03", "04", "05", "06", "07"]) {
    writeFileSync(join(shared, "assets", "voice", `${id}.wav`), `VOICE${id}`);
  }

  const inputs = join(FIXTURES, slug, "inputs");
  copyFileSync(join(inputs, "audio_meta.json"), join(shared, "audio_meta.json"));
  copyFileSync(join(inputs, "video.config.json"), join(shared, "video.config.json"));
  copyFileSync(join(inputs, "output.config.json"), join(output, "output.config.json"));

  execFileSync("node", [join(SCRIPTS, "build.ts"), output], { stdio: "pipe" });
  execFileSync(
    "node",
    [join(SCRIPTS, "regroup.ts"), output, "--max-chars", "54"],
    { stdio: "pipe" }
  );
  return tmp;
}

for (const slug of SLUGS) {
  test(`golden: ${slug} outputs are byte-identical`, () => {
    const tmp = buildChainIntoTemp(slug);
    try {
      for (const { fixture, built } of ARTIFACTS) {
        const got = readFileSync(join(tmp, built), "utf8");
        assert.equal(got, readExpected(slug, fixture), `${slug}/${fixture} diverged`);
      }
      assert.equal(existsSync(join(tmp, "hyperframes", "assets", "gsap.min.js")), false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
}
