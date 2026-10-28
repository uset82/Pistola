# Assemblies, joints and motion: a design note

Status: proposal only. Nothing here is implemented. Written 2026-10-28 alongside the named
inspection actions (`inspect_interference`, `inspect_clearance`,
`inspect_center_of_mass`), which cover the read-only half of SolidCraft's analysis surface.

## Why this needs a design, not just wiring

SolidCraft's catalog exposes 52 simulation-adjacent commands. The inspection jobs already
shipped use 4 of them (`inspect.interference`, `inspect.clearance`,
`inspect.center_of_mass`, plus `inspect.measure` internally). The remaining families assume
something Pistola does not have:

| Family | Commands | Assumes |
|---|---|---|
| Motion / dynamics | 11 | a study driving joints over time |
| Assembly joints | 18 | two or more bodies with a joint between them |
| Contact sets | 7 | bodies that can touch without being joined |
| Physical materials | 8 | engineering material cards per body |
| Structural frames | 4 | member/profile geometry, not a solid timeline |

`CadBodyNode` is one solid with an operation timeline. A joint between two of them has nowhere
to live, and `motion.play` has no state to advance. Naming these actions without a container
would either be a lie (the action cannot work) or force arbitrary command execution back open,
which the hosted helper deliberately refuses (`PISTOLA_CAD_ALLOW_PASSTHROUGH=0`).

## What an assembly node would be

A `CadAssemblyNode` in `packages/core/src/schema/nodes/` — a container, not a solid:

- `bodyIds: string[]` — ordered references to `cad-body` nodes, the same way a boolean
  operation already references `toolBodyIds` by node id.
- `joints: CadJoint[]` — see below.
- `motion: CadMotionStudy | null` — the study definition (not its samples).
- `position`, `rotation`, `scale` — the assembly's own placement, applied to every member.

It would be a sibling of `cad-body` under a level or site, and the viewer would render members
through it rather than duplicating geometry. The important property: an assembly **references**
existing bodies; it does not copy their geometry. A body remains editable on its own, and a
change to its timeline invalidates anything that measured or moved it.

Nested assemblies are deliberately excluded from the first version. Composition can be added
later by allowing `CadAssemblyNode` to appear in `bodyIds`-like `memberIds`, but that requires
a placement-composition rule and a cycle check, and neither is needed to prove the model.

## How joints reference two bodies

```ts
type CadJoint = {
  id: string
  kind: 'fixed' | 'revolute' | 'prismatic' | 'cylindrical' | 'spherical'
  bodyA: string        // cad-body node id
  bodyB: string        // cad-body node id
  anchor: [number, number, number]   // metres, assembly space
  axis: [number, number, number]     // unit vector, assembly space
  limits?: { min: number; max: number }   // radians or metres by kind
  driver?: { kind: 'constant'; value: number } | { kind: 'sweep'; from: number; to: number; seconds: number }
}
```

Rules that follow from the rest of the codebase:

- **Node ids, not names.** Boolean operations already use `toolBodyIds`; names are presentation.
  A joint payload sent to the helper carries the same closure as a regenerate: every body, its
  sketches, and the assembly placement.
- **Joint kinds map to catalog commands, not to raw JSON.** A named `joint_create` action should
  accept the typed schema above and the helper should translate it to `joint.create`. That keeps
  the passthrough closed for the same reason inspection does.
- **The helper rebuilds the assembly into one document.** `inspect.*` already proves the pattern:
  replay each member's timeline under a stable name (`PistolaBody1`, `PistolaBody2`, …), then run
  one command. `joint.create` needs the same document, so the existing
  `inspection_commands`-style builder generalises to `assembly_commands`.
- **Validation lives in the editor before the job is sent.** Two distinct bodies, an axis that is
  not zero, and member bodies that have operation histories. Imported STEP bodies would need a
  separate insert path, exactly as inspection does now.

## Is a motion study scene state or a transient query?

Both, split at the seam between definition and result:

- **The study definition is scene state.** It belongs on the assembly (`motion: { durationSeconds,
  fps, drivers: [...] }`) so the scene saves it, the user can edit it, and a regenerate replays
  the same study. Without this, "the simulation I ran yesterday" is unreproducible.
- **The sampled result is transient.** A study produces per-frame transforms. Those are large,
  derivable, and meaningful only until a member changes. They belong in a query result
  (`motion_play` returning frames through the assistant's `data` channel, like inspection), not
  in the serialized scene. Persisting samples would duplicate the timeline rule that already
  caused one silent-data-loss bug class.

A middle option — cache the last run with a hash of member operations — is worth considering for
the UI, but it is an optimisation, not the model.

## What this implies for the operations timeline

Joints are not geometry. They must not be appended to `CadBodyNode.operations`: the helper
replays that timeline as SolidCraft commands, and `joint.create` would run once per body rather
than once per pair. The assembly is the unit that owns joints and motion, and its jobs are
separate named job types (`joint_create`, `motion_study`, `motion_play`, …) rather than
`regenerate` payload extensions.

Contact sets are the same shape: they reference two bodies and are scene state, not a body
operation. `material.assign` is different again — it is a property of one body, so it belongs on
`CadBodyNode` (a material card carried through regenerate), not on an assembly.

## What is still missing after this

Even with joints and motion, Pistola would have **kinematics, not FEA**. SolidCraft supplies
material cards and mass properties; nothing in its catalog solves stress, thermal or modal
problems. Real FEA needs an external solver (CalculiX, Elmer, or a hosted equivalent) and a
meshing/boundary-condition pipeline. That is a separate project and should not be smuggled in
as "physical materials".

## Suggested order

1. `CadAssemblyNode` + `joint_create` + `joint_list` (static joints, no motion). Proves the
   container and the document-rebuild path.
2. `motion_study` (persisted definition) + `motion_play` (transient frames).
3. Contact sets, then material cards on `CadBodyNode`.
4. Structural frames only if a real workflow asks for them; they overlap with custom profiles
   rather than the solid timeline.

Each step follows the inspection pattern: typed action → one fixed helper job type → tests at the
helper boundary, and the raw passthrough stays closed.
