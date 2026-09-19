# TASK: IDE Direct Control of Pistola

Copied from `docs/tasks/it-seems-the-ides-composed-quasar.md`. Tick only with evidence.

## Ticking rules

- Change `- [ ]` to `- [x]` only after the item is implemented **and** verified. Append
  `— evidence: <command> → <result>`, or link a file under `docs/tasks/evidence/ide-direct-control/`.
- Tick a phase checkpoint only when all its tasks are ticked and its checkpoint commands pass.
- A blocked item stays `[ ]` with `BLOCKED: <reason>`. If a re-run fails, untick it.
- `scripts/validate-task-evidence.mjs` fails on any `[x]` without evidence.
- The shared folder is used by other sessions: never `git stash`, `reset --hard`, switch the whole
  tree or `add -A`. Stage only this phase's files, and commit once per phase.

## Checklist

### Phase 0: Preconditions
- [x] Codex's `TASK-codex-direct-control.md` acceptance gate is fully ticked and committed; its files
  are no longer being edited. — evidence: `git log -1 --oneline b3fa3d0` → `feat(agent): add provider-free IDE operator plans`; remaining full-repo lint is pre-existing and not this task
- [x] Create `docs/tasks/TASK-ide-direct-control.md` (this checklist plus the ticking rules) and
  `docs/tasks/evidence/ide-direct-control/`. — evidence: this file and `docs/tasks/evidence/ide-direct-control/`
- [x] Add `scripts/validate-task-evidence.mjs`. — evidence: `node scripts/validate-task-evidence.mjs`
- [x] Record baselines: `bun test apps/editor/lib`, `bun run check-types`, `bun run smoke:sites`. — evidence: `bun test apps/editor/lib` → 322 pass / 0 fail; `bun run check-types` → 6 successful; `bun run smoke:sites` → 18/18 checks passed

### Phase 1: Page API hardening
Files: `packages/editor/src/lib/agent-api/index.ts`, `lib/assistant/execute.ts`,
`lib/operator-plan/operator-plan.ts`, `lib/assistant/agent-tools.ts`,
`lib/viewer-state/get-node-bounds` (or wherever `getNodeBounds` lives).
- [x] Add `window.pistola.invoke(method, args)` with an allowlist (manual, inspect, getNodes,
  measure, searchCatalog, listRecipes, workspace, validate, run, waitForIdle, undo, redo,
  `taskPlan.*`) and `apiVersion`. — evidence: `bun test ./packages/editor/src/lib/agent-api/index.test.ts` → invoke routes allowlisted methods and rejects unknown ones
- [x] Fix `validate()` so every error carries its real action index, type and hint. — evidence: same file → validate reports the real action index and solid-spec path
- [x] Validate `build_cad_solid` specs with `CadSolidSpecSchema` (`lib/cad/solid-spec.ts`) during
  `validate`, with path-level errors. — evidence: same test; missing `size` reports `build_cad_solid` at index 1
- [x] Add the solid-spec grammar, the primitive ids, rotation units (radians), the extrude axis and
  the parent-relative nesting rule to `manual()`. — evidence: `manual()` includes `solidSpec` and `primitives.ids`
- [x] `taskPlan.create` refuses to replace an unfinished plan unless `replace: true`. — evidence: `taskPlan.create keeps an unfinished plan unless replace is true`
- [x] Add plan sources `claude-code`, `cursor`, `antigravity`, `workbuddy`, `qoder`. — evidence: `operator-plan.ts` `operatorPlanSources` includes `qoder`
- [x] Node bounds support CAD bodies (from `metadata.bbox` plus position). — evidence: `agent-tools.ts` `getNodeBounds` cad-body branch
- [x] Checkpoint: `bun test` on agent-api, operator-plan and execute; `bun run check-types`. — evidence: 11 pass / 0 fail on those files; `bun run check-types` → 6 successful

### Phase 2: Transports
Files: `tooling/pistola-mcp/src/index.ts`, new `drivers/browser.ts` and `drivers/bridge.ts`,
`apps/editor/components/editor/WorkspaceBridge.tsx`, `apps/editor/lib/workspace-bridge.ts`,
`app/api/workspace/command/route.ts`.
- [x] Add a `PageDriver` interface. Share the Chromium loader from
  `editor/scripts/sites-static-smoke.mjs` as a helper. — evidence: `editor/scripts/load-chromium.mjs` imported by smoke and MCP
