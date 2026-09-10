import { currentContextFixture } from './helpers/current-context.mjs'
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
  test_adequacy: [
    {
      criterion: 'works',
      expected_values: { status: 'independent', evidence: 'literal expected value' },
      public_behavior: { status: 'exercised', evidence: 'public entry point' },
      substituted_boundaries: { status: 'none', evidence: 'no substituted boundary' },
      requirement_source: { id: 'fixture', revision: 'version-1' },
      baseline_expectations: {
        status: 'preserved',
        requirement_version: 1,
        authorization: '',
      },
      judgment: 'adequate',
      why: 'detects the defect',
    },
  ],
}
for (const role of ['executor', 'reviewer'])
  for (const [name, patch] of [
    ['malformed', null],
    ['missing', {}],
    ['string boolean', { ...(role === 'executor' ? executor : reviewer), tests_passed: 'false' }],
    ['unknown', { ...(role === 'executor' ? executor : reviewer), approved: true }],
  ])
    test(`${role} validates raw ${name} before normalization`, async (t) => {
      const worktree = currentContextFixture(t)
      const fn = role === 'executor' ? execute : review
      await assert.rejects(
        () =>
          fn({
            issue,
            worktree,
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
  test(`${role} retains failed process reason when structured output is absent`, async (t) => {
    const worktree = currentContextFixture(t)
    await assert.rejects(
      () =>
        fn({
          issue,
          worktree,
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

test('reviewer rejects unknown fields nested in raw adequacy evidence', async (t) => {
  const worktree = currentContextFixture(t)
  await assert.rejects(
    () =>
      review({
        issue,
        worktree,
        base: 'a',
        head: 'b',
        deps: {
          runClaude: async () => ({
            ok: true,
            exitCode: 0,
            structured: {
              ...reviewer,
              test_adequacy: [{ ...reviewer.test_adequacy[0], invented: true }],
            },
          }),
        },
      }),
    /unknown.*invented/i,
  )
})
