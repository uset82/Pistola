---
name: pistola-browser-agent
description: Drive the live Pistola workspace from a browser using window.pistola. Use after pistola-studio has a feature plan, or whenever Codex must execute validated actions on the open editor page.
---

# Pistola browser agent

Only the main thread talks to the page. Codex is the planner; Pistola is the deterministic executor. Do not submit the user's request to the Pistola Assistant or any provider-backed route.

## Loop

1. Open `/workspace` and wait for `document.documentElement.dataset.pistolaAgent === "ready"`.
2. `await window.pistola.manual()` for schemas. `public/agents/manual.json` and `public/llms.txt` are the static copies.
3. Create a phase-and-step checklist with `window.pistola.taskPlan.create(...)` before the first scene mutation.
4. `inspect()` the scene. Mark observation steps done only with concise evidence.
5. For every modeling step, call `taskPlan.runStep(...)`; it marks running, validates, executes, waits, and records verified evidence. Batches stay at or under 25 actions.
6. After each phase, `inspect()` and `screenshot()`, then mark its validation step with evidence.
7. Complete the plan only after every step is verified. On failure, keep the step failed and either retry it or use whole-plan `taskPlan.undo(planId)`.

The Pistola `IDE plan` panel is a read-only mirror. Codex owns the checklist and updates it through `window.pistola.taskPlan`; the in-app Assistant does not run or re-plan these steps.

Prefer `build_cad_solid` when `/api/cad/health` or `/api/mac/health` reports `runtime: "mock"`.

## Direct-control contract

- Preferred route: `window.pistola.taskPlan` plus the typed action API.
- Acceptable alternate routes: WebMCP action tools or local MCP `pistola_execute`, when they are already available.
- Forbidden automatic fallbacks: `pistola_chat`, `pistola_plan`, `/api/assistant/plan`, `/api/assistant/agent/step`, or natural-language messages in the Pistola Assistant.
- If no deterministic route exists, stop and report that the current host lacks direct control. Do not hand the task to a weaker model.
- Mirror the phase checklist in Codex progress updates and keep the Pistola `IDE plan` state authoritative for execution evidence.
- Before declaring completion, compare the viewport screenshot with the approved concept or acceptance criteria. Limit visual-fix loops to three rounds, then report remaining differences honestly.
