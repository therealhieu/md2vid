#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DEFAULT_NARRATION_POLICY,
  analyzeNarrationRequest,
  validateVersionedNarrationRequest,
  type NarrationFinding,
  type NarrationSentenceApproval,
} from "../engine/narration_request.ts";
import { parseCommand } from "./cli_args.ts";
import { isMainModule } from "./main-guard.ts";

const USAGE = "Usage: md2vid narration-check <dir> [--request <path>] [--allow-long-sentence <line-id>:<sentence-index>]";

function approval(value: string): NarrationSentenceApproval {
  const separator = value.lastIndexOf(":");
  const lineId = value.slice(0, separator);
  const rawIndex = value.slice(separator + 1);
  if (separator <= 0 || !/^\d+$/u.test(rawIndex)) {
    throw new Error(`invalid --allow-long-sentence ${JSON.stringify(value)}; expected <line-id>:<sentence-index>`);
  }
  const sentenceIndex = Number(rawIndex);
  if (!Number.isSafeInteger(sentenceIndex)) {
    throw new Error(`invalid --allow-long-sentence ${JSON.stringify(value)}; expected <line-id>:<sentence-index>`);
  }
  return { lineId, sentenceIndex };
}

function parseArgs(argv: string[]) {
  return parseCommand({
    command: "narration-check",
    usage: USAGE,
    options: {
      request: { type: "string" },
      "allow-long-sentence": { type: "string", multiple: true },
    },
    minPositionals: 1,
    maxPositionals: 1,
  }, argv);
}

function printFinding(prefix: "WARN" | "FAIL", finding: NarrationFinding, output: typeof console.log): void {
  output(`${prefix} [narration] line=${JSON.stringify(finding.lineId)} sentence=${finding.sentenceIndex} words=${finding.wordCount} code=${finding.code}`);
  output(JSON.stringify(finding.excerpt));
  output(finding.guidance);
}

function printOverride(field: "provider" | "voice" | "lang" | "speed", value: string | number): void {
  const defaultValue = DEFAULT_NARRATION_POLICY[field];
  if (value !== defaultValue) {
    console.log(`INFO [narration] override ${field}=${value} (default ${defaultValue})`);
  }
}

export function run(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (parsed.kind === "help") {
    console.log(USAGE);
    return 0;
  }
  if (parsed.kind === "error") {
    console.error(parsed.message);
    console.error(parsed.usage);
    return 2;
  }

  let approvals: NarrationSentenceApproval[];
  try {
    const values = parsed.values["allow-long-sentence"];
    approvals = Array.isArray(values) ? values.map((value) => approval(String(value))) : [];
  } catch (error: unknown) {
    console.error((error as Error).message);
    console.error(USAGE);
    return 2;
  }

  try {
    const projectDir = resolve(parsed.positionals[0]!);
    if (!statSync(projectDir).isDirectory()) throw new Error(`not a directory: ${projectDir}`);
    const requestOption = parsed.values.request;
    const requestPath = typeof requestOption === "string"
      ? resolve(requestOption)
      : join(projectDir, "audio_request.json");
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(requestPath, "utf8"));
    } catch (error: unknown) {
      throw new Error(`${requestPath}: invalid JSON: ${(error as Error).message}`);
    }

    const request = validateVersionedNarrationRequest(raw, requestPath);
    const analysis = analyzeNarrationRequest(request, approvals);

    printOverride("provider", request.provider);
    printOverride("voice", request.voice);
    printOverride("lang", request.lang);
    printOverride("speed", request.speed);
    for (const applied of analysis.appliedApprovals) {
      console.log(`INFO [narration] approved line=${JSON.stringify(applied.lineId)} sentence=${applied.sentenceIndex}`);
    }
    for (const finding of analysis.findings.filter((candidate) => candidate.severity === "warning")) {
      printFinding("WARN", finding, console.log);
    }
    const errors = analysis.findings.filter((candidate) => candidate.severity === "error");
    for (const finding of errors) {
      printFinding("FAIL", finding, console.error);
    }
    if (errors.length > 0) return 1;

    console.log(
      `PASS [narration] ${analysis.lineCount} lines, ${analysis.sentenceCount} sentences, `
      + `provider=${request.provider}, voice=${request.voice}, lang=${request.lang}, speed=${request.speed}`,
    );
    return 0;
  } catch (error: unknown) {
    console.error(`FAIL [narration] ${(error as Error).message}`);
    return 1;
  }
}

if (isMainModule(import.meta.url)) process.exit(run(process.argv.slice(2)));
