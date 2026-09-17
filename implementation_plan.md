# Smarter AI Assistant: Plan Mode, Autocomplete & Task Tracking

## Problem

The AI chat assistant can create basic structures but:
- **Crashes** on complex multi-step requests (timeout, invalid actions, no fallback)
- **Isn't smart enough** — limited deterministic patterns, poor error recovery, no multi-turn memory
- **No plan mode** — complex tasks execute blindly instead of decomposing into visible steps
- **No autocomplete** — users must type full prompts with no inline help
- **No task tracking** — no visible checklist showing what was done and what remains

## User Review Required

> [!IMPORTANT]
> This is a significant change touching ~13 files across the assistant pipeline. The core editor packages (`@pascal-app/core`, `@pascal-app/viewer`, `@pascal-app/editor`) remain untouched — all changes are in `apps/editor/`.

> [!WARNING]
> The plan mode introduces a new response mode `"task-plan"` in the AI system prompt. This changes the contract between the remote AI provider and the frontend. Existing `"plan"` / `"clarify"` / `"chat"` modes are preserved.

---

## Proposed Changes

### Component 1: Plan Mode & Task Tracking UI

The core idea: when the user sends a complex request, the AI returns a **task plan** — a structured list of numbered steps with descriptions. The panel renders this as a checkable task list. Each step executes sequentially, updating its status (pending → running → done/error).

#### [MODIFY] [AiAssistantPanel.tsx](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/components/editor/AiAssistantPanel.tsx)

- Add a new `TaskPlanCard` sub-component that renders when `turn.mode === 'task-plan'`
- Each step shows: checkbox, description, status badge (⏳ pending / 🔄 running / ✅ done / ❌ error)
- "Execute Plan" button starts sequential execution of all steps
- "Stop" button halts after the current step
- Steps that fail show the error inline with a "Retry Step" button
- Add state: `taskPlanSteps`, `activeStepIndex`, `taskPlanStatus`

```
┌─────────────────────────────────────┐
│ 📋 Task Plan                   3/5  │
│                                     │
│ ✅ 1. Create 4m x 4m zone "Room"   │
│ ✅ 2. Add 4 walls (2.7m height)    │
│ 🔄 3. Place slab and ceiling       │
│ ⏳ 4. Add door to front wall       │
│ ⏳ 5. Furnish with sofa and table  │
│                                     │
│ [ Stop After Current ]              │
└─────────────────────────────────────┘
```

#### [NEW] [assistant-task-plan.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-task-plan.ts)

New module for plan mode types and utilities:
- `TaskPlanStep` type: `{ id, description, actions: AssistantAction[], status: 'pending' | 'running' | 'done' | 'error', error?: string }`
- `TaskPlan` type: `{ id, title, steps: TaskPlanStep[], prompt: string }`
- `executeTaskPlan()`: orchestrates sequential step execution, calling `executeAssistantPlan()` per step
- `parseTaskPlanFromTurn()`: converts a `task-plan` mode turn result into a `TaskPlan`

---

### Component 2: Smarter AI — Better Prompts & Error Recovery

#### [MODIFY] [assistant-ai-provider.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-ai-provider.ts)

**System prompt improvements:**
- Add a new response mode `"task-plan"` with instructions: *"Use task-plan mode when the request involves more than 8 actions or multiple distinct phases (e.g. structure + furnish + decorate). Return a steps array where each step has a description and a subset of actions."*
- Add multi-turn context injection: include `assistantSession.recentReferencedNodes` and `lastCreatedNodes` summaries in the system prompt so the AI knows what it just built
- Add error recovery instructions: *"If the previous request failed with error X, adjust your approach: use simpler primitives, fewer actions per step, or ask for clarification."*
- Expand the examples array with complex multi-step scenarios showing `task-plan` mode

**Deterministic fallback improvements:**
- Add patterns for common Spanish prompts: "haz una casa", "ponle techo", "agrega ventanas"
- Add a pet house / casita recipe with proper roof, door, and proportions (currently crashes)
- Improve dimension parsing for metric values in Spanish ("2 metros x 3 metros")

**Better error handling:**
- When the remote planner returns invalid actions, attempt a second repair pass with more specific feedback
- When timeout occurs on a complex prompt, return a `task-plan` with the deterministic steps that *can* be resolved locally, plus a note about which steps need the remote planner

#### [MODIFY] [assistant-turn-sequence.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-turn-sequence.ts)

- Add support for `task-plan` mode in the turn sequence loop
- When a turn returns `mode: 'task-plan'`, pause execution and return control to the panel for the user to see the plan before executing

#### [MODIFY] [route.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/app/api/assistant/plan/route.ts)

- Increase timeout from 60s to 90s for `task-plan` requests (they involve more complex reasoning)
- Add request-level `complexity` hint so the route can adjust timeouts

---

### Component 3: Inline Autocomplete

Real-time ghost-text suggestions as the user types, similar to IDE autocomplete.

#### [MODIFY] [assistant-composer-suggestions.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-composer-suggestions.ts)

