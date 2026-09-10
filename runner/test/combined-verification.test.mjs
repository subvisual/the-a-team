import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, chmodSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtureRepo, config, git, issue, verdict } from './approval-fixtures.mjs'
import {
  resolveDeliveryContract,
  planCombinedRevision,
  verifyCombinedRevision,
  validateCombinedRecord,
} from '../src/combined-verification.mjs'
import { evaluateRevision } from '../src/core/approval.mjs'
let dir, root, policy
const contract = () => ({
  schemaVersion: 1,
  checks: [
    { id: 'suite', kind: 'suite', command: 'node check.mjs' },
    { id: 'types', kind: 'typecheck', notApplicable: 'Plain JavaScript fixture has no typecheck' },
    { id: 'build', kind: 'build', notApplicable: 'Node serves unbundled source' },
    {
      id: 'browser',
      kind: 'browser',
      notApplicable: 'This isolated module fixture has no interface',
    },
    {
      id: 'integration',
      kind: 'integration',
      notApplicable: 'This isolated module fixture has no external boundary',
    },
  ],
  boundaries: [
    {
      id: 'tenant',
      status: 'unexecuted',
      reason: 'Synthetic target only',
      obligationIds: ['OBL-TENANT'],
    },
  ],
})
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ateam-combined-'))
  process.env.ATEAM_RUNNER_HOME = join(dir, 'home')
  root = fixtureRepo(dir)
  writeFileSync(join(root, 'check.mjs'), 'console.log("checked")\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'check'])
  policy = config(root).policy
  git(root, ['branch', 'baseline'])
  policy.target.base = 'baseline'
  policy.verification.delivery = contract()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.ATEAM_RUNNER_HOME
})
const invoke = (extra = {}) =>
  verifyCombinedRevision({
    repo: 'o/r',
    root,
    branch: 'main',
    policy,
    approvedIssues: [],
    ...extra,
  })
