import assert from 'node:assert/strict'

import { chromium } from 'playwright'

const BASE_URL = process.env.PISTOLA_BROWSER_BASE_URL ?? 'http://127.0.0.1:3002'
const HOUSE_PROMPT = 'make a small house with 2 bedrooms, kitchen, living room, all furnished'
const STOP_PROMPT = 'browser stop running task plan'
const RETRY_PROMPT = 'browser retry failing step'
const CANCEL_PROMPT = 'browser cancel running task plan'
const PET_HOUSE_PROMPT = 'genera una casita para mi perro'

const buildTaskPlanTurn = (reply, steps) => ({
  reply,
  mode: 'task-plan',
  assumptions: [],
  ambiguities: [],
  actions: [],
  requiresReview: true,
  destructiveActionCount: 0,
  steps,
})

const buildLargeBrowserTaskPlan = (count) =>
  buildTaskPlanTurn(
    'I will build the shell first, then layout openings, then furnish it.',
    Array.from({ length: count }, (_, index) => ({
      description: `Browser step ${index + 1}`,
      agent: index % 3 === 0 ? 'structure' : index % 3 === 1 ? 'layout' : 'furnish',
      actions: [
        index % 2 === 0
          ? { type: 'set_grid_visibility', enabled: index % 4 === 0 }
          : { type: 'set_guides_visibility', enabled: index % 4 !== 0 },
      ],
    })),
  )

const retryTaskPlan = buildTaskPlanTurn('I split the fix into explicit steps.', [
  {
    description: 'Prepare the workspace',
    agent: 'structure',
    actions: [{ type: 'set_phase', phase: 'structure' }],
  },
  {
    description: 'Add impossible window',
    agent: 'layout',
    actions: [{ type: 'place_window', wallId: 'missing_wall', localX: 1, localY: 1.4, width: 1.2, height: 1.1 }],
  },
])

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const resetChat = async (page) => {
  const newChatButton = page.locator('[data-testid="assistant-new-chat"]')
  if (await newChatButton.isVisible().catch(() => false)) {
    await waitFor(
      async () => await newChatButton.isEnabled(),
      { timeout: 30000, errorMessage: 'New Chat button never became enabled.' },
    )
    await newChatButton.click({ noWaitAfter: true })
  }
}

const fillAndSend = async (page, prompt) => {
  const input = page.locator('[data-testid="assistant-input"]')
  await input.fill(prompt)
  await page.locator('[data-testid="assistant-send"]').click({ noWaitAfter: true })
}

const waitForTestId = async (page, testId, timeout = 10000) => {
  await waitFor(
    async () => {
      const locator = page.locator(`[data-testid="${testId}"]`)
      return (await locator.count()) > 0
    },
    { timeout, errorMessage: `Timed out waiting for [data-testid="${testId}"]` },
  )
}

const countTexts = async (page, text) => page.locator(`text=${text}`).count()

const waitFor = async (
  predicate,
  {
    timeout = 10000,
    interval = 50,
    errorMessage = `Timed out after ${timeout}ms`,
  } = {},
) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    if (await predicate()) return
    await wait(interval)
  }

  throw new Error(errorMessage)
}

const getTaskPlanCardText = async (page) => {
  const locator = page.locator('[data-testid="assistant-task-plan-card"]')
  if ((await locator.count()) === 0) return ''
  return (await locator.textContent()) ?? ''
}

const getExecutionStatusText = async (page) => {
  const locator = page.locator('[data-testid="assistant-execution-status"]')
  if ((await locator.count()) === 0) return ''
  return (await locator.textContent()) ?? ''
}

const clickButtonByName = async (page, name, timeout = 10000) => {
  const locator = page.getByRole('button', { name }).first()
  await waitFor(
    async () => (await locator.count()) > 0,
    { timeout, errorMessage: `Timed out waiting for button "${name}"` },
  )
  await locator.dispatchEvent('click')
}

const clickStableButtonByName = async (page, name, timeout = 10000) => {
  const locator = page.getByRole('button', { name }).first()
  await waitFor(
    async () => (await locator.count()) > 0,
    { timeout, errorMessage: `Timed out waiting for button "${name}"` },
  )
  await locator.click({ noWaitAfter: true })
}

const results = []

