import assert from "node:assert/strict";
import test from "node:test";
import type {
  BuildPlan,
  ResolvedVisualSyncPolicy,
  VisualBinding,
  VisualBindingManifest,
} from "../types.ts";
import { verifyVisualSync } from "../visual_sync.ts";

const POLICY: ResolvedVisualSyncPolicy = {
  mode: "required",
  maxLead: 0.25,
  maxLag: 0.75,
  minLanding: 1,
};

function makePlan(): BuildPlan {
  return {
    version: 1,
    canvas: { width: 1920, height: 1080 },
    timing: { tail: 0.5, xfade: 0.5, gap: 0 },
    totalDuration: 18.5,
    frames: [{
      id: "voice-1",
      frameNum: 1,
      slug: "reserve-flow",
      voicePath: "assets/voice/reserve-flow.wav",
      voiceDur: 18,
      frameDur: 18.5,
      start: 0,
      words: [],
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
        {
          id: "settle",
          text: "Settle",
          start: 14.35,
          cueWordIndex: 2,
          cueText: "Settle",
          sourceRefs: [],
          workflowStep: 3,
          tolerance: { maxLead: 0.25, maxLag: 0.75 },
        },
      ],
    }],
    captionGroups: [],
  };
}

function binding(
  beatId: string,
  revealStart: number,
  target = `#${beatId}`,
  overrides: Partial<VisualBinding> = {},
): VisualBinding {
  return {
    frameSlug: "reserve-flow",
    beatId,
    target,
    revealStart,
    revealDuration: 0.5,
    source: "declarative",
    ...overrides,
  };
}

function manifest(bindings: VisualBinding[]): VisualBindingManifest {
  return { version: 1, framework: "hyperframes", bindings };
}

function alignedBindings(): VisualBinding[] {
  return [
    binding("reserve", 2.95),
    binding("execute", 11.06),
    binding("settle", 14.35),
  ];
}

test("accepts covered cue-aligned workflow bindings", () => {
  assert.deepEqual(verifyVisualSync({
    plan: makePlan(),
    manifest: manifest(alignedBindings()),
    policy: POLICY,
    fps: 30,
  }), []);
});

test("reports an early reveal with quantitative evidence", () => {
  const findings = verifyVisualSync({
    plan: makePlan(),
    manifest: manifest([
      binding("reserve", 1.5),
      binding("execute", 3.7),
      binding("settle", 5.9),
    ]),
    policy: POLICY,
    fps: 30,
  });

  const execute = findings.find((finding) => finding.msg.includes('beat "execute"'));
  assert.ok(execute);
  assert.equal(execute.level, "error");
  assert.match(execute.msg, /frame "reserve-flow".*beat "execute"/);
  assert.match(execute.msg, /reveal starts at 3\.700s/);
  assert.match(execute.msg, /cue starts at 11\.060s/);
  assert.match(execute.msg, /lead is 7\.360s/);
});

test("reports bindings for unknown frames and unknown beats", () => {
  const findings = verifyVisualSync({
    plan: makePlan(),
    manifest: manifest([
      ...alignedBindings(),
      { ...binding("reserve", 2.95), frameSlug: "unknown-frame", target: "#unknown-frame" },
      binding("unknown-beat", 2.95, "#unknown-beat"),
    ]),
    policy: POLICY,
    fps: 30,
  });

  assert.ok(findings.some((finding) =>
    finding.msg.includes('target "#unknown-frame"') && finding.msg.includes('unknown frame "unknown-frame"')
  ));
  assert.ok(findings.some((finding) =>
    finding.msg.includes('frame "reserve-flow"') && finding.msg.includes('unknown beat "unknown-beat"')
  ));
});

test("reports missing coverage and duplicate visual targets", () => {
  const findings = verifyVisualSync({
    plan: makePlan(),
    manifest: manifest([
      binding("reserve", 2.95, "#shared"),
      binding("execute", 11.06, "#shared"),
    ]),
    policy: POLICY,
    fps: 30,
  });

  assert.ok(findings.some((finding) => finding.msg.includes('beat "settle" has no visual binding')));
  assert.ok(findings.some((finding) => finding.msg.includes('duplicate visual target "#shared"')));
});

test("reports workflow reveals that occur out of order", () => {
  const findings = verifyVisualSync({
    plan: makePlan(),
    manifest: manifest([
      binding("reserve", 2.95),
      binding("execute", 14.35),
      binding("settle", 11.06),
    ]),
    policy: POLICY,
    fps: 30,
  });

  assert.ok(findings.some((finding) =>
    finding.msg.includes('workflow beat "settle"') && finding.msg.includes("out of order")
  ));
});

