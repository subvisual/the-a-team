import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execute } from '../src/core/execute.mjs'
import { review } from '../src/core/review.mjs'
const issue = { title: 'Fix', body: 'body', acceptanceCriteria: ['works'] }
const executor = {
  status: 'done',
  summary: 'done',
  blocked_reason: '',
  tests_command: 'npm test',
  tests_ran: true,
  tests_passed: true,
}
const reviewer = {
  verdict: 'approve',
  tests_ran: true,
  tests_passed: true,
  test_command: 'npm test',
  test_output: 'green',
  unmet_ac: [],
  notes: 'done',
}
for (const role of ['executor', 'reviewer'])
  for (const [name, patch] of [
    ['malformed', null],
    ['missing', {}],
    ['string boolean', { ...(role === 'executor' ? executor : reviewer), tests_passed: 'false' }],
    ['unknown', { ...(role === 'executor' ? executor : reviewer), approved: true }],
  ])
    test(`${role} validates raw ${name} before normalization`, async () => {
      const fn = role === 'executor' ? execute : review
      await assert.rejects(
        () =>
          fn({
            issue,
            worktree: '/tmp',
            base: 'a',
            head: 'b',
            branch: 'b',
            deps: {
              runClaude: async () => ({
                ok: true,
                exitCode: 0,
                structured: patch,
                costUsd: 0,
                sessionId: null,
              }),
            },
          }),
        /executor|reviewer/,
      )
    })

for (const [role, fn] of [
  ['executor', execute],
  ['reviewer', review],
])
  test(`${role} retains failed process reason when structured output is absent`, async () => {
    await assert.rejects(
      () =>
        fn({
          issue,
          worktree: '/tmp',
          base: 'a',
          head: 'b',
          branch: 'b',
          deps: {
            runClaude: async () => ({
              ok: false,
              exitCode: 7,
              structured: null,
              errors: ['budget exhausted'],
              costUsd: 0,
              sessionId: null,
            }),
          },
        }),
      /exit=7.*budget exhausted/,
    )
  })
