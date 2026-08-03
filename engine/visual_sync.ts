import type {
  BuildPlan,
  Finding,
  PlanFrame,
  ResolvedCoverageExemption,
  ResolvedVisualBeat,
  ResolvedVisualStateV2,
  ResolvedVisualSyncPolicy,
  VisualBindingEvidenceFreshness,
  VisualBindingManifest,
  VisualBindingV1,
  VisualBindingV2,
  VisualFrameDuration,
} from "./types.ts";
import { compareVisualEvidenceFreshness } from "./visual_evidence.ts";

interface Interval {
  start: number;
  end: number;
}

type BindingEvidence = VisualBindingV1 | VisualBindingV2;

interface CoverageBinding {
  binding: VisualBindingV2;
  beat: ResolvedVisualStateV2;
}

export function verifyVisualSync(input: {
  plan: BuildPlan;
  manifest?: VisualBindingManifest;
  policy: ResolvedVisualSyncPolicy;
  fps: number;
  freshness?: VisualBindingEvidenceFreshness;
}): Finding[] {
  const revealEnabled = input.policy.mode !== "off";
  const coverageEnabled = input.policy.coverageMode !== "off";
  if (!revealEnabled && !coverageEnabled) return [];

  const revealLevel: Finding["level"] = input.policy.mode === "required" ? "error" : "warn";
  const coverageLevel: Finding["level"] = input.policy.coverageMode === "required" ? "error" : "warn";
  const planned = input.plan.frames.flatMap((frame) =>
    (frame.visualBeats ?? []).map((beat) => ({ frame, beat, key: `${frame.slug}:${beat.id}` })),
  );
  const coverageFrames = input.plan.frames.filter((frame) =>
    frame.visualSpecVersion === 2 && frame.words.length > 0,
  );

  if (!input.manifest) {
    if (!revealEnabled && coverageFrames.length === 0) return [];
    return [{
      level: revealEnabled ? revealLevel : coverageLevel,
      msg: "visual binding manifest is missing",
    }];
  }
  if (!Number.isFinite(input.fps) || input.fps <= 0) {
    return [{ level: "error", msg: "visual sync FPS must be a finite positive number" }];
  }

  const findings: Finding[] = [];
  let manifest = input.manifest;
  if (manifest.version === 2 && input.freshness) {
    const changes = compareVisualEvidenceFreshness(manifest, input.freshness);
    if (changes.length > 0) {
      findings.push({
        level: input.policy.coverageMode === "required" ? "error" : "warn",
        code: "stale_visual_evidence",
        msg: formatStaleVisualEvidence(changes),
        details: { changes },
      });
      manifest = {
        ...manifest,
        bindings: manifest.bindings.filter((binding) => binding.role !== "focal"),
      };
    }
  }
  const durationTolerance = Math.max(0.001, 0.5 / input.fps);
  const coverageEpsilon = 0.5 / input.fps;
  const frames = new Map(input.plan.frames.map((frame) => [frame.slug, frame]));
  const byKey = new Map<string, BindingEvidence[]>();
  const coverageByFrame = new Map<string, CoverageBinding[]>();
  const durationEvidence = new Map<string, VisualFrameDuration>();
  const pushReveal = (msg: string): void => { findings.push({ level: revealLevel, msg }); };
  const pushCoverage = (
    code: string,
    msg: string,
    details: Record<string, unknown>,
  ): void => { findings.push({ level: coverageLevel, code, msg, details }); };

  if (revealEnabled) {
    for (const evidence of manifest.frames ?? []) {
      if (!frames.has(evidence.frameSlug)) {
        pushReveal(`frame duration evidence references unknown frame "${evidence.frameSlug}"`);
        continue;
      }
      if (durationEvidence.has(evidence.frameSlug)) {
        pushReveal(`duplicate frame duration evidence for frame "${evidence.frameSlug}"`);
        continue;
      }
      durationEvidence.set(evidence.frameSlug, evidence);
    }
  }

  for (const binding of manifest.bindings) {
    const frame = frames.get(binding.frameSlug);
    if (!frame) {
      if (revealEnabled) {
        pushReveal(`binding target "${binding.target}" references unknown frame "${binding.frameSlug}"`);
      }
      continue;
    }
    const beat = frame.visualBeats?.find((candidate) => candidate.id === binding.beatId);
    if (!beat) {
      if (revealEnabled) {
        pushReveal(`frame "${frame.slug}" target "${binding.target}" references unknown beat "${binding.beatId}"`);
      }
      continue;
    }

    let validRevealTiming = true;
    if (
      !Number.isFinite(binding.revealStart)
      || !Number.isFinite(binding.revealDuration)
      || binding.revealDuration < 0
    ) {
      validRevealTiming = false;
      if (revealEnabled) {
        pushReveal(`frame "${frame.slug}" beat "${beat.id}" target "${binding.target}" has invalid reveal timing`);
      }
    }

    const key = `${frame.slug}:${beat.id}`;
    if (validRevealTiming) {
      byKey.set(key, [...(byKey.get(key) ?? []), binding]);
    }

    if (revealEnabled && validRevealTiming) {
      const delta = binding.revealStart - beat.start;
      if (delta < -beat.tolerance.maxLead) {
        pushReveal(formatLeadFinding(frame, beat, binding, -delta));
      }
      if (delta > beat.tolerance.maxLag) {
        pushReveal(formatLagFinding(frame, beat, binding, delta));
      }

      const landing = frame.voiceDur - (binding.revealStart + binding.revealDuration);
      if (landing < input.policy.minLanding) {
        pushReveal(formatLandingFinding(frame, beat, binding, landing, input.policy.minLanding));
      }
      const existingEvidence = durationEvidence.get(frame.slug) ?? { frameSlug: frame.slug };
      if (existingEvidence.authoredDuration === undefined && binding.authoredDuration !== undefined) {
        existingEvidence.authoredDuration = binding.authoredDuration;
      }
      if (existingEvidence.outerDuration === undefined && binding.outerDuration !== undefined) {
        existingEvidence.outerDuration = binding.outerDuration;
      }
      durationEvidence.set(frame.slug, existingEvidence);
    }

    if (!coverageEnabled || manifest.version !== 2 || frame.visualSpecVersion !== 2) {
      continue;
    }
    if (!isVisualBindingV2(binding) || !isResolvedVisualStateV2(beat)) {
      continue;
    }
    if (binding.role !== beat.role) {
      pushCoverage(
        "invalid_visual_coverage_evidence",
        `frame "${frame.slug}" beat "${beat.id}" target "${binding.target}" has role "${binding.role}" but the planned state role is "${beat.role}"`,
        { frameSlug: frame.slug, beatId: beat.id, target: binding.target },
      );
      continue;
    }
    if (binding.role !== "focal") continue;
    if (!isValidCoverageBinding(binding, frame, coverageEpsilon)) {
      pushCoverage(
        "invalid_visual_coverage_evidence",
        `frame "${frame.slug}" beat "${beat.id}" target "${binding.target}" has invalid semantic coverage interval`,
        {
          frameSlug: frame.slug,
          beatId: beat.id,
          target: binding.target,
          coverageStart: binding.coverageStart,
          coverageEnd: binding.coverageEnd,
        },
      );
      continue;
    }
    coverageByFrame.set(frame.slug, [
      ...(coverageByFrame.get(frame.slug) ?? []),
      { binding, beat },
    ]);
  }

  if (revealEnabled) {
    for (const frame of input.plan.frames) {
      if (!frame.visualBeats?.length) continue;
      const evidence = durationEvidence.get(frame.slug);
      if (evidence) appendDurationFindings(findings, revealLevel, frame, evidence, durationTolerance, input.fps);
    }

    for (const { frame, beat, key } of planned) {
      if ((byKey.get(key) ?? []).length === 0) {
        pushReveal(`frame "${frame.slug}" beat "${beat.id}" has no visual binding`);
      }
    }
    appendDuplicateTargetFindings(findings, manifest.bindings, revealLevel);
    appendWorkflowOrderFindings(findings, input.plan.frames, byKey, revealLevel);
  }

  if (coverageEnabled && manifest.version === 2) {
    appendCoverageFindings(
      findings,
      coverageFrames,
      coverageByFrame,
      input.policy,
      coverageLevel,
      coverageEpsilon,
    );
  }
  return findings;
}

