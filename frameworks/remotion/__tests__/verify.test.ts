import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verify } from "../verify.ts";

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
