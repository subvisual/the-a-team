// Actual CLI + browser proof, with a disposable synthetic target and runtime.
// Retain outputs outside the harness; no provider or remote publication runs.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { operatorFixture, human } from '../helpers/operator-fixture.mjs'

if (!process.argv[2] || !process.env.ATEAM_PLAYWRIGHT_MODULE)
  throw Error('Pass an evidence directory and a trusted ATEAM_PLAYWRIGHT_MODULE')
const out = resolve(process.argv[2])
const harness = resolve(import.meta.dirname, '../../..')
const rel = relative(harness, out)
if (rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel))
  throw Error('Evidence directory must be outside the harness checkout')
mkdirSync(out, { recursive: true })
const { chromium } = await import(pathToFileURL(resolve(process.env.ATEAM_PLAYWRIGHT_MODULE)))
const runtime = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(
    '<!doctype html><title>Synthetic runtime</title><h1>Save prototype</h1><p>Authorized local fixture only.</p>',
  )
})
await new Promise((resolve) => runtime.listen(0, '127.0.0.1', resolve))
let browser
try {
  const f = operatorFixture(mkdtempSync(join(out, 'target-')), {
    runtimeUrl: `http://127.0.0.1:${runtime.address().port}/prototype`,
  })
  assert.equal(f.init().status, 'success')
  assert.equal(f.definition().status, 'success')
  assert.equal(
    f.run('configure', {
      gate_policy: 'notify-and-continue',
      authorization: { ...human, scope: ['definition', 'design'] },
    }).status,
    'success',
  )
  assert.equal(f.run('approve', { phase: 'definition', provisional: true }).status, 'success')
  assert.equal(f.run('start', { phase: 'design' }).status, 'success')
  assert.equal(f.run('complete', { phase: 'design', artifacts: ['design.md'] }).status, 'success')
  assert.equal(f.run('approve', { phase: 'design', provisional: true }).status, 'success')
  writeFileSync(
    join(f.dir, 'merge-receipt.md'),
    '# Synthetic intended-target merge receipt\nFixture only; not a real delivery claim.\n',
  )
  assert.equal(
    f.run('record-milestone', {
      milestone: 'integration',
      evidence: {
        reference: 'fixture:merge-1',
        revision: 'synthetic-merged-head',
        merged: true,
        target: 'main',
        artifacts: ['merge-receipt.md'],
      },
    }).status,
    'success',
  )
  assert.equal(
    f.run('pause', { reason: 'Review the provisional save direction before implementation' })
      .status,
    'success',
  )
  const preview = join(out, 'feature-status.html')
  const result = f.status('html')
  assert.equal(result.status, 0, result.stdout)
  writeFileSync(preview, result.stdout)
  writeFileSync(join(out, 'feature-status.json'), f.status().stdout)
  browser = await chromium.launch({
    channel: process.env.ATEAM_BROWSER_CHANNEL || 'chrome',
    headless: true,
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const url = pathToFileURL(preview).href
  await page.goto(url)
  assert.match(await page.locator('header').innerText(), /Paused/)
  assert.equal(await page.locator('.provisional').count(), 2)
  assert.match(await page.locator('dl.milestones').innerText(), /Human acceptance\npending/)
  assert.match(await page.locator('dl.milestones').innerText(), /Integration\nrecorded/)
  assert.match(await page.locator('#review').innerText(), /Consequence of continuing/)
  const links = await page
    .locator('a')
    .evaluateAll((nodes) => nodes.map((n) => ({ text: n.textContent, href: n.href })))
  for (const link of links) {
    const target = new URL(link.href)
    assert.ok(['file:', 'http:'].includes(target.protocol), link.href)
    if (target.protocol === 'file:') assert.ok(existsSync(fileURLToPath(target)), link.href)
  }
  await page.getByRole('link', { name: 'briefs/pages/index.html', exact: true }).click()
  assert.equal(await page.locator('h1').innerText(), 'Save board')
  await page.goto(url)
  await page.getByRole('link', { name: 'Save prototype', exact: true }).click()
  assert.equal(await page.locator('h1').innerText(), 'Save prototype')
  await page.goto(url)
  await page.keyboard.press('Tab')
  assert.equal(await page.locator(':focus').innerText(), 'Review decision')
  assert.equal(
    await page.locator(':focus').evaluate((e) => getComputedStyle(e).outlineStyle),
    'solid',
  )
  await page.screenshot({ path: join(out, 'desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: join(out, 'mobile.png'), fullPage: true })
  const before = f.read()
  const resumed = f.run(
    'resume',
    { reason: 'Human reviewing retained decisions' },
    { eventId: 'browser-resume', revision: f.revision },
  )
  assert.equal(resumed.status, 'success')
  const replay = f.run(
    'resume',
    { reason: 'Human reviewing retained decisions' },
    { eventId: 'browser-resume', revision: before.revision },
  )
  assert.equal(replay.replayed, true)
  assert.deepEqual(replay.manifest, resumed.manifest)
  assert.equal(f.run('approve', { phase: 'definition', decision: human }).status, 'success')
  assert.equal(f.run('approve', { phase: 'design', decision: human }).status, 'success')
  writeFileSync(preview, f.status('html').stdout)
  await page.goto(url)
  assert.equal(await page.locator('.provisional').count(), 0)
  assert.match(await page.locator('#review').innerText(), /Accepted phase decision/)
  assert.match(await page.locator('dl.milestones').innerText(), /Human acceptance\npending/)
  const design = join(f.dir, 'design.md')
  writeFileSync(design, readFileSync(design, 'utf8') + '\nRevised after the last human review.\n')
  writeFileSync(join(out, 'stale-status.html'), f.status('html').stdout)
  await page.goto(pathToFileURL(join(out, 'stale-status.html')).href)
  assert.match(await page.locator('#review').innerText(), /Stale — prior decision retained/)
  assert.match(await page.locator('#review').innerText(), /design.md · changed/)
  const final = {
    status: 'passed',
    preview,
    featureDir: f.dir,
    links,
    viewports: [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ],
    checks: [
      'actual CLI snapshot',
      'provisional and accepted decision distinction',
      'human acceptance pending independently of recorded integration',
      'board and runtime navigation',
      'all local links resolve',
      'keyboard focus',
      'mobile horizontal containment',
      'stable resume replay',
      'actual stale design revalidation',
    ],
    containment: '#37 accepts native cleanup with a known containment limitation; no whole-tree termination claim',
    runtimeAvailability:
      'verified only during this synthetic browser scenario; server is stopped at scenario end',
  }
  writeFileSync(join(out, 'results.json'), JSON.stringify(final, null, 2) + '\n')
  console.log(JSON.stringify(final))
} finally {
  await browser?.close()
  await new Promise((resolve) => runtime.close(resolve))
}
