import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  assumptionsFixture,
  evidenceFixture,
  researchDecision,
  researchPath,
  sourceHash,
  writeAssumptions,
} from './helpers/assumptions-fixture.mjs'

const api = await import('../src/assumptions.mjs').catch(() => ({}))
const evaluate = (...args) => {
  assert.equal(
    typeof api.evaluateAssumptions,
    'function',
    'research records need a deterministic validator',
  )
  return api.evaluateAssumptions(...args)
}
function fixture(t, ledger, history = [], sources = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ateam-assumptions-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const featureDir = join(root, 'docs/features/save')
  mkdirSync(featureDir, { recursive: true })
  writeAssumptions(root, ledger, history, sources)
  return { root, featureDir, manifest: { slug: 'save', run_brief: { assumptions: [] } } }
}
test('load-bearing evidence is due at its decision stage, while an earlier prototype preserves uncertainty', () => {
  const ledger = assumptionsFixture()
  const prototype = evaluate(ledger, { featureSlug: 'save', stage: 'design' })
  assert.equal(prototype.ok, true)
  assert.equal(prototype.canAdvance, true)
  assert.equal(prototype.pending[0].uncertainty, ledger.assumptions[0].uncertainty)
  assert.equal(prototype.unresolvedOwners[0], 'ASM-SAVE')
  const due = evaluate(ledger, { featureSlug: 'save', stage: 'human-acceptance' })
  assert.equal(due.canAdvance, false)
  assert.match(
    due.diagnostics.map((d) => d.message).join(' '),
    /ASM-SAVE.*evidence|evidence.*ASM-SAVE/,
  )
  assert.ok(due.diagnostics.some((d) => d.field === 'owner' && d.severity === 'error'))
})
test('authorized deferral has a future stage and cannot silently pass that stage', () => {
  const ledger = assumptionsFixture({
    requiredStage: 'implementation',
    owner: { role: 'Research lead' },
    disposition: 'defer',
    decision: researchDecision({ nextDecisionStage: 'human-acceptance' }),
  })
  assert.equal(
    evaluate(ledger, { stage: 'implementation', featureSlug: 'save' }).canAdvance,
    true,
  )
  assert.equal(
    evaluate(ledger, { stage: 'human-acceptance', featureSlug: 'save' }).canAdvance,
    false,
  )
  delete ledger.assumptions[0].decision.authorized
  assert.equal(
    evaluate(ledger, { stage: 'implementation', featureSlug: 'save' }).ok,
    false,
  )
})
for (const disposition of ['no-go', 'reshape'])
  test(`${disposition} is a valid recorded outcome and prevents dependent commitment`, () => {
    const ledger = assumptionsFixture({
      owner: { role: 'Research lead' },
      disposition,
      decision: researchDecision(),
      evidence: [evidenceFixture()],
    })
    const report = evaluate(ledger, { stage: 'human-acceptance', featureSlug: 'save' })
    assert.equal(report.ok, true)
    assert.equal(report.canAdvance, false)
    assert.equal(report.outcomes[0].kind, disposition)
    assert.equal(report.assumptions[0].evidence[0].origin, 'synthetic')
  })
test('absent demand is explicit and cannot become supported proceed evidence', () => {
  const ledger = assumptionsFixture({
    risk: 'value',
    requiredStage: 'implementation',
    owner: { role: 'Product lead' },
    disposition: 'proceed',
    decision: researchDecision(),
  })
  assert.equal(
    evaluate(ledger, { stage: 'implementation', featureSlug: 'save' }).canAdvance,
    false,
  )
  ledger.assumptions[0].disposition = 'no-go'
  assert.equal(
    evaluate(ledger, { stage: 'implementation', featureSlug: 'save' }).ok,
    true,
  )
  assert.equal(ledger.assumptions[0].evidence.length, 0)
})
test('conflicting evidence stays explicit and proceed must resolve every contradiction', () => {
  const ledger = assumptionsFixture({
    owner: { role: 'Research lead' },
    disposition: 'proceed',
    decision: researchDecision(),
    evidence: [
      evidenceFixture(),
      evidenceFixture('Supported recovery', {
        id: 'EVD-SUPPORT',
        path: 'docs/product/research/support.md',
        result: 'support',
        origin: 'observed',
      }),
    ],
  })
  assert.equal(
    evaluate(ledger, { stage: 'human-acceptance', featureSlug: 'save' }).ok,
    false,
  )
  ledger.assumptions[0].decision.contradictionIds = ['EVD-RECOVERY']
  const resolved = evaluate(ledger, { stage: 'human-acceptance', featureSlug: 'save' })
  assert.equal(resolved.ok, true)
  assert.equal(
    resolved.assumptions[0].evidence.filter((e) => e.result === 'contradict').length,
    1,
  )
})

