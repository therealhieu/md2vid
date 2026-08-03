import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  SKILL_REFERENCE_MAP,
  assertSkillMarkdownReferencesResolve,
  assertSkillReferencesEqual,
  validateSkillTree,
} from "../../scripts/skill_references.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const SKILL_ROOT = join(REPO_ROOT, "skill", "md2vid");

function assertOrder(body: string, fragments: string[], label: string): void {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = body.indexOf(fragment, cursor + 1);
    assert.ok(next > cursor, `${label}: expected ${JSON.stringify(fragment)} after offset ${cursor}`);
    cursor = next;
  }
}

function readSourceAndCopy(sourceFromRoot: string): Array<{ label: string; body: string }> {
  const entry = SKILL_REFERENCE_MAP.find((candidate) => candidate.sourceFromRoot === sourceFromRoot);
  assert.ok(entry, `missing skill reference mapping for ${sourceFromRoot}`);
  return [
    { label: entry.sourceFromRoot, body: readFileSync(join(REPO_ROOT, entry.sourceFromRoot), "utf8") },
    { label: entry.destinationFromRoot, body: readFileSync(join(REPO_ROOT, entry.destinationFromRoot), "utf8") },
  ];
}

function sectionBetween(body: string, start: string, end: string, label: string): string {
  if (
    start === "<!-- md2vid-narration-workflow:start -->"
    && end === "<!-- md2vid-narration-workflow:end -->"
  ) {
    const count = (marker: string) => body.split(marker).length - 1;
    assert.equal(count(start), 1, "expected exactly one workflow start marker");
    assert.equal(count(end), 1, "expected exactly one workflow end marker");
  }
  const startIndex = body.indexOf(start);
  const endIndex = body.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `${label}: missing section ${JSON.stringify(start)}`);
  assert.ok(endIndex > startIndex, `${label}: missing section boundary ${JSON.stringify(end)}`);
  return body.slice(startIndex, endIndex);
}

