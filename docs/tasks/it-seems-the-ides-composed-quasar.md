# IDE Direct Control of Pistola: plan

## Context

IDE agents (Claude Code, Codex, Cursor, Antigravity, WorkBuddy AI) run far stronger models than
Pistola's in-app Assistant, which plans through a free OpenRouter model. Today an IDE asked to
build something in Pistola tends to hand the request to that chat (`pistola_chat`,
`pistola_plan`, `pistola_agent`, `/api/assistant/plan`), so the weak model does the thinking.

**Outcome:** any IDE plans the model itself and drives Pistola directly with typed, validated
actions. This must work on three targets:
- a local fork (`http://127.0.0.1:3002`);
- https://pistola.canner.app;
- https://pistola-cad-studio-893c13.uset182.chatgpt.site.

The in-app Assistant stays for people who choose it, but it is never part of an IDE's execution
route. Every IDE build is tracked by a checkbox plan, ticked only with evidence.

**Relation to Codex's work.** A concurrent Codex session is building the Codex-only foundation
(`docs/tasks/TASK-codex-direct-control.md`): the operator-plan store, `window.pistola.taskPlan`,
the read-only "IDE plan" panel, and the browser-agent workflow. The user chose to **extend it after
Codex finishes**, so nothing here touches Codex's files until its acceptance gate is ticked.

**What exploration found**
- **Only Cursor is wired** (`.cursor/mcp.json`). Codex, Claude Code, Antigravity and WorkBuddy
  have no MCP config.
- **Claude Code never loads the project instructions.** `editor/CLAUDE.md` and
  `editor/.claude/CLAUDE.md` contain only the text "AGENTS.md", so `editor/AGENTS.md` is ignored.
- **The MCP server offers AI and direct tools side by side.** Its 19 tools
  (`editor/tooling/pistola-mcp/src/index.ts`) mix AI-backed and deterministic ones with no warning,
  and `pistola_execute` skips destructive confirmation.
- **The MCP server only reaches the page through an in-memory HTTP bridge**
  (`apps/editor/lib/workspace-bridge.ts`, `WorkspaceBridge.tsx`). It works locally, fails on Sites
  (no CORS) and is unverified on Canner.
  - `WorkspaceBridge.tsx:127-129` runs `actions` without the destructive check.
  - `:185` sends any unknown command type to `/api/assistant/plan`.
- **Stale instructions still send agents to the chat:** `.agents/skills/ide-orchestration/SKILL.md`,
  `.agents/skills/pistola-features/SKILL.md:14`, `editor/SETUP.md:154`, `pistola-learnings`,
  `actions-cookbook.md:79-83`.
- **Creation power is weaker than it looks.**
  - `lib/cad/local-kernel.ts` fakes the `build_cad_solid` booleans (union concatenates meshes;
    difference and intersection use bounding boxes; extrude holes only lower the volume).
  - The spec grammar is missing from `manual()`.
  - The `validate()` error indexes are wrong (`execute.ts:812-829`, `agent-api/index.ts:90-95`).
  - CAD bodies have no bounds, primitives are hidden and have no colour, and a recipe has a parent
    offset bug.
  - `WorkspaceMenuBar.tsx:264/309/394/404` dispatches actions that don't exist.

## Key decisions

1. **One page-level entry point.** Add `window.pistola.invoke(method, args)` with an allowlist and
   an `apiVersion`. MCP, the bridge and IDE browsers all call it, so validation, the 25-action limit
   and `confirmDestructive` are enforced in one place.
2. **Browser transport for every target.** `pistola-mcp` gains a Playwright driver that launches or
   attaches (over CDP, bound to 127.0.0.1) to a dedicated Chrome profile, opens the target URL, and
   calls `window.pistola.invoke` via `page.evaluate`.
   - The HTTP bridge stays as `PISTOLA_TRANSPORT=bridge` for local dev.
   - The MCP runs on **Node ≥22.18** (native TypeScript), not Bun, because Playwright's CDP hangs
     under Bun.
3. **Deterministic tools by default.** AI-backed tools are hidden unless
   `PISTOLA_MCP_ASSISTANT_TOOLS=1`, and are renamed `pistola_assistant_*` with descriptions that say
   they use Pistola's in-app model.
4. **One canonical instruction source**, `.agents/skills/pistola-direct-control/SKILL.md`. The new
   `scripts/ide-setup.mjs` generates each IDE's rule file from it and has a `--check` mode.
5. **Real CSG in the browser** (works on static Sites). Spike `manifold-3d` (lazy WASM) against
   `three-bvh-csg` (already a dependency of `packages/core`), then replace the fake booleans. If the
   WASM fails to load, cuts return an error instead of fake geometry.
6. **The checklist below becomes the tracking document.** It is copied verbatim to
   `docs/tasks/TASK-ide-direct-control.md` as the first task and ticked as work lands.