test("reports a final reveal that violates the voice landing interval quantitatively", () => {
  const findings = verifyVisualSync({
    plan: makePlan(),
    manifest: manifest([
      binding("reserve", 2.95),
      binding("execute", 11.06),
      binding("settle", 17.2, "#settle", { revealDuration: 0.5 }),
    ]),
    policy: POLICY,
    fps: 30,
  });

  const landing = findings.find((finding) => finding.msg.includes("short of minLanding"));
  assert.ok(landing);
  assert.equal(landing.level, "error");
  assert.match(landing.msg, /frame "reserve-flow".*beat "settle".*target "#settle"/);
  assert.match(landing.msg, /cue starts at 14\.350s/);
  assert.match(landing.msg, /reveal starts at 17\.200s/);
  assert.match(landing.msg, /reveal ends at 17\.700s/);
  assert.match(landing.msg, /landing is 0\.300s/);
  assert.match(landing.msg, /minLanding 1\.000s/);
  assert.match(landing.msg, /by 0\.700s/);
});

test("uses the active FPS frame quantization tolerance for authored and outer durations", () => {
  for (const fps of [24, 30, 60]) {
    const tolerance = Math.max(0.001, 0.5 / fps);
    const withinTolerance = manifest(alignedBindings().map((item) => ({
      ...item,
      authoredDuration: 18 + tolerance - 0.00001,
      outerDuration: 18.5 - tolerance + 0.00001,
    })));
    assert.deepEqual(
      verifyVisualSync({ plan: makePlan(), manifest: withinTolerance, policy: POLICY, fps }),
      [],
      `duration within tolerance must pass at ${fps} FPS`,
    );

    const beyondTolerance = manifest(alignedBindings().map((item) => ({
      ...item,
      authoredDuration: 18 + tolerance + 0.00001,
      outerDuration: 18.5 - tolerance - 0.00001,
    })));
    const findings = verifyVisualSync({ plan: makePlan(), manifest: beyondTolerance, policy: POLICY, fps });
    assert.ok(findings.some((finding) =>
      finding.msg.includes("authored duration") && finding.msg.includes(`at ${fps} FPS`)
    ));
    assert.ok(findings.some((finding) =>
      finding.msg.includes("outer duration") && finding.msg.includes(`at ${fps} FPS`)
    ));
  }
});

test("checks independent frame durations even when no visual target is bound", () => {
  for (const fps of [24, 30, 60]) {
    const tolerance = Math.max(0.001, 0.5 / fps);
    const noTargetManifest = {
      version: 1,
      framework: "hyperframes",
      bindings: [],
      frames: [{
        frameSlug: "reserve-flow",
        authoredDuration: 18 + tolerance + 0.00001,
        outerDuration: 18.5 - tolerance - 0.00001,
      }],
    } as unknown as VisualBindingManifest;
    const findings = verifyVisualSync({ plan: makePlan(), manifest: noTargetManifest, policy: POLICY, fps });
    assert.ok(findings.some((finding) => finding.msg.includes('beat "reserve" has no visual binding')), JSON.stringify(findings));
    assert.ok(findings.some((finding) => finding.msg.includes("authored duration") && finding.msg.includes(`at ${fps} FPS`)), JSON.stringify(findings));
    assert.ok(findings.some((finding) => finding.msg.includes("outer duration") && finding.msg.includes(`at ${fps} FPS`)), JSON.stringify(findings));
  }
});

test("downgrades semantic failures to warnings in warn mode", () => {
  const findings = verifyVisualSync({
    plan: makePlan(),
    policy: { ...POLICY, mode: "warn" },
    fps: 30,
  });

  assert.deepEqual(findings, [{ level: "warn", msg: "visual binding manifest is missing" }]);
});

test("skips semantic verification in off mode", () => {
  assert.deepEqual(verifyVisualSync({
    plan: makePlan(),
    policy: { ...POLICY, mode: "off" },
    fps: 0,
  }), []);
});

test("rejects invalid active FPS when semantic verification applies", () => {
  assert.deepEqual(verifyVisualSync({
    plan: makePlan(),
    manifest: manifest(alignedBindings()),
    policy: POLICY,
    fps: 0,
  }), [{ level: "error", msg: "visual sync FPS must be a finite positive number" }]);
});
