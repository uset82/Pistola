import { cp, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Mirrors the static export produced by this app into the directories that
// Sites hosting expects, whether Sites is run from the repo root or from editor/.
const appRoot = path.dirname(fileURLToPath(import.meta.url))
const sitesRoot = path.resolve(appRoot, '..')
const editorRoot = path.resolve(sitesRoot, '../..')
const repoRoot = path.resolve(editorRoot, '..')
const exportDirectory = path.join(sitesRoot, 'out')

const exportStats = await stat(exportDirectory).catch(() => null)
if (!exportStats?.isDirectory()) {
  throw new Error(`Expected a static Next export at ${exportDirectory}. Run "next build" first.`)
}

// Target 1: editor/out
const editorOut = path.join(editorRoot, 'out')
if (editorOut !== exportDirectory) {
  await rm(editorOut, { force: true, recursive: true })
  await cp(exportDirectory, editorOut, { force: true, recursive: true })
  console.log(`[sites] Synced static export to ${editorOut}`)
}

// Target 2: repoRoot/out (d:/Proyectos/pistolacodex/out)
const repoOut = path.join(repoRoot, 'out')
if (repoOut !== exportDirectory && repoOut !== editorOut) {
  await rm(repoOut, { force: true, recursive: true })
  await cp(exportDirectory, repoOut, { force: true, recursive: true })
  console.log(`[sites] Synced static export to ${repoOut}`)
}