## Ticking rules (copied into the task doc header)

- Change `- [ ]` to `- [x]` only after the item is implemented **and** verified. Append
  `— evidence: <command> → <result>`, or link a file under `docs/tasks/evidence/ide-direct-control/`.
- Tick a phase checkpoint only when all its tasks are ticked and its checkpoint commands pass.
- A blocked item stays `[ ]` with `BLOCKED: <reason>`. If a re-run fails, untick it.
- `scripts/validate-task-evidence.mjs` fails on any `[x]` without evidence.
- The shared folder is used by other sessions: never `git stash`, `reset --hard`, switch the whole
  tree or `add -A`. Stage only this phase's files, and commit once per phase.

## Checklist

### Phase 0: Preconditions
- [ ] Codex's `TASK-codex-direct-control.md` acceptance gate is fully ticked and committed; its files
  are no longer being edited.
- [ ] Create `docs/tasks/TASK-ide-direct-control.md` (this checklist plus the ticking rules) and
  `docs/tasks/evidence/ide-direct-control/`.
- [ ] Add `scripts/validate-task-evidence.mjs`.
- [ ] Record baselines: `bun test apps/editor/lib`, `bun run check-types`, `bun run smoke:sites`.

### Phase 1: Page API hardening
Files: `packages/editor/src/lib/agent-api/index.ts`, `lib/assistant/execute.ts`,
`lib/operator-plan/operator-plan.ts`, `lib/assistant/agent-tools.ts`,
`lib/viewer-state/get-node-bounds` (or wherever `getNodeBounds` lives).
- [ ] Add `window.pistola.invoke(method, args)` with an allowlist (manual, inspect, getNodes,
  measure, searchCatalog, listRecipes, workspace, validate, run, waitForIdle, undo, redo,
  `taskPlan.*`) and `apiVersion`.
- [ ] Fix `validate()` so every error carries its real action index, type and hint.
- [ ] Validate `build_cad_solid` specs with `CadSolidSpecSchema` (`lib/cad/solid-spec.ts`) during
  `validate`, with path-level errors.
- [ ] Add the solid-spec grammar, the primitive ids, rotation units (radians), the extrude axis and
  the parent-relative nesting rule to `manual()`.
- [ ] `taskPlan.create` refuses to replace an unfinished plan unless `replace: true`.
- [ ] Add plan sources `claude-code`, `cursor`, `antigravity`, `workbuddy`.
- [ ] Node bounds support CAD bodies (from `metadata.bbox` plus position).
- [ ] Checkpoint: `bun test` on agent-api, operator-plan and execute; `bun run check-types`.

### Phase 2: Transports
Files: `tooling/pistola-mcp/src/index.ts`, new `drivers/browser.ts` and `drivers/bridge.ts`,
`apps/editor/components/editor/WorkspaceBridge.tsx`, `apps/editor/lib/workspace-bridge.ts`,
`app/api/workspace/command/route.ts`.
- [ ] Add a `PageDriver` interface. Share the Chromium loader from
  `editor/scripts/sites-static-smoke.mjs` as a helper.
- [ ] Browser driver:
  - launch or attach over CDP (`PISTOLA_BROWSER_CDP_URL`, or launch Chrome with
    `--remote-debugging-port=9333 --remote-debugging-address=127.0.0.1`, a dedicated
    `%LOCALAPPDATA%/pistola/browser-profile`, and flags that stop background throttling);
  - select the target from `PISTOLA_TARGET` = `local` | `canner` | `sites` | any URL;
  - reuse or open the tab and wait for `data-pistola-agent="ready"`;
  - detect sign-in and report "sign-in required". The agent never types credentials.
- [ ] Take screenshots with `bringToFront()` + `page.locator('canvas').first().screenshot()`,
  returned as MCP image content.
- [ ] Add a network audit that counts requests to forbidden routes: `/api/assistant/*`,
  `/api/ai/test`, `/api/cad/brief`, POST `/api/mac/jobs`, `openrouter.ai`, `api.openai.com`.
- [ ] Bridge:
  - add `{type:'api', method, args}`, routed through `invoke`;
  - send `actions` through `run` with the destructive check;
  - make the prompt path an explicit `type:'assistant_prompt'`;
  - reject unknown types (remove the `:185` fallthrough).
- [ ] Add `playwright` to `tooling/pistola-mcp/package.json`. The code runs under Node with
  type-only TypeScript and `.ts` import extensions.
- [ ] Checkpoint: the new `editor/scripts/ide-direct-control-e2e.mjs` (an MCP client over stdio)
  passes `--target local` and `--target sites`.

