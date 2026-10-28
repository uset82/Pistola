---
name: solidcraft-modelling
description: Drive SolidCraft's MCP server to build, inspect, and export real parametric CAD parts. Use when a task needs more than Pistola's in-browser OCCT sketch/extrude/boolean surface, when a STEP/3MF/STL deliverable is required, or when the user asks for SolidCraft commands, measurements, or MCP tooling.
---

# SolidCraft Modelling

Model through discovery, not memory. SolidCraft 0.25.1 exposes 493 commands and 19 MCP tools; the exact command ids and parameter contracts must be read from the running build.

## Discovery-first loop

1. `list_commands` with a filter (`sketch.`, `solid.`, `file.`, `inspect.`).
2. `describe_command` for the candidate id. Read `params` and, when present, the `input` JSON Schema.
3. `batch` the construction steps with `rollback: true`.
4. `measure` or `inspect_design` and check volume, bbox, and centre of mass against an analytic estimate.
5. `screenshot` for a visual check when appearance or topology matters.
6. `export` a real file into an allowed folder such as `cad-out/`.

Never invent a command id. If `list_commands` does not return it, it does not exist.

## Units and coordinates

SolidCraft command coordinates are millimetres and Z is up. Pistola scene coordinates are metres. Convert at one boundary only:

- metres -> millimetres: multiply by 1000
- millimetres -> metres: divide by 1000

Set display units explicitly when a design is created (`document.units` with `{"units":"mm"}`). The current catalog names this command `document.units`; `doc.change_units` is not present in 0.25.1.

## Edge picking

`solid.fillet` and `solid.chamfer` take points on edges, not ids. Use `body_topology` or `model.edges` first. Pick an edge midpoint, never a corner where three edges meet: a corner is rejected with "where 3 edges meet".

## Verification bar

A part is not done until:

- the batch or feature reports no error and no suppressed failure;
- `measure` returns a volume consistent with the intended dimensions within a small tolerance;
- the exported file exists and starts with the expected format header (STEP begins `ISO-10303-21;`);
- a screenshot exists when the user asked for visual fidelity.

Read [references/tools.md](references/tools.md) for the 19-tool surface and [references/gotchas.md](references/gotchas.md) before a long session.
