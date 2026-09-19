import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isForbiddenRequest, type ForbiddenHit } from '../forbidden.ts'
import { resolveTarget, workspaceUrl } from '../targets.ts'
import type { PageDriver } from './types.ts'

type PlaywrightPage = {
  url: () => string
  goto: (url: string, options?: { waitUntil?: string; timeout?: number }) => Promise<unknown>
  waitForFunction: (fn: () => unknown, options?: { timeout?: number }) => Promise<unknown>
  locator: (selector: string) => {
    first: () => { screenshot: (options?: { timeout?: number }) => Promise<Buffer> }
  }
  bringToFront: () => Promise<void>
  screenshot: (options?: { type?: string; timeout?: number }) => Promise<Buffer>
  evaluate: (fn: (...args: never[]) => unknown, arg?: unknown) => Promise<unknown>
  on: (event: string, listener: (payload: { method?: () => string; url: () => string }) => void) => void
}

type PlaywrightContext = {
  pages: () => PlaywrightPage[]
  newPage: () => Promise<PlaywrightPage>
  close: () => Promise<void>
  setDefaultTimeout?: (ms: number) => void
}

type PlaywrightBrowser = {
  contexts: () => PlaywrightContext[]
  newContext: (options?: { viewport?: { width: number; height: number } }) => Promise<PlaywrightContext>
  newPage: () => Promise<PlaywrightPage>
  close: () => Promise<void>
}

type Chromium = {
  connectOverCDP: (url: string) => Promise<PlaywrightBrowser>
  launchPersistentContext: (userDataDir: string, options: Record<string, unknown>) => Promise<PlaywrightContext>
}

const loadChromium = async (): Promise<Chromium> => {
  const helper = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../scripts/load-chromium.mjs')
  const mod = await import(pathToFileURL(helper).href)
  return mod.loadChromium()
}

const profileDir = () =>
  process.env.PISTOLA_BROWSER_PROFILE ??
  path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'pistola', 'browser-profile')

const looksLikeSignIn = (url: string) =>
  /\/login\b|\/signin\b|\/auth\b|accounts\.google|clerk\./i.test(url)

export const createBrowserDriver = async (): Promise<PageDriver> => {
  const target = resolveTarget()
  const url = workspaceUrl(target.url)
  const hits: ForbiddenHit[] = []
  const chromium = await loadChromium()
  let browser: PlaywrightBrowser
  let launched = false

  const cdpUrl = process.env.PISTOLA_BROWSER_CDP_URL
  try {
    if (!cdpUrl) throw new Error('launch')
    browser = await chromium.connectOverCDP(cdpUrl)
  } catch {
    launched = true
    const context = await chromium.launchPersistentContext(profileDir(), {
      headless: process.env.PISTOLA_BROWSER_HEADLESS !== '0',
      viewport: { width: 1440, height: 1000 },
      timeout: 60_000,
      args: [
        '--remote-debugging-port=9333',
        '--remote-debugging-address=127.0.0.1',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    })
    context.setDefaultTimeout?.(60_000)
    browser = {
      contexts: () => [context],
      newContext: async () => context,
      newPage: () => context.newPage(),
      close: () => context.close(),
    }
  }

  let page: PlaywrightPage | null = null
  let apiVersion: number | null = null

  const attachAudit = (next: PlaywrightPage) => {
    next.on('request', (request) => {
      const hit = isForbiddenRequest(request.method?.() ?? 'GET', request.url())
      if (hit) hits.push(hit)
    })
  }

  const existingPage = browser.contexts().flatMap((context) => context.pages())[0]
  if (existingPage) {
    page = existingPage
    attachAudit(page)
  }

  const ensurePage = async () => {
    if (page) return page
    const context = browser.contexts()[0] ?? (await browser.newContext({ viewport: { width: 1440, height: 1000 } }))
    page = 'newPage' in context ? await context.newPage() : await browser.newPage()
    attachAudit(page)
    return page
  }

  const open = async () => {
    const next = await ensurePage()
    await next.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    try {
      await next.waitForFunction(
        () => document.documentElement.dataset.pistolaAgent === 'ready',
        { timeout: 45_000 },
      )
    } catch {
      if (looksLikeSignIn(next.url())) {
        return { url: next.url(), apiVersion: 0, signInRequired: true }
      }
      throw new Error(
        `Pistola page API was not ready at ${next.url()}. Stop. Do not fall back to chat.`,
      )
    }
    const probe = (await next.evaluate(() => {
      const api = (window as unknown as { pistola?: { apiVersion?: number; invoke?: unknown } }).pistola
      if (!api?.invoke) return { missing: true, apiVersion: 0 }
      return { missing: false, apiVersion: api.apiVersion ?? 0 }
    })) as { missing: boolean; apiVersion: number }
    if (probe.missing) {
      throw new Error(
        'This deployment lacks window.pistola.invoke. Stop. Do not fall back to chat.',
      )
    }
    apiVersion = probe.apiVersion
    return { url: next.url(), apiVersion: probe.apiVersion, signInRequired: looksLikeSignIn(next.url()) }
  }

  const invoke = async (method: string, args?: unknown) => {
    const next = await ensurePage()
    if (next.url() === 'about:blank') await open()
    return next.evaluate(
      async ([name, payload]) => {
        const api = (window as unknown as { pistola?: { invoke: (method: string, args?: unknown) => Promise<unknown> } })
          .pistola
        if (!api?.invoke) {
          throw new Error('window.pistola.invoke is missing. Stop. Do not fall back to chat.')
        }
        return api.invoke(name, payload)
      },
      [method, args] as [string, unknown],
    )
  }

  return {
    kind: 'browser',
    target: { name: target.name, url },
    get apiVersion() {
      return apiVersion
    },
    forbiddenCount: () => hits.length,
    forbiddenHits: () => [...hits],
    open,
    invoke,
    screenshot: async () => {
      const next = await ensurePage()
      await next.bringToFront()
      await next.waitForFunction(
        () => Boolean(document.querySelector('canvas')),
        { timeout: 20_000 },
      )
      const canvas = next.locator('canvas').first()
      const data = await canvas.screenshot({ type: 'png', timeout: 20_000 })
      return { mime: 'image/png', data: data.toString('base64') }
    },
    close: async () => {
      if (launched) await browser.close()
    },
  }
}
