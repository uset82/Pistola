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

## Public Interfaces and Contracts

- [ ] Create a new active root task file named `TASK-ai-full-creation.md` and keep `TASK-ai-full-control.md` as historical context.
- [ ] Extend `AssistantTurnResult` with structured continuation metadata so large builds can span multiple assistant turns without losing state.
- [ ] Extend `AssistantPlanRequest` with optional continuation context so the panel can request the next build chunk deterministically.
- [ ] Extend `AssistantActionSchema` with bounded refinement/update actions for currently manual-only creation-critical edits:
  `rename_node`, `set_node_visibility`, `update_zone_color`, `update_item_properties`, `update_door_properties`, `update_window_properties`, `update_wall_properties`, `update_slab_properties`, `update_ceiling_properties`, `update_roof_properties`, `update_reference_properties`, `update_site_properties`.
- [ ] Keep `apps/editor` responsible for planning, multimodal orchestration, continuation, and acceptance harnesses.
- [ ] Keep `packages/editor` responsible for validation, rollback-aware execution, and reusable builder/update logic.

## Phase 0 — Baseline and Truth

- [ ] Add a new acceptance fixture corpus covering:
  text-only scene creation, text-only furnishing, text-only CAD part creation, image/sketch creation, conversational refinement, long multi-step builds, and explicit unsupported prompts.
- [ ] Record current behavior for each fixture and classify the failure source as one of:
  planner, multimodal extraction, decomposition, action surface, CAD brief, executor, continuation, asset/catalog, or timeout.
- [ ] Add a regression harness that fails if image prompts still collapse into analysis-only chat when the request is buildable.
- [ ] Add a regression harness that fails if a large creation request stops at “step 1” without a structured continuation path.

### Checkpoint — Baseline

- [ ] `cd editor && bun run check-types`
- [ ] `cd editor && bun test ./apps/editor/lib/assistant-ai-provider.test.ts ./apps/editor/lib/cad-ai-provider.test.ts ./apps/editor/lib/cad-local-intent.test.ts ./packages/editor/src/lib/assistant/types.test.ts`

## Phase 1 — Creation Turn Contract and Continuation

- [ ] Replace the current “image => chat-only” planning rule with “image => build when geometry is inferable, clarify only when geometry is blocked”.
- [ ] Add continuation metadata to assistant turns and a resumable continuation request path in the assistant API.
- [ ] Update `AiAssistantPanel` so a multi-step build can auto-continue until completion, clarification, or execution failure.
- [ ] Keep rollback snapshots per executed chunk and preserve “undo last assistant turn” across continued builds.
- [ ] Ensure interruption is safe: a user can stop after a partial multi-step build and continue refining from the current scene state.

### Checkpoint — Continuation

- [ ] `cd editor && bun run check-types`
- [ ] Add or update tests for chunked plans, continuation resume, rollback, and interruption behavior.

## Phase 2 — Deterministic Scene and CAD Creation Router

- [ ] Add a local scene recipe router for common architectural prompts:
  rooms, room groups, house shells, level scaffolds, basic roofs/slabs/openings, and furnished-room compositions.
- [ ] Expand deterministic CAD/object creation so common prototype prompts resolve locally before remote planning when practical.
- [ ] Add approximation rules for missing exact assets:
  nearest catalog item, simple CAD proxy, or simple structural primitive, with explicit assumptions.
- [ ] Add local target-resolution rules for conversational follow-ups like:
  “make it bigger”, “add two windows”, “move the sofa left”, “rename this room kitchen”.
- [ ] Keep remote planning only for open-ended layouts or shapes that cannot be decomposed deterministically.

### Checkpoint — Deterministic Creation

- [ ] `cd editor && bun run check-types`
- [ ] Add or update tests for local scene recipes, CAD family routing, approximation assumptions, and follow-up target resolution.

## Phase 3 — Multimodal Build Path

- [ ] Make uploaded images/sketches eligible for executable plans instead of analysis-only replies.
- [ ] Support at least these multimodal creation classes:
  rough floor-plan-to-structure, reference-room-to-furnish-layout, and sketch-to-simple-CAD-part approximation.
