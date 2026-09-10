import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fixtureRepo, git, config } from '../approval-fixtures.mjs'
import { evaluateRenderedReview, validateRenderedReviewRecord } from '../../src/rendered-review.mjs'
const output = resolve(process.argv[2] || '../rendered-evaluator/browser-evidence')
mkdirSync(output, { recursive: true })
const root = fixtureRepo(output),
  html = readFileSync(resolve(import.meta.dirname, '../fixtures/rendered-app/index.html'), 'utf8')
copyFileSync(
  resolve(import.meta.dirname, '../fixtures/rendered-app/server.mjs'),
  join(root, 'server.mjs'),
)
const cases = [],
  v = { width: 390, height: 844 },
  wide = { width: 1280, height: 900 }
function add(id, state, viewport, actions, assertions) {
  cases.push({
    id,
    obligation: 'OBL-rendered',
    state,
    viewport,
    route: '/',
    fixture: 'long-content-synthetic',
    actions,
    assertions,
  })
}
const save = [
  { type: 'fill', selector: '#title', value: 'Preserved exact pending title' },
  { type: 'click', selector: '#save' },
]
add(
  'empty',
  'empty',
  v,
  [],
  [
    { type: 'text', selector: '#status', equals: '○ Empty' },
    { type: 'contained', selector: '#save' },
    { type: 'accessibility' },
  ],
)
add('loading', 'loading', v, save, [
  { type: 'text', selector: '#status', equals: '◷ Loading' },
  { type: 'disabled', selector: '#save', equals: true },
])
add(
  'error',
  'error',
  v,
  [...save, { type: 'wait', selector: '#status', text: 'Error' }],
  [
    { type: 'text', selector: '#status', equals: '! Error: retry' },
    { type: 'value', selector: '#title', equals: 'Preserved exact pending title' },
    { type: 'contained', selector: '#retry' },
  ],
)
add(
  'journey',
  'populated',
  v,
  [
    ...save,
    { type: 'wait', selector: '#status', text: 'Error' },
    { type: 'click', selector: '#retry' },
  ],
  [
    { type: 'text', selector: '#status', equals: '✓ Populated' },
    { type: 'css', selector: '#status', property: 'color', equals: 'rgb(23, 104, 57)' },
    { type: 'contained', selector: '#save' },
  ],
)
add(
  'keyboard',
  'keyboard',
  v,
  [{ type: 'press', selector: '#title', key: 'Tab' }],
  [
    { type: 'focus', selector: '#save' },
    { type: 'css', selector: '#save', property: 'outline-style', equals: 'solid' },
  ],
)
add(
  'scroll',
  'long-content-scroll',
  v,
  [
    { type: 'scroll', selector: '.vertical', y: 100 },
    { type: 'scroll', selector: '.horizontal', x: 120 },
  ],
  [
    { type: 'scroll', selector: '.vertical', axis: 'y', min: 90 },
    { type: 'scroll', selector: '.horizontal', axis: 'x', min: 100 },
  ],
)
add(
  'sticky',
  'sticky',
  wide,
  [{ type: 'scroll', selector: 'html', y: 500 }],
  [
    { type: 'scroll', selector: 'html', axis: 'y', min: 400 },
    { type: 'sticky', selector: '#sticky', edge: 'top', tolerance: 2 },
  ],
)
add(
  'wide',
  'populated',
  wide,
  [
    ...save,
    { type: 'wait', selector: '#status', text: 'Error' },
    { type: 'click', selector: '#retry' },
  ],
  [
    { type: 'text', selector: '#status', equals: '✓ Populated' },
    { type: 'contained', selector: '#save' },
    { type: 'accessibility' },
  ],
)
const plan = {
  schemaVersion: 1,
  serverCommand: 'node server.mjs',
  requirements: cases.map(({ obligation, state, viewport }) => ({ obligation, state, viewport })),
  cases,
}
writeFileSync(join(root, 'rendered.json'), JSON.stringify(plan))
const results = []
for (const variant of [
  'correct',
  'clipped',
  'keyboard-trap',
  'broken-retry',
  'token-drift',
  'broken-scroll',
  'broken-sticky',
  'restored',
]) {
  let source = html
  if (variant === 'clipped')
    source = source.replace('.clip{overflow:hidden}', '.clip{overflow:hidden;width:25px}')
  if (variant === 'keyboard-trap')
    source = source.replace(
      'save.onclick=',
      "title.onkeydown=e=>{if(e.key==='Tab')e.preventDefault()};save.onclick=",
    )
  if (variant === 'broken-retry')
    source = source.replace(
      "status.textContent='✓ Populated'",
      "status.textContent='! Still broken'",
    )
  if (variant === 'token-drift')
    source = source.replace('--status-ink:rgb(23, 104, 57)', '--status-ink:rgb(160, 20, 20)')
  if (variant === 'broken-scroll')
    source = source.replace('height:120px;overflow:auto', 'height:120px;overflow:clip')
  if (variant === 'broken-sticky') source = source.replace('position:sticky', 'position:relative')
  writeFileSync(join(root, 'index.html'), source)
  git(root, ['add', '.'])
  git(root, ['commit', '-m', variant])
  const head = git(root, ['rev-parse', 'HEAD']),
    policy = config(root).policy
  policy.sandbox = {
    backend: 'macos-seatbelt',
    playwrightModule: process.env.ATEAM_PLAYWRIGHT_MODULE,
    browserChannel: 'chrome',
  }
  const scratchDir = join(output, variant + '-scratch'),
    evidenceDir = join(output, variant + '-evidence')
  mkdirSync(scratchDir)
  const result = await evaluateRenderedReview({
    worktree: root,
    head,
    policy,
    planPath: 'rendered.json',
    scratchDir,
    evidenceDir,
    timeoutMs: 60000,
  })
  console.log(
    JSON.stringify({
      variant,
      head,
      status: result.status,
      failure: result.record.failure,
      cases: result.record.cases.map((c) => ({
        id: c.id,
        status: c.status,
        error: c.error,
        failed: c.observations.filter((o) => !o.passed).map((o) => o.expected),
      })),
    }),
  )
  assert.equal(result.status, ['correct', 'restored'].includes(variant) ? 'passed' : 'failed')
  if (result.status === 'passed') {
    assert.equal(
      (
        await validateRenderedReviewRecord({
          recordPath: result.recordPath,
          head,
          policy,
          sourceRoot: root,
          planPath: 'rendered.json',
        })
      ).valid,
      true,
    )
    writeFileSync(join(root, 'rendered.json'), '{}')
    assert.equal(
      (
        await validateRenderedReviewRecord({
          recordPath: result.recordPath,
          head,
          policy,
          sourceRoot: root,
          planPath: 'rendered.json',
        })
      ).valid,
      true,
      'reuse reads exact committed plan, never dirty bytes',
    )
    writeFileSync(join(root, 'rendered.json'), JSON.stringify(plan))
    if (variant === 'restored') {
      const screenshot = result.record.cases[0].screenshot.path,
        bytes = readFileSync(screenshot)
      writeFileSync(screenshot, 'tampered')
      assert.equal(
        (
          await validateRenderedReviewRecord({
            recordPath: result.recordPath,
            head,
            policy,
            sourceRoot: root,
            planPath: 'rendered.json',
          })
        ).valid,
        false,
      )
      writeFileSync(screenshot, bytes)
    }
  }
  results.push({ variant, ...result })
}
writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n')
