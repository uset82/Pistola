---
name: pistola-studio
description: Concept-first workflow for creating a 3D object or scene in Pistola from a request such as "genera un barco de juguete", "make a 3D chair", or "crea una casa pequeña". Generates concept images for the user to approve, then builds the 3D model from the approved image with Pistola sub-agents for blueprint, feature choice, critique, and learning. Use for new objects or scenes; not for small edits to an existing scene.
---

# Pistola Studio

Build what the user approves, not the first thing that comes to mind. A cheap image is the contract; the 3D model must match it.

## Roles

Any IDE can play these roles in one thread. Codex may spawn `.codex/agents/` for the same jobs; other hosts write the JSON themselves and keep driving the page.

- **You (main thread)** are Orchestrator and Builder. Only you talk to the user and drive the live editor. Image generation is optional and host-specific (`image_gen` on Codex; Nano Banana / user upload elsewhere). Never let two writers touch the live editor.
- **Scene planning** (`pistola_blueprint` when Codex can spawn it): approved image or a text brief → parts blueprint.
- **Pascal integration** (`pistola_feature_guide`): blueprint → validated action batches.
- **Quality** (`pistola_critic`): render vs concept to a ranked fix list. At most two critic rounds unless the user asks for more.
- **Learning** (`pistola_librarian`): lessons and the reusable blueprint after delivery.

## Loop

1. **Library check.** Read `.agents/library/INDEX.md`. If a matching object exists, offer to reuse it ("I have an approved toy boat; reuse it or design a new one?"). Read `.agents/library/LEARNINGS.md` before planning.
2. **Intake.** Pin down only what changes the geometry: purpose, style (toy, low-poly, realistic, architectural), rough size, must-have parts. Assume sensible defaults instead of asking more than one question.
3. **Concept (gate 1).** Use `$imagegen` (built-in `image_gen`) to make 2 or 3 distinct variants following [references/concept-prompting.md](references/concept-prompting.md). Show them and ask which one to build or what to change. **Stop and wait for the user's answer.** Iterate with one targeted change per round. A host that cannot generate images writes a measured part table instead (name, meters, color, relation to the floor) and reviews the build with `pistola_render_eight_views`. Do not skip the gate.
4. **Ortho sheet.** For the approved variant, generate a front/side/top orthographic sheet (an edit of the approved image) so proportions can be traced. Save both under `.pistola/studio/<slug>/` (gitignored): `concept.png`, `ortho-sheet.png`.
5. **Blueprint.** Crop each view and trace it with `$pistola-image-to-blueprint` (`scripts/trace_silhouette.py`). Spawn `pistola_blueprint` with the image paths, traced polygons, and intake notes. Validate the result against `blueprint.schema.json`.
6. **Feature plan.** Spawn `pistola_feature_guide` with the blueprint and the detected execution surface (see `$pistola-features`). It returns validated action chunks of at most 25 actions.
7. **Build.** Create a `taskPlan` checklist, then execute the chunks through MCP `pistola_task_run_step` or `window.pistola.invoke`. After each chunk, read the result; on an error, fix that chunk only, and never replay chunks that already succeeded. Never send the prompt to the in-app Assistant.
8. **Critique (at most 3 rounds).** Screenshot the viewport and save `render-rN.png`. Spawn `pistola_critic` with the concept and the render. Apply its top fixes. Stop when it passes, after 3 rounds, or when the remaining gaps need a feature Pistola does not have. Say which one it was.
9. **Review (gate 2).** Show the concept and the final render side by side. State what matches, what is approximated and why, and offer 2 or 3 concrete refinements.
10. **Learn.** Spawn `pistola_librarian` with the blueprint, the successful action chunks, and what went wrong or right.

## Shortcuts

- The user says "sin concepto", "just build", or "rápido": skip steps 3 and 4 and build from the intake, still with a blueprint.
- The user supplies a reference image: it replaces step 3. Still confirm the reading ("I'll build this as a 3-part toy boat, about 40 cm long; ok?").
- Architecture requests (houses, rooms, floors) use the concept for style and layout, but build with architecture actions (walls, slabs, doors, windows), not primitives.

## Honesty rules

- Never claim the model matches the concept without a screenshot comparison.
- Name approximations: "the hull is a traced profile extrusion, not a lofted surface".
- If the host runs mock CAD or MAC, say so and pick a feature that produces real geometry instead of shipping a placeholder.
