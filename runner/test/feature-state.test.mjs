import { test } from 'node:test'
import assert from 'node:assert/strict'
const feature = await import('../src/feature-state.mjs').catch(() => ({}))
const hashes = {
  'context.md': 'a'.repeat(64),
  'prd.md': 'b'.repeat(64),
  'design.md': 'c'.repeat(64),
  'spec.md': 'd'.repeat(64),
  'issues.md': 'e'.repeat(64),
  'code.txt': 'f'.repeat(64),
  'receipt.md': '1'.repeat(64),
}
const acceptance = {
  ok: true,
  diagnostics: [],
  pending: [{ id: 'STUDY', requiredStage: 'product-validation' }],
}
const decision = {
  actor: 'Product owner',
  kind: 'human',
  authorized: true,
  reference: 'conversation:42',
}
function fresh(mode = 'implementation-pr') {
  assert.equal(typeof feature.createFeature, 'function', 'deterministic feature API exists')
  return feature.createFeature({
    slug: 'save',
    prompt: 'Save work',
    repo: '/target',
    run_brief: {
      mode,
      outcome: 'A reviewable save flow',
      assumptions: [],
      deliverables: ['save flow'],
      required_verification: ['round trip'],
      limits: { maxCycles: 3 },
      stopping_point: { prototype: 'design', 'discovery-only': 'discovery' }[mode] || 'pr',
    },
  })
}
function step(manifest, type, fields = {}, extra = {}) {
  return feature.transitionFeature(
    manifest,
    { type, ...fields },
    { artifactHashes: hashes, acceptance, ...extra },
  )
}
function finish(manifest, phase, artifacts) {
  manifest = step(manifest, 'start', { phase })
  return step(manifest, 'complete', { phase, artifacts })
}
function throughDesign(mode = 'implementation-pr') {
  let m = finish(fresh(mode), 'discovery', ['context.md'])
  m = finish(m, 'definition', ['prd.md'])
  m = step(m, 'approve', { phase: 'definition', decision })
  m = finish(m, 'design', ['design.md'])
  return step(m, 'approve', { phase: 'design', decision })
}

test('new manifest has versioned independent milestones and rejects illegal phase jumps', () => {
  const m = fresh()
  assert.equal(m.schemaVersion, 3)
  assert.deepEqual(Object.keys(m.milestones), [
    'implementation',
    'verification',
    'human_acceptance',
    'integration',
    'release',
    'product_validation',
  ])
  assert.ok(Object.values(m.milestones).every((x) => x.status === 'pending'))
  assert.throws(() => step(m, 'start', { phase: 'dev' }), /predecessor|discovery/i)
  assert.throws(() => step(m, 'approve', { phase: 'definition', decision }), /complete/i)
  assert.throws(
    () => step(m, 'complete', { phase: 'discovery', artifacts: ['context.md'] }),
    /in_progress/,
  )
})

test('prototype definition approves the plan while a future study remains pending', () => {
  const m = throughDesign('prototype')
  assert.equal(m.state, 'stopped')
  assert.equal(m.phases.definition.status, 'approved')
  assert.equal(m.milestones.human_acceptance.status, 'pending')
  assert.equal(m.milestones.product_validation.status, 'pending')
  assert.deepEqual(m.phases.definition.acceptance.pending, acceptance.pending)
  assert.throws(() => step(m, 'start', { phase: 'spec' }), /stopping point/i)
})

test('current stage unresolved obligations block with their concrete diagnostic', () => {
  let m = finish(fresh(), 'discovery', ['context.md'])
  m = step(m, 'start', { phase: 'definition' })
  const blocked = {
    ok: false,
    diagnostics: [
      { severity: 'error', message: 'OBL-LEGAL requires named human owner at definition' },
    ],
    blocked: ['OBL-LEGAL'],
  }
  assert.throws(
    () =>
      step(m, 'complete', { phase: 'definition', artifacts: ['prd.md'] }, { acceptance: blocked }),
    /OBL-LEGAL requires named human owner/,
  )
  assert.equal(m.phases.definition.status, 'in_progress')
})

