import assert from 'node:assert/strict'
import test from 'node:test'
import { parseInline, parseMarkdown } from './chat-markdown'

test('parseInline extracts bold, italic, code, links, and text', () => {
  const text = 'Hello **world** with *italics* and `code` and [link](https://example.com)'
  const tokens = parseInline(text)

  assert.equal(tokens.length, 8)
  assert.equal(tokens[0]?.type, 'text')
  assert.equal(tokens[0]?.content, 'Hello ')
  assert.equal(tokens[1]?.type, 'bold')
  assert.equal(tokens[1]?.content, 'world')
  assert.equal(tokens[2]?.type, 'text')
  assert.equal(tokens[2]?.content, ' with ')
  assert.equal(tokens[3]?.type, 'italic')
  assert.equal(tokens[3]?.content, 'italics')
  assert.equal(tokens[4]?.type, 'text')
  assert.equal(tokens[4]?.content, ' and ')
  assert.equal(tokens[5]?.type, 'code')
  assert.equal(tokens[5]?.content, 'code')
  assert.equal(tokens[6]?.type, 'text')
  assert.equal(tokens[6]?.content, ' and ')
  assert.equal(tokens[7]?.type, 'link')
  if (tokens[7]?.type === 'link') {
    assert.equal(tokens[7].text, 'link')
    assert.equal(tokens[7].href, 'https://example.com')
  }
})

test('parseMarkdown handles standalone bold title and bulleted list with bold prefixes', () => {
  const screenshotText = `**Resumen de las herramientas CAD disponibles (según el estado actual del espacio de trabajo)**

- **Modo de selección** – Puede seleccionar y manipular objetos existentes (por ejemplo, el casco del barco, las velas, el timón, etc.).
- **Acción de limpieza** – La única acción global disponible actualmente es “clear_level_contents”, que elimina todo el contenido del nivel.
- **Catálogo de activos** – Se proporciona un catálogo pequeño con activos listos para usar (por ejemplo, un termostato). Puede agregar estos elementos al nivel arrastrándolos o colocándolos.
- **Asistente CAD** – El asistente CAD está actualmente activo y listo para ayudar con operaciones de modelado básicas, aunque no se han especificado herramientas específicas (por ejemplo, bocetos, extrusiones, rotaciones, escalados, etc.) en el contexto actual.

En resumen, el entorno CAD actual ofrece un modo de selección, una acción de limpieza y un catálogo de activos; no se muestran otras herramientas CAD específicas en el estado actual del espacio de trabajo.`

  const blocks = parseMarkdown(screenshotText)

  assert.equal(blocks.length, 3)

  // Block 1: Standalone bold header
  assert.equal(blocks[0]?.type, 'heading')
  if (blocks[0]?.type === 'heading') {
    assert.equal(blocks[0].level, 3)
    assert.equal(
      blocks[0].text,
      'Resumen de las herramientas CAD disponibles (según el estado actual del espacio de trabajo)',
    )
  }

  // Block 2: Unordered list with 4 items
  assert.equal(blocks[1]?.type, 'list')
  if (blocks[1]?.type === 'list') {
    assert.equal(blocks[1].ordered, false)
    assert.equal(blocks[1].items.length, 4)
    assert.ok(blocks[1].items[0]?.text.startsWith('**Modo de selección**'))
    assert.ok(blocks[1].items[1]?.text.startsWith('**Acción de limpieza**'))
    assert.ok(blocks[1].items[2]?.text.startsWith('**Catálogo de activos**'))
    assert.ok(blocks[1].items[3]?.text.startsWith('**Asistente CAD**'))

    // Test inline parsing of first item
    const itemTokens = parseInline(blocks[1].items[0]?.text ?? '')
    assert.equal(itemTokens[0]?.type, 'bold')
    assert.equal(itemTokens[0]?.content, 'Modo de selección')
  }

  // Block 3: Summary paragraph
  assert.equal(blocks[2]?.type, 'paragraph')
  if (blocks[2]?.type === 'paragraph') {
    assert.ok(blocks[2].text.startsWith('En resumen, el entorno CAD actual ofrece'))
  }
})

test('parseMarkdown handles code blocks, numbered lists, blockquotes, and tables', () => {
  const markdown = `Here is some text:

\`\`\`typescript
const a = 1
const b = 2
\`\`\`

1. First step
2. Second step

> Note: CAD helper is online.

| Tool | Status |
| --- | --- |
| FreeCAD | Ready |
`

  const blocks = parseMarkdown(markdown)
  assert.equal(blocks.length, 5)

  assert.equal(blocks[0]?.type, 'paragraph')

  assert.equal(blocks[1]?.type, 'code_block')
  if (blocks[1]?.type === 'code_block') {
    assert.equal(blocks[1].language, 'typescript')
    assert.equal(blocks[1].code, 'const a = 1\nconst b = 2')
  }

  assert.equal(blocks[2]?.type, 'list')
  if (blocks[2]?.type === 'list') {
    assert.equal(blocks[2].ordered, true)
    assert.equal(blocks[2].items.length, 2)
    assert.equal(blocks[2].items[0]?.num, 1)
    assert.equal(blocks[2].items[0]?.text, 'First step')
  }

  assert.equal(blocks[3]?.type, 'blockquote')
  if (blocks[3]?.type === 'blockquote') {
    assert.equal(blocks[3].text, 'Note: CAD helper is online.')
  }

  assert.equal(blocks[4]?.type, 'table')
  if (blocks[4]?.type === 'table') {
    assert.deepEqual(blocks[4].headers, ['Tool', 'Status'])
    assert.deepEqual(blocks[4].rows, [['FreeCAD', 'Ready']])
  }
})
