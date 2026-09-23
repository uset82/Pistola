# Pistola learnings

Shared memory for Codex sessions working on Pistola, maintained with `$pistola-learnings`.

Format: `- YYYY-MM-DD: <what happened> → <what to do instead>`. Update existing bullets instead of duplicating them, and keep about 50 active bullets.

## Concepts

- 2026-09-19: Building "un barco de juguete" straight from text produced a box blockout the user disliked → get a concept image approved first (`$pistola-studio`, gate 1).
- 2026-09-19: A near-white part on a white background disappears when traced → ask for a solid-black silhouette sheet for tracing and a separate color sheet for the palette.

## Blueprint

- 2026-09-19: Pistola item `position` is the part's bottom-center, and primitives are 1 × 1 × 1 → `scale` is the size in meters, and `position.y` is the top of whatever the part sits on.

## Features

- 2026-09-22: `union` is real CSG. Coplanar faces can still come back open, so parts that only need to sit together should use `group` (merge, no boolean) instead of a boolean. `linearArray` and `mirror` remain the array tools.
- 2026-09-21: CAD space draws an axes helper through the origin, and build mode draws a blue cursor column → `set_mode` to `select` before a portrait, and offset the assembly so the green Y axis does not run through the body. Captures mask `EDITOR_LAYER`, so the helper is absent from render images.
- 2026-09-22: A translucent light halo around a colored core washes the core out → tint the halo with the core color at about 0.2 opacity. `nested: true` or opacity below 1 skips the buried-part check.

- 2026-09-19: A part stacked on another part rolled back the whole batch with `cannot be placed at the requested floor position` → the fix is **not** `allowOverlap`, which the schema now rejects. `place_item` is `additionalProperties: false`, and a primitive with `position[1] > 0` is treated as stacked and skips the floor check by itself (`builders.ts:776`). Give every part an explicit y.
- 2026-09-19: `place_item` **does** accept `color` as a hex on primitives (`agent-api/index.ts:111`). The old "colors are pending, everything renders blue" note was wrong → pass a hex per part and let the critic judge color.
- 2026-09-19: A rotated primitive does not spin in place. The mesh sits at `position-y={h/2}` inside a scaled group, and `rotation` applies on the outer group at `position` (`item-renderer.tsx:58,135`), so it pivots about **bottom-center** and the part swings sideways and drops. For `rotation: [0, 0, ±π/2]` on a capsule of length `L`, use `position [x0 + L/2, centerY, z]` — a horizontal body wanted `[0.38, 0.44, 0]`, not `[0, 0.31, 0]`.
- 2026-09-19: A batch of plain `place_item` actions fails validation with `implicit-target-drift` because each one changes selection → put an explicit `levelId` on every `place_item` in a batch (`sequence-validation.ts:203`).
- 2026-09-19: `primitive-capsule` cannot be stretched. Its geometry is `capsuleGeometry(radius = w/2, length = h - w)` on unit asset dimensions, so `length` is always **0** and the asset is really a sphere → scaling it `[0.26, 0.76, 0.26]` produces a squashed ellipsoid, and a horizontal "body" renders as a flying saucer whose curved end leaves a visible gap under the head. For a rounded rod, use `primitive-cylinder` with the same scale and rotation.
- 2026-09-19: Recipes used to spawn at the origin and collide → `nextOpenRecipeOrigin()` now offsets copies automatically.
- 2026-09-19: Silhouette intersection and holed solids should use `build_cad_solid` (`window.pistola.run` or `/cad`). Hosted FreeCAD/MAC helpers stay mock.

## Hosts

- 2026-09-23: Cursor's `cursor-agent` runs in WSL, where `127.0.0.1:3002` is not the Windows editor. Set `PISTOLA_BASE_URL` to the WSL default gateway (`ip route show default`, the address after `via`) and pin `PISTOLA_SESSION_ID`. `--approve-mcps` clears the "needs approval" state.
- 2026-09-23: `pistola_render_eight_views` with `cell: 0` used to become a 1px cell (a 4×58 sheet). Values below 64 are now ignored so the 384px default is used.
- 2026-09-19: pistola.canner.app and the Sites export still mock hosted FreeCAD/MAC. `generate_mac_part` throws; use `build_cad_solid` for visible geometry. Check `/api/cad/health` and `/api/mac/health`.
- 2026-09-19: The in-app chat's `openrouter/free` model sometimes lands on a safety classifier ("User Safety: safe") or stalls for minutes → don't plan through the chat; run actions directly, or pick a paid model.
- 2026-09-19: The ChatGPT Sites export has no API of its own, and its planning calls to pistola.canner.app can fail with "Failed to fetch" → use in-page execution surfaces, which need no API.
- 2026-09-19: An OpenRouter key saved with "Save & Apply" on pistola.canner.app is wiped by every redeploy → keys belong in the host's environment variables.
- 2026-09-19: `focus_camera_on_nodes` and Fit view did not visibly frame a roughly 0.18 m CAD assembly in the Sites editor, even when selected → add or verify a scaling-aware camera-framing path before relying on visual QA for small models.
- 2026-09-19: With no `POSTGRES_URL` configured the scene lives only in memory, and **any** reload wipes it — navigating the tab, a 404 round trip, or `select_page` with `bringToFront` each cost a finished 11-part build → never hardcode a `levelId` (a new one is generated on every load, read it from `workspace().selection.levelId`) and keep the full action list in `.pistola/studio/<slug>/` so a rebuild is one call.
- 2026-09-22: Local dev HMR retained the live scene after source changes → inspect the workspace before replaying actions; a full page reload can still reset a scene that failed to persist.
- 2026-09-19: `take_screenshot` refuses with `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE` whenever the page reports `visibilityState=hidden`, even at a real 1301x969 viewport with `visible=true` → override it first from the page (`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })`, same for `hidden`, then dispatch `visibilitychange`). That unblocked visual critique after two builds had shipped unverifiable. Do it after any reload, and never between a `select_page` `bringToFront` and the capture.
- 2026-09-19: `image_gen` fails with `403 code 112` and a Qoder pricing link when the plan has no image quota → offer the written part table as the gate-1 substitute rather than skipping the gate.

## Archive

(Lessons that no longer apply because the platform fixed the issue.)

- 2026-09-19: `parentId` on `place_item` used to attach every part to the level → nesting now honors item parents, and stacked primitives with explicit y > 0 skip the floor collision check.
- 2026-09-19: Only `heart` entities rendered as true local profiles → `build_cad_solid` now builds extrudes, revolves, and booleans in the browser.
- 2026-09-22: Kernel `extrude`, `revolve`, `torus`, loft, hull, capsule, and ellipsoid now report a positive signed volume, so a hollow extrude renders solid. `group` merges without a boolean.
- 2026-09-22: `BURIED_PART` is a mesh containment test. Rings, pages in a hollow cover, and halos are not buried. `nested: true` or opacity below 1 opts out.
- 2026-09-22: Contact samples both meshes, including triangle centroids and edge midpoints, so rotated stacked books count as touching.
- 2026-09-22: `measure({ mode: 'bounds' })` follows `getCadBodyTransform`, including rotation.
- 2026-09-22: `pistola_render`, `pistola_render_sheet`, `pistola_render_eight_views`, and `pistola_screenshot` return real PNG pixels from the presented frame. `mode: 'layout'` keeps the bounding-box sheet.
