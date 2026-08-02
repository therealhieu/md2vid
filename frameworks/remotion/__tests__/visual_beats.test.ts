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
  visualBeats: [
    {
      id: "reserve",
      text: "Reserve value",
      start: 2.95,
      cueWordIndex: 3,
      cueText: "reserve",
      sourceRefs: [],
      workflowStep: 1,
      tolerance: { maxLead: 0.25, maxLag: 0.75 },
    },
    {
      id: "execute",
      text: "Execute operation",
      start: 11.06,
      cueWordIndex: 17,
      cueText: "execute",
      sourceRefs: [],
      workflowStep: 2,
      tolerance: { maxLead: 0.25, maxLag: 0.75 },
    },
  ],
};

const REGISTRY = {
  frames: {
    "reserve-flow": [
      { beat: "reserve", target: "WorkflowStep:reserve", enter: "rise" as const, duration: 0.5 },
      { beat: "execute", target: "WorkflowStep:execute", enter: "rise" as const, duration: 0.5 },
    ],
  },
};

async function loadVisualBeats(): Promise<Record<string, unknown>> {
  const outputDir = mkdtempSync(join(tmpdir(), "remotion-visual-beats-"));
  const outfile = join(outputDir, "VisualBeats.mjs");
  try {
    buildSync({
      entryPoints: [VISUAL_BEATS],
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

test("Remotion templates expose beat-owned reveal helpers and standalone type parity", () => {
  const source = readFileSync(VISUAL_BEATS, "utf8");
  const templateTypes = readFileSync(TEMPLATE_TYPES, "utf8");
  const engineTypes = readFileSync(ENGINE_TYPES, "utf8");

  for (const name of [
    "VisualBeatProvider",
    "BeatReveal",
    "useVisualBeatBinding",
    "useVisualBeatProgress",
    "resolveVisualBeatBinding",
  ]) {
    assert.match(source, new RegExp(`\\b${name}\\b`));
  }
  assert.doesNotMatch(source, /startSeconds\s*:/);

  for (const field of [
    "visualKind?: \"focal\" | \"workflow\" | \"comparison\" | \"sequence\"",
    "visualBeats?: ResolvedVisualBeat[]",
    "visualBindings?: Record<string, RemotionVisualBinding[]>",
    "cueWordIndex: number",
    "cueText: string",
    "sourceRefs: string[]",
    "tolerance: { maxLead: number; maxLag: number }",
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

test("resolveVisualBeatBinding converts registered cue seconds at the active FPS", async () => {
  const { resolveVisualBeatBinding } = await loadVisualBeats() as {
    resolveVisualBeatBinding: (input: {
      frame: typeof FRAME;
      bindings: typeof REGISTRY.frames["reserve-flow"];
      target: string;
      fps: number;
    }) => { startFrame: number; durationFrames: number };
  };

  const binding = resolveVisualBeatBinding({
    frame: FRAME,
    bindings: REGISTRY.frames["reserve-flow"],
    target: "WorkflowStep:execute",
    fps: 30,
  });
  assert.equal(binding.startFrame, Math.round(11.06 * 30));
  assert.equal(binding.durationFrames, Math.round(0.5 * 30));
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
      { beat: "execute", target: "WorkflowStep:execute", enter: "rise", duration: 0.5 },
    ])),
    /expected one visual binding.*found 2/,
  );
  assert.throws(
    () => resolveVisualBeatBinding(input([
      { beat: "missing", target: "WorkflowStep:execute", enter: "rise", duration: 0.5 },
    ])),
    /unknown visual beat missing/,
  );
  assert.throws(
    () => resolveVisualBeatBinding(input([
      { beat: "execute", target: "WorkflowStep:execute", enter: "spin", duration: 0.5 },
    ])),
    /unsupported visual entrance spin/,
  );
  assert.throws(
    () => resolveVisualBeatBinding(input([
      { beat: "execute", target: "WorkflowStep:execute", enter: "rise", duration: -0.5 },
    ])),
    /non-negative finite duration/,
  );
  assert.throws(
    () => resolveVisualBeatBinding({
      ...input(REGISTRY.frames["reserve-flow"]),
      registryFrameSlug: "other-frame",
    }),
    /registry frame other-frame does not match reserve-flow/,
  );
});
