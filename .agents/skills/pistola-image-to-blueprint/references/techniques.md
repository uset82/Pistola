# Shape strategies

Pick the cheapest strategy that keeps the part's silhouette recognizable. The feature guide maps each one to what the current Pistola host supports; see `$pistola-features`.

| Strategy | Use for | How |
|---|---|---|
| `silhouette-intersection` | Main organic bodies such as hulls, car bodies, and fuselages | Extrude the SIDE outline across the full width, extrude the TOP outline across the full height, and keep the intersection. It matches both views at once, which is what makes a hull look like a hull and not a box. |
| `profile-extrude` | Flat-ish parts with a distinctive outline: sails, fins, signs, hearts, brackets | One traced or drawn polygon, extruded by the part's thickness. |
| `revolve` | Round parts: masts, bottles, wheels, domes, lamp bases | A half-profile (radius vs height) revolved around its axis. |
| `primitive` | Genuinely boxy or simple parts: cabins, roofs, axles, posts, wheels | Box, cylinder, sphere, cone, torus, capsule, or wedge, scaled to `dims_m`. |
| `architecture` | Buildings and rooms | Walls, slabs, roofs, doors, and windows, not primitives. |
| `mac` | Engineered mechanical parts (gears, brackets with holes) | Only where the real MAC runtime runs; see `$pistola-features`. |

## Reading the views

- **Side view:** image x becomes object z (the front is to the right, so flip it if the object faces left), and image y becomes object y. It gives length and height.
- **Top view:** image x becomes object z, and image y becomes object x. It gives length and width.
- **Front view:** image x becomes object x, and image y becomes object y. It gives width and height.
- Traced side and front outlines use the bottom-center origin, so y = 0 is the floor contact. Top outlines are centered.
- Profile planes in the blueprint:

  | Plane | Point order | Extruded along |
  |---|---|---|
  | `XY` | `[x, y]` | z |
  | `XZ` | `[x, z]` | y |
  | `YZ` | `[z, y]` | x |

  A traced side view becomes a `YZ` profile.

## Decomposition rules

- Start from the biggest part (the root) and give every other part a `parent`.
- Parts that sit on another part take `position_m.y` = the parent's `position_m.y` + the parent's height at that spot.
- Keep symmetric parts symmetric: mirror x positions exactly (±0.12, not 0.12 and -0.118).
- Toy style: round sizes to the nearest 5 mm, and exaggerate chunky parts by about 10% rather than adding detail.
- If a part needs a strategy the host lacks, fall back one row up the table and note it in `assumptions`. For example, a hull from `silhouette-intersection` can fall back to `profile-extrude` of the side view at full width.

## Measuring from traced outlines

- Overall sizes come from `width_m` and `height_m` of each traced view.
- The size of a sub-part comes from its pixel extent in the view multiplied by `meters_per_pixel`. Measure it with a quick Pillow crop or by reading the outline points.
- Sanity check: key ratios in the blueprint should be within 5% of the same ratios in the image. Write two or three of them into `acceptance`, for example "cabin width is about 60% of hull width".
