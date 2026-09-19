---
name: pistola-features
description: Pistola's internal feature guide. Explains which Pistola tool builds each kind of part (architecture, item primitives, CAD profile extrusions, CAD briefs, MAC), how to write valid action batches, how to execute them on the current host, and how to fix common errors. Use whenever you turn a blueprint or plan into Pistola actions or hit a Pistola action error.
---

# Pistola Features

Pistola executes typed **actions**, the same JSON the in-app assistant produces. You are a better planner than the in-app free models, so write the actions yourself and run them directly whenever the host allows it.

## 1. Find out what the host can do

Check once per session and note the result:

- **Execution surface:** see [references/execution-surfaces.md](references/execution-surfaces.md). IDE agents use MCP `pistola_*` or `window.pistola.invoke` only. Chat `/run` is for a person in the app, never an automatic IDE fallback.
- **CAD runtime:** open `<origin>/api/cad/health` and `<origin>/api/mac/health`. A `runtime` of `mock` means hosted FreeCAD/MAC helpers are unavailable. Use `build_cad_solid` for visible solids there. Do not call `generate_mac_part` on a mock host.
- **Schemas:** once `window.pistola` exists, `await window.pistola.manual()` is the source of truth for every action's fields. Until then, use [references/actions-cookbook.md](references/actions-cookbook.md).

## 2. Pick the feature for each blueprint part

| Blueprint `shape` | Best feature | Current limits | Fallback |
|---|---|---|---|
| `architecture` | `create_wall`, `create_slab`, `create_roof`, `place_door`, `place_window`, `create_zone` | none | none |
| `primitive` | `place_item` with `assetId: primitive-<kind>` and optional `color` | Child `parentId` positions are parent-relative. Set `allowOverlap: true` on stacked parts. | none |
| `profile-extrude` | `build_cad_solid` `{ op: "extrude", polygon, height }` | Local kernel runs in the browser on every host | `execute_cad_brief` closed polyline, then primitive fallback |
| `silhouette-intersection` | `build_cad_solid` `{ op: "intersection", children: [sideExtrude, topExtrude] }` | Real CSG via `three-bvh-csg` | `profile-extrude` of the side view at full width |
| `revolve` | `build_cad_solid` `{ op: "revolve", profile, angle }` | Local kernel, not the hosted FreeCAD mock | Cylinder, cone, or capsule primitives |
| `mac` | `generate_mac_part` | Needs a real MAC runtime (local `PISTOLA_MAC_ROOT`). Hosted throws and asks for `build_cad_solid`. | Decompose into `build_cad_solid` ops |

When you choose a fallback, record it in the plan so the critic judges the result fairly and the librarian can learn from it.

## 3. Write batches that validate the first time

Follow these rules. Each one prevents a rollback seen in practice:

1. **Chunk size.** At most 25 actions per batch. Put the root part first in its own chunk, and follow with chunks of sub-parts.
2. **Explicit targets.** Always pass `levelId`, `nodeId`, `bodyId`, or `wallId`. After any create, select, or focus action, the validator rejects actions that rely on an implicit target.
3. **New nodes.** Give a creating action a `refId` such as `"$ref_hull"`, and use the same string as an id in later actions of the **same** batch. Across batches, use the real ids returned by the previous run.
4. **Assemblies.** Set `allowOverlap: true` on every part except the root. Without it, a floor-grid check that ignores height rejects any part that sits on another, with "cannot be placed at the requested floor position".
5. **Units.**
   - Distances are in meters, with +Y up and the floor at y = 0.
   - A primitive is 1 × 1 × 1, so `scale` is its size in meters.
   - `position` is the part's **bottom-center**.
   - `rotation` is in radians (Euler XYZ).
6. **Validate before running.** Use `pistola.validate()` or `/validate` when available. On a failure, change only the failing action.

The full patterns and fixes for common error messages are in the cookbook.

## 4. After running

- Read the result: `createdNodeIds`, `errors[].index`, and `warnings`.
- Wait for pending CAD bodies to finish regenerating before you take a screenshot.
- Screenshot the viewport and hand it to `pistola_critic`.
- Never re-run a batch that succeeded. Patch it with `update_item_properties`, `move_target`, `scale_target`, `rotate_target`, or `delete_target` (the delete needs confirmation).
