# `TASK-codex-direct-control.md` — Codex Direct Pistola Control

> **Operating contract**
> - Change `- [ ]` to `- [x]` only after the item has been implemented and verified.
> - Codex/IDE owns natural-language interpretation, scene planning, and action authoring.
> - Pistola executes typed, validated actions; it does not re-plan Codex requests through the in-app AI provider.
> - Never fall back silently from a direct IDE surface to `pistola_chat`, `pistola_plan`, `/api/assistant/plan`, `/api/assistant/agent/step`, or an Assistant-panel prompt.
> - Mark a step complete only from a successful execution result or an explicit validation result with evidence.
> - Keep every action batch within the existing 25-action limit and preserve destructive-action confirmation.

## Goal

When a user asks Codex, VS Code, Antigravity, or another capable IDE agent to create or edit a model, the IDE agent must operate Pistola directly. The in-app Assistant remains available for people who choose it, but it is independent and optional.

Codex must publish a phase-and-step checklist before work begins, update it as verified work completes, and mirror the same read-only progress inside the Pistola workspace.

## Phase 0 — Architecture and Ownership

- [x] Audit the existing in-page, WebMCP, local MCP, and Assistant execution surfaces.
- [x] Confirm that `window.pistola` already exposes deterministic inspect, validate, run, wait, screenshot, and undo operations.
- [x] Confirm that local MCP `pistola_execute` and WebMCP action tools can execute typed actions without an AI provider.
- [x] Lock the ownership split: Codex plans; Pistola validates and executes.
- [x] Choose a built-in provider-free bridge as the static Sites fallback.
- [x] Choose Codex as the authoritative checklist owner with a read-only Pistola mirror.

### Checkpoint — Architecture

- [x] No change is required in `packages/core` or `packages/viewer`.
- [x] Provider-free execution stays in `packages/editor`; workspace chrome stays in `apps/editor`.
- [x] The existing Assistant remains functional but is not part of the Codex execution route.

## Phase 1 — Provider-Neutral Operator Plan State

- [x] Add shared operator-plan types for source, phases, steps, status, timestamps, errors, and evidence.
- [x] Add an editor-owned store for the active external plan, separate from Assistant conversation state.
- [x] Derive phase and plan status from child steps instead of accepting optimistic completion.
- [x] Persist the active plan locally and convert stale `running` steps to `interrupted` after reload.
- [x] Require evidence when a validation-only step is marked complete.
- [x] Add unit tests for lifecycle, derived progress, evidence rules, and reload recovery.

### Checkpoint — Plan State

- [x] `cd editor && bun test ./packages/editor/src/lib/operator-plan/operator-plan.test.ts`
- [x] `cd editor && bun run check-types`

## Phase 2 — Direct Codex Operator API

- [x] Extend `window.pistola` with a versioned `taskPlan` namespace.
- [x] Support `create`, `get`, `updateStep`, `runStep`, `complete`, `undo`, and `clear` without calling an AI route.
- [x] Make `runStep` atomically mark `running`, validate, execute, wait for the result, then mark `done` or `error`.
- [x] Reject invalid, unknown, or over-25-action batches before mutation.
- [x] Continue to require `confirmDestructive: true` for destructive actions.
- [x] Capture a pre-plan scene snapshot before the first mutating step and expose whole-plan undo for the current page session.
- [x] Return structured evidence including action count, created node IDs, warnings, and validation errors.

### Checkpoint — Operator API

- [x] A direct build succeeds with every AI provider disabled.
- [x] Invalid actions fail without mutating the scene.
- [x] A destructive step cannot run without explicit confirmation.
- [x] Whole-plan undo restores the scene from before the first successful plan mutation.

## Phase 3 — Read-Only Pistola Checklist Mirror

- [x] Add a compact `IDE plan` surface outside the Assistant panel.
- [x] Render phase headings and checkbox-like `pending`, `running`, `done`, `error`, and `interrupted` states.
- [x] Show verified progress, current step, concise evidence, and failure details.
- [x] Keep execution controls out of the mirror; Codex remains the plan owner.
- [x] Offer only safe presentation controls plus whole-plan Undo when a snapshot is available.
- [x] Keep the mirror responsive and hidden when no external plan exists.
- [x] Add stable test IDs for browser/IDE automation.

### Checkpoint — Checklist UI

- [x] The panel contains no model picker, prompt composer, provider name, or free-model status.
- [x] The mirrored progress agrees with `window.pistola.taskPlan.get()`.
- [x] The Assistant can be collapsed or unavailable without affecting direct execution.

## Phase 4 — IDE Workflow Contract

- [x] Update the Pistola browser-agent workflow to discover direct surfaces once and choose the strongest available deterministic route.
- [x] Mandate the route order: in-page operator bridge, WebMCP action tools, local MCP execute tools; stop if none is available.
- [x] Explicitly forbid automatic fallback to natural-language Pistola Assistant prompts.
- [x] Require a visible checkbox plan before scene mutation and verified checkbox updates at each checkpoint.
- [x] Require `inspect → validate → run → waitForIdle → inspect/screenshot` for every modeling phase.
- [x] Require bounded visual critique and honest reporting before declaring the model complete.

### Checkpoint — IDE Contract

- [x] Codex documentation names the direct API and the forbidden AI routes.
- [x] A new agent session can follow the workflow without reading prior chat history.

## Phase 5 — Regression and Release Validation

- [x] Add tests proving Codex-originated execution makes zero requests to AI planning routes.
- [x] Add tests for error, retry, interruption, reload, and whole-plan undo behavior.
- [x] Verify direct execution through the static Sites build where Next server routes are absent.
- [x] Verify the human-operated Assistant still works independently.
- [x] Run targeted Biome lint on every changed TypeScript/TSX/JavaScript file.
- [ ] Full `cd editor && bun run lint` passes (blocked by pre-existing diagnostics in unrelated `WorkspaceMenuBar.tsx`, `ProjectModals.tsx`, `chat-markdown.ts`, and assistant-agent files).
- [x] Run `cd editor && bun run check-types`.
- [x] Run `cd editor && bun run build:sites`.
- [x] Run `cd editor && bun run smoke:sites` (18/18).

## Acceptance Gate

- [x] Asking Codex to build an object never sends that request to the Pistola Assistant model.
- [x] Codex creates and updates a detailed checkbox plan before and during execution.
- [x] Pistola mirrors the same plan beside the viewport without becoming the planner.
- [x] Every completed step has execution or validation evidence.
- [x] A failed step remains visibly failed and can be retried without fake success.
- [x] Direct control works in the public static Sites workspace with no provider key.
- [x] The user can undo the complete Codex plan in the current page session.
- [x] Existing architecture boundaries and human Assistant behavior remain intact.

## Stop Conditions

- [x] Stop rather than route through a weaker/free model when no deterministic IDE control surface is available.
- [x] Stop rather than mark a step complete when execution evidence is missing.
- [x] Stop and redesign if implementation would require arbitrary code execution or bypass scene validation.
- [x] Stop and report if a requested destructive action lacks explicit confirmation.
