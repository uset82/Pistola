# `TASK-ai-assistant.md` — Pistola Always-On AI Assistant

> **Codex operating contract:**
> - Change `- [ ]` to `- [x]` the moment the action is confirmed complete.
> - Do not advance past a failed checkpoint or acceptance gate.
> - Keep the assistant mounted on the editor route in every phase; do not reintroduce CAD-only gating.
> - Route every scene mutation through explicit allowlisted assistant actions; never let chat call React tool components directly.
> - Before applying any reviewed mutation plan, capture a scene snapshot and restore it on executor failure.

## Summary

- Promote the current CAD-only chat into an editor-wide AI assistant that is always available in `site`, `structure`, `furnish`, and `cad`.
- Keep package boundaries intact: `apps/editor` owns chat UI and API routes; `packages/editor` owns validated assistant execution; `packages/core` and `packages/viewer` remain chat-agnostic.
- Use review-before-apply for all mutating plans; only navigation and read-only actions may auto-run.
- Reuse the existing CAD brief pipeline behind the new assistant instead of maintaining a second CAD chat path.

## Pre-flight

- [x] Read `rules.md`
- [x] Read `agents.md`
- [x] Read `mainidea.md`
- [x] Read `editor/AGENTS.md`
- [x] Open and read the current AI/editor integration points: `editor/apps/editor/app/page.tsx`, `editor/apps/editor/components/editor/CadAiPanel.tsx`, `editor/apps/editor/lib/cad-ai-provider.ts`, `editor/packages/editor/src/store/use-editor.tsx`, `editor/packages/editor/src/components/tools/tool-manager.tsx`
- [x] Confirm the implementation base is still `editor/` with `packages/core`, `packages/viewer`, and `apps/editor`

## Public Interfaces

- [x] Add `AssistantActionSchema` in `editor/packages/editor/src/lib/assistant/types.ts`
  Required actions: `set_phase`, `set_mode`, `set_structure_layer`, `activate_tool`, `focus_level`, `select_nodes`, `create_level`, `rename_level`, `update_polygon_node`, `update_polygon_holes`, `create_wall`, `create_zone`, `create_slab`, `create_ceiling`, `create_roof`, `place_item`, `place_door`, `place_window`, `move_target`, `rotate_target`, `scale_target`, `duplicate_target`, `delete_target`, `run_cad_prompt`, `create_default_cad_sketch`, `regenerate_cad_body`, `export_cad_body_step`
- [x] Add `AssistantTurnResultSchema` in the same module
  Fields: `reply`, `mode: "chat" | "clarify" | "plan"`, `assumptions`, `ambiguities`, `actions`, `requiresReview`, `destructiveActionCount`
- [x] Export `executeAssistantPlan(...)`, `validateAssistantPlan(...)`, and the assistant schemas from `@pascal-app/editor`
- [x] Add `POST /api/assistant/plan` in `apps/editor` returning `AssistantTurnResult`
- [x] Reuse the current OpenRouter/OpenAI precedence from the CAD provider; when no remote AI provider is configured, return a clear unconfigured error instead of inventing a fake general-chat fallback

### ✅ Checkpoint — Contracts

- [x] `cd editor && bun run check-types`
- [x] Equivalent explicit assistant test run completed: `cd editor && bun test ./apps/editor/lib/assistant-ai-provider.test.ts ./packages/editor/src/lib/assistant/types.test.ts`

## Phase 1 — Always-On Assistant Shell

- [x] Replace the `CadAiPanel` mount in `editor/apps/editor/app/page.tsx` with a new `AiAssistantPanel` that is always mounted on the editor route and never gated by `phase === "cad"`
- [x] Keep the panel fixed and reachable in every phase; collapsed is acceptable, unavailable is not
- [x] Split the UI into message history, composer, clarification card, review card, and execution status
- [x] Keep assistant UI state local to the panel; do not add a new app-wide store for this slice
- [x] Show current workspace context in the assistant header: active phase, selected level, selected node summary, and CAD helper health when relevant
- [x] Do not remove the old CAD logic until the new assistant can run the same clarify → review → execute flow

### ✅ Checkpoint — Shell

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun run lint`

## Phase 2 — Shared Assistant Execution Layer

- [x] Create `editor/packages/editor/src/lib/assistant/` and implement a single allowlisted executor that validates each action against current editor state before applying it
- [x] Classify actions as `safe-immediate` or `mutating`
  Safe-immediate: `set_phase`, `set_mode`, `set_structure_layer`, `activate_tool`, `focus_level`, `select_nodes`
  Mutating: all scene-changing, transform, duplicate, delete, and CAD-generation actions
- [x] Capture the current scene graph before any reviewed mutation plan and restore it if any action fails; do not leave partial scene changes behind
- [x] Refactor overlapping command helpers so the command palette and assistant share the same validation/execution path
- [x] Update the command palette to call the shared helpers for overlapping commands, especially CAD actions

### ✅ Checkpoint — Executor

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun run lint`
- [x] Equivalent explicit assistant test run completed: `cd editor && bun test ./apps/editor/lib/assistant-ai-provider.test.ts ./packages/editor/src/lib/assistant/types.test.ts`