test('provisional approvals need explicit scoped authorization and retain their decisions', () => {
  let m = finish(fresh(), 'discovery', ['context.md'])
  m = finish(m, 'definition', ['prd.md'])
  assert.throws(
    () => step(m, 'approve', { phase: 'definition', provisional: true }),
    /authorization/i,
  )
  m = step(m, 'configure', {
    gate_policy: 'run-to-pr',
    authorization: { ...decision, scope: ['definition', 'design'] },
  })
  m = step(m, 'approve', { phase: 'definition', provisional: true })
  assert.equal(m.phases.definition.provisional, true)
  assert.equal(m.phases.definition.decisions[0].authorization.reference, 'conversation:42')
  assert.equal(m.milestones.human_acceptance.status, 'pending')
  assert.throws(
    () => step(m, 'approve', { phase: 'definition', decision: { actor: 'agent' } }),
    /human.*decision/i,
  )
  m = step(m, 'approve', { phase: 'definition', decision })
  assert.equal(m.phases.definition.provisional, false)
  assert.equal(m.phases.definition.decisions.length, 2)
})

test('artifact revision invalidates bound gates and descendants without clearing unrelated receipts', () => {
  let m = throughDesign()
  m = step(m, 'record-milestone', {
    milestone: 'integration',
    evidence: {
      reference: 'merge:abc',
      revision: 'abc',
      artifacts: ['receipt.md'],
      target: 'main',
      merged: true,
    },
  })
  const original = structuredClone(m)
  m = feature.invalidateFeature(m, { artifacts: ['prd.md'], reason: 'Requirement changed' })
  assert.equal(m.phases.definition.status, 'stale')
  assert.equal(m.phases.design.status, 'stale')
  assert.equal(m.phases.discovery.status, 'complete')
  assert.equal(m.milestones.integration.status, 'recorded')
  assert.deepEqual(m.phases.definition.decisions, original.phases.definition.decisions)
  assert.throws(() => step(m, 'start', { phase: 'design' }), /predecessor|definition/i)
})

test('recording a merged PR claims only target integration and rejects PR creation as integration', () => {
  let m = fresh()
  assert.throws(
    () =>
      step(m, 'record-milestone', {
        milestone: 'integration',
        evidence: {
          reference: 'PR:9',
          revision: 'abc',
          artifacts: ['receipt.md'],
          target: 'main',
          merged: false,
        },
      }),
    /merged/i,
  )
  m = step(m, 'record-milestone', {
    milestone: 'integration',
    evidence: {
      reference: 'PR:9 merge',
      revision: 'abc',
      artifacts: ['receipt.md'],
      target: 'main',
      merged: true,
    },
  })
  for (const [key, value] of Object.entries(m.milestones))
    assert.equal(value.status, key === 'integration' ? 'recorded' : 'pending')
  assert.throws(
    () =>
      step(m, 'record-milestone', {
        milestone: 'human_acceptance',
        evidence: { reference: 'review', revision: 'abc', artifacts: ['receipt.md'] },
      }),
    /human.*decision/i,
  )
})

test('legacy done or provisional state migrates to unknown or stale without manufacturing approvals', () => {
  assert.equal(typeof feature.normalizeFeature, 'function')
  const old = {
    slug: 'legacy',
    repo: '/target',
    state: 'done',
    phases: { definition: { status: 'approved', provisional: true }, dev: { status: 'complete' } },
  }
  const m = feature.normalizeFeature(old)
  assert.equal(m.schemaVersion, 3)
  assert.equal(m.phases.definition.status, 'stale')
  assert.equal(m.phases.dev.status, 'stale')
  assert.ok(Object.values(m.milestones).every((x) => x.status === 'unknown'))
  assert.deepEqual(m.legacy_snapshot, old)
  assert.equal(m.phases.definition.decisions.length, 0)
  assert.notEqual(m.state, 'done')
})

test('restarting a stale phase clears live bindings while preserving historical approval', () => {
  let m = throughDesign()
  m = feature.invalidateFeature(m, { artifacts: ['prd.md'] })
  m = step(m, 'start', { phase: 'definition' })
  assert.deepEqual(m.phases.definition.bindings, {})
  assert.equal(m.phases.definition.decisions.length, 1)
})

