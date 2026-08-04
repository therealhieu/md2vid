import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { ensureRuntime } from "../scaffold.ts";

const TEMPLATE_ROOT = resolve("frameworks", "remotion", "templates", "src");
const VISUAL_BEATS = join(TEMPLATE_ROOT, "VisualBeats.tsx");
const TEMPLATE_TYPES = join(TEMPLATE_ROOT, "types.ts");
const ENGINE_TYPES = resolve("engine", "types.ts");

const FRAME = {
  id: "03",
  frameNum: 3,
  slug: "reserve-flow",
  voicePath: "assets/voice/03.wav",
  voiceDur: 16,
  frameDur: 17,
  start: 20,
  words: [],
  visualKind: "workflow" as const,
  visualSpecVersion: 2,
  visualBeats: [
    {
      version: 2,
      id: "reserve",
      text: "Reserve value",
      role: "focal",
      start: 2.95,
      end: 11.066666666666666,
      cueWordIndex: 3,
      cueText: "reserve",
      sourceRefs: [],
      workflowStep: 1,
      tolerance: { maxLead: 0.25, maxLag: 0.75 },
    },
    {
      version: 2,
      id: "execute",
      text: "Execute operation",
      role: "focal",
      start: 11.066666666666666,
      end: 17,
      cueWordIndex: 17,
      cueText: "execute",
      sourceRefs: [],
      workflowStep: 2,
      tolerance: { maxLead: 0.25, maxLag: 0.75 },
    },
    {
      version: 2,
      id: "support",
      text: "Supporting detail",
      role: "supporting",
      start: 2.95,
      end: 17,
      cueText: "<frame-start>",
      sourceRefs: [],
      tolerance: { maxLead: 0.25, maxLag: 0.75 },
    },
  ],
};

const REGISTRY = {
  frames: {
    "reserve-flow": [
      { beatId: "reserve", target: "WorkflowStep:reserve", role: "focal" as const, startFrame: 89, endFrame: 332, durationFrames: 15, enter: "none" as const },
      { beatId: "execute", target: "WorkflowStep:execute", role: "focal" as const, startFrame: 332, endFrame: 510, durationFrames: 15, enter: "rise" as const },
      { beatId: "support", target: "SupportingLabel", role: "supporting" as const, startFrame: 89, endFrame: 510, durationFrames: 0, enter: "none" as const },
    ],
  },
};

