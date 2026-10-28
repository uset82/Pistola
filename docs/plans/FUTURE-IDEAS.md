# Pistola — Future Ideas

Candidate directions, with an honest read of what each would actually take. Nothing here is
committed work. Written 2026-10-28.

---

## Source: atech-atelier

<https://github.com/atechdotdev/atech-atelier> — "Atech AI CAD", formerly Atech Atelier.

### What it actually is

A desktop CAD app built on **FreeCAD 1.1.3** that a user drives through chat. An agent writes a
FreeCAD script, runs it, measures the solid, and shows the result in the 3D view. The output is
an ordinary FreeCAD model you can edit by hand or export as STEP/STL. The chat runs on **Claude
Code**, which the user installs and signs into separately.

Its distinctive feature is hardware-aware design: it ships 3D models of the Atech 14-port
board, its plug-in modules and a 10-port motherboard, and checks each module for **fit** against
the enclosure being designed. The board carries an ESP32-S3 with WiFi and BLE; each port exposes
two data lines plus GND, 3.3 V, 5 V and 12 V.

### Two corrections to the framing

This came in as *"simulation ready 3D CAD & electrical"*. Having read it:

- **It does no simulation.** The project never uses the word. Its only analysis is measuring
  volumes and dimensions, plus a build check. No FEA, thermal, motion or circuit simulation.
- **It does no electrical design.** No schematic capture, no PCB layout, no SPICE. "Electrical"
  here means *physical enclosures built around specific electronics modules*, with a
  dimensional fit check — mechanical work, not EDA.

Worth knowing before building expectations on it. The ideas below are still worth pursuing;
they just aren't things you get by adopting this project.

### Maturity and licence

7 stars, 17 commits, release 0.1.2 described as "a preview" with "rough edges". Code is
**LGPL-2.1-or-later**, but the board/module 3D models and `presets.yaml` are **CC BY-NC 4.0 —
non-commercial**. If Pistola is ever monetised, those assets cannot come with it. Treat the
*idea* as borrowable and the *assets* as not.

---

## Idea 1 — Hardware-aware design with fit checking

**The genuinely good idea in atech-atelier.** "Build around real hardware": a library of real
components with true dimensions, and a check that what you designed actually fits them.

For Pistola this would mean a parts library — boards, motors, bearings, fasteners, connectors —
each with real geometry and mounting constraints, plus a check that runs on regenerate.

What exists to build on:

- `pistola_search_catalog` and `pistola_list_recipes` already define a catalog surface.
- SolidCraft's `inspect.clearance` and `inspect.interference` are exactly the primitives a fit
  check needs, and are already reachable through `run_solidcraft_command`.
- `parts.insert_fastener` / `parts.standard` exist in the SolidCraft catalog for standard parts.

What's new: curating the library, and a node type that carries a component's constraints so the
check is automatic rather than something the user remembers to run.

Do **not** import Atech's models — the NC licence. Source from manufacturer STEP files, which
most vendors publish freely.

---

## Idea 2 — Simulation: much closer than it looks

The surprise from auditing `cad-helper/solidcraft/catalog.json`. **SolidCraft already ships 47
simulation-adjacent commands**, all reachable today through `run_solidcraft_command` now that
the passthrough has landed:

| Area | Commands | Examples |
|---|---|---|
| Motion / dynamics | 11 | `motion.study`, `motion.play`, `motion.trace`, `motion.export_animation` |
| Assembly joints | 19 | `joint.create`, `joint.drive`, `joint.reach`, `joint.motion_link` |
| Contact / interference | 9 | `inspect.interference`, `inspect.clearance`, `contact.create` |
| Physical materials | 8 | `material.assign`, `material.properties.directional` |
| Structural frames | 4 | `frame.member`, `frame.profile.properties` |

`material.properties.directional` takes an *engineering material card* with directional elastic
modulus — that is an FEA input, not a rendering property. Together with
`inspect.center_of_mass` and mass properties, the engine already holds most of what a structural
analysis needs as **input**.

**What is genuinely missing is a solver.** No FEA stress or thermal solving appears in the
catalog. So the realistic split:

- **Near-term, low cost:** kinematic simulation, joint-driven motion, interference and clearance
  analysis, mass properties, material assignment. All reachable now. Mostly a matter of exposing
  them as Pistola actions and scene concepts rather than raw passthrough commands.
- **Longer-term:** real FEA. Either wait for SolidCraft, or pipe STEP + the material card into an
  external solver (CalculiX and Elmer are the open options) and bring results back as a field
  overlay on the body.

The near-term half is the better bet: it is already paid for, and "does this mechanism actually
move without colliding" answers a question users genuinely have.

---

## Idea 3 — Electrical: genuine greenfield

Neither atech-atelier nor SolidCraft does EDA. If Pistola wants electrical, it is building it.

Three distinct things usually get bundled under the word, in increasing difficulty:

1. **Physical routing** — wire harnesses, cable paths, connector placement, bend radii, with
   clearance checks against the enclosure. Closest to what Pistola already does; SolidCraft's
   `solid.pipe` and sweep along a path are the geometric primitives.
2. **Schematic capture** — a netlist and symbols. A 2D graph problem, almost unrelated to the
   3D scene graph. Would be a new package, and the obvious move is to integrate rather than
   write: KiCad has a stable file format and a Python API.
3. **Circuit simulation** — SPICE. Deep specialist territory; integrate ngspice or skip.

Realistic recommendation: **do (1), integrate for (2), skip (3).** Physical routing fits
Pistola's existing strengths and complements Idea 1 — once a board is placed, routing its
harness through the enclosure is the natural next question.

---

## Idea 4 — Verified measurement as a product principle

Atech-atelier's quiet good decision: the agent reports volumes and sizes **measured from the
solid**, not estimated from the prompt.

Pistola already does this — `solidcraft-cli eval` and `inspect.measure` back the numbers, and
the SolidCraft work was verified this way (a 40 × 30 mm sketch extruded 20 mm measured exactly
40 × 30 × 20 mm). Worth making explicit as a rule in `rules.md`: **an agent never reports a
dimension it did not measure.**

Cheap to adopt and it is the difference between a demo and a tool.

---

## Suggested order

| | Idea | Why | Rough cost |
|---|---|---|---|
| 1 | Measured-not-estimated as a stated rule | Already true; just write it down | Hours |
| 2 | Expose SolidCraft's motion / joint / clearance commands as Pistola actions | Already paid for | Days |
| 3 | Hardware parts library with fit checks | Builds on 2; clear user value | Weeks |
| 4 | Wire harness routing | Complements 3 | Weeks |
| 5 | FEA via external solver | Real engineering value, real complexity | Months |
| 6 | Schematic capture via KiCad | Only if the product genuinely needs EDA | Months |

---

## Open questions

- Is the audience makers building enclosures around dev boards, or engineers who need analysis?
  Ideas 1 and 3 serve the first; Idea 5 serves the second. They pull in different directions.
- Does Pistola stay free and hosted? Idea 5 is CPU-heavy, and the hosted CAD helper is already
  billed per usage. FEA on an open endpoint is a different cost conversation entirely.
