import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from "node:fs";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";

const VOICE_PREFIX = "assets/voice/";

type Framework = "hyperframes" | "remotion";

interface VoiceStageFs {
  rename(source: string, destination: string): void;
}

export interface StageVoiceAssetsOptions {
  framework: Framework;
  voicePaths: string[];
  sourceRoot: string;
  destinationRoot: string;
  fs?: VoiceStageFs;
}

export function validateVoicePath(input: string): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    isAbsolute(input) ||
    win32.isAbsolute(input)
  ) {
    throw new Error(`invalid voice asset path: ${input}`);
  }

  const normalized = input.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (
    !normalized.startsWith(VOICE_PREFIX) ||
    extname(normalized).toLowerCase() !== ".wav" ||
    parts.some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`invalid voice asset path: ${input}`);
  }

  return normalized;
}

export function collectVoicePaths(
  frames: ReadonlyArray<{ voicePath: string }>,
): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const frame of frames) {
    const voicePath = validateVoicePath(frame.voicePath);
    if (!seen.has(voicePath)) {
      seen.add(voicePath);
      paths.push(voicePath);
    }
  }
  return paths;
}

function frameworkError(framework: Framework, message: string): Error {
  return new Error(`FAIL [${framework}:emit]: ${message}`);
}

function confined(root: string, path: string): string {
  const absoluteRoot = resolve(root);
  const candidate = resolve(absoluteRoot, path);
  const rel = relative(absoluteRoot, candidate);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`voice asset path escapes its allowed root: ${path}`);
  }
  return candidate;
}

function assertWithin(root: string, candidate: string, path: string): void {
  const rel = relative(root, candidate);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`voice asset path escapes its managed directory: ${path}`);
  }
}

function samePath(left: string, right: string): boolean {
  return relative(left, right) === "";
}

function lstatExisting(path: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function assertNoSymlinkComponents(root: string, path: string): void {
  let current = resolve(root);
  if (lstatExisting(current)?.isSymbolicLink()) {
    throw new Error(`voice asset path contains a symlink component: ${path} (${current})`);
  }
  for (const part of path.split("/")) {
    current = join(current, part);
    if (lstatExisting(current)?.isSymbolicLink()) {
      throw new Error(`voice asset path contains a symlink component: ${path} (${current})`);
    }
  }
}

function prefixError(framework: Framework, error: unknown): Error {
  if (error instanceof Error) {
    if (error.message.startsWith(`FAIL [${framework}:emit]`)) return error;
    return frameworkError(framework, error.message);
  }
  return frameworkError(framework, String(error));
}

export function stageVoiceAssets({
  framework,
  voicePaths,
  sourceRoot,
  destinationRoot,
  fs = { rename: renameSync },
}: StageVoiceAssetsOptions): void {
  let paths: string[];
  try {
    paths = [...new Set(voicePaths.map(validateVoicePath))];
  } catch (error) {
    throw prefixError(framework, error);
  }

  const sourceManaged = resolve(sourceRoot, "assets", "voice");
  const destinationManaged = resolve(destinationRoot, "assets", "voice");
  const files = paths.map((voicePath) => {
    try {
      const source = confined(sourceRoot, voicePath);
      const destination = confined(destinationRoot, voicePath);
      assertWithin(sourceManaged, source, voicePath);
      assertWithin(destinationManaged, destination, voicePath);
      assertNoSymlinkComponents(sourceRoot, voicePath);
      assertNoSymlinkComponents(destinationRoot, voicePath);
      if (!existsSync(source)) {
        throw new Error(`missing voice asset ${voicePath} (${source})`);
      }
      if (!lstatSync(source).isFile()) {
        throw new Error(`voice asset is not a regular file ${voicePath} (${source})`);
      }
      return { source };
    } catch (error) {
      throw prefixError(framework, error);
    }
  });

  if (samePath(sourceManaged, destinationManaged)) return;

  mkdirSync(dirname(destinationManaged), { recursive: true });
  const transaction = mkdtempSync(
    join(dirname(destinationManaged), ".voice.md2vid-tx-"),
  );
  const staged = join(transaction, "staged");
  const backup = join(transaction, "backup");
  mkdirSync(staged, { recursive: true });
  let hadPrevious = false;
  let promoted = false;
  let cleanupTransaction = true;

  try {
    for (const file of files) {
      const tail = relative(sourceManaged, file.source);
      const stagedFile = confined(staged, tail);
      mkdirSync(dirname(stagedFile), { recursive: true });
      copyFileSync(file.source, stagedFile);
    }
    if (existsSync(destinationManaged)) {
      fs.rename(destinationManaged, backup);
      hadPrevious = true;
    }
    fs.rename(staged, destinationManaged);
    promoted = true;
    if (hadPrevious) rmSync(backup, { recursive: true, force: true });
  } catch (promotionError) {
    try {
      if (promoted && existsSync(destinationManaged)) {
        rmSync(destinationManaged, { recursive: true, force: true });
      }
      if (hadPrevious) {
        fs.rename(backup, destinationManaged);
      }
    } catch (restoreError) {
      cleanupTransaction = false;
      throw new AggregateError(
        [promotionError, restoreError],
        `FAIL [${framework}:emit]: promotion failed and prior managed voice directory could not be restored; retained backup at ${backup}`,
        { cause: promotionError },
      );
    }
    throw prefixError(framework, promotionError);
  } finally {
    if (cleanupTransaction) rmSync(transaction, { recursive: true, force: true });
  }
}