function isVisualBindingV2(binding: BindingEvidence): binding is VisualBindingV2 {
  return "role" in binding && "coverageStart" in binding && "coverageEnd" in binding;
}

function isResolvedVisualStateV2(beat: ResolvedVisualBeat): beat is ResolvedVisualStateV2 {
  return beat.version === 2;
}

function isValidCoverageBinding(
  binding: VisualBindingV2,
  frame: PlanFrame,
  epsilon: number,
): boolean {
  return Number.isFinite(binding.coverageStart)
    && Number.isFinite(binding.coverageEnd)
    && binding.coverageStart <= binding.coverageEnd
    && binding.coverageStart >= -epsilon
    && binding.coverageEnd <= frame.frameDur + epsilon;
}

function appendCoverageFindings(
  findings: Finding[],
  frames: readonly PlanFrame[],
  coverageByFrame: ReadonlyMap<string, readonly CoverageBinding[]>,
  policy: ResolvedVisualSyncPolicy,
  level: Finding["level"],
  epsilon: number,
): void {
  for (const frame of frames) {
    const required = { start: frame.words[0].start, end: frame.frameDur };
    const bindings = coverageByFrame.get(frame.slug) ?? [];
    const intervals = bindings.map(({ binding }) => ({
      start: Math.max(0, binding.coverageStart),
      end: Math.min(frame.frameDur, binding.coverageEnd),
    }));
    const gaps = subtractCoverage(required, unionIntervals(intervals, epsilon), epsilon);
    const usedExemptions = new Set<string>();

    for (const gap of gaps) {
      const exemptions = (frame.visualCoverageExemptions ?? []).filter((exemption) =>
        intersects(gap, exemption, epsilon),
      );
      for (const exemption of exemptions) {
        if (usedExemptions.has(exemption.id)) continue;
        usedExemptions.add(exemption.id);
        appendExemptionFinding(findings, frame, exemption);
      }

      const unapproved = subtractCoverage(
        gap,
        unionIntervals(exemptions, epsilon),
        epsilon,
      );
      for (const uncovered of unapproved) {
        if (uncovered.end - uncovered.start <= policy.maxUncoveredGap) continue;
        appendCoverageGapFinding(findings, frame, bindings, required, uncovered, policy, level, epsilon);
      }
    }
  }
}

