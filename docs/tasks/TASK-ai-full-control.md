# `TASK-ai-full-control.md` — Pistola Assistant Full Command Coverage

> **Codex operating contract**
> - Change `- [ ]` to `- [x]` immediately when the task is verified complete.
> - Do not claim “full control” until every existing editor capability has an assistant execution path.
> - Do not leave common requests blocked on a remote planner if the editor can resolve them deterministically.
> - Prefer execution over chat when the request is specific enough to build safely.
> - Capture an undo/rollback snapshot before auto-applying mutating plans.
> - No silent failures, no fake success, no hidden fallback behavior.

## Goal

- Make the AI assistant the primary operator of the editor.
- Give the assistant execution coverage over the full existing editor command and tool surface.
- Remove the current OpenRouter CAD bottleneck for common CAD build and edit requests.
- Default to “just build it” execution with rollback, not review friction, except where ambiguity blocks a real build.

## Implementation Boundary

Full control means:

- every current editor capability is reachable through the assistant
- every manual command path has an assistant command adapter
- common CAD build and edit requests work without waiting on a remote planner
- ambiguous requests trigger clarification only when geometry or targeting is genuinely underspecified

Full control does **not** mean:

- arbitrary React component invocation from chat
- arbitrary code execution
- bypassing scene validation, rollback, or package boundaries

## Current Blocking Failures

- [x] `run_cad_prompt` no longer depends on remote OpenRouter/OpenAI planning for the implemented common local modeling/editing intents
- [x] Common CAD edit prompts against an already selected body now translate into direct local CAD operations for ears, fillet, chamfer, boolean, and regenerate flows
- [x] Common selected-sketch CAD edit prompts now translate into direct local assistant actions for extrude and revolve flows, and selected-body retry now has a direct assistant action
- [x] Common CAD helper controls now have direct assistant coverage for workplane switching and close-sketch flows, and overlapping CAD palette commands reuse the shared assistant path
- [x] Common selected-target duplicate, delete, move, rotate, and scale prompts now translate into direct local assistant actions instead of depending on the remote planner
- [x] Common viewer controls and transform-session commands now have direct assistant actions and command-palette adapters for camera mode, theme, preview, wall/level view modes, move/rotate/scale gizmo, pivot, and camera snapshots
- [x] Common history, fullscreen, export/share, and screenshot commands now have direct assistant actions and command-palette adapters instead of staying manual-only
- [x] Common overlay/sidebar/settings controls now route through shared assistant actions for theme, scans/guides/grid visibility, top-view/orbit camera utilities, preview entry, snapshot popovers, and floating transform actions
- [x] Common action-menu tool selectors and CAD helper/body-panel controls now route through assistant actions, including furnish catalog categories and CAD regenerate/export/retry/suppression flows
- [x] Common building/level focus, tree multi-selection, keyboard level navigation, and batch node delete flows now route through shared assistant actions instead of direct selection/store mutations
- [x] Common workspace-switcher, viewer breadcrumb/level-list, zone-list, and panel operator actions now route through shared assistant actions, including full workspace selection reset and panel-only item/door/window reposition or duplicate flows
- [x] Assistant coverage is still incomplete for the full command/tool surface
- [x] Assistant behavior now defaults to execution for direct non-destructive build requests instead of stopping for review by default
- [x] Multilingual normalization now exists for the implemented deterministic CAD prompt slice, starting with English and Spanish
- [x] The exact failing prompt from the screenshot no longer routes through the remote CAD planner: `al cubo conviertelo en la superficie dale unas orejas`

## Phase 0 — Baseline and Failing Cases

- [x] Capture the current failing prompts and expected outcomes in a repeatable fixture list
- [x] Add a focused regression harness for assistant planner + CAD prompt execution, including timeout cases
- [x] Record the exact current behavior for:
  `build a box`
  `build a box 1m x 2m x 0.5m`
  `switch to structure and open the wall tool`
  `put a sofa in the center of the room`
  `al cubo conviertelo en la superficie dale unas orejas`
- [x] Confirm which failures are assistant-planner failures versus CAD-brief failures versus executor failures

### ✅ Checkpoint — Baseline

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun test ./apps/editor/lib/assistant-ai-provider.test.ts ./apps/editor/lib/cad-ai-provider.test.ts ./packages/editor/src/lib/assistant/types.test.ts`

## Phase 1 — Full Assistant Command Surface

- [x] Inventory every current manual workflow in the editor and map it to an assistant action or helper
- [x] Extend `AssistantActionSchema` until every current command palette action and tool activation path is representable
- [x] Cover all current CAD tool activations, CAD mode switches, and helper actions
- [x] Cover all current placement, transform, duplicate, delete, and level/navigation actions
- [x] Route command palette viewer controls, transform-session commands, and camera snapshot controls through the shared assistant executor
- [x] Route command palette history, fullscreen, export/share, and screenshot controls through the shared assistant executor
- [x] Add deterministic selected-target planning for duplicate, delete, move, rotate, and scale requests that map onto the existing assistant executor
- [x] Route common overlay/sidebar/action-menu controls through the shared assistant executor for viewer visibility toggles, camera utilities, preview, settings exports, snapshot popovers, and floating transform actions
- [x] Remove remaining manual-only editor flows that the assistant still cannot trigger
- [x] Keep execution inside `packages/editor` and keep `apps/editor` limited to chat UI and API orchestration

### ✅ Checkpoint — Command Surface

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun run lint`

