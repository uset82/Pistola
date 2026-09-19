#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const TASKS = [
  {
    file: 'docs/tasks/TASK-ide-direct-control.md',
    evidence: 'docs/tasks/evidence/ide-direct-control/',
  },
  {
    file: 'docs/tasks/TASK-reliable-creation.md',
    evidence: 'docs/tasks/evidence/creation-quality/',
  },
]

const requested = process.argv.slice(2).filter((value) => !value.startsWith('-'))
const selected = requested.length > 0
  ? TASKS.filter((task) => requested.some((needle) => task.file.includes(needle) || needle.includes(path.basename(task.file))))
  : TASKS

if (selected.length === 0) {
  console.error(`validate-task-evidence: no matching task files for ${requested.join(', ')}`)
  process.exit(1)
}

let failed = false
let totalChecked = 0

for (const task of selected) {
  const taskPath = path.join(repoRoot, task.file)
  let markdown
  try {
    markdown = await readFile(taskPath, 'utf8')
  } catch {
    console.error(`validate-task-evidence: missing ${task.file}`)
    failed = true
    continue
  }
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
    const hasFolderLink = line.includes(task.evidence)
    return !hasInline && !hasFolderLink
  })

  totalChecked += checked.length
  if (missing.length > 0) {
    failed = true
    console.error(`validate-task-evidence: ${missing.length} checked item(s) lack evidence in ${task.file}`)
    for (const item of missing) {
      console.error(`  L${item.number}: ${item.line.trim()}`)
    }
  } else {
    console.log(`validate-task-evidence: ${checked.length} checked item(s) have evidence in ${task.file}`)
  }
}

if (failed) process.exit(1)
console.log(`validate-task-evidence: ${totalChecked} checked item(s) have evidence`)
