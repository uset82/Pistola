# Pistola MCP

Stdio MCP server that drives a live Pistola page through `window.pistola.invoke`. The IDE model
plans; Pistola only executes typed actions. It runs on **Node ≥22.18**, not Bun.

## Prerequisites

1. Node 22.18+ on the PATH.
2. A reachable Pistola page: local editor, Canner, or a Sites export.
3. Optional: a Chrome instance already listening on `127.0.0.1:9333` so the server can attach.

## Transports

| `PISTOLA_TRANSPORT` | Use |
|---|---|
| `browser` (default) | Playwright launches or attaches to Chrome and calls `window.pistola.invoke`. Works on local, Canner, and Sites. |
| `bridge` | HTTP `/api/workspace/command` with `{ type: "api", method, args }`. Local editor only. |

## Targets

`PISTOLA_TARGET` accepts `local`, `canner`, `sites`, or any `http(s)://` URL.

| Value | Default URL |
|---|---|
| `local` | `http://127.0.0.1:3002/workspace` (`PISTOLA_BASE_URL`) |
| `canner` | `https://pistola.canner.app/workspace` (`PISTOLA_CANNER_URL`) |
| `sites` | `PISTOLA_SITES_URL` or the current chatgpt.site workspace |

Other env vars:

- `PISTOLA_BROWSER_CDP_URL` — attach instead of launch (default `http://127.0.0.1:9333`)
- `PISTOLA_BROWSER_PROFILE` — dedicated Chrome profile (default `%LOCALAPPDATA%/pistola/browser-profile`)
- `PISTOLA_BROWSER_HEADLESS=0` — show the window
- `PISTOLA_LOCAL_API_TOKEN` — only for `bridge`
- `PISTOLA_MCP_ASSISTANT_TOOLS=1` — expose the in-app AI tools (off by default)
- `PISTOLA_MCP_LOG=<path.jsonl>` — append one JSON line per `tools/call` (`tool`, `ok`, `error`, `code`, `ms`)

## Default tools

Session: `pistola_status`, `pistola_open`, `pistola_manual`

Reads: `pistola_inspect`, `pistola_export_scene`, `pistola_get_nodes`, `pistola_measure`, `pistola_search_catalog`, `pistola_list_recipes`, `pistola_check`, `pistola_blueprint_check`, `pistola_examples`

Reference mode: `pistola_reference_validate`, `pistola_reference_set`, `pistola_reference_get`, `pistola_reference_clear`. The selected concept must be user-approved and the pack must contain exactly eight labeled, opaque image references; image pixels remain owned by the IDE or asset store.

Actions: `pistola_validate`, `pistola_run` (`confirmDestructive` defaults to false), deprecated `pistola_execute` (same check)

View / history: `pistola_render_eight_views` (primary 4×2 Top/Left 45°/Front/Right 45°/Left/Right/Back/Bottom SVG review), `pistola_render_views` (2×2 FRONT/SIDE/TOP/ISO PNG critique), `pistola_screenshot` (canvas only), `pistola_undo`, `pistola_redo`, `pistola_wait_idle`, `pistola_camera`

Tasks: `pistola_task_create`, `pistola_task_get`, `pistola_task_run_step`, `pistola_task_update_step`, `pistola_task_restore_best`, `pistola_task_complete`, `pistola_task_undo`, `pistola_task_clear`

Never use a `pistola_plan*` name. That prefix is reserved for the hidden AI tool.

## Hidden AI tools

Only when `PISTOLA_MCP_ASSISTANT_TOOLS=1`:

- `pistola_assistant_plan`
- `pistola_assistant_chat`

Descriptions start with `[Uses Pistola's in-app AI model, not the IDE's model]`.

## Run

```bash
cd editor/tooling/pistola-mcp
node ./src/index.ts
```

E2E (MCP client over stdio, same as an IDE):

```bash
node editor/scripts/ide-direct-control-e2e.mjs --target local
node editor/scripts/ide-direct-control-e2e.mjs --target sites
node editor/scripts/ide-direct-control-e2e.mjs --list-tools
```

If `window.pistola.invoke` or `taskPlan` is missing, the server stops. It never falls back to chat.
