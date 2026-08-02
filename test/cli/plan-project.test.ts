import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { BuildPlan } from "../../engine/types.ts";
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

test("planning ignores malformed visual beats when visual sync is off", () => {
  const project = planningProject("off");
  try {
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
