import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url))
const editorRoot = path.resolve(scriptsRoot, '..')

// Bun's isolated node_modules layout can leave `playwright`'s nested
// `playwright-core` link empty, which breaks resolution under Node. Fall back
// to the hoisted store entry so the check runs with plain `node`.
export const loadChromium = async () => {
  try {
    return (await import('playwright')).chromium
  } catch (error) {
    const storeRoot = path.join(editorRoot, 'node_modules', '.bun')
    const entries = await readdir(storeRoot).catch(() => [])
    const coreEntry = entries.find((entry) => entry.startsWith('playwright-core@'))
    if (!coreEntry) throw error
    const coreIndex = path.join(storeRoot, coreEntry, 'node_modules', 'playwright-core', 'index.mjs')
    return (await import(pathToFileURL(coreIndex).href)).chromium
  }
}

export const getEditorRoot = () => editorRoot
