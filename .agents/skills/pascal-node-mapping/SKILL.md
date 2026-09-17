---
name: pascal-node-mapping
description: Map a scene plan onto the pascalorg/editor architecture, including nodes, stores, systems, renderers, and editor tools. Use when a 3D concept must be implemented inside the existing editor codebase without breaking package boundaries or inventing parallel abstractions.
---

# Pascal Node Mapping

Translate scene intent into the actual extension points used by `pascalorg/editor`.

## Required Context

Before proposing edits, read:

- `editor/AGENTS.md`
- `editor/README.md`

Inspect the closest relevant files inside:

- `editor/packages/core/src/schema`
- `editor/packages/core/src/store`
- `editor/packages/core/src/systems`
- `editor/packages/viewer/src/components/renderers`
- `editor/apps/editor` or `editor/packages/editor`, depending on the relevant integration point

## Workflow

1. Decide whether the request can be represented with existing node types and tools.
2. If yes, reuse the existing node model and identify the smallest integration point.
3. If no, explain why a new node, system, renderer, or tool is required.
4. Keep package boundaries intact:
   - `core` owns schema, state, and systems
   - `viewer` owns rendering and presentation
   - `editor` owns tools, orchestration, and UI
5. Map the request to concrete files, store actions, and validation commands.
6. Identify architecture risks before implementation.

## Output Contract

Return:

- target package list
- node mapping
- store impact
- system impact
- renderer or tool impact
- validation commands
- risks or open questions

Use [references/mapping-checklist.md](references/mapping-checklist.md) to avoid skipping a layer.

## Guidance

- Prefer extending an existing node type over adding a new parallel abstraction.
- Do not place editor-specific behavior inside `viewer` if it can be injected.
- Do not put rendering concerns inside `core`.
- If the plan conflicts with the current architecture, say so before editing.
