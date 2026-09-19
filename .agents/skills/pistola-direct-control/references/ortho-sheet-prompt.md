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

1. Keep the bytes in the IDE/asset store.
2. Pair the sheet with a text blueprint.
3. `pistola_reference_add({ dataUrl or path, layout: 'front|side|top', knownDimension, blueprint })`.
4. Use the returned gold masks as the IoU target. Optional: hull blockout and `create_guide`.
5. Continue the default plan → build → check → fix → render loop.
