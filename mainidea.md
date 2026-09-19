# Pistola

## Main Idea

Pistola is an AI-native 3D modeling workflow built on top of [pascalorg/editor](https://github.com/pascalorg/editor) and [FreeCAD/FreeCAD: Official source code of FreeCAD, a free and opensource multiplatform 3D parametric modeler.](https://github.com/FreeCAD/FreeCAD)

[pascalorg/editor: Create and share 3D architectural projects.
](https://github.com/pascalorg/editor)[FreeCAD/FreeCAD: Official source code of FreeCAD, a free and opensource multiplatform 3D parametric modeler.](https://github.com/FreeCAD/FreeCAD) 

[FreeCAD/FreeCAD-addons: A convenient gathering of useful and well-developed FreeCAD plugins made by the community.](https://github.com/FreeCAD/FreeCAD-addons)

Its purpose is simple:

**turn an idea, prompt, or rough sketch into a usable 3D prototype or project in minutes.**

Instead of forcing the user to manually model everything with traditional 3D tools, Pistola keeps an always-on AI assistant inside the editor and IDE workflow. The assistant can help with plain chat, scene planning, tool control, spatial edits, item placement, and CAD generation. It interprets intent, translates it into scene logic and editor operations, and updates the 3D workspace in real time.
Specific, non-destructive requests should execute immediately with rollback and a short status summary, instead of stalling in a review-heavy chat loop.

mix of

## Product Thesis

Pistola is not just a chatbot attached to a viewer. It is a bridge between:

- AI-assisted intent capture
- structured scene planning
- real editor execution
- rapid visual iteration

CAD is one capability inside that assistant, not the only chat surface.

The user should be able to say:

- "Create a futuristic sports car with oversized rear wheels."
- "Turn this sketch into a clean hard-surface prototype."
- "Make this object more rounded and production-ready."

And the system should respond by producing an editable 3D result, not just text.

## Core Vision

Pistola makes 3D creation accessible to people who can describe what they want but do not want to model every object by hand.

The long-term ambition is broad:

- support a wide range of 3D models and scenes
- let users iterate conversationally
- reduce the distance between concept and executable prototype
- make the IDE a serious 3D creation environment

## Why `pascalorg/editor`

`pascalorg/editor` already provides the runtime foundation Pistola needs:

- a browser-based 3D editor
- scene structure and node systems
- rendering and interaction primitives
- an extensible editor architecture

Pistola builds on that foundation by adding AI interpretation, planning, and orchestration.

## User Experience Loop

1. **Describe**The user writes a prompt or shares a simple design reference.
2. **Interpret**The AI converts the request into a structured scene brief with assumptions, geometry intent, and constraints.
3. **Plan**The system decomposes the request into editor-compatible modeling steps.
4. **Execute**Pistola applies those steps through the editor runtime.
5. **Preview**The 3D scene updates inside the IDE workflow.
6. **Refine**
   The user continues by chat: adjust shape, scale, materials, details, or composition.

## Initial Product Principles

- Chat first, but not chat only: every prompt should lead toward an actual editable scene.
- Keep model authority with the surface the user addressed: IDE agents such as Codex plan and execute typed Pistola actions directly; they do not relay their prompts through the in-app Assistant or its provider.
- Mirror IDE work as a verified phase-and-step checklist beside the viewport so progress is visible without making the Pistola Assistant the planner.
- Keep the assistant available in every editor phase, not just one modeling mode.
- Keep the assistant explicitly mode-aware: `Ask` for explanation, `Create` for build-first behavior, and `Refine` for editing the current or recent result.
- Prefer operator behavior over chatbot behavior: execute clear requests immediately, summarize briefly, and only ask for clarification when geometry or targeting is genuinely missing.
- Keep assistant-only session controls separate from scene controls: `New Chat` resets stale assistant context without deleting the user's geometry or selection.
- Keep composer assistance local, fast, and non-destructive: suggestions and autocomplete help the user write better prompts, but they never auto-send or mutate the scene.
- Fast iteration matters more than one-shot perfection.
- The output must stay understandable and modifiable.
- The system should explain assumptions when the prompt is underspecified.
- The workflow should remain compatible with multiple AI-native IDEs, not one vendor surface.

## Mission

**From idea to prototype / project.**

That is the standard Pistola should optimize for in every design and implementation decision.
