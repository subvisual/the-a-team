import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verdictMarker, parseVerdictMarkers, postVerdict } from '../src/gh.mjs'
import { normaliseIssue } from '../src/adapters/github.mjs'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
  assert.deepEqual(
    parseVerdictMarkers(bodies).map((m) => m.sha),
    ['deadbeef', 'cafebabe'],
  )
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

function fakeGithub(t, response = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ateam-gh-publication-'))
  const calls = join(root, 'calls.jsonl')
  writeFileSync(
    join(root, 'gh'),
    `#!${process.execPath}
const fs=require('fs');const args=process.argv.slice(2);const input=fs.readFileSync(0,'utf8');fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({args,input})+'\\n');const response=${JSON.stringify(response)};if(args[0]==='api'){if(response.error){process.stderr.write(response.error);process.exitCode=1}else{const request=JSON.parse(input);console.log(JSON.stringify({commit_id:response.head || request.commit_id,state:response.state || (request.event==='APPROVE'?'APPROVED':'CHANGES_REQUESTED')}))}}`,
    { mode: 0o755 },
  )
  const oldPath = process.env.PATH
  process.env.PATH = `${root}:${oldPath}`
  t.after(() => {
    process.env.PATH = oldPath
    rmSync(root, { recursive: true, force: true })
  })
  return () =>
    existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse) : []
}

test('GitHub review submission pins and verifies the exact evaluated commit', async (t) => {
  const calls = fakeGithub(t),
    headSha = 'a'.repeat(40)
  assert.equal(
    await postVerdict('o/r', 7, { event: 'approve', body: 'verified', headSha }),
    'review',
  )
  assert.equal(calls()[0].args[0], 'api')
  assert.equal(JSON.parse(calls()[0].input).commit_id, headSha)
  assert.equal(JSON.parse(calls()[0].input).event, 'APPROVE')
})

test('publication fails closed for missing commit and mismatched GitHub response', async (t) => {
  const calls = fakeGithub(t, { head: 'b'.repeat(40) })
  await assert.rejects(
    postVerdict('o/r', 7, { event: 'approve', body: 'verified' }),
    /commit|head/i,
  )
  assert.equal(calls().length, 0)
  await assert.rejects(
    postVerdict('o/r', 7, { event: 'approve', body: 'verified', headSha: 'a'.repeat(40) }),
    /commit|revision/i,
  )
  assert.equal(calls().length, 1)
})

test('own-PR fallback names the evaluated commit in its comment', async (t) => {
  const calls = fakeGithub(t, { error: 'Can not approve your own pull request' }),
    headSha = 'a'.repeat(40)
  assert.equal(
    await postVerdict('o/r', 7, { event: 'approve', body: 'verified', headSha }),
    'comment',
  )
  assert.match(calls()[1].input, new RegExp(headSha))
})

test('unexpected publication failures do not turn into successful comments', async (t) => {
  const calls = fakeGithub(t, { error: 'network unavailable' })
  await assert.rejects(
    postVerdict('o/r', 7, { event: 'approve', body: 'verified', headSha: 'a'.repeat(40) }),
    /network unavailable/,
  )
  assert.equal(calls().length, 1)
})