const record = (name, passed, detail = '') => {
  results.push({ name, passed, detail })
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`)
}

const installAssistantRoutes = async (page) => {
  await page.route('**/api/assistant/plan', async (route) => {
    const body = route.request().postDataJSON?.() ?? {}
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''

    if (prompt === HOUSE_PROMPT) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildLargeBrowserTaskPlan(5)),
      })
      return
    }

    if (prompt === STOP_PROMPT) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildLargeBrowserTaskPlan(600)),
      })
      return
    }

    if (prompt === RETRY_PROMPT) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(retryTaskPlan),
      })
      return
    }

    if (prompt === CANCEL_PROMPT) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildLargeBrowserTaskPlan(120)),
      })
      return
    }

    await route.fallback()
  })
}

const openAssistantPage = async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
  await installAssistantRoutes(page)
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await waitForTestId(page, 'assistant-input', 30000)
  return page
}

const browser = await chromium.launch({ headless: true })
let page = await openAssistantPage(browser)

try {
  const input = page.locator('[data-testid="assistant-input"]')

  await input.fill('create a ')
  await waitForTestId(page, 'assistant-inline-autocomplete')
  const ghostText = await page.locator('[data-testid="assistant-inline-autocomplete"]').textContent()
  assert.match(ghostText ?? '', /4m x 4m room with walls/i)
  record('9.2 ghost text appears for "create a "', true)

  await input.press('Tab')
  await expectValue(input, 'create a 4m x 4m room with walls')
  record('9.2 Tab accepts ghost text', true)

  await resetChat(page)

  await fillAndSend(page, HOUSE_PROMPT)
  await waitForTestId(page, 'assistant-task-plan-card')
  assert.equal(await page.locator('[data-testid="assistant-task-plan-card"]').isVisible(), true)
  record('9.2 complex house prompt shows a task plan', true)

  const taskPlanCard = page.locator('[data-testid="assistant-task-plan-card"]')
  assert.ok((await taskPlanCard.textContent())?.includes('Structure'))
  assert.ok((await taskPlanCard.textContent())?.includes('Layout'))
  assert.ok((await taskPlanCard.textContent())?.includes('Furnish'))
  record('9.2 agent labels are visible on task-plan steps', true)

  await clickButtonByName(page, 'Execute Plan')
  await waitFor(
    async () => {
      const cardText = await getTaskPlanCardText(page)
      const executionText = await getExecutionStatusText(page)
      return (
        !cardText.includes('0/5 complete') ||
        executionText.includes('Running Browser step') ||
        executionText.includes('Done')
      )
    },
    { timeout: 10000, errorMessage: 'Task plan execution did not update browser progress.' },
  )
  record('9.2 task plan execution updates progress in the browser', true)

  await waitFor(
    async () => {
      const cardText = await getTaskPlanCardText(page)
      return cardText.includes('completed') || cardText.includes('5/5 complete')
    },
    { timeout: 30000, errorMessage: 'Initial browser task plan did not finish.' },
  )

  await resetChat(page)

  await fillAndSend(page, STOP_PROMPT)
  await waitForTestId(page, 'assistant-task-plan-card')
  await clickButtonByName(page, 'Execute Plan')
  await clickButtonByName(page, 'Stop After Current')
  await waitFor(
    async () => {
      const cardText = await getTaskPlanCardText(page)
      return cardText.includes('pending') && cardText.includes('Execute Plan')
    },
    {
      timeout: 20000,
      errorMessage: 'Stop-after-current did not leave remaining task-plan steps pending.',
    },
  )
  record('9.2 stop-after-current leaves remaining task-plan steps pending', true)

  await page.close()
  page = await openAssistantPage(browser)

  await fillAndSend(page, RETRY_PROMPT)
  await waitForTestId(page, 'assistant-task-plan-card')
  await clickButtonByName(page, 'Execute Plan')
  await waitFor(
    async () => (await page.getByRole('button', { name: 'Retry Step' }).count()) > 0,
    { timeout: 10000, errorMessage: 'Retry Step button never appeared.' },
  )
  await clickStableButtonByName(page, 'Retry Step')
  await waitFor(
    async () => (await page.getByRole('button', { name: 'Stop After Current' }).count()) > 0,
    {
      timeout: 3000,
      interval: 5,
      errorMessage: 'Retry Step never transitioned back into execution.',
    },
  )
  await waitFor(
    async () => {
      const cardText = await getTaskPlanCardText(page)
      return /error/i.test(cardText) && (await page.getByRole('button', { name: 'Retry Step' }).count()) > 0
    },
    { timeout: 10000, errorMessage: 'Retry Step did not re-run the failed step.' },
  )
  record('9.2 retry step re-executes the failed task-plan step', true)

  await page.close()
  page = await openAssistantPage(browser)

  await fillAndSend(page, PET_HOUSE_PROMPT)
  await waitFor(
    async () => {
      const executionText = await getExecutionStatusText(page)
      return /done/i.test(executionText) && !/timed out|not found|failed/i.test(executionText)
    },
    { timeout: 30000, errorMessage: 'Spanish pet-house prompt never completed execution.' },
  )
  const errorText = await getExecutionStatusText(page)
  assert.doesNotMatch(errorText, /timed out|not found|failed/i)
  record('9.2 spanish pet-house prompt executes without crashing', true)

  await page.close()
  page = await openAssistantPage(browser)

  await fillAndSend(page, CANCEL_PROMPT)
  await waitForTestId(page, 'assistant-task-plan-card')
  await clickButtonByName(page, 'Execute Plan')
  await fillAndSend(page, 'hola')
  await waitFor(
    async () => {
      const pageText = await page.locator('body').textContent()
      return /hola|¿en qué puedo ayudarte/i.test(pageText ?? '')
    },
    { timeout: 10000, errorMessage: 'Rapid submit did not render the new greeting response.' },
  )
  await wait(1500)
  assert.equal(await page.locator('[data-testid="assistant-task-plan-card"]').count(), 0)
  record('9.3 rapid submit interrupts a running task-plan execution', true)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  const screenshotPath = 'C:/Users/carlos/PROYECTOS/pistola/editor/.codex-runtime/assistant-smarter-browser-check-failure.png'
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
  record('browser verification', false, `${message} (screenshot: ${screenshotPath})`)
  throw error
} finally {
  await browser.close()
  console.log(JSON.stringify(results, null, 2))
}

async function expectValue(locator, expected) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if ((await locator.inputValue()) === expected) return
    await wait(50)
  }
  assert.equal(await locator.inputValue(), expected)
}
