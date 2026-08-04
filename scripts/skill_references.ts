#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./main-guard.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface SkillReferenceEntry {
  source: string;
  destination: string;
  sourceFromRoot: string;
  destinationFromRoot: string;
}

const pairs = [
  ["docs/standards/video-generation.md", "references/standards/video-generation.md"],
  ["docs/standards/git.md", "references/standards/git.md"],
  ["docs/standards/design/frame.md", "references/standards/design/frame.md"],
  ["docs/standards/design/knowledge-expression.md", "references/standards/design/knowledge-expression.md"],
  ["docs/standards/design/frame-content.md", "references/standards/design/frame-content.md"],
  ["docs/standards/frameworks/hyperframes.md", "references/standards/frameworks/hyperframes.md"],
  ["docs/standards/frameworks/remotion.md", "references/standards/frameworks/remotion.md"],
] as const;

export const SKILL_REFERENCE_MAP: SkillReferenceEntry[] = pairs.map(([sourceFromRoot, destination]) => ({
  source: sourceFromRoot,
  destination,
  sourceFromRoot,
  destinationFromRoot: join("skill", "md2vid", destination),
}));

function markdownFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) out.push(...markdownFiles(path));
    else if (path.endsWith(".md")) out.push(path);
  }
  return out;
}

export function syncSkillReferences(repoRoot = REPO_ROOT): void {
  const referencesRoot = join(repoRoot, "skill", "md2vid", "references");
  rmSync(referencesRoot, { recursive: true, force: true });
  for (const entry of SKILL_REFERENCE_MAP) {
    const source = join(repoRoot, entry.sourceFromRoot);
    const destination = join(repoRoot, entry.destinationFromRoot);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination);
  }
}

export function assertSkillReferencesEqual(repoRoot = REPO_ROOT): void {
  const failures: string[] = [];
  for (const entry of SKILL_REFERENCE_MAP) {
    const source = join(repoRoot, entry.sourceFromRoot);
    const destination = join(repoRoot, entry.destinationFromRoot);
    if (!existsSync(source)) failures.push(`missing source ${entry.sourceFromRoot}`);
    else if (!existsSync(destination)) failures.push(`missing copy ${entry.destinationFromRoot}`);
    else if (readFileSync(source, "utf8") !== readFileSync(destination, "utf8")) {
      failures.push(`drift ${entry.destinationFromRoot}`);
    }
  }
  if (failures.length) {
    throw new Error(`FAIL [skill-references]: ${failures.join("; ")} — run npm run sync:skill-references`);
  }
}

export function assertSkillMarkdownReferencesResolve(skillRoot: string): void {
  const broken: string[] = [];
  const link = /\[[^\]]+\]\(([^)#]+\.md)(?:#[^)]*)?\)/g;
  for (const file of markdownFiles(skillRoot)) {
    const body = readFileSync(file, "utf8");
    for (const match of body.matchAll(link)) {
      const target = match[1];
      if (/^[a-z]+:/i.test(target)) continue;
      const resolved = resolve(dirname(file), target);
      if (!existsSync(resolved)) broken.push(`${relative(skillRoot, file)} -> ${target}`);
    }
  }
  if (broken.length) throw new Error(`FAIL [skill-references]: broken Markdown links: ${broken.join("; ")}`);
}

const PORTABLE_MEDIA_COMMAND = 'node "$MEDIA_USE_ROOT/audio/scripts/audio.mjs"';
const STALE_SKILL_GUIDANCE = /(?:\.\.\/)*scripts\/\S+\.(?:ts|mjs)|\.\.\/\.\.\/scripts|@\.\.\/\.\.\/docs|docs\/standards\/|outputs\/hash-table-example\/|frameworks\/[^/\s]+\/templates(?:\/\S+)?/;

export function findStaleSkillGuidance(skillRoot: string): string[] {
  return markdownFiles(skillRoot)
    .filter((path) => {
      const body = readFileSync(path, "utf8");
      const withoutExactPortableCommand = body.split("\n").map((line) => {
        const command = line.trim().replace(/\\\s*$/u, "").trim();
        return command === PORTABLE_MEDIA_COMMAND ? "" : line;
      }).join("\n");
      return STALE_SKILL_GUIDANCE.test(withoutExactPortableCommand);
    })
    .map((path) => relative(skillRoot, path));
}

export function validateSkillTree(skillRoot: string): void {
  const skillFile = join(skillRoot, "SKILL.md");
  if (!existsSync(skillFile)) throw new Error("FAIL [install-skill]: missing SKILL.md");
  const body = readFileSync(skillFile, "utf8");
  if (!/^name:\s*md2vid$/m.test(body)) throw new Error("FAIL [install-skill]: SKILL.md name must be md2vid");
  for (const entry of SKILL_REFERENCE_MAP) {
    const path = join(skillRoot, entry.destination);
    if (!existsSync(path)) throw new Error(`FAIL [install-skill]: missing ${entry.destination}`);
  }
  const stale = findStaleSkillGuidance(skillRoot);
  if (stale.length) throw new Error(`FAIL [install-skill]: stale guidance in ${stale.join(", ")}`);
  assertSkillMarkdownReferencesResolve(skillRoot);
}

export function run(argv: string[]): number {
  try {
    if (argv[0] === "--write") syncSkillReferences();
    else if (argv[0] === "--check") assertSkillReferencesEqual();
    else throw new Error("usage: node scripts/skill_references.ts --write|--check");
    return 0;
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
}

if (isMainModule(import.meta.url)) process.exit(run(process.argv.slice(2)));
