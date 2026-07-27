export interface WavChunk {
  id: string;
  data: Buffer;
  declaredSize?: number;
  includePadding?: boolean;
}

export interface WavFormatOptions {
  formatTag?: number;
  channels?: number;
  sampleRate?: number;
  bitsPerSample?: number;
  blockAlign?: number;
  byteRate?: number;
  extra?: Buffer;
}

export function wavFormatChunk({
  formatTag = 1,
  channels = 1,
  sampleRate = 1,
  bitsPerSample = 16,
  blockAlign = channels * Math.ceil(bitsPerSample / 8),
  byteRate = sampleRate * blockAlign,
  extra = Buffer.alloc(0),
}: WavFormatOptions = {}): Buffer {
  const data = Buffer.alloc(16 + extra.length);
  data.writeUInt16LE(formatTag, 0);
  data.writeUInt16LE(channels, 2);
  data.writeUInt32LE(sampleRate, 4);
  data.writeUInt32LE(byteRate, 8);
  data.writeUInt16LE(blockAlign, 12);
  data.writeUInt16LE(bitsPerSample, 14);
  extra.copy(data, 16);
  return data;
}

export function extensibleFormatExtra(
  subformatTag: 1 | 3,
  { cbSize = 22, validBitsPerSample = 16 }: {
    cbSize?: number;
    validBitsPerSample?: number;
  } = {},
): Buffer {
  const extra = Buffer.alloc(24);
  extra.writeUInt16LE(cbSize, 0);
  extra.writeUInt16LE(validBitsPerSample, 2);
  extra.writeUInt32LE(0, 4);
  extra.writeUInt32LE(subformatTag, 8);
  Buffer.from([0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71]).copy(extra, 12);
  return extra;
}

export function riffWave(
  chunks: WavChunk[],
  { formType = "WAVE", riffId = "RIFF", declaredRiffSize }: {
    formType?: string;
    riffId?: string;
    declaredRiffSize?: number;
  } = {},
): Buffer {
  const encoded = chunks.map(({ id, data, declaredSize = data.length, includePadding = true }) => {
    const header = Buffer.alloc(8);
    header.write(id, 0, 4, "ascii");
    header.writeUInt32LE(declaredSize, 4);
    const padding = includePadding && declaredSize % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0);
    return Buffer.concat([header, data, padding]);
  });
  const body = Buffer.concat([Buffer.from(formType, "ascii"), ...encoded]);
  const header = Buffer.alloc(8);
  header.write(riffId, 0, 4, "ascii");
  header.writeUInt32LE(declaredRiffSize ?? body.length, 4);
  return Buffer.concat([header, body]);
}

export function makeWavForSafeDuration(duration_s: number): Buffer {
  if (!Number.isFinite(duration_s) || duration_s < 0) {
    throw new Error(`duration_s must be finite and non-negative (got ${duration_s})`);
  }
  for (let sampleRate = 1; sampleRate <= 1_000_000; sampleRate += 1) {
    const sampleFrames = Math.ceil(duration_s * sampleRate);
    const safe = Math.floor(sampleFrames * 1_000_000 / sampleRate) / 1_000_000;
    if (safe === duration_s) {
      return makePcmWav({ sampleRate, sampleFrames, bitsPerSample: 8 });
    }
  }
  throw new Error(`cannot represent safe six-decimal WAV duration ${duration_s}`);
}

export function makePcmWav({
  sampleRate = 48_000,
  channels = 1,
  sampleFrames = sampleRate,
  bitsPerSample = 16,
  formatTag = 1,
  fmtExtra = Buffer.alloc(0),
  leadingChunks = [],
  trailingChunks = [],
  dataBeforeFmt = false,
}: {
  sampleRate?: number;
  channels?: number;
  sampleFrames?: number;
  bitsPerSample?: number;
  formatTag?: number;
  fmtExtra?: Buffer;
  leadingChunks?: WavChunk[];
  trailingChunks?: WavChunk[];
  dataBeforeFmt?: boolean;
} = {}): Buffer {
  const blockAlign = channels * Math.ceil(bitsPerSample / 8);
  const fmt = { id: "fmt ", data: wavFormatChunk({
    formatTag,
    channels,
    sampleRate,
    bitsPerSample,
    blockAlign,
    extra: fmtExtra,
  }) };
  const data = { id: "data", data: Buffer.alloc(sampleFrames * blockAlign) };
  return riffWave([
    ...leadingChunks,
    ...(dataBeforeFmt ? [data, fmt] : [fmt, data]),
    ...trailingChunks,
  ]);
}
