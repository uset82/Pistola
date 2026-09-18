import { cp, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Mirrors the static export produced by this app into the directory that the
// Sites hosting project expects. `.openai/hosting.json` lives at the monorepo
// root (`editor/`), so `static.directory` resolves relative to that root, not
// to `apps/sites`.
const appRoot = path.dirname(fileURLToPath(import.meta.url))
const sitesRoot = path.resolve(appRoot, '..')
const hostingRoot = path.resolve(sitesRoot, '../..')
const exportDirectory = path.join(sitesRoot, 'out')
const hostingConfigPath = path.join(hostingRoot, '.openai', 'hosting.json')

const readHostingDirectory = async () => {
  try {
    const raw = await readFile(hostingConfigPath, 'utf8')
    const parsed = JSON.parse(raw)
    const directory = parsed?.static?.directory
    return typeof directory === 'string' && directory.trim() ? directory.trim() : 'out'
  } catch {
    return 'out'
  }
}

const exportStats = await stat(exportDirectory).catch(() => null)
if (!exportStats?.isDirectory()) {
  throw new Error(`Expected a static Next export at ${exportDirectory}. Run "next build" first.`)
}

const hostingDirectory = await readHostingDirectory()
const targetDirectory = path.resolve(hostingRoot, hostingDirectory)
const relativeTarget = path.relative(hostingRoot, targetDirectory)

if (!relativeTarget || relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
  throw new Error(`Refusing to sync outside the hosting root: ${targetDirectory}`)
}

if (targetDirectory === exportDirectory) {
  console.log(`[sites] Export already lives at ${targetDirectory}; nothing to sync.`)
} else {
  await rm(targetDirectory, { force: true, recursive: true })
  await cp(exportDirectory, targetDirectory, { force: true, recursive: true })
  console.log(`[sites] Synced static export to ${targetDirectory}`)
}
