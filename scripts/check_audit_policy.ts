#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isMainModule } from "./main-guard.ts";

export type BlockingSeverity = "high" | "critical";
export interface AuditFinding {
  advisory: string;
  package: string;
  vulnerableRange: string;
  severity: BlockingSeverity | "moderate" | "low" | "info";
}
export interface AuditException extends AuditFinding {
  severity: BlockingSeverity;
  reason: string;
  owner: string;
  expires: string;
}
export interface PolicyResult {
  unapproved: AuditFinding[];
  expired: AuditException[];
  stale: AuditException[];
  malformed: string[];
}
export interface AuditProcessResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error: Error | undefined;
}

export interface RunAuditPolicyOptions {
  audit: () => AuditProcessResult;
  readExceptions: () => unknown;
  now: Date;
  log: (message: string) => void;
}

const GHSA_ID = /^GHSA-[23456789CFGHJMPQRVWX]{4}-[23456789CFGHJMPQRVWX]{4}-[23456789CFGHJMPQRVWX]{4}$/;
const GHSA_URL = /^https:\/\/github\.com\/advisories\/(GHSA-[23456789CFGHJMPQRVWX]{4}-[23456789CFGHJMPQRVWX]{4}-[23456789CFGHJMPQRVWX]{4})\/?$/i;
const SEVERITIES = new Set<AuditFinding["severity"]>(["critical", "high", "moderate", "low", "info"]);
const BLOCKING = new Set<AuditFinding["severity"]>(["critical", "high"]);
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\/[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}))?$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const severityRank: Record<AuditFinding["severity"], number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  low: 3,
  info: 4,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tuple(value: Pick<AuditFinding, "advisory" | "package" | "vulnerableRange" | "severity">): string {
  return `${value.advisory}|${value.package}|${value.vulnerableRange}|${value.severity}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareFindings(left: AuditFinding, right: AuditFinding): number {
  return compareText(tuple(left), tuple(right));
}

function canonicalAdvisory(via: Record<string, unknown>): string {
  const hasId = Object.hasOwn(via, "id");
  const hasUrl = Object.hasOwn(via, "url");
  let id: string | undefined;
  let urlId: string | undefined;

  if (hasId) {
    if (typeof via.id !== "string" || !GHSA_ID.test(via.id.toUpperCase())) {
      throw new Error("invalid npm audit finding: advisory ID must be a canonical GHSA advisory");
    }
    id = via.id.toUpperCase();
  }
  if (hasUrl) {
    if (typeof via.url !== "string") {
      throw new Error("invalid npm audit finding: advisory URL must contain a canonical GHSA advisory");
    }
    const match = GHSA_URL.exec(via.url);
    if (!match) throw new Error("invalid npm audit finding: advisory URL must contain a canonical GHSA advisory");
    urlId = match[1]!.toUpperCase();
  }
  if (id && urlId && id !== urlId) {
    throw new Error(`invalid npm audit finding: conflicting canonical GHSA advisory ID and URL (${id} != ${urlId})`);
  }
  if (id || urlId) return id ?? urlId!;
  throw new Error("invalid npm audit finding: object-valued via entry must contain a canonical GHSA advisory URL or ID");
}

function validatePropagation(
  packageName: string,
  vulnerabilities: Record<string, unknown>,
  stack: Set<string> = new Set(),
): void {
  if (stack.has(packageName)) {
    throw new Error(`cyclic audit vulnerability propagation: ${[...stack, packageName].join(" -> ")}`);
  }
  const value = vulnerabilities[packageName];
  if (!isRecord(value) || !Array.isArray(value.via)) {
    throw new Error(`unresolved audit vulnerability propagation: ${packageName}`);
  }
  if (value.via.length === 0) {
    throw new Error(`npm audit vulnerability ${packageName} has empty via`);
  }

  const nextStack = new Set(stack).add(packageName);
  for (const viaValue of value.via) {
    if (typeof viaValue === "string") {
      validatePropagation(viaValue, vulnerabilities, nextStack);
    } else if (isRecord(viaValue)) {
      canonicalAdvisory(viaValue);
    } else {
      throw new Error(`invalid npm audit finding for package ${packageName}`);
    }
  }
}

export function normalizeAuditReport(input: unknown): AuditFinding[] {
  if (!isRecord(input)
    || input.auditReportVersion !== 2
    || !isRecord(input.vulnerabilities)
    || Object.hasOwn(input, "error")) {
    throw new Error("npm audit returned an invalid or failed v2 report");
  }

  for (const key of Object.keys(input.vulnerabilities)) {
    validatePropagation(key, input.vulnerabilities);
  }

  const findings: AuditFinding[] = [];
  for (const [key, value] of Object.entries(input.vulnerabilities)) {
    if (!isRecord(value) || !Array.isArray(value.via)) {
      throw new Error(`invalid npm audit finding for package ${key}`);
    }
    for (const viaValue of value.via) {
      if (typeof viaValue === "string") continue;
      if (!isRecord(viaValue)) throw new Error(`invalid npm audit finding for package ${key}`);
      const advisory = canonicalAdvisory(viaValue);
      const packageName = value.name;
      const vulnerableRange = viaValue.range ?? value.range;
      const severity = viaValue.severity ?? value.severity;
      if (typeof packageName !== "string" || packageName.trim() === ""
        || typeof vulnerableRange !== "string" || vulnerableRange.trim() === ""
        || typeof severity !== "string" || !SEVERITIES.has(severity as AuditFinding["severity"])) {
        throw new Error(`invalid npm audit finding ${advisory}|${String(packageName)}|${String(vulnerableRange)}|${String(severity)}`);
      }
      findings.push({
        advisory,
        package: packageName,
        vulnerableRange,
        severity: severity as AuditFinding["severity"],
      });
    }
  }

  findings.sort((left, right) => {
    const identity = compareText(
      `${left.advisory}|${left.package}|${left.vulnerableRange}`,
      `${right.advisory}|${right.package}|${right.vulnerableRange}`,
    );
    return identity || severityRank[left.severity] - severityRank[right.severity];
  });
  const deduplicated = new Map<string, AuditFinding>();
  for (const finding of findings) {
    const identity = `${finding.advisory}|${finding.package}|${finding.vulnerableRange}`;
    if (!deduplicated.has(identity)) deduplicated.set(identity, finding);
  }
  return [...deduplicated.values()].sort(compareFindings);
}

function parseCalendarDate(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return timestamp;
}

function utcToday(now: Date): number {
  if (Number.isNaN(now.getTime())) throw new Error("policy evaluation requires a valid current date");
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function validateException(value: unknown, today: number): { exception?: AuditException; error?: string } {
  const renderedTuple = isRecord(value)
    ? `${String(value.advisory)}|${String(value.package)}|${String(value.vulnerableRange)}|${String(value.severity)}`
    : String(value);
  if (!isRecord(value)) return { error: `invalid exception ${renderedTuple}: expected an object` };
  if (typeof value.advisory !== "string" || !GHSA_ID.test(value.advisory)) {
    return { error: `invalid exception ${renderedTuple}: advisory must be a canonical uppercase GHSA ID` };
  }
  if (typeof value.package !== "string" || value.package.trim() === "" || value.package !== value.package.trim()) {
    return { error: `invalid exception ${renderedTuple}: package must be non-empty` };
  }
  if (typeof value.vulnerableRange !== "string" || value.vulnerableRange.trim() === "" || value.vulnerableRange !== value.vulnerableRange.trim()) {
    return { error: `invalid exception ${renderedTuple}: vulnerableRange must be non-empty` };
  }
  if (value.severity !== "high" && value.severity !== "critical") {
    return { error: `invalid exception ${renderedTuple}: severity must be high or critical` };
  }
  if (typeof value.reason !== "string" || value.reason.trim() === "" || value.reason !== value.reason.trim()) {
    return { error: `invalid exception ${renderedTuple}: reason must be a non-empty trimmed string` };
  }
  if (typeof value.owner !== "string" || !OWNER.test(value.owner)) {
    return { error: `invalid exception ${renderedTuple}: owner must be a GitHub login or owner/team slug` };
  }
  if (typeof value.expires !== "string") {
    return { error: `invalid exception ${renderedTuple}: expires must use YYYY-MM-DD` };
  }
  const expiry = parseCalendarDate(value.expires);
  if (expiry === undefined) {
    return { error: `invalid exception ${renderedTuple}: expires must be a valid YYYY-MM-DD calendar date` };
  }
  if (expiry - today > 90 * DAY_MS) {
    return { error: `invalid exception ${renderedTuple}: expires more than 90 days from now` };
  }
  return { exception: value as unknown as AuditException };
}

export function evaluateAuditPolicy(findings: AuditFinding[], exceptions: unknown[], now: Date): PolicyResult {
  const today = utcToday(now);
  const blocking = findings.filter((finding) => BLOCKING.has(finding.severity)).sort(compareFindings);
  const validated: AuditException[] = [];
  const malformed: string[] = [];

  for (const value of exceptions) {
    const result = validateException(value, today);
    if (result.exception) validated.push(result.exception);
    else malformed.push(result.error!);
  }

  const counts = new Map<string, number>();
  for (const item of validated) counts.set(tuple(item), (counts.get(tuple(item)) ?? 0) + 1);
  const duplicateTuples = new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
  for (const key of duplicateTuples) malformed.push(`duplicate exception tuple ${key}`);

  const usable = validated.filter((item) => !duplicateTuples.has(tuple(item)));
  const expired = usable.filter((item) => parseCalendarDate(item.expires)! < today).sort(compareFindings);
  const active = usable.filter((item) => parseCalendarDate(item.expires)! >= today);
  const blockingTuples = new Set(blocking.map(tuple));
  const stale = active.filter((item) => !blockingTuples.has(tuple(item))).sort(compareFindings);
  const approvals = new Set(active.filter((item) => blockingTuples.has(tuple(item))).map(tuple));
  const unapproved = blocking.filter((item) => !approvals.has(tuple(item)));

  return {
    unapproved,
    expired,
    stale,
    malformed: malformed.sort(compareText),
  };
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} contains invalid JSON: ${detail}`);
  }
}

