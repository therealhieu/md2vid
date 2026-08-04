import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { BuildPlan } from "../../engine/types.ts";
import { createNarrationEvidence } from "../../engine/narration_evidence.ts";
import { validateVersionedNarrationRequest } from "../../engine/narration_request.ts";
import { captureVoiceWavSnapshots } from "../../engine/voice_assets.ts";
import {
  createProjectPlan,
  serializeNeutralArtifacts,
  stageNeutralArtifacts,
} from "../../scripts/plan_project.ts";
import { makePcmWav } from "../helpers/wav.ts";

const PLAN_WITH_BEATS: BuildPlan = {
  version: 1,
  canvas: { width: 1920, height: 1080 },
  timing: { tail: 0.5, xfade: 0.5, gap: 0 },
  totalDuration: 18,
  frames: [{
    id: "reserve-flow",
    frameNum: 1,
    slug: "reserve-flow",
    voicePath: "assets/voice/reserve-flow.wav",
    voiceDur: 18,
    frameDur: 18,
    start: 0,
    words: [
      { text: "Reserve", start: 2.95, end: 3.1 },
      { text: "Execute", start: 11.06, end: 11.2 },
      { text: "Settle", start: 14.35, end: 14.5 },
    ],
    visualKind: "workflow",
    visualBeats: [
      {
        version: 1,
        id: "reserve",
        text: "Reserve",
        start: 2.95,
        cueWordIndex: 0,
        cueText: "Reserve",
        sourceRefs: [],
        workflowStep: 1,
        tolerance: { maxLead: 0.25, maxLag: 0.75 },
      },
      {
        version: 1,
        id: "execute",
        text: "Execute",
        start: 11.06,
        cueWordIndex: 1,
        cueText: "Execute",
        sourceRefs: [],
        workflowStep: 2,
        tolerance: { maxLead: 0.25, maxLag: 0.75 },
      },
    ],
  }],
  captionGroups: [],
};

const PLAN_WITH_COVERAGE: BuildPlan = {
  version: 1,
  canvas: { width: 1920, height: 1080 },
  timing: { tail: 0.5, xfade: 0.5, gap: 0 },
  totalDuration: 19,
  frames: [{
    id: "reserve-flow",
    frameNum: 1,
    slug: "reserve-flow",
    voicePath: "assets/voice/reserve-flow.wav",
    voiceDur: 18,
    frameDur: 19,
    start: 0,
    words: [
      { text: "First", start: 2.95, end: 3.2 },
      { text: "execute", start: 11.06, end: 11.5 },
    ],
    visualSpecVersion: 2,
    visualKind: "workflow",
    visualBeats: [
      {
        version: 2,
        id: "opening",
        text: "Reserve before external work",
        role: "focal",
        start: 0,
        end: 11.06,
        cueText: "<frame-start>",
        sourceRefs: [],
        workflowStep: 1,
        tolerance: { maxLead: 0.25, maxLag: 0.75 },
      },
      {
        version: 2,
        id: "execute",
        text: "Execute the operation",
        role: "focal",
        start: 11.06,
        end: 19,
        cueWordIndex: 1,
        cueText: "execute",
        sourceRefs: [],
        workflowStep: 2,
        tolerance: { maxLead: 0.25, maxLag: 0.75 },
      },
    ],
  }],
  captionGroups: [],
};

test("serializes deterministic visual coverage timing", () => {
  const serialized = serializeNeutralArtifacts(PLAN_WITH_COVERAGE);
  assert.deepEqual(JSON.parse(serialized.visualTiming), {
    version: 2,
    frames: {
      "reserve-flow": {
        visualSpecVersion: 2,
        voiceDuration: 18,
        frameDuration: 19,
        requiredCoverage: { start: 2.95, end: 19 },
        kind: "workflow",
        beats: [
          { id: "opening", role: "focal", start: 0, end: 11.06, workflowStep: 1 },
          { id: "execute", role: "focal", start: 11.06, end: 19, workflowStep: 2 },
        ],
        coverageExemptions: [],
      },
    },
  });
});

