# Golden byte-oracle fixtures

The load-bearing safety net for the multi-framework refactor. The retained
project (`hash-table-example`) must rebuild **byte-identical** through pipeline
changes. `golden.test.ts` seeds a temp dir from pinned inputs, runs the full
`build → regroup --max-chars 54` chain (the exact command each video's
`package.json` runs), and diffs four artifacts against `expected/`.

## Layout

```
fixtures/<slug>/
  inputs/     ← PINNED, read-only. Copied into a temp dir per test run.
    audio_meta.json      per-line word timings (frozen — see "Why pinned")
    video.config.json    neutral: timing / canvas / slugs (no gsapSrc)
    output.config.json   framework-local: framework + gsapSrc
  expected/   ← BLESSED oracle. The four artifacts the chain must reproduce.
    cues.json            (built into shared/)
    caption_groups.json  (built into shared/, POST-regroup)
    index.html           (built into hyperframes/)
    captions.html        (built into hyperframes/compositions/, POST-regroup)
```

## Why the inputs are pinned (and committed despite `.gitignore`)

The live build outputs are **not** a reliable oracle:

- `.gitignore` ignores `audio_meta.json`, `caption_groups.json`, and
  `compositions/captions.html` — they never exist in a clean checkout.
- `audio_meta.json` is produced by a **non-deterministic Whisper chain**, so
  re-transcribing would not reproduce the same word timings.

So "byte-identical" is only enforceable if we freeze the inputs. The fixtures are
committed with `git add -f` (they match ignore globs) precisely because they are
the oracle — they belong in git even though the live copies are ignored.

## Why the FULL chain, not `build` alone

The committed `caption_groups.json` / `captions.html` are **post-regroup**
(hash-table-example: 41 groups). `build` alone emits one group per frame (7). Running
build in isolation reproduces `index.html` + `cues.json` but never the committed
captions — the oracle must run the same `build` + `regroup` chain each
`package.json` defines.

## Re-blessing (only when a byte change is intentional and reviewed)

If a pipeline change legitimately alters the output, re-bless by rebuilding from
the pinned inputs into a temp dir and copying the four artifacts back into
`expected/`. Never re-bless from a live `outputs/<input>/` dir — always from the
pinned `inputs/`, so the oracle stays reproducible from a clean checkout.