### Phase 3: Tool surface
- [ ] Default tools:
  - session: `pistola_status` (target, `apiVersion`, forbidden-request count), `pistola_open`,
    `pistola_manual` (filters);
  - reads: `pistola_inspect`, `pistola_get_nodes`, `pistola_measure`, `pistola_search_catalog`,
    `pistola_list_recipes`;
  - actions: `pistola_validate`, `pistola_run` (`confirmDestructive` defaults to false);
  - view and history: `pistola_screenshot`, `pistola_undo`, `pistola_redo`, `pistola_wait_idle`,
    `pistola_camera`.
- [ ] Task tools: `pistola_task_create`, `_get`, `_run_step`, `_update_step` (validation and
  observation steps only), `_complete`, `_undo`, `_clear`. Never use the `pistola_plan*` prefix,
  which belongs to the AI tool.
- [ ] Keep `pistola_execute` as a deprecated alias of `pistola_run`, including the destructive check.
- [ ] Hide the AI tools behind `PISTOLA_MCP_ASSISTANT_TOOLS=1` and rename them `pistola_assistant_*`.
  Their descriptions start "[Uses Pistola's in-app AI model, not the IDE's model]".
- [ ] Rewrite `tooling/pistola-mcp/README.md`, covering all tools, targets and env variables.
- [ ] Checkpoint: `tools/list` with and without the flag; a destructive action without confirmation
  is rejected; an unknown bridge type is rejected.

### Phase 4: IDE wiring and instructions
- [ ] Canonical `.agents/skills/pistola-direct-control/SKILL.md`, covering:
  - the route order: MCP `pistola_*`, then IDE browser calling `window.pistola.invoke`, then stop;
  - chat routes are forbidden;
  - a checkbox `taskPlan` before any mutation;
  - the loop `inspect → validate → run step → wait → inspect/screenshot → tick`;
  - honest reporting.
- [ ] **Claude Code:**
  - root `.mcp.json` (`command: "node"`, `editor/tooling/pistola-mcp/src/index.ts`,
    `PISTOLA_TARGET` env);
  - `.claude/settings.json` with `enabledMcpjsonServers: ["pistola"]`;
  - root `CLAUDE.md` = `@agents.md @rules.md @editor/AGENTS.md`;
  - `editor/CLAUDE.md` and `editor/.claude/CLAUDE.md` become `@AGENTS.md`;
  - the `editor/.claude/rules/*.md` stubs become `@` imports;
  - `.claude/skills/pistola-direct-control/SKILL.md` (generated).
- [ ] **Codex:** add `[mcp_servers.pistola]` to `.codex/config.toml` (node, args,
  `startup_timeout_sec=30`, `tool_timeout_sec=300`, `env_vars`). Keep
  `project_doc_fallback_filenames`.
- [ ] **Cursor:** in `.cursor/mcp.json`, switch to `node` with `${workspaceFolder}/...` and drop the
  unused env. Generate `.cursor/rules/pistola-direct-control.mdc` (`alwaysApply: true`).
- [ ] **Antigravity:**
  - `.agents/mcp_config.json`;
  - `.agents/rules/pistola-direct-control.md`;
  - `.agents/workflows/pistola-build-model.md`;
  - fallback: `ide-setup` merges an absolute entry into `~/.gemini/config/mcp_config.json`, with a
    backup first.
- [ ] **WorkBuddy AI:** `ide-setup` merges an absolute entry into `~/.workbuddy-ai/mcp.json` (with a
  backup) and installs the skill in `~/.workbuddy-ai/skills/pistola-direct-control/`. Verify whether
  a project-level `.workbuddy/mcp.json` is honoured.
- [ ] `scripts/ide-setup.mjs`: generates the rule files from the canonical skill, merges user-level
  configs non-destructively, and has `--check`, which `scripts/validate-agent-foundation.ps1` calls.
- [ ] Remove the chat routing from:
  - `.agents/skills/ide-orchestration/SKILL.md`
  - `.agents/skills/pistola-features/SKILL.md:14`
  - `references/execution-surfaces.md`
  - `references/actions-cookbook.md:79-83`
  - `.agents/skills/pistola-learnings/SKILL.md`
  - `editor/SETUP.md:154`
  - `.agents/skills/pistola-studio/SKILL.md` (add `taskPlan`)
- [ ] Checkpoint:
  - `validate-agent-foundation.ps1` and `node scripts/ide-setup.mjs --check` pass;
  - the MCP shows as connected in each IDE (`claude mcp list`, `codex mcp list`, and the MCP panels
    in Cursor, Antigravity and WorkBuddy).

### Phase 5: Exact CSG
Files: new `packages/editor/src/lib/cad/manifold-kernel.ts`, `lib/cad/local-kernel.ts`,
`lib/assistant/execute.ts`, both `next.config.ts`, `apps/editor/public/vendor/manifold/`.
- [ ] Spike `manifold-3d` against `three-bvh-csg` on 5 reference specs (holed plate, hollow cup,
  hull ∩ box, mirrored bracket, polar array). Record volume error, closedness and bundle size as
  evidence, then pick one.
