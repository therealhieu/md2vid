export const SUPPORTED_PLATFORMS: readonly NodeJS.Platform[] = [
  "darwin",
  "linux",
];

export function assertSupportedPlatform(platform: NodeJS.Platform): void {
  if (SUPPORTED_PLATFORMS.includes(platform)) return;
  throw new Error(
    `Unsupported platform "${platform}". md2vid supports macOS and Linux only.`,
  );
}
