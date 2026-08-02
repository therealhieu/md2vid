import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SKILL = join(REPO_ROOT, "skill", "md2vid", "SKILL.md");
const START = "<!-- md2vid-media-contract:start -->";
const END = "<!-- md2vid-media-contract:end -->";

function mediaContract(): string {
  const body = readFileSync(SKILL, "utf8");
  const start = body.indexOf(START);
  const end = body.indexOf(END, start + START.length);
  assert.ok(start >= 0, `missing ${START}`);
  assert.ok(end > start, `missing ${END}`);
  const fenced = body.slice(start + START.length, end).match(/```bash\n([\s\S]*?)\n```/);
  assert.ok(fenced, "media contract must contain one bash fence");
  return fenced[1];
}

interface DoctorCheck {
  name: string;
  ok: boolean;
}

function runContract(input: {
  request: Record<string, unknown>;
  checks: readonly DoctorCheck[];
  voices?: readonly { id: string; label: string }[];
  catalogFails?: boolean;
}) {
  const root = mkdtempSync(join(tmpdir(), "md2vid-skill-media-"));
  const config = join(root, "config");
  const bin = join(root, "bin");
  const capture = join(root, "capture.json");
  mkdirSync(join(config, "skills", "media-use", "audio", "scripts"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(root, "audio_request.json"), `${JSON.stringify(input.request, null, 2)}\n`);
  writeFileSync(
    join(bin, "md2vid"),
    `#!/bin/sh
set -eu
if [ "$1" = "hyperframes" ] && [ "$2" = "doctor" ]; then
  printf '%s\\n' "$FAKE_DOCTOR_JSON"
  exit 0
fi
if [ "$1" = "hyperframes" ] && [ "$2" = "tts" ]; then
  if [ "${input.catalogFails ? "1" : "0"}" = "1" ]; then exit 91; fi
  printf '%s\\n' "$FAKE_VOICES_JSON"
  exit 0
fi
exit 92
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(config, "skills", "media-use", "audio", "scripts", "audio.mjs"),
    `import { writeFileSync } from "node:fs";
writeFileSync(process.env.CAPTURE, JSON.stringify(process.argv.slice(2)));
`,
  );

  const result = spawnSync("bash", ["-c", mediaContract()], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      CLAUDE_CONFIG_DIR: config,
      NARRATION_ROOT: root,
      CAPTURE: capture,
      FAKE_DOCTOR_JSON: JSON.stringify({ checks: input.checks }),
      FAKE_VOICES_JSON: JSON.stringify(input.voices ?? []),
    },
    encoding: "utf8",
  });
  const captured = existsSync(capture) ? JSON.parse(readFileSync(capture, "utf8")) : undefined;
  rmSync(root, { recursive: true, force: true });
  return { ...result, captured, root };
}

const DEFAULT_REQUEST = {
  version: 1,
  provider: "kokoro",
  voice: "am_michael",
  lang: "en",
  speed: 0.9,
  lines: [{ id: "intro", text: "Introduce the topic." }],
};

const ALL_READY = [
  { name: "TTS (Kokoro)", ok: true },
  { name: "FFmpeg", ok: true },
  { name: "FFprobe", ok: true },
];
const MICHAEL = [
  { id: "af_heart", label: "Heart" },
  { id: "am_michael", label: "Michael" },
];

test("portable media contract forwards the resolved default request exactly", () => {
  const result = runContract({ request: DEFAULT_REQUEST, checks: ALL_READY, voices: MICHAEL });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.captured, [
    "--request", join(result.root, "audio_request.json"),
    "--hyperframes", result.root,
    "--out", join(result.root, "audio_meta.json"),
    "--only", "tts",
    "--provider", "kokoro",
    "--voice", "am_michael",
    "--lang", "en",
    "--speed", "0.9",
  ]);
});

test("explicit non-Kokoro overrides skip Kokoro runtime and catalog checks", () => {
  const result = runContract({
    request: { ...DEFAULT_REQUEST, provider: "heygen", voice: "starfish-voice-id", speed: 1 },
    checks: [
      { name: "FFmpeg", ok: true },
      { name: "FFprobe", ok: true },
    ],
    catalogFails: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.captured?.slice(-8), [
    "--provider", "heygen",
    "--voice", "starfish-voice-id",
    "--lang", "en",
    "--speed", "1",
  ]);
});

test("every provider requires both ffmpeg and ffprobe", () => {
  const result = runContract({
    request: { ...DEFAULT_REQUEST, provider: "heygen", voice: "starfish-voice-id" },
    checks: [{ name: "FFmpeg", ok: true }, { name: "FFprobe", ok: false }],
    catalogFails: true,
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.captured, undefined);
  assert.match(result.stderr, /Narration readiness failed: FFprobe/);
});

for (const [name, checks, voices, capability] of [
  ["missing Kokoro runtime", [{ name: "FFmpeg", ok: true }, { name: "FFprobe", ok: true }, { name: "TTS (Kokoro)", ok: false }], MICHAEL, "TTS (Kokoro)"],
  ["missing Michael voice", ALL_READY, [{ id: "af_heart", label: "Heart" }], "voice am_michael"],
] as const) {
  test(`default request fails closed with stable recovery lines when ${name}`, () => {
    const result = runContract({ request: DEFAULT_REQUEST, checks, voices });
    assert.notEqual(result.status, 0);
    assert.equal(result.captured, undefined);
    assert.equal(result.stderr, `Kokoro readiness failed: ${capability}\nPreflight command: md2vid hyperframes doctor --json\nNext step: md2vid hyperframes doctor\nNo system, cloud, or automatic fallback was used.\n`);
  });
}

test("warning review is after narration-check and before the media contract", () => {
  const body = readFileSync(SKILL, "utf8");
  const narrationCheck = body.indexOf("md2vid narration-check");
  const warningReview = body.indexOf("inspect every warning before synthesis", narrationCheck);
  const contract = body.indexOf(START);
  assert.ok(narrationCheck >= 0);
  assert.ok(warningReview > narrationCheck);
  assert.ok(contract > warningReview);
});
