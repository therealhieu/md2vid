import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import adapter from "../index.ts";
import { verify, verifyRemotionCaptionArtifact, resolveVerificationFps, REMOTION_COMPOSITION_FPS } from "../verify.ts";
import { verifyVisualSync } from "../../../engine/visual_sync.ts";
import type {
  AdapterVerifyContext,
  BuildPlan,
  ResolvedVisualSyncPolicy,
  VisualBindingManifest,
  VisualBindingManifestV1,
  VisualBindingManifestV2,
  VisualBindingV2,
} from "../../../engine/types.ts";

function goodProject(): string {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-verify-"));
  mkdirSync(join(tmp, "src"), { recursive: true });
  writeFileSync(join(tmp, "src", "Root.tsx"), 'id="video"\n');
  writeFileSync(join(tmp, "build_plan.json"),
    JSON.stringify({ version: 1, totalDuration: 2, canvas: { width: 1920, height: 1080 },
      timing: { tail: 0.5, xfade: 0.5, gap: 0.5 }, frames: [{ id: "01" }], captionGroups: [] }) + "\n");
  return tmp;
}

test("verify passes a well-formed remotion project", () => {
  const dir = goodProject();
  try {
    const findings = verify(dir);
    assert.deepEqual(findings.filter((f) => f.level === "error"), [], "no errors on a good project");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify uses videoDir for caption verification when sharedDir is omitted", () => {
  const dir = goodProject();

  try {
    writeFileSync(
      join(dir, "caption_groups.json"),
      JSON.stringify({
        groups: [
          {
            id: "mismatch",
            frame: 1,
            start: 0,
            end: 1,
            text: "different",
            words: [],
          },
        ],
      }),
    );

    const errors = verify(dir).filter(
      (finding) => finding.level === "error",
    );
    const messages = errors.map((finding) => finding.msg);

    assert.ok(
      messages.some((message) =>
        message.includes(
          "caption_groups.json and staged build_plan.json captionGroups differ in content",
        ),
      ),
      JSON.stringify(messages),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify flags a missing build_plan.json", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-verify-bad-"));
  mkdirSync(join(tmp, "src"), { recursive: true });
  writeFileSync(join(tmp, "src", "Root.tsx"), 'id="video"\n');
  try {
    const errs = verify(tmp).filter((f) => f.level === "error");
    const message = errs.map((finding) => finding.msg).join("\n");
    assert.match(message, /md2vid build <dir>/);
    assert.doesNotMatch(message, /scripts\/build\.ts/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("focused caption verification reports missing and malformed staged plans", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-caption-verify-"));
  try {
    const sharedDir = join(tmp, "shared");
    const outputDir = join(tmp, "remotion");
    mkdirSync(sharedDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    const captionGroupsPath = join(sharedDir, "caption_groups.json");
    writeFileSync(captionGroupsPath, JSON.stringify({ groups: [] }));

    let messages = verifyRemotionCaptionArtifact({ sharedDir, outputDir, captionGroupsPath })
      .filter((finding) => finding.level === "error")
      .map((finding) => finding.msg);
    assert.ok(messages.some((message) => message.includes("missing staged build_plan.json")), JSON.stringify(messages));

    writeFileSync(join(outputDir, "build_plan.json"), "{bad json");
    messages = verifyRemotionCaptionArtifact({ sharedDir, outputDir, captionGroupsPath })
      .filter((finding) => finding.level === "error")
      .map((finding) => finding.msg);
    assert.ok(messages.some((message) => message.includes("not valid JSON")), JSON.stringify(messages));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("focused caption verification detects mismatched staged groups", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-caption-verify-match-"));
  try {
    const sharedDir = join(tmp, "shared");
    const outputDir = join(tmp, "remotion");
    mkdirSync(sharedDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    const captionGroupsPath = join(sharedDir, "custom-caption-groups.json");
    const groups = [{ id: "g", frame: 1, start: 0, end: 1, text: "hello", words: [] }];
    writeFileSync(captionGroupsPath, JSON.stringify({ groups }));
    writeFileSync(join(outputDir, "build_plan.json"), JSON.stringify({ captionGroups: groups }));

    assert.deepEqual(
      verifyRemotionCaptionArtifact({ sharedDir, outputDir, captionGroupsPath })
        .filter((finding) => finding.level === "error"),
      [],
    );

    writeFileSync(join(outputDir, "build_plan.json"), JSON.stringify({ captionGroups: [] }));
    const messages = verifyRemotionCaptionArtifact({ sharedDir, outputDir, captionGroupsPath })
      .filter((finding) => finding.level === "error")
      .map((finding) => finding.msg);
    assert.ok(messages.some((message) => message.includes("differ in content")), JSON.stringify(messages));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("verify flags a Root.tsx without the expected composition id", () => {
  const dir = goodProject();
  writeFileSync(join(dir, "src", "Root.tsx"), "no id here\n");
  try {
    const errs = verify(dir).filter((f) => f.level === "error");
    assert.ok(errs.some((f) => /composition id/i.test(f.msg)), "missing id is an error");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function semanticPlan(): BuildPlan {
  return {
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
        { version: 1, id: "execute", text: "Execute", start: 11.06, cueWordIndex: 1, cueText: "execute", sourceRefs: [], workflowStep: 2, tolerance: { maxLead: 0.25, maxLag: 0.75} },
      ],
    }],
    captionGroups: [],
  };
}

function manifest(
  bindings: VisualBindingManifestV1["bindings"],
): VisualBindingManifestV1 {
  return {
    version: 1,
    framework: "remotion",
    bindings,
    frames: [{ frameSlug: "reserve-flow", authoredDuration: 16, outerDuration: 17 }],
  };
}

function binding(beatId: string, revealStart: number, target = `WorkflowStep:${beatId}`) {
  return {
    frameSlug: "reserve-flow",
    beatId,
    target,
    revealStart,
    revealDuration: 0.5,
    source: "custom" as const,
    authoredDuration: 16,
    outerDuration: 17,
  };
}

function semanticContext(dir: string, bindings?: VisualBindingManifest): AdapterVerifyContext {
  return {
    plan: semanticPlan(),
    videoDir: dir,
    sharedDir: dir,
    config: { framework: "remotion", visualSync: { mode: "required" } },
    policy: {
      mode: "required",
      coverageMode: "warn",
      maxLead: 0.25,
      maxLag: 0.75,
      maxUncoveredGap: 0.5,
      minLanding: 1,
    },
    fps: 30,
    bindings,
  };
}

test("Remotion verification delegates missing, early, order, and duration findings to visual sync", () => {
  const dir = goodProject();
  try {
    let messages = verify(semanticContext(dir)).map((finding) => finding.msg);
    assert.ok(messages.some((message) => message.includes("visual binding manifest is missing")), JSON.stringify(messages));

    messages = verify(semanticContext(dir, manifest([
      binding("reserve", 2.95),
      binding("execute", 1.5),
    ]))).map((finding) => finding.msg);
    assert.ok(messages.some((message) => message.includes('beat "execute"') && message.includes("lead is")), JSON.stringify(messages));
    assert.ok(messages.some((message) => message.includes("reveals out of order")), JSON.stringify(messages));

    messages = verify(semanticContext(dir, {
      ...manifest([binding("reserve", 2.95), binding("execute", 11.06)]),
      frames: [{ frameSlug: "reserve-flow", authoredDuration: 15, outerDuration: 16 }],
    })).map((finding) => finding.msg);
    assert.ok(messages.some((message) => message.includes("authored duration") && message.includes("voiceDur")), JSON.stringify(messages));
    assert.ok(messages.some((message) => message.includes("outer duration") && message.includes("frameDur")), JSON.stringify(messages));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Remotion uses its adapter-owned Root FPS constant without reading authored scenes", () => {
  const root = readFileSync(resolve("frameworks", "remotion", "templates", "src", "Root.tsx"), "utf8");
  assert.match(root, new RegExp(`export const FPS = ${REMOTION_COMPOSITION_FPS}`));
  assert.equal(resolveVerificationFps({}, "/not-a-real-remotion-output"), REMOTION_COMPOSITION_FPS);
});

test("Remotion adapter manages the static binding manifest and preserves plan-aware verification", () => {
  const dir = goodProject();
  try {
    assert.equal(adapter.bindingManifestPath, "build/visual_bindings.json");
    assert.equal(adapter.resolveVerificationFps({}, dir), REMOTION_COMPOSITION_FPS);
    const findings = adapter.verify(semanticContext(dir));
    assert.ok(findings.some((finding) => finding.msg.includes("visual binding manifest is missing")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Remotion preserves warn, off, and legacy semantic verification behavior", () => {
  const dir = goodProject();
  try {
    const warnContext = semanticContext(dir);
    warnContext.policy = { ...warnContext.policy, mode: "warn" };
    const warningOnly = verify(warnContext);
    assert.equal(warningOnly.some((finding) => finding.level === "error"), false, JSON.stringify(warningOnly));
    assert.ok(warningOnly.some((finding) => finding.level === "warn" && finding.msg.includes("visual binding manifest is missing")));

    const offContext = semanticContext(dir);
    offContext.policy = { ...offContext.policy, mode: "off" };
    assert.deepEqual(verify(offContext).filter((finding) => finding.level === "error"), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const COVERAGE_POLICY: ResolvedVisualSyncPolicy = {
  mode: "required",
  coverageMode: "required",
  maxLead: 0.25,
  maxLag: 0.75,
  maxUncoveredGap: 0.5,
  minLanding: 1,
};

function makeCoveragePlan(): BuildPlan {
  return {
    version: 1,
    canvas: { width: 1920, height: 1080 },
    timing: { tail: 0, xfade: 0, gap: 0 },
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
      visualBeats: [
        { version: 2, id: "opening", text: "Opening context", role: "focal", start: 0, end: 18.26, cueText: "<frame-start>", sourceRefs: [], tolerance: { maxLead: 0.25, maxLag: 0.75 } },
        { version: 2, id: "solution", text: "Solution", role: "focal", start: 18.26, end: 23.08, cueWordIndex: 1, cueText: "solution", sourceRefs: [], tolerance: { maxLead: 0.25, maxLag: 0.75 } },
      ],
    }],
  };
}

function manifestV2(framework: string, bindings: VisualBindingV2[]): VisualBindingManifestV2 {
  return {
    version: 2,
    framework,
    planSha256: "0".repeat(64),
    authoredInputs: [],
    bindings,
  };
}

function focalBinding(
  target: string,
  beatId: string,
  coverageStart: number,
  coverageEnd: number,
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

test("HyperFrames and Remotion report the same semantic gap", () => {
  const plan = makeCoveragePlan();
  const hyperframes = verifyVisualSync({
    plan,
    policy: COVERAGE_POLICY,
    fps: 30,
    manifest: manifestV2("hyperframes", [
      focalBinding("#solution", "solution", 18.26, 23.08),
    ]),
  });
  const remotion = verify({
    plan,
    videoDir: goodProject(),
    sharedDir: "unused",
    config: { framework: "remotion" },
    policy: COVERAGE_POLICY,
    fps: 30,
    bindings: manifestV2("remotion", [
      focalBinding("SolutionCard", "solution", 18.26, 23.08),
    ]),
  });
  const neutralFinding = ({ code }: { code?: string }) => code?.endsWith("_visual_gap");
  assert.deepEqual(
    remotion.filter(neutralFinding).map(({ code, details }) => ({ code, details })),
    hyperframes.filter(neutralFinding).map(({ code, details }) => ({ code, details })),
  );
});

function coverageProjectWithRuntimeBindings(): {
  dir: string;
  context: AdapterVerifyContext;
  plan: BuildPlan;
} {
  const dir = goodProject();
  const plan = makeCoveragePlan();
  const manifest = manifestV2("remotion", [
    focalBinding("OpeningContext", "opening", 0, 18.266666666666666),
    {
      ...focalBinding("SolutionCard", "solution", 18.266666666666666, 23.066666666666666),
      revealDuration: 0.5,
      source: "custom" as const,
    },
  ]);
  const runtimePlan = {
    ...plan,
    visualBindings: {
      overview: [
        { beatId: "opening", target: "OpeningContext", role: "focal", startFrame: 0, endFrame: 548, durationFrames: 0, enter: "none" },
        { beatId: "solution", target: "SolutionCard", role: "focal", startFrame: 548, endFrame: 692, durationFrames: 15, enter: "rise" },
      ],
    },
  };
  writeFileSync(join(dir, "build_plan.json"), JSON.stringify(runtimePlan, null, 2));
  return {
    dir,
    plan,
    context: {
      plan,
      videoDir: dir,
      sharedDir: dir,
      config: { framework: "remotion" },
      policy: COVERAGE_POLICY,
      fps: 30,
      bindings: manifest,
    },
  };
}

test("Remotion verification rejects runtime visual binding mutations", () => {
  const mutations: Array<{
    name: string;
    mutate: (payload: Record<string, any>) => void;
    expected: RegExp;
  }> = [
    {
      name: "target mutation",
      mutate: (payload) => { payload.visualBindings.overview[1].target = "MutatedSolutionCard"; },
      expected: /MutatedSolutionCard|missing.*SolutionCard/,
    },
    {
      name: "role mutation",
      mutate: (payload) => { payload.visualBindings.overview[1].role = "supporting"; },
      expected: /role supporting !== focal/,
    },
    {
      name: "start boundary mutation",
      mutate: (payload) => { payload.visualBindings.overview[1].startFrame += 1; },
      expected: /startFrame/,
    },
    {
      name: "end boundary mutation",
      mutate: (payload) => { payload.visualBindings.overview[1].endFrame -= 1; },
      expected: /endFrame/,
    },
    {
      name: "duration mutation",
      mutate: (payload) => { payload.visualBindings.overview[1].durationFrames += 1; },
      expected: /durationFrames/,
    },
    {
      name: "enter mutation",
      mutate: (payload) => { payload.visualBindings.overview[1].enter = "none"; },
      expected: /enter none contradicts custom/,
    },
    {
      name: "missing binding",
      mutate: (payload) => { payload.visualBindings.overview.pop(); },
      expected: /missing.*SolutionCard/,
    },
    {
      name: "extra binding",
      mutate: (payload) => { payload.visualBindings.overview.push({ beatId: "solution", target: "Extra", role: "focal", startFrame: 548, endFrame: 692, durationFrames: 15, enter: "rise" }); },
      expected: /extra.*Extra/,
    },
    {
      name: "duplicate binding",
      mutate: (payload) => { payload.visualBindings.overview.push({ ...payload.visualBindings.overview[1] }); },
      expected: /duplicated.*SolutionCard/,
    },
    {
      name: "malformed binding",
      mutate: (payload) => { delete payload.visualBindings.overview[1].endFrame; },
      expected: /malformed.*endFrame/,
    },
  ];

  for (const { name, mutate, expected } of mutations) {
    const { dir, context } = coverageProjectWithRuntimeBindings();
    try {
      assert.deepEqual(verify(context).filter((finding) => finding.level === "error"), [], name);
      const payload = JSON.parse(readFileSync(join(dir, "build_plan.json"), "utf8"));
      mutate(payload);
      writeFileSync(join(dir, "build_plan.json"), JSON.stringify(payload, null, 2));

      const messages = verify(context)
        .filter((finding) => finding.level === "error")
        .map((finding) => finding.msg);
      assert.ok(messages.some((message) => expected.test(message)), `${name}: ${JSON.stringify(messages)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
