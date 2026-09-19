# Codex Agent Access for Pistola (CAD, MAC, Architecture, Chatbox)

## Context
Codex (GPT-5.6 / Sol in the Codex app) drives Pistola through its built-in browser. Today it can only type prompts into the in-app chat, and that creates a lot of friction:

- **A weak model re-plans every request.** Each prompt goes to `/api/assistant/plan`, where a free OpenRouter model plans it again. The result is slow and misroutes often, and on the ChatGPT Sites export it fails with "Failed to fetch".
- **Plans roll back.** Compound primitive builds fail with `Asset "Box" cannot be placed at the requested floor position` (`packages/editor/src/lib/assistant/builders.ts:763`). The floor grid (`canPlaceOnFloor`, 2D XZ with 0.5 m cells) ignores height. Only the boat recipe sets `allowOverlap`. `parentId: $ref_root` is ignored by `resolveItemPlacement` (`builders.ts` ~585-671), so parts never nest. Every recipe spawns at `[0,0,0]`, so running one twice collides.
- **Hosted geometry is fake.**
  - `app/api/cad/_mock.ts` turns any extrude into a bounding box and any revolve into a cylinder.
  - `app/api/mac/_mock.ts` returns an empty STEP file and a placeholder box.
  - The `cad-body` preview (`packages/core/src/schema/nodes/cad-body.ts:5`) only supports `box`, `cylinder` and `extruded-profile`.
- **Runtimes are wired inconsistently.** The chat panel's `assistantRuntime` (`AiAssistantPanel.tsx` ~L1190) has CAD brief, CAD prompt and MAC support, with CAD parented to the `cad-space` root. `WorkspaceBridge.tsx` has no `runCadPrompt` and parents CAD to a level. The Sites WebMCP tools only have MAC. `executeAgentTool('execute_actions')` has none of them.
- **There is no usable agent surface.** No `window` API exists. WebMCP (`apps/sites/components/webmcp-scene-tools.tsx`) is Sites-only and inert without `navigator.modelContext`, which Chrome 152 lacks. It also advertises a non-existent `create_cad_sketch`. There is no agent manual, and the MCP bridge is localhost-only.

**Goal:**
- Codex becomes the planner: it sends validated actions straight to the page executor, with no in-app LLM and no server round-trip.
- Every feature works (architecture, furnish, CAD solids, MAC-style parts, recipes) with real geometry on **both** pistola.canner.app and the Sites export.
- The chatbox stays on OpenRouter, with good paid models.

User choices: Codex app + its browser · OpenRouter paid models for the chatbox · both deploys equally.

## Phase 0: Quick friction fixes (ship first, small)
- **Shared runtime factory.** New `packages/editor/src/lib/assistant/runtime.ts` exports `createAssistantRuntime({ cadParent })` with `executeCadBrief`, `runCadPrompt` and `generateMacPart`.
  - Extract the logic from the panel's `assistantRuntime`, including the cad-space root parenting (`apps/editor/lib/cad-brief-executor.ts`, `packages/editor/src/lib/mac/generate-part.ts`).
  - Use it in `AiAssistantPanel.tsx`, `WorkspaceBridge.tsx`, `webmcp-scene-tools.tsx` and `agent-tools.ts` `execute_actions`.
- **Assemblies.**
  - `resolveItemPlacement` should honor `parentId` when it points at an item, so parts nest under the root part.
  - `placeItem` skips the floor-collision check when the item has an item parent, or when its asset is `primitive-*` placed with an explicit `position` whose y > 0.
  - `allowOverlap` stays available to force it.
  - Recipes place their root at a free floor spot near the view center instead of `[0,0,0]`.
- **Recipe fix:** `board` in `recipes/creation-recipes.ts` emits an entity the executor doesn't support. Change it to a polyline or rectangle.
- **Readable errors:** `use-cad` `getCadHelperUnavailableMessage` should also map the browser's "Failed to fetch".

