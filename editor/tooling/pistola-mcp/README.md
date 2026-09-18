# Pistola MCP

Stdio MCP server that controls a running Pistola editor over localhost HTTP.

## Prerequisites

1. Start the editor app (`bun run dev` in `editor/`, typically `http://127.0.0.1:3002`).
2. Open a live workspace tab (required for scene mutations).
3. Choose one access mode:
   - During local development, set `PISTOLA_LOCAL_API_TOKEN` to the same value in editor `.env.local` and the MCP environment. It authorizes MCP calls, but the live browser workspace must still be signed in for scene mutations.
   - With no auth DB and no local token, set `PISTOLA_ALLOW_UNAUTHENTICATED_API=1` in the editor app environment for a development-only guest browser workspace. Setting it only on the MCP process does not configure the editor app.

## Tools

- `pistola_status`
- `pistola_configure_model`
- `pistola_get_workspace`
- `pistola_plan`
- `pistola_execute`
- `pistola_chat`
- `pistola_generate_mac`
- `pistola_generate_cad`
- `pistola_get_job`
- `pistola_list_artifacts`

## Run manually

```bash
cd editor/tooling/pistola-mcp
bun run start
```