- [ ] Shape multimodal planner context toward buildable geometry, target layout, proportions, and known editor capabilities.
- [ ] Add explicit clarify/refuse rules for images that cannot be mapped to editable scene geometry without guessing too far.
- [ ] Keep image-derived output editable and explain assumptions instead of claiming exact reconstruction.

### Checkpoint — Multimodal

- [ ] `cd editor && bun run check-types`
- [ ] Add or update tests for image-guided buildable plans and image prompts that must clarify instead of hallucinating geometry.

## Phase 4 — Refinement and Property-Edit Action Surface

- [ ] Add shared builder/update helpers for all creation-critical manual panel edits that still mutate nodes directly.
- [ ] Refactor creation-critical panels and sidebar operator surfaces to use the same assistant-safe actions/builders instead of raw `updateNode(...)` and `deleteNode(...)`.
- [ ] Cover conversational refinement prompts for:
  rename, visibility, color, wall dimensions, slab/ceiling thickness or height, roof height, door/window size and offset, item replacement or resize, and reference transform updates.
- [ ] Keep clarification narrow and concrete when a requested property cannot be mapped safely to an existing node semantic.
- [ ] Do not add a generic arbitrary node-patch action; keep the update surface typed and bounded.

### Checkpoint — Refinement

- [ ] `cd editor && bun run check-types`
- [ ] `cd editor && bun run lint`
- [ ] Add or update regression tests proving the remaining creation-critical manual mutation paths are routed through assistant-safe builders.

## Phase 5 — Planner Quality and Build Honesty

- [ ] Update assistant planning examples so broad creation requests produce decomposed executable plans, not generic chat or a single fallback `run_cad_prompt`.
- [ ] Teach the planner to prefer scene decomposition plus native actions before remote freeform planning.
- [ ] Add unsupported-case handling for non-buildable requests such as highly organic sculpts, exact branded meshes, or animation-heavy asks:
  return the nearest buildable fallback or a precise limitation, never fake completion.
- [ ] Keep assumptions explicit for approximations, substituted assets, inferred dimensions, and image-derived geometry.
- [ ] Expand failure classification and telemetry to cover decomposition failures, multimodal extraction failures, continuation failures, and unsupported-prompt exits.

### Checkpoint — Planner Quality

- [ ] `cd editor && bun run check-types`
- [ ] Add or update tests for unsupported prompts, approximation disclosure, remote fallback boundaries, and failure classification.

## Acceptance Gate

- [ ] A text-only request like “make a small two-bedroom house with kitchen and living room” produces an editable structure, even if it requires multiple continued turns.
- [ ] A text-only request like “furnish the living room with a sofa, coffee table, rug, and TV wall” places catalog items or explicit editable proxies.
- [ ] A text-only CAD request like “make a wall bracket with two holes” yields a deterministic CAD brief or a precise geometry clarification.
- [ ] A text+image request like “recreate this floor plan approximately” produces an executable approximation, not just image analysis.
- [ ] A follow-up request like “make the windows taller and move the sofa left” executes against the created scene without restating the whole object.
- [ ] A property request like “rename this room kitchen” or “hide this reference” uses assistant-safe update actions, not direct UI-only mutations.
- [ ] A large build exceeding 25 actions continues automatically with structured step metadata until done or blocked.
- [ ] A remote timeout does not block a locally solvable creation/refinement request.
- [ ] An unsupported request returns an explicit limitation and nearest buildable fallback, not a fake success message.

## Assumptions and Defaults

- [ ] Default to prototype-grade editable approximations, not exact final-production meshes.
- [ ] Use the current Pistola editor/CAD/catalog/runtime stack only; no external mesh-generation service is part of this plan.
- [ ] Keep English and Spanish as the required supported languages for deterministic creation and refinement in this plan.
- [ ] Leave `TASK-ai-full-control.md` closed and historical; this new file becomes the active execution plan for full prompt-to-creation.
- [ ] Keep package boundaries intact: no assistant planning logic inside `packages/core` or `packages/viewer`.
