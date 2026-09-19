#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { replayActions } from './lib/replay-actions.mjs'
import { scoreScene, summarizeScores } from './lib/score-core.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const args = process.argv.slice(2)
const fromRel = args.includes('--from') ? args[args.indexOf('--from') + 1] : 'docs/tasks/evidence/creation-quality/baseline'
const fromDir = path.resolve(repoRoot, fromRel)
const prompts = JSON.parse(await readFile(path.join(here, 'prompts.json'), 'utf8'))
const promptBySlug = new Map(
  [...prompts.dev, ...prompts.heldOut].map((item) => [item.slug, item]),
)

const sceneDir = path.join(fromDir, 'scenes')
const files = (await readdir(sceneDir).catch(() => [])).filter((name) => name.endsWith('.json'))
if (files.length === 0) {
  console.error(`score.mjs: no scenes in ${sceneDir}`)
  process.exit(1)
}

const runs = []
for (const file of files) {
  const payload = JSON.parse(await readFile(path.join(sceneDir, file), 'utf8'))
  const slug = payload.score?.slug ?? file.replace(/\.json$/, '')
  const prompt = payload.prompt ?? promptBySlug.get(slug.replace(/-today-e2e$/, '')) ?? null
  const gold = payload.gold?.parts
    ? payload.gold
    : JSON.parse(await readFile(path.join(here, 'gold', `${(prompt?.slug ?? slug).replace(/-today-e2e$/, '')}.json`), 'utf8'))
  const sceneParts = payload.scene?.parts ?? replayActions(payload.scene?.actions ?? []).parts
  const scored = scoreScene({
    slug,
    set: payload.score?.set ?? prompt?.set ?? 'dev',
    prompt,
    goldParts: gold.parts,
    sceneParts,
    runnableFirstTry: payload.score?.runnableFirstTry === 1,
    runnableFinal: payload.score?.runnableFinal === 1,
    retriesPerPart: payload.score?.retriesPerPart ?? 0,
    toolCalls: payload.score?.toolCalls ?? 0,
    timeMs: payload.score?.timeMs ?? 0,
    rubric: payload.score?.rubric ?? null,
  })
  runs.push(scored)
}

const goldRuns = runs.filter((run) => !String(run.slug).includes('today'))
const scores = {
  generatedAt: new Date().toISOString(),
  rescoredFrom: path.relative(repoRoot, fromDir).replaceAll('\\', '/'),
  summary: summarizeScores(goldRuns),
  runs,
}
await writeFile(path.join(fromDir, 'scores.json'), `${JSON.stringify(scores, null, 2)}\n`)
console.log(JSON.stringify({ ok: true, from: fromDir, summary: scores.summary }, null, 2))
