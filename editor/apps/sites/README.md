# @pistola/sites — static browser preview

Static Next.js export of the Pistola editor for hosting on ChatGPT/Codex **Sites**
(`https://pistolacodex.gi-o-vi-n-ch-5540.chatgpt.site/`). It renders the full
`@pascal-app/editor` UI without any Next.js server, API routes, or auth.

## What works on the static host

- Structure / Furnish / Zones workspaces, scenes persisted in the browser.
- CAD workspace with the browser-side sketcher (sketch, line, rectangle,
  circle, arc, polyline, constraints, sketch panel). Enabled via
  `<Editor enableCad enableCadRuntime={false} />` in `components/hosted-editor.tsx`.

## What is intentionally disabled

- FreeCAD-backed solids (extrude/revolve/boolean/fillet/chamfer), STEP import/
  export, and the helper status widget (`enableCadRuntime={false}`).
- AI assistant, MAC generation, workspace bridge, sign-in — they need the
  `apps/editor` server plus local helper processes.

## Build and verify

```bash
cd editor
bun run build:sites   # next build (static export) + copy editor/public + sync to editor/out
bun run smoke:sites   # serves editor/out headlessly and checks the CAD tab, no /api calls, no errors
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
