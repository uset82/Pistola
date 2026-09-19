# TASK-cad-runtime-stabilization

## Summary

- Planned file path: `C:\Users\carlos\PROYECTOS\pistola\TASK-cad-runtime-stabilization.md`
- Goal: stabilize Pistola CAD around one canonical FreeCAD-backed runtime and ship a clean manual core loop before re-exposing advanced CAD scaffolding.
- Current breakpoints discovered during exploration: two helper runtimes exist (`cad-helper/` Python and `editor/tooling/cad-helper/server.mjs` mock), helper contracts drift across packages, and the UI exposes tools that are still scaffold-level or only partially wired.

## Checklist

- [x] Make `C:\Users\carlos\PROYECTOS\pistola\cad-helper` the only default CAD backend for the editor, and move `C:\Users\carlos\PROYECTOS\pistola\editor\tooling\cad-helper\server.mjs` behind an explicit mock/dev-only switch instead of implicit auto-start.
- [x] Standardize the CAD health contract end to end so the helper, app API, and editor UI all use the same fields and meanings for `status`, `runtime`, `engine`, `version`, and `helperUrl`.
- [x] Consolidate CAD HTTP types into one editor-owned contract module under `editor/packages/editor/src/lib/cad`, and remove or deprecate duplicate helper-client types from `editor/packages/core` so `core` stops owning external CAD service details.
- [x] Normalize CAD job types to one canonical vocabulary: `sketch_to_solid`, `extrude`, `revolve`, `regenerate`, `boolean_union`, `boolean_cut`, `boolean_intersect`, `fillet`, `chamfer`, `import_step`, and `export_step`.
- [x] Update the editor store and app API proxy to send only canonical job types, including replacing the current generic `boolean` request with the concrete boolean operation names expected by the FreeCAD helper.
- [x] Reduce the phase-1 visible CAD surface to the stable core loop only: keep sketch creation, sketch drawing, extrude, revolve, regenerate, import STEP, and export STEP; hide or disable constraints, boolean, fillet, chamfer, and inspect until they are backed by the canonical helper contract.
- [x] Make sketch lifecycle deterministic in `packages/editor`: one active sketch rule, first-click sketch bootstrap, explicit close/reopen behavior, and no CAD tool that silently no-ops when selection or sketch context is missing.
- [x] Make profile readiness explicit before solid operations: expose open/closed profile state in the sketch panel, block extrude/revolve locally with clear status text, and stop using assistant-style failure toasts for expected precondition errors.
- [x] Clean up CAD runtime UI so there is one authoritative status surface for helper state and one authoritative action surface for sketch/body operations, instead of overlapping messages between the floating CAD panel, side panels, toolbar, and assistant panel.
- [x] Separate viewer preview from CAD truth: `cad-sketch` renderer should show only meaningful sketch geometry and labels, while `cad-body` renderer should prefer helper-produced artifacts and use placeholder geometry only for build/loading/error fallback states.
- [x] Ensure `cad-body` state transitions are single-path and explicit: queued/building/running/error/idle should come from helper job results, and returned artifact refs plus operation history must be persisted once in the editor store.
- [x] Add regression coverage for the canonical path: Python helper job-shape tests, app API proxy tests, and editor store/tool tests for sketch-to-body state transitions.
- [ ] Reintroduce advanced CAD features only after the canonical core loop is stable, with each restored feature requiring a matching helper operation, editor action, UI affordance, and regression test before it returns to the main surface.

## Public Interface Changes

- The canonical CAD backend becomes the root Python helper in `cad-helper/`; the bundled Node helper remains available only as an explicit mock runtime for local smoke testing.
- The canonical job request vocabulary becomes the FreeCAD helper vocabulary, and the editor no longer invents alternate request names.
- The public CAD UI surface for phase 1 is intentionally smaller: advanced parametric and modify tools are hidden or disabled until they are fully supported instead of remaining visibly broken.
- The helper health payload is treated as a formal interface, not best-effort text, and the UI must reflect the actual active runtime without aliasing `mock-freecad`, `freecad-stub`, and FreeCAD as if they were the same thing.

## Test Plan

- [x] Run `pytest C:\Users\carlos\PROYECTOS\pistola\cad-helper\tests\test_job_results.py`.
- [x] Run `bun run check-types` in `C:\Users\carlos\PROYECTOS\pistola\editor\packages\editor`.
- [x] Run `bun run check-types` in `C:\Users\carlos\PROYECTOS\pistola\editor\apps\editor`.
- [x] Manual offline scenario: with the FreeCAD helper unavailable, the editor shows a clear unavailable state and does not silently fall back to the mock helper.
- [x] Manual core loop scenario: create a sketch, draw a closed profile, extrude or revolve it, inspect the created body, regenerate it, and export STEP successfully.
- [x] Manual import scenario: import a STEP file and verify the resulting `cad-body` renders, selects, and exports correctly.
- [x] Manual UI guardrail scenario: hidden/disabled advanced tools do not present dead controls, duplicate status text, or misleading assistant toasts.

## Validation Notes

- 2026-03-25: offline CAD state was validated in the browser against the app's canonical `503` unreachable health payload, and `apps/editor/app/api/cad/_helper.test.ts` confirms `PISTOLA_CAD_HELPER_RUNTIME=external` disables managed helper auto-start instead of falling back to the bundled mock helper.
- 2026-03-25: the manual core loop was validated in the browser with a rectangle sketch, body generation, regenerate, and STEP export (`sketch-1-body.step`).
- 2026-03-25: the manual import loop was validated in the browser with `tmp-manual-import.step`; the imported `cad-body` rendered without scene failure, remained selectable, and re-exported the same STEP payload.
- 2026-03-25: the UI guardrail pass was validated in the browser; advanced CAD command labels were absent, the assistant no longer duplicated CAD runtime status, and no misleading assistant toast appeared for the no-sketch extrude path.

## Assumptions

- The new checklist file should live at the repo root as `TASK-cad-runtime-stabilization.md`.
- The existing `C:\Users\carlos\PROYECTOS\pistola\cad_task_plan.md` is outdated and should be treated as superseded once the new task file is written.
- `packages/core` keeps schema and scene semantics only; helper clients, runtime orchestration, and CAD UI stay in `apps/editor` and `packages/editor`.
- Phase 1 is allowed to hide unfinished CAD features rather than pretending they are stable.