test("serializes deterministic neutral artifacts with visual timing", () => {
  const artifacts = serializeNeutralArtifacts(PLAN_WITH_BEATS);

  assert.match(artifacts.cues, /"visualBeats"/);
  assert.match(artifacts.visualTiming, /"version": 1/);
  assert.deepEqual(JSON.parse(artifacts.visualTiming).frames["reserve-flow"].beats, [
    { id: "reserve", start: 2.95, workflowStep: 1 },
    { id: "execute", start: 11.06, workflowStep: 2 },
  ]);
  assert.deepEqual(JSON.parse(artifacts.buildPlan), PLAN_WITH_BEATS);
});

test("serializes legacy artifacts without visual timing keys", () => {
  const legacyPlan: BuildPlan = {
    ...PLAN_WITH_BEATS,
    frames: [{
      ...PLAN_WITH_BEATS.frames[0],
      visualKind: undefined,
      visualBeats: undefined,
    }],
  };

  const artifacts = serializeNeutralArtifacts(legacyPlan);

  assert.deepEqual(JSON.parse(artifacts.visualTiming), { version: 1, frames: {} });
  assert.equal(artifacts.cues.includes("visualBeats"), false);
});

function planningProject(visualSync?: "off" | "warn" | "required"): string {
  const project = mkdtempSync(join(tmpdir(), "md2vid-plan-project-"));
  mkdirSync(join(project, "assets", "voice"), { recursive: true });
  writeFileSync(join(project, "assets", "voice", "intro.wav"), makePcmWav({
    sampleRate: 48_000,
    sampleFrames: 48_000,
  }));
  writeFileSync(join(project, "audio_meta.json"), `${JSON.stringify({
    voices: [{
      id: "intro",
      path: "assets/voice/intro.wav",
      duration_s: 1,
      words: [{ text: "Intro", start: 0, end: 1 }],
    }],
  }, null, 2)}\n`);
  writeFileSync(join(project, "video.config.json"), `${JSON.stringify({
    slugs: { intro: "01-intro" },
    ...(visualSync === undefined ? {} : { visualSync: { mode: visualSync } }),
  }, null, 2)}\n`);
  return project;
}

