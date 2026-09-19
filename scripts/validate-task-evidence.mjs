#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const taskPath = path.join(repoRoot, 'docs/tasks/TASK-ide-direct-control.md')
const evidenceRoot = 'docs/tasks/evidence/ide-direct-control/'

const markdown = await readFile(taskPath, 'utf8')
const lines = markdown.split(/\r?\n/)
const checked = []
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index]
  if (!/^\s*-\s*\[[xX]\]/.test(line)) continue
  let block = line
  for (let next = index + 1; next < lines.length; next += 1) {
    const candidate = lines[next]
    if (/^\s*-\s*\[/.test(candidate) || /^\s*###\s/.test(candidate)) break
    if (!candidate.trim()) break
    block += `\n${candidate}`
  }
  checked.push({ line: block, number: index + 1 })
}

const missing = checked.filter(({ line }) => {
  const hasInline = /evidence\s*:/i.test(line)
  const hasFolderLink = line.includes(evidenceRoot)
  return !hasInline && !hasFolderLink
})

if (missing.length > 0) {
  console.error(`validate-task-evidence: ${missing.length} checked item(s) lack evidence`)
  for (const item of missing) {
    console.error(`  L${item.number}: ${item.line.trim()}`)
  }
  process.exit(1)
}

console.log(`validate-task-evidence: ${checked.length} checked item(s) have evidence`)
