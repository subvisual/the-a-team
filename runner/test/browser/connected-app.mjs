import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
if (!process.env.ATEAM_PLAYWRIGHT_MODULE)
  throw Error('ATEAM_PLAYWRIGHT_MODULE must identify an installed Playwright module')
const { chromium } = await import(pathToFileURL(resolve(process.env.ATEAM_PLAYWRIGHT_MODULE)).href)
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import { fixtureRepo, git, config } from '../approval-fixtures.mjs'
import { withVerificationServer } from '../../src/verification-server.mjs'
const out = resolve(process.argv[2] || 'connected-browser-evidence'),
  results = []
mkdirSync(out, { recursive: true })
for (const variant of ['correct', 'unguarded', 'combined-defect']) {
  const dir = mkdtempSync(join(tmpdir(), 'ateam-connected-browser-')),
    root = fixtureRepo(dir),
    scratch = join(dir, 'scratch')
  mkdirSync(scratch)
  for (const path of ['server.mjs', 'index.html', 'test-only-controller.mjs', 'isolated.test.mjs'])
    copyFileSync(resolve(import.meta.dirname, '../fixtures/connected-app', path), join(root, path))
  if (variant !== 'correct') {
    let s = readFileSync(join(root, 'server.mjs'), 'utf8')
    s =
      variant === 'unguarded'
        ? s.replace('!process.env.ATEAM_FIXTURE_UNGUARDED', 'false')
        : s.replace('process.env.ATEAM_FIXTURE_COMBINED_DEFECT', 'true')
    writeFileSync(join(root, 'server.mjs'), s)
  }
  git(root, ['add', '.'])
  git(root, ['commit', '-m', variant])
  const isolatedOutput = execFileSync(process.execPath, ['--test', 'isolated.test.mjs'], {
    cwd: root,
    encoding: 'utf8',
  })
  const head = git(root, ['rev-parse', 'HEAD']),
    policy = config(root).policy
  policy.sandbox.backend = 'macos-seatbelt'
  let browser
  try {
    browser = await chromium.launch({
      channel: process.env.ATEAM_BROWSER_CHANNEL || 'chrome',
      headless: true,
    })
    const evidence = await withVerificationServer(
      { command: 'node server.mjs', worktree: root, scratchDir: scratch, policy, timeoutMs: 30000 },
      async ({ baseURL }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
        await context.route('**/*', (route) =>
          new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort(),
        )
        const page = await context.newPage()
        await page.goto(baseURL)
        const anonymous = await page.request.post(baseURL + '/api/save', {
          data: { title: 'Anonymous' },
        })
        if (anonymous.status() !== 401)
          return {
            passed: false,
            failedCheck: 'actual-protected-route',
            status: anonymous.status(),
          }
        await page.getByLabel('Title', { exact: true }).fill('Original pending changes')
        await page.getByRole('button', { name: 'Save changes', exact: true }).click()
        await page.getByRole('status').filter({ hasText: 'Save failed' }).waitFor()
        assert.equal(
          await page.getByRole('button', { name: 'Submit saved changes' }).isDisabled(),
          true,
        )
        assert.equal(
          await page.getByLabel('Title', { exact: true }).inputValue(),
          'Original pending changes',
        )
        await page.screenshot({ path: join(out, variant + '-failed-save.png'), fullPage: true })
        await page.getByRole('button', { name: 'Retry save', exact: true }).click()
        await page.getByRole('status').filter({ hasText: 'Changes saved' }).waitFor()
        await page.getByRole('button', { name: 'Submit saved changes' }).click()
        await page.waitForFunction(() =>
          /Submitted successfully|Connected submission defect/.test(
            document.querySelector('#status').textContent,
          ),
        )
        const status = await page.getByRole('status').innerText()
        const state = await (
          await page.request.get(baseURL + '/api/state', {
            headers: { 'x-session': 'synthetic-local-session' },
          })
        ).json()
        assert.deepEqual(state.persisted, { title: 'Original pending changes' })
        await page.screenshot({ path: join(out, variant + '-result.png'), fullPage: true })
        return {
          passed: state.submissions === 1,
          failedCheck: state.submissions === 1 ? null : 'connected-submit',
          status,
          state,
          viewport: { width: 390, height: 844 },
        }
      },
    )
    results.push({
      variant,
      head,
      isolatedChecks: {
        passed: true,
        command: 'node --test isolated.test.mjs',
        output: isolatedOutput,
      },
      ...evidence,
    })
  } finally {
    await browser?.close()
    rmSync(dir, { recursive: true, force: true })
  }
}
assert.deepEqual(
  results.map((r) => r.observation.passed),
  [true, false, false],
)
writeFileSync(join(out, 'connected-browser-results.json'), JSON.stringify(results, null, 2) + '\n')
console.log(
  JSON.stringify(results.map(({ variant, head, observation }) => ({ variant, head, observation }))),
)
