// Real public combined CLI proof. Invoke with a fresh evidence directory outside
// the harness; retain the synthetic repository and supervisor records for review.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fixtureRepo, git } from '../approval-fixtures.mjs'
import { canonicalPath, within } from '../../src/policy.mjs'

if (!process.argv[2] || !process.env.ATEAM_PLAYWRIGHT_MODULE)
  throw Error('Evidence directory and trusted ATEAM_PLAYWRIGHT_MODULE are required')
const out = resolve(process.argv[2])
if (within(canonicalPath(resolve(import.meta.dirname, '../../..')), canonicalPath(out)))
  throw Error('Synthetic evidence and target must be outside the harness checkout')
mkdirSync(out, { recursive: true })
const dir = mkdtempSync(join(out, 'connected-')),
  root = fixtureRepo(dir),
  operator = join(dir, 'operator'),
  issues = join(dir, 'approved-issues.json'),
  results = []
mkdirSync(operator)
writeFileSync(issues, '[]\n')
writeFileSync(
  join(operator, 'config.json'),
  JSON.stringify(
    {
      sandbox: {
        backend: 'macos-seatbelt',
        playwrightModule: resolve(process.env.ATEAM_PLAYWRIGHT_MODULE),
        browserChannel: process.env.ATEAM_BROWSER_CHANNEL || 'chrome',
      },
    },
    null,
    2,
  ),
)
const source = resolve(import.meta.dirname, '../fixtures/connected-app')
for (const file of ['server.mjs', 'index.html', 'test-only-controller.mjs', 'isolated.test.mjs'])
  copyFileSync(join(source, file), join(root, file))
