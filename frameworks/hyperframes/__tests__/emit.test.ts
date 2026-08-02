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
import {
  UPCOMING_CAPTION_INK_PERCENT,
  buildCaptionsHtml,
  buildIndexHtml,
  emit,
  preflight,
  sanitizeCompositionTemplate,
} from "../emit.ts";
import { extractTemplateById, replaceTemplateById } from "../html.ts";
import { resolveVerificationFps } from "../verify.ts";
import { makePcmWav } from "../../../test/helpers/wav.ts";
import { contrastRatio, parseCssColor } from "../visual_contract.ts";
import { DEFAULT_GSAP_SRC } from "../../../scripts/dependency_versions.ts";
import type { BuildPlan } from "../../../engine/types.ts";

const VOICE01 = makePcmWav({ sampleRate: 48_000, sampleFrames: 96_000 });
const VOICE02 = Buffer.from(VOICE01);
VOICE02[VOICE02.length - 1] = 1;

// A minimal 2-frame plan (pre-regroup: one group per frame).
function makePlan(): BuildPlan {
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

function visualPlan() {
  const plan = makePlan();
  plan.frames[0].visualBeats = [{
    id: "execute",
    text: "Execute",
    start: 1,
    cueWordIndex: 0,
    cueText: "Execute",
    sourceRefs: [],
    tolerance: { maxLead: 0.25, maxLag: 0.75 },
  }];
  return plan;
}

function authoredFrame(slug: string, gsapSrc = DEFAULT_GSAP_SRC) {
  return `<!doctype html>
<html><body>
  <template data-composition-id="${slug}">
    <style>#${slug}-root { position: absolute; inset: 0; }</style>
    <div id="${slug}-root" data-composition-id="${slug}" data-width="1920" data-height="1080" data-duration="2"></div>
    <script src="${gsapSrc}"></script>
    <script>window.__timelines = window.__timelines || {}; window.__timelines["${slug}"] = gsap.timeline({ paused: true });</script>
  </template>
</body></html>
`;
}

function setup() {
  const tmp = mkdtempSync(join(tmpdir(), "emit-"));
  const shared = join(tmp, "shared");
  const output = join(tmp, "hyperframes");
  mkdirSync(join(shared, "assets", "voice"), { recursive: true });
  writeFileSync(join(shared, "assets", "voice", "01.wav"), VOICE01);
  writeFileSync(join(shared, "assets", "voice", "02.wav"), VOICE02);
  mkdirSync(join(output, "compositions", "frames"), { recursive: true });
  writeFileSync(join(output, "compositions", "frames", "01-a.html"), authoredFrame("01-a"));
  writeFileSync(join(output, "compositions", "frames", "02-b.html"), authoredFrame("02-b"));
  return { tmp, shared, output };
}

function transactionResidue(root: string): string[] {
  const assets = join(root, "assets");
  if (!existsSync(assets)) return [];
  return readdirSync(assets).filter((name) => name.includes("md2vid"));
}

test("preflight finalizes declarative timing after a transported authored controller", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = visualPlan();
    const framePath = join(output, "compositions", "frames", "01-a.html");
    writeFileSync(
      framePath,
      authoredFrame("01-a").replace(
        `data-duration="2"></div>`,
        `data-duration="2"><div id="execute" data-md2vid-beat="execute"></div></div>`,
      ),
    );

    const template = preflight(plan, shared, output, {}).embeddedFrameTemplates![0];
    const helper = template.indexOf("window.__md2vidTiming");
    const controller = template.indexOf('window.__timelines["01-a"] = gsap.timeline');
    const finalizer = template.lastIndexOf('const timeline = window.__timelines["01-a"]');

    assert.ok(helper >= 0 && helper < controller, "generated helper must initialize before authored controller");
    assert.ok(controller < finalizer, "generated declarative timing must finalize after authored controller");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("full emit replaces the generated visual binding manifest", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = visualPlan();
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    const framePath = join(output, "compositions", "frames", "01-a.html");
    writeFileSync(
      framePath,
      authoredFrame("01-a").replace(
        `data-duration="2"></div>`,
        `data-duration="2"><div id="execute-v1" data-md2vid-beat="execute"></div></div>`,
      ),
    );

    emit(plan, shared, output, {});
    let manifest = JSON.parse(readFileSync(join(output, "build", "visual_bindings.json"), "utf8"));
    assert.equal(manifest.framework, "hyperframes");
    assert.equal(manifest.bindings[0].target, "#execute-v1");

    writeFileSync(
      framePath,
      authoredFrame("01-a").replace(
        `data-duration="2"></div>`,
        `data-duration="2"><div id="execute-v2" data-md2vid-beat="execute"></div></div>`,
      ),
    );
    emit(plan, shared, output, {});
    manifest = JSON.parse(readFileSync(join(output, "build", "visual_bindings.json"), "utf8"));
    assert.equal(manifest.bindings[0].target, "#execute-v2");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("full emit records frame duration evidence without a visual target", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = visualPlan();
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    writeFileSync(
      join(output, "compositions", "frames", "01-a.html"),
      authoredFrame("01-a").replace('data-duration="2"', 'data-duration="1.9"'),
    );

    emit(plan, shared, output, {});
    const manifest = JSON.parse(readFileSync(join(output, "build", "visual_bindings.json"), "utf8"));
    assert.deepEqual(manifest.bindings, []);
    assert.deepEqual(manifest.frames, [{ frameSlug: "01-a", authoredDuration: 1.9 }]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("captions-only emit retains an existing visual binding manifest", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    emit(plan, shared, output, {});
    const manifestPath = join(output, "build", "visual_bindings.json");
    writeFileSync(manifestPath, "EXISTING MANIFEST\n");

    emit(plan, shared, output, {}, { captionsOnly: true });

    assert.equal(readFileSync(manifestPath, "utf8"), "EXISTING MANIFEST\n");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("full emit writes the effective FPS on the main composition root", () => {
  const index = buildIndexHtml(makePlan(), { render: { fps: 24 } });
  assert.match(index, /data-composition-id="main"[\s\S]*?data-fps="24"/);
});

test("full emit and verification resolve the same main-root FPS", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    emit(plan, shared, output, { render: { fps: 60 } });
    assert.equal(resolveVerificationFps({ render: { fps: 24 } }, output), 60);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("canonical emit stages real voice files under the HyperFrames root", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    emit(plan, shared, output, {});

    assert.equal(readFileSync(join(output, "assets", "voice", "01.wav")).equals(VOICE01), true);
    assert.equal(readFileSync(join(output, "assets", "voice", "02.wav")).equals(VOICE02), true);
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
    const pinned = DEFAULT_GSAP_SRC;
    assert.equal(index.match(new RegExp(pinned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length, 1);
    assert.ok(captions.includes(`<script src="${pinned}">`));
    assert.doesNotMatch(index, new RegExp(`<template[^>]*>[\\s\\S]*?<script src="${pinned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}">`));
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
    assert.equal(readFileSync(join(output, "assets", "voice", "01.wav")).equals(VOICE01), true);
    assert.equal(readFileSync(join(output, "assets", "voice", "02.wav")).equals(VOICE02), true);
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
      /missing voice asset/,
    );
    assert.equal(readFileSync(join(output, "index.html"), "utf8"), "OLD INDEX\n");
    assert.equal(readFileSync(join(output, "compositions", "captions.html"), "utf8"), "OLD CAPTIONS\n");
    assert.equal(readFileSync(join(output, "assets", "voice", "prior.wav"), "utf8"), "PRIOR");
    assert.equal(readFileSync(join(output, "compositions", "frames", "authored.html"), "utf8"), "AUTHORED FRAME\n");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("captionsOnly emits staged standalone and embedded caption artifacts with the pinned CDN", () => {
  const { tmp, shared, output } = setup();
  const stagedOutput = join(tmp, "stage", "hyperframes");
  try {
    const plan = makePlan();
    mkdirSync(join(stagedOutput, "compositions"), { recursive: true });
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    emit(plan, shared, output, {});

    emit(plan, shared, stagedOutput, {}, { captionsOnly: true, runtimeSourceDir: output });

    const captions = readFileSync(join(stagedOutput, "compositions", "captions.html"), "utf8");
    const index = readFileSync(join(stagedOutput, "index.html"), "utf8");
    assert.ok(captions.includes(`<script src="${DEFAULT_GSAP_SRC}">`));
    assert.match(index, /<template id="captions-template"/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("captionsOnly validates local GSAP from the runtime source while writing to staging", () => {
  const { tmp, shared, output } = setup();
  const stagedOutput = join(tmp, "stage", "hyperframes");
  try {
    const plan = makePlan();
    mkdirSync(join(output, "assets", "gsap"), { recursive: true });
    mkdirSync(join(stagedOutput, "compositions"), { recursive: true });
    writeFileSync(join(output, "assets", "gsap", "gsap.min.js"), "CUSTOM GSAP");
    for (const frame of plan.frames) {
      writeFileSync(
        join(output, "compositions", "frames", `${frame.slug}.html`),
        authoredFrame(frame.slug, "assets/gsap/gsap.min.js"),
      );
    }
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    emit(plan, shared, output, { gsapSrc: "assets/gsap/gsap.min.js" });

    emit(plan, shared, stagedOutput, { gsapSrc: "assets/gsap/gsap.min.js" }, {
      captionsOnly: true,
      runtimeSourceDir: output,
    });

    const captions = readFileSync(join(stagedOutput, "compositions", "captions.html"), "utf8");
    assert.match(captions, /<script src="assets\/gsap\/gsap\.min\.js">/);
    assert.equal(existsSync(join(stagedOutput, "assets", "gsap", "gsap.min.js")), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("captionsOnly stages index without staging runtime or voices", () => {
  const { tmp, shared, output } = setup();
  const stagedOutput = join(tmp, "stage", "hyperframes");
  try {
    const plan = makePlan();
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    emit(plan, shared, output, {});
    rmSync(join(shared, "assets"), { recursive: true, force: true });
    mkdirSync(join(stagedOutput, "compositions"), { recursive: true });

    emit(plan, shared, stagedOutput, {}, { captionsOnly: true, runtimeSourceDir: output });

    assert.equal(existsSync(join(stagedOutput, "assets", "voice")), false);
    assert.equal(existsSync(join(stagedOutput, "hyperframes.json")), false);
    assert.equal(existsSync(join(stagedOutput, "index.html")), true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("flat emit preserves voice bytes without transaction residue", () => {
  const flat = mkdtempSync(join(tmpdir(), "emit-flat-"));
  try {
    const plan = makePlan();
    mkdirSync(join(flat, "assets", "voice"), { recursive: true });
    mkdirSync(join(flat, "compositions", "frames"), { recursive: true });
    writeFileSync(join(flat, "compositions", "frames", "01-a.html"), authoredFrame("01-a"));
    writeFileSync(join(flat, "compositions", "frames", "02-b.html"), authoredFrame("02-b"));
    writeFileSync(join(flat, "assets", "voice", "01.wav"), VOICE01);
    writeFileSync(join(flat, "assets", "voice", "02.wav"), VOICE02);
    writeFileSync(join(flat, "assets", "voice", "sentinel.wav"), "KEEP");
    writeFileSync(join(flat, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));

    emit(plan, flat, flat, {});

    assert.equal(readFileSync(join(flat, "assets", "voice", "01.wav")).equals(VOICE01), true);
    assert.equal(readFileSync(join(flat, "assets", "voice", "02.wav")).equals(VOICE02), true);
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
    mkdirSync(join(output, "assets", "gsap"), { recursive: true });
    writeFileSync(join(output, "assets", "gsap", "gsap.min.js"), "CUSTOM GSAP");
    for (const frame of plan.frames) {
      writeFileSync(
        join(output, "compositions", "frames", `${frame.slug}.html`),
        authoredFrame(frame.slug, "assets/gsap/gsap.min.js"),
      );
    }
    emit(plan, shared, output, { gsapSrc: "assets/gsap/gsap.min.js" });

    const index = readFileSync(join(output, "index.html"), "utf8");
    const captions = readFileSync(join(output, "compositions", "captions.html"), "utf8");
    // Embedded frame/caption templates are the only runtime source in a full emit.
    assert.doesNotMatch(index, /data-composition-src=/);
    assert.match(index, /<template id="01-a-template"/);
    assert.match(index, /<template id="02-b-template"/);
    assert.match(index, /<template id="captions-template"/);
    assert.ok(existsSync(join(output, "compositions", "frames", "01-a.html")));
    assert.ok(existsSync(join(output, "compositions", "frames", "02-b.html")));
    assert.ok(existsSync(join(output, "compositions", "captions.html")));
    // alternating host tracks stay above authored content tracks 0-9 + voice track 10
    assert.match(index, /id="el-01-a"[\s\S]*?data-track-index="20"/);
    assert.match(index, /id="el-02-b"[\s\S]*?data-track-index="21"/);
    assert.match(index, /id="el-captions"[\s\S]*?data-track-index="22"/);
    // one crossfade boundary (2 frames -> 1 transition): fade out prev + fade in next
    assert.match(index, /tl\.to\("#el-01-a", \{ opacity: 0/);
    assert.match(index, /tl\.fromTo\("#el-02-b"/);
    // explicit local gsapSrc remains project-root-relative in both emitted entry points
    assert.match(index, /<script src="assets\/gsap\/gsap\.min\.js">/);
    assert.match(captions, /<script src="assets\/gsap\/gsap\.min\.js">/);
    assert.doesNotMatch(index, /(?:^|["'])\.\.\//m);
    assert.doesNotMatch(captions, /(?:^|["'])\.\.\//m);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("legacy index generation without embedded templates retains source loading", () => {
  const index = buildIndexHtml(makePlan(), {}, []);
  assert.match(index, /data-composition-src="compositions\/frames\/01-a\.html"/);
  assert.match(index, /data-composition-src="compositions\/frames\/02-b\.html"/);
  assert.match(index, /data-composition-src="compositions\/captions\.html"/);
  assert.doesNotMatch(index, /<template id="01-a-template"/);
  assert.doesNotMatch(index, /<template id="captions-template"/);
});

test("outer caption host is non-intercepting without disabling visual frame hosts", () => {
  const index = buildIndexHtml(makePlan(), {}, []);
  const captionHost = index.match(/<div(?=[^>]*\bid="el-captions")[^>]*>/)?.[0];
  assert.ok(captionHost, "generated index contains the outer captions scene");
  assert.match(captionHost, /class="scene caption-host"/);
  assert.equal(index.match(/\.caption-host\s*\{\s*pointer-events:\s*none;\s*\}/g)?.length, 1);

  for (const slug of ["01-a", "02-b"]) {
    const frameHost = index.match(new RegExp(`<div(?=[^>]*\\bid="el-${slug}")[^>]*>`))?.[0];
    assert.ok(frameHost, `generated index contains visual frame host ${slug}`);
    assert.match(frameHost, /class="scene"/);
    assert.doesNotMatch(frameHost, /caption-host|pointer-events/);
  }
});

test("full emit embeds sanitized frame and caption templates while preserving authored files", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    const pinned = DEFAULT_GSAP_SRC;
    const firstFrame = join(output, "compositions", "frames", "01-a.html");
    const authored = authoredFrame("01-a").replace(
      `<script src="${pinned}"></script>`,
      `<script src="https://example.test/not-the-configured-gsap.js"></script>\n    <script src="${pinned}"></script>`,
    );
    writeFileSync(firstFrame, authored);
    const authoredBefore = readFileSync(firstFrame, "utf8");
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));

    emit(plan, shared, output, {});

    const index = readFileSync(join(output, "index.html"), "utf8");
    assert.doesNotMatch(index, /data-composition-src=/);
    for (const id of ["01-a", "02-b", "captions"]) {
      assert.match(index, new RegExp(`<template id="${id}-template"`));
      assert.doesNotMatch(
        index,
        new RegExp(`<template id="${id}-template"[^>]*\\bdata-composition-id=`),
        `embedded ${id} wrapper must not duplicate the mount composition ID`,
      );
      assert.match(
        index,
        new RegExp(`<div(?=[^>]*\\bid="el-${id}")(?=[^>]*\\bdata-composition-id="${id}")[^>]*>`),
        `embedded ${id} mount host keeps its composition ID`,
      );
      assert.match(
        index,
        new RegExp(`<template id="${id}-template"[^>]*>[\\s\\S]*?<div[^>]*\\bdata-composition-id="${id}"`),
        `embedded ${id} template keeps its authored composition root ID`,
      );
    }
    assert.match(index, /https:\/\/example\.test\/not-the-configured-gsap\.js/);
    assert.equal(
      index.match(new RegExp(DEFAULT_GSAP_SRC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length,
      1,
    );
    assert.equal(readFileSync(firstFrame, "utf8"), authoredBefore, "full emit must not rewrite authored frames");
    assert.match(readFileSync(join(output, "compositions", "captions.html"), "utf8"), new RegExp(pinned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("local GSAP is loaded once by the composed index and remains in standalone files", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    const gsapSrc = "assets/gsap/gsap.min.js";
    mkdirSync(join(output, "assets", "gsap"), { recursive: true });
    writeFileSync(join(output, gsapSrc), "CUSTOM GSAP");
    for (const frame of plan.frames) {
      writeFileSync(
        join(output, "compositions", "frames", `${frame.slug}.html`),
        authoredFrame(frame.slug, gsapSrc),
      );
    }
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));

    emit(plan, shared, output, { gsapSrc });

    const index = readFileSync(join(output, "index.html"), "utf8");
    const captions = readFileSync(join(output, "compositions", "captions.html"), "utf8");
    assert.deepEqual(index.match(/assets\/gsap\/gsap\.min\.js/g), [gsapSrc]);
    assert.deepEqual(captions.match(/assets\/gsap\/gsap\.min\.js/g), [gsapSrc]);
    for (const frame of plan.frames) {
      const standalone = readFileSync(join(output, "compositions", "frames", `${frame.slug}.html`), "utf8");
      assert.deepEqual(standalone.match(/assets\/gsap\/gsap\.min\.js/g), [gsapSrc]);
      const embedded = index.match(new RegExp(`<template id="${frame.slug}-template"[\\s\\S]*?<\\/template>`))?.[0] ?? "";
      assert.doesNotMatch(embedded, /assets\/gsap\/gsap\.min\.js/);
    }
    const embeddedCaptions = index.match(/<template id="captions-template"[\s\S]*?<\/template>/)?.[0] ?? "";
    assert.doesNotMatch(embeddedCaptions, /assets\/gsap\/gsap\.min\.js/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("caption styles, content, and initialization stay inside the captions composition root", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    emit(plan, shared, output, {});

    const captions = readFileSync(join(output, "compositions", "captions.html"), "utf8");
    assert.match(
      captions,
      /<div[^>]*data-composition-id="captions"[\s\S]*?<style data-brand-tokens>[\s\S]*?<div class="caption-layer"[\s\S]*?var GROUPS = [\s\S]*?<\/script>[\s\S]*?<\/div>[\s\S]*?<\/template>/,
    );
    const rootStart = captions.indexOf('data-composition-id="captions"');
    const rootEnd = captions.lastIndexOf("</div>");
    assert.ok(captions.indexOf("<style data-brand-tokens>") > rootStart);
    assert.ok(captions.indexOf("var GROUPS =") > rootStart);
    assert.ok(captions.indexOf("var GROUPS =") < rootEnd);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("HTML-aware template sanitization removes only an exact src attribute from the balanced matching template", () => {
  const gsapSrc = "assets/gsap/gsap.min.js";
  const html = `<!doctype html><html><body>
<!-- <template data-composition-id="target"><script src="${gsapSrc}"></script></template> -->
<template title="closing > text" data-composition-id='target'>
  <div title='src="${gsapSrc}"' data-composition-id="target">
    <template data-composition-id="nested"><div data-composition-id="nested"></div></template>
  </div>
  <script data-src="${gsapSrc}"></script>
  <script x-src='${gsapSrc}'></script>
  <script :src="${gsapSrc}"></script>
  <script title='src="${gsapSrc}"'></script>
  <script defer src='${gsapSrc}' data-note="a > b"></script>
  <script>window.__timelines["target"] = gsap.timeline({ paused: true });</script>
</template>
<template data-composition-id="other"><div data-composition-id="other"></div></template>
</body></html>`;

  const sanitized = sanitizeCompositionTemplate(html, "target", gsapSrc, "frame.html");
  assert.match(sanitized, /^<template id="target-template">/);
  assert.doesNotMatch(sanitized, /^<template id="target-template"[^>]*\bdata-composition-id=/);
  assert.match(sanitized, /<div title='src="assets\/gsap\/gsap\.min\.js"' data-composition-id="target">/);
  assert.match(sanitized, /data-composition-id="nested"/);
  assert.match(sanitized, new RegExp(`data-src="${gsapSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(sanitized, new RegExp(`x-src='${gsapSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`));
  assert.match(sanitized, new RegExp(`:src="${gsapSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.doesNotMatch(sanitized, /<script defer src=/);
  assert.doesNotMatch(sanitized, /data-composition-id="other"/);
});

test("raw script and style scanning requires exact mixed-case closing tag boundaries", () => {
  const gsapSrc = "assets/gsap/gsap.min.js";
  const html = `<template data-composition-id="target">
<div data-composition-id="target"></div>
<script src="${gsapSrc}">const text = "</scriptx><template data-composition-id='decoy'>"; const other = "</script-foo>";</ScRiPt>
<style>.x::after { content: "</stylex><template data-composition-id='style-decoy'> </style-foo>"; }</StYlE>
<script>window.__timelines["target"] = gsap.timeline({ paused: true });</script>
</template>`;

  const sanitized = sanitizeCompositionTemplate(html, "target", gsapSrc, "frame.html");
  assert.doesNotMatch(sanitized, new RegExp(gsapSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(sanitized, /style-decoy/);
  assert.match(sanitized, /window\.__timelines/);
});

test("template sanitization moves every top-level sibling style into the matching composition root", () => {
  const gsapSrc = "assets/gsap/gsap.min.js";
  const firstStyle = `<style data-order="first">
/* quoted > and comment stay raw */
.frame::after { content: "</stylex> >"; }
</style>`;
  const secondStyle = `<style data-order='second'>
/* second block */
.frame { background: linear-gradient(90deg, #fff, #000); }
</style>`;
  const existingStyle = `<style data-order="existing">.existing { position: absolute; }</style>`;
  const nestedStyle = `<template data-composition-id="nested"><style>.nested { color: red; }</style><div data-composition-id="nested"></div></template>`;
  const html = `<template data-composition-id="target">
${firstStyle}
<!-- keep transport comment -->
<div id="target-root" title="root > content" data-composition-id="target">
  ${existingStyle}
  <div class="frame">Frame</div>
  ${nestedStyle}
</div>
${secondStyle}
<script data-transport="keep">window.transport = true;</script>
<script src="${gsapSrc}"></script>
<script>window.__timelines["target"] = gsap.timeline({ paused: true });</script>
</template>`;

  const sanitized = sanitizeCompositionTemplate(html, "target", gsapSrc, "frame.html");
  const rootStart = sanitized.indexOf('data-composition-id="target"', sanitized.indexOf("<div"));
  const rootOpenEnd = sanitized.indexOf(">", rootStart) + 1;
  const rootClose = sanitized.lastIndexOf("</div>");
  const rootInner = sanitized.slice(rootOpenEnd, rootClose);
  const outsideRoot = sanitized.slice(0, rootOpenEnd) + sanitized.slice(rootClose);

  assert.equal(sanitized.match(/data-order="first"/g)?.length, 1);
  assert.equal(sanitized.match(/data-order='second'/g)?.length, 1);
  assert.equal(sanitized.match(/data-order="existing"/g)?.length, 1);
  assert.ok(rootInner.indexOf(firstStyle) < rootInner.indexOf(existingStyle));
  assert.ok(rootInner.indexOf(existingStyle) < rootInner.indexOf(secondStyle));
  assert.doesNotMatch(outsideRoot, /<style\b/i);
  assert.match(rootInner, /content: "<\/stylex> >"/);
  assert.match(rootInner, /<template data-composition-id="nested"><style>/);
  assert.match(sanitized, /<!-- keep transport comment -->/);
  assert.match(sanitized, /<script data-transport="keep">/);
  assert.doesNotMatch(sanitized, new RegExp(`<script src="${gsapSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}">`));
  assert.equal(html.includes(firstStyle) && html.includes(secondStyle), true, "authored source value remains unchanged");
});

test("template sanitization transports top-level styles and scripts into the matching root in source order", () => {
  const gsapSrc = "assets/gsap/gsap.min.js";
  const preStyle = `<style data-order="pre-style">/* > in comment */ .pre::after { content: ">"; }</style>`;
  const preScript = `<script data-order="pre-script">const pre = "</scriptx> >";</script>`;
  const existingStyle = `<style data-order="root-style">.root { color: rgb(20, 20, 19); }</style>`;
  const existingScript = `<script data-order="root-script">const rootPhase = ">";</script>`;
  const postScript = `<script src="https://example.test/retained.js" data-order="post-script"></script>`;
  const postStyle = `<style data-order="post-style">.post { color: rgb(204, 120, 92); }</style>`;
  const nestedTemplate = `<template data-composition-id="nested"><style data-order="nested-style">.nested { color: red; }</style><script data-order="nested-script">window.nested = true;</script><div data-composition-id="nested"></div></template>`;
  const authored = `<template data-composition-id="target">
${preStyle}
${preScript}
<!-- transport comment stays outside because arbitrary nodes are not moved -->
<div id="target-root" title="quoted > attribute" data-composition-id="target">
  ${existingStyle}
  <div class="root">Frame</div>
  ${existingScript}
  ${nestedTemplate}
</div>
<script defer src="${gsapSrc}" data-note="configured > source"></script>
${postScript}
${postStyle}
</template>`;

  const sanitized = sanitizeCompositionTemplate(authored, "target", gsapSrc, "frame.html");
  const rootStart = sanitized.indexOf('<div id="target-root"');
  const rootOpenEnd = sanitized.indexOf(">", rootStart) + 1;
  const rootClose = sanitized.lastIndexOf("</div>");
  const rootInner = sanitized.slice(rootOpenEnd, rootClose);
  const outsideRoot = sanitized.slice(0, rootOpenEnd) + sanitized.slice(rootClose);

  const expectedOrder = [preStyle, preScript, existingStyle, existingScript, nestedTemplate, postScript, postStyle];
  let previous = -1;
  for (const node of expectedOrder) {
    const position = rootInner.indexOf(node);
    assert.ok(position > previous, `transport order for ${node.slice(0, 36)}`);
    previous = position;
  }
  assert.doesNotMatch(outsideRoot, /<(?:style|script)\b/i);
  assert.doesNotMatch(sanitized, new RegExp(gsapSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(rootInner, /<script src="https:\/\/example\.test\/retained\.js"/);
  assert.match(rootInner, /const pre = "<\/scriptx> >"/);
  assert.match(rootInner, /data-order="nested-style"/);
  assert.match(rootInner, /data-order="nested-script"/);
  assert.match(sanitized, /transport comment stays outside/);
  assert.equal(
    sanitizeCompositionTemplate(sanitized, "target", gsapSrc, "frame.html"),
    sanitized,
    "sanitization must be idempotent",
  );
  assert.equal(authored.includes(preStyle) && authored.includes(postScript), true, "standalone source bytes remain unchanged");
});

test("reserved template lookup and replacement ignore nested decoys and reject ambiguous top-level matches", () => {
  const nestedDecoy = `<template id="frame-template"><div data-composition-id="frame"><template id="captions-template">DECOY</template></div></template>`;
  const realTemplate = `<template id="captions-template"><div data-composition-id="captions">REAL</div></template>`;
  const html = `${nestedDecoy}\n${realTemplate}`;

  assert.equal(
    extractTemplateById(html, "captions-template")?.trim(),
    `<div data-composition-id="captions">REAL</div>`,
  );
  const replaced = replaceTemplateById(
    html,
    "captions-template",
    `<template id="captions-template"><div data-composition-id="captions">UPDATED</div></template>`,
  );
  assert.match(replaced, /<template id="captions-template">DECOY<\/template>/);
  assert.equal(
    extractTemplateById(replaced, "captions-template")?.trim(),
    `<div data-composition-id="captions">UPDATED</div>`,
  );

  const ambiguous = `${realTemplate}\n${realTemplate.replace("REAL", "SECOND")}`;
  assert.throws(
    () => extractTemplateById(ambiguous, "captions-template"),
    /multiple top-level.*captions-template/i,
  );
  assert.throws(
    () => replaceTemplateById(ambiguous, "captions-template", realTemplate),
    /multiple top-level.*captions-template/i,
  );
  assert.equal(extractTemplateById(nestedDecoy, "missing-template"), undefined);
  assert.throws(
    () => replaceTemplateById(nestedDecoy, "missing-template", realTemplate),
    /missing embedded template #missing-template/,
  );
});

test("captions-only refresh replaces the real top-level captions template instead of an authored nested decoy", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    const firstFrame = join(output, "compositions", "frames", "01-a.html");
    writeFileSync(
      firstFrame,
      authoredFrame("01-a").replace(
        `data-duration="2"></div>`,
        `data-duration="2"><template id="captions-template">DECOY</template></div>`,
      ),
    );
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    emit(plan, shared, output, {});

    const changedGroups = [{
      id: "changed",
      frame: 1,
      start: 0,
      end: 2,
      text: "Changed runtime captions.",
      words: [{ id: "changed-word", text: "Changed", start: 0, end: 2 }],
    }];
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: changedGroups }));
    emit(plan, shared, output, {}, { captionsOnly: true });

    const index = readFileSync(join(output, "index.html"), "utf8");
    assert.match(index, /<template id="captions-template">DECOY<\/template>/);
    const runtimeCaptions = extractTemplateById(index, "captions-template") ?? "";
    assert.match(runtimeCaptions, /Changed runtime captions\./);
    assert.doesNotMatch(runtimeCaptions, /DECOY/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("template preparation rejects missing, malformed, and mismatched authored templates", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    const frame = join(output, "compositions", "frames", "01-a.html");
    for (const [body, expected] of [
      ["<html><body></body></html>", /composition <template>/],
      ["<template data-composition-id='01-a'><div data-composition-id='01-a'></div>", /unclosed.*template/i],
      ["<template data-composition-id='wrong'><div data-composition-id='01-a'></div></template>", /template.*composition id/i],
      ["<template data-composition-id='01-a'><div data-composition-id='wrong'></div></template>", /root.*composition id/i],
    ] as const) {
      writeFileSync(frame, body);
      assert.throws(() => preflight(plan, shared, output, {}), expected);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("emit consumes preflight-prepared frame templates without reparsing authored files", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    const prepared = preflight(plan, shared, output, {});
    writeFileSync(join(output, "compositions", "frames", "01-a.html"), "MALFORMED AFTER PREFLIGHT");

    emit(plan, shared, output, {}, { prepared });

    const index = readFileSync(join(output, "index.html"), "utf8");
    assert.match(index, /<template id="01-a-template"/);
    assert.equal(readFileSync(join(output, "compositions", "frames", "01-a.html"), "utf8"), "MALFORMED AFTER PREFLIGHT");
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

test("captionsOnly refreshes standalone and embedded captions without changing frame templates", () => {
  const { tmp, shared, output } = setup();
  try {
    const plan = makePlan();
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: plan.captionGroups }));
    // first a full emit, then mutate the on-disk groups and re-emit captions-only
    emit(plan, shared, output, {});
    const indexBefore = readFileSync(join(output, "index.html"), "utf8");
    const frameTemplateBefore = indexBefore.match(/<template id="01-a-template"[\s\S]*?<\/template>/)?.[0];

    const mutated = { groups: [{ id: "g", frame: 1, start: 0, end: 2, text: "Changed.", words: [{ id: "w", text: "Changed.", start: 0, end: 2 }] }] };
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify(mutated));
    emit(plan, shared, output, {}, { captionsOnly: true });

    const indexAfter = readFileSync(join(output, "index.html"), "utf8");
    assert.notEqual(indexAfter, indexBefore);
    assert.match(indexAfter, /<template id="captions-template"[\s\S]*?"text":"Changed\."/);
    assert.equal(
      indexAfter.match(/<template id="01-a-template"[\s\S]*?<\/template>/)?.[0],
      frameTemplateBefore,
    );
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

test("caption emission rejects insufficient baseline ink/canvas contrast", () => {
  const plan = makePlan();
  assert.throws(
    () => buildCaptionsHtml(plan, plan.captionGroups, {
      captions: {
        tokens: {
          "--cap-ink": "#141413",
          "--cap-canvas": "#1b1a18",
        },
      },
    }),
    /caption_contrast_insufficient frame=captions foreground=#141413 background=#1b1a18 ratio=1\.\d{2} threshold=4\.50/,
  );
});

test("caption emission rejects configured upcoming-state contrast below the threshold", () => {
  const plan = makePlan();
  assert.throws(
    () => buildCaptionsHtml(plan, plan.captionGroups, {
      captions: {
        tokens: {
          "--cap-ink": "#767676",
          "--cap-canvas": "#fff",
        },
      },
    }),
    /caption_contrast_insufficient frame=captions state=upcoming foreground=#767676 canvas=#fff mix=61% effective=#ababab ratio=2\.29 threshold=4\.50/,
  );
});

test("caption emission accepts configured colors whose full and upcoming states pass", () => {
  const plan = makePlan();
  const captions = buildCaptionsHtml(plan, plan.captionGroups, {
    captions: {
      tokens: {
        "--cap-ink": "#000",
        "--cap-canvas": "#fff",
      },
    },
  });
  assert.match(captions, /--cap-ink: #000;/);
  assert.match(captions, /--cap-canvas: #fff;/);
});

test("caption emission keeps the existing valid default token values", () => {
  const plan = makePlan();
  const captions = buildCaptionsHtml(plan, plan.captionGroups, {});
  for (const token of [
    "--ink: #141413;",
    "--cream: #FAF9F5;",
    "--tile: #EFE9DE;",
    "--tile-strong: #ECE3D4;",
    "--coral: #CC785C;",
    "--cap-ink: #141413;",
    "--cap-canvas: #FAF9F5;",
    "--cap-accent: #CC785C;",
    "--cap-band-height: 200px;",
    '--font-display: "EB Garamond";',
  ]) {
    assert.match(captions, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("caption skin upcoming words meet the normal-text contrast gate", () => {
  const skin = readFileSync(new URL("../templates/caption-skin.html", import.meta.url), "utf8");
  const upcoming = skin.match(
    /\.caption-word\s*\{[\s\S]*?color:\s*color-mix\(in srgb,\s*var\(--cap-ink,\s*(#[0-9a-f]+)\)\s+(\d+)%\s*,\s*var\(--cap-canvas,\s*(#[0-9a-f]+)\)\s*\)/i,
  );
  assert.ok(upcoming, "caption skin declares a literal ink/canvas upcoming-state mix");
  const ink = parseCssColor(upcoming[1]);
  assert.equal(Number(upcoming[2]), UPCOMING_CAPTION_INK_PERCENT);
  const inkWeight = UPCOMING_CAPTION_INK_PERCENT / 100;
  const canvas = parseCssColor(upcoming[3]);
  const effective = {
    red: ink.red * inkWeight + canvas.red * (1 - inkWeight),
    green: ink.green * inkWeight + canvas.green * (1 - inkWeight),
    blue: ink.blue * inkWeight + canvas.blue * (1 - inkWeight),
    alpha: 1,
  };
  for (const background of [canvas, parseCssColor("#f6f0e5"), parseCssColor("#faf7f0")]) {
    assert.ok(
      contrastRatio(effective, background) >= 4.5,
      `upcoming caption contrast must be >= 4.5:1, got ${contrastRatio(effective, background).toFixed(2)}:1`,
    );
  }
  assert.match(skin, /\.caption-word\.is-active\s*\{[\s\S]*?color:\s*var\(--cap-ink,\s*#141413\)/);
  assert.match(skin, /\.caption-word\.is-spoken\s*\{[\s\S]*?color:\s*var\(--cap-ink,\s*#141413\)/);
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
