import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_MAC_HELPER_URL = 'http://127.0.0.1:7879'
const DEFAULT_MAC_HELPER_RUNTIME = 'python'
const MAC_HELPER_START_TIMEOUT_MS = 8_000
const MAC_HELPER_POLL_INTERVAL_MS = 150

export type MacHelperRuntimeMode = 'python' | 'mock' | 'external'

type MacHelperRuntimeState = {
  child: ChildProcess | null
  helperUrl: string | null
  runtimeMode: MacHelperRuntimeMode | null
  startPromise: Promise<void> | null
}

declare global {
  // eslint-disable-next-line no-var
  var __pistolaMacHelperRuntime: MacHelperRuntimeState | undefined
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getMacHelperRuntimeState = (): MacHelperRuntimeState => {
  if (!globalThis.__pistolaMacHelperRuntime) {
    globalThis.__pistolaMacHelperRuntime = {
      child: null,
      helperUrl: null,
      runtimeMode: null,
      startPromise: null,
    }
  }

  return globalThis.__pistolaMacHelperRuntime
}

export function getMacHelperUrl() {
  return process.env.PISTOLA_MAC_HELPER_URL || DEFAULT_MAC_HELPER_URL
}

export function isLoopbackMacHelperUrl(urlValue = DEFAULT_MAC_HELPER_URL) {
  try {
    const helperUrl = new URL(urlValue)
    return (
      helperUrl.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '::1'].includes(helperUrl.hostname)
    )
  } catch {
    return false
  }
}

export function getMacHelperRuntimeMode(env = process.env): MacHelperRuntimeMode {
  const configured = env.PISTOLA_MAC_HELPER_RUNTIME?.trim().toLowerCase()
  if (configured === 'mock' || configured === 'external' || configured === 'python') {
    return configured
  }

  return isLoopbackMacHelperUrl(env.PISTOLA_MAC_HELPER_URL || DEFAULT_MAC_HELPER_URL)
    ? DEFAULT_MAC_HELPER_RUNTIME
    : 'external'
}

export function shouldAutoStartManagedMacHelper(env = process.env) {
  const helperUrl = env.PISTOLA_MAC_HELPER_URL || DEFAULT_MAC_HELPER_URL
  return getMacHelperRuntimeMode(env) !== 'external' && isLoopbackMacHelperUrl(helperUrl)
}

export function resolvePythonMacHelperDirectory(cwd = process.cwd()) {
  const candidates = [
    path.resolve(cwd, 'tooling', 'mac-helper'),
    path.resolve(cwd, '..', 'tooling', 'mac-helper'),
    path.resolve(cwd, '..', '..', 'tooling', 'mac-helper'),
    path.resolve(cwd, '..', '..', '..', 'tooling', 'mac-helper'),
  ]

  return candidates.find((candidate) => existsSync(path.join(candidate, 'main.py'))) || null
}

const isMacHelperHealthy = async (helperUrl: string) => {
  try {
    const response = await fetch(`${helperUrl}/health`, { cache: 'no-store' })
    return response.ok
  } catch {
    return false
  }
}

