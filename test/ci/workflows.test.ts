import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { isScalar, parseDocument } from "yaml";

const ROOT = resolve(import.meta.dirname, "..", "..");
const WORKFLOW_DIR = join(ROOT, ".github", "workflows");
const workflowPath = (name: string) => join(WORKFLOW_DIR, name);
const workflow = (name: string) => readFileSync(workflowPath(name), "utf8");
const dependabotPath = join(ROOT, ".github", "dependabot.yml");
const actionlintConfigPath = join(ROOT, ".github", "actionlint.yaml");
const packageJson = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as {
  dependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

const MANUAL_DEPENDABOT_FAMILIES = {
  "react-family": ["react", "react-dom"],
  "react-types-family": ["@types/react", "@types/react-dom"],
  "remotion-family": ["remotion", "@remotion/google-fonts", "@remotion/media"],
} as const;

type WorkflowPolicyChecker = (yaml: string) => void;
const WORKFLOW_POLICY_CHECKERS: Record<string, WorkflowPolicyChecker> = {
  "ci.yml": assertSafeWorkflowPolicy,
  "dependabot-auto-merge-observer.yml": assertDependabotObserverPolicy,
  "dependabot-auto-merge.yml": assertDependabotAutoMergePolicy,
  "dependabot-branch-refresh.yml": assertDependabotBranchRefreshPolicy,
  "nightly.yml": assertNightlyPolicy,
  "release.yml": assertReleasePolicy,
  "validate.yml": assertSafeWorkflowPolicy,
};
const EXPECTED_JOB_RUNNERS: Record<string, Record<string, string | null>> = {
  "ci.yml": {
    "resolve-latest-node": "ubuntu-latest",
    "pr-title": "ubuntu-latest",
    "dependency-review": "ubuntu-latest",
    "public-snapshot": null,
    "pr-minimum": null,
    "pr-latest": null,
    "main-full": null,
  },
  "dependabot-auto-merge-observer.yml": {
    "observe-dependabot": "ubuntu-latest",
  },
  "dependabot-auto-merge.yml": {
    "request-auto-merge": "ubuntu-latest",
  },
  "dependabot-branch-refresh.yml": {
    "refresh-one": "ubuntu-latest",
  },
  "nightly.yml": {
    "resolve-latest-node": "ubuntu-latest",
    "native-matrix": null,
  },
  "release.yml": {
    preflight: "ubuntu-latest",
    "obtain-artifact": "ubuntu-latest",
    "verify-artifact": "${{ matrix.runner }}",
    "publish-npm": "ubuntu-latest",
    "verify-registry": "ubuntu-latest",
    "create-github-release": "ubuntu-latest",
  },
  "validate.yml": {
    validate: "${{ inputs.runner }}",
  },
};

type WorkflowRecord = Record<string, unknown>;

function asRecord(value: unknown, label: string): WorkflowRecord {
  assert.equal(
    typeof value === "object" && value !== null && !Array.isArray(value),
    true,
    `${label} must be a mapping`,
  );
  return value as WorkflowRecord;
}

function parseWorkflow(yaml: string): {
  document: ReturnType<typeof parseDocument>;
  value: WorkflowRecord;
} {
  const document = parseDocument(yaml, {
    prettyErrors: true,
    stringKeys: true,
    uniqueKeys: true,
  });
  const diagnostics = [...document.errors, ...document.warnings];
  if (diagnostics.length > 0) {
    throw new Error(
      `workflow YAML parse failed:\n${diagnostics.map((diagnostic) => diagnostic.message).join("\n")}`,
    );
  }

  return {
    document,
    value: asRecord(document.toJS({ maxAliasCount: 100 }), "workflow"),
  };
}

function parsedJob(workflowValue: WorkflowRecord, name: string): WorkflowRecord {
  const jobs = asRecord(workflowValue.jobs, "jobs");
  assert.equal(Object.hasOwn(jobs, name), true, `missing job ${name}`);
  return asRecord(jobs[name], `job ${name}`);
}

function parsedSteps(job: WorkflowRecord, label: string): WorkflowRecord[] {
  assert.equal(Array.isArray(job.steps), true, `${label} steps must be an array`);
  return (job.steps as unknown[]).map((step, index) =>
    asRecord(step, `${label} step ${index + 1}`),
  );
}

function jobBody(yaml: string, name: string, nextName?: string): string {
  const start = yaml.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `missing job ${name}`);
  const end = nextName ? yaml.indexOf(`\n  ${nextName}:\n`, start + 1) : yaml.length;
  return yaml.slice(start, end === -1 ? yaml.length : end);
}

function stepBody(yaml: string, stepName: string): string {
  const marker = `      - name: ${stepName}\n`;
  const start = yaml.indexOf(marker);
  assert.notEqual(start, -1, `missing step ${stepName}`);
  const end = yaml.indexOf("\n      - name:", start + marker.length);
  return yaml.slice(start, end === -1 ? yaml.length : end);
}

function assertPinnedUses(yaml: string): void {
  for (const line of yaml.split("\n").filter((candidate) => /\buses:/.test(candidate))) {
    if (/uses:\s+\.\//.test(line)) continue;
    assert.match(
      line,
      /uses:\s+[^\s@]+@[a-f0-9]{40}\s+#\s+v\d+(?:\.\d+)*\s*$/,
      `third-party action must use a full SHA and version comment: ${line.trim()}`,
    );
  }
}

function actionPins(yaml: string, action: string): string[] {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...yaml.matchAll(
    new RegExp(
      `uses:\\s+${escaped}@([a-f0-9]{40})\\s+#\\s+(v\\d+(?:\\.\\d+)*)\\s*$`,
      "gm",
    ),
  )].map((match) => `${match[1]} ${match[2]}`);
}

function assertConsistentActionPin(
  workflowNames: string[],
  action: string,
): void {
  const pins = workflowNames.flatMap((name) => actionPins(workflow(name), action));
  assert.ok(pins.length > 0, `missing ${action}`);
  assert.equal(
    new Set(pins).size,
    1,
    `${action} must use one immutable SHA and version comment`,
  );
}

function assertCheckoutHardening(yaml: string): void {
  const lines = yaml.split("\n");
  for (const [index, line] of lines.entries()) {
    if (!/uses:\s+actions\/checkout@/.test(line)) continue;
    const nearby = lines.slice(index, index + 5).join("\n");
    assert.match(nearby, /persist-credentials:\s*false/, `checkout is not hardened near line ${index + 1}`);
  }
}

function isBlockScalarHeader(value: string): boolean {
  const scalar = value.trim();
  if (!/^[|>]/.test(scalar)) return false;
  const valid = /^[|>](?:(?:[1-9][+-]?)|(?:[+-][1-9]?))?(?:[ \t]+#.*)?$/;
  if (!valid.test(scalar)) throw new Error(`malformed run block scalar header: ${scalar}`);
  return true;
}

function runBlocks(yaml: string): string[] {
  const lines = yaml.split("\n");
  const blocks: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)run:\s*(.*)$/);
    if (!match) continue;
    const baseIndent = match[1].length;
    const scalar = match[2].trim();
    const block = [lines[index]];
    if (isBlockScalarHeader(scalar)) {
      for (let next = index + 1; next < lines.length; next += 1) {
        const nextLine = lines[next];
        const nextIndent = nextLine.length - nextLine.trimStart().length;
        if (nextLine.trim() !== "" && nextIndent <= baseIndent) break;
        block.push(nextLine);
      }
    }
    blocks.push(block.join("\n"));
  }
  return blocks;
}

function assertNoShellExpression(yaml: string, expression: RegExp): void {
  for (const block of runBlocks(yaml)) assert.doesNotMatch(block, expression);
}

function assertValidationNpmOrdering(yaml: string): void {
  const setup = yaml.indexOf("- name: Set up exact Node");
  const install = yaml.indexOf("- name: Install pinned npm");
  const dependencies = yaml.indexOf("- name: Install dependencies");
  const validation = yaml.indexOf("- name: Run requested validation");
  assert.ok(setup >= 0 && setup < install && install < dependencies && dependencies < validation, "validation steps are out of order");

  const beforeInstall = yaml.slice(0, install);
  assert.doesNotMatch(beforeInstall, /npm ci|npm run\s+\w+/, "npm CI or package scripts precede exact npm setup");
  const installBody = stepBody(yaml, "Install pinned npm");
  const globalInstall = installBody.indexOf("npm install --global");
  const versionCheck = installBody.indexOf("npm --version");
  const exactCheck = installBody.indexOf('test "$expected" = "11.15.0"');
  assert.ok(globalInstall >= 0 && globalInstall < versionCheck && versionCheck < exactCheck, "exact npm is not installed and asserted before npm ci");
}

function assertValidationSetupNodePin(yaml: string): void {
  assert.match(
    stepBody(yaml, "Set up exact Node"),
    /actions\/setup-node@[a-f0-9]{40}\s+# v\d+(?:\.\d+)*/,
  );
}

function assertValidateUploads(yaml: string): void {
  const uploadSteps = yaml
    .split(/(?=^      - name: )/m)
    .filter((step) => /uses:\s+actions\/upload-artifact@/.test(step));
  assert.equal(uploadSteps.length, 1, "validate must have exactly one external upload-artifact step");
  for (const step of uploadSteps) {
    assert.match(step, /if:\s*failure\(\) && inputs\.mode == 'full'/);
    const paths = [...step.matchAll(/^\s+path:\s*(.+)$/gm)].map((match) => match[1].trim());
    assert.deepEqual(paths, ["release-diagnostics"], "upload path must be exactly release-diagnostics");
    assert.doesNotMatch(step, /HOME|npmrc|workspace|\$GITHUB_WORKSPACE|path:\s*[.~/$]/i);
  }
}

function assertReadOnlyPermissions(yaml: string): void {
  const lines = yaml.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)permissions:\s*(.*)$/);
    if (!match) continue;
    const indent = match[1].length;
    const inline = match[2].trim();
    if (inline) {
      assert.equal(inline, "{}", "inline permissions must be {} for read-only jobs");
      continue;
    }
    const entries: string[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const trimmed = lines[next].trim();
      const nextIndent = lines[next].length - lines[next].trimStart().length;
      if (trimmed && nextIndent <= indent) break;
      if (trimmed) entries.push(trimmed);
    }
    assert.deepEqual(entries, ["contents: read"], "permissions must be exactly contents: read");
  }
}

function assertSafeWorkflowPolicy(yaml: string): void {
  assertPinnedUses(yaml);
  assertCheckoutHardening(yaml);
  assertReadOnlyPermissions(yaml);
  assert.doesNotMatch(
    yaml,
    /NPM_TOKEN|pull_request_target|\benvironment\s*:|Release Please|Changesets|Semantic Release|audit-ci/i,
  );
}

function exactKeys(value: WorkflowRecord, keys: string[]): void {
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}

