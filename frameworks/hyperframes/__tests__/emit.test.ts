// emit smoke tests: the HF adapter bakes captions.html GROUPS from the ON-DISK
// (regrouped) caption_groups.json, NOT plan.captionGroups (pre-regroup). This is the
// load-bearing pipeline-order invariant both Phase-2 reviews flagged.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emit } from "../emit.ts";

// A minimal 2-frame plan (pre-regroup: one group per frame).
function makePlan() {
  return {
    version: 1 as const,
    canvas: { width: 1920, height: 1080 },
    timing: { tail: 0.5, xfade: 0.5, gap: 0 },
    totalDuration: 4,
    frames: [
      { id: "01", frameNum: 1, slug: "01-a", voicePath: "assets/voice/01.wav", voiceDur: 2, frameDur: 2.5, start: 0, words: [{ text: "Hello", start: 0, end: 1 }, { text: "world.", start: 1, end: 2 }] },
      { id: "02", frameNum: 2, slug: "02-b", voicePath: "assets/voice/02.wav", voiceDur: 2, frameDur: 2, start: 2, words: [{ text: "Second", start: 0, end: 1 }, { text: "frame.", start: 1, end: 2 }] },
    ],
    captionGroups: [
      { id: "caption-group-0", frame: 1, start: 0, end: 2, text: "Hello world.", words: [{ id: "caption-word-0-0", text: "Hello", start: 0, end: 1 }, { id: "caption-word-0-1", text: "world.", start: 1, end: 2 }] },
      { id: "caption-group-1", frame: 2, start: 2, end: 4, text: "Second frame.", words: [{ id: "caption-word-1-0", text: "Second", start: 2, end: 3 }, { id: "caption-word-1-1", text: "frame.", start: 3, end: 4 }] },
    ],
  };
}

function setup() {
  const tmp = mkdtempSync(join(tmpdir(), "emit-"));
  const shared = join(tmp, "shared");
  const output = join(tmp, "hyperframes");
  mkdirSync(join(shared, "assets", "voice"), { recursive: true });
  writeFileSync(join(shared, "assets", "voice", "01.wav"), "VOICE01");
  writeFileSync(join(shared, "assets", "voice", "02.wav"), "VOICE02");
  mkdirSync(join(output, "compositions"), { recursive: true });
  return { tmp, shared, output };
}

function transactionResidue(root: string): string[] {
  const assets = join(root, "assets");
  if (!existsSync(assets)) return [];
  return readdirSync(assets).filter((name) => name.includes("md2vid"));
}

