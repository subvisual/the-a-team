import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reviewedShas, cycleCount, linkedIssueNumber } from '../src/review-pr.mjs'
import { verdictMarker } from '../src/gh.mjs'

const pr = (extra = {}) => ({
  number: 9,
  headRefName: 'agent/issue-12',
  headRefOid: 'aaaa1111',
  comments: [],
  reviews: [],
  ...extra,
})

test('a display marker cannot authenticate a review', () => {
  const p = pr({ comments: [{ body: verdictMarker('aaaa1111', 1) }] })
  assert.equal(reviewedShas(p).has('aaaa1111'), false)
})

test('a new push is a new sha, so it is unreviewed', () => {
  const p = pr({ headRefOid: 'bbbb2222', comments: [{ body: verdictMarker('aaaa1111', 1) }] })
  assert.equal(reviewedShas(p).has('bbbb2222'), false)
})

test('cycle count excludes all unverified review and comment markers', () => {
  assert.equal(cycleCount(pr()), 0)
  assert.equal(
    cycleCount(
      pr({
        comments: [{ body: verdictMarker('a', 1) }],
        reviews: [{ body: verdictMarker('b', 2) }],
      }),
    ),
    0,
  )
})

test('the linked issue comes from GitHub metadata, never the PR body', () => {
  assert.equal(
    linkedIssueNumber(pr({ closingIssuesReferences: [{ number: 42 }] }), 'agent/issue-'),
    42,
  )
})

test('falls back to the branch name when nothing is linked', () => {
  assert.equal(linkedIssueNumber(pr(), 'agent/issue-'), 12)
  assert.equal(linkedIssueNumber(pr({ headRefName: 'feature/whatever' }), 'agent/issue-'), null)
})
