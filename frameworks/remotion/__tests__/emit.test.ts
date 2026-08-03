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
import {
  readRemotionBindingSpec,
  resolveRemotionBindings,
  type RemotionBindingSpec,
} from "../visual_bindings.ts";
import type { BuildPlan, VideoConfig } from "../../../engine/types.ts";
import { makePcmWav } from "../../../test/helpers/wav.ts";
import { verifyVisualSync } from "../../../engine/visual_sync.ts";

const VOICE01 = makePcmWav({ sampleRate: 48_000, sampleFrames: 48_000 });
const VOICE02 = Buffer.from(VOICE01);
VOICE02[VOICE02.length - 1] = 1;

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
    writeFileSync(join(shared, "assets", "voice", "01.wav"), VOICE01);
    writeFileSync(join(shared, "assets", "voice", "02.wav"), VOICE02);

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
    writeFileSync(join(shared, "assets", "voice", "01.wav"), VOICE01);
    writeFileSync(join(shared, "assets", "voice", "02.wav"), VOICE02);
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
    writeFileSync(join(shared, "assets", "voice", "01.wav"), VOICE01);
    writeFileSync(join(shared, "assets", "voice", "02.wav"), VOICE02);

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
    writeFileSync(join(shared, "assets", "voice", "01.wav"), VOICE01);
    writeFileSync(join(shared, "assets", "voice", "02.wav"), VOICE02);

    const { plan, config } = fixture();
    emit(plan, shared, output, config, { captionsOnly: true });

    assert.ok(existsSync(join(output, "build_plan.json")), "plan refreshed");
    assert.equal(readFileSync(join(output, "src", "Root.tsx"), "utf8"),
      "// sentinel — must not be overwritten\n", "captionsOnly must not re-scaffold src");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("missing WAV preserves prior outputs before runtime scaffolding", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-emit-missing-"));
  try {
    const shared = join(tmp, "shared");
    const output = join(tmp, "remotion");
    mkdirSync(join(shared, "assets", "voice"), { recursive: true });
    mkdirSync(join(output, "public", "assets", "voice"), { recursive: true });
    mkdirSync(join(output, "src"), { recursive: true });
    writeFileSync(join(shared, "assets", "voice", "01.wav"), VOICE01);
    writeFileSync(join(output, "src", "Root.tsx"), "AUTHORED\n");
    writeFileSync(join(output, "build_plan.json"), "OLD PLAN\n");
    writeFileSync(join(output, "public", "assets", "voice", "prior.wav"), "PRIOR");
    writeFileSync(
      join(shared, "caption_groups.json"),
      JSON.stringify({ groups: fixture().plan.captionGroups }),
    );

    assert.throws(
      () => emit(fixture().plan, shared, output, fixture().config),
      /missing voice asset assets\/voice\/02\.wav/,
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
    assert.equal(existsSync(join(output, "src", "index.ts")), false, "preflight must run before runtime writes");
    assert.equal(existsSync(join(output, "render.ts")), false, "preflight must run before root runtime writes");
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
    writeFileSync(join(shared, "assets", "voice", "01.wav"), VOICE01);
    writeFileSync(join(shared, "assets", "voice", "02.wav"), VOICE02);
    writeFileSync(join(output, "public", "assets", "voice", "stale.wav"), "STALE");
    writeFileSync(
      join(shared, "caption_groups.json"),
      JSON.stringify({ groups: fixture().plan.captionGroups }),
    );

    emit(fixture().plan, shared, output, fixture().config);

    assert.equal(existsSync(join(output, "public", "assets", "voice", "stale.wav")), false);
    assert.equal(
      readFileSync(join(output, "public", "assets", "voice", "01.wav")).equals(VOICE01),
      true,
    );
    assert.equal(
      readFileSync(join(output, "public", "assets", "voice", "02.wav")).equals(VOICE02),
      true,
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

function visualFixture(): { plan: BuildPlan; config: VideoConfig } {
  return {
    config: { framework: "remotion", visualSync: { mode: "required" } },
    plan: {
      version: 1,
      canvas: { width: 1920, height: 1080 },
      timing: { tail: 0.5, xfade: 0.5, gap: 0.5 },
      totalDuration: 17,
      frames: [{
        id: "reserve-flow",
        frameNum: 1,
        slug: "reserve-flow",
        voicePath: "assets/voice/01.wav",
        voiceDur: 16,
        frameDur: 17,
        start: 0,
        words: [],
        visualKind: "workflow",
        visualBeats: [
          { version: 1, id: "reserve", text: "Reserve", start: 2.95, cueWordIndex: 0, cueText: "reserve", sourceRefs: [], workflowStep: 1, tolerance: { maxLead: 0.25, maxLag: 0.75 } },
          { version: 1, id: "execute", text: "Execute", start: 11.06, cueWordIndex: 1, cueText: "execute", sourceRefs: [], workflowStep: 2, tolerance: { maxLead: 0.25, maxLag: 0.75 } },
          { version: 1, id: "settle", text: "Settle", start: 14.35, cueWordIndex: 2, cueText: "settle", sourceRefs: [], workflowStep: 3, tolerance: { maxLead: 0.25, maxLag: 0.75 } },
        ],
      }],
      captionGroups: [],
    },
  };
}

function registry(): RemotionBindingSpec {
  return {
    version: 1,
    frames: {
      "reserve-flow": [
        { beat: "reserve", target: "WorkflowStep:reserve", enter: "rise", duration: 0.5 },
        { beat: "execute", target: "WorkflowStep:execute", enter: "rise", duration: 0.5 },
        { beat: "settle", target: "WorkflowStep:settle", enter: "rise", duration: 0.5 },
      ],
    },
  };
}

test("Remotion reads static JSON bindings without importing authored TSX", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-static-bindings-"));
  try {
    const path = join(tmp, "visual_bindings.json");
    writeFileSync(path, JSON.stringify(registry()));
    writeFileSync(join(tmp, "BrokenScene.tsx"), "not valid TypeScript(");

    const resolved = resolveRemotionBindings(readRemotionBindingSpec(path), visualFixture().plan);

    assert.equal(Object.getPrototypeOf(resolved.runtimeBindings), null);
    assert.deepEqual(Object.entries(resolved.runtimeBindings), Object.entries(registry().frames));
    assert.deepEqual(resolved.manifest, {
      version: 1,
      framework: "remotion",
      bindings: [
        { frameSlug: "reserve-flow", beatId: "reserve", target: "WorkflowStep:reserve", revealStart: 89 / 30, revealDuration: 0.5, source: "custom", authoredDuration: 16, outerDuration: 17 },
        { frameSlug: "reserve-flow", beatId: "execute", target: "WorkflowStep:execute", revealStart: 332 / 30, revealDuration: 0.5, source: "custom", authoredDuration: 16, outerDuration: 17 },
        { frameSlug: "reserve-flow", beatId: "settle", target: "WorkflowStep:settle", revealStart: 431 / 30, revealDuration: 0.5, source: "custom", authoredDuration: 16, outerDuration: 17 },
      ],
      frames: [{ frameSlug: "reserve-flow", authoredDuration: 16, outerDuration: 17 }],
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("Remotion static registry rejects duplicate targets and unknown plan references", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-static-bindings-invalid-"));
  try {
    const path = join(tmp, "visual_bindings.json");
    writeFileSync(path, JSON.stringify({
      ...registry(),
      frames: {
        "reserve-flow": [
          { beat: "reserve", target: "WorkflowStep:shared", enter: "rise", duration: 0.5 },
          { beat: "execute", target: "WorkflowStep:shared", enter: "rise", duration: 0.5 },
        ],
      },
    }));
    assert.throws(() => readRemotionBindingSpec(path), /duplicate target/);

    assert.throws(() => resolveRemotionBindings({
      version: 1,
      frames: { "other-frame": registry().frames["reserve-flow"] },
    }, visualFixture().plan), /unknown frame/);
    assert.throws(() => resolveRemotionBindings({
      version: 1,
      frames: {
        "reserve-flow": [{ beat: "unknown", target: "WorkflowStep:unknown", enter: "rise", duration: 0.5 }],
      },
    }, visualFixture().plan), /unknown beat/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("Remotion emit replaces full-build evidence and preserves runtime bindings during captions-only emission", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-static-bindings-emit-"));
  try {
    const shared = join(tmp, "shared");
    const output = join(tmp, "remotion");
    const staged = join(tmp, "staged");
    mkdirSync(join(shared, "assets", "voice"), { recursive: true });
    mkdirSync(output, { recursive: true });
    mkdirSync(staged, { recursive: true });
    writeFileSync(join(shared, "assets", "voice", "01.wav"), VOICE01);
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: [] }));
    writeFileSync(join(output, "visual_bindings.json"), JSON.stringify(registry()));

    const { plan, config } = visualFixture();
    emit(plan, shared, output, config);
    assert.deepEqual(
      JSON.parse(readFileSync(join(output, "build_plan.json"), "utf8")).visualBindings,
      registry().frames,
    );
    assert.equal(JSON.parse(readFileSync(join(output, "build", "visual_bindings.json"), "utf8")).bindings.length, 3);

    writeFileSync(join(output, "visual_bindings.json"), JSON.stringify({
      version: 1,
      frames: {
        "reserve-flow": [{ beat: "reserve", target: "WorkflowStep:reserve", enter: "fade", duration: 0.25 }],
      },
    }));
    emit(plan, shared, output, config);
    const replacement = JSON.parse(readFileSync(join(output, "build", "visual_bindings.json"), "utf8"));
    assert.equal(replacement.bindings.length, 1, "a full build replaces stale manifest evidence");
    assert.equal(replacement.bindings[0].revealDuration, 8 / 30);

    emit(plan, shared, staged, config, { captionsOnly: true, runtimeSourceDir: output });
    assert.deepEqual(
      JSON.parse(readFileSync(join(staged, "build_plan.json"), "utf8")).visualBindings,
      { "reserve-flow": [{ beat: "reserve", target: "WorkflowStep:reserve", enter: "fade", duration: 0.25 }] },
      "captions-only emission preserves the authored static registry in the runtime plan",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("Remotion required mode rejects planned beats without an output-local registry", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-static-bindings-required-"));
  try {
    const shared = join(tmp, "shared");
    const output = join(tmp, "remotion");
    mkdirSync(join(shared, "assets", "voice"), { recursive: true });
    mkdirSync(output, { recursive: true });
    writeFileSync(join(shared, "assets", "voice", "01.wav"), VOICE01);
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: [] }));
    const { plan, config } = visualFixture();

    assert.throws(() => emit(plan, shared, output, config), /visual_bindings\.json.*required/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("strict registry parsing preserves prototype-like frame slugs through normalization and serialization", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-static-bindings-prototype-"));
  try {
    const path = join(tmp, "visual_bindings.json");
    writeFileSync(path, `{
      "version": 1,
      "frames": {
        "__proto__": [{"beat":"beat","target":"Target:proto","enter":"fade","duration":0}],
        "constructor": [{"beat":"beat","target":"Target:constructor","enter":"fade","duration":0}],
        "prototype": [{"beat":"beat","target":"Target:prototype","enter":"fade","duration":0}]
      }
    }`);
    const spec = readRemotionBindingSpec(path);
    assert.equal(Object.getPrototypeOf(spec.frames), null);
    assert.deepEqual(Object.keys(spec.frames), ["__proto__", "constructor", "prototype"]);

    const base = visualFixture().plan.frames[0];
    const plan: BuildPlan = {
      ...visualFixture().plan,
      frames: ["__proto__", "constructor", "prototype"].map((slug, index) => ({
        ...base,
        id: `${index}`,
        frameNum: index + 1,
        slug,
        visualBeats: [{ ...base.visualBeats![0], id: "beat" }],
      })),
    };
    const resolved = resolveRemotionBindings(spec, plan, 30);
    assert.equal(Object.getPrototypeOf(resolved.runtimeBindings), null);
    assert.equal(Object.hasOwn(resolved.runtimeBindings, "__proto__"), true);
    assert.deepEqual(
      Object.keys(JSON.parse(JSON.stringify(resolved.runtimeBindings))),
      ["__proto__", "constructor", "prototype"],
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("strict registry parsing rejects unknown fields and whitespace identifiers", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-static-bindings-strict-"));
  try {
    const path = join(tmp, "visual_bindings.json");
    for (const value of [
      { version: 1, frames: {}, extra: true },
      { version: 1, frames: { " ": [] } },
      { version: 1, frames: { frame: [{ beat: " ", target: "target", enter: "fade", duration: 0 }] } },
      { version: 1, frames: { frame: [{ beat: "beat", target: " ", enter: "fade", duration: 0 }] } },
      { version: 1, frames: { frame: [{ beat: "beat", target: "target", enter: "fade", duration: 0, extra: true }] } },
    ]) {
      writeFileSync(path, JSON.stringify(value));
      assert.throws(() => readRemotionBindingSpec(path));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("normalized bindings quantify runtime scheduling and preserve independent multi-frame durations", () => {
  const { plan } = visualFixture();
  const first = {
    ...plan.frames[0],
    slug: "first",
    voiceDur: 1.01,
    frameDur: 1.51,
    visualBeats: [{ ...plan.frames[0].visualBeats![0], id: "first", start: 0.01, tolerance: { maxLead: 1, maxLag: 1 } }],
  };
  const second = {
    ...plan.frames[0],
    id: "second",
    frameNum: 2,
    slug: "second",
    voiceDur: 2.02,
    frameDur: 2.52,
    visualBeats: [{ ...plan.frames[0].visualBeats![0], id: "second", start: 0.99, tolerance: { maxLead: 1, maxLag: 1 } }],
  };
  const multi: BuildPlan = { ...plan, totalDuration: 4.03, frames: [first, second] };
  const resolved = resolveRemotionBindings({
    version: 1,
    frames: {
      first: [{ beat: "first", target: "Target:first", enter: "fade", duration: 0 }],
      second: [{ beat: "second", target: "Target:second", enter: "fade", duration: 0.01 }],
    },
  }, multi, 24);

  assert.deepEqual(resolved.manifest.bindings.map((binding) => [binding.revealStart, binding.revealDuration]), [
    [0, 1 / 24],
    [1, 1 / 24],
  ]);
  assert.deepEqual(resolved.manifest.frames, [
    { frameSlug: "first", authoredDuration: 1.01, outerDuration: 1.51 },
    { frameSlug: "second", authoredDuration: 2.02, outerDuration: 2.52 },
  ]);

  const corrupted = structuredClone(resolved.manifest);
  corrupted.frames![1].outerDuration = 0;
  const findings = verifyVisualSync({
    plan: multi,
    manifest: corrupted,
    policy: {
      mode: "required",
      coverageMode: "warn",
      maxLead: 1,
      maxLag: 1,
      maxUncoveredGap: 0.5,
      minLanding: 0,
    },
    fps: 24,
  });
  assert.deepEqual(
    findings.filter((finding) => finding.msg.includes("outer duration")).map((finding) => finding.msg.match(/frame "([^"]+)"/)?.[1]),
    ["second"],
  );
});

test("direct emission distinguishes required, warn, off, and legacy registry behavior", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-static-bindings-modes-"));
  try {
    const shared = join(tmp, "shared");
    const output = join(tmp, "output");
    mkdirSync(join(shared, "assets", "voice"), { recursive: true });
    mkdirSync(output, { recursive: true });
    writeFileSync(join(shared, "assets", "voice", "01.wav"), VOICE01);
    writeFileSync(join(shared, "caption_groups.json"), JSON.stringify({ groups: [] }));
    const { plan } = visualFixture();

    emit(plan, shared, output, { framework: "remotion", visualSync: { mode: "warn" } });
    assert.equal(JSON.parse(readFileSync(join(output, "build", "visual_bindings.json"), "utf8")).bindings.length, 0);

    writeFileSync(join(output, "visual_bindings.json"), "{ malformed");
    emit(plan, shared, output, { framework: "remotion", visualSync: { mode: "off" } });
    assert.deepEqual(JSON.parse(readFileSync(join(output, "build", "visual_bindings.json"), "utf8")), {
      version: 1,
      framework: "remotion",
      bindings: [],
      frames: [],
    });
    assert.equal("visualBindings" in JSON.parse(readFileSync(join(output, "build_plan.json"), "utf8")), false);

    const legacy: BuildPlan = { ...plan, frames: plan.frames.map((frame) => ({ ...frame, visualBeats: undefined })) };
    emit(legacy, shared, output, { framework: "remotion" });
    assert.equal("visualBindings" in JSON.parse(readFileSync(join(output, "build_plan.json"), "utf8")), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
