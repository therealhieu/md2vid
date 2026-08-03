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

Use `md2vid upgrade` for future updates. Use `md2vid install-skill` directly only to repair or refresh the copied skill without changing the CLI package.

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

New projects include `audio_request.json.example`. Copy it into the real request and retain the explicit English default unless the user selects a supported override:

```json
{
  "version": 1,
  "provider": "kokoro",
  "voice": "am_michael",
  "lang": "en",
  "speed": 0.9,
  "lines": [
    { "id": "intro", "text": "Introduce the topic." },
    { "id": "recap", "text": "Recap the key idea." }
  ]
}
```

For non-English narration, supply a compatible explicit voice; do not use am_michael. Write speech, not copied display copy: target 6–14 lexical words per sentence, split at conceptual boundaries, and treat more than 18 words as a preflight failure unless the user explicitly approves that exact sentence. A comma does not count as a strong sentence boundary.

Run the narration workflow in this order:

```bash
cp audio_request.json.example audio_request.json
md2vid narration-check .
# /md2vid then runs the documented /media-use Kokoro path with explicit am_michael values.
npm run transcribe
npm run plan
npm run build
npm run check
# Listen at sentence transitions, then review visuals before rendering.
```

`md2vid narration-check` is required before synthesis. The `/md2vid` skill runs explicit Kokoro `am_michael` synthesis through `/media-use`, then `md2vid transcribe` immediately after it. Never use `say`, provider auto-selection, or a silent cloud fallback. There is no `md2vid audio` command. A versioned request needs fresh matching `narration_evidence.json` before plan, build, regroup, or verify; edit narration only by re-synthesizing and transcribing before downstream cues, captions, bindings, and render evidence are rebuilt.

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

The WAV sample extent is authoritative: `duration_s` must exactly equal `dataBytes / blockAlign / sampleRate`, safely floored to 6 decimal places and never rounded upward. On Darwin/Linux, md2vid opens the final path with `O_NOFOLLOW | O_NONBLOCK`, rejects static intermediate symlinks and nonregular files, and checks path/file identities before and after reading. These checks detect ordinary cooperative changes best-effort; they are not race-free against an adversarial swap-and-restore writer because Node core has no descriptor-relative traversal API. Keep the project tree quiescent while inputs are snapshotted. Once captured, immutable snapshot bytes drive timing, transcription, build staging, and emitted-asset SHA-256 verification without a native addon or system helper. Word timings must be finite, ordered, non-overlapping, and within `0 <= start <= end <= duration_s`. `md2vid transcribe` snapshots every WAV before provider calls, uses a private temporary snapshot tree, replaces stale JSON durations, and bounds a provider's final-word overrun without extending the WAV. `md2vid build` and `md2vid verify` reject duration mismatches, out-of-WAV words, and missing/symlinked/stale emitted WAVs before managed output mutation or successful verification, with the metadata path plus voice and word identity.

Voice IDs may be meaningful strings such as `intro` or `recap`, but every ID must be non-empty and unique. Frame order follows the `voices[]` array, not the spelling or numeric value of an ID. Map each voice ID to its authored frame slug in `video.config.json`:

```json
{
  "slugs": {
    "intro": "01-intro"
  }
}
```

The `/md2vid` skill owns narration orchestration through `/media-use`. The public CLI only validates requests and builds, transcribes, regroups, verifies, previews, and renders prepared narration assets; it has no `md2vid audio` command.

## Semantic visual timing

`visual_beats.json` is the neutral authoring contract for narrated visuals. Give each narrated node, row, card, code line, or workflow station a stable beat ID and a transcript phrase/occurrence or word-index anchor. Resolve it before framework visual authoring:

```text
transcription → visual_beats.json → md2vid plan <dir> → cue-bound visual authoring
  → md2vid build <dir> → md2vid verify <dir> → review → render
```

`md2vid plan <dir>` writes neutral resolved timing artifacts without framework emission or authored-source mutation. HyperFrames binds targets through `data-md2vid-beat` or a declared custom binding with an owned helper. Remotion binds its static `visual_bindings.json` registry through generated beat components. `md2vid verify` machine-checks beat coverage, timing tolerance, workflow order, landing, and duration; review still checks source interpretation, treatment, hierarchy, and polish.

Continuous semantic visual coverage is verified from the first spoken word through the held landing: captions, title, background, shell chrome, logos, and decoration are insufficient by themselves. A static focal may cover a long explanation; there is no fixed motion cadence requirement.

Use this workflow consistently:

```text
source coverage → storyboard semantic coverage map → script
  → narration/transcription → visual_beats v2 → md2vid plan <dir>
  → inspect resolved coverage intervals → bind framework visibility → full build
  → continuous verify → preview/manual semantic review → render
```

New scaffolds use this required policy:

```json
{
  "visualSync": {
    "mode": "required",
    "coverageMode": "required",
    "maxLead": 0.25,
    "maxLag": 0.75,
    "maxUncoveredGap": 0.5,
    "minLanding": 1
  }
}
```

A minimal `visual_beats.json` v2 frame declares interval-capable focal states:

