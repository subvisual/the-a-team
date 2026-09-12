import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { compileFlow, flowRevision } from '../src/flow.mjs'
import { saveFlow } from './fixtures/flow/save.mjs'
import { validateAlternativeFile, validateFeatureAlternatives } from '../src/alternatives.mjs'
import { operatorFixture, human } from './helpers/operator-fixture.mjs'
import {
  writeAssumptions,
  assumptionsFixture,
  researchPath,
  researchDecision,
} from './helpers/assumptions-fixture.mjs'

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ateam-alternatives-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const bind = (path, body) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), body)
    return { path, revision: hash(body) }
  }
  writeAssumptions(
    root,
    assumptionsFixture({
      cheapestProbe: {
        method: 'interaction-comparison',
        description: 'Compare task sequence',
        evidenceProducingStage: 'design',
      },
    }),
  )
  const guided = compileFlow(saveFlow())
  const data = saveFlow()
  data.prototype.id = 'F-WORKSPACE'
  data.wireflow.journeys[0].edges = data.wireflow.journeys[0].edges.filter((e) => e.id !== 'E-EDIT')
  data.wireflow.journeys[0].edges.push({
    id: 'E-DONE-EDIT',
    from: 'N-DONE',
    to: 'N-EDIT',
    trigger: 'edit',
    label: 'Edit another request',
  })
  const workspace = compileFlow(data)
  const record = {
    schemaVersion: 1,
    id: 'COMPARE-SAVE',
    featureSlug: 'save',
    mode: 'compare',
    risk: {
      level: 'high',
      uncertainty: 'Guided sequence or direct workspace?',
      ...bind('risk.md', 'Accepted task-sequence uncertainty; test with interactive prototypes.'),
    },
    riskSource: {
      path: researchPath,
      sha256: hash(readFileSync(join(root, researchPath))),
      revision: 1,
      assumptionIds: ['ASM-SAVE'],
    },
    job: {
      id: '01',
      ...bind(
        'docs/product/jtbd/01-save.md',
        '---\nid: 01\nstatus: active\n---\nSubmit a request without losing entered work.',
      ),
    },
    designSystem: bind('tokens.css', ':root{--surface:white;--text:black}'),
    scenario: guided.scenario,
    constraints: ['Preserve the existing visual system', 'Retain failed input'],
    criteria: [
      {
        id: 'C-RECOVERY',
        question: 'Can entered data survive a failed save?',
        method: 'interactive-prototype',
      },
      {
        id: 'C-USABILITY',
        question: 'Can intended users complete the primary job?',
        method: 'human-study',
      },
    ],
    options: [guided, workspace].map((flow, i) => ({
      id: i ? 'workspace' : 'guided',
      title: i ? 'Direct workspace' : 'Guided sequence',
      flow: bind(`flow-${i}.json`, JSON.stringify(flow)),
      tradeoffs: {
        benefits: [i ? 'More direct user control' : 'Clear sequence'],
        costs: [i ? 'More choices at once' : 'More sequential actions'],
      },
      observations: [
        {
          criterionId: 'C-RECOVERY',
          status: 'unrun',
          note: 'Interactive comparison has not run yet.',
        },
        { criterionId: 'C-USABILITY', status: 'unrun', note: 'No target-user session.' },
      ],
    })),
    selection: {
      optionId: 'guided',
      status: 'provisional',
      rationale: 'Start with an explicit sequence while gathering evidence.',
      pendingUsabilityObligations: ['OBL-STUDY'],
    },
  }
  const check = () => {
    writeFileSync(join(root, 'comparison.json'), JSON.stringify(record))
    return validateAlternativeFile({ root, recordPath: 'comparison.json' })
  }
  return { root, record, bind, check }
}

