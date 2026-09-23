import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

export type McpLogEntry = {
  ts: string
  tool: string
  ok: boolean
  error: string | null
  code: string | number | null
  ms: number
  client?: string
}

export const errorCodeFromText = (text: string | undefined, isError: boolean): string | number | null => {
  if (!isError) return null
  if (!text) return 'ERROR'
  try {
    const parsed = JSON.parse(text) as { code?: string | number; error?: string }
    if (parsed.code !== undefined) return parsed.code
    if (typeof parsed.error === 'string' && parsed.error.length > 0) return parsed.error
  } catch {
    // keep generic
  }
  return 'ERROR'
}

export const appendMcpLog = async (entry: McpLogEntry) => {
  const dest = process.env.PISTOLA_MCP_LOG
  if (!dest) return
  await mkdir(path.dirname(dest), { recursive: true })
  await appendFile(dest, `${JSON.stringify(entry)}\n`)
}