const run = async () => ({ code: 0, stdout: 'green', stderr: '' })
test('delivery contract requires explicit coverage, no empty or duplicate checks', () => {
  assert.equal(resolveDeliveryContract(policy).checks.length, 5)
  for (const mutate of [
    (c) => c.checks.splice(0, 1),
    (c) => c.checks.push(c.checks[0]),
    (c) => (c.checks[0].command = ''),
    (c) => (c.checks[0].notApplicable = 'skip'),
  ]) {
    const c = contract()
    mutate(c)
    assert.throws(() => resolveDeliveryContract({ ...policy, verification: { delivery: c } }))
  }
  assert.throws(
    () => resolveDeliveryContract({ ...policy, verification: { commands: ['true'] } }),
    /delivery verification/,
  )
})
test('rendered delivery checks use a target-relative declarative plan only for browser or integration', () => {
  const c = contract()
  c.checks[3] = { id: 'browser', kind: 'browser', renderedReview: 'verification/browser.json' }
  assert.equal(
    resolveDeliveryContract({ verification: { delivery: c } }).checks[3].renderedReview,
    'verification/browser.json',
  )
  for (const patch of [
    { command: 'true' },
    { notApplicable: 'skip' },
    { kind: 'suite' },
    { renderedReview: '../outside.json' },
    { renderedReview: '/tmp/code.json' },
  ]) {
    const invalid = structuredClone(c)
    Object.assign(invalid.checks[3], patch)
    assert.throws(() => resolveDeliveryContract({ verification: { delivery: invalid } }))
  }
})
test('combined pass binds exact revision, policy, full command/output and explicit unexecuted systems', async () => {
  const result = await invoke({ deps: { runCommand: run } })
  assert.equal(result.status, 'passed')
  assert.equal(result.record.headSha, git(root, ['rev-parse', 'HEAD']))
  assert.deepEqual(result.record.boundaries, contract().boundaries)
  assert.equal(result.record.humanAcceptance, 'unverified')
  assert.equal(result.record.checks[0].output.stdout, 'green')
  assert.equal(result.record.checks[1].status, 'not-applicable')
  const validation = await validateCombinedRecord(result.recordPath, {
    root,
    branch: 'main',
    policy,
    approvedIssues: [],
  })
  assert.equal(validation.valid, true, validation.reason)
})
test('all isolated checks can pass while combined failure blocks; rerun retains failed history', async () => {
  const failed = await invoke({
    deps: {
      runCommand: async () => ({
        code: 4,
        stdout: 'unit green',
        stderr: 'combined boundary failed',
      }),
    },
  })
  assert.equal(failed.status, 'failed')
  assert.match(failed.record.failure, /combined boundary failed|exit 4/)
  const passed = await invoke({ deps: { runCommand: run } })
  assert.equal(passed.status, 'passed')
  assert.equal(passed.record.history.length, 1)
  assert.equal(passed.record.history[0].status, 'failed')
  assert.equal(JSON.parse(readFileSync(failed.recordPath)).checks[0].exitCode, 4)
})
test('moved branch, changed command policy or corrupted output invalidates evidence', async () => {
  const r = await invoke({ deps: { runCommand: run } })
  const changed = structuredClone(policy)
  changed.verification.delivery.checks[0].command = 'true'
  assert.equal(
    (
      await validateCombinedRecord(r.recordPath, {
        root,
        branch: 'main',
        policy: changed,
        approvedIssues: [],
      })
    ).valid,
    false,
  )
  writeFileSync(join(root, 'change.txt'), 'new')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'move'])
  assert.equal(
    (
      await validateCombinedRecord(r.recordPath, {
        root,
        branch: 'main',
        policy,
        approvedIssues: [],
      })
    ).valid,
    false,
  )
})
test('missing approval records and unmerged approved heads fail before any check', async () => {
  let calls = 0
  await assert.rejects(
    invoke({
      approvedIssues: [{ issue: { key: '1' }, approvalPath: join(dir, 'missing.json') }],
      deps: {
        runCommand: async () => {
          calls++
          return run()
        },
      },
    }),
    /approval/,
  )
  assert.equal(calls, 0)
})
test('source mutation despite exit zero is retained as failure', async () => {
  const r = await invoke({
    deps: {
      runCommand: async ({ worktree }) => {
        writeFileSync(join(worktree, 'value.txt'), 'mutated')
        return run()
      },
    },
  })
  assert.equal(r.status, 'failed')
  assert.match(r.record.failure, /mutated|changed/)
  assert.equal(readFileSync(join(root, 'value.txt'), 'utf8'), 'bad\n')
})
test('timeouts retain actual process output and every omitted command disposition', async () => {
  const r = await invoke({
    deps: {
      runCommand: async () => {
        throw Object.assign(Error('timed out'), {
          processResult: { code: 124, stdout: 'before timeout', stderr: '', timedOut: true },
        })
      },
    },
  })
  assert.equal(r.status, 'failed')
  assert.equal(r.record.checks[0].output.stdout, 'before timeout')
  assert.equal(r.record.checks[0].timedOut, true)
})

