import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as history from '../src/core/history.mjs'
let root
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ateam-history-'))
  process.env.ATEAM_RUNNER_HOME = root
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  delete process.env.ATEAM_RUNNER_HOME
})
const issue = { key: 'ISS-A', contentVersion: 'v1', criteriaVersion: 'ac1', title: 'A' }
test('replay retains every attempt and lifetime totals across recovery windows', () => {
  history.appendEvent('r', issue, {
    type: 'attempt.started',
    attemptId: 'one',
    baseSha: 'base',
    dependencyHeads: {},
    worktree: '/retained',
  })
  history.appendEvent('r', issue, {
    type: 'attempt.finished',
    attemptId: 'one',
    outcome: 'failed',
    failureCategory: 'cycle-exhausted',
    costUsd: 2,
    durationMs: 40,
  })
  history.appendEvent('r', issue, {
    type: 'attempt.started',
    attemptId: 'two',
    recoveryWindow: 'approved-window',
  })
  const state = history.replayIssue(history.readEvents('r', issue.key), issue)
  assert.equal(state.attempts.length, 2)
  assert.equal(state.attempts[0].worktree, '/retained')
  assert.deepEqual(state.lifetime, { attempts: 2, costUsd: 2, durationMs: 40 })
  assert.equal(state.status, 'interrupted')
})
test('an uncertain side effect cannot execute twice; positive reconciliation finishes its original action', async () => {
  let calls = 0
  const args = {
    repo: 'r',
    issue,
    attemptId: 'one',
    actionId: 'publish-one',
    kind: 'publish',
    input: { head: 'h' },
  }
  await assert.rejects(
    history.runAction(args, async () => {
      calls++
      throw Error('connection lost')
    }),
    /uncertain/,
  )
  await assert.rejects(
    history.runAction(args, async () => {
      calls++
    }),
    /uncertain/,
  )
  assert.equal(calls, 1)
  const result = await history.runAction(
    { ...args, reconcile: async () => ({ status: 'confirmed', result: { receipt: 7 } }) },
    async () => {
      calls++
    },
  )
  assert.deepEqual(result, { receipt: 7 })
  assert.equal(calls, 1)
  assert.equal(
    history.replayIssue(history.readEvents('r', issue.key), issue).unresolvedActions.length,
    0,
  )
})
test('same stable action with changed payload is rejected', async () => {
  const args = {
    repo: 'r',
    issue,
    attemptId: 'one',
    actionId: 'a',
    kind: 'publish',
    input: { head: 'h' },
  }
  await history.runAction(args, async () => ({ ok: true }))
  await assert.rejects(
    history.runAction({ ...args, input: { head: 'different' } }, async () => ({})),
    /identity.*changed/,
  )
})

test('a resumed attempt clears its prior terminal outcome before a second interruption', () => {
  const add = (fields) =>
    history.appendEvent('r', issue, { attemptId: 'same', cycle: 2, ...fields })
  add({ type: 'attempt.started' })
  add({ type: 'attempt.finished', outcome: 'failed', failureCategory: 'interrupted' })
  add({ type: 'attempt.resumed' })
  add({ type: 'attempt.reviewed', failureCategory: 'reviewer-rejection' })
  const state = history.replayIssue(history.readEvents('r', issue.key), issue)
  assert.equal(state.status, 'interrupted')
  assert.equal(state.currentAttempts[0].outcome, undefined)
  assert.equal(state.currentAttempts[0].cycle, 2)
})