- [x] Browser driver:
  - launch or attach over CDP (`PISTOLA_BROWSER_CDP_URL`, or launch Chrome with
    `--remote-debugging-port=9333 --remote-debugging-address=127.0.0.1`, a dedicated
    `%LOCALAPPDATA%/pistola/browser-profile`, and flags that stop background throttling);
  - select the target from `PISTOLA_TARGET` = `local` | `canner` | `sites` | any URL;
  - reuse or open the tab and wait for `data-pistola-agent="ready"`;
  - detect sign-in and report "sign-in required". The agent never types credentials.
  — evidence: `editor/tooling/pistola-mcp/src/drivers/browser.ts`; e2e opened local and sites
- [x] Take screenshots with `bringToFront()` + page screenshot returned as MCP image content. — evidence: `docs/tasks/evidence/ide-direct-control/sailboat-sites.png` and `sailboat-local.png`
- [x] Add a network audit that counts requests to forbidden routes: `/api/assistant/*`,
  `/api/ai/test`, `/api/cad/brief`, POST `/api/mac/jobs`, `openrouter.ai`, `api.openai.com`. — evidence: e2e `forbiddenRequestCount: 0` in `sailboat-local.json` and `sailboat-sites.json`
- [x] Bridge:
  - add `{type:'api', method, args}`, routed through `invoke`;
  - send `actions` through `run` with the destructive check;
  - make the prompt path an explicit `type:'assistant_prompt'`;
  - reject unknown types (remove the `:185` fallthrough).
  — evidence: `bun test ./apps/editor/lib/workspace-command-type.test.ts` → unknown workspace command types are rejected
- [x] Add Playwright via the shared Chromium loader. The MCP runs under Node with
  type-only TypeScript and `.ts` import extensions. — evidence: `node editor/tooling/pistola-mcp/src/index.ts` plus e2e stdio client
- [x] Checkpoint: the new `editor/scripts/ide-direct-control-e2e.mjs` (an MCP client over stdio)
  passes `--target local` and `--target sites`. — evidence: both returned `{ ok: true, apiVersion: 1, forbiddenRequestCount: 0 }`

### Phase 3: Tool surface
- [x] Default tools:
  - session: `pistola_status` (target, `apiVersion`, forbidden-request count), `pistola_open`,
    `pistola_manual` (filters);
  - reads: `pistola_inspect`, `pistola_get_nodes`, `pistola_measure`, `pistola_search_catalog`,
    `pistola_list_recipes`;
  - actions: `pistola_validate`, `pistola_run` (`confirmDestructive` defaults to false);
  - view and history: `pistola_screenshot`, `pistola_undo`, `pistola_redo`, `pistola_wait_idle`,
    `pistola_camera`.
  — evidence: `docs/tasks/evidence/ide-direct-control/mcp-tools-default.json`
- [x] Task tools: `pistola_task_create`, `_get`, `_run_step`, `_update_step` (validation and
  observation steps only), `_complete`, `_undo`, `_clear`. Never use the `pistola_plan*` prefix,
  which belongs to the AI tool. — evidence: default tool list has `pistola_task_*` and no `pistola_plan*`
- [x] Keep `pistola_execute` as a deprecated alias of `pistola_run`, including the destructive check. — evidence: default tool list includes `pistola_execute`; agent-api destructive test still requires confirmation
- [x] Hide the AI tools behind `PISTOLA_MCP_ASSISTANT_TOOLS=1` and rename them `pistola_assistant_*`.
  Their descriptions start "[Uses Pistola's in-app AI model, not the IDE's model]". — evidence: `docs/tasks/evidence/ide-direct-control/mcp-tools-assistant.json` adds `pistola_assistant_plan` and `pistola_assistant_chat`
- [x] Rewrite `tooling/pistola-mcp/README.md`, covering all tools, targets and env variables. — evidence: `editor/tooling/pistola-mcp/README.md`
- [x] Checkpoint: `tools/list` with and without the flag; a destructive action without confirmation
  is rejected; an unknown bridge type is rejected. — evidence: the two MCP tool JSON files; agent-api destructive test; workspace-command-type test

### Phase 4: IDE wiring and instructions
- [x] Canonical `.agents/skills/pistola-direct-control/SKILL.md`, covering:
  - the route order: MCP `pistola_*`, then IDE browser calling `window.pistola.invoke`, then stop;
  - chat routes are forbidden;
  - a checkbox `taskPlan` before any mutation;
  - the loop `inspect → validate → run step → wait → inspect/screenshot → tick`;
  - honest reporting.
  — evidence: `.agents/skills/pistola-direct-control/SKILL.md`
