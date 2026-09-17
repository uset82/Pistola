# Pistola Rules

## Purpose

This file defines the non-negotiable operating rules for all agents working in this repository.

`agents.md` defines who does the work.
`skills.md` defines how repeatable workflows are packaged.
`rules.md` defines what agents must and must not do.

## Decision precedence

When guidance conflicts, use this order:

1. direct user instructions
2. platform and system safety constraints
3. `rules.md`
4. repository instruction file loaded from `agents.md`
5. `agents.md`
6. `skills.md`
7. local heuristics

## Core operating rules

- Inspect relevant context before proposing or making changes.
- Prefer the smallest correct change that preserves existing architecture.
- State material assumptions when user input is ambiguous.
- Ask a clarifying question only when ambiguity changes geometry, architecture, safety, or external behavior in a meaningful way.
- Do not invent nonexistent APIs, commands, scene capabilities, or editor abstractions.
- Keep role boundaries clear: responsibility belongs to `agents.md`; repeatable workflows belong to `skills.md`.

## Architecture rules for Pistola

- Treat `editor/` as the current implementation base built on `pascalorg/editor`.
- Preserve the separation of concerns between `packages/core`, `packages/viewer`, and `apps/editor`.
- Prefer extending the editor's existing node, store, system, and renderer model over adding parallel abstractions.
- Keep scene logic deterministic and reproducible from the same prompt and assumptions when practical.
- Do not bypass core scene semantics with hidden one-off hacks unless they are explicitly documented as temporary.

## Modeling and product rules

- Align every implementation with the product thesis in `mainidea.md`: idea to prototype through chat-driven 3D creation.
- Optimize for iterative refinement, not one-shot prompt spectacle.
- Structure outputs so a user can understand what was generated, what assumptions were made, and what remains unresolved.
- Treat sketches, reference images, and user assets as project inputs that must not be redistributed or exposed unnecessarily.

## Validation rules

- Run the closest relevant validation command for the files you changed.
- For work inside `editor/`, prefer commands already defined there, such as:
  - `bun run lint`
  - `bun run check-types`
  - other package-specific checks when applicable
- If validation cannot be run, report that clearly and explain why.
- Do not claim a feature works unless it has been reasoned through against the architecture or validated directly.

## Change management rules

- Do not make destructive file or git changes without explicit user direction.
- Do not add dependencies, services, or network requirements unless the task requires them and the tradeoff is surfaced.
- Keep documentation, prompts, and implementation aligned. If one changes materially, update the others in the same task when practical.
- Codify repeated corrections into project guidance instead of relying on memory.

## Review and quality rules

- Review for correctness first, then maintainability, then polish.
- Surface risks early when a task conflicts with the current architecture or product direction.
- Prefer concrete findings over vague advice.
- If a task introduces a new repeatable workflow, add it to `skills.md` and plan a concrete skill package.

## Execution governance for Codex

OpenAI Codex command rules are separate from this file and are enforced through `.rules` files. When Pistola adopts executable Codex rules, the baseline policy should be:

- allow safe read-only inspection commands
- prompt on package installation, release automation, external network actions, and writes outside the project
- forbid destructive commands such as forced resets, broad recursive deletion, or credential manipulation unless the user explicitly requests them

This file is the policy source; executable `.rules` files should mirror it rather than redefine it.

Current executable policy lives at `.codex/rules/default.rules`.

## Standards references

- OpenAI Codex rules: https://developers.openai.com/codex/rules
- OpenAI Codex `AGENTS.md` guide: https://developers.openai.com/codex/guides/agents-md
- OpenAI Codex customization: https://developers.openai.com/codex/concepts/customization
- AGENTS.md standard: https://agents.md
- Agent Skills standard: https://agentskills.io/home
