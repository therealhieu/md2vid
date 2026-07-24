import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emit } from "../emit.ts";
import type { BuildPlan, VideoConfig } from "../../../engine/types.ts";

function fixture(): { plan: BuildPlan; config: VideoConfig } {
  const plan: BuildPlan = {
    version: 1,
    canvas: { width: 1920, height: 1080 },
    timing: { tail: 0.5, xfade: 0.5, gap: 0.5 },
    totalDuration: 2.0,
    frames: [
      { id: "01", frameNum: 1, slug: "01-cover", voicePath: "assets/voice/01.wav",
        voiceDur: 1.0, frameDur: 1.5, start: 0,
        words: [{ text: "hello", start: 0, end: 0.5 }] },
      { id: "02", frameNum: 2, slug: "02-idea", voicePath: "assets/voice/02.wav",
        voiceDur: 1.0, frameDur: 1.0, start: 1.0,
        words: [{ text: "world", start: 0, end: 0.5 }] },
    ],
    captionGroups: [
      { id: "caption-group-0", frame: 1, start: 0, end: 0.5, text: "hello",
        words: [{ id: "caption-word-0-0", text: "hello", start: 0, end: 0.5 }] },
    ],
  };
  return { plan, config: { framework: "remotion" } };
}

test("remotion emit writes build_plan.json and stages voices into public/", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-emit-"));
  try {
    const shared = join(tmp, "shared");
    const output = join(tmp, "remotion");
    mkdirSync(join(shared, "assets", "voice"), { recursive: true });
    mkdirSync(output, { recursive: true });
    // caption_groups.json is the regrouped source of truth emit re-reads.
    writeFileSync(join(shared, "caption_groups.json"),
      JSON.stringify({ groups: fixture().plan.captionGroups }) + "\n");
    // stub the two voice wavs emit should copy
    writeFileSync(join(shared, "assets", "voice", "01.wav"), "RIFF01");
    writeFileSync(join(shared, "assets", "voice", "02.wav"), "RIFF02");

    const { plan, config } = fixture();
    emit(plan, shared, output, config);

    const written = JSON.parse(readFileSync(join(output, "build_plan.json"), "utf8"));
    assert.equal(written.version, 1);
    assert.equal(written.frames.length, 2);
    assert.ok(existsSync(join(output, "public", "assets", "voice", "01.wav")), "voice 01 staged");
    assert.ok(existsSync(join(output, "public", "assets", "voice", "02.wav")), "voice 02 staged");
    assert.ok(existsSync(join(output, "src", "Root.tsx")), "src scaffolded on first emit");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("remotion emit serializes on-disk regrouped caption groups", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-emit-groups-"));
  try {
    const shared = join(tmp, "shared");
    const output = join(tmp, "remotion");
    mkdirSync(join(shared, "assets", "voice"), { recursive: true });
    mkdirSync(output, { recursive: true });
    writeFileSync(join(shared, "assets", "voice", "01.wav"), "RIFF01");
    writeFileSync(join(shared, "assets", "voice", "02.wav"), "RIFF02");
    const diskGroups = [{ ...fixture().plan.captionGroups[0], text: "from disk" }];
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: diskGroups }));

    emit(fixture().plan, shared, output, fixture().config);

    const written = JSON.parse(readFileSync(join(output, "build_plan.json"), "utf8"));
    assert.deepEqual(written.captionGroups, diskGroups);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("remotion emit fills missing runtime files without overwriting authored src", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-emit-runtime-"));
  try {
    const shared = join(tmp, "shared");
    const output = join(tmp, "remotion");
    mkdirSync(join(shared, "assets", "voice"), { recursive: true });
    mkdirSync(join(output, "src"), { recursive: true });
    writeFileSync(join(output, "src", "Root.tsx"), "// authored root\n");
    writeFileSync(join(shared, "caption_groups.json"),
      JSON.stringify({ groups: fixture().plan.captionGroups }) + "\n");
    writeFileSync(join(shared, "assets", "voice", "01.wav"), "RIFF01");
    writeFileSync(join(shared, "assets", "voice", "02.wav"), "RIFF02");

    const { plan, config } = fixture();
    emit(plan, shared, output, config);

    assert.equal(readFileSync(join(output, "src", "Root.tsx"), "utf8"), "// authored root\n");
    assert.ok(existsSync(join(output, "src", "index.ts")), "missing src template filled");
    assert.ok(existsSync(join(output, "render.ts")), "missing root template filled");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("remotion captionsOnly emits build_plan.json into a staging output", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-emit-stage-"));
  try {
    const shared = join(tmp, "stage", "shared");
    const output = join(tmp, "stage", "remotion");
    mkdirSync(shared, { recursive: true });
    mkdirSync(output, { recursive: true });
    const groups = [{ ...fixture().plan.captionGroups[0], text: "staged" }];
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups }));

    emit(fixture().plan, shared, output, fixture().config, { captionsOnly: true });

    const written = JSON.parse(readFileSync(join(output, "build_plan.json"), "utf8"));
    assert.deepEqual(written.captionGroups, groups);
    assert.equal(existsSync(join(output, "src")), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("remotion emit with captionsOnly refreshes build_plan.json without re-scaffolding src", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-emit-co-"));
  try {
    const shared = join(tmp, "shared");
    const output = join(tmp, "remotion");
    mkdirSync(join(shared, "assets", "voice"), { recursive: true });
    mkdirSync(join(output, "src"), { recursive: true });
    writeFileSync(join(output, "src", "Root.tsx"), "// sentinel — must not be overwritten\n");
    writeFileSync(join(shared, "caption_groups.json"),
      JSON.stringify({ groups: fixture().plan.captionGroups }) + "\n");
    writeFileSync(join(shared, "assets", "voice", "01.wav"), "RIFF01");
    writeFileSync(join(shared, "assets", "voice", "02.wav"), "RIFF02");

    const { plan, config } = fixture();
    emit(plan, shared, output, config, { captionsOnly: true });

    assert.ok(existsSync(join(output, "build_plan.json")), "plan refreshed");
    assert.equal(readFileSync(join(output, "src", "Root.tsx"), "utf8"),
      "// sentinel — must not be overwritten\n", "captionsOnly must not re-scaffold src");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("late missing WAV preserves prior outputs after runtime scaffolding", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-emit-missing-"));
  try {
    const shared = join(tmp, "shared");
    const output = join(tmp, "remotion");
    mkdirSync(join(shared, "assets", "voice"), { recursive: true });
    mkdirSync(join(output, "public", "assets", "voice"), { recursive: true });
    mkdirSync(join(output, "src"), { recursive: true });
    writeFileSync(join(shared, "assets", "voice", "01.wav"), "NEW01");
    writeFileSync(join(output, "src", "Root.tsx"), "AUTHORED\n");
    writeFileSync(join(output, "build_plan.json"), "OLD PLAN\n");
    writeFileSync(join(output, "public", "assets", "voice", "prior.wav"), "PRIOR");
    writeFileSync(
      join(shared, "caption_groups.json"),
      JSON.stringify({ groups: fixture().plan.captionGroups }),
    );

    assert.throws(
      () => emit(fixture().plan, shared, output, fixture().config),
      /FAIL \[remotion:emit\]: missing voice asset assets\/voice\/02\.wav/,
    );
    assert.equal(readFileSync(join(output, "build_plan.json"), "utf8"), "OLD PLAN\n");
    assert.deepEqual(readdirSync(join(output, "public", "assets", "voice")), ["prior.wav"]);
    assert.equal(
      readFileSync(join(output, "public", "assets", "voice", "prior.wav"), "utf8"),
      "PRIOR",
    );
    assert.equal(
      existsSync(join(output, "public", "assets", "voice", "01.wav")),
      false,
      "available voices must not be partially promoted",
    );
    assert.equal(readFileSync(join(output, "src", "Root.tsx"), "utf8"), "AUTHORED\n");
    assert.ok(existsSync(join(output, "src", "index.ts")), "runtime is ensured before staging");
    assert.ok(existsSync(join(output, "render.ts")), "root runtime is ensured before staging");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("full emit replaces stale public voice files with the complete plan set", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-emit-replace-"));
  try {
    const shared = join(tmp, "shared");
    const output = join(tmp, "remotion");
    mkdirSync(join(shared, "assets", "voice"), { recursive: true });
    mkdirSync(join(output, "public", "assets", "voice"), { recursive: true });
    writeFileSync(join(shared, "assets", "voice", "01.wav"), "NEW01");
    writeFileSync(join(shared, "assets", "voice", "02.wav"), "NEW02");
    writeFileSync(join(output, "public", "assets", "voice", "stale.wav"), "STALE");
    writeFileSync(
      join(shared, "caption_groups.json"),
      JSON.stringify({ groups: fixture().plan.captionGroups }),
    );

    emit(fixture().plan, shared, output, fixture().config);

    assert.equal(existsSync(join(output, "public", "assets", "voice", "stale.wav")), false);
    assert.equal(
      readFileSync(join(output, "public", "assets", "voice", "01.wav"), "utf8"),
      "NEW01",
    );
    assert.equal(
      readFileSync(join(output, "public", "assets", "voice", "02.wav"), "utf8"),
      "NEW02",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("captionsOnly updates build_plan.json without runtime or public voice changes", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-emit-captions-only-"));
  try {
    const shared = join(tmp, "shared");
    const output = join(tmp, "remotion");
    mkdirSync(shared, { recursive: true });
    mkdirSync(join(output, "public", "assets", "voice"), { recursive: true });
    writeFileSync(join(output, "public", "assets", "voice", "sentinel.wav"), "KEEP");
    const groups = [{ ...fixture().plan.captionGroups[0], text: "regrouped" }];
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups }));

    emit(fixture().plan, shared, output, fixture().config, { captionsOnly: true });

    const written = JSON.parse(readFileSync(join(output, "build_plan.json"), "utf8"));
    assert.deepEqual(written.captionGroups, groups);
    assert.equal(existsSync(join(output, "src")), false, "captionsOnly must not ensure runtime");
    assert.equal(
      readFileSync(join(output, "public", "assets", "voice", "sentinel.wav"), "utf8"),
      "KEEP",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
