# Integrated PistolaCodex Control Plane Plan

## Summary
- [ ] Treat `editor/` as the actual product repo and integrate FreeCAD there, not as a loose sibling workspace.
- [ ] Add `FreeCAD` as a git submodule at `editor/third_party/FreeCAD`.
- [ ] Make the Codex SDK assistant the single AI control plane for chat, scene planning, tool control, spatial edits, item placement, and CAD execution.
- [ ] Keep Pistola auth app-managed; users may register with the same email they use for OpenAI, but there is no OpenAI/ChatGPT SSO.
- [ ] Ship v1 with real FreeCAD-backed `sketch_to_solid`, `extrude`, `revolve`, `regenerate`, `import_step`, and `export_step`; defer boolean, fillet, chamfer, and add-ons.

## Implementation Checklist

### 1. Repo And Runtime Layout
- [ ] Add `editor/.gitmodules` and mount `FreeCAD` at `editor/third_party/FreeCAD`.
- [ ] Move the current Python CAD helper into the tracked repo at `editor/tooling/freecad-helper` so assistant, app, helper, and FreeCAD source live under one checkout.
- [ ] Update app launcher/runtime discovery so `apps/editor` starts the tracked helper from `editor/tooling/freecad-helper`, not from the loose top-level workspace path.
- [ ] Set the default Windows FreeCAD executable path to `editor/third_party/FreeCAD/build/bin/FreeCADCmd.exe`, with env override support.

### 2. Single Codex Control Plane
- [ ] Keep `/api/assistant/plan` as the only AI entrypoint used by the app shell.
- [ ] Remove the assistant UI’s dependency on a separate CAD planner route for normal operation; CAD intent must flow through the Codex assistant path.
- [ ] Keep Codex thread continuity in the assistant session so follow-up CAD and scene commands share the same context.
- [ ] Prompt Codex to emit validated assistant actions for both editor and CAD operations, not prose-only plans.
- [ ] Preserve the current rollback-aware execution model in `packages/editor`: non-destructive requests execute immediately with a short status summary; destructive or ambiguous requests stay review-gated.
- [ ] Keep `run_cad_prompt` only as a backward-compatible internal macro if needed; it must resolve back into the same Codex-driven action pipeline rather than a second LLM control surface.

### 3. FreeCAD-Backed CAD Execution
- [ ] Keep `packages/core` and `packages/viewer` assistant-agnostic; CAD execution remains orchestrated from `packages/editor` and `apps/editor`.
- [ ] Replace stub/helper placeholder CAD execution with real `FreeCADCmd.exe` subprocess jobs from the tracked helper.
- [ ] Keep `cad-sketch` and `cad-body` as the public scene contracts; `cad-body` operation history remains the regeneration source of truth.
- [ ] Persist real `.FCStd` artifacts for successful core CAD jobs and generate renderable preview artifacts consumable by the existing viewer path.
- [ ] Keep `/api/cad/*` as helper proxy/runtime routes for execution and health, but not as a separate AI planning surface.
- [ ] Explicitly return capability-disabled responses for boolean, fillet, chamfer, and add-on-only behaviors until real implementations exist.

### 4. Editor And UX Integration
- [ ] Ensure the always-on assistant panel is the primary operator surface for scene edits and CAD generation.
- [ ] Surface active provider/model/runtime metadata in the panel so the user can tell when Codex and real FreeCAD are active.
- [ ] Keep editor tool buttons and CAD panels usable, but make them share the same underlying execution/store actions as assistant-triggered operations.
- [ ] Preserve undo/rollback semantics and short operator-style completion summaries for immediate actions.
- [ ] Keep advanced CAD tools hidden or disabled until the helper reports those capabilities as real.

### 5. Auth, Docs, And Product Copy
- [ ] Update login/auth copy to say users can sign up with any email, including the same one they use for OpenAI, while Pistola owns authentication.
- [ ] Remove any wording that implies OpenAI account sign-in or OpenAI as the identity provider.
- [ ] Update setup/docs to describe the integrated repo layout: `editor` repo, `third_party/FreeCAD` submodule, tracked helper, Codex assistant as control plane, FreeCAD as execution backend.
- [ ] Document Windows build/bootstrap steps for `FreeCADCmd.exe` from the submodule checkout.

## Public Interfaces / Contract Changes
- [ ] `PISTOLA_ASSISTANT_AI_PROVIDER=codex` becomes the default assistant path for the integrated workflow.
- [ ] `FREECAD_PATH` remains supported but defaults to the submodule build output inside `editor/third_party/FreeCAD`.
- [ ] `apps/editor/app/api/assistant/plan` stays the primary AI route; app code should not require `/api/cad/brief` for standard CAD prompting.
- [ ] `cad-sketch` and `cad-body` schemas stay stable in v1; implementation shifts from placeholder generation to real FreeCAD execution behind the existing contracts.
- [ ] Helper health continues to report `status`, `runtime`, `engine`, `version`, and `helperUrl`, but must reflect real FreeCAD metadata.

## Test Plan
- [ ] Repo/runtime validation: submodule present, helper path resolves inside `editor`, missing FreeCAD build fails with a clear actionable error.
- [ ] Assistant validation: Codex thread reuse across turns, `New Chat` resets thread state, provider/runtime metadata is surfaced correctly.
- [ ] Execution validation: assistant can create scene changes, place items, and trigger supported CAD operations through the same action executor.
- [ ] CAD validation: `sketch_to_solid`, `extrude`, `revolve`, `regenerate`, `import_step`, and `export_step` succeed with real FreeCAD artifacts and renderable previews.
- [ ] Safety validation: non-destructive requests auto-execute with rollback; destructive or ambiguous requests remain review-gated.
- [ ] Editor validation: `bun run check-types` for `editor/apps/editor` and `editor/packages/editor`, focused assistant/CAD tests, and helper-side Python tests.
- [ ] Manual acceptance: sign up with email, open assistant, create or refine a model from chat, issue a CAD command, verify the scene updates in real time, then undo or retry from the same operator loop.

## Assumptions And Defaults
- [ ] The actual versioned codebase remains `editor/`; the loose top-level `pistolacodex` folder is treated as a workspace wrapper, not the canonical git root.
- [ ] FreeCAD is integrated as a submodule inside the existing repo rather than as a separate sibling clone or a vendored source dump.
- [ ] Codex is the orchestration layer; FreeCAD is the CAD execution engine; `pascalorg/editor` remains the scene, viewer, and operator foundation.
- [ ] V1 is Windows-first and core-CAD-only; add-ons and advanced solid editing are explicitly deferred until the integrated core loop is stable.
- [ ] If a requested behavior cannot be executed safely or deterministically, the assistant must explain why, avoid fake success, and preserve rollback/scene integrity.
