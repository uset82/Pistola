---
name: pistola-image-to-blueprint
description: Turn an approved concept image or orthographic sheet into a Pistola parts blueprint with real dimensions in meters, traced silhouettes, part hierarchy, and colors. Use after the user approves a concept in pistola-studio, or when the user gives a reference image to rebuild in 3D.
---

# Image to Blueprint

The blueprint is the contract between the picture and the build. Every part must have a size, a place, a parent, and a shape strategy. The build step only translates; it does not redesign.

## Steps

1. **Scale anchor.** Choose one real dimension, usually the overall length or height, from the intake or a sensible default: toy boat 0.4 m, chair seat height 0.45 m, door 2.1 m. Every other size comes from ratios in the image, never from guesses.
2. **Crop the views** from `ortho-sheet.png` into `view-front.png`, `view-side.png`, and `view-top.png` (Pillow crop, with a small white margin).
3. **Trace** the views with the bundled script. The tracer needs Pillow; run it as `python scripts/trace_silhouette.py self-test` to check the setup.

   For dual-axis organic hulls (boats, cars, animal bodies, aircraft):
   ```bash
   # Trace side + top views from an orthographic sheet directly into an intersect_profiles spec:
   python scripts/trace_silhouette.py trace-ortho ortho-sheet.png --length-m 0.40 --width-m 0.16 --height-m 0.12 --out hull.json
   ```
   This generates a ready-to-run `build_cad_solid` action with `op: "intersect_profiles"` that performs CSG boolean intersection between the side extrusion and top extrusion.

   For single view profiles or palette sampling:
   ```bash
   python scripts/trace_silhouette.py trace view-side.png --width-m 0.40 --view side --out side.json
   python scripts/trace_silhouette.py trace view-top.png  --width-m 0.40 --view top  --out top.json
   python scripts/trace_silhouette.py palette concept.png --colors 5
   ```

   Use `--dilate 2` when thin parts detach, and `--epsilon 3` for fewer points (about 12 to 40 points per outline is a good target). Keep `meters_per_pixel` consistent across views; if the views disagree by more than 5%, fix the sheet instead of averaging.
4. **Split into parts.** Work from the concept and the color sheet. A part is something with its own shape or color: hull, cabin, roof, mast, sail, wheel. Use 4 to 15 parts for a toy object. Merge anything under about 2 cm.
5. **Pick a shape strategy per part** using [references/techniques.md](references/techniques.md).
6. **Write the blueprint** following [references/blueprint.schema.json](references/blueprint.schema.json). See [references/sample-blueprint.json](references/sample-blueprint.json) for a complete toy boat.

## Conventions (match the Pistola renderer)

- Meters. +Y up, floor at y = 0. +Z is the object's front (bow, face), +X is its right side.
- `position_m` is the **bottom-center** of the part (Pistola items are rendered base-up), relative to the object origin at the floor.
- `rotation_deg` is in degrees in the blueprint; the feature guide converts it to radians.
- Colors are hex values sampled with `palette`, then rounded to a small scheme of 3 to 5 colors.
- `parent` is the id of the part it sits on. The root part has `parent: null`.

Return only the blueprint JSON plus a short list of assumptions.
