import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  evaluateAuditPolicy,
  normalizeAuditReport,
  runAuditPolicy,
  type AuditException,
  type AuditFinding,
  type AuditProcessResult,
} from "../../scripts/check_audit_policy.ts";

const NOW = new Date("2026-07-22T12:34:56Z");
const HIGH_ADVISORY = "GHSA-2345-6789-CFGH";
const CRITICAL_ADVISORY = "GHSA-3456-789C-FGHJ";

function auditReport(vulnerabilities: Record<string, unknown>): Record<string, unknown> {
  return { auditReportVersion: 2, vulnerabilities };
}

function vulnerability(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "dep",
    severity: "high",
    range: "<1.2.3",
    via: [{
      severity: "high",
      range: "<1.2.3",
      url: `https://github.com/advisories/${HIGH_ADVISORY}`,
    }],
    ...overrides,
  };
}

function finding(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    advisory: HIGH_ADVISORY,
    package: "dep",
    vulnerableRange: "<1.2.3",
    severity: "high",
    ...overrides,
  };
}

function exception(overrides: Partial<AuditException> = {}): AuditException {
  return {
    ...finding(),
    severity: "high",
    reason: "No patched transitive version is currently available",
    owner: "therealhieu",
    expires: "2026-08-31",
    ...overrides,
  };
}

function temporaryDirectory(t: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), "md2vid-audit-policy-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("normalizes canonical GHSA URL and ID runtime findings with fallbacks", () => {
  const report = auditReport({
    zed: vulnerability({
      name: "zed",
      severity: "critical",
      range: "<=4.0.0",
      via: [
        { id: CRITICAL_ADVISORY, severity: "critical" },
        { url: `https://github.com/advisories/${CRITICAL_ADVISORY}`, range: "<=4.0.0" },
        "dep",
      ],
    }),
    dep: vulnerability(),
  });

  assert.deepEqual(normalizeAuditReport(report), [
    finding(),
    {
      advisory: CRITICAL_ADVISORY,
      package: "zed",
      vulnerableRange: "<=4.0.0",
      severity: "critical",
    },
  ]);
});

test("deduplicates exact advisory package range tuples deterministically", () => {
  const report = auditReport({
    dep: vulnerability({
      via: [
        { url: `https://github.com/advisories/${HIGH_ADVISORY}`, severity: "high", range: "<1.2.3" },
        { id: HIGH_ADVISORY, severity: "high", range: "<1.2.3" },
      ],
    }),
  });
  assert.deepEqual(normalizeAuditReport(report), [finding()]);
});

test("requires matching canonical advisory ID and URL when both are present", () => {
  assert.throws(
    () => normalizeAuditReport(auditReport({
      dep: vulnerability({
        via: [{
          id: HIGH_ADVISORY,
          url: `https://github.com/advisories/${CRITICAL_ADVISORY}`,
          severity: "high",
          range: "<1.2.3",
        }],
      }),
    })),
    /conflicting canonical GHSA advisory ID and URL/,
  );

  assert.deepEqual(normalizeAuditReport(auditReport({
    dep: vulnerability({
      via: [{
        id: HIGH_ADVISORY,
        url: `https://github.com/advisories/${HIGH_ADVISORY}`,
        severity: "high",
        range: "<1.2.3",
      }],
    }),
  })), [finding()]);
});

test("rejects either invalid side of a structured advisory ID and URL pair", () => {
  for (const via of [
    {
      id: HIGH_ADVISORY,
      url: "https://example.com/not-a-ghsa",
      severity: "high",
      range: "<1.2.3",
    },
    {
      id: "CVE-2026-1234",
      url: `https://github.com/advisories/${HIGH_ADVISORY}`,
      severity: "high",
      range: "<1.2.3",
    },
  ]) {
    assert.throws(
      () => normalizeAuditReport(auditReport({ dep: vulnerability({ via: [via] }) })),
      /invalid npm audit finding.*canonical GHSA advisory/,
    );
  }
});

test("normalizes matching lowercase advisory ID and URL to uppercase", () => {
  assert.deepEqual(normalizeAuditReport(auditReport({
    dep: vulnerability({
      via: [{
        id: HIGH_ADVISORY.toLowerCase(),
        url: `https://github.com/advisories/${HIGH_ADVISORY.toLowerCase()}`,
        severity: "high",
        range: "<1.2.3",
      }],
    }),
  })), [finding()]);
});

test("rejects unknown object, missing advisory identity, and non-GHSA via entries", () => {
  for (const via of [
    {},
    { title: "advisory without URL or ID", severity: "high", range: "<1" },
    { url: "https://example.com/advisory", severity: "high", range: "<1" },
  ]) {
    assert.throws(
      () => normalizeAuditReport(auditReport({ dep: vulnerability({ via: [via] }) })),
      /canonical GHSA advisory/,
    );
  }
});

