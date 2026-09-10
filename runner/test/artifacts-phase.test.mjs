import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { writeFixture } from './helpers/obligations-fixture.mjs'
import { writeCurrentContext } from './helpers/current-context.mjs'
const cli = resolve(import.meta.dirname, '../src/feature-cli.mjs')
test('real phase completion cannot advance a rendered draft with an invalid edge', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'ateam-artifact-phase-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = join(root, 'docs/features/save')
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(root, 'docs/product/jtbd'), { recursive: true })
  writeFileSync(join(root, 'docs/product/jtbd/01-save.md'), 'Save work')
  writeCurrentContext(root)
  writeFixture(dir)
  let revision = 0,
    event = 0
  const run = (type, input) => {
    const child = spawnSync(
      process.execPath,
      [
        cli,
        type,
        '--feature',
        dir,
        '--expected-revision',
        String(revision),
        '--event-id',
        String(++event),
        '--input',
        JSON.stringify(input),
      ],
      { encoding: 'utf8' },
    )
    const result = JSON.parse(child.stdout)
    if (result.manifest) revision = result.manifest.revision
    return result
  }
  assert.equal(
    run('init', {
      slug: 'save',
      repo: root,
      run_brief: {
        mode: 'prototype',
        outcome: 'Try save',
        deliverables: ['save screen'],
        required_verification: ['rendered review'],
      },
    }).status,
    'success',
  )
  assert.equal(run('start', { phase: 'discovery' }).status, 'success')
  assert.equal(
    run('complete', { phase: 'discovery', artifacts: ['../../product/jtbd'] }).status,
    'success',
  )
  assert.equal(run('start', { phase: 'definition' }).status, 'success')
  const path = join(dir, 'briefs/wireflow/board.json'),
    board = JSON.parse(readFileSync(path, 'utf8'))
  board.journeys[0].edges[0].to = 'N-NOT-DEFINED'
  writeFileSync(path, JSON.stringify(board))
  writeFileSync(join(dir, 'briefs/wireflow/board.svg'), '<svg>Plausible draft</svg>')
  const blocked = run('complete', { phase: 'definition', artifacts: ['prd.md', 'briefs'] })
  assert.equal(blocked.status, 'blocked')
  assert.match(blocked.error.message, /N-NOT-DEFINED/)
  board.journeys[0].edges[0].to = 'N-SAVE'
  writeFileSync(path, JSON.stringify(board))
  assert.equal(
    run('complete', { phase: 'definition', artifacts: ['prd.md', 'briefs'] }).status,
    'success',
  )
  assert.equal(
    run('approve', {
      phase: 'definition',
      decision: { kind: 'human', actor: 'Owner', reference: 'fixture-review', authorized: true },
    }).status,
    'success',
  )
  const pagesPath = join(dir, 'briefs/pages/board.json'),
    pages = JSON.parse(readFileSync(pagesPath, 'utf8'))
  pages.pages[0].checklist[0].jobs = ['UNLISTED']
  writeFileSync(pagesPath, JSON.stringify(pages))
  assert.equal(run('start', { phase: 'design' }).status, 'blocked')
})
test('design phase artifact gate requires the actual generated flow contract', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'ateam-flow-phase-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = join(root, 'docs/features/save')
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(root, 'docs/product/jtbd'), { recursive: true })
  writeFileSync(join(root, 'docs/product/jtbd/01-save.md'), 'Save work')
  writeCurrentContext(root)
  writeFixture(dir)
  const { validateFeatureArtifacts } = await import('../src/artifacts.mjs')
  assert.equal(
    (await validateFeatureArtifacts({ featureDir: dir, root, stage: 'design' })).ok,
    true,
  )
  rmSync(join(dir, 'lofi/src/data/flow.json'))
  const report = await validateFeatureArtifacts({ featureDir: dir, root, stage: 'design' })
  assert.equal(report.ok, false)
  assert.ok(report.diagnostics.some((d) => d.field === 'flow-contract'))
})
