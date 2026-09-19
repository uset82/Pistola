# Execution surfaces

Use the first surface that is available. Detect it once per session and tell the user which one you are using.

| # | Surface | Detect | Planner | Works on |
|---|---|---|---|---|
| 1 | `window.pistola` (in-page agent API) | Browser eval: `typeof window.pistola?.run === 'function'` | You | Local editor, pistola.canner.app, and the Sites export once published |
| 2 | Chat command `/run <json>` | `/manual` in the assistant panel replies with the command list | You | Same as 1 |
| 3 | Local MCP `pistola` (`pistola_execute`, `pistola_get_workspace`, `pistola_inspect_scene`, `pistola_camera`) | The MCP tool list contains `pistola_execute` | You | A local dev editor at `http://127.0.0.1:3002` with a workspace tab open |
| 4 | WebMCP tools `apply_pistola_scene_actions` / `get_pistola_scene_context` | Your tool list shows them, or `'modelContext' in navigator` | You | ChatGPT Sites export, in browsers with WebMCP |
| 5 | Natural-language prompt in the assistant chat, with the concept image attached | Always | In-app model (free OpenRouter by default) | Everywhere, but slow and unreliable |

Surfaces 1 to 4 run your actions exactly as written. Surface 5 re-plans them with a weaker model, so use it only when nothing else exists. Even then, write short, explicit prompts ("place a primitive-box named Hull 0.16 x 0.08 x 0.40 m at the origin") and send one part per message.

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
   command = "bun"
   args = ["run", "editor/tooling/pistola-mcp/src/index.ts"]
   env = { PISTOLA_BASE_URL = "http://127.0.0.1:3002" }
   ```

   The path is relative to the repository root, so start Codex from the root. Otherwise use an absolute path.

## Platform status

`window.pistola`, the `/run` family, and `build_cad_solid` ship in this repo. Always detect them before use (`dataset.pistolaAgent === 'ready'`). If a published host is still on an older snapshot, fall back to surface 5 and tell the user.
