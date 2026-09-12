import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { operatorFixture, human } from './helpers/operator-fixture.mjs'
import {
  assumptionsFixture,
  writeAssumptions,
  researchDecision,
  evidenceFixture,
} from './helpers/assumptions-fixture.mjs'
import {
  loadFeature,
  createFeature,
  transitionFeature,
  normalizeFeature,
} from '../src/feature-state.mjs'
import { evaluateAssumptions } from '../src/assumptions.mjs'
import {
  fixture as obligationFixture,
  writeFixture,
} from './helpers/obligations-fixture.mjs'

function fixture(t, ledger = assumptionsFixture()) {
  const root = mkdtempSync(join(tmpdir(), 'ateam-research-gate-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const f = operatorFixture(root)
  writeAssumptions(root, ledger)
  assert.equal(f.init().status, 'success')
  return f
}
test('actual phase entry blocks due missing evidence before work starts, then accepts authorized deferral', (t) => {
  const first = assumptionsFixture({
    requiredStage: 'definition',
    cheapestProbe: { method: 'human-study', description: 'Observe a paper task' },
    owner: { role: 'Research lead' },
  })
  const f = fixture(t, first)
  assert.equal(f.run('start', { phase: 'discovery' }).status, 'success')
  assert.equal(
    f.run('complete', { phase: 'discovery', artifacts: ['../../product/jtbd'] }).status,
    'success',
  )
  const blocked = f.run('start', { phase: 'definition' })
  assert.equal(blocked.status, 'blocked')
  assert.match(blocked.error.message, /ASM-SAVE.*missing evidence or authorized deferral/)
  assert.equal(blocked.manifest.phases.definition.status, 'pending')
  const second = structuredClone(first)
  second.revision = 2
  Object.assign(second.assumptions[0], {
    disposition: 'defer',
    decision: researchDecision({ nextDecisionStage: 'human-acceptance' }),
  })
  writeAssumptions(f.root, second, [first])
  assert.equal(f.run('start', { phase: 'definition' }).status, 'success')
  assert.equal(
    f.run('complete', { phase: 'definition', artifacts: ['prd.md'] }).status,
    'success',
  )
  const approved = f.run('approve', { phase: 'definition', decision: human })
  assert.equal(approved.status, 'success')
  assert.equal(approved.manifest.phases.definition.assumptions.deferred[0].id, 'ASM-SAVE')
})
test('actual coded prototype advances while a later study stays visible and future updates do not stale earlier approvals', async (t) => {
  const first = assumptionsFixture()
  const f = fixture(t, first)
  assert.equal(f.definition().status, 'success')
  assert.equal(
    f.run('approve', { phase: 'definition', decision: human }).status,
    'success',
  )
  for (const [phase, artifact] of [
    ['design', 'design.md'],
    ['spec', 'spec.md'],
    ['issues', 'issues.md'],
  ]) {
    assert.equal(f.run('start', { phase }).status, 'success')
    assert.equal(f.run('complete', { phase, artifacts: [artifact] }).status, 'success')
    if (phase === 'design')
      assert.equal(f.run('approve', { phase, decision: human }).status, 'success')
  }
  const started = f.run('start', { phase: 'dev' })
  assert.equal(started.status, 'success')
  assert.equal(started.manifest.phases.dev.assumptions.pending[0].id, 'ASM-SAVE')
  const second = structuredClone(first)
  second.revision = 2
  second.assumptions[0].uncertainty = 'Participant recruitment remains pending'
  writeAssumptions(f.root, second, [first])
  const reloaded = await loadFeature(f.dir)
  assert.equal(reloaded.phases.definition.status, 'approved')
  assert.equal(reloaded.phases.design.status, 'approved')
})
for (const kind of ['no-go', 'reshape'])
  test(`actual ${kind} recording succeeds, replays and preserves independent milestone evidence`, async (t) => {
    const first = assumptionsFixture({
      requiredStage: 'implementation',
      owner: { role: 'Product lead' },
    })
    const f = fixture(t, first)
    writeFileSync(join(f.dir, 'receipt.md'), 'Synthetic observed merge receipt')
    const merged = f.run('record-milestone', {
      milestone: 'integration',
      evidence: {
        reference: 'fixture:merge',
        revision: 'synthetic-sha',
        artifacts: ['receipt.md'],
        merged: true,
        target: 'main',
      },
    })
    assert.equal(merged.status, 'success')
    const second = structuredClone(first)
    second.revision = 2
    Object.assign(second.assumptions[0], {
      disposition: kind,
      decision: researchDecision(),
    })
    writeAssumptions(f.root, second, [first])
    const revision = f.revision
    const stopped = f.run(
      'record-research-decision',
      { assumptionIds: ['ASM-SAVE'] },
      { eventId: 'research-close', revision },
    )
    assert.equal(stopped.status, 'success')
    assert.equal(stopped.manifest.state, 'stopped')
    assert.equal(stopped.manifest.research_outcome.kind, kind)
    assert.equal(stopped.manifest.last_error, null)
    assert.deepEqual(
      stopped.manifest.milestones.integration.records,
      merged.manifest.milestones.integration.records,
    )
    assert.equal((await loadFeature(f.dir)).milestones.integration.status, 'recorded')
    const replay = f.run(
      'record-research-decision',
      { assumptionIds: ['ASM-SAVE'] },
      { eventId: 'research-close', revision },
    )
    assert.equal(replay.replayed, true)
    assert.equal(replay.manifest.research_decisions.length, 1)
    assert.equal(f.run('start', { phase: 'discovery' }).status, 'blocked')
    assert.equal(
      f.run('revise', { phase: 'discovery', reason: 'Try to ignore the decision' })
        .status,
      'blocked',
    )
  })
test('actual no-go can reopen only after an authorized retained revision and explicit revise command', (t) => {
  const first = assumptionsFixture({ disposition: 'no-go', decision: researchDecision() })
  const f = fixture(t, first)
  assert.equal(
    f.run('record-research-decision', { assumptionIds: ['ASM-SAVE'] }).status,
    'success',
  )
  const second = structuredClone(first)
  second.revision = 2
  second.assumptions[0].disposition = 'pending'
  writeAssumptions(f.root, second, [first])
  assert.equal(
    f.run('revise', { phase: 'discovery', reason: 'Reconsider with new scope' }).status,
    'blocked',
  )
  second.assumptions[0].version = 2
  second.assumptions[0].changeDecision = researchDecision({
    reference: 'fixture:reopen',
    rationale: 'Authorized new evidence-producing scope',
  })
  writeAssumptions(f.root, second, [first])
  assert.equal(
    f.run('revise', {
      phase: 'discovery',
      reason: 'Authorized scope is ready to investigate',
    }).status,
    'success',
  )
  assert.equal(f.run('start', { phase: 'discovery' }).status, 'success')
  assert.equal(f.read().research_decisions.length, 1)
})
test('pure transition cannot bypass an explicitly declared assumption report', () => {
  const manifest = createFeature({
    slug: 'save',
    repo: '/target',
    run_brief: {
      assumptions: ['ASM-SAVE'],
      outcome: 'Recover a save',
      deliverables: ['Prototype'],
      required_verification: ['Study later'],
    },
  })
  manifest.phases.discovery.status = 'in_progress'
  assert.throws(
    () =>
      transitionFeature(
        manifest,
        { type: 'complete', phase: 'discovery', artifacts: ['jobs'] },
        { artifactHashes: { jobs: 'a'.repeat(64) } },
      ),
    /research|assumption/i,
  )
  const assumptions = evaluateAssumptions(assumptionsFixture(), {
    stage: 'discovery',
    featureSlug: 'save',
  })
  assert.equal(
    transitionFeature(
      manifest,
      { type: 'complete', phase: 'discovery', artifacts: ['jobs'] },
      { artifactHashes: { jobs: 'a'.repeat(64) }, assumptions },
    ).phases.discovery.status,
    'complete',
  )
})

test('operator JSON and HTML show current uncertainty, stage, disposition and unresolved owner with escaped research outcome', (t) => {
  const first = assumptionsFixture({
    statement: 'Recover <script>unsafe()</script> input',
    uncertainty: 'No observation of <img src=x> recovery',
  })
  const f = fixture(t, first)
  const summary = JSON.parse(f.status().stdout).summary
  assert.equal(summary.assumptions[0].id, 'ASM-SAVE')
  assert.equal(summary.assumptions[0].statement, first.assumptions[0].statement)
  assert.equal(summary.assumptions[0].requiredStage, 'human-acceptance')
  assert.equal(summary.assumptions[0].disposition, 'pending')
  assert.equal(summary.assumptions[0].ownerResolved, false)
  const html = f.status('html').stdout
  assert.match(html, /owner unresolved/)
  assert.match(html, /No observation of &lt;img src=x&gt; recovery/)
  assert.ok(!html.includes('<script>unsafe()</script>'))
  const second = structuredClone(first)
  second.revision = 2
  Object.assign(second.assumptions[0], {
    disposition: 'reshape',
    decision: researchDecision(),
  })
  writeAssumptions(f.root, second, [first])
  assert.equal(
    f.run('record-research-decision', { assumptionIds: ['ASM-SAVE'] }).status,
    'success',
  )
  assert.equal(JSON.parse(f.status().stdout).summary.researchOutcome.kind, 'reshape')
  assert.match(f.status('html').stdout, /Research outcome: reshape/)
})

test('research prevents a false human-validation claim while independently observed release is recorded', (t) => {
  const f = fixture(t, assumptionsFixture())
  writeFileSync(join(f.dir, 'receipt.md'), 'Synthetic observation of an external event')
  const evidence = {
    reference: 'fixture:event',
    revision: 'synthetic-revision',
    artifacts: ['receipt.md'],
  }
  const acceptance = f.run('record-milestone', {
    milestone: 'human_acceptance',
    evidence,
    decision: human,
  })
  assert.equal(acceptance.status, 'blocked')
  assert.match(acceptance.error.message, /ASM-SAVE/)
  const release = f.run('record-milestone', { milestone: 'release', evidence })
  assert.equal(release.status, 'success')
  assert.equal(release.manifest.milestones.human_acceptance.status, 'pending')
  assert.equal(release.manifest.milestones.release.status, 'recorded')
})

test('a hand-written stopped research claim without its decision receipt is rejected', () => {
  const manifest = createFeature({ slug: 'save', repo: '/target' })
  manifest.research_outcome = {
    status: 'active',
    kind: 'no-go',
    assumptionIds: ['ASM-SAVE'],
  }
  assert.throws(() => normalizeFeature(manifest), /research.*receipt|research.*decision/i)
})

test('the operator preview marks malformed current research as unvalidated', (t) => {
  const f = fixture(t)
  writeFileSync(
    join(f.root, 'docs/product/research-plan.md'),
    'An unindexed legacy research assumption',
  )
  const summary = JSON.parse(f.status().stdout).summary
  assert.equal(summary.researchValidation.ok, false)
  assert.match(f.status('html').stdout, /Research validation blocked/)
  assert.match(f.status('text').stdout, /Research validation blocked/)
})

for (const [requiredStage, nextDecisionStage, milestone] of [
  ['implementation', 'human-acceptance', 'human_acceptance'],
  ['human-acceptance', 'product-validation', 'product_validation'],
  ['implementation', null, 'human_acceptance'],
])
  test(`actual ${milestone} refuses ${nextDecisionStage ? 'expired deferral' : 'earlier pending research'} from ${requiredStage}`, (t) => {
    const ledger = assumptionsFixture({
      requiredStage,
      owner: { role: 'Research lead' },
      ...(nextDecisionStage
        ? { disposition: 'defer', decision: researchDecision({ nextDecisionStage }) }
        : {}),
    })
    const f = fixture(t, ledger)
    writeFileSync(join(f.dir, 'receipt.md'), 'Synthetic external event')
    const evidence = {
      reference: 'fixture:event',
      revision: 'synthetic',
      artifacts: ['receipt.md'],
    }
    assert.equal(
      f.run('record-milestone', {
        milestone: 'integration',
        evidence: { ...evidence, merged: true, target: 'main' },
      }).status,
      'success',
    )
    const result = f.run('record-milestone', { milestone, evidence, decision: human })
    assert.equal(result.status, 'blocked')
    assert.match(result.error.message, /ASM-SAVE/)
    assert.equal(result.manifest.milestones[milestone].status, 'pending')
    assert.equal(result.manifest.milestones.integration.status, 'recorded')
  })

test('reload expires the effective research deadline while preserving later-study independence and integration receipts', async (t) => {
  const first = assumptionsFixture({
    requiredStage: 'implementation',
    owner: { role: 'Research lead' },
    disposition: 'defer',
    decision: researchDecision({ nextDecisionStage: 'product-validation' }),
  })
  const f = fixture(t, first)
  writeFileSync(join(f.dir, 'receipt.md'), 'Synthetic external event')
  const evidence = {
    reference: 'fixture:event',
    revision: 'synthetic',
    artifacts: ['receipt.md'],
  }
  const merge = f.run('record-milestone', {
    milestone: 'integration',
    evidence: { ...evidence, merged: true, target: 'main' },
  })
  assert.equal(merge.status, 'success')
  assert.equal(
    f.run('record-milestone', {
      milestone: 'human_acceptance',
      evidence,
      decision: human,
    }).status,
    'success',
  )
  const second = structuredClone(first)
  second.revision = 2
  second.assumptions.push(
    ...assumptionsFixture({ id: 'ASM-LATER', requiredStage: 'product-validation' })
      .assumptions,
  )
  writeAssumptions(f.root, second, [first])
  assert.equal(
    (await loadFeature(f.dir)).milestones.human_acceptance.status,
    'recorded',
    'a later pending study does not invalidate earlier acceptance',
  )
  const third = structuredClone(second)
  third.revision = 3
  third.assumptions[0].decision = researchDecision({
    reference: 'fixture:earlier-deadline',
    nextDecisionStage: 'human-acceptance',
  })
  writeAssumptions(f.root, third, [first, second])
  const reloaded = await loadFeature(f.dir)
  assert.equal(reloaded.milestones.human_acceptance.status, 'stale')
  assert.match(
    reloaded.milestones.human_acceptance.stale_reason,
    /ASM-SAVE.*deferral|ASM-SAVE.*revisited/,
  )
  assert.deepEqual(
    reloaded.milestones.integration.records,
    merge.manifest.milestones.integration.records,
  )
  assert.equal(reloaded.milestones.integration.status, 'recorded')
})

for (const disposition of ['no-go', 'reshape'])
  test(`recording ${disposition} stops work despite another unsupported discovery assumption`, (t) => {
    const ledger = assumptionsFixture({ disposition, decision: researchDecision() })
    ledger.assumptions.push(
      ...assumptionsFixture({
        id: 'ASM-DISCOVERY',
        requiredStage: 'discovery',
        cheapestProbe: { method: 'human-study', description: 'Clarify remaining demand' },
      }).assumptions,
    )
    const f = fixture(t, ledger)
    writeFileSync(join(f.dir, 'receipt.md'), 'Synthetic merge receipt')
    const merge = f.run('record-milestone', {
      milestone: 'integration',
      evidence: {
        reference: 'fixture:merge',
        revision: 'synthetic',
        artifacts: ['receipt.md'],
        merged: true,
        target: 'main',
      },
    })
    assert.equal(merge.status, 'success')
    const stopped = f.run('record-research-decision', { assumptionIds: ['ASM-SAVE'] })
    assert.equal(stopped.status, 'success')
    assert.equal(stopped.manifest.state, 'stopped')
    assert.equal(stopped.manifest.research_outcome.kind, disposition)
    assert.equal(
      stopped.manifest.research_decisions[0].research.ok,
      false,
      'advancement remains unsupported',
    )
    assert.equal(stopped.manifest.research_decisions[0].research.recordsValid, true)
    assert.equal(
      stopped.manifest.research_decisions[0].research.pending[0].id,
      'ASM-DISCOVERY',
    )
    assert.deepEqual(
      stopped.manifest.milestones.integration.records,
      merge.manifest.milestones.integration.records,
    )
  })

test('stopping still refuses malformed evidence and incomplete history', (t) => {
  for (const defect of ['evidence', 'history']) {
    const ledger = assumptionsFixture({
      disposition: 'no-go',
      decision: researchDecision(),
    })
    ledger.assumptions.push(
      ...assumptionsFixture({
        id: 'ASM-DISCOVERY',
        requiredStage: 'discovery',
        cheapestProbe: { method: 'human-study', description: 'Clarify remaining demand' },
      }).assumptions,
    )
    if (defect === 'evidence') ledger.assumptions[1].evidence = [evidenceFixture()]
    else ledger.revision = 2
    const f = fixture(t, ledger)
    assert.equal(
      f.run('record-research-decision', { assumptionIds: ['ASM-SAVE'] }).status,
      'blocked',
      defect,
    )
    assert.equal(f.read().research_outcome, undefined)
  }
})

for (const disposition of ['pending', 'defer'])
  test(`optional ${disposition} research permits phase entry and validation milestones through reload`, async (t) => {
    const ledger = assumptionsFixture({
      loadBearing: false,
      requiredStage: 'discovery',
      cheapestProbe: {
        method: 'human-study',
        description: 'Optional exploratory learning',
      },
      disposition,
      ...(disposition === 'defer'
        ? { decision: researchDecision({ nextDecisionStage: 'definition' }) }
        : {}),
    })
    const f = fixture(t, ledger)
    // Independent acceptance fixtures are satisfied so these actual CLI checks
    // isolate optional research gating. This is synthetic validator evidence.
    const obligations = obligationFixture()
    for (const requirement of obligations.requirements)
      for (const obligation of requirement.obligations) {
        obligation.status = 'satisfied'
        obligation.evidence = [
          {
            reference: `fixture:synthetic-${obligation.id}`,
            actor: 'Synthetic fixture observer',
            method: obligation.method,
            requirementVersion: requirement.version,
          },
        ]
      }
    writeFixture(f.dir, obligations)
    assert.equal(f.run('start', { phase: 'discovery' }).status, 'success')
    assert.equal(
      f.run('complete', { phase: 'discovery', artifacts: ['../../product/jtbd'] }).status,
      'success',
    )
    const next = f.run('start', { phase: 'definition' })
    assert.equal(next.status, 'success', next.error?.message)
    assert.equal(next.manifest.phases.definition.assumptions.assumptions[0].due, false)
    writeFileSync(
      join(f.dir, 'receipt.md'),
      'Synthetic external observation for the optional research regression',
    )
    const evidence = {
      reference: 'fixture:optional-observation',
      revision: 'synthetic',
      artifacts: ['receipt.md'],
    }
    for (const milestone of ['human_acceptance', 'product_validation']) {
      const recorded = f.run('record-milestone', { milestone, evidence, decision: human })
      assert.equal(recorded.status, 'success', recorded.error?.message)
    }
    const reloaded = await loadFeature(f.dir)
    assert.equal(reloaded.phases.definition.status, 'in_progress')
    assert.equal(reloaded.milestones.human_acceptance.status, 'recorded')
    assert.equal(reloaded.milestones.product_validation.status, 'recorded')
  })
