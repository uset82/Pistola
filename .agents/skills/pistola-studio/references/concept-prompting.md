# Concept prompting for buildable 3D

A concept image here has two jobs: let the user approve the look, and give the builder shapes it can trace. Pretty-but-unbuildable images waste the approval gate.

## Variants (gate 1)

Make 2 or 3 variants that differ in a meaningful design choice, such as silhouette, proportions, or number of major parts. Do not vary only the color. Label them A, B, C with a one-line description each.

Base prompt shape:

```
<object> designed as a <style> 3D model, 3/4 hero view from slightly above,
single object centered on a plain white background, soft even studio lighting,
clear readable silhouette, <3-6 major parts named>, flat or simple materials
in <palette>, no text, no background props, no people, no ground clutter
```

Style presets:

| Style | Add to the prompt |
|---|---|
| toy | chunky rounded toy proportions, smooth plastic or painted wood, bright 3-4 color palette, no tiny details |
| low-poly | faceted low-poly shapes, flat shading, limited palette |
| realistic | realistic proportions and materials, but still a clean studio product shot |
| architectural | architectural massing model, white or light gray volumes, visible doors and windows, isometric view |

Keep every detail larger than about 2 cm at real scale. Pistola builds from parts and profiles, not sculpted micro-detail.

## Ortho sheet (after approval)

Edit the approved image instead of generating a new one, so the design stays the same. Make two sheets:

1. **Silhouette sheet** (for tracing):

   ```
   Turn this exact design into an orthographic silhouette sheet: three views side by
   side, left to right: FRONT, SIDE, TOP. Same object and proportions, flat
   orthographic projection (no perspective), every view filled solid black on a pure
   white background, all views at the same scale and aligned on a common baseline,
   generous white gap between views, no text, no dimensions, no shadows.
   ```

2. **Color sheet** (optional, for part colors and the part split): the same prompt, but with "flat colors exactly as in the concept, thin dark outlines" instead of solid black.

Solid fills matter. A white cabin drawn on a white background disappears when traced, while a black silhouette traces the hull, cabin, and mast as one clean outline.

Check the sheets before tracing: the same parts as the concept, views aligned, nothing touching the image edges, a pure white background. If a view is wrong, regenerate only that problem ("the SIDE view must match the hull length of the TOP view").

## Files

Save under `.pistola/studio/<slug>/`:

- `concept-A.png`, `concept-B.png`, ...
- `concept.png`: the approved variant
- `ortho-sheet.png`, and after cropping `view-front.png`, `view-side.png`, `view-top.png`
- `render-r1.png` ... from the critique rounds

Report the paths. `.pistola/studio/` is gitignored because the repository is public.
