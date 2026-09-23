---
name: pistola-direct-control
description: Drive Pistola from an IDE (Claude Code, Codex, Cursor, Antigravity, WorkBuddy, Qoder) with typed actions. Use whenever the user asks to build, edit, or inspect a 3D object or scene in Pistola. The IDE model plans; Pistola only executes.
---

# Pistola Direct Control

The IDE model is the planner. Pistola is a deterministic executor. Do not hand the request to Pistola's in-app Assistant.

## Route order

1. MCP default tools (`pistola_status`, `pistola_reference_{validate,set,get,clear}`, `pistola_reference_sheet_{add,fit,hull,get,clear}`, `pistola_task_*`, `pistola_run`, `pistola_check`, `pistola_render_eight_views`, `pistola_render_views`, `pistola_blueprint_check`, `pistola_examples`, `pistola_inspect`, `pistola_export_scene`, `pistola_screenshot`).
2. The IDE browser calling `window.pistola.invoke(method, args)` after `data-pistola-agent="ready"`.
3. Stop. Tell the user the host has no direct control.

Never use `pistola_chat`, `pistola_plan`, `pistola_assistant_*`, `/api/assistant/*`, `/api/ai/test`, or a natural-language message in the Pistola chat box. If `invoke` or `taskPlan` is missing, stop. Do not fall back.

## Roles (any IDE)

Play these as sections in one thread. Codex may spawn matching sub-agents; other hosts should not wait for them.

- **Orchestrator** — talk to the user, keep the checkbox plan, drive the live page.
- **Scene planning** — parts, overall size, floor/wall anchor, and relations before the first `place_item`.
- **Pascal integration** — map each part to a typed Pistola action (`place_item`, CAD solid, architecture).
- **Quality** — inspect, structural check, screenshot/render, and at most two typed fixes per step.
- **Learning** — write a short lesson only after delivery.

## Loop

plan → examples → build per part → check → fix (≤2) → render → critique (≤2) → keep best → report

1. `pistola_open` / wait for `dataset.pistolaAgent === "ready"`.
2. For a new visual object, make **2–3 concepts in the IDE** and get the user's selection. Then create or collect exactly eight separately stored views: Top, Left 45°, Front, Right 45°, Left, Right, Back, Bottom. Call `pistola_reference_validate`, then `pistola_reference_set`; use opaque asset references and one known meter scale. Image bytes stay in the IDE or asset store.
3. Optionally add a clean black-on-white FRONT|SIDE|TOP tracing sheet after that approval: `pistola_reference_sheet_add({ path|dataUrl, layout: 'front|side|top', knownDimension, blueprint })`. `path` must be an HTTP(S) asset URL visible to the browser; upload local files first or send `dataUrl`. It is always paired with a text blueprint. Use its local gold masks only as a 2×2 IoU diagnostic. Optional hull and `create_guide` actions, plus `pistola_reference_sheet_fit`, only propose changes; they never apply them. Skip photos and perspective sketches. See `references/ortho-sheet-prompt.md` and `docs/reference-sheets.md`.
4. Create a checkbox `taskPlan` before the first mutation (`pistola_task_create` or `window.pistola.taskPlan.create`). If a blueprint exists, run `plan.check` / `pistola_blueprint_check` first, then `taskPlan.create({blueprint})` (one step per part, parents first).
5. Search examples with `examples.search` / `pistola_examples` (`action: search|get`). Instantiate with `{id, params, at}`. Otherwise skip.
6. For each part: `inspect` → `validate` → `taskPlan.runStep` → `waitForIdle` → `inspect` / `exportScene` / `pistola_check`. `run` and `runStep` already embed `{structure}`.
7. At each assembly milestone, call `pistola_render_eight_views` and inspect the labeled Top, Left 45°, Front, Right 45°, Left, Right, Back, and Bottom sheet. It has no camera side effects. Fix structural errors first, then the largest visible placement/proportion error.
8. Use the 2×2 `pistola_render_views` diagnostic only when its numeric critique or an optional tracing-sheet IoU comparison is useful; it complements, but does not replace, the required eight-view review.
9. At most **2 retries per step** from the issue list (`fix.patch` when present). Then fall back to a simpler technique. Do not retry the same failing action. Opt-in `strict: true` reverts a regression; `taskPlan.restoreBest` / `pistola_task_restore_best` reloads the best snapshot.
10. Answer the visual critique with `{score, ≤3 fixes (partId + numeric change)}`. At most two rounds; keep the best; stop when there is no gain.
11. Batches stay at or under 25 actions. Destructive actions need `confirmDestructive: true`.
12. Complete the plan only after every step has evidence.

Prefer world-space parts. Nested `parentId` children inherit parent scale; compensate or do not parent.

## Parent-relative nesting

`parentId` child positions are local to the parent, not world coordinates. Primitive ids are `primitive-box`, `primitive-sphere`, `primitive-cylinder`, `primitive-cone`, `primitive-torus`, `primitive-capsule`, `primitive-wedge`. Optional `color` is a hex string on `place_item` and `update_item_properties`.

Local `build_cad_solid` ops include `loft`, `hull` (three profiles), `torus`, `capsule`, and `ellipsoid`. Optional `roughness` / `metalness` / `opacity` are per body. The kernel rejects meshes over 50k triangles. `place_cad_body_in_architecture` instances draw the source mesh, not a box. Items parented to a `cad-body` or `cad-instance` keep their local position (no slab lift).

`group` merges child solids without a boolean. Disjoint shells are allowed. Use it when parts only need to sit together. `nested: true` on `build_cad_solid` opts a part out of the buried-part check.

## Watch mode

Local MCP uses the bridge driver (`PISTOLA_TRANSPORT=bridge`). The build appears in the user's already open tab. Do not reload that tab: a reload drops queued bridge commands. The scene itself is stored in IndexedDB and reloads from there.

WorkBuddy's `codebuddy` CLI calls Pistola tools through `DeferExecuteTool`. That call is denied in non-interactive mode unless `.workbuddy/settings.json` allows `DeferExecuteTool` and `mcp__pistola__*`. `scripts/ide-setup.mjs` writes that allow list. The MCP config also needs `honoured: true`.

Claude Code does not treat `enabledMcpjsonServers` in a committed `.claude/settings.json` as approval. `claude mcp get pistola` stays pending until `~/.claude/settings.json` lists `pistola` under `enabledMcpjsonServers`. `scripts/ide-setup.mjs --install-user` writes that entry. Do not run `claude mcp reset-project-choices`; it clears the approval.

## Render

`pistola_render`, `pistola_render_sheet`, `pistola_render_eight_views`, and `pistola_screenshot` return real PNG pixels. `mode: 'layout'` keeps the old bounding-box sheet. Review the labeled eight-view sheet after each assembly milestone. `pistola_task_undo_step` restores one step; `pistola_replay` rebuilds from `exportActions()`.

## Concept gate

Hosts that can generate images still make 2–3 concepts and wait. Hosts without image generation write a measured part table (name, size in meters, color, relation) and review it with `pistola_render_eight_views`. Do not skip the gate, and do not reload the tab to recover a dropped command.
