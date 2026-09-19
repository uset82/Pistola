# Execution surfaces

Use the first surface that is available. Detect it once per session and tell the user which one you are using.

| # | Surface | Detect | Planner | Works on |
|---|---|---|---|---|
| 1 | `window.pistola` (in-page operator API) | Browser eval: `typeof window.pistola?.taskPlan?.runStep === 'function'` | You | Local editor, pistola.canner.app, and published Sites exports |
| 2 | WebMCP tools `apply_pistola_scene_actions` / `get_pistola_scene_context` | Your tool list shows them, or `'modelContext' in navigator` | You | ChatGPT Sites export, in browsers with WebMCP |
| 3 | Local MCP `pistola` (`pistola_run`, `pistola_task_*`, `pistola_inspect`) | The MCP tool list contains `pistola_run` and `pistola_task_create` | You | Local, Canner, and Sites via the Playwright browser driver |
| 4 | Chat command `/run <json>` | `/manual` in the assistant panel replies with the command list | A person in the app | Manual recovery only; do not use as an IDE route |

IDE agents use surfaces 1 to 3. Never automatically fall back to a natural-language Assistant prompt, `pistola_chat`, `pistola_plan`, `/api/assistant/plan`, or `/api/assistant/agent/step`. If surfaces 1 to 3 are unavailable, stop and tell the user that the host does not expose direct control.

## 1. `window.pistola`

```js
await window.pistola.manual()              // action JSON Schemas + rules
await window.pistola.inspect()             // levels, nodes, selection
await window.pistola.validate(actions)     // { ok, errors: [{ index, message, hint }] }
await window.pistola.run(actions)          // { ok, createdNodeIds, refMap, errors, warnings }
await window.pistola.waitForIdle(60000)    // CAD/MAC regeneration finished
await window.pistola.screenshot()          // PNG data URL of the viewport
await window.pistola.undo()
```

For a Codex-owned build, publish the checklist and execute through the versioned plan namespace:

```js
const plan = await window.pistola.taskPlan.create({
  title: 'Build the requested object',
  source: 'codex',
  phases: [{
    id: 'model',
    title: 'Model',
    steps: [
      { id: 'inspect', title: 'Inspect the current scene', kind: 'observation' },
      { id: 'build', title: 'Create the geometry', kind: 'execution' },
    ],
  }],
})

await window.pistola.taskPlan.updateStep({
  planId: plan.id,
  phaseId: 'model',
  stepId: 'inspect',
  status: 'done',
  evidence: { kind: 'observation', summary: 'Level and target ids verified.' },
})

await window.pistola.taskPlan.runStep({
  planId: plan.id,
  phaseId: 'model',
  stepId: 'build',
  actions,
})
```

Wait for `document.documentElement.dataset.pistolaAgent === 'ready'` before the first call.

## 2. Chat commands

Type in the assistant input and press Send. The reply is a JSON block, which you can read from the element with `data-testid="assistant-last-result"`:

- `/run` followed by a JSON array or a fenced json block: validate, then execute locally with no LLM
- `/validate <json>`, `/inspect`, `/recipe <name> {params}`, `/cad {spec}`, `/manual`

## 3. Local MCP

For work on this repository with a local editor:

1. Start the editor in `editor/` with `bun run dev` (port 3002). `apps/editor/.env.local` needs `PISTOLA_ALLOW_UNAUTHENTICATED_API=1` when there is no auth database.
2. Open `http://127.0.0.1:3002/workspace` and keep that tab open. The tab executes the commands.
3. Register the server for Codex once, either in `~/.codex/config.toml` or in this repo's `.codex/config.toml` if the team agrees:

   ```toml
   [mcp_servers.pistola]
   command = "node"
   args = ["editor/tooling/pistola-mcp/src/index.ts"]
   env = { PISTOLA_TARGET = "local" }
   ```

   The path is relative to the repository root, so start Codex from the root. Otherwise use an absolute path.

## Platform status

`window.pistola`, the `/run` family, and `build_cad_solid` ship in this repo. Always detect direct control before use (`dataset.pistolaAgent === 'ready'`). If a published host is on an older snapshot, report that it must be redeployed; do not route the request through the Assistant model.
