---
name: pistola-visual-critique
description: Compare a Pistola viewport screenshot against the approved concept image and blueprint, then return a ranked, actionable fix list with pass or fail. Use after each build round in pistola-studio, or whenever someone asks whether a Pistola model matches its reference.
---

# Visual Critique

Judge the render against the **approved concept and the blueprint's `acceptance` list**, not against personal taste. Every finding must be fixable with Pistola actions, or be explicitly marked as a platform limit.

## Inputs

- The concept image, and the ortho sheet if one exists.
- One or more renders. Ask for a view matching the concept angle, plus the side view, if only one render was given.
- The blueprint JSON (part ids, sizes, acceptance checks).
- The feature plan's fallback notes, so a documented fallback is not reported as a bug.
- Optionally a focus: `silhouette` for proportions, outline and part placement, or `details` for colors, small parts and readability.

## Check, in order

1. **Silhouette and proportions:** overall length, width and height ratios; the taper and outline of the main body; each acceptance check, marked pass or fail with an estimated number.
2. **Parts:** every blueprint part is present, and none is extra, floating, sunk into another part or clipping out.
3. **Placement:** parts sit on the right parent at the right spot (front, back, top), and symmetry holds.
4. **Color and material:** part colors match the palette. If color is not supported on the host, note it once as a platform limit instead of repeating it per part.
5. **Readability:** at thumbnail size, would the user recognize the object from the concept?

## Output (JSON)

```json
{
  "verdict": "pass | fail",
  "score": 0-100,
  "acceptance": [{ "check": "...", "status": "pass|fail", "measured": "~2.1x (target 2.5x)" }],
  "fixes": [
    { "priority": 1, "part": "hull", "problem": "bow is square in top view; concept tapers to a point",
      "fix": "replace hull box with profile-extrude of traced top view, or add a primitive-wedge bow",
      "actions": [ { "type": "update_item_properties", "nodeId": "<id>", "scale": [0.16, 0.08, 0.32] } ] }
  ],
  "platform_limits": ["per-item color not supported on this host"]
}
```

## Rules

- Return at most 5 fixes, most visible first. The builder fixes those, and the next round finds the rest.
- `pass` means score ≥ 80 with no failing silhouette check. Don't pass a build just because the round limit is close.
- Prefer patches (`update_item_properties`, `move_target`) over rebuilding. Recommend a rebuild only when the shape strategy itself is wrong.
- When two critics run in parallel, stay inside your assigned focus so the fix lists don't overlap.
