# `TASK-ai-full-creation.md` — Pistola Full Prompt-to-Creation

> **Codex operating contract**
> - Change `- [ ]` to `- [x]` immediately when a task is verified complete.
> - Do not claim “full creation” until text prompts and text+image prompts can produce editable scene/model output, not just analysis or operator-state changes.
> - Prefer editable approximation over fake precision when the exact asset or geometry is unavailable.
> - Do not hide unsupported cases behind chatty success; unsupported requests must return an explicit limitation and the nearest buildable fallback.
> - Keep all scene mutations inside allowlisted assistant actions and shared builders; never let the assistant depend on direct UI-only mutations.
> - Keep the 25-action per turn limit, but support structured continuation until the build is complete or clarification is required.

## Summary

- Make the assistant creation-first, not just command-surface-complete.
- Support prompt-to-scene, prompt-to-CAD, prompt-to-refinement, and image/sketch-to-approximate-buildable-output.
- Keep this plan inside Pistola’s native editor/CAD/runtime capabilities. No external 3D generator is part of this plan.

## Status

- [x] Completed on 2026-03-25.
- [x] All actionable checklist items in this file are complete. The only remaining `- [ ]` text is the operating-contract instruction above.

## Public Interfaces and Contracts

- [x] Create a new active root task file named `TASK-ai-full-creation.md` and keep `TASK-ai-full-control.md` as historical context.
- [x] Extend `AssistantTurnResult` with structured continuation metadata so large builds can span multiple assistant turns without losing state.
- [x] Extend `AssistantPlanRequest` with optional continuation context so the panel can request the next build chunk deterministically.
- [x] Extend `AssistantActionSchema` with bounded refinement/update actions for currently manual-only creation-critical edits:
  `rename_node`, `set_node_visibility`, `update_zone_color`, `update_item_properties`, `update_door_properties`, `update_window_properties`, `update_wall_properties`, `update_slab_properties`, `update_ceiling_properties`, `update_roof_properties`, `update_reference_properties`, `update_site_properties`.
- [x] Keep `apps/editor` responsible for planning, multimodal orchestration, continuation, and acceptance harnesses.
- [x] Keep `packages/editor` responsible for validation, rollback-aware execution, and reusable builder/update logic.

## Phase 0 — Baseline and Truth

- [x] Add a new acceptance fixture corpus covering:
  text-only scene creation, text-only furnishing, text-only CAD part creation, image/sketch creation, conversational refinement, long multi-step builds, and explicit unsupported prompts.
- [x] Record current behavior for each fixture and classify the failure source as one of:
  planner, multimodal extraction, decomposition, action surface, CAD brief, executor, continuation, asset/catalog, or timeout.
- [x] Add a regression harness that fails if image prompts still collapse into analysis-only chat when the request is buildable.
- [x] Add a regression harness that fails if a large creation request stops at “step 1” without a structured continuation path.

