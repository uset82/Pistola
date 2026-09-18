import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_CAD_HELPER_URL = 'http://127.0.0.1:7878'
const DEFAULT_CAD_HELPER_RUNTIME = 'python'
const CAD_HELPER_START_TIMEOUT_MS = 5_000
const CAD_HELPER_POLL_INTERVAL_MS = 150

export type CadHelperRuntimeMode = 'python' | 'mock' | 'external'

type CadHelperRuntimeState = {
  child: ChildProcess | null
  helperUrl: string | null
  runtimeMode: CadHelperRuntimeMode | null
  startPromise: Promise<void> | null
}

declare global {
  // eslint-disable-next-line no-var
  var __pistolaCadHelperRuntime: CadHelperRuntimeState | undefined
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getCadHelperRuntimeState = (): CadHelperRuntimeState => {
  if (!globalThis.__pistolaCadHelperRuntime) {
    globalThis.__pistolaCadHelperRuntime = {
      child: null,
      helperUrl: null,
      runtimeMode: null,
      startPromise: null,
    }
  }

  return globalThis.__pistolaCadHelperRuntime
}

export function getCadHelperUrl() {
  return process.env.PISTOLA_CAD_HELPER_URL || DEFAULT_CAD_HELPER_URL
}

export function isLoopbackCadHelperUrl(urlValue = DEFAULT_CAD_HELPER_URL) {
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

export function resolveFreecadCmdPath(helperDirectory: string, env = process.env) {
  const configuredPath = env.FREECAD_PATH?.trim()
  if (configuredPath) {
    return existsSync(configuredPath) ? configuredPath : null
  }

  return resolveDefaultFreecadCmdCandidatePaths(helperDirectory).find((candidate) =>
    existsSync(candidate),
  ) || null
}

export function hasIntegratedFreecadCmd(cwd = process.cwd(), env = process.env) {
  const helperDirectory = resolvePythonCadHelperDirectory(cwd)
  if (!helperDirectory) return false
  return Boolean(resolveFreecadCmdPath(helperDirectory, env))
}

export function getCadHelperRuntimeMode(
  env = process.env,
  cwd = process.cwd(),
): CadHelperRuntimeMode {
  const configured = env.PISTOLA_CAD_HELPER_RUNTIME?.trim().toLowerCase()
  if (configured === 'mock' || configured === 'external' || configured === 'python') {
    return configured
  }

  if (!isLoopbackCadHelperUrl(env.PISTOLA_CAD_HELPER_URL || DEFAULT_CAD_HELPER_URL)) {
    return 'external'
  }

  return hasIntegratedFreecadCmd(cwd, env) ? DEFAULT_CAD_HELPER_RUNTIME : 'mock'
}

export function shouldAutoStartManagedCadHelper(env = process.env) {
  const helperUrl = env.PISTOLA_CAD_HELPER_URL || DEFAULT_CAD_HELPER_URL
  return getCadHelperRuntimeMode(env) !== 'external' && isLoopbackCadHelperUrl(helperUrl)
}

export function resolveBundledCadHelperScript(cwd = process.cwd()) {
  const candidates = [
    path.resolve(cwd, 'tooling', 'cad-helper', 'server.mjs'),
    path.resolve(cwd, '..', 'tooling', 'cad-helper', 'server.mjs'),
    path.resolve(cwd, '..', '..', 'tooling', 'cad-helper', 'server.mjs'),
  ]

  return candidates.find((candidate) => existsSync(candidate)) || null
}

export function resolvePythonCadHelperDirectory(cwd = process.cwd()) {
  const candidates = [
    path.resolve(cwd, 'tooling', 'freecad-helper'),
    path.resolve(cwd, '..', 'tooling', 'freecad-helper'),
    path.resolve(cwd, '..', '..', 'tooling', 'freecad-helper'),
    path.resolve(cwd, '..', '..', '..', 'tooling', 'freecad-helper'),
    path.resolve(cwd, 'cad-helper'),
    path.resolve(cwd, '..', 'cad-helper'),
    path.resolve(cwd, '..', '..', 'cad-helper'),
    path.resolve(cwd, '..', '..', '..', 'cad-helper'),
  ]

  return (
    candidates.find((candidate) => existsSync(path.join(candidate, 'main.py'))) || null
  )
}

const isCadHelperHealthy = async (helperUrl: string) => {
  try {
    const response = await fetch(`${helperUrl}/health`, {
      cache: 'no-store',
    })
    return response.ok
  } catch {
    return false
  }
}

const waitForCadHelper = async (helperUrl: string) => {
  const deadline = Date.now() + CAD_HELPER_START_TIMEOUT_MS
  let lastError: string | null = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${helperUrl}/health`, {
        cache: 'no-store',
      })
      if (response.ok) {
        return
      }
      lastError = `Health check returned ${response.status}.`
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown health check failure.'
    }

    await wait(CAD_HELPER_POLL_INTERVAL_MS)
  }

  throw new Error(
    lastError
      ? `CAD helper did not become ready at ${helperUrl}. ${lastError}`
      : `CAD helper did not become ready at ${helperUrl}.`,
  )
}

type ManagedCadHelperSpawnCandidate = {
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

const resolveDefaultFreecadCmdCandidatePaths = (helperDirectory: string) => {
  const freecadRoot = path.resolve(helperDirectory, '..', '..', 'third_party', 'FreeCAD')
  const userProfile = process.env.USERPROFILE || ''
  return [
    path.join(userProfile, 'AppData', 'Local', 'Programs', 'FreeCAD', 'FreeCAD_1.1.3-Windows-x86_64-py311', 'bin', 'freecadcmd.exe'),
    path.join(userProfile, 'AppData', 'Local', 'Programs', 'FreeCAD', 'bin', 'FreeCADCmd.exe'),
    'C:\\Program Files\\FreeCAD 1.1\\bin\\FreeCADCmd.exe',
    'C:\\Program Files\\FreeCAD\\bin\\FreeCADCmd.exe',
    path.join(freecadRoot, 'build', 'release', 'bin', 'FreeCADCmd.exe'),
    path.join(freecadRoot, 'build', 'Release', 'bin', 'FreeCADCmd.exe'),
    path.join(freecadRoot, 'build', 'debug', 'bin', 'FreeCADCmd.exe'),
    path.join(freecadRoot, 'build', 'Debug', 'bin', 'FreeCADCmd.exe'),
    path.join(freecadRoot, 'build', 'bin', 'FreeCADCmd.exe'),
    path.join(freecadRoot, '.pixi', 'envs', 'default', 'Library', 'bin', 'FreeCADCmd.exe'),
  ]
}

const ensureFreecadCmdAvailable = (
  helperDirectory: string,
  env = process.env,
) => {
  const resolvedPath = resolveFreecadCmdPath(helperDirectory, env)
  if (resolvedPath) return resolvedPath

  const configuredPath = env.FREECAD_PATH?.trim()
  if (configuredPath) {
    throw new Error(`FREECAD_PATH must point to FreeCADCmd.exe. Current value not found: ${configuredPath}`)
  }

  throw new Error(
    `FREECAD_PATH is not set and no integrated FreeCAD executable was found. Checked: ${resolveDefaultFreecadCmdCandidatePaths(helperDirectory).join(', ')}. Build editor/third_party/FreeCAD or set FREECAD_PATH explicitly.`,
  )
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
  /exited before becoming ready \(9009\)|not recognized|not found|no such file|appkjøringsaliaser/i.test(
    message,
  )

const waitForManagedCadHelper = async (
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

    void waitForCadHelper(helperUrl)
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

const getManagedCadHelperCandidates = (
  runtimeMode: CadHelperRuntimeMode,
  helperUrl: string,
  cwd = process.cwd(),
): ManagedCadHelperSpawnCandidate[] => {
  const helperUrlObject = new URL(helperUrl)
  const helperPort = helperUrlObject.port || '7878'

  if (runtimeMode === 'mock') {
    const helperScript = resolveBundledCadHelperScript(cwd)
    if (!helperScript) {
      throw new Error('Bundled CAD helper entrypoint was not found at editor/tooling/cad-helper/server.mjs.')
    }

    return [
      {
        command: process.execPath,
        args: [helperScript],
        cwd: path.dirname(helperScript),
        label: 'Bundled mock CAD helper',
      },
    ]
  }

  const helperDirectory = resolvePythonCadHelperDirectory(cwd)
  if (!helperDirectory) {
    throw new Error(
      'Python CAD helper entrypoint was not found at editor/tooling/freecad-helper.',
    )
  }
  ensureFreecadCmdAvailable(helperDirectory)

  const venvCandidates = [
    path.resolve(cwd, '.venv', 'Scripts', 'python.exe'),
    path.resolve(cwd, '..', '.venv', 'Scripts', 'python.exe'),
    path.resolve(cwd, '..', '..', '.venv', 'Scripts', 'python.exe'),
  ]
  const venvPython = venvCandidates.find((candidate) => existsSync(candidate))

  return [
    ...(venvPython
      ? [
          {
            command: venvPython,
            args: ['-m', 'uvicorn', 'main:app', '--host', helperUrlObject.hostname, '--port', helperPort],
            cwd: helperDirectory,
            label: 'Python CAD helper (.venv)',
          },
        ]
      : []),
    {
      command: resolveWindowsPyLauncher(),
      args: ['-3', '-m', 'uvicorn', 'main:app', '--host', helperUrlObject.hostname, '--port', helperPort],
      cwd: helperDirectory,
      label: 'Python CAD helper (py -3)',
    },
    {
      command: 'python',
      args: ['-m', 'uvicorn', 'main:app', '--host', helperUrlObject.hostname, '--port', helperPort],
      cwd: helperDirectory,
      label: 'Python CAD helper (python)',
    },
    {
      command: 'python3',
      args: ['-m', 'uvicorn', 'main:app', '--host', helperUrlObject.hostname, '--port', helperPort],
      cwd: helperDirectory,
      label: 'Python CAD helper (python3)',
    },
  ]
}

const startManagedCadHelper = async (
  helperUrl: string,
  runtimeMode: CadHelperRuntimeMode,
) => {
  const runtimeState = getCadHelperRuntimeState()
  if (runtimeState.startPromise) {
    await runtimeState.startPromise
    return
  }

  const helperUrlObject = new URL(helperUrl)
  const helperPort = helperUrlObject.port || '7878'
  const candidates = getManagedCadHelperCandidates(runtimeMode, helperUrl)

  runtimeState.startPromise = new Promise<void>((resolve, reject) => {
    void (async () => {
      let lastError: Error | null = null

      for (const candidate of candidates) {
        const child = spawn(candidate.command, candidate.args, {
          cwd: candidate.cwd,
          env: {
            ...process.env,
            PISTOLA_CAD_HELPER_HOST: helperUrlObject.hostname,
            PISTOLA_CAD_HELPER_PORT: helperPort,
            PISTOLA_CAD_HELPER_URL: helperUrl,
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
          await waitForManagedCadHelper(child, helperUrl, candidate.label)
          resolve()
          return
        } catch (error) {
          const startupLog = getStartupLog()
          lastError =
            error instanceof Error
              ? new Error(
                  startupLog ? `${error.message} ${startupLog}` : error.message,
                )
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

      reject(lastError || new Error('CAD helper failed to start.'))
    })()
  })

  try {
    await runtimeState.startPromise
  } finally {
    runtimeState.startPromise = null
  }
}

export async function ensureCadHelperAvailable() {
  const helperUrl = getCadHelperUrl()
  const runtimeMode = getCadHelperRuntimeMode()

  if (await isCadHelperHealthy(helperUrl)) {
    return
  }

  if (!shouldAutoStartManagedCadHelper()) {
    return
  }

  const runtimeState = getCadHelperRuntimeState()
  if (
    runtimeState.child &&
    runtimeState.child.exitCode === null &&
    runtimeState.helperUrl === helperUrl &&
    runtimeState.runtimeMode === runtimeMode
  ) {
    await waitForCadHelper(helperUrl)
    return
  }

  await startManagedCadHelper(helperUrl, runtimeMode)
}

export async function fetchCadHelper(pathname: string, init?: RequestInit) {
  await ensureCadHelperAvailable()

  const headers = new Headers(init?.headers)
  if (!(init?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(`${getCadHelperUrl()}${pathname}`, {
    ...init,
    cache: 'no-store',
    headers,
  })
}

export async function proxyCadHelper(pathname: string, init?: RequestInit) {
  const response = await fetchCadHelper(pathname, init)
  const text = await response.text()
  return new Response(text, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