- Add a new function `getInlineAutocompletion(context)` that returns a single best-match ghost text
- Uses prefix matching against the existing suggestion pool + common command patterns
- Returns `{ ghostText: string, fullText: string }` or `null`
- Pattern library: `"create a "` → `"4m x 4m room with walls"`, `"make a "` → `"small house with kitchen"`, `"place a "` → `"sofa in the center"`, `"extrude "` → `"the active sketch 0.5m"`

#### [MODIFY] [AiAssistantPanel.tsx](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/components/editor/AiAssistantPanel.tsx)

- Overlay a ghost-text `<span>` inside the textarea showing the autocomplete suggestion in `text-white/25`
- `Tab` key accepts the ghost text (fills the input)
- `Escape` dismisses the current suggestion
- Ghost text updates on every keystroke with debounce (50ms)
- Works alongside the existing dropdown suggestions (they remain for discovery, ghost text is for speed)

---

### Component 4: Agent Collaboration Pattern

For complex builds, the planner can delegate sub-tasks to specialized "agent modes" that each focus on one domain.

#### [NEW] [assistant-agent-router.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-agent-router.ts)

- `classifyRequestComplexity(prompt, context)` → `'simple' | 'moderate' | 'complex'`
  - Simple: single action (tool switch, camera change)
  - Moderate: 2-8 actions (create a room, place furniture)
  - Complex: 9+ actions or multi-phase (build a house with rooms, walls, furniture, doors)
- `decomposeIntoAgentTasks(prompt, context)` → array of `{ agent: 'structure' | 'furnish' | 'cad' | 'layout', subPrompt: string }`
- For complex requests, the system prompt instructs the AI to return `task-plan` mode with steps tagged by agent domain
- Each step's actions are validated against the agent's allowed action types

#### [MODIFY] [assistant-ai-provider.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-ai-provider.ts)

- Add agent-domain metadata to the system prompt:
  - **Structure agent**: walls, zones, slabs, ceilings, roofs, levels
  - **Furnish agent**: place_item, update_item_properties
  - **CAD agent**: run_cad_prompt, extrude, revolve, boolean, fillet, chamfer
  - **Layout agent**: move_target, rotate_target, scale_target, reposition
- For `task-plan` responses, each step includes an `agent` field so the UI can show which "agent" is responsible
- The planner is instructed to order steps logically: structure first, then layout, then furnish, then refinement

---

### Component 5: Session & Memory Improvements

#### [MODIFY] [assistant-panel-session.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/assistant-panel-session.ts)

- Expand `AssistantSessionMemory` with:
  - `taskPlans: TaskPlan[]` — history of completed task plans for context
  - `failedPrompts: string[]` — prompts that failed, so the AI can avoid repeating mistakes
  - `preferredComplexity: 'simple' | 'detailed'` — learned from user behavior (do they usually accept plans or prefer direct execution?)

#### [MODIFY] [ai-context-shaping.ts](file:///c:/Users/carlos/PROYECTOS/pistola/editor/apps/editor/lib/ai-context-shaping.ts)

- Include `failedPrompts` in the shaped context so the remote planner knows what didn't work
- Include `taskPlans` summary (just titles and step counts, not full action payloads) for continuity

---

## Open Questions

> [!IMPORTANT]
> **Task plan step granularity**: Should each step contain 1-3 actions (fine-grained, slower but more visible) or 3-8 actions (coarser, faster)? I recommend 2-5 actions per step as a balance.

> [!IMPORTANT]
> **Autocomplete data source**: Should the ghost-text autocomplete also query the remote AI for suggestions (slower, smarter) or stay fully local/deterministic (instant, limited)? I recommend starting local-only and adding remote later.

> [!IMPORTANT]
> **Agent labels in UI**: Should the task plan UI show which "agent" is handling each step (e.g. "🏗️ Structure Agent" / "🪑 Furnish Agent") or keep it invisible? Showing it adds transparency but might confuse non-technical users.

---

## Verification Plan

### Automated Tests

1. **Unit tests** for `assistant-task-plan.ts`:
   ```bash
   cd editor && bun test apps/editor/lib/assistant-task-plan.test.ts
   ```

2. **Unit tests** for `assistant-agent-router.ts`:
   ```bash
   cd editor && bun test apps/editor/lib/assistant-agent-router.test.ts
   ```

3. **Updated AI provider tests** to cover `task-plan` mode:
   ```bash
   cd editor && bun test apps/editor/lib/assistant-ai-provider.test.ts
   ```

4. **Composer suggestion tests** for inline autocomplete:
   ```bash
   cd editor && bun test apps/editor/lib/assistant-composer-suggestions.test.ts
   ```

### Manual Verification

1. **Plan mode flow**: Type "make a small house with 2 bedrooms, kitchen, living room, all furnished with doors and windows" → expect a task plan with 4-6 checkable steps
2. **Autocomplete**: Type "create a " → expect ghost text "4m x 4m room with walls"
3. **Error recovery**: Send a prompt that previously crashed → expect graceful fallback or clarification
4. **Task tracking**: Execute a plan, see checkboxes update in real-time, stop mid-plan, resume
5. **Spanish support**: Type "genera una casita para mi perro" → expect a working small structure (currently crashes)