test("rejects empty via for a vulnerability and unresolved or cyclic propagation strings", () => {
  assert.throws(
    () => normalizeAuditReport(auditReport({ dep: vulnerability({ via: [] }) })),
    /empty via/,
  );
  assert.throws(
    () => normalizeAuditReport(auditReport({ dep: vulnerability({ via: ["missing"] }) })),
    /unresolved audit vulnerability propagation.*missing/,
  );
  assert.throws(
    () => normalizeAuditReport(auditReport({
      first: vulnerability({ via: ["second"] }),
      second: vulnerability({ via: ["first"] }),
    })),
    /cyclic audit vulnerability propagation/,
  );
});

test("accepts string propagation only when it resolves to a direct canonical advisory", () => {
  const report = auditReport({
    direct: vulnerability({ name: "direct" }),
    parent: vulnerability({ name: "parent", via: ["direct"] }),
  });
  assert.deepEqual(normalizeAuditReport(report), [finding({ package: "direct" })]);
});

test("rejects failed invalid and unsupported audit report shapes", () => {
  for (const invalid of [
    null,
    {},
    { auditReportVersion: 1, vulnerabilities: {} },
    { auditReportVersion: 2 },
    { auditReportVersion: 2, vulnerabilities: [] },
    { auditReportVersion: 2, vulnerabilities: {}, error: { code: "ENETWORK" } },
  ]) {
    assert.throws(() => normalizeAuditReport(invalid), /invalid or failed v2 report/);
  }
});

test("rejects malformed normalized advisory objects instead of silently blessing them", () => {
  for (const invalidVia of [
    { id: "GHSA-1111-1111-1111", severity: "high", range: "<1" },
    { url: `https://example.com/${HIGH_ADVISORY}`, severity: "high", range: "<1" },
    { id: HIGH_ADVISORY, severity: "unknown", range: "<1" },
    { id: HIGH_ADVISORY, severity: "high", range: "" },
  ]) {
    assert.throws(
      () => normalizeAuditReport(auditReport({ dep: vulnerability({ via: [invalidVia] }) })),
      /invalid npm audit finding/,
    );
  }
});

test("unapproved high and critical findings fail in deterministic order", () => {
  const result = evaluateAuditPolicy([
    finding({ advisory: CRITICAL_ADVISORY, package: "zdep", severity: "critical" }),
    finding(),
  ], [], NOW);
  assert.deepEqual(result.unapproved, [finding(), finding({ advisory: CRITICAL_ADVISORY, package: "zdep", severity: "critical" })]);
});

test("info moderate and low findings remain informational and nonblocking", () => {
  const result = evaluateAuditPolicy([
    finding({ advisory: "GHSA-3456-789C-FGHJ", severity: "info" }),
    finding({ advisory: "GHSA-4567-89CF-GHJM", severity: "low" }),
    finding({ advisory: "GHSA-5678-9CFG-HJMP", severity: "moderate" }),
  ], [], NOW);
  assert.deepEqual(result, { unapproved: [], expired: [], stale: [], malformed: [] });
});

test("one exact valid unexpired exception approves each blocking finding", () => {
  assert.deepEqual(evaluateAuditPolicy([finding()], [exception()], NOW), {
    unapproved: [], expired: [], stale: [], malformed: [],
  });
});

test("expiry today and exactly 90 days away are valid boundaries", () => {
  for (const expires of ["2026-07-22", "2026-10-20"]) {
    assert.deepEqual(evaluateAuditPolicy([finding()], [exception({ expires })], NOW), {
      unapproved: [], expired: [], stale: [], malformed: [],
    });
  }
});

test("expired exceptions fail and no longer approve findings", () => {
  const expired = exception({ expires: "2026-07-21" });
  const result = evaluateAuditPolicy([finding()], [expired], NOW);
  assert.deepEqual(result.expired, [expired]);
  assert.deepEqual(result.unapproved, [finding()]);
});

test("exceptions beyond 90 days are malformed and do not approve findings", () => {
  const result = evaluateAuditPolicy([finding()], [exception({ expires: "2026-10-21" })], NOW);
  assert.equal(result.malformed.length, 1);
  assert.match(result.malformed[0]!, /expires.*90 days/);
  assert.deepEqual(result.unapproved, [finding()]);
});

test("valid exceptions unmatched by current blocking findings are stale", () => {
  const stale = exception({ advisory: CRITICAL_ADVISORY });
  assert.deepEqual(evaluateAuditPolicy([], [stale], NOW).stale, [stale]);
});

