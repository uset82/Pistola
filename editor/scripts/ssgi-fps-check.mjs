import { loadChromium } from './load-chromium.mjs'

const sampleFps = async (page) => page.evaluate(() => new Promise((resolve) => {
  let frames = 0
  const start = performance.now()
  const tick = (now) => {
    frames += 1
    if (now - start >= 2000) resolve(Math.round((frames * 1000) / (now - start)))
    else requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}))

const open = async (chromium, temporal) => {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--enable-unsafe-webgpu', '--use-angle=d3d11'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  let patched = 0
  if (temporal) {
    await page.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'script') {
        await route.continue()
        return
      }
      const response = await route.fetch()
      const body = await response.text()
      if (!body.includes('useTemporalFiltering')) {
        await route.fulfill({ response, body })
        return
      }
      patched += 1
      const next = body
        .replaceAll('useTemporalFiltering: false', 'useTemporalFiltering: true')
        .replaceAll('useTemporalFiltering:false', 'useTemporalFiltering:true')
        .replaceAll('useTemporalFiltering:!1', 'useTemporalFiltering:!0')
      await route.fulfill({ response, body: next })
    })
  }
  await page.goto('http://127.0.0.1:3002/workspace', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForFunction(() => document.documentElement.dataset.pistolaAgent === 'ready', undefined, { timeout: 60_000 })
  await page.waitForTimeout(1500)
  const fps = await sampleFps(page)
  await browser.close()
  return { fps, patched }
}

const chromium = await loadChromium()
const off = await open(chromium, false)
const on = await open(chromium, true)
console.log(JSON.stringify({ off, on }))
