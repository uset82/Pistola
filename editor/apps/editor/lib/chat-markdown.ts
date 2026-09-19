export type InlineToken =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'bold_italic'; content: string }
  | { type: 'code'; content: string }
  | { type: 'strikethrough'; content: string }
  | { type: 'link'; text: string; href: string }

export type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: { text: string; num?: number }[] }
  | { type: 'code_block'; language: string; code: string }
  | { type: 'blockquote'; text: string }
  | { type: 'horizontal_rule' }
  | { type: 'table'; headers: string[]; rows: string[][] }

/**
 * Tokenizes inline markdown: bold, italic, inline code, links, strikethrough.
 */
export function parseInline(text: string): InlineToken[] {
  if (!text) return []

  const tokens: InlineToken[] = []
  let cursor = 0
  const length = text.length

  const inlineRegex =
    /(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))|(\*\*\*([^*]+)\*\*\*|___([^_]+)___)|(\*\*([^*]+)\*\*|__([^_]+)__)|(\*([^*\s][^*]*[^*\s]|[^*\s])\*|_([^_\s][^_]*[^_\s]|[^_\s])_)|(~~([^~]+)~~)/g

  let match: RegExpExecArray | null = null

  while ((match = inlineRegex.exec(text)) !== null) {
    const matchIndex = match.index

    // Add preceding plain text
    if (matchIndex > cursor) {
      tokens.push({
        type: 'text',
        content: text.slice(cursor, matchIndex),
      })
    }

    if (match[1]) {
      tokens.push({ type: 'code', content: match[2] ?? '' })
    } else if (match[3]) {
      tokens.push({ type: 'link', text: match[4] ?? '', href: match[5] ?? '' })
    } else if (match[6]) {
      tokens.push({ type: 'bold_italic', content: match[7] ?? match[8] ?? '' })
    } else if (match[9]) {
      tokens.push({ type: 'bold', content: match[10] ?? match[11] ?? '' })
    } else if (match[12]) {
      tokens.push({ type: 'italic', content: match[13] ?? match[14] ?? '' })
    } else if (match[15]) {
      tokens.push({ type: 'strikethrough', content: match[16] ?? '' })
    }

    cursor = matchIndex + match[0].length
  }

  // Trailing plain text
  if (cursor < length) {
    tokens.push({
      type: 'text',
      content: text.slice(cursor),
    })
  }

  return tokens
}

/**
 * Checks if a line is a markdown table separator (e.g. |---|:---:|---:|)
 */
function isTableSeparator(line: string): boolean {
  return /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(line.trim())
}

/**
 * Splits a table row into cell strings
 */
function parseTableRow(line: string): string[] {
  const trimmed = line.trim()
  const content = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  return content.split('|').map((cell) => cell.trim())
}

/**
 * Parses markdown text into high-level structured blocks.
 */
