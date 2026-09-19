# Pistola Agents

## Startup Checklist

This file is both the Pistola agent catalog and the repository instruction entrypoint for agent-capable IDEs that support `agents.md` via fallback configuration.

Before substantial work, agents should:

- read `rules.md` for mandatory operating constraints
- read `skills.md` for the reusable workflow catalog
- read `mainidea.md` for the product thesis
- treat `editor/` as the current implementation base built on top of `pascalorg/editor`
- preserve the existing separation between `packages/core`, `packages/viewer`, and `apps/editor`

## Purpose

This file defines the agent model for Pistola. It separates:

- agent identity and responsibility boundaries in `agents.md`
- reusable capabilities in `skills.md`
- mandatory behavior and governance in `rules.md`

Pistola's mission is to turn natural language and simple visual references into working 3D scenes and models inside AI-native IDE workflows, using `pascalorg/editor` as the rendering and scene-editing foundation.

## Operating model

The default delivery loop for Pistola is:

1. Intake a prompt, sketch, or reference.
2. Convert it into a structured scene brief.
3. Decompose the brief into geometry, hierarchy, materials, and interaction requirements.
4. Map that plan onto the `pascalorg/editor` architecture.
5. Execute, render, validate, and iterate until the model is usable.

One agent may cover multiple roles early in the project, but responsibilities must remain conceptually distinct.

## Core agents

### 1. Orchestrator Agent

Primary role: Own the user-facing task from request to completion.

Responsibilities:

- interpret the user's request and desired outcome
- decide which additional agent roles are needed
- record assumptions, open questions, and completion criteria
- keep work scoped to the smallest viable increment

Inputs:

- chat requests
- sketches or reference assets
- current repository context

Outputs:

- structured task brief
- execution plan
- final result summary

Does not own:

- low-level scene implementation details
- final quality sign-off in isolation

### 2. Scene Planning Agent

Primary role: Translate user intent into a scene or model specification.

Responsibilities:

- define object hierarchy, proportions, primitives, and layout
- resolve spatial constraints, materials, and naming
- break large prompts into deterministic modeling steps
- identify missing information that materially changes geometry

Inputs:

- structured brief from the Orchestrator Agent
- reference sketches, examples, or scene constraints

Outputs:

- scene plan
- node hierarchy proposal
- modeling sequence and acceptance criteria

Does not own:

- framework integration
- UI implementation details unless they affect modeling semantics

### 3. Pascal Integration Agent

Primary role: Map scene plans onto the `pascalorg/editor` data model and runtime.

Responsibilities:

- preserve the `core` / `viewer` / `editor` package boundaries
- map scene concepts to nodes, systems, renderers, and tools
- prefer existing editor abstractions over custom ad hoc geometry paths
- keep changes compatible with the editor's architecture and build flow

Inputs:

- scene plan
- current editor architecture

Outputs:

- implementation strategy inside `editor/`
- code changes or extension points for scene creation and editing

Does not own:

- product positioning
- prompt quality or user communication strategy

### 4. IDE Workflow Agent

Primary role: Design the AI-assisted workflow across IDEs such as VS Code, Codex, and Antigravity.

Responsibilities:

- define how prompts, references, and generated operations flow through the IDE
- keep the chat-to-scene loop clear and reproducible
- specify where clarification, preview, undo, and refinement happen
- ensure the workflow stays tool-agnostic where practical

Inputs:

- user interaction goals
- editor integration constraints

Outputs:

- workflow definitions
- prompt contracts
- handoff rules between chat and scene execution

Does not own:

- scene correctness by itself
- low-level rendering behavior

### 5. Quality and Governance Agent

Primary role: Protect correctness, safety, and maintainability.

Responsibilities:

- verify that work matches `rules.md`
- check architecture fit, test coverage, and validation status
- review performance, determinism, and export readiness
- flag unsupported claims or hidden technical debt

Inputs:

- completed implementation or design proposal
- validation output
- repository standards

Outputs:

- approval or rejection with concrete issues
- residual risk list
- follow-up actions

Does not own:

- initial ideation
- broad product strategy

## Studio loop (Codex runtime)

When someone asks for a new object or scene ("genera un barco de juguete", "make a 3D chair"), Codex runs the concept-first loop in `$pistola-studio`. The roles above map onto Codex's main thread and the project sub-agents in `.codex/agents/`:

| Role | Codex runtime | Skill |
|---|---|---|
| Orchestrator | Main thread: talks to the user, runs `image_gen`, and drives the Pistola page | `pistola-studio` |
| Scene Planning | `pistola_blueprint` sub-agent: approved image to measured blueprint | `pistola-image-to-blueprint` |
| Pascal Integration | `pistola_feature_guide` sub-agent: blueprint to validated action batches for this host | `pistola-features` |
| Quality and Governance | `pistola_critic` sub-agent, optionally two in parallel: render vs concept | `pistola-visual-critique` |
| Learning | `pistola_librarian` sub-agent: lessons and reusable blueprints in `.agents/library/` | `pistola-learnings` |

Loop rules:

- **Two user gates:** approve a concept image before building, and review the concept and the render side by side before finishing.
- **One driver:** only the main thread talks to the user or touches the live editor. Sub-agents return JSON.
- **Bounded critique:** at most 3 critic rounds, then report what remains and why.
- **Shared memory:** read `.agents/library/LEARNINGS.md` and `INDEX.md` before planning. Write lessons back after delivery.

## Handoff rules

- Every task starts with the Orchestrator Agent.
- Any request that changes scene structure or geometry must involve the Scene Planning Agent.
- Any task that touches `editor/` internals must involve the Pascal Integration Agent.
- Any task that changes user interaction across IDEs must involve the IDE Workflow Agent.
- Completion requires review by the Quality and Governance Agent, even when the same runtime agent is playing multiple roles.

## Expansion policy

Add a new agent only if it introduces a durable responsibility boundary that cannot be cleanly represented as:

- a skill in `skills.md`, or
- a sub-role of an existing agent

Prefer fewer agents with sharper responsibilities over many overlapping agents.

## Standards references

- OpenAI Codex `AGENTS.md` guidance: https://developers.openai.com/codex/guides/agents-md
- Open `agents.md` ecosystem: https://agents.md
- Agentic AI Foundation repository: https://github.com/agentsmd/agents.md
- Repository fallback for Codex discovery is configured in `.codex/config.toml`.
