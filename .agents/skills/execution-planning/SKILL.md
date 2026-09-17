---
name: execution-planning
description: Convert a scene plan into a deterministic implementation plan with ordered edits, validation checkpoints, and fallback paths. Use when a modeling or integration task is large enough that ad hoc editing would create unnecessary risk or rework.
---

# Execution Planning

Turn the chosen approach into a small, testable sequence of work.

## Workflow

1. Define the smallest viable slice that proves the task works.
2. Order edits so foundational schema or state changes happen before UI polish.
3. Attach a validation step to each material phase.
4. Note rollback or fallback options for risky edits.
5. Prefer reviewable increments over one large change set.

## Output Contract

Return:

- implementation phases
- files or modules likely to change
- validation commands per phase
- fallback or rollback notes
- stop conditions if the architecture disagrees with the request

Use [references/plan-template.md](references/plan-template.md) for tasks spanning multiple files or packages.

## Guidance

- Avoid parallelizing tightly coupled edits.
- If the request is still ambiguous, stop and route back to `idea-intake` or `scene-decomposition`.
- If the task exceeds one safe implementation pass, define a phase 1 that still delivers visible value.
