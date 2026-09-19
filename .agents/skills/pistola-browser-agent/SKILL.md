---
name: pistola-browser-agent
description: Drive the live Pistola workspace from a browser using window.pistola. Use after pistola-studio has a feature plan, or whenever Codex must execute validated actions on the open editor page.
---

# Pistola browser agent

Only the main thread talks to the page.

## Loop

1. Open `/workspace` and wait for `document.documentElement.dataset.pistolaAgent === "ready"`.
2. `await window.pistola.manual()` for schemas. `public/agents/manual.json` and `public/llms.txt` are the static copies.
3. `inspect()` the scene. Keep `levelId` and existing node ids.
4. `validate(actions)` then `run(actions)`. Batches stay at or under 25 actions.
5. `waitForIdle()` then `screenshot()`.
6. On failure, `undo()` or patch only the failing batch.

Prefer `build_cad_solid` when `/api/cad/health` or `/api/mac/health` reports `runtime: "mock"`.
