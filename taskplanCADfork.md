# FreeCAD Fork Integration Plan

## Summary
- [x] Bring the FreeCAD fork **into this monorepo** as a git submodule at `freecad/`, the same way `editor/` holds the pascalorg/editor base. Pistola is built on top of both projects and they must live together.
- [x] Use the **Codex SDK** (`@openai/codex-sdk`) as the orchestration layer that connects both foundations. The Codex SDK already powers the assistant planning loop; it must also drive CAD planning so a single AI brain can reason across the editor scene graph and FreeCAD operations in one thread.
- [x] Keep Pistola's CAD boundary intact: `cad-helper/main.py` remains the runtime adapter, `_helper.ts` remains the app-side launcher/proxy, and `contracts.ts` stays the public editor/helper contract.
- [x] Phase 1 is Windows-first and only covers real FreeCAD-backed `sketch_to_solid`, `extrude`, `revolve`, `regenerate`, `import_step`, and `export_step`. Boolean, fillet, and chamfer stay disabled or explicitly deferred.

## Tracking Checklist

### 1. Fork And Submodule Setup
- [x] Create a GitHub fork of [FreeCAD/FreeCAD](https://github.com/FreeCAD/FreeCAD) and set remotes as `origin=uset82/FreeCAD` and `upstream=FreeCAD/FreeCAD`.
- [x] Add the fork as a git submodule at `freecad/` inside this monorepo (`git submodule add https://github.com/uset82/FreeCAD.git freecad`).
- [x] Establish one reproducible Windows build path that produces `FreeCADCmd.exe` from `freecad/`.
- [x] Record the exact branch, commit, and build/bootstrap steps used for Pistola integration. (main @ `a56ef7d8f964191834f82389d7dd1f72d6be5d5f`)
- [x] Update `.gitmodules` and repo README/setup docs so contributors can `git submodule update --init` to get both foundations.

### 2. Codex SDK As Unified Orchestration Layer
Currently the assistant planning path uses `@openai/codex-sdk` (`requestCodexTurn` in `assistant-ai-provider.ts`) but CAD brief planning (`cad-ai-provider.ts`) only uses raw OpenAI/OpenRouter. Both should go through the Codex SDK so a single Codex thread can see the full monorepo context -- `editor/` scene architecture AND `freecad/` CAD capabilities -- and plan across both.

- [x] Add a `codex` provider option to `cad-ai-provider.ts`, mirroring how `assistant-ai-provider.ts` already supports `provider: 'codex'`.
- [x] Wire `requestCodexCadBrief` using the same `Codex` / `startThread` / `resumeThread` / `thread.run()` pattern, with the monorepo root as `workingDirectory` so the Codex agent can read both `editor/` and `freecad/` source trees.
- [x] Pass the CAD brief output schema to `thread.run({ outputSchema })` so the Codex agent returns structured `CadBrief` JSON, just as the assistant already returns structured `AssistantTurnResult`.
- [x] Allow a shared Codex thread between assistant planning and CAD planning so the AI retains context across scene edits and CAD operations within the same session.
- [x] Keep OpenAI/OpenRouter as fallback providers when the Codex SDK is unavailable or when `PISTOLA_CAD_AI_PROVIDER` is explicitly set to `openai` or `openrouter`.
- [x] Add `PISTOLA_CAD_AI_PROVIDER=codex` as the default when `OPENAI_API_KEY` is set, matching the assistant provider behavior.

### 3. Helper Runtime Conversion
- [x] Default `FREECAD_PATH` in `cad-helper/.env` to the build output inside the `freecad/` submodule (e.g. `freecad/build/bin/FreeCADCmd.exe`); allow override for custom builds.
- [x] Add helper startup validation that fails fast if `FREECAD_PATH` is missing or invalid.
- [x] Replace `engine: freecad-stub` health reporting with real FreeCAD engine/version/build metadata.
- [x] Add a FreeCAD bridge layer that runs operation scripts through `FreeCADCmd.exe` subprocesses.
- [x] Keep the current FastAPI service shape and job routes unchanged while swapping the placeholder operation backend for real FreeCAD execution.

### 4. Real Core Operations
- [x] Replace placeholder `sketch_to_solid`, `extrude`, `revolve`, and `regenerate` jobs with real FreeCAD Part/Sketcher execution.
- [x] Make `regenerate` rebuild from `cad-body` operation history plus the linked `cad-sketch`, not from placeholder preview data.
- [x] Replace placeholder `import_step` with actual STEP load plus shape interrogation from FreeCAD.
- [x] Replace placeholder `export_step` with real STEP export from the generated or imported FreeCAD document.
- [x] Persist real `.FCStd` CAD artifacts for every successful core job.
- [x] Generate real `.glb` preview artifacts from FreeCAD shape tessellation so the existing viewer path can render helper output without a viewer contract rewrite.

### 5. Editor And Runtime Integration
- [x] Keep the existing CAD job vocabulary and `CadBodyNode` / `CadSketchNode` schemas stable for phase 1.
- [x] Ensure the editor prefers real preview artifacts and only falls back to primitive previews when the helper explicitly returns no renderable preview.
- [x] Keep the mock helper behind explicit opt-in only; default local runtime must be the Python helper pointed at the FreeCAD fork build.
- [x] Update helper/runtime UI to distinguish real `freecad` from mock/stub states and surface actionable missing-build errors.
- [x] Keep advanced tools hidden or disabled until their helper operations are real.

### 6. Codex Thread Continuity Across Editor And CAD
- [x] When a user prompt leads to both scene actions (assistant path) and CAD operations (CAD brief path), pass the same `codexThreadId` so the Codex agent maintains context across both planning calls.
- [x] Store the active `codexThreadId` in the editor session state so it persists across assistant turns, CAD briefs, and refinement loops within the same editing session.
- [x] On `New Chat`, reset the `codexThreadId` to start a fresh Codex thread (matching the existing assistant behavior).

## Public Interfaces
- [x] `FREECAD_PATH` becomes a required helper runtime input and points to `FreeCADCmd.exe`. (already enforced in `freecad_runtime.py`)
- [x] `PISTOLA_CAD_AI_PROVIDER` gains `codex` as a valid value (alongside `openai`, `openrouter`, `fallback`). When set to `codex`, CAD brief planning uses the Codex SDK with the monorepo as working directory.
- [x] `/health` keeps the same shape (`status`, `runtime`, `engine`, `version`, `helperUrl`) but must report actual FreeCAD values instead of stub labels. (already in `freecad_runtime.py build_helper_health_payload`)
- [x] CAD job request/response shapes stay stable in phase 1; the implementation changes behind them.
- [x] Successful core jobs must return real `previewUrl` or `previewArtifactRef` and `cadArtifactRef`, plus STEP export refs where applicable. (requires FreeCAD build)

## Test Plan
- [x] Codex SDK CAD planning: a `provider: 'codex'` CAD brief request returns a valid structured `CadBrief` through the Codex thread.
- [x] Codex thread continuity: assistant planning and CAD brief planning on the same `codexThreadId` produce coherent, context-aware results.
- [x] Codex fallback: when `PISTOLA_CAD_AI_PROVIDER` is not `codex`, CAD planning still works through OpenAI/OpenRouter as before.
- [x] Helper unit tests: each core job returns `succeeded`, emits a real `.FCStd`, and emits a renderable `.glb` or a deliberate no-preview result only when justified.
- [x] Helper startup tests: invalid `FREECAD_PATH` fails clearly and valid setup reports real engine metadata from `/health`.
- [x] Editor validation: `bun run check-types` in `editor/packages/editor` and `editor/apps/editor`.
- [x] Manual Windows smoke: create sketch, extrude, regenerate, revolve, import STEP, and export STEP.
- [x] Manual viewer validation: resulting `cad-body` renders from helper artifact URLs instead of placeholder primitives.
- [x] Manual failure validation: missing FreeCAD build, bad STEP input, and failed job execution produce clear runtime/UI errors without silent mock fallback.

## Assumptions And Defaults
- [x] Integrated submodule model chosen: FreeCAD lives at `freecad/` inside the monorepo as a git submodule, mirroring how `editor/` holds pascalorg/editor. Both foundations are part of the same project.
- [x] Codex SDK as orchestration glue: the same `@openai/codex-sdk` that powers assistant planning also powers CAD planning. The Codex agent sees the full monorepo (`editor/` + `freecad/` + `cad-helper/`) as its working directory, enabling it to reason about both the editor scene graph and FreeCAD capabilities when generating CAD briefs.
- [x] The `cad-helper/` boundary remains the runtime adapter between the editor and FreeCAD; the submodule provides the build source, not a vendored library.
- [x] Windows-first chosen: phase 1 only needs one reliable Windows build path; cross-platform support is later.
- [x] Core CAD only chosen: booleans, fillet, and chamfer are deferred until the core loop is stable.
- [x] Upstream references for the fork/build path are [FreeCAD/FreeCAD](https://github.com/FreeCAD/FreeCAD), [FreeCAD/FreeCAD-addons](https://github.com/FreeCAD/FreeCAD-addons), and the [FreeCAD Developers Handbook](https://freecad.github.io/DevelopersHandbook/).
- [x] Stop condition: if building from source blocks phase 1, first prove the helper against `FreeCADCmd.exe` from the submodule checkout before attempting deeper fork patches.