test('structural comparison preserves shared methods, exact bindings and pending usability', async (t) => {
  const f = fixture(t),
    r = await f.check()
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics))
  assert.equal(r.selection.status, 'provisional')
  assert.deepEqual(r.selection.pendingUsabilityObligations, ['OBL-STUDY'])
  assert.ok(r.bindings['tokens.css'])
  assert.ok(r.options.every((o) => o.pendingCriteria.includes('C-USABILITY')))
})
test('palette, identifiers and labels alone do not count as a structural alternative', async (t) => {
  const f = fixture(t)
  f.record.options[1].flow = f.record.options[0].flow
  f.record.options[1].title = 'Another palette and scale'
  const r = await f.check()
  assert.equal(r.ok, false)
  assert.ok(r.diagnostics.some((d) => /structure/.test(d.message)))
})

test('unreachable states and decorative condition metadata do not count as interaction variety', async (t) => {
  for (const mutate of [
    (flow) => {
      flow.graph.nodes.push({
        id: 'N-UNREACHABLE',
        type: 'screen',
        pageId: 'P-EXTRA',
        text: 'Decorative extra screen',
        lane: 'Editor',
        col: 8,
      })
      flow.states.push({ nodeId: 'N-UNREACHABLE', pageId: 'P-EXTRA', kind: 'summary' })
    },
    (flow) => {
      flow.graph.edges.find((edge) => edge.condition).condition.description =
        'Use a different palette'
    },
    (flow) => {
      flow.graph.nodes.push({
        id: 'N-UNAVAILABLE',
        type: 'screen',
        pageId: 'P-EXTRA',
        text: 'Impossible result',
        lane: 'Editor',
        col: 8,
      })
      flow.states.push({ nodeId: 'N-UNAVAILABLE', pageId: 'P-EXTRA', kind: 'summary' })
      flow.graph.edges.push({
        id: 'E-UNAVAILABLE',
        from: 'N-SAVING',
        to: 'N-UNAVAILABLE',
        trigger: 'settle',
        label: 'Unavailable outcome',
        condition: { kind: 'outcome', value: 'never-emitted' },
      })
    },
  ]) {
    const f = fixture(t),
      flow = JSON.parse(readFileSync(join(f.root, f.record.options[0].flow.path)))
    mutate(flow)
    flow.revision = flowRevision(
      Object.fromEntries(Object.entries(flow).filter(([key]) => key !== 'revision')),
    )
    f.record.options[1].flow = f.bind('decorated-flow.json', JSON.stringify(flow))
    assert.equal((await f.check()).ok, false)
  }
})
test('methods and scenario cannot differ between options and unrun usability cannot be accepted', async (t) => {
  const f = fixture(t)
  f.record.options[1].observations[0].method = 'expert-review'
  f.record.selection.status = 'accepted'
  f.record.selection.pendingUsabilityObligations = []
  const r = await f.check()
  assert.equal(r.ok, false)
  assert.ok(r.diagnostics.some((d) => /method/.test(d.message)))
  assert.ok(r.diagnostics.some((d) => /provisional|usability/.test(d.message)))
})
test('changed conventions or forged observed evidence cannot validate the comparison', async (t) => {
  const f = fixture(t)
  writeFileSync(join(f.root, 'tokens.css'), 'changed conventions')
  f.record.options[0].observations[0] = {
    criterionId: 'C-RECOVERY',
    status: 'observed',
    note: 'Claims pass without receipt',
  }
  const r = await f.check()
  assert.equal(r.ok, false)
  assert.ok(r.diagnostics.some((d) => /revision/.test(d.message)))
  assert.ok(r.diagnostics.some((d) => /evidence/.test(d.message)))
})
test('a routine correction skips variants with a reason while preserving conventions', async (t) => {
  const f = fixture(t)
  f.record.mode = 'skip'
  f.record.risk.level = 'routine'
  writeAssumptions(f.root, assumptionsFixture({ loadBearing: false }))
  f.record.riskSource.sha256 = hash(readFileSync(join(f.root, researchPath)))
  f.record.reason = 'Correct existing button label; interaction structure is settled.'
  f.record.options = []
  delete f.record.selection
  assert.equal((await f.check()).ok, true)
  f.record.risk.level = 'high'
  assert.equal((await f.check()).ok, false)
})

