# `TASK-ai-chat-smarter.md` — Pistola Smarter Chat, Safer Execution, and Composer Assist

> **Codex operating contract**
> - Change `- [ ]` to `- [x]` immediately when a task is verified complete.
> - Do not claim the chat is "smart" until broad create, refine, and cleanup prompts produce stable executable results instead of stale-target failures or empty chat.
> - Do not hide planner or executor weakness behind generic assistant replies; if the assistant cannot target or build safely, it must clarify with a concrete reason.
> - Keep composer assistance non-destructive: autocomplete and suggestions may help the user write, but they must never auto-send or mutate the scene on their own.
> - Keep assistant planning in `apps/editor`, validated actions and execution in `packages/editor`, and leave `packages/core` / `packages/viewer` assistant-agnostic.

## Summary

- Make the assistant better at understanding create, refine, and cleanup requests.
- Add an explicit new chat/session control and a creation-focused chat option so stale conversation state does not poison the next request.
- Add prompt autocomplete and guided composer suggestions to help users write buildable prompts faster.
- Fix destructive and multi-step plans so the assistant uses explicit targets and bounded cleanup actions instead of fragile repeated "delete selected target" behavior.

## Status

- [x] Completed on 2026-03-26 after green `check-types`, targeted smarter-chat tests, and `lint` with only unrelated pre-existing warnings.

## Current Failure Focus

- The chat can now create some geometry, but broad prompts still collapse into weak plans or stale-target failures.
- Cleanup prompts like "clean everything" still over-rely on current selection and can emit repeated `delete_target` actions instead of an explicit scoped cleanup plan.
- The assistant still loses quality on follow-up requests because session context, last-created targets, and named-node targeting are not robust enough.
- The composer has no autocomplete or intent scaffolding, so the user must manually guess the best phrasing.

## Pre-flight

- [x] Read `rules.md`
- [x] Read `mainidea.md`
- [x] Read `TASK-ai-assistant.md`
- [x] Read `TASK-ai-full-creation.md`
- [x] Inspect the current assistant UI and runtime files:
  `editor/apps/editor/components/editor/AiAssistantPanel.tsx`,
  `editor/apps/editor/lib/assistant-ai-provider.ts`,
  `editor/apps/editor/lib/assistant-acceptance-fixtures.ts`,
  `editor/apps/editor/lib/assistant-turn-sequence.ts`,
  `editor/packages/editor/src/lib/assistant/types.ts`,
  `editor/packages/editor/src/lib/assistant/execute.ts`

## Public Interfaces and Contracts

- [x] Create this root task file as `TASK-ai-chat-smarter.md`.
- [x] Extend `AssistantPlanRequest` with explicit chat/session controls so the planner can distinguish at least:
  `ask`, `create`, and `refine`, plus a stable session or draft context identifier.
- [x] Add a bounded cleanup action contract for common destructive prompts when explicit scope is available:
  either `clear_level_contents`, `clear_selection_contents`, or another typed equivalent that does not depend on repeated `delete_target`.
- [x] Add a typed composer-suggestion contract for autocomplete and guided prompt chips, including:
  suggestion text, category, insertion behavior, and optional context requirement.
- [x] Keep `apps/editor` responsible for chat UI, session state, composer suggestions, prompt shaping, and planner orchestration.
- [x] Keep `packages/editor` responsible for action validation, target resolution, cleanup execution, rollback, and builder helpers.

## Phase 0 — Baseline and Failure Corpus

- [x] Add new assistant acceptance fixtures for:
  `clean everything`,
  create-from-scratch broad scene prompts,
  multi-step follow-up refinement,
  stale-selection cleanup,
  named-target refinement,
  unsupported prompts,
  chat-session reset,
  composer autocomplete ranking.
- [x] Record the current failure source for each fixture as one of:
  planner weakness,
  stale target resolution,
  selection drift,
  action surface gap,
  executor failure,
  continuation failure,
  unsupported prompt,
  composer-assist gap.
- [x] Add a regression that fails if a destructive cleanup request still expands into repeated `delete_target` actions when explicit scoped deletion is possible.
- [x] Add a regression that fails if a buildable create prompt collapses into generic chat without either executable actions or a precise clarification.

