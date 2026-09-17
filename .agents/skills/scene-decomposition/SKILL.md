---
name: scene-decomposition
description: Break a 3D concept into components, primitives, hierarchy, and a deterministic modeling order. Use when a user request is too broad to implement directly and must be decomposed into scene parts, reusable subassemblies, and execution steps.
---

# Scene Decomposition

Turn a concept brief into a modeling plan that is stable, ordered, and reviewable.

## Workflow

1. Start from the `idea-intake` brief or equivalent user specification.
2. Split the result into top-level objects or scene zones.
3. Break each object into primitive forms, assemblies, and optional detail layers.
4. Define a naming strategy for reusable parts.
5. Order the work from foundational geometry to secondary detail.
6. Identify which parts should remain modular for later editing.
7. Flag any dependencies that block later steps, such as scale, symmetry, or attachment points.

## Output Contract

Return:

- top-level scene graph outline
- component list
- ordered modeling sequence
- reusable subassemblies
- blocked decisions or dependencies

Use [references/decomposition-checklist.md](references/decomposition-checklist.md) when the task involves more than one major object.

## Guidance

- Prefer decomposition that matches how the scene will be edited later.
- Separate must-have geometry from decorative detail.
- Keep names stable and literal. Do not use vague labels like `part-a` or `misc`.
- If the concept is huge, define a smallest viable vertical slice instead of decomposing the full universe at once.
