import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
const { chromium } = await import(process.env.ATEAM_PLAYWRIGHT_MODULE || 'playwright')
const [interactiveUrl, navigationUrl, outputArg] = process.argv.slice(2)
if (!interactiveUrl || !navigationUrl || !outputArg)
  throw new Error('Usage: flow.mjs <interactive URL> <navigation URL> <output directory>')
const output = resolve(outputArg)
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ATEAM_BROWSER_CHANNEL ? { channel: process.env.ATEAM_BROWSER_CHANNEL } : {}),
})
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
const results = []
try {
  await page.goto(interactiveUrl)
  const active = page.locator('[data-flow-view]')
  await page.getByRole('button', { name: 'Save request', exact: true }).click()
  assert.equal(await active.getAttribute('data-node-id'), 'N-INVALID')
  assert.equal(
    await page.getByRole('textbox', { name: 'Request name' }).getAttribute('aria-invalid'),
    'true',
  )
  await page.screenshot({ path: join(output, 'invalid.png'), fullPage: true })
  await page.getByRole('textbox', { name: 'Request name' }).fill('Annual review')
  await page.getByRole('button', { name: 'Save request', exact: true }).click()
  assert.equal(await active.getAttribute('data-node-id'), 'N-SAVING')
  await page.screenshot({ path: join(output, 'loading.png'), fullPage: true })
  await page.locator('[data-node-id="N-ERROR"]').waitFor()
  assert.match(await active.innerText(), /Annual review/)
  assert.equal(await page.getByRole('button', { name: 'Submit request', exact: true }).count(), 0)
  await page.screenshot({ path: join(output, 'failed-save.png'), fullPage: true })
  await page.getByRole('button', { name: 'Retry save', exact: true }).click()
  await page.locator('[data-node-id="N-REVIEW"]').waitFor()
  const receipt = JSON.parse(await page.locator('[data-flow-evidence]').textContent())
  assert.deepEqual(
    receipt.requests.map((r) => r.payload),
    [{ name: 'Annual review' }, { name: 'Annual review' }],
  )
  assert.deepEqual(
    receipt.requests.map((r) => r.outcome),
    ['failure', 'success'],
  )
  assert.equal(await active.getAttribute('data-page-id'), 'P-REVIEW')
  await page.getByRole('button', { name: 'Submit request', exact: true }).click()
  assert.equal(await active.getAttribute('data-page-id'), 'P-DONE')
  await page.getByRole('button', { name: 'Reset scenario', exact: true }).click()
  assert.equal(await page.getByRole('textbox', { name: 'Request name' }).inputValue(), '')
  await page.getByRole('textbox', { name: 'Request name' }).fill('Annual review')
  await page.getByRole('button', { name: 'Save request', exact: true }).click()
  await page.locator('[data-node-id="N-ERROR"]').waitFor()
  await page.getByRole('button', { name: 'Reset scenario', exact: true }).click()
  await page.getByRole('textbox', { name: 'Request name' }).fill('Cancelled save')
  await page.getByRole('button', { name: 'Save request', exact: true }).click()
  await page.getByRole('button', { name: 'Reset scenario', exact: true }).click()
  await page.waitForTimeout(450)
  assert.equal(await active.getAttribute('data-node-id'), 'N-EDIT')
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .getByRole('textbox', { name: 'Request name' })
    .fill('A very long request name for local validation '.repeat(10))
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: join(output, 'mobile.png'), fullPage: true })
  results.push({
    scenario: 'interactive-failed-save-retry-reset',
    status: 'passed',
    receipt,
    viewports: [
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
    ],
    screenshots: ['invalid.png', 'loading.png', 'failed-save.png', 'mobile.png'],
    scope: 'Local fixture only; no human study or production backend',
  })
  await page.goto(navigationUrl)
  assert.match(
    await page.locator('[data-fidelity]').innerText(),
    /validation and recovery remain unverified/,
  )
  assert.equal(await page.getByRole('textbox').count(), 0)
  for (const id of ['E-SAVE', 'E-FAIL', 'E-RETRY', 'E-SAVED', 'E-SUBMIT'])
    await page.locator(`[data-transition-id="${id}"]`).click()
  const navigationReceipt = JSON.parse(await page.locator('[data-flow-evidence]').textContent())
  assert.deepEqual(navigationReceipt.requests, [])
  assert.equal(navigationReceipt.fidelity, 'navigation')
  assert.equal(await page.locator('[data-flow-view]').getAttribute('data-page-id'), 'P-DONE')
  await page.screenshot({ path: join(output, 'navigation.png'), fullPage: true })
  results.push({
    scenario: 'navigation-only',
    status: 'passed',
    receipt: navigationReceipt,
    validation: 'unverified',
    recovery: 'unverified',
  })
  writeFileSync(
    join(output, 'browser-results.json'),
    JSON.stringify({ browser: await browser.version(), results }, null, 2) + '\n',
  )
  console.log(JSON.stringify({ passed: true, scenarios: results.length }))
} finally {
  await browser.close()
}
