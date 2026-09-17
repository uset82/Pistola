---
name: scene-validation
description: Validate a generated scene or implementation for geometry correctness, hierarchy consistency, architecture fit, and honest completion reporting. Use when an agent is about to claim a modeling or integration task is done or when a generated result must be reviewed for correctness and residual risk.
---

# Scene Validation

Verify the result before claiming success.

## Workflow

1. Confirm what the user asked for.
2. Check whether the implemented result matches the accepted brief.
3. Verify hierarchy, naming, and architecture placement.
4. Run the closest relevant validation commands when available.
5. Separate verified behavior from unverified assumptions.
6. Report residual risks and missing checks plainly.

## Output Contract

Return:

- verified outcomes
- failed checks or mismatches
- commands run
- commands not run
- residual risks

Use [references/validation-checklist.md](references/validation-checklist.md) before closing a non-trivial task.

## Guidance

- Prefer explicit findings over generic reassurance.
- If validation was not possible, say so directly.
- Do not mark speculative behavior as working.
- Review correctness first, then maintainability, then polish.