function assertDependabotObserverPolicy(yaml: string): void {
  const { value } = parseWorkflow(yaml);
  assert.equal(value.name, "Dependabot auto-merge observer");
  assert.deepEqual(value.on, { pull_request: null });
  assert.deepEqual(value.permissions, {});
  exactKeys(value, ["name", "on", "permissions", "jobs"]);

  const job = parsedJob(value, "observe-dependabot");
  exactKeys(job, ["if", "runs-on", "permissions", "steps"]);
  assert.equal(job["runs-on"], "ubuntu-latest");
  assert.deepEqual(job.permissions, {});
  assert.equal(
    String(job.if).replace(/\s+/g, " ").trim(),
    [
      "github.actor == 'dependabot[bot]'",
      "github.repository == 'therealhieu/md2vid'",
      "github.event.pull_request.user.login == 'dependabot[bot]'",
      "github.event.pull_request.base.ref == 'main'",
    ].join(" && "),
  );

  const steps = parsedSteps(job, "observe-dependabot");
  assert.equal(steps.length, 1);
  exactKeys(steps[0], ["name", "shell", "run"]);
  assert.equal(steps[0].name, "Complete observation");
  assert.equal(steps[0].shell, "bash");
  assert.equal(steps[0].run, "true");
  assert.doesNotMatch(yaml, /uses:|actions\/|artifact|cache|checkout|npm|node\s+[^-]|scripts\//i);
}

function assertDependabotAutoMergePolicy(yaml: string): void {
  const { value } = parseWorkflow(yaml);
  assert.equal(value.name, "Dependabot auto-merge");
  assert.deepEqual(value.on, {
    workflow_run: {
      workflows: ["Dependabot auto-merge observer"],
      types: ["completed"],
    },
  });
  assert.deepEqual(value.permissions, {});
  assert.deepEqual(value.concurrency, {
    group: "dependabot-auto-merge-${{ github.event.workflow_run.pull_requests[0].number || github.event.workflow_run.id }}",
    "cancel-in-progress": true,
  });
  exactKeys(value, ["name", "on", "permissions", "concurrency", "jobs"]);

  const job = parsedJob(value, "request-auto-merge");
  exactKeys(job, ["if", "runs-on", "permissions", "steps"]);
  assert.equal(job["runs-on"], "ubuntu-latest");
  assert.deepEqual(job.permissions, {
    actions: "read",
    contents: "write",
    "pull-requests": "write",
  });
  assert.equal(
    String(job.if).replace(/\s+/g, " ").trim(),
    [
      "github.repository == 'therealhieu/md2vid'",
      "github.event.workflow_run.event == 'pull_request'",
      "github.event.workflow_run.name == 'Dependabot auto-merge observer'",
      "github.event.workflow_run.conclusion == 'success'",
      "github.event.workflow_run.actor.login == 'dependabot[bot]'",
    ].join(" && "),
  );

  const steps = parsedSteps(job, "request-auto-merge");
  assert.deepEqual(
    steps.map((step) => step.name),
    [
      "Fetch trusted observer and PR state",
      "Validate Dependabot patch group policy",
      "Revalidate live head",
      "Request native squash auto-merge",
    ],
  );
  for (const step of steps) {
    assert.equal(Object.hasOwn(step, "continue-on-error"), false);
    assert.equal(Object.hasOwn(step, "uses"), false);
    assert.doesNotMatch(String(step.run ?? ""), /\|\|\s*true|set\s+\+e|gh\s+pr\s+review|event=APPROVE|reviews\//);
  }

  const state = steps[0];
  exactKeys(state, ["name", "id", "shell", "env", "run"]);
  assert.equal(state.id, "state");
  assert.equal(state.shell, "bash");
  assert.deepEqual(state.env, {
    GH_TOKEN: "${{ github.token }}",
    REPOSITORY: "therealhieu/md2vid",
    RUN_ID: "${{ github.event.workflow_run.id }}",
  });
  assert.equal(
    state.run,
    "set -euo pipefail\n[[ \"$RUN_ID\" =~ ^[1-9][0-9]*$ ]]\nSTATE_DIR=\"$RUNNER_TEMP/dependabot-auto-merge-$RUN_ID\"\ntest ! -e \"$STATE_DIR\"\nmkdir -m 700 \"$STATE_DIR\"\nRUN_FILE=\"$STATE_DIR/run.json\"\nPR_FILE=\"$STATE_DIR/pr.json\"\nCOMMITS_FILE=\"$STATE_DIR/commits.json\"\ngh api --method GET \"repos/$REPOSITORY/actions/runs/$RUN_ID\" > \"$RUN_FILE\"\nPR_NUMBER=$(jq -er '.pull_requests as $prs | if ($prs | type == \"array\") and ($prs | length == 1) and (($prs[0].number | type) == \"number\") and ($prs[0].number >= 1) then $prs[0].number else error(\"observer run must map to exactly one PR\") end' \"$RUN_FILE\")\n[[ \"$PR_NUMBER\" =~ ^[1-9][0-9]*$ ]]\ngh api --method GET \"repos/$REPOSITORY/pulls/$PR_NUMBER\" > \"$PR_FILE\"\ngh api --method GET \"repos/$REPOSITORY/pulls/$PR_NUMBER/commits?per_page=100\" > \"$COMMITS_FILE\"\n{\n  printf 'run_file=%s\\n' \"$RUN_FILE\"\n  printf 'pr_file=%s\\n' \"$PR_FILE\"\n  printf 'commits_file=%s\\n' \"$COMMITS_FILE\"\n} >> \"$GITHUB_OUTPUT\"",
  );
  assert.equal(
    (String(state.run).match(/gh api --method GET "repos\/\$REPOSITORY\/actions\/runs\/\$RUN_ID"/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(String(state.run), /actions\/runs\/\$RUN_ID\/pull_requests|ASSOCIATED_FILE|associated_file/);

  const policy = steps[1];
  exactKeys(policy, ["name", "id", "shell", "env", "run"]);
  assert.equal(policy.id, "policy");
  assert.equal(policy.shell, "bash");
  assert.deepEqual(policy.env, {
    RUN_FILE: "${{ steps.state.outputs.run_file }}",
    PR_FILE: "${{ steps.state.outputs.pr_file }}",
    COMMITS_FILE: "${{ steps.state.outputs.commits_file }}",
    RUN_ID: "${{ github.event.workflow_run.id }}",
    EVENT_PR_NUMBER: "${{ github.event.workflow_run.pull_requests[0].number }}",
    EVENT_HEAD_REF: "${{ github.event.workflow_run.pull_requests[0].head.ref }}",
    EVENT_HEAD_SHA: "${{ github.event.workflow_run.pull_requests[0].head.sha }}",
  });
  const script = dependabotPolicyScript(yaml);
  assert.doesNotMatch(script, /EVENT_HEAD_REPOSITORY|eventHeadRepository/);
  assert.match(script, /const repositoryId = 1309960592;/);
  assert.match(script, /const repositoryUrl = "https:\/\/api\.github\.com\/repos\/therealhieu\/md2vid";/);
  assert.match(script, /const trustedRepository = run\.repository;/);
  assert.match(script, /observedHeadRepo\?\.id !== trustedRepository\.id/);
  assert.match(script, /observedBaseRepo\?\.url !== trustedRepository\.url/);
  assert.doesNotMatch(script, /observed(?:Head|Base)Repo\?\.full_name/);
  assert.match(String(policy.run), /^node --input-type=module <<'NODE'/);
  assert.match(String(policy.run), /\n\s*NODE\s*$/);
  assert.equal((String(policy.run).match(/node --input-type=module/g) ?? []).length, 1);
  assert.doesNotMatch(script, /from ["']node:(?:child_process|http|https|net|tls|url|process)["']|fetch\(|spawn\(|exec\(|https?\./);
  assert.match(script, /const patchUpdateType = "version-update:semver-patch";/);
  for (const group of Object.keys(MANUAL_DEPENDABOT_FAMILIES)) {
    assert.equal(script.includes(`group: "${group}"`), false);
  }
  assert.equal((script.match(/runtime-patches\(\?:-\[a-z0-9\]\+\)\?\$/g) ?? []).length, 1);
  assert.equal((script.match(/dev-patches\(\?:-\[a-z0-9\]\+\)\?\$/g) ?? []).length, 1);
  assert.equal((script.match(/actions-patches\(\?:-\[a-z0-9\]\+\)\?\$/g) ?? []).length, 1);
  const setValues = (name: string): string[] => {
    const match = script.match(new RegExp(`const ${name} = new Set\\((\\[[^;]+\\])\\);`));
    assert.ok(match, `missing ${name}`);
    return JSON.parse(match[1]) as string[];
  };
  assert.deepEqual(
    setValues("runtimeDependencies").sort(),
    [
      ...Object.keys(packageJson.dependencies),
      ...Object.keys(packageJson.optionalDependencies),
    ].sort(),
  );
  assert.deepEqual(
    setValues("developmentDependencies").sort(),
    Object.keys(packageJson.devDependencies).sort(),
  );
  assert.equal((script.match(/version-update:semver-patch/g) ?? []).length, 1);
  assert.match(script, /\(dependency-version\|dependency-type\|update-type\|dependency-group\)/);
  assert.match(script, /const expected = \["dependency-group", "dependency-name", "dependency-type", "dependency-version", "update-type"\];/);
  assert.match(script, /policy\.allowed === null \|\| names\.every/);

  const revalidate = steps[2];
  exactKeys(revalidate, ["name", "if", "shell", "env", "run"]);
  assert.equal(revalidate.if, "steps.policy.outputs.eligible == 'true'");
  assert.equal(revalidate.shell, "bash");
  assert.deepEqual(revalidate.env, {
    GH_TOKEN: "${{ github.token }}",
    REPOSITORY: "therealhieu/md2vid",
    PR_NUMBER: "${{ steps.policy.outputs.pr_number }}",
    EXPECTED_HEAD_SHA: "${{ steps.policy.outputs.expected_head_sha }}",
  });
  assert.equal(
    revalidate.run,
    "set -euo pipefail\n[[ \"$PR_NUMBER\" =~ ^[1-9][0-9]*$ ]]\n[[ \"$EXPECTED_HEAD_SHA\" =~ ^[a-f0-9]{40}$ ]]\ncurrent_head=$(gh api --method GET \"repos/$REPOSITORY/pulls/$PR_NUMBER\" --jq .head.sha)\ntest \"$current_head\" = \"$EXPECTED_HEAD_SHA\"",
  );

  const merge = steps[3];
  exactKeys(merge, ["name", "if", "shell", "env", "run"]);
  assert.equal(merge.if, "steps.policy.outputs.eligible == 'true'");
  assert.equal(merge.shell, "bash");
  assert.deepEqual(merge.env, {
    GH_TOKEN: "${{ github.token }}",
    REPOSITORY: "therealhieu/md2vid",
    PR_NUMBER: "${{ steps.policy.outputs.pr_number }}",
    EXPECTED_HEAD_SHA: "${{ steps.policy.outputs.expected_head_sha }}",
  });
  assert.equal(
    merge.run,
    "set -euo pipefail\n[[ \"$PR_NUMBER\" =~ ^[1-9][0-9]*$ ]]\n[[ \"$EXPECTED_HEAD_SHA\" =~ ^[a-f0-9]{40}$ ]]\ncurrent_head=$(gh api --method GET \"repos/$REPOSITORY/pulls/$PR_NUMBER\" --jq .head.sha)\ntest \"$current_head\" = \"$EXPECTED_HEAD_SHA\"\ngh pr merge \"$PR_NUMBER\" --repo \"$REPOSITORY\" --auto --squash --match-head-commit \"$EXPECTED_HEAD_SHA\"",
  );

  assert.doesNotMatch(yaml, /pull_request_target|actions\/checkout@|uses:\s|npm\s+(?:ci|install|run)|corepack|node_modules|dist\/bin|scripts\/[A-Za-z0-9_.-]+\.ts|--admin|--merge|--rebase|gh\s+pr\s+review|event=APPROVE|reviews\//);
}

function dependabotPolicyScript(yaml: string): string {
  const body = stepBody(yaml, "Validate Dependabot patch group policy");
  const match = body.match(
    /node --input-type=module <<'NODE'\n([\s\S]*?)\n\s*NODE\s*$/,
  );
  assert.ok(match, "missing trusted inline policy script");
  return match[1];
}

function dependabotRunPrNumberJqExpression(yaml: string): string {
  const state = parsedSteps(
    parsedJob(parseWorkflow(yaml).value, "request-auto-merge"),
    "request-auto-merge",
  )[0];
  const match = String(state.run).match(/PR_NUMBER=\$\(jq -er '([^']+)' "\$RUN_FILE"\)/);
  assert.ok(match, "missing trusted run pull_requests extraction expression");
  return match[1];
}

function runDependabotPrNumberExtraction(
  yaml: string,
  run: unknown,
): { status: number | null; stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), "md2vid-dependabot-run-pr-"));
  const runFile = join(dir, "run.json");
  try {
    writeFileSync(runFile, JSON.stringify(run));
    const result = spawnSync("jq", [
      "-er",
      dependabotRunPrNumberJqExpression(yaml),
      runFile,
    ], { encoding: "utf8" });
    return {
      status: result.status,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

type PolicyFixture = {
  event: WorkflowRecord;
  run: WorkflowRecord;
  pr: WorkflowRecord;
  commits: WorkflowRecord[];
};

function makePolicyFixture(
  group: string,
  names: string[],
  updateType = "version-update:semver-patch",
): PolicyFixture {
  const head = `dependabot/${group === "actions-patches" ? "github_actions" : "npm_and_yarn"}/${group}-abc123`;
  const sha = "a".repeat(40);
  const message = [
    `Bumps the ${group} group with ${names.length} updates.`,
    "",
    "---",
    "updated-dependencies:",
    ...names.flatMap((name) => [
      `- dependency-name: ${name}`,
      "  dependency-version: 1.2.3",
      "  dependency-type: direct:development",
      `  update-type: ${updateType}`,
      `  dependency-group: ${group}`,
    ]),
    "...",
    "",
    "Signed-off-by: dependabot[bot] <support@github.com>",
  ].join("\n");
  const repository = {
    id: 1309960592,
    url: "https://api.github.com/repos/therealhieu/md2vid",
    name: "md2vid",
  };
  const run = {
    id: 42,
    name: "Dependabot auto-merge observer",
    event: "pull_request",
    conclusion: "success",
    actor: { login: "dependabot[bot]" },
    repository: { ...repository, full_name: "therealhieu/md2vid" },
    head_branch: head,
    pull_requests: [{
      number: 123,
      head: { ref: head, sha, repo: { ...repository } },
      base: { ref: "main", repo: { ...repository } },
    }],
  };
  const event = {
    number: 123,
    head: { ref: head, sha, repo: { full_name: "therealhieu/md2vid" } },
  };
  const pr = {
    number: 123,
    state: "open",
    user: { login: "dependabot[bot]" },
    base: { ref: "main", repo: { full_name: "therealhieu/md2vid" } },
    head: { ref: head, sha, repo: { full_name: "therealhieu/md2vid" } },
    commits: 1,
    body: "Dependabot update.",
  };
  const commits = [{
    sha,
    author: { login: "dependabot[bot]" },
    commit: { message, verification: { verified: true } },
  }];
  return { event, run, pr, commits };
}

function setPolicyHead(fixture: PolicyFixture, head: string): PolicyFixture {
  (fixture.event.head as WorkflowRecord).ref = head;
  fixture.run.head_branch = head;
  (((fixture.run.pull_requests as WorkflowRecord[])[0].head) as WorkflowRecord).ref =
    head;
  (fixture.pr.head as WorkflowRecord).ref = head;
  return fixture;
}

function withDependabotMetadataLines(
  fixture: PolicyFixture,
  lines: string[],
): PolicyFixture {
  const commit = fixture.commits[0].commit as WorkflowRecord;
  commit.message = [
    "chore(deps): bump Dependabot metadata fixture",
    "",
    "---",
    "updated-dependencies:",
    ...lines,
    "...",
    "",
    "Signed-off-by: dependabot[bot] <support@github.com>",
  ].join("\n");
  return fixture;
}

function runDependabotPolicy(
  yaml: string,
  fixture: PolicyFixture,
  options: { eventHeadRepository?: string } = {},
): { status: number | null; values: Record<string, string>; stderr?: string } {
  const dir = mkdtempSync(join(tmpdir(), "md2vid-dependabot-policy-"));
  const output = join(dir, "output");
  const write = (name: string, value: unknown) => {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(value));
    return path;
  };
  try {
    const result = spawnSync(process.execPath, ["--input-type=module"], {
      input: dependabotPolicyScript(yaml),
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_OUTPUT: output,
        RUN_ID: "42",
        EVENT_PR_NUMBER: String(fixture.event.number),
        EVENT_HEAD_REF: String((fixture.event.head as WorkflowRecord).ref),
        EVENT_HEAD_SHA: String((fixture.event.head as WorkflowRecord).sha),
        ...(options.eventHeadRepository === undefined
          ? {}
          : { EVENT_HEAD_REPOSITORY: options.eventHeadRepository }),
        RUN_FILE: write("run.json", fixture.run),
        PR_FILE: write("pr.json", fixture.pr),
        COMMITS_FILE: write("commits.json", fixture.commits),
      },
    });
    const values = existsSync(output)
      ? Object.fromEntries(
          readFileSync(output, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => line.split("=", 2)),
        )
      : {};
    const stderr = result.stderr.trim();
    return stderr ? { status: result.status, values, stderr } : { status: result.status, values };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function prTitleStep(yaml: string): WorkflowRecord {
  const job = parsedJob(parseWorkflow(yaml).value, "pr-title");
  const steps = parsedSteps(job, "pr-title");
  assert.equal(steps.length, 1);
  return steps[0];
}

type PrTitleInput = {
  title: string;
  actor?: string;
  author?: string;
  headRef?: string;
};

function runPrTitlePolicy(
  yaml: string,
  { title, actor = "therealhieu", author = "therealhieu", headRef = "feature/example" }: PrTitleInput,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("bash", ["-euo", "pipefail", "-c", String(prTitleStep(yaml).run)], {
    encoding: "utf8",
    env: {
      ...process.env,
      PR_TITLE: title,
      PR_ACTOR: actor,
      PR_AUTHOR: author,
      PR_HEAD_REF: headRef,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function assertPrTitleAccepted(yaml: string, input: PrTitleInput): void {
  assert.deepEqual(runPrTitlePolicy(yaml, input), { status: 0, stdout: "", stderr: "" });
}

function assertPrTitleRejected(yaml: string, input: PrTitleInput): void {
  assert.notEqual(runPrTitlePolicy(yaml, input).status, 0, input.title);
}

function assertDependabotGroupPolicy(body: string): void {
  const { value } = parseWorkflow(body);
  assert.equal(value.version, 2);
  assert.equal(Array.isArray(value.updates), true);

  const updates = value.updates as WorkflowRecord[];
  assert.equal(updates.length, 2);
  const npm = updates.find(
    (entry) => entry["package-ecosystem"] === "npm",
  );
  const actions = updates.find(
    (entry) => entry["package-ecosystem"] === "github-actions",
  );
  assert.ok(npm);
  assert.ok(actions);

  assert.deepEqual(npm.schedule, {
    interval: "weekly",
    day: "monday",
    time: "04:17",
  });
  assert.deepEqual(actions.schedule, {
    interval: "weekly",
    day: "monday",
    time: "04:23",
  });
  assert.equal(npm["open-pull-requests-limit"], 5);
  assert.equal(actions["open-pull-requests-limit"], 5);
  assert.deepEqual(npm["commit-message"], { prefix: "chore(deps)" });
  assert.deepEqual(actions["commit-message"], { prefix: "chore(deps)" });

  const npmGroups = asRecord(npm.groups, "npm groups");
  const actionGroups = asRecord(actions.groups, "actions groups");
  assert.deepEqual(Object.keys(npmGroups), [
    "runtime-patches",
    "dev-patches",
    "react-family",
    "react-types-family",
    "remotion-family",
  ]);
  assert.deepEqual(Object.keys(actionGroups), ["actions-patches"]);

  const runtime = asRecord(npmGroups["runtime-patches"], "runtime-patches");
  const development = asRecord(npmGroups["dev-patches"], "dev-patches");
  const actionPatches = asRecord(
    actionGroups["actions-patches"],
    "actions-patches",
  );

  const expectedRuntime = [
    ...Object.keys(packageJson.dependencies),
    ...Object.keys(packageJson.optionalDependencies),
  ].sort();
  assert.deepEqual(
    [...runtime.patterns as string[]].sort(),
    expectedRuntime,
  );
  assert.deepEqual(runtime["update-types"], ["patch"]);
  assert.equal(development["dependency-type"], "development");
  assert.deepEqual(development["update-types"], ["patch"]);
  assert.deepEqual(actionPatches.patterns, ["*"]);
  assert.deepEqual(actionPatches["update-types"], ["patch"]);

  for (const [group, patterns] of Object.entries(MANUAL_DEPENDABOT_FAMILIES)) {
    const value = asRecord(npmGroups[group], group);
    assert.deepEqual(value.patterns, patterns);
    assert.deepEqual(value["update-types"], ["minor", "major"]);
    assert.deepEqual(Object.keys(value).sort(), ["patterns", "update-types"]);
  }

  assert.equal(Object.hasOwn(npm, "ignore"), false);
  assert.equal(Object.hasOwn(actions, "ignore"), false);
}

function assertPolicyFailedWithoutOutputs(
  result: { status: number | null; values: Record<string, string> },
  label: string,
): void {
  assert.notEqual(result.status, 0, label);
  assert.deepEqual(result.values, {}, label);
}

function assertActiveJobsPolicy(name: string, yaml: string): void {
  assert.ok(
    Object.hasOwn(EXPECTED_JOB_RUNNERS, name),
    `missing active job policy for ${name}`,
  );
  const { document, value } = parseWorkflow(yaml);
  const jobs = asRecord(value.jobs, `${name} jobs`);
  const expected = EXPECTED_JOB_RUNNERS[name];
  const actual: Record<string, string | null> = {};

  for (const [jobName, rawJob] of Object.entries(jobs)) {
    const job = asRecord(rawJob, `${name} job ${jobName}`);
    if (Object.hasOwn(job, "runs-on")) {
      assert.equal(
        typeof job["runs-on"],
        "string",
        `${name} job ${jobName} runs-on must be a scalar string`,
      );
      const node = document.getIn(["jobs", jobName, "runs-on"], true);
      if (isScalar(node)) {
        assert.doesNotMatch(
          String(node.type),
          /^BLOCK_/,
          `${name} job ${jobName} runs-on must not use a block scalar`,
        );
      }
      assert.equal(
        Object.hasOwn(job, "uses"),
        false,
        `${name} job ${jobName} cannot combine runs-on and uses`,
      );
      actual[jobName] = job["runs-on"] as string;
    } else {
      assert.equal(
        typeof job.uses,
        "string",
        `${name} reusable job ${jobName} must have uses and no runs-on`,
      );
      actual[jobName] = null;
    }
  }

  assert.deepEqual(
    actual,
    expected,
    `${name} jobs and effective runs-on values must match the exact contract`,
  );
}

function assertPublicSnapshotPolicy(yaml: string): void {
  const { value } = parseWorkflow(yaml);
  const job = parsedJob(value, "public-snapshot");
  assert.equal(
    job.uses,
    "./.github/workflows/validate.yml",
    "public snapshot must call reusable validation",
  );
  assert.equal(
    Object.hasOwn(job, "strategy"),
    false,
    "public snapshot must not define a strategy",
  );
  assert.deepEqual(
    job.with,
    {
      runner: "ubuntu-latest",
      "node-version": "22.18.0",
      mode: "public-snapshot",
      audit: false,
    },
    "public snapshot inputs must be the exact Ubuntu-only validation contract",
  );
  assert.match(jobBody(yaml, "public-snapshot", "pr-minimum"), /permissions:\s*\n\s+contents:\s*read/);
}

function assertNightlyPolicy(yaml: string): void {
  assert.match(yaml, /^name: Nightly validation$/m);
  assert.match(yaml, /on:\s*\n\s+schedule:\s*\n\s+- cron: "17 4 \* \* \*"\s*\n\s+workflow_dispatch:/);
  assert.match(yaml, /^permissions:\s*\n\s+contents: read$/m);
  assert.match(yaml, /concurrency:\s*\n\s+group: nightly\s*\n\s+cancel-in-progress: false/);

  const resolver = jobBody(yaml, "resolve-latest-node", "native-matrix");
  assert.match(resolver, /runs-on: ubuntu-latest/);
  assert.match(resolver, /permissions: \{\}/);
  assert.match(resolver, /actions\/setup-node@[a-f0-9]{40}\s+# v\d+(?:\.\d+)*/);
  assert.match(resolver, /node-version: node/);
  assert.match(resolver, /version=\$\(node -p 'process\.versions\.node'\)/);
  assert.match(resolver, /version: \$\{\{ steps\.node\.outputs\.version \}\}/);
  assert.equal((yaml.match(/node-version:\s*node\s*$/gm) ?? []).length, 1);

  const { value } = parseWorkflow(yaml);
  const matrixJob = parsedJob(value, "native-matrix");
  const matrix = jobBody(yaml, "native-matrix");
  assert.match(matrix, /needs: resolve-latest-node/);
  assert.deepEqual(
    matrixJob.strategy,
    {
      "fail-fast": false,
      matrix: { runner: ["ubuntu-latest", "macos-latest"] },
    },
    "nightly strategy must contain only the exact supported runner matrix",
  );
  assert.equal(
    matrixJob.uses,
    "./.github/workflows/validate.yml",
    "nightly matrix must call reusable validation",
  );
  assert.deepEqual(
    matrixJob.with,
    {
      runner: "${{ matrix.runner }}",
      "node-version": "${{ needs.resolve-latest-node.outputs.version }}",
      mode: "full",
      audit: "${{ matrix.runner == 'ubuntu-latest' }}",
    },
    "nightly validation inputs must match the exact matrix contract",
  );
  assert.equal((yaml.match(/^\s+audit:/gm) ?? []).length, 1, "nightly must request exactly one matrix audit");
  assert.match(matrix, /permissions:\s*\n\s+contents: read/);

  assert.doesNotMatch(yaml, /actions\/checkout@/, "nightly caller must not check out source");
  assert.doesNotMatch(yaml, /actions\/upload-artifact@/, "nightly caller must not add broad diagnostics uploads");
  assertSafeWorkflowPolicy(yaml);
}

test("validation, CI, and nightly workflows exist", () => {
  for (const name of ["validate.yml", "ci.yml", "nightly.yml"]) {
    assert.equal(existsSync(workflowPath(name)), true, `missing ${name}`);
  }
  assert.equal(existsSync(dependabotPath), true, "missing dependabot.yml");
});

test("shared external actions use one immutable pin across workflows", () => {
  const active = ["ci.yml", "nightly.yml", "release.yml", "validate.yml"];
  assertConsistentActionPin(active, "actions/setup-node");
  assertConsistentActionPin(active, "actions/checkout");
  assertConsistentActionPin(active, "actions/upload-artifact");
  assertConsistentActionPin(active, "actions/download-artifact");
});

test("workflow policy inventory covers and checks every active workflow file", () => {
  const active = readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
  assert.deepEqual(
    active,
    Object.keys(WORKFLOW_POLICY_CHECKERS).sort(),
    "every active workflow must have an explicit policy checker",
  );
  for (const [name, checker] of Object.entries(WORKFLOW_POLICY_CHECKERS)) {
    checker(workflow(name));
  }
});

test("active workflows schedule only their exact allowed runners", () => {
  const active = readdirSync(WORKFLOW_DIR).filter(
    (name) => name.endsWith(".yml") || name.endsWith(".yaml"),
  );
  for (const name of active) assertActiveJobsPolicy(name, workflow(name));

  const ci = workflow("ci.yml");
  const mutations = [
    ci.replace("    runs-on: ubuntu-latest", "    runs-on:"),
    ci.replace("    runs-on: ubuntu-latest", "    runs-on:\n      runner: ubuntu-latest"),
    ci.replace("    runs-on: ubuntu-latest", "    runs-on: [ubuntu-latest]"),
    ci.replace("    runs-on: ubuntu-latest", "    runs-on: >-\n      ubuntu-latest"),
    ci.replace("    runs-on: ubuntu-latest", "    runs-on: ubuntu-latest\n    runs-on: ubuntu-latest"),
    ci
      .replace("jobs:\n", "runner-values:\n  windows: &windows-runner windows-latest\n\njobs:\n")
      .replace("    runs-on: ubuntu-latest", "    runs-on: *windows-runner"),
    ci.replace(
      "    runs-on: ubuntu-latest",
      "    runs-on: ${{ format('{0}-{1}', 'windows', 'latest') }}",
    ),
    `${ci}\n  quoted-runner:\n    "runs-on": \${{ format('{0}-{1}', 'windows', 'latest') }}\n    steps:\n      - run: echo safe\n`,
  ];
  for (const mutated of mutations) {
    assert.notEqual(mutated, ci, "active runs-on mutation must modify the workflow");
    assert.throws(
      () => assertActiveJobsPolicy("ci.yml", mutated),
      /runs-on|runner|duplicate|empty|block|deep-equal|strictly equal/i,
    );
  }

  assert.doesNotThrow(() =>
    assertActiveJobsPolicy("ci.yml", `${ci}\n# "runs-on": windows-latest\n`),
  );
});

for (const [name, mutate] of [
  [
    "inline Windows job",
    (yaml: string) => `${yaml}\n  inline-windows: { runs-on: windows-latest, steps: [] }\n`,
  ],
  [
    "anchored runs-on key",
    (yaml: string) =>
      `${yaml}\n  decorated-windows:\n    &runner-key runs-on: windows-latest\n    steps: []\n`,
  ],
  [
    "tagged runs-on key",
    (yaml: string) =>
      `${yaml}\n  tagged-windows:\n    !!str runs-on: windows-latest\n    steps: []\n`,
  ],
] as const) {
  test(`active runner policy rejects ${name}`, () => {
    const yaml = workflow("ci.yml");
    const mutated = mutate(yaml);
    assert.notEqual(mutated, yaml, `${name} mutation must modify the workflow`);
    assert.throws(
      () => assertActiveJobsPolicy("ci.yml", mutated),
      /job|runs-on|runner|windows|deep-equal|strictly equal/i,
    );
  });
}

test("all workflow actions are pinned and workflows avoid forbidden authority and tools", () => {
  for (const name of ["validate.yml", "ci.yml", "nightly.yml"]) {
    assertSafeWorkflowPolicy(workflow(name));
  }
});

test("CI pr-title passes title, actor, author, and branch to the validator", () => {
  const step = prTitleStep(workflow("ci.yml"));
  assert.deepEqual(step.env, {
    PR_TITLE: "${{ github.event.pull_request.title }}",
    PR_ACTOR: "${{ github.actor }}",
    PR_AUTHOR: "${{ github.event.pull_request.user.login }}",
    PR_HEAD_REF: "${{ github.event.pull_request.head.ref }}",
  });
});

test("CI pr-title keeps ordinary PRs conventional and at most 72 characters", () => {
  const yaml = workflow("ci.yml");
  assertPrTitleAccepted(yaml, {
    title: `fix(cli): ${"a".repeat(62)}`,
  });
  assertPrTitleRejected(yaml, {
    title: `fix(cli): ${"a".repeat(63)}`,
  });
  assertPrTitleRejected(yaml, {
    title: "bugfix(cli): reject non-conventional type",
  });
  assertPrTitleRejected(yaml, {
    title: "fix(cli): reject trailing punctuation.",
  });
});

test("CI pr-title accepts exact generated Dependabot title families", () => {
  const yaml = workflow("ci.yml");
  const bot = "dependabot[bot]";
  const valid: PrTitleInput[] = [
    {
      title: "chore(deps): bump the runtime-patches group with 4 updates",
      actor: bot,
      author: bot,
      headRef: "dependabot/npm_and_yarn/runtime-patches-abc123",
    },
    {
      title:
        "chore(deps): bump the dev-patches group across 1 directory with 1 update",
      actor: bot,
      author: bot,
      headRef: "dependabot/npm_and_yarn/dev-patches-abc123",
    },
    {
      title:
        "chore(deps): bump the actions-patches group across 2 directories with 3 updates",
      actor: bot,
      author: bot,
      headRef: "dependabot/github_actions/actions-patches-abc123",
    },
    {
      title: "chore(deps): bump the react-family group with 2 updates",
      actor: bot,
      author: bot,
      headRef: "dependabot/npm_and_yarn/react-family-abc123",
    },
    {
      title:
        "chore(deps): bump the react-types-family group across 1 directory with 2 updates",
      actor: bot,
      author: bot,
      headRef: "dependabot/npm_and_yarn/react-types-family-abc123",
    },
    {
      title: "chore(deps): bump the remotion-family group with 3 updates",
      actor: bot,
      author: bot,
      headRef: "dependabot/npm_and_yarn/remotion-family-abc123",
    },
    {
      title: "chore(deps): bump typescript from 5.7.3 to 7.0.2",
      actor: bot,
      author: bot,
      headRef: "dependabot/npm_and_yarn/typescript-7.0.2",
    },
    {
      title: "chore(deps): bump @types/node from 26.1.1 to 26.1.2",
      actor: bot,
      author: bot,
      headRef: "dependabot/npm_and_yarn/types/node-26.1.2",
    },
    {
      title: "chore(deps): bump actions/setup-node from 6.0.0 to 7.0.0",
      actor: bot,
      author: bot,
      headRef: "dependabot/github_actions/actions/setup-node-7.0.0",
    },
    {
      title: "chore(deps): bump typescript from 5.8.0-beta.1 to 5.8.0-rc.1",
      actor: bot,
      author: bot,
      headRef: "dependabot/npm_and_yarn/typescript-5.8.0-rc.1",
    },
  ];

  for (const input of valid) assertPrTitleAccepted(yaml, input);
});

test("CI pr-title rejects generated Dependabot title mutations", () => {
  const yaml = workflow("ci.yml");
  const bot = "dependabot[bot]";
  const valid: PrTitleInput[] = [
    {
      title: "chore(deps): bump the runtime-patches group with 4 updates",
      actor: bot,
      author: bot,
      headRef: "dependabot/npm_and_yarn/runtime-patches-abc123",
    },
    {
      title: "chore(deps): bump typescript from 5.7.3 to 7.0.2",
      actor: bot,
      author: bot,
      headRef: "dependabot/npm_and_yarn/typescript-7.0.2",
    },
  ];
  const invalid: PrTitleInput[] = [
    { ...valid[0], actor: "therealhieu" },
    { ...valid[0], author: "therealhieu" },
    { ...valid[0], headRef: "dependabot/pip/runtime-patches-abc123" },
    { ...valid[0], headRef: "dependabot/npm_and_yarn/runtime-patchesevil" },
    {
      ...valid[0],
      title: "chore(deps): bump the runtime-patches-extra group with 4 updates",
    },
    {
      ...valid[0],
      title: "chore(deps): bump the runtime-patches group with 0 updates",
    },
    {
      ...valid[0],
      title: "chore(deps): bump the runtime-patches group with 01 update",
    },
    {
      ...valid[0],
      title: "chore(deps): bump the runtime-patches group with +1 update",
    },
    {
      ...valid[0],
      title: "chore(deps): bump the runtime-patches group with 1 updates",
    },
    {
      ...valid[0],
      title:
        "chore(deps): bump the runtime-patches group across 1 directories with 4 updates",
    },
    {
      ...valid[0],
      title:
        "chore(deps): bump the runtime-patches group across 2 directory with 4 updates",
    },
    {
      ...valid[0],
      title: "chore(deps): bump the runtime-patches group with 4 updates.",
    },
    {
      ...valid[0],
      title: "chore(deps): bump the dev-patches group with 4 updates",
    },
    { ...valid[1], headRef: "dependabot/pip/typescript-7.0.2" },
    {
      ...valid[1],
      title: "chore(deps): bump typescript from 5.7.3 to 7.0.2.",
    },
    {
      ...valid[1],
      title: "chore(deps): bump typescript from 5.7.3\nto 7.0.2",
    },
  ];

  for (const input of invalid) assertPrTitleRejected(yaml, input);
});

test("nightly runs one exact latest Node across the native matrix", () => {
  assertNightlyPolicy(workflow("nightly.yml"));
});

test("Dependabot defines exact weekly patch and manual family groups", () => {
  const body = readFileSync(dependabotPath, "utf8");
  assertDependabotGroupPolicy(body);

  const reactFamilyBlock = [
    "      react-family:",
    "        patterns:",
    "          - \"react\"",
    "          - \"react-dom\"",
    "        update-types:",
    "          - \"minor\"",
    "          - \"major\"",
  ].join("\n");
  const mutations = [
    body.replace(
      reactFamilyBlock,
      reactFamilyBlock.replace('\n          - "react-dom"', ""),
    ),
    body.replace(
      reactFamilyBlock,
      reactFamilyBlock.replace(
        '          - "react-dom"',
        '          - "react-dom"\n          - "left-pad"',
      ),
    ),
    body.replace(
      reactFamilyBlock,
      `${reactFamilyBlock}\n          - "patch"`,
    ),
    body.replace(
      '          - "patch"\n      dev-patches:',
      '          - "patch"\n          - "minor"\n      dev-patches:',
    ),
    body.replace(
      "      react-family:",
      "      remotion-family:\n        patterns: []\n        update-types: [minor, major]\n      react-family:",
    ),
  ];

  for (const mutated of mutations) {
    assert.notEqual(mutated, body);
    assert.throws(() => assertDependabotGroupPolicy(mutated));
  }
});

test("Dependabot trusted run PR extraction accepts one numeric run-object PR", () => {
  const yaml = workflow("dependabot-auto-merge.yml");
  assert.deepEqual(
    runDependabotPrNumberExtraction(yaml, { pull_requests: [{ number: 123 }] }),
    { status: 0, stdout: "123", stderr: "" },
  );

  const invalid = [
    {},
    { pull_requests: null },
    { pull_requests: { number: 123 } },
    { pull_requests: [] },
    { pull_requests: [{ number: 123 }, { number: 124 }] },
    { pull_requests: [{ number: "123" }] },
    { pull_requests: [{ number: 0 }] },
    { pull_requests: [{ number: -1 }] },
  ];
  for (const run of invalid) {
    const result = runDependabotPrNumberExtraction(yaml, run);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /observer run must map to exactly one PR|Cannot index|boolean/);
  }
});

test("Dependabot trusted policy constants equal repository metadata", () => {
  const script = dependabotPolicyScript(workflow("dependabot-auto-merge.yml"));
  const setValues = (name: string): string[] => {
    const match = script.match(new RegExp(`const ${name} = new Set\\((\\[[^;]+\\])\\);`));
    assert.ok(match, `missing ${name}`);
    return JSON.parse(match[1]) as string[];
  };
  assert.deepEqual(
    setValues("runtimeDependencies").sort(),
    [
      ...Object.keys(packageJson.dependencies),
      ...Object.keys(packageJson.optionalDependencies),
    ].sort(),
  );
  assert.deepEqual(
    setValues("developmentDependencies").sort(),
    Object.keys(packageJson.devDependencies).sort(),
  );
  assert.equal((script.match(/version-update:semver-patch/g) ?? []).length, 1);
  assert.equal((script.match(/runtime-patches\(\?:-\[a-z0-9\]\+\)\?\$/g) ?? []).length, 1);
  assert.equal((script.match(/dev-patches\(\?:-\[a-z0-9\]\+\)\?\$/g) ?? []).length, 1);
  assert.equal((script.match(/actions-patches\(\?:-\[a-z0-9\]\+\)\?\$/g) ?? []).length, 1);
});

test("Dependabot trusted policy accepts dependency-version metadata field", () => {
  const yaml = workflow("dependabot-auto-merge.yml");
  const runtimeFixture = withDependabotMetadataLines(
    makePolicyFixture("runtime-patches", ["hyperframes", "@remotion/google-fonts"]),
    [
      "- dependency-name: hyperframes",
      "  dependency-version: 0.7.77",
      "  dependency-type: direct:production",
      "  update-type: version-update:semver-patch",
      "  dependency-group: runtime-patches",
      "- dependency-name: \"@remotion/google-fonts\"",
      "  dependency-version: 4.0.500",
      "  dependency-type: direct:production",
      "  update-type: version-update:semver-patch",
      "  dependency-group: runtime-patches",
    ],
  );
  assert.deepEqual(runDependabotPolicy(yaml, runtimeFixture), {
    status: 0,
    values: {
      eligible: "true",
      group: "runtime-patches",
      pr_number: "123",
      expected_head_sha: "a".repeat(40),
    },
  });

  const actionsFixture = withDependabotMetadataLines(
    makePolicyFixture("actions-patches", ["actions/checkout"]),
    [
      "- dependency-name: actions/checkout",
      "  dependency-version: 7.0.1",
      "  dependency-type: direct:production",
      "  update-type: version-update:semver-patch",
      "  dependency-group: actions-patches",
    ],
  );
  assert.deepEqual(runDependabotPolicy(yaml, actionsFixture), {
    status: 0,
    values: {
      eligible: "true",
      group: "actions-patches",
      pr_number: "123",
      expected_head_sha: "a".repeat(40),
    },
  });

  const quotedEscapeFixture = withDependabotMetadataLines(
    makePolicyFixture("runtime-patches", ["hyperframes"]),
    [
      "- dependency-name: hyperframes",
      "  dependency-version: '0.7.77''canary'",
      "  dependency-type: direct:production",
      "  update-type: version-update:semver-patch",
      "  dependency-group: runtime-patches",
    ],
  );
  assert.deepEqual(runDependabotPolicy(yaml, quotedEscapeFixture), {
    status: 0,
    values: {
      eligible: "true",
      group: "runtime-patches",
      pr_number: "123",
      expected_head_sha: "a".repeat(40),
    },
  });
});

test("Dependabot trusted policy no-ops trusted supported non-policy refs", () => {
  const yaml = workflow("dependabot-auto-merge.yml");
  const expectedNoOp = {
    status: 0,
    values: {
      eligible: "false",
      group: "none",
      pr_number: "123",
      expected_head_sha: "a".repeat(40),
    },
  };
  const nonPolicyHeads = [
    "dependabot/npm_and_yarn/typescript-7.0.2",
    "dependabot/npm_and_yarn/types/node-26.1.2",
    "dependabot/github_actions/actions/setup-node-7.0.0",
    "dependabot/npm_and_yarn/react-family-abc123",
    "dependabot/npm_and_yarn/runtime-patchesevil",
  ];

  for (const head of nonPolicyHeads) {
    const fixture = setPolicyHead(
      makePolicyFixture("runtime-patches", ["hyperframes"]),
      head,
    );
    (fixture.commits[0].commit as WorkflowRecord).message =
      "chore(deps): generated Dependabot update";
    assert.deepEqual(runDependabotPolicy(yaml, fixture), expectedNoOp);
  }

  for (const head of [
    "dependabot/pip/requests-3.0.0",
    "dependabot/npm_and_yarn/",
    "feature/typescript-7.0.2",
  ]) {
    const fixture = setPolicyHead(
      makePolicyFixture("runtime-patches", ["hyperframes"]),
      head,
    );
    const result = runDependabotPolicy(yaml, fixture);
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.values, {});
  }
});

test("Dependabot trusted policy rejects untrusted supported non-policy refs before no-op", () => {
  const yaml = workflow("dependabot-auto-merge.yml");
  const makeNonPolicyFixture = () => {
    const fixture = setPolicyHead(
      makePolicyFixture("runtime-patches", ["hyperframes"]),
      "dependabot/npm_and_yarn/typescript-7.0.2",
    );
    (fixture.commits[0].commit as WorkflowRecord).message =
      "chore(deps): generated Dependabot update";
    return fixture;
  };
  const invalid: PolicyFixture[] = [];
  const mutate = (change: (fixture: PolicyFixture) => void) => {
    const fixture = makeNonPolicyFixture();
    change(fixture);
    invalid.push(fixture);
  };

  mutate((fixture) => { fixture.run.id = 43; });
  mutate((fixture) => { (fixture.run.actor as WorkflowRecord).login = "other"; });
  mutate((fixture) => { (fixture.run.repository as WorkflowRecord).full_name = "other/repo"; });
  mutate((fixture) => { (fixture.run.repository as WorkflowRecord).id = 1; });
  mutate((fixture) => { (fixture.event.head as WorkflowRecord).sha = "b".repeat(40); });
  mutate((fixture) => { ((fixture.run.pull_requests as WorkflowRecord[])[0].head as WorkflowRecord).sha = "b".repeat(40); });
  mutate((fixture) => { (fixture.pr.user as WorkflowRecord).login = "other"; });
  mutate((fixture) => { (fixture.pr.head as WorkflowRecord).ref = "dependabot/npm_and_yarn/typescript-stale"; });
  mutate((fixture) => { (fixture.pr.head as WorkflowRecord).sha = "b".repeat(40); });
  mutate((fixture) => { ((fixture.pr.head as WorkflowRecord).repo as WorkflowRecord).full_name = "fork/repo"; });
  mutate((fixture) => { fixture.pr.body = "Maintainer changes:\nChanged by maintainer"; });
  mutate((fixture) => { fixture.pr.commits = 2; fixture.commits.push(structuredClone(fixture.commits[0])); });
  mutate((fixture) => { (fixture.commits[0].author as WorkflowRecord).login = "maintainer"; });
  mutate((fixture) => { ((fixture.commits[0].commit as WorkflowRecord).verification as WorkflowRecord).verified = false; });

  for (const [index, fixture] of invalid.entries()) {
    assertPolicyFailedWithoutOutputs(
      runDependabotPolicy(yaml, fixture),
      `non-policy provenance mutation ${index}`,
    );
  }
});

test("Dependabot trusted policy rejects duplicate dependency names", () => {
  const yaml = workflow("dependabot-auto-merge.yml");
  const fixture = withDependabotMetadataLines(
    makePolicyFixture("runtime-patches", ["hyperframes"]),
    [
      "- dependency-name: hyperframes",
      "  dependency-version: 0.7.77",
      "  dependency-type: direct:production",
      "  update-type: version-update:semver-patch",
      "  dependency-group: runtime-patches",
      "- dependency-name: hyperframes",
      "  dependency-version: 0.7.78",
      "  dependency-type: direct:production",
      "  update-type: version-update:semver-patch",
      "  dependency-group: runtime-patches",
    ],
  );
  const result = runDependabotPolicy(yaml, fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr ?? "", /dependency metadata contains duplicates/);
  assert.equal(result.values.eligible, undefined);
});

test("Dependabot trusted policy rejects dependency-version metadata mutations", () => {
  const yaml = workflow("dependabot-auto-merge.yml");
  const mutations = [
    [
      "missing dependency-version",
      [
        "- dependency-name: hyperframes",
        "  dependency-type: direct:production",
        "  update-type: version-update:semver-patch",
        "  dependency-group: runtime-patches",
      ],
    ],
    [
      "duplicate dependency-version",
      [
        "- dependency-name: hyperframes",
        "  dependency-version: 0.7.77",
        "  dependency-version: 0.7.77",
        "  dependency-type: direct:production",
        "  update-type: version-update:semver-patch",
        "  dependency-group: runtime-patches",
      ],
    ],
    [
      "unknown metadata field",
      [
        "- dependency-name: hyperframes",
        "  dependency-version: 0.7.77",
        "  dependency-type: direct:production",
        "  update-type: version-update:semver-patch",
        "  dependency-group: runtime-patches",
        "  dependency-ecosystem: npm",
      ],
    ],
    [
      "malformed dependency-version scalar",
      [
        "- dependency-name: hyperframes",
        "  dependency-version: [0.7.77]",
        "  dependency-type: direct:production",
        "  update-type: version-update:semver-patch",
        "  dependency-group: runtime-patches",
      ],
    ],
  ] as const;

  for (const [label, lines] of mutations) {
    const fixture = withDependabotMetadataLines(
      makePolicyFixture("runtime-patches", ["hyperframes"]),
      [...lines],
    );
    const result = runDependabotPolicy(yaml, fixture);
    assert.notEqual(result.status, 0, label);
    assert.equal(result.values.eligible, undefined, label);
  }
});

test("Dependabot trusted policy accepts only exact grouped patches", () => {
  const yaml = workflow("dependabot-auto-merge.yml");
  const runtimeNames = [
    ...Object.keys(packageJson.dependencies),
    ...Object.keys(packageJson.optionalDependencies),
  ];
  const devNames = Object.keys(packageJson.devDependencies);
  const valid = [
    makePolicyFixture("runtime-patches", runtimeNames),
    makePolicyFixture("dev-patches", devNames),
    makePolicyFixture("actions-patches", ["actions/checkout", "actions/setup-node"]),
  ];
  for (const fixture of valid) {
    assert.deepEqual(runDependabotPolicy(yaml, fixture), {
      status: 0,
      values: {
        eligible: "true",
        group: String((fixture.commits[0].commit as WorkflowRecord).message).match(/dependency-group: ([^\n]+)/)?.[1] ?? "",
        pr_number: "123",
        expected_head_sha: "a".repeat(40),
      },
    });
  }

  const invalid = [
    makePolicyFixture("runtime-patches", runtimeNames, "version-update:semver-minor"),
    makePolicyFixture("runtime-patches", runtimeNames, "version-update:semver-major"),
    makePolicyFixture("runtime-patches", runtimeNames, "security-update:semver-patch"),
    makePolicyFixture("runtime-patches", [...runtimeNames, "unknown-runtime"]),
    makePolicyFixture("dev-patches", [...devNames, "unknown-development"]),
  ];
  invalid.push(
    setPolicyHead(
      makePolicyFixture("runtime-patches", runtimeNames),
      "dependabot/npm_and_yarn/unknown-patches-abc123",
    ),
  );
  invalid.push(
    setPolicyHead(
      makePolicyFixture("runtime-patches", runtimeNames),
      "dependabot/npm_and_yarn/runtime-patchesevil",
    ),
  );

  for (const fixture of invalid) {
    const result = runDependabotPolicy(yaml, fixture);
    assert.equal(result.status, 0);
    assert.equal(result.values.eligible, "false");
  }

  const empty = makePolicyFixture("runtime-patches", []);
  const emptyResult = runDependabotPolicy(yaml, empty);
  assert.notEqual(emptyResult.status, 0);
  assert.equal(emptyResult.values.eligible, undefined);
});

test("Dependabot trusted policy accepts observed repo id/url/name schema and rejects repository mismatches", () => {
  const yaml = workflow("dependabot-auto-merge.yml");
  const names = [
    ...Object.keys(packageJson.dependencies),
    ...Object.keys(packageJson.optionalDependencies),
  ];
  const fixture = makePolicyFixture("runtime-patches", names);
  const observed = (fixture.run.pull_requests as WorkflowRecord[])[0];
  assert.equal(Object.hasOwn((observed.head as WorkflowRecord).repo as WorkflowRecord, "full_name"), false);
  assert.equal(Object.hasOwn((observed.base as WorkflowRecord).repo as WorkflowRecord, "full_name"), false);

  assert.deepEqual(runDependabotPolicy(yaml, fixture), {
    status: 0,
    values: {
      eligible: "true",
      group: "runtime-patches",
      pr_number: "123",
      expected_head_sha: "a".repeat(40),
    },
  });

  const observedRepoMutations = [
    (repo: WorkflowRecord) => { repo.id = 1; },
    (repo: WorkflowRecord) => { repo.url = "https://api.github.com/repos/therealhieu/other"; },
    (repo: WorkflowRecord) => { repo.name = "other"; },
  ];
  for (const mutateRepo of observedRepoMutations) {
    for (const side of ["head", "base"] as const) {
      const wrongObservedRepository = makePolicyFixture("runtime-patches", names);
      const observed = (wrongObservedRepository.run.pull_requests as WorkflowRecord[])[0];
      mutateRepo((observed[side] as WorkflowRecord).repo as WorkflowRecord);
      const observedResult = runDependabotPolicy(yaml, wrongObservedRepository);
      assert.notEqual(observedResult.status, 0);
      assert.equal(observedResult.values.eligible, undefined);
    }
  }

  const mismatchedObservedRepositories = makePolicyFixture("runtime-patches", names);
  (((mismatchedObservedRepositories.run.pull_requests as WorkflowRecord[])[0].base as WorkflowRecord).repo as WorkflowRecord).id = 1;
  const mismatchResult = runDependabotPolicy(yaml, mismatchedObservedRepositories);
  assert.notEqual(mismatchResult.status, 0);
  assert.equal(mismatchResult.values.eligible, undefined);

  const wrongTrustedRepositoryId = makePolicyFixture("runtime-patches", names);
  (wrongTrustedRepositoryId.run.repository as WorkflowRecord).id = 1;
  const trustedIdResult = runDependabotPolicy(yaml, wrongTrustedRepositoryId);
  assert.notEqual(trustedIdResult.status, 0);
  assert.equal(trustedIdResult.values.eligible, undefined);

  const wrongTrustedRepositoryUrl = makePolicyFixture("runtime-patches", names);
  (wrongTrustedRepositoryUrl.run.repository as WorkflowRecord).url = "https://api.github.com/repos/therealhieu/other";
  const trustedUrlResult = runDependabotPolicy(yaml, wrongTrustedRepositoryUrl);
  assert.notEqual(trustedUrlResult.status, 0);
  assert.equal(trustedUrlResult.values.eligible, undefined);

  const wrongLiveRepository = makePolicyFixture("runtime-patches", names);
  ((wrongLiveRepository.pr.base as WorkflowRecord).repo as WorkflowRecord).full_name = "fork/repo";
  const liveResult = runDependabotPolicy(yaml, wrongLiveRepository);
  assert.notEqual(liveResult.status, 0);
  assert.equal(liveResult.values.eligible, undefined);
});

test("Dependabot trusted policy rejects stale or unverified PR state", () => {
  const yaml = workflow("dependabot-auto-merge.yml");
  const names = Object.keys(packageJson.dependencies);
  const invalid: PolicyFixture[] = [];
  const mutate = (change: (fixture: PolicyFixture) => void) => {
    const fixture = makePolicyFixture("runtime-patches", names);
    change(fixture);
    invalid.push(fixture);
  };
  mutate((fixture) => { fixture.run.id = 43; });
  mutate((fixture) => { (fixture.run.actor as WorkflowRecord).login = "other"; });
  mutate((fixture) => { (fixture.run.repository as WorkflowRecord).full_name = "other/repo"; });
  mutate((fixture) => { fixture.run.event = "push"; });
  mutate((fixture) => { fixture.run.name = "Other workflow"; });
  mutate((fixture) => { fixture.run.conclusion = "failure"; });
  mutate((fixture) => { fixture.event.number = 124; });
  mutate((fixture) => { (fixture.event.head as WorkflowRecord).ref = "dependabot/npm_and_yarn/other"; });
  mutate((fixture) => { (fixture.event.head as WorkflowRecord).sha = "b".repeat(40); });
  mutate((fixture) => { delete fixture.run.pull_requests; });
  mutate((fixture) => { fixture.run.pull_requests = []; });
  mutate((fixture) => { (fixture.run.pull_requests as WorkflowRecord[]).push(structuredClone((fixture.run.pull_requests as WorkflowRecord[])[0])); });
  mutate((fixture) => { ((fixture.run.pull_requests as WorkflowRecord[])[0] as WorkflowRecord).number = "123"; });
  mutate((fixture) => { ((fixture.run.pull_requests as WorkflowRecord[])[0] as WorkflowRecord).number = 124; });
  mutate((fixture) => { ((fixture.run.pull_requests as WorkflowRecord[])[0].head as WorkflowRecord).sha = "b".repeat(40); });
  mutate((fixture) => { (fixture.pr.user as WorkflowRecord).login = "other"; });
  mutate((fixture) => { (fixture.pr.base as WorkflowRecord).ref = "develop"; });
  mutate((fixture) => { (fixture.pr.head as WorkflowRecord).ref = "dependabot/npm_and_yarn/runtime-patches-stale"; });
  mutate((fixture) => { (fixture.pr.head as WorkflowRecord).sha = "b".repeat(40); });
  mutate((fixture) => { ((fixture.pr.head as WorkflowRecord).repo as WorkflowRecord).full_name = "fork/repo"; });
  mutate((fixture) => { fixture.pr.body = "Maintainer changes:\nChanged by maintainer"; });
  mutate((fixture) => { fixture.pr.commits = 2; fixture.commits.push(structuredClone(fixture.commits[0])); });
  mutate((fixture) => { (fixture.commits[0].author as WorkflowRecord).login = "maintainer"; });
  mutate((fixture) => { ((fixture.commits[0].commit as WorkflowRecord).verification as WorkflowRecord).verified = false; });
  mutate((fixture) => { fixture.commits[0].sha = "b".repeat(40); });

  for (const [index, fixture] of invalid.entries()) {
    assertPolicyFailedWithoutOutputs(
      runDependabotPolicy(yaml, fixture),
      `exact-policy provenance mutation ${index}`,
    );
  }
});

test("Dependabot observer rejects authority and execution broadening", () => {
  const yaml = workflow("dependabot-auto-merge-observer.yml");
  const mutations = [
    yaml.replace("github.actor == 'dependabot[bot]'", "github.actor != ''"),
    yaml.replace("github.repository == 'therealhieu/md2vid'", "github.repository != ''"),
    yaml.replace("github.event.pull_request.user.login == 'dependabot[bot]'", "github.event.pull_request.user.login != ''"),
    yaml.replace("github.event.pull_request.base.ref == 'main'", "github.event.pull_request.base.ref != ''"),
    yaml.replace("permissions: {}", "permissions: { contents: write }"),
    yaml.replace('run: "true"', "uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # v4"),
    yaml.replace('run: "true"', "run: node ./evil.mjs"),
    yaml.replace("      - name: Complete observation", "      - run: gh api --method POST /user/repos\n      - name: Complete observation"),
  ];
  for (const [index, mutated] of mutations.entries()) {
    assert.notEqual(mutated, yaml, `observer mutation ${index} must modify workflow`);
    assert.throws(() => assertDependabotObserverPolicy(mutated));
  }
});

test("Dependabot privileged workflow rejects every broadened boundary", () => {
  const yaml = workflow("dependabot-auto-merge.yml");
  const mutations = [
    yaml.replace("workflow_run:", "pull_request:"),
    yaml.replace("Dependabot auto-merge observer", "Other observer"),
    yaml.replace("types:\n      - completed", "types:\n      - requested"),
    yaml.replace("github.repository == 'therealhieu/md2vid'", "github.repository != ''"),
    yaml.replace("github.event.workflow_run.event == 'pull_request'", "github.event.workflow_run.event != ''"),
    yaml.replace("github.event.workflow_run.conclusion == 'success'", "github.event.workflow_run.conclusion != ''"),
    yaml.replace("github.event.workflow_run.actor.login == 'dependabot[bot]'", "github.event.workflow_run.actor.login != ''"),
    yaml.replace("cancel-in-progress: true", "cancel-in-progress: false"),
    yaml.replace("pull-requests: write", "actions: write\n      pull-requests: write"),
    yaml.replace("      - name: Fetch trusted observer and PR state", "      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # v4\n      - name: Fetch trusted observer and PR state"),
    yaml.replace("      - name: Fetch trusted observer and PR state", "      - uses: ./.github/actions/local\n      - name: Fetch trusted observer and PR state"),
    yaml.replace("      - name: Fetch trusted observer and PR state", "      - run: gh api --method DELETE repos/therealhieu/md2vid\n      - name: Fetch trusted observer and PR state"),
    yaml.replace("      - name: Fetch trusted observer and PR state", "      - run: node ./evil.mjs\n      - name: Fetch trusted observer and PR state"),
    yaml.replace("gh api --method GET \"repos/$REPOSITORY/actions/runs/$RUN_ID\" > \"$RUN_FILE\"", "gh api --method GET \"repos/$REPOSITORY/actions/runs/$RUN_ID\" > \"$RUN_FILE\"\n          gh api --method GET \"repos/$REPOSITORY/actions/runs/$RUN_ID/pull_requests\" > \"$STATE_DIR/associated.json\""),
    yaml.replace("--method GET \"repos/$REPOSITORY/actions/runs/$RUN_ID\"", "--method POST \"repos/$REPOSITORY/actions/runs/$RUN_ID\""),
    yaml.replace("const patchUpdateType = \"version-update:semver-patch\";", "const patchUpdateType = \"security-update:semver-patch\";"),
    yaml.replace("(dependency-version|dependency-type|update-type|dependency-group)", "(dependency-type|update-type|dependency-group)"),
    yaml.replace("[\"dependency-group\", \"dependency-name\", \"dependency-type\", \"dependency-version\", \"update-type\"]", "[\"dependency-group\", \"dependency-name\", \"dependency-type\", \"update-type\"]"),
    yaml.replace("runtime-patches(?:-[a-z0-9]+)?$", "(?:runtime-patches|other)(?:-[a-z0-9]+)?$"),
    yaml.replace(
      '            {\n              group: "actions-patches",',
      '            {\n              group: "react-family",\n              branch: /^dependabot\\/npm_and_yarn\\/react-family(?:-[a-z0-9]+)?$/,\n              allowed: new Set(["react", "react-dom"]),\n            },\n            {\n              group: "actions-patches",',
    ),
    yaml.replace('"remotion"]);', '"remotion", "left-pad"]);'),
    yaml.replace("      - name: Revalidate live head", "      - name: Create workflow review side effect\n        if: steps.policy.outputs.eligible == 'true'\n        shell: bash\n        env:\n          GH_TOKEN: ${{ github.token }}\n          REPOSITORY: therealhieu/md2vid\n          PR_NUMBER: ${{ steps.policy.outputs.pr_number }}\n          EXPECTED_HEAD_SHA: ${{ steps.policy.outputs.expected_head_sha }}\n        run: gh pr review \"$PR_NUMBER\" --approve\n\n      - name: Revalidate live head"),
    yaml.replace("current_head=$(gh api --method GET \"repos/$REPOSITORY/pulls/$PR_NUMBER\" --jq .head.sha)", "current_head=$(gh api --method POST \"repos/$REPOSITORY/pulls/$PR_NUMBER/reviews\" -f event=APPROVE)"),
    yaml.replace("gh pr merge \"$PR_NUMBER\" --repo \"$REPOSITORY\" --auto --squash", "gh pr review \"$PR_NUMBER\" --approve\n          gh pr merge \"$PR_NUMBER\" --repo \"$REPOSITORY\" --auto --squash"),
    yaml.replace("--match-head-commit \"$EXPECTED_HEAD_SHA\"", "--match-head-commit \"$EXPECTED_HEAD_SHA\" --delete-branch"),
    yaml.replace("--match-head-commit \"$EXPECTED_HEAD_SHA\"", ""),
    yaml.replace("steps.policy.outputs.eligible == 'true'", "always()"),
    yaml.replace("      - name: Revalidate live head", "      - name: Notify side channel\n        run: gh api --method POST repos/therealhieu/md2vid/issues\n      - name: Revalidate live head"),
    yaml.replace("set -euo pipefail", "set +e"),
  ];
  for (const [index, mutated] of mutations.entries()) {
    assert.throws(
      () => assertDependabotAutoMergePolicy(mutated),
      `privileged mutation ${index} was accepted`,
    );
  }
});

test("nightly policy rejects missing or unsupported runners, extra audits, write authority, and cancellation", () => {
  const yaml = workflow("nightly.yml");
  const mutations = [
    yaml.replace(", macos-latest", ""),
    yaml.replace(
      "runner: [ubuntu-latest, macos-latest]",
      "runner: [ubuntu-latest, macos-latest, windows-latest]",
    ),
    yaml.replace(
      "        runner: [ubuntu-latest, macos-latest]",
      "        runner: [ubuntu-latest, macos-latest]\n        include:\n          - runner: windows-2025",
    ),
    yaml.replace(
      "        runner: [ubuntu-latest, macos-latest]",
      "        runner: [ubuntu-latest, macos-latest]\n      # matrix comment\n        include:\n          - runner: windows-2025",
    ),
    yaml.replace(
      "        runner: [ubuntu-latest, macos-latest]",
      "        runner: [ubuntu-latest, macos-latest]\n      # matrix comment\n        exclude:\n          - runner: macos-latest",
    ),
    yaml.replace(
      "        runner: [ubuntu-latest, macos-latest]",
      "        runner: [ubuntu-latest, macos-latest]\n      # matrix comment\n        architecture: [x64]",
    ),
    yaml.replace(
      "      runner: ${{ matrix.runner }}",
      "      # runner: ${{ matrix.runner }}\n      runner: macos-14",
    ),
    yaml.replace(
      "      runner: ${{ matrix.runner }}",
      "      &runner-input runner: windows-latest",
    ),
    yaml.replace(
      "      runner: ${{ matrix.runner }}",
      '      "runner": windows-latest',
    ),
    yaml.replace("      mode: full", "      mode: full\n      audit: false"),
    yaml.replace("permissions: {}", "permissions: { actions: write }"),
    yaml.replace("cancel-in-progress: false", "cancel-in-progress: true"),
  ];

  for (const mutated of mutations) {
    assert.throws(
      () => assertNightlyPolicy(mutated),
      /match|permission|audit|cancel|runner|windows|macos|false|contents/i,
    );
  }
});

test("reusable validation declares the exact read-only workflow_call contract", () => {
  const yaml = workflow("validate.yml");
  assert.match(yaml, /^name: Reusable validation$/m);
  assert.match(yaml, /on:\s*\n\s+workflow_call:/);
  for (const input of ["runner", "node-version", "mode"]) {
    assert.match(yaml, new RegExp(`${input}:\\n\\s+required: true\\n\\s+type: string`));
  }
  assert.match(yaml, /audit:\s*\n\s+required: false\s*\n\s+default: false\s*\n\s+type: boolean/);
  assert.match(yaml, /^permissions:\s*\n\s+contents: read$/m);
  assert.match(jobBody(yaml, "validate"), /runs-on:\s*\$\{\{ inputs\.runner \}\}/);
  assert.match(stepBody(yaml, "Check out source"), /fetch-depth:\s*0/);
});

test("workflow contracts accept immutable Action major-version comments", () => {
  const source = workflow("validate.yml");
  const mutated = source.replace(
    "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0",
    "actions/setup-node@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # v8.0.0",
  );
  assert.notEqual(mutated, source, "major-version mutation must modify the workflow");
  assert.doesNotThrow(() => assertValidationSetupNodePin(mutated));
});

test("reusable validation installs and verifies the packageManager npm pin in order", () => {
  const yaml = workflow("validate.yml");
  assertValidationNpmOrdering(yaml);
  const setup = stepBody(yaml, "Set up exact Node");
  const install = stepBody(yaml, "Install pinned npm");
  assertValidationSetupNodePin(yaml);
  assert.match(setup, /node-version:\s*\$\{\{ inputs\.node-version \}\}/);
  assert.match(setup, /cache:\s*npm/);
  assert.match(install, /package_manager=\$\(node -p "require\('\.\/package\.json'\)\.packageManager"\)/);
  assert.match(install, /expected=\$\{package_manager#npm@\}/);
  assert.match(install, /npm install --global "\$package_manager"/);
  assert.match(install, /test "\$\(npm --version\)" = "\$expected"/);
  assert.match(install, /test "\$expected" = "11\.15\.0"/);
  assert.match(stepBody(yaml, "Install dependencies"), /run:\s*npm ci/);
});

test("reusable validation provisions Linux media tools before render-capable modes", () => {
  const assertMediaToolsPolicy = (yaml: string) => {
    const { value } = parseWorkflow(yaml);
    const steps = parsedSteps(parsedJob(value, "validate"), "validate");
    const mediaIndex = steps.findIndex((step) => step.name === "Install Linux media tools");
    const validationIndex = steps.findIndex((step) => step.name === "Run requested validation");
    assert.notEqual(mediaIndex, -1, "missing Linux media-tools step");
    assert.notEqual(validationIndex, -1, "missing requested-validation step");
    assert.ok(mediaIndex < validationIndex, "media tools must precede render-capable validation");

    const mediaTools = steps[mediaIndex];
    assert.equal(
      mediaTools.if,
      "runner.os == 'Linux' && (inputs.mode == 'full' || inputs.mode == 'public-snapshot')",
    );
    assert.equal(mediaTools.shell, "bash");
    assert.equal(typeof mediaTools.run, "string");
    assert.match(mediaTools.run as string, /sudo apt-get update/);
    assert.match(mediaTools.run as string, /sudo apt-get install --yes ffmpeg/);
    assert.match(mediaTools.run as string, /command -v ffmpeg/);
    assert.match(mediaTools.run as string, /command -v ffprobe/);
  };

  const yaml = workflow("validate.yml");
  assertMediaToolsPolicy(yaml);
  for (const mutated of [
    yaml.replace("        if: runner.os", "        # if: runner.os"),
    yaml.replace("runner.os == 'Linux'", "runner.os == 'Windows'"),
    yaml.replace("inputs.mode == 'full'", "inputs.mode == 'fast'"),
    yaml.replace("inputs.mode == 'public-snapshot'", "inputs.mode == 'fast'"),
  ]) {
    assert.notEqual(mutated, yaml, "media-tools policy mutation must modify the workflow");
    assert.throws(() => assertMediaToolsPolicy(mutated), /if|Linux|Windows|full|public-snapshot|fast/);
  }
});

test("reusable validation supports fast and full modes with narrow diagnostics", () => {
  const yaml = workflow("validate.yml");
  const validation = stepBody(yaml, "Run requested validation");
  const diagnostics = stepBody(yaml, "Upload sanitized release diagnostics");
  assertNoShellExpression(yaml, /\$\{\{\s*inputs\.mode\s*\}\}/);
  assert.match(validation, /env:\s*\n\s+MODE:\s*\$\{\{ inputs\.mode \}\}/);
  assert.match(validation, /case "\$MODE"/);
  assert.match(stepBody(yaml, "Record toolchain"), /MODE:\s*\$\{\{ inputs\.mode \}\}/);
  assert.match(stepBody(yaml, "Record toolchain"), /Mode: \$MODE/);
  assertValidateUploads(yaml);
  assert.match(validation, /MD2VID_DIAGNOSTICS_DIR:\s*release-diagnostics/);
  assert.match(validation, /fast\) npm run check ;;/);
  assert.match(validation, /full\) npm run release:check ;;/);
  assert.match(validation, /public-snapshot\) corepack npm run public:snapshot:check ;;/);
  assert.match(validation, /\*\) echo "unsupported validation mode" >&2; exit 2 ;;/);
  assert.match(diagnostics, /if:\s*failure\(\) && inputs\.mode == 'full'/);
  assert.match(diagnostics, /actions\/upload-artifact@[a-f0-9]{40}\s+# v\d+(?:\.\d+)*/);
  assert.match(diagnostics, /name:\s*release-diagnostics-\$\{\{ inputs\.runner \}\}-\$\{\{ github\.run_id \}\}/);
  assert.match(diagnostics, /path:\s*release-diagnostics/);
  assert.doesNotMatch(diagnostics, /path:\s*[.~/$]|HOME|npmrc|workspace/i);
  assert.match(diagnostics, /if-no-files-found:\s*ignore/);
  assert.match(diagnostics, /retention-days:\s*14/);
  assert.match(stepBody(yaml, "Enforce production audit policy"), /if:\s*inputs\.audit[\s\S]*run:\s*npm run security:audit/);
  assert.match(stepBody(yaml, "Record toolchain"), /if:\s*always\(\)[\s\S]*Node:[\s\S]*npm:[\s\S]*Mode:/);
});

test("portable npm steps use runner defaults while bash-only steps opt into bash", () => {
  const yaml = workflow("validate.yml");
  assert.match(stepBody(yaml, "Install pinned npm"), /shell:\s*bash/);
  assert.match(stepBody(yaml, "Run requested validation"), /shell:\s*bash/);
  assert.match(stepBody(yaml, "Record toolchain"), /shell:\s*bash/);
  assert.doesNotMatch(stepBody(yaml, "Install dependencies"), /shell:/);
  assert.doesNotMatch(stepBody(yaml, "Enforce production audit policy"), /shell:/);
});

test("CI triggers only for pull requests and pushes to main with stable concurrency", () => {
  const yaml = workflow("ci.yml");
  assert.match(yaml, /^name: CI$/m);
  assert.match(yaml, /on:\s*\n\s+pull_request:\s*\n\s+push:\s*\n\s+branches:\s*\[main\]/);
  assert.match(yaml, /^permissions:\s*\n\s+contents: read$/m);
  assert.match(yaml, /group:\s*\$\{\{ github\.event_name == 'pull_request' && format\('ci-pr-\{0\}', github\.event\.pull_request\.number\) \|\| 'ci-main' \}\}/);
  assert.match(yaml, /cancel-in-progress:\s*true/);
});

test("CI enforces the fresh public snapshot gate on Ubuntu only", () => {
  const yaml = workflow("ci.yml");
  assertPublicSnapshotPolicy(yaml);
  assert.equal((yaml.match(/mode:\s*public-snapshot/g) ?? []).length, 1);

  const windowsRunner = yaml.replace("runner: ubuntu-latest", "runner: windows-latest");
  assert.notEqual(windowsRunner, yaml, "public snapshot runner mutation must modify the workflow");
  assert.throws(
    () => assertPublicSnapshotPolicy(windowsRunner),
    /ubuntu|windows|match/i,
  );

  const commentDecoy = yaml.replace(
    "      runner: ubuntu-latest",
    "      # runner: ubuntu-latest\n      runner: macos-latest",
  );
  assert.notEqual(commentDecoy, yaml, "public snapshot comment-decoy mutation must modify the workflow");
  assert.throws(
    () => assertPublicSnapshotPolicy(commentDecoy),
    /ubuntu|macos|match|deep-equal/i,
  );

  for (const decoratedRunner of [
    yaml.replace("      runner: ubuntu-latest", "      &runner-input runner: windows-latest"),
    yaml.replace("      runner: ubuntu-latest", '      "runner": windows-latest'),
  ]) {
    assert.notEqual(decoratedRunner, yaml, "public snapshot decorated runner mutation must modify the workflow");
    assert.throws(
      () => assertPublicSnapshotPolicy(decoratedRunner),
      /ubuntu|windows|deep-equal|strictly equal/i,
    );
  }
});

test("CI resolves latest Node exactly once and exports the exact version", () => {
  const yaml = workflow("ci.yml");
  assert.equal((yaml.match(/^  resolve-latest-node:$/gm) ?? []).length, 1);
  const resolver = jobBody(yaml, "resolve-latest-node", "pr-title");
  assert.match(resolver, /runs-on:\s*ubuntu-latest/);
  assert.match(resolver, /permissions:\s*\{\}/);
  assert.match(resolver, /node-version:\s*node/);
  assert.match(resolver, /version=\$\(node -p 'process\.versions\.node'\)/);
  assert.match(resolver, /version:\s*\$\{\{ steps\.node\.outputs\.version \}\}/);
  assert.equal((yaml.match(/node-version:\s*node\s*$/gm) ?? []).length, 1);
});

test("CI validates PR titles without shell interpolation", () => {
  const yaml = workflow("ci.yml");
  const title = jobBody(yaml, "pr-title", "dependency-review");
  assert.match(title, /if:\s*github\.event_name == 'pull_request'/);
  assert.match(title, /permissions:\s*\{\}/);
  assert.match(title, /env:\s*\n\s+PR_TITLE:\s*\$\{\{ github\.event\.pull_request\.title \}\}/);
  assertNoShellExpression(title, /\$\{\{\s*github\.event\.pull_request\.title\s*\}\}/);
  assert.match(title, /test "\$\{#PR_TITLE\}" -le 72/);
  assert.ok(
    title.includes(
      '[[ "$PR_TITLE" =~ ^(feat|fix|docs|test|refactor|chore|ci|build)(\\([a-z0-9._-]+\\))?:[[:space:]][^[:space:]].*$ ]]',
    ),
  );
  assert.match(title, /\[\[ ! "\$PR_TITLE" =~ \[\[:punct:\]\]\$ \]\]/);
  assert.doesNotMatch(title, /\(feat\|fix\|docs\|test\|refactor\|chore\|ci\|build\)\??!:/);
});

test("CI performs high-severity dependency review only on pull requests", () => {
  const yaml = workflow("ci.yml");
  const review = jobBody(yaml, "dependency-review", "pr-minimum");
  assert.match(review, /if:\s*github\.event_name == 'pull_request'/);
  assert.match(review, /permissions:\s*\n\s+contents: read/);
  assert.match(review, /actions\/dependency-review-action@[a-f0-9]{40}\s+# v5\.0\.0/);
  assert.match(review, /fail-on-severity:\s*high/);
});

test("CI runs minimum and resolved-latest PR checks plus full main validation", () => {
  const yaml = workflow("ci.yml");
  const minimum = jobBody(yaml, "pr-minimum", "pr-latest");
  const latest = jobBody(yaml, "pr-latest", "main-full");
  const main = jobBody(yaml, "main-full");

  for (const body of [minimum, latest, main]) {
    assert.match(body, /uses:\s*\.\/\.github\/workflows\/validate\.yml/);
    assert.match(body, /permissions:\s*\n\s+contents: read/);
    assert.match(body, /runner:\s*ubuntu-latest/);
    assert.match(body, /audit:\s*false/);
  }

  assert.match(minimum, /if:\s*github\.event_name == 'pull_request'/);
  assert.match(minimum, /node-version:\s*22\.18\.0/);
  assert.match(minimum, /mode:\s*fast/);

  assert.match(latest, /if:\s*github\.event_name == 'pull_request'/);
  assert.match(latest, /needs:\s*resolve-latest-node/);
  assert.match(latest, /node-version:\s*\$\{\{ needs\.resolve-latest-node\.outputs\.version \}\}/);
  assert.match(latest, /mode:\s*fast/);

  assert.match(main, /if:\s*github\.event_name == 'push'/);
  assert.match(main, /needs:\s*resolve-latest-node/);
  assert.match(main, /node-version:\s*\$\{\{ needs\.resolve-latest-node\.outputs\.version \}\}/);
  assert.match(main, /mode:\s*full/);
});

test("policy helpers reject unsafe workflow mutations", () => {
  const validate = workflow("validate.yml");
  const ci = workflow("ci.yml");

  const reorderedNpm = validate
    .replace("      - name: Install pinned npm", "      - name: Temporary npm step")
    .replace("      - name: Install dependencies", "      - name: Install pinned npm")
    .replace("      - name: Temporary npm step", "      - name: Install dependencies");
  assert.throws(() => assertValidationNpmOrdering(reorderedNpm), /npm|order|pinned/i);

  const interpolatedTitle = ci.replace(
    '          test "${#PR_TITLE}" -le 72',
    '          echo "${{ github.event.pull_request.title }}"\n          test "${#PR_TITLE}" -le 72',
  );
  assert.throws(
    () => assertNoShellExpression(jobBody(interpolatedTitle, "pr-title", "dependency-review"), /\$\{\{\s*github\.event\.pull_request\.title\s*\}\}/),
    /match|expression/i,
  );

  const broadUploader = validate.replace(
    "      - name: Record toolchain",
    "      - name: Upload workspace\n        if: always()\n        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4\n        with:\n          path: .\n      - name: Record toolchain",
  );
  assert.throws(() => assertValidateUploads(broadUploader), /upload|exactly|path|failure/i);

  const arbitraryWrite = ci.replace("permissions: {}", "permissions: { actions: write }");
  assert.throws(() => assertReadOnlyPermissions(arbitraryWrite), /permission|write|contents/i);

  const nonVersionComment = validate.replace(/# v\d+(?:\.\d+)*/, "# latest");
  assert.notEqual(nonVersionComment, validate, "non-version comment mutation must modify the workflow");
  assert.throws(() => assertPinnedUses(nonVersionComment), /version comment|full SHA/i);
});

test("shell-source policy rejects inline and folded expression mutations", () => {
  const titleExpression = /\$\{\{\s*github\.event\.pull_request\.title\s*\}\}/;
  const modeExpression = /\$\{\{\s*inputs\.mode\s*\}\}/;
  const inlineTitle = `${jobBody(workflow("ci.yml"), "pr-title", "dependency-review")}\n      - name: Unsafe inline title\n        run: echo "${"${{ github.event.pull_request.title }}"}"`;
  const foldedTitle = `${jobBody(workflow("ci.yml"), "pr-title", "dependency-review")}\n      - name: Unsafe folded title\n        run: >-\n          echo "${"${{ github.event.pull_request.title }}"}"`;
  const inlineMode = `${workflow("validate.yml")}\n      - name: Unsafe inline mode\n        run: echo "${"${{ inputs.mode }}"}"`;
  const foldedMode = `${workflow("validate.yml")}\n      - name: Unsafe folded mode\n        run: >+\n          echo "${"${{ inputs.mode }}"}"`;

  assert.throws(() => assertNoShellExpression(inlineTitle, titleExpression), /match|expression/i);
  assert.throws(() => assertNoShellExpression(foldedTitle, titleExpression), /match|expression/i);
  assert.throws(() => assertNoShellExpression(inlineMode, modeExpression), /match|expression/i);
  assert.throws(() => assertNoShellExpression(foldedMode, modeExpression), /match|expression/i);

  for (const indicator of ["|", "|-", "|+", ">", ">-", ">+"]) {
    const mutated = `steps:\n  - name: Unsafe scalar ${indicator}\n    run: ${indicator}\n      echo "${"${{ inputs.mode }}"}"`;
    assert.throws(() => assertNoShellExpression(mutated, modeExpression), /match|expression/i, `scanner missed run: ${indicator}`);
  }
});

test("shell-source policy accepts block indicators in either order with comments", () => {
  const titleExpression = /\$\{\{\s*github\.event\.pull_request\.title\s*\}\}/;
  const modeExpression = /\$\{\{\s*inputs\.mode\s*\}\}/;
  const mutations = [
    { header: "|2-", expression: titleExpression },
    { header: "|-2", expression: modeExpression },
    { header: ">+2", expression: titleExpression },
    { header: ">2+", expression: modeExpression },
    { header: "| # comment", expression: titleExpression },
  ];

  for (const { header, expression } of mutations) {
    const mutated = `steps:\n  - name: Unsafe scalar ${header}\n    run: ${header}\n      echo "${"${{ github.event.pull_request.title }}"}"\n      echo "${"${{ inputs.mode }}"}"`;
    assert.throws(() => assertNoShellExpression(mutated, expression), /match|expression/i, `scanner missed run: ${header}`);
  }

  for (const header of ["|22", "|+-", "|0", ">2-+", "| comment"]) {
    const malformed = `steps:\n  - name: Malformed scalar ${header}\n    run: ${header}\n      echo safe`;
    assert.throws(() => runBlocks(malformed), /malformed|header/i, `malformed header was accepted: ${header}`);
  }
});

function assertDependabotBranchRefreshPolicy(yaml: string): void {
  const { value } = parseWorkflow(yaml);
  assert.equal(value.name, "Dependabot branch refresh");
  assert.deepEqual(value.on, {
    schedule: [{ cron: "17 5 * * *" }],
    workflow_dispatch: null,
  });
  assert.deepEqual(value.permissions, {});
  assert.deepEqual(value.concurrency, {
    group: "dependabot-branch-refresh",
    "cancel-in-progress": false,
  });
  exactKeys(value, ["name", "on", "permissions", "concurrency", "jobs"]);

  const jobs = asRecord(value.jobs, "jobs");
  exactKeys(jobs, ["refresh-one"]);
  const job = asRecord(jobs["refresh-one"], "refresh-one");
  assert.equal(job["runs-on"], "ubuntu-latest");
  assert.deepEqual(job.permissions, {});
  exactKeys(job, ["runs-on", "permissions", "steps"]);

  const steps = parsedSteps(job, "refresh-one");
  assert.deepEqual(steps.map((step) => step.name), [
    "Initialize refresh summary",
    "Create repository-scoped App token",
    "Inventory open pull requests",
    "Select patch-group queue head",
    "Fetch queue-head state",
    "Validate queue-head policy",
    "Refresh queue-head branch",
    "Summarize branch refresh",
  ]);

  const token = steps[1];
  exactKeys(token, ["name", "id", "uses", "with"]);
  assert.equal(token.id, "app-token");
  assert.equal(
    String(token.uses),
    "actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349",
  );
  assert.match(
    yaml,
    /uses:\s+actions\/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349\s+# v2\.2\.2/,
  );
  assert.deepEqual(token.with, {
    "app-id": "${{ vars.DEPENDABOT_REFRESH_APP_ID }}",
    "private-key": "${{ secrets.DEPENDABOT_REFRESH_APP_PRIVATE_KEY }}",
    owner: "therealhieu",
    repositories: "md2vid",
  });
  assert.equal(Object.hasOwn(token, "continue-on-error"), false);

  for (const [index, step] of steps.entries()) {
    const run = String(step.run ?? "");
    assert.equal(Object.hasOwn(step, "continue-on-error"), false, `step ${index + 1} must fail closed`);
    if (/\bgh api\b/.test(run)) {
      assert.deepEqual(
        asRecord(step.env, `step ${index + 1} env`).GH_TOKEN,
        "${{ steps.app-token.outputs.token }}",
      );
    }
  }

  const uses = [...yaml.matchAll(/^\s+uses:\s+(.+)$/gm)].map((match) => match[1].trim());
  assert.deepEqual(uses, [
    "actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349 # v2.2.2",
  ]);

  const forbidden = /\$\{\{\s*github\.token\s*\}\}|\$\{\{\s*secrets\.(?:GITHUB|GH|PAT|PERSONAL_ACCESS|DEPENDABOT_REFRESH_TOKEN)[A-Z0-9_]*\s*\}\}|actions\/checkout@|uses:\s+\.\/|actions\/(?:upload-artifact|download-artifact|cache)@|\bnpm\s+|\bcorepack\b|node_modules|dist\/bin|node\s+scripts\/|gh\s+pr\s+review|event=APPROVE|reviews\b|gh\s+pr\s+merge|\/merge\b|--admin|enablePullRequestAutoMerge/i;
  assert.doesNotMatch(yaml, forbidden);

  for (const marker of [
    "runtime-patches",
    "dev-patches",
    "actions-patches",
    "__typename",
    "github-actions",
    "https://github.com/apps/github-actions",
    "SQUASH",
    "disablePullRequestAutoMerge",
    "updatePullRequestBranch",
    "updateMethod: REBASE",
    "expectedHeadOid",
  ]) {
    assert.equal(yaml.includes(marker), true, `missing refresh marker ${marker}`);
  }
  assert.ok(
    yaml.indexOf("disablePullRequestAutoMerge") < yaml.indexOf("updatePullRequestBranch"),
    "refresh must disable old auto-merge before updating the branch",
  );
  assert.equal(yaml.includes("updateMethod: MERGE"), false);

  const uniqueReasons = [...new Set([...yaml.matchAll(/"(no-candidates|queue-head-not-behind|queue-head-missing-auto-merge|queue-head-invalid|selected-for-rebase|auto-merge-disable-failed|head-changed|rebase-failed|app-token-unavailable)"/g)].map((match) => match[1]))].sort();
  assert.deepEqual(uniqueReasons, [
    "app-token-unavailable",
    "auto-merge-disable-failed",
    "head-changed",
    "no-candidates",
    "queue-head-invalid",
    "queue-head-missing-auto-merge",
    "queue-head-not-behind",
    "rebase-failed",
    "selected-for-rebase",
  ]);

  const queue = stepBody(yaml, "Select patch-group queue head");
  assert.match(queue, /created_at/);
  assert.match(queue, /number/);
  assert.match(queue, /candidate=false/);
  assert.doesNotMatch(queue, /react-family|react-types-family|remotion-family|patchesevil/);

  const state = stepBody(yaml, "Fetch queue-head state");
  assert.match(state, /if:\s*steps\.queue\.outputs\.candidate == 'true'/);
  assert.match(state, /repos\/\$REPOSITORY\/pulls\/\$PR_NUMBER" > "\$PR_FILE"/);
  assert.match(state, /repos\/\$REPOSITORY\/pulls\/\$PR_NUMBER\/commits\?per_page=100" > "\$COMMITS_FILE"/);
  assert.match(state, /baseRepository \{ id nameWithOwner url \}/);
  assert.match(state, /headRepository \{ id nameWithOwner url \}/);
  assert.match(state, /enabledBy \{ __typename login url \}/);

  const policy = refreshPolicyScript(yaml);
  assert.match(policy, /id: 1309960592/);
  assert.match(policy, /fullName: "therealhieu\/md2vid"/);
  assert.match(policy, /apiUrl: "https:\/\/api\.github\.com\/repos\/therealhieu\/md2vid"/);
  assert.match(policy, /id: "R_kgDOThQpsA"/);
  assert.match(policy, /nameWithOwner: "therealhieu\/md2vid"/);
  assert.match(policy, /url: "https:\/\/github\.com\/therealhieu\/md2vid"/);
  assert.match(policy, /version-update:semver-patch/);
  assert.match(policy, /"dependency-group", "dependency-name", "dependency-type", "dependency-version", "update-type"/);
  assert.match(policy, /autoMergeRequest\.mergeMethod !== "SQUASH"/);
  assert.match(policy, /enabledBy\?\.__typename !== "Bot"/);
  assert.match(policy, /enabledBy\?\.login !== "github-actions"/);
  assert.match(policy, /enabledBy\?\.url !== "https:\/\/github\.com\/apps\/github-actions"/);
  assert.match(policy, /mergeStateStatus !== "BEHIND"/);
  const setValues = (name: string): string[] => {
    const match = policy.match(new RegExp(`const ${name} = new Set\\((\\[[^;]+\\])\\);`));
    assert.ok(match, `missing ${name}`);
    return JSON.parse(match[1]) as string[];
  };
  assert.deepEqual(
    setValues("runtimeDependencies").sort(),
    [
      ...Object.keys(packageJson.dependencies),
      ...Object.keys(packageJson.optionalDependencies),
    ].sort(),
  );
  assert.deepEqual(
    setValues("developmentDependencies").sort(),
    Object.keys(packageJson.devDependencies).sort(),
  );

  const mutationStep = steps.find((step) => step.name === "Refresh queue-head branch");
  assert.ok(mutationStep, "missing mutation step");
  assert.equal(
    asRecord(mutationStep.env, "mutation env").GH_TOKEN,
    "${{ steps.app-token.outputs.token }}",
  );
  const mutation = stepBody(yaml, "Refresh queue-head branch");
  assert.match(mutation, /if:\s*steps\.policy\.outputs\.selected == 'true'/);
  assert.match(mutation, /PULL_REQUEST_ID:\s*\$\{\{ steps\.policy\.outputs\.pull_request_id \}\}/);
  assert.match(mutation, /EXPECTED_HEAD_OID:\s*\$\{\{ steps\.policy\.outputs\.expected_head_oid \}\}/);
  assert.match(mutation, /disablePullRequestAutoMerge[\s\S]*updatePullRequestBranch/);
  assert.match(mutation, /const disabled = callGraphql\(disableMutation\);/);
  assert.ok(
    mutation.indexOf("const disabled = callGraphql(disableMutation)") <
      mutation.indexOf("const rebased = callGraphql(rebaseMutation"),
    "disable mutation must execute before rebase mutation",
  );
  assert.match(mutation, /updateMethod:\s*REBASE/);
  assert.match(mutation, /expectedHeadOid:\s*\$expectedHeadOid/);
  assert.doesNotMatch(mutation, /enablePullRequestAutoMerge|gh\s+pr\s+merge|--auto/);

  const summary = stepBody(yaml, "Summarize branch refresh");
  assert.match(summary, /if:\s*always\(\)/);
  assert.match(summary, /### Dependabot branch refresh/);
  for (const label of ["Outcome", "Reason", "PR", "Group", "Expected head"]) assert.match(summary, new RegExp(`- ${label}:`));
  assert.doesNotMatch(summary, /title|body|html_url|dependency-name|message|error/i);
}

type RefreshFixture = {
  inventory: WorkflowRecord[][];
  pr: WorkflowRecord;
  commits: WorkflowRecord[];
  graphql: WorkflowRecord;
};

type RefreshMutationFixture = {
  selected: {
    pullRequestId: string;
    expectedHeadOid: string;
    prNumber?: number;
    group?: string;
  };
  responses: WorkflowRecord[];
};

const restRepository = {
  id: 1309960592,
  full_name: "therealhieu/md2vid",
  url: "https://api.github.com/repos/therealhieu/md2vid",
};
const graphqlRepository = {
  id: "R_kgDOThQpsA",
  nameWithOwner: "therealhieu/md2vid",
  url: "https://github.com/therealhieu/md2vid",
};
const expectedHead = "a".repeat(40);

function refreshQueueScript(yaml: string): string {
  const body = stepBody(yaml, "Select patch-group queue head");
  const match = body.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n\s*NODE/);
  assert.ok(match, "missing queue selector script");
  return match[1];
}

function refreshPolicyScript(yaml: string): string {
  const body = stepBody(yaml, "Validate queue-head policy");
  const match = body.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n\s*NODE/);
  assert.ok(match, "missing refresh policy script");
  return match[1];
}

function refreshSummaryRun(yaml: string): string {
  const { value } = parseWorkflow(yaml);
  const step = parsedSteps(parsedJob(value, "refresh-one"), "refresh-one").find(
    (candidate) => candidate.name === "Summarize branch refresh",
  );
  assert.ok(step, "missing summary step");
  return String(step.run);
}

function refreshMutationRun(yaml: string): string {
  const { value } = parseWorkflow(yaml);
  const step = parsedSteps(parsedJob(value, "refresh-one"), "refresh-one").find(
    (candidate) => candidate.name === "Refresh queue-head branch",
  );
  assert.ok(step, "missing mutation step");
  return String(step.run);
}

function parseOutputFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("=", 2)),
  );
}

function refreshHead(group: string): string {
  return `dependabot/${group === "actions-patches" ? "github_actions" : "npm_and_yarn"}/${group}-abc123`;
}

function refreshMetadata(group: string, names: string[], updateType = "version-update:semver-patch"): string {
  return [
    `Bumps the ${group} group with ${names.length} ${names.length === 1 ? "update" : "updates"}.`,
    "",
    "---",
    "updated-dependencies:",
    ...names.flatMap((name) => [
      `- dependency-name: ${name}`,
      "  dependency-version: 1.2.3",
      "  dependency-type: direct:production",
      `  update-type: ${updateType}`,
      `  dependency-group: ${group}`,
    ]),
    "...",
  ].join("\n");
}

function makeRefreshFixture(options: {
  number?: number;
  group?: "runtime-patches" | "dev-patches" | "actions-patches";
  sha?: string;
  createdAt?: string;
  names?: string[];
  updateType?: string;
  mergeStateStatus?: string;
} = {}): RefreshFixture {
  const number = options.number ?? 47;
  const group = options.group ?? "runtime-patches";
  const sha = options.sha ?? expectedHead;
  const head = refreshHead(group);
  const names = options.names ?? (group === "dev-patches" ? ["typescript"] : group === "actions-patches" ? ["actions/checkout"] : ["hyperframes"]);
  const inventoryPr = {
    number,
    created_at: options.createdAt ?? "2026-07-28T00:00:00Z",
    state: "open",
    user: { login: "dependabot[bot]" },
    base: { ref: "main", repo: { ...restRepository } },
    head: { ref: head, sha, repo: { ...restRepository } },
  };
  return {
    inventory: [[structuredClone(inventoryPr)]],
    pr: {
      number,
      state: "open",
      user: { login: "dependabot[bot]" },
      base: { ref: "main", repo: { ...restRepository } },
      head: { ref: head, sha, repo: { ...restRepository } },
      commits: 1,
      body: "Dependabot update.",
    },
    commits: [{
      sha,
      author: { login: "dependabot[bot]" },
      commit: {
        verification: { verified: true },
        message: refreshMetadata(group, names, options.updateType),
      },
    }],
    graphql: {
      data: {
        repository: {
          ...graphqlRepository,
          pullRequest: {
            id: `PR_kwDOThQpsM6example${number}`,
            number,
            state: "OPEN",
            baseRefName: "main",
            baseRepository: { ...graphqlRepository },
            headRefName: head,
            headRefOid: sha,
            headRepository: { ...graphqlRepository },
            mergeStateStatus: options.mergeStateStatus ?? "BEHIND",
            autoMergeRequest: {
              mergeMethod: "SQUASH",
              enabledBy: {
                __typename: "Bot",
                login: "github-actions",
                url: "https://github.com/apps/github-actions",
              },
            },
          },
        },
      },
    },
  };
}

const validRefreshFixture: RefreshFixture = makeRefreshFixture();

function runRefreshPolicy(yaml: string, fixture: RefreshFixture): {
  status: number | null;
  queueStatus: number | null;
  values: Record<string, string>;
  queueValues: Record<string, string>;
  summary: WorkflowRecord;
  stderr: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "md2vid-refresh-policy-"));
  const output = join(dir, "output");
  const queueOutput = join(dir, "queue-output");
  const summaryFile = join(dir, "summary.json");
  const write = (name: string, value: unknown) => {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(value));
    return path;
  };
  try {
    const queueResult = spawnSync(process.execPath, ["--input-type=module"], {
      input: refreshQueueScript(yaml),
      encoding: "utf8",
      env: {
        ...process.env,
        INVENTORY_FILE: write("inventory.json", fixture.inventory),
        SUMMARY_FILE: summaryFile,
        GITHUB_OUTPUT: queueOutput,
      },
    });
    const queueValues = parseOutputFile(queueOutput);
    if (queueResult.status !== 0 || queueValues.candidate !== "true") {
      return {
        status: queueResult.status,
        queueStatus: queueResult.status,
        values: {},
        queueValues,
        summary: existsSync(summaryFile) ? JSON.parse(readFileSync(summaryFile, "utf8")) as WorkflowRecord : {},
        stderr: queueResult.stderr.trim(),
      };
    }

    const result = spawnSync(process.execPath, ["--input-type=module"], {
      input: refreshPolicyScript(yaml),
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_OUTPUT: output,
        PR_FILE: write("pr.json", fixture.pr),
        COMMITS_FILE: write("commits.json", fixture.commits),
        GRAPHQL_FILE: write("graphql.json", fixture.graphql),
        SUMMARY_FILE: summaryFile,
        PR_NUMBER: queueValues.pr_number,
        GROUP: queueValues.group,
      },
    });
    return {
      status: result.status,
      queueStatus: queueResult.status,
      values: parseOutputFile(output),
      queueValues,
      summary: existsSync(summaryFile) ? JSON.parse(readFileSync(summaryFile, "utf8")) as WorkflowRecord : {},
      stderr: [queueResult.stderr.trim(), result.stderr.trim()].filter(Boolean).join("\n"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runRefreshSummary(yaml: string, state: WorkflowRecord): { status: number | null; stdout: string; summary: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), "md2vid-refresh-summary-"));
  const stateFile = join(dir, "state.json");
  const summaryFile = join(dir, "step-summary");
  try {
    writeFileSync(stateFile, JSON.stringify(state));
    const result = spawnSync("bash", ["-euo", "pipefail", "-c", refreshSummaryRun(yaml)], {
      encoding: "utf8",
      env: {
        ...process.env,
        SUMMARY_FILE: stateFile,
        GITHUB_STEP_SUMMARY: summaryFile,
      },
    });
    return {
      status: result.status,
      stdout: result.stdout.trim(),
      summary: existsSync(summaryFile) ? readFileSync(summaryFile, "utf8").trim() : "",
      stderr: result.stderr.trim(),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runRefreshMutation(yaml: string, fixture: RefreshMutationFixture): {
  status: number | null;
  trace: WorkflowRecord[];
  summary: WorkflowRecord;
  stdout: string;
  stderr: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "md2vid-refresh-mutation-"));
  const bin = join(dir, "bin");
  const responsesFile = join(dir, "responses.json");
  const traceFile = join(dir, "trace.json");
  const summaryFile = join(dir, "summary.json");
  try {
    spawnSync("mkdir", ["-p", bin]);
    writeFileSync(responsesFile, JSON.stringify({ index: 0, responses: fixture.responses }));
    writeFileSync(traceFile, "[]");
    writeFileSync(join(bin, "gh"), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] !== 'api' || args[1] !== 'graphql') {
  console.error('only gh api graphql is allowed');
  process.exit(2);
}
const fields = {};
for (let i = 2; i < args.length; i += 1) {
  if ((args[i] === '-F' || args[i] === '-f') && args[i + 1]) {
    const [key, ...rest] = args[i + 1].split('=');
    fields[key] = rest.join('=');
    i += 1;
  }
}
const query = fields.query || '';
const operation = query.includes('disablePullRequestAutoMerge') ? 'disablePullRequestAutoMerge' : query.includes('updatePullRequestBranch') ? 'updatePullRequestBranch' : 'query';
const tracePath = process.env.GH_STUB_TRACE;
const responsesPath = process.env.GH_STUB_RESPONSES;
const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
trace.push({
  operation,
  pullRequestId: fields.pullRequestId,
  expectedHeadOid: fields.expectedHeadOid,
  updateMethod: query.includes('updateMethod: REBASE') ? 'REBASE' : query.includes('updateMethod: MERGE') ? 'MERGE' : undefined,
});
fs.writeFileSync(tracePath, JSON.stringify(trace));
const state = JSON.parse(fs.readFileSync(responsesPath, 'utf8'));
const response = state.responses[state.index++];
fs.writeFileSync(responsesPath, JSON.stringify(state));
if (!response) {
  console.error('missing stub response');
  process.exit(3);
}
if (response.exit) {
  console.error(response.stderr || 'stub failure');
  process.exit(response.exit);
}
process.stdout.write(JSON.stringify(response));
`, { mode: 0o755 });
    const result = spawnSync("bash", ["-euo", "pipefail", "-c", refreshMutationRun(yaml)], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        GH_STUB_RESPONSES: responsesFile,
        GH_STUB_TRACE: traceFile,
        SUMMARY_FILE: summaryFile,
        PULL_REQUEST_ID: fixture.selected.pullRequestId,
        EXPECTED_HEAD_OID: fixture.selected.expectedHeadOid,
        PR_NUMBER: String(fixture.selected.prNumber ?? 47),
        GROUP: fixture.selected.group ?? "runtime-patches",
        GH_TOKEN: "stub-token",
      },
    });
    return {
      status: result.status,
      trace: JSON.parse(readFileSync(traceFile, "utf8")) as WorkflowRecord[],
      summary: existsSync(summaryFile) ? JSON.parse(readFileSync(summaryFile, "utf8")) as WorkflowRecord : {},
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function liveRefreshResponse(sha = expectedHead, id = "PR_kwDOThQpsM6example47"): WorkflowRecord {
  return {
    data: {
      repository: {
        ...graphqlRepository,
        pullRequest: { id, headRefOid: sha },
      },
    },
  };
}

function assertNoRefreshTarget(result: { values: Record<string, string>; summary: WorkflowRecord }, reason = "queue-head-invalid"): void {
  assert.notEqual(result.values.selected, "true");
  assert.equal(result.values.pull_request_id, undefined);
  assert.equal(result.summary.reason, reason);
}

test("Dependabot branch refresh workflow enforces the exact privileged boundary", () => {
  const yaml = workflow("dependabot-branch-refresh.yml");
  assertDependabotBranchRefreshPolicy(yaml);
});

test("Dependabot branch refresh selects only the oldest exact patch-group queue head", () => {
  const yaml = workflow("dependabot-branch-refresh.yml");
  const older = makeRefreshFixture({ number: 47, createdAt: "2026-07-28T00:00:00Z" });
  const newer = makeRefreshFixture({ number: 48, group: "dev-patches", sha: "b".repeat(40), createdAt: "2026-07-29T00:00:00Z" });
  older.inventory = [[...(older.inventory[0]), ...(newer.inventory[0])]];
  const result = runRefreshPolicy(yaml, older);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.queueValues, { candidate: "true", pr_number: "47", group: "runtime-patches" });
  assert.equal(result.values.selected, "true");
  assert.equal(result.values.expected_head_oid, expectedHead);
  assert.equal(result.summary.reason, "selected-for-rebase");

  const tie = makeRefreshFixture({ number: 47, createdAt: "2026-07-28T00:00:00Z" });
  const higher = makeRefreshFixture({ number: 48, createdAt: "2026-07-28T00:00:00Z" });
  tie.inventory = [[...(higher.inventory[0]), ...(tie.inventory[0])]];
  const tied = runRefreshPolicy(yaml, tie);
  assert.equal(tied.status, 0, tied.stderr);
  assert.deepEqual(tied.queueValues, { candidate: "true", pr_number: "47", group: "runtime-patches" });
});

test("Dependabot branch refresh selects valid dev-patches yaml queue head", () => {
  const yaml = workflow("dependabot-branch-refresh.yml");
  const fixture = makeRefreshFixture({ group: "dev-patches", names: ["yaml"] });
  const result = runRefreshPolicy(yaml, fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.values.selected, "true");
  assert.equal(result.values.group, "dev-patches");
  assert.equal(result.summary.reason, "selected-for-rebase");
});

test("Dependabot branch refresh queue head blocks newer PRs when waiting or invalid", () => {
  const yaml = workflow("dependabot-branch-refresh.yml");
  const newer = makeRefreshFixture({ number: 48, group: "dev-patches", sha: "b".repeat(40), createdAt: "2026-07-29T00:00:00Z" });

  const waiting = makeRefreshFixture({ mergeStateStatus: "CLEAN" });
  waiting.inventory = [[...(waiting.inventory[0]), ...(newer.inventory[0])]];
  const waitingResult = runRefreshPolicy(yaml, waiting);
  assert.equal(waitingResult.status, 0, waitingResult.stderr);
  assert.equal(waitingResult.values.selected, "false");
  assert.deepEqual(waitingResult.summary, {
    outcome: "waiting",
    reason: "queue-head-not-behind",
    pr: "#47",
    group: "runtime-patches",
    expected_head: expectedHead,
  });

  const missing = makeRefreshFixture();
  (((missing.graphql.data as WorkflowRecord).repository as WorkflowRecord).pullRequest as WorkflowRecord).autoMergeRequest = null;
  missing.inventory = [[...(missing.inventory[0]), ...(newer.inventory[0])]];
  const missingResult = runRefreshPolicy(yaml, missing);
  assert.notEqual(missingResult.status, 0);
  assertNoRefreshTarget(missingResult, "queue-head-missing-auto-merge");

  const invalid = makeRefreshFixture();
  ((invalid.pr.head as WorkflowRecord).repo as WorkflowRecord).full_name = "fork/md2vid";
  invalid.inventory = [[...(invalid.inventory[0]), ...(newer.inventory[0])]];
  const invalidResult = runRefreshPolicy(yaml, invalid);
  assert.notEqual(invalidResult.status, 0);
  assertNoRefreshTarget(invalidResult);
  assert.deepEqual(invalidResult.queueValues, { candidate: "true", pr_number: "47", group: "runtime-patches" });
});

test("Dependabot branch refresh fails closed on malformed exact queue-head inventory", () => {
  const yaml = workflow("dependabot-branch-refresh.yml");
  const validNewer = makeRefreshFixture({ number: 48, group: "dev-patches", sha: "b".repeat(40), createdAt: "2026-07-29T00:00:00Z" });
  const exactMalformed = {
    number: 47,
    created_at: "not-a-date",
    state: "open",
    head: { ref: "dependabot/npm_and_yarn/runtime-patches-abc123" },
  };
  const invalidTimestamp = makeRefreshFixture();
  invalidTimestamp.inventory = [[exactMalformed, ...(validNewer.inventory[0])]];
  const timestampResult = runRefreshPolicy(yaml, invalidTimestamp);
  assert.notEqual(timestampResult.status, 0);
  assert.deepEqual(timestampResult.queueValues, {});
  assert.deepEqual(timestampResult.summary, {
    outcome: "blocked",
    reason: "queue-head-invalid",
    pr: "#47",
    group: "runtime-patches",
    expected_head: "none",
  });

  const invalidNumber = makeRefreshFixture();
  invalidNumber.inventory = [[{ ...exactMalformed, number: "47", created_at: "2026-07-27T00:00:00Z" }, ...(validNewer.inventory[0])]];
  const numberResult = runRefreshPolicy(yaml, invalidNumber);
  assert.notEqual(numberResult.status, 0);
  assert.deepEqual(numberResult.queueValues, {});
  assert.deepEqual(numberResult.summary, {
    outcome: "blocked",
    reason: "queue-head-invalid",
    pr: "none",
    group: "runtime-patches",
    expected_head: "none",
  });

  const malformedPage = makeRefreshFixture();
  malformedPage.inventory = [{ not: "a page" } as unknown as WorkflowRecord[]];
  const pageResult = runRefreshPolicy(yaml, malformedPage);
  assert.notEqual(pageResult.status, 0);
  assert.deepEqual(pageResult.queueValues, {});
  assert.deepEqual(pageResult.summary, {
    outcome: "blocked",
    reason: "queue-head-invalid",
    pr: "none",
    group: "none",
    expected_head: "none",
  });
});

test("Dependabot branch refresh excludes manual-family, near-prefix, and absent candidates", () => {
  const yaml = workflow("dependabot-branch-refresh.yml");
  const fixture = makeRefreshFixture();
  fixture.inventory = [[
    {
      number: 50,
      created_at: "2026-07-27T00:00:00Z",
      state: "open",
      head: { ref: "dependabot/npm_and_yarn/react-family-abc123" },
    },
    {
      number: 51,
      created_at: "2026-07-27T00:00:01Z",
      state: "open",
      head: { ref: "dependabot/npm_and_yarn/runtime-patchesevil" },
    },
  ]];
  const result = runRefreshPolicy(yaml, fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.queueValues, { candidate: "false" });
  assert.deepEqual(result.summary, {
    outcome: "no-candidates",
    reason: "no-candidates",
    pr: "none",
    group: "none",
    expected_head: "none",
  });
});

test("Dependabot branch refresh validates auto-merge method and actor tuple", () => {
  const yaml = workflow("dependabot-branch-refresh.yml");
  const mutations = [
    (fixture: RefreshFixture) => { (((((fixture.graphql.data as WorkflowRecord).repository as WorkflowRecord).pullRequest as WorkflowRecord).autoMergeRequest as WorkflowRecord).enabledBy as WorkflowRecord).__typename = "User"; },
    (fixture: RefreshFixture) => { (((((fixture.graphql.data as WorkflowRecord).repository as WorkflowRecord).pullRequest as WorkflowRecord).autoMergeRequest as WorkflowRecord).enabledBy as WorkflowRecord).login = "dependabot"; },
    (fixture: RefreshFixture) => { (((((fixture.graphql.data as WorkflowRecord).repository as WorkflowRecord).pullRequest as WorkflowRecord).autoMergeRequest as WorkflowRecord).enabledBy as WorkflowRecord).url = "https://github.com/apps/dependabot"; },
    (fixture: RefreshFixture) => { ((((fixture.graphql.data as WorkflowRecord).repository as WorkflowRecord).pullRequest as WorkflowRecord).autoMergeRequest as WorkflowRecord).mergeMethod = "MERGE"; },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const fixture = makeRefreshFixture();
    mutate(fixture);
    const result = runRefreshPolicy(yaml, fixture);
    assert.notEqual(result.status, 0, `actor/method mutation ${index}`);
    assertNoRefreshTarget(result);
  }
});

test("Dependabot branch refresh validates REST, GraphQL, provenance, metadata, group, and allowlist", () => {
  const yaml = workflow("dependabot-branch-refresh.yml");
  const mutations: Array<[string, (fixture: RefreshFixture) => void]> = [
    ["rest base id", (fixture) => { ((fixture.pr.base as WorkflowRecord).repo as WorkflowRecord).id = 1; }],
    ["rest base full_name", (fixture) => { ((fixture.pr.base as WorkflowRecord).repo as WorkflowRecord).full_name = "therealhieu/other"; }],
    ["rest base url", (fixture) => { ((fixture.pr.base as WorkflowRecord).repo as WorkflowRecord).url = "https://api.github.com/repos/therealhieu/other"; }],
    ["rest head id", (fixture) => { ((fixture.pr.head as WorkflowRecord).repo as WorkflowRecord).id = 1; }],
    ["rest head full_name", (fixture) => { ((fixture.pr.head as WorkflowRecord).repo as WorkflowRecord).full_name = "therealhieu/other"; }],
    ["rest head url", (fixture) => { ((fixture.pr.head as WorkflowRecord).repo as WorkflowRecord).url = "https://api.github.com/repos/therealhieu/other"; }],
    ["closed", (fixture) => { fixture.pr.state = "closed"; }],
    ["non-main", (fixture) => { (fixture.pr.base as WorkflowRecord).ref = "develop"; }],
    ["non-bot", (fixture) => { (fixture.pr.user as WorkflowRecord).login = "therealhieu"; }],
    ["head ref", (fixture) => { (fixture.pr.head as WorkflowRecord).ref = "dependabot/npm_and_yarn/dev-patches-abc123"; }],
    ["head sha", (fixture) => { (fixture.pr.head as WorkflowRecord).sha = "b".repeat(40); }],
    ["maintainer marker", (fixture) => { fixture.pr.body = "Maintainer changes:\nChanged by maintainer"; }],
    ["multi commit", (fixture) => { fixture.pr.commits = 2; fixture.commits.push(structuredClone(fixture.commits[0])); }],
    ["commit sha", (fixture) => { fixture.commits[0].sha = "b".repeat(40); }],
    ["commit author", (fixture) => { (fixture.commits[0].author as WorkflowRecord).login = "therealhieu"; }],
    ["unsigned", (fixture) => { ((fixture.commits[0].commit as WorkflowRecord).verification as WorkflowRecord).verified = false; }],
    ["missing metadata", (fixture) => { (fixture.commits[0].commit as WorkflowRecord).message = "Bump dependency"; }],
    ["duplicate metadata", (fixture) => { (fixture.commits[0].commit as WorkflowRecord).message = refreshMetadata("runtime-patches", ["hyperframes", "hyperframes"]); }],
    ["non-patch", (fixture) => { (fixture.commits[0].commit as WorkflowRecord).message = refreshMetadata("runtime-patches", ["hyperframes"], "version-update:semver-minor"); }],
    ["wrong group", (fixture) => { (fixture.commits[0].commit as WorkflowRecord).message = refreshMetadata("dev-patches", ["typescript"]); }],
    ["unauthorized dependency", (fixture) => { (fixture.commits[0].commit as WorkflowRecord).message = refreshMetadata("runtime-patches", ["left-pad"]); }],
    ["graphql repository id", (fixture) => { ((fixture.graphql.data as WorkflowRecord).repository as WorkflowRecord).id = "wrong"; }],
    ["graphql repository owner", (fixture) => { ((fixture.graphql.data as WorkflowRecord).repository as WorkflowRecord).nameWithOwner = "therealhieu/other"; }],
    ["graphql repository url", (fixture) => { ((fixture.graphql.data as WorkflowRecord).repository as WorkflowRecord).url = "https://github.com/therealhieu/other"; }],
    ["graphql base id", (fixture) => { ((((fixture.graphql.data as WorkflowRecord).repository as WorkflowRecord).pullRequest as WorkflowRecord).baseRepository as WorkflowRecord).id = "wrong"; }],
    ["graphql base owner", (fixture) => { ((((fixture.graphql.data as WorkflowRecord).repository as WorkflowRecord).pullRequest as WorkflowRecord).baseRepository as WorkflowRecord).nameWithOwner = "therealhieu/other"; }],
    ["graphql base url", (fixture) => { ((((fixture.graphql.data as WorkflowRecord).repository as WorkflowRecord).pullRequest as WorkflowRecord).baseRepository as WorkflowRecord).url = "https://github.com/therealhieu/other"; }],
    ["graphql head id", (fixture) => { ((((fixture.graphql.data as WorkflowRecord).repository as WorkflowRecord).pullRequest as WorkflowRecord).headRepository as WorkflowRecord).id = "wrong"; }],
    ["graphql head owner", (fixture) => { ((((fixture.graphql.data as WorkflowRecord).repository as WorkflowRecord).pullRequest as WorkflowRecord).headRepository as WorkflowRecord).nameWithOwner = "therealhieu/other"; }],
    ["graphql head url", (fixture) => { ((((fixture.graphql.data as WorkflowRecord).repository as WorkflowRecord).pullRequest as WorkflowRecord).headRepository as WorkflowRecord).url = "https://github.com/therealhieu/other"; }],
  ];

  for (const [label, mutate] of mutations) {
    const fixture = makeRefreshFixture();
    mutate(fixture);
    const result = runRefreshPolicy(yaml, fixture);
    assert.notEqual(result.status, 0, label);
    assertNoRefreshTarget(result);
  }
});

test("Dependabot branch refresh rejects malformed Dependabot metadata framing and scalars", () => {
  const yaml = workflow("dependabot-branch-refresh.yml");
  const validQuoted = makeRefreshFixture();
  (validQuoted.commits[0].commit as WorkflowRecord).message = [
    "Bumps the runtime-patches group with 1 update.",
    "",
    "---",
    "updated-dependencies:",
    "- dependency-name: \"hyperframes\"",
    "  dependency-version: '0.7.77''canary'",
    "  dependency-type: direct:production",
    "  update-type: version-update:semver-patch",
    "  dependency-group: runtime-patches",
    "...",
  ].join("\n");
  const validResult = runRefreshPolicy(yaml, validQuoted);
  assert.equal(validResult.status, 0, validResult.stderr);
  assert.equal(validResult.values.selected, "true");

  const metadataLines = [
    "updated-dependencies:",
    "- dependency-name: hyperframes",
    "  dependency-version: 1.2.3",
    "  dependency-type: direct:production",
    "  update-type: version-update:semver-patch",
    "  dependency-group: runtime-patches",
    "...",
  ];
  const malformed: Array<[string, string[]]> = [
    ["missing delimiter", ["Bumps dependency.", "", ...metadataLines]],
    ["empty double quoted version", ["---", ...metadataLines.map((line) => line === "  dependency-version: 1.2.3" ? "  dependency-version: \"\"" : line)]],
    ["whitespace single quoted type", ["---", ...metadataLines.map((line) => line === "  dependency-type: direct:production" ? "  dependency-type: '   '" : line)]],
    ["malformed quote", ["---", ...metadataLines.map((line) => line === "  dependency-version: 1.2.3" ? "  dependency-version: \"unterminated" : line)]],
    ["invalid scalar characters", ["---", ...metadataLines.map((line) => line === "  dependency-version: 1.2.3" ? "  dependency-version: [1.2.3]" : line)]],
    ["malformed dependency type", ["---", ...metadataLines.map((line) => line === "  dependency-type: direct:production" ? "  dependency-type: direct production" : line)]],
    ["duplicate dependency-version", ["---", ...metadataLines.toSpliced(3, 0, "  dependency-version: 1.2.4")]],
  ];

  for (const [label, lines] of malformed) {
    const fixture = makeRefreshFixture();
    (fixture.commits[0].commit as WorkflowRecord).message = lines.join("\n");
    const result = runRefreshPolicy(yaml, fixture);
    assert.notEqual(result.status, 0, label);
    assertNoRefreshTarget(result);
  }
});

test("Dependabot branch refresh renders exactly five trusted summary fields", () => {
  const yaml = workflow("dependabot-branch-refresh.yml");
  const cases = [
    { outcome: "no-candidates", reason: "no-candidates", pr: "none", group: "none", expected_head: "none" },
    { outcome: "waiting", reason: "queue-head-not-behind", pr: "#47", group: "runtime-patches", expected_head: expectedHead },
    { outcome: "blocked", reason: "queue-head-missing-auto-merge", pr: "#47", group: "runtime-patches", expected_head: expectedHead },
    { outcome: "blocked", reason: "queue-head-invalid", pr: "#47", group: "runtime-patches", expected_head: expectedHead },
    { outcome: "selected", reason: "selected-for-rebase", pr: "#47", group: "runtime-patches", expected_head: expectedHead },
    { outcome: "failed", reason: "auto-merge-disable-failed", pr: "#47", group: "runtime-patches", expected_head: expectedHead },
    { outcome: "failed", reason: "head-changed", pr: "#47", group: "runtime-patches", expected_head: expectedHead },
    { outcome: "failed", reason: "rebase-failed", pr: "#47", group: "runtime-patches", expected_head: expectedHead },
    { outcome: "failed", reason: "app-token-unavailable", pr: "none", group: "none", expected_head: "none" },
  ];
  for (const state of cases) {
    const rendered = runRefreshSummary(yaml, state);
    assert.equal(rendered.status, 0, rendered.stderr);
    const expected = [
      "### Dependabot branch refresh",
      `- Outcome: ${state.outcome}`,
      `- Reason: ${state.reason}`,
      `- PR: ${state.pr}`,
      `- Group: ${state.group}`,
      `- Expected head: ${state.expected_head}`,
    ].join("\n");
    assert.equal(rendered.stdout, expected);
    assert.equal(rendered.summary, expected);
  }
  for (const unsafe of [
    { outcome: "selected", reason: "selected-for-rebase", pr: "#47 title leak", group: "runtime-patches", expected_head: expectedHead },
    { outcome: "failed", reason: "raw API error", pr: "#47", group: "runtime-patches", expected_head: expectedHead },
    { outcome: "selected", reason: "selected-for-rebase", pr: "#47", group: "runtime-patches", expected_head: `${expectedHead} body` },
  ]) {
    assert.notEqual(runRefreshSummary(yaml, unsafe).status, 0);
  }
});

test("Dependabot branch refresh mutation revalidates heads, disables, then rebases", () => {
  const yaml = workflow("dependabot-branch-refresh.yml");
  const selected = { pullRequestId: "PR_kwDOThQpsM6example47", expectedHeadOid: expectedHead };

  const firstMismatch = runRefreshMutation(yaml, { selected, responses: [liveRefreshResponse("b".repeat(40))] });
  assert.notEqual(firstMismatch.status, 0);
  assert.deepEqual(firstMismatch.trace.map((call) => call.operation), ["query"]);
  assert.equal(firstMismatch.summary.reason, "head-changed");

  const secondMismatch = runRefreshMutation(yaml, {
    selected,
    responses: [
      liveRefreshResponse(),
      { data: { disablePullRequestAutoMerge: { pullRequest: { id: selected.pullRequestId } } } },
      liveRefreshResponse("b".repeat(40)),
    ],
  });
  assert.notEqual(secondMismatch.status, 0);
  assert.deepEqual(secondMismatch.trace.map((call) => call.operation), ["query", "disablePullRequestAutoMerge", "query"]);
  assert.equal(secondMismatch.summary.reason, "head-changed");

  const success = runRefreshMutation(yaml, {
    selected,
    responses: [
      liveRefreshResponse(),
      { data: { disablePullRequestAutoMerge: { pullRequest: { id: selected.pullRequestId } } } },
      liveRefreshResponse(),
      { data: { updatePullRequestBranch: { pullRequest: { id: selected.pullRequestId, headRefOid: expectedHead } } } },
    ],
  });
  assert.equal(success.status, 0, success.stderr);
  assert.deepEqual(success.trace.map((call) => call.operation), ["query", "disablePullRequestAutoMerge", "query", "updatePullRequestBranch"]);
  const rebase = success.trace[3];
  assert.equal(rebase.updateMethod, "REBASE");
  assert.equal(rebase.expectedHeadOid, expectedHead);
  assert.equal(success.summary.reason, "selected-for-rebase");
});

test("Dependabot branch refresh mutation fails closed on live identity and mutation failures", () => {
  const yaml = workflow("dependabot-branch-refresh.yml");
  const selected = { pullRequestId: "PR_kwDOThQpsM6example47", expectedHeadOid: expectedHead };

  const wrongRepo = liveRefreshResponse();
  ((wrongRepo.data as WorkflowRecord).repository as WorkflowRecord).id = "wrong";
  const repositoryMismatch = runRefreshMutation(yaml, { selected, responses: [wrongRepo] });
  assert.notEqual(repositoryMismatch.status, 0);
  assert.deepEqual(repositoryMismatch.trace.map((call) => call.operation), ["query"]);
  assert.equal(repositoryMismatch.summary.reason, "head-changed");

  const wrongNode = runRefreshMutation(yaml, { selected, responses: [liveRefreshResponse(expectedHead, "wrong-node")] });
  assert.notEqual(wrongNode.status, 0);
  assert.deepEqual(wrongNode.trace.map((call) => call.operation), ["query"]);
  assert.equal(wrongNode.summary.reason, "head-changed");

  const disableFailed = runRefreshMutation(yaml, { selected, responses: [liveRefreshResponse(), { exit: 1, stderr: "disable failed" }] });
  assert.notEqual(disableFailed.status, 0);
  assert.deepEqual(disableFailed.trace.map((call) => call.operation), ["query", "disablePullRequestAutoMerge"]);
  assert.equal(disableFailed.summary.reason, "auto-merge-disable-failed");

  for (const [label, response] of [
    ["top-level errors", { errors: [{ message: "denied" }] }],
    ["null disable", { data: { disablePullRequestAutoMerge: null } }],
    ["missing disable id", { data: { disablePullRequestAutoMerge: { pullRequest: {} } } }],
    ["wrong disable id", { data: { disablePullRequestAutoMerge: { pullRequest: { id: "wrong" } } } }],
  ] as const) {
    const result = runRefreshMutation(yaml, { selected, responses: [liveRefreshResponse(), response] });
    assert.notEqual(result.status, 0, label);
    assert.deepEqual(result.trace.map((call) => call.operation), ["query", "disablePullRequestAutoMerge"], label);
    assert.equal(result.summary.reason, "auto-merge-disable-failed", label);
  }

  const rebaseFailed = runRefreshMutation(yaml, {
    selected,
    responses: [
      liveRefreshResponse(),
      { data: { disablePullRequestAutoMerge: { pullRequest: { id: selected.pullRequestId } } } },
      liveRefreshResponse(),
      { exit: 1, stderr: "rebase failed" },
    ],
  });
  assert.notEqual(rebaseFailed.status, 0);
  assert.deepEqual(rebaseFailed.trace.map((call) => call.operation), ["query", "disablePullRequestAutoMerge", "query", "updatePullRequestBranch"]);
  assert.equal(rebaseFailed.summary.reason, "rebase-failed");

  for (const [label, response] of [
    ["top-level rebase errors", { errors: [{ message: "rejected" }] }],
    ["null rebase", { data: { updatePullRequestBranch: null } }],
    ["missing rebase id", { data: { updatePullRequestBranch: { pullRequest: { headRefOid: "b".repeat(40) } } } }],
    ["wrong rebase id", { data: { updatePullRequestBranch: { pullRequest: { id: "wrong", headRefOid: "b".repeat(40) } } } }],
    ["invalid rebase head", { data: { updatePullRequestBranch: { pullRequest: { id: selected.pullRequestId, headRefOid: "not-a-sha" } } } }],
  ] as const) {
    const result = runRefreshMutation(yaml, {
      selected,
      responses: [
        liveRefreshResponse(),
        { data: { disablePullRequestAutoMerge: { pullRequest: { id: selected.pullRequestId } } } },
        liveRefreshResponse(),
        response,
      ],
    });
    assert.notEqual(result.status, 0, label);
    assert.deepEqual(result.trace.map((call) => call.operation), ["query", "disablePullRequestAutoMerge", "query", "updatePullRequestBranch"], label);
    assert.equal(result.summary.reason, "rebase-failed", label);
  }
});

test("Dependabot branch refresh executable harness rejects queue-skip and second-candidate mutations", () => {
  const yaml = workflow("dependabot-branch-refresh.yml");
  const older = makeRefreshFixture({ number: 47, createdAt: "2026-07-28T00:00:00Z" });
  const newer = makeRefreshFixture({ number: 48, group: "dev-patches", sha: "b".repeat(40), createdAt: "2026-07-29T00:00:00Z" });
  older.inventory = [[...(older.inventory[0]), ...(newer.inventory[0])]];

  const secondCandidate = yaml.replace(
    "const [queueHead] = candidates;",
    "const queueHead = candidates[candidates.length - 1];",
  );
  assert.notEqual(secondCandidate, yaml);
  assert.throws(() => {
    assert.equal(runRefreshPolicy(secondCandidate, older).queueValues.pr_number, "47");
  }, /strictly equal|Expected values/);

  const skipBlocked = yaml.replace(
    "if (!Number.isFinite(createdAt)) blocked(`#${pr.number}`, policy.group);",
    "if (!Number.isFinite(createdAt)) continue;",
  );
  assert.notEqual(skipBlocked, yaml);
  const invalidTimestamp = makeRefreshFixture();
  invalidTimestamp.inventory = [[{
    number: 47,
    created_at: "not-a-date",
    state: "open",
    head: { ref: "dependabot/npm_and_yarn/runtime-patches-abc123" },
  }, ...(newer.inventory[0])]];
  assert.throws(() => {
    assert.notEqual(runRefreshPolicy(skipBlocked, invalidTimestamp).queueValues.pr_number, "48");
  }, /strictly unequal|notStrictEqual/);
});

test("Dependabot branch refresh structural policy rejects security mutations", () => {
  const yaml = workflow("dependabot-branch-refresh.yml");
  const mutations = [
    yaml.replace("permissions: {}", "permissions: { contents: write }"),
    yaml.replace("    permissions: {}", "    permissions: { pull-requests: write }"),
    yaml.replace("owner: therealhieu", "owner: ${{ github.repository_owner }}"),
    yaml.replace("repositories: md2vid", "repositories: md2vid,other"),
    yaml.replace("fee1f7d63c2ff003460e3d139729b119787bc349", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    yaml.replace(" # v2.2.2", ""),
    yaml.replace("${{ steps.app-token.outputs.token }}", "${{ github.token }}"),
    yaml.replace("          GH_TOKEN: ${{ steps.app-token.outputs.token }}\n          SUMMARY_FILE", "          SUMMARY_FILE"),
    yaml.replace("${{ secrets.DEPENDABOT_REFRESH_APP_PRIVATE_KEY }}", "${{ secrets.PAT_TOKEN }}"),
    yaml.replace("      - name: Inventory open pull requests", "      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # v4\n      - name: Inventory open pull requests"),
    yaml.replace("      - name: Inventory open pull requests", "      - uses: actions/setup-node@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # v4\n      - name: Inventory open pull requests"),
    yaml.replace("      - name: Inventory open pull requests", "      - uses: actions/cache@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # v4\n      - name: Inventory open pull requests"),
    yaml.replace("      - name: Inventory open pull requests", "      - uses: actions/upload-artifact@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # v4\n      - name: Inventory open pull requests"),
    yaml.replace("      - name: Inventory open pull requests", "      - uses: actions/download-artifact@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # v4\n      - name: Inventory open pull requests"),
    yaml.replace("set -euo pipefail", "npm ci\n          set -euo pipefail"),
    yaml.replace("set -euo pipefail", "node scripts/evil.ts\n          set -euo pipefail"),
    yaml.replace("cancel-in-progress: false", "cancel-in-progress: true"),
    yaml.replace("disablePullRequestAutoMerge", "enablePullRequestAutoMerge"),
    yaml.replace("const disabled = callGraphql(disableMutation);", "const disabled = callGraphql(rebaseMutation, { expectedHeadOid });"),
    yaml.replace("updateMethod: REBASE", "updateMethod: MERGE"),
    yaml.replace(/expectedHeadOid/g, "staleHeadOid"),
    yaml.replace("login !== \"github-actions\"", "login === \"\""),
    yaml.replaceAll("\"rebase-failed\"", "\"removed-rebase\""),
    yaml.replace("### Dependabot branch refresh", "### Dependabot branch refresh title"),
    yaml.replace("`- Reason: ${state.reason}`", "`- Reason: ${state.reason} ${state.body}`"),
    yaml.replace("process.stdout.write(summary);", "process.stdout.write(`${summary} ${state.html_url}`);"),
    yaml.replace("process.stdout.write(summary);", "process.stdout.write(`${summary} raw API error`);"),
    yaml.replace("      - name: Inventory open pull requests", "      - run: gh pr review \"$PR_NUMBER\" --approve\n      - name: Inventory open pull requests"),
    yaml.replace("      - name: Inventory open pull requests", "      - run: gh api --method POST repos/therealhieu/md2vid/pulls/47/reviews -f event=APPROVE\n      - name: Inventory open pull requests"),
    yaml.replace("      - name: Inventory open pull requests", "      - run: gh pr merge \"$PR_NUMBER\" --admin\n      - name: Inventory open pull requests"),
  ];
  for (const [index, mutated] of mutations.entries()) {
    assert.notEqual(mutated, yaml, `refresh mutation ${index} must modify workflow`);
    assert.throws(
      () => assertDependabotBranchRefreshPolicy(mutated),
      /permission|owner|repositories|SHA|v2\.2\.2|github\.token|PAT|checkout|cache|npm|cancel|enable|REBASE|expectedHeadOid|github-actions|title|match|deep-equal|strictly equal/i,
      `refresh structural mutation ${index} was accepted`,
    );
  }
});

function releaseJob(yaml: string, name: string): string {
  const order = ["preflight", "obtain-artifact", "verify-artifact", "publish-npm", "verify-registry", "create-github-release"];
  const index = order.indexOf(name);
  assert.notEqual(index, -1, `unknown release job ${name}`);
  return jobBody(yaml, name, order[index + 1]);
}

function assertExactPermissions(body: string, entries: string[]): void {
  const match = body.match(/\n    permissions:\s*\n((?:      [^\n]+\n)+)/);
  assert.ok(match, "missing job permissions");
  const actual = match[1].trim().split("\n").map((line) => line.trim());
  assert.deepEqual(actual, entries);
}

function assertReleaseAuthorities(yaml: string): void {
  assert.doesNotMatch(yaml, /pull_request_target|NPM_TOKEN|\benvironment\s*:|Release Please|Changesets|Semantic Release|audit-ci/i);
  assertPinnedUses(yaml);
  assertCheckoutHardening(yaml);

  const preflight = releaseJob(yaml, "preflight");
  const obtain = releaseJob(yaml, "obtain-artifact");
  const verify = releaseJob(yaml, "verify-artifact");
  const publish = releaseJob(yaml, "publish-npm");
  const registry = releaseJob(yaml, "verify-registry");
  const githubRelease = releaseJob(yaml, "create-github-release");

  assertExactPermissions(preflight, ["contents: read", "actions: read"]);
  assertExactPermissions(obtain, ["contents: read", "actions: read"]);
  assertExactPermissions(verify, ["contents: read"]);
  assertExactPermissions(publish, ["contents: read", "id-token: write"]);
  assertExactPermissions(registry, ["contents: read"]);
  assertExactPermissions(githubRelease, ["contents: write"]);

  for (const body of [preflight, obtain, verify, publish, registry, githubRelease]) {
    assert.equal(/id-token:\s*write/.test(body) && /contents:\s*write/.test(body), false, "one job combines npm and GitHub write authority");
    assert.doesNotMatch(body, /actions:\s*write|checks:\s*write|deployments:\s*write|issues:\s*write|packages:\s*write|pull-requests:\s*write|security-events:\s*write/);
  }
}

function assertReleaseDependencies(yaml: string): void {
  assert.match(releaseJob(yaml, "obtain-artifact"), /needs:\s*preflight/);
  assert.match(releaseJob(yaml, "verify-artifact"), /needs:\s*\[preflight, obtain-artifact\]/);
  assert.match(releaseJob(yaml, "publish-npm"), /needs:\s*\[preflight, obtain-artifact, verify-artifact\]/);
  assert.match(releaseJob(yaml, "verify-registry"), /needs:\s*\[preflight, obtain-artifact, publish-npm\]/);
  assert.match(releaseJob(yaml, "create-github-release"), /needs:\s*\[preflight, verify-registry\]/);
}

function assertReleasePolicy(yaml: string): void {
  assert.match(yaml, /^name: Release$/m);
  const trigger = yaml.match(/^on:\n([\s\S]*?)(?=^permissions:)/m)?.[0] ?? "";
  assert.equal(
    trigger,
    `on:\n  push:\n    tags: ["v*"]\n  workflow_dispatch:\n    inputs:\n      tag:\n        description: Existing protected release tag to recover\n        required: true\n        type: string\n\n`,
    "release must expose only protected tag push and required-tag recovery triggers",
  );
  assert.match(yaml, /concurrency:\s*\n\s+group:\s*md2vid-release\s*\n\s+queue:\s*max\s*\n\s+cancel-in-progress:\s*false/);
  assert.doesNotMatch(yaml, /queues one pending run|one-pending/i, "release must not use the old one-pending workaround");
  assertReleaseAuthorities(yaml);
  assertReleaseDependencies(yaml);
}

function assertReleaseVerificationMatrix(yaml: string): void {
  const { value } = parseWorkflow(yaml);
  const job = parsedJob(value, "verify-artifact");
  assert.deepEqual(
    job.strategy,
    {
      "fail-fast": false,
      matrix: { runner: ["ubuntu-latest", "macos-latest"] },
    },
    "release verification strategy must contain only the exact supported runner matrix",
  );
}

const EXACT_RELEASE_VERIFIER = [
  "npm run release:verify-artifact -- \\",
  "  --tarball \"release-artifact/$TARBALL\" \\",
  "  --metadata release-artifact/artifact.json \\",
  "  --expected-version \"$VERSION\" \\",
  "  --expected-tag \"$TAG\" \\",
  "  --expected-commit \"$COMMIT\" \\",
  "  --diagnostics release-diagnostics",
].join("\n");

function normalizeYamlFinalNewline(value: string): string {
  return value.endsWith("\n") ? value.slice(0, -1) : value;
}

function assertReleaseArtifactVerificationRequired(yaml: string): void {
  const { value } = parseWorkflow(yaml);
  const job = parsedJob(value, "verify-artifact");
  for (const control of ["if", "continue-on-error"]) {
    assert.equal(
      Object.hasOwn(job, control),
      false,
      `verify-artifact job must not define ${control}`,
    );
  }

  const matches = parsedSteps(job, "verify-artifact").filter(
    (step) => step.name === "Verify exact release artifact",
  );
  assert.equal(
    matches.length,
    1,
    "verify-artifact must have exactly one Verify exact release artifact step",
  );
  const [step] = matches;
  for (const control of ["if", "continue-on-error"]) {
    assert.equal(
      Object.hasOwn(step, control),
      false,
      `exact release artifact verification step must not define ${control}`,
    );
  }
  assert.equal(step.shell, "bash", "verification shell must be exactly bash");
  assert.equal(typeof step.run, "string", "verification run must be a scalar string");
  assert.equal(
    normalizeYamlFinalNewline(step.run as string),
    EXACT_RELEASE_VERIFIER,
    "verification run must be exactly the blocking artifact verifier command",
  );
}

function assertReleaseEventMapping(body: string): void {
  assert.match(body, /EVENT_NAME:\s*\$\{\{ github\.event_name \}\}/);
  assert.match(body, /case "\$EVENT_NAME" in\s*\n\s+push\) event_kind=push ;;\s*\n\s+workflow_dispatch\) event_kind=recovery ;;\s*\n\s+\*\) echo "unsupported release event: \$EVENT_NAME" >&2; exit 2 ;;/);
  assert.match(body, /--event "\$event_kind"/);
  assert.doesNotMatch(body, /github\.event_name ==|EVENT_KIND:/);
}

function assertActionlintQueueSuppression(body?: string): void {
  assert.equal(existsSync(actionlintConfigPath), true, "missing path-scoped actionlint queue suppression");
  assert.equal(
    body ?? readFileSync(actionlintConfigPath, "utf8"),
    `paths:\n  .github/workflows/release.yml:\n    ignore:\n      - '^unexpected key "queue" for "concurrency" section\\.'\n`,
    "actionlint suppression must target only release.yml and the exact stale queue diagnostic",
  );
}

function assertReleaseToolchain(body: string, ref: RegExp): void {
  const checkout = body.match(/- name: Check out verified commit[\s\S]*?(?=\n      - name:|$)/)?.[0] ?? "";
  assert.match(checkout, /actions\/checkout@[a-f0-9]{40}\s+# v\d+(?:\.\d+)*/);
  assert.match(checkout, ref);
  assert.match(checkout, /persist-credentials:\s*false/);
  assert.match(body, /actions\/setup-node@[a-f0-9]{40}\s+# v\d+(?:\.\d+)*/);
  assert.match(body, /node-version:\s*\$\{\{ needs\.preflight\.outputs\.node_version \}\}/);
  assert.match(body, /npm install --global "\$package_manager"/);
  assert.match(body, /test "\$\(npm --version\)" = "\$expected"/);
  assert.match(body, /test "\$expected" = "11\.15\.0"/);
}

function assertGhTokenOnEveryGhStep(yaml: string): void {
  const steps = yaml
    .split(/(?=^      - name: )/m)
    .filter((step) => /release_preflight\.ts (?:preflight|release-check)|\bgh\s+/.test(step));
  assert.equal(steps.length, 4, "expected current-artifact, preflight, release-check, and release-create API callers");
  for (const step of steps) assert.match(step, /GH_TOKEN:\s*\$\{\{ github\.token \}\}/);
}

function assertReleaseDiagnostics(yaml: string): void {
  const uploadUses = yaml.match(/^\s+(?:-\s+)?uses:\s+actions\/upload-artifact@/gm) ?? [];
  assert.equal(uploadUses.length, 3, "release must have exactly three upload-artifact uses");
  const uploadSteps = yaml.split(/(?=^      - name: )/m).filter((step) => /uses:\s+actions\/upload-artifact@/.test(step));
  assert.equal(uploadSteps.length, 3, "release must have exactly three named upload-artifact steps");
  assert.deepEqual(
    uploadSteps.map((step) => step.match(/^      - name: (.+)$/m)?.[1]),
    ["Upload current release artifact", "Upload sanitized release diagnostics", "Upload sanitized registry diagnostics"],
    "release upload-artifact steps must be the enumerated immutable artifact and sanitized diagnostics",
  );

  const releaseArtifact = stepBody(yaml, "Upload current release artifact");
  assert.match(releaseArtifact, /if:\s*steps\.current-artifact\.outputs\.reuse != 'true'/);
  assert.match(releaseArtifact, /name:\s*\$\{\{ needs\.preflight\.outputs\.artifact_name \}\}/);
  assert.deepEqual([...releaseArtifact.matchAll(/^\s+path:\s*(.+)$/gm)].map((match) => match[1].trim()), ["release-artifact"]);
  assert.match(releaseArtifact, /if-no-files-found:\s*error/);
  assert.match(releaseArtifact, /retention-days:\s*90/);
  assert.match(releaseArtifact, /overwrite:\s*false/);

  const diagnostics = [
    {
      name: "Upload sanitized release diagnostics",
      artifactName: /name:\s*release-diagnostics-\$\{\{ matrix\.runner \}\}-\$\{\{ needs\.obtain-artifact\.outputs\.tag \}\}/,
    },
    {
      name: "Upload sanitized registry diagnostics",
      artifactName: /name:\s*release-diagnostics-registry-\$\{\{ needs\.obtain-artifact\.outputs\.tag \}\}/,
    },
  ];
  for (const expected of diagnostics) {
    const step = stepBody(yaml, expected.name);
    assert.match(step, /if:\s*failure\(\)/);
    assert.match(step, expected.artifactName);
    assert.deepEqual([...step.matchAll(/^\s+path:\s*(.+)$/gm)].map((match) => match[1].trim()), ["release-diagnostics"]);
    assert.match(step, /if-no-files-found:\s*ignore/);
    assert.match(step, /retention-days:\s*14/);
    assert.doesNotMatch(step, /HOME|npmrc|workspace|\$GITHUB_WORKSPACE|path:\s*[.~/$]/i);
  }
}

function assertRerunSafeArtifactConditions(body: string): void {
  const reusableDownload = stepBody(body, "Download reusable current-run artifact");
  assert.match(reusableDownload, /if:\s*steps\.current-artifact\.outputs\.reuse == 'true'/);
  assert.match(reusableDownload, /artifact-ids:\s*\$\{\{ steps\.current-artifact\.outputs\.artifact_id \}\}/);
  assert.match(reusableDownload, /run-id:\s*\$\{\{ github\.run_id \}\}/);
  assert.doesNotMatch(reusableDownload, /^\s+name:/m, "current-run reuse must download the selected artifact ID, not its name");

  const retainedDownload = stepBody(body, "Download retained release artifact");
  assert.match(retainedDownload, /artifact-ids:\s*\$\{\{ needs\.preflight\.outputs\.artifact_id \}\}/);
  assert.match(retainedDownload, /run-id:\s*\$\{\{ needs\.preflight\.outputs\.artifact_run_id \}\}/);
  assert.doesNotMatch(retainedDownload, /^\s+name:/m, "retained recovery must download the validated artifact ID, not its name");

  const absentCondition = "if: needs.preflight.outputs.registry_state == 'absent' && steps.current-artifact.outputs.reuse != 'true'";
  for (const name of [
    "Install dependencies for new artifact",
    "Validate source for new artifact",
    "Audit dependency signatures",
    "Enforce production audit policy",
    "Pack new release artifact",
  ]) {
    assert.equal(stepBody(body, name).includes(absentCondition), true, `${name} must skip when the current run artifact is reused`);
  }
  assert.match(
    stepBody(body, "Download retained release artifact"),
    /if:\s*needs\.preflight\.outputs\.registry_state == 'existing' && steps\.current-artifact\.outputs\.reuse != 'true'/,
  );
  const upload = stepBody(body, "Upload current release artifact");
  assert.match(upload, /if:\s*steps\.current-artifact\.outputs\.reuse != 'true'/);
  assert.match(upload, /overwrite:\s*false/);
}

function assertReleaseSummaries(yaml: string): void {
  const evidence: Record<string, RegExp[]> = {
    preflight: [/Artifact name:/, /Artifact ID:/, /Registry state:/, /GitHub Release state:/],
    "obtain-artifact": [/Artifact name:/, /Artifact ID:/, /SRI:/, /SHA-256:/],
    "verify-artifact": [/Artifact name:/, /Artifact ID:/, /SRI:/, /SHA-256:/, /Runner:/, /Matrix result:/],
    "publish-npm": [/Artifact name:/, /Artifact ID:/, /SRI:/, /SHA-256:/, /Registry state:/, /Publish state:/],
    "verify-registry": [/Artifact name:/, /Artifact ID:/, /SRI:/, /SHA-256:/, /Registry state:/, /Public install result:/],
    "create-github-release": [/GitHub Release state:/],
  };

  for (const [job, required] of Object.entries(evidence)) {
    const body = releaseJob(yaml, job);
    const summaries = body.split(/(?=^      - name: )/m).filter((step) => /GITHUB_STEP_SUMMARY/.test(step));
    assert.equal(summaries.length, 1, `${job} must have exactly one summary step`);
    const summary = summaries[0];
    assert.match(summary, /^\s+if:\s*always\(\)\s*$/m);
    assert.equal((summary.match(/^\s+STATUS:/gm) ?? []).length, 1, `${job} must bind STATUS exactly once`);
    assert.match(summary, /^\s+STATUS:\s*\$\{\{ job\.status \}\}\s*$/m);
    for (const field of ["TAG", "VERSION", "COMMIT", "NODE_VERSION"]) {
      assert.match(summary, new RegExp(`^\\s+${field}:\\s*\\$\\{\\{`, "m"), `${job} summary is missing ${field}`);
    }
    for (const label of [/Tag: \$TAG/, /Version: \$VERSION/, /Commit: \$COMMIT/, /Node: \$NODE_VERSION/, /npm: 11\.15\.0/, /Status: \$STATUS/]) {
      assert.match(summary, label);
    }
    for (const field of required) assert.match(summary, field, `${job} summary is missing ${field}`);
    assert.doesNotMatch(summary, /TOKEN|npmrc|HOME|ACTIONS_ID_TOKEN|oidc|github\.token/i);
  }
}

test("release workflow has protected tag and serialized recovery entry points", () => {
  assert.equal(existsSync(workflowPath("release.yml")), true, "missing release.yml");
  assertReleasePolicy(workflow("release.yml"));
  assertActionlintQueueSuppression();
});

test("release trigger and event mapping fail closed under mutation", () => {
  const yaml = workflow("release.yml");
  const triggerMutations = [
    yaml.replace("\npermissions:\n", "  workflow_call:\n\npermissions:\n"),
    yaml.replace("\npermissions:\n", '  schedule:\n    - cron: "0 0 * * *"\n\npermissions:\n'),
    yaml.replace('tags: ["v*"]', 'tags: ["*"]'),
  ];
  for (const mutated of triggerMutations) assert.throws(() => assertReleasePolicy(mutated), /trigger|strictly equal|v\*/i);

  const preflight = releaseJob(yaml, "preflight");
  const eventMutations = [
    preflight.replace('*) echo "unsupported release event: $EVENT_NAME" >&2; exit 2 ;;', "*) event_kind=push ;;"),
    preflight.replace("workflow_dispatch) event_kind=recovery ;;", "workflow_dispatch) event_kind=push ;;"),
  ];
  for (const mutated of eventMutations) {
    assert.throws(() => assertReleaseEventMapping(mutated), /match|event|recovery|unsupported/i);
  }
});

test("actionlint queue suppression rejects broad or unrelated ignores", () => {
  const config = existsSync(actionlintConfigPath) ? readFileSync(actionlintConfigPath, "utf8") : "";
  for (const mutated of [
    config.replace(".github/workflows/release.yml", ".github/workflows/*.yml"),
    config.replace('^unexpected key "queue" for "concurrency" section\\.', "unexpected key"),
    `${config}      - 'another diagnostic'\n`,
  ]) {
    assert.throws(() => assertActionlintQueueSuppression(mutated), /exact stale queue diagnostic|strictly equal/i);
  }
});

test("release preflight exposes validated identity and recovery state", () => {
  const yaml = workflow("release.yml");
  const body = releaseJob(yaml, "preflight");
  assert.match(body, /fetch-depth:\s*0/);
  assert.match(body, /ref:\s*main/);
  assert.match(body, /persist-credentials:\s*false/);
  assert.match(body, /node-version:\s*node/);
  assert.match(body, /tag="\$\{INPUT_TAG:-\$GITHUB_REF_NAME\}"/);
  assert.match(body, /node scripts\/release_preflight\.ts preflight/);
  assert.match(body, /--tag "\$tag"/);
  assert.match(body, /--repository "\$GITHUB_REPOSITORY"/);
  assertReleaseEventMapping(body);
  assert.match(body, /GH_TOKEN:\s*\$\{\{ github\.token \}\}/);
  for (const output of ["tag", "version", "commit", "node_version", "registry_state", "registry_integrity", "github_release_state", "artifact_name", "artifact_id", "artifact_run_id"]) {
    assert.match(body, new RegExp(`${output}:\\s*\\$\\{\\{ steps\\.preflight\\.outputs\\.${output} \\}\\}`));
  }
});

test("release obtains a new or retained immutable artifact before upload", () => {
  const yaml = workflow("release.yml");
  const body = releaseJob(yaml, "obtain-artifact");
  assertReleaseToolchain(body, /ref:\s*\$\{\{ needs\.preflight\.outputs\.commit \}\}/);
  assert.match(body, /fetch-depth:\s*0/);
  const lookup = stepBody(body, "Find reusable current-run artifact");
  assert.match(lookup, /id:\s*current-artifact/);
  assert.match(lookup, /GH_TOKEN:\s*\$\{\{ github\.token \}\}/);
  assert.match(lookup, /ARTIFACT_NAME:\s*\$\{\{ needs\.preflight\.outputs\.artifact_name \}\}/);
  assert.match(lookup, /RUN_ID:\s*\$\{\{ github\.run_id \}\}/);
  assert.match(lookup, /gh api --method GET "\/repos\/\$GITHUB_REPOSITORY\/actions\/runs\/\$RUN_ID\/artifacts"/);
  assert.match(lookup, /-f "name=\$ARTIFACT_NAME"/);
  assert.match(lookup, /total_count/);
  assert.match(lookup, /artifacts\.length/);
  assert.match(lookup, /artifact\.name !== name/);
  assert.match(lookup, /artifact\.expired !== false/);
  assert.match(lookup, /reuse=true/);
  assert.match(lookup, /artifact_id=/);

  const reuse = stepBody(body, "Download reusable current-run artifact");
  assert.match(reuse, /if:\s*steps\.current-artifact\.outputs\.reuse == 'true'/);
  assert.match(reuse, /run-id:\s*\$\{\{ github\.run_id \}\}/);
  assert.match(reuse, /artifact-ids:\s*\$\{\{ steps\.current-artifact\.outputs\.artifact_id \}\}/);
  assert.doesNotMatch(reuse, /^\s+name:/m);

  assertRerunSafeArtifactConditions(body);
  assert.match(body, /npm audit signatures/);
  assert.match(body, /npm run security:audit/);
  assert.match(body, /MD2VID_RELEASE_TAG:\s*\$\{\{ needs\.preflight\.outputs\.tag \}\}/);
  assert.match(body, /MD2VID_RELEASE_COMMIT:\s*\$\{\{ needs\.preflight\.outputs\.commit \}\}/);
  assert.match(body, /npm run release:pack -- --output release-artifact/);
  const download = stepBody(body, "Download retained release artifact");
  assert.match(download, /if:\s*needs\.preflight\.outputs\.registry_state == 'existing' && steps\.current-artifact\.outputs\.reuse != 'true'/);
  assert.match(download, /actions\/download-artifact@[a-f0-9]{40}\s+# v\d+(?:\.\d+)*/);
  assert.match(download, /artifact-ids:\s*\$\{\{ needs\.preflight\.outputs\.artifact_id \}\}/);
  assert.match(download, /run-id:\s*\$\{\{ needs\.preflight\.outputs\.artifact_run_id \}\}/);
  assert.doesNotMatch(download, /^\s+name:/m);
  assert.match(download, /github-token:\s*\$\{\{ github\.token \}\}/);
  assert.match(download, /repository:\s*\$\{\{ github\.repository \}\}/);
  assert.match(download, /path:\s*release-artifact/);
  const metadata = stepBody(body, "Validate artifact metadata and checksums");
  assert.match(metadata, /--metadata release-artifact\/artifact\.json/);
  assert.match(metadata, /--expected-version "\$VERSION"/);
  assert.match(metadata, /--expected-tag "\$TAG"/);
  assert.match(metadata, /--expected-commit "\$COMMIT"/);
  assert.match(metadata, /--metadata-only/);
  assert.ok(metadata.indexOf("artifact.json") < metadata.indexOf("release:verify-artifact"), "metadata identity must be checked before archive verification");
  assert.match(stepBody(body, "Export validated artifact outputs"), /for \(const key of \["tarball", "integrity", "sha256", "version", "tag", "commit"\]\) console\.log\(`\$\{key\}=\$\{value\[key\]\}`\)/);
  for (const output of ["tarball", "integrity", "sha256", "version", "tag", "commit"]) {
    assert.match(body, new RegExp(`${output}:\\s*\\$\\{\\{ steps\\.artifact\\.outputs\\.${output} \\}\\}`));
  }
  const upload = stepBody(body, "Upload current release artifact");
  assert.match(upload, /id:\s*upload-artifact/);
  assert.match(upload, /if:\s*steps\.current-artifact\.outputs\.reuse != 'true'/);
  assert.match(upload, /overwrite:\s*false/);
  assertReleaseDiagnostics(yaml);
});

test("release diagnostics policy rejects unrelated workspace uploads", () => {
  const yaml = workflow("release.yml");
  const unrelatedUpload = `      - name: Upload unrelated workspace
        if: failure()
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
        with:
          name: unrelated-workspace
          path: $GITHUB_WORKSPACE
          retention-days: 14
`;
  const unnamedUpload = `      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
        with: { name: leaked-workspace, path: . }
`;
  for (const upload of [unrelatedUpload, unnamedUpload]) {
    const mutated = yaml.replace("      - name: Summarize artifact acquisition\n", `${upload}      - name: Summarize artifact acquisition\n`);
    assert.throws(() => assertReleaseDiagnostics(mutated), /exactly three|workspace|upload/i);
  }
});

test("release artifact policy rejects rerun collisions and overwrite", () => {
  const body = releaseJob(workflow("release.yml"), "obtain-artifact");
  const mutations = [
    body.replace("steps.current-artifact.outputs.reuse != 'true'", "success()"),
    body.replace("steps.current-artifact.outputs.reuse == 'true'", "success()"),
    body.replace("overwrite: false", "overwrite: true"),
    body.replace(
      "artifact-ids: ${{ steps.current-artifact.outputs.artifact_id }}",
      "name: ${{ needs.preflight.outputs.artifact_name }}",
    ),
    body.replace(
      "artifact-ids: ${{ needs.preflight.outputs.artifact_id }}",
      "name: ${{ needs.preflight.outputs.artifact_name }}",
    ),
  ];
  assert.throws(() => assertRerunSafeArtifactConditions(mutations[0]), /skip|strictly equal|reuse/i);
  assert.throws(() => assertRerunSafeArtifactConditions(mutations[1]), /reuse|match/i);
  assert.throws(() => assertRerunSafeArtifactConditions(mutations[2]), /overwrite|match/i);
  assert.throws(() => assertRerunSafeArtifactConditions(mutations[3]), /artifact-ids|selected artifact ID|match/i);
  assert.throws(() => assertRerunSafeArtifactConditions(mutations[4]), /artifact-ids|validated artifact ID|match/i);
});

test("release verifies one exact current-run tarball on every supported OS", () => {
  const yaml = workflow("release.yml");
  const body = releaseJob(yaml, "verify-artifact");
  assertReleaseVerificationMatrix(yaml);
  assertReleaseArtifactVerificationRequired(yaml);
  assert.match(body, /^    runs-on:\s*\$\{\{ matrix\.runner \}\}\s*$/m);
  assert.match(body, /actions\/download-artifact@[a-f0-9]{40}\s+# v\d+(?:\.\d+)*/);
  assert.match(body, /name:\s*\$\{\{ needs\.preflight\.outputs\.artifact_name \}\}/);
  assertReleaseToolchain(body, /ref:\s*\$\{\{ needs\.preflight\.outputs\.commit \}\}/);
  assert.ok(body.indexOf("Check out verified commit") < body.indexOf("Download current release artifact"), "checkout cleanup must run before artifact download");
  assert.match(stepBody(body, "Install verification dependencies"), /^\s+run:\s*npm ci --ignore-scripts\s*$/m);
  const linuxMedia = stepBody(body, "Install Linux media tools");
  assert.match(linuxMedia, /if:\s*runner\.os == 'Linux'/);
  assert.match(linuxMedia, /sudo apt-get install --yes ffmpeg/);
  const macMedia = stepBody(body, "Install macOS media tools");
  assert.match(macMedia, /if:\s*runner\.os == 'macOS'/);
  assert.match(macMedia, /brew install ffmpeg/);
  for (const media of [linuxMedia, macMedia]) {
    assert.match(media, /command -v ffmpeg/);
    assert.match(media, /command -v ffprobe/);
  }
  assert.match(body, /MD2VID_DIAGNOSTICS_DIR:\s*release-diagnostics/);
  assert.match(stepBody(body, "Verify exact release artifact"), /^\s+--tarball "release-artifact\/\$TARBALL" \\$/m);
  assert.match(body, /--metadata release-artifact\/artifact\.json/);
  assert.match(body, /--expected-version "\$VERSION"[\s\S]*--expected-tag "\$TAG"[\s\S]*--expected-commit "\$COMMIT"/);
  assert.match(body, /--diagnostics release-diagnostics/);
  assert.doesNotMatch(body, /npm pack|release:pack/);
});

test("release publication uses OIDC only and publishes the verified tarball", () => {
  const yaml = workflow("release.yml");
  const body = releaseJob(yaml, "publish-npm");
  assertReleaseToolchain(body, /ref:\s*\$\{\{ needs\.preflight\.outputs\.commit \}\}/);
  assert.match(body, /actions\/download-artifact@[a-f0-9]{40}\s+# v\d+(?:\.\d+)*/);
  assert.match(stepBody(body, "Install publication verification dependencies"), /^\s+run:\s*npm ci --ignore-scripts\s*$/m);
  assert.match(body, /--metadata-only/);
  assert.match(body, /node scripts\/release_preflight\.ts publish-check/);
  assert.match(body, /--tag "\$TAG"[\s\S]*--version "\$VERSION"[\s\S]*--commit "\$COMMIT"[\s\S]*--repository "\$GITHUB_REPOSITORY"[\s\S]*--artifact release-artifact\/artifact\.json/);
  assert.match(body, /if:\s*steps\.publish-check\.outputs\.publish == 'true'[\s\S]*npm publish "\.\/release-artifact\/\$TARBALL" --access public --tag latest/);
  assert.match(body, /if:\s*steps\.publish-check\.outputs\.publish == 'false'[\s\S]*equal-integrity recovery/);
  assert.doesNotMatch(body, /npm publish\s+(?:--access|\.|release-artifact\s)|npm pack|release:pack/);
});

test("release verifies the registry before creating a GitHub Release", () => {
  const yaml = workflow("release.yml");
  const registry = releaseJob(yaml, "verify-registry");
  const githubRelease = releaseJob(yaml, "create-github-release");
  assertReleaseToolchain(registry, /ref:\s*\$\{\{ needs\.preflight\.outputs\.commit \}\}/);
  assert.match(registry, /npm ci --ignore-scripts/);
  assert.match(registry, /npm run release:verify-registry --/);
  assert.match(registry, /--version "\$VERSION"/);
  assert.match(registry, /--integrity "\$INTEGRITY"/);
  assert.match(registry, /--diagnostics release-diagnostics/);
  assertReleaseToolchain(githubRelease, /ref:\s*\$\{\{ needs\.preflight\.outputs\.commit \}\}/);
  assert.match(githubRelease, /node scripts\/release_preflight\.ts release-check/);
  assert.match(githubRelease, /--tag "\$TAG"[\s\S]*--repository "\$GITHUB_REPOSITORY"[\s\S]*--commit "\$COMMIT"/);
  assert.match(githubRelease, /gh release create "\$TAG"/);
  assert.match(githubRelease, /--verify-tag[\s\S]*--target "\$COMMIT"[\s\S]*--title "md2vid \$TAG"[\s\S]*--generate-notes/);
  assert.match(githubRelease, /matching\)[\s\S]*echo "matching GitHub Release already exists"/);
  assert.match(githubRelease, /\*\) echo "unexpected release state" >&2; exit 1/);
  assertGhTokenOnEveryGhStep(yaml);
});

test("release creation reports the final created or matching state", () => {
  const body = releaseJob(workflow("release.yml"), "create-github-release");
  const create = stepBody(body, "Create or accept GitHub Release");
  assert.match(create, /id:\s*release/);
  const absentBranch = create.match(/absent\)\s*\n([\s\S]*?)\n\s+;;/)?.[1] ?? "";
  assert.match(absentBranch, /gh release create "\$TAG"/);
  assert.match(absentBranch, /echo "release_state=created" >> "\$GITHUB_OUTPUT"/);
  assert.doesNotMatch(absentBranch, /release_state=matching/);
  const matchingBranch = create.match(/matching\)\s*\n([\s\S]*?)\n\s+;;/)?.[1] ?? "";
  assert.match(matchingBranch, /echo "matching GitHub Release already exists"/);
  assert.match(matchingBranch, /echo "release_state=matching" >> "\$GITHUB_OUTPUT"/);
  assert.doesNotMatch(matchingBranch, /release_state=created|gh release create/);

  const summary = stepBody(body, "Summarize GitHub Release");
  assert.match(
    summary,
    /RELEASE_STATE:\s*\$\{\{ steps\.release\.outputs\.release_state \|\| steps\.release-check\.outputs\.github_release_state \|\| needs\.preflight\.outputs\.github_release_state \}\}/,
  );
});

test("release output handoff is direct and summaries stay non-sensitive", () => {
  const yaml = workflow("release.yml");
  for (const job of ["verify-artifact", "publish-npm", "verify-registry"]) {
    const body = releaseJob(yaml, job);
    for (const output of ["tarball", "integrity", "version", "tag", "commit"]) {
      assert.match(body, new RegExp(`needs\\.obtain-artifact\\.outputs\\.${output}`), `${job} does not consume ${output} directly`);
    }
  }
  assert.match(releaseJob(yaml, "create-github-release"), /needs\.preflight\.outputs\.tag/);
  assert.match(releaseJob(yaml, "create-github-release"), /needs\.preflight\.outputs\.commit/);
  assertReleaseSummaries(yaml);
  assert.doesNotMatch(yaml, /npm publish\s+"?release-artifact"?(?:\s|$)|npm publish\s+\./m);
});

test("release summary policy rejects missing always, status binding, and evidence", () => {
  const yaml = workflow("release.yml");
  const mutations = [
    yaml.replace("        if: always()", "        if: success()"),
    yaml.replace("          STATUS: ${{ job.status }}", "          STATUS: success"),
    yaml.replace('            echo "- npm: 11.15.0"', '            echo "- npm: unknown"'),
    yaml.replace('            echo "- Artifact ID: $ARTIFACT_ID"', '            echo "- Artifact reference: $ARTIFACT_ID"'),
    yaml.replace('            echo "- Public install result: $PUBLIC_INSTALL_RESULT"', '            echo "- Verification: $PUBLIC_INSTALL_RESULT"'),
  ];
  for (const mutated of mutations) {
    assert.throws(() => assertReleaseSummaries(mutated), /summary|match|always|STATUS|npm|Artifact ID|Public install result/i);
  }
});

test("release exact artifact verification cannot be skipped or made non-blocking", () => {
  const yaml = workflow("release.yml");
  const exactRun = [
    "        run: |",
    "          npm run release:verify-artifact -- \\",
    "            --tarball \"release-artifact/$TARBALL\" \\",
    "            --metadata release-artifact/artifact.json \\",
    "            --expected-version \"$VERSION\" \\",
    "            --expected-tag \"$TAG\" \\",
    "            --expected-commit \"$COMMIT\" \\",
    "            --diagnostics release-diagnostics",
  ].join("\n");
  assert.equal(yaml.includes(exactRun), true, "release verifier run block fixture must match the workflow");

  const mutations = [
    yaml.replace(
      "      - name: Verify exact release artifact\n",
      "      - name: Verify exact release artifact\n        if: matrix.runner == 'ubuntu-latest'\n",
    ),
    yaml.replace(
      "      - name: Verify exact release artifact\n",
      "      - name: Verify exact release artifact\n        continue-on-error: true\n",
    ),
    yaml.replace(
      "      - name: Verify exact release artifact\n",
      "      - name: Verify exact release artifact\n        \"if\": matrix.runner == 'ubuntu-latest'\n",
    ),
    yaml.replace(
      "      - name: Verify exact release artifact\n",
      "      - name: Verify exact release artifact\n        \"continue-on-error\": true\n",
    ),
    yaml.replace(
      "  verify-artifact:\n",
      "  verify-artifact:\n    if: matrix.runner == 'ubuntu-latest'\n",
    ),
    yaml.replace(
      "  verify-artifact:\n",
      "  verify-artifact:\n    continue-on-error: ${{ matrix.runner == 'macos-latest' }}\n",
    ),
    yaml.replace(exactRun, exactRun.replace("npm run release:verify-artifact", "true")),
    yaml.replace(exactRun, exactRun.replace("          npm run", "          # command decoy\n          npm run")),
    yaml.replace(exactRun, exactRun.replace("          npm run", "          echo unrelated\n          npm run")),
    yaml.replace(
      exactRun,
      [
        "        run: |",
        "          cat <<'VERIFY'",
        ...exactRun.split("\n").slice(1),
        "          VERIFY",
        "          true",
      ].join("\n"),
    ),
    yaml.replace(exactRun, `${exactRun} || true`),
  ];

  for (const [index, mutated] of mutations.entries()) {
    assert.notEqual(mutated, yaml, `release verification mutation ${index} must modify the workflow`);
    assert.throws(
      () => assertReleaseArtifactVerificationRequired(mutated),
      /if|continue-on-error|skip|blocking|quoted|verifier|command|deep-equal|strictly equal|match/i,
      `release verification mutation ${index} was accepted`,
    );
  }
});

for (const [name, mutate] of [
  [
    "anchored job if",
    (yaml: string) =>
      yaml.replace(
        "  verify-artifact:\n",
        "  verify-artifact:\n    &job-if-key if: matrix.runner == 'ubuntu-latest'\n",
      ),
  ],
  [
    "anchored job continue-on-error",
    (yaml: string) =>
      yaml.replace(
        "  verify-artifact:\n",
        "  verify-artifact:\n    &job-continue-key continue-on-error: true\n",
      ),
  ],
  [
    "anchored step if",
    (yaml: string) =>
      yaml.replace(
        "      - name: Verify exact release artifact\n",
        "      - name: Verify exact release artifact\n        &step-if-key if: matrix.runner == 'ubuntu-latest'\n",
      ),
  ],
  [
    "tagged step if",
    (yaml: string) =>
      yaml.replace(
        "      - name: Verify exact release artifact\n",
        "      - name: Verify exact release artifact\n        !!str if: matrix.runner == 'ubuntu-latest'\n",
      ),
  ],
  [
    "custom verification shell",
    (yaml: string) =>
      yaml.replace(
        "      - name: Verify exact release artifact\n        shell: bash\n",
        "      - name: Verify exact release artifact\n        shell: bash -c 'exit 0' -- {0}\n",
      ),
  ],
  [
    "duplicate verification shell",
    (yaml: string) =>
      yaml.replace(
        "      - name: Verify exact release artifact\n        shell: bash\n",
        "      - name: Verify exact release artifact\n        shell: bash\n        shell: bash -c 'exit 0' -- {0}\n",
      ),
  ],
  [
    "quoted verification shell",
    (yaml: string) =>
      yaml.replace(
        "      - name: Verify exact release artifact\n        shell: bash\n",
        "      - name: Verify exact release artifact\n        \"shell\": bash -c 'exit 0' -- {0}\n",
      ),
  ],
  [
    "anchored verification shell key",
    (yaml: string) =>
      yaml.replace(
        "      - name: Verify exact release artifact\n        shell: bash\n",
        "      - name: Verify exact release artifact\n        &shell-key shell: bash -c 'exit 0' -- {0}\n",
      ),
  ],
  [
    "tagged verification shell key",
    (yaml: string) =>
      yaml.replace(
        "      - name: Verify exact release artifact\n        shell: bash\n",
        "      - name: Verify exact release artifact\n        !!str shell: bash -c 'exit 0' -- {0}\n",
      ),
  ],
] as const) {
  test(`release verification rejects ${name}`, () => {
    const yaml = workflow("release.yml");
    const mutated = mutate(yaml);
    assert.notEqual(mutated, yaml, `${name} mutation must modify the workflow`);
    assert.throws(
      () => assertReleaseArtifactVerificationRequired(mutated),
      /if|continue-on-error|blocking|duplicate|quoted|shell|strictly equal|deep-equal|parse/i,
    );
  });
}

test("release verification matrix rejects missing and unsupported runners", () => {
  const yaml = workflow("release.yml");
  const mutations = [
    yaml.replace(", macos-latest", ""),
    yaml.replace(
      "runner: [ubuntu-latest, macos-latest]",
      "runner: [ubuntu-latest, macos-latest, windows-latest]",
    ),
    yaml.replace(
      "        runner: [ubuntu-latest, macos-latest]",
      "        runner: [ubuntu-latest, macos-latest]\n      # matrix comment decoy\n        include:\n          - runner: windows-2025",
    ),
  ];

  for (const mutated of mutations) {
    assert.notEqual(mutated, yaml, "release verification matrix mutation must modify the workflow");
    assert.throws(
      () => assertReleaseVerificationMatrix(mutated),
      /fail-fast|matrix|runner|macos|windows|deep-equal|strictly equal/i,
    );
  }
});

test("release policy rejects authority, dependency, and tarball mutations", () => {
  const yaml = workflow("release.yml");
  const mutations = [
    yaml.replace("cancel-in-progress: false", "cancel-in-progress: true"),
    yaml.replace("  queue: max\n", "  # GitHub Actions queues one pending run when cancellation is disabled.\n"),
    yaml.replace("needs: [preflight, obtain-artifact, verify-artifact]", "needs: [preflight, obtain-artifact]"),
    yaml.replace("      id-token: write", "      contents: write"),
    yaml.replace('npm publish "./release-artifact/$TARBALL" --access public --tag latest', "npm publish release-artifact --access public --tag latest"),
    yaml.replace("retention-days: 90", "retention-days: 14"),
    yaml.replace("ref: ${{ needs.preflight.outputs.commit }}", "ref: main"),
  ];
  const checks = [
    assertReleasePolicy,
    assertReleasePolicy,
    assertReleaseDependencies,
    assertReleaseAuthorities,
    (value: string) => assert.match(releaseJob(value, "publish-npm"), /npm publish "\.\/release-artifact\/\$TARBALL" --access public --tag latest/),
    assertReleaseDiagnostics,
    (value: string) => assertReleaseToolchain(releaseJob(value, "obtain-artifact"), /ref:\s*\$\{\{ needs\.preflight\.outputs\.commit \}\}/),
  ];
  for (let index = 0; index < mutations.length; index += 1) {
    assert.throws(() => checks[index](mutations[index]), /match|permission|cancel|retention|ref|publish|contents|dependency|deep-equal|strictly equal/i);
  }
});
