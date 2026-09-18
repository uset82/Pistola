# @pistola/sites — static browser preview

Static Next.js export of the official Pistola product for ChatGPT/Codex **Sites**.
The landing page is How Pistola Works. `/workspace` is the same editor chrome as
[pistola.canner.app](https://pistola.canner.app/): Architecture and CAD worlds, plus
the AI Assistant. Sites has no API of its own.

## CAD features on Sites

- Browser sketcher: sketch, line, rectangle, circle, arc, polyline, constraints.
- **FreeCAD** solids: extrude, revolve, boolean, fillet, chamfer, STEP I/O.
- **Multi-Agent-CAD**: text-to-part generation from [Pan-Chera/Multi-Agent-CAD](https://github.com/Pan-Chera/Multi-Agent-CAD).

Solid jobs and the AI Assistant call the official Canner API
(`NEXT_PUBLIC_PISTOLA_API_BASE`, default `https://pistola.canner.app`). The CAD
Runtime panel shows both engines. If the host has no FreeCADCmd or MAC clone,
Canner starts the bundled preview helpers so the Sites CAD loop still completes.

The workspace shell is `PistolaWorkspaceShell` (shared with the Canner editor)
plus the invisible WebMCP scene tools.

## Build and verify

```bash
cd editor
bun run build:sites   # next build (static export) + copy editor/public + sync to editor/out
bun run smoke:sites   # serves editor/out and checks landing, worlds, and the AI Assistant
```

`apps/sites/scripts/sync-hosting-output.mjs` mirrors `apps/sites/out` into the
directory declared by `editor/.openai/hosting.json` (`static.directory`,
currently `out`, resolved from `editor/`). Sites packages that directory, so
the export must exist at `editor/out` before publishing.

The build script calls `node ./node_modules/next/dist/bin/next` directly: on
Windows the bun `.bin` shim for `next build` exits with code 255 while the real
build keeps running detached, which leaves a stale `.next/lock` and skips the
copy/sync steps.

## Publish with Sites

Sites saves a version from a **committed, clean worktree** (no modified or
untracked files) and packages the local `editor/out` export. Typical flow:

1. `bun run build:sites && bun run smoke:sites`
2. Commit the source you want to ship.
3. In ChatGPT/Codex: `@Sites Save a new version of this project and deploy it.`
