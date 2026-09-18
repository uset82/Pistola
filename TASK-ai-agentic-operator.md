# `TASK-ai-agentic-operator.md` — Pistola Assistant Agentic Operator

> **Operating Contract**
> - Change `- [ ]` to `- [x]` immediately when a task is verified complete.
> - Do not claim this milestone done until the agent can observe the scene via tools, build/modify arbitrary 3D content, and operate identically via the panel and IDE MCP agents.
> - Keep the deterministic router for instant 0ms/0-cost commands; use the agentic operator loop for open-ended, complex, and observation-dependent tasks.
> - Keep 25 actions per execute call and strict per-turn budget bounds (12 rounds, 150 actions max, 5 min wall clock).
> - Every mutating turn must be single-click undoable; destructive actions remain review-gated.
> - Never return a fake success when an action failed or nothing changed.

## Historical Context

- `TASK-ai-full-creation.md` (completed 2026-03-25) is retained as historical context.

## Summary

The chat must be able to build or change *anything* the editor can represent, and IDE agents must have the same power. This task transforms the single-shot regex-routed assistant into an agentic operator loop with a unified capability registry, general primitives, compound recipes, observation/measurement tools, and MCP parity.

## Phase 0 — Baseline and Truth

- [x] Confirm the dirty tree state with the user (commit/stash guidance; no destructive git without direction) and record the baseline: `bun run check-types`, `bun run lint`, targeted `bun test` for assistant files, `bun run acceptance:assistant`.
- [x] Add a "create anything" fixture corpus to `editor/apps/editor/lib/assistant-acceptance-fixtures.ts` (30–50 prompts EN/ES): general objects (lamp, bookshelf, car proxy, tree, sphere 0.5m), compound assemblies, appearance edits ("make the sofa red"), inspection questions ("how big is this room"), multi-step builds that need observation ("put a window on the longest wall"), asset import, camera focus, unsupported asks. Record current outcome and failure class per fixture (router / planner / action-surface / primitive-gap / executor / timeout).
- [x] Add a coverage audit script (`editor/scripts/assistant-coverage-audit.mjs`) that lists command palette entries (`packages/editor/src/components/ui/command-palette/index.tsx`), tool ids (`tool-manager.tsx`, `tool-surface.ts`), store setters (`store/use-editor.tsx`, `store/use-cad.ts`, viewer store), and panel `updateNode(`/`deleteNode(` call sites, and diffs them against `assistantActionTypeValues`. Output becomes the Phase 1 gap list.

## Phase 1 — Capability Registry and Coverage Gate

- [x] Create `editor/packages/editor/src/lib/assistant/capabilities/` with `defineCapability({ type, domain, schema, safeImmediate, destructive, validate, execute, describe, examples, aliases: { en, es } })` and one module per domain (workspace, viewer, structure, furnish, transform, cad, history/export). Migrate existing types/validators/executors from `types.ts`/`execute.ts` into the registry incrementally; `types.ts` keeps exporting the same union/constants (derived from the registry) so `assistant-ai-provider.test.ts` and `types.test.ts` keep passing.
- [x] Add `packages/editor/src/lib/assistant/capabilities/coverage.test.ts` that fails when an audited surface item has no capability and is not in an explicit `manualOnlyAllowlist` with a reason (auth, feedback dialog, keyboard-shortcut dialogs, etc.).
- [x] Generate planner-facing documentation (action list, enums, examples) from the registry and replace the hand-maintained strings in `assistant-ai-provider.ts`; move `buildDeterministicAssistantTurn` and its EN/ES normalizers into `apps/editor/lib/assistant/router/*.ts` by domain (pure move, behavior-preserving, covered by existing tests).
- [x] Close the concrete surface gaps the audit finds; known already: `create_site`, `create_building`, `focus_camera_on_nodes` (fit selection), `add_cad_sketch_entities` (line/rect/circle/arc/polyline into a sketch), `set_cad_sketch_plane`, `reparent_node`, `set_node_metadata` (bounded keys), collections/presets operations if they mutate the scene.
- [x] Checkpoint: `check-types`, `lint`, existing assistant tests green, coverage test green with a documented allowlist.

## Phase 2 — Agentic Operator Loop

