import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acceptanceCriteria, hasCheckableAC, blockedBy, objectionsDisjoint, normaliseCriterion } from '../src/issue.mjs'

test('extracts checklist criteria from the acceptance-criteria section', () => {
  const body = [
    '### Description', 'Add a thing.', '',
    '### Acceptance criteria',
    '- [ ] Given a logged-out visitor, when they open /app, then they land on /login',
    '- [x] Given a logged-in user, when they open /app, then they see the dashboard',
    '', '### Technical notes', '- [ ] not a criterion',
  ].join('\n')
  assert.deepEqual(acceptanceCriteria(body), [
    'Given a logged-out visitor, when they open /app, then they land on /login',
    'Given a logged-in user, when they open /app, then they see the dashboard',
  ])
})

test('stops at a heading of the same or higher level', () => {
  const body = '## Acceptance criteria\n- one\n## Something else\n- two'
  assert.deepEqual(acceptanceCriteria(body), ['one'])
})

test('accepts numbered criteria and bare Gherkin lines', () => {
  const numbered = '## Acceptance criteria\n1. first\n2) second'
  assert.deepEqual(acceptanceCriteria(numbered), ['first', 'second'])
  const gherkin = '## Acceptance criteria\nGiven a cart\nWhen I check out\nThen I get a receipt'
  assert.equal(acceptanceCriteria(gherkin).length, 1)
  assert.match(acceptanceCriteria(gherkin)[0], /Given a cart When I check out Then I get a receipt/)
})

test('joins a wrapped criterion into one item', () => {
  const body = '## Acceptance criteria\n- Given a long precondition\n  that wraps across lines\n- second'
  assert.deepEqual(acceptanceCriteria(body), ['Given a long precondition that wraps across lines', 'second'])
})

test('an issue with no acceptance-criteria section has none', () => {
  assert.deepEqual(acceptanceCriteria('Just a paragraph asking for a feature.'), [])
  assert.equal(hasCheckableAC('Just a paragraph.'), false)
  assert.equal(hasCheckableAC('## Acceptance criteria\n- [ ] something'), true)
})

test('an empty acceptance-criteria section does not pass the gate', () => {
  assert.equal(hasCheckableAC('## Acceptance criteria\n\n## Notes\n- a note'), false)
})

test('reads dependency references in several phrasings', () => {
  assert.deepEqual(blockedBy('Blocked by #12'), [12])
  assert.deepEqual(blockedBy('blocked-by: #12, #7'), [7, 12])
  assert.deepEqual(blockedBy('Depends on #3 and unrelated #99 prose'), [3])
  assert.deepEqual(blockedBy('no dependencies here'), [])
})

test('criterion normalisation ignores punctuation, case and backticks', () => {
  assert.equal(normaliseCriterion('Given `foo`, then Bar!'), 'given foo then bar')
})

test('disjoint objections are the oscillation signature', () => {
  assert.equal(objectionsDisjoint(['a criterion'], ['a different one']), true)
  assert.equal(objectionsDisjoint(['a criterion'], ['A criterion.']), false)
  assert.equal(objectionsDisjoint(['a', 'b'], ['b', 'c']), false)
})

test('an empty objection set is never disjoint', () => {
  assert.equal(objectionsDisjoint([], ['a']), false)
  assert.equal(objectionsDisjoint(['a'], []), false)
})
