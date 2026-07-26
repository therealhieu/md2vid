import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { validateVoiceAsset, validateVoicePath } from "../engine/voice_assets.ts";
import type { VoiceAssetSnapshot } from "../engine/types.ts";

export { validateVoicePath } from "../engine/voice_assets.ts";

type Framework = "hyperframes" | "remotion";

interface VoiceStageFs {
  rename(source: string, destination: string): void;
}

export interface StageVoiceAssetsOptions {
  framework: Framework;
  voicePaths: string[];
  sourceRoot: string;
  destinationRoot: string;
  voiceSnapshots?: ReadonlyArray<VoiceAssetSnapshot>;
  fs?: VoiceStageFs;
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

function samePath(left: string, right: string): boolean {
  return relative(left, right) === "";
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
  voiceSnapshots,
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
  const snapshotsByPath = new Map(voiceSnapshots?.map((snapshot) => [snapshot.path, snapshot]));
  const files = paths.map((voicePath) => {
    try {
      validateVoiceAsset(destinationRoot, voicePath, { allowMissing: true });
      const snapshot = snapshotsByPath.get(voicePath);
      if (voiceSnapshots && !snapshot) {
        throw new Error(`missing immutable voice snapshot for ${voicePath}`);
      }
      if (snapshot) {
        return { tail: relative(sourceManaged, resolve(sourceRoot, voicePath)), snapshot, source: undefined };
      }
      const source = validateVoiceAsset(sourceRoot, voicePath);
      return { tail: relative(sourceManaged, source), snapshot: undefined, source };
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
      const stagedFile = confined(staged, file.tail);
      mkdirSync(dirname(stagedFile), { recursive: true });
      if (file.snapshot) {
        writeFileSync(stagedFile, file.snapshot.readBytes(), { mode: file.snapshot.mode });
        chmodSync(stagedFile, file.snapshot.mode);
      } else {
        copyFileSync(file.source!, stagedFile);
      }
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