export function parseMarkdown(rawText: string): MarkdownBlock[] {
  if (!rawText || !rawText.trim()) return []

  const lines = rawText.split(/\r?\n/)
  const blocks: MarkdownBlock[] = []
  let i = 0

  while (i < lines.length) {
    const rawLine = lines[i]
    if (rawLine === undefined) {
      i++
      continue
    }

    const trimmed = rawLine.trim()

    // 1. Skip empty lines between blocks
    if (!trimmed) {
      i++
      continue
    }

    // 2. Fenced code block
    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length) {
        const curLine = lines[i]
        if (curLine === undefined) break
        if (curLine.trim().startsWith('```')) {
          i++
          break
        }
        codeLines.push(curLine)
        i++
      }
      blocks.push({
        type: 'code_block',
        language,
        code: codeLines.join('\n'),
      })
      continue
    }

    // 3. Horizontal rule
    if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
      blocks.push({ type: 'horizontal_rule' })
      i++
      continue
    }

    // 4. Headings (# Heading)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      })
      i++
      continue
    }

    // 5. Standalone Bold Section Title (e.g. **Resumen de las herramientas...**)
    const boldHeaderMatch = trimmed.match(/^\*\*([^*]+)\*\*\s*$/)
    if (boldHeaderMatch && boldHeaderMatch[1]) {
      blocks.push({
        type: 'heading',
        level: 3,
        text: boldHeaderMatch[1].trim(),
      })
      i++
      continue
    }

    // 6. Blockquote (> quote)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length) {
        const curLine = lines[i]
        if (curLine === undefined || !curLine.trim().startsWith('>')) break
        quoteLines.push(curLine.trim().replace(/^>\s?/, ''))
        i++
      }
      blocks.push({
        type: 'blockquote',
        text: quoteLines.join('\n'),
      })
      continue
    }

    // 7. Markdown Table
    const nextLine = lines[i + 1]
    if (
      trimmed.includes('|') &&
      nextLine !== undefined &&
      isTableSeparator(nextLine)
    ) {
      const headers = parseTableRow(rawLine)
      i += 2 // skip header and separator
      const rows: string[][] = []
      while (i < lines.length) {
        const curLine = lines[i]
        if (curLine === undefined || !curLine.trim().includes('|') || !curLine.trim()) break
        rows.push(parseTableRow(curLine))
        i++
      }
      blocks.push({
        type: 'table',
        headers,
        rows,
      })
      continue
    }

    // 8. Unordered List (- item, * item, + item)
    if (/^\s*[-*+]\s+/.test(rawLine)) {
      const items: { text: string }[] = []
      while (i < lines.length) {
        const curLine = lines[i]
        if (curLine === undefined || !/^\s*[-*+]\s+/.test(curLine)) break
        const itemText = curLine.replace(/^\s*[-*+]\s+/, '').trim()
        items.push({ text: itemText })
        i++

        // Indented continuation
        while (i < lines.length) {
          const contLine = lines[i]
          if (
            contLine !== undefined &&
            contLine.trim() &&
            !/^\s*[-*+]\s+/.test(contLine) &&
            !/^\s*\d+[\.\)]\s+/.test(contLine) &&
            /^\s{2,}/.test(contLine)
          ) {
            const lastItem = items[items.length - 1]
            if (lastItem) {
              lastItem.text += ' ' + contLine.trim()
            }
            i++
          } else {
            break
          }
        }
      }
      blocks.push({
        type: 'list',
        ordered: false,
        items,
      })
      continue
    }

    // 9. Ordered List (1. item, 2. item)
    if (/^\s*\d+[\.\)]\s+/.test(rawLine)) {
      const items: { text: string; num: number }[] = []
      while (i < lines.length) {
        const curLine = lines[i]
        if (curLine === undefined || !/^\s*\d+[\.\)]\s+/.test(curLine)) break
        const match = curLine.match(/^\s*(\d+)[\.\)]\s+(.*)$/)
        if (match && match[1] && match[2]) {
          items.push({
            num: parseInt(match[1], 10),
            text: match[2].trim(),
          })
        }
        i++

        // Indented continuation
        while (i < lines.length) {
          const contLine = lines[i]
          if (
            contLine !== undefined &&
            contLine.trim() &&
            !/^\s*[-*+]\s+/.test(contLine) &&
            !/^\s*\d+[\.\)]\s+/.test(contLine) &&
            /^\s{2,}/.test(contLine)
          ) {
            const lastItem = items[items.length - 1]
            if (lastItem) {
              lastItem.text += ' ' + contLine.trim()
            }
            i++
          } else {
            break
          }
        }
      }
      blocks.push({
        type: 'list',
        ordered: true,
        items,
      })
      continue
    }

    // 10. Regular Paragraph
    const paragraphLines: string[] = []
    while (i < lines.length) {
      const curLine = lines[i]
      if (curLine === undefined) break
      const curTrimmed = curLine.trim()
      if (!curTrimmed) break

      const peekNext = lines[i + 1]
      const isNextTableSep = peekNext !== undefined && isTableSeparator(peekNext)

      if (
        curTrimmed.startsWith('```') ||
        curTrimmed.startsWith('>') ||
        /^(?:---|\*\*\*|___)\s*$/.test(curTrimmed) ||
        /^(#{1,6})\s+/.test(curTrimmed) ||
        /^\*\*([^*]+)\*\*\s*$/.test(curTrimmed) ||
        /^\s*[-*+]\s+/.test(curLine) ||
        /^\s*\d+[\.\)]\s+/.test(curLine) ||
        (curTrimmed.includes('|') && isNextTableSep)
      ) {
        break
      }

      paragraphLines.push(curLine)
      i++
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        text: paragraphLines.join('\n'),
      })
    }
  }

  return blocks
}
