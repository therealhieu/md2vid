# Hash-table Remotion example

This opt-in example is available from a clone of the public md2vid repository; it is not included in the npm package. Clone the repository, then start from its root.

Copying the example source replaces the scaffold's neutral `src/Video.tsx` and adds `src/scenes/`. Existing authored files must be reviewed before replacement.

1. `md2vid new hash-table --framework remotion`
2. `cd hash-table`
3. `npm install`
4. `cp ../examples/hash-table/remotion/src/Video.tsx src/Video.tsx`
5. `cp -R ../examples/hash-table/remotion/src/scenes src/`
6. Review `../examples/hash-table/remotion/video.config.json` and merge its mappings into `video.config.json`; do not overwrite the project config.
7. Generate narration matching the example IDs.
8. `npm run build`
9. `npm run check`
10. `npm run still` or `npm run studio`