function defaultAudit(): AuditProcessResult {
  const fixture = process.env.MD2VID_AUDIT_REPORT;
  if (fixture) {
    return { status: 0, stdout: readFileSync(resolve(fixture), "utf8"), stderr: "", error: undefined };
  }
  const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
  };
}

function defaultReadExceptions(): unknown {
  const path = resolve("security", "audit-exceptions.json");
  return parseJson(readFileSync(path, "utf8"), "audit exceptions file");
}

export function runAuditPolicy(options: RunAuditPolicyOptions = {
  audit: defaultAudit,
  readExceptions: defaultReadExceptions,
  now: new Date(),
  log: console.log,
}): number {
  const result = options.audit();
  if (result.error || result.status === null) {
    const detail = result.error?.message ?? (result.stderr.trim() || "unknown process failure");
    throw new Error(`npm audit failed to execute: ${detail}`);
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`npm audit failed with unsupported exit status ${result.status}${result.stderr.trim() ? `: ${result.stderr.trim()}` : ""}`);
  }
  if (result.stdout.trim() === "") {
    throw new Error(`npm audit returned no JSON report${result.stderr.trim() ? `: ${result.stderr.trim()}` : ""}`);
  }
  const findings = normalizeAuditReport(parseJson(result.stdout, "npm audit report"));
  if (result.status === 1 && findings.length === 0) {
    throw new Error(`npm audit exited with status 1 without vulnerability findings${result.stderr.trim() ? `: ${result.stderr.trim()}` : ""}`);
  }
  const exceptionInput = options.readExceptions();
  if (!Array.isArray(exceptionInput)) throw new Error("audit exceptions file must contain an array");
  const policy = evaluateAuditPolicy(findings, exceptionInput, options.now);
  const informational = findings.filter((finding) => !BLOCKING.has(finding.severity));
  for (const item of informational) options.log(`INFO [security:audit]: ${tuple(item)}`);

  const failures = [
    ...policy.malformed.map((message) => `MALFORMED [security:audit]: ${message}`),
    ...policy.expired.map((item) => `EXPIRED [security:audit]: ${tuple(item)}`),
    ...policy.stale.map((item) => `STALE [security:audit]: ${tuple(item)}`),
    ...policy.unapproved.map((item) => `UNAPPROVED [security:audit]: ${tuple(item)}`),
  ];
  if (failures.length > 0) throw new Error(failures.join("\n"));

  const blockingCount = findings.length - informational.length;
  options.log(`OK [security:audit]: ${blockingCount} approved, ${informational.length} informational`);
  return 0;
}

if (isMainModule(import.meta.url)) {
  try {
    process.exitCode = runAuditPolicy();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
