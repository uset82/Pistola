# FreeCAD Setup

Pistola integrates FreeCAD inside the tracked `editor/` repo as a git submodule at `third_party/FreeCAD`. The Python helper lives at `tooling/freecad-helper` and bridges the editor runtime to `FreeCADCmd.exe`.

## Integrated Layout

- Product repo: `editor/`
- FreeCAD source: `editor/third_party/FreeCAD`
- Python helper: `editor/tooling/freecad-helper`
- Default Windows executable search paths:
  `editor/third_party/FreeCAD/build/release/bin/FreeCADCmd.exe`,
  `editor/third_party/FreeCAD/build/debug/bin/FreeCADCmd.exe`,
  `editor/third_party/FreeCAD/build/bin/FreeCADCmd.exe`, and
  `editor/third_party/FreeCAD/.pixi/envs/default/Library/bin/FreeCADCmd.exe`

## Bootstrap

1. Initialize the submodule:
   `git submodule update --init --recursive third_party/FreeCAD`
2. Build FreeCAD on Windows so one of the integrated `FreeCADCmd.exe` outputs exists, typically `third_party/FreeCAD/build/release/bin/FreeCADCmd.exe`.
3. Start the app from `editor/apps/editor`. The app-managed CAD runtime will auto-start `tooling/freecad-helper` on demand when `PISTOLA_CAD_HELPER_RUNTIME=python`.

## Runtime Contract

- `FREECAD_PATH` is optional. If you omit it, the helper auto-detects the common integrated Windows outputs under `editor/third_party/FreeCAD`.
- Set `FREECAD_PATH` only when your build output lives elsewhere.
- The helper fails fast when neither `FREECAD_PATH` nor the default integrated build output exists.

## Notes

- `@openai/codex-sdk` is the assistant control plane. FreeCAD is the CAD execution backend.
- `apps/editor/app/api/assistant/plan` is the primary AI route. `/api/cad/*` remains helper execution and health only.
- This workstation still needs a real `FreeCADCmd.exe` build under the submodule path before live CAD jobs can succeed end to end.