const waitForMacHelper = async (helperUrl: string) => {
  const deadline = Date.now() + MAC_HELPER_START_TIMEOUT_MS
  let lastError: string | null = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${helperUrl}/health`, { cache: 'no-store' })
      if (response.ok) {
        return
      }
      lastError = `Health check returned ${response.status}.`
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown health check failure.'
    }

    await wait(MAC_HELPER_POLL_INTERVAL_MS)
  }

  throw new Error(
    lastError
      ? `MAC helper did not become ready at ${helperUrl}. ${lastError}`
      : `MAC helper did not become ready at ${helperUrl}.`,
  )
}

type ManagedMacHelperSpawnCandidate = {
  command: string
  args: string[]
  cwd: string
  label: string
}

const resolveWindowsPyLauncher = () => {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  const launcherPath = path.join(systemRoot, 'py.exe')
  return existsSync(launcherPath) ? launcherPath : 'py'
}

const attachStartupLogCapture = (child: ChildProcess) => {
  const stderrChunks: string[] = []
  const stdoutChunks: string[] = []
  const capture = (chunks: string[], chunk: string) => {
    chunks.push(chunk)
    while (chunks.join('').length > 2000) {
      chunks.shift()
    }
  }

  child.stderr?.setEncoding('utf8')
  child.stdout?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => capture(stderrChunks, chunk))
  child.stdout?.on('data', (chunk: string) => capture(stdoutChunks, chunk))

  return () => {
    const stderr = stderrChunks.join('').trim()
    const stdout = stdoutChunks.join('').trim()
    return stderr || stdout || null
  }
}

const isMissingInterpreterError = (message: string) =>
  /exited before becoming ready \(9009\)|not recognized|not found|no such file/i.test(message)

const waitForManagedMacHelper = async (
  child: ChildProcess,
  helperUrl: string,
  label: string,
) => {
  await new Promise<void>((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      child.removeListener('error', onError)
      child.removeListener('exit', onExit)
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (child.exitCode === null) {
        child.kill()
      }
      reject(error)
    }

    const onError = (error: Error) => {
      fail(new Error(`${label} failed to start. ${error.message}`))
    }

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      fail(new Error(`${label} exited before becoming ready (${code ?? signal ?? 'unknown'}).`))
    }

    child.once('error', onError)
    child.once('exit', onExit)

    void waitForMacHelper(helperUrl)
      .then(() => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      })
      .catch((error) => {
        fail(
          error instanceof Error
            ? error
            : new Error(`${label} failed to become ready.`),
        )
      })
  })
}

const getManagedMacHelperCandidates = (
  helperUrl: string,
  cwd = process.cwd(),
): ManagedMacHelperSpawnCandidate[] => {
  const helperUrlObject = new URL(helperUrl)
  const helperPort = helperUrlObject.port || '7879'
  const helperDirectory = resolvePythonMacHelperDirectory(cwd)
  if (!helperDirectory) {
    throw new Error('Python MAC helper entrypoint was not found at editor/tooling/mac-helper.')
  }

  const venvCandidates = [
    path.resolve(cwd, '.venv', 'Scripts', 'python.exe'),
    path.resolve(cwd, '..', '.venv', 'Scripts', 'python.exe'),
    path.resolve(helperDirectory, '.venv', 'Scripts', 'python.exe'),
    path.resolve(helperDirectory, '.venv', 'bin', 'python'),
  ]
  const venvPython = venvCandidates.find((candidate) => existsSync(candidate))

  return [
    ...(venvPython
      ? [
          {
            command: venvPython,
            args: [
              '-m',
              'uvicorn',
              'main:app',
              '--host',
              helperUrlObject.hostname,
              '--port',
              helperPort,
            ],
            cwd: helperDirectory,
            label: 'Python MAC helper (.venv)',
          },
        ]
      : []),
    {
      command: resolveWindowsPyLauncher(),
      args: [
        '-3',
        '-m',
        'uvicorn',
        'main:app',
        '--host',
        helperUrlObject.hostname,
        '--port',
        helperPort,
      ],
      cwd: helperDirectory,
      label: 'Python MAC helper (py -3)',
    },
    {
      command: 'python',
      args: [
        '-m',
        'uvicorn',
        'main:app',
        '--host',
        helperUrlObject.hostname,
        '--port',
        helperPort,
      ],
      cwd: helperDirectory,
      label: 'Python MAC helper (python)',
    },
    {
      command: 'python3',
      args: [
        '-m',
        'uvicorn',
        'main:app',
        '--host',
        helperUrlObject.hostname,
        '--port',
        helperPort,
      ],
      cwd: helperDirectory,
      label: 'Python MAC helper (python3)',
    },
  ]
}

const startManagedMacHelper = async (helperUrl: string, runtimeMode: MacHelperRuntimeMode) => {
  const runtimeState = getMacHelperRuntimeState()
  if (runtimeState.startPromise) {
    await runtimeState.startPromise
    return
  }

  const helperUrlObject = new URL(helperUrl)
  const helperPort = helperUrlObject.port || '7879'
  const candidates = getManagedMacHelperCandidates(helperUrl)

  runtimeState.startPromise = new Promise<void>((resolve, reject) => {
    void (async () => {
      let lastError: Error | null = null

      for (const candidate of candidates) {
        const child = spawn(candidate.command, candidate.args, {
          cwd: candidate.cwd,
          env: {
            ...process.env,
            PISTOLA_MAC_HELPER_HOST: helperUrlObject.hostname,
            PISTOLA_MAC_HELPER_PORT: helperPort,
            PISTOLA_MAC_HELPER_URL: helperUrl,
            PISTOLA_MAC_HELPER_RUNTIME: runtimeMode,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })
        child.unref()
        const getStartupLog = attachStartupLogCapture(child)

        runtimeState.child = child
        runtimeState.helperUrl = helperUrl
        runtimeState.runtimeMode = runtimeMode

        try {
          await waitForManagedMacHelper(child, helperUrl, candidate.label)
          resolve()
          return
        } catch (error) {
          const startupLog = getStartupLog()
          lastError =
            error instanceof Error
              ? new Error(startupLog ? `${error.message} ${startupLog}` : error.message)
              : new Error(
                  startupLog
                    ? `${candidate.label} failed to become ready. ${startupLog}`
                    : `${candidate.label} failed to become ready.`,
                )

          if (lastError && !isMissingInterpreterError(lastError.message)) {
            reject(lastError)
            return
          }

          if (runtimeState.child?.pid === child.pid) {
            runtimeState.child = null
            runtimeState.helperUrl = null
            runtimeState.runtimeMode = null
          }
        }
      }

      reject(lastError || new Error('MAC helper failed to start.'))
    })()
  })

  try {
    await runtimeState.startPromise
  } finally {
    runtimeState.startPromise = null
  }
}

export async function ensureMacHelperAvailable() {
  const helperUrl = getMacHelperUrl()
  const runtimeMode = getMacHelperRuntimeMode()

  if (await isMacHelperHealthy(helperUrl)) {
    return
  }

  if (!shouldAutoStartManagedMacHelper()) {
    return
  }

  const runtimeState = getMacHelperRuntimeState()
  if (
    runtimeState.child &&
    runtimeState.child.exitCode === null &&
    runtimeState.helperUrl === helperUrl &&
    runtimeState.runtimeMode === runtimeMode
  ) {
    await waitForMacHelper(helperUrl)
    return
  }

  await startManagedMacHelper(helperUrl, runtimeMode)
}

export async function fetchMacHelper(pathname: string, init?: RequestInit) {
  await ensureMacHelperAvailable()

  const headers = new Headers(init?.headers)
  if (!(init?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(`${getMacHelperUrl()}${pathname}`, {
    ...init,
    cache: 'no-store',
    headers,
  })
}
