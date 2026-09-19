# Pistola object library

Approved, reusable builds. Each row points to `objects/<slug>.json`, which holds a blueprint and replayable action batches. Instantiated at runtime through `examples.search` / `examples.get({id, params, at})` (`$ref_*` / `LEVEL` placeholders). Maintained with `$pistola-learnings`.

| Slug | Title | Keywords | Approved | Notes |
|---|---|---|---|---|
| geometric-phone-stand | Geometric blue phone stand | phone stand, desk accessory, geometric, A-frame, blue | 2026-09-19 | `library-geometric-phone-stand` |
| creation-recipes | CREATION_RECIPES wrappers | table, chair, car, dog, boat, rocket, airplane, robot, … | 2026-09-19 | `recipe-<id>` from `CREATION_RECIPES` |
| techniques | One example per kernel op | box, extrude, revolve, union, … | 2026-09-19 | `technique-<op>` |
| subassemblies | Parameterized kits | leg-set, wheel-axle, lathe-*, hollow-container, rail-ladder, handle-knob, arm-link, tapered-hull, sail-fin, quadruped-blockout, cabinet-carcass | 2026-09-19 | editable actions + blueprint fragment |