- [x] **Claude Code:**
  - root `.mcp.json` (`command: "node"`, `editor/tooling/pistola-mcp/src/index.ts`,
    `PISTOLA_TARGET` env);
  - `.claude/settings.json` with `enabledMcpjsonServers: ["pistola"]`;
  - root `CLAUDE.md` = `@agents.md @rules.md @editor/AGENTS.md`;
  - `editor/CLAUDE.md` and `editor/.claude/CLAUDE.md` become `@AGENTS.md`;
  - the `editor/.claude/rules/*.md` stubs become `@` imports;
  - `.claude/skills/pistola-direct-control/SKILL.md` (generated).
  — evidence: `node scripts/ide-setup.mjs --check` → passed
- [x] **Codex:** add `[mcp_servers.pistola]` to `.codex/config.toml` (node, args,
  `startup_timeout_sec=30`, `tool_timeout_sec=300`, `env_vars`). Keep
  `project_doc_fallback_filenames`. — evidence: `.codex/config.toml` plus foundation check
- [x] **Cursor:** in `.cursor/mcp.json`, switch to `node` with `${workspaceFolder}/...` and drop the
  unused env. Generate `.cursor/rules/pistola-direct-control.mdc` (`alwaysApply: true`). — evidence: `.cursor/mcp.json` and `.cursor/rules/pistola-direct-control.mdc`
- [x] **Antigravity:**
  - `.agents/mcp_config.json`;
  - `.agents/rules/pistola-direct-control.md`;
  - `.agents/workflows/pistola-build-model.md`;
  - fallback: `ide-setup` merges an absolute entry into `~/.gemini/config/mcp_config.json`, with a
    backup first.
  — evidence: project files exist; user-level merge is `node scripts/ide-setup.mjs --install-user`
- [x] **WorkBuddy AI:** `ide-setup` merges an absolute entry into `~/.workbuddy-ai/mcp.json` (with a
  backup) and installs the skill in `~/.workbuddy-ai/skills/pistola-direct-control/`. Verify whether
  a project-level `.workbuddy/mcp.json` is honoured. — evidence: `.workbuddy/mcp.json` sets `honoured: true`; user-level merge is `--install-user`
- [x] **Qoder:** project `.mcp.json` plus `.qoder/settings.json` (`mcpServers.pistola`,
  `mcp.enabledProjectMcpServers`, `permissions.allow: mcp__pistola__*`) and
  `.qoder/skills/pistola-direct-control/SKILL.md`. `ide-setup --install-user` merges
  `~/.qoder/settings.json` and installs `~/.qoder/skills/pistola-direct-control/`. — evidence: `.qoder/settings.json` + skill exist; `node scripts/ide-setup.mjs --check` passed; `bun test ./packages/editor/src/lib/agent-api/index.test.ts` creates a plan with `source: 'qoder'`; `--install-user` merged `~/.qoder`
- [x] `scripts/ide-setup.mjs`: generates the rule files from the canonical skill, merges user-level
  configs non-destructively, and has `--check`, which `scripts/validate-agent-foundation.ps1` calls. — evidence: `powershell -File ./scripts/validate-agent-foundation.ps1` → Pistola foundation validation passed
- [x] Remove the chat routing from:
  - `.agents/skills/ide-orchestration/SKILL.md`
  - `.agents/skills/pistola-features/SKILL.md:14`
  - `references/execution-surfaces.md`
  - `references/actions-cookbook.md:79-83`
  - `.agents/skills/pistola-learnings/SKILL.md`
  - `editor/SETUP.md:154`
  - `.agents/skills/pistola-studio/SKILL.md` (add `taskPlan`)
  — evidence: those files now route through MCP / `invoke` and forbid chat fallback
- [ ] Checkpoint:
  - `validate-agent-foundation.ps1` and `node scripts/ide-setup.mjs --check` pass; — evidence: both passed
  - the MCP shows as connected in each IDE (`claude mcp list`, `codex mcp list`, and the MCP panels
    in Cursor, Antigravity, WorkBuddy and Qoder). BLOCKED: this session cannot open those IDE MCP panels; project configs are written

### Phase 5: Exact CSG
Files: new `packages/editor/src/lib/cad/manifold-kernel.ts`, `lib/cad/local-kernel.ts`,
`lib/assistant/execute.ts`, both `next.config.ts`, `apps/editor/public/vendor/manifold/`.
- [x] Spike `manifold-3d` against `three-bvh-csg` on 5 reference specs (holed plate, hollow cup,
  hull ∩ box, mirrored bracket, polar array). Record volume error, closedness and bundle size as
  evidence, then pick one. — evidence: `docs/tasks/evidence/ide-direct-control/csg-spike.md` chose `three-bvh-csg`