## Phase 1: In-page Agent API (core)
New `packages/editor/src/lib/agent-api/index.ts` exports `createPistolaAgentApi()`. All methods are async and return JSON-serializable values, so an agent can read them from a browser-eval call.

| Method | Reuse |
|---|---|
| `manual()` | `z.toJSONSchema` over `capabilities/registry.ts` `getAllCapabilities()` (`describe`, `examples`, `safeImmediate`, `destructive`), plus the workflow rules: always pass explicit `levelId` / `nodeId` / `bodyId` (sequence validation rejects implicit-target drift) and use `$ref_N` for new nodes |
| `inspect(q?)`, `getNodes(ids)`, `measure()`, `searchCatalog(q)`, `listRecipes()` | `executeAgentTool` (`packages/editor/src/lib/assistant/agent-tools.ts`), `getAssistantWorkspaceContext` (`context.ts`) |
| `validate(actions)` | `validateAssistantPlan` (`execute.ts:772`). Errors are shaped as `{ index, type, message, hint }` |
| `run(actions, { confirmDestructive? })` | `executeAssistantPlan(actions, { reviewConfirmed: true, runtime: createAssistantRuntime() })` (`execute.ts:1313`). Returns `{ ok, errors, createdNodeIds, refMap, bodyIds, sketchIds, warnings, rolledBack }` |
| `runRecipe(name, params)` | `CREATION_RECIPES` / `generateActions` |
| `waitForIdle(timeoutMs)` | Resolves once no `cad-body` is `pending`/`running` and no MAC job is in flight (`use-cad`, `CadBodyRuntimeSystem`) |
| `undo()`, `redo()` | `useScene.temporal` |
| `screenshot()` | Viewer canvas `toDataURL('image/png')`, so Codex can check its work visually |

Destructive actions (`delete_*`, `clear_level_contents`, `shell_cad_body`) require `confirmDestructive: true`.

## Phase 2: Surfaces for Codex
1. **`window.pistola`**
   - Installed by a small `AgentApiBridge` component mounted in `apps/editor/components/editor/PistolaWorkspaceShell.tsx`, which is shared by Canner and Sites.
   - It's same-origin only and grants nothing the UI can't already do. It never returns API keys.
   - It sets `data-pistola-agent="ready"` on `<html>` once the scene loads, so Codex can wait for it.
