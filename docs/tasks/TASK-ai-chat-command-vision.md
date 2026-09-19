# `TASK-ai-chat-command-vision.md` — Make the AI Chat Follow Commands and Understand Uploaded Images

## Summary

This task replaces the “smart chat” milestone with a stricter goal: the assistant must obey actionable commands, stop leaking planner/schema failures to the UI, and understand uploaded images well enough to act on annotated workspace screenshots without requiring manual selection first.

The first priority is **workspace screenshot understanding**:
- uploaded screenshots of the current scene
- red circles, arrows, crosses, and handwritten labels like `REMOVE`
- commands such as “clean this area”, “remove this”, “move this window left”, and “delete the circled walls”

External reference images, floor plans, and CAD sketches stay supported, but they are secondary in this task.

## Operating Contract

- [x] Change `- [ ]` to `- [x]` immediately when a task is verified complete.
- [x] Do not claim this task done until annotated workspace screenshots can drive real target resolution and execution-safe plans.
- [x] Keep `Ask`, `Create`, and `Refine`; do not add a fourth chat mode.
- [x] Prefer explicit candidate targets or review plans over generic clarification.
- [x] Never surface raw planner/schema validation errors directly to the user.
- [x] Destructive image-grounded commands must go through a reviewable target set unless there is exactly one high-confidence target.
- [x] Keep all scene mutations inside assistant-safe actions and shared executors.

## Public Interfaces and Contracts

- [x] Create a new root task file named `TASK-ai-chat-command-vision.md` and treat `task_AIchatsmarter.md` as historical context.
- [x] Extend the assistant request contract so image attachments carry structured metadata, not only a raw data URL.
  Required shape:
  - one image per turn for this task
  - `kind: 'auto' | 'workspace' | 'reference' | 'floorplan' | 'sketch'`
  - `source: 'upload' | 'paste'`
  - optional viewport/canvas metadata from the current editor session
- [x] Add an internal `AssistantImageInterpretation` result shape with:
  - `kind`
  - `ocrText`
  - `annotationHints`
  - `targetHints`
  - `buildHints`
  - `confidence`
- [x] Extend target resolution so sources are explicit:
  - `selection`
  - `prompt`
  - `recent-context`
  - `image-annotation`
  - `image-region`
- [x] Keep planning/orchestration/image interpretation in `apps/editor`.
- [x] Keep validation/action schemas/execution in `packages/editor`.

## Phase 0 — Truth and Failure Inventory

- [x] Add a new acceptance fixture corpus for command-obedience and image-grounding failures:
  - annotated workspace screenshot delete
  - annotated workspace screenshot move
  - annotated workspace screenshot cleanup
  - multi-target highlighted region delete
  - command-only clear/delete with no selection
  - raw planner alias/schema mismatch
- [x] Record current failure mode for each fixture using these categories:
  - command routing
  - planner drift
  - schema validation
  - image interpretation
  - target grounding
  - destructive review
  - executor
  - timeout
- [x] Add a regression that fails if the UI shows raw planner validation errors like invalid enum options.
- [x] Add a regression that fails if “clean this area” with a grounded screenshot falls back to generic “select one node”.