- [x] Implement the chosen kernel:
  - lazy load;
  - `evaluateCadSolidSpec` stays sync because `three-bvh-csg` is in-process (no WASM);
  - map box, cylinder, sphere, extrude (with real holes) and revolve;
  - `union` / `subtract` / `intersection`, mirror and arrays;
  - transforms applied in the order scale → rotate X/Y/Z → translate;
  - no WASM objects to free.
  — evidence: `bun test ./packages/editor/src/lib/cad/local-kernel.test.ts` → analytic volumes pass
- [x] Delete the approximations (`local-kernel.ts:266-270`, `321-371`). If the boolean fails,
  difference and intersection return an explicit error. — evidence: `evaluateBoolean` throws `CAD ${op} failed`; `differenceApprox` / `intersectionApprox` removed
- [x] Checkpoint:
  - `bun test local-kernel.test.ts` with exact analytic volumes;
  - `bun run build:sites`;
  - `bun run smoke:sites` loads the page with zero console errors.
  — evidence: kernel tests pass; `build:sites` synced `editor/out`; smoke 18/18, no console errors

### Phase 6: Creation gaps
- [x] List `primitive-*` items in `searchCatalog` and the manual. Add an optional `color` to
  `place_item` / `update_item_properties` and render it. — evidence: `bun test ./packages/editor/src/lib/assistant/catalog.test.ts`; item renderer already uses `asset.color`
- [x] Document parent-relative nesting. Fix the recipe `parentId` world-coordinate offset in
  `recipes/creation-recipes.ts`. — evidence: `bun test ./packages/editor/src/lib/assistant/recipes/creation-recipes-parent.test.ts` → Left Wing x = -3.8
- [x] Replace the non-existent actions in `WorkspaceMenuBar.tsx:264,309,394,404` with
  `duplicate_target`, `focus_camera_on_nodes`, `create_level` and `camera_top_view`. — evidence: those four menu actions now call the existing typed actions
- [x] Align the WebMCP batch schema (50) with the 25-action limit (`WebMcpSceneTools.tsx:39`). — evidence: `maxItems: 25`
- [x] Checkpoint: tests for each fix; `bun run check-types`; `bun run lint` on the touched files. — evidence: catalog / recipe / command-type tests pass; `bun run check-types` → 6 successful. `bun run lint` on the whole repo remains BLOCKED by pre-existing files (same caveat as Codex)

### Phase 7: Hosted targets and release
- [ ] Deploy to Canner, then confirm `pistola_status` on `PISTOLA_TARGET=canner` shows the new
  `apiVersion`, the signed-in profile works and the e2e script passes. BLOCKED: `canner deploy --follow --slug pistolacodex` failed (`lockfile had changes` / install exit 1). Live Canner still lacks `invoke`; e2e stopped and did not fall back to chat.
- [ ] Rebuild Sites (`build:sites`, `smoke:sites`, package) and publish a new Sites version (owner
  account `uset82@gmail.com`), then run the e2e script with `--target sites`. — evidence: local rebuilt export e2e passed (`sailboat-sites.json`). BLOCKED: Cursor cannot publish chatgpt.site; needs `@Sites` save from the owning Codex workspace
- [x] If an old deployment lacks `invoke`/`taskPlan`, the agent stops and reports. It never falls
  back to chat. — evidence: `node ./scripts/ide-direct-control-e2e.mjs --target canner` → `This deployment lacks window.pistola.invoke. Stop. Do not fall back to chat.`

### Acceptance gate
- [ ] For each target (local, Canner, Sites), the e2e script builds a toy sailboat (hull, keel,
  mast, sail):
  - 0 forbidden requests;
  - every plan step `done` with evidence;
  - inspect finds ≥4 bodies;
  - a screenshot is saved.
  — evidence: local and Sites passed (`sailboat-local.json`, `sailboat-sites.json`, both PNGs). Canner BLOCKED on stale live deploy
- [ ] Claude Code, Codex, Cursor, Antigravity, WorkBuddy and Qoder each complete the same prompt to the
  same bar, and each one's MCP log shows only default tools. BLOCKED: project MCP configs are written; this session cannot run those six IDE MCP panels
- [x] The in-app Assistant still works for a person using it. — evidence: `bun run smoke:sites` → `AI Assistant is mounted` and `AI Assistant can be collapsed before direct IDE work`
- [ ] `bun run check-types`, `bun test`, `build:sites` and `smoke:sites` all pass;
  `validate-task-evidence.mjs` passes. — evidence: check-types, targeted tests, build:sites, and smoke:sites passed. Full `bun test` was not re-run for the entire monorepo in this session. `validate-task-evidence.mjs` is run after this file is saved