## Phase 3 — Programmatic Builder Adapters

- [x] Extract non-UI creation/update logic from the existing implemented tool surface in `ToolManager` into reusable builder helpers
  Coverage: site boundary, wall, slab, ceiling, roof, zone, item, door, window, current CAD actions
- [x] Reuse existing node schemas, defaults, spatial validation, and placement math; do not invent parallel node shapes
- [x] For item, door, and window placement, extract the minimum reusable placement path from the current placement math/coordinator instead of simulating pointer events
- [x] Support boundary and hole editing through `update_polygon_node` and `update_polygon_holes` rather than trying to drive on-canvas editors from chat
- [x] If the assistant cannot compute a valid parent, polygon, wall target, asset, or placement, stop and return `mode: "clarify"` with no mutation
- [x] Limit one assistant mutation plan to 25 actions; larger builds must be chunked into “step 1 of N” plans

### ✅ Checkpoint — Builders

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun run lint`
- [x] Equivalent explicit assistant test run completed: `cd editor && bun test ./apps/editor/lib/assistant-ai-provider.test.ts ./packages/editor/src/lib/assistant/types.test.ts`

## Phase 4 — General AI Planner and CAD Migration

- [x] Add `editor/apps/editor/lib/assistant-ai-provider.ts` and `editor/apps/editor/app/api/assistant/plan/route.ts`
- [x] Extract shared provider configuration/request helpers from `cad-ai-provider.ts` so CAD and the new assistant use the same env precedence and timeout behavior
- [x] Feed the planner explicit context: current phase, active level, selected nodes, available assistant action schema, and the 25-action limit
- [x] Require planner output to conform to `AssistantTurnResultSchema`
- [x] Use `mode: "chat"` for plain conversational replies with zero actions
- [x] Use `mode: "clarify"` when required geometry, placement, or target data is missing
- [x] Use `mode: "plan"` when the assistant is proposing executable work
- [x] Route CAD build requests through the existing `promptToCadBrief -> executeCadBrief` path via `run_cad_prompt` so the assistant becomes the single entry point and CAD stays the implementation engine
- [x] Move CAD-specific assumptions, ambiguity prompts, execution errors, retry actions, and “edit sketch” affordances into the generic assistant UI, then remove `CadAiPanel`

### ✅ Checkpoint — Planner

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun run lint`
- [x] Equivalent explicit planner test run completed: `cd editor && bun test ./apps/editor/lib/assistant-ai-provider.test.ts ./apps/editor/lib/cad-ai-provider.test.ts ./packages/editor/src/lib/assistant/types.test.ts`

## Acceptance Gate

- [x] Open the editor in `site`, `structure`, `furnish`, and `cad`; the assistant is visible and usable in every phase
- [x] Ask a pure chat question like “what can you help me build here?”; the assistant replies with no scene mutation and no review card
- [x] Ask for a safe UI action like “switch to structure and open the wall tool”; the phase/tool change runs immediately
- [x] Ask for a mutating scene action like “create a 4m x 4m room on level 0 with walls, slab, and roof”; the assistant shows a review card and only mutates after confirmation
- [x] Ask for an item placement like “put a sofa in the center of the room”; the assistant uses the reusable placement path and places the asset without pointer-event simulation
- [x] Ask for a CAD request from a non-CAD phase like “create a box 1m x 2m x 0.5m”; the assistant switches context as needed and uses the existing CAD executor
- [x] Ask an ambiguous request like “add a nice entrance”; the assistant asks for clarification instead of mutating
- [x] Ask for a destructive change like “delete the selected roof”; the assistant marks the plan as destructive and requires review before applying it
- [x] Force an executor failure in a multi-action reviewed plan; rollback restores the pre-apply scene with no partial leftovers
- [ ] Existing manual workflows still work: command palette, action menu, helper overlays, CAD tools, and current CAD API routes are not regressed

## Documentation and Alignment

- [x] Create this file as `TASK-ai-assistant.md` at repo root and keep it updated during implementation
- [x] Update `mainidea.md` to state that Pistola is an always-on AI assistant for the whole editor, with CAD as one capability rather than the only chat surface
- [x] Update `editor/AGENTS.md` or adjacent editor guidance to document the new boundary: `apps/editor` owns chat UI and API routes, `packages/editor` owns validated assistant execution
- [x] Keep `TASK.md` as the historical CAD roadmap; do not overwrite it

## Assumptions and Defaults

- Editor-only scope for this slice; do not mount the assistant on privacy/terms pages yet
- Guided action adapters, not unrestricted internal control
- Review-before-apply for all mutating plans; safe navigation/read-only commands may auto-run
- No new provider model or dependency stack unless required for shared provider extraction; prefer the current OpenRouter/OpenAI setup
- If remote AI keys are absent, the assistant shell remains visible but reports the AI provider as unconfigured; only the existing CAD-specific deterministic fallback remains where it already exists
