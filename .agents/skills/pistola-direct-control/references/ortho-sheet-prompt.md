# Prompt pack: one FRONT | SIDE | TOP sheet

Use this when the IDE can generate images. Produce **one** image, not three files.

## Prompt

```
Orthographic technical silhouette sheet of <OBJECT>, black filled shapes on a pure white background.
Exactly three views in one horizontal row, left to right, with a clear white gap between them:
1) FRONT elevation (width × height)
2) SIDE elevation (depth × height)
3) TOP plan (width × depth)
No perspective, no shadows, no ground, no text, no dimension arrows, no color, no UI.
Each view is a closed solid silhouette. The three views share the same scale.
Overall real-world size: <WIDTH_M> m wide, <HEIGHT_M> m tall, <DEPTH_M> m deep.
```

## After the image exists

1. First obtain user approval for the canonical eight-view pack and store it through `pistola_reference_set`.
2. Keep this optional sheet's bytes local to the IDE/runtime and pair it with a text blueprint.
3. `pistola_reference_sheet_add({ dataUrl or path, layout: 'front|side|top', knownDimension, blueprint })`; `path` is an HTTP(S) asset URL, never a local filesystem path.
4. Use the local gold masks as a 2×2 IoU diagnostic. Optional: hull blockout and `create_guide` proposals.
5. Continue the default plan → build → check → fix → eight-view render loop.
