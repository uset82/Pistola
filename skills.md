# Pistola Skills

## Purpose

This file defines Pistola's capability model. Skills are reusable workflows that agents can invoke consistently across IDEs and sessions.

In this repository:

- `skills.md` is the capability catalog and governance reference.
- concrete reusable skills now live under `.agents/skills/<skill-name>/SKILL.md`.

## Skill design standard

All Pistola skills should follow the Agent Skills model:

- one skill per directory
- one `SKILL.md` file with required `name` and `description`
- optional `scripts/`, `references/`, and `assets/` directories
- narrow scope and clear trigger conditions
- progressive disclosure so metadata stays small and detailed references are loaded only when needed

Recommended repository layout:

```text
.agents/
  skills/
    idea-intake/
      SKILL.md
    scene-decomposition/
      SKILL.md
    pascal-node-mapping/
      SKILL.md
    execution-planning/
      SKILL.md
    scene-validation/
      SKILL.md
    ide-orchestration/
      SKILL.md
    export-readiness/
      SKILL.md
    mac-cad-generation/
      SKILL.md
    pistola-studio/
      SKILL.md
    pistola-image-to-blueprint/
      SKILL.md
    pistola-features/
      SKILL.md
    pistola-visual-critique/
      SKILL.md
    pistola-learnings/
      SKILL.md
```

Current status:

- `idea-intake` implemented
- `scene-decomposition` implemented
- `pascal-node-mapping` implemented
- `execution-planning` implemented
- `ide-orchestration` implemented
- `scene-validation` implemented
- `export-readiness` implemented
- `mac-cad-generation` implemented
- `pistola-studio` implemented
- `pistola-image-to-blueprint` implemented
- `pistola-features` implemented
- `pistola-visual-critique` implemented
- `pistola-learnings` implemented

## Foundational skill catalog

### 1. `idea-intake`

Use when:

- the user provides a natural-language prompt
- the user uploads a rough sketch or reference image
- the task needs a structured design brief before implementation

Expected outputs:

- object summary
- style and material summary
- dimensions or scale assumptions
- ambiguity list
- acceptance criteria

### 2. `scene-decomposition`

Use when:

- a concept must be broken into primitives, assemblies, and hierarchy
- a complex object needs a stepwise modeling strategy

Expected outputs:

- scene graph outline
- ordered modeling steps
- reusable components list
- constraints and dependencies

### 3. `pascal-node-mapping`

Use when:

- a scene concept must be translated into the `pascalorg/editor` node model
- a feature needs to map onto `core`, `viewer`, or `editor` responsibilities

Expected outputs:

- node-type mapping
- affected packages and files
- state mutations and system touchpoints
- integration risks

### 4. `execution-planning`

Use when:

- a scene plan needs to become deterministic implementation work
- the agent must sequence edits, validations, and fallback paths

Expected outputs:

- implementation plan
- validation checklist
- rollback or fallback notes

### 5. `ide-orchestration`

Use when:

- the task concerns how VS Code, Codex, Antigravity, Qoder, or similar IDEs drive the modeling workflow
- the user flow between chat, preview, and iteration needs to be defined

Expected outputs:

- prompt contract
- interaction loop definition
- ownership split between chat UI and scene runtime

### 6. `scene-validation`

Use when:

- geometry, hierarchy, naming, or runtime behavior must be checked
- the agent needs to verify that the generated result is buildable and reviewable

Expected outputs:

- validation result
- defects or inconsistencies
- performance and correctness notes

### 7. `export-readiness`

Use when:

- a scene or model is being prepared for downstream use
- the task requires a prototype-ready handoff for games, printing, demos, or continued editing

Expected outputs:

- export assumptions
- compatibility notes
- known limitations

### 8. `mac-cad-generation`

Use when:

- the user wants an advanced mechanical / printable part from natural language
- FreeCAD sketch/extrude is insufficient and Multi-Agent-CAD should run

Expected outputs:

- MAC job + STEP/GLB artifacts
- `cad-body` import with `metadata.cadEngine = 'mac'`
- QA / repair summary when available

### 9. `pistola-studio`

Use when:

- the user asks to generate, create, make, or build a 3D object or scene
- a concept image should be approved before modeling

Expected outputs:

- approved concept and ortho sheet
- built scene that matches the concept
- side-by-side review and library lesson

### 10. `pistola-image-to-blueprint`

Use when:

- an approved concept or reference image must become measured parts

Expected outputs:

- schema-valid blueprint JSON
- traced silhouettes in meters

### 11. `pistola-features`

Use when:

- a blueprint must become Pistola actions
- the host's CAD/MAC limits or execution surface must be chosen

Expected outputs:

- action batches
- fallbacks and host limits

### 12. `pistola-visual-critique`

Use when:

- a viewport screenshot must be compared with the approved concept

Expected outputs:

- pass/fail
- ranked fix list mapped to blueprint parts

### 13. `pistola-learnings`

Use when:

- a delivered build should be saved for reuse
- a non-obvious Pistola workaround should be recorded

Expected outputs:

- `.agents/library/objects/<slug>.json`
- updated `INDEX.md` and `LEARNINGS.md`

## Skill governance

- A skill defines procedure, not authority. Authority stays in `rules.md`.
- A skill should never redefine agent roles from `agents.md`.
- If a workflow is repeated more than once, convert it from prompt text into a real skill under `.agents/skills`.
- If a skill needs external systems, document those dependencies explicitly before implementation.

## Priority order for implementation

Implement skills in this order:

1. `idea-intake`
2. `scene-decomposition`
3. `pascal-node-mapping`
4. `execution-planning`
5. `scene-validation`
6. `ide-orchestration`
7. `export-readiness`

## Standards references

- OpenAI Codex skills: https://developers.openai.com/codex/skills
- OpenAI customization model: https://developers.openai.com/codex/concepts/customization
- Agent Skills specification: https://agentskills.io/specification
- Agent Skills repository: https://github.com/agentskills/agentskills
