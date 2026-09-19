---
name: pistola-direct-control
description: Drive Pistola from an IDE (Claude Code, Codex, Cursor, Antigravity, WorkBuddy, Qoder) with typed actions. Use whenever the user asks to build, edit, or inspect a 3D object or scene in Pistola. The IDE model plans; Pistola only executes.
---

# Pistola Direct Control

The IDE model is the planner. Pistola is a deterministic executor. Do not hand the request to Pistola's in-app Assistant.

## Route order

1. MCP default tools (`pistola_status`, `pistola_task_*`, `pistola_run`, `pistola_inspect`, `pistola_screenshot`).
2. The IDE browser calling `window.pistola.invoke(method, args)` after `data-pistola-agent="ready"`.
3. Stop. Tell the user the host has no direct control.

Never use `pistola_chat`, `pistola_plan`, `pistola_assistant_*`, `/api/assistant/*`, `/api/ai/test`, or a natural-language message in the Pistola chat box. If `invoke` or `taskPlan` is missing, stop. Do not fall back.

## Loop

1. `pistola_open` / wait for `dataset.pistolaAgent === "ready"`.
2. Create a checkbox `taskPlan` before the first mutation (`pistola_task_create` or `window.pistola.taskPlan.create`).
3. `inspect` → `validate` → `taskPlan.runStep` → `waitForIdle` → `inspect` / `screenshot` → tick the step with evidence.
4. Batches stay at or under 25 actions. Destructive actions need `confirmDestructive: true`.
5. Complete the plan only after every step has evidence. Report remaining gaps honestly.

## Parent-relative nesting

`parentId` child positions are local to the parent, not world coordinates. Primitive ids are `primitive-box`, `primitive-sphere`, `primitive-cylinder`, `primitive-cone`, `primitive-torus`, `primitive-capsule`, `primitive-wedge`. Optional `color` is a hex string on `place_item` and `update_item_properties`.
