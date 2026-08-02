# Hash-table Remotion example

This opt-in example is available from a clone of the public md2vid repository; it is not included in the npm package. Clone the repository, then start from its root.

Copying the example source replaces the scaffold's neutral `src/Video.tsx`, adds `src/scenes/`, and installs the output-local `visual_bindings.json` registry. Existing authored files must be reviewed before replacement.

1. `md2vid new hash-table --framework remotion`
2. `cd hash-table`
3. `npm install`
4. `cp ../examples/hash-table/remotion/src/Video.tsx src/Video.tsx`
5. `cp -R ../examples/hash-table/remotion/src/scenes src/`
6. `cp ../examples/hash-table/remotion/visual_bindings.json .`
7. Review `../examples/hash-table/remotion/video.config.json` and merge its mappings into `video.config.json`; do not overwrite the project config.
8. Generate narration matching the example IDs.
9. After narration and transcription, author or merge compatible neutral `visual_beats.json` entries before `npm run plan`.
10. `npm run build`
11. `npm run check`
12. `npm run still` or `npm run studio`

`visual_bindings.json` names only Remotion targets. It does not own timing. The neutral `visual_beats.json` supplies the matching beat IDs and resolves each one from a phrase or word-index cue after transcription:

```json
{
  "version": 1,
  "frames": {
    "03-lookup-flow": {
      "kind": "workflow",
      "beats": [
        { "id": "lookup-probe", "text": "Hash the key", "cue": { "phrase": "hash the key", "occurrence": 1 }, "workflowStep": 1 },
        { "id": "lookup-match", "text": "Choose the bucket", "cue": { "phrase": "choose the bucket", "occurrence": 1 }, "workflowStep": 2 },
        { "id": "lookup-return", "text": "Read the stored value", "cue": { "wordIndex": 42 }, "workflowStep": 3 }
      ]
    }
  }
}
```

Keep the beat IDs (`lookup-probe`, `lookup-match`, and `lookup-return`) aligned with the copied registry. Phrase and word-index anchors resolve narration timing; the registry only names the visual targets that consume those resolved beats.
