# Task Plan: Smarter AI Assistant

Based on [implementation_plan.md](file:///c:/Users/carlos/PROYECTOS/pistola/implementation_plan.md)

---

## Phase 1 — Foundation: Task Plan Types & Utilities
> New module + types that everything else depends on

- [x] **1.1** Create [assistant-task-plan.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-task-plan.ts)
  - [x] Define `TaskPlanStep` type (`id`, `description`, `actions`, `status`, `error?`, `agent?`)
  - [x] Define `TaskPlan` type (`id`, `title`, `steps`, `prompt`, `createdAt`)
  - [x] Implement `parseTaskPlanFromTurn()` — converts a `task-plan` mode turn into a `TaskPlan`
  - [x] Implement `executeTaskPlan()` — sequential step executor with status callbacks
  - [x] Implement `getTaskPlanProgress()` — returns `{ completed, total, activeStep }`
- [x] **1.2** Write unit tests [assistant-task-plan.test.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-task-plan.test.ts)
  - [x] Test `parseTaskPlanFromTurn()` with valid and invalid inputs
  - [x] Test `executeTaskPlan()` happy path (all steps succeed)
  - [x] Test `executeTaskPlan()` with a failing step (stops, reports error)
  - [x] Test `getTaskPlanProgress()` at various stages

---

## Phase 2 — Agent Router: Complexity Classification & Decomposition
> Determines when to use plan mode and which agent handles each step

- [x] **2.1** Create [assistant-agent-router.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-agent-router.ts)
  - [x] Define agent domains with allowed action types:
    - `structure`: create_wall, create_zone, create_slab, create_ceiling, create_roof, create_level
    - `furnish`: place_item, place_door, place_window, update_item_properties
    - `cad`: run_cad_prompt, extrude_cad_sketch, revolve_cad_sketch, apply_cad_boolean, apply_cad_fillet, apply_cad_chamfer
    - `layout`: move_target, rotate_target, scale_target, reposition_target
  - [x] Implement `classifyRequestComplexity(prompt, context)` → `simple | moderate | complex`
  - [x] Implement `decomposeIntoAgentTasks(prompt, context)` → array of sub-tasks
  - [x] Implement `tagStepWithAgent(step)` — assigns agent label based on action types
- [x] **2.2** Write unit tests [assistant-agent-router.test.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-agent-router.test.ts)
  - [x] Test complexity classification for simple, moderate, complex prompts
  - [x] Test decomposition produces correct agent assignments
  - [x] Test agent tagging for mixed-action steps

---

## Phase 3 — Smarter AI: System Prompt & Deterministic Improvements
> Make the AI understand plan mode, handle Spanish, and recover from errors

- [x] **3.1** Update system prompt in [assistant-ai-provider.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-ai-provider.ts)
  - [x] Add `"task-plan"` response mode instructions
  - [x] Add `steps` array schema to `ASSISTANT_JSON_SCHEMA` for task-plan mode
  - [x] Add agent-domain metadata (structure/furnish/cad/layout) to system prompt
  - [x] Add error recovery instructions referencing `assistantSession.lastError`
  - [x] Add multi-turn context injection (recentReferencedNodes, lastCreatedNodes)
  - [x] Add ordering instruction: structure → layout → furnish → refinement
- [x] **3.2** Add `task-plan` mode examples to `ASSISTANT_PLANNING_EXAMPLES`
  - [x] Example: "make a furnished house" → task-plan with 4 steps
  - [x] Example: "build a room with door, windows, and furniture" → task-plan with 3 steps
- [x] **3.3** Expand deterministic fallback patterns
  - [x] Add Spanish creation patterns: "haz una casa", "ponle techo", "agrega ventanas", "genera una casita"
  - [x] Add pet house / casita recipe (small footprint, gable roof, door, proper proportions)
  - [x] Improve Spanish metric parsing: "2 metros x 3 metros", "medio metro"
- [x] **3.4** Improve error recovery in `createAssistantTurnResult()`
  - [x] On timeout for complex prompts: return deterministic `task-plan` with local steps
  - [x] On invalid actions: include more specific repair feedback (which actions failed, why)
  - [x] On second repair failure: fall back to `clarify` mode instead of throwing
- [x] **3.5** Update existing tests in [assistant-ai-provider.test.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-ai-provider.test.ts)
  - [x] Add test: Spanish "casita para mi perro" returns a valid plan
  - [x] Add test: complex prompt returns `task-plan` mode
  - [x] Add test: timeout on complex prompt returns deterministic task-plan fallback
  - [x] Add test: double repair failure falls back to clarify

---

## Phase 4 — Turn Sequence & API Route Updates
> Wire task-plan mode through the execution pipeline

- [x] **4.1** Update [assistant-turn-sequence.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-turn-sequence.ts)
  - [x] Add `task-plan` case in `runAssistantTurnSequence()` — return to panel instead of auto-executing
  - [x] Add `AssistantTurnSequenceStatus` value: `'task-plan'`
- [x] **4.2** Update [route.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/app/api/assistant/plan/route.ts)
  - [x] Accept optional `complexity` hint in request body
  - [x] Increase timeout to 90s when complexity is `complex` or prompt length > 100 chars
  - [x] Add `task-plan` to the `AssistantTurnResultSchema` mode validation
- [x] **4.3** Update turn sequence tests
  - [x] Test that `task-plan` mode pauses execution and returns status

---

## Phase 5 — Session & Memory Improvements
> Remember what worked, what failed, and user preferences

- [x] **5.1** Update [assistant-panel-session.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-panel-session.ts)
  - [x] Add `taskPlans: TaskPlan[]` to `AssistantSessionMemory`
  - [x] Add `failedPrompts: string[]` to `AssistantSessionMemory`
  - [x] Add `preferredComplexity: 'simple' | 'detailed'` to `AssistantSessionMemory`
  - [x] Update `createEmptyAssistantSessionMemory()` with new defaults
  - [x] Add `rememberCompletedTaskPlan()` helper
  - [x] Add `rememberFailedPrompt()` helper
- [x] **5.2** Update [ai-context-shaping.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/ai-context-shaping.ts)
  - [x] Include `failedPrompts` (last 3) in shaped context
  - [x] Include `taskPlans` summary (title + step count, last 2) in shaped context
  - [x] Include `preferredComplexity` in shaped context

---

## Phase 6 — Inline Autocomplete
> Ghost-text suggestions as the user types

- [x] **6.1** Add autocomplete logic to [assistant-composer-suggestions.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-composer-suggestions.ts)
  - [x] Create inline autocomplete pattern library:
    - `"create a "` → `"4m x 4m room with walls"`
    - `"make a "` → `"small house with kitchen and living room"`
    - `"place a "` → `"sofa in the center of the room"`
    - `"extrude "` → `"the active sketch 0.5m"`
    - `"build "` → `"a 2-bedroom house with doors and windows"`
    - `"add "` → `"a door to the front wall"`
    - `"haz "` → `"una casa pequeña con cocina"`
    - `"genera "` → `"una casita para mi perro"`
    - `"crea "` → `"una habitación de 4m x 4m"`
  - [x] Implement `getInlineAutocompletion(context)` → `{ ghostText, fullText } | null`
  - [x] Use prefix matching + context-aware scoring (phase, tool, selection)
  - [x] Include recent successful prompts as autocomplete candidates
- [x] **6.2** Update autocomplete tests in [assistant-composer-suggestions.test.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-composer-suggestions.test.ts)
  - [x] Test prefix matching returns correct ghost text
  - [x] Test phase-aware suggestions (CAD phase suggests CAD commands)
  - [x] Test empty input returns null (no ghost text)
  - [x] Test Spanish prefix matching

---

## Phase 7 — Task Plan UI in the Panel
> The visual checkable task list and autocomplete ghost text

- [x] **7.1** Add Task Plan Card to [AiAssistantPanel.tsx](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/components/editor/AiAssistantPanel.tsx)
  - [x] Add state variables: `taskPlan`, `activeStepIndex`, `taskPlanStatus`
  - [x] Create `TaskPlanCard` sub-component with:
    - [x] Header: "📋 Task Plan" + progress counter (e.g. "3/5")
    - [x] Step list with status icons: ⏳ pending / 🔄 running / ✅ done / ❌ error
    - [x] Agent label badge per step (🏗️ Structure / 🪑 Furnish / ⚙️ CAD / 📐 Layout)
    - [x] "Execute Plan" button to start sequential execution
    - [x] "Stop After Current" button during execution
    - [x] "Retry Step" button on failed steps
    - [x] Error message inline on failed steps
  - [x] Wire `submitPrompt()` to detect `task-plan` mode and display `TaskPlanCard`
  - [x] Wire "Execute Plan" to call `executeTaskPlan()` with status callbacks
  - [x] Update step status in real-time via state updates
- [x] **7.2** Add inline autocomplete ghost text to the textarea
  - [x] Create an overlay `<div>` positioned over the textarea
  - [x] Show ghost text in `text-white/25` after the user's typed text
  - [x] `Tab` key accepts the ghost text (fills input)
  - [x] `Escape` dismisses current suggestion
  - [x] Debounce ghost text updates (50ms)
  - [x] Ensure ghost text does not interfere with existing dropdown suggestions
- [x] **7.3** Update `handleComposerKeyDown` for new key bindings
  - [x] `Tab` now checks for ghost text first, then falls back to dropdown suggestion
  - [x] `Escape` clears ghost text if present
- [x] **7.4** Style the TaskPlanCard
  - [x] Match existing panel aesthetic (dark glass, cyan accents)
  - [x] Smooth transitions on step status changes
  - [x] Progress bar or step counter animation
  - [x] Scrollable step list for plans with many steps

---

## Phase 8 — Integration & Wiring
> Connect all the pieces end-to-end

- [x] **8.1** Wire agent router into the AI provider
  - [x] Call `classifyRequestComplexity()` in `createAssistantTurnResult()`
  - [x] For `complex` requests: hint `task-plan` mode to the remote planner
  - [x] For `complex` deterministic fallbacks: auto-decompose into task-plan steps
- [x] **8.2** Wire session memory into the panel
  - [x] After task plan completes: call `rememberCompletedTaskPlan()`
  - [x] After prompt fails: call `rememberFailedPrompt()`
  - [x] Track user behavior to set `preferredComplexity`
- [x] **8.3** Wire context shaping updates
  - [x] Pass `failedPrompts` and `taskPlans` summary through to API route
  - [x] Verify shaped context size stays under token limits

---

## Phase 9 — Verification & Polish
> Test everything, fix edge cases, validate in browser

- [x] **9.1** Run all unit tests
  - [x] `bun test apps/editor/lib/assistant-task-plan.test.ts`
  - [x] `bun test apps/editor/lib/assistant-agent-router.test.ts`
  - [x] `bun test apps/editor/lib/assistant-ai-provider.test.ts`
  - [x] `bun test apps/editor/lib/assistant-composer-suggestions.test.ts`
  - [x] `bun test apps/editor/lib/assistant-turn-sequence.test.ts`
- [x] **9.2** Manual browser testing
  - [x] Test: "make a small house with 2 bedrooms, kitchen, living room, all furnished" → task plan appears
  - [x] Test: Execute plan → checkboxes update in real-time
  - [x] Test: Stop mid-plan → remaining steps stay pending
  - [x] Test: Retry failed step → step re-executes
  - [x] Test: Type "create a " → ghost text appears
  - [x] Test: Tab accepts ghost text
  - [x] Test: "genera una casita para mi perro" → working structure (no crash)
  - [x] Test: Agent labels visible on task plan steps
  - Verified with real-browser coverage in [assistant-smarter-browser-check.mjs](file:///c:/Users/carlos/PROYECTOS/pistola/editor/scripts/assistant-smarter-browser-check.mjs)
- [x] **9.3** Edge case testing
  - [x] Empty prompt → no crash
  - [x] Very long prompt (500+ chars) → handled gracefully
  - [x] Remote planner timeout → deterministic fallback task plan
  - [x] Network disconnect during plan execution → error on current step, others stay pending
  - [x] Rapid submit while plan is executing → previous plan cancelled
- [x] **9.4** Create walkthrough artifact documenting all changes

---

> [!TIP]
> **Execution order**: Phases 1-2-3 can be done in parallel (no dependencies). Phase 4 depends on 1+3. Phase 5 is independent. Phase 6 is independent. Phase 7 depends on 1+6. Phase 8 depends on everything. Phase 9 is last.
