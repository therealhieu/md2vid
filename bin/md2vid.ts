#!/usr/bin/env node
// md2vid — subcommand router. The single published executable; dispatches each
// subcommand to the shared run() body the scripts/*.ts files expose (Task 0.1),
// so the CLI and the legacy `node scripts/x.ts` path never diverge.
//
// The router owns ONLY dispatch — zero pipeline logic. Every <dir> arg is
// resolved to absolute inside the underlying parsers, so subcommands work from
// any cwd. Unknown/missing subcommand prints usage and exits 2.

import { run as newRun } from "../scripts/new_video.ts";
import { run as buildRun } from "../scripts/build.ts";
import { run as regroupRun } from "../scripts/regroup.ts";
import { run as transcribeRun } from "../scripts/transcribe.ts";
import { run as verifyRun } from "../scripts/verify.ts";
import { runHyperframes } from "../scripts/hyperframes_cli.ts";
import { run as patchRun } from "../frameworks/hyperframes/patch-studio.ts";
import { run as installSkillRun } from "../scripts/install_skill.ts";
import { run as upgradeRun } from "../scripts/upgrade.ts";
import { readPackageMetadata } from "../scripts/package_root.ts";
import { assertSupportedPlatform } from "../scripts/platform_support.ts";
import { isMainModule } from "../scripts/main-guard.ts";

type Run = (argv: string[]) => Promise<number> | number;

const COMMANDS: Record<string, Run> = {
  new: newRun,
  build: buildRun,
  regroup: regroupRun,
  transcribe: transcribeRun,
  verify: verifyRun,
  hyperframes: (args) => runHyperframes(args),
  "patch-studio": patchRun,
  "install-skill": installSkillRun,
  upgrade: upgradeRun,
};

function helpText(): string {
  return [
    "Usage: md2vid <command> [args]",
    "       md2vid --help",
    "       md2vid --version",
    "",
    "Requires Node.js >=22.18.",
    "Install globally for /md2vid: npm install -g md2vid",
    "Install or refresh the skill: md2vid install-skill",
    "Manual project-local CLI use: npx --yes=false md2vid <command>",
    "",
    "Commands:",
    "  new <slug> [--framework hyperframes|remotion]   scaffold a new video project",
    "  build <dir> [--captions-only]                    plan + emit framework files",
    "  regroup <dir> [--max-chars 54]                   rebalance caption lines",
    "  transcribe <dir>                                 word timings into audio_meta.json",
    "  verify <dir> [--max-chars N]                     neutral + framework checks",
    "  hyperframes <command> [args]                       run package-owned hyperframes@0.7.26",
    "  patch-studio                                     patch the installed HyperFrames Studio",
    "  install-skill                                    install the personal /md2vid skill",
    "  upgrade                                          update the global CLI and refresh the skill",
  ].join("\n");
}

export async function main(
  argv: string[],
  platform: NodeJS.Platform = process.platform,
): Promise<number> {
  assertSupportedPlatform(platform);

  const cmd = argv[0];
  if (cmd === "--help" || cmd === "-h") {
    console.log(helpText());
    return 0;
  }
  if (cmd === "--version" || cmd === "-v") {
    console.log(readPackageMetadata(import.meta.url).version);
    return 0;
  }
  if (!cmd || !Object.hasOwn(COMMANDS, cmd)) {
    console.error(helpText());
    return 2;
  }
  return COMMANDS[cmd](argv.slice(1));
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(`FAIL [cli]: ${(error as Error).message}`);
      process.exit(1);
    },
  );
}