test("duplicate exact exception tuples are malformed and cannot approve", () => {
  const result = evaluateAuditPolicy([finding()], [exception(), exception({ reason: "Second duplicate justification" })], NOW);
  assert.equal(result.malformed.length, 1);
  assert.match(result.malformed[0]!, /duplicate.*GHSA-2345-6789-CFGH\|dep\|<1\.2\.3\|high/);
  assert.deepEqual(result.unapproved, [finding()]);
});

test("malformed GHSA date owner reason and severity fields fail", () => {
  const invalid: unknown[] = [
    {},
    { ...exception(), package: "" },
    { ...exception(), vulnerableRange: "" },
    exception({ advisory: "GHSA-1111-1111-1111" }),
    exception({ expires: "2026-02-30" }),
    exception({ expires: "2026-7-22" }),
    exception({ owner: "bad owner" }),
    exception({ owner: "" }),
    exception({ reason: "   " }),
    { ...exception(), severity: "moderate" },
  ];
  const result = evaluateAuditPolicy([], invalid, NOW);
  assert.equal(result.malformed.length, invalid.length);
  assert.deepEqual(result.stale, []);
});

test("active exception reasons reject mutable HyperFrames root pins", () => {
  const pinned = exception({
    reason: "Current path: hyperframes@0.7.26 -> dep. Remove after upstream remediation.",
  });
  const result = evaluateAuditPolicy([finding()], [pinned], NOW);
  assert.equal(result.malformed.length, 1);
  assert.match(result.malformed[0]!, /reason must not pin the md2vid HyperFrames version/);
  assert.deepEqual(result.unapproved, [finding()]);
});

test("package range and severity mismatches leave a finding unapproved and exception stale", () => {
  for (const mismatch of [
    exception({ package: "other" }),
    exception({ vulnerableRange: "<1.2.4" }),
    exception({ advisory: CRITICAL_ADVISORY }),
  ]) {
    const result = evaluateAuditPolicy([finding()], [mismatch], NOW);
    assert.deepEqual(result.unapproved, [finding()]);
    assert.deepEqual(result.stale, [mismatch]);
  }
});

test("policy result categories and entries have deterministic ordering", () => {
  const result = evaluateAuditPolicy(
    [finding({ package: "z" }), finding({ package: "a" })],
    [exception({ package: "y" }), exception({ package: "b" })],
    NOW,
  );
  assert.deepEqual(result.unapproved.map((item) => item.package), ["a", "z"]);
  assert.deepEqual(result.stale.map((item) => item.package), ["b", "y"]);
});

test("runAuditPolicy accepts status 0 and status 1 only when report contents explain them", () => {
  const clean: AuditProcessResult = {
    status: 0,
    stdout: JSON.stringify(auditReport({})),
    stderr: "",
    error: undefined,
  };
  assert.equal(runAuditPolicy({ audit: () => clean, readExceptions: () => [], now: NOW, log: () => undefined }), 0);

  const findingExit: AuditProcessResult = {
    status: 1,
    stdout: JSON.stringify(auditReport({ dep: vulnerability() })),
    stderr: "",
    error: undefined,
  };
  const messages: string[] = [];
  assert.equal(runAuditPolicy({
    audit: () => findingExit,
    readExceptions: () => [exception()],
    now: NOW,
    log: (message) => messages.push(message),
  }), 0);
  assert.match(messages.at(-1)!, /OK \[security:audit\]: 1 approved, 0 informational/);

  const unexplained: AuditProcessResult = {
    status: 1,
    stdout: JSON.stringify(auditReport({})),
    stderr: "audit command failed",
    error: undefined,
  };
  assert.throws(
    () => runAuditPolicy({ audit: () => unexplained, readExceptions: () => [], now: NOW, log: () => undefined }),
    /status 1 without vulnerability findings/,
  );
});

test("runAuditPolicy rejects unsupported numeric exits and process or network failures", () => {
  for (const status of [2, 126, 127]) {
    const failed: AuditProcessResult = {
      status,
      stdout: JSON.stringify(auditReport({ dep: vulnerability() })),
      stderr: "command failure",
      error: undefined,
    };
    assert.throws(
      () => runAuditPolicy({ audit: () => failed, readExceptions: () => [exception()], now: NOW, log: () => undefined }),
      new RegExp(`unsupported exit status ${status}`),
    );
  }

  for (const failed of [
    { status: null, stdout: "", stderr: "spawn failed", error: new Error("ENOENT") },
    { status: 1, stdout: "", stderr: "ENETWORK", error: undefined },
    { status: 1, stdout: "not-json", stderr: "", error: undefined },
  ] satisfies AuditProcessResult[]) {
    assert.throws(() => runAuditPolicy({ audit: () => failed, readExceptions: () => [], now: NOW, log: () => undefined }), /npm audit failed|invalid JSON|no JSON report/);
  }
});

