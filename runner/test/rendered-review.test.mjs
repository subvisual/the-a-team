import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateRenderedPlan,
  summarizeRenderedCoverage,
  validateRenderedReviewRecord,
} from '../src/rendered-review.mjs'
const viewport = { width: 390, height: 844 }
const requirement = { obligation: 'OBL-visible', state: 'populated', viewport }
const plan = () => ({
  schemaVersion: 1,
  serverCommand: 'node server.mjs',
  requirements: [structuredClone(requirement)],
  cases: [
    {
      id: 'primary',
      ...requirement,
      route: '/',
      fixture: 'synthetic',
      actions: [],
      assertions: [{ type: 'contained', selector: '#save' }],
    },
  ],
})
test('declarative plan rejects executable callbacks, path escapes and unbounded cases', () => {
  assert.equal(validateRenderedPlan(plan()).schemaVersion, 1)
  for (const update of [
    (p) => p.cases[0].actions.push({ type: 'evaluate', code: 'process.env' }),
    (p) => (p.cases[0].id = '../escape'),
    (p) => (p.cases[0].route = 'https://external.test/'),
    (p) => (p.cases[0].assertions = []),
    (p) => (p.cases = Array(41).fill(p.cases[0])),
    (p) => (p.playwrightModule = './attacker.mjs'),
  ]) {
    const p = plan()
    update(p)
    assert.throws(() => validateRenderedPlan(p))
  }
})
test('required coverage stays pending when absent and a rendered defect fails the obligation', () => {
  const p = plan()
  assert.equal(summarizeRenderedCoverage(p, []).status, 'pending')
  assert.equal(summarizeRenderedCoverage(p, [{ ...p.cases[0], status: 'failed' }]).status, 'failed')
  assert.equal(summarizeRenderedCoverage(p, [{ ...p.cases[0], status: 'passed' }]).status, 'passed')
  p.requirements.push({ ...requirement, state: 'loading' })
  assert.equal(
    summarizeRenderedCoverage(p, [{ ...p.cases[0], status: 'passed' }]).status,
    'pending',
  )
})
test('self asserted waived coverage is refused without pinned authority', () => {
  const p = plan()
  p.requirements[0].disposition = { authorized: true, reference: 'trust-me' }
  assert.throws(() => validateRenderedPlan(p), /unsupported/)
})
test('reuse fails closed on missing rendered evidence', async () => {
  assert.equal(
    (
      await validateRenderedReviewRecord({
        recordPath: '/absent/report.json',
        head: 'a'.repeat(40),
        policy: {},
      })
    ).valid,
    false,
  )
})

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  deriveRenderedReviewAuthority,
  validateRenderedAuthority,
} from '../src/core/rendered-authority.mjs'
import {
  fixtureRepo,
  git,
  config,
  adapter,
  commit,
  issue,
  verdict,
  pass,
} from './approval-fixtures.mjs'
import { runIssue } from '../src/core/loop.mjs'
import { fixture as obligationFixture } from './helpers/obligations-fixture.mjs'
import { summarizeRenderedCandidates } from '../src/rendered-review.mjs'

