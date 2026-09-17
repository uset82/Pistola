---
name: idea-intake
description: Structure a natural-language modeling request or rough sketch into a clear 3D scene brief with assumptions, ambiguities, constraints, and acceptance criteria. Use when a user describes a model, scene, object, or simple design reference and the request must be made buildable before implementation.
---

# Idea Intake

Convert an idea into a brief that another agent can execute without guessing at the core geometry.

## Workflow

1. Extract the primary object or scene goal in one sentence.
2. Separate confirmed requirements from inferred assumptions.
3. Identify the minimum geometry needed for a first usable prototype.
4. Capture materials, style, proportions, scale, and interaction expectations only if they affect implementation.
5. List ambiguities that materially change geometry or architecture.
6. Ask follow-up questions only for ambiguities that would produce the wrong model.
7. If the prompt is underspecified, propose a conservative default instead of blocking.

## Output Contract

Return a short brief with these sections:

- Goal
- Confirmed requirements
- Assumptions
- Geometry priorities
- Constraints
- Ambiguities
- Acceptance criteria

Use the template in [references/brief-template.md](references/brief-template.md) when the task is non-trivial.

## Guidance

- Prefer a buildable first pass over a perfect artistic interpretation.
- Treat uploaded sketches as directional references, not exact CAD drawings, unless the user says otherwise.
- Call out scale assumptions explicitly when the user does not provide dimensions.
- Keep the brief concise enough that it can be handed to `scene-decomposition` without further cleanup.
