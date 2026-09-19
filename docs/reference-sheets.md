# Front / side / top reference sheets

Pistola does not generate images. IDEs that can (or a user on a free site) can supply one
black-on-white orthographic sheet as an **optional tracing aid**. It comes after—not instead
of—the user-approved eight-view pack: Top, Left 45°, Front, Right 45°, Left, Right, Back,
Bottom. The default pipeline stays plan → examples → build → check → fix → render → critique
→ keep best.

## What to make

One image, three views in a single row, left to right:

1. Front (XY: width × height)
2. Side (ZY: depth × height)
3. Top (XZ: width × depth)

Rules:

- Black silhouette on a white background
- Orthographic, no perspective, no shadows, no ground plane
- No labels, dimensions, or UI chrome
- Views separated by white space so they are three components
- One known real-world length in meters (overall width unless you say otherwise)

Call:

```
pistola_reference_sheet_add({
  dataUrl,                 // or a browser-accessible http(s) URL in path
  layout: 'front|side|top',
  knownDimension: 0.4,     // meters, or { axis: 'width'|'height'|'depth', meters }
  blueprint,               // required text plan
})
```

Pistola traces the sheet (Moore contour + Douglas-Peucker), checks the three shared
dimensions within ±5%, stores gold masks for `pistola_render_views` IoU, and returns
optional `build_cad_solid` hull and `create_guide` actions. It does not apply them.
`pistola_reference_sheet_fit` may propose translate/scale patches; it also does not apply them.

## Free-site recipe

1. Open a blank canvas on any free draw/image site (or a vector editor).
2. Set the background to white.
3. Draw three filled black outlines in a row: front, side, top.
4. Export PNG.
5. Upload that PNG in the IDE, then pass its data URL (or a browser-accessible asset URL) to
   `pistola_reference_sheet_add`. A local filesystem path is not accessible to the browser runtime.

Photos and sketched perspective views are the wrong input. Use a clean sheet or skip
reference mode.