- [x] New server module `editor/apps/editor/lib/assistant-agent/` : `tools.ts` (tool JSON schemas derived from the registry plus read tools), `step.ts` (one provider round: messages + tool results → provider call → normalized `tool_calls | final`), provider adapters using native tool calling for OpenAI Responses, OpenRouter (OpenAI-compatible), Gemini function calling; Codex initially falls back to the single-shot planner (note: later option is a Codex thread with `pistola-mcp` tools).
- [x] Route `POST /api/assistant/agent/step` (auth via `requireRouteAuthSession`, same error classification as `app/api/assistant/plan/route.ts`). Request: prompt, chatMode, transcript, toolResults, budgets, shaped workspace context (`shapeAssistantPlanningContext`). Response: `{ kind: 'tool_calls', calls[] } | { kind: 'final', turn: AssistantTurnResult }`.
- [x] Client tool fulfillment in `editor/packages/editor/src/lib/assistant/agent-tools.ts` (pure functions over `useScene`/`useViewer`/`useEditor`, no UI): read tools `inspect_scene` (filter by level/type/name/bbox, paginated summaries via `summarizeAssistantNode`), `get_nodes`, `measure` (bounds, distance, wall length, zone area via `lib/space-detection.ts`, free floor space), `search_catalog`, `list_capabilities`, `list_recipes`, `get_workspace_state`; write tools `validate_actions` (dry-run through `validateAssistantPlan`), `execute_actions` (through `executeAssistantPlan` with `reviewConfirmed` per policy, returns created ids, warnings, errors), control tools `ask_user`, `finish`.
- [x] Loop driver `apps/editor/lib/assistant-agent/run-agent-turn.ts` used by both the panel and `WorkspaceBridge.tsx`: captures one undo snapshot at turn start, enforces budgets (default 12 tool rounds, 25 actions per execute, 150 actions per turn, 5 min wall-clock, stop button), applies destructive-review policy (pause loop and show review card; resume on confirm), converts `finish`/`ask_user` into the existing `AssistantTurnResult` shape so review cards, undo, session memory and messages keep working.
- [x] Routing rule in `createAssistantTurnResult` and `AiAssistantPanel.tsx`: deterministic router first; if it yields nothing or the request is an observation/inspection ask or complex create, use the agent loop when the provider supports tools; otherwise legacy single-shot. Timeout fallbacks unchanged.
- [x] Panel UX: streaming step timeline (tool name, short observation, executed actions), Stop, and the existing "undo last assistant turn". No new chat modes.
- [x] Tests: unit tests for tool fulfillment (fixtures scenes), step normalization per provider (mocked responses), budget enforcement, review pause/resume, rollback on failure, and recipe tests (`bun test lib/assistant-agent lib/creation-recipes.test.ts` passing 13/13).

## Phase 3 — Open-Ended Creation Building Blocks

- [x] Core schema (`packages/core`): extend `ItemNode.asset.primitive` to `box | sphere | cylinder | cone | torus | capsule | wedge` with per-primitive params; extend CAD wire entities with `heart`, `board`, `airfoil`, `ellipse`, `bspline`. Zod defaults keep old scenes valid.
- [x] Viewer (`packages/viewer`): procedural geometry in the item renderer for all primitives, material application, and the extended CAD preview; verify selection/registry/spatial-grid behave with scaled primitives.
- [x] FreeCAD worker (`freecad_worker.py`): Parametric wires (`_heart_wire`, `_board_wire`, `_airfoil_wire`, `_ellipse_wire`, `_bspline_wire`) and `_chain_loose_edges` tolerance closing. Validated via `FreeCADCmd.exe` producing watertight solids.
- [x] New capabilities (`packages/editor`): `create_primitive`, `create_compound`, `set_node_appearance`, `import_asset`, `register_catalog_item`, `focus_camera_on_nodes`, `add_cad_sketch_entities`.
- [x] Panel/inspector parity: the item panel edits appearance through the same builders so manual and assistant paths stay identical.
- [x] Tests: schema back-compat, renderer smoke via existing patterns, builders/executors, bilingual deterministic routes.

## Phase 4 — Compositions, Recipes, and Generator Adapters