test("planning resolves v2 coverage when reveal timing is off", () => {
  const project = planningProject("off");
  try {
    writeFileSync(join(project, "video.config.json"), `${JSON.stringify({
      slugs: { intro: "01-intro" },
      visualSync: { mode: "off", coverageMode: "required" },
    }, null, 2)}\n`);
    writeFileSync(join(project, "visual_beats.json"), `${JSON.stringify({
      version: 2,
      frames: {
        "01-intro": {
          beats: [{
            id: "opening",
            text: "Intro",
            role: "focal",
            cue: { frameStart: true },
          }],
        },
      },
    }, null, 2)}\n`);

    const result = createProjectPlan(project);
    assert.equal(result.plan.frames[0].visualSpecVersion, 2);
    assert.equal(result.plan.frames[0].visualBeats?.[0].start, 0);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("warn-mode omitted v2 frames serialize as deterministic zero-state coverage", () => {
  const project = planningProject("off");
  try {
    writeFileSync(join(project, "video.config.json"), `${JSON.stringify({
      slugs: { intro: "01-intro" },
      visualSync: { mode: "off", coverageMode: "warn" },
    }, null, 2)}\n`);
    writeFileSync(join(project, "visual_beats.json"), `${JSON.stringify({
      version: 2,
      frames: {},
    }, null, 2)}\n`);

    const result = createProjectPlan(project);
    assert.equal(result.plan.frames[0].visualSpecVersion, 2);
    assert.deepEqual(JSON.parse(serializeNeutralArtifacts(result.plan).visualTiming), {
      version: 2,
      frames: {
        "01-intro": {
          visualSpecVersion: 2,
          voiceDuration: 1,
          frameDuration: 1,
          requiredCoverage: { start: 0, end: 1 },
          beats: [],
          coverageExemptions: [],
        },
      },
    });
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("coverage-required project planning rejects a v1 visual specification with migration guidance", () => {
  const project = planningProject("off");
  try {
    writeFileSync(join(project, "video.config.json"), `${JSON.stringify({
      slugs: { intro: "01-intro" },
      visualSync: { mode: "off", coverageMode: "required" },
    }, null, 2)}\n`);
    writeFileSync(join(project, "visual_beats.json"), `${JSON.stringify({
      version: 1,
      frames: {
        "01-intro": {
          beats: [{ id: "opening", text: "Intro", cue: { wordIndex: 0 } }],
        },
      },
    }, null, 2)}\n`);

    assert.throws(
      () => createProjectPlan(project),
      /coverageMode=required requires visual_beats\.json version 2.*migrate.*version 2/i,
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("coverage-required planning requires visual beats even when reveal timing is off", () => {
  const project = planningProject("off");
  try {
    writeFileSync(join(project, "video.config.json"), `${JSON.stringify({
      slugs: { intro: "01-intro" },
      visualSync: { mode: "off", coverageMode: "required" },
    }, null, 2)}\n`);
    assert.throws(
      () => createProjectPlan(project),
      /visual_beats\.json: required by visualSync policy/,
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

function versionedFixture(): string {
  const project = planningProject("off");
  const request = validateVersionedNarrationRequest({
    version: 1,
    provider: "kokoro",
    voice: "am_michael",
    lang: "en",
    speed: 0.9,
    lines: [{ id: "intro", text: "Introduce the topic." }],
  }, join(project, "audio_request.json"));
  const meta = {
    tts_provider: "kokoro",
    voice_id: "am_michael",
    voices: [{
      id: "intro",
      path: "assets/voice/intro.wav",
      duration_s: 1,
      words: [{ text: "Intro", start: 0, end: 1 }],
    }],
  };
  const snapshots = captureVoiceWavSnapshots(project, meta.voices.map((voice) => voice.path));
  const evidence = createNarrationEvidence({
    request,
    meta,
    snapshots,
    metadataPath: join(project, "audio_meta.json"),
  });
  writeFileSync(join(project, "audio_request.json"), `${JSON.stringify(request, null, 2)}\n`);
  writeFileSync(join(project, "audio_meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  writeFileSync(join(project, "narration_evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  return project;
}

test("createProjectPlan accepts matching versioned narration evidence", () => {
  const project = versionedFixture();
  try {
    assert.doesNotThrow(() => createProjectPlan(project));
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("createProjectPlan rejects changed spoken text before planning", () => {
  const project = versionedFixture();
  try {
    const requestPath = join(project, "audio_request.json");
    const request = JSON.parse(readFileSync(requestPath, "utf8"));
    request.lines[0].text = "Introduce this topic.";
    writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`);

    assert.throws(
      () => createProjectPlan(project),
      /request digest.*Re-synthesize narration and rerun `md2vid transcribe`/,
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("planning ignores malformed visual beats when both modes are off", () => {
  const project = planningProject("off");
  try {
    writeFileSync(join(project, "video.config.json"), `${JSON.stringify({
      slugs: { intro: "01-intro" },
      visualSync: { mode: "off", coverageMode: "off" },
    }, null, 2)}\n`);
    writeFileSync(join(project, "visual_beats.json"), "{ malformed JSON");

    const result = createProjectPlan(project);

    assert.deepEqual(result.warnings, []);
    assert.equal(result.plan.frames[0].visualBeats, undefined);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("planning emits one actionable warning when visual beats are absent in warn mode", () => {
  const project = planningProject("warn");
  try {
    const result = createProjectPlan(project);

    assert.deepEqual(result.warnings, [
      `${join(project, "visual_beats.json")}: no visual beat specification; semantic checks are skipped`,
    ]);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("stages all four neutral artifacts under a caller-owned root", () => {
  const stage = mkdtempSync(join(tmpdir(), "md2vid-neutral-stage-"));
  try {
    const managed = stageNeutralArtifacts(PLAN_WITH_BEATS, stage);

    assert.deepEqual(managed.map((entry) => entry.target), [
      "cues.json",
      "caption_groups.json",
      "build/build_plan.json",
      "build/visual_timing.json",
    ]);
    for (const entry of managed) {
      assert.ok(entry.staged.startsWith(stage));
      assert.ok(readFileSync(entry.staged, "utf8").endsWith("\n"));
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});
