import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as refinement from '../src/refinement.mjs'
import { runIssue } from '../src/core/loop.mjs'
import { parseIssuesFile } from '../src/local-issues.mjs'
import { config, adapter, impl, verdict } from './approval-fixtures.mjs'
const hash = (value) => createHash('sha256').update(value).digest('hex')
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ateam-refinement-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const put = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), value)
    return hash(value)
  }
  const sources = [
    {
      id: 'contract',
      kind: 'requirement',
      path: 'docs/requirements.md',
      revision: put(
        'docs/requirements.md',
        'OBL-SAVE: retry persists pending edits; dependency submit requires persisted state',
      ),
      global: true,
    },
    {
      id: 'save',
      kind: 'code',
      path: 'src/save.mjs',
      revision: put('src/save.mjs', 'export const value = false'),
      tags: ['persistence'],
    },
    {
      id: 'tokens',
      kind: 'design',
      path: 'ui/tokens.css',
      revision: put('ui/tokens.css', ':root { --space: 8px; }'),
      tags: ['design'],
    },
    {
      id: 'architecture',
      kind: 'adr',
      path: 'docs/adr/storage.md',
      revision: put('docs/adr/storage.md', 'Accepted local persistence'),
      global: true,
    },
  ]
  const index = {
    schemaVersion: 1,
    purpose: 'Persist work',
    audience: 'Existing editors',
    currentState: 'implemented',
    authorityOrder: ['requirements', 'adr', 'code'],
    globalInvariants: ['contract'],
    bindings: { design: 'ui/tokens.css', engineering: 'docs/adr/storage.md' },
    commands: [],
    unresolvedDecisions: [],
    sources,
    facts: [],
    history: [],
  }
  put('docs/product/context.md', '```ateam-context\n' + JSON.stringify(index) + '\n```\n')
  const git = (args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    }).trim()
  git(['init', '--initial-branch=main'])
  git(['config', 'user.name', 'Fixture'])
  git(['config', 'user.email', 'fixture@example.com'])
  git(['add', '.'])
  git(['commit', '-m', 'Accepted fixture baseline'])
  const change = {
    schemaVersion: 1,
    id: 'REF-SAVE',
    kind: 'bugfix',
    outcome: 'Retry a failed save without losing edits',
    linkedObligations: ['OBL-SAVE'],
    invariants: ['contract'],
    authorization: { actor: 'fixture-owner', reference: 'request-1', authorized: true },
    authorizedDelta: 'Fix the existing save/retry behavior',
    surfaces: ['src/save.mjs'],
    dependencies: [],
    risks: [],
    affectedArtifacts: ['docs/product/context.md'],
    reviews: [],
  }
  return { root, put, index, change, git }
}

test('known failed-save refinement selects a bounded route under existing authority', async (t) => {
  const f = fixture(t)
  assert.equal(typeof refinement.planRefinement, 'function')
  const plan = await refinement.planRefinement({ root: f.root, change: f.change })
  assert.equal(plan.status, 'ready')
  assert.deepEqual(plan.route, [
    'current-context',
    'change-record',
    'implementation',
    'independent-review',
    'verification',
    'context-refresh',
  ])
  assert.deepEqual(plan.verification.scenarios, [
    'save-failure-retry',
    'edits-in-flight',
    'dependent-submit-blocked',
    'unsaved-navigation',
  ])
  assert.deepEqual(
    plan.preservedBindings.map((binding) => binding.path),
    ['ui/tokens.css', 'docs/adr/storage.md'],
  )
  assert.ok(plan.selectedSources.some((source) => source.id === 'contract'))
  assert.equal(plan.acceptance, 'pending')
})

