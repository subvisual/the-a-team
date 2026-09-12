import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveLimits, openBudget, budgetStatus, budgetReadiness } from '../src/core/budget.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ateam-budget-'))
  const previous = process.env.ATEAM_RUNNER_HOME
  process.env.ATEAM_RUNNER_HOME = root
  t.after(() => {
    if (previous === undefined) delete process.env.ATEAM_RUNNER_HOME
    else process.env.ATEAM_RUNNER_HOME = previous
    rmSync(root, { recursive: true, force: true })
  })
  return {
    limits: resolveLimits({
      runBudgetUsd: 3,
      executorBudgetUsd: 2,
      reviewerBudgetUsd: 2,
      runTimeoutMs: 10000,
      sessionTimeoutMs: 3000,
    }),
    authorization: {},
  }
}

test('both roles and failed attempts consume one durable allowance before another launch', async (t) => {
  const policy = fixture(t),
    budget = openBudget({ repo: 'o/r', policy })
  const grants = []
  await budget.call('executor', async (grant) => {
    grants.push(grant)
    return { costUsd: 2 }
  })
  const resumed = openBudget({ repo: 'o/r', policy })
  await assert.rejects(
    resumed.call('reviewer', async (grant) => {
      grants.push(grant)
      throw Object.assign(new Error('provider failed'), { costUsd: 1 })
    }),
    /provider failed/,
  )
  let launches = 0
  await assert.rejects(
    resumed.call('executor', async () => {
      launches++
      return { costUsd: 0 }
    }),
    /budget exhausted/,
  )
  assert.equal(launches, 0)
  assert.deepEqual(
    grants.map((g) => g.budgetUsd),
    [2, 1],
  )
  assert.equal(resumed.snapshot().spentUsd, 3)
  assert.equal(resumed.snapshot().remainingUsd, 0)
  assert.equal(resumed.snapshot().lifetimeSpentUsd, 3)
})

test('unknown accounting blocks continuation and explicit fresh window retains lifetime totals', async (t) => {
  const policy = fixture(t),
    first = openBudget({ repo: 'o/r', policy })
  await first.call('executor', async () => ({ costUsd: 1 }))
  await assert.rejects(
    first.call('reviewer', async () => ({})),
    /unknown cost/,
  )
  await assert.rejects(
    openBudget({ repo: 'o/r', policy }).call('executor', async () => ({ costUsd: 0 })),
    /accounting is uncertain/,
  )
  const recovered = openBudget({
    repo: 'o/r',
    policy: { ...policy, authorization: { id: 'human-recovery', recoveryWindow: 'window-2' } },
  })
  assert.equal(recovered.snapshot().spentUsd, 0)
  assert.equal(recovered.snapshot().lifetimeSpentUsd, 1)
  assert.equal(recovered.snapshot().lifetimeUnknownCosts, 1)
  await recovered.call('executor', async () => ({ costUsd: 2 }))
  assert.equal(openBudget({ repo: 'o/r', policy }).snapshot().spentUsd, 2)
  assert.equal(
    openBudget({
      repo: 'o/r',
      policy: { ...policy, authorization: { id: 'human-recovery', recoveryWindow: 'window-2' } },
    }).snapshot().spentUsd,
    2,
  )
  assert.throws(
    () =>
      openBudget({
        repo: 'o/r',
        policy: { ...policy, limits: { ...policy.limits, runBudgetUsd: 10 } },
      }),
    /changed.*fresh recovery window/,
  )
})

test('wall time caps every launch and expires across restart', async (t) => {
  const policy = fixture(t)
  let now = 1000
  const budget = openBudget({ repo: 'o/r', policy, now: () => now })
  now = 9500
  await budget.call('reviewer', async (grant) => {
    assert.equal(grant.timeoutMs, 1500)
    return { costUsd: 0 }
  })
  now = 11000
  await assert.rejects(
    budget.call('executor', async () => ({ costUsd: 0 })),
    /wall-time exhausted/,
  )
})

test('limits reject invalid values and require positive finite bounded allowances', () => {
  for (const key of [
    'runBudgetUsd',
    'executorBudgetUsd',
    'reviewerBudgetUsd',
    'runTimeoutMs',
    'sessionTimeoutMs',
    'maxCycles',
  ])
    for (const value of [0, -1, NaN, Infinity, '5', null])
      assert.throws(() => resolveLimits({ [key]: value }), new RegExp(key))
  for (const key of ['runTimeoutMs', 'sessionTimeoutMs', 'maxCycles'])
    assert.throws(() => resolveLimits({ [key]: 1.5 }), new RegExp(key))
})

test('read-only preflight exposes exhaustion and interrupted accounting without new writes', async (t) => {
  const policy = fixture(t),
    repo = 'o/r'
  assert.equal(budgetStatus(repo), null)
  assert.equal(budgetReadiness({ repo, policy }), null)
  assert.equal(existsSync(join(process.env.ATEAM_RUNNER_HOME, 'budgets')), false)
  const budget = openBudget({ repo, policy })
  const dir = join(process.env.ATEAM_RUNNER_HOME, 'budgets')
  const ledger = join(dir, readdirSync(dir)[0], 'events.jsonl')
  await budget.call('executor', async () => ({ costUsd: 3 }))
  const before = readFileSync(ledger, 'utf8')
  assert.throws(() => budgetReadiness({ repo, policy }), /budget exhausted/)
  assert.deepEqual(
    budgetReadiness({
      repo,
      policy: { ...policy, authorization: { id: 'operator', recoveryWindow: 'fresh' } },
    }),
    { freshRecoveryWindow: 'fresh' },
  )
  assert.equal(readFileSync(ledger, 'utf8'), before)
  // Simulate a supervisor stopping after durable launch intent and before result.
  const recovered = openBudget({
    repo,
    policy: { ...policy, authorization: { id: 'operator', recoveryWindow: 'fresh' } },
  })
  appendFileSync(
    ledger,
    JSON.stringify({
      schemaVersion: 1,
      id: 'fixture-interruption',
      type: 'launch-started',
      windowId: recovered.snapshot().windowId,
      launchId: 'interrupted',
      role: 'reviewer',
      at: Date.now(),
    }) + '\n',
  )
  await assert.rejects(
    recovered.call('executor', async () => ({ costUsd: 0 })),
    /accounting is uncertain/,
  )
  assert.equal(recovered.snapshot().pendingLaunches.length, 1)
  appendFileSync(ledger, '{"interrupted')
  assert.throws(() => openBudget({ repo, policy }), /history is incomplete/)
})

test('repository casing, local mode and clone aliases share canonical target allowance', async (t) => {
  const policy = { ...fixture(t), target: { remote: 'github.com/o/r', root: '/same/clone' } }
  await openBudget({ repo: 'o/r', policy }).call('executor', async () => ({ costUsd: 3 }))
  for (const repo of ['O/R', '/same/clone', 'another-spelling']) {
    const same = openBudget({ repo, policy })
    assert.equal(same.snapshot().lifetimeSpentUsd, 3)
    await assert.rejects(
      same.call('reviewer', async () => ({ costUsd: 0 })),
      /budget exhausted/,
    )
  }
})