const viewport = { width: 390, height: 844 }
const plan = {
  schemaVersion: 1,
  serverCommand: 'node server.mjs',
  requirements: [
    { obligation: 'OBL-ROUTE', state: 'anonymous', viewport },
    { obligation: 'OBL-ROUNDTRIP', state: 'populated', viewport },
  ],
  cases: [
    {
      id: 'actual-route',
      obligation: 'OBL-ROUTE',
      state: 'anonymous',
      fixture: 'local-session-boundary',
      route: '/',
      viewport,
      actions: [],
      assertions: [
        {
          type: 'api',
          path: '/api/save',
          method: 'POST',
          data: { title: 'Anonymous' },
          status: 401,
        },
      ],
    },
    {
      id: 'save-retry-submit',
      obligation: 'OBL-ROUNDTRIP',
      state: 'populated',
      fixture: 'fail-first-save',
      route: '/',
      viewport,
      actions: [
        { type: 'fill', selector: '#title', value: 'Original pending changes' },
        { type: 'click', selector: '#save' },
        { type: 'wait', selector: '#status', text: 'Save failed' },
        { type: 'click', selector: '#retry' },
        { type: 'wait', selector: '#status', text: 'Changes saved' },
        { type: 'click', selector: '#submit' },
        { type: 'wait', selector: '#status', text: 'Submitted successfully' },
      ],
      assertions: [
        { type: 'text', selector: '#status', equals: '✓ Submitted successfully' },
        { type: 'value', selector: '#title', equals: 'Original pending changes' },
        {
          type: 'api',
          path: '/api/state',
          headers: { 'x-session': 'synthetic-local-session' },
          status: 200,
          jsonEquals: {
            attempts: 2,
            persisted: { title: 'Original pending changes' },
            submissions: 1,
          },
        },
      ],
    },
  ],
}
mkdirSync(join(root, 'verification'))
writeFileSync(
  join(root, 'verification/route.json'),
  JSON.stringify(
    { ...plan, requirements: [plan.requirements[0]], cases: [plan.cases[0]] },
    null,
    2,
  ) + '\n',
)
writeFileSync(
  join(root, 'verification/journey.json'),
  JSON.stringify(
    { ...plan, requirements: [plan.requirements[1]], cases: [plan.cases[1]] },
    null,
    2,
  ) + '\n',
)
writeFileSync(
  join(root, 'CLAUDE.md'),
  '## A-Team Config\n\n```json\n' +
    JSON.stringify(
      {
        deliveryVerification: {
          schemaVersion: 1,
          checks: [
            { id: 'isolated', kind: 'suite', command: 'node --test isolated.test.mjs' },
            {
              id: 'types',
              kind: 'typecheck',
              notApplicable: 'Synthetic Node/HTML application uses no type compilation',
            },
            {
              id: 'build',
              kind: 'build',
              notApplicable: 'Synthetic server serves committed source without a build',
            },
            { id: 'route', kind: 'integration', renderedReview: 'verification/route.json' },
            { id: 'connected', kind: 'browser', renderedReview: 'verification/journey.json' },
          ],
          boundaries: [
            {
              id: 'external-identity',
              status: 'substituted',
              reason: 'Synthetic local session; production identity tenant unexecuted',
              obligationIds: ['OBL-LIVE-IDENTITY'],
            },
          ],
        },
      },
      null,
      2,
    ) +
    '\n```\n',
)
const env = { ...process.env, ATEAM_RUNNER_HOME: operator }
const cli = (command, extra = []) => {
  const child = spawnSync(
    process.execPath,
    [
      resolve(import.meta.dirname, '../../src/combined-cli.mjs'),
      command,
      '--root',
      root,
      '--branch',
      'main',
      '--issues',
      issues,
      ...extra,
    ],
    { env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  if (child.error) throw child.error
  assert.ok(child.stdout.trim(), child.stderr)
  return { code: child.status, value: JSON.parse(child.stdout), stderr: child.stderr }
}
const serverSource = readFileSync(join(source, 'server.mjs'), 'utf8')
for (const variant of ['correct', 'unguarded', 'combined-defect', 'restored']) {
  const server =
    variant === 'unguarded'
      ? serverSource.replace('!process.env.ATEAM_FIXTURE_UNGUARDED', 'false')
      : variant === 'combined-defect'
        ? serverSource.replace('process.env.ATEAM_FIXTURE_COMBINED_DEFECT', 'true')
        : serverSource
  writeFileSync(join(root, 'server.mjs'), server)
  // A committed marker also records restoration even if two fixture variants share source.
  writeFileSync(join(root, 'variant.txt'), variant + '\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', `connected fixture: ${variant}`])
  const planned = cli('plan')
  assert.equal(planned.code, 0, JSON.stringify(planned))
  const result = cli('verify'),
    expected = ['correct', 'restored'].includes(variant) ? 'passed' : 'failed'
  results.push({ variant, head: git(root, ['rev-parse', 'HEAD']), ...result })
  writeFileSync(join(dir, 'results.json'), JSON.stringify(results, null, 2) + '\n')
  assert.equal(result.value.status, expected, JSON.stringify(result))
  assert.equal(result.value.record.checks[0].status, 'passed')
  assert.ok(
    result.value.record.checks.some((check) => check.renderedEvidence),
    JSON.stringify(result.value.record.checks),
  )
  assert.equal(result.value.record.headSha, git(root, ['rev-parse', 'HEAD']))
  if (expected === 'passed')
    assert.equal(cli('check', ['--record', result.value.recordPath]).code, 0)
}
assert.equal(
  results.at(-1).value.record.history.filter((entry) => entry.status === 'failed').length,
  2,
)
const finalRecord = results.at(-1).value,
  browserRecord = JSON.parse(readFileSync(finalRecord.record.checks.at(-1).renderedEvidence.recordPath, 'utf8')),
  screenshot = browserRecord.cases[0].screenshot.path,
  screenshotBytes = readFileSync(screenshot)
let corrupted
try {
  writeFileSync(screenshot, 'corrupted screenshot fixture')
  corrupted = cli('check', ['--record', finalRecord.recordPath])
  assert.equal(corrupted.value.status, 'stale')
  assert.match(corrupted.value.reason, /rendered|screenshot|observation/i)
} finally {
  writeFileSync(screenshot, screenshotBytes)
}
const recovered = cli('check', ['--record', finalRecord.recordPath])
assert.equal(recovered.code, 0, JSON.stringify(recovered))
writeFileSync(join(dir, 'artifact-integrity.json'), JSON.stringify({corrupted, recovered}, null, 2)+'\n')
console.log(
  JSON.stringify(
    {
      directory: dir,
      results: results.map(({ variant, head, value }) => ({
        variant,
        head,
        status: value.status,
        recordPath: value.recordPath,
      })),
    },
    null,
    2,
  ),
)