test('inferred business risk selects the same authority as an explicit risk before review', async (t) => {
  const f = fixture(t)
  f.index.sources.push({
    id: 'eligibility',
    kind: 'requirement',
    path: 'docs/eligibility.md',
    tags: ['business-rule'],
    revision: f.put(
      'docs/eligibility.md',
      'OBL-ELIGIBLE: enforce accepted eligibility before submission',
    ),
  })
  f.put('docs/product/context.md', '```ateam-context\n' + JSON.stringify(f.index) + '\n```\n')
  f.change.authorizedDelta = 'Adjust eligibility for existing accounts'
  const inferred = await refinement.planRefinement({ root: f.root, change: f.change })
  assert.ok(inferred.selectedSources.some((s) => s.id === 'eligibility'))
  const explicit = await refinement.planRefinement({
    root: f.root,
    change: { ...f.change, risks: ['business-rule'] },
  })
  assert.deepEqual(inferred.selectedSources, explicit.selectedSources)
  const receipt = {
    kind: 'domain-review',
    actor: 'domain-owner',
    approved: true,
    sourceRevisions: Object.fromEntries(
      inferred.selectedSources.filter((s) => s.id !== 'eligibility').map((s) => [s.id, s.revision]),
    ),
  }
  f.put('docs/domain-review.json', JSON.stringify(receipt))
  f.change.reviews = [
    {
      kind: 'domain-review',
      actor: 'domain-owner',
      approved: true,
      reference: 'docs/domain-review.json',
    },
  ]
  await assert.rejects(
    refinement.planRefinement({ root: f.root, change: f.change }),
    /Stale or mismatched/,
  )
  receipt.sourceRevisions.eligibility = inferred.selectedSources.find(
    (s) => s.id === 'eligibility',
  ).revision
  f.put('docs/domain-review.json', JSON.stringify(receipt))
  assert.equal(
    (await refinement.planRefinement({ root: f.root, change: f.change })).status,
    'ready',
  )
  f.put('docs/eligibility.md', 'Changed eligibility')
  await assert.rejects(refinement.planRefinement({ root: f.root, change: f.change }), /stale/i)
})

for (const [name, delta, risks, required, status] of [
  [
    'small authorization change',
    'Change record authorization for shared owners',
    [],
    ['security-review'],
    'review-required',
  ],
  [
    'business rule',
    'Change eligibility business rule for one account',
    [],
    ['domain-review'],
    'review-required',
  ],
  [
    'migration',
    'Migrate the existing save schema',
    [],
    ['architecture-review', 'migration-review'],
    'review-required',
  ],
  ['new audience', 'Serve a new audience with this workflow', [], ['discovery'], 'reopen-required'],
  ['new job', 'Support a new job for existing users', [], ['discovery'], 'reopen-required'],
  [
    'interaction',
    'Change keyboard interaction after failed save',
    [],
    ['design-review'],
    'review-required',
  ],
  ['shared token', 'Adjust shared spacing token', [], ['design-review'], 'review-required'],
])
  test(`${name} chooses required review despite one-file scope`, async (t) => {
    const f = fixture(t)
    const change = { ...f.change, authorizedDelta: delta, risks }
    const plan = await refinement.planRefinement({ root: f.root, change })
    assert.equal(plan.status, status)
    for (const review of required) assert.ok(plan.requiredReviews.includes(review), review)
    assert.equal(plan.route.filter((phase) => phase === 'implementation').length, 1)
  })

test('low-impact copy can use existing checks and rendered review', async (t) => {
  const f = fixture(t)
  const change = {
    ...f.change,
    kind: 'copy',
    outcome: 'Clarify the saved label',
    authorizedDelta: 'Correct a typo in the status label',
  }
  const plan = await refinement.planRefinement({ root: f.root, change })
  assert.equal(plan.status, 'ready')
  assert.deepEqual(plan.verification.methods, [
    'existing-checks',
    'rendered-review',
    'independent-review',
  ])
})

test('missing or unresolved prerequisites prevent implementation', async (t) => {
  const f = fixture(t)
  f.change.dependencies = [{ id: 'ISS-STORAGE', status: 'blocked', reason: 'Storage unavailable' }]
  const plan = await refinement.planRefinement({ root: f.root, change: f.change })
  assert.equal(plan.status, 'blocked')
  assert.match(plan.reasons[0], /ISS-STORAGE.*Storage unavailable/)
})

test('linked obligations must match an exact project-owned ID', async (t) => {
  const f = fixture(t)
  f.change.linkedObligations = ['OBL-SAV']
  await assert.rejects(
    refinement.planRefinement({ root: f.root, change: f.change }),
    /OBL-SAV.*absent/,
  )
})