2. **Chatbox direct commands** for click/type agents and humans. Extend `submitPrompt` (`AiAssistantPanel.tsx`, next to the `/model` and `/undo` parsing):
   - `/run` followed by JSON or a ```json block, `/validate …`, `/inspect`, `/recipe <name> {json}`, `/cad {spec}`, `/manual`
   - They run locally with no LLM and no fetch. The result is posted as a compact JSON message with `data-testid="assistant-last-result"`, and the input and send button get stable `data-testid`s.
3. **WebMCP:** move the tools into the shared shell as thin wrappers over the agent API (full set). Descriptions come from the registry, which removes the bogus `create_cad_sketch`. They stay a progressive enhancement.
4. **Manual and skill:**
   - A build script generates `public/agents/manual.json` and `public/llms.txt` from the registry. Both are static, so they work in the Sites export.
   - Add a `/agents` page.
   - New `.agents/skills/pistola-browser-agent/SKILL.md`, linked from `agents.md` and `editor/AGENTS.md`. Loop: wait for `data-pistola-agent` → `manual()` → `inspect()` → `validate()` → `run()` → `waitForIdle()` → `screenshot()` → fix or `undo()`.
   - Update the `ide-orchestration` skill to point to it.

## Phase 3: Real geometry in the browser (both deploys)
- **Kernel:** add `manifold-3d` (mesh CSG, WASM, Apache-2.0) as `packages/editor/src/lib/cad/local-kernel.ts`. Lazy-load it with dynamic `import()` and the WASM via `new URL(..., import.meta.url)`, which works in the Next static export. It builds a spec and returns `{ positions, indices, volume, bbox }`.
- **New action `build_cad_solid { name?, spec, position?, color? }`**, a declarative tree with no code execution, registered as a capability. Node types:
  - Primitives: `box{size}`, `cylinder{r, h, r2?}`, `sphere{r}`
  - Profiles: `extrude{polygon, holes?, height}`, `revolve{profile, angle?}`
  - Operations: `union[...]`, `difference[...]`, `intersection[...]`, `mirror`, `linearArray` / `polarArray`
  - Every node takes optional `translate` / `rotate` / `scale`.
- **Storage:** add `CadBodyPreview` variant `primitive: 'mesh'` holding the **spec**, which is small and parametric. `cad-body-renderer.tsx` builds and caches the mesh client-side.
- **Regeneration:** in `cad-body-runtime-system.tsx`, when the CAD helper runtime is `mock` or unreachable, extrude, revolve and boolean bodies are regenerated with the local kernel instead of `createCadJob`. The real FreeCAD helper stays preferred where it exists (fillets, STEP).
- **Export:** STL/GLB through three.js exporters. STEP stays helper-only (a documented limitation).
- **MAC:**
  - On mock hosts, `generate_mac_part` returns a clear "MAC runtime unavailable here; use `build_cad_solid`" error instead of a silent placeholder box.
  - Where the real helper runs, it accepts optional agent-written build123d `code`, which skips MAC's internal free-model LLM (`tooling/mac-helper/mac_runner.py`).

## Phase 4: Chatbox on OpenRouter paid models
- Derive the recommended models from the live catalog (`lib/openrouter-model-catalog.ts`) by family prefix: `openai/gpt-5*`, `anthropic/claude-sonnet*`, `google/gemini-2.5-flash*`. This replaces the stale hardcoded list and the `/model` shortcuts.
- Default to a recommended paid model when the key has credits, using the `/key` info from `app/api/ai/test/route.ts`. `openrouter/free` becomes a fallback only.
- Persist the chosen model per browser (localStorage).
- Teach `ASSISTANT_SYSTEM_PROMPT` (`lib/assistant-ai-provider.ts`) about `build_cad_solid`, assembly `parentId` and explicit ids, so the chatbox also produces real geometry.

## Deferred / out of scope
- `/api/workspace/*` CORS and `PATCH`, SSE reconnect churn in `WorkspaceBridge.tsx`, production MCP auth.
- The `agent/step` codex provider and the missing `tool` messages.
- The hosted API is open to anyone because it has no auth DB. Set `POSTGRES_URL` and `BETTER_AUTH_SECRET` separately.

## Coordination
The Codex session is editing `assistant-ai-provider.ts`, `AiAssistantPanel.tsx` and `creation-recipes.ts` in this same working tree.
- Do this work in a separate git worktree or branch.
- Land each phase as its own commit or PR. Phase 0 and Phase 1 mostly touch new files and `builders.ts`.
- Rebase before touching the panel.

## Verification
- **Unit tests** (bun test):
  - `createAssistantRuntime` wiring
  - assembly nesting and no false collisions (boat, car and chair recipes run twice without rollback)
  - agent-api `validate` / `run` / `undo` / `waitForIdle`
  - `manual()` covers every registered action
  - chat `/run` parsing
  - local-kernel volumes against analytic values (box, cylinder, extrude with a hole, revolve, difference)
  - `build_cad_solid` spec validation
- **Type check:** `bun run check-types` in `editor/apps/editor`.
- **Browser E2E** on a local build, the Sites export (`bun run build:sites && bun run smoke:sites`) and pistola.canner.app after deploy:
  - `window.pistola.manual()` returns the schemas.
  - `run()` builds a boat from nested primitives.
  - `build_cad_solid` makes a heart and a holed bracket with real meshes, not boxes.
  - `/run` works in the chatbox with the network offline.
  - `screenshot()` returns a PNG.
- **Acceptance:** Codex, using only the new skill, builds "un barco de juguete", "un corazón 3D 2×2.5×0.5 m" and a small house with a door and window on both deploys, with no in-app LLM calls.
