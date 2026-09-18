---
name: mac-cad-generation
description: Generate advanced mechanical CAD parts with Multi-Agent-CAD (MAC) via the Pistola mac-helper sidecar. Use when the user wants a standalone printable/engineered part, mechanism, or complex solid, not a FreeCAD sketch/extrude edit.
---

# MAC CAD Generation

Use Multi-Agent-CAD for advanced text-to-CAD. Keep FreeCAD for interactive sketch → extrude → fillet work.

## When to use MAC

- Standalone mechanical / printable parts
- Mechanisms (geneva, gears, cages, print-in-place)
- Requests that need Spec Planner → Architect → build123d → QA/repair

## When to use FreeCAD instead

- Active sketch edits, extrude/revolve, boolean, fillet/chamfer on parametric bodies
- `execute_cad_brief` for simple prismatic solids

## Runtime contract

1. Ensure `PISTOLA_MAC_ROOT` points at a cloned [Multi-Agent-CAD](https://github.com/Pan-Chera/Multi-Agent-CAD) repo and `PISTOLA_MAC_PYTHON` at its interpreter.
2. Install OpenRouter (default model `openrouter/free`) via Settings / `pistola_configure_model`.
3. Call assistant action `generate_mac_part` or MCP `pistola_generate_mac`.
4. Result imports as `cad-body` with `metadata.cadEngine = 'mac'` (no FreeCAD regen).

## Limits

- V1 is single-part only (no assembly/URDF).
- Free-router models are slower, non-vision, and rate-limited. Jobs can take minutes.
- Mock runtime (`PISTOLA_MAC_HELPER_RUNTIME=mock`) only validates the plumbing.
- ChatGPT Sites and Canner auto-start the bundled MAC/FreeCAD preview helpers when the real runtimes are missing, so CAD features stay available on the hosted editor.

## Output

- STEP + optional GLB/STL/Python under `/api/mac/artifacts/*`
- Scene node metadata: `macJobId`, prompt, QA summary, code URL