async function approveFixture() {
  writeFileSync(join(root, 'value.txt'), 'good\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'approved issue'])
  const head = git(root, ['rev-parse', 'HEAD']),
    runDir = join(process.env.ATEAM_RUNNER_HOME, 'runs', 'o-r', '1', 'fixture')
  mkdirSync(runDir, { recursive: true })
  const evaluation = await evaluateRevision({
    repo: 'o/r',
    repoPath: root,
    source: root,
    issue,
    baseSha: policy.target.baseSha,
    head,
    policy,
    review: async () => verdict,
    runDir,
    model: 'synthetic-test-double',
    budget: { call: async (role, fn) => fn({ timeoutMs: 2000 }) },
    deps: { runVerification: run },
  })
  return { issue, approvalPath: evaluation.approvalPath }
}
test('current supervisor issue approvals must be ancestors; moved criteria cannot reuse them', async () => {
  const approval = await approveFixture()
  const success = await invoke({ approvedIssues: [approval], deps: { runCommand: run } })
  assert.equal(success.status, 'passed')
  assert.equal(success.record.approvals.length, 1)
  assert.equal(
    (
      await validateCombinedRecord(success.recordPath, {
        root,
        branch: 'main',
        policy,
        approvedIssues: [approval],
      })
    ).valid,
    true,
  )
  await assert.rejects(
    invoke({
      approvedIssues: [{ ...approval, issue: { ...issue, body: 'Changed requirement' } }],
      deps: { runCommand: run },
    }),
    /criteria|adequacy/,
  )
  git(root, ['update-ref', 'refs/heads/main', policy.target.baseSha])
  await assert.rejects(invoke({ approvedIssues: [approval], deps: { runCommand: run } }), /descend/)
})
test('altered retained process output invalidates an otherwise matching passing record', async () => {
  const r = await invoke({ deps: { runCommand: run } })
  const c = JSON.parse(readFileSync(join(r.recordPath, '..', 'check-0.json'), 'utf8'))
  c.output.stdout = 'forged'
  chmodSync(join(r.recordPath, '..', 'check-0.json'), 0o644)
  writeFileSync(join(r.recordPath, '..', 'check-0.json'), JSON.stringify(c))
  const checked = await validateCombinedRecord(r.recordPath, {
    root,
    branch: 'main',
    policy,
    approvedIssues: [],
  })
  assert.equal(checked.valid, false)
  assert.match(checked.reason, /evidence changed/)
})

test('unfinished attempts remain in history with an unresolved reconciliation disposition', async () => {
  const r = await invoke({ deps: { runCommand: run } })
  rmSync(r.recordPath)
  const later = await invoke({ deps: { runCommand: run } })
  assert.equal(later.record.history.length, 1)
  assert.equal(later.record.history[0].status, 'incomplete')
  assert.equal(later.record.history[0].disposition.status, 'unresolved')
  assert.match(later.record.history[0].recordPath, /started.json$/)
})
test('branch movement during a check cannot publish a passing combined record', async () => {
  const r = await invoke({
    deps: {
      runCommand: async () => {
        writeFileSync(join(root, 'moved.txt'), 'new')
        git(root, ['add', '.'])
        git(root, ['commit', '-m', 'branch moved'])
        return run()
      },
    },
  })
  assert.equal(r.status, 'failed')
  assert.match(r.record.failure, /moved/)
})

test('combined planning checks protected CI scope before creating verification effects', async () => {
  mkdirSync(join(root, '.github/workflows'), { recursive: true })
  writeFileSync(join(root, '.github/workflows/verify.yml'), 'name: synthetic\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'CI change'])
  let calls = 0
  await assert.rejects(
    invoke({
      deps: {
        runCommand: async () => {
          calls++
          return run()
        },
      },
    }),
    /protected|scope|authorized/,
  )
  assert.equal(calls, 0)
  policy.authorization.id = 'explicit-ci-change'
  policy.authorization.protectedPaths = ['.github/workflows/verify.yml']
  const plan = await planCombinedRevision({ root, branch: 'main', policy, approvedIssues: [] })
  assert.deepEqual(plan.effects, [])
  assert.ok(plan.changedPaths.includes('.github/workflows/verify.yml'))
})

test('moved base ref invalidates retained proof even with an old caller policy', async () => {
  const r = await invoke({ deps: { runCommand: run } })
  writeFileSync(join(root, 'base-change.txt'), 'new base')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'base advance'])
  const newer = git(root, ['rev-parse', 'HEAD'])
  git(root, ['branch', '-f', 'baseline', newer])
  git(root, ['update-ref', 'refs/heads/main', r.record.headSha])
  const result = await validateCombinedRecord(r.recordPath, {
    root,
    branch: 'main',
    policy,
    approvedIssues: [],
  })
  assert.equal(result.valid, false)
  assert.match(result.reason, /base changed/)
})

