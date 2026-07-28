// copy_dist_assets.ts — copy non-TS assets into dist/ after tsc.
//
// tsc emits only .ts → .js. The compiled code resolves template + doc trees relative
// to its own dist/ location via import.meta.url, so those trees MUST travel into
// dist/ or resolution breaks from an installed package:
//   - frameworks/**/templates/**  — HF caption-skin/frame templates and Remotion
//     project templates (the whole remotion/templates tree is excluded from
//     tsc, so it is copied verbatim).
//   - docs/**                     — the scaffolder copies docs/standards/frameworks/<fw>.md
//     into a project; from dist/frameworks/hyperframes/ that resolves to dist/docs.
//
// Run after `tsc -p tsconfig.dist.json`. Idempotent: overwrites into dist/.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_GSAP_SRC,
  GSAP_SRC_TOKEN,
  materializeGsapTemplate,
} from "../frameworks/hyperframes/scaffold.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(REPO_ROOT, "dist");

// Every framework's templates/ tree, discovered (not enumerated) so a new adapter's
// assets travel into dist/ automatically — the compiled code resolves them via
// import.meta.url at dist/frameworks/<fw>/templates.
function frameworkTemplateDirs(): string[] {
  const fwRoot = join(REPO_ROOT, "frameworks");
  return readdirSync(fwRoot)
    .map((name) => join("frameworks", name, "templates"))
    .filter((rel) => existsSync(join(REPO_ROOT, rel)) && statSync(join(REPO_ROOT, rel)).isDirectory());
}

// docs/standards — the scaffolder copies docs/standards/frameworks/<fw>.md into a
// project; from dist/frameworks/hyperframes/ that resolves to dist/docs/standards.
// Only standards/ ships — internal docs/superpowers/ planning archives stay out.
const COPIES: string[] = [...frameworkTemplateDirs(), join("docs", "standards")];

function materializeHyperframesTemplates(): void {
  const root = join(DIST, "frameworks", "hyperframes", "templates");
  for (const name of [
    "caption-skin.html",
    "frame-shell.html",
    "frame-template.html",
  ]) {
    const path = join(root, name);
    const body = readFileSync(path, "utf8");
    if (!body.includes(GSAP_SRC_TOKEN)) {
      throw new Error(`copy_dist_assets: missing GSAP token in ${path}`);
    }
    writeFileSync(path, materializeGsapTemplate(body, DEFAULT_GSAP_SRC));
  }
}

mkdirSync(DIST, { recursive: true });
for (const rel of COPIES) {
  const src = join(REPO_ROOT, rel);
  if (!existsSync(src)) throw new Error(`copy_dist_assets: missing source ${src}`);
  cpSync(src, join(DIST, rel), { recursive: true });
  console.log(`  + dist/${rel}`);
}
materializeHyperframesTemplates();
console.log("OK copied template + doc assets into dist/");
