import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verdictMarker, parseVerdictMarkers } from '../src/gh.mjs'
import { normaliseIssue } from '../src/adapters/github.mjs'

test('verdict markers round-trip', () => {
  const m = verdictMarker('abc123', 2)
  assert.deepEqual(parseVerdictMarkers([m]), [{ sha: 'abc123', cycle: 2 }])
})

test('markers are found among ordinary comment prose', () => {
  const bodies = [
    'a human comment',
    `${verdictMarker('deadbeef', 1)}\n\n## Reviewer verdict — approve`,
    `${verdictMarker('cafebabe', 3)}\n\nchanges`,
  ]
  assert.deepEqual(parseVerdictMarkers(bodies).map((m) => m.sha), ['deadbeef', 'cafebabe'])
})

test('normalises a gh issue payload into the runner shape', () => {
  const issue = normaliseIssue({
    number: 12,
    title: 'Do the thing',
    body: '## Acceptance criteria\n- [ ] it works\n\nBlocked by #4',
    url: 'https://github.com/o/r/issues/12',
    labels: [{ name: 'agent:ready' }],
  })
  assert.equal(issue.key, '12')
  assert.deepEqual(issue.acceptanceCriteria, ['it works'])
  assert.deepEqual(issue.blockedBy, [4])
  assert.deepEqual(issue.labels, ['agent:ready'])
})
