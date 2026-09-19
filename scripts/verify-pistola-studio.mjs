import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const skillsDir = resolve(root, '.agents/skills')
const agentsDir = resolve(root, '.codex/agents')

const skillNames = readdirSync(skillsDir)
for (const name of skillNames) {
  const text = readFileSync(resolve(skillsDir, name, 'SKILL.md'), 'utf8')
  if (!text.startsWith('---')) throw new Error(`${name} is missing frontmatter`)
  if (!/^name:\s+\S+/m.test(text)) throw new Error(`${name} is missing name`)
  if (!/^description:\s+\S+/m.test(text)) throw new Error(`${name} is missing description`)
}

for (const file of readdirSync(agentsDir).filter((name) => name.endsWith('.toml'))) {
  const parsed = spawnSync(
    'python',
    [
      '-c',
      'import sys, tomllib; tomllib.loads(open(sys.argv[1], encoding="utf-8").read()); print("ok")',
      resolve(agentsDir, file),
    ],
    { encoding: 'utf8' },
  )
  if (parsed.status !== 0) throw new Error(`${file} is not valid TOML: ${parsed.stderr || parsed.stdout}`)
  const text = readFileSync(resolve(agentsDir, file), 'utf8')
  for (const field of ['name', 'description', 'developer_instructions']) {
    if (!text.includes(`${field} =`) && !text.includes(`${field}=`)) {
      throw new Error(`${file} is missing ${field}`)
    }
  }
}

const resolveRef = (schema, rootSchema) => {
  if (!schema?.$ref) return schema
  const path = schema.$ref.replace('#/', '').split('/')
  return path.reduce((node, key) => node?.[key], rootSchema)
}

const validate = (value, schema, rootSchema, path) => {
  const resolved = resolveRef(schema, rootSchema)
  if (!resolved) throw new Error(`${path}: unresolved $ref ${schema.$ref}`)

  if (Array.isArray(resolved.type)) {
    const ok = resolved.type.some((type) => {
      if (type === 'null') return value === null
      if (type === 'string') return typeof value === 'string'
      if (type === 'number') return typeof value === 'number'
      if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
      if (type === 'array') return Array.isArray(value)
      return false
    })
    if (!ok) throw new Error(`${path}: expected ${resolved.type.join('|')}`)
  } else if (resolved.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${path}: expected object`)
    }
    for (const key of resolved.required ?? []) {
      if (!(key in value)) throw new Error(`${path}: missing ${key}`)
    }
    if (resolved.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!resolved.properties?.[key]) throw new Error(`${path}: unexpected ${key}`)
      }
    }
    for (const [key, child] of Object.entries(value)) {
      const childSchema = resolved.properties?.[key] ?? (resolved.additionalProperties && resolved.additionalProperties !== true ? resolved.additionalProperties : null)
      if (childSchema) validate(child, childSchema, rootSchema, `${path}.${key}`)
    }
  } else if (resolved.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`${path}: expected array`)
    if (resolved.minItems && value.length < resolved.minItems) throw new Error(`${path}: too short`)
    if (resolved.maxItems && value.length > resolved.maxItems) throw new Error(`${path}: too long`)
    value.forEach((item, index) => {
      if (resolved.items) validate(item, resolved.items, rootSchema, `${path}[${index}]`)
    })
  } else if (resolved.type === 'string' && typeof value !== 'string') {
    throw new Error(`${path}: expected string`)
  } else if (resolved.type === 'number' && typeof value !== 'number') {
    throw new Error(`${path}: expected number`)
  }

  if (resolved.enum && !resolved.enum.includes(value)) throw new Error(`${path}: invalid enum`)
  if (resolved.pattern && typeof value === 'string' && !new RegExp(resolved.pattern).test(value)) {
    throw new Error(`${path}: failed pattern`)
  }
  if (typeof resolved.exclusiveMinimum === 'number' && !(value > resolved.exclusiveMinimum)) {
    throw new Error(`${path}: exclusiveMinimum`)
  }
  if (resolved.minLength && typeof value === 'string' && value.length < resolved.minLength) {
    throw new Error(`${path}: minLength`)
  }
  for (const clause of resolved.allOf ?? []) {
    if (clause.if?.properties) {
      const matches = Object.entries(clause.if.properties).every(([key, expected]) => {
        if (expected.const !== undefined) return value[key] === expected.const
        return true
      })
      if (matches && clause.then?.required) {
        for (const key of clause.then.required) {
          if (!(key in value)) throw new Error(`${path}: missing ${key} for ${JSON.stringify(clause.if.properties)}`)
        }
      }
    }
  }
}

const schema = JSON.parse(
  readFileSync(resolve(root, '.agents/skills/pistola-image-to-blueprint/references/blueprint.schema.json'), 'utf8'),
)
const sample = JSON.parse(
  readFileSync(resolve(root, '.agents/skills/pistola-image-to-blueprint/references/sample-blueprint.json'), 'utf8'),
)
validate(sample, schema, schema, '$')

const python = spawnSync(
  'python',
  [resolve(root, '.agents/skills/pistola-image-to-blueprint/scripts/trace_silhouette.py'), 'self-test'],
  { encoding: 'utf8' },
)
if (python.status !== 0) {
  throw new Error(python.stderr || python.stdout || 'trace_silhouette self-test failed')
}

console.log(
  JSON.stringify(
    {
      skills: skillNames.length,
      agents: readdirSync(agentsDir).length,
      blueprint: sample.slug,
      silhouette: 'ok',
    },
    null,
    2,
  ),
)
