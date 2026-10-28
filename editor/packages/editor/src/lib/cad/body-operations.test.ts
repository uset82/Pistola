import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'
import type { CadBodyNode, CadBodyOperation } from '@pascal-app/core'
import { bodyOperationsPatch, readBodyOperations } from './body-operations'

const operation = (kind: CadBodyOperation['kind']): CadBodyOperation =>
  ({ id: kind, kind, suppressed: false }) as CadBodyOperation

test('bodyOperationsPatch always writes both keys with the same array', () => {
  const operations = [operation('extrude')]
  const patch = bodyOperationsPatch(operations)

  assert.equal(patch.operations, operations)
  assert.equal(patch.operationHistory, operations)
})

test('readBodyOperations prefers a non-empty operationHistory', () => {
  const body = {
    operations: [operation('extrude')],
    operationHistory: [operation('extrude'), operation('solidcraft_command')],
  } as Pick<CadBodyNode, 'operations' | 'operationHistory'>

  assert.deepEqual(
    readBodyOperations(body).map((entry) => entry.kind),
    ['extrude', 'solidcraft_command'],
  )
})

test('readBodyOperations falls back to operations when history is empty', () => {
  const body = {
    operations: [operation('extrude')],
    operationHistory: [],
  } as Pick<CadBodyNode, 'operations' | 'operationHistory'>

  assert.deepEqual(
    readBodyOperations(body).map((entry) => entry.kind),
    ['extrude'],
  )
})

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)
      ? [path]
      : []
  })

test('every updateNode operations write also supplies operationHistory', () => {
  const violations: string[] = []

  for (const path of sourceFiles(sourceRoot)) {
    const source = readFileSync(path, 'utf8')
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'updateNode'
      ) {
        const patch = node.arguments[1]
        if (patch && ts.isObjectLiteralExpression(patch)) {
          const properties = patch.properties
          const hasOperations = properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              ((ts.isIdentifier(property.name) && property.name.text === 'operations') ||
                (ts.isStringLiteral(property.name) && property.name.text === 'operations')),
          )
          const hasHistory = properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              ((ts.isIdentifier(property.name) && property.name.text === 'operationHistory') ||
                (ts.isStringLiteral(property.name) && property.name.text === 'operationHistory')),
          )
          const usesPatch = properties.some(
            (property) =>
              ts.isSpreadAssignment(property) &&
              property.expression.getText(file).includes('bodyOperationsPatch'),
          )

          if (hasOperations && !hasHistory && !usesPatch) {
            const line = file.getLineAndCharacterOfPosition(patch.getStart(file)).line + 1
            violations.push(`${path}:${line}`)
          }
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(file)
  }

  assert.deepEqual(violations, [])
})
