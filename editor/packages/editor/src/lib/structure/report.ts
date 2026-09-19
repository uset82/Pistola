export type StructureSeverity = 'error' | 'warning'

export type StructureFix = {
  hint: string
  patch?: Record<string, unknown>
}

export type StructureIssue = {
  code: string
  severity: StructureSeverity
  actionIndex?: number
  specPath?: string
  partId: string
  otherPartId?: string
  measured: Record<string, number | string>
  fix?: StructureFix
}

export type StructureReport = {
  ok: boolean
  errorCount: number
  warningCount: number
  issues: StructureIssue[]
  partCount: number
  tolerance: number
}

export const finalizeReport = (issues: StructureIssue[], partCount: number, tolerance: number): StructureReport => {
  const ranked = [...issues]
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1
      return a.code.localeCompare(b.code)
    })
    .slice(0, 20)
  const errorCount = ranked.filter((issue) => issue.severity === 'error').length
  return {
    ok: errorCount === 0,
    errorCount,
    warningCount: ranked.length - errorCount,
    issues: ranked,
    partCount,
    tolerance,
  }
}