### Checkpoint — Baseline

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun test ./apps/editor/lib/assistant-ai-provider.test.ts ./apps/editor/lib/assistant-turn-sequence.test.ts ./packages/editor/src/lib/assistant/types.test.ts`

## Phase 1 — New Chat Option and Session Reset

- [x] Add an explicit `New Chat` control in `AiAssistantPanel` that clears assistant message history, pending review state, clarification state, execution status, continuation state, and ephemeral assistant memory without mutating the scene.
- [x] Add a visible chat-mode control in the assistant UI with at least:
  `Ask`, `Create`, and `Refine`.
- [x] Pass the selected chat mode through `AssistantPlanRequest` so prompt shaping and deterministic routing know whether to prioritize explanation, creation, or follow-up editing.
- [x] Keep session reset separate from scene reset. Starting a new chat must not delete geometry, clear selection, or reset the current project.
- [x] Persist only the minimum session state needed for assistant continuity. Do not let stale failed-plan state bleed into a new chat session.

### Checkpoint — Session UX

- [x] `cd editor && bun run check-types`
- [x] Add or update tests for new chat reset behavior, chat-mode selection, and stale-state isolation.

## Phase 2 — Smarter Intent Routing and Target Resolution

- [x] Expand deterministic routing for common high-value prompts before remote planning:
  broad room/house creation,
  furnishing bundles,
  cleanup/reset requests,
  rename/hide/show/edit prompts,
  follow-up refinement like "make it bigger" or "move the sofa left".
- [x] Add a shared target-resolution layer that can resolve:
  selected nodes,
  last assistant-created nodes,
  named rooms/zones/items,
  recently referenced entities,
  explicit node IDs when available.
- [x] Prefer explicit `delete_nodes` or the new bounded cleanup action over repeated `delete_target` for destructive prompts with known scope.
- [x] Clarify when the destructive scope is ambiguous instead of guessing across the whole project.
- [x] Keep the local router bilingual for English and Spanish where current deterministic creation already supports both.

### Checkpoint — Intent Routing

- [x] `cd editor && bun run check-types`
- [x] Add or update tests for cleanup prompts, named-target follow-ups, bilingual intent parsing, and stale-selection recovery.

## Phase 3 — Planner Quality and Execution Hardening

- [x] Feed the planner a richer structured workspace summary:
  active phase,
  selected nodes,
  named nodes,
  last assistant-created nodes,
  recent failures,
  available bounded cleanup actions,
  current chat mode.
- [x] Normalize planner output before review so duplicate or contradictory actions are rejected or repaired before execution.
- [x] Add preflight validation for destructive plans so missing targets are caught before the first mutation instead of failing halfway through.
- [x] Make executor behavior safer for idempotent cleanup steps:
  skip already-deleted targets only when the remaining plan is still coherent and rollback semantics remain correct.
- [x] Keep rollback snapshots and undo behavior intact across smarter cleanup and multi-step build plans.

### Checkpoint — Planner and Executor

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun test ./apps/editor/lib/assistant-ai-provider.test.ts ./apps/editor/lib/assistant-continuation.test.ts ./apps/editor/lib/assistant-turn-sequence.test.ts ./packages/editor/src/lib/assistant/types.test.ts`

## Phase 4 — Composer Autocomplete and Guided Prompt Assist

- [x] Add a local composer-suggestion module for prompt autocomplete and quick-start chips, likely under `editor/apps/editor/lib/assistant-composer-suggestions.ts`.
- [x] Generate suggestions from current phase, selection, available tools, catalog categories, recent successful prompts, and current chat mode.
- [x] Support at least these composer assist types:
  inline completion,
  dropdown suggestions,
  one-click prompt chips,
  scoped prompt templates like `Create room`, `Furnish selection`, `Clean level`, `Refine selected item`.
- [x] Add keyboard support for suggestion navigation and acceptance without breaking plain text entry.
- [x] Keep autocomplete local and deterministic in phase 1. Do not call the remote planner on every keystroke.
- [x] Make suggestions context-aware enough to help the user write a buildable request, not generic marketing copy.

### Checkpoint — Composer Assist

- [x] `cd editor && bun run check-types`
- [x] Add or update tests for suggestion ranking, keyboard selection, context-aware templates, and no-auto-send behavior.

## Phase 5 — Review UX, Recovery, and Trust

- [x] Make review cards summarize destructive scope clearly:
  what will be created,
  what will be edited,
  what will be deleted,
  and what assumptions were made.
- [x] Surface precise executor failures in operator language, including the real missing target or invalid scope, instead of generic assistant collapse.
- [x] Add recovery affordances after failure:
  retry with repaired plan,
  clarify target,
  start new chat,
  undo last assistant turn.
- [x] Keep successful chat turns concise and operator-like. Do not flood the message history with redundant execution noise.
- [x] Ensure a new chat session starts cleanly even if the previous assistant turn failed mid-plan.

### Checkpoint — Recovery UX

- [x] `cd editor && bun run check-types`
- [x] `cd editor && bun run lint`

## Acceptance Gate

- [x] A prompt like `clean everything` no longer emits repeated `delete_target` actions against stale selection. It either uses an explicit scoped cleanup action, explicit `delete_nodes`, or a precise clarification.
- [x] A broad prompt like `make a small furnished cafe` produces an executable approximation or a concrete clarification, not generic chat.
- [x] A follow-up like `make the windows taller` correctly resolves the recently created or named target without restating the full scene.
- [x] A new chat session clears assistant-only state while leaving the project scene untouched.
- [x] The user can switch between `Ask`, `Create`, and `Refine` without breaking the existing assistant execution flow.
- [x] Composer autocomplete suggests useful phase-aware prompts and can be accepted by mouse and keyboard.
- [x] Composer assistance never auto-sends a prompt and never mutates the scene by itself.
- [x] Executor failures are shown with actionable detail, and the assistant offers a recovery path instead of silently collapsing.
- [x] Existing creation and refinement flows covered by `TASK-ai-full-creation.md` are not regressed.

## Documentation and Alignment

- [x] Keep this file updated as the active checklist for smarter chat and composer assist.
- [x] Update any assistant guidance that describes chat modes, cleanup behavior, or composer assist once implementation starts.
- [x] Document the new chat/session controls in the assistant UI copy and any nearby editor guidance without duplicating planner logic in docs.

## Assumptions and Defaults

- [x] This task extends the current always-on assistant rather than replacing it with a separate chat product.
- [x] The first autocomplete pass should be local and deterministic; remote suggestion generation is out of scope unless local assist proves insufficient.
- [x] New chat/session controls live in `apps/editor`; assistant action execution remains in `packages/editor`.
- [x] Cleanup behavior must stay typed and bounded. Do not add an unrestricted arbitrary-scene patch or freeform delete query.
- [x] `TASK-ai-full-creation.md` remains completed historical context; this file is a new scope focused on smarter chat quality, safer cleanup, and prompt assist.
