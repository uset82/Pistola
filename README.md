# Pistola

Chat-driven 3D scenes and CAD. Live editor: [pistola.canner.app](https://pistola.canner.app/).

## Layout

| Path | What it is |
| --- | --- |
| `editor/` | The product: Turborepo with the Next.js editor (`apps/editor`), the Sites static build (`apps/sites`) and shared packages. Start with `editor/README.md` and `editor/AGENTS.md`. |
| `cad-helper/` | Python service that runs CAD jobs through FreeCAD (`main.py`, `routers/`, `freecad_bridge.py`). |
| `freecad/` | FreeCAD submodule used by the CAD pipeline. |
| `scripts/` | Repo-level smoke checks and the agent foundation validator. |
| `docs/plans/` | Product and architecture plans. |
| `docs/tasks/` | Task write-ups and walkthroughs for past features. |
| `agents.md`, `skills.md`, `rules.md`, `mainidea.md` | Agent foundation files; `.codex/config.toml` and `scripts/validate-agent-foundation.ps1` expect them at the root. |
| `.agents/` | Pistola Studio skills and the object library. |
| `.openai/hosting.json` | ChatGPT Sites hosting config; Sites publishes the static export in `out/`. |

## Build output

`out/` and `editor/out/` hold the static Sites export (`cd editor && bun run build:sites`).
Both are ignored by git, as are Sites packages (`pistola-cad-*.tgz`), packaging folders
(`sites-package-*/`) and build logs. Keep old packages outside the repo.
