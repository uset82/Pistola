# CSG spike: manifold-3d vs three-bvh-csg

Date: 2026-09-19

Reference specs: holed plate, hollow cup (box minus inner box), hull ∩ box, mirrored bracket, polar array.

| Spec | three-bvh-csg | manifold-3d |
|---|---|---|
| Holed plate 2x2x1 minus 1x1x1 | closed mesh, volume ~3 | would need WASM (~1.2 MB) |
| Hollow cup | closed subtract | same |
| Intersection | closed | same |
| Mirror / polar array | instance merge, no WASM | extra download on Sites |

Decision: **three-bvh-csg**. It is already a dependency of `packages/core`, runs in the browser on static Sites, and needs no WASM hosting. Fake bounding-box booleans were deleted. If a boolean fails, `evaluateCadSolidSpec` throws instead of returning approximate geometry.
