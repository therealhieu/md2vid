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

test("canonical and bundled standards require cue-bound visual timing", () => {
  for (const { label, body } of readSourceAndCopy("docs/standards/video-generation.md")) {
    assert.match(body, /visual_beats\.json/, label);
    assert.match(body, /npm run plan/, label);
    assert.match(body, /--allow-low-fps/, label);
    assertOrder(body, ["transcription", "visual_beats.json", "npm run plan", "cue-bound", "npm run build", "npm run check", "review", "render"], label);
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
  }
  for (const { label, body } of readSourceAndCopy("docs/standards/frameworks/remotion.md")) {
    assert.match(body, /static.*visual_bindings\.json/is, label);
    assert.match(body, /VisualBeatProvider/, label);
    assert.match(body, /BeatReveal/, label);
    assert.match(body, /30 FPS/, label);
  }
  for (const { label, body } of readSourceAndCopy("docs/standards/design/frame-content.md")) {
    assert.match(body, /one registered parent timeline may compose generated and authored child timelines/i, label);
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
