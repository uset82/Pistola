import assert from 'node:assert/strict'
import test from 'node:test'
import { capabilities, capabilityMap } from './registry'
import { manualOnlyAllowlist, runCoverageAudit } from './audit'
import { assistantActionTypeValues } from '../types'

test('Capability Registry includes all 82 baseline action types and new capabilities', () => {
  assert.ok(capabilities.length >= 82, `expected >= 82 capabilities, got ${capabilities.length}`)

  // Verify all existing assistantActionTypeValues are in the registry
  for (const actionType of assistantActionTypeValues) {
    const cap = capabilityMap.get(actionType)
    assert.ok(cap, `action type ${actionType} must be registered in capability registry`)
    assert.equal(cap.type, actionType)
    assert.ok(cap.describe.length > 0, `capability ${actionType} must have a description`)
  }
})

test('Coverage Gate: all audited tool-manager tools and command-palette items are covered or allowlisted', () => {
  const audit = runCoverageAudit()

  // Verify tool manager coverage
  for (const gap of audit.toolsAudit.gaps) {
    assert.fail(`Uncovered tool found in ToolManager without assistant mapping: ${gap.name}`)
  }

  // Verify command palette coverage
  for (const gap of audit.paletteAudit.gaps) {
    if (gap.name && !manualOnlyAllowlist.has(gap.name)) {
      // Known surface gaps targeted for Phase 1 are explicitly tracked
      const isKnownGap = audit.knownGaps.some((k: { type: string }) => k.type === gap.name || gap.reason.includes(k.type))
      assert.ok(
        isKnownGap,
        `Unexpected uncovered command palette action not in allowlist or known gaps: ${gap.name}`,
      )
    }
  }

  // Verify registry has unique types
  const typesSet = new Set<string>()
  for (const cap of capabilities) {
    assert.ok(!typesSet.has(cap.type), `duplicate capability type in registry: ${cap.type}`)
    typesSet.add(cap.type)
  }
})

test('All registered capabilities have valid schemas and domains', () => {
  const validDomains = new Set([
    'workspace',
    'viewer',
    'structure',
    'furnish',
    'transform',
    'cad',
    'history/export',
  ])

  for (const cap of capabilities) {
    assert.ok(validDomains.has(cap.domain), `invalid domain ${cap.domain} for ${cap.type}`)
    assert.ok(cap.schema, `missing schema for capability ${cap.type}`)
    assert.ok(typeof cap.describe === 'string' && cap.describe.length > 5, `insufficient description for ${cap.type}`)
  }
})