function unionIntervals(intervals: readonly Interval[], epsilon: number): Interval[] {
  const sorted = intervals
    .map((interval) => ({ ...interval }))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end + epsilon) {
      merged.push(interval);
      continue;
    }
    previous.end = Math.max(previous.end, interval.end);
  }
  return merged;
}

function subtractCoverage(
  required: Interval,
  covered: readonly Interval[],
  epsilon: number,
): Interval[] {
  const gaps: Interval[] = [];
  let cursor = required.start;
  for (const interval of covered) {
    if (interval.end <= cursor + epsilon) continue;
    if (interval.start > cursor + epsilon) {
      gaps.push({ start: cursor, end: Math.min(interval.start, required.end) });
    }
    cursor = Math.max(cursor, interval.end);
    if (cursor >= required.end - epsilon) break;
  }
  if (cursor < required.end - epsilon) {
    gaps.push({ start: cursor, end: required.end });
  }
  return gaps.filter((gap) => gap.end > gap.start + epsilon);
}

function intersects(gap: Interval, exemption: Interval, epsilon: number): boolean {
  return Math.min(gap.end, exemption.end) > Math.max(gap.start, exemption.start) + epsilon;
}

function appendExemptionFinding(
  findings: Finding[],
  frame: PlanFrame,
  exemption: ResolvedCoverageExemption,
): void {
  findings.push({
    level: "warn",
    code: "visual_coverage_exemption",
    msg: `frame "${frame.slug}" has approved visual coverage exemption "${exemption.id}" `
      + `${seconds(exemption.start)}s-${seconds(exemption.end)}s (${seconds(exemption.end - exemption.start)}s): `
      + `${exemption.reason} (approved by ${exemption.approvedBy})`,
    details: {
      frameSlug: frame.slug,
      exemptionId: exemption.id,
      start: exemption.start,
      end: exemption.end,
      duration: exemption.end - exemption.start,
      reason: exemption.reason,
      approvedBy: exemption.approvedBy,
    },
  });
}

