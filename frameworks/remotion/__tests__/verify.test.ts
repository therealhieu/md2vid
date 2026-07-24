import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verify, verifyRemotionCaptionArtifact } from "../verify.ts";

function goodProject(): string {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-verify-"));
  mkdirSync(join(tmp, "src"), { recursive: true });
  writeFileSync(join(tmp, "src", "Root.tsx"), 'id="video"\n');
  writeFileSync(join(tmp, "build_plan.json"),
    JSON.stringify({ version: 1, totalDuration: 2, canvas: { width: 1920, height: 1080 },
      timing: { tail: 0.5, xfade: 0.5, gap: 0.5 }, frames: [{ id: "01" }], captionGroups: [] }) + "\n");
  return tmp;
}

test("verify passes a well-formed remotion project", () => {
  const dir = goodProject();
  try {
    const findings = verify(dir);
    assert.deepEqual(findings.filter((f) => f.level === "error"), [], "no errors on a good project");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify flags a missing build_plan.json", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-verify-bad-"));
  mkdirSync(join(tmp, "src"), { recursive: true });
  writeFileSync(join(tmp, "src", "Root.tsx"), 'id="video"\n');
  try {
    const errs = verify(tmp).filter((f) => f.level === "error");
    const message = errs.map((finding) => finding.msg).join("\n");
    assert.match(message, /md2vid build <dir>/);
    assert.doesNotMatch(message, /scripts\/build\.ts/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("focused caption verification reports missing and malformed staged plans", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-caption-verify-"));
  try {
    const sharedDir = join(tmp, "shared");
    const outputDir = join(tmp, "remotion");
    mkdirSync(sharedDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    const captionGroupsPath = join(sharedDir, "caption_groups.json");
    writeFileSync(captionGroupsPath, JSON.stringify({ groups: [] }));

    let messages = verifyRemotionCaptionArtifact({ sharedDir, outputDir, captionGroupsPath })
      .filter((finding) => finding.level === "error")
      .map((finding) => finding.msg);
    assert.ok(messages.some((message) => message.includes("missing staged build_plan.json")), JSON.stringify(messages));

    writeFileSync(join(outputDir, "build_plan.json"), "{bad json");
    messages = verifyRemotionCaptionArtifact({ sharedDir, outputDir, captionGroupsPath })
      .filter((finding) => finding.level === "error")
      .map((finding) => finding.msg);
    assert.ok(messages.some((message) => message.includes("not valid JSON")), JSON.stringify(messages));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("focused caption verification detects mismatched staged groups", () => {
  const tmp = mkdtempSync(join(tmpdir(), "remotion-caption-verify-match-"));
  try {
    const sharedDir = join(tmp, "shared");
    const outputDir = join(tmp, "remotion");
    mkdirSync(sharedDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    const captionGroupsPath = join(sharedDir, "custom-caption-groups.json");
    const groups = [{ id: "g", frame: 1, start: 0, end: 1, text: "hello", words: [] }];
    writeFileSync(captionGroupsPath, JSON.stringify({ groups }));
    writeFileSync(join(outputDir, "build_plan.json"), JSON.stringify({ captionGroups: groups }));

    assert.deepEqual(
      verifyRemotionCaptionArtifact({ sharedDir, outputDir, captionGroupsPath })
        .filter((finding) => finding.level === "error"),
      [],
    );

    writeFileSync(join(outputDir, "build_plan.json"), JSON.stringify({ captionGroups: [] }));
    const messages = verifyRemotionCaptionArtifact({ sharedDir, outputDir, captionGroupsPath })
      .filter((finding) => finding.level === "error")
      .map((finding) => finding.msg);
    assert.ok(messages.some((message) => message.includes("differ in content")), JSON.stringify(messages));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("verify flags a Root.tsx without the expected composition id", () => {
  const dir = goodProject();
  writeFileSync(join(dir, "src", "Root.tsx"), "no id here\n");
  try {
    const errs = verify(dir).filter((f) => f.level === "error");
    assert.ok(errs.some((f) => /composition id/i.test(f.msg)), "missing id is an error");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