```json
{
  "version": 2,
  "frames": {
    "frame-slug": {
      "kind": "focal",
      "beats": [
        {
          "id": "opening-context",
          "text": "Opening context",
          "role": "focal",
          "cue": { "frameStart": true },
          "coverage": { "until": "next-state" }
        },
        {
          "id": "body-detail",
          "text": "Body detail",
          "role": "focal",
          "cue": { "phrase": "body detail", "occurrence": 1 },
          "coverage": { "until": "next-state" }
        },
        {
          "id": "final-landing",
          "text": "Final landing",
          "role": "focal",
          "cue": { "phrase": "final landing", "occurrence": 1 },
          "coverage": { "until": "frame-end" }
        }
      ],
      "coverageExemptions": []
    }
  }
}
```

HyperFrames and Remotion both emit `build/visual_bindings.json` manifest v2 evidence with a canonical plan digest and authored-input digests. This manifest freshness check rejects stale evidence after changed neutral plans, changed HyperFrames frame HTML, or changed Remotion registry/source files; rerun a full build after semantic edits.

Existing v1 projects remain in compatibility warning mode unless they opt into required coverage. Migrate by converting `visual_beats.json` to v2, adding opening/body/final focal states for every narrated frame, rebuilding framework binding evidence, then switching `coverageMode` to `required`.

Project-local standards are snapshots. If `md2vid verify` says the marker is missing, perform a manual refresh of `.md2vid/standards/<framework>.md` from `docs/standards/frameworks/<framework>.md` without changing authored project files.

Existing projects without `visual_beats.json` stay in **legacy warn vs scaffold required** mode: legacy projects warn until they migrate, while new scaffolds use required mode, include a `visual_beats.json.example`, and require cue-bound framework bindings.

HyperFrames render profiles are md2vid policy flags:

```text
--profile final|draft|gif
--allow-low-fps
```

The final profile is the default: **30 FPS final default / 24 FPS minimum** for MP4/MOV. `--allow-low-fps` explicitly overrides the final minimum; draft and GIF profiles permit intentionally lower rates. `--quality` remains independent. After a successful known-output render, md2vid writes `<output>.md2vid-render.json` beside the output with the effective profile, FPS, and override state.

## CLI

```text
md2vid --help
md2vid --version
md2vid new <slug> [--framework hyperframes|remotion]
md2vid narration-check <dir> [--request <path>] [--allow-long-sentence <line-id>:<sentence-index>]
md2vid plan <dir>
md2vid build <dir> [--captions-only]
md2vid transcribe <dir>
md2vid regroup <dir> [--max-chars 54]
md2vid verify <dir>
md2vid hyperframes <command> [args]
md2vid hyperframes --version
md2vid patch-studio
md2vid install-skill
md2vid upgrade
```

`md2vid hyperframes --version` prints the exact package-owned HyperFrames version declared by this md2vid release.

The npm `postinstall` normally applies the required caption-loop patch to the pinned HyperFrames Studio bundle. npm policies such as `allowScripts` may block that lifecycle script and print a warning; the warning is nonfatal when commands succeed. Every `md2vid hyperframes <command>` proxy invocation self-heals the caption-loop patch before running HyperFrames, so `check`, preview, snapshot, browser, and render remain safe under a blocked postinstall.

## Preview and render

HyperFrames projects:

```bash
cd <video-project>
npm run plan       # resolve visual_beats.json before HTML authoring
npm run build
npm run check
npm run dev        # review in preview
npm run render     # final profile defaults to 30 FPS; only after review
```

New projects use the exact GSAP version pinned by md2vid, materialized as `https://cdn.jsdelivr.net/npm/gsap@<version>/dist/gsap.min.js` in `output.config.json`. This default requires network access during preview and render. For offline use, provide your own local GSAP file and set `gsapSrc` to a canonical project-root-relative path such as `assets/gsap/gsap.min.js`. Use that exact unchanged string in every standalone authored frame and standalone `compositions/captions.html`; HyperFrames resolves local asset paths from the project root and rejects generated `../` or `../../` parent traversal. md2vid validates the file but does not copy GSAP bytes into new projects.

During a full build, `index.html` loads the configured GSAP source once and embeds sanitized frame/caption templates with that matching external script removed. Authored frame and source files remain untouched. Hosts backed by those embedded templates omit `data-composition-src`, preventing HyperFrames from mounting a second fallback copy. Standalone authored files under `compositions/frames/` remain available for direct preview and inspection. The generated standalone `compositions/captions.html` is regenerated from staged caption groups and remains available for the same purpose. Legacy or manually authored indexes without embedded templates may continue to use `data-composition-src` source loading. Neutral JSON, generated framework artifacts, and managed voice assets are promoted together only after staged caption verification succeeds. Keep caption style, content, and initialization inside the captions composition root.

Remotion projects:

```bash
cd <video-project>
npm install
# Prepare audio_meta.json + assets/voice/*.wav, then normalize word timings.
npm run transcribe
# Author visual_beats.json against the transcript, then resolve its anchors.
npm run plan
# Author and register beat-bound src/scenes/*.tsx.
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
md2vid upgrade
```

The command supports global npm installations. It installs `md2vid@latest`, then launches the newly installed CLI to refresh the Claude skill. It also refreshes the skill when the CLI is already current.

If the CLI was launched from a local dependency, an `npx` cache, or another unsupported installation source, use manual recovery:

```bash
npm install --global md2vid@latest
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
- HyperFrames is exact-pinned by each md2vid release and patched during install.
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