function appendCoverageGapFinding(
  findings: Finding[],
  frame: PlanFrame,
  bindings: readonly CoverageBinding[],
  required: Interval,
  gap: Interval,
  policy: ResolvedVisualSyncPolicy,
  level: Finding["level"],
  epsilon: number,
): void {
  const classification = classifyGap(gap, required, epsilon);
  const previous = bindings
    .filter(({ binding }) => binding.coverageEnd <= gap.start + epsilon)
    .sort((left, right) => right.binding.coverageEnd - left.binding.coverageEnd)[0];
  const next = bindings
    .filter(({ binding }) => binding.coverageStart >= gap.end - epsilon)
    .sort((left, right) => left.binding.coverageStart - right.binding.coverageStart)[0];
  const details: Record<string, unknown> = {
    frameSlug: frame.slug,
    start: gap.start,
    end: gap.end,
    duration: gap.end - gap.start,
    maxUncoveredGap: policy.maxUncoveredGap,
    ...(previous === undefined ? {} : { previousBeatId: previous.beat.id }),
    ...(next === undefined ? {} : { nextBeatId: next.beat.id }),
    extendsThroughFrameEnd: classification.extendsThroughFrameEnd,
  };
  const recovery = "Add a frame-start focal state, extend the previous focal state, add a replacement state, or declare an approved intentional audio-only interval.";
  let msg: string;
  if (classification.code === "opening_visual_gap") {
    msg = `frame "${frame.slug}" narration begins at ${seconds(required.start)}s, but first bound focal coverage begins at ${seconds(gap.end)}s; `
      + `uncovered interval ${seconds(gap.start)}s-${seconds(gap.end)}s (${seconds(gap.end - gap.start)}s), `
      + `maximum allowed ${seconds(policy.maxUncoveredGap)}s. ${recovery}`;
  } else if (classification.code === "ending_visual_gap") {
    msg = `frame "${frame.slug}" final focal coverage ends at ${seconds(gap.start)}s, but the frame landing ends at ${seconds(required.end)}s; `
      + `uncovered interval ${seconds(gap.start)}s-${seconds(gap.end)}s (${seconds(gap.end - gap.start)}s), `
      + `maximum allowed ${seconds(policy.maxUncoveredGap)}s. ${recovery}`;
  } else {
    msg = `frame "${frame.slug}" has no bound focal state covering ${seconds(gap.start)}s-${seconds(gap.end)}s `
      + `(${seconds(gap.end - gap.start)}s), maximum allowed ${seconds(policy.maxUncoveredGap)}s. ${recovery}`;
  }
  findings.push({ level, code: classification.code, msg, details });
}

function classifyGap(
  gap: Interval,
  required: Interval,
  epsilon: number,
): {
  code: "opening_visual_gap" | "mid_scene_visual_gap" | "ending_visual_gap";
  extendsThroughFrameEnd: boolean;
} {
  if (Math.abs(gap.start - required.start) <= epsilon) {
    return {
      code: "opening_visual_gap",
      extendsThroughFrameEnd: Math.abs(gap.end - required.end) <= epsilon,
    };
  }
  if (Math.abs(gap.end - required.end) <= epsilon) {
    return { code: "ending_visual_gap", extendsThroughFrameEnd: false };
  }
  return { code: "mid_scene_visual_gap", extendsThroughFrameEnd: false };
}

function formatStaleVisualEvidence(
  changes: ReturnType<typeof compareVisualEvidenceFreshness>,
): string {
  const summary = changes.map((change) => {
    if (change.kind === "planSha256") return "planSha256 differs from the current semantic plan";
    if (change.kind === "added") return `new authored input ${change.path}`;
    if (change.kind === "removed") return `missing authored input ${change.path}`;
    return `changed authored input ${change.path}`;
  });
  return `stale_visual_evidence: ${summary.join("; ")}. Run \`md2vid build\` to regenerate semantic visual evidence.`;
}

const seconds = (value: number): string => value.toFixed(3);