const DEFAULT_NARRATION_REQUEST = {
  version: 1,
  provider: "kokoro",
  voice: "am_michael",
  lang: "en",
  speed: 0.9,
  lines: [
    { id: "intro", text: "Introduce the topic." },
    { id: "recap", text: "Recap the key idea." },
  ],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactDefaultNarrationRequest(body: string, label: string): void {
  const defaults = [...body.matchAll(/```json\n([\s\S]*?)\n```/g)]
    .flatMap((match) => {
      try {
        const value: unknown = JSON.parse(match[1]);
        return isRecord(value)
          && ["version", "provider", "voice", "lang", "speed", "lines"].every((key) => key in value)
          ? [value]
          : [];
      } catch {
        return [];
      }
    });

  assert.equal(defaults.length, 1, `${label}: expected exactly one parseable default request`);
  const request = defaults[0]!;
  assert.deepEqual(Object.keys(request), Object.keys(DEFAULT_NARRATION_REQUEST), `${label}: default field order`);
  assert.deepEqual(request, DEFAULT_NARRATION_REQUEST, `${label}: exact FR-1 request`);
}

function assertNarrationPolicyRules(body: string, label: string): void {
  assert.match(body, /For non-English narration, supply a compatible explicit voice; do not use am_michael\./, label);
  assert.match(body, /more than 18(?: lexical)? words[\s\S]{0,120}(?:fails|failure)[\s\S]{0,120}approv/i, label);
  assert.match(body, /comma does not count as a strong sentence boundary/i, label);
}

test("mandatory skill references are byte-identical to authoritative standards", () => {
  assert.deepEqual(
    SKILL_REFERENCE_MAP.map((entry) => entry.destination),
    [
      "references/standards/video-generation.md",
      "references/standards/git.md",
      "references/standards/design/frame.md",
      "references/standards/design/knowledge-expression.md",
      "references/standards/design/frame-content.md",
      "references/standards/frameworks/hyperframes.md",
      "references/standards/frameworks/remotion.md",
    ],
  );
  assert.doesNotThrow(() => assertSkillReferencesEqual(REPO_ROOT));
});

test("bundled Remotion standard uses the actual shared build-plan path", () => {
  const body = readFileSync(
    join(SKILL_ROOT, "references", "standards", "frameworks", "remotion.md"),
    "utf8",
  );
  assert.doesNotMatch(body, /shared\/build_plan\.json/);
  assert.match(body, /shared\/build\/build_plan\.json/);
});

test("video-generation standards define the narration contract and pre-review gate", () => {
  for (const { label, body } of readSourceAndCopy("docs/standards/video-generation.md")) {
    assert.match(body, /audio_request\.json\.example/, label);
    for (const field of ["id", "path", "duration_s", "words"]) assert.match(body, new RegExp(`\\b${field}\\b`), label);
    assert.match(body, /frame order.*voices\[\].*array/i, label);
    assert.match(body, /npm run check.*before.*(?:preview|still|studio|render)/is, label);
  }
});

test("narration timing policy is authoritative and synchronized", () => {
  for (const { label, body } of readSourceAndCopy("docs/standards/video-generation.md")) {
    assert.match(body, /word timings.*finite/i, label);
    assert.match(body, /ordered.*non-overlapping/i, label);
    assert.match(body, /0.*start.*end.*duration_s/i, label);
    assert.match(body, /final-word overrun.*bounded to.*duration_s/is, label);
    assert.match(body, /end past.*clamped/i, label);
    assert.match(body, /does not extend.*(?:WAV|duration_s)/i, label);
    assert.match(body, /(?:build.*verify|verify.*build).*fail.*path.*voice.*word/is, label);
  }
});

test("canonical standards and the skill define one Kokoro narration workflow", () => {
  const canonical = readFileSync(join(REPO_ROOT, "docs", "standards", "video-generation.md"), "utf8");
  const skill = readFileSync(join(SKILL_ROOT, "SKILL.md"), "utf8");

  for (const [label, text] of [["canonical", canonical], ["skill", skill]] as const) {
    for (const term of [
      "\"version\": 1",
      "\"provider\": \"kokoro\"",
      "\"voice\": \"am_michael\"",
      "\"lang\": \"en\"",
      "\"speed\": 0.9",
      "6–14",
      "more than 18",
      "comma does not count as a strong sentence boundary",
      "md2vid narration-check",
      "/media-use",
      "md2vid transcribe",
      "narration_evidence.json",
      "For non-English narration, supply a compatible explicit voice; do not use am_michael.",
      "There is no `md2vid audio` command.",
    ]) assert.match(text, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${label}: ${term}`);
  }

  const startMarker = "<!-- md2vid-narration-workflow:start -->";
  const endMarker = "<!-- md2vid-narration-workflow:end -->";
  const workflow = sectionBetween(skill, startMarker, endMarker, "narration workflow");
  const ordered = [
    "spoken narration script",
    "md2vid narration-check",
    "Kokoro",
    "md2vid transcribe",
    "visual_beats.json",
    "npm run plan",
    "npm run build",
    "npm run check",
    "review",
    "render",
  ];
  assertOrder(workflow, ordered, "narration workflow");
  assert.ok(workflow.includes("<!-- md2vid-media-contract:start -->"), "workflow must retain media contract");
  assert.ok(workflow.includes("<!-- md2vid-media-contract:end -->"), "workflow must retain media contract");

  for (const forbidden of [
    "/hyperframes-media",
    "provider: \"auto\"",
    "say -v",
    "estimate word timings",
    "author visuals before transcription",
  ]) assert.equal(skill.includes(forbidden), false, `forbidden guidance remains: ${forbidden}`);
});

test("policy-owning public surfaces serialize the exact FR-1 narration request", () => {
  const documents = [
    ["README", readFileSync(join(REPO_ROOT, "README.md"), "utf8")],
    ["canonical standard", readFileSync(join(REPO_ROOT, "docs", "standards", "video-generation.md"), "utf8")],
    ["skill", readFileSync(join(SKILL_ROOT, "SKILL.md"), "utf8")],
  ] as const;

  for (const [label, body] of documents) {
    assertExactDefaultNarrationRequest(body, label);
    assertNarrationPolicyRules(body, label);
  }

  const readme = documents[0][1];
  assert.throws(
    () => assertExactDefaultNarrationRequest(readme.replace('"speed": 0.9', '"speed": 1'), "mutated README"),
    /exact FR-1 request/,
  );
});

test("duplicate narration workflow marker pairs are rejected", () => {
  const skill = readFileSync(join(SKILL_ROOT, "SKILL.md"), "utf8");
  const startMarker = "<!-- md2vid-narration-workflow:start -->";
  const endMarker = "<!-- md2vid-narration-workflow:end -->";
  const duplicate = `${skill}\n${startMarker}\ncontradictory workflow\n${endMarker}\n`;

  assert.throws(
    () => sectionBetween(duplicate, startMarker, endMarker, "duplicated narration workflow"),
    /expected exactly one workflow start marker/,
  );
});

test("canonical and bundled standards require v2 continuous visual timing workflow", () => {
  for (const { label, body } of readSourceAndCopy("docs/standards/video-generation.md")) {
    assert.match(body, /visual_beats(?:\.json)? v2/i, label);
    assert.match(body, /opening\/body\/final focal states/i, label);
    assert.match(body, /build\/visual_timing\.json/, label);
    assert.match(body, /continuous npm run (?:check|verify)|continuous verify/i, label);
    assert.match(body, /--allow-low-fps/, label);
    assert.doesNotMatch(body, /cue-bound visual authoring/i, label);
    assert.doesNotMatch(body, /planned-beat coverage/i, label);
    assertOrder(body, ["source", "storyboard semantic", "script", "narration", "transcription", "visual_beats v2", "npm run plan", "build/visual_timing.json", "bind framework visibility", "npm run build", "npm run check", "preview", "manual semantic review", "render"], label);
  }
  for (const { label, body } of readSourceAndCopy("docs/standards/design/frame.md")) {
    assert.match(body, /every narrated (?:node|row|card|code line|station).*beat ID/is, label);
    assert.match(body, /no copied semantic offsets/i, label);
    assert.match(body, /front-loaded workflows/i, label);
  }
  for (const { label, body } of readSourceAndCopy("docs/standards/design/knowledge-expression.md")) {
    assert.match(body, /ordered beat coverage/i, label);
    assert.match(body, /grouped source references/i, label);
    for (const treatment of ["Flow", "Enumerate", "Matrix", "Contrast"]) assert.match(body, new RegExp(`\\b${treatment}\\b`), label);
  }
  for (const { label, body } of readSourceAndCopy("docs/standards/frameworks/hyperframes.md")) {
    assert.match(body, /data-md2vid-beat/, label);
    assert.match(body, /data-md2vid-custom-bindings/, label);
    assert.match(body, /--profile final\|draft\|gif/, label);
    assert.match(body, /owned helper/i, label);
    assert.match(body, /visual_bindings\.json/, label);
    assert.match(body, /seek-safe/i, label);
    assert.match(body, /opening\/body\/final focal states/i, label);
    assert.match(body, /build\/visual_timing\.json/, label);
  }
  for (const { label, body } of readSourceAndCopy("docs/standards/frameworks/remotion.md")) {
    assert.match(body, /static.*visual_bindings\.json/is, label);
    assert.match(body, /VisualBeatProvider/, label);
    assert.match(body, /BeatReveal/, label);
    assert.match(body, /30 FPS/, label);
    assert.match(body, /opening\/body\/final focal states/i, label);
    assert.match(body, /build\/visual_timing\.json/, label);
  }
  for (const { label, body } of readSourceAndCopy("docs/standards/design/frame-content.md")) {
    assert.match(body, /one registered parent timeline may compose generated and authored child timelines/i, label);
  }
});

test("canonical and bundled standards require continuous semantic visual coverage", () => {
  for (const { label, body } of readSourceAndCopy("docs/standards/video-generation.md")) {
    assert.match(body, /continuous semantic visual coverage/i, label);
    assert.match(body, /first spoken word.*held landing/is, label);
    assert.match(body, /captions.*do not.*satisfy/is, label);
    assert.match(body, /maxUncoveredGap/, label);
    assert.match(body, /opening.*middle.*ending/is, label);
    assert.match(body, /manifest.*freshness/is, label);
    assert.match(body, /project-standard marker/i, label);
  }

  for (const { label, body } of readSourceAndCopy("docs/standards/design/frame.md")) {
    assert.match(body, /active focal semantic state = narration concept = caption concept/i, label);
    assert.match(body, /static focal state/i, label);
    assert.match(body, /held landing/i, label);
    assert.match(body, /shell.*not.*focal coverage/is, label);
  }

  for (const { label, body } of readSourceAndCopy("docs/standards/design/knowledge-expression.md")) {
    assert.match(body, /At every narrated timestamp/i, label);
    assert.match(body, /active focal semantic state = narration concept = caption concept/i, label);
    assert.match(body, /static holds are valid/i, label);
    assert.match(body, /concept change requires a new state/i, label);
  }

  for (const { label, body } of readSourceAndCopy("docs/standards/design/frame-content.md")) {
    assert.match(body, /framework-owned binding paths/i, label);
    assert.match(body, /owned semantic activation/i, label);
    assert.match(body, /owned semantic exit/i, label);
    assert.match(body, /generated evidence matches runtime behavior/i, label);
  }

  for (const { label, body } of readSourceAndCopy("docs/standards/frameworks/hyperframes.md")) {
    assert.match(body, /md2vid-continuous-visual-coverage: 2/, label);
    assert.match(body, /data-md2vid-coverage="planned"/, label);
    assert.match(body, /owned semantic exit/i, label);
    assert.match(body, /raw authored.*digest/i, label);
    assert.match(body, /host retention.*frameDur/i, label);
  }

  for (const { label, body } of readSourceAndCopy("docs/standards/frameworks/remotion.md")) {
    assert.match(body, /md2vid-continuous-visual-coverage: 2/, label);
    assert.match(body, /BeatState/, label);
    assert.match(body, /BeatReveal/, label);
    assert.match(body, /registry v2/i, label);
    assert.match(body, /authored input digest/i, label);
    assert.match(body, /shared boundary quantization/i, label);
  }
});

test("skill and README document the continuous coverage workflow and migration", () => {
  const skill = readFileSync(join(SKILL_ROOT, "SKILL.md"), "utf8");
  const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");

  for (const [label, body] of [["skill", skill], ["README", readme]] as const) {
    assert.match(body, /source coverage.*storyboard semantic coverage map.*script/is, label);
    assert.match(body, /visual_beats(?:\.json)? v2/i, label);
    assert.match(body, /opening\/body\/final focal states/i, label);
    assert.match(body, /build\/visual_timing\.json/i, label);
    assert.match(body, /inspect resolved (?:coverage )?(?:build\/visual_timing\.json )?intervals/i, label);
    assert.match(body, /continuous (?:npm run )?(?:check|verify)|continuous verify/i, label);
    assert.match(body, /preview\/manual semantic review|manual semantic review/i, label);
    assert.match(body, /captions.*(?:title|background).*insufficient|(?:title|background).*captions.*insufficient/is, label);
    assert.match(body, /no fixed motion cadence|does not require.*fixed motion cadence/i, label);
    assert.doesNotMatch(body, /transcription\s*→\s*visual_beats\.json\s*→\s*(?:md2vid|npm run) plan\b/is, label);
    assert.doesNotMatch(body, /beat coverage(?!.*interval)/i, label);
  }

  assert.match(readme, /v1.*compatibility/i);
  assert.match(readme, /"version"\s*:\s*2/);
  assert.match(readme, /coverageMode/);
  assert.match(readme, /manifest.*freshness/i);
  assert.match(readme, /HyperFrames.*Remotion/is);
  assert.match(readme, /manual.*refresh.*\.md2vid\/standards/i);
});

test("framework onboarding resolves visual timing before framework authoring", () => {
  for (const { label, body } of readSourceAndCopy("docs/standards/frameworks/hyperframes.md")) {
    const onboarding = sectionBetween(body, "## First run", "### Existing generated projects", label);
    assertOrder(
      onboarding,
      ["source", "storyboard semantic", "script", "audio_meta.json", "npm run transcribe", "visual_beats.json", "opening/body/final focal states", "npm run plan", "build/visual_timing.json", "compositions/frames", "npm run build", "npm run check", "preview", "manual semantic review", "render"],
      label,
    );
    assert.match(onboarding, /"plan": "md2vid plan \."/, label);
    assert.doesNotMatch(onboarding, /Author `visual_beats\.json` against the transcribed WAV words/i, label);
  }
  for (const { label, body } of readSourceAndCopy("docs/standards/frameworks/remotion.md")) {
    const onboarding = sectionBetween(body, "## Generated-project pipeline", "## Cue-bound visual timing", label);
    assertOrder(
      onboarding,
      ["source", "storyboard semantic", "script", "npm run transcribe", "visual_beats.json", "opening/body/final focal states", "npm run plan", "build/visual_timing.json", "src/scenes", "npm run build", "npm run check", "preview", "manual semantic review", "render"],
      label,
    );
    assert.match(onboarding, /"plan": "md2vid plan \."/, label);
    assert.doesNotMatch(onboarding, /Author visual_beats\.json against the transcribed WAV words/i, label);
  }
});

test("public and skill guidance use canonical HyperFrames paths without inventing an audio command", () => {
  const documents = [
    { label: "README.md", body: readFileSync(join(REPO_ROOT, "README.md"), "utf8") },
    { label: "skill/md2vid/SKILL.md", body: readFileSync(join(SKILL_ROOT, "SKILL.md"), "utf8") },
    ...readSourceAndCopy("docs/standards/frameworks/hyperframes.md"),
  ];

  for (const { label, body } of documents) {
    assert.match(body, /compositions\/captions\.html/, label);
    assert.doesNotMatch(body, /(?<!compositions\/)captions\.html/, label);
    assert.match(body, /gsapSrc[\s\S]*exact unchanged string/i, label);
    assert.doesNotMatch(body, /(?:^|\n)\s*md2vid audio(?:\s|$)/m, label);
  }
  assert.doesNotMatch(
    readFileSync(join(SKILL_ROOT, "SKILL.md"), "utf8"),
    /index\.html\s*\/\s*captions\.html/,
  );
});

test("full-build guidance distinguishes authored sources from regenerated standalone captions", () => {
  const documents = [
    { label: "README.md", body: readFileSync(join(REPO_ROOT, "README.md"), "utf8") },
    { label: "skill/md2vid/SKILL.md", body: readFileSync(join(SKILL_ROOT, "SKILL.md"), "utf8") },
    ...readSourceAndCopy("docs/standards/frameworks/hyperframes.md"),
  ];

  for (const { label, body } of documents) {
    assert.match(body, /authored frame(?: and source)? files remain untouched/i, label);
    assert.match(body, /generated standalone `?compositions\/captions\.html`? is regenerated/i, label);
    assert.doesNotMatch(body, /authored frame and caption files remain unchanged/i, label);
    assert.doesNotMatch(body, /full build (?:keeps|leaves) (?:those )?standalone files (?:intact|untouched)/i, label);
  }
});

test("framework standards document generated build and check ordering", () => {
  for (const { label, body } of readSourceAndCopy("docs/standards/frameworks/hyperframes.md")) {
    assert.match(body, /audio_request\.json\.example/, label);
    assertOrder(body, ["npm run build", "npm run check", "npm run dev"], label);
    assert.match(body, /npm run check.*before.*render/is, label);
  }
  for (const { label, body } of readSourceAndCopy("docs/standards/frameworks/remotion.md")) {
    assert.match(body, /neutral.*title card/i, label);
    assert.match(body, /explicit.*register/i, label);
    assert.match(body, /examples\/hash-table\/remotion\//, label);
    assertOrder(body, ["npm run build", "npm run check", "npm run still"], label);
    assert.match(body, /npm run check.*before.*render/is, label);
  }
});

test("installed skill tree validates without repository files", () => {
  const tmp = mkdtempSync(join(tmpdir(), "md2vid-skill-tree-"));
  try {
    cpSync(SKILL_ROOT, tmp, { recursive: true });
    assert.doesNotThrow(() => validateSkillTree(tmp));
    assert.doesNotThrow(() => assertSkillMarkdownReferencesResolve(tmp));
    for (const entry of SKILL_REFERENCE_MAP) {
      const body = readFileSync(join(tmp, entry.destination), "utf8");
      assert.doesNotMatch(body, /docs\/standards\//, entry.destination);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("installed skill validation rejects bare source-script guidance", () => {
  const tmp = mkdtempSync(join(tmpdir(), "md2vid-skill-stale-"));
  try {
    cpSync(SKILL_ROOT, tmp, { recursive: true });
    const skillFile = join(tmp, "SKILL.md");
    writeFileSync(skillFile, readFileSync(skillFile, "utf8") + "\nRun scripts/audio.mjs.\n");
    assert.throws(() => validateSkillTree(tmp), /stale guidance/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("installed skill validation rejects package template paths for every framework", () => {
  for (const packagePath of [
    "frameworks/hyperframes/templates/frame-template.html",
    "frameworks/remotion/templates/src/theme.ts",
  ]) {
    const tmp = mkdtempSync(join(tmpdir(), "md2vid-skill-template-"));
    try {
      cpSync(SKILL_ROOT, tmp, { recursive: true });
      const skillFile = join(tmp, "SKILL.md");
      writeFileSync(skillFile, readFileSync(skillFile, "utf8") + `\nUse ${packagePath}.\n`);
      assert.throws(() => validateSkillTree(tmp), /stale guidance/, packagePath);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});

test("installed skill validation accepts generated-project paths", () => {
  const tmp = mkdtempSync(join(tmpdir(), "md2vid-skill-generated-"));
  try {
    cpSync(SKILL_ROOT, tmp, { recursive: true });
    const skillFile = join(tmp, "SKILL.md");
    writeFileSync(
      skillFile,
      readFileSync(skillFile, "utf8") +
        "\nUse .hyperframes/caption-skin.html, compositions/frames/, src/theme.ts, and src/scenes/.\n",
    );
    assert.doesNotThrow(() => validateSkillTree(tmp));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("reference drift fails with the synchronization command", () => {
  const tmp = mkdtempSync(join(tmpdir(), "md2vid-skill-drift-"));
  try {
    cpSync(REPO_ROOT, tmp, { recursive: true, filter: (src) => !src.includes("node_modules") && !src.includes(".git") });
    const target = join(tmp, SKILL_REFERENCE_MAP[0].destinationFromRoot);
    writeFileSync(target, readFileSync(target, "utf8") + "\ndrift\n");
    assert.throws(
      () => assertSkillReferencesEqual(tmp),
      /npm run sync:skill-references/,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("SKILL.md uses only skill-root-relative mandatory standard paths", () => {
  const body = readFileSync(join(SKILL_ROOT, "SKILL.md"), "utf8");
  for (const entry of SKILL_REFERENCE_MAP) assert.match(body, new RegExp(entry.destination.replaceAll("/", "\\/")));
  assert.doesNotMatch(body, /docs\/standards\//);
  assert.doesNotMatch(body, /@\.\.\/\.\.\/docs/);
});