test('synthetic, inferred and default support cannot be presented as observed validation', () => {
  for (const origin of ['synthetic', 'inference', 'declared-default']) {
    const ledger = assumptionsFixture({
      owner: { role: 'Research lead' },
      disposition: 'proceed',
      decision: researchDecision(),
      evidence: [evidenceFixture(undefined, { result: 'support', origin })],
    })
    assert.equal(
      evaluate(ledger, { stage: 'human-acceptance' }).canAdvance,
      false,
      origin,
    )
  }
})
test('history rejects erased evidence, relabelled provenance and unapproved stage weakening', () => {
  const prior = assumptionsFixture({ evidence: [evidenceFixture()] })
  const current = structuredClone(prior)
  current.revision = 2
  current.assumptions[0].evidence = []
  assert.equal(evaluate(current, { previousLedger: prior, historical: true }).ok, false)
  current.assumptions[0].evidence = [evidenceFixture(undefined, { result: 'support' })]
  assert.equal(evaluate(current, { previousLedger: prior, historical: true }).ok, false)
  current.assumptions[0].evidence = prior.assumptions[0].evidence
  current.assumptions[0].requiredStage = 'product-validation'
  assert.equal(evaluate(current, { previousLedger: prior, historical: true }).ok, false)
  current.assumptions[0].version = 2
  current.assumptions[0].changeDecision = researchDecision()
  assert.equal(evaluate(current, { previousLedger: prior, historical: true }).ok, true)
})
test('research CLI verifies actual source bytes and exposes the canonical plan receipt', async (t) => {
  assert.equal(
    typeof api.validateFeatureAssumptions,
    'function',
    'actual research files must govern transitions',
  )
  const source = 'Synthetic observation: recovery was confusing.\n'
  const f = fixture(t, assumptionsFixture({ evidence: [evidenceFixture(source)] }), [], {
    'docs/product/research/recovery.md': source,
  })
  const report = await api.validateFeatureAssumptions({ ...f, stage: 'design' })
  assert.equal(report.ok, true)
  assert.equal(report.source.path, researchPath)
  assert.equal(report.source.sha256, sourceHash(readFileSync(join(f.root, researchPath))))
  const cli = resolve(import.meta.dirname, '../src/assumptions-cli.mjs')
  const child = spawnSync(
    process.execPath,
    [cli, '--root', f.root, '--feature', f.featureDir, '--stage', 'design'],
    { encoding: 'utf8' },
  )
  assert.equal(child.status, 0, child.stderr || child.stdout)
  assert.equal(JSON.parse(child.stdout).assumptions[0].id, 'ASM-SAVE')
  writeFileSync(join(f.root, 'docs/product/research/recovery.md'), 'Changed evidence')
  const stale = await api.validateFeatureAssumptions({ ...f, stage: 'design' })
  assert.equal(stale.ok, false)
  assert.match(stale.diagnostics.map((d) => d.message).join(' '), /sha256|digest|changed/)
})
test('actual history must be contiguous, preserves old sources and rejects escaped source paths', async (t) => {
  assert.equal(typeof api.validateFeatureAssumptions, 'function')
  const prior = assumptionsFixture()
  const current = structuredClone(prior)
  current.revision = 2
  const f = fixture(t, current)
  assert.equal(
    (await api.validateFeatureAssumptions({ ...f, stage: 'design' })).ok,
    false,
  )
  writeAssumptions(f.root, current, [prior])
  assert.equal((await api.validateFeatureAssumptions({ ...f, stage: 'design' })).ok, true)
  current.assumptions[0].evidence = [
    evidenceFixture(undefined, { path: '../outside.md' }),
  ]
  writeAssumptions(f.root, current, [prior])
  assert.equal(
    (await api.validateFeatureAssumptions({ ...f, stage: 'design' })).ok,
    false,
  )
  current.assumptions[0].evidence[0].path = 'docs/product/research/escape.md'
  mkdirSync(join(f.root, 'docs/product/research'), { recursive: true })
  symlinkSync('/etc/hosts', join(f.root, current.assumptions[0].evidence[0].path))
  writeAssumptions(f.root, current, [prior])
  assert.equal(
    (await api.validateFeatureAssumptions({ ...f, stage: 'design' })).ok,
    false,
  )
})