## Phase 2 — Deterministic CAD Intent Router

- [x] Add a local CAD intent router before remote planner calls
- [x] Parse direct CAD build intents such as box, cube, prism, plate, bracket, chair, cylinder, and simple extrusions
- [x] Parse CAD edit intents against the selected sketch/body, including modify, regenerate, extrude, boolean, fillet, chamfer, surface/shell-like edits, and add/remove simple features
- [x] Route deterministic CAD intents directly to existing CAD execution helpers instead of `promptToCadBrief`
- [x] Reuse selected body/sketch context so requests like “modify this cube” resolve without needing restatement
- [x] Add multilingual normalization for common assistant/CAD verbs and nouns, starting with English and Spanish
- [x] Treat requests like `al cubo conviertelo en la superficie dale unas orejas` as a selected-body CAD edit flow, not a remote freeform prompt
- [x] Only call the remote CAD planner when the prompt truly requires open-ended geometric planning

### ✅ Checkpoint — CAD Router

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun test ./apps/editor/lib/cad-ai-provider.test.ts`

## Phase 3 — Selected-Target CAD Editing

- [x] Add assistant actions for direct CAD body/sketch editing instead of overusing `run_cad_prompt`
- [x] Support “selected body” operations without requiring the planner to invent a new body from scratch
- [x] Add local target resolution so “this cube”, “the selected body”, and similar references bind deterministically
- [x] Add direct assistant coverage for selected-sketch extrude/revolve and selected-body retry helper flows
- [x] Add direct assistant coverage for CAD helper workplane changes and close-sketch control
- [x] Add structured assistant actions for common feature edits such as add ear/tab, hollow/surface/shell, extrude face, cut, join, and regenerate
- [x] Reuse existing CAD helper jobs where possible instead of inventing parallel geometry paths

### ✅ Checkpoint — Selected CAD Editing

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun run lint`

## Phase 4 — Autopilot Execution Mode

- [x] Add assistant execution policy: `autopilot` versus `review`
- [x] Make `autopilot` the default for actionable build/edit requests
- [x] Keep clarification only for missing geometry, missing target, or destructive ambiguity
- [x] Preserve rollback snapshots before mutating autopilot turns
- [x] Surface a single “undo last assistant turn” recovery path after each autopilot execution
- [x] Remove unnecessary review cards for ordinary build requests

### ✅ Checkpoint — Autopilot

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun run lint`

## Phase 5 — Reliability and Timeout Hardening

- [x] Add provider timeout telemetry and classify timeout versus validation versus execution failures
- [x] Add timeout-specific fallback behavior for assistant and CAD routes
- [x] Add smaller prompt payload shaping so remote calls only receive the scene context they actually need
- [x] Retry remote planning only when it materially helps, not blindly
- [x] Ensure common assistant requests complete locally even when the remote model is slow or unavailable
- [x] Stop surfacing raw provider timeout text in the panel for deterministic or locally solvable requests

### ✅ Checkpoint — Reliability

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun test ./apps/editor/lib/assistant-ai-provider.test.ts ./apps/editor/lib/cad-ai-provider.test.ts`

## Phase 6 — UX Contract for “Just Build It”

- [x] Tighten the panel prompt contract so specific requests execute immediately
- [x] Make the assistant summarize what it is doing in one short line, then execute
- [x] Keep clarification prompts short and concrete when needed
- [x] Keep assumptions explicit, but do not let them block execution when safe defaults are enough
- [x] Remove UI friction that makes the assistant feel like a chatbot instead of an operator

### ✅ Checkpoint — UX Contract

- [x] `cd editor && bun run check-types`
- [x] Run the assistant acceptance harness or equivalent manual pass

## Acceptance Gate

- [x] `build a box` asks only for the missing dimensions and does not time out
- [x] `build a box 1m x 2m x 0.5m` completes through the assistant without remote planner failure
- [x] `switch to structure and open the wall tool` executes immediately
- [x] `put a sofa in the center of the room` places the item through the assistant path
- [x] `delete the selected roof` executes under the configured autopilot/review policy with rollback available
- [x] `al cubo conviertelo en la superficie dale unas orejas` no longer fails with `OpenRouter CAD planning timed out`
- [x] A selected CAD body can be edited conversationally without requiring the user to restate the whole object
- [x] The assistant can operate the full existing command palette surface
- [x] The assistant can operate the full existing CAD tool surface
- [x] Timeouts from remote providers no longer block common locally solvable requests

## Documentation and Alignment

- [x] Keep `TASK-ai-assistant.md` as the historical always-on assistant roadmap
- [x] Use this file as the active execution plan for full command coverage and CAD reliability
- [x] Update `mainidea.md` if the assistant execution policy changes materially
- [x] Update `editor/AGENTS.md` if command ownership or execution boundaries change

## Stop Conditions

- [x] Stop and redesign if the proposed change would require arbitrary code execution instead of editor capability adapters
- [x] Stop and redesign if package boundaries would be violated
- [x] Stop and redesign if “full control” is being approximated by fake chat responses instead of real execution coverage
