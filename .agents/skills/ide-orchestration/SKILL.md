---
name: ide-orchestration
description: Define the chat-to-scene workflow across IDEs such as VS Code, Codex, Antigravity, and Qoder. Use when the task concerns prompt contracts, clarification behavior, preview loops, undo or refinement flows, or IDE-facing orchestration rather than raw scene geometry alone.
---

# IDE Orchestration

Describe how the user, the agent, and the editor runtime interact.

## Workflow

1. Define the user input contract.
2. Define what the system must infer versus what it must ask.
3. Define the output contract sent to the scene execution layer.
4. Define the preview and refinement loop.
5. Define failure handling and recovery behavior.
6. Keep the flow vendor-neutral unless a tool-specific behavior is unavoidable.

## Output Contract

Return:

- input contract
- clarification rules
- execution contract
- preview and refinement loop
- undo or recovery behavior
- IDE-specific assumptions

Use [references/prompt-contract-template.md](references/prompt-contract-template.md) when designing or revising an interaction flow.

## Guidance

- Optimize for fast iteration, not long chat transcripts.
- Keep prompts and responses structured enough that scene execution remains deterministic.
- If the experience depends on hidden state, define that state explicitly.
- Do not let IDE-specific details contaminate core scene logic.

## Building objects from Codex

For "create/generate X" requests, use `$pistola-studio`, then drive the page with `$pistola-direct-control`. The ranked execution surfaces are MCP `pistola_*` tools, then `window.pistola.invoke`. Chat `/run` is a person-facing recovery path, not an IDE route. See `.agents/skills/pistola-features/references/execution-surfaces.md`.

## IDE control

Pistola is driven from Claude Code, Codex, Cursor, Antigravity, WorkBuddy, or Qoder through the `pistola` MCP server (`command: node`, `editor/tooling/pistola-mcp/src/index.ts`):

1. Open the target (`local`, `canner`, or `sites`).
2. Create a `taskPlan` checklist before the first mutation.
3. Use only default tools: inspect, export scene, validate, run, task, screenshot. Loop: plan → examples → build per part → check → fix (≤2) → render → critique (≤2) → keep best. Never `pistola_chat`, `pistola_plan`, or `/api/assistant/*`.
4. If `window.pistola.invoke` is missing, stop. Do not fall back to the in-app model.
