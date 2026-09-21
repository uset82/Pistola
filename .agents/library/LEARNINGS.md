# Pistola learnings

Shared memory for Codex sessions working on Pistola, maintained with `$pistola-learnings`.

Format: `- YYYY-MM-DD: <what happened> → <what to do instead>`. Update existing bullets instead of duplicating them, and keep about 50 active bullets.

## Concepts

- 2026-09-19: Building "un barco de juguete" straight from text produced a box blockout the user disliked → get a concept image approved first (`$pistola-studio`, gate 1).
- 2026-09-19: A near-white part on a white background disappears when traced → ask for a solid-black silhouette sheet for tracing and a separate color sheet for the palette.

## Blueprint

- 2026-09-19: Pistola item `position` is the part's bottom-center, and primitives are 1 × 1 × 1 → `scale` is the size in meters, and `position.y` is the top of whatever the part sits on.

## Features

- 2026-09-21: Structure contact samples the later part's vertices against the earlier mesh, and a box only has corner vertices → create the upper part after its support and seat those corners on the support face, about 1 cm inside. Capsule and ellipsoid poles are often missed, so a rounded end reads as floating even when the bounds overlap.
- 2026-09-21: A horizontal ring or an inner core fails `BURIED_PART` because the test compares axis-aligned overlap volume with the smaller solid's volume → keep a proud piece whose corners only kiss the surface, or accept the false positive.
- 2026-09-21: CAD space draws an axes helper through the origin, and build mode draws a blue cursor column → `set_mode` to `select` before a portrait, and offset the assembly so the green Y axis does not run through the body.

- 2026-09-19: A part stacked on another part rolled back the whole batch with `cannot be placed at the requested floor position` → the fix is **not** `allowOverlap`, which the schema now rejects. `place_item` is `additionalProperties: false`, and a primitive with `position[1] > 0` is treated as stacked and skips the floor check by itself (`builders.ts:776`). Give every part an explicit y.
- 2026-09-19: `place_item` **does** accept `color` as a hex on primitives (`agent-api/index.ts:111`). The old "colors are pending, everything renders blue" note was wrong → pass a hex per part and let the critic judge color.
- 2026-09-19: A rotated primitive does not spin in place. The mesh sits at `position-y={h/2}` inside a scaled group, and `rotation` applies on the outer group at `position` (`item-renderer.tsx:58,135`), so it pivots about **bottom-center** and the part swings sideways and drops. For `rotation: [0, 0, ±π/2]` on a capsule of length `L`, use `position [x0 + L/2, centerY, z]` — a horizontal body wanted `[0.38, 0.44, 0]`, not `[0, 0.31, 0]`.
- 2026-09-19: `measure({ mode: 'bounds' })` **ignores rotation** — it reported a capsule rotated 90° as still 0.26 × 0.76 × 0.26 and vertical → never trust it for a rotated part. Recompute the world AABB from the stored `position`/`scale`/`rotation` instead.
- 2026-09-19: A batch of plain `place_item` actions fails validation with `implicit-target-drift` because each one changes selection → put an explicit `levelId` on every `place_item` in a batch (`sequence-validation.ts:203`).
- 2026-09-19: `primitive-capsule` cannot be stretched. Its geometry is `capsuleGeometry(radius = w/2, length = h - w)` on unit asset dimensions, so `length` is always **0** and the asset is really a sphere → scaling it `[0.26, 0.76, 0.26]` produces a squashed ellipsoid, and a horizontal "body" renders as a flying saucer whose curved end leaves a visible gap under the head. For a rounded rod, use `primitive-cylinder` with the same scale and rotation.
- 2026-09-19: Recipes used to spawn at the origin and collide → `nextOpenRecipeOrigin()` now offsets copies automatically.
- 2026-09-19: Silhouette intersection and holed solids should use `build_cad_solid` (`window.pistola.run` or `/cad`). Hosted FreeCAD/MAC helpers stay mock.

## Hosts

- 2026-09-19: pistola.canner.app and the Sites export still mock hosted FreeCAD/MAC. `generate_mac_part` throws; use `build_cad_solid` for visible geometry. Check `/api/cad/health` and `/api/mac/health`.
- 2026-09-19: The in-app chat's `openrouter/free` model sometimes lands on a safety classifier ("User Safety: safe") or stalls for minutes → don't plan through the chat; run actions directly, or pick a paid model.
- 2026-09-19: The ChatGPT Sites export has no API of its own, and its planning calls to pistola.canner.app can fail with "Failed to fetch" → use in-page execution surfaces, which need no API.
- 2026-09-19: An OpenRouter key saved with "Save & Apply" on pistola.canner.app is wiped by every redeploy → keys belong in the host's environment variables.
- 2026-09-19: `focus_camera_on_nodes` and Fit view did not visibly frame a roughly 0.18 m CAD assembly in the Sites editor, even when selected → add or verify a scaling-aware camera-framing path before relying on visual QA for small models.
- 2026-09-19: With no `POSTGRES_URL` configured the scene lives only in memory, and **any** reload wipes it — navigating the tab, a 404 round trip, or `select_page` with `bringToFront` each cost a finished 11-part build → never hardcode a `levelId` (a new one is generated on every load, read it from `workspace().selection.levelId`) and keep the full action list in `.pistola/studio/<slug>/` so a rebuild is one call.
- 2026-09-19: `window.pistola.screenshot()` returns a blank ~1.6 KB PNG because the WebGPU canvas does not set `preserveDrawingBuffer` → capture the page compositor with the browser `take_screenshot` tool instead.
- 2026-09-19: `take_screenshot` refuses with `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE` whenever the page reports `visibilityState=hidden`, even at a real 1301x969 viewport with `visible=true` → override it first from the page (`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })`, same for `hidden`, then dispatch `visibilitychange`). That unblocked visual critique after two builds had shipped unverifiable. Do it after any reload, and never between a `select_page` `bringToFront` and the capture.
- 2026-09-19: `image_gen` fails with `403 code 112` and a Qoder pricing link when the plan has no image quota → offer the written part table as the gate-1 substitute rather than skipping the gate.

## Archive

(Lessons that no longer apply because the platform fixed the issue.)

- 2026-09-19: `parentId` on `place_item` used to attach every part to the level → nesting now honors item parents, and stacked primitives with explicit y > 0 skip the floor collision check.
- 2026-09-19: Only `heart` entities rendered as true local profiles → `build_cad_solid` now builds extrudes, revolves, and booleans in the browser.