test("canonical emit stages real voice files under the HyperFrames root", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    emit(plan, shared, output, {});

    assert.equal(readFileSync(join(output, "assets", "voice", "01.wav"), "utf8"), "VOICE01");
    assert.equal(readFileSync(join(output, "assets", "voice", "02.wav"), "utf8"), "VOICE02");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("default emit uses the pinned CDN and does not scaffold local GSAP bytes", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));

    emit(plan, shared, output, {});

    const index = readFileSync(join(output, "index.html"), "utf8");
    const captions = readFileSync(join(output, "compositions", "captions.html"), "utf8");
    const pinned = "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js";
    assert.ok(index.includes(`<script src="${pinned}">`));
    assert.ok(captions.includes(`<script src="${pinned}">`));
    assert.equal(existsSync(join(output, "assets", "gsap.min.js")), false);
    assert.ok(existsSync(join(output, "assets")), "assets directory remains available for voice files");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("full emit prunes stale voice files while preserving planned WAV bytes", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    mkdirSync(join(output, "assets", "voice"), { recursive: true });
    writeFileSync(join(output, "assets", "voice", "stale.wav"), "STALE");
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));

    emit(plan, shared, output, {});

    assert.equal(existsSync(join(output, "assets", "voice", "stale.wav")), false);
    assert.equal(readFileSync(join(output, "assets", "voice", "01.wav"), "utf8"), "VOICE01");
    assert.equal(readFileSync(join(output, "assets", "voice", "02.wav"), "utf8"), "VOICE02");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("missing WAV leaves prior managed voices and emitted references unchanged", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    rmSync(join(shared, "assets"), { recursive: true, force: true });
    mkdirSync(join(output, "assets", "voice"), { recursive: true });
    mkdirSync(join(output, "compositions", "frames"), { recursive: true });
    writeFileSync(join(output, "assets", "voice", "prior.wav"), "PRIOR");
    writeFileSync(join(output, "index.html"), "OLD INDEX\n");
    writeFileSync(join(output, "compositions", "captions.html"), "OLD CAPTIONS\n");
    writeFileSync(join(output, "compositions", "frames", "authored.html"), "AUTHORED FRAME\n");
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));

    assert.throws(
      () => emit(plan, shared, output, {}),
      /FAIL \[hyperframes:emit\]: missing voice asset/,
    );
    assert.equal(readFileSync(join(output, "index.html"), "utf8"), "OLD INDEX\n");
    assert.equal(readFileSync(join(output, "compositions", "captions.html"), "utf8"), "OLD CAPTIONS\n");
    assert.equal(readFileSync(join(output, "assets", "voice", "prior.wav"), "utf8"), "PRIOR");
    assert.equal(readFileSync(join(output, "compositions", "frames", "authored.html"), "utf8"), "AUTHORED FRAME\n");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("captionsOnly skips runtime and voice staging", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    rmSync(join(shared, "assets"), { recursive: true, force: true });
    mkdirSync(join(output, "assets", "voice"), { recursive: true });
    writeFileSync(join(output, "assets", "voice", "sentinel.wav"), "KEEP");
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));

    emit(plan, shared, output, {}, { captionsOnly: true });

    assert.equal(readFileSync(join(output, "assets", "voice", "sentinel.wav"), "utf8"), "KEEP");
    assert.equal(existsSync(join(output, "hyperframes.json")), false);
    assert.equal(existsSync(join(output, "index.html")), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("flat emit preserves voice bytes without transaction residue", () => {
  const flat = mkdtempSync(join(tmpdir(), "emit-flat-"));
  try {
    const plan = makePlan();
    mkdirSync(join(flat, "assets", "voice"), { recursive: true });
    writeFileSync(join(flat, "assets", "voice", "01.wav"), "FLAT01");
    writeFileSync(join(flat, "assets", "voice", "02.wav"), "FLAT02");
    writeFileSync(join(flat, "assets", "voice", "sentinel.wav"), "KEEP");
    writeFileSync(join(flat, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));

    emit(plan, flat, flat, {});

    assert.equal(readFileSync(join(flat, "assets", "voice", "01.wav"), "utf8"), "FLAT01");
    assert.equal(readFileSync(join(flat, "assets", "voice", "02.wav"), "utf8"), "FLAT02");
    assert.equal(readFileSync(join(flat, "assets", "voice", "sentinel.wav"), "utf8"), "KEEP");
    assert.ok(existsSync(join(flat, "index.html")));
    assert.deepEqual(transactionResidue(flat), []);
  } finally {
    rmSync(flat, { recursive: true, force: true });
  }
});

test("index.html mounts every frame with alternating tracks + crossfade pairs", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    // caption_groups.json must exist for emit's captions bake.
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    mkdirSync(join(output, "assets"), { recursive: true });
    writeFileSync(join(output, "assets", "gsap.min.js"), "CUSTOM GSAP");
    emit(plan, shared, output, { gsapSrc: "assets/gsap.min.js" });

    const index = readFileSync(join(output, "index.html"), "utf8");
    const captions = readFileSync(join(output, "compositions", "captions.html"), "utf8");
    // both frames mounted
    assert.match(index, /data-composition-src="compositions\/frames\/01-a\.html"/);
    assert.match(index, /data-composition-src="compositions\/frames\/02-b\.html"/);
    // alternating tracks: frame 1 (odd) -> track 0, frame 2 (even) -> track 1
    assert.match(index, /id="el-01-a"[\s\S]*?data-track-index="0"/);
    assert.match(index, /id="el-02-b"[\s\S]*?data-track-index="1"/);
    // one crossfade boundary (2 frames -> 1 transition): fade out prev + fade in next
    assert.match(index, /tl\.to\("#el-01-a", \{ opacity: 0/);
    assert.match(index, /tl\.fromTo\("#el-02-b"/);
    // explicit local gsapSrc override wired through both emitted entry points
    assert.match(index, /<script src="assets\/gsap\.min\.js">/);
    assert.match(captions, /<script src="\.\.\/assets\/gsap\.min\.js">/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("emit rejects invalid local gsapSrc values before writing output", () => {
  for (const gsapSrc of [
    "",
    "assets/missing-gsap.js",
    "../gsap.js",
    "/absolute/gsap.js",
    "C:\\runtime\\gsap.js",
    "\\\\server\\share\\gsap.js",
    "https://cdn.example.test/gsap.min.js",
    "assets\\gsap.min.js",
    "assets/gsap file.js",
    "assets/gsap.min.js?debug=1",
    "assets/gsap.min.js#fragment",
    "assets/gsap%2emin.js",
    "assets/gsap.min.css",
    "assets/gsap\".js",
    "assets/<gsap>.js",
    "assets/`gsap`.js",
  ]) {
    const { tmp, shared, output } = setup();
    try {
      const plan = makePlan();
      writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));

      const expected = gsapSrc === "assets/missing-gsap.js" ? /missing gsapSrc file/ : /invalid gsapSrc/;
      assert.throws(() => emit(plan, shared, output, { gsapSrc }), expected);
      assert.equal(existsSync(join(output, "index.html")), false);
      assert.equal(existsSync(join(output, "compositions", "captions.html")), false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});

test("captions.html bakes GROUPS from the on-disk caption_groups.json, NOT plan.captionGroups", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    // Write a REGROUPED caption_groups.json that differs from plan.captionGroups:
    // a single merged group instead of two per-frame groups.
    const regrouped = {
      groups: [
        { id: "caption-group-0", frame: 1, start: 0, end: 2, text: "Hello world.", words: [{ id: "caption-word-0-0", text: "Hello", start: 0, end: 1 }, { id: "caption-word-0-1", text: "world.", start: 1, end: 2 }] },
        { id: "caption-group-1", frame: 2, start: 2, end: 4, text: "Second frame merged extra.", words: [{ id: "x", text: "Second", start: 2, end: 4 }] },
      ],
    };
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify(regrouped));
    emit(plan, shared, output, {});

    const captions = readFileSync(join(output, "compositions", "captions.html"), "utf8");
    const m = captions.match(/var GROUPS = (\[.*?\]);/);
    assert.ok(m, "captions.html has a baked var GROUPS line");
    const baked = JSON.parse(m[1]);
    // baked GROUPS reflect the on-disk (regrouped) JSON, not plan.captionGroups
    assert.deepEqual(baked, regrouped.groups);
    assert.equal(baked[1].text, "Second frame merged extra.");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("captionsOnly skips index.html, refills captions.html only", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    // first a full emit, then mutate the on-disk groups and re-emit captions-only
    emit(plan, shared, output, {});
    const indexBefore = readFileSync(join(output, "index.html"), "utf8");

    const mutated = { groups: [{ id: "g", frame: 1, start: 0, end: 2, text: "Changed.", words: [{ id: "w", text: "Changed.", start: 0, end: 2 }] }] };
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify(mutated));
    emit(plan, shared, output, {}, { captionsOnly: true });

    // index.html untouched by captions-only pass
    assert.equal(readFileSync(join(output, "index.html"), "utf8"), indexBefore);
    // captions.html reflects the mutated groups
    const captions = readFileSync(join(output, "compositions", "captions.html"), "utf8");
    assert.match(captions, /"text":"Changed\."/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("emit is idempotent — running it twice on the same inputs yields identical bytes", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    emit(plan, shared, output, {});
    const idx1 = readFileSync(join(output, "index.html"), "utf8");
    const cap1 = readFileSync(join(output, "compositions", "captions.html"), "utf8");
    emit(plan, shared, output, {});
    assert.equal(readFileSync(join(output, "index.html"), "utf8"), idx1);
    assert.equal(readFileSync(join(output, "compositions", "captions.html"), "utf8"), cap1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("caption look is sourced from the skin, not baked inline in emit", () => {
  // The emit module source must not contain caption-look CSS literals — the look
  // lives only in caption-skin.html (the [[video-pipeline-architecture]] invariant).
  const src = readFileSync(new URL("../emit.ts", import.meta.url), "utf8");
  // token DEFAULTS are allowed (they fill the skin's :root hole), but there must be
  // no full style rules / selectors defining the caption band look.
  assert.ok(!/\.caption-word\s*\{/.test(src), "no .caption-word style rule in emit");
  assert.ok(!/@keyframes/.test(src), "no @keyframes in emit");
});
