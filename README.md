# md2vid

Turn Markdown documents into narrated HyperFrames or Remotion explainer videos with a global CLI and the `/md2vid` Claude Code skill.

## Requirements

- Supported operating systems: macOS and Linux
- Node.js >=22.18
- npm
- Claude Code for `/md2vid`
- Voice WAV files or an external TTS provider; md2vid does not synthesize speech

A normal npm installation on Windows is rejected with `EBADPLATFORM`. If platform checks are deliberately forced or overridden, the `md2vid` CLI still exits with an unsupported-platform error before dispatching a command.

## Install

```bash
npm install -g md2vid
md2vid install-skill
```

Rerun `md2vid install-skill` after every `npm update -g md2vid`.

## Generate from another project

```bash
cd /path/to/project
claude
```

Then invoke:

```text
/md2vid Turn docs/article.md into a narrated HyperFrames explainer.
```

Use “Remotion” or “both frameworks” explicitly when required.

## Narration

New projects include `audio_request.json.example` as a narration planning example. Review its lines, then use the `/md2vid` skill workflow to generate or prepare voice WAV files and `audio_meta.json`. There is no `md2vid audio` command.

Store voice files under `assets/voice/` and reference them with paths relative to the flat project root or the canonical `shared/` root. A minimal `audio_meta.json` is:

```json
{
  "voices": [
    {
      "id": "intro",
      "path": "assets/voice/intro.wav",
      "duration_s": 3.2,
      "words": [
        {
          "text": "Welcome.",
          "start": 0,
          "end": 0.8
        }
      ]
    }
  ]
}
```

Voice IDs may be meaningful strings such as `intro` or `recap`, but every ID must be non-empty and unique. Frame order follows the `voices[]` array, not the spelling or numeric value of an ID. Map each voice ID to its authored frame slug in `video.config.json`:

```json
{
  "slugs": {
    "intro": "01-intro"
  }
}
```

The `/md2vid` skill plus the HyperFrames media engine (`/hyperframes-media`) owns narration generation. You may instead create WAV files with an external TTS provider, but the public CLI only builds, transcribes, regroups, verifies, previews, and renders prepared narration assets; it has no `md2vid audio` command.

## CLI

```text
md2vid --help
md2vid --version
md2vid new <slug> [--framework hyperframes|remotion]
md2vid build <dir> [--captions-only]
md2vid transcribe <dir>
md2vid regroup <dir> [--max-chars 54]
md2vid verify <dir>
md2vid hyperframes <command> [args]
md2vid hyperframes --version
md2vid patch-studio
md2vid install-skill
```

`md2vid hyperframes --version` must print the package-owned HyperFrames version `0.7.26`.

## Preview and render

HyperFrames projects:

```bash
cd <video-project>
npm run build
npm run check
npm run dev        # review in preview
npm run render     # only after review
```

New HyperFrames projects set `gsapSrc` in `output.config.json` to the pinned CDN URL `https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js`. This default requires network access during preview and render. For offline use, provide your own local GSAP file and set `gsapSrc` to its project-relative path. Authored frame HTML must reference that same file relative to the frame document—for example, config `runtime/custom-gsap.js` becomes `../../runtime/custom-gsap.js` under `compositions/frames/`. md2vid does not copy GSAP bytes into new projects.

Remotion projects:

```bash
cd <video-project>
npm install
npm run build
npm run check
npm run still      # fast smoke
npm run studio     # interactive review
npm run render     # only after review
```

`npm run dev` is long-running; run it in a background terminal. The rendered MP4 location is printed by the framework command.

### Existing HyperFrames projects

md2vid does not auto-rewrite existing generated `package.json` files. Update existing operational scripts manually:

```json
{
  "scripts": {
    "build": "md2vid build . && md2vid regroup . --max-chars 54",
    "transcribe": "md2vid transcribe .",
    "verify": "md2vid verify .",
    "check": "md2vid verify . && md2vid hyperframes lint && md2vid hyperframes validate && md2vid hyperframes inspect",
    "dev": "md2vid hyperframes preview --no-open",
    "render": "md2vid hyperframes render",
    "publish": "md2vid hyperframes publish"
  }
}
```

Narration files are staged transactionally during full builds:

```text
shared/assets/voice/*.wav
  → HyperFrames assets/voice/*.wav
  → Remotion public/assets/voice/*.wav
```

Full builds reject missing, unsafe, non-WAV, directory, and symlink voice inputs before managed output promotion. md2vid does not synthesize narration; provide voice WAV files or use an external TTS provider.

## Manual project-local CLI use

```bash
npm install md2vid
npx --yes=false md2vid --version
```

The `/md2vid` skill requires the global CLI in v0.1; project-local execution is manual only.

## Update

```bash
npm update -g md2vid
md2vid install-skill
```

## Uninstall

POSIX shells:

```bash
npm uninstall -g md2vid
rm -rf "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/md2vid"
```

## Limitations

- Windows-style absolute paths, UNC paths, and backslash traversal remain rejected as unsafe or non-portable input on supported hosts. These checks are security boundaries and do not imply Windows runtime support.
- HyperFrames is pinned to `0.7.26` and patched during install.
- TTS synthesis is external to md2vid.
- Remotion visual scenes are hand-authored when richer than the baseline adapter output.

## Release

Prepare version metadata in a normal reviewed pull request:

```bash
npm version X.Y.Z --no-git-tag-version --ignore-scripts
npm run check
```

After that pull request merges, use a clean, synchronized checkout of `main` to authorize the release:

```bash
git switch main
git pull --ff-only origin main
npm ci
npm run release:check
git tag -a vX.Y.Z -m "md2vid vX.Y.Z"
git push origin vX.Y.Z
```

The protected annotated tag is the sole human release authorization. GitHub Actions then automatically validates the tagged source, builds one tarball, verifies that same file on Linux and macOS, publishes the same file through npm trusted publishing, verifies a public install, and creates the GitHub Release.

For an interrupted release, use the manual `workflow_dispatch` recovery path for the existing tag. If the npm version is absent, the existing protected tag may rebuild, verify, and publish it once. If the npm version is present, recovery must use the retained original artifact and exact registry SRI, skip publication, and fail closed when the artifact is missing or expired or the integrity mismatches. Never move the tag or republish an existing version.

See [`docs/release.md`](docs/release.md) for repository rulesets, npm trusted publishing, rollout, recovery, permissions, and incident handling.

### Historical maintenance note

The v0.1.1 deprecation was a separate maintenance operation and is not part of the current release flow:

```bash
npm deprecate md2vid@0.1.1 "Contains HyperFrames audio staging and Remotion scaffold defects; use md2vid@0.1.2 or later."
```

## Support

- Repository: https://github.com/therealhieu/md2vid
- Issues: https://github.com/therealhieu/md2vid/issues

## License

MIT