- [ ] Implement the chosen kernel:
  - lazy load;
  - `evaluateCadSolidSpec` becomes async (its caller at `execute.ts:1152` is already async);
  - map box, cylinder, sphere, extrude (with real holes) and revolve;
  - `union` / `subtract` / `intersection`, mirror and arrays;
  - transforms applied in the order scale → rotate X/Y/Z → translate;
  - free every WASM object.
- [ ] Delete the approximations (`local-kernel.ts:266-270`, `321-371`). If the WASM fails to load,
  difference and intersection return an explicit error.
- [ ] Checkpoint:
  - `bun test local-kernel.test.ts` with exact analytic volumes;
  - `bun run build:sites`;
  - `bun run smoke:sites` loads the WASM with zero console errors.

### Phase 6: Creation gaps
- [ ] List `primitive-*` items in `searchCatalog` and the manual. Add an optional `color` to
  `place_item` / `update_item_properties` and render it.
- [ ] Document parent-relative nesting. Fix the recipe `parentId` world-coordinate offset in
  `recipes/creation-recipes.ts`.
- [ ] Replace the non-existent actions in `WorkspaceMenuBar.tsx:264,309,394,404` with
  `duplicate_target`, `focus_camera_on_nodes`, `create_level` and `camera_top_view`.
- [ ] Align the WebMCP batch schema (50) with the 25-action limit (`WebMcpSceneTools.tsx:39`).
- [ ] Checkpoint: tests for each fix; `bun run check-types`; `bun run lint` on the touched files.

### Phase 7: Hosted targets and release
- [ ] Deploy to Canner, then confirm `pistola_status` on `PISTOLA_TARGET=canner` shows the new
  `apiVersion`, the signed-in profile works and the e2e script passes.
- [ ] Rebuild Sites (`build:sites`, `smoke:sites`, package) and publish a new Sites version (owner
  account `uset82@gmail.com`), then run the e2e script with `--target sites`.
- [ ] If an old deployment lacks `invoke`/`taskPlan`, the agent stops and reports. It never falls
  back to chat.

### Acceptance gate
- [ ] For each target (local, Canner, Sites), the e2e script builds a toy sailboat (hull, keel,
  mast, sail):
  - 0 forbidden requests;
  - every plan step `done` with evidence;
  - inspect finds ≥4 bodies;
  - a screenshot is saved.
- [ ] Claude Code, Codex, Cursor, Antigravity and WorkBuddy each complete the same prompt to the
  same bar, and each one's MCP log shows only default tools.
- [ ] The in-app Assistant still works for a person using it.
- [ ] `bun run check-types`, `bun test`, `build:sites` and `smoke:sites` all pass;
  `validate-task-evidence.mjs` passes.

## Reuse
- **Execution:** `createPistolaAgentApi`, `taskPlan` and the operator-plan store (Codex's work);
  `validateAssistantPlan` and `executeAssistantPlan` (`lib/assistant/execute.ts`);
  `executeAgentTool` (`lib/assistant/agent-tools.ts`).
- **CAD spec:** `CadSolidSpecSchema` (`lib/cad/solid-spec.ts`).
- **Browser:** the Chromium loader and serve logic in `editor/scripts/sites-static-smoke.mjs`.
- **Plan UI:** `OperatorPlanPanel.tsx` (read-only mirror); the `data-pistola-agent="ready"` signal
  from `AgentApiBridge`.
- **Bridge and CSG:** the existing bridge routes and `requireRouteAuthSession`; `three-bvh-csg`
  (already in `packages/core`).

## Verification
- **Per phase:** the checkpoint commands above, pasted as evidence into the task doc.
- **End to end:** `node editor/scripts/ide-direct-control-e2e.mjs --target local|sites|canner`
  starts the MCP over stdio exactly like an IDE, runs the sailboat plan, and asserts zero forbidden
  requests from the Playwright network log. It saves screenshots and the plan JSON under
  `docs/tasks/evidence/ide-direct-control/`.
- **Per IDE:** a manual run of the same prompt, with evidence being the IDE's tool log and the
  Pistola "IDE plan" panel screenshot.

## Risks
- Bun and Playwright's CDP don't work together; mitigated by running the MCP on Node.
- The CDP port gives full control of the browser, including the Canner session; mitigated by
  binding to localhost and using a dedicated profile.
- Old deployments won't have `invoke`/`taskPlan` until Phase 7; the agent stops rather than
  falling back to chat.
- Whole-plan undo is lost on reload, and plan storage is per origin.
- The Antigravity and WorkBuddy project-level config paths are unverified; the absolute-path
  installer is the fallback.
- zod v4 JSON Schema export of the recursive spec may be lossy; mitigated by the hand-written
  grammar in `manual()`.
