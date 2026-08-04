// emit.mjs — the HyperFrames adapter's emitter. Consumes the neutral build plan
// and writes the framework OUTPUT files (index.html + compositions/captions.html)
// into the output dir. This is the ONLY place HF HTML is produced.
//
// Contract: emit(plan, sharedDir, outputDir, config). Idempotent.
//
// GROUPS SOURCE IS LOAD-BEARING: captions.html bakes its `var GROUPS` from the
// on-disk shared/caption_groups.json (the REGROUPED source of truth), NOT from
// plan.captionGroups (which is pre-regroup, one group per frame). The build chain
// is: plan → write caption_groups.json → regroup (mutates that JSON only) → emit
// (re-reads the regrouped JSON for GROUPS). Only duration/canvas/tokens come from
// the plan. This closes the drift where regroup used to write captions.html itself.
//
// trackIndex (frameNum%2) and crossfade pairs are HF LAYERING artifacts derived
// HERE from plan.frames + plan.timing — the neutral IR does not carry them.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BuildPlan,
  CaptionGroup,
  EmitOptions,
  FrameworkPreparation,
  VideoConfig,
  VisualBindingManifest,
  VisualBindingV1,
  VisualBindingV2,
} from "../../engine/types.ts";
import {
  captureVoiceWavSnapshots,
  validateVoiceAssets,
} from "../../engine/voice_assets.ts";
import { collectVoicePaths, stageVoiceAssets } from "../assets.ts";
import { resolveVisualSyncPolicy } from "../../engine/plan.ts";
import { digestAuthoredInputs, hashCoveragePlan } from "../../engine/visual_evidence.ts";
import { collectHyperframesAuthoredFrameInputs } from "./authored_inputs.ts";
import { prepareFrameVisualTiming } from "./visual_timing.ts";
import {
  extractCompositionTemplate,
  moveTopLevelTransportElementsIntoCompositionRoot,
  removeExternalScriptSource,
  replaceTemplateById,
} from "./html.ts";
import {
  DEFAULT_GSAP_SRC,
  ensureRuntime,
  gsapScriptSrcAttribute,
  materializeGsapTemplate,
  validateGsapSrc,
} from "./scaffold.ts";
import { contrastRatio, parseCssColor, type CssColor } from "./visual_contract.ts";

const FW_HYPERFRAMES = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(FW_HYPERFRAMES, "..", "..");
// The ONE source of truth for the caption look — HF-owned, beside the adapter.
const CAPTION_SKIN = join(FW_HYPERFRAMES, "templates", "caption-skin.html");

// Warm-editorial caption tokens (repo standard, per docs/standards/design). A project
// may override any of these via video.config.json → captions.tokens.
const DEFAULT_CAPTION_TOKENS = {
  "--ink": "#141413",
  "--cream": "#FAF9F5",
  "--tile": "#EFE9DE",
  "--tile-strong": "#ECE3D4",
  "--coral": "#CC785C",
  "--cap-ink": "#141413",
  "--cap-canvas": "#FAF9F5",
  "--cap-accent": "#CC785C",
  "--cap-band-height": "200px",
  "--font-display": '"EB Garamond"',
};

export const UPCOMING_CAPTION_INK_PERCENT = 61;

function mixSrgb(foreground: CssColor, background: CssColor, foregroundPercent: number): CssColor {
  const weight = foregroundPercent / 100;
  return {
    red: foreground.red * weight + background.red * (1 - weight),
    green: foreground.green * weight + background.green * (1 - weight),
    blue: foreground.blue * weight + background.blue * (1 - weight),
    alpha: 1,
  };
}

function colorHex(color: CssColor): string {
  const channel = (value: number) => Math.round(value).toString(16).padStart(2, "0");
  return `#${channel(color.red)}${channel(color.green)}${channel(color.blue)}`;
}

function requireCaptionBaselineContrast(tokens: Record<string, string>): void {
  const foreground = tokens["--cap-ink"];
  const background = tokens["--cap-canvas"];
  let foregroundColor: CssColor;
  let backgroundColor: CssColor;
  let ratio: number;
  try {
    foregroundColor = parseCssColor(foreground);
    backgroundColor = parseCssColor(background);
    ratio = contrastRatio(foregroundColor, backgroundColor);
  } catch (error) {
    throw new Error(
      `caption_token_invalid_color frame=captions foreground=${foreground} background=${background} ` +
        `reason=${JSON.stringify((error as Error).message)}`,
    );
  }
  const threshold = 4.5;
  if (ratio < threshold) {
    throw new Error(
      `caption_contrast_insufficient frame=captions foreground=${foreground} background=${background} ` +
        `ratio=${ratio.toFixed(2)} threshold=${threshold.toFixed(2)}`,
    );
  }

  const effective = mixSrgb(foregroundColor, backgroundColor, UPCOMING_CAPTION_INK_PERCENT);
  const upcomingRatio = contrastRatio(effective, backgroundColor);
  if (upcomingRatio < threshold) {
    throw new Error(
      `caption_contrast_insufficient frame=captions state=upcoming foreground=${foreground} ` +
        `canvas=${background} mix=${UPCOMING_CAPTION_INK_PERCENT}% effective=${colorHex(effective)} ` +
        `ratio=${upcomingRatio.toFixed(2)} threshold=${threshold.toFixed(2)}`,
    );
  }
}

