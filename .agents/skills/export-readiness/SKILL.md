---
name: export-readiness
description: Prepare a generated scene or model for downstream handoff with explicit assumptions about scale, naming, completeness, and limitations. Use when a result is intended for export, demo delivery, prototype review, printing, game integration, or continued editing outside the immediate modeling task.
---

# Export Readiness

Package the result so another person or tool can use it without hidden assumptions.

## Workflow

1. Identify the intended downstream use.
2. Confirm scale, coordinate, and naming assumptions.
3. Check whether required geometry, materials, and structure are complete for that target.
4. List limitations instead of hiding them.
5. Produce a short handoff note that states what is ready and what is not.

## Output Contract

Return:

- intended target or usage
- scale and naming assumptions
- completeness status
- known limitations
- recommended next step

Use [references/handoff-template.md](references/handoff-template.md) for prototype or export handoff notes.

## Guidance

- Do not claim production readiness when only a visual prototype exists.
- Treat missing materials, collision assumptions, or topology shortcuts as limitations.
- Keep the handoff short but concrete.