- [x] Recipe library `packages/editor/src/lib/assistant/recipes/` : parametric builders returning validated actions (heart, board, airplane, robot_arm, humanoid_robot, car, table, chair, drone, rocket). Hierarchical parent-child assembly pattern (`refId: '$ref_root'`, `parentId: '$ref_root'`).
- [x] Action `create_from_recipe` / `create_compound` plus `list_recipes` read tool and `listCreationRecipes()` export so the agent and MCP discover them; recipes are also usable by the deterministic router (0ms/0-cost execution).
- [x] Approximation policy in the system prompt: prefer catalog match → recipe → compound of primitives → CAD brief (prismatic) → MAC (engineered part) → explicit limitation. Every approximation states assumptions.
- [ ] Optional generator adapter interface `apps/editor/lib/assistant-agent/generators/` (`generateMesh(prompt) → GLB url`) with MAC as the first implementation; an external text-to-3D provider (for example a Mint MCP or hosted API) can be added later behind the same interface. Tradeoff to surface before adopting: network dependency, cost, licensing, non-editable meshes. Not required for this plan's acceptance.
- [x] MAC import improvement: derive preview dimensions from the returned GLB bounds instead of the fixed placeholder box.

## Phase 5 — IDE Agent Parity (MCP)

- [x] Extend `editor/tooling/pistola-mcp/src/index.ts` with read tools backed by the live tab through the workspace bridge: `pistola_inspect_scene`, `pistola_get_nodes`, `pistola_measure`, `pistola_search_catalog`, `pistola_list_capabilities`, `pistola_list_recipes`; add `pistola_agent` (runs the Phase 2 loop end-to-end and streams step results), keep `pistola_execute`/`pistola_chat`. Bridge changes: new `read` command kind and `agent` command kind in `workspace-bridge.ts` and `WorkspaceBridge.tsx` fulfilled by `agent-tools.ts` and `runAgentTurn`.
- [x] Tool descriptions are generated from the capability registry and recipe catalog so MCP, planner prompt, and executor never drift. Output and timeline results preserved across SSE bridge.

## Phase 6 — Evaluation, Reliability, and Trust

- [ ] Extend `editor/scripts/assistant-acceptance.mjs` with the Phase 0 corpus and an offline replay mode (recorded provider tool-call transcripts) so CI does not need live keys; add an online smoke subset. Gate: 100% of deterministic fixtures, ≥90% of agent fixtures, and zero "fake success" (a fixture fails if the final turn claims completion while `execute_actions` reported errors or no mutating action ran).
- [ ] Telemetry: per-turn provider, rounds, actions, latency, failure class (extend `classifyAiFailure` in `ai-provider-shared.ts`), logged server-side and summarized in the panel debug view.
- [ ] Reliability: tool-result size shaping (pagination, truncation with hints), provider-specific retry only for transient errors, deterministic fallback on timeout, idempotent re-execution guards using `$ref` maps across rounds.
- [ ] Manual browser pass (extend `assistant-smarter-browser-check.mjs`): build a furnished room, then "add a red sphere on the table", "make the sofa blue", "import this GLB", "put a window on the longest wall", "build a small car", "how big is the kitchen", stop mid-build, undo last turn, same flow from MCP.

## Phase 7 — Documentation and Governance

- [ ] Update `editor/AGENTS.md` (AI Assistant Boundary: registry, agent loop, tool fulfillment ownership), `mainidea.md` (operator loop and approximation policy), `skills.md` + new `.agents/skills/assistant-capability-registration/SKILL.md` (how to add a capability, required tests), `rules.md` if budgets/safety defaults become policy.
- [x] Materialize this plan as `TASK-ai-agentic-operator.md` at repo root using the existing checklist convention (`- [ ]` items, checkpoints, acceptance gate) so follow-up sessions can track progress; mark `TASK-ai-full-creation.md` as historical context there.

## Acceptance Gate

- [ ] "Create a red sphere 0.5 m on the table" builds a primitive parented/placed correctly without remote planning.
- [ ] "Build a small bookshelf with 4 shelves" produces an editable compound (recipe or primitives) with stated assumptions.
- [ ] "Make the sofa blue" and "hide all windows on level 2" execute via registry capabilities against resolved targets.
- [ ] "Put a window on the longest wall of the living room" requires observation: the agent inspects/measures, then places the window; the step timeline shows the inspection.
- [ ] "Import <glb url> as a lamp" creates an item with measured dimensions and it is reusable by name in the next prompt.
- [ ] "Build a small car" yields a proxy compound or MAC part with explicit approximation notes; never a fake success.
- [ ] The same six requests succeed through `pistola_agent` from an IDE agent with the editor tab open.
- [ ] Coverage test blocks merging any new palette command/tool/panel mutation without a registered capability.
- [ ] Every mutating turn is undoable with one action; destructive steps still honor the review policy; budgets stop runaway loops.
- [ ] `check-types`, `lint`, targeted tests, and `acceptance:assistant` (offline replay) pass.