test('scope audit preserves accepted tokens/architecture and narrows artifact refresh', async (t) => {
  const f = fixture(t)
  const plan = await refinement.planRefinement({ root: f.root, change: f.change })
  f.put('src/save.mjs', 'export const value = true')
  assert.equal(typeof refinement.auditRefinementChanges, 'function')
  let report = await refinement.auditRefinementChanges({ root: f.root, plan })
  assert.equal(report.status, 'scope-checked')
  assert.deepEqual(report.changedPaths, ['src/save.mjs'])
  assert.deepEqual(report.refreshArtifacts, ['docs/product/context.md'])
  assert.deepEqual(
    report.preservedBindings.map((binding) => binding.path),
    ['ui/tokens.css', 'docs/adr/storage.md'],
  )
  f.put('ui/tokens.css', ':root { --space: 24px; }')
  report = await refinement.auditRefinementChanges({ root: f.root, plan })
  assert.equal(report.status, 'blocked')
  assert.ok(report.violations.some((violation) => violation.path === 'ui/tokens.css'))
})

test('scope audit preserves unrelated inherited work without approving new unrelated edits', async (t) => {
  const f = fixture(t)
  f.put('notes.md', 'Inherited note')
  const plan = await refinement.planRefinement({ root: f.root, change: f.change })
  f.put('src/save.mjs', 'export const value = true')
  assert.equal(
    (await refinement.auditRefinementChanges({ root: f.root, plan })).status,
    'scope-checked',
  )
  f.put('notes.md', 'Changed inherited note')
  const report = await refinement.auditRefinementChanges({ root: f.root, plan })
  assert.equal(report.status, 'blocked')
  assert.ok(report.violations.some((violation) => violation.path === 'notes.md'))
})

test('direct changes to accepted architecture require architecture review', async (t) => {
  const f = fixture(t)
  f.change.surfaces = ['docs/adr/storage.md']
  f.change.outcome = 'Clarify current storage choice'
  f.change.authorizedDelta = 'Change the selected storage choice'
  const plan = await refinement.planRefinement({ root: f.root, change: f.change })
  assert.equal(plan.status, 'review-required')
  assert.ok(plan.requiredReviews.includes('architecture-review'))
})