### Checkpoint — Baseline

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun test ./apps/editor/lib/assistant-ai-provider.test.ts ./apps/editor/lib/cad-ai-provider.test.ts ./apps/editor/lib/cad-local-intent.test.ts ./packages/editor/src/lib/assistant/types.test.ts`

## Phase 1 — Creation Turn Contract and Continuation

- [x] Replace the current “image => chat-only” planning rule with “image => build when geometry is inferable, clarify only when geometry is blocked”.
- [x] Add continuation metadata to assistant turns and a resumable continuation request path in the assistant API.
- [x] Update `AiAssistantPanel` so a multi-step build can auto-continue until completion, clarification, or execution failure.
- [x] Keep rollback snapshots per executed chunk and preserve “undo last assistant turn” across continued builds.
- [x] Ensure interruption is safe: a user can stop after a partial multi-step build and continue refining from the current scene state.

### Checkpoint — Continuation

- [x] `cd editor && bun run check-types`
- [x] Add or update tests for chunked plans, continuation resume, rollback, and interruption behavior.

## Phase 2 — Deterministic Scene and CAD Creation Router

- [x] Add a local scene recipe router for common architectural prompts:
  rooms, room groups, house shells, level scaffolds, basic roofs/slabs/openings, and furnished-room compositions.
- [x] Expand deterministic CAD/object creation so common prototype prompts resolve locally before remote planning when practical.
- [x] Add approximation rules for missing exact assets:
  nearest catalog item, simple CAD proxy, or simple structural primitive, with explicit assumptions.
- [x] Add local target-resolution rules for conversational follow-ups like:
  “make it bigger”, “add two windows”, “move the sofa left”, “rename this room kitchen”.
- [x] Keep remote planning only for open-ended layouts or shapes that cannot be decomposed deterministically.

### Checkpoint — Deterministic Creation

- [x] `cd editor && bun run check-types`
- [x] Add or update tests for local scene recipes, CAD family routing, approximation assumptions, and follow-up target resolution.

## Phase 3 — Multimodal Build Path

- [x] Make uploaded images/sketches eligible for executable plans instead of analysis-only replies.
- [x] Support at least these multimodal creation classes:
  rough floor-plan-to-structure, reference-room-to-furnish-layout, and sketch-to-simple-CAD-part approximation.
- [x] Shape multimodal planner context toward buildable geometry, target layout, proportions, and known editor capabilities.
- [x] Add explicit clarify/refuse rules for images that cannot be mapped to editable scene geometry without guessing too far.
- [x] Keep image-derived output editable and explain assumptions instead of claiming exact reconstruction.

### Checkpoint — Multimodal

- [x] `cd editor && bun run check-types`
- [x] Add or update tests for image-guided buildable plans and image prompts that must clarify instead of hallucinating geometry.

## Phase 4 — Refinement and Property-Edit Action Surface

- [x] Add shared builder/update helpers for all creation-critical manual panel edits that still mutate nodes directly.
- [x] Refactor creation-critical panels and sidebar operator surfaces to use the same assistant-safe actions/builders instead of raw `updateNode(...)` and `deleteNode(...)`.
- [x] Cover conversational refinement prompts for:
  rename, visibility, color, wall dimensions, slab/ceiling thickness or height, roof height, door/window size and offset, item replacement or resize, and reference transform updates.
- [x] Keep clarification narrow and concrete when a requested property cannot be mapped safely to an existing node semantic.
- [x] Do not add a generic arbitrary node-patch action; keep the update surface typed and bounded.

### Checkpoint — Refinement

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun run lint`
- [x] Add or update regression tests proving the remaining creation-critical manual mutation paths are routed through assistant-safe builders.

## Phase 5 — Planner Quality and Build Honesty

- [x] Update assistant planning examples so broad creation requests produce decomposed executable plans, not generic chat or a single fallback `run_cad_prompt`.
- [x] Teach the planner to prefer scene decomposition plus native actions before remote freeform planning.
- [x] Add unsupported-case handling for non-buildable requests such as highly organic sculpts, exact branded meshes, or animation-heavy asks:
  return the nearest buildable fallback or a precise limitation, never fake completion.
- [x] Keep assumptions explicit for approximations, substituted assets, inferred dimensions, and image-derived geometry.
- [x] Expand failure classification and telemetry to cover decomposition failures, multimodal extraction failures, continuation failures, and unsupported-prompt exits.

### Checkpoint — Planner Quality

- [x] `cd editor && bun run check-types`
- [x] Add or update tests for unsupported prompts, approximation disclosure, remote fallback boundaries, and failure classification.

## Acceptance Gate

- [x] A text-only request like “make a small two-bedroom house with kitchen and living room” produces an editable structure, even if it requires multiple continued turns.
- [x] A text-only request like “furnish the living room with a sofa, coffee table, rug, and TV wall” places catalog items or explicit editable proxies.
- [x] A text-only CAD request like “make a wall bracket with two holes” yields a deterministic CAD brief or a precise geometry clarification.
- [x] A text+image request like “recreate this floor plan approximately” produces an executable approximation, not just image analysis.
- [x] A follow-up request like “make the windows taller and move the sofa left” executes against the created scene without restating the whole object.
- [x] A property request like “rename this room kitchen” or “hide this reference” uses assistant-safe update actions, not direct UI-only mutations.
- [x] A large build exceeding 25 actions continues automatically with structured step metadata until done or blocked.
- [x] A remote timeout does not block a locally solvable creation/refinement request.
- [x] An unsupported request returns an explicit limitation and nearest buildable fallback, not a fake success message.

## Assumptions and Defaults

- [x] Default to prototype-grade editable approximations, not exact final-production meshes.
- [x] Use the current Pistola editor/CAD/catalog/runtime stack only; no external mesh-generation service is part of this plan.
- [x] Keep English and Spanish as the required supported languages for deterministic creation and refinement in this plan.
- [x] Leave `TASK-ai-full-control.md` closed and historical; this new file becomes the active execution plan for full prompt-to-creation.
- [x] Keep package boundaries intact: no assistant planning logic inside `packages/core` or `packages/viewer`.