test('base movement during passing checks is recorded as a combined failure', async () => {
  writeFileSync(join(root, 'before.txt'), 'change')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'combined change'])
  const r = await invoke({
    deps: {
      runCommand: async () => {
        git(root, ['branch', '-f', 'baseline', 'HEAD'])
        return run()
      },
    },
  })
  assert.equal(r.status, 'failed')
  assert.match(r.record.failure, /base changed/)
})

test('an unreadable prior attempt remains visible instead of disappearing from delivery history', async () => {
  const failed = await invoke({
    deps: { runCommand: async () => ({ code: 1, stdout: '', stderr: 'intermittent failure' }) },
  })
  chmodSync(failed.recordPath, 0o644)
  writeFileSync(failed.recordPath, '{"status":"failed", "interruptedWrite":')
  const passed = await invoke({ deps: { runCommand: run } })
  assert.equal(passed.status, 'passed')
  assert.equal(passed.record.history.length, 1)
  assert.equal(passed.record.history[0].status, 'unreadable')
  assert.equal(passed.record.history[0].disposition.status, 'unresolved')
  assert.equal(
    (
      await validateCombinedRecord(passed.recordPath, {
        root,
        branch: 'main',
        policy,
        approvedIssues: [],
      })
    ).valid,
    true,
  )
  writeFileSync(failed.recordPath, '{"changed":')
  assert.equal(
    (
      await validateCombinedRecord(passed.recordPath, {
        root,
        branch: 'main',
        policy,
        approvedIssues: [],
      })
    ).valid,
    false,
  )
})

test('a newer combined failure invalidates the older success at the same revision', async () => {
  const passed = await invoke({ deps: { runCommand: run } })
  const failed = await invoke({
    deps: { runCommand: async () => ({ code: 1, stdout: '', stderr: 'new connected failure' }) },
  })
  const reused = await validateCombinedRecord(passed.recordPath, {
    root,
    branch: 'main',
    policy,
    approvedIssues: [],
  })
  assert.equal(reused.valid, false)
  assert.match(reused.reason, /attempt|newer|reconciliation/)
  const restored = await invoke({ deps: { runCommand: run } })
  assert.equal(restored.record.history.length, 2)
  assert.equal(
    restored.record.history.find((h) => h.recordPath === failed.recordPath).status,
    'failed',
  )
  assert.equal(
    (
      await validateCombinedRecord(restored.recordPath, {
        root,
        branch: 'main',
        policy,
        approvedIssues: [],
      })
    ).valid,
    true,
  )
})

test('a newly interrupted combined attempt also prevents reusing an earlier success', async () => {
  const passed = await invoke({ deps: { runCommand: run } })
  const parent = join(passed.recordPath, '../..'),
    attemptDir = join(parent, 'interrupted-later')
  mkdirSync(attemptDir)
  writeFileSync(
    join(attemptDir, 'started.json'),
    JSON.stringify({ ...passed.record, status: 'running' }),
  )
  const reused = await validateCombinedRecord(passed.recordPath, {
    root,
    branch: 'main',
    policy,
    approvedIssues: [],
  })
  assert.equal(reused.valid, false)
  assert.match(reused.reason, /attempt|newer|reconciliation/)
})

test('an identical commit on another branch cannot reuse proof that omits that branch history', async () => {
  const passed = await invoke({ deps: { runCommand: run } })
  git(root, ['checkout', '-b', 'feature/target'])
  writeFileSync(join(root, 'later-variant.txt'), 'later target work')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'later target revision'])
  const failed = await verifyCombinedRevision({
    root,
    branch: 'feature/target',
    policy,
    approvedIssues: [],
    deps: { runCommand: async () => ({ code: 1, stdout: '', stderr: 'target failure' }) },
  })
  assert.equal(failed.status, 'failed')
  git(root, ['checkout', 'main'])
  git(root, ['branch', '-f', 'feature/target', passed.record.headSha])
  const result = await validateCombinedRecord(passed.recordPath, {
    root,
    branch: 'feature/target',
    policy,
    approvedIssues: [],
  })
  assert.equal(result.valid, false)
  assert.match(result.reason, /branch/)
})