test('refinement completion requires a delivered runner approval and rejects later code/evidence changes', async (t) => {
  const f = fixture(t)
  const previousHome = process.env.ATEAM_RUNNER_HOME
  process.env.ATEAM_RUNNER_HOME = join(f.root, '..', `${f.root.split('/').at(-1)}-runner`)
  t.after(() => {
    rmSync(process.env.ATEAM_RUNNER_HOME, { recursive: true, force: true })
    if (previousHome === undefined) delete process.env.ATEAM_RUNNER_HOME
    else process.env.ATEAM_RUNNER_HOME = previousHome
  })
  f.put(
    'docs/issues.md',
    '## Repair save\n**ID:** ISS-SAVE\n**Depends on:** none\n**Requirements:** R-SAVE\nREF-SAVE OBL-SAVE\n### Acceptance Criteria\n- [ ] Retry preserves pending edits\n',
  )
  f.change.affectedArtifacts.push('docs/result.json')
  const command =
    'node --input-type=module -e "import {value} from \'./src/save.mjs\'; if (!value) process.exit(1)"'
  f.index.commands = [command]
  f.put('.gitignore', 'docs/ignored-result.json\n')
  f.put('docs/product/context.md', '```ateam-context\n' + JSON.stringify(f.index) + '\n```\n')
  f.git(['add', '.'])
  f.git(['commit', '-m', 'Scope refinement ticket'])
  f.put(
    'docs/unreviewed-result.json',
    JSON.stringify({
      method: 'regression',
      status: 'passed',
      summary: 'Inherited report never committed',
      actor: 'fixture-verifier',
      sourceRevisions: { 'src/save.mjs': hash('export const value = true') },
      scenarios: [
        'save-failure-retry',
        'edits-in-flight',
        'dependent-submit-blocked',
        'unsaved-navigation',
      ].map((id) => ({ id, status: 'passed' })),
    }),
  )
  f.put(
    'docs/ignored-result.json',
    readFileSync(join(f.root, 'docs/unreviewed-result.json'), 'utf8'),
  )
  const plan = await refinement.planRefinement({ root: f.root, change: f.change })
  const issue = parseIssuesFile(readFileSync(join(f.root, 'docs/issues.md'), 'utf8'))[0]
  const cfg = config(f.root)
  cfg.policy.verification.commands = [command]
  const completion = {
    summary: 'Retry now preserves pending edits',
    issuesPath: 'docs/issues.md',
    ticketId: 'ISS-SAVE',
    approvedRevision: plan.baseRevision,
    evidence: [{ method: 'regression', reference: 'docs/result.json' }],
  }
  assert.equal(typeof refinement.validateRefinementCompletion, 'function')
  let result = await refinement.validateRefinementCompletion({
    root: f.root,
    plan,
    completion,
    policy: cfg.policy,
  })
  assert.equal(result.status, 'blocked')
  const a = adapter(f.root)
  a.repo = cfg.policy.target.root
  const run = await runIssue({
    adapter: a,
    issue,
    cfg,
    deps: {
      execute: async ({ worktree }) => {
        const source = 'export const value = true'
        writeFileSync(join(worktree, 'src/save.mjs'), source)
        const index = structuredClone(f.index)
        index.sources.find((s) => s.id === 'save').revision = hash(source)
        writeFileSync(
          join(worktree, 'docs/product/context.md'),
          '```ateam-context\n' + JSON.stringify(index) + '\n```\n',
        )
        writeFileSync(
          join(worktree, 'docs/result.json'),
          JSON.stringify({
            method: 'regression',
            status: 'passed',
            summary: 'Synthetic persistence scenarios checked',
            actor: 'fixture-verifier',
            sourceRevisions: { 'src/save.mjs': hash(source) },
            scenarios: plan.verification.scenarios.map((id) => ({ id, status: 'passed' })),
          }),
        )
        execFileSync('git', ['add', '.'], { cwd: worktree })
        execFileSync('git', ['commit', '-m', 'Fix save and record regression evidence'], {
          cwd: worktree,
        })
        return impl
      },
      review: async () => verdict,
      runVerification: async ({ command, worktree }) => ({
        code: 0,
        stdout: execFileSync('/bin/sh', ['-c', command], { cwd: worktree, encoding: 'utf8' }),
        stderr: '',
      }),
    },
  })
  assert.equal(run.outcome, 'approved', run.reason)
  const approved = a.calls.find((c) => c[0] === 'approved')[1]
  f.git(['merge', '--ff-only', approved.head])
  completion.approvedRevision = approved.head
  result = await refinement.validateRefinementCompletion({
    root: f.root,
    plan,
    completion,
    policy: cfg.policy,
  })
  assert.equal(result.status, 'verified', JSON.stringify(result))
  assert.equal(result.acceptance, 'pending')
  assert.equal(f.git(['ls-files', 'docs/unreviewed-result.json']), '')
  const unreviewed = await refinement.validateRefinementCompletion({
    root: f.root,
    plan,
    completion: {
      ...completion,
      evidence: [{ method: 'regression', reference: 'docs/unreviewed-result.json' }],
    },
    policy: cfg.policy,
  })
  assert.equal(
    unreviewed.status,
    'blocked',
    'Inherited untracked report cannot satisfy independent review',
  )
  const ignored = await refinement.validateRefinementCompletion({
    root: f.root,
    plan,
    completion: {
      ...completion,
      evidence: [{ method: 'regression', reference: 'docs/ignored-result.json' }],
    },
    policy: cfg.policy,
  })
  assert.equal(ignored.status, 'blocked', 'Ignored report must exist in reviewed tree')
  const originalTicket = readFileSync(join(f.root, 'docs/issues.md'), 'utf8')
  f.put(
    'docs/issues.md',
    originalTicket.replace('Retry preserves pending edits', 'Accept all writes'),
  )
  assert.equal(
    (
      await refinement.validateRefinementCompletion({
        root: f.root,
        plan,
        completion,
        policy: cfg.policy,
      })
    ).status,
    'blocked',
  )
  f.put('docs/issues.md', originalTicket)
  const originalReport = readFileSync(join(f.root, 'docs/result.json'), 'utf8')
  f.put('docs/result.json', originalReport.replace('save-failure-retry', 'unrelated-check'))
  assert.equal(
    (
      await refinement.validateRefinementCompletion({
        root: f.root,
        plan,
        completion,
        policy: cfg.policy,
      })
    ).status,
    'blocked',
  )
  f.put('docs/result.json', originalReport)
  f.put('src/save.mjs', 'export const value = false')
  result = await refinement.validateRefinementCompletion({
    root: f.root,
    plan,
    completion,
    policy: cfg.policy,
  })
  assert.equal(result.status, 'blocked')
  assert.match(result.reason, /reviewed|approval|context|evidence/)
})
