import { test } from 'node:test'
import assert from 'node:assert/strict'
import { syntheticPilot } from '../examples/pilot/synthetic.mjs'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  calculatePilot,
  validatePilotHandoff,
  appendCheckpoint,
  validateCheckpointTrail,
} from '../src/pilot-scorecard.mjs'

test('all failed and interrupted attempts count toward spend and human-hour denominators', () => {
  const result = calculatePilot(syntheticPilot())
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  assert.equal(result.attempts, 10)
  assert.equal(result.metrics.spendUsd.knownTotal, 27)
  assert.equal(result.metrics.humanMinutes.knownTotal, 175)
  assert.equal(result.metrics.contextCostUsd.knownTotal, 2.7)
  assert.equal(result.acceptedIncrements, 7)
  assert.equal(result.acceptedPerHumanHour.value, 2.4)
  assert.equal(result.acceptedPerHumanHour.denominatorMinutes, 175)
  assert.deepEqual(result.firstPassAcceptance, {
    numerator: 5,
    denominator: 8,
    value: 0.625,
    definition: 'Increment accepted on its first attempt / increments with a recorded human review',
  })
})
test('integration preserves unrun user validation and unknown measurement never becomes zero', () => {
  const data = syntheticPilot()
  data.increments[0].attempts[0].spendUsd = null
  data.increments[0].attempts[0].humanMinutes = null
  const result = calculatePilot(data)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  assert.equal(result.acceptedPerHumanHour.value, null)
  assert.equal(result.metrics.spendUsd.missingCount, 1)
  assert.equal(result.milestones.integration.recorded, 1)
  assert.equal(result.milestones.product_validation.unrun, 8)
  assert.equal(result.primaryJob.value, null)
  assert.equal(result.comparison.status, 'unrun')
  assert.equal(result.comparison.multiplier, null)
})
test('estimated attribution remains visible, and inconsistent acceptance or negative metrics block', () => {
  const data = syntheticPilot()
  data.increments[0].attempts[0].timeAttribution = 'estimated'
  assert.equal(calculatePilot(data).acceptedPerHumanHour.attribution, 'estimated')
  data.increments[0].milestones.human_acceptance.attemptId = data.increments[0].attempts[0].id
  data.increments[1].attempts[0].spendUsd = -1
  assert.equal(calculatePilot(data).ok, false)
})
test('ordinary-assisted baseline needs matched scope and recorded comparability before comparison', () => {
  const data = syntheticPilot()
  data.comparison = {
    method: 'matched-scope-ordinary-assisted-work',
    status: 'observed',
    baseline: syntheticPilot(),
    comparability: { status: 'unresolved' },
  }
  data.comparison.baseline.workflow = 'ordinary-assisted'
  assert.equal(calculatePilot(data).comparison.multiplier, null)
  assert.equal(calculatePilot(data).ok, false)
  data.comparison.comparability = {
    status: 'resolved',
    actor: 'Synthetic reviewer',
    reference: 'fixture:matching',
    matchedScope: ['new-slice', 'recovery', 'design', 'feature-delta'],
    limitations: ['Fixture baseline only'],
  }
  const result = calculatePilot(data)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  assert.equal(result.comparison.multiplier, 1)
  assert.match(result.comparison.limitation, /does not establish/)
  data.comparison.baseline.projects.reverse()
  assert.equal(calculatePilot(data).ok, true)
  assert.equal(calculatePilot(data).comparison.multiplier, 1)
  const unicode = structuredClone(data)
  const keys = new Map(unicode.projects.map((p, i) => [p.id, ['é', 'e\u0301'][i]]))
  for (const cohort of [unicode, unicode.comparison.baseline]) {
    for (const project of cohort.projects) project.id = keys.get(project.id)
    for (const increment of cohort.increments) increment.projectId = keys.get(increment.projectId)
  }
  assert.equal(calculatePilot(unicode).ok, true)
  assert.equal(calculatePilot(unicode).comparison.multiplier, 1)
  data.comparison.baseline.projects[0].designSystem = 'A different design system'
  assert.equal(calculatePilot(data).ok, false)
})
test('a live handoff blocks unresolved authority, roles, obligations and comparison method', () => {
  assert.equal(
    validatePilotHandoff({ schemaVersion: 1, origin: 'planned', projects: [] }).readyForLive,
    false,
  )
  const plan = {
    schemaVersion: 1,
    origin: 'planned',
    projects: syntheticPilot().projects.map((p) => ({
      ...p,
      authority: {
        authorized: true,
        actor: 'Recorded owner',
        reference: `authority:${p.id}`,
        scope: ['new-slice', 'interruption-human-revision', 'recovery', 'design', 'feature-delta'],
      },
      roles: {
        operator: 'Operator',
        reviewer: 'Reviewer',
        productDecisionMaker: 'Owner',
        studyLead: 'Researcher',
      },
      obligations: ['OBL-JOB-SUCCESS'],
    })),
    comparison: {
      method: 'matched-scope-ordinary-assisted-work',
      actor: 'Reviewer',
      reference: 'authority:comparison',
      resolved: true,
    },
    releaseEvidence: { eligible: true, reference: 'release:reviewed', unresolvedDependencies: [] },
  }
  assert.equal(validatePilotHandoff(plan).readyForLive, true)
  const duplicate = structuredClone(plan)
  duplicate.projects[1].id = duplicate.projects[0].id
  assert.equal(validatePilotHandoff(duplicate).readyForLive, false)
  for (const reviewer of ['Operator', '  OPERATOR  ', 'Ｏｐｅｒａｔｏｒ']) {
    const conflict = structuredClone(plan)
    conflict.projects[0].roles.reviewer = reviewer
    assert.equal(validatePilotHandoff(conflict).readyForLive, false)
  }
  plan.releaseEvidence.unresolvedDependencies = ['#37']
  assert.equal(validatePilotHandoff(plan).readyForLive, false)
  plan.origin = 'synthetic'
  assert.equal(validatePilotHandoff(plan).readyForLive, false)
})
const correction = () => ({
  id: 'LEARN-1',
  category: 'context',
  summary: 'A required constraint was absent from the resolved context.',
  changedAssumption: {
    id: 'ASM-SAVE',
    beforeVersion: 1,
    afterVersion: 2,
    change: 'Require explicit owner retention after interruption.',
  },
  sourceEvidence: [{ reference: 'fixture:human-correction', sha256: 'a'.repeat(64) }],
  generalizedFollowup: {
    kind: 'fixture',
    reference: 'harness:interrupted-recovery',
    description: 'Include retained owner state in the interruption regression.',
  },
  publicationReview: {
    generalized: true,
    actor: 'Synthetic author',
    reference: 'fixture:privacy-review',
  },
})
test('append-only checkpoints retain correction class, assumption version, provenance and followup', () => {
  const first = appendCheckpoint([], correction())
  const original = JSON.stringify(first)
  const next = appendCheckpoint(first, { ...correction(), id: 'LEARN-2', category: 'evaluator' })
  assert.equal(JSON.stringify(first), original)
  assert.equal(next.length, 2)
  assert.equal(validateCheckpointTrail(next).ok, true)
  assert.deepEqual(next[0], first[0])
  next[0].summary = 'Rewritten history'
  assert.equal(validateCheckpointTrail(next).ok, false)
  assert.throws(() => appendCheckpoint(first, correction()), /duplicate/i)
})
test('checkpoint export rejects copied source bodies, unknown categories and unreviewed publication', () => {
  const c = correction()
  c.sourceEvidence[0].body = 'Client material must remain in its authorized source'
  assert.throws(() => appendCheckpoint([], c), /source|body/i)
  delete c.sourceEvidence[0].body
  c.category = 'misc'
  assert.throws(() => appendCheckpoint([], c), /category/i)
  c.category = 'context'
  c.publicationReview.generalized = false
  assert.throws(() => appendCheckpoint([], c), /generalized/i)
})