function formatLeadFinding(
  frame: PlanFrame,
  beat: ResolvedVisualBeat,
  binding: BindingEvidence,
  lead: number,
): string {
  return `frame "${frame.slug}" beat "${beat.id}" target "${binding.target}": `
    + `reveal starts at ${seconds(binding.revealStart)}s; `
    + `cue starts at ${seconds(beat.start)}s; `
    + `lead is ${seconds(lead)}s, exceeding maxLead ${seconds(beat.tolerance.maxLead)}s`;
}

function formatLagFinding(
  frame: PlanFrame,
  beat: ResolvedVisualBeat,
  binding: BindingEvidence,
  lag: number,
): string {
  return `frame "${frame.slug}" beat "${beat.id}" target "${binding.target}": `
    + `reveal starts at ${seconds(binding.revealStart)}s; `
    + `cue starts at ${seconds(beat.start)}s; `
    + `lag is ${seconds(lag)}s, exceeding maxLag ${seconds(beat.tolerance.maxLag)}s`;
}

function formatLandingFinding(
  frame: PlanFrame,
  beat: ResolvedVisualBeat,
  binding: BindingEvidence,
  landing: number,
  minLanding: number,
): string {
  const revealEnd = binding.revealStart + binding.revealDuration;
  const shortfall = minLanding - landing;
  return `frame "${frame.slug}" beat "${beat.id}" target "${binding.target}": `
    + `reveal starts at ${seconds(binding.revealStart)}s; `
    + `cue starts at ${seconds(beat.start)}s; `
    + `reveal ends at ${seconds(revealEnd)}s; `
    + `landing is ${seconds(landing)}s, short of minLanding ${seconds(minLanding)}s by ${seconds(shortfall)}s`;
}

function appendDurationFindings(
  findings: Finding[],
  level: Finding["level"],
  frame: PlanFrame,
  evidence: VisualFrameDuration,
  durationTolerance: number,
  fps: number,
): void {
  if (
    evidence.authoredDuration !== undefined
    && Math.abs(evidence.authoredDuration - frame.voiceDur) > durationTolerance
  ) {
    findings.push({
      level,
      msg: `frame "${frame.slug}" authored duration ${seconds(evidence.authoredDuration)}s does not match `
        + `voiceDur ${seconds(frame.voiceDur)}s within ${seconds(durationTolerance)}s at ${fps} FPS`,
    });
  }
  if (
    evidence.outerDuration !== undefined
    && Math.abs(evidence.outerDuration - frame.frameDur) > durationTolerance
  ) {
    findings.push({
      level,
      msg: `frame "${frame.slug}" outer duration ${seconds(evidence.outerDuration)}s does not match `
        + `frameDur ${seconds(frame.frameDur)}s within ${seconds(durationTolerance)}s at ${fps} FPS`,
    });
  }
}

function appendDuplicateTargetFindings(
  findings: Finding[],
  bindings: readonly BindingEvidence[],
  level: Finding["level"],
): void {
  const seen = new Set<string>();
  for (const binding of bindings) {
    const key = `${binding.frameSlug}:${binding.target}`;
    if (seen.has(key)) {
      findings.push({
        level,
        msg: `duplicate visual target "${binding.target}" in frame "${binding.frameSlug}"`,
      });
    }
    seen.add(key);
  }
}

function appendWorkflowOrderFindings(
  findings: Finding[],
  frames: readonly PlanFrame[],
  byKey: ReadonlyMap<string, readonly BindingEvidence[]>,
  level: Finding["level"],
): void {
  for (const frame of frames) {
    const steps = (frame.visualBeats ?? [])
      .filter((beat) => beat.workflowStep !== undefined)
      .sort((left, right) => left.workflowStep! - right.workflowStep!);
    let previous = Number.NEGATIVE_INFINITY;
    for (const beat of steps) {
      const starts = (byKey.get(`${frame.slug}:${beat.id}`) ?? [])
        .map((binding) => binding.revealStart);
      if (starts.length === 0) continue;
      const current = Math.min(...starts);
      if (current < previous) {
        findings.push({
          level,
          msg: `frame "${frame.slug}" workflow beat "${beat.id}" reveals out of order`,
        });
      }
      previous = current;
    }
  }
}