test("runAuditPolicy validates the exception file is an array", () => {
  const clean: AuditProcessResult = { status: 0, stdout: JSON.stringify(auditReport({})), stderr: "", error: undefined };
  assert.throws(
    () => runAuditPolicy({ audit: () => clean, readExceptions: () => ({}) as never, now: NOW, log: () => undefined }),
    /exceptions.*array/,
  );
});

test("CLI fixture reports informational findings and exact success counts", (t) => {
  const directory = temporaryDirectory(t);
  mkdirSync(join(directory, "security"));
  writeFileSync(join(directory, "security", "audit-exceptions.json"), JSON.stringify([exception()]));
  writeFileSync(join(directory, "report.json"), JSON.stringify(auditReport({
    dep: vulnerability(),
    moderate: vulnerability({
      name: "moderate",
      severity: "moderate",
      range: "<2",
      via: [{ id: "GHSA-5678-9CFG-HJMP", severity: "moderate", range: "<2" }],
    }),
    info: vulnerability({
      name: "info",
      severity: "info",
      range: "<3",
      via: [{ id: "GHSA-6789-CFGH-JMPQ", severity: "info", range: "<3" }],
    }),
  })));

  const result = spawnSync(process.execPath, [join(process.cwd(), "scripts", "check_audit_policy.ts")], {
    cwd: directory,
    env: { ...process.env, MD2VID_AUDIT_REPORT: join(directory, "report.json") },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /INFO \[security:audit\]: GHSA-5678-9CFG-HJMP\|moderate\|<2\|moderate/);
  assert.match(result.stdout, /INFO \[security:audit\]: GHSA-6789-CFGH-JMPQ\|info\|<3\|info/);
  assert.match(result.stdout, /OK \[security:audit\]: 1 approved, 2 informational/);
});

test("CLI fixtures fail closed for invalid JSON report errors and invalid exception JSON", (t) => {
  const directory = temporaryDirectory(t);
  mkdirSync(join(directory, "security"));
  const reportPath = join(directory, "report.json");
  const exceptionsPath = join(directory, "security", "audit-exceptions.json");
  const script = join(process.cwd(), "scripts", "check_audit_policy.ts");

  const fixtures = [
    { report: "{", exceptions: "[]", expected: /invalid JSON/ },
    { report: JSON.stringify({ auditReportVersion: 2, vulnerabilities: {}, error: { code: "ENETWORK" } }), exceptions: "[]", expected: /invalid or failed v2 report/ },
    { report: JSON.stringify(auditReport({})), exceptions: "{", expected: /exceptions.*invalid JSON/ },
    { report: JSON.stringify(auditReport({})), exceptions: "{}", expected: /exceptions.*array/ },
  ];

  for (const fixture of fixtures) {
    writeFileSync(reportPath, fixture.report);
    writeFileSync(exceptionsPath, fixture.exceptions);
    const result = spawnSync(process.execPath, [script], {
      cwd: directory,
      env: { ...process.env, MD2VID_AUDIT_REPORT: reportPath },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, fixture.expected);
  }
});

test("CLI prints precise malformed expired stale and unapproved tuples", (t) => {
  const directory = temporaryDirectory(t);
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 30);
  const validFutureDate = future.toISOString().slice(0, 10);
  mkdirSync(join(directory, "security"));
  writeFileSync(join(directory, "report.json"), JSON.stringify(auditReport({ dep: vulnerability() })));
  writeFileSync(join(directory, "security", "audit-exceptions.json"), JSON.stringify([
    exception({ expires: "2000-01-01" }),
    exception({ advisory: CRITICAL_ADVISORY, expires: validFutureDate }),
    exception({ advisory: "bad", expires: validFutureDate }),
  ]));
  const result = spawnSync(process.execPath, [join(process.cwd(), "scripts", "check_audit_policy.ts")], {
    cwd: directory,
    env: { ...process.env, MD2VID_AUDIT_REPORT: join(directory, "report.json") },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /UNAPPROVED.*GHSA-2345-6789-CFGH\|dep\|<1\.2\.3\|high/);
  assert.match(result.stderr, /EXPIRED.*GHSA-2345-6789-CFGH\|dep\|<1\.2\.3\|high/);
  assert.match(result.stderr, /STALE.*GHSA-3456-789C-FGHJ\|dep\|<1\.2\.3\|high/);
  assert.match(result.stderr, /MALFORMED.*bad\|dep\|<1\.2\.3\|high/);
});
