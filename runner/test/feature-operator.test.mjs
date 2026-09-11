import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { operatorFixture, human, featureCli } from './helpers/operator-fixture.mjs'
import { createFeature, transitionFeature } from '../src/feature-state.mjs'
import { openBudget, resolveLimits } from '../src/core/budget.mjs'
import { runAction, readEvents, replayIssue } from '../src/core/history.mjs'

function fixture(t, options) {
  const root = mkdtempSync(join(tmpdir(), 'ateam-operator-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return operatorFixture(root, options)
}
function runnerHome(t, f) {
  const before = process.env.ATEAM_RUNNER_HOME
  process.env.ATEAM_RUNNER_HOME = f.runnerHome
  t.after(() =>
    before === undefined
      ? delete process.env.ATEAM_RUNNER_HOME
      : (process.env.ATEAM_RUNNER_HOME = before),
  )
}
const projection = (f) => {
  const result = f.status()
  assert.equal(result.status, 0, result.stdout)
  return JSON.parse(result.stdout).summary
}

test('a missing gate decision advertises corrected approval without invalidating completed work', (t) => {
  const f = fixture(t)
  f.init()
  f.definition()
  const blocked = f.run('approve', { phase: 'definition' })
  assert.equal(blocked.status, 'blocked')
  const before = f.read()
  const s = projection(f)
  assert.equal(s.reason, blocked.error.message)
  assert.equal(s.phases.find((p) => p.name === 'definition').status, 'complete')
  assert.ok(s.actions.some((a) => a.command === 'approve' && a.humanDecisionRequired))
  assert.match(s.nextAction, /approve definition/)
  assert.deepEqual(
    f.read(),
    before,
    'projection preserves the blocked diagnostic and completed evidence',
  )
  const html = f.status('html')
  assert.equal(html.status, 0)
  assert.match(html.stdout, /authorized human decision/)
  assert.match(html.stdout, /<code>approve definition<\/code>/)
  const approved = f.run('approve', { phase: 'definition', decision: human })
  assert.equal(approved.status, 'success')
  assert.deepEqual(approved.manifest.phases.definition.bindings, before.phases.definition.bindings)
  assert.equal(approved.manifest.phases.definition.attempts, before.phases.definition.attempts)
})

test('in-progress status advertises a supported read command without mutation arguments', (t) => {
  const f = fixture(t)
  f.init()
  f.run('start', { phase: 'discovery' })
  const before = f.read()
  const action = projection(f).actions[0]
  assert.equal(action.command, 'show')
  assert.equal(action.readOnly, true)
  assert.equal(action.phase, undefined)
  assert.equal(action.reasonRequired, undefined)
  const result = spawnSync(process.execPath, [featureCli, action.command, '--feature', f.dir], {
    encoding: 'utf8',
    env: { ...process.env, ATEAM_RUNNER_HOME: f.runnerHome },
  })
  assert.equal(result.status, 0, result.stdout)
  assert.equal(JSON.parse(result.stdout).manifest.phases.discovery.status, 'in_progress')
  assert.deepEqual(f.read(), before)
  const html = f.status('html')
  assert.equal(html.status, 0)
  assert.match(html.stdout, /<code>show<\/code>/)
  assert.match(html.stdout, /Read commands use only/)
  assert.ok(!html.stdout.includes('<code>inspect'))
})

test('CLI cooperative pause retains in-flight observations and stable resume replay', (t) => {
  const f = fixture(t)
  f.init()
  f.run('start', { phase: 'discovery' })
  const paused = f.run('pause', { reason: 'Operator is reviewing the source material' })
  assert.equal(paused.status, 'success')
  assert.equal(paused.manifest.state, 'paused')
  assert.equal(paused.manifest.phases.discovery.status, 'in_progress')
  assert.equal(f.run('start', { phase: 'definition' }).status, 'blocked')
  assert.equal(
    f.run('complete', { phase: 'discovery', artifacts: ['../../product/jtbd'] }).status,
    'success',
  )
  const p = projection(f)
  assert.equal(p.state, 'paused')
  assert.match(p.reason, /reviewing the source/)
  assert.equal(p.stage, 'definition')
  assert.ok(p.actions.some((a) => a.command === 'resume'))
  assert.match(p.control.description, /cooperative/i)
  assert.equal(p.containment.status, 'unresolved')
  const prior = f.revision
  const resumed = f.run(
    'resume',
    { reason: 'Source review finished' },
    { revision: prior, eventId: 'resume-once' },
  )
  assert.equal(resumed.manifest.state, 'definition')
  const replay = f.run(
    'resume',
    { reason: 'Source review finished' },
    { revision: prior, eventId: 'resume-once' },
  )
  assert.equal(replay.replayed, true)
  assert.deepEqual(replay.manifest, resumed.manifest)
  assert.equal(
    f.run('resume', { reason: 'Changed input' }, { eventId: 'resume-once' }).error.code,
    'feature-conflict',
  )
  assert.equal(
    existsSync(f.runnerHome),
    false,
    'controls never create budgets, claims, or workspaces',
  )
})

test('revise invalidates descendants even when the earlier phase has no live binding', () => {
  let m = createFeature({ slug: 'save', repo: '/target' })
  m.phases.discovery.status = 'in_progress'
  m.phases.definition.status = 'complete'
  m.phases.definition.bindings = { 'prd.md': 'a'.repeat(64) }
  m.phases.definition.decisions = [{ kind: 'approval', reference: 'prior-human-decision' }]
  m = transitionFeature(m, { type: 'revise', phase: 'discovery', reason: 'Scope changed' })
  assert.equal(m.phases.discovery.status, 'pending')
  assert.equal(m.phases.definition.status, 'stale')
  assert.equal(m.phases.definition.decisions.length, 1)
})

test('failure reported during a pause retains its concrete reason after resume', (t) => {
  const f = fixture(t)
  f.init()
  f.run('start', { phase: 'discovery' })
  f.run('pause', { reason: 'Wait for evidence' })
  assert.equal(
    f.run('fail', { phase: 'discovery', reason: 'Authored context source is missing' }).status,
    'success',
  )
  f.run('resume', { reason: 'Inspect failure' })
  assert.match(projection(f).reason, /Authored context source is missing/)
})

test('paused current evidence still revalidates and cannot be approved until resumed', (t) => {
  const f = fixture(t)
  f.init()
  f.definition()
  f.run('approve', { phase: 'definition', decision: human })
  f.run('pause', { reason: 'Revisit the scope' })
  writeFileSync(
    join(f.dir, 'prd.md'),
    readFileSync(join(f.dir, 'prd.md'), 'utf8') + '\nRevised source\n',
  )
  const s = projection(f)
  assert.equal(s.state, 'paused')
  assert.equal(s.stage, 'definition')
  assert.equal(s.phases.find((p) => p.name === 'definition').status, 'stale')
  assert.equal(f.run('approve', { phase: 'definition', decision: human }).status, 'blocked')
  assert.equal(
    f.run('revise', { phase: 'definition', reason: 'Narrow the scope' }).manifest.state,
    'paused',
  )
  assert.equal(f.run('resume', { reason: 'Source review finished' }).manifest.state, 'definition')
})

test('a paused completed run offers no invalid revise-from-stopped action', (t) => {
  const f = fixture(t)
  f.init()
  f.run('configure', {
    authorization: human,
    run_brief: { mode: 'discovery-only', stopping_point: 'discovery' },
  })
  f.run('start', { phase: 'discovery' })
  assert.equal(
    f.run('complete', { phase: 'discovery', artifacts: ['../../product/jtbd'] }).manifest.state,
    'stopped',
  )
  f.run('pause', { reason: 'Review the completed discovery' })
  const s = projection(f)
  assert.equal(s.stage, 'stopped')
  assert.ok(!s.actions.some((a) => a.command === 'revise' && a.phase === 'stopped'))
})

test('status reads current artifacts, preserves history, and separates provisional acceptance and milestones', (t) => {
  const f = fixture(t, { runtimeUrl: 'http://127.0.0.1:43111/prototype' })
  f.init()
  f.definition()
  f.run('configure', {
    gate_policy: 'notify-and-continue',
    authorization: { ...human, scope: ['definition'] },
  })
  f.run('approve', { phase: 'definition', provisional: true })
  let s = projection(f)
  assert.equal(s.phases.find((p) => p.name === 'definition').decision, 'provisional')
  assert.equal(s.milestones.find((m) => m.name === 'human_acceptance').status, 'pending')
  assert.equal(s.milestones.length, 6)
  assert.ok(
    s.runtimeLinks.some((l) => l.url.endsWith('/prototype') && l.availability === 'not-checked'),
  )
  assert.ok(s.assumptions.length)
  assert.ok(s.unresolved.some((o) => o.id === 'OBL-STUDY'))
  f.run('approve', { phase: 'definition', decision: human })
  const before = readFileSync(join(f.dir, 'feature.json'), 'utf8')
  writeFileSync(
    join(f.dir, 'prd.md'),
    readFileSync(join(f.dir, 'prd.md'), 'utf8') + '\nChanged scope\n',
  )
  s = projection(f)
  assert.equal(s.phases.find((p) => p.name === 'definition').status, 'stale')
  assert.equal(s.phases.find((p) => p.name === 'definition').decision, 'stale')
  assert.ok(s.changesSinceReview.some((c) => c.path === 'prd.md' && c.change === 'changed'))
  assert.ok(s.gate.recommendation && s.gate.decisionNeeded && s.gate.consequence)
  assert.equal(readFileSync(join(f.dir, 'feature.json'), 'utf8'), before, 'status is read-only')
  assert.ok(s.history.some((e) => e.command === 'approve'))
  rmSync(join(f.dir, 'prd.md'))
  s = projection(f)
  assert.ok(s.artifacts.some((a) => a.path === 'prd.md' && a.status === 'missing' && !a.href))
})

test('HTML/text projections escape content and omit unsafe runtime and local links', (t) => {
  const f = fixture(t)
  f.init()
  f.definition()
  f.run('configure', {
    authorization: human,
    run_brief: {
      outcome: '<script>alert(1)</script>',
      runtime_links: [
        { label: 'javascript', url: 'javascript:alert(1)' },
        { label: 'secret', url: 'https://user:secret@example.com/' },
        { label: 'token', url: 'http://localhost/?token=secret' },
        { label: 'key', url: 'https://example.invalid/?key=secret' },
        { label: 'file escape', url: 'file:///etc/passwd' },
        { label: 'Prototype', url: 'http://127.0.0.1:43111/prototype' },
      ],
    },
  })
  symlinkSync('/etc/passwd', join(f.dir, 'escape.md'))
  writeFileSync(join(f.dir, '.env'), 'SECRET=do-not-read')
  const s = projection(f)
  assert.deepEqual(
    s.runtimeLinks.map((l) => l.label),
    ['Prototype'],
  )
  assert.ok(!s.artifacts.some((a) => a.href?.includes('/etc/passwd') || a.path === '.env'))
  const html = f.status('html')
  assert.equal(html.status, 0)
  assert.match(html.stdout, /<!doctype html>/i)
  assert.ok(!html.stdout.includes('<script>') && !html.stdout.includes('https://user:secret'))
  assert.match(html.stdout, /&lt;script&gt;alert/)
  assert.match(html.stdout, /Human acceptance/)
  const text = f.status('text')
  assert.equal(text.status, 0)
  assert.match(text.stdout, /Next action:/)
  assert.match(text.stdout, /Budget: unknown/)
  assert.match(text.stdout, /Consequence:/)
})

test('actual CLI JSON and HTML reject encoded sensitive fragments and malformed escapes', (t) => {
  const f = fixture(t)
  f.init()
  const unsafe = [
    'https://example.invalid/#%74%6f%6b%65%6e=synthetic-value',
    'https://example.invalid/#%54%4f%4b%45%4e=synthetic-value',
    'https://example.invalid/#review?%61uth=synthetic-value',
    'https://example.invalid/#review%',
    'https://example.invalid/#review%ZZ',
    'https://example.invalid/#review%E0%A4%A',
  ]
  const safe = 'https://example.invalid/#%72eview'
  assert.equal(
    f.run('configure', {
      authorization: human,
      run_brief: {
        runtime_links: [
          ...unsafe.map((url, i) => ({ label: `Unsafe fragment ${i}`, url })),
          { label: 'Review section', url: safe },
        ],
      },
    }).status,
    'success',
  )
  assert.deepEqual(projection(f).runtimeLinks, [
    { label: 'Review section', url: safe, availability: 'not-checked' },
  ])
  const html = f.status('html')
  assert.equal(html.status, 0)
  assert.match(html.stdout, /href="https:\/\/example\.invalid\/#%72eview"/)
  for (const url of unsafe) assert.ok(!html.stdout.includes(url), url)
  assert.ok(!html.stdout.includes('Unsafe fragment'))
})

test('pause and abort preserve actual artifacts and accounted branches', (t) => {
  const f = fixture(t)
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: f.root, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    return r.stdout.trim()
  }
  git('init', '-q')
  git('-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'add', '.')
  git(
    '-c',
    'user.name=Synthetic',
    '-c',
    'user.email=synthetic@example.invalid',
    'commit',
    '-qm',
    'synthetic target',
  )
  git('branch', 'feature/save')
  f.init()
  f.definition()
  const artifact = readFileSync(join(f.dir, 'prd.md'), 'utf8')
  f.run('pause', { reason: 'Review pending' })
  const result = f.run('abort', { reason: 'Stop this slice' })
  assert.equal(result.manifest.state, 'aborted')
  assert.equal(readFileSync(join(f.dir, 'prd.md'), 'utf8'), artifact)
  assert.ok(git('branch', '--list', 'feature/save'))
  assert.equal(projection(f).reason, 'Stop this slice')
  assert.equal(f.run('resume', { reason: 'Retry' }).status, 'blocked')
})

test('read-only status uses known budget and marks uncertain accounting without inventing remaining spend', async (t) => {
  const f = fixture(t)
  runnerHome(t, f)
  f.init()
  const budget = openBudget({
    repo: f.root,
    policy: { limits: resolveLimits({ runBudgetUsd: 3 }) },
  })
  await budget.call('executor', async () => ({ costUsd: 1 }))
  let s = projection(f)
  assert.equal(s.budget.status, 'known')
  assert.equal(s.budget.remainingUsd, 2)
  await assert.rejects(
    budget.call('reviewer', async () => ({})),
    /unknown cost/,
  )
  s = projection(f)
  assert.equal(s.budget.status, 'uncertain')
  assert.equal(s.budget.remainingUsd, null)
  assert.equal(s.budget.knownSpentUsd, 1)
})

test('interrupted action remains visible across pause/resume and reconciliation never repeats its effect', async (t) => {
  const f = fixture(t)
  runnerHome(t, f)
  f.init()
  f.run('configure', {
    authorization: human,
    run_brief: { runner_history: [{ repo: f.root, issue_key: 'ISS-CODE' }] },
  })
  let effects = 0
  const identity = {
    repo: f.root,
    issue: {
      key: 'ISS-CODE',
      title: 'Synthetic persistence',
      body: 'Save once',
      acceptanceCriteria: ['Saved once'],
    },
    attemptId: 'attempt-1',
    actionId: 'publish-once',
    kind: 'synthetic-publication',
    input: { head: 'abc' },
  }
  await assert.rejects(
    runAction(identity, async () => {
      effects++
      throw new Error('Receipt interrupted after effect')
    }),
    /uncertain/,
  )
  let s = projection(f)
  assert.equal(s.execution.status, 'action-uncertain')
  assert.match(s.nextAction, /reconcile/i)
  f.run('pause', { reason: 'Reconcile missing receipt' })
  f.run('resume', { reason: 'Inspect retained action' })
  s = projection(f)
  assert.equal(s.execution.unresolvedActions.length, 1)
  assert.equal(effects, 1)
  await runAction(
    {
      ...identity,
      reconcile: async () => ({ status: 'confirmed', result: { reference: 'synthetic:receipt' } }),
    },
    async () => {
      effects++
    },
  )
  await runAction(identity, async () => {
    effects++
  })
  assert.equal(effects, 1)
  assert.equal(projection(f).execution.unresolvedActions.length, 0)
  assert.equal(replayIssue(readEvents(f.root, 'ISS-CODE')).unresolvedActions.length, 0)
})
