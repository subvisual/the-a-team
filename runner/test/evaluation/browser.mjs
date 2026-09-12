// Actual browser evidence using the existing alternatives fixture, not human scoring.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { createAlternativeFixture } from '../../examples/alternatives/setup.mjs'
import { json } from '../../src/evaluation.mjs'
async function fixture(t) {
  assert.ok(process.env.ATEAM_PLAYWRIGHT_MODULE, 'Trusted ATEAM_PLAYWRIGHT_MODULE required')
  const out =
    process.env.ATEAM_EVALUATION_CASE_DIR || mkdtempSync(join(tmpdir(), 'ateam-eval-browser-'))
  const { root } = createAlternativeFixture(join(out, 'target'))
  const allowed = new Set([
    'index.html',
    'tokens.css',
    'app.mjs',
    'flow-runtime.mjs',
    'guided.json',
    'workspace.json',
  ])
  const server = createServer((req, res) => {
    const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html'
    if (!allowed.has(file)) {
      res.writeHead(404)
      res.end()
      return
    }
    res.setHeader(
      'Content-Type',
      file.endsWith('.mjs')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : file.endsWith('.json')
            ? 'application/json'
            : 'text/html',
    )
    res.end(readFileSync(join(root, file)))
  })
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', done)
  })
  t.after(() => new Promise((done) => server.close(done)))
  const { chromium } = await import(pathToFileURL(resolve(process.env.ATEAM_PLAYWRIGHT_MODULE)))
  const browser = await chromium.launch({
    channel: process.env.ATEAM_BROWSER_CHANNEL || 'chrome',
    headless: true,
  })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(`http://127.0.0.1:${server.address().port}/?option=workspace`)
  await page.locator('#name').waitFor()
  writeFileSync(
    join(out, 'browser.json'),
    json({
      version: browser.version(),
      channel: process.env.ATEAM_BROWSER_CHANNEL || 'chrome',
      synthetic: true,
      humanStudy: 'not-run',
    }),
  )
  return { page, out }
}
async function tabTo(page, selector) {
  for (let n = 0; n < 20; n++) {
    await page.keyboard.press('Tab')
    if (await page.locator(selector).evaluate((e) => e === document.activeElement)) return
  }
  assert.fail(`KEYBOARD_UNREACHABLE: ${selector}`)
}
test('long content retains actual target layout and complete failure evidence', async (t) => {
  const { page, out } = await fixture(t)
  const longName = 'Synthetic retained field / '.repeat(55) + 'END_OF_LONG_NAME',
    owner = 'Équipe synthetic owner '
  await page.getByLabel('Request name (required)').fill(longName)
  await page.getByLabel('Request owner (required)').fill(owner)
  await page.locator('[data-trigger=save]').click()
  await page.locator('[data-trigger=retry]').waitFor()
  assert.equal(await page.locator('dd').first().textContent(), longName)
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      'LONG_CONTENT_OVERFLOW',
    )
    for (const control of await page.locator('button').all()) {
      const bounds = await control.boundingBox()
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'LONG_CONTENT_CONTROL_CLIPPED')
    }
    await page.screenshot({ path: join(out, `long-content-${width}.png`), fullPage: true })
  }
  await page.locator('[data-trigger=retry]').click()
  await page.locator('[data-trigger=submit]').waitFor()
  const evidence = await page.evaluate(() => window.comparisonEvidence())
  assert.equal(evidence.snapshot.persisted.name, longName)
  assert.deepEqual(
    evidence.receipt.requests.map((r) => r.outcome),
    ['failure', 'success'],
  )
  writeFileSync(
    join(out, 'browser-observations.json'),
    json({
      synthetic: true,
      evidence,
      checks: ['complete long content', '390px and 1024px containment', 'retained retry payload'],
    }),
  )
})
test('keyboard completes the real synthetic comparison flow', async (t) => {
  const { page, out } = await fixture(t)
  await tabTo(page, '#name')
  await page.keyboard.type('Keyboard synthetic request')
  await tabTo(page, '#owner')
  await page.keyboard.type('Keyboard synthetic owner')
  await tabTo(page, '[data-trigger=save]')
  await page.keyboard.press('Enter')
  await page.locator('[data-trigger=retry]').waitFor()
  await tabTo(page, '[data-trigger=retry]')
  await page.keyboard.press('Enter')
  await page.locator('[data-trigger=submit]').waitFor()
  await tabTo(page, '[data-trigger=submit]')
  assert.equal(
    await page.locator(':focus').evaluate((e) => getComputedStyle(e).outlineStyle),
    'solid',
  )
  await page.screenshot({ path: join(out, 'keyboard-focus.png'), fullPage: true })
  await page.keyboard.press('Enter')
  const evidence = await page.evaluate(() => window.comparisonEvidence())
  assert.equal(evidence.snapshot.nodeId, 'N-DONE')
  assert.deepEqual(evidence.snapshot.persisted, {
    name: 'Keyboard synthetic request',
    owner: 'Keyboard synthetic owner',
  })
  writeFileSync(
    join(out, 'browser-observations.json'),
    json({
      synthetic: true,
      evidence,
      checks: [
        'keyboard field entry',
        'keyboard save failure and retry',
        'visible focus',
        'keyboard submit',
      ],
    }),
  )
})