export function sanitizeCompositionTemplate(
  html: string,
  compositionId: string,
  gsapSrc: string,
  documentPath: string,
): string {
  const body = extractCompositionTemplate(html, compositionId, documentPath);
  const withoutGsapSource = removeExternalScriptSource(body, gsapSrc, documentPath);
  const sanitized = moveTopLevelTransportElementsIntoCompositionRoot(
    withoutGsapSource,
    compositionId,
    documentPath,
  );
  return `<template id="${compositionId}-template">\n${sanitized.trim()}\n</template>`;
}

// Fill the canonical caption skin (the ONE source of truth for the caption LOOK) with
// the regrouped GROUPS (read off disk) + duration/canvas/tokens from the plan. The look
// is NEVER baked inline here. Returns the transportable captions.html fragment string.
export function buildCaptionsHtml(plan: BuildPlan, groups: CaptionGroup[], config: VideoConfig): string {
  const { width, height } = plan.canvas;
  const total = plan.totalDuration;
  const gsapSrc = config.gsapSrc ?? DEFAULT_GSAP_SRC;
  const tokens = { ...DEFAULT_CAPTION_TOKENS, ...(config.captions?.tokens || {}) };
  requireCaptionBaselineContrast(tokens);

  let skin = readFileSync(CAPTION_SKIN, "utf8");

  // Drop the leading authoring comment block; the rest is the transportable fragment.
  skin = skin.replace(/^<!--[\s\S]*?-->\s*/, "");

  // Use the project's explicit GSAP source when configured; otherwise use the pinned CDN.
  skin = materializeGsapTemplate(skin, gsapSrc);

  // Hole 1: :root brand tokens.
  const tokenLines = Object.entries(tokens)
    .map(([k, v]) => `    ${k}: ${v};`)
    .join("\n");
  skin = skin.replace(
    "<style data-brand-tokens></style>",
    `<style data-brand-tokens>\n  :root {\n${tokenLines}\n  }\n</style>`
  );

  // Hole 2: real duration + canvas on #captions-root (placeholders are 0).
  skin = skin
    .replace(/(<div\s+id="captions-root"[\s\S]*?)data-duration="0"/, `$1data-duration="${total.toFixed(3)}"`)
    .replace(/(<div\s+id="captions-root"[\s\S]*?)data-width="0"/, `$1data-width="${width}"`)
    .replace(/(<div\s+id="captions-root"[\s\S]*?)data-height="0"/, `$1data-height="${height}"`);

  // Hole 3: baked groups + duration for the karaoke timeline.
  skin = skin
    .replace(/var GROUPS = \[\];/, `var GROUPS = ${JSON.stringify(groups)};`)
    .replace(/var DURATION = 0;/, `var DURATION = ${total.toFixed(3)};`);

  // Wrap the filled fragment in the transportable composition template.
  return (
    `<template id="captions-template" data-composition-id="captions" data-width="${width}" data-height="${height}">\n` +
    skin.trimEnd() +
    `\n</template>\n`
  );
}

