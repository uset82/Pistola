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
