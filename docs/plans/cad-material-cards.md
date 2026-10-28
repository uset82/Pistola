# Material cards on CAD bodies

Status: implemented alongside the `assign_cad_material` action. Written before the code, as the
Task 2 brief asked.

## The question

SolidCraft exposes two material commands:

- `material.assign { bodies, material }` — assigns a named material (a built-in such as `Steel`,
  or a design-owned one) to bodies. Its density drives mass.
- `material.properties.directional { card, direction }` — takes a schema-1 engineering material
  card and a material-local direction, and returns Young's modulus along it. It is a
  **read-only constitutive query**: no persistence, no body-axis assignment, no solver.

A material must survive a regenerate, which rebuilds the body from its operation timeline from
scratch in a fresh headless process. So it needs to live somewhere in the Pistola node.

## Decision: a field on `CadBodyNode`, re-applied by the bridge

```ts
type CadBodyMaterial = {
  /** SolidCraft material name, the argument to material.assign. */
  name: string
  /** Schema-1 engineering card, carried verbatim; SolidCraft validates it. */
  card: Record<string, unknown> | null
}
```

`CadBodyNode.material` defaults to `null`, so existing scenes parse unchanged.

**Why a field rather than a timeline operation.** Material is a property of the body, not a step
in making it. The timeline is geometry: every entry is replayed by `operations_to_commands`, is
suppressible, and can be reordered. A `material.assign` operation would inherit all three:

- suppression would silently drop the material;
- reordering would be meaningless, and an assignment before the first feature would target a
  body that does not exist yet;
- boolean recursion rebuilds tool bodies by replaying their timelines, so a material operation
  inside a tool body would run against a `PistolaBodyNTool1` name it never sees.

A field avoids all of that, at the cost of one explicit step: the bridge must re-apply it after
rebuilding the geometry. That step is one command appended to the regenerate script, and it is
covered by a test that fails if it is removed.

**Where the bridge applies it.** `run_regenerate` appends
`material.assign { bodies: [PistolaBody], material: name }` after the geometry commands. Because
the measurement step (`inspect.measure`) then runs in the same document, mass reflects the
assigned material — which is how the test observes that the material took effect, rather than
merely that a command was emitted.

**Why the card is also a field.** SolidCraft does not persist a card on a body: the directional
command is a query, and `material.create/edit` keeps cards on *materials*, not bodies. If Pistola
does not own the card, assigning a card and regenerating would lose the FEA input. The card is
carried verbatim and validated by SolidCraft when the action runs; Pistola does not duplicate the
card validator.

**Direction is a query argument, not state.** Material-local axes in SolidCraft do not assign a
frame to a body, and the direction only selects which modulus to report. The action persists
`{ name, card }` and returns the directional report through the assistant's `data` channel.

## What this does not do

- No structural solver. `material.properties.directional` reports a modulus and a validation
  report; it does not predict stress, displacement or failure.
- No imported-body support. Assigning a material still requires rebuilding the body in the
  helper's fresh document; imported STEP bodies have no operation history to replay, so the
  action refuses them with the same message inspection uses.
- No rendering change. The card is engineering data; appearance remains the existing
  `roughness`/`metalness`/`color` fields.

## Consequences for a future solver

When an external solver (CalculiX, Elmer) is added, the card and the body's material name are
already in the scene and survive regenerate. What is missing is a meshing and
boundary-condition pipeline and the solver itself; none of that is smuggled into this field.
