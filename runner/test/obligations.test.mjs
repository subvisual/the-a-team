import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fixture, snapshots, decision } from './helpers/obligations-fixture.mjs'

const api = existsSync(new URL('../src/obligations.mjs', import.meta.url))
  ? await import('../src/obligations.mjs')
  : {}
const evaluate = (ledger, options = {}) => {
  assert.equal(typeof api.evaluateAcceptance, 'function', 'acceptance evaluation API must exist')
  return api.evaluateAcceptance(ledger, {
    stage: 'issues',
    artifacts: snapshots(ledger),
    ...options,
  })
}
const has = (result, id, field) =>
  result.diagnostics.some(
    (d) => d.obligationId === id && d.field === field && d.severity === 'error',
  )

test('code-only tickets retain rendered and human study obligations without accepting the requirement', () => {
  const ledger = fixture()
  const result = evaluate(ledger)
  assert.equal(result.ok, true)
  assert.equal(result.requirements[0].accepted, false)
  assert.deepEqual(
    result.pending.map((o) => o.id),
    ['OBL-CODE', 'OBL-SCREEN', 'OBL-STUDY'],
  )
  assert.equal(result.obligations.find((o) => o.id === 'OBL-STUDY').method, 'human-study')
  assert.equal(evaluate(ledger, { stage: 'verification' }).ok, false)
})

for (const [field, value] of [
  ['method', 'automated'],
  ['statement', 'Just compile'],
  ['requiredStage', 'release'],
  ['owner', { role: 'engineering', actor: null }],
]) {
  test(`weakened downstream ${field} fails with the obligation and changed field`, () => {
    const ledger = fixture(),
      artifacts = snapshots(ledger)
    artifacts['spec.md'][1][field] = value
    const result = evaluate(ledger, { artifacts })
    assert.equal(result.ok, false)
    assert.ok(has(result, 'OBL-SCREEN', field), JSON.stringify(result.diagnostics))
  })
}

test('dropping an obligation or unknown artifact reference fails deterministic coverage', () => {
  const ledger = fixture(),
    artifacts = snapshots(ledger)
  artifacts['issues.md'].pop()
  assert.ok(has(evaluate(ledger, { artifacts }), 'OBL-STUDY', 'snapshot'))
  ledger.artifacts.find((a) => a.path === 'issues.md').obligationIds.pop()
  const result = evaluate(ledger)
  assert.ok(has(result, 'OBL-STUDY', 'artifacts.issues'))
})

test('unresolved ownership stays visible until the required stage', () => {
  const ledger = fixture()
  ledger.requirements[0].obligations[0].owner = { role: null, actor: null }
  const early = evaluate(ledger)
  assert.equal(early.ok, true)
  assert.deepEqual(early.unresolvedOwners, ['OBL-CODE'])
  assert.ok(has(evaluate(ledger, { stage: 'verification' }), 'OBL-CODE', 'owner'))
})

test('satisfaction requires evidence for this requirement version and matching method', () => {
  const ledger = fixture(),
    obligation = ledger.requirements[0].obligations[2]
  obligation.status = 'satisfied'
  obligation.evidence = [
    { reference: 'test-results.txt', requirementVersion: 1, method: 'automated', actor: 'Tester' },
  ]
  assert.ok(has(evaluate(ledger), 'OBL-STUDY', 'evidence.method'))
  obligation.evidence[0].method = 'human-study'
  obligation.evidence[0].requirementVersion = 0
  assert.ok(has(evaluate(ledger), 'OBL-STUDY', 'evidence.requirementVersion'))
  obligation.evidence[0].requirementVersion = 1
  assert.equal(evaluate(ledger).ok, true)
  assert.equal(evaluate(ledger).requirements[0].accepted, false)
})

test('invalid deferral is rejected; complete authorized deferral remains visible and unaccepted', () => {
  const ledger = fixture(),
    obligation = ledger.requirements[0].obligations[1]
  obligation.status = 'deferred'
  obligation.deferral = { rationale: 'Later' }
  assert.ok(has(evaluate(ledger), 'OBL-SCREEN', 'deferral.actor'))
  obligation.deferral = { ...decision(), nextDecisionStage: 'release' }
  const result = evaluate(ledger, { stage: 'verification' })
  assert.equal(result.deferred.length, 1)
  assert.equal(result.requirements[0].accepted, false)
  assert.equal(result.deferred[0].deferral.actor, 'Product lead')
  assert.equal(has(result, 'OBL-SCREEN', 'status'), false)
  assert.ok(has(evaluate(ledger, { stage: 'release' }), 'OBL-SCREEN', 'deferral.nextDecisionStage'))
})

