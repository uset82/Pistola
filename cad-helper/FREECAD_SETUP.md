# FreeCAD Fork Setup

Pistola includes FreeCAD as a git submodule at `freecad/` in the monorepo root, the same way `editor/` holds the pascalorg/editor base. The `cad-helper/` Python service bridges the editor and FreeCAD through subprocess calls to `FreeCADCmd.exe`.

## Current fork checkout

- Fork: `https://github.com/uset82/FreeCAD`
- Upstream: `https://github.com/FreeCAD/FreeCAD`
- Submodule path: `freecad/` (monorepo root)
- Branch: `main`
- Checked commit: `a56ef7d8f964191834f82389d7dd1f72d6be5d5f`

## Local runtime contract

Set `FREECAD_PATH` to the built `FreeCADCmd.exe` from the `freecad/` submodule build output:

```powershell
$env:FREECAD_PATH='<monorepo-root>\freecad\build\bin\FreeCADCmd.exe'
```

The Pistola helper fails fast if `FREECAD_PATH` is missing or invalid.

## Bootstrap outline

1. Initialize and update the submodule: `git submodule update --init freecad`
2. The submodule remotes are:
   - `origin=https://github.com/uset82/FreeCAD.git`
   - `upstream=https://github.com/FreeCAD/FreeCAD.git`
3. Build the Windows checkout inside `freecad/` to produce `FreeCADCmd.exe`.
4. Point `FREECAD_PATH` at that executable before starting the Python CAD helper.

## Notes

- This machine does not currently have a visible local `FreeCADCmd.exe`, `conda`, or MSVC compiler in path, so the Pistola-side bridge is wired and ready, but the actual FreeCAD build output still needs to be provided on this workstation.
- The helper/runtime boundary remains unchanged: `cad-helper/` owns the subprocess bridge, `apps/editor/app/api/cad/_helper.ts` owns helper startup/proxy, and `packages/editor/src/lib/cad/contracts.ts` remains the editor/helper interface.
- The Codex SDK (`@openai/codex-sdk`) orchestrates both editor and CAD planning from a single thread, with the monorepo root as `workingDirectory` so the Codex agent can read both `editor/` and `freecad/` source trees.
