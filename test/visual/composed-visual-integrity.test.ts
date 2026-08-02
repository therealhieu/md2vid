import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, isAbsolute, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { verifyVisualSync } from "../../engine/visual_sync.ts";
import type { BuildPlan, VisualBindingManifest } from "../../engine/types.ts";
import { prepareFrameVisualTiming } from "../../frameworks/hyperframes/visual_timing.ts";
import { runComposedVisualIntegrity, validatePlan } from "./composed-visual-integrity.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = join(HERE, "fixtures");
const REPO_ROOT = resolve(HERE, "..", "..");
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

let origin = "";
let closeServer: (() => Promise<void>) | undefined;

before(async () => {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://fixture.test").pathname);
    const candidate = resolve(FIXTURES, `.${pathname}`);
    if (!candidate.startsWith(`${resolve(FIXTURES)}/`)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    if (!existsSync(candidate)) {
      response.writeHead(404).end("not found");
      return;
    }
    const path = statSync(candidate).isDirectory() ? join(candidate, "index.html") : candidate;
    if (!existsSync(path)) {
      response.writeHead(404).end("not found");
      return;
    }
    response.setHeader("content-type", CONTENT_TYPES[extname(path)] ?? "application/octet-stream");
    response.end(readFileSync(path));
  });
  await new Promise<void>((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveReady);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
  closeServer = () => new Promise<void>((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
});

after(async () => {
  await closeServer?.();
});

function browserPath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const output = execFileSync(
    process.execPath,
    [join(REPO_ROOT, "node_modules", "hyperframes", "dist", "cli.js"), "browser", "path"],
    { encoding: "utf8" },
  );
  return output.trim().split(/\r?\n/).at(-1)?.trim() ?? "";
}

test("browser path discovery returns only an executable path on first use", () => {
  const home = mkdtempSync(join(tmpdir(), "md2vid-visual-browser-home-"));
  const previousHome = process.env.HOME;
  const previousChromePath = process.env.CHROME_PATH;
  const previousNoTelemetry = process.env.HYPERFRAMES_NO_TELEMETRY;
  const previousDoNotTrack = process.env.DO_NOT_TRACK;
  try {
    process.env.HOME = home;
    delete process.env.CHROME_PATH;
    delete process.env.HYPERFRAMES_NO_TELEMETRY;
    delete process.env.DO_NOT_TRACK;
    const discovered = browserPath();
    assert.equal(isAbsolute(discovered), true, `unexpected browser path output: ${discovered}`);
    assert.equal(existsSync(discovered), true, `browser path does not exist: ${discovered}`);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousChromePath === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = previousChromePath;
    if (previousNoTelemetry === undefined) delete process.env.HYPERFRAMES_NO_TELEMETRY;
    else process.env.HYPERFRAMES_NO_TELEMETRY = previousNoTelemetry;
    if (previousDoNotTrack === undefined) delete process.env.DO_NOT_TRACK;
    else process.env.DO_NOT_TRACK = previousDoNotTrack;
    rmSync(home, { recursive: true, force: true });
  }
});

async function runFixture(name: string) {
  const outputDir = mkdtempSync(join(tmpdir(), `md2vid-visual-${name}-`));
  try {
    const projectDir = join(FIXTURES, name);
    const summary = await runComposedVisualIntegrity({
      baseUrl: `${origin}/${name}/`,
      projectDir,
      outputDir,
      executablePath: browserPath(),
    });
    const artifacts = Object.fromEntries(
      ["caption-contrast.json", "text-occlusion.json", "frame-theme.json"].map((filename) => [
        filename,
        JSON.parse(readFileSync(join(outputDir, filename), "utf8")),
      ]),
    );
    return { summary, artifacts };
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

test("passing composed output emits complete machine-readable visual evidence", async () => {
  const { summary, artifacts } = await runFixture("passing");
  assert.equal(summary.result, "PASS");
  assert.equal(artifacts["caption-contrast.json"].result, "PASS");
  assert.equal(artifacts["text-occlusion.json"].result, "PASS");
  assert.equal(artifacts["frame-theme.json"].result, "PASS");

  const captionRows = artifacts["caption-contrast.json"].samples;
  assert.ok(captionRows.some((row: any) => row.state === "active"));
  assert.ok(captionRows.some((row: any) => row.state === "spoken"));
  assert.equal(captionRows.some((row: any) => row.wordId === "word-hidden"), false);
  for (const row of captionRows) {
    for (const field of [
      "frameSlug", "globalTime", "wordId", "state", "color", "sampledBackground",
      "ratio", "rect", "occluder",
    ]) {
      assert.ok(Object.hasOwn(row, field), `caption evidence missing ${field}`);
    }
    assert.ok(row.ratio >= row.threshold, JSON.stringify(row));
  }
});

test("dark active caption over a dark composed frame fails caption contrast", async () => {
  const { summary, artifacts } = await runFixture("dark-caption");
  assert.equal(summary.result, "FAIL");
  assert.equal(artifacts["caption-contrast.json"].result, "FAIL");
  assert.equal(artifacts["text-occlusion.json"].result, "PASS");
  assert.equal(artifacts["frame-theme.json"].result, "PASS");
  assert.ok(artifacts["caption-contrast.json"].failures.some((failure: any) =>
    failure.code === "caption_contrast_insufficient" &&
    failure.state === "active" &&
    failure.ratio < failure.threshold
  ));
});

test("transparent full-canvas overlay is skipped and the opaque title marker is reported", async () => {
  const { summary, artifacts } = await runFixture("transparent-overlay-occlusion");
  assert.equal(summary.result, "FAIL");
  assert.equal(artifacts["caption-contrast.json"].result, "PASS");
  assert.equal(artifacts["text-occlusion.json"].result, "FAIL");
  assert.equal(artifacts["frame-theme.json"].result, "PASS");
  assert.ok(artifacts["text-occlusion.json"].failures.some((failure: any) =>
    failure.code === "text_occluded" &&
    failure.victim === "#covered-title" &&
    failure.occluder === "#opaque-marker"
  ));
  assert.equal(
    artifacts["text-occlusion.json"].failures.some((failure: any) =>
      failure.occluder === "#transparent-overlay"
    ),
    false,
  );
});

test("undeclared dark frame in a light project fails frame-theme validation", async () => {
  const { summary, artifacts } = await runFixture("undeclared-dark-frame");
  assert.equal(summary.result, "FAIL");
  assert.equal(artifacts["caption-contrast.json"].result, "PASS");
  assert.equal(artifacts["text-occlusion.json"].result, "PASS");
  assert.equal(artifacts["frame-theme.json"].result, "FAIL");
  assert.ok(artifacts["frame-theme.json"].failures.some((failure: any) =>
    failure.code === "frame_theme_missing" &&
    failure.frameSlug === "01-undeclared-dark" &&
    failure.background === "#1b1a18"
  ));
});

test("caption descendant pill background makes white text readable over a white frame", async () => {
  const { summary, artifacts } = await runFixture("readable-caption-pill");
  assert.equal(summary.result, "PASS");
  const row = artifacts["caption-contrast.json"].samples.find((sample: any) => sample.wordId === "word-readable-pill");
  assert.ok(row);
  assert.equal(row.sampledBackground, "#000000");
  assert.ok(row.ratio >= 4.5, JSON.stringify(row));
});

test("caption descendant pill background exposes dark-on-black failure over a white frame", async () => {
  const { summary, artifacts } = await runFixture("unreadable-caption-pill");
  assert.equal(summary.result, "FAIL");
  const failure = artifacts["caption-contrast.json"].failures.find((row: any) => row.wordId === "word-unreadable-pill");
  assert.ok(failure);
  assert.equal(failure.sampledBackground, "#000000");
  assert.equal(failure.code, "caption_contrast_insufficient");
});

test("caption foreground includes effective ancestor opacity before contrast", async () => {
  const { summary, artifacts } = await runFixture("caption-opacity");
  assert.equal(summary.result, "FAIL");
  const failure = artifacts["caption-contrast.json"].failures.find((row: any) => row.wordId === "word-opacity");
  assert.ok(failure, JSON.stringify(artifacts["caption-contrast.json"]));
  assert.equal(failure.code, "caption_contrast_insufficient");
  assert.ok(failure.effectiveOpacity > 0.04 && failure.effectiveOpacity < 0.06);
  assert.notEqual(failure.color, "#000000");
  assert.ok(failure.ratio < 1.2, JSON.stringify(failure));
});

test("caption groups drive fail-closed missing, hidden, and stale state diagnostics", async () => {
  const { summary, artifacts } = await runFixture("caption-state-controls");
  assert.equal(summary.result, "FAIL");
  const failures = artifacts["caption-contrast.json"].failures;
  assert.ok(failures.some((row: any) => row.code === "caption_state_missing" && row.wordId === "word-missing-state"), JSON.stringify(failures));
  assert.ok(failures.some((row: any) => row.code === "caption_visibility_missing" && row.wordId === "word-hidden-state"), JSON.stringify(failures));
  assert.ok(failures.some((row: any) => row.code === "caption_state_mismatch" && row.wordId === "word-stale-state"), JSON.stringify(failures));
  assert.ok(failures.some((row: any) => row.code === "caption_state_unexpected" && row.wordId === "word-unexpected-state" && row.actualState === "spoken"), JSON.stringify(failures));
  assert.ok(failures.some((row: any) => row.code === "caption_state_empty" && row.groupId === "g-empty"), JSON.stringify(failures));
});

test("frame theme composites semi-transparent full-canvas layers before classification", async () => {
  const { summary, artifacts } = await runFixture("layered-theme");
  assert.equal(summary.result, "FAIL");
  const failure = artifacts["frame-theme.json"].failures.find((row: any) =>
    row.code === "frame_theme_mismatch" && row.frameSlug === "01-layered-theme"
  );
  assert.ok(failure, JSON.stringify(artifacts["frame-theme.json"]));
  assert.equal(failure.declaredTheme, "light");
  assert.equal(failure.detectedTheme, "dark");
  assert.ok(failure.groundLayers.length >= 2);
});

test("caption background sampling applies effective ancestor opacity", async () => {
  const { artifacts } = await runFixture("ancestor-opacity-background");
  const caption = artifacts["caption-contrast.json"];
  const active = caption.samples.find((row: any) =>
    row.wordId === "word-opacity-bg" && row.state === "active"
  );
  assert.ok(active, JSON.stringify(caption));
  assert.equal(active.sampledBackground, "#808080");
  assert.ok(active.ratio >= active.threshold, JSON.stringify(active));
  assert.equal(caption.failures.some((row: any) => row.wordId === "word-opacity-bg"), false);
  assert.ok(artifacts["frame-theme.json"].failures.some((row: any) =>
    row.code === "frame_ground_unresolved" && row.frameSlug === "01-ancestor-opacity"
  ));
});

test("visible gradient ground fails caption and theme sampling before fallback color", async () => {
  const { summary, artifacts } = await runFixture("gradient-ground");
  assert.equal(summary.result, "FAIL");
  assert.ok(artifacts["caption-contrast.json"].failures.some((row: any) =>
    row.code === "caption_background_unresolved" &&
    row.wordId === "word-gradient" &&
    row.backgroundUnresolvedReason === "gradient-background-unresolved"
  ));
  assert.ok(artifacts["frame-theme.json"].failures.some((row: any) =>
    row.code === "frame_ground_unresolved" &&
    row.groundUnresolvedReason === "gradient-background-unresolved"
  ));
});

test("visible image ground fails caption and theme sampling before fallback color", async () => {
  const { summary, artifacts } = await runFixture("image-ground");
  assert.equal(summary.result, "FAIL");
  assert.ok(artifacts["caption-contrast.json"].failures.some((row: any) =>
    row.code === "caption_background_unresolved" &&
    row.wordId === "word-image" &&
    row.backgroundUnresolvedReason === "replaced-media-background-unresolved"
  ));
  assert.ok(artifacts["frame-theme.json"].failures.some((row: any) =>
    row.code === "frame_ground_unresolved" &&
    row.groundUnresolvedReason === "replaced-media-background-unresolved"
  ));
});

test("occlusion detects pseudo-element, border, and supported gradient paint", async () => {
  const { summary, artifacts } = await runFixture("css-paint-controls");
  assert.equal(summary.result, "FAIL");
  const failures = artifacts["text-occlusion.json"].failures;
  assert.ok(failures.some((row: any) => row.code === "text_occluded" && row.victim === "#pseudo-title" && row.occluder === "#pseudo-control::before"), JSON.stringify(failures));
  assert.ok(failures.some((row: any) => row.code === "text_occluded" && row.victim === "#border-title" && row.occluder === "#border-control"), JSON.stringify(failures));
  assert.ok(failures.some((row: any) => row.code === "text_occluded" && row.victim === "#gradient-title" && row.occluder === "#gradient-control"), JSON.stringify(failures));
});

test("occlusion probes individual glyph line rects instead of enclosing union whitespace", async () => {
  const { summary, artifacts } = await runFixture("glyph-rect-controls");
  assert.equal(summary.result, "FAIL");
  const report = artifacts["text-occlusion.json"];
  const blank = report.samples.find((row: any) => row.victim === "#blank-union-title");
  const short = report.failures.find((row: any) => row.victim === "#short-line-title");
  assert.ok(blank && short, JSON.stringify(report));
  assert.equal(report.failures.some((row: any) => row.victim === "#blank-union-title"), false);
  assert.ok(blank.glyphRects.length >= 2, JSON.stringify(blank));
  assert.ok(Array.isArray(blank.sampleDetails));
  assert.equal(short.code, "text_occluded");
  assert.ok(short.glyphRects.length >= 1);
  assert.ok(short.sampleDetails.some((detail: any) => detail.occluder === "#short-line-marker"));
});

test("paint-stack controls distinguish transparent, painted, and unresolved SVG/replaced pixels", async () => {
  const { summary, artifacts } = await runFixture("paint-controls");
  assert.equal(summary.result, "FAIL");
  const failures = artifacts["text-occlusion.json"].failures;
  for (const victim of ["#transparent-svg-title", "#transparent-canvas-title"]) {
    assert.equal(failures.some((row: any) => row.victim === victim), false, victim);
  }
  assert.ok(failures.some((row: any) =>
    row.code === "text_occluded" && row.victim === "#painted-svg-title" && row.occluder === "#painted-svg-shape"
  ), JSON.stringify(failures));
  assert.ok(failures.some((row: any) =>
    row.code === "text_occluded" && row.victim === "#painted-canvas-title" && row.occluder === "#painted-canvas"
  ), JSON.stringify(failures));
  assert.ok(failures.some((row: any) =>
    row.code === "text_paint_unresolved" && row.victim === "#indeterminate-title" && row.occluder === "#indeterminate-img"
  ), JSON.stringify(failures));
});

test("large text at 3.x contrast passes while normal text at the same ratio fails", async () => {
  const { summary, artifacts } = await runFixture("threshold-controls");
  assert.equal(summary.result, "FAIL");
  const report = artifacts["caption-contrast.json"];
  const large = report.samples.find((row: any) => row.wordId === "word-large" && row.state === "active");
  const normal = report.samples.find((row: any) => row.wordId === "word-normal" && row.state === "active");
  assert.ok(large && normal);
  assert.equal(large.color, normal.color);
  assert.equal(large.sampledBackground, normal.sampledBackground);
  assert.ok(large.ratio >= 3 && large.ratio < 4.5, JSON.stringify(large));
  assert.equal(large.threshold, 3);
  assert.equal(large.largeText, true);
  assert.equal(report.failures.some((row: any) => row.wordId === "word-large"), false);
  assert.equal(normal.threshold, 4.5);
  assert.equal(normal.largeText, false);
  assert.ok(report.failures.some((row: any) =>
    row.code === "caption_contrast_insufficient" && row.wordId === "word-normal"
  ));
});

test("composed host timing is authoritative and plan mismatches fail every report", async () => {
  const { summary, artifacts } = await runFixture("host-timing-mismatch");
  assert.equal(summary.result, "FAIL");
  for (const filename of ["caption-contrast.json", "text-occlusion.json", "frame-theme.json"]) {
    const report = artifacts[filename];
    assert.equal(report.result, "FAIL", filename);
    assert.ok(report.failures.some((row: any) =>
      row.code === "plan_host_timing_mismatch" && row.frameSlug === "01-host-mismatch"
    ), `${filename}: ${JSON.stringify(report)}`);
    assert.deepEqual(report.timing.frames[0].actual, { start: 0.5, frameDur: 1.5 });
  }
  const themeTimes = artifacts["frame-theme.json"].samples.map((row: any) => row.globalTime);
  assert.deepEqual(themeTimes, [0.55, 1.25, 1.95]);
});

test("compiled hosts fall back to one matching clip-manifest duration", async () => {
  const { summary, artifacts } = await runFixture("compiled-host-manifest");
  assert.equal(summary.result, "PASS");
  for (const filename of ["caption-contrast.json", "text-occlusion.json", "frame-theme.json"]) {
    const timingFrame = artifacts[filename].timing.frames[0];
    assert.equal(timingFrame.valid, true, filename);
    assert.equal(timingFrame.matches, true, filename);
    assert.deepEqual(timingFrame.actual, { start: 0, frameDur: 2 });
    assert.deepEqual(timingFrame.sources, {
      start: "host-data-start",
      frameDur: "clip-manifest",
    });
  }
});

test("missing compiled host duration without a unique manifest match fails closed", async () => {
  const { summary, artifacts } = await runFixture("host-duration-missing");
  assert.equal(summary.result, "FAIL");
  for (const filename of ["caption-contrast.json", "text-occlusion.json", "frame-theme.json"]) {
    const report = artifacts[filename];
    const failure = report.failures.find((row: any) =>
      row.code === "plan_host_timing_mismatch" && row.frameSlug === "01-missing-duration"
    );
    assert.ok(failure, `${filename}: ${JSON.stringify(report)}`);
    assert.equal(report.timing.frames[0].valid, false);
    assert.deepEqual(report.timing.frames[0].sources, {
      start: "host-data-start",
      frameDur: "unresolved",
    });
  }
});

test("manifest duration fallback fails closed for incoherent matches and timing", async () => {
  const { summary, artifacts } = await runFixture("manifest-fallback-controls");
  assert.equal(summary.result, "FAIL");
  const expectedIssues = new Map([
    ["01-ambiguous", { count: 2, issue: "manifest-match-ambiguous" }],
    ["02-start-mismatch", { count: 1, issue: "manifest-host-start-mismatch" }],
    ["03-missing-start", { count: 1, issue: "host-start-unresolved" }],
    ["04-wrong-identity", { count: 0, issue: "manifest-match-missing" }],
    ["05-malformed", { count: 1, issue: "manifest-timing-invalid" }],
    ["06-duration-mismatch", { count: 1, issue: "runtime-plan-value-mismatch" }],
  ]);
  for (const filename of ["caption-contrast.json", "text-occlusion.json", "frame-theme.json"]) {
    const report = artifacts[filename];
    assert.equal(report.result, "FAIL", filename);
    for (const [frameSlug, expected] of expectedIssues) {
      const timingFrame = report.timing.frames.find((row: any) => row.frameSlug === frameSlug);
      assert.ok(timingFrame, `${filename}: ${frameSlug}`);
      assert.equal(timingFrame.manifestMatchCount, expected.count, `${filename}: ${frameSlug}`);
      assert.equal(timingFrame.issue, expected.issue, `${filename}: ${frameSlug}`);
      assert.ok(report.failures.some((row: any) =>
        row.code === "plan_host_timing_mismatch" && row.frameSlug === frameSlug && row.reason === expected.issue
      ), `${filename}: ${frameSlug}: ${JSON.stringify(report)}`);
    }
  }
});

test("xfade transition-side samples stay outside adjacent full-canvas overlap paint", async () => {
  const { summary, artifacts } = await runFixture("xfade-transition-samples");
  assert.equal(summary.result, "PASS");
  const theme = artifacts["frame-theme.json"];
  const occlusion = artifacts["text-occlusion.json"];
  assert.equal(theme.failures.some((row: any) => row.code === "frame_ground_unresolved"), false);
  assert.equal(occlusion.failures.some((row: any) => row.code === "text_occluded"), false);
  assert.deepEqual(
    theme.samples.map((row: any) => [row.frameSlug, row.phase, row.globalTime]),
    [
      ["01-first", "transition-in", 0.05],
      ["01-first", "midpoint", 1],
      ["01-first", "transition-out", 1.45],
      ["02-middle", "transition-in", 2.05],
      ["02-middle", "midpoint", 2.5],
      ["02-middle", "transition-out", 2.95],
      ["03-last", "transition-in", 3.55],
      ["03-last", "midpoint", 4],
      ["03-last", "transition-out", 4.95],
    ],
  );
});

test("short xfade frames fail closed when no stable sample interval exists", async () => {
  const { summary, artifacts } = await runFixture("xfade-short-frame");
  assert.equal(summary.result, "FAIL");
  for (const filename of ["caption-contrast.json", "text-occlusion.json", "frame-theme.json"]) {
    const report = artifacts[filename];
    assert.equal(report.result, "FAIL", filename);
    assert.ok(report.failures.some((row: any) =>
      row.code === "frame_stable_sample_unavailable" && row.frameSlug === "02-short-middle"
    ), `${filename}: ${JSON.stringify(report)}`);
  }
  const middle = artifacts["frame-theme.json"].samples.filter((row: any) =>
    row.frameSlug === "02-short-middle"
  );
  assert.deepEqual(middle, []);
});

test("caption expectations use actual post-seek time when the player quantizes", async () => {
  const { summary, artifacts } = await runFixture("quantized-caption-seek");
  assert.equal(summary.result, "PASS");
  const report = artifacts["caption-contrast.json"];
  assert.equal(report.failures.some((row: any) => row.code === "caption_state_mismatch"), false);
  assert.ok(report.seeks.some((row: any) =>
    row.requestedTime === 0.06 && row.actualTime === 0.033333
  ), JSON.stringify(report));
  const quantized = report.samples.find((row: any) =>
    row.wordId === "word-before-quantized-time" && row.state === "active"
  );
  assert.ok(quantized, JSON.stringify(report));
  assert.equal(quantized.requestedTime, 0.06);
  assert.equal(quantized.actualTime, 0.033333);
  assert.equal(quantized.globalTime, quantized.actualTime);
  for (const filename of ["text-occlusion.json", "frame-theme.json"]) {
    const visualReport = artifacts[filename];
    assert.ok(visualReport.seeks.some((row: any) =>
      row.requestedTime === 0.05 && row.actualTime === 0.033333
    ), `${filename}: ${JSON.stringify(visualReport)}`);
    const visualSample = visualReport.samples.find((row: any) => row.phase === "transition-in");
    assert.ok(visualSample, filename);
    assert.equal(visualSample.requestedTime, 0.05);
    assert.equal(visualSample.actualTime, 0.033333);
    assert.equal(visualSample.globalTime, visualSample.actualTime);
  }
});

test("visual seek quantization outside the intended frame window fails every report", async () => {
  const { summary, artifacts } = await runFixture("quantized-visual-window");
  assert.equal(summary.result, "FAIL");
  for (const filename of ["caption-contrast.json", "text-occlusion.json", "frame-theme.json"]) {
    const report = artifacts[filename];
    assert.equal(report.result, "FAIL", filename);
    assert.ok(report.failures.some((row: any) =>
      row.code === "visual_sample_time_out_of_window" &&
      row.frameSlug === "01-visual-window" &&
      row.requestedTime === 0.07 &&
      row.actualTime === 0
    ), `${filename}: ${JSON.stringify(report)}`);
  }
});

test("cue-bound states are deterministic across direct, reverse, and sequential seeks", async () => {
  const fixture = join(FIXTURES, "visual-timing-sync");
  const plan = JSON.parse(readFileSync(join(fixture, "build", "build_plan.json"), "utf8")) as BuildPlan;
  const prepared = prepareFrameVisualTiming({
    frame: plan.frames[0],
    authoredHtml: readFileSync(join(fixture, "authored.html"), "utf8"),
    documentPath: "visual-timing-sync/authored.html",
    mode: "required",
  });
  const aligned: VisualBindingManifest = {
    version: 1,
    framework: "hyperframes",
    bindings: prepared.bindings.map((binding) => ({ ...binding, outerDuration: plan.frames[0].frameDur })),
  };
  const policy = { mode: "required", maxLead: 0.25, maxLag: 0.75, minLanding: 1 } as const;
  assert.deepEqual(verifyVisualSync({ plan, manifest: aligned, policy, fps: 30 }), []);

  const frontLoaded = JSON.parse(
    readFileSync(join(fixture, "front-loaded-manifest.json"), "utf8"),
  ) as VisualBindingManifest;
  const frontLoadedFindings = verifyVisualSync({ plan, manifest: frontLoaded, policy, fps: 30 });
  assert.ok(frontLoadedFindings.some((finding) =>
    finding.msg.includes('beat "execute"') && finding.msg.includes("lead is 7.360s")
  ), JSON.stringify(frontLoadedFindings));
  assert.ok(frontLoadedFindings.some((finding) =>
    finding.msg.includes('beat "settle"') && finding.msg.includes("lead is 8.450s")
  ), JSON.stringify(frontLoadedFindings));

  const browser = await puppeteer.launch({
    executablePath: browserPath(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    for (const fps of [24, 30, 60]) {
      await page.setViewport({ width: 960, height: 540 });
      await page.setContent(`<!doctype html><div data-composition-id="main" data-fps="${fps}">${prepared.html}</div>`);
      const runtime = await page.evaluate(() => {
        const pageRuntime = globalThis as any;
        return {
          timelineKeys: Object.keys(pageRuntime.__timelines),
          paused: pageRuntime.__timelines["reserve-flow"].paused(),
          fps: Number(pageRuntime.document.querySelector('[data-composition-id="main"]')?.getAttribute("data-fps")),
        };
      });
      assert.deepEqual(runtime.timelineKeys, ["reserve-flow"]);
      assert.equal(runtime.paused, true);
      assert.equal(runtime.fps, fps);

      for (const cue of [2.95, 11.06, 14.35]) {
        const before = Math.max(0, (Math.ceil(cue * fps) - 1) / fps);
        const after = Math.ceil(cue * fps) / fps;
        for (const time of [before, after]) {
          const direct = await page.evaluate((seekTime) => {
            const pageRuntime = globalThis as any;
            pageRuntime.__player.seek(seekTime);
            return pageRuntime.__captureVisualState();
          }, time);
          const sequential = await page.evaluate(({ seekTime, activeFps }) => {
            const pageRuntime = globalThis as any;
            pageRuntime.__player.seek(0);
            for (let frame = 1; frame <= Math.round(seekTime * activeFps); frame += 1) {
              pageRuntime.__player.seek(frame / activeFps);
            }
            return pageRuntime.__captureVisualState();
          }, { seekTime: time, activeFps: fps });
          const reverseForward = await page.evaluate(({ seekTime, activeFps }) => {
            const pageRuntime = globalThis as any;
            pageRuntime.__player.seek(18);
            for (let frame = Math.ceil(18 * activeFps); frame >= Math.round(seekTime * activeFps); frame -= 1) {
              pageRuntime.__player.seek(frame / activeFps);
            }
            return pageRuntime.__captureVisualState();
          }, { seekTime: time, activeFps: fps });
          assert.deepEqual(direct, sequential, `direct state differs at ${time}s / ${fps} FPS`);
          assert.deepEqual(reverseForward, sequential, `reverse state differs at ${time}s / ${fps} FPS`);
        }
      }
    }
  } finally {
    await browser.close();
  }
});

test("invalid build plans fail before browser launch or artifact emission", async () => {
  const valid = {
    version: 1,
    canvas: { width: 960, height: 540 },
    totalDuration: 4,
    frames: [
      { frameNum: 1, slug: "01-a", start: 0, frameDur: 2 },
      { frameNum: 2, slug: "02-b", start: 2, frameDur: 2 },
    ],
  };
  const cases = [
    { name: "canvas", mutate: (plan: any) => { plan.canvas.width = 0; } },
    { name: "total", mutate: (plan: any) => { plan.totalDuration = 0; } },
    { name: "negative-start", mutate: (plan: any) => { plan.frames[0].start = -1; } },
    { name: "duration", mutate: (plan: any) => { plan.frames[0].frameDur = 0; } },
    { name: "unordered", mutate: (plan: any) => { plan.frames[1].start = 1; plan.frames[0].start = 2; } },
    { name: "overlap", mutate: (plan: any) => { plan.frames[1].start = 1; } },
    { name: "outside-total", mutate: (plan: any) => { plan.frames[1].frameDur = 3; } },
    { name: "unsafe-slug", mutate: (plan: any) => { plan.frames[0].slug = "../escape"; } },
    { name: "duplicate-slug", mutate: (plan: any) => { plan.frames[1].slug = plan.frames[0].slug; } },
    { name: "zero-frame-number", mutate: (plan: any) => { plan.frames[0].frameNum = 0; } },
    { name: "fractional-frame-number", mutate: (plan: any) => { plan.frames[0].frameNum = 1.5; } },
    { name: "duplicate-frame-number", mutate: (plan: any) => { plan.frames[1].frameNum = plan.frames[0].frameNum; } },
  ];
  for (const entry of cases) {
    const root = mkdtempSync(join(tmpdir(), `md2vid-invalid-plan-${entry.name}-`));
    const output = join(root, "evidence");
    try {
      const plan = structuredClone(valid);
      entry.mutate(plan);
      mkdirSync(join(root, "build"));
      writeFileSync(join(root, "build", "build_plan.json"), JSON.stringify(plan));
      writeFileSync(join(root, "caption_groups.json"), "{\"groups\":[]}");
      await assert.rejects(
        runComposedVisualIntegrity({
          baseUrl: "http://127.0.0.1:9/",
          projectDir: root,
          outputDir: output,
          executablePath: "/does/not/exist",
        }),
        /invalid build plan/,
        entry.name,
      );
      assert.equal(existsSync(output), false, entry.name);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("plan validation rejects JSON-parsed nonfinite numeric fields", () => {
  const cases = [
    JSON.parse('{"canvas":{"width":1e999,"height":540},"totalDuration":2,"frames":[{"frameNum":1,"slug":"01-a","start":0,"frameDur":2}]}'),
    JSON.parse('{"canvas":{"width":960,"height":540},"totalDuration":1e999,"frames":[{"frameNum":1,"slug":"01-a","start":0,"frameDur":2}]}'),
    JSON.parse('{"canvas":{"width":960,"height":540},"totalDuration":2,"frames":[{"frameNum":1,"slug":"01-a","start":0,"frameDur":1e999}]}'),
  ];
  for (const plan of cases) assert.throws(() => validatePlan(plan), /invalid build plan/);
});

test("plan validation permits only overlap covered by declared nonzero xfade", () => {
  const plan = {
    version: 1,
    canvas: { width: 960, height: 540 },
    timing: { xfade: 0.5 },
    totalDuration: 4,
    frames: [
      { frameNum: 1, slug: "01-a", start: 0, frameDur: 2 },
      { frameNum: 2, slug: "02-b", start: 1.5, frameDur: 2 },
    ],
  };
  const validated = validatePlan(plan);
  assert.equal(validated.timing.xfade, 0.5);
  assert.deepEqual(validated.frames.map((frame) => frame.start), [0, 1.5]);
  const within = structuredClone(plan);
  within.frames[1].start = 1.75;
  assert.deepEqual(validatePlan(within).frames.map((frame) => frame.start), [0, 1.75]);
  const excessive = structuredClone(plan);
  excessive.frames[1].start = 1.49;
  assert.throws(() => validatePlan(excessive), /overlap beyond timing\.xfade/);
});

test("CLI accepts preview, project, and evidence/output paths for Task 9", async () => {
  for (const outputOption of ["--evidence", "--output"]) {
    const evidenceDir = mkdtempSync(join(tmpdir(), "md2vid-visual-cli-"));
    try {
      const child = spawn(process.execPath, [
        join(HERE, "composed-visual-integrity.mjs"),
        "--url", `${origin}/passing/`,
        "--project", join(FIXTURES, "passing"),
        outputOption, evidenceDir,
        "--browser-path", browserPath(),
      ], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      const status = await new Promise<number | null>((resolveExit, reject) => {
        child.once("error", reject);
        child.once("exit", resolveExit);
      });
      assert.equal(status, 0, `${outputOption}: ${stderr}`);
      assert.equal(JSON.parse(stdout).result, "PASS");
      for (const filename of ["caption-contrast.json", "text-occlusion.json", "frame-theme.json"]) {
        assert.equal(existsSync(join(evidenceDir, filename)), true, `${outputOption}: ${filename}`);
      }
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  }
});
