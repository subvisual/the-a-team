import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { runIssue, OUTCOME } from '../src/core/loop.mjs'
import { DEFAULTS } from '../src/config.mjs'
import { config, impl, verdict, pass } from './approval-fixtures.mjs'

let root
let repoPath

const git = (args, cwd = repoPath) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  })

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ateam-runner-'))
  process.env.ATEAM_RUNNER_HOME = join(root, 'home')
  repoPath = join(root, 'repo')
  mkdirSync(repoPath)
  git(['init', '--initial-branch=main'])
  git(['config', 'user.email', 'test@example.com'])
  git(['config', 'user.name', 'Test'])
  writeFileSync(join(repoPath, 'README.md'), '# repo\n')
  git(['add', '-A'])
  git(['commit', '-m', 'initial'])
  cfg = config(repoPath, { maxCycles: 3, cleanupOnSuccess: false })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  delete process.env.ATEAM_RUNNER_HOME
})

let cfg

const issue = (overrides = {}) => ({
  key: '1',
  number: 1,
  title: 'Do the thing',
  body: 'body',
  acceptanceCriteria: ['it works'],
  blockedBy: [],
  ...overrides,
})

function adapterSpy(extra = {}) {
  const calls = []
  return {
    calls,
    repo: 'o/r',
    repoPath,
    base: 'main',
    async openBlockers() {
      return []
    },
    async onNeedsDetail(i, reason) {
      calls.push(['needsDetail', reason])
    },
    async onClaimed() {
      calls.push(['claimed'])
    },
    async onImplemented() {
      calls.push(['implemented'])
      return {}
    },
    async onVerdict(i, ctx, v) {
      calls.push(['verdict', v.verdict, ctx.cycle])
    },
    async onApproved() {
      calls.push(['approved'])
    },
    async onFailed(i, ctx, reason) {
      calls.push(['failed', reason])
    },
    ...extra,
  }
}

// A stand-in executor that actually commits, so the "produced no commits"
// guard and the worktree plumbing are exercised for real.
const committingExecutor =
  (n = { i: 0 }) =>
  async ({ worktree }) => {
    n.i += 1
    writeFileSync(join(worktree, `change-${n.i}.txt`), `pass ${n.i}\n`)
    git(['add', '-A'], worktree)
    git(['commit', '-m', `work ${n.i}`], worktree)
    return { ...impl, summary: `pass ${n.i}` }
  }

const reviewer = (verdicts) => {
  let i = 0
  return async () => {
    const v = verdicts[Math.min(i, verdicts.length - 1)]
    i += 1
    return { ...verdict, notes: '', ...v }
  }
}

test('an issue with no acceptance criteria is refused before anything is claimed', async () => {
  const adapter = adapterSpy()
  const result = await runIssue({ adapter, issue: issue({ acceptanceCriteria: [] }), cfg })
  assert.equal(result.outcome, OUTCOME.needsDetail)
  assert.deepEqual(
    adapter.calls.map((c) => c[0]),
    ['needsDetail'],
  )
})

test('approval on the first cycle runs one implement and one review', async () => {
  const adapter = adapterSpy()
  const result = await runIssue({
    adapter,
    issue: issue(),
    cfg,
    deps: {
      runVerification: pass,
      execute: committingExecutor(),
      review: reviewer([{ verdict: 'approve' }]),
    },
  })
  assert.equal(result.outcome, OUTCOME.approved)
  assert.equal(result.cycles, 1)
  assert.deepEqual(
    adapter.calls.map((c) => c[0]),
    ['claimed', 'implemented', 'verdict', 'approved'],
  )
})

test('request-changes loops, and a later approval still lands', async () => {
  const adapter = adapterSpy()
  const result = await runIssue({
    adapter,
    issue: issue(),
    cfg,
    deps: {
      runVerification: pass,
      execute: committingExecutor(),
      review: reviewer([
        { verdict: 'request-changes', unmetAc: [{ criterion: 'it works', why: 'no test' }] },
        { verdict: 'approve' },
      ]),
    },
  })
  assert.equal(result.outcome, OUTCOME.approved)
  assert.equal(result.cycles, 2)
})

test('the cycle cap ends the run rather than looping forever', async () => {
  const adapter = adapterSpy()
  const result = await runIssue({
    adapter,
    issue: issue(),
    cfg: { ...cfg, maxCycles: 2 },
    deps: {
      runVerification: pass,
      execute: committingExecutor(),
      review: reviewer([
        { verdict: 'request-changes', unmetAc: [{ criterion: 'it works', why: 'still no' }] },
      ]),
    },
  })
  assert.equal(result.outcome, OUTCOME.failed)
  assert.match(result.reason, /cycle cap reached \(2\)/)
})

test('disjoint objections across cycles stop the run early', async () => {
  const adapter = adapterSpy()
  const result = await runIssue({
    adapter,
    issue: issue(),
    cfg,
    deps: {
      runVerification: pass,
      execute: committingExecutor(),
      review: reviewer([
        { verdict: 'request-changes', unmetAc: [{ criterion: 'first thing', why: 'a' }] },
        { verdict: 'request-changes', unmetAc: [{ criterion: 'unrelated other thing', why: 'b' }] },
      ]),
    },
  })
  assert.equal(result.outcome, OUTCOME.failed)
  assert.match(result.reason, /disjoint/)
  assert.equal(result.cycles, 2)
})

test('an executor that reports done but commits nothing fails the run', async () => {
  const adapter = adapterSpy()
  const result = await runIssue({
    adapter,
    issue: issue(),
    cfg,
    deps: {
      runVerification: pass,
      execute: async () => ({ ...impl, summary: 'lied' }),
      review: reviewer([{ verdict: 'approve' }]),
    },
  })
  assert.equal(result.outcome, OUTCOME.failed)
  assert.match(result.reason, /no commits/)
})

test('a blocked executor escalates instead of guessing', async () => {
  const adapter = adapterSpy()
  const result = await runIssue({
    adapter,
    issue: issue(),
    cfg,
    deps: {
      runVerification: pass,
      execute: async () => ({
        ...impl,
        status: 'blocked',
        blockedReason: 'criterion 2 contradicts the schema',
      }),
      review: reviewer([{ verdict: 'approve' }]),
    },
  })
  assert.equal(result.outcome, OUTCOME.failed)
  assert.match(result.reason, /contradicts the schema/)
  assert.equal(
    adapter.calls.some((c) => c[0] === 'verdict'),
    false,
  )
})

test('open blockers skip the issue without claiming it', async () => {
  const adapter = adapterSpy({
    async openBlockers() {
      return [4]
    },
  })
  const result = await runIssue({ adapter, issue: issue({ blockedBy: [4] }), cfg })
  assert.equal(result.outcome, OUTCOME.skipped)
  assert.match(result.reason, /blocked by #4/)
  assert.deepEqual(adapter.calls, [])
})

test('the claim is released, so a second run can take the issue', async () => {
  const adapter = adapterSpy()
  const deps = {
    runVerification: pass,
    execute: committingExecutor(),
    review: reviewer([{ verdict: 'approve' }]),
  }
  await runIssue({ adapter, issue: issue(), cfg, deps })
  const second = await runIssue({ adapter, issue: issue(), cfg, deps })
  assert.equal(second.outcome, OUTCOME.approved)
})
