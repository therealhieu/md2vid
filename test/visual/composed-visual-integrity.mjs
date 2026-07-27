#!/usr/bin/env node

import puppeteer from "puppeteer-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ARTIFACTS = {
  captionContrast: "caption-contrast.json",
  textOcclusion: "text-occlusion.json",
  frameTheme: "frame-theme.json",
};

export const USAGE = [
  "node test/visual/composed-visual-integrity.mjs \\",
  "  --url <composed-preview-url> \\",
  "  --project <project-root> \\",
  "  --evidence <evidence-directory> \\",
  "  --browser-path <chromium-executable>",
].join("\n");

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (fallback !== undefined && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function uniqueSamples(samples) {
  const seen = new Set();
  return samples.filter((sample) => {
    const key = `${sample.frameSlug}:${sample.globalTime.toFixed(6)}:${sample.phase ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => left.globalTime - right.globalTime);
}

function frameSamples(frames, xfade) {
  const samples = [];
  const failures = [];
  frames.forEach((frame, index) => {
    const midpoint = frame.start + frame.frameDur / 2;
    const frameEnd = frame.start + frame.frameDur;
    const stableStart = Math.min(
      frame.start + (index === 0 ? 0 : xfade),
      midpoint,
    );
    const stableEnd = Math.max(
      frameEnd - (index === frames.length - 1 ? 0 : xfade),
      midpoint,
    );
    if (stableEnd <= stableStart) {
      failures.push({
        code: "frame_stable_sample_unavailable",
        frameSlug: frame.slug,
        globalTime: midpoint,
        requestedTime: midpoint,
        actualTime: null,
        wordId: null,
        state: "frame-sampling",
        color: null,
        background: null,
        sampledBackground: null,
        ratio: null,
        rect: null,
        occluder: null,
        stableStart,
        stableEnd,
        frameStart: frame.start,
        frameEnd,
      });
      return;
    }
    const inset = Math.min(0.05, (stableEnd - stableStart) / 4);
    samples.push(
      { frameSlug: frame.slug, globalTime: stableStart + inset, phase: "transition-in", windowStart: stableStart, windowEnd: stableEnd },
      { frameSlug: frame.slug, globalTime: midpoint, phase: "midpoint", windowStart: stableStart, windowEnd: stableEnd },
      { frameSlug: frame.slug, globalTime: stableEnd - inset, phase: "transition-out", windowStart: stableStart, windowEnd: stableEnd },
    );
  });
  return { samples: uniqueSamples(samples), failures };
}

function captionSamples(groups, frames, totalDuration) {
  const frameByNumber = new Map(frames.map((frame) => [frame.frameNum, frame]));
  const samples = [];
  for (const [groupIndex, group] of groups.entries()) {
    const frame = frameByNumber.get(group.frame) ?? frames.find((candidate) =>
      group.start >= candidate.start && group.start < candidate.start + candidate.frameDur
    );
    if (!frame) continue;
    if (!Array.isArray(group.words) || group.words.length === 0) {
      samples.push({
        frameSlug: frame.slug,
        globalTime: (group.start + group.end) / 2,
        phase: "caption-group-empty",
        emptyGroupId: group.id,
      });
    }
    for (const word of group.words ?? []) {
      if (Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start) {
        samples.push({
          frameSlug: frame.slug,
          globalTime: (word.start + word.end) / 2,
          phase: "caption-word-active",
        });
      }
    }
    const lastWord = group.words?.at(-1);
    if (lastWord && Number.isFinite(lastWord.end)) {
      const nextGroup = groups[groupIndex + 1];
      const groupEnd = groupIndex === groups.length - 1
        ? totalDuration
        : Math.min(
          Number(nextGroup?.start),
          (Number.isFinite(group.end) ? group.end : totalDuration) + 0.3,
        );
      const lastSpoken = Math.min(groupEnd, lastWord.end + 0.1);
      if (lastSpoken < groupEnd) {
        const spokenTime = lastSpoken + (groupEnd - lastSpoken) / 2;
        samples.push({ frameSlug: frame.slug, globalTime: spokenTime, phase: "caption-last-word-spoken" });
      }
    }
  }
  return uniqueSamples(samples);
}

function parseVisualContract(outputConfig) {
  const contract = outputConfig?.visualContract;
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    return {
      projectTheme: "light",
      allowMixedThemes: false,
      allowLegacyThemeInference: false,
    };
  }
  return {
    projectTheme: contract.projectTheme === "dark" ? "dark" : "light",
    allowMixedThemes: contract.allowMixedThemes === true,
    allowLegacyThemeInference: contract.allowLegacyThemeInference === true,
  };
}

export function validatePlan(plan) {
  const invalid = (reason) => { throw new Error(`invalid build plan: ${reason}`); };
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.frames) || plan.frames.length === 0) {
    invalid("frames must be a non-empty array");
  }
  const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
  if (!positive(plan.canvas?.width) || !positive(plan.canvas?.height)) invalid("canvas width and height must be finite positive numbers");
  if (!positive(plan.totalDuration)) invalid("totalDuration must be a finite positive number");
  const allowedOverlap = plan.timing?.xfade === undefined
    ? 0
    : typeof plan.timing.xfade === "number" && Number.isFinite(plan.timing.xfade) && plan.timing.xfade >= 0
      ? plan.timing.xfade
      : invalid("timing.xfade must be a finite nonnegative number");
  const seenSlugs = new Set();
  const seenFrameNumbers = new Set();
  const frames = plan.frames.map((frame, index) => {
    if (!frame || typeof frame !== "object") invalid(`frame ${index + 1} must be an object`);
    if (typeof frame.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(frame.slug)) invalid(`frame ${index + 1} slug must use safe lowercase kebab-case`);
    if (seenSlugs.has(frame.slug)) invalid(`duplicate frame slug ${frame.slug}`);
    seenSlugs.add(frame.slug);
    if (!Number.isInteger(frame.frameNum) || frame.frameNum <= 0) invalid(`frame ${frame.slug} frameNum must be a positive integer`);
    if (seenFrameNumbers.has(frame.frameNum)) invalid(`duplicate frameNum ${frame.frameNum}`);
    seenFrameNumbers.add(frame.frameNum);
    if (typeof frame.start !== "number" || !Number.isFinite(frame.start) || frame.start < 0) invalid(`frame ${frame.slug} start must be finite and nonnegative`);
    if (!positive(frame.frameDur)) invalid(`frame ${frame.slug} duration must be finite and positive`);
    if (frame.start + frame.frameDur > plan.totalDuration + 0.001) invalid(`frame ${frame.slug} exceeds totalDuration`);
    return {
      frameNum: frame.frameNum,
      slug: frame.slug,
      start: frame.start,
      frameDur: frame.frameDur,
    };
  });
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    if (current.start < previous.start) invalid(`frame starts are not ordered at ${current.slug}`);
    if (current.start < previous.start + previous.frameDur - allowedOverlap - 0.001) {
      invalid(`frames ${previous.slug} and ${current.slug} overlap beyond timing.xfade`);
    }
  }
  return {
    canvas: { width: plan.canvas.width, height: plan.canvas.height },
    timing: { xfade: allowedOverlap },
    totalDuration: plan.totalDuration,
    frames,
  };
}

async function collectBrowserEvidence(page, input) {
  return page.evaluate(async ({ captionPoints, captionGroups, visualPoints, frames, totalDuration, visualContract }) => {
    const pageDocument = globalThis.document;
    const pageGetComputedStyle = globalThis.getComputedStyle;
    const runtime = globalThis;
    const player = runtime.__player;
    if (!player || typeof player.pause !== "function" || typeof player.seek !== "function" || typeof player.getTime !== "function") {
      throw new Error("composed preview has no seekable window.__player with getTime()");
    }

    const round = (value, digits = 4) => Number(value.toFixed(digits));
    const rectObject = (rect) => ({
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height),
      top: round(rect.top),
      right: round(rect.right),
      bottom: round(rect.bottom),
      left: round(rect.left),
    });
    const parseColor = (value) => {
      const numbers = String(value).match(/[\d.]+/g)?.map(Number) ?? [];
      if (numbers.length < 3) return null;
      return {
        red: numbers[0],
        green: numbers[1],
        blue: numbers[2],
        alpha: numbers.length >= 4 ? numbers[3] : 1,
      };
    };
    const composite = (foreground, background) => {
      const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
      if (alpha <= 0) return { red: 0, green: 0, blue: 0, alpha: 0 };
      return {
        red: (foreground.red * foreground.alpha + background.red * background.alpha * (1 - foreground.alpha)) / alpha,
        green: (foreground.green * foreground.alpha + background.green * background.alpha * (1 - foreground.alpha)) / alpha,
        blue: (foreground.blue * foreground.alpha + background.blue * background.alpha * (1 - foreground.alpha)) / alpha,
        alpha,
      };
    };
    const hex = (color) => `#${[color.red, color.green, color.blue]
      .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
      .join("")}`;
    const linearChannel = (value) => {
      const srgb = value / 255;
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (color) =>
      0.2126 * linearChannel(color.red) +
      0.7152 * linearChannel(color.green) +
      0.0722 * linearChannel(color.blue);
    const contrast = (foreground, background) => {
      const lighter = Math.max(luminance(foreground), luminance(background));
      const darker = Math.min(luminance(foreground), luminance(background));
      return (lighter + 0.05) / (darker + 0.05);
    };
    const opacityFor = (style) => {
      const value = Number.parseFloat(style.opacity);
      return Number.isFinite(value) ? value : 1;
    };
    const effectiveOpacityFor = (element) => {
      let effectiveOpacity = 1;
      for (let current = element; current; current = current.parentElement) {
        effectiveOpacity *= opacityFor(pageGetComputedStyle(current));
      }
      return effectiveOpacity;
    };
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      for (let current = element; current; current = current.parentElement) {
        const style = pageGetComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden") return false;
      }
      return effectiveOpacityFor(element) > 0.01;
    };
    const selectorFor = (element) => {
      if (element.id) return `#${element.id}`;
      const classes = [...element.classList].filter(Boolean).slice(0, 2);
      if (classes.length) return `${element.tagName.toLowerCase()}.${classes.join(".")}`;
      const parent = element.parentElement;
      if (!parent) return element.tagName.toLowerCase();
      const siblings = [...parent.children].filter((candidate) => candidate.tagName === element.tagName);
      return `${selectorFor(parent)} > ${element.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(element) + 1})`;
    };
    const captionHost = pageDocument.getElementById("el-captions");
    const backgroundPaintAt = (element, x, y) => {
      if (!isVisible(element)) return { status: "transparent", element };
      const style = pageGetComputedStyle(element);
      const effectiveOpacity = effectiveOpacityFor(element);
      if (effectiveOpacity <= 0.01) return { status: "transparent", element };
      const backgroundImage = style.backgroundImage;
      if (backgroundImage && backgroundImage !== "none") {
        return {
          status: "unresolved",
          element,
          reason: /gradient\(/i.test(backgroundImage)
            ? "gradient-background-unresolved"
            : "background-image-unresolved",
        };
      }
      if (element instanceof HTMLCanvasElement || element instanceof HTMLImageElement || element instanceof HTMLVideoElement) {
        const pixel = replacedPixel(element, x, y);
        if (pixel.status === "transparent") return { status: "transparent", element };
        return {
          status: "unresolved",
          element,
          reason: pixel.status === "unresolved" ? pixel.reason : "replaced-media-background-unresolved",
        };
      }
      const color = parseColor(style.backgroundColor);
      if (!color || color.alpha <= 0.001) return { status: "transparent", element };
      color.alpha *= effectiveOpacity;
      if (color.alpha <= 0.001) return { status: "transparent", element };
      return { status: "color", element, color };
    };
    const compositeBackgroundLayers = (elements, x, y) => {
      let background = { red: 0, green: 0, blue: 0, alpha: 0 };
      let unresolved = null;
      const layers = [];
      for (const element of elements) {
        const layer = backgroundPaintAt(element, x, y);
        if (layer.status === "transparent") continue;
        layers.push(layer);
        if (layer.status === "unresolved") {
          unresolved = layer;
          continue;
        }
        background = composite(layer.color, background);
        if (layer.color.alpha >= 0.99) unresolved = null;
      }
      if (unresolved) {
        return {
          color: null,
          layers,
          unresolvedReason: unresolved.reason,
          unresolvedElement: unresolved.element,
        };
      }
      if (background.alpha < 0.99) {
        return {
          color: null,
          layers,
          unresolvedReason: "background-alpha-incomplete",
          unresolvedElement: layers.at(-1)?.element ?? null,
        };
      }
      return { color: background, layers, unresolvedReason: null, unresolvedElement: null };
    };
    const effectiveBackgroundAt = (x, y, foregroundElement = null) => {
      const captionForeground = foregroundElement && captionHost?.contains(foregroundElement);
      const stack = pageDocument.elementsFromPoint(x, y).filter((element) =>
        !(captionForeground && captionHost.contains(element))
      );
      const elements = [...stack].reverse();
      if (captionForeground) {
        const captionLayers = [];
        for (let current = foregroundElement; current; current = current.parentElement) {
          captionLayers.push(current);
          if (current === captionHost) break;
        }
        elements.push(...captionLayers.reverse());
      }
      return compositeBackgroundLayers(elements, x, y);
    };
    const seek = async (time) => {
      player.pause();
      player.seek(time);
      await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
      const actualTime = Number(player.getTime());
      if (!Number.isFinite(actualTime)) throw new Error("window.__player.getTime() returned a nonfinite value");
      return actualTime;
    };
    const rootFor = (frameSlug) => {
      const host = pageDocument.getElementById(`el-${frameSlug}`);
      if (!host) return { host: null, root: null };
      const inner = host.querySelector('[data-hf-inner-root="true"]');
      const declared = [...host.querySelectorAll("[data-composition-id]")].find((element) =>
        element.getAttribute("data-composition-id") === frameSlug
      );
      return { host, root: inner ?? declared ?? host.firstElementChild ?? host };
    };
    const fullCanvasGround = (root, host) => {
      const hostRect = host.getBoundingClientRect();
      const x = hostRect.left + hostRect.width / 2;
      const y = hostRect.top + hostRect.height / 2;
      const elements = pageDocument.elementsFromPoint(x, y).filter((element) => {
        if (!(element === root || root.contains(element)) || !isVisible(element)) return false;
        const rect = element.getBoundingClientRect();
        return rect.width >= hostRect.width * 0.98 && rect.height >= hostRect.height * 0.98;
      }).reverse();
      if (!elements.length) return null;
      const result = compositeBackgroundLayers(elements, x, y);
      const paintedLayers = result.layers.filter((layer) => layer.status !== "transparent");
      if (!paintedLayers.length) return null;
      return {
        color: result.color,
        element: result.unresolvedElement ?? paintedLayers.at(-1)?.element ?? null,
        layers: paintedLayers,
        unresolvedReason: result.unresolvedReason,
      };
    };
    const glyphRectsFor = (element) => {
      const range = pageDocument.createRange();
      range.selectNodeContents(element);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
      return rects.length ? rects : [element.getBoundingClientRect()];
    };
    const unionRect = (rects) => ({
      left: Math.min(...rects.map((rect) => rect.left)),
      top: Math.min(...rects.map((rect) => rect.top)),
      right: Math.max(...rects.map((rect) => rect.right)),
      bottom: Math.max(...rects.map((rect) => rect.bottom)),
      get x() { return this.left; },
      get y() { return this.top; },
      get width() { return this.right - this.left; },
      get height() { return this.bottom - this.top; },
    });
    const replacedPixel = (element, x, y) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return { status: "transparent" };
      try {
        if (element instanceof HTMLCanvasElement) {
          const context = element.getContext("2d", { willReadFrequently: true });
          if (!context) return { status: "unresolved", reason: "canvas-context-unavailable" };
          const px = Math.max(0, Math.min(element.width - 1, Math.floor((x - rect.left) / rect.width * element.width)));
          const py = Math.max(0, Math.min(element.height - 1, Math.floor((y - rect.top) / rect.height * element.height)));
          return { status: context.getImageData(px, py, 1, 1).data[3] >= 13 ? "painted" : "transparent" };
        }
        if (element instanceof HTMLImageElement) {
          if (!element.complete || element.naturalWidth <= 0 || element.naturalHeight <= 0) {
            return { status: "unresolved", reason: "image-pixels-unavailable" };
          }
          const canvas = pageDocument.createElement("canvas");
          canvas.width = canvas.height = 1;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          const sx = Math.max(0, Math.min(element.naturalWidth - 1, Math.floor((x - rect.left) / rect.width * element.naturalWidth)));
          const sy = Math.max(0, Math.min(element.naturalHeight - 1, Math.floor((y - rect.top) / rect.height * element.naturalHeight)));
          context.drawImage(element, sx, sy, 1, 1, 0, 0, 1, 1);
          return { status: context.getImageData(0, 0, 1, 1).data[3] >= 13 ? "painted" : "transparent" };
        }
        if (element instanceof HTMLVideoElement) {
          if (element.readyState < 2 || element.videoWidth <= 0 || element.videoHeight <= 0) {
            return { status: "unresolved", reason: "video-frame-unavailable" };
          }
          const canvas = pageDocument.createElement("canvas");
          canvas.width = canvas.height = 1;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.drawImage(element, 0, 0, 1, 1);
          return { status: context.getImageData(0, 0, 1, 1).data[3] >= 13 ? "painted" : "transparent" };
        }
      } catch (error) {
        return { status: "unresolved", reason: `pixel-access:${error.name ?? "error"}` };
      }
      return { status: "transparent" };
    };
    const gradientPaint = (style) => {
      const image = style.backgroundImage;
      if (!image || image === "none") return { status: "transparent" };
      if (/url\(/i.test(image)) return { status: "unresolved", reason: "background-image-source-unresolved" };
      if (!/gradient\(/i.test(image)) return { status: "unresolved", reason: "background-image-paint-unresolved" };
      const colors = [...image.matchAll(/rgba?\([^)]*\)/gi)].map((match) => parseColor(match[0])).filter(Boolean);
      if (!colors.length) return { status: "unresolved", reason: "gradient-stops-unresolved" };
      return { status: colors.some((color) => color.alpha * opacityFor(style) >= 0.05) ? "painted" : "transparent" };
    };
    const borderPaint = (element, style, x, y) => {
      const rect = element.getBoundingClientRect();
      const widths = {
        top: Number.parseFloat(style.borderTopWidth) || 0,
        right: Number.parseFloat(style.borderRightWidth) || 0,
        bottom: Number.parseFloat(style.borderBottomWidth) || 0,
        left: Number.parseFloat(style.borderLeftWidth) || 0,
      };
      const edges = [
        [y - rect.top <= widths.top, style.borderTopColor],
        [rect.right - x <= widths.right, style.borderRightColor],
        [rect.bottom - y <= widths.bottom, style.borderBottomColor],
        [x - rect.left <= widths.left, style.borderLeftColor],
      ];
      return edges.some(([inside, value]) => {
        const color = inside ? parseColor(value) : null;
        return color && color.alpha * opacityFor(style) >= 0.05;
      });
    };
    const pseudoPaint = (element, pseudo, x, y) => {
      const style = pageGetComputedStyle(element, pseudo);
      if (!style || style.content === "none" || style.display === "none" || style.visibility === "hidden" || opacityFor(style) <= 0.01) {
        return { status: "transparent" };
      }
      const background = parseColor(style.backgroundColor);
      if (background && background.alpha * opacityFor(style) >= 0.05) return { status: "painted", selectorSuffix: pseudo };
      const gradient = gradientPaint(style);
      if (gradient.status !== "transparent") return { ...gradient, selectorSuffix: pseudo };
      if (borderPaint(element, style, x, y)) return { status: "painted", selectorSuffix: pseudo };
      return { status: "transparent" };
    };
    const paintAt = (element, x, y) => {
      if (!isVisible(element)) return { status: "transparent" };
      const style = pageGetComputedStyle(element);
      for (const pseudo of ["::before", "::after"]) {
        const paint = pseudoPaint(element, pseudo, x, y);
        if (paint.status !== "transparent") return paint;
      }
      const background = parseColor(style.backgroundColor);
      if (background && background.alpha * opacityFor(style) >= 0.05) return { status: "painted" };
      const gradient = gradientPaint(style);
      if (gradient.status !== "transparent") return gradient;
      if (borderPaint(element, style, x, y)) return { status: "painted" };
      if (element instanceof SVGGeometryElement) {
        try {
          const matrix = element.getScreenCTM();
          if (!matrix) return { status: "unresolved", reason: "svg-transform-unavailable" };
          const point = new DOMPoint(x, y).matrixTransform(matrix.inverse());
          const fill = parseColor(style.fill);
          const stroke = parseColor(style.stroke);
          if (fill && fill.alpha * opacityFor(style) >= 0.05 && element.isPointInFill(point)) return { status: "painted" };
          if (stroke && stroke.alpha * opacityFor(style) >= 0.05 && element.isPointInStroke(point)) return { status: "painted" };
          return { status: "transparent" };
        } catch (error) {
          return { status: "unresolved", reason: `svg-paint:${error.name ?? "error"}` };
        }
      }
      if (element instanceof SVGSVGElement) return { status: "transparent" };
      if (element instanceof HTMLCanvasElement || element instanceof HTMLImageElement || element instanceof HTMLVideoElement) {
        return replacedPixel(element, x, y);
      }
      return { status: "transparent" };
    };
    const occluderAt = (victim, x, y) => {
      for (const element of pageDocument.elementsFromPoint(x, y)) {
        if (element === victim || victim.contains(element) || element.contains(victim)) return null;
        const paint = paintAt(element, x, y);
        if (paint.status === "transparent") continue;
        return { element, ...paint };
      }
      return null;
    };

    const captionFrameByNumber = new Map(frames.map((frame) => [frame.frameNum, frame]));
    const expectedCaptionObservations = (frameSlug, actualTime) => {
      const groupIndex = captionGroups.findIndex((group, index) => {
        const groupFrame = captionFrameByNumber.get(group.frame);
        if (!groupFrame || groupFrame.slug !== frameSlug) return false;
        const nextGroup = captionGroups[index + 1];
        const groupEnd = index === captionGroups.length - 1
          ? totalDuration
          : Math.min(
            Number(nextGroup?.start),
            (Number.isFinite(group.end) ? group.end : totalDuration) + 0.3,
          );
        return actualTime >= group.start && actualTime < groupEnd;
      });
      if (groupIndex < 0) return [];
      const group = captionGroups[groupIndex];
      const nextGroup = captionGroups[groupIndex + 1];
      const groupEnd = groupIndex === captionGroups.length - 1
        ? totalDuration
        : Math.min(
          Number(nextGroup?.start),
          (Number.isFinite(group.end) ? group.end : totalDuration) + 0.3,
        );
      const words = group.words ?? [];
      return words.flatMap((word, wordIndex) => {
        const activeAt = Math.max(group.start, Number(word.start));
        if (actualTime < activeAt) return [];
        if (wordIndex + 1 < words.length) {
          const spokenAt = Math.max(group.start, Number(words[wordIndex + 1].start));
          return [{ wordId: word.id, state: actualTime >= spokenAt ? "spoken" : "active" }];
        }
        const spokenAt = Math.min(groupEnd, Number(word.end) + 0.1);
        return [{ wordId: word.id, state: actualTime >= spokenAt ? "spoken" : "active" }];
      });
    };

    const captionRows = [];
    const captionStateFailures = [];
    const captionSeekRows = [];
    for (const sample of captionPoints) {
      const requestedTime = sample.globalTime;
      const actualTime = await seek(requestedTime);
      const evidenceTimes = {
        globalTime: round(actualTime, 6),
        requestedTime: round(requestedTime, 6),
        actualTime: round(actualTime, 6),
      };
      captionSeekRows.push({
        frameSlug: sample.frameSlug,
        phase: sample.phase,
        requestedTime: evidenceTimes.requestedTime,
        actualTime: evidenceTimes.actualTime,
      });
      if (sample.emptyGroupId) {
        captionStateFailures.push({
          code: "caption_state_empty",
          frameSlug: sample.frameSlug,
          ...evidenceTimes,
          groupId: sample.emptyGroupId,
          wordId: null,
          state: "empty",
          color: null,
          background: null,
          sampledBackground: null,
          ratio: null,
          rect: null,
          occluder: null,
        });
      }
      const expectedObservations = expectedCaptionObservations(sample.frameSlug, actualTime);
      const expectedStateById = new Map(expectedObservations.map((expected) => [expected.wordId, expected.state]));
      const words = [...pageDocument.querySelectorAll(".caption-word.is-active, .caption-word.is-spoken")]
        .filter(isVisible);
      const actualWords = words.map((word) => ({
        element: word,
        wordId: word.id || word.getAttribute("data-word-id") || selectorFor(word),
        state: word.classList.contains("is-active") ? "active" : "spoken",
      }));
      for (const expected of expectedObservations) {
        const element = pageDocument.getElementById(expected.wordId);
        const base = {
          frameSlug: sample.frameSlug,
          ...evidenceTimes,
          wordId: expected.wordId,
          state: expected.state,
          color: null,
          background: null,
          sampledBackground: null,
          ratio: null,
          rect: element ? rectObject(element.getBoundingClientRect()) : null,
          occluder: null,
        };
        if (!element) {
          captionStateFailures.push({ code: "caption_state_missing", ...base, actualState: "missing" });
          continue;
        }
        if (!isVisible(element)) {
          captionStateFailures.push({ code: "caption_visibility_missing", ...base, actualState: "hidden" });
          continue;
        }
        const actualState = element.classList.contains("is-active")
          ? "active"
          : element.classList.contains("is-spoken")
            ? "spoken"
            : "none";
        if (actualState !== expected.state) {
          captionStateFailures.push({ code: "caption_state_mismatch", ...base, actualState });
        }
      }
      for (const actual of actualWords) {
        if (expectedStateById.has(actual.wordId)) continue;
        captionStateFailures.push({
          code: "caption_state_unexpected",
          frameSlug: sample.frameSlug,
          ...evidenceTimes,
          wordId: actual.wordId,
          state: "unexpected",
          actualState: actual.state,
          color: null,
          background: null,
          sampledBackground: null,
          ratio: null,
          rect: rectObject(actual.element.getBoundingClientRect()),
          occluder: null,
        });
      }
      for (const word of words) {
        const rect = word.getBoundingClientRect();
        const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
        const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
        const backgroundResult = effectiveBackgroundAt(x, y, word);
        const background = backgroundResult.color;
        const style = pageGetComputedStyle(word);
        const computedForeground = parseColor(style.color);
        const effectiveOpacity = effectiveOpacityFor(word);
        if (computedForeground) computedForeground.alpha *= effectiveOpacity;
        const state = word.classList.contains("is-active") ? "active" : "spoken";
        const fontSize = Number.parseFloat(style.fontSize);
        const parsedWeight = Number.parseInt(style.fontWeight, 10);
        const fontWeight = Number.isFinite(parsedWeight) ? parsedWeight : style.fontWeight === "bold" ? 700 : 400;
        const largeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
        const threshold = largeText ? 3 : 4.5;
        const foreground = background && computedForeground
          ? composite(computedForeground, background)
          : computedForeground;
        const ratio = foreground && background ? contrast(foreground, background) : null;
        captionRows.push({
          frameSlug: sample.frameSlug,
          ...evidenceTimes,
          wordId: word.id || word.getAttribute("data-word-id") || selectorFor(word),
          state,
          color: foreground ? hex(foreground) : null,
          background: background ? hex(background) : null,
          sampledBackground: background ? hex(background) : null,
          backgroundUnresolvedReason: backgroundResult.unresolvedReason,
          backgroundUnresolvedPainter: backgroundResult.unresolvedElement ? selectorFor(backgroundResult.unresolvedElement) : null,
          ratio: ratio === null ? null : round(ratio),
          contrastRatio: ratio === null ? null : round(ratio),
          threshold,
          effectiveOpacity: round(effectiveOpacity),
          fontSize: round(fontSize),
          fontWeight,
          largeText,
          largeTextBasis: largeText
            ? (fontSize >= 24 ? "font-size>=24px" : "font-size>=18.66px-and-weight>=700")
            : "normal-text",
          rect: rectObject(rect),
          occluder: null,
        });
      }
    }

    const themeRows = [];
    const occlusionRows = [];
    const visualSeekRows = [];
    const visualSeekFailures = [];
    for (const sample of visualPoints) {
      const requestedTime = sample.globalTime;
      const actualTime = await seek(requestedTime);
      const evidenceTimes = {
        globalTime: round(actualTime, 6),
        requestedTime: round(requestedTime, 6),
        actualTime: round(actualTime, 6),
      };
      visualSeekRows.push({
        frameSlug: sample.frameSlug,
        phase: sample.phase,
        requestedTime: evidenceTimes.requestedTime,
        actualTime: evidenceTimes.actualTime,
        windowStart: round(sample.windowStart, 6),
        windowEnd: round(sample.windowEnd, 6),
      });
      if (actualTime < sample.windowStart || actualTime > sample.windowEnd) {
        visualSeekFailures.push({
          code: "visual_sample_time_out_of_window",
          frameSlug: sample.frameSlug,
          ...evidenceTimes,
          wordId: null,
          state: "visual-sampling",
          color: null,
          background: null,
          sampledBackground: null,
          ratio: null,
          rect: null,
          occluder: null,
          phase: sample.phase,
          windowStart: round(sample.windowStart, 6),
          windowEnd: round(sample.windowEnd, 6),
        });
        continue;
      }
      const { host, root } = rootFor(sample.frameSlug);
      if (!host || !root) {
        themeRows.push({
          frameSlug: sample.frameSlug,
          ...evidenceTimes,
          wordId: null,
          state: "frame-theme",
          color: null,
          background: null,
          ratio: null,
          rect: null,
          occluder: null,
          phase: sample.phase,
          declaredTheme: null,
          detectedTheme: null,
          projectTheme: visualContract.projectTheme,
          code: "frame_mount_missing",
        });
        continue;
      }
      const ground = fullCanvasGround(root, host);
      const groundLuminance = ground?.color ? luminance(ground.color) : null;
      const detectedTheme = groundLuminance === null
        ? null
        : groundLuminance >= 0.5
          ? "light"
          : groundLuminance <= 0.2
            ? "dark"
            : "ambiguous";
      themeRows.push({
        frameSlug: sample.frameSlug,
        ...evidenceTimes,
        wordId: null,
        state: "frame-theme",
        color: null,
        background: ground?.color ? hex(ground.color) : null,
        sampledBackground: ground?.color ? hex(ground.color) : null,
        ratio: null,
        rect: rectObject(host.getBoundingClientRect()),
        occluder: null,
        phase: sample.phase,
        declaredTheme: root.getAttribute("data-frame-theme"),
        detectedTheme,
        projectTheme: visualContract.projectTheme,
        groundPainter: ground?.element ? selectorFor(ground.element) : null,
        groundUnresolvedReason: ground?.unresolvedReason ?? null,
        groundLayers: ground ? ground.layers.map((layer) => ({
          selector: selectorFor(layer.element),
          status: layer.status,
          reason: layer.reason ?? null,
          color: layer.color ? hex(layer.color) : null,
          alpha: layer.color ? round(layer.color.alpha) : null,
        })) : [],
        groundLuminance: groundLuminance === null ? null : round(groundLuminance),
      });

      const explicit = [...root.querySelectorAll("[data-load-bearing-text]")];
      const conventional = [...root.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, [class*='title'], [class*='label'], [class*='copy'], [class*='callout']")];
      const victims = [...new Set([...explicit, ...conventional])].filter((element) =>
        isVisible(element) && element.textContent?.trim() && !(captionHost && captionHost.contains(element))
      );
      for (const victim of victims) {
        const glyphRects = glyphRectsFor(victim);
        const rect = unionRect(glyphRects);
        if (rect.width <= 0 || rect.height <= 0) continue;
        const points = [];
        glyphRects.forEach((glyphRect, glyphRectIndex) => {
          for (const xFraction of [0.1, 0.233, 0.367, 0.5, 0.633, 0.767, 0.9]) {
            for (const yFraction of [0.25, 0.5, 0.75]) {
              points.push({
                glyphRectIndex,
                x: glyphRect.left + glyphRect.width * xFraction,
                y: glyphRect.top + glyphRect.height * yFraction,
              });
            }
          }
        });
        const hits = new Map();
        const sampleDetails = [];
        for (const point of points) {
          const paint = occluderAt(victim, point.x, point.y);
          const detail = {
            glyphRectIndex: point.glyphRectIndex,
            x: round(point.x),
            y: round(point.y),
            paintStatus: paint?.status ?? "clear",
            occluder: paint ? `${selectorFor(paint.element)}${paint.selectorSuffix ?? ""}` : null,
            unresolvedPaintReason: paint?.reason ?? null,
          };
          sampleDetails.push(detail);
          if (!paint) continue;
          const selector = detail.occluder;
          const key = `${paint.status}:${selector}:${paint.reason ?? ""}`;
          const current = hits.get(key) ?? { ...paint, selector, count: 0, points: [] };
          current.count += 1;
          current.points.push({ x: detail.x, y: detail.y, glyphRectIndex: point.glyphRectIndex });
          hits.set(key, current);
        }
        const strongest = [...hits.entries()].sort((left, right) => right[1].count - left[1].count)[0];
        const fraction = strongest ? strongest[1].count / points.length : 0;
        const style = pageGetComputedStyle(victim);
        const foreground = parseColor(style.color);
        const backgroundResult = effectiveBackgroundAt(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
          null,
        );
        const background = backgroundResult.color;
        occlusionRows.push({
          frameSlug: sample.frameSlug,
          ...evidenceTimes,
          wordId: null,
          state: "load-bearing-text",
          color: foreground ? hex(foreground) : null,
          background: background ? hex(background) : null,
          backgroundUnresolvedReason: backgroundResult.unresolvedReason,
          backgroundUnresolvedPainter: backgroundResult.unresolvedElement ? selectorFor(backgroundResult.unresolvedElement) : null,
          ratio: null,
          rect: rectObject(rect),
          glyphRects: glyphRects.map(rectObject),
          sampleDetails,
          victim: selectorFor(victim),
          occluder: strongest ? strongest[1].selector : null,
          occluderRect: strongest ? rectObject(strongest[1].element.getBoundingClientRect()) : null,
          paintStatus: strongest ? strongest[1].status : null,
          unresolvedPaintReason: strongest?.[1].reason ?? null,
          occludedSampleFraction: round(fraction),
          sampledPoints: points.length,
          occludedPoints: strongest?.[1].points ?? [],
          materialFractionThreshold: 0.2,
          phase: sample.phase,
        });
      }
    }

    return {
      captionRows,
      captionStateFailures,
      captionSeekRows,
      occlusionRows,
      themeRows,
      visualSeekRows,
      visualSeekFailures,
    };
  }, input);
}

function captionReport(rows, stateFailures = [], seeks = []) {
  const failures = [
    ...stateFailures,
    ...rows.filter((row) => row.ratio === null || row.ratio < row.threshold).map((row) => ({
      code: row.ratio === null ? "caption_background_unresolved" : "caption_contrast_insufficient",
      ...row,
    })),
  ];
  return {
    version: 1,
    result: failures.length ? "FAIL" : "PASS",
    policy: {
      normalTextThreshold: 4.5,
      largeTextThreshold: 3,
      largeTextQualification: "font-size>=24px or font-size>=18.66px with font-weight>=700",
      states: ["active", "spoken"],
    },
    seeks,
    samples: rows,
    failures,
  };
}

function occlusionReport(rows, seeks = []) {
  const failures = rows.flatMap((row) => {
    if (row.paintStatus === "unresolved" && row.occluder !== null) {
      return [{ code: "text_paint_unresolved", ...row }];
    }
    if (row.paintStatus === "painted" && row.occluder !== null && row.occludedSampleFraction >= row.materialFractionThreshold) {
      return [{ code: "text_occluded", ...row }];
    }
    return [];
  });
  return {
    version: 1,
    result: failures.length ? "FAIL" : "PASS",
    policy: {
      paintStackApi: "document.elementsFromPoint()",
      transparentLayers: "skip",
      victimSubtree: "stop",
      materialFractionThreshold: 0.2,
    },
    seeks,
    samples: rows,
    failures,
  };
}

function themeReport(rows, visualContract, seeks = []) {
  const failures = [];
  const warnings = [];
  for (const row of rows) {
    if (row.code === "frame_mount_missing") {
      failures.push({ ...row });
      continue;
    }
    if (!row.sampledBackground || !row.detectedTheme || row.detectedTheme === "ambiguous") {
      failures.push({ code: "frame_ground_unresolved", ...row });
      continue;
    }
    if (row.declaredTheme !== "light" && row.declaredTheme !== "dark") {
      const diagnostic = { code: "frame_theme_missing", ...row };
      if (visualContract.allowLegacyThemeInference) warnings.push(diagnostic);
      else failures.push(diagnostic);
    } else if (row.declaredTheme !== row.detectedTheme) {
      failures.push({ code: "frame_theme_mismatch", ...row });
    }
    if (!visualContract.allowMixedThemes && row.detectedTheme !== visualContract.projectTheme) {
      failures.push({ code: "frame_theme_mismatch", reason: "project-theme-conflict", ...row });
    }
  }
  return {
    version: 1,
    result: failures.length ? "FAIL" : "PASS",
    contract: visualContract,
    seeks,
    samples: rows,
    failures,
    warnings,
  };
}

export async function runComposedVisualIntegrity({
  baseUrl,
  projectDir,
  outputDir,
  executablePath = process.env.CHROME_PATH,
}) {
  if (!baseUrl) throw new Error("baseUrl is required");
  if (!projectDir) throw new Error("projectDir is required");
  if (!outputDir) throw new Error("outputDir is required");
  if (!executablePath) throw new Error("executablePath or CHROME_PATH is required");

  const absoluteProject = resolve(projectDir);
  const absoluteOutput = resolve(outputDir);
  const plan = validatePlan(await readJson(join(absoluteProject, "build", "build_plan.json")));
  const captionArtifact = await readJson(join(absoluteProject, "caption_groups.json"), { groups: [] });
  const outputConfig = await readJson(join(absoluteProject, "output.config.json"), {});
  const visualContract = parseVisualContract(outputConfig);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: plan.canvas.width, height: plan.canvas.height });
    await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 60_000 });
    await page.waitForFunction((slugs) => {
      const runtime = globalThis;
      return runtime.__player && slugs.every((slug) => {
        const host = document.getElementById(`el-${slug}`);
        return host && (host.querySelector('[data-hf-inner-root="true"]') || host.firstElementChild);
      });
    }, { timeout: 30_000 }, plan.frames.map((frame) => frame.slug));

    const actualTimings = await page.evaluate((slugs) => slugs.map((slug) => {
      const host = document.getElementById(`el-${slug}`);
      const startAttribute = host?.getAttribute("data-start") ?? null;
      const durationAttribute = host?.getAttribute("data-duration") ?? null;
      const start = startAttribute === null ? null : Number(startAttribute);
      const hostDuration = durationAttribute === null ? null : Number(durationAttribute);
      const compositionId = host?.getAttribute("data-composition-id") ?? null;
      const manifestClips = Array.isArray(globalThis.__clipManifest?.clips)
        ? globalThis.__clipManifest.clips
        : [];
      const manifestMatches = durationAttribute === null && host && compositionId
        ? manifestClips.filter((clip) =>
          clip?.kind === "composition" &&
          clip.id === host.id &&
          clip.compositionId === compositionId
        )
        : [];
      const manifestClip = manifestMatches.length === 1 ? manifestMatches[0] : null;
      const manifestStart = manifestClip ? Number(manifestClip.start) : null;
      const manifestDuration = manifestClip ? Number(manifestClip.duration) : null;
      const hostStartValid = Number.isFinite(start) && start >= 0;
      let issue = null;
      let frameDur = hostDuration;
      let durationSource = durationAttribute === null ? "unresolved" : "host-data-duration";
      if (!hostStartValid) {
        issue = "host-start-unresolved";
      } else if (durationAttribute !== null) {
        if (!Number.isFinite(hostDuration) || hostDuration <= 0) issue = "host-duration-invalid";
      } else if (manifestMatches.length === 0) {
        issue = "manifest-match-missing";
      } else if (manifestMatches.length !== 1) {
        issue = "manifest-match-ambiguous";
      } else if (!Number.isFinite(manifestStart) || manifestStart < 0 || !Number.isFinite(manifestDuration) || manifestDuration <= 0) {
        issue = "manifest-timing-invalid";
      } else if (Math.abs(manifestStart - start) >= 0.001) {
        issue = "manifest-host-start-mismatch";
      } else {
        frameDur = manifestDuration;
        durationSource = "clip-manifest";
      }
      return {
        slug,
        start,
        frameDur: issue === null || durationAttribute !== null ? frameDur : null,
        sources: {
          start: startAttribute === null ? "unresolved" : "host-data-start",
          frameDur: durationSource,
        },
        manifestMatchCount: manifestMatches.length,
        manifest: manifestClip ? { start: manifestStart, frameDur: manifestDuration } : null,
        issue,
      };
    }), plan.frames.map((frame) => frame.slug));
    const hostFrames = plan.frames.map((frame, index) => {
      const actual = actualTimings[index];
      const valid = Number.isFinite(actual.start) && actual.start >= 0 && Number.isFinite(actual.frameDur) && actual.frameDur > 0;
      return { ...frame, start: valid ? actual.start : frame.start, frameDur: valid ? actual.frameDur : frame.frameDur };
    });
    const timing = {
      source: "composed-runtime-timing",
      frames: plan.frames.map((frame, index) => {
        const actual = actualTimings[index];
        const valid = Number.isFinite(actual.start) && actual.start >= 0 && Number.isFinite(actual.frameDur) && actual.frameDur > 0;
        const matches = valid && Math.abs(actual.start - frame.start) < 0.001 && Math.abs(actual.frameDur - frame.frameDur) < 0.001;
        return {
          frameSlug: frame.slug,
          planned: { start: frame.start, frameDur: frame.frameDur },
          actual: { start: actual.start, frameDur: actual.frameDur },
          sources: actual.sources,
          manifestMatchCount: actual.manifestMatchCount,
          manifest: actual.manifest,
          valid,
          matches,
          issue: actual.issue ?? (matches ? null : valid ? "runtime-plan-value-mismatch" : "runtime-timing-unresolved"),
        };
      }),
    };
    const timingFailures = timing.frames.filter((frame) => !frame.valid || !frame.matches).map((frame) => ({
      code: "plan_host_timing_mismatch",
      reason: frame.issue,
      frameSlug: frame.frameSlug,
      globalTime: frame.actual.start,
      wordId: null,
      state: "host-timing",
      color: null,
      background: null,
      sampledBackground: null,
      ratio: null,
      rect: null,
      occluder: null,
      planned: frame.planned,
      actual: frame.actual,
      sources: frame.sources,
      manifestMatchCount: frame.manifestMatchCount,
    }));
    const captionPoints = captionSamples(captionArtifact.groups ?? [], hostFrames, plan.totalDuration);
    const visualSampling = frameSamples(hostFrames, plan.timing.xfade);
    const visualPoints = visualSampling.samples;
    const collected = await collectBrowserEvidence(page, {
      captionPoints,
      captionGroups: captionArtifact.groups ?? [],
      visualPoints,
      frames: hostFrames,
      totalDuration: plan.totalDuration,
      visualContract,
    });
    const reports = {
      captionContrast: captionReport(collected.captionRows, collected.captionStateFailures, collected.captionSeekRows),
      textOcclusion: occlusionReport(collected.occlusionRows, collected.visualSeekRows),
      frameTheme: themeReport(collected.themeRows, visualContract, collected.visualSeekRows),
    };
    for (const report of Object.values(reports)) {
      report.timing = timing;
      report.failures.push(...timingFailures, ...visualSampling.failures, ...collected.visualSeekFailures);
      if (timingFailures.length || visualSampling.failures.length || collected.visualSeekFailures.length) report.result = "FAIL";
    }
    await mkdir(absoluteOutput, { recursive: true });
    await Promise.all(Object.entries(ARTIFACTS).map(([key, filename]) =>
      writeFile(join(absoluteOutput, filename), `${JSON.stringify(reports[key], null, 2)}\n`)
    ));
    const result = Object.values(reports).every((report) => report.result === "PASS") ? "PASS" : "FAIL";
    return {
      result,
      artifacts: Object.fromEntries(Object.entries(ARTIFACTS).map(([key, filename]) => [key, join(absoluteOutput, filename)])),
      checks: Object.fromEntries(Object.entries(reports).map(([key, report]) => [key, report.result])),
    };
  } finally {
    await browser.close();
  }
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!option?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`invalid arguments\n${USAGE}`);
    }
    if (values.has(option)) throw new Error(`duplicate option ${option}\n${USAGE}`);
    values.set(option, value);
  }
  const allowed = new Set(["--url", "--base-url", "--project", "--evidence", "--output", "--browser-path"]);
  for (const option of values.keys()) {
    if (!allowed.has(option)) throw new Error(`unknown option ${option}\n${USAGE}`);
  }
  return {
    baseUrl: values.get("--url") ?? values.get("--base-url"),
    projectDir: values.get("--project"),
    outputDir: values.get("--evidence") ?? values.get("--output"),
    executablePath: values.get("--browser-path") ?? process.env.CHROME_PATH,
  };
}

const mainPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (mainPath === fileURLToPath(import.meta.url)) {
  try {
    const summary = await runComposedVisualIntegrity(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (summary.result !== "PASS") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
