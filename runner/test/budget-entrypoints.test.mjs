import test from 'node:test'
import assert from 'node:assert/strict'
import { execute } from '../src/core/execute.mjs'
import { review } from '../src/core/review.mjs'
import { issue } from './approval-fixtures.mjs'

for (const [name, fn, structured] of [
  [
    'executor',
    execute,
    {
      status: 'done',
      summary: 'done',
      blocked_reason: '',
      tests_command: 'true',
      tests_ran: true,
      tests_passed: true,
    },
  ],
  [
    'reviewer',
    review,
    {
      verdict: 'approve',
      notes: 'done',
      unmet_ac: [],
      test_command: 'true',
      test_output: 'ok',
      tests_ran: true,
      tests_passed: true,
    },
  ],
]) {
  test(`${name} forwards bounded timeout and retains failed-provider accounting`, async () => {
    const options = {
      issue,
      worktree: '.',
      policy: { bindings: {} },
      timeoutMs: 321,
      budgetUsd: 0.25,
    }
    let seen
    const result = await fn({
      ...options,
      deps: {
        runClaude: async (args) => {
          seen = args
          return { ok: true, exitCode: 0, costUsd: 0.1, structured }
        },
      },
    })
    assert.equal(seen.timeoutMs, 321)
    assert.equal(seen.maxBudgetUsd, 0.25)
    assert.equal(result.costUsd, 0.1)
    await assert.rejects(
      fn({
        ...options,
        deps: {
          runClaude: async () => ({
            ok: false,
            exitCode: 124,
            timedOut: true,
            costUsd: 0.2,
            durationMs: 321,
            structured,
          }),
        },
      }),
      (error) => {
        assert.equal(error.costUsd, 0.2)
        assert.equal(error.failureCategory, 'timeout')
        assert.equal(error.durationMs, 321)
        return true
      },
    )
  })
}