async function loadTemplateModule(entryPoint: string, label: string): Promise<Record<string, unknown>> {
  const outputDir = mkdtempSync(join(tmpdir(), `remotion-${label}-`));
  const outfile = join(outputDir, `${label}.mjs`);
  try {
    buildSync({
      entryPoints: [entryPoint],
      outfile,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node26",
      jsx: "automatic",
      logLevel: "silent",
    });
    return await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

async function loadVisualBeats(): Promise<Record<string, unknown>> {
  return loadTemplateModule(VISUAL_BEATS, "visual-beats");
}

test("Remotion templates expose beat-owned reveal helpers and standalone type parity", () => {
  const source = readFileSync(VISUAL_BEATS, "utf8");
  const templateTypes = readFileSync(TEMPLATE_TYPES, "utf8");
  const engineTypes = readFileSync(ENGINE_TYPES, "utf8");

  for (const name of [
    "VisualBeatProvider",
    "BeatState",
    "BeatReveal",
    "isVisualBeatActive",
    "useVisualBeatBinding",
    "useVisualBeatProgress",
    "resolveVisualBeatBinding",
  ]) {
    assert.match(source, new RegExp(`\\b${name}\\b`));
  }
  assert.doesNotMatch(source, /startSeconds\s*:/);

  for (const field of [
    "visualKind?: \"focal\" | \"workflow\" | \"comparison\" | \"sequence\"",
    "visualSpecVersion?: 1 | 2",
    "visualBeats?: ResolvedVisualBeat[]",
    "visualCoverageExemptions?: ResolvedCoverageExemption[]",
    "visualBindings?: Record<string, RuntimeVisualBinding[]>",
    "cueWordIndex?: number",
    "cueText: string",
    "sourceRefs: string[]",
    "tolerance: { maxLead: number; maxLag: number }",
    "export interface ResolvedVisualStateV2",
    "export interface RuntimeVisualBindingV2",
    "export interface ResolvedCoverageExemption",
    "startFrame: number",
    "endFrame: number",
  ]) {
    assert.match(templateTypes, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(engineTypes, /export interface ResolvedVisualBeat/);
  assert.match(engineTypes, /visualBeats\?: ResolvedVisualBeat\[\]/);
});

test("scaffolded Remotion runtime includes typecheckable beat helpers", () => {
  const project = mkdtempSync(join(tmpdir(), "remotion-visual-beats-runtime-"));
  try {
    ensureRuntime(project, "remotion");
    assert.equal(existsSync(join(project, "src", "VisualBeats.tsx")), true);
    symlinkSync(resolve("node_modules"), join(project, "node_modules"), "dir");
    execFileSync(
      process.execPath,
      [resolve("node_modules", "typescript", "bin", "tsc"), "--noEmit", "-p", "tsconfig.json"],
      { cwd: project, stdio: "pipe" },
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("resolveVisualBeatBinding consumes v2 runtime frame boundaries", async () => {
  const { resolveVisualBeatBinding } = await loadVisualBeats() as {
    resolveVisualBeatBinding: (input: {
      frame: typeof FRAME;
      bindings: typeof REGISTRY.frames["reserve-flow"];
      target: string;
      fps: number;
    }) => { startFrame: number; endFrame: number; durationFrames: number; binding: { beatId: string } };
  };

  const binding = resolveVisualBeatBinding({
    frame: FRAME,
    bindings: REGISTRY.frames["reserve-flow"],
    target: "WorkflowStep:execute",
    fps: 30,
  });
  assert.equal(binding.binding.beatId, "execute");
  assert.equal(binding.startFrame, 332);
  assert.equal(binding.endFrame, 510);
  assert.equal(binding.durationFrames, 15);
});

test("resolveVisualBeatBinding rejects invalid registered bindings", async () => {
  const { resolveVisualBeatBinding } = await loadVisualBeats() as {
    resolveVisualBeatBinding: (input: {
      frame: typeof FRAME;
      bindings: readonly Record<string, unknown>[];
      target: string;
      fps: number;
      registryFrameSlug?: string;
    }) => unknown;
  };

  const input = (bindings: readonly Record<string, unknown>[], target = "WorkflowStep:execute") => ({
    frame: FRAME,
    bindings,
    target,
    fps: 30,
  });

  assert.throws(
    () => resolveVisualBeatBinding(input(REGISTRY.frames["reserve-flow"], "WorkflowStep:missing")),
    /expected one visual binding.*found 0/,
  );
  assert.throws(
    () => resolveVisualBeatBinding(input([
      ...REGISTRY.frames["reserve-flow"],
      { beatId: "execute", target: "WorkflowStep:execute", role: "focal", startFrame: 332, endFrame: 510, durationFrames: 15, enter: "rise" },
    ])),
    /expected one visual binding.*found 2/,
  );
  assert.throws(
    () => resolveVisualBeatBinding(input([
      { beatId: "missing", target: "WorkflowStep:execute", role: "focal", startFrame: 332, endFrame: 510, durationFrames: 15, enter: "rise" },
    ])),
    /unknown visual beat missing/,
  );
  assert.throws(
    () => resolveVisualBeatBinding(input([
      { beatId: "execute", target: "WorkflowStep:execute", role: "focal", startFrame: 332, endFrame: 510, durationFrames: 15, enter: "spin" },
    ])),
    /unsupported visual entrance spin/,
  );
  assert.throws(
    () => resolveVisualBeatBinding(input([
      { beatId: "execute", target: "WorkflowStep:execute", role: "focal", startFrame: 332, endFrame: 510, durationFrames: -1, enter: "rise" },
    ])),
    /durationFrames.*non-negative integer/,
  );
  assert.throws(
    () => resolveVisualBeatBinding({
      ...input(REGISTRY.frames["reserve-flow"]),
      registryFrameSlug: "other-frame",
    }),
    /registry frame other-frame does not match reserve-flow/,
  );
});

test("owned reveal timing uses active intervals and covers progress/token boundaries", async () => {
  const runtime = await loadVisualBeats() as {
    resolveVisualBeatBinding: (input: {
      frame: typeof FRAME;
      bindings: typeof REGISTRY.frames["reserve-flow"];
      target: string;
      fps: number;
    }) => { startFrame: number; endFrame: number; durationFrames: number };
    isVisualBeatActive: (currentFrame: number, target: { startFrame: number; endFrame: number }) => boolean;
    resolveVisualBeatProgress: (currentFrame: number, startFrame: number, durationFrames: number) => number;
    resolveVisualBeatStyle: (enter: string, progress: number, visible: boolean) => Record<string, unknown>;
  };

  const opening = runtime.resolveVisualBeatBinding({
    frame: FRAME,
    bindings: REGISTRY.frames["reserve-flow"],
    target: "WorkflowStep:reserve",
    fps: 30,
  });
  assert.equal(runtime.isVisualBeatActive(88, opening), false);
  assert.equal(runtime.isVisualBeatActive(89, opening), true);
  assert.equal(runtime.isVisualBeatActive(331, opening), true);
  assert.equal(runtime.isVisualBeatActive(332, opening), false);

  const solution = runtime.resolveVisualBeatBinding({
    frame: FRAME,
    bindings: REGISTRY.frames["reserve-flow"],
    target: "WorkflowStep:execute",
    fps: 30,
  });
  assert.equal(runtime.isVisualBeatActive(331, solution), false);
  assert.equal(runtime.isVisualBeatActive(332, solution), true);
  assert.equal(runtime.isVisualBeatActive(509, solution), true);
  assert.equal(runtime.isVisualBeatActive(510, solution), false);
  assert.equal(solution.durationFrames, 15);

  assert.equal(runtime.resolveVisualBeatProgress(331, 332, 15), 0);
  assert.ok(runtime.resolveVisualBeatProgress(332, 332, 15) > 0);
  assert.equal(runtime.resolveVisualBeatProgress(347, 332, 15), 1);
  assert.equal(runtime.resolveVisualBeatProgress(509, 332, 15), 1);
  assert.equal(runtime.resolveVisualBeatProgress(15, 10, 0), 1);

  assert.deepEqual(runtime.resolveVisualBeatStyle("fade", 0.5, false), { opacity: 0.5 });
  assert.deepEqual(runtime.resolveVisualBeatStyle("rise", 0.5, false), { opacity: 0.5, transform: "translateY(9px)" });
  assert.deepEqual(runtime.resolveVisualBeatStyle("slide-left", 0.5, false), { opacity: 0.5, transform: "translateX(12px)" });
  const scale = runtime.resolveVisualBeatStyle("scale", 0.5, false);
  assert.equal(scale.opacity, 0.5);
  assert.ok(Math.abs(Number(String(scale.transform).slice(6, -1)) - 0.96) < Number.EPSILON);
  assert.deepEqual(runtime.resolveVisualBeatStyle("none", 0, false), { opacity: 0 });
  assert.deepEqual(runtime.resolveVisualBeatStyle("none", 0, true), { opacity: 1 });

  for (const fps of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
    assert.throws(
      () => runtime.resolveVisualBeatBinding({
        frame: FRAME,
        bindings: REGISTRY.frames["reserve-flow"],
        target: "WorkflowStep:execute",
        fps,
      }),
      /finite positive number/,
    );
  }
});

test("scene opacity is nonzero for every renderable semantic coverage frame", async () => {
  const { sceneOpacity } = await loadTemplateModule(join(TEMPLATE_ROOT, "primitives.tsx"), "primitives") as {
    sceneOpacity: (frame: number, durationInFrames: number, xfadeFrames: number) => number;
  };

  assert.ok(sceneOpacity(0, 510, 15) > 0);
  assert.equal(sceneOpacity(1, 510, 15) > 0, true);
  assert.equal(sceneOpacity(509, 510, 15) > 0, true);
});