### Checkpoint — Baseline

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun test ./apps/editor/lib/assistant-ai-provider.test.ts ./apps/editor/lib/assistant-target-resolution.test.ts ./packages/editor/src/lib/assistant/types.test.ts`

## Phase 1 — Planner and Schema Contract Hardening

- [x] Remove planner/action-guide drift by deriving planner-facing action examples and enum values from shared assistant schema constants instead of hand-maintained strings.
- [x] Add a planner normalization layer that repairs known alias/drift cases before validation:
  - enum aliases
  - casing drift
  - common invalid phase/action variants
- [x] If repair fails, convert the result into an internal planner failure classification and a user-safe clarification message, not a raw schema dump.
- [x] Add a regression for the exact `set_phase`/enum mismatch path shown in the screenshot so that error class can never leak again.
- [x] Ensure invalid remote plans can still fall back to deterministic local handling when the prompt is locally solvable.

### Checkpoint — Planner Contract

- [x] `cd editor && bun run check-types`
- [x] Add or update tests for planner repair, alias normalization, and user-safe failure messaging.

## Phase 2 — Command Obedience and Deterministic Action Routing

- [x] Audit command verbs and make deterministic routing stronger for:
  - `remove`
  - `delete`
  - `clean`
  - `clear`
  - `hide`
  - `move`
  - `replace`
  - `reset`
  - Spanish equivalents such as `quita`, `borra`, `limpia`, `mueve`
- [x] Define command resolution order:
  1. selected target
  2. explicit target named in prompt
  3. recent referenced/created node
  4. image-grounded target
  5. bounded review plan for candidate targets
- [x] Replace generic clarification for destructive commands with concrete alternatives:
  - exact resolved target
  - review list of candidate nodes
  - level-wide cleanup when intent is clearly global
- [x] Add bounded “area cleanup” semantics:
  - level-wide => `clear_level_contents`
  - grounded node set => delete plan over resolved nodes
  - grounded region with multiple nodes => reviewable batch delete plan
- [x] Ensure a command like “clean this area” cannot silently degrade to “I need a selected target” if an uploaded workspace image provides a viable target region.

### Checkpoint — Command Routing

- [x] `cd editor && bun run check-types`
- [x] Add or update tests for command verbs, destructive review fallback, and Spanish command routing.

## Phase 3 — Workspace-First Image Understanding

- [x] Add a preplanning image-interpretation pass for the single uploaded image.
- [x] Detect whether the image is:
  - current workspace screenshot
  - external reference
  - floor plan
  - room reference
  - CAD sketch
  - unknown
- [x] Prioritize workspace screenshots when the image visually matches the current editor UI or viewport.
- [x] Extract OCR and annotation intent from workspace screenshots:
  - handwritten or typed words such as `REMOVE`, `MOVE`, `DELETE`
  - circles, arrows, crosses, highlight regions
- [x] Convert annotations into screen-space target hints.
- [x] Ground those hints against current scene state using editor context:
  - visible/selectable nodes
  - recent targets
  - current level
  - viewport/camera metadata
  - projected node bounds or nearest visible candidates
- [x] Return a structured grounding result with confidence and candidate nodes.
- [x] If confidence is low, show concrete candidate targets instead of generic clarification.

### Checkpoint — Image Interpretation

- [x] `cd editor && bun run check-types`
- [x] Add or update tests for OCR/annotation extraction, workspace screenshot classification, and node grounding confidence behavior.

## Phase 4 — Panel UX for Image-Grounded Commands

- [x] Keep `Ask`, `Create`, and `Refine` unchanged as the only top-level modes.
- [x] Add an image intent control for the attached image with default `Auto`.
- [x] Make `Auto` prefer workspace screenshot interpretation first when editor UI/viewport cues are present.
- [x] Show the resolved image target in the assistant UI before destructive execution:
  - example: “Using the circled roof in the uploaded screenshot.”
- [x] If multiple nodes match the annotated region, show a review card with the candidate targets rather than a generic clarification.
- [x] If no credible target is found, explain exactly what was missing:
  - no visible node in circled region
  - annotation text was readable but region did not map to scene nodes
  - screenshot appears to be an external reference, not current workspace
- [x] Preserve retry/new-chat behavior so stale image-grounded failures do not bleed into the next turn.

### Checkpoint — Panel UX

- [x] `cd editor && bun run check-types`
- [x] Add or update tests for image-intent UI state, target explanation rendering, and review-card behavior.

## Phase 5 — External Image Understanding Without Breaking Workspace Commands

- [x] Keep existing image build paths for:
  - floor plan to structure
  - room reference to furnishing
  - sketch to simple CAD part
- [x] Route external images through the same `AssistantImageInterpretation` shape, but do not let those paths weaken workspace screenshot handling.
- [x] Make the planner prefer deterministic local build/refine behavior when the image is a workspace screenshot and the request is action-oriented.
- [x] Require explicit explanation of assumptions for non-workspace images:
  - approximate geometry
  - inferred scale
  - nearest editable proxy
- [x] Ensure text+image prompts that are clearly actionable do not collapse into pure analysis-only replies.

### Checkpoint — External Images

- [x] `cd editor && bun run check-types`
- [x] Add or update tests for mixed text+image creation/refinement across workspace and external image classes.

## Phase 6 — Reviewable Destructive Execution

- [x] Add a shared preparation layer that turns image-grounded destructive commands into one of:
  - immediate single-target action
  - reviewable multi-target plan
  - precise clarification with candidates
- [x] Make delete/clean/remove plans idempotent against stale node ids where possible.
- [x] Prevent destructive execution from crashing when one candidate node disappears between planning and execution; continue safely on surviving candidates and report partial completion honestly.
- [x] Ensure “clean this area” and “remove the circled object” cannot fail with a stale-target crash without first giving a reviewable target set or precise partial failure message.
- [x] Add regression coverage for stale-node destructive plans created from image-grounded targets.

### Checkpoint — Destructive Safety

- [x] `cd editor && bun run check-types`
- [x] Add or update tests for stale target handling, partial success reporting, and reviewable destructive plans.

## Phase 7 — Acceptance Gate

- [x] A prompt like “clean de area” with an annotated workspace screenshot deletes or proposes deletion for the actually highlighted scene region.
- [x] A prompt like “remove this” with a circled screenshot target works without requiring manual selection first.
- [x] A prompt like “move this window left” with an arrow annotation resolves the window from the uploaded workspace screenshot and produces an executable move/refine plan.
- [x] A prompt like “delete the highlighted walls” with multiple grounded candidates shows a reviewable multi-target plan instead of generic clarification.
- [x] A prompt like “clean everything on this level” still resolves deterministically without needing image upload.
- [x] A bad planner response never surfaces raw schema validation text to the user.
- [x] A text+image floor-plan/reference/sketch request still produces buildable output or precise clarification.
- [x] A stale node in a reviewed destructive batch does not crash the whole turn.
- [x] A new chat after an image-grounded failure starts cleanly with no stale clarification/error card bleed-through.

## Manual Verification

- [x] Manual browser scenario: upload an annotated screenshot of the current workspace with `REMOVE` and a circled object; the assistant resolves that target and proposes or executes the correct deletion path.
- [x] Manual browser scenario: upload an annotated screenshot with an arrow and “move left”; the assistant resolves the correct node and applies a bounded movement/refinement.
- [x] Manual browser scenario: upload a floor plan and ask for an approximate build; the assistant still returns a buildable plan.
- [x] Manual browser scenario: trigger a planner alias drift case and verify the UI shows a safe clarification or repaired execution path, not a schema dump.

## Assumptions and Defaults

- [x] Keep one image attachment per turn for this task; do not expand to multi-image composition here.
- [x] Keep `Ask`, `Create`, and `Refine`; no `Command` mode is added.
- [x] Prioritize workspace screenshot understanding before external reference reasoning.
- [x] Destructive image-grounded commands should require review only when there is more than one plausible target or confidence is not high enough.
- [x] If an uploaded image looks like the current editor viewport, prefer grounding it to existing scene nodes over treating it as a generic reference image.
- [x] Keep `task_AIchatsmarter.md` historical; this new file becomes the active execution plan for command-following and image-grounded assistant behavior.

## Status

- [x] Verified implementation slice completed on `2026-03-26`:
  - structured image attachments, viewport metadata, and lightweight annotation analysis
  - planner alias normalization and safe planner-failure messaging
  - workspace-image target grounding with candidate review paths
  - assistant panel image intent control plus clarify/review target explanations
  - regression coverage for screenshot cleanup, screenshot delete, screenshot move, planner drift, and stale destructive delete preparation
- [x] Browser verification completed on `2026-03-26`:
  - annotated screenshot delete path passes
  - annotated screenshot move path passes
  - floor-plan build path passes
  - planner alias drift stays user-safe in the UI
  - new chat clears stale image-grounded clarification state