test('previous feature receipts reject removed records and rewritten same-revision history', async (t) => {
  const first = assumptionsFixture()
  const f = fixture(t, first)
  const receipt = await api.validateFeatureAssumptions({ ...f, stage: 'design' })
  f.manifest.phases = { design: { assumptions: receipt } }
  const changed = structuredClone(first)
  changed.assumptions[0].uncertainty = 'This was silently rewritten'
  writeAssumptions(f.root, changed)
  assert.equal(
    (await api.validateFeatureAssumptions({ ...f, stage: 'design' })).ok,
    false,
  )
  changed.revision = 2
  writeAssumptions(f.root, changed, [first])
  assert.equal((await api.validateFeatureAssumptions({ ...f, stage: 'design' })).ok, true)
  const rewrittenHistory = structuredClone(first)
  rewrittenHistory.assumptions[0].uncertainty = 'Rewritten historical uncertainty'
  writeAssumptions(f.root, changed, [rewrittenHistory])
  assert.equal(
    (await api.validateFeatureAssumptions({ ...f, stage: 'design' })).ok,
    false,
  )
  rmSync(join(f.root, researchPath))
  assert.equal(
    (await api.validateFeatureAssumptions({ ...f, stage: 'design' })).ok,
    false,
  )
})

test('schema rejects malformed records and an embedded example cannot replace the canonical block', async (t) => {
  const f = fixture(t, assumptionsFixture())
  writeFileSync(
    join(f.root, researchPath),
    '````markdown\n```ateam-assumptions\n{}\n```\n````\n',
  )
  assert.equal(
    (await api.validateFeatureAssumptions({ ...f, stage: 'design' })).ok,
    false,
  )
  for (const value of [
    null,
    [],
    {},
    { schemaVersion: 1, revision: 1, assumptions: [null] },
  ])
    assert.equal(evaluate(value).ok, false)
  assert.doesNotThrow(() =>
    evaluate({ schemaVersion: 1, revision: 1, assumptions: [{ evidence: [null] }] }),
  )
})

test('a changed assumption cannot reuse old-version evidence to support proceed', () => {
  const first = assumptionsFixture({
    owner: { role: 'Research lead' },
    evidence: [evidenceFixture(undefined, { result: 'support' })],
  })
  const current = structuredClone(first)
  current.revision = 2
  Object.assign(current.assumptions[0], {
    version: 2,
    statement: 'A different interaction assumption',
    disposition: 'proceed',
    decision: researchDecision(),
    changeDecision: researchDecision(),
  })
  assert.equal(
    evaluate(current, { previousLedger: first, stage: 'human-acceptance' }).canAdvance,
    false,
  )
})

test('a routine feature does not invent or inherit a different feature decision gate', async (t) => {
  const f = fixture(
    t,
    assumptionsFixture({
      features: ['different-feature'],
      requiredStage: 'implementation',
      owner: { role: 'Research lead' },
    }),
  )
  assert.equal(
    (await api.validateFeatureAssumptions({ ...f, stage: 'implementation' })).canAdvance,
    true,
  )
  rmSync(join(f.root, researchPath))
  assert.equal(
    (await api.validateFeatureAssumptions({ ...f, stage: 'implementation' }))
      .applicability,
    'not-declared',
  )
  f.manifest.run_brief.assumptions = ['A prose assumption without a known ID']
  assert.equal(
    (await api.validateFeatureAssumptions({ ...f, stage: 'implementation' })).ok,
    false,
  )
})

test('optional deferral expiry remains non-blocking without weakening authorization validation', () => {
  const ledger = assumptionsFixture({
    loadBearing: false,
    requiredStage: 'discovery',
    cheapestProbe: { method: 'human-study', description: 'Optional exploration' },
    disposition: 'defer',
    decision: researchDecision({ nextDecisionStage: 'definition' }),
  })
  const optional = evaluate(ledger, { featureSlug: 'save', stage: 'product-validation' })
  assert.equal(optional.assumptions[0].due, false)
  assert.equal(optional.recordsValid, true)
  assert.equal(optional.canAdvance, true)
  ledger.assumptions[0].decision.authorized = false
  const unauthorized = evaluate(ledger, {
    featureSlug: 'save',
    stage: 'product-validation',
  })
  assert.equal(unauthorized.recordsValid, false)
  assert.equal(unauthorized.canAdvance, false)
})
