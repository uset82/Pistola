import { baseUrl, headers } from './drivers/bridge.ts'
import { resolveTarget } from './targets.ts'

export type DoctorCheck = { name: string; ok: boolean; detail: string; warning?: boolean }
export type DoctorReport = { ok: boolean; checks: DoctorCheck[] }

const nodeCheck = (): DoctorCheck => {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
  return {
    name: 'node',
    ok: major > 22 || (major === 22 && minor >= 18),
    detail: `v${process.versions.node} (the server runs .ts directly and needs Node 22.18 or newer)`,
  }
}

export const runDoctor = async (): Promise<DoctorReport> => {
  const checks: DoctorCheck[] = [nodeCheck()]
  const target = resolveTarget()
  if (target.name !== 'local') {
    checks.push({ name: 'target', ok: true, detail: `${target.name} (${target.url}); local editor checks skipped` })
    return { ok: checks.every((check) => check.ok), checks }
  }

  const origin = baseUrl()
  try {
    const response = await fetch(`${origin}/api/workspace/session`, {
      headers: headers(),
      signal: AbortSignal.timeout(4000),
    })
    checks.push({ name: 'editor', ok: true, detail: `${origin} responded ${response.status}` })
    const authOk = response.status !== 401 && response.status !== 403
    checks.push({
      name: 'auth',
      ok: authOk,
      detail: authOk
        ? 'local operator accepted'
        : 'rejected: set PISTOLA_LOCAL_API_TOKEN to the value in editor/apps/editor/.env.local, or sign in',
    })
    const payload = (await response.json().catch(() => ({}))) as { connected?: boolean; session?: { visible?: boolean | null } }
    checks.push({
      name: 'tab',
      ok: payload.connected === true,
      detail: payload.connected === true ? 'a live workspace tab is registered' : `no live tab: open ${origin}/workspace in your browser`,
    })
    if (payload.connected === true && payload.session?.visible === false) {
      checks.push({
        name: 'visible',
        ok: true,
        warning: true,
        detail: 'the Pistola tab is hidden; browsers throttle hidden tabs, so CAD rebuilds may stall. Keep it visible (a separate window is fine).',
      })
    }
  } catch {
    checks.push({
      name: 'editor',
      ok: false,
      detail: `${origin} is unreachable: run "bun run dev:editor" in the editor/ folder`,
    })
  }
  return { ok: checks.every((check) => check.ok), checks }
}

export const formatDoctor = (report: DoctorReport) =>
  [
    ...report.checks.map(
      (check) => `${check.warning ? 'warn' : check.ok ? 'ok  ' : 'FAIL'} ${check.name.padEnd(7)} ${check.detail}`,
    ),
    report.ok ? 'pistola doctor: all checks passed' : 'pistola doctor: some checks failed',
  ].join('\n')
