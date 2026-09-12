// Actual browser interactions against two deterministic fixtures. No user study.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createAlternativeFixture } from '../../examples/alternatives/setup.mjs'
import { flowRevision } from '../../src/flow.mjs'

if (!process.argv[2] || !process.env.ATEAM_PLAYWRIGHT_MODULE)
  throw Error('Pass evidence directory and trusted ATEAM_PLAYWRIGHT_MODULE')
const out = resolve(process.argv[2]),
  harness = resolve(import.meta.dirname, '../../..')
const rel = relative(harness, out)
if (rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel))
  throw Error('Keep evidence outside harness')
mkdirSync(out, { recursive: true })
const fixture = createAlternativeFixture(join(mkdtempSync(join(out, 'fixture-')), 'target'))
const { root, record } = fixture
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
    'content-type',
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
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let browser
const results = []
try {
  const { chromium } = await import(pathToFileURL(resolve(process.env.ATEAM_PLAYWRIGHT_MODULE)))
  browser = await chromium.launch({
    channel: process.env.ATEAM_BROWSER_CHANNEL || 'chrome',
    headless: true,
  })
  for (const option of record.options) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(`http://127.0.0.1:${server.address().port}/?option=${option.id}`)
    await page.locator('#name').waitFor()
    assert.equal(await page.locator('input').count(), option.id === 'guided' ? 1 : 2)
    await page.screenshot({ path: join(out, `${option.id}-desktop.png`), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    )
    await page.screenshot({ path: join(out, `${option.id}-mobile.png`), fullPage: true })
    const first = option.id === 'guided' ? 'next' : 'save'
    await page.locator(`[data-trigger=${first}]`).click()
    assert.equal(await page.getByRole('alert').count(), 1)
    await page.getByLabel('Request name (required)').fill('Quarterly request with retained input')
    if (option.id === 'guided') {
      await page.locator('[data-trigger=next]').click()
      await page.locator('[data-trigger=save]').click()
      assert.equal(await page.getByRole('alert').count(), 1)
      await page.getByLabel('Request owner (required)').fill('Synthetic owner')
      await page.locator('[data-trigger=back]').click()
      assert.equal(
        await page.locator('#name').inputValue(),
        'Quarterly request with retained input',
      )
      await page.locator('[data-trigger=next]').click()
      assert.equal(await page.locator('#owner').inputValue(), 'Synthetic owner')
    } else await page.getByLabel('Request owner (required)').fill('Synthetic owner')
    await page.locator('[data-trigger=save]').click()
    await page.locator('[data-trigger=retry]').waitFor()
    assert.match(await page.locator('#app').innerText(), /Quarterly request with retained input/)
    assert.match(await page.locator('#app').innerText(), /Synthetic owner/)
    await page.locator('[data-trigger=retry]').click()
    await page.locator('[data-trigger=submit]').waitFor()
    await page.keyboard.press('Tab')
    assert.equal(await page.locator(':focus').getAttribute('data-trigger'), 'submit')
    await page.keyboard.press('Enter')
    const observed = await page.evaluate(() => window.comparisonEvidence())
    assert.equal(observed.snapshot.nodeId, 'N-DONE')
    assert.deepEqual(observed.snapshot.persisted, {
      name: 'Quarterly request with retained input',
      owner: 'Synthetic owner',
    })
    assert.deepEqual(
      observed.receipt.requests.map((r) => r.outcome),
      ['failure', 'success'],
    )
    const bytes = JSON.stringify(observed.receipt, null, 2) + '\n',
      path = `${option.id}-receipt.json`
    writeFileSync(join(root, path), bytes)
    option.observations[0] = {
      criterionId: 'C-RECOVERY',
      status: 'observed',
      note: 'Actual Chrome required input, failed-save retention, retry and keyboard submit passed with deterministic simulated persistence.',
      evidence: { path, revision: createHash('sha256').update(bytes).digest('hex') },
    }
    await page.getByRole('button', { name: 'Reset scenario' }).click()
    assert.deepEqual(
      (await page.evaluate(() => window.comparisonEvidence())).receipt.transitions,
      [],
    )
    results.push({
      optionId: option.id,
      receipt: observed.receipt,
      persisted: observed.snapshot.persisted,
      reset: 'passed',
      sharedDesignSystem: record.designSystem.revision,
    })
    await page.close()
  }
  writeFileSync(join(root, 'comparison.json'), JSON.stringify(record, null, 2) + '\n')
  const cli = spawnSync(
    process.execPath,
    [
      join(harness, 'runner/src/alternatives-cli.mjs'),
      '--root',
      root,
      '--record',
      'comparison.json',
    ],
    { encoding: 'utf8' },
  )
  writeFileSync(join(out, 'validation.json'), cli.stdout)
  assert.equal(cli.status, 0, cli.stdout + cli.stderr)
  const validation = JSON.parse(cli.stdout)
  assert.equal(validation.result.selection.status, 'provisional')
  assert.ok(validation.result.options.every((o) => o.pendingCriteria.includes('C-USABILITY')))
  writeFileSync(
    join(out, 'results.json'),
    JSON.stringify(
      {
        status: 'passed',
        root,
        results,
        rubricRevision: flowRevision(record.criteria),
        limitations: validation.result.limitations,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(JSON.stringify({ status: 'passed', root, evidence: out }))
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
