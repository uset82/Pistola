import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const writeManual = async () => {
  const { getAllCapabilities } = await import('../packages/editor/src/lib/assistant/capabilities/registry.ts')
  const capabilities = getAllCapabilities().map((capability) => ({
    type: capability.type,
    domain: capability.domain,
    describe: capability.describe,
    examples: capability.examples ?? [],
    safeImmediate: Boolean(capability.safeImmediate),
    destructive: Boolean(capability.destructive),
  }))
  const manual = {
    workflow: {
      alwaysPassExplicitIds: true,
      useForwardRefs: '$ref_<name> for new nodes in the same batch',
      maxActionsPerBatch: 25,
    },
    capabilities,
  }
  const llms = [
    '# Pistola agent manual',
    '',
    'Use window.pistola on /workspace after data-pistola-agent=ready.',
    'Loop: manual() → inspect() → validate() → run() → waitForIdle() → screenshot().',
    'Create objects with $pistola-studio. Prefer build_cad_solid on hosted mocks.',
    '',
    ...capabilities.map((capability) => `- ${capability.type}: ${capability.describe}`),
    '',
  ].join('\n')

  for (const app of ['editor', 'sites']) {
    const agentsDir = resolve(root, 'apps', app, 'public', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(resolve(agentsDir, 'manual.json'), JSON.stringify(manual, null, 2))
    writeFileSync(resolve(root, 'apps', app, 'public', 'llms.txt'), llms)
  }
}

await writeManual()
