import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileFlow, validateFlow, assessFlowEvidence } from '../src/flow.mjs'
import { createFlow } from '../../.claude/skills/build-lofi/templates/src/lib/flow-runtime.mjs'
import { saveFlow } from './fixtures/flow/save.mjs'

test('flow compilation preserves stable graph IDs, conditions and transition semantics', () => {
  const { wireflow, prototype } = saveFlow()
  const contract = compileFlow({ wireflow, prototype })
  assert.deepEqual(contract.graph, wireflow.journeys[0])
  assert.equal(contract.sourceRevision.length, 64)
  wireflow.journeys[0].edges[0].to = 'N-MISSING'
  assert.throws(() => compileFlow({ wireflow, prototype }), /E-INVALID.*N-MISSING/)
})
test('interactive public flow retains failed input, retries the same payload and resets the scenario', () => {
  const flow = createFlow(compileFlow(saveFlow()))
  flow.send('save')
  assert.equal(flow.snapshot().nodeId, 'N-INVALID')
  flow.change('name', 'Annual review')
  flow.send('save')
  assert.equal(flow.snapshot().nodeId, 'N-SAVING')
  assert.throws(() => flow.send('settle', 'success'), /only from the scenario/)
  flow.settle()
  assert.equal(flow.snapshot().nodeId, 'N-ERROR')
  assert.equal(flow.snapshot().draft.name, 'Annual review')
  assert.throws(() => flow.send('submit'), /not available/)
  flow.send('retry')
  flow.settle()
  assert.equal(flow.snapshot().nodeId, 'N-REVIEW')
  assert.deepEqual(
    flow.snapshot().requests.map((r) => r.payload),
    [{ name: 'Annual review' }, { name: 'Annual review' }],
  )
  assert.deepEqual(flow.snapshot().persisted, { name: 'Annual review' })
  flow.send('submit')
  assert.equal(flow.snapshot().nodeId, 'N-DONE')
  flow.reset()
  assert.deepEqual(flow.snapshot().draft, { name: '' })
  assert.equal(flow.snapshot().requests.length, 0)
  flow.change('name', 'Annual review')
  flow.send('save')
  flow.settle()
  assert.equal(flow.snapshot().nodeId, 'N-ERROR')
})
test('navigation evidence cannot satisfy validation or recovery obligations', () => {
  const contract = compileFlow(saveFlow('navigation')),
    flow = createFlow(contract)
  for (const id of ['E-SAVE', 'E-FAIL', 'E-RETRY', 'E-SAVED', 'E-SUBMIT']) flow.navigate(id)
  const report = assessFlowEvidence({ contract, receipt: flow.receipt() })
  assert.equal(report.obligations.find((o) => o.id === 'OBL-NAV').status, 'observed')
  for (const id of ['OBL-VALIDATION', 'OBL-RECOVERY'])
    assert.equal(report.obligations.find((o) => o.id === id).status, 'unverified')
  assert.deepEqual(flow.snapshot().persisted, {})
})
test('unknown state pages and ambiguous branch predicates are rejected before generation', () => {
  const { wireflow, prototype } = saveFlow()
  prototype.states[0].pageId = 'P-MISSING'
  let report = validateFlow({ ...prototype, graph: wireflow.journeys[0] })
  assert.equal(report.ok, false)
  assert.ok(report.diagnostics.some((d) => d.reference === 'P-MISSING'))
  prototype.states[0].pageId = 'P-EDIT'
  delete wireflow.journeys[0].edges[0].condition
  report = validateFlow({ ...prototype, graph: wireflow.journeys[0] })
  assert.equal(report.ok, false)
})
test('navigation sketches preserve descriptive conditions without interpreting them', () => {
  const data = saveFlow('navigation')
  data.wireflow.journeys[0].edges[0].condition = 'The name has not been supplied'
  delete data.wireflow.journeys[0].edges[0].trigger
  const contract = compileFlow(data)
  assert.equal(contract.graph.edges[0].condition, 'The name has not been supplied')
  const flow = createFlow(contract)
  flow.navigate('E-INVALID')
  assert.equal(flow.snapshot().nodeId, 'N-INVALID')
})
test('reserved settle event cannot create an unusable summary action', () => {
  const data = saveFlow()
  data.wireflow.journeys[0].edges.find((e) => e.id === 'E-SUBMIT').trigger = 'settle'
  assert.throws(() => compileFlow(data), /E-SUBMIT.*settle/)
})