test('a high-risk assumption cannot be downgraded to a routine skip or replaced by an invented risk ID', async (t) => {
  const f = fixture(t)
  f.record.mode = 'skip'
  f.record.risk.level = 'routine'
  f.record.reason = 'Pretend routine'
  f.record.options = []
  delete f.record.selection
  assert.equal((await f.check()).ok, false)
  f.record.riskSource.assumptionIds = ['ASM-INVENTED']
  assert.equal((await f.check()).ok, false)
})

test('the shared job must be a current active canonical job with the same ID', async (t) => {
  const f = fixture(t)
  f.record.job = {
    id: '01',
    ...f.bind(
      'docs/product/jtbd/01-save.md',
      '---\nid: 99\nstatus: parked\n---\nNot the accepted job',
    ),
  }
  assert.equal((await f.check()).ok, false)
})

test('the feature design gate requires declared comparisons and binds the chosen flow', async (t) => {
  const f = fixture(t),
    featureDir = join(f.root, 'docs/features/save')
  mkdirSync(featureDir, { recursive: true })
  let result = await validateFeatureAlternatives({ root: f.root, featureDir })
  assert.equal(result.ok, false)
  assert.match(result.diagnostics[0].message, /required/)
  await f.check()
  writeFileSync(join(featureDir, 'interaction-comparison.json'), JSON.stringify(f.record))
  writeFileSync(
    join(featureDir, 'design.md'),
    '```flow-contract\n' +
      readFileSync(join(f.root, f.record.options[0].flow.path), 'utf8') +
      '\n```\n',
  )
  result = await validateFeatureAlternatives({ root: f.root, featureDir })
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  f.record.selection.optionId = 'workspace'
  writeFileSync(join(featureDir, 'interaction-comparison.json'), JSON.stringify(f.record))
  result = await validateFeatureAlternatives({ root: f.root, featureDir })
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some((d) => d.field === 'selection'))
})

test('actual feature CLI refuses design completion when a declared comparison is missing', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'ateam-comparison-gate-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const f = operatorFixture(root)
  assert.equal(f.init().status, 'success')
  // Give this synthetic scenario a canonical record before phase execution.
  writeAssumptions(
    root,
    assumptionsFixture({
      cheapestProbe: {
        method: 'interaction-comparison',
        description: 'Compare request sequence',
        evidenceProducingStage: 'design',
      },
    }),
  )
  assert.equal(
    f.run('configure', { authorization: human, run_brief: { assumptions: ['ASM-SAVE'] } }).status,
    'success',
  )
  assert.equal(f.definition().status, 'success')
  assert.equal(f.run('approve', { phase: 'definition', decision: human }).status, 'success')
  assert.equal(f.run('start', { phase: 'design' }).status, 'success')
  const result = f.run('complete', { phase: 'design', artifacts: ['design.md'] })
  assert.equal(result.status, 'blocked', JSON.stringify(result))
  assert.match(JSON.stringify(result), /Interaction alternatives required/)
})

test('standalone comparison keeps exact feature scope and ignores unrelated research outcomes', async (t) => {
  const f = fixture(t),
    ledger = assumptionsFixture({
      cheapestProbe: {
        method: 'interaction-comparison',
        description: 'Compare task sequence',
        evidenceProducingStage: 'design',
      },
    })
  ledger.assumptions.push({
    ...assumptionsFixture().assumptions[0],
    id: 'ASM-OTHER',
    features: ['other'],
    disposition: 'no-go',
    decision: researchDecision(),
  })
  writeAssumptions(f.root, ledger)
  f.record.riskSource.sha256 = hash(readFileSync(join(f.root, researchPath)))
  assert.equal((await f.check()).ok, true)
  f.record.featureSlug = 'other'
  assert.equal((await f.check()).ok, false)
})
test('null records/options and absent criteria yield actionable aggregate diagnostics', async (t) => {
  const f = fixture(t)
  writeFileSync(join(f.root, 'comparison.json'), 'null')
  let result = await validateAlternativeFile({ root: f.root, recordPath: 'comparison.json' })
  assert.equal(result.ok, false)
  assert.match(result.diagnostics[0].message, /object/)
  f.record.options[0] = null
  delete f.record.criteria
  result = await f.check()
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some((d) => d.field === 'options'))
  assert.ok(result.diagnostics.some((d) => d.field === 'criteria'))
})
