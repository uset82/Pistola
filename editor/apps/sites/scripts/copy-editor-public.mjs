import { cp, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.dirname(fileURLToPath(import.meta.url))
const sourceDirectory = path.resolve(appRoot, '../../editor/public')
const outputDirectory = path.resolve(appRoot, '../out')

const [sourceStats, outputStats] = await Promise.all([
  stat(sourceDirectory).catch(() => null),
  stat(outputDirectory).catch(() => null),
])

if (!sourceStats?.isDirectory()) {
  throw new Error(`Expected editor public assets at ${sourceDirectory}.`)
}

if (!outputStats?.isDirectory()) {
  throw new Error(`Expected a static Next export at ${outputDirectory}.`)
}

const entries = await readdir(sourceDirectory)

await Promise.all(
  entries.map((entry) =>
    cp(path.join(sourceDirectory, entry), path.join(outputDirectory, entry), {
      force: true,
      recursive: true,
    }),
  ),
)