// Build the main index.html: frame mounts + voice audio + crossfade transitions.
export function buildIndexHtml(
  plan: BuildPlan,
  config: VideoConfig,
  embeddedTemplates: string[] = [],
): string {
  const { width, height } = plan.canvas;
  const total = plan.totalDuration;
  const xfade = plan.timing.xfade;
  const fps = config.render?.fps ?? 30;
  const gsapSrc = config.gsapSrc ?? DEFAULT_GSAP_SRC;
  const gsapAttribute = gsapScriptSrcAttribute(gsapSrc, "index.html");
  const frames = plan.frames;
  const embeddedCompositionIds = new Set(
    embeddedTemplates.flatMap((template) => {
      const match = template.match(/<template\b[^>]*\bid=["']([^"']+)-template["']/i);
      return match ? [match[1]] : [];
    }),
  );
  const sourceAttribute = (compositionId: string, source: string): string =>
    embeddedCompositionIds.has(compositionId)
      ? ""
      : `\n        data-composition-src="${source}"`;

  const mounts = frames
    .map((f) => {
      const trackIdx = f.frameNum % 2 === 1 ? 20 : 21; // keep hosts above authored tracks 0-9 + voice track 10
      return `      <div
        id="el-${f.slug}"
        class="scene"
        data-composition-id="${f.slug}"${sourceAttribute(f.slug, `compositions/frames/${f.slug}.html`)}
        data-start="${f.start.toFixed(3)}"
        data-duration="${f.frameDur.toFixed(3)}"
        data-track-index="${trackIdx}"
      ></div>
      <audio
        id="el-${f.slug}-voice"
        src="${f.voicePath}"
        data-start="${f.start.toFixed(3)}"
        data-duration="${f.voiceDur.toFixed(3)}"
        data-track-index="10"
        data-volume="1"
      ></audio>`;
    })
    .join("\n\n");

  // crossfade transitions: fade out prev + fade in next at each boundary
  const transitions = frames
    .slice(1)
    .map((f, i) => {
      const prev = frames[i];
      const at = f.start.toFixed(3);
      return `        tl.to("#el-${prev.slug}", { opacity: 0, duration: ${xfade}, ease: "power2.inOut" }, ${at});
        tl.fromTo("#el-${f.slug}", { opacity: 0 }, { opacity: 1, duration: ${xfade}, ease: "power2.inOut" }, ${at});`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <script src="${gsapAttribute}"><\/script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
      #root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: #FAF9F5; }
      .scene { position: absolute; inset: 0; width: 100%; height: 100%; }
      .caption-host { pointer-events: none; }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${total.toFixed(3)}"
      data-width="${width}"
      data-height="${height}"
      data-fps="${fps}"
    >
${mounts}

      <!-- captions -->
      <div
        id="el-captions"
        class="scene caption-host"
        data-composition-id="captions"${sourceAttribute("captions", "compositions/captions.html")}
        data-start="0"
        data-duration="${total.toFixed(3)}"
        data-track-index="22"
      ></div>
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
      (function () { var tl = window.__timelines["main"];
${transitions}
        tl.to({}, { duration: ${total.toFixed(3)} }, 0);
      })();
    <\/script>

${embeddedTemplates.map((template) => template.split("\n").map((line) => line ? `    ${line}` : "").join("\n")).join("\n\n")}
  </body>
</html>
`;
}

export function preflight(
  plan: BuildPlan,
  sharedDir: string,
  outputDir: string,
  config: VideoConfig,
  { captionsOnly = false, runtimeSourceDir, assetSourceDir, voiceSnapshots }: EmitOptions = {},
): FrameworkPreparation {
  const sourceDir = runtimeSourceDir ?? outputDir;
  const voiceSourceDir = assetSourceDir ?? sharedDir;
  const gsapSrc = validateGsapSrc(sourceDir, config.gsapSrc);
  if (captionsOnly) {
    const groups = JSON.parse(
      readFileSync(join(sharedDir, "caption_groups.json"), "utf8"),
    ).groups;
    const captionsHtml = buildCaptionsHtml(plan, groups, { ...config, gsapSrc });
    const embeddedCaptionsTemplate = sanitizeCompositionTemplate(
      captionsHtml,
      "captions",
      gsapSrc,
      "compositions/captions.html",
    );
    const captionIndexHtml = replaceTemplateById(
      readFileSync(join(sourceDir, "index.html"), "utf8"),
      "captions-template",
      embeddedCaptionsTemplate,
    );
    return { captionsHtml, captionIndexHtml };
  }

  const voicePaths = collectVoicePaths(plan.frames);
  const capturedVoiceSnapshots = voiceSnapshots
    ? [...voiceSnapshots]
    : captureVoiceWavSnapshots(voiceSourceDir, voicePaths);
  validateVoiceAssets(sourceDir, voicePaths, { allowMissing: true });
  const policy = resolveVisualSyncPolicy(config);
  const mode = policy.mode === "required" || policy.coverageMode === "required"
    ? "required"
    : policy.mode === "warn" || policy.coverageMode === "warn"
      ? "warn"
      : "off";
  const authoredInputs = collectHyperframesAuthoredFrameInputs(plan, outputDir, { missing: "throw" });
  const preparedFrames = authoredInputs.map(({ frame, path: relativePath, bytes }) => {
    const authoredHtml = bytes.toString("utf8");
    const sanitizedHtml = sanitizeCompositionTemplate(
      authoredHtml,
      frame.slug,
      gsapSrc,
      relativePath,
    );
    const prepared = prepareFrameVisualTiming({
      frame,
      authoredHtml: sanitizedHtml,
      documentPath: relativePath,
      mode,
    });
    return {
      template: prepared.html,
      bindings: prepared.bindings,
      duration: prepared.authoredDuration === undefined
        ? undefined
        : { frameSlug: frame.slug, authoredDuration: prepared.authoredDuration },
    };
  });
  const hasCoverageV2 = plan.frames.some((frame) => frame.visualSpecVersion === 2);
  const frames = preparedFrames.flatMap((frame) => frame.duration ? [frame.duration] : []);
  let manifest: VisualBindingManifest;
  if (hasCoverageV2) {
    const bindings = preparedFrames
      .flatMap((frame) => frame.bindings)
      .filter((binding): binding is VisualBindingV2 => "coverageStart" in binding && "coverageEnd" in binding);
    manifest = {
      version: 2,
      framework: "hyperframes",
      planSha256: hashCoveragePlan(plan),
      authoredInputs: digestAuthoredInputs(authoredInputs.map(({ path, bytes }) => ({
        path,
        bytes,
      }))),
      bindings,
      frames,
    };
  } else {
    const bindings: VisualBindingV1[] = preparedFrames.flatMap((frame) => frame.bindings).map((binding) => ({
      frameSlug: binding.frameSlug,
      beatId: binding.beatId,
      target: binding.target,
      revealStart: binding.revealStart,
      revealDuration: binding.revealDuration,
      source: binding.source === "static" ? "declarative" : binding.source,
      ...(binding.authoredDuration === undefined ? {} : { authoredDuration: binding.authoredDuration }),
      ...(binding.outerDuration === undefined ? {} : { outerDuration: binding.outerDuration }),
    }));
    manifest = {
      version: 1,
      framework: "hyperframes",
      bindings,
      frames,
    };
  }
  return {
    embeddedFrameTemplates: preparedFrames.map((frame) => frame.template),
    bindingManifest: manifest,
    voiceSnapshots: capturedVoiceSnapshots,
  };
}

// The adapter contract: plan in, framework files out. Idempotent.
// Reads the REGROUPED shared/caption_groups.json off disk for the baked GROUPS (see
// header). `captionsOnly` writes preflight-prepared standalone + embedded captions.
export function emit(
  plan: BuildPlan,
  sharedDir: string,
  outputDir: string,
  config: VideoConfig,
  options: EmitOptions = {},
): void {
  const { captionsOnly = false, runtimeSourceDir, assetSourceDir, voiceSnapshots, prepared } = options;
  const preparation = prepared ?? preflight(
    plan,
    sharedDir,
    outputDir,
    config,
    { captionsOnly, runtimeSourceDir, assetSourceDir, voiceSnapshots },
  );
  if (captionsOnly) {
    if (preparation.captionsHtml === undefined || preparation.captionIndexHtml === undefined) {
      throw new Error("captions-only preflight did not prepare both caption artifacts");
    }
    writeFileSync(
      join(outputDir, "compositions", "captions.html"),
      preparation.captionsHtml,
    );
    writeFileSync(join(outputDir, "index.html"), preparation.captionIndexHtml);
    return;
  }
  if (preparation.embeddedFrameTemplates?.length !== plan.frames.length) {
    throw new Error("prepared frame template count does not match the build plan");
  }
  if (!preparation.bindingManifest) {
    throw new Error("full emit preflight did not prepare a visual binding manifest");
  }
  const emittedConfig = {
    ...config,
    gsapSrc: config.gsapSrc ?? DEFAULT_GSAP_SRC,
  };
  const groupsPath = join(sharedDir, "caption_groups.json");
  const groups = JSON.parse(readFileSync(groupsPath, "utf8")).groups;
  const captionsHtml = buildCaptionsHtml(plan, groups, emittedConfig);
  const embeddedCaptionsTemplate = sanitizeCompositionTemplate(
    captionsHtml,
    "captions",
    emittedConfig.gsapSrc,
    "compositions/captions.html",
  );
  const embeddedTemplates = [
    ...(preparation.embeddedFrameTemplates ?? []),
    embeddedCaptionsTemplate,
  ];

  ensureRuntime(outputDir, "hyperframes");
  stageVoiceAssets({
    framework: "hyperframes",
    voicePaths: collectVoicePaths(plan.frames),
    sourceRoot: assetSourceDir ?? sharedDir,
    destinationRoot: outputDir,
    voiceSnapshots: preparation.voiceSnapshots ?? voiceSnapshots,
  });

  writeFileSync(join(outputDir, "compositions", "captions.html"), captionsHtml);
  writeFileSync(
    join(outputDir, "index.html"),
    buildIndexHtml(plan, emittedConfig, embeddedTemplates),
  );
  const bindingManifestPath = join(outputDir, "build", "visual_bindings.json");
  mkdirSync(dirname(bindingManifestPath), { recursive: true });
  writeFileSync(bindingManifestPath, `${JSON.stringify(preparation.bindingManifest, null, 2)}\n`);
}
