---
name: ide-orchestration
description: Define the chat-to-scene workflow across IDEs such as VS Code, Codex, and Antigravity. Use when the task concerns prompt contracts, clarification behavior, preview loops, undo or refinement flows, or IDE-facing orchestration rather than raw scene geometry alone.
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

For "create/generate X" requests, use `$pistola-studio`, the concept-first loop with the `.codex/agents/` sub-agents. For the ranked list of execution surfaces Codex can use (in-page API, chat `/run`, local MCP, WebMCP, plain chat), see `.agents/skills/pistola-features/references/execution-surfaces.md`.

## IDE control (MCP + workspace bridge)

Pistola can be driven from Cursor, VS Code, or Codex through the `pistola` MCP server:

1. Start the editor (`http://127.0.0.1:3002`) and keep a live workspace tab open.
2. Register MCP via [`.cursor/mcp.json`](../../../.cursor/mcp.json) → `editor/tooling/pistola-mcp`.
3. During local development, sign the browser tab in for token-based MCP access. For a DB-free local browser workspace, leave the token unset and set `PISTOLA_ALLOW_UNAUTHENTICATED_API=1` in the editor app environment (never production).
4. Tools:
   - `pistola_status` / `pistola_get_workspace`
   - `pistola_configure_model` (OpenRouter free by default)
   - `pistola_plan` / `pistola_execute` / `pistola_chat`
   - `pistola_generate_mac` / `pistola_generate_cad`

Scene mutations require the live tab: MCP enqueues commands on `/api/workspace/*`; `WorkspaceBridge` executes them with `executeAssistantPlan`. Headless MAC generation can still produce artifacts without a tab when `importIntoScene=false`.