test('benchmark definitions have explicit versioned workload, units, threshold, method and scope', () => {
  const ledger = fixture(),
    obligation = ledger.requirements[0].obligations[0]
  obligation.method = 'performance-benchmark'
  obligation.benchmark = {
    version: 1,
    workload: '10000 saved rows',
    units: 'ms',
    threshold: { operator: '<=', value: 100 },
    method: 'p95 of 20 cold launches',
    scope: 'Local desktop baseline',
  }
  assert.equal(evaluate(ledger).ok, true)
  delete obligation.benchmark.units
  assert.ok(has(evaluate(ledger), 'OBL-CODE', 'benchmark.units'))
})

for (const [field, value] of [
  ['units', 'seconds'],
  ['threshold', { operator: '<=', value: 10 }],
  ['method', 'mean of warm launches'],
  ['workload', '10 rows'],
  ['scope', 'Server only'],
]) {
  test(`benchmark ${field} change requires authorized versions and rejects old evidence`, () => {
    const previousLedger = fixture(),
      before = previousLedger.requirements[0].obligations[0]
    before.method = 'performance-benchmark'
    before.benchmark = {
      version: 1,
      workload: '10000 rows',
      units: 'ms',
      threshold: { operator: '<=', value: 100 },
      method: 'p95 cold',
      scope: 'Desktop',
    }
    const ledger = structuredClone(previousLedger),
      requirement = ledger.requirements[0],
      after = requirement.obligations[0]
    after.benchmark[field] = value
    assert.ok(has(evaluate(ledger, { previousLedger }), 'OBL-CODE', `benchmark.${field}`))
    ledger.revision = 2
    requirement.version = 2
    requirement.decision = decision()
    after.benchmark.version = 2
    assert.equal(evaluate(ledger, { previousLedger }).ok, true)
    after.status = 'satisfied'
    after.evidence = [
      {
        reference: 'old-results.txt',
        method: 'performance-benchmark',
        requirementVersion: 1,
        benchmarkVersion: 1,
        actor: 'Tester',
      },
    ]
    const result = evaluate(ledger, { previousLedger })
    assert.ok(has(result, 'OBL-CODE', 'evidence.requirementVersion'))
    assert.ok(has(result, 'OBL-CODE', 'evidence.benchmarkVersion'))
  })
}

test('canonical deletion and requirement weakening cannot disappear through a ledger revision', () => {
  const previousLedger = fixture(),
    ledger = structuredClone(previousLedger)
  ledger.revision = 2
  ledger.requirements[0].obligations.pop()
  assert.ok(has(evaluate(ledger, { previousLedger }), 'OBL-STUDY', 'obligation'))
  const changed = structuredClone(previousLedger)
  changed.requirements[0].obligations[1].method = 'automated'
  assert.ok(has(evaluate(changed, { previousLedger }), 'OBL-SCREEN', 'method'))
})

test('ticket disposition names a real ticket mapped to the same requirement', () => {
  const ledger = fixture(),
    artifacts = snapshots(ledger)
  artifacts['issues.md'][0].disposition.ticketId = 'ISS-MISSING'
  assert.ok(
    has(
      evaluate(ledger, { artifacts, issues: [{ id: 'ISS-CODE', requirements: ['R-ROUNDTRIP'] }] }),
      'OBL-CODE',
      'disposition.ticketId',
    ),
  )
})

test('unknown stages and malformed ledgers fail closed with structured diagnostics', () => {
  assert.equal(evaluate(fixture(), { stage: 'done' }).ok, false)
  assert.equal(evaluate({ schemaVersion: 1, requirements: null, artifacts: [] }).ok, false)
})

test('a requirement is accepted only when every obligation has current method-specific evidence', () => {
  const ledger = fixture()
  for (const obligation of ledger.requirements[0].obligations) {
    obligation.status = 'satisfied'
    obligation.evidence = [
      {
        reference: `${obligation.id}/results.md`,
        requirementVersion: 1,
        method: obligation.method,
        actor: 'Accountable reviewer',
      },
    ]
  }
  const result = evaluate(ledger, { stage: 'product-validation' })
  assert.equal(result.ok, true)
  assert.equal(result.requirements[0].accepted, true)
  assert.deepEqual(result.pending, [])
})

test('changed benchmark evidence cannot be relabelled to reuse a previous result reference', () => {
  const previousLedger = fixture(),
    before = previousLedger.requirements[0].obligations[0]
  before.method = 'performance-benchmark'
  before.benchmark = {
    version: 1,
    workload: '1000 rows',
    units: 'ms',
    threshold: { operator: '<=', value: 100 },
    method: 'p95 cold',
    scope: 'Desktop',
  }
  before.status = 'satisfied'
  before.evidence = [
    {
      reference: 'results/run-1.json',
      actor: 'Tester',
      method: before.method,
      requirementVersion: 1,
      benchmarkVersion: 1,
    },
  ]
  const ledger = structuredClone(previousLedger),
    requirement = ledger.requirements[0],
    after = requirement.obligations[0]
  ledger.revision = 2
  requirement.version = 2
  requirement.decision = decision()
  after.benchmark.version = 2
  after.benchmark.units = 'seconds'
  after.evidence[0].requirementVersion = 2
  after.evidence[0].benchmarkVersion = 2
  assert.ok(has(evaluate(ledger, { previousLedger }), 'OBL-CODE', 'evidence.reference'))
  after.evidence[0].reference = 'results/run-2.json'
  assert.equal(evaluate(ledger, { previousLedger }).ok, true)
})