test('refinement requires a freshly validated plan and preserves earlier phase identities', () => {
  let m = fresh('refinement')
  const plan = {
    status: 'ready',
    change: { id: 'REF-SAVE' },
    affectedArtifacts: [],
    route: ['implementation', 'independent-review', 'verification'],
  }
  assert.throws(() => step(m, 'configure-refinement', { plan }), /validated refinement/i)
  m = step(m, 'configure-refinement', {}, { refinementPlan: plan })
  assert.equal(m.state, 'dev')
  m = step(m, 'start', { phase: 'dev' }, { refinementPlan: plan })
  assert.equal(m.phases.dev.status, 'in_progress')
  for (const name of ['discovery', 'definition', 'design', 'spec'])
    assert.equal(m.phases[name].status, 'pending')
  const needsReview = { ...plan, status: 'review-required', pendingReviews: ['design-review'] }
  assert.throws(
    () => step(m, 'start', { phase: 'dev' }, { refinementPlan: needsReview }),
    /design-review/,
  )
})

test('issue outcomes are recorded through transitions without implying feature milestones', () => {
  let m = throughDesign()
  m = finish(m, 'spec', ['spec.md'])
  m = finish(m, 'issues', ['issues.md'])
  m = step(m, 'start', { phase: 'dev' })
  m = step(m, 'record-issue', {
    issueId: 'ISS-SAVE',
    status: 'complete',
    evidence: { reference: 'runner:42', revision: 'abc', artifacts: ['receipt.md'] },
  })
  assert.equal(m.phases.dev.issues['ISS-SAVE'].status, 'complete')
  assert.equal(m.milestones.implementation.status, 'pending')
  assert.throws(
    () => step(m, 'record-issue', { issueId: 'ISS-SAVE', status: 'complete' }),
    /evidence/i,
  )
})

test('schema v2 rejects unbound completion and invented approved or milestone state', () => {
  let m = fresh()
  m.phases.definition.status = 'approved'
  assert.throws(() => feature.normalizeFeature(m), /approval.*binding|decision/i)
  m = fresh()
  m.phases.discovery.status = 'complete'
  assert.throws(() => feature.normalizeFeature(m), /completion.*binding/i)
  m = fresh()
  m.milestones.integration.status = 'recorded'
  assert.throws(() => feature.normalizeFeature(m), /milestone.*record/i)
})

test('finish refinement accepts only freshly verified completion and independent implementation/verification records', () => {
  let m = fresh('refinement')
  const plan = {
    status: 'ready',
    change: { id: 'REF-SAVE' },
    affectedArtifacts: [],
    route: ['implementation', 'independent-review', 'verification'],
  }
  m = step(m, 'configure-refinement', {}, { refinementPlan: plan })
  assert.throws(
    () => step(m, 'finish-refinement', { completion: { status: 'verified' } }),
    /verified.*completion|completion.*verified/i,
  )
  const verified = {
    status: 'verified',
    summary: 'Save retry verified against the current head',
    references: ['runner:42'],
  }
  assert.throws(
    () => step(m, 'finish-refinement', {}, { refinementCompletion: verified }),
    /implementation.*verification/,
  )
  for (const milestone of ['implementation', 'verification'])
    m = step(m, 'record-milestone', {
      milestone,
      evidence: { reference: 'runner:42', revision: 'abc', artifacts: ['receipt.md'] },
    })
  m = step(m, 'finish-refinement', {}, { refinementCompletion: verified })
  assert.deepEqual(m.refinement.result, verified)
  assert.equal(m.state, 'stopped')
  for (const name of ['human_acceptance', 'integration', 'release', 'product_validation'])
    assert.equal(m.milestones[name].status, 'pending')
})

test('artifact edits after verified refinement make its current result stale while retaining the verified result history', () => {
  let m = fresh('refinement')
  m = step(
    m,
    'configure-refinement',
    {},
    { refinementPlan: { status: 'ready', change: { id: 'REF-SAVE' }, affectedArtifacts: [] } },
  )
  for (const milestone of ['implementation', 'verification'])
    m = step(m, 'record-milestone', {
      milestone,
      evidence: { reference: 'runner:42', revision: 'abc', artifacts: ['receipt.md'] },
    })
  m = step(
    m,
    'finish-refinement',
    {},
    { refinementCompletion: { status: 'verified', summary: 'Original reviewed revision' } },
  )
  m = feature.invalidateFeature(m, {
    artifacts: ['receipt.md'],
    reason: 'Reviewed receipt changed',
  })
  assert.equal(m.refinement.result.status, 'stale')
  assert.equal(m.refinement.result_history[0].status, 'verified')
  assert.notEqual(m.state, 'stopped')
})
