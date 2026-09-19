#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skillPath = path.join(repoRoot, '.agents/skills/pistola-direct-control/SKILL.md')
const checkOnly = process.argv.includes('--check')
const installUser = process.argv.includes('--install-user')

const mcpEntry = {
  command: 'node',
  args: [path.join(repoRoot, 'editor/tooling/pistola-mcp/src/index.ts')],
  env: {
    PISTOLA_TARGET: 'local',
  },
}

const relativeMcpEntry = {
  command: 'node',
  args: ['${workspaceFolder}/editor/tooling/pistola-mcp/src/index.ts'],
  env: {
    PISTOLA_TARGET: 'local',
  },
}

const requiredSnippets = [
  'window.pistola.invoke',
  'taskPlan',
  'Never use `pistola_chat`',
]

const errors = []

const readOptional = async (filePath) => {
  try {
    return await readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

const ensureFile = async (filePath, contents) => {
  if (checkOnly) {
    const existing = await readOptional(filePath)
    if (existing == null) errors.push(`Missing ${path.relative(repoRoot, filePath)}`)
    else if (existing.trim() !== contents.trim()) errors.push(`Stale ${path.relative(repoRoot, filePath)}`)
    return
  }
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents)
}

const mergeJson = async (filePath, updater) => {
  const existing = JSON.parse((await readOptional(filePath)) ?? '{}')
  const next = updater(existing)
  const rendered = `${JSON.stringify(next, null, 2)}\n`
  if (checkOnly) {
    const current = await readOptional(filePath)
    if (current?.trim() !== rendered.trim()) errors.push(`Stale ${path.relative(repoRoot, filePath) || filePath}`)
    return
  }
  await mkdir(path.dirname(filePath), { recursive: true })
  if (await readOptional(filePath)) {
    await copyFile(filePath, `${filePath}.bak`)
  }
  await writeFile(filePath, rendered)
}

const skill = await readFile(skillPath, 'utf8')

await ensureFile(path.join(repoRoot, '.claude/skills/pistola-direct-control/SKILL.md'), skill)
await ensureFile(
  path.join(repoRoot, '.cursor/rules/pistola-direct-control.mdc'),
  `---
description: Drive Pistola with typed IDE actions. Never use the in-app Assistant as a planner.
alwaysApply: true
---

${skill.replace(/^---[\s\S]*?---\n/, '')}`,
)
await ensureFile(path.join(repoRoot, '.agents/rules/pistola-direct-control.md'), skill)
await ensureFile(
  path.join(repoRoot, '.agents/workflows/pistola-build-model.md'),
  `# Build a model in Pistola

1. Read \`.agents/skills/pistola-direct-control/SKILL.md\`.
2. Open the workspace with \`pistola_open\`.
3. Create a \`taskPlan\` checklist.
4. inspect → validate → run step → wait → inspect/screenshot → tick.
5. Stop if \`invoke\` or \`taskPlan\` is missing. Do not use chat tools.
`,
)

await mergeJson(path.join(repoRoot, '.mcp.json'), (current) => ({
  ...current,
  mcpServers: {
    ...(current.mcpServers ?? {}),
    pistola: {
      command: 'node',
      args: ['editor/tooling/pistola-mcp/src/index.ts'],
      env: { PISTOLA_TARGET: 'local' },
    },
  },
}))

await mergeJson(path.join(repoRoot, '.claude/settings.json'), (current) => ({
  ...current,
  enabledMcpjsonServers: Array.from(new Set([...(current.enabledMcpjsonServers ?? []), 'pistola'])),
}))

await mergeJson(path.join(repoRoot, '.cursor/mcp.json'), (current) => ({
  ...current,
  mcpServers: {
    ...(current.mcpServers ?? {}),
    pistola: relativeMcpEntry,
  },
}))

await mergeJson(path.join(repoRoot, '.agents/mcp_config.json'), (current) => ({
  ...current,
  mcpServers: {
    ...(current.mcpServers ?? {}),
    pistola: {
      command: 'node',
      args: [path.join(repoRoot, 'editor/tooling/pistola-mcp/src/index.ts').replaceAll('\\', '/')],
      env: { PISTOLA_TARGET: 'local' },
    },
  },
}))

await mergeJson(path.join(repoRoot, '.workbuddy/mcp.json'), (current) => ({
  ...current,
  honoured: true,
  mcpServers: {
    ...(current.mcpServers ?? {}),
    pistola: {
      command: 'node',
      args: ['editor/tooling/pistola-mcp/src/index.ts'],
      env: { PISTOLA_TARGET: 'local' },
    },
  },
}))

const claudeRoot = `@agents.md @rules.md @editor/AGENTS.md\n`
const claudeEditor = `@AGENTS.md\n`
await ensureFile(path.join(repoRoot, 'CLAUDE.md'), claudeRoot)
await ensureFile(path.join(repoRoot, 'editor/CLAUDE.md'), claudeEditor)
await ensureFile(path.join(repoRoot, 'editor/.claude/CLAUDE.md'), claudeEditor)

const ruleNames = [
  'creating-rules',
  'events',
  'layers',
  'node-schemas',
  'renderers',
  'scene-registry',
  'selection-managers',
  'spatial-queries',
  'systems',
  'tools',
  'viewer-isolation',
]
for (const name of ruleNames) {
  await ensureFile(path.join(repoRoot, `editor/.claude/rules/${name}.md`), `@../.cursor/rules/${name}.mdc\n`)
}

if (installUser && !checkOnly) {
  await mergeJson(path.join(os.homedir(), '.gemini/config/mcp_config.json'), (current) => ({
    ...current,
    mcpServers: { ...(current.mcpServers ?? {}), pistola: mcpEntry },
  }))
  await mergeJson(path.join(os.homedir(), '.workbuddy-ai/mcp.json'), (current) => ({
    ...current,
    mcpServers: { ...(current.mcpServers ?? {}), pistola: mcpEntry },
  }))
  await mkdir(path.join(os.homedir(), '.workbuddy-ai/skills/pistola-direct-control'), { recursive: true })
  await writeFile(path.join(os.homedir(), '.workbuddy-ai/skills/pistola-direct-control/SKILL.md'), skill)
}

const skillBody = skill
for (const snippet of requiredSnippets) {
  if (!skillBody.includes(snippet)) errors.push(`Canonical skill is missing "${snippet}"`)
}

if (checkOnly && errors.length > 0) {
  console.error('ide-setup --check failed:')
  for (const error of errors) console.error(` - ${error}`)
  process.exit(1)
}

if (checkOnly) {
  console.log('ide-setup --check passed.')
} else {
  console.log('ide-setup wrote IDE rule and MCP files.')
}
