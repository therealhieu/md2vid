import assert from "node:assert/strict";
import test from "node:test";
import { parseCommand } from "../../scripts/cli_args.ts";

const SPEC = {
  command: "build",
  usage: "Usage: md2vid build <output-dir> [--captions-only]",
  options: {
    "captions-only": { type: "boolean" as const },
  },
  minPositionals: 1,
  maxPositionals: 1,
};

test("parses declared options and one positional", () => {
  assert.deepEqual(parseCommand(SPEC, ["demo", "--captions-only"]), {
    kind: "ok",
    values: { "captions-only": true },
    positionals: ["demo"],
  });
});

test("help wins over missing required positionals", () => {
  assert.deepEqual(parseCommand(SPEC, ["--help"]), { kind: "help" });
  assert.deepEqual(parseCommand(SPEC, ["-h"]), { kind: "help" });
});

test("help wins over an incomplete string option", () => {
  assert.deepEqual(parseCommand({
    command: "new",
    usage: "Usage: md2vid new <slug> [--framework <name>]",
    options: { framework: { type: "string" as const } },
    minPositionals: 1,
    maxPositionals: 1,
  }, ["demo", "--framework", "--help"]), { kind: "help" });
});

test("help flags after the option terminator remain positionals", () => {
  for (const flag of ["--help", "-h"]) {
    assert.deepEqual(parseCommand(SPEC, ["--", flag]), {
      kind: "ok",
      values: {},
      positionals: [flag],
    });
  }
});

test("rejects an unknown option using its original spelling", () => {
  const result = parseCommand(SPEC, ["demo", "--captions-onyl"]);
  assert.equal(result.kind, "error");
  if (result.kind !== "error") return;
  assert.match(result.message, /--captions-onyl/);
  assert.equal(result.usage, SPEC.usage);
});

test("rejects excess positionals", () => {
  const result = parseCommand(SPEC, ["one", "two"]);
  assert.equal(result.kind, "error");
  if (result.kind !== "error") return;
  assert.match(result.message, /expected exactly 1 positional argument/);
});

test("rejects missing string option values", () => {
  const result = parseCommand({
    command: "new",
    usage: "Usage: md2vid new <slug> [--framework <name>]",
    options: { framework: { type: "string" as const } },
    minPositionals: 1,
    maxPositionals: 1,
  }, ["demo", "--framework"]);
  assert.equal(result.kind, "error");
  if (result.kind !== "error") return;
  assert.match(result.message, /--framework/);
});

test("parseCommand retains repeated string options", () => {
  const parsed = parseCommand({
    command: "narration-check",
    usage: "usage",
    options: { "allow-long-sentence": { type: "string", multiple: true } },
    minPositionals: 1,
    maxPositionals: 1,
  }, ["project", "--allow-long-sentence", "intro:0", "--allow-long-sentence", "recap:1"]);
  assert.equal(parsed.kind, "ok");
  if (parsed.kind !== "ok") return;
  assert.deepEqual(parsed.values["allow-long-sentence"], ["intro:0", "recap:1"]);
});
