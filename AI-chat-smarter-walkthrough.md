# Smarter AI Chat Walkthrough

## Scope

This implementation upgrades the editor assistant from a single-turn planner into a smarter, stateful chat workflow that can:

- classify prompt complexity
- return executable `task-plan` responses for broader requests
- remember recent failures and completed plans
- offer inline ghost-text autocomplete while typing
- keep deterministic Spanish creation/refinement routes local when possible

## Core Changes

### Planning and decomposition

- Added task-plan parsing and execution helpers in `editor/apps/editor/lib/assistant-task-plan.ts`.
- Added complexity classification and agent-domain decomposition in `editor/apps/editor/lib/assistant-agent-router.ts`.
- Updated `editor/apps/editor/lib/assistant-ai-provider.ts` so broad requests can return `task-plan`, complex timeouts fall back to a decomposed plan, and invalid remote repairs degrade to `clarify` instead of throwing.

### Session memory and context shaping

- Expanded `AssistantSessionMemory` in `editor/apps/editor/lib/assistant-panel-session.ts` with:
  - `failedPrompts`
  - `preferredComplexity`
  - `taskPlans`
  - `taskPlanSummaries`
- Updated `editor/apps/editor/lib/ai-context-shaping.ts` to compact that memory before it is sent to the remote planner.

### Deterministic smarter behavior

- Added local handling for lightweight chat/greetings.
- Added deterministic Spanish prompt coverage for:
  - house creation
  - pet-house creation
  - room dimensions expressed as `metros`
  - `medio metro`
  - roof follow-ups like `ponle techo`
  - window follow-ups like `agrega ventanas`

### Panel UX

- Updated `editor/apps/editor/components/editor/AiAssistantPanel.tsx` to:
  - switch between `Ask`, `Create`, and `Refine`
  - display task plans instead of collapsing them into plain chat
  - execute plans step-by-step with retry and stop controls
  - maintain smarter assistant session context between turns
  - show inline ghost autocomplete in the composer
- Extracted the task-plan display into `editor/apps/editor/components/editor/AssistantTaskPlanCard.tsx`.

## Verification

Targeted coverage now includes:

- task-plan parsing and execution
- agent-router decomposition
- assistant provider task-plan behavior
- deterministic Spanish prompts
- assistant session memory
- inline autocomplete
- task-plan execution failure behavior

Primary commands:

```powershell
cd editor
bun test ./apps/editor/lib/assistant-task-plan.test.ts ./apps/editor/lib/assistant-agent-router.test.ts ./apps/editor/lib/assistant-ai-provider.test.ts ./apps/editor/lib/assistant-composer-suggestions.test.ts ./apps/editor/lib/assistant-turn-sequence.test.ts ./apps/editor/lib/assistant-panel-session.test.ts
bun run check-types
bun run lint
```

## Remaining Manual Checks

The code-backed smarter-chat work is implemented and covered. The remaining checklist items are browser-verification items such as:

- confirming task-plan execution visuals in the live panel
- confirming ghost-text feel in the textarea
- confirming retry/stop interactions end-to-end in the browser
