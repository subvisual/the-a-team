import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import * as artifacts from '../src/artifacts.mjs'
import { artifactFixture } from './helpers/artifact-fixture.mjs'
import { writeFixture } from './helpers/obligations-fixture.mjs'
import { writeCurrentContext } from './helpers/current-context.mjs'
import { contentRevision } from '../src/context.mjs'
const harness = resolve(import.meta.dirname, '../..')
const renderers = {
  wireflow: '.claude/skills/wireflow/scripts/wireflow.py',
  'page-brief': '.claude/skills/page-brief/scripts/page-brief.py',
}
function temp(t) {
  const root = mkdtempSync(join(tmpdir(), 'ateam-artifact-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

test('strict graph validation names unknown endpoints without silently dropping an edge', () => {
  const { wireflow } = artifactFixture()
  wireflow.journeys[0].edges[1].to = 'N-MISSING'
  const report = artifacts.validateWireflow(wireflow, { path: 'briefs/wireflow/board.json' })
  assert.equal(report.ok, false)
  assert.ok(
    report.diagnostics.some(
      (d) =>
        d.id === 'E-SAVE' && d.reference === 'N-MISSING' && d.path === 'briefs/wireflow/board.json',
    ),
  )
})
test('page validation rejects unknown job/page/journey references and both missing acceptance layers', () => {
  const { pages } = artifactFixture()
  pages.pages[0].checklist[0].jobs = ['UNKNOWN']
  pages.pages[0].connects = [{ kind: 'page', targetId: 'P-MISSING', trigger: 'Open' }]
  pages.pages[0].acceptance = {}
  pages.pages[0].appears_in = [{ journey: 'J-MISSING' }]
  const report = artifacts.validatePageBrief(pages, {
    path: 'briefs/pages/board.json',
    journeyIds: ['J-SAVE'],
  })
  assert.equal(report.ok, false)
  for (const value of ['UNKNOWN', 'P-MISSING', 'J-MISSING'])
    assert.ok(
      report.diagnostics.some((d) => d.reference === value),
      value,
    )
  for (const layer of ['factual', 'qualitative'])
    assert.ok(report.diagnostics.some((d) => d.field === `acceptance.${layer}`))
})
test('component state declarations require all states or a concrete not-applicable reason', () => {
  const { components } = artifactFixture()
  components.components[0].states.empty = {
    status: 'not-applicable',
    reason: 'The field always has a required persisted initial value',
  }
  assert.equal(artifacts.validateComponents(components, { pageIds: ['P1'] }).ok, true)
  delete components.components[0].states.error
  assert.equal(artifacts.validateComponents(components, { pageIds: ['P1'] }).ok, false)
  components.components[0].states.error = { status: 'not-applicable', reason: '' }
  assert.equal(artifacts.validateComponents(components, { pageIds: ['P1'] }).ok, false)
})
test('page occurrences must identify an actual screen node for that page', () => {
  const { wireflow, pages } = artifactFixture()
  pages.pages[0].appears_in = [{ journey: 'J-SAVE', step: 'N-MISSING' }]
  let report = artifacts.validatePageBrief(pages, { journeys: wireflow.journeys })
  assert.equal(report.ok, false)
  assert.ok(report.diagnostics.some((d) => d.reference === 'N-MISSING'))
  pages.pages[0].appears_in[0].step = 'N-START'
  report = artifacts.validatePageBrief(pages, { journeys: wireflow.journeys })
  assert.equal(report.ok, false)
  pages.pages[0].appears_in[0].step = 'N-SAVE'
  assert.equal(artifacts.validatePageBrief(pages, { journeys: wireflow.journeys }).ok, true)
})
test('journey connections use the full graph registry at the feature boundary', () => {
  const { wireflow, pages } = artifactFixture()
  pages.pages[0].connects = [{ kind: 'journey', targetId: 'J-MISSING', trigger: 'Go' }]
  const report = artifacts.validatePageBrief(pages, { journeys: wireflow.journeys })
  assert.equal(report.ok, false)
  assert.ok(report.diagnostics.some((d) => d.reference === 'J-MISSING'))
})
test('strict wireflow validates board jobs and renderer-required node labels', () => {
  const { wireflow } = artifactFixture()
  wireflow.jtbds.push('JOB-MISSING')
  delete wireflow.journeys[0].nodes[0].text
  const report = artifacts.validateWireflow(wireflow, { jobIds: ['01'] })
  assert.equal(report.ok, false)
  assert.ok(report.diagnostics.some((d) => d.reference === 'JOB-MISSING'))
  assert.ok(report.diagnostics.some((d) => d.id === 'N-START' && d.field === 'text'))
})
test('malformed collections produce artifact diagnostics instead of throwing', () => {
  const { wireflow, pages } = artifactFixture()
  wireflow.journeys[0].lanes = { wrong: true }
  wireflow.journeys[0].edges = 'missing'
  pages.pages[0].checklist = { wrong: true }
  assert.equal(artifacts.validateWireflow(wireflow).ok, false)
  assert.equal(artifacts.validatePageBrief(pages).ok, false)
})
test('real strict matrix rendering checks effective board lanes including CLI override', (t) => {
  const dir = temp(t),
    { wireflow } = artifactFixture()
  wireflow.lanes = ['Editor']
  assert.equal(artifacts.validateWireflow({ ...wireflow, layout: 'matrix', lanes: { Editor: true } }).ok, false)
  for (const override of [false, true]) {
    wireflow.layout = override ? 'horizontal' : 'matrix'
    const path = join(dir, 'board.json')
    writeFileSync(path, JSON.stringify(wireflow))
    const child = spawnSync(
      'python3',
      [
        join(harness, renderers.wireflow),
        path,
        '--strict',
        '--out',
        join(dir, 'out'),
        ...(override ? ['--layout', 'matrix'] : []),
      ],
      { encoding: 'utf8' },
    )
    assert.equal(child.status, 2, child.stderr)
    assert.match(child.stderr, /N-SAVE.*App/)
    assert.equal(existsSync(join(dir, 'out')), false)
  }
})
test('real feature sources return file-specific diagnostics for null nested records', async (t) => {
  const root = temp(t),
    dir = join(root, 'docs/features/save')
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(root, 'docs/product/jtbd'), { recursive: true })
  writeFileSync(join(root, 'docs/product/jtbd/01-save.md'), 'Save pending work')
  for (const [path, mutate] of [
    ['briefs/pages/board.json', (value) => value.pages.push(null)],
    ['briefs/wireflow/board.json', (value) => value.journeys.push(null)],
    ['acceptance.json', (value) => value.requirements.push(null)],
    ['acceptance.json', (value) => value.requirements[0].obligations.push(null)],
  ]) {
    writeFixture(dir)
    const baseline = await artifacts.validateFeatureArtifacts({ featureDir: dir, root })
    assert.equal(baseline.ok, true, JSON.stringify(baseline.diagnostics))
    const source = join(dir, path),
      value = JSON.parse(readFileSync(source, 'utf8'))
    mutate(value)
    writeFileSync(source, JSON.stringify(value))
    const report = await artifacts.validateFeatureArtifacts({ featureDir: dir, root })
    assert.equal(report.ok, false)
    assert.ok(
      report.diagnostics.some((d) => d.path === path),
      JSON.stringify(report.diagnostics),
    )
  }
})
test('non-interface exemption requires a current canonical source and requirement', async (t) => {
  const root = temp(t),
    dir = join(root, 'docs/features/save')
  mkdirSync(dir, { recursive: true })
  writeFixture(dir)
  writeCurrentContext(root)
  const path = join(dir, 'prd.md'),
    prd = readFileSync(path, 'utf8')
  const setScope = (scope) =>
    writeFileSync(path, prd + '\n```artifact-scope\n' + JSON.stringify(scope) + '\n```\n')
  setScope({ interface: 'none', reason: 'A headless import', source: 'invented' })
  let report = await artifacts.validateFeatureArtifacts({ featureDir: dir, root })
  assert.equal(report.ok, false)
  assert.ok(report.diagnostics.some((d) => d.field === 'artifact-scope'))
  const source = 'The accepted change is a headless import with no interface.'
  writeFileSync(join(root, 'headless.md'), source)
  const contextPath = join(root, 'docs/product/context.md'),
    index = artifacts.artifactBlock(readFileSync(contextPath, 'utf8'), 'ateam-context')
  index.sources.push({
    id: 'REQ-HEADLESS',
    kind: 'requirement',
    path: 'headless.md',
    revision: contentRevision(source),
  })
  writeFileSync(contextPath, '```ateam-context\n' + JSON.stringify(index) + '\n```\n')
  setScope({
    interface: 'none',
    reason: 'A headless import',
    requirementId: 'R-ROUNDTRIP',
    source: { id: 'REQ-HEADLESS', revision: contentRevision(source) },
  })
  report = await artifacts.validateFeatureArtifacts({ featureDir: dir, root })
  assert.equal(report.ok, true, JSON.stringify(report))
  writeFileSync(join(root, 'headless.md'), 'Now includes a screen')
  report = await artifacts.validateFeatureArtifacts({ featureDir: dir, root })
  assert.equal(report.ok, false)
  assert.ok(report.diagnostics.some((d) => d.field === 'artifact-scope'))
})
for (const kind of ['wireflow', 'page-brief'])
  test(`real ${kind} renderer blocks invalid strict input and explicit permissive mode warns`, (t) => {
    const dir = temp(t),
      f = artifactFixture(),
      input = kind === 'wireflow' ? f.wireflow : f.pages
    if (kind === 'wireflow') input.journeys[0].edges[0].to = 'MISSING'
    else input.pages[0].checklist[0].jobs = ['MISSING']
    const path = join(dir, 'board.json')
    writeFileSync(path, JSON.stringify(input))
    const run = (mode) =>
      spawnSync(
        'python3',
        [join(harness, renderers[kind]), path, mode, '--out', join(dir, 'out')],
        { encoding: 'utf8' },
      )
    const strict = run('--strict')
    assert.equal(strict.status, 2, strict.stderr)
    assert.match(strict.stderr, /MISSING/)
    assert.equal(existsSync(join(dir, 'out')), false)
    const permissive = run('--permissive')
    assert.equal(permissive.status, 0, permissive.stderr)
    assert.match(permissive.stderr, /warning.*MISSING/i)
    assert.match(permissive.stderr, /ineligible/i)
  })
test('valid real renderers retain all node/edge identities in their validation receipt', (t) => {
  const dir = temp(t),
    f = artifactFixture()
  for (const kind of ['wireflow', 'page-brief']) {
    const path = join(dir, `${kind}.json`)
    writeFileSync(path, JSON.stringify(kind === 'wireflow' ? f.wireflow : f.pages))
    const child = spawnSync(
      'python3',
      [join(harness, renderers[kind]), path, '--strict', '--out', join(dir, kind)],
      { encoding: 'utf8' },
    )
    assert.equal(child.status, 0, child.stderr)
    const receipt = JSON.parse(readFileSync(join(dir, kind, 'artifact-validation.json'), 'utf8'))
    assert.equal(receipt.eligible, true)
    if (kind === 'wireflow') {
      assert.deepEqual(receipt.ids.nodes, ['N-START', 'N-SAVE', 'N-DONE'])
      assert.deepEqual(receipt.ids.edges, ['E-OPEN', 'E-SAVE'])
    }
  }
})
test('feature gate reads real sources and refuses missing artifacts and component state declarations', async (t) => {
  const root = temp(t),
    dir = join(root, 'docs/features/save')
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(root, 'docs/product/jtbd'), { recursive: true })
  writeFileSync(join(root, 'docs/product/jtbd/01-save.md'), '---\nid: 01\n---\nPreserve work')
  writeFixture(dir)
  let report = await artifacts.validateFeatureArtifacts({
    featureDir: dir,
    root,
    stage: 'definition',
  })
  assert.equal(report.ok, true, JSON.stringify(report))
  const spec = readFileSync(join(dir, 'spec.md'), 'utf8')
  writeFileSync(
    join(dir, 'spec.md'),
    spec.replace(/```component-states[\s\S]*?```/, 'Missing component contract'),
  )
  report = await artifacts.validateFeatureArtifacts({ featureDir: dir, root, stage: 'spec' })
  assert.equal(report.ok, false)
  assert.ok(report.diagnostics.some((d) => d.field === 'component-states'))
  rmSync(join(dir, 'briefs/wireflow/board.json'))
  report = await artifacts.validateFeatureArtifacts({ featureDir: dir, root, stage: 'definition' })
  assert.equal(report.ok, false)
  assert.ok(report.diagnostics.some((d) => d.path === 'briefs/wireflow/board.json'))
})