test('candidate history retains the best exact revision without laundering it into the current head', () => {
  const history = summarizeRenderedCandidates(
    [
      {
        recordPath: 'old',
        record: { headSha: 'old-sha', status: 'passed', cases: [{ status: 'passed' }] },
      },
      {
        recordPath: 'new',
        record: { headSha: 'new-sha', status: 'failed', cases: [{ status: 'failed' }] },
      },
    ],
    'new-sha',
    2,
  )
  assert.equal(history.best.headSha, 'old-sha')
  assert.equal(history.current.status, 'failed')
  assert.equal(history.currentSatisfied, false)
  assert.throws(() => summarizeRenderedCandidates(Array(3).fill({}), 'head', 2), /iteration/)
})
function acceptedContext(root, ledger) {
  const content = JSON.stringify(ledger),
    source = {
      id: 'accepted-ledger',
      kind: 'requirement',
      path: 'acceptance.json',
      revision: createHash('sha256').update(content).digest('hex'),
      global: true,
    }
  writeFileSync(join(root, 'acceptance.json'), content)
  mkdirSync(join(root, 'docs/product'), { recursive: true })
  writeFileSync(
    join(root, 'docs/product/context.md'),
    '```ateam-context\n' +
      JSON.stringify({
        schemaVersion: 1,
        purpose: 'Rendered verification fixture',
        audience: 'Maintainers',
        currentState: 'implemented',
        authorityOrder: ['requirements', 'code'],
        globalInvariants: ['accepted-ledger'],
        bindings: { design: 'fixture', engineering: 'fixture' },
        commands: ['test "$(cat value.txt)" = good'],
        unresolvedDecisions: [],
        sources: [source],
        facts: [],
        history: [],
      }) +
      '\n```\n',
  )
}
test('accepted rendered obligation stays pending in the actual reviewer seam after executor deletes its obligation', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'ateam-rendered-seam-'))
  process.env.ATEAM_RUNNER_HOME = join(temp, 'home')
  try {
    const repo = fixtureRepo(temp),
      ledger = obligationFixture()
    acceptedContext(repo, ledger)
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'accepted rendered obligation'])
    const cfg = config(repo),
      a = adapter(repo)
    let observed
    const result = await runIssue({
      adapter: a,
      issue,
      cfg,
      deps: {
        execute: async (args) => {
          const weakened = structuredClone(ledger)
          weakened.requirements[0].obligations = weakened.requirements[0].obligations.filter(
            (o) => o.method !== 'rendered-review',
          )
          acceptedContext(args.worktree, weakened)
          return commit(args)
        },
        review: async (args) => {
          observed = args
          return {
            ...verdict,
            testAdequacy: verdict.testAdequacy.map((entry) => ({
              ...entry,
              requirementSource: {
                id: args.adequacyAuthority.sources[0].id,
                revision: args.adequacyAuthority.sources[0].revision,
              },
            })),
          }
        },
        runVerification: pass,
      },
    })
    assert.equal(observed.renderedAuthority.required, true)
    assert.deepEqual(observed.renderedAuthority.obligations, ['OBL-SCREEN'])
    assert.equal(observed.renderedReview.status, 'pending')
    assert.notEqual(result.outcome, 'approved')
    assert.equal(
      a.calls.some((c) => c[0] === 'approved'),
      false,
    )
  } finally {
    rmSync(temp, { recursive: true, force: true })
    delete process.env.ATEAM_RUNNER_HOME
  }
})
test('required accepted plan is pinned and a malformed or deleted head plan cannot waive it', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'ateam-rendered-plan-'))
  try {
    const repo = fixtureRepo(temp)
    writeFileSync(join(repo, 'rendered.json'), JSON.stringify(plan()))
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'accepted plan'])
    const cfg = config(repo)
    cfg.policy.verification.renderedReview = 'rendered.json'
    const authority = await deriveRenderedReviewAuthority({
      root: repo,
      head: cfg.policy.target.baseSha,
      policy: cfg.policy,
      issue,
    })
    assert.equal(authority.required, true)
    assert.doesNotThrow(() =>
      validateRenderedAuthority(authority, {
        baseSha: cfg.policy.target.baseSha,
        policy: cfg.policy,
      }),
    )
    assert.throws(
      () =>
        validateRenderedAuthority(null, { baseSha: cfg.policy.target.baseSha, policy: cfg.policy }),
      /authority/,
    )
    writeFileSync(join(repo, 'rendered.json'), JSON.stringify({ ...plan(), cases: [] }))
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'executor weakens plan'])
    const { evaluateRenderedReview } = await import('../src/rendered-review.mjs')
    await assert.rejects(
      evaluateRenderedReview({
        worktree: repo,
        head: git(repo, ['rev-parse', 'HEAD']),
        policy: cfg.policy,
        planPath: 'rendered.json',
        scratchDir: join(temp, 'scratch'),
        evidenceDir: join(temp, 'evidence'),
        authority,
      }),
      /accepted base authority/,
    )
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

test('accepted future deferral also disposes the matching mapped design obligation', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'ateam-rendered-design-deferral-'))
  try {
    const repo = fixtureRepo(temp),
      ledger = obligationFixture()
    const obligation = ledger.requirements[0].obligations.find((o) => o.id === 'OBL-SCREEN')
    obligation.status = 'deferred'
    obligation.deferral = {
      actor: 'Product lead',
      authorized: true,
      reference: 'decisions/D-7.md',
      rationale: 'Accepted later study',
      consequence: 'Evidence remains pending',
      nextDecisionStage: 'product-validation',
    }
    acceptedContext(repo, ledger)
    const design = '# Accepted design\nScreen verification is explicitly deferred.\n'
    writeFileSync(join(repo, 'design.md'), design)
    const contextPath = join(repo, 'docs/product/context.md')
    const context = JSON.parse(
      readFileSync(contextPath, 'utf8').split('\n').slice(1, -2).join('\n'),
    )
    context.sources.unshift({
      id: 'screen-design',
      kind: 'design',
      path: 'design.md',
      revision: createHash('sha256').update(design).digest('hex'),
      global: true,
      obligationIds: ['OBL-SCREEN'],
    })
    writeFileSync(contextPath, '```ateam-context\n' + JSON.stringify(context) + '\n```\n')
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'accepted deferral and mapped design'])
    let policy = config(repo).policy
    let authority = await deriveRenderedReviewAuthority({
      root: repo,
      head: policy.target.baseSha,
      policy,
      issue,
    })
    assert.equal(authority.required, false)
    assert.deepEqual(authority.obligations, [])
    assert.equal(authority.dispositions[0].decision.reference, 'decisions/D-7.md')
    assert.equal(authority.sources.length, 2)
    // The same decision is due at verification and must then require observation.
    obligation.deferral.nextDecisionStage = 'verification'
    const content = JSON.stringify(ledger)
    writeFileSync(join(repo, 'acceptance.json'), content)
    context.sources.find((s) => s.kind === 'requirement').revision = createHash('sha256')
      .update(content)
      .digest('hex')
    writeFileSync(contextPath, '```ateam-context\n' + JSON.stringify(context) + '\n```\n')
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'deferral deadline reached'])
    policy = config(repo).policy
    authority = await deriveRenderedReviewAuthority({
      root: repo,
      head: policy.target.baseSha,
      policy,
      issue,
    })
    assert.equal(authority.required, true)
    assert.deepEqual(authority.obligations, ['OBL-SCREEN'])
    assert.deepEqual(authority.dispositions, [])
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
