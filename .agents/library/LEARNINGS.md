# Pistola learnings

Shared memory for Codex sessions working on Pistola, maintained with `$pistola-learnings`.

Format: `- YYYY-MM-DD: <what happened> → <what to do instead>`. Update existing bullets instead of duplicating them, and keep about 50 active bullets.

## Concepts

- 2026-09-19: Building "un barco de juguete" straight from text produced a box blockout the user disliked → get a concept image approved first (`$pistola-studio`, gate 1).
- 2026-09-19: A near-white part on a white background disappears when traced → ask for a solid-black silhouette sheet for tracing and a separate color sheet for the palette.

## Blueprint

- 2026-09-19: Pistola item `position` is the part's bottom-center, and primitives are 1 × 1 × 1 → `scale` is the size in meters, and `position.y` is the top of whatever the part sits on.

## Features

- 2026-09-19: A part stacked on another part rolled back the whole batch with `cannot be placed at the requested floor position`, because the floor grid ignores height → set `allowOverlap: true` on every non-root part.
- 2026-09-19: `place_item` has no color field; every primitive renders the catalog default (blue) → tell the user colors are pending, and don't count color as a critic failure.
- 2026-09-19: `parentId` on `place_item` is accepted but parts still attach to the level, so moving the root leaves the parts behind → move each part with the same delta.
- 2026-09-19: Recipes and copied batches spawn at the origin; a second copy collides with the first → offset `position` for each new copy.
- 2026-09-19: In `execute_cad_brief`, only `heart` entities render as a true local extruded profile. Other polylines become a bounding box on mock CAD hosts → use primitives there, or build against a local editor with the real FreeCAD helper.

## Hosts

- 2026-09-19: pistola.canner.app runs **mock** CAD and MAC (extrude becomes a bounding box, revolve becomes a cylinder, MAC becomes a placeholder box) → check `/api/cad/health` and `/api/mac/health` before choosing CAD features.
- 2026-09-19: The in-app chat's `openrouter/free` model sometimes lands on a safety classifier ("User Safety: safe") or stalls for minutes → don't plan through the chat; run actions directly, or pick a paid model.
- 2026-09-19: The ChatGPT Sites export has no API of its own, and its planning calls to pistola.canner.app can fail with "Failed to fetch" → use in-page execution surfaces, which need no API.
- 2026-09-19: An OpenRouter key saved with "Save & Apply" on pistola.canner.app is wiped by every redeploy → keys belong in the host's environment variables.

## Archive

(Lessons that no longer apply because the platform fixed the issue.)
