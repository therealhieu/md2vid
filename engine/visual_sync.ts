import type {
  BuildPlan,
  Finding,
  PlanFrame,
  ResolvedVisualBeat,
  ResolvedVisualSyncPolicy,
  VisualBinding,
  VisualBindingManifest,
  VisualFrameDuration,
} from "./types.ts";

export function verifyVisualSync(input: {
  plan: BuildPlan;
  manifest?: VisualBindingManifest;
  policy: ResolvedVisualSyncPolicy;
  fps: number;
}): Finding[] {
  if (input.policy.mode === "off") return [];

  const level: Finding["level"] = input.policy.mode === "required" ? "error" : "warn";
  const planned = input.plan.frames.flatMap((frame) =>
    (frame.visualBeats ?? []).map((beat) => ({ frame, beat, key: `${frame.slug}:${beat.id}` })),
  );
  if (planned.length === 0) return [];
  if (!input.manifest) return [{ level, msg: "visual binding manifest is missing" }];
  if (!Number.isFinite(input.fps) || input.fps <= 0) {
    return [{ level: "error", msg: "visual sync FPS must be a finite positive number" }];
  }

  const findings: Finding[] = [];
  const push = (msg: string): void => { findings.push({ level, msg }); };
  const durationTolerance = Math.max(0.001, 0.5 / input.fps);
  const frames = new Map(input.plan.frames.map((frame) => [frame.slug, frame]));
  const byKey = new Map<string, VisualBinding[]>();
  const durationEvidence = new Map<string, VisualFrameDuration>();
  for (const evidence of input.manifest.frames ?? []) {
    if (!frames.has(evidence.frameSlug)) {
      push(`frame duration evidence references unknown frame "${evidence.frameSlug}"`);
      continue;
    }
    if (durationEvidence.has(evidence.frameSlug)) {
      push(`duplicate frame duration evidence for frame "${evidence.frameSlug}"`);
      continue;
    }
    durationEvidence.set(evidence.frameSlug, evidence);
  }

  for (const binding of input.manifest.bindings) {
    const frame = frames.get(binding.frameSlug);
    if (!frame) {
      push(`binding target "${binding.target}" references unknown frame "${binding.frameSlug}"`);
      continue;
    }
    const beat = frame.visualBeats?.find((candidate) => candidate.id === binding.beatId);
    if (!beat) {
      push(`frame "${frame.slug}" target "${binding.target}" references unknown beat "${binding.beatId}"`);
      continue;
    }
    if (
      !Number.isFinite(binding.revealStart)
      || !Number.isFinite(binding.revealDuration)
      || binding.revealDuration < 0
    ) {
      push(`frame "${frame.slug}" beat "${beat.id}" target "${binding.target}" has invalid reveal timing`);
      continue;
    }

    const key = `${frame.slug}:${beat.id}`;
    byKey.set(key, [...(byKey.get(key) ?? []), binding]);
    const delta = binding.revealStart - beat.start;
    if (delta < -beat.tolerance.maxLead) {
      push(formatLeadFinding(frame, beat, binding, -delta));
    }
    if (delta > beat.tolerance.maxLag) {
      push(formatLagFinding(frame, beat, binding, delta));
    }

    const landing = frame.voiceDur - (binding.revealStart + binding.revealDuration);
    if (landing < input.policy.minLanding) {
      push(formatLandingFinding(frame, beat, binding, landing, input.policy.minLanding));
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

  for (const frame of input.plan.frames) {
    if (!frame.visualBeats?.length) continue;
    const evidence = durationEvidence.get(frame.slug);
    if (evidence) appendDurationFindings(findings, level, frame, evidence, durationTolerance, input.fps);
  }

  for (const { frame, beat, key } of planned) {
    if ((byKey.get(key) ?? []).length === 0) {
      push(`frame "${frame.slug}" beat "${beat.id}" has no visual binding`);
    }
  }
  appendDuplicateTargetFindings(findings, input.manifest.bindings, level);
  appendWorkflowOrderFindings(findings, input.plan.frames, byKey, level);
  return findings;
}

const seconds = (value: number): string => value.toFixed(3);

function formatLeadFinding(
  frame: PlanFrame,
  beat: ResolvedVisualBeat,
  binding: VisualBinding,
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
  binding: VisualBinding,
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
  binding: VisualBinding,
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
  bindings: readonly VisualBinding[],
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
  byKey: ReadonlyMap<string, readonly VisualBinding[]>,
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
