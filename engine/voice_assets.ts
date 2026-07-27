import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  type Stats,
} from "node:fs";
import { createHash } from "node:crypto";
import { extname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import type { AudioMeta, Finding, VoiceAssetSnapshot } from "./types.ts";

const VOICE_PREFIX = "assets/voice/";

export function validateVoicePath(input: unknown): string {
  if (
    typeof input !== "string"
    || input.length === 0
    || isAbsolute(input)
    || win32.isAbsolute(input)
  ) {
    throw new Error(`invalid voice asset path: expected a portable project-relative .wav path under ${VOICE_PREFIX} (got ${String(input)})`);
  }

  const parts = input.split("/");
  if (
    input.includes("\\")
    || !input.startsWith(VOICE_PREFIX)
    || extname(input).toLowerCase() !== ".wav"
    || parts.some((part) =>
      part === ""
      || part === "."
      || part === ".."
      || !/^[A-Za-z0-9._-]+$/.test(part)
    )
  ) {
    throw new Error(`invalid voice asset path: expected a portable project-relative .wav path under ${VOICE_PREFIX} (got ${input})`);
  }

  return input;
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

function lstatExisting(path: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function assertNoVoiceSymlinkComponents(root: string, path: string): void {
  let current = resolve(root);
  if (lstatExisting(current)?.isSymbolicLink()) {
    throw new Error(`voice asset path contains a symlink component: ${path} (${current})`);
  }
  for (const part of validateVoicePath(path).split("/")) {
    current = join(current, part);
    if (lstatExisting(current)?.isSymbolicLink()) {
      throw new Error(`voice asset path contains a symlink component: ${path} (${current})`);
    }
  }
}

export interface ValidateVoiceAssetOptions {
  allowMissing?: boolean;
}

export function validateVoiceAsset(
  root: string,
  input: unknown,
  { allowMissing = false }: ValidateVoiceAssetOptions = {},
): string {
  const path = validateVoicePath(input);
  const candidate = confined(root, path);
  assertNoVoiceSymlinkComponents(root, path);
  if (!existsSync(candidate)) {
    if (allowMissing) return candidate;
    throw new Error(`missing voice asset ${path} (${candidate})`);
  }
  if (!lstatSync(candidate).isFile()) {
    throw new Error(`voice asset is not a regular file ${path} (${candidate})`);
  }
  return candidate;
}

export function validateVoiceAssets(
  root: string,
  inputs: ReadonlyArray<unknown>,
  options: ValidateVoiceAssetOptions = {},
): string[] {
  return inputs.map((input) => validateVoiceAsset(root, input, options));
}

export type SupportedWavFormat = "PCM" | "IEEE_FLOAT";

export interface VoiceWavProbe {
  path: string;
  absolutePath: string;
  format: SupportedWavFormat;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  validBitsPerSample: number;
  dataBytes: number;
  sampleFrames: number;
  duration_s: number;
}

export interface VoiceWavSnapshot extends VoiceWavProbe, VoiceAssetSnapshot {}

export function safeWavDuration(sampleFrames: number, sampleRate: number): number {
  if (!Number.isSafeInteger(sampleFrames) || sampleFrames < 0) {
    throw new Error(`WAV sample frames must be a non-negative safe integer (got ${sampleFrames})`);
  }
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
    throw new Error(`WAV sample rate must be a positive safe integer (got ${sampleRate})`);
  }
  const microseconds = BigInt(sampleFrames) * 1_000_000n / BigInt(sampleRate);
  if (microseconds > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("WAV microsecond duration exceeds safe integer range");
  }
  return Number(microseconds) / 1_000_000;
}

function wavError(path: string, absolutePath: string, detail: string): never {
  throw new Error(`invalid WAV voice asset ${path} (${absolutePath}): ${detail}`);
}

interface ParsedWavFormat {
  format: SupportedWavFormat;
  extensible: boolean;
  validBitsPerSample?: number;
}

function supportedWavFormat(
  bytes: Buffer,
  chunkOffset: number,
  chunkSize: number,
  path: string,
  absolutePath: string,
): ParsedWavFormat {
  if (chunkSize < 16) wavError(path, absolutePath, `truncated fmt chunk: expected at least 16 bytes, got ${chunkSize}`);
  const formatTag = bytes.readUInt16LE(chunkOffset);
  if (formatTag === 1) return { format: "PCM", extensible: false };
  if (formatTag === 3) return { format: "IEEE_FLOAT", extensible: false };
  if (formatTag !== 0xfffe) {
    wavError(path, absolutePath, `unsupported WAVE format 0x${formatTag.toString(16).padStart(4, "0")}`);
  }
  if (chunkSize < 40) wavError(path, absolutePath, `truncated WAVE_FORMAT_EXTENSIBLE fmt chunk: expected at least 40 bytes, got ${chunkSize}`);
  const extensionSize = bytes.readUInt16LE(chunkOffset + 16);
  if (extensionSize < 22) wavError(path, absolutePath, `invalid WAVE_FORMAT_EXTENSIBLE extension size ${extensionSize}`);
  if (18 + extensionSize > chunkSize) {
    wavError(path, absolutePath, `truncated WAVE_FORMAT_EXTENSIBLE extension: declared ${extensionSize} bytes`);
  }
  const guidTail = Buffer.from([0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71]);
  if (!bytes.subarray(chunkOffset + 28, chunkOffset + 40).equals(guidTail)) {
    wavError(path, absolutePath, "unsupported WAVE_FORMAT_EXTENSIBLE subformat GUID");
  }
  const subformatTag = bytes.readUInt32LE(chunkOffset + 24);
  const validBitsPerSample = bytes.readUInt16LE(chunkOffset + 18);
  if (subformatTag === 1) return { format: "PCM", extensible: true, validBitsPerSample };
  if (subformatTag === 3) return { format: "IEEE_FLOAT", extensible: true, validBitsPerSample };
  return wavError(path, absolutePath, `unsupported WAVE_FORMAT_EXTENSIBLE subformat 0x${subformatTag.toString(16).padStart(8, "0")}`);
}

function parseVoiceWavBytes(bytes: Buffer, path: string, absolutePath: string): VoiceWavProbe {
  if (bytes.length < 12) wavError(path, absolutePath, "truncated RIFF/WAVE header");
  if (bytes.toString("ascii", 0, 4) !== "RIFF") wavError(path, absolutePath, "expected RIFF container");
  if (bytes.toString("ascii", 8, 12) !== "WAVE") wavError(path, absolutePath, "expected WAVE form type");

  const riffEnd = 8 + bytes.readUInt32LE(4);
  if (riffEnd > bytes.length) {
    wavError(path, absolutePath, `truncated RIFF container: declared ${riffEnd} bytes, file has ${bytes.length}`);
  }
  if (riffEnd < 12) wavError(path, absolutePath, `invalid RIFF size ${riffEnd - 8}`);

  let parsedFormat: ParsedWavFormat | undefined;
  let channels = 0;
  let sampleRate = 0;
  let byteRate = 0;
  let blockAlign = 0;
  let bitsPerSample = 0;
  let dataBytes: number | undefined;
  let offset = 12;
  while (offset < riffEnd) {
    if (offset + 8 > riffEnd) wavError(path, absolutePath, `truncated chunk header at byte ${offset}`);
    const chunkId = bytes.toString("ascii", offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const chunkOffset = offset + 8;
    const chunkEnd = chunkOffset + chunkSize;
    if (chunkEnd > riffEnd) wavError(path, absolutePath, `truncated ${chunkId.trim() || "unnamed"} chunk: declared ${chunkSize} bytes`);

    if (chunkId === "fmt ") {
      if (parsedFormat !== undefined) wavError(path, absolutePath, "multiple fmt chunks are unsupported");
      parsedFormat = supportedWavFormat(bytes, chunkOffset, chunkSize, path, absolutePath);
      channels = bytes.readUInt16LE(chunkOffset + 2);
      sampleRate = bytes.readUInt32LE(chunkOffset + 4);
      byteRate = bytes.readUInt32LE(chunkOffset + 8);
      blockAlign = bytes.readUInt16LE(chunkOffset + 12);
      bitsPerSample = bytes.readUInt16LE(chunkOffset + 14);
    } else if (chunkId === "data") {
      if (dataBytes !== undefined) wavError(path, absolutePath, "multiple data chunks are unsupported");
      dataBytes = chunkSize;
    }

    const paddedEnd = chunkEnd + (chunkSize % 2);
    if (paddedEnd > riffEnd) wavError(path, absolutePath, `truncated padding after ${chunkId.trim() || "unnamed"} chunk`);
    offset = paddedEnd;
  }

  if (parsedFormat === undefined) wavError(path, absolutePath, "missing fmt chunk");
  if (dataBytes === undefined) wavError(path, absolutePath, "missing data chunk");
  if (channels <= 0) wavError(path, absolutePath, "channel count must be positive");
  if (sampleRate <= 0) wavError(path, absolutePath, "sample rate must be positive");
  if (blockAlign <= 0) wavError(path, absolutePath, "block align must be positive");

  const widthLabel = parsedFormat.extensible
    ? `extensible ${parsedFormat.format === "PCM" ? "PCM" : "IEEE float"}`
    : parsedFormat.format === "PCM" ? "PCM" : "IEEE float";
  const supportedWidths = parsedFormat.format === "PCM" ? [8, 16, 24, 32] : [32, 64];
  if (!supportedWidths.includes(bitsPerSample)) {
    const choices = parsedFormat.format === "PCM" ? "8, 16, 24, or 32" : "32 or 64";
    wavError(path, absolutePath, `${widthLabel} bits per sample must be ${choices} (got ${bitsPerSample})`);
  }
  const validBitsPerSample = parsedFormat.validBitsPerSample ?? bitsPerSample;
  if (parsedFormat.extensible && (validBitsPerSample <= 0 || validBitsPerSample > bitsPerSample)) {
    wavError(
      path,
      absolutePath,
      `WAVE_FORMAT_EXTENSIBLE valid bits per sample must be positive and no greater than container bits ${bitsPerSample} (got ${validBitsPerSample})`,
    );
  }
  if (parsedFormat.extensible && parsedFormat.format === "IEEE_FLOAT" && validBitsPerSample !== bitsPerSample) {
    wavError(path, absolutePath, `extensible IEEE float valid bits ${validBitsPerSample} must match container bits ${bitsPerSample}`);
  }

  const expectedBlockAlign = channels * Math.ceil(bitsPerSample / 8);
  if (blockAlign !== expectedBlockAlign) {
    wavError(
      path,
      absolutePath,
      `block align ${blockAlign} is inconsistent; expected ${expectedBlockAlign} for ${channels} channels at ${bitsPerSample} bits`,
    );
  }
  const expectedByteRate = sampleRate * blockAlign;
  if (byteRate !== expectedByteRate) {
    wavError(path, absolutePath, `byte rate ${byteRate} is inconsistent; expected ${expectedByteRate}`);
  }
  if (dataBytes % blockAlign !== 0) {
    wavError(path, absolutePath, `data size ${dataBytes} is not divisible by block align ${blockAlign}`);
  }

  const sampleFrames = dataBytes / blockAlign;
  return {
    path,
    absolutePath,
    format: parsedFormat.format,
    channels,
    sampleRate,
    byteRate,
    blockAlign,
    bitsPerSample,
    validBitsPerSample,
    dataBytes,
    sampleFrames,
    duration_s: safeWavDuration(sampleFrames, sampleRate),
  };
}

interface PathIdentity {
  path: string;
  dev: number;
  ino: number;
  mode: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}

interface VoicePathState {
  identities: PathIdentity[];
  final: PathIdentity;
}

export interface CaptureVoiceWavSnapshotOptions {
  afterOpen?: () => void;
}

function identity(path: string, status: Stats): PathIdentity {
  return {
    path,
    dev: status.dev,
    ino: status.ino,
    mode: status.mode,
    size: status.size,
    mtimeMs: status.mtimeMs,
    ctimeMs: status.ctimeMs,
  };
}

function sameIdentity(left: PathIdentity, right: PathIdentity): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function voicePathComponentPaths(root: string, path: string): string[] {
  const paths = [resolve(root)];
  for (const part of path.split("/")) paths.push(join(paths.at(-1)!, part));
  return paths;
}

function captureVoicePathState(root: string, path: string, absolutePath: string): VoicePathState {
  const componentPaths = voicePathComponentPaths(root, path);
  const identities = componentPaths.map((componentPath, index) => {
    let status: Stats;
    try {
      status = lstatSync(componentPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`missing voice asset ${path} (${absolutePath})`);
      }
      throw error;
    }
    if (status.isSymbolicLink()) {
      throw new Error(`voice asset path contains a symlink component: ${path} (${componentPath})`);
    }
    if (index < componentPaths.length - 1 && !status.isDirectory()) {
      throw new Error(`voice asset path component is not a directory: ${path} (${componentPath})`);
    }
    return identity(componentPath, status);
  });
  return { identities, final: identities.at(-1)! };
}

function changedWhileSnapshotting(path: string, absolutePath: string): never {
  throw new Error(`voice asset changed while snapshotting: ${path} (${absolutePath})`);
}

function assertVoicePathStateStable(
  expected: VoicePathState,
  path: string,
  absolutePath: string,
): void {
  for (const prior of expected.identities) {
    let current: PathIdentity;
    try {
      current = identity(prior.path, lstatSync(prior.path));
    } catch {
      changedWhileSnapshotting(path, absolutePath);
    }
    if (!sameIdentity(prior, current)) changedWhileSnapshotting(path, absolutePath);
  }
}

function assertDescriptorMatchesPathState(
  expected: VoicePathState,
  status: Stats,
  path: string,
  absolutePath: string,
): void {
  const descriptorIdentity = identity(absolutePath, status);
  if (!sameIdentity(expected.final, descriptorIdentity)) {
    changedWhileSnapshotting(path, absolutePath);
  }
}

function noFollowOpenFlags(): number {
  // Darwin/Linux are the supported runtime hosts and must provide kernel-enforced
  // final-component no-follow. Unsupported hosts retain component lstat checks and
  // use O_NOFOLLOW when Node exposes it, but receive no compatibility guarantee.
  const noFollow = constants.O_NOFOLLOW;
  const nonBlock = constants.O_NONBLOCK;
  if (process.platform === "darwin" || process.platform === "linux") {
    if (typeof noFollow !== "number") {
      throw new Error(`O_NOFOLLOW is required on supported platform ${process.platform}`);
    }
    if (typeof nonBlock !== "number") {
      throw new Error(`O_NONBLOCK is required on supported platform ${process.platform}`);
    }
  }
  return constants.O_RDONLY
    | (typeof noFollow === "number" ? noFollow : 0)
    | (typeof nonBlock === "number" ? nonBlock : 0);
}

export function captureVoiceWavSnapshot(
  root: string,
  input: unknown,
  { afterOpen }: CaptureVoiceWavSnapshotOptions = {},
): VoiceWavSnapshot {
  const path = validateVoicePath(input);
  const absolutePath = confined(root, path);
  const initialPathState = captureVoicePathState(root, path, absolutePath);
  const initialFinalIsRegular =
    (initialPathState.final.mode & constants.S_IFMT) === constants.S_IFREG;

  let descriptor: number | undefined;
  try {
    descriptor = openSync(absolutePath, noFollowOpenFlags());
    const openedStatus = fstatSync(descriptor);
    if (!openedStatus.isFile()) {
      throw new Error(`voice asset is not a regular file ${path} (${absolutePath})`);
    }
    assertDescriptorMatchesPathState(initialPathState, openedStatus, path, absolutePath);
    afterOpen?.();
    assertVoicePathStateStable(initialPathState, path, absolutePath);

    const bytes = readFileSync(descriptor);
    const readStatus = fstatSync(descriptor);
    assertDescriptorMatchesPathState(initialPathState, readStatus, path, absolutePath);
    assertVoicePathStateStable(initialPathState, path, absolutePath);

    const probe = parseVoiceWavBytes(bytes, path, absolutePath);
    return Object.freeze({
      ...probe,
      readBytes: () => Buffer.from(bytes),
      digest: createHash("sha256").update(bytes).digest("hex"),
      mode: openedStatus.mode & 0o777,
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if ((error as Error).message.startsWith("voice asset changed while snapshotting:")) {
      throw error;
    }
    if (!initialFinalIsRegular) {
      throw new Error(`voice asset is not a regular file ${path} (${absolutePath})`);
    }
    if (code === "ENOENT" || code === "ELOOP") {
      changedWhileSnapshotting(path, absolutePath);
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function captureVoiceWavSnapshots(
  root: string,
  inputs: ReadonlyArray<unknown>,
): VoiceWavSnapshot[] {
  const snapshots = new Map<string, VoiceWavSnapshot>();
  for (const input of inputs) {
    const path = validateVoicePath(input);
    if (!snapshots.has(path)) snapshots.set(path, captureVoiceWavSnapshot(root, path));
  }
  return [...snapshots.values()];
}

export function probeVoiceWav(root: string, input: unknown): VoiceWavProbe {
  const { readBytes: _readBytes, digest: _digest, mode: _mode, ...probe } = captureVoiceWavSnapshot(root, input);
  return probe;
}

export function validateAudioMetaVoiceSnapshots(
  meta: AudioMeta,
  snapshots: ReadonlyArray<VoiceWavSnapshot>,
  metadataPath: string,
): VoiceWavSnapshot[] {
  const byPath = new Map(snapshots.map((snapshot) => [snapshot.path, snapshot]));
  return meta.voices.map((voice) => {
    const wav = byPath.get(voice.path);
    if (!wav) {
      throw new Error(`invalid audio metadata at ${metadataPath}: voice "${voice.id}" has no WAV snapshot for ${voice.path}`);
    }
    if (voice.duration_s !== wav.duration_s) {
      throw new Error(
        `invalid audio metadata at ${metadataPath}: voice "${voice.id}" ${voice.path} duration_s mismatch; `
          + `expected ${wav.duration_s} from WAV sample extent, actual ${voice.duration_s}`,
      );
    }
    for (const [index, word] of voice.words.entries()) {
      if (word.end > wav.duration_s) {
        const identity = word.id ? `word "${word.id}"` : `word at index ${index}`;
        throw new Error(
          `invalid audio metadata at ${metadataPath}: voice "${voice.id}" ${identity} end ${word.end} `
            + `exceeds safe WAV duration ${wav.duration_s} for ${voice.path}`,
        );
      }
    }
    return wav;
  });
}

export function validateAudioMetaVoiceWavs(
  root: string,
  meta: AudioMeta,
  metadataPath: string,
): VoiceWavSnapshot[] {
  const snapshots = captureVoiceWavSnapshots(root, meta.voices.map((voice) => voice.path));
  return validateAudioMetaVoiceSnapshots(meta, snapshots, metadataPath);
}

export function verifyEmittedVoiceSnapshots(
  emittedRoot: string,
  sourceSnapshots: ReadonlyArray<VoiceAssetSnapshot>,
): Finding[] {
  const findings: Finding[] = [];
  for (const source of sourceSnapshots) {
    let emitted: VoiceWavSnapshot;
    try {
      emitted = captureVoiceWavSnapshot(emittedRoot, source.path);
    } catch (error) {
      findings.push({
        level: "error",
        msg: `emitted voice asset ${source.path}: ${(error as Error).message}`,
      });
      continue;
    }
    if (emitted.duration_s !== source.duration_s) {
      findings.push({
        level: "error",
        msg: `emitted voice asset ${source.path} duration mismatch; expected ${source.duration_s}, actual ${emitted.duration_s}`,
      });
      continue;
    }
    if (emitted.digest !== source.digest) {
      findings.push({
        level: "error",
        msg: `emitted voice asset ${source.path} bytes differ from validated source (SHA-256 digest mismatch)`,
      });
    }
  }
  return findings;
}