test('benchmark version changes are authorized requirement revisions and cannot regress', () => {
  const previousLedger = fixture(),
    before = previousLedger.requirements[0].obligations[0]
  before.method = 'performance-benchmark'
  before.benchmark = {
    version: 2,
    workload: '1000 rows',
    units: 'ms',
    threshold: { operator: '<=', value: 100 },
    method: 'p95 cold',
    scope: 'Desktop',
  }
  const ledger = structuredClone(previousLedger),
    requirement = ledger.requirements[0]
  ledger.revision = 2
  requirement.obligations[0].benchmark.version = 1
  assert.ok(has(evaluate(ledger, { previousLedger }), 'OBL-CODE', 'benchmark.version'))
})

test('downstream benchmark weakening names the exact changed metric field', () => {
  const ledger = fixture(),
    obligation = ledger.requirements[0].obligations[0]
  obligation.method = 'performance-benchmark'
  obligation.benchmark = {
    version: 1,
    workload: '1000 rows',
    units: 'ms',
    threshold: { operator: '<=', value: 100 },
    method: 'p95 cold',
    scope: 'Desktop',
  }
  const artifacts = structuredClone(snapshots(ledger))
  artifacts['spec.md'][0].benchmark.units = 'seconds'
  assert.ok(has(evaluate(ledger, { artifacts }), 'OBL-CODE', 'benchmark.units'))
})

test('a revision cannot silently remove page-brief coverage from both declaration and snapshot', () => {
  const previousLedger = fixture(),
    ledger = structuredClone(previousLedger)
  ledger.revision = 2
  ledger.artifacts.find((artifact) => artifact.kind === 'page-brief').obligationIds.pop()
  assert.ok(has(evaluate(ledger, { previousLedger }), 'OBL-STUDY', 'artifacts.page-brief'))
})

test('full evidence provenance survives intermediate clearing independently of the latest definition change', () => {
  const original = fixture(),
    before = original.requirements[0].obligations[0]
  before.status = 'satisfied'
  before.evidence = [
    {
      reference: 'results/original.txt',
      actor: 'Tester',
      method: before.method,
      requirementVersion: 1,
    },
  ]
  const intermediate = structuredClone(original)
  intermediate.revision = 2
  intermediate.requirements[0].version = 2
  intermediate.requirements[0].decision = decision()
  intermediate.requirements[0].obligations[0].statement = 'Prove stricter restored-state behavior'
  intermediate.requirements[0].obligations[0].status = 'pending'
  intermediate.requirements[0].obligations[0].evidence = []
  const current = structuredClone(intermediate),
    after = current.requirements[0].obligations[0]
  current.revision = 3
  after.status = 'satisfied'
  after.evidence = [{ ...before.evidence[0], requirementVersion: 2 }]
  const result = evaluate(current, {
    previousLedger: intermediate,
    history: [original, intermediate],
  })
  assert.ok(has(result, 'OBL-CODE', 'evidence.reference'))
  after.evidence[0].reference = 'results/new.txt'
  assert.equal(
    evaluate(current, { previousLedger: intermediate, history: [original, intermediate] }).ok,
    true,
  )
})

test('history validation checks schemas and decisions without retrospective stage completion', () => {
  const ledger = fixture(),
    obligation = ledger.requirements[0].obligations[0]
  obligation.requiredStage = 'discovery'
  obligation.owner = { role: null, actor: null }
  let result = evaluate(ledger, { stage: 'release', historical: true, artifacts: {} })
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  assert.equal(result.requirements[0].accepted, false)
  obligation.status = 'deferred'
  obligation.deferral = { ...decision(), nextDecisionStage: 'definition' }
  result = evaluate(ledger, { stage: 'release', historical: true, artifacts: {} })
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  obligation.deferral.authorized = false
  assert.ok(
    has(
      evaluate(ledger, { stage: 'release', historical: true, artifacts: {} }),
      'OBL-CODE',
      'deferral.authorized',
    ),
  )
  obligation.deferral.authorized = true
  obligation.deferral.nextDecisionStage = 'unknown'
  assert.ok(has(evaluate(ledger, { historical: true }), 'OBL-CODE', 'deferral.nextDecisionStage'))
})