test('actual CLI renders honest scorecard, blocks live handoff and appends a new immutable checkpoint snapshot', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'ateam-pilot-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const input = join(root, 'pilot.json'),
    trail = join(root, 'trail-0.json'),
    next = join(root, 'trail-1.json'),
    checkpoint = join(root, 'correction.json')
  writeFileSync(input, JSON.stringify(syntheticPilot()))
  writeFileSync(trail, '[]\n')
  writeFileSync(checkpoint, JSON.stringify(correction()))
  const run = (...args) =>
    spawnSync(process.execPath, [resolve(import.meta.dirname, '../src/pilot-cli.mjs'), ...args], {
      encoding: 'utf8',
    })
  const report = run('scorecard', '--input', input, '--format', 'text')
  assert.equal(report.status, 0, report.stderr)
  assert.match(report.stdout, /spend USD 27/)
  assert.match(report.stdout, /product_validation: recorded 0; unrun 8/)
  assert.match(report.stdout, /comparison: unrun/)
  writeFileSync(input, JSON.stringify({ schemaVersion: 1, origin: 'planned', projects: [] }))
  const handoff = run('handoff', '--input', input)
  assert.equal(handoff.status, 2)
  assert.equal(JSON.parse(handoff.stdout).result.readyForLive, false)
  const before = readFileSync(trail, 'utf8')
  const appended = run('checkpoint', '--input', checkpoint, '--previous', trail, '--output', next)
  assert.equal(appended.status, 0, appended.stdout)
  const snapshot = readFileSync(next, 'utf8')
  assert.equal(readFileSync(trail, 'utf8'), before)
  assert.equal(JSON.parse(snapshot).entries[0].category, 'context')
  const duplicate = run('checkpoint', '--input', checkpoint, '--previous', trail, '--output', next)
  assert.equal(duplicate.status, 2)
  assert.equal(readFileSync(next, 'utf8'), snapshot)
})
