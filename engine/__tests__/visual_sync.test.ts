import assert from "node:assert/strict";
import test from "node:test";
import type {
  BuildPlan,
  ResolvedCoverageExemption,
  ResolvedVisualStateV2,
  ResolvedVisualSyncPolicy,
  VisualBinding,
  VisualBindingManifest,
  VisualBindingManifestV2,
  VisualBindingV2,
} from "../types.ts";
import { verifyVisualSync } from "../visual_sync.ts";

const POLICY: ResolvedVisualSyncPolicy = {
  mode: "required",
  coverageMode: "warn",
  maxLead: 0.25,
  maxLag: 0.75,
  maxUncoveredGap: 0.5,
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
        {
          version: 1,
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

const COVERAGE_POLICY: ResolvedVisualSyncPolicy = {
  mode: "required",
  coverageMode: "required",
  maxLead: 0.25,
  maxLag: 0.75,
  maxUncoveredGap: 0.5,
  minLanding: 1,
};

const COVERAGE_ONLY_POLICY: ResolvedVisualSyncPolicy = {
  ...COVERAGE_POLICY,
  mode: "off",
};

function coverageState(
  id: string,
  start: number,
  end: number,
  role: "focal" | "supporting" = "focal",
): ResolvedVisualStateV2 {
  return {
    version: 2,
    id,
    text: `${id} state`,
    role,
    start,
    end,
    cueText: start === 0 ? "<frame-start>" : id,
    sourceRefs: [],
    tolerance: { maxLead: 0.25, maxLag: 0.75 },
  };
}

function makeCoveragePlan(
  visualBeats: ResolvedVisualStateV2[] = [
    coverageState("opening", 0, 18.26),
    {
      ...coverageState("solution", 18.26, 23.08),
      cueWordIndex: 1,
      cueText: "solution",
    },
  ],
  visualCoverageExemptions: ResolvedCoverageExemption[] = [],
): BuildPlan {
  return {
    version: 1,
    canvas: { width: 1920, height: 1080 },
    timing: { tail: 0, xfade: 0, gap: 1 },
    totalDuration: 23.08,
    captionGroups: [],
    frames: [{
      id: "overview",
      frameNum: 1,
      slug: "overview",
      voicePath: "assets/voice/overview.wav",
      voiceDur: 22.08,
      frameDur: 23.08,
      start: 0,
      words: [
        { text: "A", start: 0.07, end: 0.12 },
        { text: "solution", start: 18.26, end: 18.8 },
      ],
      visualSpecVersion: 2,
      visualKind: "focal",
      visualBeats,
      ...(visualCoverageExemptions.length === 0
        ? {}
        : { visualCoverageExemptions }),
    }],
  };
}

function focalBinding(
  beatId: string,
  coverageStart: number,
  coverageEnd: number,
  target = `#${beatId}`,
): VisualBindingV2 {
  return {
    frameSlug: "overview",
    beatId,
    target,
    role: "focal",
    revealStart: coverageStart,
    revealDuration: 0,
    coverageStart,
    coverageEnd,
    source: "static",
    authoredDuration: 22.08,
    outerDuration: 23.08,
  };
}

function makeV2Manifest(bindings: VisualBindingV2[]): VisualBindingManifestV2 {
  return {
    version: 2,
    framework: "fixture",
    planSha256: "0".repeat(64),
    authoredInputs: [],
    bindings,
  };
}

function alignedBindings(): VisualBinding[] {
  return [
    binding("reserve", 2.95),
    binding("execute", 11.06),
    binding("settle", 14.35),
  ];
}

test("reports an opening semantic coverage gap", () => {
  const findings = verifyVisualSync({
    plan: makeCoveragePlan([coverageState("solution", 18.26, 23.08)]),
    policy: COVERAGE_POLICY,
    fps: 30,
    manifest: makeV2Manifest([focalBinding("solution", 18.26, 23.08)]),
  });

  const gap = findings.find((finding) => finding.code === "opening_visual_gap");
  assert.deepEqual(gap && { code: gap.code, details: gap.details }, {
    code: "opening_visual_gap",
    details: {
      frameSlug: "overview",
      start: 0.07,
      end: 18.26,
      duration: 18.19,
      maxUncoveredGap: 0.5,
      nextBeatId: "solution",
      extendsThroughFrameEnd: false,
    },
  });
});

test("reports a middle semantic coverage gap", () => {
  const findings = verifyVisualSync({
    plan: makeCoveragePlan(),
    policy: COVERAGE_POLICY,
    fps: 30,
    manifest: makeV2Manifest([
      focalBinding("opening", 0, 6),
      focalBinding("solution", 18.26, 23.08),
    ]),
  });

  const gap = findings.find((finding) => finding.code === "mid_scene_visual_gap");
  assert.match(gap?.msg ?? "", /6\.000s-18\.260s/);
});

test("reports an ending semantic coverage gap", () => {
  const findings = verifyVisualSync({
    plan: makeCoveragePlan(),
    policy: COVERAGE_POLICY,
    fps: 30,
    manifest: makeV2Manifest([
      focalBinding("opening", 0, 18.26),
      focalBinding("solution", 18.26, 20.08),
    ]),
  });

  const gap = findings.find((finding) => finding.code === "ending_visual_gap");
  assert.match(gap?.msg ?? "", /20\.080s-23\.080s/);
});

test("classifies a complete-frame gap as opening through frame end", () => {
  const findings = verifyVisualSync({
    plan: makeCoveragePlan(),
    policy: COVERAGE_POLICY,
    fps: 30,
    manifest: makeV2Manifest([]),
  });
  const gap = findings.find((finding) => finding.code === "opening_visual_gap");
  assert.equal(gap?.details?.extendsThroughFrameEnd, true);
});

test("accepts one static focal interval through the frame landing", () => {
  const plan = makeCoveragePlan([coverageState("opening", 0, 23.08)]);
  assert.deepEqual(verifyVisualSync({
    plan,
    policy: COVERAGE_POLICY,
    fps: 30,
    manifest: makeV2Manifest([focalBinding("opening", 0, 23.08)]),
  }), []);
});

test("does not count supporting bindings as focal coverage", () => {
  const findings = verifyVisualSync({
    plan: makeCoveragePlan([coverageState("support", 0, 23.08, "supporting")]),
    policy: COVERAGE_ONLY_POLICY,
    fps: 30,
    manifest: makeV2Manifest([{
      ...focalBinding("support", 0, 23.08),
      role: "supporting",
    }]),
  });
  assert.equal(
    findings.some((finding) => finding.code === "opening_visual_gap"),
    true,
  );
});

test("allows a gap exactly at the configured maximum and rejects a longer gap", () => {
  const plan = makeCoveragePlan([coverageState("opening", 0, 23.08)]);
  const exact = verifyVisualSync({
    plan,
    policy: COVERAGE_ONLY_POLICY,
    fps: 1_000_000,
    manifest: makeV2Manifest([
      focalBinding("opening", 0, 6),
      focalBinding("opening", 6.5, 23.08, "#opening-later"),
    ]),
  });
  assert.equal(exact.some((finding) => finding.code === "mid_scene_visual_gap"), false);

  const longer = verifyVisualSync({
    plan,
    policy: COVERAGE_ONLY_POLICY,
    fps: 1_000_000,
    manifest: makeV2Manifest([
      focalBinding("opening", 0, 6),
      focalBinding("opening", 6.500001, 23.08, "#opening-later"),
    ]),
  });
  assert.equal(longer.some((finding) => finding.code === "mid_scene_visual_gap"), true);
});

test("unions overlapping, arithmetic-adjacent, and multiple focal target intervals", () => {
  const plan = makeCoveragePlan([coverageState("opening", 0, 23.08)]);
  const findings = verifyVisualSync({
    plan,
    policy: COVERAGE_ONLY_POLICY,
    fps: 30,
    manifest: makeV2Manifest([
      focalBinding("opening", 0, 8),
      focalBinding("opening", 7.9, 16, "#opening-overlap"),
      focalBinding("opening", 16 + (0.25 / 30), 23.08, "#opening-adjacent"),
    ]),
  });
  assert.deepEqual(findings, []);
});

test("reports invalid coverage evidence without treating it as coverage", () => {
  const findings = verifyVisualSync({
    plan: makeCoveragePlan([coverageState("opening", 0, 23.08)]),
    policy: COVERAGE_ONLY_POLICY,
    fps: 30,
    manifest: makeV2Manifest([
      focalBinding("opening", 8, Number.POSITIVE_INFINITY),
      focalBinding("opening", 12, 11, "#opening-inverted"),
    ]),
  });
  assert.equal(
    findings.some((finding) => finding.code === "invalid_visual_coverage_evidence"),
    true,
  );
  assert.equal(
    findings.some((finding) => finding.code === "opening_visual_gap"),
    true,
  );
});

test("starts required coverage at the first spoken word after leading silence", () => {
  const plan = makeCoveragePlan([{
    ...coverageState("opening", 2.95, 23.08),
    cueWordIndex: 0,
    cueText: "Late",
  }]);
  plan.frames[0].words = [{ text: "Late", start: 2.95, end: 3.2 }];
  assert.deepEqual(verifyVisualSync({
    plan,
    policy: COVERAGE_POLICY,
    fps: 30,
    manifest: makeV2Manifest([focalBinding("opening", 2.95, 23.08)]),
  }), []);
});

test("reports full and partial coverage exemptions without hiding unapproved gaps", () => {
  const fullExemption: ResolvedCoverageExemption = {
    id: "full-pause",
    start: 0.07,
    end: 23.08,
    reason: "Intentional audio-only frame",
    approvedBy: "storyboard-review:42",
  };
  const fullyExempt = verifyVisualSync({
    plan: makeCoveragePlan([], [fullExemption]),
    policy: { ...COVERAGE_POLICY, mode: "off" },
    fps: 30,
    manifest: makeV2Manifest([]),
  });
  assert.equal(
    fullyExempt.some((finding) => finding.code === "visual_coverage_exemption"),
    true,
  );
  assert.equal(
    fullyExempt.some((finding) => finding.code === "opening_visual_gap"),
    false,
  );

  const partialExemption: ResolvedCoverageExemption = {
    id: "partial-pause",
    start: 6,
    end: 8,
    reason: "Intentional audio-only pause",
    approvedBy: "storyboard-review:43",
  };
  const partiallyExempt = verifyVisualSync({
    plan: makeCoveragePlan(undefined, [partialExemption]),
    policy: { ...COVERAGE_POLICY, mode: "off" },
    fps: 30,
    manifest: makeV2Manifest([
      focalBinding("opening", 0, 6),
      focalBinding("solution", 10, 23.08),
    ]),
  });
  assert.equal(
    partiallyExempt.some((finding) => finding.code === "visual_coverage_exemption"),
    true,
  );
  assert.equal(
    partiallyExempt.some((finding) => finding.code === "mid_scene_visual_gap"),
    true,
  );
});

test("downgrades coverage gaps in warn mode and skips them when coverage is off", () => {
  const warnFindings = verifyVisualSync({
    plan: makeCoveragePlan(),
    policy: { ...COVERAGE_POLICY, mode: "off", coverageMode: "warn" },
    fps: 30,
    manifest: makeV2Manifest([focalBinding("solution", 18.26, 23.08)]),
  });
  assert.equal(
    warnFindings.find((finding) => finding.code === "opening_visual_gap")?.level,
    "warn",
  );

  assert.deepEqual(verifyVisualSync({
    plan: makeCoveragePlan(),
    policy: { ...COVERAGE_POLICY, coverageMode: "off" },
    fps: 30,
    manifest: makeV2Manifest([focalBinding("solution", 18.26, 23.08)]),
  }), [
    { level: "error", msg: 'frame "overview" beat "opening" has no visual binding' },
  ]);
});

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

test("skips semantic verification only when reveal and coverage modes are off", () => {
  assert.deepEqual(verifyVisualSync({
    plan: makePlan(),
    policy: { ...POLICY, mode: "off", coverageMode: "off" },
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
